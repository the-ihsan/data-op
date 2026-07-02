package services

import (
	"errors"

	"github.com/goravel/framework/facades"

	"goravel/app/models"
)

// Permission identifiers used across campaign-scoped endpoints.
const (
	PermAdd    = "add"
	PermEdit   = "edit"
	PermDelete = "delete"
	PermManage = "manage" // owner-only: settings, members, stage definitions
)

var (
	ErrNotMember  = errors.New("not a member of this campaign")
	ErrForbidden  = errors.New("insufficient permissions")
	ErrNoCampaign = errors.New("campaign not found")
)

// Membership returns the caller's membership row for a campaign, or ErrNotMember.
func Membership(userID, campaignID uint) (*models.CampaignMember, error) {
	var member models.CampaignMember
	if err := facades.Orm().Query().
		Where("campaign_id", campaignID).
		Where("user_id", userID).
		First(&member); err != nil {
		return nil, err
	}
	if member.ID == 0 {
		return nil, ErrNotMember
	}
	return &member, nil
}

// CanView reports whether a user may read a campaign: any member may, and anyone
// may read a public campaign.
func CanView(userID uint, campaign *models.Campaign) bool {
	if campaign.Visibility == models.VisibilityPublic {
		return true
	}
	_, err := Membership(userID, campaign.ID)
	return err == nil
}

// CanManage reports whether the user may change campaign structure (stages,
// fields, constraints): owners and managers may.
func CanManage(userID, campaignID uint) bool {
	member, err := Membership(userID, campaignID)
	if err != nil {
		return false
	}
	return member.Role == models.RoleOwner || member.Role == models.RoleManager
}

// Authorize checks that userID holds the given permission on campaignID and
// returns the membership. Owners implicitly hold every permission.
func Authorize(userID, campaignID uint, perm string) (*models.CampaignMember, error) {
	member, err := Membership(userID, campaignID)
	if err != nil {
		return nil, err
	}
	if member.IsOwner() {
		return member, nil
	}
	granted := false
	switch perm {
	case PermAdd:
		granted = member.CanAdd
	case PermEdit:
		granted = member.CanEdit
	case PermDelete:
		granted = member.CanDelete
	case PermManage:
		granted = false // managed by owner only
	}
	if !granted {
		return nil, ErrForbidden
	}
	return member, nil
}
