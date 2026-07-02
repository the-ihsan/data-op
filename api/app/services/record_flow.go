package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/goravel/framework/contracts/database/orm"
	"github.com/goravel/framework/facades"
	"github.com/goravel/framework/support/carbon"

	"goravel/app/models"
)

// ErrUniquenessConflict is returned (wrapped) to force a transaction rollback when
// a stage-level uniqueness check fails. The conflicting target label is carried.
type ErrUniquenessConflict struct{ Label string }

func (e ErrUniquenessConflict) Error() string { return "uniqueness conflict: " + e.Label }

// ErrValidation carries a user-facing validation message (HTTP 400).
type ErrValidation struct{ Message string }

func (e ErrValidation) Error() string { return e.Message }

// StageFields returns a stage's fields ordered by position.
func StageFields(tx orm.Query, stageID uint) ([]models.StageField, error) {
	var fields []models.StageField
	if err := tx.Where("stage_id", stageID).Order("position ASC").Get(&fields); err != nil {
		return nil, err
	}
	return fields, nil
}

// LoadValuesByKey reads a record's stored values at a stage, grouped by field key.
func LoadValuesByKey(tx orm.Query, recordID, stageID uint) (map[string][]string, error) {
	var values []models.RecordValue
	if err := tx.Where("record_id", recordID).Where("stage_id", stageID).
		Order("value_index ASC").Get(&values); err != nil {
		return nil, err
	}
	out := map[string][]string{}
	for _, v := range values {
		out[v.FieldKey] = append(out[v.FieldKey], v.Value)
	}
	return out, nil
}

// normalizeField validates and normalizes the entries submitted for one field.
func normalizeField(field models.StageField, raw []string) ([]string, error) {
	// Drop blank entries.
	entries := make([]string, 0, len(raw))
	for _, v := range raw {
		v = strings.TrimSpace(v)
		if v != "" {
			entries = append(entries, v)
		}
	}

	if field.Type == models.FieldTypeSelect && len(entries) > 1 {
		return nil, ErrValidation{fmt.Sprintf("field '%s' accepts a single selection", field.Label)}
	}
	if field.MaxCount > 0 && len(entries) > field.MaxCount {
		return nil, ErrValidation{fmt.Sprintf("field '%s' accepts at most %d entries", field.Label, field.MaxCount)}
	}

	var options map[string]bool
	if models.IsChoiceType(field.Type) {
		options = optionSet(field.Options)
	}

	out := make([]string, 0, len(entries))
	for _, v := range entries {
		switch field.Type {
		case models.FieldTypeNumber:
			if _, err := strconv.ParseFloat(v, 64); err != nil {
				return nil, ErrValidation{fmt.Sprintf("field '%s' must be a number", field.Label)}
			}
		case models.FieldTypeDate:
			if _, err := time.Parse("2006-01-02", v); err != nil {
				return nil, ErrValidation{fmt.Sprintf("field '%s' must be a date (YYYY-MM-DD)", field.Label)}
			}
		case models.FieldTypeBoolean:
			v = normalizeBool(v)
		case models.FieldTypeSelect, models.FieldTypeMultiSelect:
			if !options[v] {
				return nil, ErrValidation{fmt.Sprintf("'%s' is not a valid option for field '%s'", v, field.Label)}
			}
		}
		out = append(out, v)
	}
	return out, nil
}

func optionSet(optionsJSON string) map[string]bool {
	set := map[string]bool{}
	if optionsJSON == "" {
		return set
	}
	var opts []string
	if err := json.Unmarshal([]byte(optionsJSON), &opts); err == nil {
		for _, o := range opts {
			set[o] = true
		}
	}
	return set
}

func normalizeBool(v string) string {
	switch strings.ToLower(v) {
	case "true", "1", "yes", "on":
		return "true"
	default:
		return "false"
	}
}

// StoreValues validates and persists a record's values at a stage, replacing any
// existing values, and returns the normalized values grouped by field key.
func StoreValues(tx orm.Query, recordID, stageID uint, fields []models.StageField, raw map[string][]string) (map[string][]string, error) {
	fieldByKey := map[string]models.StageField{}
	for _, f := range fields {
		fieldByKey[f.Key] = f
	}

	// Reject unknown keys early.
	for key := range raw {
		if _, ok := fieldByKey[key]; !ok {
			return nil, ErrValidation{fmt.Sprintf("unknown field '%s' for this stage", key)}
		}
	}

	valuesByKey := map[string][]string{}
	if _, err := tx.Where("record_id", recordID).Where("stage_id", stageID).Delete(&models.RecordValue{}); err != nil {
		return nil, err
	}

	for _, field := range fields {
		entries, err := normalizeField(field, raw[field.Key])
		if err != nil {
			return nil, err
		}
		if len(entries) == 0 {
			continue
		}
		valuesByKey[field.Key] = entries
		for i, v := range entries {
			row := models.RecordValue{
				RecordID:   recordID,
				StageID:    stageID,
				FieldID:    field.ID,
				FieldKey:   field.Key,
				Value:      v,
				ValueIndex: i,
			}
			if err := tx.Create(&row); err != nil {
				return nil, err
			}
		}
	}
	return valuesByKey, nil
}

// ValidateRequired ensures every required field on the stage has at least one value.
func ValidateRequired(fields []models.StageField, valuesByKey map[string][]string) error {
	for _, f := range fields {
		if f.Required && len(valuesByKey[f.Key]) == 0 {
			return ErrValidation{fmt.Sprintf("field '%s' is required", f.Label)}
		}
	}
	return nil
}

// nextStage returns the stage immediately after the given one in the campaign, or
// nil when the given stage is the last.
func nextStage(tx orm.Query, campaignID uint, currentPosition int) (*models.Stage, error) {
	var stage models.Stage
	if err := tx.Where("campaign_id", campaignID).
		Where("position", currentPosition+1).
		First(&stage); err != nil {
		return nil, err
	}
	if stage.ID == 0 {
		return nil, nil
	}
	return &stage, nil
}

// Advance validates the record's current stage and moves it forward: it records a
// transition, seeds prev_stage_key fields on the next stage, and clears the lock.
// When there is no next stage the record is marked finished.
func Advance(record *models.Record, userID uint, note string) (conflictLabel string, err error) {
	txErr := facades.Orm().Transaction(func(tx orm.Query) error {
		currentStage, err := stageByID(tx, record.CurrentStageID)
		if err != nil {
			return err
		}
		fields, err := StageFields(tx, currentStage.ID)
		if err != nil {
			return err
		}
		valuesByKey, err := LoadValuesByKey(tx, record.ID, currentStage.ID)
		if err != nil {
			return err
		}
		if err := ValidateRequired(fields, valuesByKey); err != nil {
			return err
		}
		// Re-assert uniqueness for the current stage before moving on.
		if label, err := EnforceUniqueness(tx, record.ID, currentStage.ID, valuesByKey); err != nil {
			return err
		} else if label != "" {
			return ErrUniquenessConflict{Label: label}
		}

		next, err := nextStage(tx, record.CampaignID, currentStage.Position)
		if err != nil {
			return err
		}

		fromStage := currentStage.ID
		transition := models.RecordTransition{
			RecordID:    record.ID,
			FromStageID: &fromStage,
			MovedBy:     userID,
			Note:        note,
		}

		if next == nil {
			record.Status = models.RecordStatusFinished
			record.LockedBy = nil
			record.LockedAt = nil
			transition.ToStageID = currentStage.ID
			if err := tx.Create(&transition); err != nil {
				return err
			}
			return tx.Save(record)
		}

		// Seed prev_stage_key fields on the next stage from the current values.
		if err := seedInheritedValues(tx, record.ID, next, valuesByKey); err != nil {
			return err
		}

		record.CurrentStageID = next.ID
		record.Status = models.RecordStatusOpen
		record.LockedBy = nil
		record.LockedAt = nil
		transition.ToStageID = next.ID
		if err := tx.Create(&transition); err != nil {
			return err
		}
		return tx.Save(record)
	})

	if txErr != nil {
		var conflict ErrUniquenessConflict
		if errors.As(txErr, &conflict) {
			return conflict.Label, nil
		}
		return "", txErr
	}
	return "", nil
}

// seedInheritedValues copies values from the previous stage into the next stage's
// fields that declare a prev_stage_key, then re-checks uniqueness for those seeds.
func seedInheritedValues(tx orm.Query, recordID uint, next *models.Stage, prevValues map[string][]string) error {
	fields, err := StageFields(tx, next.ID)
	if err != nil {
		return err
	}
	seeded := map[string][]string{}
	for _, f := range fields {
		if f.PrevStageKey == "" {
			continue
		}
		vals := prevValues[f.PrevStageKey]
		if len(vals) == 0 {
			continue
		}
		seeded[f.Key] = vals
		for i, v := range vals {
			row := models.RecordValue{
				RecordID:   recordID,
				StageID:    next.ID,
				FieldID:    f.ID,
				FieldKey:   f.Key,
				Value:      v,
				ValueIndex: i,
			}
			if err := tx.Create(&row); err != nil {
				return err
			}
		}
	}
	if len(seeded) > 0 {
		if label, err := EnforceUniqueness(tx, recordID, next.ID, seeded); err != nil {
			return err
		} else if label != "" {
			return ErrUniquenessConflict{Label: label}
		}
	}
	return nil
}

func stageByID(tx orm.Query, id uint) (*models.Stage, error) {
	var stage models.Stage
	if err := tx.Where("id", id).First(&stage); err != nil {
		return nil, err
	}
	if stage.ID == 0 {
		return nil, ErrValidation{"current stage not found"}
	}
	return &stage, nil
}

// Now is a small helper for lock timestamps.
func Now() *carbon.DateTime {
	return carbon.NewDateTime(carbon.Now())
}
