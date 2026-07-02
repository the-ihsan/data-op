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
	Email     string `json:"email"`
	Role      string `json:"role"`
	CanAdd    bool   `json:"can_add"`
	CanEdit   bool   `json:"can_edit"`
	CanDelete bool   `json:"can_delete"`
}

// requireOwner ensures the caller owns the campaign named in the route.
func requireOwner(ctx http.Context) (*models.Campaign, http.Response) {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return nil, resp
	}
	uid := currentUserID(ctx)
	if member, err := services.Membership(uid, campaign.ID); err != nil || !member.IsOwner() {
		return nil, forbidden(ctx, "only the campaign owner can manage members")
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
	campaign, resp := requireOwner(ctx)
	if resp != nil {
		return resp
	}

	var req memberRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		return badRequest(ctx, "email is required")
	}

	var user models.User
	if err := facades.Orm().Query().Where("email", req.Email).First(&user); err != nil {
		return serverError(ctx, err)
	}
	if user.ID == 0 {
		return notFound(ctx, "no user with that email")
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
	campaign, resp := requireOwner(ctx)
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
	campaign, resp := requireOwner(ctx)
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
