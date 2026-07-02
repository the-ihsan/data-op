package models

import (
	"github.com/goravel/framework/database/orm"
)

type Stage struct {
	orm.Model
	CampaignID uint   `json:"campaign_id" gorm:"index"`
	Name       string `json:"name"`
	Position   int    `json:"position"`

	Fields            []StageField            `json:"fields,omitempty" gorm:"foreignKey:StageID"`
	UniqueConstraints []StageUniqueConstraint `json:"unique_constraints,omitempty" gorm:"foreignKey:StageID"`
}
