package services

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strconv"
	"strings"

	"github.com/goravel/framework/contracts/database/orm"
	"github.com/goravel/framework/facades"
	"gorm.io/gorm"

	"goravel/app/models"
)

type uniqueTarget struct {
	ref       string
	fieldKeys []string
	label     string
}

// stageUniqueTargets returns every uniqueness target defined on a stage: each
// is_unique field plus each composite constraint.
func stageUniqueTargets(tx orm.Query, stageID uint) ([]uniqueTarget, error) {
	var targets []uniqueTarget

	var fields []models.StageField
	if err := tx.Where("stage_id", stageID).Where("is_unique", true).Get(&fields); err != nil {
		return nil, err
	}
	for _, f := range fields {
		targets = append(targets, uniqueTarget{
			ref:       "field:" + f.Key,
			fieldKeys: []string{f.Key},
			label:     f.Label,
		})
	}

	var constraints []models.StageUniqueConstraint
	if err := tx.Where("stage_id", stageID).Get(&constraints); err != nil {
		return nil, err
	}
	for _, c := range constraints {
		var keys []string
		if err := json.Unmarshal([]byte(c.FieldKeys), &keys); err != nil {
			continue
		}
		targets = append(targets, uniqueTarget{
			ref:       "constraint:" + strconv.FormatUint(uint64(c.ID), 10),
			fieldKeys: keys,
			label:     strings.Join(keys, " + "),
		})
	}
	return targets, nil
}

// targetHash builds an order-stable hash for a target from the record's values.
// Returns ok=false when every field in the target is empty (nothing to dedupe).
func targetHash(t uniqueTarget, valuesByKey map[string][]string) (string, bool) {
	parts := make([]string, 0, len(t.fieldKeys))
	hasAny := false
	for _, k := range t.fieldKeys {
		// Ignore blank entries so an empty value never participates in uniqueness.
		vals := make([]string, 0, len(valuesByKey[k]))
		for _, v := range valuesByKey[k] {
			if v != "" {
				vals = append(vals, v)
			}
		}
		sort.Strings(vals)
		if len(vals) > 0 {
			hasAny = true
		}
		parts = append(parts, strings.Join(vals, "\x1e"))
	}
	if !hasAny {
		return "", false
	}
	joined := strings.Join(parts, "\x1f")
	sum := sha256.Sum256([]byte(joined))
	return hex.EncodeToString(sum[:]), true
}

// incrementConflictCount bumps the hit counter for a uniqueness constraint outside
// any surrounding transaction, so the increment persists even if the caller's
// transaction is rolled back. Errors are silently swallowed — a missed counter
// increment is non-fatal.
//
// A single atomic UPDATE (SET count = count + 1) avoids the read-modify-write
// race that two concurrent conflict events would introduce. The INSERT only runs
// the very first time a given constraint is hit; if two concurrent "firsts" race
// on INSERT the duplicate-key error is ignored (one write wins, off by 1 at
// most — acceptable for a stats counter).
func incrementConflictCount(stageID uint, constraintRef string) {
	result, _ := facades.Orm().Query().
		Model(&models.UniquenessConflictCount{}).
		Where("stage_id", stageID).
		Where("constraint_ref", constraintRef).
		Update("count", gorm.Expr("count + 1"))
	if result == nil || result.RowsAffected == 0 {
		// Row does not exist yet — this is the first conflict for this constraint.
		row := models.UniquenessConflictCount{
			StageID:       stageID,
			ConstraintRef: constraintRef,
			Count:         1,
		}
		_ = facades.Orm().Query().Create(&row)
	}
}

// EnforceUniqueness validates and reserves stage-level uniqueness for a record.
// It clears any keys previously reserved for (record, stage), then for each target
// checks whether another record already holds the same value combination. On a
// clash it returns the target's label (and reserves nothing further); otherwise it
// reserves the new keys. The unique index on record_stage_keys is the final guard.
func EnforceUniqueness(tx orm.Query, recordID, stageID uint, valuesByKey map[string][]string) (string, error) {
	targets, err := stageUniqueTargets(tx, stageID)
	if err != nil {
		return "", err
	}

	if _, err := tx.Where("record_id", recordID).Where("stage_id", stageID).Delete(&models.RecordStageKey{}); err != nil {
		return "", err
	}

	for _, t := range targets {
		hash, ok := targetHash(t, valuesByKey)
		if !ok {
			continue
		}
		var existing models.RecordStageKey
		if err := tx.Where("stage_id", stageID).
			Where("constraint_ref", t.ref).
			Where("normalized_hash", hash).
			First(&existing); err != nil {
			return "", err
		}
		if existing.ID != 0 {
			incrementConflictCount(stageID, t.ref)
			return t.label, nil
		}
		key := models.RecordStageKey{
			RecordID:       recordID,
			StageID:        stageID,
			ConstraintRef:  t.ref,
			NormalizedHash: hash,
		}
		if err := tx.Create(&key); err != nil {
			return "", err
		}
	}
	return "", nil
}
