package providers

import (
	"github.com/goravel/framework/contracts/database/seeder"
	"github.com/goravel/framework/contracts/foundation"

	"goravel/app/facades"
	"goravel/database/seeders"
)

type AppServiceProvider struct{}

func (r *AppServiceProvider) Register(app foundation.Application) {}

func (r *AppServiceProvider) Boot(app foundation.Application) {
	facades.Seeder().Register([]seeder.Seeder{
		&seeders.DatabaseSeeder{},
	})
}
