package models

import (
	"github.com/goravel/framework/support/carbon"
)

// RecordTransition records each stage-to-stage move for audit/history.
type RecordTransition struct {
	ID          uint             `json:"id" gorm:"primaryKey"`
	RecordID    uint             `json:"record_id" gorm:"index"`
	FromStageID *uint            `json:"from_stage_id"`
	ToStageID   uint             `json:"to_stage_id"`
	MovedBy     uint             `json:"moved_by"`
	Note        string           `json:"note"`
	CreatedAt   *carbon.DateTime `json:"created_at" gorm:"autoCreateTime;column:created_at"`
}
