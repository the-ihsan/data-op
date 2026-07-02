package controllers

import (
	"strings"

	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
)

type UserController struct{}

func NewUserController() *UserController {
	return &UserController{}
}

// Search returns users matching q (username or name), for member pickers.
func (r *UserController) Search(ctx http.Context) http.Response {
	q := strings.TrimSpace(ctx.Request().Query("q", ""))
	if len(q) < 2 {
		return ok(ctx, []models.User{})
	}

	pattern := "%" + q + "%"
	var users []models.User
	if err := facades.Orm().Query().
		Where("username LIKE ? OR name LIKE ?", pattern, pattern).
		OrderBy("username").
		Limit(20).
		Select("id", "name", "username").
		Get(&users); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, users)
}
