# syntax=docker/dockerfile:1

# --- UI: build static assets only (no Node runtime in final image) ---
FROM node:22-alpine AS ui-build
WORKDIR /build/ui
RUN corepack enable
COPY ui/package.json ui/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY ui/ ./
RUN pnpm run build

# --- API: compile Go binary with embedded UI dist in public/ ---
FROM golang:1.24-alpine AS api-build
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
