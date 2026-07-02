package migrations

import (
	"github.com/goravel/framework/contracts/database/schema"

	"goravel/app/facades"
)

type M20260101000004CreateRecordsTables struct{}

func (r *M20260101000004CreateRecordsTables) Signature() string {
	return "20260101000004_create_records_tables"
}

func (r *M20260101000004CreateRecordsTables) Up() error {
	if !facades.Schema().HasTable("records") {
		if err := facades.Schema().Create("records", func(table schema.Blueprint) {
			table.ID()
			table.UnsignedBigInteger("campaign_id")
			table.UnsignedBigInteger("current_stage_id")
			table.String("status").Default("open")
			table.UnsignedBigInteger("locked_by").Nullable()
			table.DateTimeTz("locked_at").Nullable()
			table.UnsignedBigInteger("created_by")
			table.Timestamps()
			table.Index("campaign_id")
			table.Index("current_stage_id")
		}); err != nil {
			return err
		}
	}

	if !facades.Schema().HasTable("record_values") {
		if err := facades.Schema().Create("record_values", func(table schema.Blueprint) {
			table.ID()
			table.UnsignedBigInteger("record_id")
			table.UnsignedBigInteger("stage_id")
			table.UnsignedBigInteger("field_id")
			table.String("field_key")
			table.Text("value").Nullable()
			table.Integer("value_index").Default(0)
			table.Timestamps()
			table.Index("record_id", "stage_id")
		}); err != nil {
			return err
		}
	}

	if !facades.Schema().HasTable("record_stage_keys") {
		if err := facades.Schema().Create("record_stage_keys", func(table schema.Blueprint) {
			table.ID()
			table.UnsignedBigInteger("record_id")
			table.UnsignedBigInteger("stage_id")
			table.String("constraint_ref")
			table.String("normalized_hash")
			table.Timestamps()
			table.Index("record_id")
			table.Unique("stage_id", "constraint_ref", "normalized_hash")
		}); err != nil {
			return err
		}
	}

	if !facades.Schema().HasTable("record_transitions") {
		if err := facades.Schema().Create("record_transitions", func(table schema.Blueprint) {
			table.ID()
			table.UnsignedBigInteger("record_id")
			table.UnsignedBigInteger("from_stage_id").Nullable()
			table.UnsignedBigInteger("to_stage_id")
			table.UnsignedBigInteger("moved_by")
			table.Text("note").Nullable()
			table.DateTimeTz("created_at").UseCurrent()
			table.Index("record_id")
		}); err != nil {
			return err
		}
	}

	return nil
}

func (r *M20260101000004CreateRecordsTables) Down() error {
	for _, t := range []string{"record_transitions", "record_stage_keys", "record_values", "records"} {
		if err := facades.Schema().DropIfExists(t); err != nil {
			return err
		}
	}
	return nil
}
