package migrations

import (
	"github.com/goravel/framework/contracts/database/schema"

	"goravel/app/facades"
)

type M20260702000002AddSanitizeEntryToStages struct{}

func (r *M20260702000002AddSanitizeEntryToStages) Signature() string {
	return "20260702000002_add_sanitize_entry_to_stages"
}

func (r *M20260702000002AddSanitizeEntryToStages) Up() error {
	if !facades.Schema().HasColumn("stages", "sanitize_entry") {
		return facades.Schema().Table("stages", func(table schema.Blueprint) {
			table.Text("sanitize_entry").Nullable()
		})
	}
	return nil
}

func (r *M20260702000002AddSanitizeEntryToStages) Down() error {
	if facades.Schema().HasColumn("stages", "sanitize_entry") {
		return facades.Schema().Table("stages", func(table schema.Blueprint) {
			table.DropColumn("sanitize_entry")
		})
	}
	return nil
}
