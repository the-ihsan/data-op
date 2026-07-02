package models

import (
	"github.com/goravel/framework/database/orm"
	"github.com/goravel/framework/support/carbon"
)

const (
	RecordStatusOpen       = "open"
	RecordStatusProcessing = "processing"
	RecordStatusFinished   = "finished"
)

type Record struct {
	orm.Model
	CampaignID     uint             `json:"campaign_id" gorm:"index"`
	CurrentStageID uint             `json:"current_stage_id" gorm:"index"`
	Status         string           `json:"status"`
	LockedBy       *uint            `json:"locked_by"`
	LockedAt       *carbon.DateTime `json:"locked_at"`
	CreatedBy      uint             `json:"created_by"`

	Values []RecordValue `json:"values,omitempty" gorm:"foreignKey:RecordID"`
}
