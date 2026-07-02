package models

import (
	"github.com/goravel/framework/database/orm"
)

// StageUniqueConstraint defines a combination of field keys that together must be
// unique across all records at a given stage.
type StageUniqueConstraint struct {
	orm.Model
	StageID   uint   `json:"stage_id" gorm:"index"`
	FieldKeys string `json:"field_keys" gorm:"type:text"` // JSON array of field keys
}
