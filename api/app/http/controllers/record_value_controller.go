package controllers

import (
	"errors"

	"github.com/goravel/framework/contracts/database/orm"
	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
	"goravel/app/services"
)

type RecordValueController struct{}

func NewRecordValueController() *RecordValueController {
	return &RecordValueController{}
}

// Index returns the current stage's field definitions alongside the record's saved
// values, so the client can render and pre-fill the dynamic form.
func (r *RecordValueController) Index(ctx http.Context) http.Response {
	record, campaign, resp := loadRecord(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanView(currentUserID(ctx), campaign) {
		return forbidden(ctx, "you do not have access to this campaign")
	}

	var stage models.Stage
	if err := facades.Orm().Query().Where("id", record.CurrentStageID).First(&stage); err != nil {
		return serverError(ctx, err)
	}
	fields, err := services.StageFields(facades.Orm().Query(), stage.ID)
	if err != nil {
		return serverError(ctx, err)
	}
	values, err := services.LoadValuesByKey(facades.Orm().Query(), record.ID, stage.ID)
	if err != nil {
		return serverError(ctx, err)
	}

	return ok(ctx, http.Json{
		"record": record,
		"stage":  stage,
		"fields": fields,
		"values": values,
	})
}

type saveValuesRequest struct {
	Values map[string][]string `json:"values"`
}

// Update saves the record's values for its current stage, enforcing type, option,
// max_count and stage-level uniqueness rules.
func (r *RecordValueController) Update(ctx http.Context) http.Response {
	record, campaign, resp := loadRecord(ctx)
	if resp != nil {
		return resp
	}
	uid := currentUserID(ctx)
	if _, err := services.Authorize(uid, campaign.ID, services.PermEdit); err != nil {
		return forbidden(ctx, "you do not have permission to edit records")
	}
	if record.Status == models.RecordStatusFinished {
		return badRequest(ctx, "a finished record cannot be edited")
	}
	if resp := ensureNotLockedByOther(ctx, campaign, record, uid); resp != nil {
		return resp
	}

	var req saveValuesRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	if req.Values == nil {
		req.Values = map[string][]string{}
	}

	fields, err := services.StageFields(facades.Orm().Query(), record.CurrentStageID)
	if err != nil {
		return serverError(ctx, err)
	}

	var conflictLabel string
	txErr := facades.Orm().Transaction(func(tx orm.Query) error {
		valuesByKey, err := services.StoreValues(tx, record.ID, record.CurrentStageID, fields, req.Values)
		if err != nil {
			return err
		}
		label, err := services.EnforceUniqueness(tx, record.ID, record.CurrentStageID, valuesByKey)
		if err != nil {
			return err
		}
		if label != "" {
			conflictLabel = label
			return services.ErrUniquenessConflict{Label: label}
		}
		return nil
	})
	if txErr != nil {
		var v services.ErrValidation
		if errors.As(txErr, &v) {
			return badRequest(ctx, v.Message)
		}
		if conflictLabel != "" {
			return conflict(ctx, "a record with the same value already exists for: "+conflictLabel)
		}
		return serverError(ctx, txErr)
	}

	values, err := services.LoadValuesByKey(facades.Orm().Query(), record.ID, record.CurrentStageID)
	if err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, http.Json{"record": record, "values": values})
}
