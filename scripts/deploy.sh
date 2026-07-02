#!/usr/bin/env bash
# Deploy DataOp on a VPS without cloning the repo.
#
# Usage:
#   curl -fsSL https://github.com/the-ihsan/data-op/raw/master/scripts/deploy.sh | bash
#   curl -fsSL ... | bash -s -- v1.2.3
#   DATAOP_TAG=v1.2.3 curl -fsSL ... | bash
#
# First run creates api/.env from the repo example if missing — set DB_PASSWORD,
# DB_DATABASE, and APP_URL, then re-run. APP_KEY and JWT_SECRET are auto-generated.
# Set DATAOP_REGISTRY_TOKEN (PAT with read:packages) when the image registry is private.
#
# Environment (all optional):
#   DATAOP_INSTALL_DIR   default /opt/data-op
#   DATAOP_RAW_BASE      default https://github.com/the-ihsan/data-op/raw/master
#   DATAOP_IMAGE         default ghcr.io/the-ihsan/data-op
#   DATAOP_TAG           default latest (or first script argument)
#   DATAOP_REGISTRY      default ghcr.io
#   DATAOP_REGISTRY_USER default current user ($USER)
#   DATAOP_REGISTRY_TOKEN  login token for private registries
set -euo pipefail

DATAOP_INSTALL_DIR="${DATAOP_INSTALL_DIR:-/opt/data-op}"
DATAOP_RAW_BASE="${DATAOP_RAW_BASE:-https://github.com/the-ihsan/data-op/raw/master}"
DATAOP_IMAGE="${DATAOP_IMAGE:-ghcr.io/the-ihsan/data-op}"
DATAOP_REGISTRY="${DATAOP_REGISTRY:-ghcr.io}"
DATAOP_REGISTRY_USER="${DATAOP_REGISTRY_USER:-${USER:-deploy}}"
DATAOP_TAG="${DATAOP_TAG:-${1:-latest}}"

if [[ -z "$DATAOP_TAG" || "$DATAOP_TAG" == -* ]]; then
  die "invalid tag '$DATAOP_TAG'. To pin a release use:
  DATAOP_TAG=v1.0.0 curl -fsSL .../deploy.sh | bash
  or: curl -fsSL .../deploy.sh | bash -s -- v1.0.0"
fi

DEPLOY_DIR="$DATAOP_INSTALL_DIR/deploy"
ENV_FILE="$DATAOP_INSTALL_DIR/api/.env"
ENV_EXAMPLE="$DATAOP_INSTALL_DIR/api/.env.example"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

fetch() {
  local dest="$1" url="$2"
  mkdir -p "$(dirname "$dest")"
  curl -fsSL "$url" -o "$dest"
}

random_key() {
  # Read a bounded chunk then trim in bash. Piping an infinite /dev/urandom into
  # `head -c 32` makes the producer take SIGPIPE (exit 141), which `set -o pipefail`
  # + `set -e` turn into a silent abort of the whole deploy.
  local s
  s="$(LC_ALL=C tr -dc 'A-Za-z0-9' < <(head -c 512 /dev/urandom))"
  printf '%s' "${s:0:32}"
}

env_var_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true
}

set_env_var() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s/^${key}=.*/${key}=${value}/" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

ensure_secret_keys() {
  local key value
  for key in APP_KEY JWT_SECRET; do
    value="$(env_var_value "$key")"
    if [[ -z "$value" ]]; then
      value="$(random_key)"
      set_env_var "$key" "$value"
      log "Generated $key"
    fi
  done
}

require_env_vars() {
  local key value missing=()
  for key in DB_PASSWORD DB_DATABASE; do
    value="$(env_var_value "$key")"
    if [[ -z "$value" ]]; then
      missing+=("$key")
    fi
  done
  if ((${#missing[@]} > 0)); then
    die "Set ${missing[*]} in $ENV_FILE, then re-run deploy."
  fi
}

need_cmd curl
need_cmd docker
docker compose version >/dev/null 2>&1 || die "docker compose plugin is required"

mkdir -p "$DEPLOY_DIR" "$DATAOP_INSTALL_DIR/api"

log "Fetching compose file…"
fetch "$COMPOSE_FILE" "$DATAOP_RAW_BASE/deploy/docker-compose.prod.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  log "Fetching api/.env.example…"
  fetch "$ENV_EXAMPLE" "$DATAOP_RAW_BASE/api/.env.example"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  ensure_secret_keys
  die "Created $ENV_FILE — set DB_PASSWORD, DB_DATABASE, APP_URL, then re-run deploy."
fi

ensure_secret_keys
require_env_vars

# Guard: never allow destructive migration commands in fetched compose workflows.
for destructive in migrate:fresh migrate:reset migrate:refresh; do
  if grep -qE "(^|[[:space:]])artisan[[:space:]]+${destructive}([[:space:]]|$)" "$COMPOSE_FILE" 2>/dev/null; then
    die "compose file must not reference artisan ${destructive}"
  fi
done

if [[ -n "${DATAOP_REGISTRY_TOKEN:-}" ]]; then
  log "Logging in to $DATAOP_REGISTRY…"
  printf '%s' "$DATAOP_REGISTRY_TOKEN" | docker login "$DATAOP_REGISTRY" -u "$DATAOP_REGISTRY_USER" --password-stdin
fi

export DATAOP_IMAGE DATAOP_TAG

log "Pulling $DATAOP_IMAGE:$DATAOP_TAG…"
compose pull app

log "Starting / updating services (database volume preserved)…"
compose up -d --remove-orphans

log "Waiting for app…"
for _ in $(seq 1 30); do
  if compose exec -T app ./main artisan migrate:status >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

log "Applying pending migrations (safe, non-destructive)…"
compose exec -T app ./main artisan migrate

log "Deploy complete ($DATAOP_IMAGE:$DATAOP_TAG)."
compose ps
