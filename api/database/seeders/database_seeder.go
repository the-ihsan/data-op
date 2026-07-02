package seeders

import (
	"encoding/json"

	"github.com/goravel/framework/facades"

	"goravel/app/models"
)

type DatabaseSeeder struct{}

func (s *DatabaseSeeder) Signature() string {
	return "DatabaseSeeder"
}

// Run seeds a demo user and a fully-defined campaign so the app is explorable
// immediately after `go run . artisan db:seed`.
func (s *DatabaseSeeder) Run() error {
	user, err := s.ensureUser()
	if err != nil {
		return err
	}

	// Skip if the demo campaign already exists.
	var existing models.Campaign
	if err := facades.Orm().Query().Where("name", "Customer Feedback").First(&existing); err != nil {
		return err
	}
	if existing.ID != 0 {
		return nil
	}

	campaign := models.Campaign{
		Name:                "Customer Feedback",
		Description:         "Collect, triage, and resolve customer feedback.",
		Visibility:          models.VisibilityPrivate,
		Status:              models.CampaignStatusActive,
		AllowConcurrentEdit: false,
		CreatedBy:           user.ID,
	}
	if err := facades.Orm().Query().Create(&campaign); err != nil {
		return err
	}
	owner := models.CampaignMember{
		CampaignID: campaign.ID, UserID: user.ID, Role: models.RoleOwner,
		CanAdd: true, CanEdit: true, CanDelete: true,
	}
	if err := facades.Orm().Query().Create(&owner); err != nil {
		return err
	}

	// Stage 1: Intake
	intake, err := s.stage(campaign.ID, "Intake", 0)
	if err != nil {
		return err
	}
	if err := s.fields(intake.ID, []models.StageField{
		{Key: "email", Label: "Customer Email", Type: models.FieldTypeText, Required: true, IsUnique: true, MaxCount: 1, Position: 0},
		{Key: "subject", Label: "Subject", Type: models.FieldTypeText, Required: true, MaxCount: 1, Position: 1},
		{Key: "details", Label: "Details", Type: models.FieldTypeTextarea, MaxCount: 1, Position: 2},
		{Key: "priority", Label: "Priority", Type: models.FieldTypeSelect, Options: opts("low", "medium", "high"), MaxCount: 1, Position: 3},
	}); err != nil {
		return err
	}

	// Stage 2: Triage (inherits email + priority)
	triage, err := s.stage(campaign.ID, "Triage", 1)
	if err != nil {
		return err
	}
	if err := s.fields(triage.ID, []models.StageField{
		{Key: "email", Label: "Customer Email", Type: models.FieldTypeText, PrevStageKey: "email", MaxCount: 1, Position: 0},
		{Key: "category", Label: "Category", Type: models.FieldTypeSelect, Options: opts("bug", "feature", "billing", "other"), Required: true, MaxCount: 1, Position: 1},
		{Key: "assignee", Label: "Assignee", Type: models.FieldTypeText, MaxCount: 1, Position: 2},
	}); err != nil {
		return err
	}

	// Stage 3: Resolution
	resolution, err := s.stage(campaign.ID, "Resolution", 2)
	if err != nil {
		return err
	}
	if err := s.fields(resolution.ID, []models.StageField{
		{Key: "email", Label: "Customer Email", Type: models.FieldTypeText, PrevStageKey: "email", MaxCount: 1, Position: 0},
		{Key: "outcome", Label: "Outcome", Type: models.FieldTypeSelect, Options: opts("resolved", "wont_fix", "duplicate"), Required: true, MaxCount: 1, Position: 1},
		{Key: "notes", Label: "Resolution Notes", Type: models.FieldTypeTextarea, MaxCount: 1, Position: 2},
	}); err != nil {
		return err
	}

	return nil
}

func (s *DatabaseSeeder) ensureUser() (*models.User, error) {
	var user models.User
	if err := facades.Orm().Query().Where("username", "alice").First(&user); err != nil {
		return nil, err
	}
	if user.ID != 0 {
		return &user, nil
	}
	hashed, err := facades.Hash().Make("password")
	if err != nil {
		return nil, err
	}
	user = models.User{Name: "Alice Demo", Username: "alice", Password: hashed}
	if err := facades.Orm().Query().Create(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *DatabaseSeeder) stage(campaignID uint, name string, position int) (*models.Stage, error) {
	stage := models.Stage{CampaignID: campaignID, Name: name, Position: position}
	if err := facades.Orm().Query().Create(&stage); err != nil {
		return nil, err
	}
	return &stage, nil
}

func (s *DatabaseSeeder) fields(stageID uint, fields []models.StageField) error {
	for i := range fields {
		fields[i].StageID = stageID
		if err := facades.Orm().Query().Create(&fields[i]); err != nil {
			return err
		}
	}
	return nil
}

func opts(values ...string) string {
	b, _ := json.Marshal(values)
	return string(b)
}
