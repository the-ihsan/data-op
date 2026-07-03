package services

import (
	"errors"
	"testing"

	"goravel/app/models"
)

func textField(key string, required bool) models.StageField {
	return models.StageField{Key: key, Label: key, Type: models.FieldTypeText, Required: required, MaxCount: 1}
}

func TestNormalizeStageValuesDiscardsUnknownKey(t *testing.T) {
	fields := []models.StageField{textField("name", false)}
	out, err := NormalizeStageValues(fields, map[string][]string{"name": {"ok"}, "bogus": {"x"}}, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out["name"][0] != "ok" {
		t.Fatalf("expected name value, got %#v", out)
	}
	if _, ok := out["bogus"]; ok {
		t.Fatal("expected unknown key to be discarded")
	}
}

func TestNormalizeStageValuesDropsBlankEntries(t *testing.T) {
	fields := []models.StageField{textField("name", false)}
	out, err := NormalizeStageValues(fields, map[string][]string{"name": {"  ", ""}}, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := out["name"]; ok {
		t.Fatalf("expected blank-only field to be absent, got %#v", out)
	}
}

func TestNormalizeStageValuesTypeChecks(t *testing.T) {
	fields := []models.StageField{
		{Key: "n", Label: "n", Type: models.FieldTypeNumber, MaxCount: 1},
		{Key: "d", Label: "d", Type: models.FieldTypeDate, MaxCount: 1},
		{Key: "b", Label: "b", Type: models.FieldTypeBoolean, MaxCount: 1},
	}
	if _, err := NormalizeStageValues(fields, map[string][]string{"n": {"abc"}}, ""); err == nil {
		t.Fatal("expected number validation error")
	}
	if _, err := NormalizeStageValues(fields, map[string][]string{"d": {"03-07-2026"}}, ""); err == nil {
		t.Fatal("expected date validation error")
	}
	out, err := NormalizeStageValues(fields, map[string][]string{"n": {"42"}, "d": {"2026-07-03"}, "b": {"YES"}}, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out["b"][0] != "true" {
		t.Fatalf("expected normalized boolean, got %q", out["b"][0])
	}
}

func TestNormalizeStageValuesSelectOptionsAndMaxCount(t *testing.T) {
	fields := []models.StageField{
		{Key: "s", Label: "s", Type: models.FieldTypeSelect, MaxCount: 1, Options: `["a","b"]`},
		{Key: "tags", Label: "tags", Type: models.FieldTypeText, MaxCount: 2},
	}
	if _, err := NormalizeStageValues(fields, map[string][]string{"s": {"z"}}, ""); err == nil {
		t.Fatal("expected invalid option error")
	}
	if _, err := NormalizeStageValues(fields, map[string][]string{"tags": {"1", "2", "3"}}, ""); err == nil {
		t.Fatal("expected max_count error")
	}
}

func TestNormalizeStageValuesRunsSanitizeScript(t *testing.T) {
	fields := []models.StageField{textField("email", false)}
	script := "def sanitize(data):\n    data[\"email\"] = data[\"email\"].lower()\n    return data\n"
	out, err := NormalizeStageValues(fields, map[string][]string{"email": {"A@B.C"}}, script)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out["email"][0] != "a@b.c" {
		t.Fatalf("expected sanitized value, got %q", out["email"][0])
	}
}

func TestValidateRequired(t *testing.T) {
	fields := []models.StageField{textField("name", true), textField("notes", false)}
	if err := ValidateRequired(fields, map[string][]string{"notes": {"x"}}); err == nil {
		t.Fatal("expected required error for missing name")
	}
	if err := ValidateRequired(fields, map[string][]string{"name": {"x"}}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPrepareStageValuesEnforcesRequired(t *testing.T) {
	fields := []models.StageField{textField("name", true)}
	// Blank-only input normalizes to empty, so the required check must reject it.
	_, err := PrepareStageValues(fields, map[string][]string{"name": {"  "}}, "")
	var ve ErrValidation
	if !errors.As(err, &ve) {
		t.Fatalf("expected ErrValidation, got %v", err)
	}
	out, err := PrepareStageValues(fields, map[string][]string{"name": {" ok "}}, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out["name"][0] != "ok" {
		t.Fatalf("expected trimmed value, got %q", out["name"][0])
	}
}
