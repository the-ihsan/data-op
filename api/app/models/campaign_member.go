package models

import (
	"github.com/goravel/framework/database/orm"
)

const (
	RoleOwner   = "owner"
	RoleManager = "manager"
	RoleMember  = "member"
)

type CampaignMember struct {
	orm.Model
	CampaignID uint   `json:"campaign_id" gorm:"uniqueIndex:idx_campaign_user"`
	UserID     uint   `json:"user_id" gorm:"uniqueIndex:idx_campaign_user"`
	Role       string `json:"role"`
	CanAdd     bool   `json:"can_add"`
	CanEdit    bool   `json:"can_edit"`
	CanDelete  bool   `json:"can_delete"`

	User *User `json:"user,omitempty" gorm:"foreignKey:UserID"`
}

// IsOwner reports whether the member owns the campaign (full control).
func (m CampaignMember) IsOwner() bool {
	return m.Role == RoleOwner
}
