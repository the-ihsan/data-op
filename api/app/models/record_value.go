package models

import (
	"github.com/goravel/framework/database/orm"
)

// RecordValue is a single field value for a record at a given stage. Fields that
// allow multiple entries (max_count != 1) produce several rows distinguished by
// ValueIndex. Multiselect values are stored as a JSON array string in Value.
type RecordValue struct {
	orm.Model
	RecordID   uint   `json:"record_id" gorm:"index:idx_record_stage"`
	StageID    uint   `json:"stage_id" gorm:"index:idx_record_stage"`
	FieldID    uint   `json:"field_id"`
	FieldKey   string `json:"field_key"`
	Value      string `json:"value"`
	ValueIndex int    `json:"value_index"`
}
