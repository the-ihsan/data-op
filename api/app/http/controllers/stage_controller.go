package controllers

import (
	"fmt"
	"strings"

	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
	"goravel/app/services"
)

type StageController struct{}

func NewStageController() *StageController {
	return &StageController{}
}

type stageRequest struct {
	Name     string `json:"name"`
	Position *int   `json:"position"`
}

func (r *StageController) Index(ctx http.Context) http.Response {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanView(currentUserID(ctx), campaign) {
		return forbidden(ctx, "you do not have access to this campaign")
	}

	var stages []models.Stage
	if err := facades.Orm().Query().
		Where("campaign_id", campaign.ID).
		With("Fields").
		With("UniqueConstraints").
		Order("position ASC").
		Get(&stages); err != nil {
		return serverError(ctx, err)
	}

	// Annotate each unique field and composite constraint with its cumulative
	// duplicate-attempt count from uniqueness_conflict_counts.
	stageIDs := make([]any, len(stages))
	for i, s := range stages {
		stageIDs[i] = s.ID
	}
	if len(stageIDs) > 0 {
		var counts []models.UniquenessConflictCount
		if err := facades.Orm().Query().WhereIn("stage_id", stageIDs).Get(&counts); err == nil {
			type key struct{ stageID uint; ref string }
			cm := map[key]uint64{}
			for _, c := range counts {
				cm[key{c.StageID, c.ConstraintRef}] = c.Count
			}
			for i := range stages {
				for j := range stages[i].Fields {
					if stages[i].Fields[j].IsUnique {
						ref := "field:" + stages[i].Fields[j].Key
						stages[i].Fields[j].ConflictCount = cm[key{stages[i].ID, ref}]
					}
				}
				for j := range stages[i].UniqueConstraints {
					ref := fmt.Sprintf("constraint:%d", stages[i].UniqueConstraints[j].ID)
					stages[i].UniqueConstraints[j].ConflictCount = cm[key{stages[i].ID, ref}]
				}
			}
		}
	}

	return ok(ctx, stages)
}

func (r *StageController) Store(ctx http.Context) http.Response {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanManage(currentUserID(ctx), campaign.ID) {
		return forbidden(ctx, "only owners or managers can define stages")
	}

	var req stageRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return badRequest(ctx, "stage name is required")
	}

	position := 0
	if req.Position != nil {
		position = *req.Position
	} else {
		// Append after the current last stage.
		count, err := facades.Orm().Query().Model(&models.Stage{}).Where("campaign_id", campaign.ID).Count()
		if err != nil {
			return serverError(ctx, err)
		}
		position = int(count)
	}

	stage := models.Stage{CampaignID: campaign.ID, Name: req.Name, Position: position}
	if err := facades.Orm().Query().Create(&stage); err != nil {
		return serverError(ctx, err)
	}
	return created(ctx, stage)
}

func (r *StageController) Update(ctx http.Context) http.Response {
	stage, campaign, resp := loadStage(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanManage(currentUserID(ctx), campaign.ID) {
		return forbidden(ctx, "only owners or managers can edit stages")
	}

	var req stageRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	if name := strings.TrimSpace(req.Name); name != "" {
		stage.Name = name
	}
	if req.Position != nil {
		stage.Position = *req.Position
	}
	if err := facades.Orm().Query().Save(stage); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, stage)
}

func (r *StageController) Destroy(ctx http.Context) http.Response {
	stage, campaign, resp := loadStage(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanManage(currentUserID(ctx), campaign.ID) {
		return forbidden(ctx, "only owners or managers can delete stages")
	}

	// Remove the stage together with its field and constraint definitions.
	if _, err := facades.Orm().Query().Where("stage_id", stage.ID).Delete(&models.StageField{}); err != nil {
		return serverError(ctx, err)
	}
	if _, err := facades.Orm().Query().Where("stage_id", stage.ID).Delete(&models.StageUniqueConstraint{}); err != nil {
		return serverError(ctx, err)
	}
	if _, err := facades.Orm().Query().Delete(stage); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, http.Json{"message": "stage deleted"})
}

// loadStage resolves the {stage} route param and its owning campaign, ensuring the
// stage belongs to the campaign named in {campaign}.
func loadStage(ctx http.Context) (*models.Stage, *models.Campaign, http.Response) {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return nil, nil, resp
	}
	id := ctx.Request().RouteInt("stage")
	var stage models.Stage
	if err := facades.Orm().Query().Where("id", id).Where("campaign_id", campaign.ID).First(&stage); err != nil {
		return nil, nil, serverError(ctx, err)
	}
	if stage.ID == 0 {
		return nil, nil, notFound(ctx, "stage not found")
	}
	return &stage, campaign, nil
}
