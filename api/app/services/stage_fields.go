package services

import (
	"sort"

	"goravel/app/models"
)

// SortStageFields sorts fields by position ascending (in place).
func SortStageFields(fields []models.StageField) {
	sort.Slice(fields, func(i, j int) bool {
		return fields[i].Position < fields[j].Position
	})
}
