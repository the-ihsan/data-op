#!/usr/bin/env bash
# Safe production deploy: rebuild app image, restart containers, run pending
# migrations only. Never runs migrate:fresh / migrate:reset / migrate:refresh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/api/.env"
ENV_EXAMPLE="$ROOT/api/.env.example"
cd "$SCRIPT_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing api/.env — copy api/.env.example and configure secrets first." >&2
  echo "  cp $ENV_EXAMPLE $ENV_FILE" >&2
  exit 1
fi

random_key() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32; }
env_var_value() { grep -E "^${1}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true; }
set_env_var() {
  if grep -qE "^${1}=" "$ENV_FILE"; then sed -i "s/^${1}=.*/${1}=${2}/" "$ENV_FILE"
  else printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"; fi
}
for key in APP_KEY JWT_SECRET; do
  if [[ -z "$(env_var_value "$key")" ]]; then
    set_env_var "$key" "$(random_key)"
    echo "==> Generated $key"
  fi
done

COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)

# Guard against accidental destructive migration commands in this script.
for destructive in migrate:fresh migrate:reset migrate:refresh; do
  if grep -qE "(^|[[:space:]])artisan[[:space:]]+${destructive}([[:space:]]|$)" "$0"; then
    echo "Refusing to run: deploy script must not call artisan ${destructive}" >&2
    exit 1
  fi
done

echo "==> Building application image (UI dist + API binary)…"
export DATAOP_IMAGE="${DATAOP_IMAGE:-dataop-app}"
export DATAOP_TAG="${DATAOP_TAG:-latest}"
"${COMPOSE[@]}" build app

echo "==> Starting / updating services (database volume preserved)…"
"${COMPOSE[@]}" up -d --remove-orphans

echo "==> Waiting for app…"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T app ./main artisan migrate:status >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Applying pending migrations (safe, non-destructive)…"
"${COMPOSE[@]}" exec -T app ./main artisan migrate

echo "==> Deploy complete."
"${COMPOSE[@]}" ps
