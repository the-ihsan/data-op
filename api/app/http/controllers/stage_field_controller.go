package controllers

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
	"goravel/app/services"
)

type StageFieldController struct{}

func NewStageFieldController() *StageFieldController {
	return &StageFieldController{}
}

type fieldRequest struct {
	Key          string   `json:"key"`
	Label        string   `json:"label"`
	Type         string   `json:"type"`
	Required     bool     `json:"required"`
	IsUnique     bool     `json:"is_unique"`
	MaxCount     int      `json:"max_count"`
	Options      []string `json:"options"`
	PrevStageKey string   `json:"prev_stage_key"`
	Position     *int     `json:"position"`
}

func (r *StageFieldController) Store(ctx http.Context) http.Response {
	stage, campaign, resp := loadStage(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanManage(currentUserID(ctx), campaign.ID) {
		return forbidden(ctx, "only owners or managers can define fields")
	}

	var req fieldRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}

	field, resp := r.buildField(ctx, stage, nil, &req)
	if resp != nil {
		return resp
	}
	if err := facades.Orm().Query().Create(field); err != nil {
		return serverError(ctx, err)
	}
	return created(ctx, field)
}

func (r *StageFieldController) Update(ctx http.Context) http.Response {
	stage, campaign, resp := loadStage(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanManage(currentUserID(ctx), campaign.ID) {
		return forbidden(ctx, "only owners or managers can edit fields")
	}

	fieldID := ctx.Request().RouteInt("field")
	var field models.StageField
	if err := facades.Orm().Query().Where("id", fieldID).Where("stage_id", stage.ID).First(&field); err != nil {
		return serverError(ctx, err)
	}
	if field.ID == 0 {
		return notFound(ctx, "field not found")
	}

	var req fieldRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	updated, resp := r.buildField(ctx, stage, &field, &req)
	if resp != nil {
		return resp
	}
	if err := facades.Orm().Query().Save(updated); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, updated)
}

func (r *StageFieldController) Destroy(ctx http.Context) http.Response {
	stage, campaign, resp := loadStage(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanManage(currentUserID(ctx), campaign.ID) {
		return forbidden(ctx, "only owners or managers can delete fields")
	}
	fieldID := ctx.Request().RouteInt("field")
	var field models.StageField
	if err := facades.Orm().Query().Where("id", fieldID).Where("stage_id", stage.ID).First(&field); err != nil {
		return serverError(ctx, err)
	}
	if field.ID == 0 {
		return notFound(ctx, "field not found")
	}
	if _, err := facades.Orm().Query().Delete(&field); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, http.Json{"message": "field deleted"})
}

// buildField validates the request and returns a populated field. When existing is
// non-nil the field is updated in place; otherwise a new field is constructed.
func (r *StageFieldController) buildField(ctx http.Context, stage *models.Stage, existing *models.StageField, req *fieldRequest) (*models.StageField, http.Response) {
	label := strings.TrimSpace(req.Label)
	if label == "" {
		return nil, badRequest(ctx, "field label is required")
	}
	if !models.ValidFieldTypes[req.Type] {
		return nil, badRequest(ctx, "unsupported field type")
	}
	if req.MaxCount < 0 {
		return nil, badRequest(ctx, "max_count cannot be negative")
	}

	key := slugify(req.Key)
	if key == "" {
		key = slugify(label)
	}
	if key == "" {
		return nil, badRequest(ctx, "could not derive a field key")
	}

	// Enforce key uniqueness within the stage.
	var clash models.StageField
	q := facades.Orm().Query().Where("stage_id", stage.ID).Where("key", key)
	if existing != nil {
		q = q.Where("id != ?", existing.ID)
	}
	if err := q.First(&clash); err != nil {
		return nil, serverError(ctx, err)
	}
	if clash.ID != 0 {
		return nil, conflict(ctx, "a field with key '"+key+"' already exists in this stage")
	}

	// Choice fields require a non-empty option list.
	optionsJSON := ""
	if models.IsChoiceType(req.Type) {
		if len(req.Options) == 0 {
			return nil, badRequest(ctx, "select fields require at least one option")
		}
		b, err := json.Marshal(req.Options)
		if err != nil {
			return nil, serverError(ctx, err)
		}
		optionsJSON = string(b)
	}

	// prev_stage_key must reference a field key in the immediately-previous stage.
	prevKey := strings.TrimSpace(req.PrevStageKey)
	if prevKey != "" {
		if resp := r.validatePrevStageKey(ctx, stage, prevKey); resp != nil {
			return nil, resp
		}
	}

	field := existing
	if field == nil {
		field = &models.StageField{StageID: stage.ID}
	}
	field.Key = key
	field.Label = label
	field.Type = req.Type
	field.Required = req.Required
	field.IsUnique = req.IsUnique
	field.MaxCount = req.MaxCount
	field.Options = optionsJSON
	field.PrevStageKey = prevKey
	if req.Position != nil {
		field.Position = *req.Position
	}
	return field, nil
}

func (r *StageFieldController) validatePrevStageKey(ctx http.Context, stage *models.Stage, prevKey string) http.Response {
	if stage.Position <= 0 {
		return badRequest(ctx, "the first stage cannot inherit from a previous stage")
	}
	var prevStage models.Stage
	if err := facades.Orm().Query().
		Where("campaign_id", stage.CampaignID).
		Where("position", stage.Position-1).
		First(&prevStage); err != nil {
		return serverError(ctx, err)
	}
	if prevStage.ID == 0 {
		return badRequest(ctx, "no previous stage found to inherit from")
	}
	var prevField models.StageField
	if err := facades.Orm().Query().Where("stage_id", prevStage.ID).Where("key", prevKey).First(&prevField); err != nil {
		return serverError(ctx, err)
	}
	if prevField.ID == 0 {
		return badRequest(ctx, "prev_stage_key does not match any field in the previous stage")
	}
	return nil
}

var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

// slugify converts a label into a lowercase snake_case key.
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = slugPattern.ReplaceAllString(s, "_")
	return strings.Trim(s, "_")
}
