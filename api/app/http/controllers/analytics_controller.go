package controllers

import (
	"sort"

	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
	"goravel/app/services"
)

// aggregation scan targets — plain structs; no ORM model required.
type stageAggrRow struct {
	CurrentStageID uint  `gorm:"column:current_stage_id"`
	Count          int64 `gorm:"column:cnt"`
}

type statusAggrRow struct {
	Status string `gorm:"column:status"`
	Count  int64  `gorm:"column:cnt"`
}

type throughputRow struct {
	Date  string `gorm:"column:day"`
	Count int64  `gorm:"column:cnt"`
}

type AnalyticsController struct{}

func NewAnalyticsController() *AnalyticsController {
	return &AnalyticsController{}
}

// Show returns per-campaign metrics: record counts by stage and status, totals, and
// finished-record throughput per day.
func (r *AnalyticsController) Show(ctx http.Context) http.Response {
	campaign, resp := loadCampaign(ctx)
	if resp != nil {
		return resp
	}
	if !services.CanView(currentUserID(ctx), campaign) {
		return forbidden(ctx, "you do not have access to this campaign")
	}

	var stages []models.Stage
	if err := facades.Orm().Query().Where("campaign_id", campaign.ID).Order("position ASC").Get(&stages); err != nil {
		return serverError(ctx, err)
	}

	// Total record count.
	totalRecords, err := facades.Orm().Query().Model(&models.Record{}).Where("campaign_id", campaign.ID).Count()
	if err != nil {
		return serverError(ctx, err)
	}

	// Records per stage — one GROUP BY query instead of a full table scan.
	var stageRows []stageAggrRow
	if err := facades.Orm().Query().
		Model(&models.Record{}).
		Where("campaign_id", campaign.ID).
		SelectRaw("current_stage_id, COUNT(*) as cnt").
		GroupBy("current_stage_id").
		Scan(&stageRows); err != nil {
		return serverError(ctx, err)
	}
	byStageCount := make(map[uint]int64, len(stageRows))
	for _, r := range stageRows {
		byStageCount[r.CurrentStageID] = r.Count
	}

	// Records per status — one GROUP BY query.
	var statusRows []statusAggrRow
	if err := facades.Orm().Query().
		Model(&models.Record{}).
		Where("campaign_id", campaign.ID).
		SelectRaw("status, COUNT(*) as cnt").
		GroupBy("status").
		Scan(&statusRows); err != nil {
		return serverError(ctx, err)
	}
	statusCount := map[string]int64{
		models.RecordStatusOpen:       0,
		models.RecordStatusProcessing: 0,
		models.RecordStatusFinished:   0,
	}
	for _, r := range statusRows {
		statusCount[r.Status] = r.Count
	}

	// Finished-record throughput by day — one GROUP BY query.
	var throughputRows []throughputRow
	if err := facades.Orm().Query().
		Model(&models.Record{}).
		Where("campaign_id", campaign.ID).
		Where("status", models.RecordStatusFinished).
		SelectRaw("DATE(updated_at) as day, COUNT(*) as cnt").
		GroupBy("DATE(updated_at)").
		Scan(&throughputRows); err != nil {
		return serverError(ctx, err)
	}
	throughputSeries := make([]http.Json, 0, len(throughputRows))
	for _, r := range throughputRows {
		throughputSeries = append(throughputSeries, http.Json{"date": r.Date, "count": r.Count})
	}
	sort.Slice(throughputSeries, func(i, j int) bool {
		return throughputSeries[i]["date"].(string) < throughputSeries[j]["date"].(string)
	})

	byStage := make([]http.Json, 0, len(stages))
	for _, s := range stages {
		byStage = append(byStage, http.Json{
			"stage_id": s.ID,
			"name":     s.Name,
			"position": s.Position,
			"count":    byStageCount[s.ID],
		})
	}

	return ok(ctx, http.Json{
		"total_records": totalRecords,
		"by_stage":      byStage,
		"by_status":     statusCount,
		"throughput":    throughputSeries,
	})
}
