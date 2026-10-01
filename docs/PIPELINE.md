# run_pipeline.py, what it actually does

An audit of the orchestrator as it stands at T029. Nothing here changes the
code. It exists so the person porting the pipeline to cron (T048) and the
person who next changes the data contract can read the behaviour instead of
inferring it from 2,672 lines.

`run_pipeline.py` is one entry point for 64 tasks (65 at T029; T261 turned
`poi_enrich` into an alias). Each task declares how often
it wants to run, and the driver runs the ones that are due. You schedule one
job, weekly, and every layer self-selects its own frequency underneath it. The
whole design exists because almost every harvester does a full read, modify,
write of the roughly 50 MB `app_data/app_data.json` master, which makes two
writers at once a silent data loss.

## Cadence tiers and how "due" is decided

Five tiers. Four have an interval, one is event-driven, one never fires on its
own.

`weekly` is 7 days, `monthly` is 30, `quarterly` is 90 (`CADENCE_DAYS`, line
179). A task with one of these is due when `now - last_success >= interval`, or
when it has no `last_success` at all. A task that has never run is always due,
which is how a fresh clone bootstraps itself.

`after` has no interval. The task declares `after: [other keys]` and is due
when any of those keys has a `last_success` strictly newer than its own
(`is_due`, line 2387). A task whose trigger has never run is never due, so a
fresh clone does not try to validate an empty staging database. This is the
chain tier: `trails_ingest` leads to `trails_elevation` leads to
`trails_validate`, and `cycling_harvest` leads to `cycling_enrich` and onward.

`backfill` is the tier that never comes due. `CADENCE_DAYS.get("backfill")`
returns `None` and `is_due` returns `False` (line 2399). The only way one runs
is `--only <key>`. Ten tasks carry it, and this is the single most important
fact in this document for a cron port. (Eleven at T029: `poi_enrich`, which
T028 missed, is now an alias for `poi_images` then `must_descs`.) Since T261
`--only` refuses a backfill task, or an alias that names one, unless stdin is
a terminal, the run is `--dry-run`, or `--allow-backfill` is passed, so a
timer, a script or an agent cannot reach these writers by accident either.

`manual` appears in `CADENCE_RANK` but no task currently uses it. It behaves
exactly like `backfill`.

Ranking is separate from interval. `CADENCE_RANK` (line 184) maps weekly to 1,
monthly and `after` to 2, quarterly to 3, and backfill and manual to 9.
`--max-cadence weekly` sets a ceiling of 1, so only rank-1 tasks are
considered. `after` deliberately shares rank 2 with monthly so a monthly-tier
run still finishes a chain a quarterly ingest started. Backfill's rank of 9 is
above every selectable ceiling, which is the second, independent reason it
never runs without `--only`.

### last_success, and what writes it

`logs/pipeline_state.json` is the only memory the driver has. It is a flat map
of task key to `{"last_success": "<ISO 8601 UTC>"}`, plus one extra top-level
key, `fares_freshness`, holding the per-origin refresh ledger.

The stamp is written immediately after a task succeeds and `save_state` is
called on the spot (line 2611), not batched to the end. An interrupted run
therefore keeps credit for everything that finished before the interruption.
A task that fails, soft-fails or is skipped by a guard writes nothing, so it is
still due next run. That is the whole resume story: there is no other
checkpoint, and the harvesters resume from their own caches underneath.

The current state file records only 11 of the 65 keys, the newest from
2026-07-31. The other 54 have never recorded a success on this machine, which
means a plain `python run_pipeline.py` today would consider all of them due.

### The flags, and how they interact

`--only key[,key]` names the tasks explicitly and skips the due check entirely
(`select_tasks`, line 2426). An unknown key exits with a listing of the known
ones. `--only` also disables `chain_followups` (line 2413): when the operator
names what should run, the driver does not add to it.

`--max-cadence weekly|monthly|quarterly` sets the `CADENCE_RANK` ceiling. It
has no effect under `--only`.

`--dry-run` prints the plan, writes the freshness report, runs each planned
task's read-only probe if it has one, and returns 0 before touching anything
else. Three tasks have probes: `trails_validate` (sampled validation plus full
regression detection), `hero_audit` (classify heroes, replace nothing) and
`dossier` (audit the shipped dossiers, build nothing). Note that `--dry-run` is
not perfectly inert: it always writes `data/derived/freshness_report.json`, and
`hero_audit`'s probe is network-heavy on its first run.

`--force` bypasses two things and only two: the other-python concurrency check
and the lock file (lines 2550 to 2561). It does not bypass guards, the due check or
anything else.

`--no-backup` skips the pre-write master backup. The driver's own usage text
calls it "not advised".

`--ship build|data|none` decides what happens after the tasks. Default is a
full `npm run build`.

`--max-origins N` only affects the `fares` task, turning it into a targeted
refresh of the N stalest, highest-priority origins.

Skip flags in the pipeline's other sense, the `--no-images` and `--seed-only`
style switches on individual layer scripts, are not a `run_pipeline.py`
concept. They live in the layer scripts and are covered by
`pipeline/verify_skip_flags.py`, a Manual tool.

### The lock file

`logs/pipeline.lock` is taken only when the plan contains at least one task
with `writes_app_data: True` (line 2550). Wire-only and report-only plans take
no lock. The lock holds the writing process's PID and an ISO timestamp, and it
is released in a `finally` block so it survives a task raising. It does not
survive the process being killed, and the driver says so: delete it if that run
is dead, or use `--force`.

Alongside the lock there is a second, cruder guard: `other_python_running()`
shells out to `tasklist` on Windows (or `pgrep` elsewhere) and aborts with exit
code 2 if any other python process exists. Any other python, not just a
pipeline one. That is deliberate, because the repo's concurrent-session gotcha
is that a hand-run script in another terminal clobbers the master, but it also
means the pipeline refuses to start while an unrelated python is open.

## Ordering and dependencies

The plan is built in `TASKS` list order, and the runner executes it in that
order. There is no topological sort. Three separate mechanisms carry the real
dependencies.

The first is list order itself, and it is load-bearing for the fare chain.
`tp_stage` must precede `fares` so the Ryanair patch merges fresh Travelpayouts
staging. `fares` must precede `wizz_fares`, which must precede `vueling_fares`,
which must precede `volotea_fares`, because each carrier merges cheapest-wins
onto the table the previous one left. `fare_history` archives the fully merged
result, and `fare_model` trains on that archive. Reordering the `TASKS` list
would silently break this. Nothing in the code asserts it.

The second is the `after` field, which is explicit and checked. The trails
chain is `trails_ingest` to `trails_elevation` and `trails_regionize` and
`trails_hierarchy`, then `trails_splice` plus those into `trails_curate`, then
`trails_scenic`, `trails_way_tags`, `trails_images`, `trails_attributes` and
finally `trails_rate`. Cycling runs `cycling_harvest` to `cycling_enrich` to
`cycling_photos` and `cycling_bridge`, then `cycling_publish`. `routes_attach`
follows `trails_rate` and `cycling_publish`, and `joins` follows the four
feature layers plus `trails_rate`.

The third is `chain_followups` (defined at line 2407), which is what makes a chain finish
in one run instead of one link per scheduled run. After every successful task
the driver re-checks every `after` task not already in the plan and appends the
newly-due ones to the list it is currently iterating. Appending to a list while
iterating over it is intentional here: Python picks the new entries up on the
next loop.

Cross-task reads that are encoded only by list order: `beaches` and `lakes`
both need `cache/eea_bathing_water.json`, which the `bathing_water` task
writes. Their guards refuse to run without it and name the task to run first.
Until T261 `bathing_water` sat later in the `TASKS` list than both, so a fresh
machine skipped both layers on its first quarterly run; it now sits directly
before `beaches`, with a comment saying why.

## Guards

A guard returns `(ok, reason)`. A false guard skips the task; it is never a
failure, so it does not stop the run and does not stamp `last_success`.

`guard_cache_covers(path, min_ratio)` is the null-risk guard, and it is the one
that matters most. Three harvesters (`harvest_activities`, `harvest_images` and
`apply_wikivoyage`) do a `patch()` that writes the field for every destination
in their cache and nulls it for every destination that is not. A cache
harvested before the catalogue grew therefore erases the field for every new
destination, silently. The guard counts the cache's keys against the live
destination count and refuses below the ratio: 0.95 for `images` and
`activities`, 0.90 for `guide`. This is the same class of bug as the
airport-anchored city centres incident, where `harvest_activities.patch()`
nulled destinations absent from the cache.

The guard is real but it is not the whole defence, because all three of these
tasks are `backfill` and so only reachable through `--only` anyway. The guard
is what stops a human forcing them at the wrong moment.

`guard_trailslab_up` opens a TCP connection to the trails lab (default
localhost:5433) and skips on refusal. Twenty tasks use it.
`guard_brouter_up` additionally checks 127.0.0.1:17777 and is used by
`cycling_bridge` alone. Both exist because the labs are local Docker
containers, not part of the ship, so a lab that is down is a documented state.

`guard_regions`, `guard_beaches`, `guard_lakes`, `guard_mountains`,
`guard_trips` and `guard_dossier` each check that the layer's own scripts are
present, plus the specific caches whose absence would cause a quiet degradation
rather than a loud failure. `guard_lakes` is the strictest: it wants the EEA
cache, the CHELSA climate crop and at least 20 Geofabrik extracts, because
without them a lake ships with no swimming verdict, no season and no national
list, and nothing errors.

A guard is called with `ctx`. A zero-argument guard raises `TypeError`, which
is why they all declare `ctx=None`; the code comment says so above `TASKS`.
Until T261 that exception took the whole run down. It now fails the task like
any other exception (see "Failure behaviour").

There is one more guard that is not in the guard slot at all. `fame_step`
(line 931) measures how many destinations have a resolvable Wikipedia article
before it deletes `cache/dest_pageviews.json`, and keeps the cache if more than
`FAME_CLEAR_TOLERANCE` (15) would lose their fame. The reasoning is worth
reading in place: `resolve_dest_articles.py` exits 0 even when Wikipedia rate
limits it, so a successful exit does not mean the refill will work, and the
clear is unconditional while the refill is not.

## Failure behaviour

A task that fails has two possible outcomes, decided by its `soft` flag.

A hard failure (`soft` absent or false) appends the key to `failed`, logs
"stopping before ship to avoid shipping half data", and `break`s out of the
loop (line 2623). Every later task in the plan is abandoned. The ship is
skipped, the freshness report still runs, and the process exits 1. Twenty
tasks are hard: the four carrier fare tasks, `fame`, `flight_times`,
`crowding`, `bathing_water`, `lodging`, `staytiers`, and all ten backfill
tasks. The carrier fare tasks are on the manual cadence since T255 and the
backfill ten are unreachable without `--only`, so only the other six can stop a
scheduled run.

A soft failure logs "SOFT-FAIL", appends to `soft_failed`, and the run
continues. Nothing is stamped, so the task is due again next run. Soft is for
the estimation and ingestion layer and for every layer that is not on the fare
critical path: 44 of the 64 tasks are soft.

A task that raises, as opposed to returning false, is a failed task (T261).
The guard, the rescore hold, the master backup and the task's `run(ctx)` or
`cmds` sit in one try per task; an exception logs `RAISED` with its traceback
and then takes the same soft or hard path as a false return, so the state
write, the ship decision, the freshness report, the `pipeline_runs` row and
the heartbeat `/fail` all still happen. Until T261 an exception escaped `main`
and skipped all of them, on exactly the runs nobody watches.

A run stopped from outside, by SIGTERM from systemd (a stop, or the 48 hour
start timeout) or by Ctrl-C, is not a task failure. Nothing ships, but before
the process exits the run reports itself: a `pipeline_runs` row with
`interrupted` among the failed keys, and the heartbeat `/fail`.

Inside a `cmds` list, any non-zero exit fails the task and stops the remaining
commands in that list. There is a `retries` mechanism (line 2591) that sleeps
30 seconds and re-runs the command, relying on the harvesters resuming from
their own caches. Exactly one task sets it: `poi_images`, with `retries: 12`
(line 2290). Every other task gets one attempt per command.

The backup is taken once per run, lazily, before the first task that declares
`writes_app_data` (line 2582). It is a timestamped copy into
`app_data/backups/app_data.<YYYYMMDD_HHMMSS>.json`, pruned to the newest six
(`KEEP_BACKUPS`). One backup per run, not one per task: if three writers run
and the third corrupts the master, the backup is from before the first.

The ship runs only if something ran, nothing failed, and at least one of the
tasks that ran writes the master or the wire. A failed ship appends "ship" to
`failed` and so turns the exit code to 1.

`CARTA_HEARTBEAT_URL`, if set, gets a `/start` ping before the loop and a bare
or `/fail` ping at the end. A ping failure is logged and never breaks the run.
Its purpose is stated plainly in the code: a Scheduled Task that never fires
fails silently, and an external monitor is the only thing that notices.

## The environment it assumes

Windows, specifically. `sys.stdout.reconfigure` is guarded on `win32` because
Task Scheduler hands the process cp1252 and the tasks print accented place
names. `other_python_running` shells to `tasklist` on `nt` and `pgrep`
otherwise, and only the Windows branch parses reliably. `node_exe` and
`npm_exe` fall back to `C:\Program Files\nodejs` when PATH lacks them. The
reserved-filename set (`PRN`, `CON`, `AUX`, `NUL`, `COM0-9`, `LPT0-9`) mirrors
`continent-app/src/lib/fareFile.js` and exists only because of NTFS.

`run_pipeline.bat` is the scheduled entry point. It `cd /d "%~dp0"`, creates
`logs`, appends to `logs\pipeline_run.log` and calls `python run_pipeline.py`
with no arguments. It has been the Windows Scheduled Task `TravelAppFareRefresh`
since 2026-07-31, Monday 09:00, and needs no admin rights.

Paths are all derived from `ROOT = Path(__file__).parent`, so the repo can live
anywhere, but `app_data/`, `cache/`, `logs/`, `data/derived/`,
`data/raw/geofabrik/` and `continent-app/` are all assumed to be siblings under
it.

Environment variables the driver itself reads: `CARTA_HEARTBEAT_URL`,
`TRAILSLAB_HOST` and `TRAILSLAB_PORT`. It also sets `PYTHONIOENCODING=utf-8`
for every child. Everything else is read by the individual scripts, mostly via
`pipeline/env_local.py`, which loads the repo-root `.env`.

External services with rate caps or credentials, as the tasks describe them:
Ryanair, Wizz Air, Vueling and Volotea (live fare APIs, hours per full sweep),
Travelpayouts (`TRAVELPAYOUTS_TOKEN`, skips cleanly when absent), Wikipedia
pageviews (rate limited, and the rate limit is the trap in `fame_step`),
Wikidata and Commons, Overpass (documented as the flakiest source in the tree,
and deliberately not guarded for mountains), NASA POWER (two workers maximum),
Hostelworld and LiteAPI (credentials), Nager.Date and OpenHolidays, OpenSky,
and the EEA and Eurostat open-data portals. Four quarterly sources pin a year
or a snapshot date in their own source and re-emit identical data until a human
bumps it; those tasks print the reminder rather than failing.

Two local Docker containers: the trailslab PostGIS lab on 5433 and BRouter on
17777.

## What a cron port has to change

Concretely, for T048.

`run_pipeline.bat` does not port. It is the scheduled entry point and it is
cmd. The replacement is a crontab line calling `python run_pipeline.py` with
the repo root as the working directory, plus its own log redirect, since the
.bat's `>> "%LOG%"` is how the run-level log gets written at all (the Python
side writes a separate dated log).

Drive letters appear in exactly three places, all of them fallbacks rather than
hard requirements: `_NODE_DIRS` (`C:\Program Files\nodejs` and the x86 twin)
and nothing else. `ROOT` is relative to the file. The reserved-filename escape
is harmless on Linux but must stay, because the fare slices already on disk
carry the escaped names and `fareFile.js` in the app still expects them.

`other_python_running()` needs attention. The `pgrep -f python` branch matches
any process with "python" in its command line, which on a Linux box running
anything else in Python will abort every writer run with exit code 2. It is a
best-effort guard written for a single-user Windows desktop.

The lock file and the state file both live under `logs/` relative to the repo
root. Confirm the cron user can write there. Losing the state file does not
corrupt anything, but it makes every task due at once, which for the fare
tasks alone is around 30 hours of network work.

Nothing in the driver opens a browser or waits on input. `--ship build` runs
`npm run build` in `continent-app/`, which needs node on PATH. No task prompts.

The twenty lab-dependent tasks skip cleanly on a box with no Docker, so a cron
port can simply not run them, but then the trails and cycling wires go stale
with no signal except the freshness report.

The ten backfill tasks must stay off the schedule. They never come due, so
merely porting the cron line is safe; the risk is somebody "fixing" their
cadence, or a script reaching them through `--only`, which T261 refuses
without a terminal. Several of them are the null-risk patch writers.

## The Linux host (T048)

The weekly cadence has a second home: the Hetzner CAX11 orchestrator of
`infra/hetzner/cax11` (T046), Ubuntu 24.04 on arm64. The port is T048's, and
its report, `Execution/P3/T048-pipeline-cron-migration.md`, is the record.
Until the owner has verified it on the box and disabled the Windows task, the
laptop stays the live schedule; the owner steps are in
`Execution/P3/_OPEN-hetzner.md`, steps 9 onward.

The chain on the box is systemd timer, `weekly.sh`, `run_pipeline.sh`,
`run_pipeline.py`. `carta-weekly.timer` (`infra/hetzner/cron/`) fires Monday
09:00 Europe/Brussels, the Windows task's slot, with `Persistent=true` and no
boot-time firing. `carta-weekly.service` gives the run a 48 hour start timeout,
because the laptop's last complete fare chain took 29.8 hours and a oneshot
service is otherwise killed after 90 seconds. `weekly.sh` writes the "cron
fired" line T046's `verify.sh` counts and runs the pipeline only when the
service sets `CARTA_PIPELINE_ENABLED=1`, which the T046 units cloud-init
installs do not; that gate is what stops a freshly provisioned box starting a
harvest ten minutes after boot. `run_pipeline.sh` is the successor of
`run_pipeline.bat`: it takes `logs/carta-run.lock`, loads the secrets file,
re-syncs the venv to `constraints.txt` when the requirements change, pulls the
master and the fare history from R2 when the box lacks them, runs
`run_pipeline.py --max-cadence weekly` (`CARTA_MAX_CADENCE` changes the
ceiling), makes the weekly encrypted database dumps, and packs and pushes what
the run changed. It tees everything to `logs/pipeline_run.log` as the .bat did.

Three behaviours of `run_pipeline.py` differ on Linux, each behind an
`os.name` check so Windows runs exactly as before. The concurrency guard counts
only python processes that run one of this repo's pipeline scripts (a script
under `pipeline/` or `src/`, a `-m src.` module, or `run_pipeline.py`),
resolved against each process's working directory from `/proc`, instead of any
process with "python" in its command line. A lock file whose PID is no longer a
running `run_pipeline.py` is removed as stale, because nobody is at the box to
delete it by hand. SIGTERM, which systemd sends on stop and on timeout, becomes
a normal exit, so the `finally` releases the lock. Node is looked up on PATH
first as before, with `/usr/local/bin` and `/opt/node/bin` as the Linux
fallbacks. `--max-origins N` needed nothing: the freshness report, the
priority ranking and the cache invalidation are plain JSON and `pathlib`.

The box runs the weekly tier only. The monthly and quarterly tasks have not
been verified on arm64, and the heavy ones belong on the on-demand CAX41
(T047), so until a task raises `CARTA_MAX_CADENCE` they run nowhere once the
Windows task is disabled. Since T261 every run under a ceiling says so: a
`HELD BACK by --max-cadence` line names each due task the ceiling keeps out,
so the gap is in every box log rather than only in this paragraph (T048-h).

`infra/hetzner/cax11/verify_tasks.sh` verifies the weekly tasks one at a time
in the order of `weekly_tasks.txt` (cheapest and least destructive first,
the day-long `fares` refresh last, the wire build after it) and records exit
code, wall time, peak memory and the state-file change of each in
`logs/arm64_verify/`. `infra/hetzner/cax11/compare_wire.py` compares two wire
builds, or two shape summaries of them, by file set, keys, schema version and
counts.

## The tasks (65 at T029)

Wall times are the maximum observed in `logs/*.log` where one was recorded.
Fifty-four tasks have no recorded time because they have never completed on
this machine. "Writes" is `master` for `writes_app_data`, `wire` for
`writes_wire`, and "report only" for neither. "Soft" yes means a failure does
not stop the run.

| Key | Cadence | Script(s) | Writes | Guard | Soft | Wall time | Cron-safe |
|---|---|---|---|---|---|---|---|
| `tp_stage` | weekly | src.ingestion.run_all | report only | - | yes | not recorded | yes |
| `fares` | weekly | pipeline/harvest_all_origins.py (graph/harvest/patch/refresh) | master | - | no | 24.5 h | yes, but 24 h |
| `wizz_fares` | weekly | pipeline/harvest_wizzair.py (graph/harvest/patch) | master | - | no | 4.7 h | yes, but 4.7 h |
| `vueling_fares` | weekly | pipeline/harvest_vueling.py (graph/harvest/patch) | master | - | no | 35 min | yes, but 36 min |
| `volotea_fares` | weekly | pipeline/harvest_volotea.py (graph/harvest/patch) | master | - | no | 58s | yes |
| `fare_history` | weekly | src.estimation.snapshot | report only | - | yes | 6s | yes |
| `fare_model` | weekly | src.estimation.drift, src.estimation.model, pipeline/harvest_all_origins.py est | master | - | yes | 2 min | yes |
| `ingestion` | weekly | src.ingestion.run_all | report only | - | yes | not recorded | yes |
| `demand_events` | monthly | src.ingestion.run_all --only holidays,school_holidays | report only | - | yes | not recorded | yes |
| `fame` | monthly | pipeline/resolve_dest_articles.py, harvest_pageviews.py, apply_designations.py, apply_beauty_layer.py, apply_place_layer.py, apply_rating_layer.py | master | - | no | 8 min | yes, the cache clear is self-guarded |
| `coverage` | quarterly | build_place_candidates.py, harvest_place_signals.py, score_place_candidates.py | report only | - | yes | not recorded | yes, report only |
| `poi_significance` | monthly | harvest_pageviews.py, harvest_poi_wikidata.py, harvest_wikivoyage_listings.py, dedupe_pois.py, normalize_poi_kinds.py, score_significance.py, apply_rating_layer.py | master | - | yes | not recorded | yes |
| `country_context` | weekly | country_context_layer.py | master | - | yes | not recorded | yes |
| `register_intake` | monthly | intake/register_intake.py | report only | - | yes | not recorded | yes, report only |
| `audit` | monthly | audit_quality.py | report only | - | yes | not recorded | yes, read only |
| `beaches` | quarterly | beaches/build_beaches.py | wire | beaches | yes | not recorded | yes, guarded |
| `lakes` | quarterly | lakes/build_lakes.py | wire | lakes | yes | not recorded | yes, guarded |
| `mountains` | quarterly | mountains/osm_spine.py, mountains/build_peaks.py, mountains/terrain.py, mountains/season.py, mountains/export_peaks.py | wire | mountains | yes | not recorded | yes, guarded |
| `trips` | monthly | trips/build_trips.py | wire | trips | yes | not recorded | yes, guarded |
| `routes_attach` | after (trails_rate, cycling_publish) | trails/transit_stops.py, trails/derived_activities.py, trails/node_networks.py, trails/attach.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `joins` | after (beaches, lakes, mountains, trails_rate, cycling_publish, trips) | joins/neighbours.py | wire | - | yes | not recorded | yes |
| `regions` | quarterly | regions/build_regions.py, regions/coverage.py, regions/export_regions.py | wire | regions | yes | not recorded | yes, needs geopandas and h3 |
| `flight_times` | monthly | harvest_flight_times.py | master | - | no | not recorded | yes |
| `crowding` | quarterly | harvest_tourism_density.py | master | - | no | not recorded | yes, pinned year needs a human bump |
| `bathing_water` | quarterly | harvest_bathing_water.py | master | - | no | not recorded | yes, pinned year needs a human bump |
| `lodging` | quarterly | harvest_accommodation.py, apply_accommodation_anchors.py, apply_longtail_granularity.py, apply_tourist_premium.py | master | - | no | not recorded | yes, Inside Airbnb snapshot needs a human bump |
| `staytiers` | monthly | harvest_hostelworld.py, harvest_hotels_liteapi.py, apply_stay_tiers.py | master | - | no | not recorded | yes, needs API credentials |
| `trails_ingest` | quarterly | trails/ingest_osm_routes.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_elevation` | after (trails_ingest) | trails/elevation.py, trails/splice.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_validate` | after (trails_ingest, trails_elevation) | pipeline/trails/validate.py, pipeline/trails/regression.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_popularity` | monthly | trails/popularity.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_registry` | monthly | trails/famous_registry.py, trails/coverage_report.py | report only | - | yes | not recorded | yes, reads the wire, no lab |
| `trails_splice` | monthly | trails/splice.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_regionize` | after (trails_ingest) | trails/regionize.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_derive_routes` | quarterly | trails/derive_routes.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_hierarchy` | after (trails_ingest, cycling_harvest) | trails/hierarchy.py, trails/dedup.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_curate` | after (trails_splice, trails_regionize, trails_hierarchy) | trails/curate.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_forests` | quarterly | trails/forests.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_scenic` | after (trails_curate, trails_forests) | trails/scenic.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_images` | after (trails_curate, trails_scenic) | trails/trail_images.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_way_tags` | after (trails_curate) | trails/way_tags.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_attributes` | after (trails_curate, trails_scenic, trails_way_tags) | trails/attributes.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `trails_rate` | after (trails_curate, trails_scenic, trails_images, trails_attributes) | trails/rate.py, trails/export_wire.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `cycling_harvest` | quarterly | cycling/harvest_cycling.py, cycling/splice_cycling.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `cycling_enrich` | after (cycling_harvest) | cycling/cycle_sources.py, cycling/enrich_cycling.py, cycling/splice_cycling.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `cycling_photos` | after (cycling_enrich) | cycling/cycle_images.py, cycling/harvest_cycling.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `cycling_bridge` | after (cycling_enrich) | cycling/bridge_gaps.py, cycling/enrich_cycling.py | report only | brouter_up | yes | not recorded | no: needs the lab and BRouter on 17777 |
| `cycling_publish` | after (cycling_enrich, cycling_bridge) | cycling/seed_bike_rail.py, cycling/cycle_index.py, cycling/stage_planner.py, cycling/validate_cycling.py, cycling/export_cycling.py | report only | trailslab_up | yes | not recorded | no: needs the local Docker lab on 5433 |
| `geonames` | backfill | harvest_geonames.py | master | - | no | not recorded | NO, backfill: never auto-due, several null-risk |
| `nature` | backfill | harvest_protected_areas_osm.py | master | - | no | not recorded | NO, backfill: never auto-due, several null-risk |
| `climate` | backfill | harvest_climate_power.py, apply_climate.py | master | - | no | not recorded | NO, backfill: never auto-due, several null-risk |
| `unesco` | quarterly | harvest_unesco_whc.py | report only | - | yes | not recorded | yes |
| `guide` | backfill | harvest_wikivoyage.py, apply_wikivoyage.py | master | cache_covers("cache/wikivoyage.json" | no | not recorded | NO, backfill: never auto-due, several null-risk |
| `images` | backfill | harvest_images.py | master | cache_covers("cache/wiki_images.json" | no | not recorded | NO, backfill: never auto-due, several null-risk |
| `hero_audit` | monthly | audit_hero_images.py | master | - | yes | not recorded | yes |
| `image_audit` | weekly | images/fix_url_queries.py, images/audit_all.py | report only | - | yes | not recorded | yes |
| `events` | monthly | harvest_events.py, export_destinfo.py | report only | - | yes | not recorded | yes |
| `parking` | quarterly | harvest_parking.py, export_destinfo.py | report only | - | yes | not recorded | yes |
| `activities` | backfill | harvest_activities.py | master | cache_covers("cache/activities.json" | no | not recorded | NO, backfill: never auto-due, several null-risk |
| `overture` | backfill | harvest_pois_overture.py | master | - | no | 9s | NO, backfill: never auto-due, several null-risk |
| `must_descs` | backfill | enrich_must_descs.py | master | - | no | 42 min | NO, backfill: never auto-due, several null-risk |
| `poi_images_wikidata` | backfill | harvest_pois_wikidata_images.py | master | - | no | 1.7 h | NO, backfill: never auto-due, several null-risk |
| `poi_images` | backfill | enrich_images_commons.py, enrich_images_web.py | master | - | no | 62.3 h | NO, backfill: never auto-due, several null-risk |
| `poi_enrich` | alias since T261 | `poi_images`, then `must_descs` | master | - | no | not recorded | NO, the backfill tasks it names |
| `dossier` | monthly | dossier/harvest_landmarks.py, dossier/reclassify_landmarks.py, dossier/harvest_city_intros.py, dossier/fix_airport_listings.py, dossier/harvest_event_dates.py, export_destinfo.py, dossier/web_sweep.py, dossier/plan_research.py, dossier/research_do.py, dossier/build_dossier.py, dossier/fill_licences.py, dossier/audit.py | wire | dossier | yes | not recorded | yes, guarded; first run is about 3 h |

## Bugs and rough edges found

Recorded here and in the T029 report. T261 fixed three of the four; each
paragraph says what changed.

`poi_enrich` (line 2301) duplicates `poi_images` and `must_descs`: it runs
`enrich_images_commons.py`, `enrich_images_web.py` and `enrich_must_descs.py`,
which is exactly the union of the two other tasks' commands. All three are
backfill, so nothing runs twice on a schedule, but `--only poi_enrich` and
`--only poi_images,must_descs` are the same work under two names. They are not
equivalent, though: `poi_images` sets `retries: 12` and `poi_enrich` sets none,
so the same two commands retry twelve times under one key and not at all under
the other. Fixed in T261: `poi_enrich` is no longer a task but an entry in
`TASK_ALIASES`, so `--only poi_enrich` runs `poi_images` (with its retries)
then `must_descs`.

`chain_followups` (called at line 2615) appends to the plan list while the
runner iterates it at line 2571. It works, and the comment says it is
deliberate, but it means the plan printed at the start of a run is not the plan
that executes.

A task that raises rather than returning false bypasses the entire failure
accounting: no state write, no ship decision, no freshness report, no heartbeat
`/fail`. The heartbeat's whole purpose is noticing runs that did not happen, and
this is the one failure mode it cannot report. Fixed in T261, see "Failure
behaviour".

`guard_beaches` and `guard_lakes` both require a cache that the `bathing_water`
task produces, but `bathing_water` sits after them in the `TASKS` list, so on a
fresh machine the first run skips both layers and the second run, 90 days
later, is the first that can build them. Fixed in T261: `bathing_water` now
sits directly before `beaches`.
