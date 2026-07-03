package models

import (
	"github.com/goravel/framework/database/orm"
)

const (
	FieldTypeText        = "text"
	FieldTypeTextarea    = "textarea"
	FieldTypeNumber      = "number"
	FieldTypeDate        = "date"
	FieldTypeBoolean     = "boolean"
	FieldTypeSelect      = "select"
	FieldTypeMultiSelect = "multiselect"
)

// ValidFieldTypes is the set of field types supported by the form builder in v1.
var ValidFieldTypes = map[string]bool{
	FieldTypeText:        true,
	FieldTypeTextarea:    true,
	FieldTypeNumber:      true,
	FieldTypeDate:        true,
	FieldTypeBoolean:     true,
	FieldTypeSelect:      true,
	FieldTypeMultiSelect: true,
}

// IsChoiceType reports whether the field type requires a defined option list.
func IsChoiceType(t string) bool {
	return t == FieldTypeSelect || t == FieldTypeMultiSelect
}

// IsStringFieldType reports whether stored values are plain strings (text/textarea).
func IsStringFieldType(t string) bool {
	return t == FieldTypeText || t == FieldTypeTextarea
}

type StageField struct {
	orm.Model
	StageID       uint   `json:"stage_id" gorm:"index"`
	Key           string `json:"key"`
	Label         string `json:"label"`
	Type          string `json:"type"`
	Required      bool   `json:"required"`
	IsUnique      bool   `json:"is_unique"`
	MaxCount      int    `json:"max_count"` // 0 = unlimited entries
	Options       string `json:"options" gorm:"type:text"`
	PrevStageKey  string `json:"prev_stage_key"`
	DefaultValue  string `json:"default_value"`
	Position      int    `json:"position"`
	// ConflictCount is populated at query time from uniqueness_conflict_counts; never persisted.
	ConflictCount uint64 `json:"conflict_count" gorm:"-"`
	// ValueCount is populated at query time from record_values; never persisted.
	ValueCount uint64 `json:"value_count" gorm:"-"`
}
