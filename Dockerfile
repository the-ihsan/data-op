# syntax=docker/dockerfile:1

# --- WASM: Starlark sanitize validator for the stage builder editor ---
FROM golang:1.25-alpine AS wasm-build
WORKDIR /build/api
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api/ ./
RUN mkdir -p /wasm-out \
    && GOOS=js GOARCH=wasm go build -o /wasm-out/sanitize.wasm ./wasm/sanitize/ \
    && cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /wasm-out/wasm_exec.js

# --- UI: build static assets only (no Node runtime in final image) ---
FROM node:22-alpine AS ui-build
WORKDIR /build/ui
RUN corepack enable
COPY ui/package.json ui/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY ui/ ./
COPY --from=wasm-build /wasm-out/sanitize.wasm ./public/wasm/sanitize.wasm
COPY --from=wasm-build /wasm-out/wasm_exec.js ./public/wasm/wasm_exec.js
RUN pnpm exec tsc -b && pnpm exec vite build

# --- API: compile Go binary with embedded UI dist in public/ ---
FROM golang:1.25-alpine AS api-build
RUN apk add --no-cache git
WORKDIR /build/api
ENV CGO_ENABLED=0 GO111MODULE=on
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api/ ./
COPY --from=ui-build /build/ui/dist ./public
RUN go build -ldflags "-s -w" -o /out/main .

# --- Runtime ---
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -H -u 1000 app
WORKDIR /app
COPY --from=api-build /out/main ./main
COPY --from=api-build /build/api/public ./public
COPY --from=api-build /build/api/resources ./resources
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && mkdir -p storage/framework/sessions storage/logs storage/app/public \
    && chown -R app:app /app
USER app
EXPOSE 3000
ENV APP_HOST=0.0.0.0 \
    APP_PORT=3000
ENTRYPOINT ["/entrypoint.sh"]
