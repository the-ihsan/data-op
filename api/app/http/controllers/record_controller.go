package controllers

import (
	"errors"
	"strings"

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

// Index lists records for a campaign with pagination.
// Query params: stage, status, mine (true/false), page (default 1), per_page (default 50, max 200).
// Returns { records, total, page, per_page }; records are ordered id ASC so new entries appear last.
func (r *RecordController) Index(ctx http.Context) http.Response {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return resp
	}
	uid := currentUserID(ctx)
	if !services.CanView(uid, campaign) {
		return forbidden(ctx, "you do not have access to this campaign")
	}

	applyFilters := func(q orm.Query) orm.Query {
		q = q.Where("campaign_id", campaign.ID)
		if stageID := ctx.Request().QueryInt("stage"); stageID > 0 {
			q = q.Where("current_stage_id", stageID)
		}
		if status := ctx.Request().Query("status"); status != "" {
			q = q.Where("status", status)
		}
		if ctx.Request().Query("mine") == "true" {
			q = q.Where("created_by = ? OR id IN (SELECT record_id FROM record_transitions WHERE moved_by = ?)", uid, uid)
		}
		return q
	}

	var total int64
	total, err := applyFilters(facades.Orm().Query().Model(&models.Record{})).Count()
	if err != nil {
		return serverError(ctx, err)
	}

	page := ctx.Request().QueryInt("page")
	if page < 1 {
		page = 1
	}
	perPage := ctx.Request().QueryInt("per_page")
	if perPage < 1 {
		perPage = 50
	}
	if perPage > 200 {
		perPage = 200
	}
	offset := (page - 1) * perPage

	var records []models.Record
	if err := applyFilters(facades.Orm().Query()).With("Values").Order("id ASC").Offset(offset).Limit(perPage).Get(&records); err != nil {
		return serverError(ctx, err)
	}

	return ok(ctx, http.Json{
		"records":  records,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
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

// History returns the stage-transition audit trail for a record with resolved
// user and stage names, ordered oldest-first.
func (r *RecordController) History(ctx http.Context) http.Response {
	record, campaign, resp := loadRecord(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanView(currentUserID(ctx), campaign) {
		return forbidden(ctx, "you do not have access to this campaign")
	}

	var transitions []models.RecordTransition
	if err := facades.Orm().Query().Where("record_id", record.ID).Order("created_at ASC").Get(&transitions); err != nil {
		return serverError(ctx, err)
	}

	// Collect unique user IDs and stage IDs for bulk resolution.
	userIDSet := map[uint]bool{}
	stageIDSet := map[uint]bool{}
	for _, t := range transitions {
		userIDSet[t.MovedBy] = true
		if t.FromStageID != nil {
			stageIDSet[*t.FromStageID] = true
		}
		stageIDSet[t.ToStageID] = true
	}

	userMap := map[uint]models.User{}
	if len(userIDSet) > 0 {
		uids := make([]any, 0, len(userIDSet))
		for id := range userIDSet {
			uids = append(uids, id)
		}
		var users []models.User
		if err := facades.Orm().Query().WhereIn("id", uids).Get(&users); err != nil {
			return serverError(ctx, err)
		}
		for _, u := range users {
			userMap[u.ID] = u
		}
	}

	stageMap := map[uint]models.Stage{}
	if len(stageIDSet) > 0 {
		sids := make([]any, 0, len(stageIDSet))
		for id := range stageIDSet {
			sids = append(sids, id)
		}
		var stages []models.Stage
		if err := facades.Orm().Query().WhereIn("id", sids).Get(&stages); err != nil {
			return serverError(ctx, err)
		}
		for _, s := range stages {
			stageMap[s.ID] = s
		}
	}

	type UserInfo struct {
		ID       uint   `json:"id"`
		Name     string `json:"name"`
		Username string `json:"username"`
	}
	type StageInfo struct {
		ID   uint   `json:"id"`
		Name string `json:"name"`
	}
	type Entry struct {
		ID        uint       `json:"id"`
		FromStage *StageInfo `json:"from_stage"`
		ToStage   StageInfo  `json:"to_stage"`
		By        UserInfo   `json:"by"`
		Note      string     `json:"note"`
		CreatedAt string     `json:"created_at"`
	}

	entries := make([]Entry, 0, len(transitions))
	for _, t := range transitions {
		u := userMap[t.MovedBy]
		toS := stageMap[t.ToStageID]
		e := Entry{
			ID:      t.ID,
			ToStage: StageInfo{ID: toS.ID, Name: toS.Name},
			By:      UserInfo{ID: u.ID, Name: u.Name, Username: u.Username},
			Note:    t.Note,
		}
		if t.CreatedAt != nil {
			e.CreatedAt = t.CreatedAt.ToDateTimeString()
		}
		if t.FromStageID != nil {
			s := stageMap[*t.FromStageID]
			e.FromStage = &StageInfo{ID: s.ID, Name: s.Name}
		}
		entries = append(entries, e)
	}

	return ok(ctx, http.Json{"transitions": entries})
}

// BulkImport creates one record per entry in the submitted values list, all
// placed at the campaign's first stage. The first stage must have exactly one
// field. Each empty/whitespace-only entry is silently skipped. The response
// reports how many succeeded and, for those that failed, their 0-based index
// in the submitted array together with the error reason.
func (r *RecordController) BulkImport(ctx http.Context) http.Response {
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

	fields, err := services.StageFields(facades.Orm().Query(), firstStage.ID)
	if err != nil {
		return serverError(ctx, err)
	}
	if len(fields) != 1 {
		return badRequest(ctx, "bulk import requires the first stage to have exactly one field")
	}
	field := fields[0]

	var body struct {
		Values []string `json:"values"`
	}
	if err := ctx.Request().Bind(&body); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	if len(body.Values) == 0 {
		return badRequest(ctx, "no values provided")
	}

	// Pre-load uniqueness targets once for the whole import — EnforceUniqueness
	// would otherwise re-query the stage schema on every iteration.
	checker, err := services.NewBulkUniquenessChecker(facades.Orm().Query(), firstStage.ID)
	if err != nil {
		return serverError(ctx, err)
	}

	type FailedEntry struct {
		Index int    `json:"index"`
		Error string `json:"error"`
	}
	var failed []FailedEntry
	succeeded := 0

	for i, val := range body.Values {
		val = strings.TrimSpace(val)
		if val == "" {
			continue
		}

		txErr := facades.Orm().Transaction(func(tx orm.Query) error {
			record := models.Record{
				CampaignID:     campaign.ID,
				CurrentStageID: firstStage.ID,
				Status:         models.RecordStatusOpen,
				CreatedBy:      uid,
			}
			if err := tx.Create(&record); err != nil {
				return err
			}
			transition := models.RecordTransition{
				RecordID:  record.ID,
				ToStageID: firstStage.ID,
				MovedBy:   uid,
				Note:      "created",
			}
			if err := tx.Create(&transition); err != nil {
				return err
			}
			rawValues := map[string][]string{field.Key: {val}}
			valuesByKey, err := services.StoreValues(tx, record.ID, firstStage.ID, fields, rawValues)
			if err != nil {
				return err
			}
			label, err := checker.Enforce(tx, record.ID, valuesByKey)
			if err != nil {
				return err
			}
			if label != "" {
				return services.ErrUniquenessConflict{Label: label}
			}
			return nil
		})

		if txErr != nil {
			msg := "internal error"
			var ve services.ErrValidation
			var uc services.ErrUniquenessConflict
			if errors.As(txErr, &ve) {
				msg = ve.Message
			} else if errors.As(txErr, &uc) {
				msg = "duplicate value: " + uc.Label
			}
			failed = append(failed, FailedEntry{Index: i, Error: msg})
		} else {
			succeeded++
		}
	}

	return ok(ctx, http.Json{
		"succeeded": succeeded,
		"failed":    failed,
	})
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
