# DataOp — Campaign-based Data Collection & Analysis

A platform for structured, multi-stage data collection. Users create **campaigns**
made of ordered **stages**; each stage defines its own **fields** (rendered as a
dynamic form). **Records** are created at the first stage and flow forward
stage-by-stage — picked up ("processing"), enriched, then advanced. Later stages can
inherit values from earlier ones, fields can be marked unique (individually or as a
composite), and access is governed by per-campaign RBAC.

- **`api/`** — Goravel (Go) REST API + PostgreSQL
- **`ui/`** — React SPA (Vite + TypeScript)

## Features

- **Campaigns** with visibility (public/private), status, and a per-campaign
  concurrency mode: `allow_concurrent_edit=false` locks a record to one user while
  it is being processed; `true` allows concurrent edits (last-write-wins).
- **Stages & dynamic fields** — types: text, textarea, number, date, boolean,
  select, multiselect. Per field: `required`, `is_unique`, `max_count`
  (0 = unlimited repeatable entries), options, and `prev_stage_key` (inherit a value
  from the previous stage).
- **Stage-level uniqueness** — a single field (`is_unique`) or a composite
  constraint (a set of field keys) must be unique across records at that stage;
  duplicates are rejected with `409 Conflict`.
- **Per-campaign RBAC** — owner / manager / member, with `add` / `edit` / `delete`
  permissions. Owners manage settings, members, and the stage structure.
- **Data-flow engine** — mark processing (with locking), advance (validate required
  fields + uniqueness, seed inherited fields, record an audit transition), release.
- **Analytics** — record counts by stage and status, plus finished-record throughput.

## Prerequisites

- Go ≥ 1.24, Node ≥ 20, and either PostgreSQL or Docker.

## 1. Start PostgreSQL

Using Docker (matches the default `api/.env`):

```bash
docker run -d --name dataop-pg \
  -e POSTGRES_USER=dataop -e POSTGRES_PASSWORD=dataop -e POSTGRES_DB=dataop \
  -p 5433:5432 postgres:18
```

Or point `api/.env` (`DB_*`) at your own Postgres.

## 2. Run the API (`api/`)

```bash
cd api
cp .env.example .env         # then set DB_* / see values below
go run . artisan key:generate
go run . artisan jwt:secret
go run . artisan migrate
go run . artisan db:seed      # optional: demo campaign + user
go run .                      # serves http://127.0.0.1:3000
```

A ready-to-use `.env` is already present in this repo with the Docker DB settings
above (`DB_HOST=127.0.0.1`, `DB_PORT=5433`, `DB_DATABASE/USERNAME/PASSWORD=dataop`).

**Demo login** (after `db:seed`): `alice@dataop.dev` / `password` — owner of the
seeded "Customer Feedback" campaign (Intake → Triage → Resolution).

## 3. Run the UI (`ui/`)

```bash
cd ui
pnpm install
pnpm run dev                  # serves http://127.0.0.1:5173
```

The Vite dev server proxies `/api/*` to the API on `:3000`, so just open
<http://127.0.0.1:5173> and register or log in.

## API overview

All endpoints are under `/api/v1`. `POST /auth/register` and `POST /auth/login`
return a JWT; send it as `Authorization: Bearer <token>` on every other call.

| Area      | Endpoints |
|-----------|-----------|
| Auth      | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| Campaigns | `GET/POST /campaigns`, `GET/PUT/DELETE /campaigns/{campaign}` |
| Members   | `GET/POST /campaigns/{campaign}/members`, `PUT/DELETE …/members/{member}` |
| Stages    | `GET/POST …/stages`, `PUT/DELETE …/stages/{stage}` |
| Fields    | `POST/PUT/DELETE …/stages/{stage}/fields[/{field}]` |
| Constraints | `POST/DELETE …/stages/{stage}/constraints[/{constraint}]` |
| Records   | `GET/POST …/records`, `GET …/records/{record}`, `GET/PUT …/records/{record}/values` |
| Data flow | `POST …/records/{record}/processing` · `…/release` · `…/advance` |
| Analytics | `GET …/campaigns/{campaign}/analytics` |

## Data model

`users`, `campaigns`, `campaign_members`, `stages`, `stage_fields`,
`stage_unique_constraints`, `records`, `record_values` (flat, multi-entry via
`value_index`), `record_stage_keys` (uniqueness dedup index), and
`record_transitions` (stage-move audit trail).

## Tests

```bash
cd api && go test ./...
cd ui && pnpm run build  # type-check + bundle
```

## Production deployment (VPS)

The production stack serves the **built UI static assets from Goravel** (same origin as
`/api/v1`). Only `ui/dist` is baked into the image at build time — no Node runtime on the
server.

### Layout

| Path | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage: `pnpm build` → copy to `api/public/` → `go build` |
| `deploy/docker-compose.prod.yml` | App + MySQL with **named volumes** (`db_data`, `app_storage`) |
| `deploy/deploy.sh` | Safe deploy: rebuild app, `up -d`, **`artisan migrate` only** |
| `api/.env.example` | Env template for local dev and Docker production (`api/.env`) |
| `.github/workflows/deploy.yml` | CI tests + SSH deploy on push to `main` |

### Database configuration

The default stack **bundles MySQL 8.4** in `docker-compose.prod.yml`. You only need to
set database variables in `api/.env` — Docker Compose creates the database and the app
connects over the internal `db` hostname.

**Required variables in `api/.env`:**

| Variable | Example | Notes |
|----------|---------|-------|
| `DB_CONNECTION` | `mysql` | Must be `mysql` for the bundled stack |
| `DB_HOST` | `db` | **Leave as `db`** — Docker service name, not `127.0.0.1` |
| `DB_PORT` | `3306` | Default MySQL port |
| `DB_DATABASE` | `dataop` | Database name; created automatically on first start |
| `DB_USERNAME` | `root` | Bundled stack uses the MySQL root user |
| `DB_PASSWORD` | *(strong secret)* | Sets **both** `MYSQL_ROOT_PASSWORD` and the app password |

`docker-compose.prod.yml` reads `DB_PASSWORD` and `DB_DATABASE` to initialize the MySQL
container. The app service overrides `DB_HOST=db` so the API reaches MySQL on the Docker
network (not via localhost on the host).

**Example `api/.env` database block (Docker production):**

```bash
DB_CONNECTION=mysql
DB_HOST=db
DB_PORT=3306
DB_DATABASE=dataop
DB_USERNAME=root
DB_PASSWORD=your-long-random-password-here
```

On first `deploy.sh` run, Compose starts MySQL, waits until it is healthy, then the app
entrypoint runs `artisan migrate` to create tables. Data is stored in the `db_data` volume
and survives container rebuilds.

**Optional — external MySQL (existing server or managed DB):**

1. Remove or comment out the `db` service in `deploy/docker-compose.prod.yml`.
2. Remove `depends_on: db` from the `app` service.
3. Set `DB_HOST` to your database hostname/IP (e.g. `127.0.0.1` if MySQL runs on the VPS
   host, or a managed-DB endpoint).
4. Set `DB_USERNAME`, `DB_PASSWORD`, and `DB_DATABASE` to match your existing database.
5. Create the empty database manually if it does not exist yet.
6. Run `./deploy.sh` — migrations still apply via `artisan migrate` only.

For Postgres instead of MySQL, switch `DB_CONNECTION=postgres`, point `DB_*` at your
Postgres instance, and remove the bundled `db` service (the compose file ships MySQL only).

### First-time VPS setup

```bash
# On the VPS
sudo mkdir -p /opt/data-op && sudo chown $USER /opt/data-op
git clone <repo-url> /opt/data-op
cp api/.env.example api/.env
# Edit api/.env: set DB_PASSWORD, DB_DATABASE, APP_URL, then generate APP_KEY + JWT_SECRET
cd /opt/data-op/deploy

# Generate secrets (after first build):
docker compose --env-file ../api/.env -f docker-compose.prod.yml build app
docker compose --env-file ../api/.env -f docker-compose.prod.yml run --rm app ./main artisan key:generate --show
docker compose --env-file ../api/.env -f docker-compose.prod.yml run --rm app ./main artisan jwt:secret --show

chmod +x deploy.sh && ./deploy.sh
```

Open `http://<vps-ip>:3000` (or put Caddy/nginx in front for TLS).

### CI/CD (GitHub Actions)

On every PR/push: `go test ./...` + `pnpm run build`.

On push to `main`: SSH to the VPS, `git pull --ff-only`, run `deploy/deploy.sh`.

**Required repository secrets:** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Optional:
`VPS_SSH_PORT`, `VPS_APP_DIR` (default `/opt/data-op`).

### Data safety

**Subsequent deploys are safe.** Each run of `deploy.sh` (manual or via CI) only rebuilds
the **app** image and restarts containers. The MySQL `db` container is left running with
its `db_data` volume intact. Existing rows are kept; only new/pending migrations are applied.

- Migrations use **`artisan migrate` only** (applies pending migrations; never drops data).
- **`migrate:fresh` / `migrate:reset` / `migrate:refresh` are never run** in deploy scripts
  or CI.
- MySQL data lives in the `db_data` Docker volume — survives image rebuilds and container
  restarts.
- **Never** run `docker compose down -v` in production (the `-v` flag deletes volumes).

**What would destroy data (avoid these):**

- `docker compose down -v` or `docker volume rm …db_data`
- `artisan migrate:fresh` / `migrate:reset` / `migrate:refresh`
- Deleting and recreating the `db` service without re-attaching the same `db_data` volume

### Local production smoke test

```bash
cp api/.env.example api/.env   # set DB_PASSWORD, DB_DATABASE, APP_KEY, JWT_SECRET
cd deploy && ./deploy.sh
# → http://127.0.0.1:3000 serves UI + API
```
