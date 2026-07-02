package migrations

import (
	"github.com/goravel/framework/contracts/database/schema"

	"goravel/app/facades"
)

type M20260703000001AddDefaultValueToStageFields struct{}

func (r *M20260703000001AddDefaultValueToStageFields) Signature() string {
	return "20260703000001_add_default_value_to_stage_fields"
}

func (r *M20260703000001AddDefaultValueToStageFields) Up() error {
	if !facades.Schema().HasColumn("stage_fields", "default_value") {
		return facades.Schema().Table("stage_fields", func(table schema.Blueprint) {
			table.Text("default_value").Nullable()
		})
	}
	return nil
}

func (r *M20260703000001AddDefaultValueToStageFields) Down() error {
	if facades.Schema().HasColumn("stage_fields", "default_value") {
		return facades.Schema().Table("stage_fields", func(table schema.Blueprint) {
			table.DropColumn("default_value")
		})
	}
	return nil
}
