package models

import "github.com/goravel/framework/database/orm"

// UniquenessConflictCount tracks how many times a uniqueness conflict has been
// triggered for a given field or composite constraint within a stage.
// constraint_ref matches the format used in RecordStageKey: "field:<key>" or
// "constraint:<id>".
type UniquenessConflictCount struct {
	orm.Model
	StageID       uint   `json:"stage_id" gorm:"uniqueIndex:idx_ucc_stage_ref"`
	ConstraintRef string `json:"constraint_ref" gorm:"uniqueIndex:idx_ucc_stage_ref"`
	Count         uint64 `json:"count"`
}
