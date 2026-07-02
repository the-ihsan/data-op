package migrations

import (
	"github.com/goravel/framework/contracts/database/schema"

	"goravel/app/facades"
)

type M20260702000001CreateUniquenessConflictCounts struct{}

func (r *M20260702000001CreateUniquenessConflictCounts) Signature() string {
	return "20260702000001_create_uniqueness_conflict_counts"
}

func (r *M20260702000001CreateUniquenessConflictCounts) Up() error {
	if !facades.Schema().HasTable("uniqueness_conflict_counts") {
		return facades.Schema().Create("uniqueness_conflict_counts", func(table schema.Blueprint) {
			table.ID()
			table.UnsignedBigInteger("stage_id")
			table.String("constraint_ref")
			table.UnsignedBigInteger("count").Default(0)
			table.Timestamps()
			table.Unique("stage_id", "constraint_ref")
			table.Index("stage_id")
		})
	}
	return nil
}

func (r *M20260702000001CreateUniquenessConflictCounts) Down() error {
	return facades.Schema().DropIfExists("uniqueness_conflict_counts")
}
