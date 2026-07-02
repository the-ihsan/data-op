package bootstrap

import (
	"github.com/goravel/framework/contracts/database/schema"

	"goravel/database/migrations"
)

func Migrations() []schema.Migration {
	return []schema.Migration{
		&migrations.M20210101000001CreateJobsTable{},
		&migrations.M20260101000001CreateUsersTable{},
		&migrations.M20260101000002CreateCampaignsTables{},
		&migrations.M20260101000003CreateStagesTables{},
		&migrations.M20260101000004CreateRecordsTables{},
		&migrations.M20260702000001CreateUniquenessConflictCounts{},
		&migrations.M20260702000002AddSanitizeEntryToStages{},
	}
}
