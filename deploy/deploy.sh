#!/usr/bin/env bash
# Safe production deploy: rebuild app image, restart containers, run pending
# migrations only. Never runs migrate:fresh / migrate:reset / migrate:refresh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing deploy/.env — copy env.example and configure secrets first." >&2
  exit 1
fi

# Guard against accidental destructive migration commands in this script.
for destructive in migrate:fresh migrate:reset migrate:refresh; do
  if grep -qE "(^|[[:space:]])artisan[[:space:]]+${destructive}([[:space:]]|$)" "$0"; then
    echo "Refusing to run: deploy script must not call artisan ${destructive}" >&2
    exit 1
  fi
done

echo "==> Building application image (UI dist + API binary)…"
docker compose -f docker-compose.prod.yml build app

echo "==> Starting / updating services (database volume preserved)…"
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> Waiting for app…"
for _ in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T app ./main artisan migrate:status >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Applying pending migrations (safe, non-destructive)…"
docker compose -f docker-compose.prod.yml exec -T app ./main artisan migrate

echo "==> Deploy complete."
docker compose -f docker-compose.prod.yml ps
