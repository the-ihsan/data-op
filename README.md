# DataOp — Campaign-based Data Collection & Analysis

A platform for structured, multi-stage data collection. Users create **campaigns**
made of ordered **stages**; each stage defines its own **fields** (rendered as a
dynamic form). **Records** are created at the first stage and flow forward
stage-by-stage — picked up ("processing"), enriched, then advanced. Later stages can
inherit values from earlier ones, fields can be marked unique (individually or as a
composite), and access is governed by per-campaign RBAC.

```
data-op/
  api/       # Goravel (Go) REST API
  ui/        # React SPA (Vite + TypeScript)
  deploy/    # docker-compose.prod.yml, deploy.sh
  Dockerfile # production: ui/dist → api/public + Go binary
```

## Features

- **Campaigns** with visibility (public/private), status, and per-campaign concurrency
  (`allow_concurrent_edit=false` locks a record while processing; `true` allows
  concurrent edits, last-write-wins).
- **Stages & dynamic fields** — text, textarea, number, date, boolean, select,
  multiselect; per field: `required`, `is_unique`, `max_count` (0 = unlimited
  repeatable entries), options, and `prev_stage_key` (inherit from the previous stage).
- **Stage-level uniqueness** — single-field or composite constraints; duplicates
  return `409 Conflict`.
- **Per-campaign RBAC** — owner / manager / member with `add` / `edit` / `delete`
  permissions. Owners manage settings, members, and stage structure.
- **Data-flow engine** — mark processing (with locking), advance (validate, seed
  inherited fields, audit transition), release.
- **Analytics** — record counts by stage and status, plus finished-record throughput.

## Local development

### Prerequisites

- Go ≥ 1.25, Node ≥ 20, **pnpm**
- MySQL or MariaDB (local install), **or** PostgreSQL if you prefer

The API supports both MySQL and PostgreSQL (`DB_CONNECTION` in `api/.env`). Local dev
defaults to **MySQL on `127.0.0.1:3306`**.

### 1. Database

Create a database and set credentials in `api/.env` (copy from `api/.env.example`):

```bash
cp api/.env.example api/.env
# Edit DB_* — example for local MySQL:
#   DB_CONNECTION=mysql
#   DB_HOST=127.0.0.1
#   DB_PORT=3306
#   DB_DATABASE=dpt_dataop
#   DB_USERNAME=root
#   DB_PASSWORD=...
```

**PostgreSQL (optional):** set `DB_CONNECTION=postgres` and point `DB_*` at your
instance. For Docker:

```bash
docker run -d --name dataop-pg \
  -e POSTGRES_USER=dataop -e POSTGRES_PASSWORD=dataop -e POSTGRES_DB=dataop \
  -p 5433:5432 postgres:18
# DB_HOST=127.0.0.1  DB_PORT=5433  DB_DATABASE=dataop  DB_USERNAME=dataop  DB_PASSWORD=dataop
```

### 2. API (`api/`)

```bash
cd api
go run . artisan key:generate
go run . artisan jwt:secret
go run . artisan migrate
go run . artisan db:seed      # optional: demo campaign + user
go run .                      # http://127.0.0.1:3001 (APP_PORT in api/.env)
```

Set `GOFLAGS=-mod=mod` if the Go module cache complains.

### 3. UI (`ui/`)

```bash
cd ui
pnpm install
pnpm run dev                  # http://127.0.0.1:5173
```

Vite proxies `/api/*` to the API. **The proxy target must match `APP_PORT` in
`api/.env`** (see `ui/vite.config.ts`). Open <http://127.0.0.1:5173> and register or
log in.

**Demo login** (after `db:seed`): username `alice` / password `password` — owner of
the seeded "Customer Feedback" campaign (Intake → Triage → Resolution).

## API overview

All endpoints are under `/api/v1`. `POST /auth/register` and `POST /auth/login` return
a JWT; send it as `Authorization: Bearer <token>` on other calls.

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| Campaigns | `GET/POST /campaigns`, `GET/PUT/DELETE /campaigns/{campaign}` |
| Members | `GET/POST …/members`, `PUT/DELETE …/members/{member}` |
| Stages | `GET/POST …/stages`, `PUT/DELETE …/stages/{stage}` |
| Fields | `POST/PUT/DELETE …/stages/{stage}/fields[/{field}]` |
| Constraints | `POST/DELETE …/stages/{stage}/constraints[/{constraint}]` |
| Records | `GET/POST …/records`, `POST …/records/bulk`, `GET/DELETE …/records/{record}` |
| Values | `GET/PUT …/records/{record}/values` |
| History | `GET …/records/{record}/history` |
| Data flow | `POST …/records/{record}/processing` · `…/release` · `…/advance` |
| Analytics | `GET …/campaigns/{campaign}/analytics` |

`GET …/records` supports `?stage=`, `?status=`, `?mine=true`, `?page=`, `?per_page=`.

## Data model

`users`, `campaigns`, `campaign_members`, `stages`, `stage_fields`,
`stage_unique_constraints`, `records`, `record_values` (flat EAV, multi-entry via
`value_index`), `record_stage_keys` (uniqueness dedup), `record_transitions` (audit).

## Tests

```bash
cd api && go test ./...
cd ui && pnpm run build      # type-check + bundle
```

## Production deployment (VPS)

Production serves the **built UI from Goravel** (same origin as `/api/v1`). The root
`Dockerfile` runs `pnpm build`, copies `ui/dist` to `api/public/`, then builds the Go
binary. The stack in `deploy/docker-compose.prod.yml` is **app + MySQL 8.4** with named
volumes (`db_data`, `app_storage`).

### Release + deploy (recommended)

1. Tag a release — CI builds the image and publishes to the container registry:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

2. On the VPS (no git clone required):

```bash
curl -fsSL https://github.com/the-ihsan/data-op/raw/master/scripts/deploy.sh | bash -s -- v1.0.0
```

First run creates `/opt/data-op/api/.env` from the repo example — edit
`DB_PASSWORD`, `DB_DATABASE`, and `APP_URL`, then re-run the same command. `APP_KEY` and
`JWT_SECRET` are generated automatically. For a private image, set `DATAOP_REGISTRY_TOKEN` (GitHub PAT with `read:packages`)
and `DATAOP_REGISTRY_USER` to your GitHub username.

Deploy latest:

```bash
curl -fsSL https://github.com/the-ihsan/data-op/raw/master/scripts/deploy.sh | bash
```

Override defaults with env vars: `DATAOP_INSTALL_DIR`, `DATAOP_IMAGE`, `DATAOP_TAG`,
`DATAOP_RAW_BASE`, `DATAOP_REGISTRY`, `DATAOP_REGISTRY_USER`, `DATAOP_REGISTRY_TOKEN`.

### Local build (with repo checkout)

```bash
cp api/.env.example api/.env
# Set DB_PASSWORD, DB_DATABASE, APP_URL; APP_KEY + JWT_SECRET are auto-generated on deploy
cd deploy && chmod +x deploy.sh && ./deploy.sh
```

For local deploy without `scripts/deploy.sh`, generate secrets in `api/.env` manually
(32-character alphanumeric strings) or run `go run . artisan key:generate` and
`go run . artisan jwt:secret` from `api/` after copying `.env.example`.

Open `http://<vps-ip>:3000` (or put a reverse proxy in front for TLS).

### Database (`api/.env`)

Compose reads `DB_PASSWORD` and `DB_DATABASE` to initialize MySQL. The app service
overrides `DB_HOST=db` (Docker network hostname, not `127.0.0.1`).

| Variable | Docker prod | Notes |
|----------|-------------|-------|
| `DB_CONNECTION` | `mysql` | Required for the bundled stack |
| `DB_HOST` | `db` | Overridden by compose |
| `DB_PORT` | `3306` | |
| `DB_DATABASE` | e.g. `dataop` | Created on first MySQL start |
| `DB_USERNAME` | `root` | Bundled stack uses root |
| `DB_PASSWORD` | strong secret | Sets `MYSQL_ROOT_PASSWORD` and app password |

`deploy.sh` rebuilds the app, runs `up -d`, then **`artisan migrate` only** (pending
migrations; never drops data). The container entrypoint also runs migrate on start.

**External MySQL:** remove the `db` service and `depends_on` from compose; set `DB_HOST`
to your database hostname. **PostgreSQL:** set `DB_CONNECTION=postgres`, point `DB_*`
at your instance, and remove the bundled `db` service.

### CI/CD

On PR/push to `main`: `go test ./...` + `pnpm run build`.

On tag push (`v*`): build Docker image, push to `ghcr.io/the-ihsan/data-op:<tag>` and
`:latest`, create a release with the deploy curl command.

VPS deploy is manual: `curl -fsSL …/scripts/deploy.sh | bash -s -- <tag>`.

Optional registry secret: `REGISTRY_TOKEN` (push/pull; falls back to `GITHUB_TOKEN`).

### Data safety

- Migrations use **`artisan migrate` only** — never `migrate:fresh` / `migrate:reset` /
  `migrate:refresh` in deploy scripts or CI.
- MySQL data lives in the `db_data` volume — survives image rebuilds.
- **Never** run `docker compose down -v` in production (`-v` deletes volumes).

### Local production smoke test

```bash
cp api/.env.example api/.env   # set DB_PASSWORD, DB_DATABASE; keys auto-generated on deploy
cd deploy && ./deploy.sh
# → http://127.0.0.1:3000 serves UI + API
```
