package models

import (
	"github.com/goravel/framework/database/orm"
)

type Stage struct {
	orm.Model
	CampaignID uint   `json:"campaign_id" gorm:"index"`
	Name       string `json:"name"`
	Position   int    `json:"position"`
	// SanitizeEntry optionally holds a Starlark script that must define
	// sanitize(data). The function receives the entry's values as a dict and
	// returns either the sanitized dict, or None plus an error message to
	// reject the entry. Compiled programs are cached (services/starlark).
	SanitizeEntry string `json:"sanitize_entry"`

	Fields            []StageField            `json:"fields,omitempty" gorm:"foreignKey:StageID"`
	UniqueConstraints []StageUniqueConstraint `json:"unique_constraints,omitempty" gorm:"foreignKey:StageID"`
}
