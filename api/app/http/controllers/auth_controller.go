package controllers

import (
	"errors"
	"strings"

	"github.com/goravel/framework/contracts/http"
	frameworkerrors "github.com/goravel/framework/errors"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
)

type AuthController struct{}

func NewAuthController() *AuthController {
	return &AuthController{}
}

type registerRequest struct {
	Name     string `json:"name"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (r *AuthController) Register(ctx http.Context) http.Response {
	var req registerRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	if req.Name == "" || req.Username == "" || len(req.Password) < 6 {
		return badRequest(ctx, "name, username and a password of at least 6 characters are required")
	}

	var existing models.User
	if err := facades.Orm().Query().Where("username", req.Username).First(&existing); err != nil {
		return serverError(ctx, err)
	}
	if existing.ID != 0 {
		return conflict(ctx, "username already taken")
	}

	hashed, err := facades.Hash().Make(req.Password)
	if err != nil {
		return serverError(ctx, err)
	}

	user := models.User{Name: req.Name, Username: req.Username, Password: hashed}
	if err := facades.Orm().Query().Create(&user); err != nil {
		return serverError(ctx, err)
	}

	token, err := facades.Auth(ctx).Login(&user)
	if err != nil {
		return serverError(ctx, err)
	}

	return created(ctx, http.Json{"user": user, "token": token})
}

func (r *AuthController) Login(ctx http.Context) http.Response {
	var req loginRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	if req.Username == "" || req.Password == "" {
		return badRequest(ctx, "username and password are required")
	}

	var user models.User
	if err := facades.Orm().Query().Where("username", req.Username).First(&user); err != nil {
		return serverError(ctx, err)
	}
	if user.ID == 0 || !facades.Hash().Check(req.Password, user.Password) {
		return unauthorized(ctx, "invalid credentials")
	}

	token, err := facades.Auth(ctx).Login(&user)
	if err != nil {
		return serverError(ctx, err)
	}

	return ok(ctx, http.Json{"user": user, "token": token})
}

// Refresh exchanges a valid-or-expired (but within the refresh window) JWT for
// a fresh one. Registered as a public route because the Auth middleware rejects
// expired tokens outright; the token is parsed manually here instead.
func (r *AuthController) Refresh(ctx http.Context) http.Response {
	token := ctx.Request().Header("Authorization")
	if token == "" {
		return unauthorized(ctx, "missing authorization token")
	}
	if _, err := facades.Auth(ctx).Parse(token); err != nil && !errors.Is(err, frameworkerrors.AuthTokenExpired) {
		return unauthorized(ctx, "invalid token")
	}
	newToken, err := facades.Auth(ctx).Refresh()
	if err != nil {
		return unauthorized(ctx, "session expired, please log in again")
	}
	return ok(ctx, http.Json{"token": newToken})
}

type updateProfileRequest struct {
	Name            string `json:"name"`
	Email           string `json:"email"`
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// UpdateMe updates the authenticated user's profile (name, email and,
// optionally, the password after verifying the current one).
func (r *AuthController) UpdateMe(ctx http.Context) http.Response {
	var user models.User
	if err := facades.Auth(ctx).User(&user); err != nil || user.ID == 0 {
		return unauthorized(ctx, "not authenticated")
	}

	var req updateProfileRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.TrimSpace(req.Email)
	if req.Name == "" {
		return badRequest(ctx, "name is required")
	}

	user.Name = req.Name
	user.Email = req.Email

	if req.NewPassword != "" {
		if len(req.NewPassword) < 6 {
			return badRequest(ctx, "new password must be at least 6 characters")
		}
		if !facades.Hash().Check(req.CurrentPassword, user.Password) {
			return badRequest(ctx, "current password is incorrect")
		}
		hashed, err := facades.Hash().Make(req.NewPassword)
		if err != nil {
			return serverError(ctx, err)
		}
		user.Password = hashed
	}

	if err := facades.Orm().Query().Save(&user); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, user)
}

func (r *AuthController) Me(ctx http.Context) http.Response {
	var user models.User
	if err := facades.Auth(ctx).User(&user); err != nil {
		return unauthorized(ctx, "not authenticated")
	}
	return ok(ctx, user)
}

func (r *AuthController) Logout(ctx http.Context) http.Response {
	if err := facades.Auth(ctx).Logout(); err != nil {
		return serverError(ctx, err)
	}
	return ok(ctx, http.Json{"message": "logged out"})
}
