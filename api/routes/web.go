package routes

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/goravel/framework/contracts/http"

	"goravel/app/facades"
)

const spaRoot = "./public"

func Web() {
	if _, err := os.Stat(spaRoot + "/index.html"); err != nil {
		return
	}

	// Gin Static("/", …) conflicts with /api routes, so serve built assets from Fallback.
	facades.Route().Fallback(spaHandler)
}

func spaHandler(ctx http.Context) http.Response {
	path := ctx.Request().Path()
	if path == "/api" || strings.HasPrefix(path, "/api/") {
		return ctx.Response().Json(404, map[string]any{"error": "not found"})
	}

	if file := spaFilePath(path); file != "" {
		return ctx.Response().File(file)
	}
	return ctx.Response().File(spaRoot + "/index.html")
}

// spaFilePath returns a safe path under spaRoot when the file exists, else "".
func spaFilePath(urlPath string) string {
	rel := strings.TrimPrefix(urlPath, "/")
	if rel == "" {
		return ""
	}
	if strings.Contains(rel, "..") {
		return ""
	}

	absRoot, err := filepath.Abs(spaRoot)
	if err != nil {
		return ""
	}
	candidate := filepath.Join(absRoot, filepath.FromSlash(rel))
	absCandidate, err := filepath.Abs(candidate)
	if err != nil || !strings.HasPrefix(absCandidate, absRoot+string(filepath.Separator)) {
		return ""
	}

	info, err := os.Stat(absCandidate)
	if err != nil || info.IsDir() {
		return ""
	}
	return absCandidate
}
