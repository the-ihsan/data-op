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
  api/         # Goravel (Go) REST API
  ui/          # React SPA (Vite + TypeScript)
  Dockerfile   # production: ui/dist → api/public + Go binary
  deploy/      # docker-compose.prod.yml, deploy.sh (local build)
  scripts/     # deploy.sh (VPS curl | bash, no source checkout)
  .github/workflows/deploy.yml, release.yml
  README.md
  CLAUDE.md
```

## Tech stack

- **API:** Go 1.24+, Goravel framework v1.17.2 (module name is `goravel`), GORM-backed
 ORM via `facades.Orm()`, JWT auth via `facades.Auth()`, Gin HTTP driver. DB drivers
 registered: postgres (default) **and** mysql (both in `bootstrap/providers.go`).
 Embedded Starlark via `go.starlark.net` (stage sanitize scripts).
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

## Production deployment (VPS)

- **Single binary + static files:** root `Dockerfile` runs `pnpm build` in `ui/`, copies
  `dist/` to `api/public/`, then `go build`. Goravel serves built assets via
  `routes/web.go` (`Fallback` → file from `public/` or `index.html` for SPA routes).
  API routes register first (`bootstrap/app.go`: `Api()` then `Web()`).
- **Stack:** `deploy/docker-compose.prod.yml` — `app` + MySQL 8.4. Volumes `db_data`
  (database) and `app_storage` (sessions/logs). **Never** `docker compose down -v` in prod.
  App image: `${DATAOP_IMAGE:-dataop-app}:${DATAOP_TAG:-latest}` (registry pull on VPS;
  local `deploy/deploy.sh` builds and tags `dataop-app:latest`).
- **VPS deploy (no git):** `scripts/deploy.sh` — curl \| bash; fetches compose from raw
  repo URL, pulls pre-built image, `up -d`, `artisan migrate` only. Defaults:
  `DATAOP_IMAGE=ghcr.io/the-ihsan/data-op`, `DATAOP_INSTALL_DIR=/opt/data-op`. Set
  `DATAOP_REGISTRY_TOKEN` (GitHub PAT with `read:packages`) for private images. First run
  seeds `api/.env` from example.
- **Local prod smoke:** `deploy/deploy.sh` — rebuild app image, `up -d`, migrate.
  `deploy/entrypoint.sh` also runs `migrate` on container start (idempotent).
- **CI/CD:** `.github/workflows/deploy.yml` — test on PR/push to `main`.
  `.github/workflows/release.yml` — on tag `v*`: test, build+push image to
  `ghcr.io/<repo>`, create GitHub release with deploy command. VPS deploy is manual:
  `curl -fsSL …/scripts/deploy.sh | bash -s -- v1.2.3`.
- **Data safety:** deploy scripts never call `migrate:fresh`/`migrate:reset`/`migrate:refresh`.
  Only `artisan migrate` (pending migrations only).
- **Prod env:** copy `api/.env.example` → `api/.env`; set `DB_PASSWORD`,
  `api/.env` from example if missing; auto-generates `APP_KEY` + `JWT_SECRET`; user sets
  `DB_PASSWORD`, `DB_DATABASE`, `APP_URL`. `deploy.sh` passes `--env-file
  api/.env`; compose overrides `APP_HOST=0.0.0.0`, `DB_HOST=db` for the app container.

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
- **Stage** — ordered by `position` (0-based) within a campaign. Optional
  `sanitize_entry` (nullable text): a **Starlark script that must define
  `sanitize(data)`**; it runs (sandboxed, via `go.starlark.net`) on every value save /
  bulk-import line at that stage **before** type validation and persistence. The
  function receives the entry values as a dict (single-entry fields = strings,
  multi-entry = lists), and returns either the sanitized dict or `None, "message"` to
  reject (HTTP 400 with that message). See `services/sanitize.go` +
  `services/starlark/`; scripts are compile-validated on stage create/update (400
  `invalid sanitize script: …`) and **compiled programs are cached in memory by script
  hash** so only the first run compiles. Scripts can call bound builtins `fb_profile`/
  `fb_group`/`fb_page` (the Facebook normalizers in `services/starlark/facebook.go`)
  which return `(canonical, None)` or `(None, "error")`. Not run when advancing seeds
  inherited values (those were sanitized at their own stage).
- **StageField** — `type` ∈ text|textarea|number|date|boolean|select|multiselect
  (the former facebook_* field types were removed — Facebook URL canonicalization now
  happens via the `fb_*` sanitize-script builtins instead). `required`, `is_unique`, `max_count` (0 = unlimited repeatable entries; select forced
  to 1), `options` (JSON array string, choice types only), `prev_stage_key` (key of a
  field in the immediately-previous stage whose value seeds this field), `default_value`
  (optional pre-fill for new entries at this stage), `position`. Stages list API also
  annotates each field with `value_count` (stored record values) for safe editing in the UI.
  Field updates reject changes that would orphan data: type/key/inheritance locked when
  `value_count > 0`; `max_count` cannot drop below peak per-record usage; choice options
  in use cannot be removed. Inherited fields (`prev_stage_key` set) must keep the same
  label and type as the referenced previous-stage field.
- **StageUniqueConstraint** — composite uniqueness: `field_keys` (JSON array string).
- **Record** — `current_stage_id`, `status` (open|processing|finished), `locked_by`,
  `created_by`.
- **RecordValue** — flat EAV: one row per entry (`value_index` for repeatable fields),
  grouped by `field_key`. Multiselect = multiple rows (one per selected option).
- **RecordStageKey** — uniqueness dedup: `(stage_id, constraint_ref, normalized_hash)`
 unique index. `constraint_ref` is `field:<key>` or `constraint:<id>`.
- **UniquenessConflictCount** — hit counter: one row per `(stage_id, constraint_ref)`
 pair; `count` increments each time `EnforceUniqueness` detects a duplicate. Written
 outside the surrounding ORM transaction (via `facades.Orm().Query()` directly) so it
 persists even when the caller's transaction rolls back. Exposed as `conflict_count` on
 `StageField` (is_unique fields) and `StageUniqueConstraint` in the stages API response;
 displayed as amber badges in `RecordDetailsModal`.
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
  - `record_flow.go` — `StoreValues` (sanitize → validate/normalize → persist; takes
    the stage's `sanitize_entry` script as its last arg), `ValidateRequired`,
    `Advance` (transactional: validate → transition → seed inherited → advance/finish),
    `LoadValuesByKey`, `StageFields`, `ErrValidation`/`ErrUniquenessConflict`, `Now()`.
  - `sanitize.go` — thin wrapper over `services/starlark` for stage `sanitize_entry`
    scripts: `RunSanitize(script, valuesByKey)` + `ValidateSanitizeScript(script)`
    (unit-tested). Rejections/script errors map to `ErrValidation`.
  - `starlark/` — embedded Starlark runner: `Run`, `Validate`, `RejectionError`,
    `RegisterStringNormalizer(name, fn)` (bind Go `func(string) (string, error)` as a
    script builtin returning a `(value, err)` pair — register from `init()`, before any
    compile). Compiled `*starlark.Program`s cached by sha256 of the script (map reset
    at 256 entries); each run re-inits globals from the cached program. Bounded by 5M
    execution steps + 1s wall-clock cancel; while/recursion enabled; hermetic (no
    imports/IO, undefined names fail at compile). `facebook.go` holds the Facebook
    profile/group/page normalizers and registers them as the `fb_profile`/`fb_group`/
    `fb_page` builtins in its `init()`.
- `app/providers/app_service_provider.go` — registers the seeder; wired in
  `bootstrap/providers.go`.
- `database/migrations/` — registered in `bootstrap/migrations.go`. `20260101000001..04`
  create users / campaigns+members / stages+fields+constraints / records+values+keys+
  transitions; `20260702000002` adds `stages.sanitize_entry` (nullable text);
  `20260703000001` adds `stage_fields.default_value` (nullable text).
- `database/seeders/database_seeder.go` — demo data; registered via AppServiceProvider.
- `routes/api.go` — all `/api/v1` routes (registered in `bootstrap/app.go` WithRouting).
  Public: `auth/register`, `auth/login`. Everything else behind `middleware.Auth()`.
- `routes/web.go` — production: `Fallback` serves files from `./public` (built UI) or
  `index.html` for SPA routes. Gin `Static("/", …)` conflicts with `/api`, so assets are
  served via the fallback handler. Dev: `public/` is empty; use Vite dev server instead.
- `config/cors.go` — `paths` set to `["*"]` (must be non-empty or CORS is disabled).

## API surface (`/api/v1`, JWT via `Authorization: Bearer <token>`)

auth: `POST register|login`, `GET me`, `POST logout` ·
campaigns: `GET/POST /campaigns`, `GET/PUT/DELETE /campaigns/{campaign}` ·
members: `GET/POST …/members`, `PUT/DELETE …/members/{member}` ·
stages: `GET/POST …/stages`, `PUT/DELETE …/stages/{stage}` (create/update accept
`sanitize_entry` — Starlark script defining `sanitize(data)`, compile-validated, empty
string clears it) ·
fields: `POST/PUT/DELETE …/stages/{stage}/fields[/{field}]` ·
constraints: `POST/DELETE …/stages/{stage}/constraints[/{constraint}]` ·
records: `GET/POST …/records`, `POST …/records/bulk` (bulk import; first stage must
have ≥1 field; body `{values:[…]}` — one value per line when the stage has one field,
CSV rows in field position order when multiple; multiselect/repeatable cells use `;`;
returns `{succeeded, failed:[{index,error}]}`),
`GET/DELETE …/records/{record}` (delete needs the `delete` perm, cascades values/keys/
transitions), `GET/PUT …/records/{record}/values`,
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
 and tab nav there to maximize vertical space for the grid. Below **1200px** (`drawer-nav`
 breakpoint) the topbar shows only the logo + `DrawerNav` menu trigger; campaign metadata
 and tabs move into a left **Sheet** drawer. `pages/`: Login,
 Campaigns, CampaignDetail (tabs: **Timeline**/stages/members/analytics/settings —
 the `records` tab key renders the timeline), RecordDetail (dynamic form + flow
 actions; inherited `prev_stage_key` fields render disabled). `components/`:
  StageBuilder — pipeline-style stage builder (`components/stage-builder/`): horizontal **stage tabs**
  (numbered pills with field counts) + **Add stage** button on the right; selected stage shows a card
  editor with field list (badges for rules, inline edit/delete), **Add field** panel
  (default value, allow-multiple checkbox with max-count only when checked, inherit-from-prev
  copies label+type read-only and other options editable), composite-unique + collapsible
  **Sanitize entry (Starlark)** with guide dialog. Backend 409s when edits would lose data.
  Members, Settings, AnalyticsPanel, `DynamicForm` (form engine; applies `default_value`
  when empty), and `StageTimeline` — the new records UX (replaced the old `RecordBoard` kanban):
 - Horizontal **stage timeline**; clicking a stage shows its records in an **Excel-style
 grid** (shadcn `Table`) with one editable cell per field. Existing rows save on **blur**
 (and Enter on the last field); the draft add-row only saves on Enter in the last field.
 Enter on earlier fields moves focus forward. Select/boolean/multiselect save immediately
 on change. Unsaved rows show a dashed amber border around the whole row; saving/saved/error
 use solid row borders.
 Required-field validation only fires on advance, so cells edit freely even with no data.
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
 - A permanent **empty add-row** at the bottom of the **first** stage; pressing Enter on
 the last field creates a record (`recordApi.create`) then saves the values. If the value save
 fails the just-created record is **rolled back** (deleted) and the draft is kept so
 the user can fix it — no orphan empty rows. After a successful create, the grid
 navigates to the last page so the new row is immediately visible.
   - **"Bulk Add"** button appears in the toolbar when the selected stage is the
     first stage and has at least one field. Opens `BulkImportModal`: textarea
     (one entry per line for a single field; CSV rows when multiple fields — column
     order hint shown in the modal), Import button with live line count, non-closable during
     import (backdrop + Escape blocked), blocked on backdrop/Escape if textarea has
     content. After import shows succeeded/failed summary; failed entries listed with
     1-based line number, original value, and error; "Edit failed entries" re-populates
     textarea with only the failed lines for retry.
   - **"My data" / "All data"** filter (`Select` in toolbar) sends `?mine=true`; backend returns records where `created_by = uid` OR the user appears in any `RecordTransition` for that record (`moved_by = uid`), i.e. records touched at any stage. Defaults to My data. Status filter is also a `Select` (all / open / processing).
  - Empty stage (no fields) shows an **Add fields** button that switches to the Stages tab.
  - `components/ui/` holds shadcn primitives (button, badge, table, input, select,
    dropdown-menu, popover, dialog, sheet); `components.json` configures the shadcn CLI.

## Query patterns & performance

- **No read N+1 on list endpoints**: record listing uses `With("Values")` (batched preload),
 history resolves users/stages with two `WhereIn` queries, stages use `With("Fields")` +
 `With("UniqueConstraints")` (batched). Goravel `With()` maps to GORM `Preload()` — one
 `IN` query per association, not one per parent row.
- **Bulk import**: uniqueness targets are pre-loaded once via `services.NewBulkUniquenessChecker`
 before the per-line transaction loop, eliminating 2×N extra schema queries.
- **`StoreValues` / `seedInheritedValues`**: rows are accumulated and inserted in a single
 batch `tx.Create(&rows)` call rather than one INSERT per entry.
- **Constraint field-key validation**: single `WhereIn("key", keys)` instead of N `First` calls.
- **Analytics**: uses `GroupBy` + `Scan` aggregation queries (records per stage/status,
 throughput per day) — never loads all record rows into memory.
- **`EnforceUniqueness`**: still does one SELECT + one INSERT per uniqueness target per call;
 the per-target selects are bounded by the stage schema (typically 1–5 targets). This is
 the expected cost for each individual value-save or advance.

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
