package controllers

import (
	"sort"

	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
	"goravel/app/services"
)

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

	var records []models.Record
	if err := facades.Orm().Query().Where("campaign_id", campaign.ID).Get(&records); err != nil {
		return serverError(ctx, err)
	}

	stageName := map[uint]string{}
	for _, s := range stages {
		stageName[s.ID] = s.Name
	}

	byStageCount := map[uint]int{}
	statusCount := map[string]int{
		models.RecordStatusOpen:       0,
		models.RecordStatusProcessing: 0,
		models.RecordStatusFinished:   0,
	}
	throughput := map[string]int{}

	for _, rec := range records {
		byStageCount[rec.CurrentStageID]++
		statusCount[rec.Status]++
		if rec.Status == models.RecordStatusFinished && rec.UpdatedAt != nil {
			throughput[rec.UpdatedAt.ToDateString()]++
		}
	}

	byStage := make([]http.Json, 0, len(stages))
	for _, s := range stages {
		byStage = append(byStage, http.Json{
			"stage_id": s.ID,
			"name":     s.Name,
			"position": s.Position,
			"count":    byStageCount[s.ID],
		})
	}

	throughputSeries := make([]http.Json, 0, len(throughput))
	for date, count := range throughput {
		throughputSeries = append(throughputSeries, http.Json{"date": date, "count": count})
	}
	sort.Slice(throughputSeries, func(i, j int) bool {
		return throughputSeries[i]["date"].(string) < throughputSeries[j]["date"].(string)
	})

	return ok(ctx, http.Json{
		"total_records": len(records),
		"by_stage":      byStage,
		"by_status":     statusCount,
		"throughput":    throughputSeries,
	})
}
