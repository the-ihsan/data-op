package routes

import (
	"github.com/goravel/framework/contracts/route"

	"goravel/app/facades"
	"goravel/app/http/controllers"
	"goravel/app/http/middleware"
)

func Api() {
	auth := controllers.NewAuthController()
	campaigns := controllers.NewCampaignController()
	members := controllers.NewCampaignMemberController()
	stages := controllers.NewStageController()
	fields := controllers.NewStageFieldController()
	constraints := controllers.NewStageConstraintController()
	records := controllers.NewRecordController()
	values := controllers.NewRecordValueController()
	analytics := controllers.NewAnalyticsController()

	// Public authentication endpoints.
	facades.Route().Prefix("api/v1").Group(func(router route.Router) {
		router.Post("auth/register", auth.Register)
		router.Post("auth/login", auth.Login)
	})

	// Authenticated endpoints.
	facades.Route().Prefix("api/v1").Middleware(middleware.Auth()).Group(func(router route.Router) {
		router.Get("auth/me", auth.Me)
		router.Post("auth/logout", auth.Logout)

		// Campaigns
		router.Get("campaigns", campaigns.Index)
		router.Post("campaigns", campaigns.Store)
		router.Get("campaigns/{campaign}", campaigns.Show)
		router.Put("campaigns/{campaign}", campaigns.Update)
		router.Delete("campaigns/{campaign}", campaigns.Destroy)

		// Members (owner-managed RBAC)
		router.Get("campaigns/{campaign}/members", members.Index)
		router.Post("campaigns/{campaign}/members", members.Store)
		router.Put("campaigns/{campaign}/members/{member}", members.Update)
		router.Delete("campaigns/{campaign}/members/{member}", members.Destroy)

		// Stages
		router.Get("campaigns/{campaign}/stages", stages.Index)
		router.Post("campaigns/{campaign}/stages", stages.Store)
		router.Put("campaigns/{campaign}/stages/{stage}", stages.Update)
		router.Delete("campaigns/{campaign}/stages/{stage}", stages.Destroy)

		// Stage fields
		router.Post("campaigns/{campaign}/stages/{stage}/fields", fields.Store)
		router.Put("campaigns/{campaign}/stages/{stage}/fields/{field}", fields.Update)
		router.Delete("campaigns/{campaign}/stages/{stage}/fields/{field}", fields.Destroy)

		// Composite unique constraints
		router.Post("campaigns/{campaign}/stages/{stage}/constraints", constraints.Store)
		router.Delete("campaigns/{campaign}/stages/{stage}/constraints/{constraint}", constraints.Destroy)

		// Records and the stage data-flow
		router.Get("campaigns/{campaign}/records", records.Index)
		router.Post("campaigns/{campaign}/records", records.Store)
		router.Get("campaigns/{campaign}/records/{record}", records.Show)
		router.Delete("campaigns/{campaign}/records/{record}", records.Destroy)
		router.Get("campaigns/{campaign}/records/{record}/values", values.Index)
		router.Put("campaigns/{campaign}/records/{record}/values", values.Update)
		router.Get("campaigns/{campaign}/records/{record}/history", records.History)
		router.Post("campaigns/{campaign}/records/{record}/processing", records.MarkProcessing)
		router.Post("campaigns/{campaign}/records/{record}/release", records.Release)
		router.Post("campaigns/{campaign}/records/{record}/advance", records.Advance)

		// Analytics
		router.Get("campaigns/{campaign}/analytics", analytics.Show)
	})
}
