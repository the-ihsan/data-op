package controllers

import (
	"errors"
	"strconv"

	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/services"
)

// currentUserID returns the authenticated user's id from the JWT guard.
func currentUserID(ctx http.Context) uint {
	id, err := facades.Auth(ctx).ID()
	if err != nil || id == "" {
		return 0
	}
	n, err := strconv.ParseUint(id, 10, 64)
	if err != nil {
		return 0
	}
	return uint(n)
}

func ok(ctx http.Context, data any) http.Response {
	return ctx.Response().Json(http.StatusOK, http.Json{"data": data})
}

func created(ctx http.Context, data any) http.Response {
	return ctx.Response().Json(http.StatusCreated, http.Json{"data": data})
}

func badRequest(ctx http.Context, msg string) http.Response {
	return ctx.Response().Json(http.StatusBadRequest, http.Json{"error": msg})
}

func unauthorized(ctx http.Context, msg string) http.Response {
	return ctx.Response().Json(http.StatusUnauthorized, http.Json{"error": msg})
}

func forbidden(ctx http.Context, msg string) http.Response {
	return ctx.Response().Json(http.StatusForbidden, http.Json{"error": msg})
}

func notFound(ctx http.Context, msg string) http.Response {
	return ctx.Response().Json(http.StatusNotFound, http.Json{"error": msg})
}

func conflict(ctx http.Context, msg string) http.Response {
	return ctx.Response().Json(http.StatusConflict, http.Json{"error": msg})
}

func serverError(ctx http.Context, err error) http.Response {
	facades.Log().Error(err)
	return ctx.Response().Json(http.StatusInternalServerError, http.Json{"error": "internal server error"})
}

// validationOrServerError maps a services.ErrValidation to a 400 with its
// message, and anything else to a 500.
func validationOrServerError(ctx http.Context, err error) http.Response {
	var v services.ErrValidation
	if errors.As(err, &v) {
		return badRequest(ctx, v.Message)
	}
	return serverError(ctx, err)
}

// validationMessage extracts the user-facing message from a services.ErrValidation,
// falling back to a generic label for unexpected errors.
func validationMessage(err error) string {
	var v services.ErrValidation
	if errors.As(err, &v) {
		return v.Message
	}
	return "internal error"
}
