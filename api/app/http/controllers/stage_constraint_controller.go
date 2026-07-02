package controllers

import (
	"encoding/json"

	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
	"goravel/app/services"
)

type StageConstraintController struct{}

func NewStageConstraintController() *StageConstraintController {
	return &StageConstraintController{}
}

type constraintRequest struct {
	FieldKeys []string `json:"field_keys"`
}

func (r *StageConstraintController) Store(ctx http.Context) http.Response {
	stage, campaign, resp := loadStage(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanManage(currentUserID(ctx), campaign.ID) {
		return forbidden(ctx, "only owners or managers can define constraints")
	}

	var req constraintRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	if len(req.FieldKeys) < 2 {
		return badRequest(ctx, "a composite constraint needs at least two field keys")
	}

	// Every key must belong to this stage.
	for _, key := range req.FieldKeys {
		var f models.StageField
		if err := facades.Orm().Query().Where("stage_id", stage.ID).Where("key", key).First(&f); err != nil {
			return serverError(ctx, err)
		}
		if f.ID == 0 {
			return badRequest(ctx, "unknown field key: "+key)
		}
	}

	b, err := json.Marshal(req.FieldKeys)
	if err != nil {
		return serverError(ctx, err)
	}
	constraint := models.StageUniqueConstraint{StageID: stage.ID, FieldKeys: string(b)}
	if err := facades.Orm().Query().Create(&constraint); err != nil {
		return serverError(ctx, err)
	}
	return created(ctx, constraint)
}

func (r *StageConstraintController) Destroy(ctx http.Context) http.Response {
	stage, campaign, resp := loadStage(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanManage(currentUserID(ctx), campaign.ID) {
		return forbidden(ctx, "only owners or managers can delete constraints")
	}
	id := ctx.Request().RouteInt("constraint")
	var constraint models.StageUniqueConstraint
	if err := facades.Orm().Query().Where("id", id).Where("stage_id", stage.ID).First(&constraint); err != nil {
		return serverError(ctx, err)
	}
	if constraint.ID == 0 {
		return notFound(ctx, "constraint not found")
	}
	if _, err := facades.Orm().Query().Delete(&constraint); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, http.Json{"message": "constraint deleted"})
}
