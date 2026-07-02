package migrations

import (
	"github.com/goravel/framework/contracts/database/schema"

	"goravel/app/facades"
)

type M20260101000003CreateStagesTables struct{}

func (r *M20260101000003CreateStagesTables) Signature() string {
	return "20260101000003_create_stages_tables"
}

func (r *M20260101000003CreateStagesTables) Up() error {
	if !facades.Schema().HasTable("stages") {
		if err := facades.Schema().Create("stages", func(table schema.Blueprint) {
			table.ID()
			table.UnsignedBigInteger("campaign_id")
			table.String("name")
			table.Integer("position").Default(0)
			table.Timestamps()
			table.Index("campaign_id")
			table.Unique("campaign_id", "position")
		}); err != nil {
			return err
		}
	}

	if !facades.Schema().HasTable("stage_fields") {
		if err := facades.Schema().Create("stage_fields", func(table schema.Blueprint) {
			table.ID()
			table.UnsignedBigInteger("stage_id")
			table.String("key")
			table.String("label")
			table.String("type")
			table.Boolean("required").Default(false)
			table.Boolean("is_unique").Default(false)
			table.Integer("max_count").Default(1)
			table.Text("options").Nullable()
			table.String("prev_stage_key").Nullable()
			table.Integer("position").Default(0)
			table.Timestamps()
			table.Index("stage_id")
			table.Unique("stage_id", "key")
		}); err != nil {
			return err
		}
	}

	if !facades.Schema().HasTable("stage_unique_constraints") {
		if err := facades.Schema().Create("stage_unique_constraints", func(table schema.Blueprint) {
			table.ID()
			table.UnsignedBigInteger("stage_id")
			table.Text("field_keys")
			table.Timestamps()
			table.Index("stage_id")
		}); err != nil {
			return err
		}
	}

	return nil
}

func (r *M20260101000003CreateStagesTables) Down() error {
	if err := facades.Schema().DropIfExists("stage_unique_constraints"); err != nil {
		return err
	}
	if err := facades.Schema().DropIfExists("stage_fields"); err != nil {
		return err
	}
	return facades.Schema().DropIfExists("stages")
}
