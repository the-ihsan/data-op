package models

import (
	"github.com/goravel/framework/database/orm"
)

const (
	VisibilityPublic  = "public"
	VisibilityPrivate = "private"

	CampaignStatusDraft    = "draft"
	CampaignStatusActive   = "active"
	CampaignStatusPaused   = "paused"
	CampaignStatusArchived = "archived"
)

type Campaign struct {
	orm.Model
	Name                string `json:"name"`
	Description         string `json:"description"`
	Visibility          string `json:"visibility"`
	Status              string `json:"status"`
	AllowConcurrentEdit bool   `json:"allow_concurrent_edit"`
	CreatedBy           uint   `json:"created_by"`

	Stages  []Stage          `json:"stages,omitempty" gorm:"foreignKey:CampaignID"`
	Members []CampaignMember `json:"members,omitempty" gorm:"foreignKey:CampaignID"`
	orm.SoftDeletes
}
