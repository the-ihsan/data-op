package controllers

import (
	"strings"

	"github.com/goravel/framework/contracts/http"
	"github.com/goravel/framework/facades"

	"goravel/app/models"
)

type AuthController struct{}

func NewAuthController() *AuthController {
	return &AuthController{}
}

type registerRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (r *AuthController) Register(ctx http.Context) http.Response {
	var req registerRequest
	if err := ctx.Request().Bind(&req); err != nil {
		return badRequest(ctx, "invalid request body")
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Name == "" || req.Email == "" || len(req.Password) < 6 {
		return badRequest(ctx, "name, email and a password of at least 6 characters are required")
	}

	var existing models.User
	if err := facades.Orm().Query().Where("email", req.Email).First(&existing); err != nil {
		return serverError(ctx, err)
	}
	if existing.ID != 0 {
		return conflict(ctx, "email already registered")
	}

	hashed, err := facades.Hash().Make(req.Password)
	if err != nil {
		return serverError(ctx, err)
	}

	user := models.User{Name: req.Name, Email: req.Email, Password: hashed}
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
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || req.Password == "" {
		return badRequest(ctx, "email and password are required")
	}

	var user models.User
	if err := facades.Orm().Query().Where("email", req.Email).First(&user); err != nil {
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
