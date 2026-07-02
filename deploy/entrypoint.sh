#!/bin/sh
set -eu

# Wait for the database (up to ~60s). migrate:status needs a live connection.
i=0
while [ "$i" -lt 30 ]; do
  if ./main artisan migrate:status >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 2
done

# Safe, idempotent: applies only pending migrations. Never drops tables or data.
./main artisan migrate

exec ./main
