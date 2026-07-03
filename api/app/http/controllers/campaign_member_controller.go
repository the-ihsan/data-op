package controllers

import (
	"strings"

	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
	"goravel/app/services"
)

type CampaignMemberController struct{}

func NewCampaignMemberController() *CampaignMemberController {
	return &CampaignMemberController{}
}

type memberRequest struct {
	Username  string `json:"username"`
	Role      string `json:"role"`
	CanAdd    bool   `json:"can_add"`
	CanEdit   bool   `json:"can_edit"`
	CanDelete bool   `json:"can_delete"`
}

// requireMemberManager ensures the caller may add/remove/update campaign members
// (owners and managers). Settings remain owner-only.
func requireMemberManager(ctx http.Context) (*models.Campaign, http.Response) {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return nil, resp
	}
	if !services.CanManage(currentUserID(ctx), campaign.ID) {
		return nil, forbidden(ctx, "only the campaign owner or a manager can manage members")
	}
	return campaign, nil
}

func (r *CampaignMemberController) Index(ctx http.Context) http.Response {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return resp
	}
	uid := currentUserID(ctx)
	if _, err := services.Membership(uid, campaign.ID); err != nil {
		return forbidden(ctx, "you do not have access to this campaign")
	}

	var members []models.CampaignMember
	if err := facades.Orm().Query().
		Where("campaign_id", campaign.ID).
		With("User").
		Get(&members); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, members)
}

func (r *CampaignMemberController) Store(ctx http.Context) http.Response {
	campaign, resp := requireMemberManager(ctx)
	if resp != nil {
		return resp
	}

	var req memberRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	if req.Role == models.RoleOwner {
		return badRequest(ctx, "the owner role cannot be assigned")
	}
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	if req.Username == "" {
		return badRequest(ctx, "username is required")
	}

	var user models.User
	if err := facades.Orm().Query().Where("username", req.Username).First(&user); err != nil {
		return serverError(ctx, err)
	}
	if user.ID == 0 {
		return notFound(ctx, "no user with that username")
	}

	var existing models.CampaignMember
	if err := facades.Orm().Query().
		Where("campaign_id", campaign.ID).
		Where("user_id", user.ID).
		First(&existing); err != nil {
		return serverError(ctx, err)
	}
	if existing.ID != 0 {
		return conflict(ctx, "user is already a member")
	}

	member := models.CampaignMember{
		CampaignID: campaign.ID,
		UserID:     user.ID,
		Role:       normalizeRole(req.Role),
		CanAdd:     req.CanAdd,
		CanEdit:    req.CanEdit,
		CanDelete:  req.CanDelete,
	}
	if err := facades.Orm().Query().Create(&member); err != nil {
		return serverError(ctx, err)
	}
	member.User = &user
	return created(ctx, member)
}

func (r *CampaignMemberController) Update(ctx http.Context) http.Response {
	campaign, resp := requireMemberManager(ctx)
	if resp != nil {
		return resp
	}
	memberID := ctx.Request().RouteInt("member")

	var member models.CampaignMember
	if err := facades.Orm().Query().
		Where("id", memberID).
		Where("campaign_id", campaign.ID).
		First(&member); err != nil {
		return serverError(ctx, err)
	}
	if member.ID == 0 {
		return notFound(ctx, "member not found")
	}
	if member.IsOwner() {
		return badRequest(ctx, "the owner's permissions cannot be changed")
	}

	var req memberRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	if req.Role == models.RoleOwner {
		return badRequest(ctx, "the owner role cannot be assigned")
	}
	member.Role = normalizeRole(req.Role)
	member.CanAdd = req.CanAdd
	member.CanEdit = req.CanEdit
	member.CanDelete = req.CanDelete
	if err := facades.Orm().Query().Save(&member); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, member)
}

func (r *CampaignMemberController) Destroy(ctx http.Context) http.Response {
	campaign, resp := requireMemberManager(ctx)
	if resp != nil {
		return resp
	}
	memberID := ctx.Request().RouteInt("member")

	var member models.CampaignMember
	if err := facades.Orm().Query().
		Where("id", memberID).
		Where("campaign_id", campaign.ID).
		First(&member); err != nil {
		return serverError(ctx, err)
	}
	if member.ID == 0 {
		return notFound(ctx, "member not found")
	}
	if member.IsOwner() {
		return badRequest(ctx, "the owner cannot be removed")
	}
	if _, err := facades.Orm().Query().Delete(&member); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, http.Json{"message": "member removed"})
}

func normalizeRole(role string) string {
	switch role {
	case models.RoleManager, models.RoleMember:
		return role
	default:
		return models.RoleMember
	}
}
