package controllers

import (
	"github.com/goravel/framework/contracts/database/orm"
	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
	"goravel/app/services"
)

type RecordController struct{}

func NewRecordController() *RecordController {
	return &RecordController{}
}

// Index lists records for a campaign, optionally filtered by ?stage= and ?status=.
func (r *RecordController) Index(ctx http.Context) http.Response {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanView(currentUserID(ctx), campaign) {
		return forbidden(ctx, "you do not have access to this campaign")
	}

	query := facades.Orm().Query().Where("campaign_id", campaign.ID)
	if stageID := ctx.Request().QueryInt("stage"); stageID > 0 {
		query = query.Where("current_stage_id", stageID)
	}
	if status := ctx.Request().Query("status"); status != "" {
		query = query.Where("status", status)
	}

	var records []models.Record
	if err := query.With("Values").Order("updated_at DESC").Get(&records); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, records)
}

// Show returns a single record with its values.
func (r *RecordController) Show(ctx http.Context) http.Response {
	record, campaign, resp := loadRecord(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanView(currentUserID(ctx), campaign) {
		return forbidden(ctx, "you do not have access to this campaign")
	}
	if err := facades.Orm().Query().Where("record_id", record.ID).Get(&record.Values); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, record)
}

// Store creates a new record at the campaign's first stage.
func (r *RecordController) Store(ctx http.Context) http.Response {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return resp
	}
	uid := currentUserID(ctx)
	if _, err := services.Authorize(uid, campaign.ID, services.PermAdd); err != nil {
		return forbidden(ctx, "you do not have permission to add records")
	}

	var firstStage models.Stage
	if err := facades.Orm().Query().Where("campaign_id", campaign.ID).Order("position ASC").First(&firstStage); err != nil {
		return serverError(ctx, err)
	}
	if firstStage.ID == 0 {
		return badRequest(ctx, "campaign has no stages yet")
	}

	record := models.Record{
		CampaignID:     campaign.ID,
		CurrentStageID: firstStage.ID,
		Status:         models.RecordStatusOpen,
		CreatedBy:      uid,
	}
	if err := facades.Orm().Query().Create(&record); err != nil {
		return serverError(ctx, err)
	}

	// Record the initial placement for history.
	transition := models.RecordTransition{RecordID: record.ID, ToStageID: firstStage.ID, MovedBy: uid, Note: "created"}
	if err := facades.Orm().Query().Create(&transition); err != nil {
		return serverError(ctx, err)
	}
	return created(ctx, record)
}

// Destroy deletes a record together with its values, uniqueness keys and history.
func (r *RecordController) Destroy(ctx http.Context) http.Response {
	record, campaign, resp := loadRecord(ctx)
	if resp != nil {
		return resp
	}
	uid := currentUserID(ctx)
	if _, err := services.Authorize(uid, campaign.ID, services.PermDelete); err != nil {
		return forbidden(ctx, "you do not have permission to delete records")
	}
	if resp := ensureNotLockedByOther(ctx, campaign, record, uid); resp != nil {
		return resp
	}

	txErr := facades.Orm().Transaction(func(tx orm.Query) error {
		if _, err := tx.Where("record_id", record.ID).Delete(&models.RecordValue{}); err != nil {
			return err
		}
		if _, err := tx.Where("record_id", record.ID).Delete(&models.RecordStageKey{}); err != nil {
			return err
		}
		if _, err := tx.Where("record_id", record.ID).Delete(&models.RecordTransition{}); err != nil {
			return err
		}
		_, err := tx.Delete(record)
		return err
	})
	if txErr != nil {
		return serverError(ctx, txErr)
	}
	return ok(ctx, http.Json{"message": "record deleted"})
}

// MarkProcessing marks a record as being worked on. When the campaign disallows
// concurrent edits this also locks the record to the caller.
func (r *RecordController) MarkProcessing(ctx http.Context) http.Response {
	record, campaign, resp := loadRecord(ctx)
	if resp != nil {
		return resp
	}
	uid := currentUserID(ctx)
	if _, err := services.Authorize(uid, campaign.ID, services.PermEdit); err != nil {
		return forbidden(ctx, "you do not have permission to process records")
	}
	if record.Status == models.RecordStatusFinished {
		return badRequest(ctx, "record is already finished")
	}

	if !campaign.AllowConcurrentEdit {
		if record.LockedBy != nil && *record.LockedBy != uid {
			return conflict(ctx, "record is currently locked by another user")
		}
		record.LockedBy = &uid
		record.LockedAt = services.Now()
	}
	record.Status = models.RecordStatusProcessing
	if err := facades.Orm().Query().Save(record); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, record)
}

// Release clears the processing lock/status without advancing the record.
func (r *RecordController) Release(ctx http.Context) http.Response {
	record, campaign, resp := loadRecord(ctx)
	if resp != nil {
		return resp
	}
	uid := currentUserID(ctx)
	if _, err := services.Authorize(uid, campaign.ID, services.PermEdit); err != nil {
		return forbidden(ctx, "you do not have permission to release records")
	}
	if resp := ensureNotLockedByOther(ctx, campaign, record, uid); resp != nil {
		return resp
	}
	record.Status = models.RecordStatusOpen
	record.LockedBy = nil
	record.LockedAt = nil
	if err := facades.Orm().Query().Save(record); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, record)
}

// Advance validates and moves the record to the next stage.
func (r *RecordController) Advance(ctx http.Context) http.Response {
	record, campaign, resp := loadRecord(ctx)
	if resp != nil {
		return resp
	}
	uid := currentUserID(ctx)
	if _, err := services.Authorize(uid, campaign.ID, services.PermEdit); err != nil {
		return forbidden(ctx, "you do not have permission to advance records")
	}
	if record.Status == models.RecordStatusFinished {
		return badRequest(ctx, "record is already finished")
	}
	if resp := ensureNotLockedByOther(ctx, campaign, record, uid); resp != nil {
		return resp
	}

	var body struct {
		Note string `json:"note"`
	}
	_ = ctx.Request().Bind(&body)

	label, err := services.Advance(record, uid, body.Note)
	if err != nil {
		if v, ok := err.(services.ErrValidation); ok {
			return badRequest(ctx, v.Message)
		}
		return serverError(ctx, err)
	}
	if label != "" {
		return conflict(ctx, "a record with the same value already exists for: "+label)
	}
	return ok(ctx, record)
}

// ensureNotLockedByOther blocks edits when another user holds the lock in a
// non-concurrent campaign.
func ensureNotLockedByOther(ctx http.Context, campaign *models.Campaign, record *models.Record, uid uint) http.Response {
	if campaign.AllowConcurrentEdit {
		return nil
	}
	if record.LockedBy != nil && *record.LockedBy != uid {
		return conflict(ctx, "record is currently locked by another user")
	}
	return nil
}

// loadRecord resolves the {record} route param within the {campaign} route param.
func loadRecord(ctx http.Context) (*models.Record, *models.Campaign, http.Response) {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return nil, nil, resp
	}
	id := ctx.Request().RouteInt("record")
	var record models.Record
	if err := facades.Orm().Query().Where("id", id).Where("campaign_id", campaign.ID).First(&record); err != nil {
		return nil, nil, serverError(ctx, err)
	}
	if record.ID == 0 {
		return nil, nil, notFound(ctx, "record not found")
	}
	return &record, campaign, nil
}
