# CLAUDE.md — DataOp project context

> **Maintenance directive (for the AI):** Treat this file as the source of truth for
> project context. **Keep it updated as part of every change.** When you add/rename a
> model, endpoint, migration, page, env var, convention, or discover a new gotcha,
> update the relevant section here in the *same* task — before you consider the task
> done. Prefer editing existing lines over appending duplicates. If something here is
> now wrong, fix it. Keep it concise and scannable; this file is loaded into context
> every session so future sessions don't need to read the whole codebase.

## What this is

A platform for **structured, multi-stage data collection & analysis**. Users create
**campaigns** made of ordered **stages**; each stage defines **fields** rendered as a
dynamic form. **Records** enter at the first stage and flow forward stage-by-stage:
picked up ("processing"), enriched, then advanced. Later-stage fields can inherit
values from earlier stages; fields can be unique (single or composite); access is
governed by per-campaign RBAC.

Status: **Full MVP complete and verified end-to-end** (auth, campaigns, RBAC, stages/
fields, uniqueness, record data-flow with locking + inheritance + audit, analytics).

## Layout

```
data-op/
  api/   # Goravel (Go) REST API + PostgreSQL
  ui/    # React SPA (Vite + TypeScript)
  README.md    # human-facing setup/run instructions
  CLAUDE.md    # this file
```

## Tech stack

- **API:** Go 1.24+, Goravel framework v1.17.2 (module name is `goravel`), GORM-backed
  ORM via `facades.Orm()`, JWT auth via `facades.Auth()`, Gin HTTP driver. DB drivers
  registered: postgres (default) **and** mysql (both in `bootstrap/providers.go`).
- **UI:** React 19, Vite 8, TypeScript 6, react-router-dom v7, @tanstack/react-query v5,
  axios. Package manager is **pnpm** (`pnpm-lock.yaml`). Styling: **Tailwind CSS v4**
  (`@tailwindcss/vite`) + **shadcn/ui** (Radix primitives, new-york style) in
  `src/components/ui/`; `lucide-react` icons; `cn()` in `src/lib/utils.ts`. The legacy
  plain-CSS design system still lives in `src/index.css` and older pages/components use
  it — shadcn tokens are mapped onto the same brand palette (see the `@theme inline`
  block + `:root`), so the two coexist. Path alias `@/*` → `src/*` (vite + tsconfig).
- **DB:** the API supports postgres and mysql; the **current dev `api/.env` uses MySQL**
 (host 127.0.0.1:3306, db `dpt_dataop`, user `root`). The original Postgres 18 docker
 setup (`dataop-pg`, host port 5433) still works if `.env` is switched back.

## Run / dev workflow

Backend (`api/`): env is already set up. Common commands (set `GOFLAGS=-mod=mod` if the
module cache complains):
```
go run . artisan migrate        # apply migrations
go run . artisan migrate:fresh  # drop + re-run all (wipes data)
go run . artisan db:seed        # demo campaign + user
go run .                        # serve http://127.0.0.1:3001 (APP_PORT in api/.env)
go test ./...
```
Frontend (`ui/`): `pnpm install` then `pnpm run dev` → http://127.0.0.1:5173 (add shadcn
components with `pnpm dlx shadcn@latest add <name>`). Vite proxies
`/api/*` to `:3001` (see `ui/vite.config.ts`) — **the proxy target must match
`APP_PORT` in `api/.env`**, so the SPA calls same-origin `/api/v1/...`. Gotcha: a
stale compiled backend binary left listening on another port answers with 404s for
routes added later — if a registered route 404s, check for and kill old `goravel`/
`main.exe` processes (`ss -tlnp | grep 300`).

**Demo login (after seed):** username `alice` / password `password` — owns the "Customer
Feedback" campaign (Intake → Triage → Resolution, with an inherited `email` field and
a unique `email` at Intake).

## Domain model & concurrency

- **Campaign** — `visibility` (public|private), `status` (draft|active|paused|archived),
  `allow_concurrent_edit`. Concurrency is per-campaign:
  - `false` → **record locking**: marking a record `processing` sets `locked_by`; other
    users are blocked (409) from writing/advancing until release or advance.
  - `true` → concurrent edits allowed, last-write-wins; status is advisory.
- **CampaignMember** — RBAC pivot. `role` owner|manager|member + `can_add`/`can_edit`/
  `can_delete`. Owner = full control; **owner-only**: settings, member management.
  **owner or manager** (`services.CanManage`): stage/field/constraint structure.
  Record data actions use add/edit/delete via `services.Authorize`.
- **Stage** — ordered by `position` (0-based) within a campaign.
- **StageField** — `type` ∈ text|textarea|number|date|boolean|select|multiselect;
  `required`, `is_unique`, `max_count` (0 = unlimited repeatable entries; select forced
  to 1), `options` (JSON array string, choice types only), `prev_stage_key` (key of a
  field in the immediately-previous stage whose value seeds this field), `position`.
- **StageUniqueConstraint** — composite uniqueness: `field_keys` (JSON array string).
- **Record** — `current_stage_id`, `status` (open|processing|finished), `locked_by`,
  `created_by`.
- **RecordValue** — flat EAV: one row per entry (`value_index` for repeatable fields),
  grouped by `field_key`. Multiselect = multiple rows (one per selected option).
- **RecordStageKey** — uniqueness dedup: `(stage_id, constraint_ref, normalized_hash)`
  unique index. `constraint_ref` is `field:<key>` or `constraint:<id>`.
- **RecordTransition** — audit trail of stage moves (`from`/`to`/`moved_by`/`note`).

## Backend structure (`api/`)

- `app/models/` — models embed `github.com/goravel/framework/database/orm` `orm.Model`
  (and `orm.SoftDeletes` on users/campaigns). Timestamps are `*carbon.DateTime`.
- `app/http/controllers/` — thin controllers returning `http.Response`. Shared helpers
  in `helpers.go`: `currentUserID(ctx)`, `ok/created/badRequest/unauthorized/forbidden/
  notFound/conflict/serverError`. Response envelope is `{ "data": ... }` (errors:
  `{ "error": msg }`). Route-param loaders: `loadCampaign`, `loadStage`, `loadRecord`.
- `app/http/middleware/auth.go` — `Auth()` validates JWT (`facades.Auth(ctx).Parse`).
- `app/services/` — business logic:
  - `access.go` — RBAC: `Membership`, `CanView`, `CanManage`, `Authorize(perm)`.
  - `uniqueness.go` — `EnforceUniqueness(tx, recordID, stageID, valuesByKey)` +
    `targetHash` (unit-tested).
  - `record_flow.go` — `StoreValues` (validate/normalize/persist), `ValidateRequired`,
    `Advance` (transactional: validate → transition → seed inherited → advance/finish),
    `LoadValuesByKey`, `StageFields`, `ErrValidation`/`ErrUniquenessConflict`, `Now()`.
- `app/providers/app_service_provider.go` — registers the seeder; wired in
  `bootstrap/providers.go`.
- `database/migrations/` — registered in `bootstrap/migrations.go`. `20260101000001..04`
  create users / campaigns+members / stages+fields+constraints / records+values+keys+
  transitions.
- `database/seeders/database_seeder.go` — demo data; registered via AppServiceProvider.
- `routes/api.go` — all `/api/v1` routes (registered in `bootstrap/app.go` WithRouting).
  Public: `auth/register`, `auth/login`. Everything else behind `middleware.Auth()`.
- `config/cors.go` — `paths` set to `["*"]` (must be non-empty or CORS is disabled).

## API surface (`/api/v1`, JWT via `Authorization: Bearer <token>`)

auth: `POST register|login`, `GET me`, `POST logout` ·
campaigns: `GET/POST /campaigns`, `GET/PUT/DELETE /campaigns/{campaign}` ·
members: `GET/POST …/members`, `PUT/DELETE …/members/{member}` ·
stages: `GET/POST …/stages`, `PUT/DELETE …/stages/{stage}` ·
fields: `POST/PUT/DELETE …/stages/{stage}/fields[/{field}]` ·
constraints: `POST/DELETE …/stages/{stage}/constraints[/{constraint}]` ·
records: `GET/POST …/records`, `GET/DELETE …/records/{record}` (delete needs the
`delete` perm, cascades values/keys/transitions), `GET/PUT …/records/{record}/values`,
`GET …/records/{record}/history` (transitions with resolved user + stage names) ·
  - `GET /records` supports `?stage=`, `?status=`, `?mine=true`, `?page=` (default 1),
    `?per_page=` (default 50, max 200). Returns `{ records, total, page, per_page }`;
    ordered `id ASC` so new entries appear last. ·
flow: `POST …/records/{record}/{processing|release|advance}` ·
analytics: `GET …/campaigns/{campaign}/analytics`.

## Frontend structure (`ui/src/`)

- `api/client.ts` — axios instance (`baseURL /api/v1`), attaches token from
  localStorage, unwraps `{data}` via `unwrap()`, clears session + redirects on 401.
- `api/types.ts` — TS types + `parseOptions`/`parseFieldKeys` helpers.
- `api/resources.ts` — typed endpoint wrappers grouped by resource.
- `auth/AuthContext.tsx` — `useAuth()` (user/login/register/logout).
- `App.tsx` — routes + `Protected` layout. The layout is **full width** (no
 `.container` on `main`) and exports `TopbarPortal`, which portals children into a
 slot in the topbar — CampaignDetail renders its back link, campaign name, badges
 and tab nav there to maximize vertical space for the grid. `pages/`: Login,
 Campaigns, CampaignDetail (tabs: **Timeline**/stages/members/analytics/settings —
 the `records` tab key renders the timeline), RecordDetail (dynamic form + flow
 actions; inherited `prev_stage_key` fields render disabled). `components/`:
  StageBuilder, Members, Settings, AnalyticsPanel, `DynamicForm` (form engine), and
  `StageTimeline` — the new records UX (replaced the old `RecordBoard` kanban):
 - Horizontal **stage timeline**; clicking a stage shows its records in an **Excel-style
 grid** (shadcn `Table`) with one editable cell per field. Cells save on blur/Enter
 via `recordApi.saveValues` (per-record, current stage). Required-field validation only
 fires on advance, so cells edit freely even with no data.
 - **Inherited cells** (`prev_stage_key` set) are read-only in the grid (muted text,
 tooltip) since their values are seeded on advance.
 - **Repeatable fields** (`max_count` 0 or > 1, scalar types) use `MultiEntryCell`: a
 popover with one input per entry plus add/remove; saves when the popover closes.
 - **Row actions** open a **context menu beside the cursor** (right-click anywhere on
 the row, or click the row's trailing "…" button): **Details** (opens `RecordDetailsModal`),
 mark/unmark processing, move to next stage / finish, and **Delete** with confirm (also
 on finished rows). Rendered via `createPortal` + `position: fixed`, viewport-clamped;
 closes on outside click / Escape / scroll; failed actions keep it open with the error
 inline (`RowActionsMenu`).
 - **RecordDetailsModal** — shadcn `Dialog` showing all collected data for a record
 grouped by stage plus a full **Activity** trail. Stage progress indicator at the top
 (past=green, current=primary, future=secondary). Only stages with saved values are
 shown. Fields display label/value pairs; boolean → Yes/No with icon; dates →
 `toLocaleDateString()`; multi-entry fields → one line each. Activity section fetches
 `GET /records/{record}/history` (loaded lazily when the modal opens via React Query
 key `['record-history', campaignId, recordId]`) and renders a vertical timeline of
 transitions: user name + username, stage move label, optional note, timestamp.
 - A permanent **empty add-row** at the bottom of the **first** stage; committing any
 cell creates a record (`recordApi.create`) then saves the values. If the value save
 fails the just-created record is **rolled back** (deleted) and the draft is kept so
 the user can fix it — no orphan empty rows. After a successful create, the grid
 navigates to the last page so the new row is immediately visible.
  - **"My data" / "All data"** toggle sends `?mine=true`; backend returns records where `created_by = uid` OR the user appears in any `RecordTransition` for that record (`moved_by = uid`), i.e. records touched at any stage. Defaults to My data.
  - "Edit fields" button switches to the Stages tab (`onEditStage`) — columns are
    editable before any records exist.
  - `components/ui/` holds shadcn primitives (button, badge, table, input, select,
    dropdown-menu, popover); `components.json` configures the shadcn CLI.

## Gotchas / conventions learned (don't re-discover these)

- **Goravel `First()` returns nil error when no row found** (leaves dest zero-valued).
  Detect "not found" via `model.ID == 0`, not via error.
- **jsonb + empty string fails** (`invalid input syntax for type json`). `options` and
  `field_keys` columns are **`text`** (nullable), not jsonb, and hold JSON-encoded
  strings we parse in Go.
- **`facades.Auth(ctx).Parse()` strips the `Bearer ` prefix** itself — pass the raw
  `Authorization` header. `ID()` returns the id as a **string** → parse to uint.
- **Timestamps** are `*carbon.DateTime` (`github.com/goravel/framework/support/carbon`).
  Format via embedded `*Carbon`, e.g. `t.ToDateString()`. Lock time via `services.Now()`.
- **CORS**: `config/cors.go` `paths` must be non-empty (`["*"]`) or CORS won't apply.
- **Migrations run only when registered** in `bootstrap/migrations.go`; changing a
  migration file needs `migrate:fresh` (dev) to take effect.
- Uniqueness is enforced in a **transaction**: `StoreValues` then `EnforceUniqueness`;
  a conflict returns `ErrUniquenessConflict` to force rollback → controller responds 409.
- Testing tip: when shell-scripting curl with a bearer token, **quote the whole header**
 (`-H "Authorization: Bearer $TOK"`) — an unquoted var splits on the space.
 - **StageTimeline pagination**: `StageGrid` fetches records per-stage with `?stage=`,
 `?mine=`, `?page=`, `?per_page=50`. Toolbar badge shows live total via `onTotalChange`
 callback. Stage pills no longer show per-stage counts. Pagination footer appears when
 `totalPages > 1`. `PER_PAGE = 50` constant at module level.
- `StageTimeline.tsx` once contained **corrupted bytes** (NUL / control chars where
 `…`, `—`, `“”` and a lock glyph should be), which made ripgrep treat the file as
 binary and silently return no matches. If a grep on a UI file unexpectedly finds
 nothing, check for control bytes (`grep -nP '[\x00-\x1F]'`).
