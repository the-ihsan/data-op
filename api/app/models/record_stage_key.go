package models

import (
	"github.com/goravel/framework/database/orm"
)

// RecordStageKey backs stage-level uniqueness. For every unique field or composite
// constraint at a stage, one row stores a normalized hash of the record's value(s).
// The unique index on (stage_id, constraint_ref, normalized_hash) is the DB-level
// guarantee that no two records share the same value combination at a stage.
type RecordStageKey struct {
	orm.Model
	RecordID       uint   `json:"record_id" gorm:"index"`
	StageID        uint   `json:"stage_id" gorm:"uniqueIndex:idx_stage_constraint_hash"`
	ConstraintRef  string `json:"constraint_ref" gorm:"uniqueIndex:idx_stage_constraint_hash"`
	NormalizedHash string `json:"normalized_hash" gorm:"uniqueIndex:idx_stage_constraint_hash"`
}
