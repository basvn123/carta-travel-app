# trailslab: trails and daytrips content lab

Local PostGIS + pgRouting staging DB for the trails and daytrips vertical.
Strictly local: this stack never touches the live Supabase project. Content
moves through a status workflow (draft, needs_review, approved, published,
rejected) and only approved rows are ever exported towards the app.

## Requirements

Docker Desktop (or any Docker engine with the compose plugin). On this dev
machine Docker Desktop lives in the per-user location
`%LOCALAPPDATA%\Programs\DockerDesktop`; if a shell cannot find `docker`,
prepend `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin` to PATH (that
directory also holds `docker-credential-desktop`, which image pulls need).

## Start

    cd tools/trailslab
    docker compose up -d

First start applies `initdb/01_schema.sql` automatically. The DB listens on
port 5433 (the machine's native PostgreSQL 18 owns 5432).

After schema edits, recreate from scratch (the init scripts only run against
an empty volume):

    docker compose down -v && docker compose up -d

## Verify

From the repo root:

    python pipeline/trails/smoke_test.py

Expected: [ok] lines for extensions, a 3D geometry round trip, the images
NC/ND rejection guard and cascade cleanup, then PASS.

## Valhalla routing (gap repair, daytrip legs)

`valhalla/` holds a second compose stack running a local Valhalla router.
It builds per-country graphs from the same Geofabrik extracts the ingest
step caches under `data/raw/geofabrik/`; never build a full Europe graph on
this machine. Stage an extract and start the build (first build for
Switzerland takes roughly 15 to 45 minutes; the service answers on port
8002 only after tiles exist):

    python tools/trailslab/valhalla/prepare.py --country switzerland --up --wait

Switching country restarts the container over that country's tile
directory. After restaging a fresher extract (`--refresh`), add
`--force-rebuild`, because Valhalla otherwise reuses the existing tiles.

With the router up, repair trips that fail the continuity check (gaps above
50 m between geometry parts) by routing across each gap with pedestrian
costing and splicing the result:

    python pipeline/trails/repair.py --countries CH --limit 5
    python pipeline/trails/repair.py --check-only --countries CH

Repaired geometry lands in `trip_repairs` next to the untouched original,
auto-accepted only when every gap was bridged and the length divergence
stays within 15 percent; anything else is flagged needs_review. Re-running
the check prefers fresh accepted repairs, so repaired trips pass.

## Reviewing and approving

`review/` holds the local admin app that decides what leaves staging: a Vite
and React queue of `needs_review` trips over a FastAPI process that binds
127.0.0.1 and talks only to this DB. Approving there is the only path to
`status = approved`, and approval publishes nothing by itself.

    python tools/trailslab/review/api/server.py
    cd tools/trailslab/review && npm install && npm run dev   # http://127.0.0.1:5174/

Every decision appends a `trip_reviews` row (action, reviewer, note, edited
fields, score at the time), so the human half of the ledger sits next to the
automated `validation_runs` half. See `review/README.md`.

## Scheduling and regression

The lab is driven by the repo's one orchestrator, `run_pipeline.py`, not by a
separate scheduler. Four tasks (`python run_pipeline.py --list`):

| task | cadence | what fires it |
| --- | --- | --- |
| `trails_ingest` | quarterly | its own clock; re-downloads the Geofabrik extracts |
| `trails_elevation` | after | a completed `trails_ingest` (geometry may have moved) |
| `trails_validate` | after | a completed `trails_ingest` or `trails_elevation` |
| `trails_popularity` | monthly | its own clock |

`after` is not an interval: the task is due when something it follows
succeeded more recently than it did, and a chain that starts in one run
finishes in that same run. All four are soft (a failure never blocks the app's
data ship) and guarded on this container being up, so a stopped lab SKIPS them
instead of failing the run. None of them touches `app_data.json`.

`trails_validate` runs `validate.py` and then `regression.py`. Validation
routes drafts only, which is what keeps `approved` human-only; the regression
gate is what watches content a human already cleared. A published trip whose
refreshed `quality_score` falls below the review threshold (60) is demoted to
`needs_review` and reopened in the review queue, with a `validation_runs` row
(`check_name='quality_regression'`) and a `trip_reviews` row
(`action='reopen'`, reviewer `pipeline:trails_validate`) recording why.
Published content is never unpublished, rejected or deleted by automation, and
a trip that merely slipped more than 15 points below its score at review time
stays published as a `watch` entry.

The outcome is written to `data/derived/trails_freshness.json` and folded into
`data/derived/freshness_report.json` under `"trails"`, so one report covers
both fare staleness and content health.

    python run_pipeline.py --only trails_validate --dry-run   # read-only, against staging
    python run_pipeline.py --only trails_validate             # validate + demote
    python pipeline/trails/regression.py --statuses published,approved --verbose

The dry run really does execute against the staging DB: a sampled validation
pass plus the full regression detection, writing nothing and moving nobody, so
you can see which trips a real run would demote before it demotes them.

## Connect

`pipeline/trails/db.py` provides `connect()`. Defaults match the compose
file; override via TRAILSLAB_HOST / TRAILSLAB_PORT / TRAILSLAB_DB /
TRAILSLAB_USER / TRAILSLAB_PASSWORD in the repo-root `.env`
(see `pipeline/env_local.py`).

## Schema overview

- `trips`: hikes and daytrips, geometry(MultiLineStringZ, 4326), quality and
  validation bookkeeping, raw upstream tags.
- `trip_repairs`: gap-repaired geometries alongside the untouched original,
  with divergence bookkeeping (initdb/02, also applied by repair.py).
- `trip_stops`: ordered stops with per-leg mode, duration and 2D leg geometry.
- `images`: candidate imagery; NC and ND licenses are rejected at insert.
- `validation_runs`: append-only automated check results per subject,
  including the `quality_regression` rows that demote published content.
- `trip_reviews`: append-only human decisions (initdb/04, also applied by the
  review app and by regression.py), the audit trail behind the publish gate.
- `portal_trails`: official national portal geometries for cross-validation.
- `data_sources`: refresh cadence and attribution template per source. The
  license ledger of record is `docs/tos/data_licenses.md` (section 7).

## Composing daytrips

`pipeline/trails/compose_daytrips.py` turns an anchor destination from the
app catalogue into a timed day: its best POIs (ranked exactly as the app's
day planner ranks them), optionally one staged hike under four hours at the
head of the day, sequenced by a greedy nearest-neighbour walk that honours
dwell times and opening hours. Results land as `trips` rows with
`category='daytrip'` and one `trip_stops` row per stop.

    python pipeline/trails/compose_daytrips.py --pilot --dry-run
    python pipeline/trails/compose_daytrips.py --dest gem:interlaken
    python pipeline/trails/compose_daytrips.py --dest BGO --transport drive

Legs come from the local Valhalla (walking and driving) and the public
Transitous plan API (transit), falling back to a straight-line estimate when
neither answers. Two things to know before reading the output:

- Valhalla holds ONE country's tiles at a time. Asked for a point outside
  them it does not refuse: it snaps to the nearest edge it has, which can be
  tens of kilometres away, and answers with a confident route between two
  places nobody asked about. The composer measures that snap distance and
  refuses anything over a kilometre, so composing a French or Norwegian day
  against Swiss tiles gives estimated legs, clearly marked, instead of
  fiction. Stage the country first for routed legs:
  `python tools/trailslab/valhalla/prepare.py --country norway --up --wait`.
- Opening hours are assumed, not harvested: the catalogue carries none, so
  the composer uses one documented high-season window per POI kind and stamps
  `hours_assumed` on every stored daytrip.

Composed daytrips are drafts. Recomposing one that a curator already approved
or published demotes it to `needs_review` rather than rewriting live content
underneath them.

## Publishing into the app

`pipeline/trails/export_wire.py` is the last gate: it promotes `approved` to
`published` and writes the app's static JSON. Approve stays a human decision
in the review UI; publishing is a separate step so the review queue can run
ahead of a release, and so `regression.py` can pull live content back into the
queue without rewriting anyone's decision. Every promotion leaves both ledger
halves: a `validation_runs` row (`check_name='published'`) and a
`trip_reviews` row (`action='publish'`, reviewer `pipeline:trails_export`).

    python pipeline/trails/export_wire.py --dry-run --verbose
    python pipeline/trails/export_wire.py
    python pipeline/trails/export_wire.py --countries CH --tolerance 10
    python pipeline/trails/export_wire.py --no-promote      # re-export only

What it writes, under `continent-app/public/trails/`:

- `{CC}.json`, one file per country: published trips with the fields a list
  or a map overlay needs, each line simplified with Douglas-Peucker at 20 m
  (in EPSG:3035, so the tolerance means the same thing across Europe), plus
  per-trip `attribution_text` and `source`.
- `trip/{id}.json`, fetched only when a trip is opened: full-resolution 3D
  geometry, the whole description, the DEM profile and the stops.
- `index.json`: which countries hold anything, with per-category counts.

The split is a licensing decision as much as a payload one. The `trips` table
is an ODbL derived database, so shipping it in bulk would carry share-alike
onto anything built from the app's data. Publishing selected, measured,
described, human-approved items keeps this in produced-work territory, and
the credit travels with each item instead of living only in the footer.

A country with nothing published still gets a file with an empty `trips`
array, because under `public/` a missing JSON is served as the SPA index with
status 200. The app's loader (`continent-app/src/lib/trails.js`) checks the
content type for the same reason. Detail files for trips that are no longer
published are pruned on every run.

    cd continent-app && node scripts/verify_trails_export.mjs

verifies the served artifacts end to end and checks that the home footer's
Data sources block renders the credits the licenses ask for.
