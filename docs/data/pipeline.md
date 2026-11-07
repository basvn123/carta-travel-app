# The data pipeline

Written for T1085 (ROADMAP B2) from the code, not from the retired `archive/docs-2026-11/PIPELINE.md`. Source of truth: `run_pipeline.py` (the CLI, planner and runner) and `pipeline/tasks/` (the `TASKS` table, one module per domain since T1207, ROADMAP A2). Where the code could not settle a point, it says "not verified".

## What it is

`run_pipeline.py` is one orchestrator over the scripts in `pipeline/` and the collectors in `src/ingestion/`. It runs a list of 91 tasks (`TASKS`, from `pipeline/tasks/registry.py`, which joins the domain modules `pipeline/tasks/<domain>.py` in the `DOMAINS` order of `pipeline/tasks/__init__.py`; `python run_pipeline.py --list` prints key, cadence, last success and due). `last` (photo_sources, trailslab_worker) is always the final module. `tests/test_pipeline_tasks_registry.py` pins the table to `tests/fixtures/pipeline_tasks.json`: a task change refreshes it with `python tests/test_pipeline_tasks_registry.py --write`. Each task has a cadence, optional guard, and either `cmds` (argv lists run in order) or a `run` function. Nothing in it calls the Claude API (not used).

## How to run

| Command | Effect |
|---|---|
| `python run_pipeline.py` | Run every task that is due, then ship |
| `--dry-run` | Print the plan, run read-only probes, write the freshness report, run nothing |
| `--list` | Table of tasks and due state |
| `--only a,b` | Force these keys, ignore due. Alias `poi_enrich` expands to `poi_images`, `must_descs` (`TASK_ALIASES`) |
| `--max-cadence weekly\|monthly\|quarterly` | Ceiling by tier; due tasks above it are logged as HELD BACK |
| `--also k1,k2` | Admit these tasks above the ceiling, plus the `after` tasks that follow them |
| `--max-hours N` | Start no `--also` task once the run is N hours old (they stay due) |
| `--ship build\|data\|none` | Default `build` (`npm run build` in `continent-app/`); `data` runs `node scripts/sync-data.mjs` only |
| `--no-backup`, `--force`, `--allow-backfill` | Skip master backup; bypass concurrency guard; let a non-terminal run a backfill task |

Exit code is 1 when any task or the ship failed, 2 when the concurrency guard aborted, else 0.

## Cadence and due rules

| Cadence | Constant | Rule (`is_due`) |
|---|---|---|
| weekly, monthly, quarterly | `CADENCE_DAYS` = 7, 30, 90 | Due when that many days passed since `last_success`, or never run |
| after | none | Due when a task named in its `after` list succeeded more recently than it did. Never due on a lab where the trigger never ran |
| backfill, manual | none | Never due. `--only` refuses a backfill task without a terminal unless `--allow-backfill` |
| `rev` | per task string | A task whose recorded `rev` differs from its own is due whatever its clock says (T640) |

`CADENCE_RANK` orders the ceiling: weekly 1, monthly 2, after 2, quarterly 3, backfill and manual 9. Tasks run in `TASKS` list order; when a task succeeds, `chain_followups` appends newly due `after` tasks to the END of the plan, so a chain finishes in one run.

## Task groups (list order)

| Group | Keys |
|---|---|
| Raw mirror, demand | `ingestion` (`python -m src.ingestion.run_all`), `demand_events` |
| Rating spine | `fame`, `poi_significance`, `country_context`, `rating_v5_profile`, `hero_audit`, `image_audit` |
| Coverage gaps | `coverage`, `register_intake`, `audit` |
| Natural layers | `bathing_water`, `beaches`, `lakes`, `mountains`, `beach_context`, `peak_context`, `lake_detail` |
| Trips, joins, regions | `trips`, `routes_attach`, `joins`, `regions` |
| Explore fill | `crowding`, `transit_lines`, `airports`, `sea_temp`, `climate_daily`, `dest_overlays`, `poi_fees`, `outdoor_pages`, `dossier` |
| Prices | `flight_routes`, `tourist_premium`, `food`, `stays` |
| Trails lab chain | `trails_ingest` then `trails_elevation`, `trails_validate`, `trails_regionize`, `trails_hierarchy`, `trails_curate`, `trails_scenic`, `trails_images`, `trails_way_tags`, `trails_attributes`, `trails_rate`, `trails_summaries` (T1201: rebuilds data/trails/summaries.json from the wire `trails_rate` exported); plus `trails_popularity`, `trails_registry`, `trails_splice`, `trails_route_bridge` (T1183: after `trails_splice`, before `trails_curate`, skipped unless `CARTA_TRAILS_ROUTE_BRIDGE=1` and BRouter is up), `trails_derive_routes`, `trails_forests`, `trails_fields` |
| Cycling chain | `cycling_harvest`, `cycling_enrich`, `cycling_photos`, `cycling_bridge`, `cycling_publish` |
| Backfill (manual) | `geonames`, `nature`, `climate`, `guide`, `images`, `activities`, `overture`, `must_descs`, `poi_images_wikidata`, `poi_images` |
| Late | `unesco`, `events`, `parking`, `field_stubs_report`, `ask_index`, `photo_sources`, `trailslab_worker` |

The `features` task was retired 2026-09-02 (docstring "NATURAL FEATURES: RETIRED"); `pipeline/features` is not in the tree.

## Task flags

| Flag | Meaning |
|---|---|
| `writes_app_data` | Task read-modify-writes `app_data/app_data.json`: takes the lock, triggers the backup, counts toward the ship |
| `writes_wire` | Task writes files under `continent-app/public/`; counts toward the ship |
| `soft` | A failure is logged (SOFT-FAIL) and does not stop the run or the ship; it retries next run |
| `guard` | `(ok, reason)`; `ok=False` SKIPS the task, not a failure. Examples: `guard_trips`, `guard_regions`, `guard_trailslab_up`, `guard_brouter_up`, `guard_ask_index` |
| `partial_rc` | Exit code that means "saved what it did, ran out of time": task stays due, counted as soft-failed |
| `retries` | Per-cmd retries, 30 s apart, resumable harvesters pick up from cache |

A non-soft failure stops the loop ("stopping before ship to avoid shipping half data"). `RESCORE_LAYERS` tasks (`beaches`, `lakes`, `mountains` and others) refuse to run while a rescore of that layer is live (marker age limit `RESCORE_MARKER_MAX_AGE_S` = 48 h) and write a hold file while they run.

## Safety and state

| Item | Path or constant |
|---|---|
| Cadence state | `logs/pipeline_state.json` (`STATE`): per task `last_success`, `rev`. Gitignored, never clean `logs/` wholesale |
| Lock | `logs/pipeline.lock` (`LOCK`), taken only when the plan has a `writes_app_data` task; stale locks cleared on POSIX |
| Concurrency guard | `other_python_running()`: Windows `tasklist`; POSIX any other python running a script under `pipeline/`, `src/`, `src.` or `run_pipeline.py` |
| Master backup | `app_data/backups/app_data.<UTC stamp>.json`, once per run before the first writer; `KEEP_BACKUPS` = 6 timestamped copies kept |
| Run log | `logs/pipeline_<date>.log` |
| Freshness report | `data/derived/freshness_report.json` (`FRESHNESS_REPORT`); holds a `trails` section from `data/derived/trails_freshness.json` |
| Dead-man switch | `CARTA_HEARTBEAT_URL` (pings base, `/start`, `/fail`; no-op when unset) |
| Admin telemetry | `CARTA_SUPABASE_URL`, `CARTA_SUPABASE_SERVICE_KEY` insert one row into `public.pipeline_runs`; no-op when unset, never fails the run. Layer counts come from `_LAYER_INDEX_FIELDS` plus the count of `continent-app/public/region/*.json` |

## Ship step

After the loop, if tasks ran, none failed, and at least one had `writes_app_data` or `writes_wire`: `--ship build` runs `npm run build` in `continent-app/`, `--ship data` runs `node scripts/sync-data.mjs`. A failed ship adds `ship` to `failed`. Deploy to Cloudflare is not in `run_pipeline.py`; see `docs/areas/deploy.md`.

## Inputs and outputs

| Kind | Where | Note |
|---|---|---|
| Master | `app_data/app_data.json` (`APP_DATA`) | Gitignored; absent in a fresh clone or sparse worktree, pulled from R2 on the Hetzner box |
| Caches | `cache/*.json`, `cache/<layer>/` (`CACHE`) | Harvest snapshots; hours to rebuild, never delete. Present in this checkout: for example `cache/dest_pageviews.json`, `cache/wikivoyage.json`, `cache/eea_bathing_water.json`, `cache/geonames_cities500.txt`. Absent here: `cache/trips/`, `cache/regions/` (built on the build box) |
| Derived data | `data/derived/`, `data/reports/`, `data/trails/` | Intermediate and report files (for example `data/reports/coverage_gaps.json`) |
| Wire | `continent-app/public/` (`beaches/`, `lakes/`, `mountains/`, `trails/`, `cycling/`, `trips/`, `region/`, `coverage.json`, `joins.json`, `destinfo/`, `dossier/`, `search/`) | What the app loads. Contract: `docs/SCHEMA.md` |
| Reports | `reports/` | `coverage_*` files are written by `pipeline/regions/coverage.py`, see `docs/data/coverage.md` |
| Trails and routing tools | `tools/trailslab/` (PostGIS lab, `TRAILSLAB_PORT` default 5433), `tools/brouter/` | A lab that is down SKIPS the trails tasks via guard |

## Schema version

`meta.schema_version` is 19 in the live master (`docs/SCHEMA.md` header). It is written by each layer's writer with `max(existing, N)`; the 19 comes from `pipeline/apply_rating_layer.py` (master and served copy). It is pinned in `continent-app/scripts/ci/contract.mjs` as `EXPECTED_SCHEMA_VERSION` = 19 and checked by `continent-app/scripts/ci/check-contract.mjs` (workflow `schema-contract.yml`). There is no `pipeline/schema.py`.

## Where it runs

| Host | Entry | Status |
|---|---|---|
| Windows laptop | `run_pipeline.bat` (header: Task Scheduler job `TravelAppFareRefresh`, Monday 09:00) | Legacy schedule; whether it is still enabled is not verified from code |
| Hetzner always-on box (`infra/hetzner/cax11/`) | `carta-weekly.timer` (Monday 09:00 `Europe/Brussels`, `Persistent=true`) starts `carta-weekly.service`, which runs `weekly.sh` then `run_pipeline.sh` | In production (owner confirmed). Unit file sets `TimeoutStartSec=48h` |
| Hetzner on-demand box (`infra/hetzner/cax41/`) | Task `trailslab_worker` runs `infra/hetzner/cax41/trailslab_worker.py run` | In production (owner confirmed); guarded by `trailslab_worker.py check` (needs the switch, `HCLOUD_TOKEN`, R2, worker key) |

`run_pipeline.sh` wraps the driver: flock `logs/carta-run.lock`, secrets via `load-env.sh`, venv resync, R2 pull of the master and state when missing, the run, database dumps, R2 push of the master and state after a good run, then `push-data.mjs --live` when `VITE_DATA_BASE` is set, and an optional deploy with `CARTA_DEPLOY=1`. Its env keys: `CARTA_MAX_CADENCE` (default `weekly`, or `all`), `CARTA_EXTRA_TASKS` (passed as `--also`), `CARTA_MAX_HOURS` (16 when extras are set), `CARTA_SHIP`. The values set on the production box live in its secrets file and are not verified here; `infra/hetzner/cax11/env.example` leaves both blank. With a weekly ceiling, monthly and quarterly tasks (`trips`, `regions`, `coverage`) only run when named in `CARTA_EXTRA_TASKS` or by hand. See also `docs/areas/build-box.md`.

## Gotchas

- A writer that nulls fields for destinations absent from its cache (`patch` in the images, activities and wikivoyage tasks) is kept out of every automatic tier as `backfill` and is coverage guarded (`guard_cache_covers`: 0.95 for `images` and `activities`, 0.90 for `guide`).
- `fame_step` deletes `cache/dest_pageviews.json` (forcing a fresh fetch) only when at most `FAME_CLEAR_TOLERANCE` = 15 destinations lack a resolvable article; otherwise it runs additively so fame goes stale rather than missing. `apply_rating_layer` refuses to write when its validation gate fails.
- Under POSIX the driver installs a SIGTERM handler so a systemd stop releases the lock and reports the run as failed.
