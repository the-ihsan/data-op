package migrations

import (
	"github.com/goravel/framework/contracts/database/schema"

	"goravel/app/facades"
)

type M20260101000002CreateCampaignsTables struct{}

func (r *M20260101000002CreateCampaignsTables) Signature() string {
	return "20260101000002_create_campaigns_tables"
}

func (r *M20260101000002CreateCampaignsTables) Up() error {
	if !facades.Schema().HasTable("campaigns") {
		if err := facades.Schema().Create("campaigns", func(table schema.Blueprint) {
			table.ID()
			table.String("name")
			table.Text("description").Nullable()
			table.String("visibility").Default("private")
			table.String("status").Default("draft")
			table.Boolean("allow_concurrent_edit").Default(false)
			table.UnsignedBigInteger("created_by")
			table.Timestamps()
			table.SoftDeletes()
			table.Index("created_by")
		}); err != nil {
			return err
		}
	}

	if !facades.Schema().HasTable("campaign_members") {
		if err := facades.Schema().Create("campaign_members", func(table schema.Blueprint) {
			table.ID()
			table.UnsignedBigInteger("campaign_id")
			table.UnsignedBigInteger("user_id")
			table.String("role").Default("member")
			table.Boolean("can_add").Default(false)
			table.Boolean("can_edit").Default(false)
			table.Boolean("can_delete").Default(false)
			table.Timestamps()
			table.Unique("campaign_id", "user_id")
		}); err != nil {
			return err
		}
	}

	return nil
}

func (r *M20260101000002CreateCampaignsTables) Down() error {
	if err := facades.Schema().DropIfExists("campaign_members"); err != nil {
		return err
	}
	return facades.Schema().DropIfExists("campaigns")
}
