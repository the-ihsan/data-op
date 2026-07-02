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
