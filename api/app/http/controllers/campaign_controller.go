package controllers

import (
	"strings"

	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
	"goravel/app/services"
)

type CampaignController struct{}

func NewCampaignController() *CampaignController {
	return &CampaignController{}
}

type campaignRequest struct {
	Name                string `json:"name"`
	Description         string `json:"description"`
	Visibility          string `json:"visibility"`
	Status              string `json:"status"`
	AllowConcurrentEdit bool   `json:"allow_concurrent_edit"`
}

// Index lists campaigns the caller can see: any public campaign plus any campaign
// they are a member of.
func (r *CampaignController) Index(ctx http.Context) http.Response {
	uid := currentUserID(ctx)

	var memberships []models.CampaignMember
	if err := facades.Orm().Query().Where("user_id", uid).Get(&memberships); err != nil {
		return serverError(ctx, err)
	}
	ids := make([]uint, 0, len(memberships))
	for _, m := range memberships {
		ids = append(ids, m.CampaignID)
	}

	query := facades.Orm().Query().Model(&models.Campaign{})
	if len(ids) > 0 {
		query = query.Where("visibility = ? OR id IN ?", models.VisibilityPublic, ids)
	} else {
		query = query.Where("visibility = ?", models.VisibilityPublic)
	}

	var campaigns []models.Campaign
	if err := query.Order("created_at DESC").Get(&campaigns); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, campaigns)
}

func (r *CampaignController) Store(ctx http.Context) http.Response {
	uid := currentUserID(ctx)

	var req campaignRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return badRequest(ctx, "name is required")
	}
	if req.Visibility != models.VisibilityPublic {
		req.Visibility = models.VisibilityPrivate
	}
	if !validCampaignStatus(req.Status) {
		req.Status = models.CampaignStatusDraft
	}

	campaign := models.Campaign{
		Name:                req.Name,
		Description:         req.Description,
		Visibility:          req.Visibility,
		Status:              req.Status,
		AllowConcurrentEdit: req.AllowConcurrentEdit,
		CreatedBy:           uid,
	}
	if err := facades.Orm().Query().Create(&campaign); err != nil {
		return serverError(ctx, err)
	}

	// Seed the creator as owner with full permissions.
	owner := models.CampaignMember{
		CampaignID: campaign.ID,
		UserID:     uid,
		Role:       models.RoleOwner,
		CanAdd:     true,
		CanEdit:    true,
		CanDelete:  true,
	}
	if err := facades.Orm().Query().Create(&owner); err != nil {
		return serverError(ctx, err)
	}

	return created(ctx, campaign)
}

func (r *CampaignController) Show(ctx http.Context) http.Response {
	uid := currentUserID(ctx)
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanView(uid, campaign) {
		return forbidden(ctx, "you do not have access to this campaign")
	}

	// Eager-load stages with fields and constraints for the detail view.
	if err := facades.Orm().Query().
		Where("campaign_id", campaign.ID).
		With("Fields").
		With("UniqueConstraints").
		Order("position ASC").
		Get(&campaign.Stages); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, campaign)
}

func (r *CampaignController) Update(ctx http.Context) http.Response {
	uid := currentUserID(ctx)
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return resp
	}
	// Only the owner may change campaign settings.
	if member, err := services.Membership(uid, campaign.ID); err != nil || !member.IsOwner() {
		return forbidden(ctx, "only the campaign owner can update settings")
	}

	var req campaignRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	if name := strings.TrimSpace(req.Name); name != "" {
		campaign.Name = name
	}
	campaign.Description = req.Description
	if req.Visibility == models.VisibilityPublic || req.Visibility == models.VisibilityPrivate {
		campaign.Visibility = req.Visibility
	}
	if validCampaignStatus(req.Status) {
		campaign.Status = req.Status
	}
	campaign.AllowConcurrentEdit = req.AllowConcurrentEdit

	if err := facades.Orm().Query().Save(campaign); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, campaign)
}

func (r *CampaignController) Destroy(ctx http.Context) http.Response {
	uid := currentUserID(ctx)
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return resp
	}
	if member, err := services.Membership(uid, campaign.ID); err != nil || !member.IsOwner() {
		return forbidden(ctx, "only the campaign owner can delete the campaign")
	}
	if _, err := facades.Orm().Query().Delete(campaign); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, http.Json{"message": "campaign deleted"})
}

// loadCampaign fetches the campaign named by the {campaign} route param.
func loadCampaign(ctx http.Context) (*models.Campaign, http.Response) {
	id := ctx.Request().RouteInt("campaign")
	if id <= 0 {
		return nil, badRequest(ctx, "invalid campaign id")
	}
	var campaign models.Campaign
	if err := facades.Orm().Query().Where("id", id).First(&campaign); err != nil {
		return nil, serverError(ctx, err)
	}
	if campaign.ID == 0 {
		return nil, notFound(ctx, "campaign not found")
	}
	return &campaign, nil
}

func validCampaignStatus(s string) bool {
	switch s {
	case models.CampaignStatusDraft, models.CampaignStatusActive,
		models.CampaignStatusPaused, models.CampaignStatusArchived:
		return true
	}
	return false
}
