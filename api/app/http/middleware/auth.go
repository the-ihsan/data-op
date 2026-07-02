package middleware

import (
	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"
)

// Auth validates the JWT in the Authorization header. On success the request
// proceeds with an authenticated guard (facades.Auth(ctx).ID()/User() available).
func Auth() http.Middleware {
	return func(ctx http.Context) {
		token := ctx.Request().Header("Authorization")
		if token == "" {
			ctx.Response().Json(http.StatusUnauthorized, http.Json{"error": "missing authorization token"}).Abort()
			return
		}

		if _, err := facades.Auth(ctx).Parse(token); err != nil {
			ctx.Response().Json(http.StatusUnauthorized, http.Json{"error": "invalid or expired token"}).Abort()
			return
		}

		ctx.Request().Next()
	}
}
