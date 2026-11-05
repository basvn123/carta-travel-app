# Trails and cycling data layer

Written by T1085 (ROADMAP B2) from the code, not from the retired docs in `archive/docs-2026-11/`. Every number below names the constant or key behind it. Where the code could not be checked here the line says "not verified". The product rules are in `docs/HANDBOOK.md` (sections "Trails: finding and choosing walks", "Trail rating (0 to 10)", "Trail difficulty", "Cycling routes and the cycle page"); this file is the data-side map. Area doc: `docs/areas/trails-cycling.md`.

## What the layer is

Two route layers built in one local PostGIS lab (`tools/trailslab/`, Docker, port 5433, never the live Supabase project):

- Trails: OSM `route=hiking|foot|walking` relations, plus routes derived from way-level paths for five countries with few relations. Table `trips`.
- Cycling: OSM `route=bicycle` relations, composed multi-day tours on top. Table `cycle_routes`.

The lab is the store of record. The app ships static JSON written by the export scripts, so the wire is a produced work (selected, scored, explained by codes) and not a database extract. Scope is the 43 country catalogue (`CATALOGUE` in `pipeline/trails/curate.py`); Turkey and Ukraine are behind `--include` and ship an empty shell.

## What needs the owner box or network

- The lab container (`cd tools/trailslab && docker compose up -d`). Every `trails_*` and `cycling_*` task has `guard_trailslab_up` in `run_pipeline.py` and SKIPS without it, it never fails.
- The Geofabrik extracts under data/raw/geofabrik (multi-GB, quarterly download by `pipeline/trails/ingest_osm_routes.py`). `trails_fields` needs at least 20 of them (`guard_trailslab_extracts`).
- Copernicus GLO-30 tiles (`BUCKET_DEFAULT` in `pipeline/trails/elevation.py`, data/raw/dem on disk, `--evict-gb 4` bounds it), Overpass (`scenic.py`), Wikimedia Commons (`trail_images.py`, `cycle_images.py`).
- Local routers for repair: Valhalla (`tools/trailslab/valhalla/prepare.py`, one country at a time, `pipeline/trails/repair.py`) and BRouter (`tools/brouter/prepare.py`, port 17777, `pipeline/cycling/bridge_gaps.py`, guard `guard_brouter_up`).
- On the build box the same work runs through `infra/hetzner/cax41/trailslab_worker.py` (task `trailslab_worker`, weekly cadence, spawns only when the last good run is 28 days old; needs `CARTA_TRAILSLAB_WORKER=1`, `HCLOUD_TOKEN`, R2 and a worker key). Owner steps: `Execution/P15/_OPEN-explore-data-runs.md`.
- State of this checkout (2026-11-05): no data/raw and no cache/regions directory; `cache/` holds only trail fame inputs (`cache/trail_pageviews.json`, `cache/trails_osm_fame.json`, `cache/trails_wikidata_famous.json`, `cache/trail_wikivoyage.json`). No lab, so none of the chains below can be re-run here. Only `pipeline/trails/export_stubs.py` and `pipeline/trails/difficulty_gate.py` read wire files and the registry without the lab.

## The trails chain, in order

Task keys are in `run_pipeline.py` (`python run_pipeline.py --list`); the `after` field of each task is the authority for order, the list below is the logical order. Abbreviated, all scripts in `pipeline/trails/`.

1. `ingest_osm_routes.py --refresh` (task `trails_ingest`, quarterly). Geofabrik relations to `trips`, upsert on `(source, source_ref)`, about 236,000 staged rows (figure from the `curate.py` docstring, not re-measured). Gaps recorded in `trips.gap_info`.
2. `splice.py` (`trails_splice`, monthly). Joins breaks up to `SPLICE_M = 300` m with a straight connector; refuses more than `MAX_GAPS = 8` breaks, a single break over `MAX_SPLICE_M = 750` m or a spliced share over `MAX_SPLICE_SHARE = 0.05`. Runs before curate (worth about 10,000 routes per its docstring).
3. `elevation.py --curated` then `splice.py --sync-only` (`trails_elevation`). GLO-30 sampled every `SAMPLE_STEP_M = 30` m, `SMOOTH_WINDOW = 3`, climb counted past `CLIMB_THRESHOLD_M = 5` m hysteresis (calibrated on 272 Swiss routes, median computed/tagged 0.94 per the module), `MAX_NODATA_FRAC = 0.2`. Duration is `duration_min_din33466` (4 km/h, 300 m/h up, 500 m/h down). `elevation_validate.py` is the manual validation table.
4. `validate.py` then `regression.py` (`trails_validate`). Five checks (continuity 30, geometry_sanity 20, elevation_sanity 20, difficulty 10, completeness 20 in `CONFIG["weights"]`) give `quality_score` 0-100. Drafts at or above `needs_review_min = 60` go to needs_review, below `reject_floor = 25` to rejected, nothing auto-approves. `regression.py` demotes published or approved trips whose fresh score falls below 60 to needs_review and writes `data/derived/trails_freshness.json`; it never unpublishes or deletes.
5. `popularity.py` (`trails_popularity`, monthly) writes curation rank and reports under data/reports/trails_seed (default countries `CH,FR,NO,AT`, `COUNTRIES_DEFAULT`).
6. Registry (`trails_registry`, monthly, no lab guard): `waymarked.py`, `famous_registry.py --all`, `coverage_report.py --all`. Writes `data/trails/famous_registry.json`, `data/trails/waymarked_routes.json`, data/reports/trails_coverage.json (not present in this checkout). Matching radius `MATCH_M = 250` m, length tolerance `LEN_TOLERANCE = 0.40`, the top `TOP_N = 3` per region are the rows a region is held to.
7. `regionize.py --all` (`trails_regionize`) stamps NUTS3 ids; needs cache/regions/regions.gpkg (absent here).
8. `derive_routes.py` (`trails_derive_routes`, MD, XK, MK, MT, AL) stages way-level routes as needs_review with `derived_route = true`.
9. `hierarchy.py --scan --classify --stitch-report` then `dedup.py` (`trails_hierarchy`). Relation graph into `route_relations`, classes parent / stage / variant / standalone, `co_located` groups. Must precede curate.
10. `curate.py` (`trails_curate`). The selection. Hard gates, then a region quota; see next section. `forests.py` (`trails_forests`) and `scenic.py` (`trails_scenic`) follow.
11. `scenic.py`: Overpass features within `HIGHLIGHT_M = 250` m of the line (density corridor `DENSITY_M = 600`, `HIGHLIGHTS_MAX = 12` per route, per-kind weights in `KINDS`: peak, viewpoint, waterfall and glacier 1.0, village 0.0).
12. `trail_images.py` (`trails_images`, Commons photographs on the line), `way_tags.py` (`trails_way_tags`, member way tags, SAC, surface), `attributes.py` (`trails_attributes`, the six published filters).
13. `rate.py` then `export_wire.py` (`trails_rate`, the last step). `export_top.py` runs at the end of `export_wire.py`.
14. After: `transit_stops.py`, `derived_activities.py`, `node_networks.py`, `attach.py` (`routes_attach`) write `data/derived/routes_attach.json` and `data/derived/node_networks.json`, read by the dossier build; `pipeline/outdoor/derive_outdoor_pages.py` (`outdoor_pages`) and `pipeline/nature_tiers.py` (`rating_v5_profile`) post-process the wire.

Not part of the wire chain: `compose_daytrips.py`, `compose_citytrips.py`, `market_demand.py` (day and city trips, manual), `smoke_test.py`, `crosscheck_portals.py`, `repair.py` (manual).

## Selection rules (`curate.py`)

Publication is not a score threshold. A route publishes when it passes the hard gates and wins a slot in its NUTS3 quota.

- Hard gates: one continuous line (or a fresh accepted splice or repair), a real name (not `SYNTHETIC_PREFIX = "OSM route "`), length `MIN_M = 2000` to `MAX_M = 45000` m, up to `TREK_MAX_M = 400000` m only when famous; one slot per family (relation tree, then dedup group, then title and E-path ref).
- Quota per NUTS3: `4 + 8 * protected_share + 6 * relief_norm`, clamped 3 to 45 (`QUOTA["trail"]` in `pipeline/regions/quotas.py`). Within a region: loops first (`LOOP_SHARE = 0.40`), famous share `FAMOUS_SHARE = 0.30` (floor 8, cap 120), treks `TREK_SHARE = 0.08`, distance bands `BAND_SHARE`, grid spread `GRID_DEG = 0.35` with `CELL_CAP = 3`.
- Rank inside a region: `WEIGHTS` network 0.24, quality 0.22, popularity 0.34, loop 0.20.
- The optional national pass (`NATIONAL_SHARE = 0.04`, iwn and nwn) is off unless the flag is passed.
- Listed tier `t = "l"`: passed continuity and sanity, named, in region, not rated, `LISTED_PER_REGION_MAX = 3`, length 2,000 to 60,000 m. Shipped without any rating key (`validate_listed` in `export_wire.py` rejects one that has it).
- Everything selected moves to approved with reviewer `pipeline:trails_curate`; anything published that is not re-selected returns to needs_review.

## Rating, 0 to 10 (`rate.py`, `MODEL = "open-signals-v2"`)

- Eight parts, each converted to a percentile inside its reference class (NUTS3 when it holds at least `REGION_MIN_ROWS = 20` rows, else the country): `WEIGHTS` scenery 0.22, relief 0.16, shape 0.15, prominence 0.14, designation 0.13, photos 0.12, variety 0.05, surface 0.03 (sum 1.0).
- Designation levels `NETWORK_LEVEL`: iwn 1.0, nwn 0.85, rwn 0.6, lwn 0.35, lcn 0.3, default 0.2. Shape: loop or figure8 1.0, point 0.55, out_back 0.40. Length is never a part.
- Composite stretched min-max per country: `rating = FLOOR + (CEILING - FLOOR) * (PAD + (1 - PAD) * scaled)` with `FLOOR = 4.0`, `CEILING = 9.8`, `PAD = 0.12`. Nothing published scores below 4.
- Reasons are codes (`reasons_for`), thresholds such as `MANY_SUMMITS = 3`, `BIG_CLIMB_M = 800`, `COMFORT_MAX_MIN = 360`, `STEEP_M_PER_KM = 45`, `HIGH_ALTITUDE_M = 1800`. `COMFORT_MAX_CLIMB_M` and `COMFORT_MAX_MIN` must match `continent-app/src/lib/trailStory.js` (`tests/test_trail_climb_consistency.py` checks this).
- v5 (the ladder shared with places): `pipeline/nature_tiers.py` reads the RAW part values (`v5_raw`), ranks them on frozen Europe-wide breakpoints in `reports/rating_reference_v5.json`, writes an additive `v5` key on every rated row. Recalibration is a deliberate `--recalibrate --version` run.

## Difficulty

`attributes.py`: grades `easy, moderate, hard, very_hard, alpine`, worst segment wins. Tagged first (SAC via `SAC_GRADE`, visibility floor `VIS_FLOOR`, via ferrata floor `FERRATA_FLOOR`) when at least `MIN_GRADE_COVER = 0.15` of the line carries the tag; else the DEM (`DEM_LADDER`, derived alpine needs a top at or above `DERIVED_ALPINE_MIN_TOP_M = 1500`). Floor from effort (`EFFORT_LADDER`: very_hard over 40 km or 2,200 m, hard over 25 km or 1,400 m, moderate over 15 km or 800 m). A route drawn downhill is read uphill (`DOWNHILL_MIN_M = 300`, `DOWNHILL_RATIO = 2.0`). The wire `difficulty` equals `f.g` when set (`wire_difficulty` in `export_wire.py`); `pipeline/trails/difficulty_gate.py` fails an export where they differ or the row set changed.

## Cycling chain (`pipeline/cycling/`)

`build_cycling.py` runs nine stages in one command (reference, harvest, splice, enrich, photos, crosscheck, rate, tours, export). Scheduled form, in order:

1. `cycling_harvest` (quarterly): `harvest_cycling.py`, `splice_cycling.py`. Reads the cached extracts (no new download); separates node networks (NL, BE) from routes.
2. `cycling_enrich`: `cycle_sources.py --reference` (Natura 2000, Emerald, EEA coastline), `enrich_cycling.py` (regions, elevation via the trails sampler, surface, safety, services, scenic), `splice_cycling.py --sync-only`. Land cover input: `landcover.py` (`_truncate_lc.py` is destructive, manual only).
3. `cycling_photos`: `cycle_images.py`, `harvest_cycling.py --crosscheck` (EuroVelo GPX and portals).
4. `cycling_bridge` (GB only in the task): `bridge_gaps.py --min-km 100`, then enrich steps `elevation,surface,safety,services`. Limits: `MAX_BRIDGE_GAP_M = 40000`, `MAX_BRIDGE_SHARE = 0.25`, profiles `carta-touring` then `trekking`.
5. `cycling_publish`: `seed_bike_rail.py`, `cycle_index.py`, `stage_planner.py`, `validate_cycling.py`, `export_cycling.py`.

Rating (`cycle_index.py`, `MODEL_VERSION = "cycle_index_v1"`): `WEIGHTS` scenic 0.26, safety 0.20, surface 0.16, designation 0.14, services 0.14, shape 0.10; percentile inside the NUTS2 region (`peer_group`) when it holds `MIN_REGION_ROWS = 12` routes, else the country; `PAD = 0.12`; `EUROVELO_BONUS = 0.15`; a part with no reading is dropped and the rest renormalised. Score is 0-10 with no per-country stretch. Safety is a house metric (penalty by road class, 10 is safest), `SAFETY_FLOOR = 4.0` for tours.

Gate (`export_cycling.py`): rated tier needs `SCORE_GATE = 5.4` and `PHOTOS_RATED_MIN = 2`; the rest ships as listed with no score key; `COUNTRY_CEILING = 900` is a sanity cap; quota `2 + route_km / 60`, clamped 2 to 30 (`QUOTA["cycling"]`). Riding time rule `RIDE_RULE = "flat18_climb10"` (18 km/h, 10 min per 100 m). Line simplification `SIMPLIFY_M = 90`.

Tours (`stage_planner.py`, `cycle_tour_v1`): `PACES` relaxed 45-65 km and 600 m, balanced 65-95 km and 1,000 m, strong 95-130 km and 1,600 m per day; `MIN_TOUR_M = 120000`, 3 to 14 stages; cuts snap to a service town. Ten hard checks in `validate_cycling.py` (continuity, stage_budget, overnight_real, no_repeats, surface_fit, safety_floor, water_and_food, bailout, images, season); a failing tour is not published and the previous wire stands.

## Outputs and wire files

- Trails, `continent-app/public/trails/`: `{CC}.json` (rated `trips`, `listed`, facets, regions, families), `index.json`, `top.json`, `trip/{id}.json` (full 3D line, profile, stops), `stubs/{CC}.json` (honest stubs for famous walks not built, `TRAIL_FAME_THRESHOLD = 0.4`, from `export_stubs.py`; the stubs folder is not present in this checkout). Country line is a placeholder simplified at `SIMPLIFY_M = 90` m.
- Cycling, `continent-app/public/cycling/`: `{CC}.json`, `index.json`, `top.json`, `route/{id}.json` (an `osm` block with ODbL attribution and a `carta` block), `tour/{slug}.json`, family/.
- Registry and derived: `data/trails/famous_registry.json`, `data/derived/routes_attach.json`, `data/derived/trails_freshness.json`.
- Published counts on this branch: trails `index.json` generated 2026-09-13, 17,619 rated, 51 listed; cycling generated 2026-10-23, 513 rated, 16,460 listed, 16 tours.
- Contract: `docs/SCHEMA.md` and `continent-app/scripts/ci/contract.mjs`. App readers: `continent-app/src/lib/trails.js`, `continent-app/src/lib/cycling.js`.

## Tests and verify scripts

- Python (no lab needed): `tests/test_trail_data_bugs.py`, `tests/test_trail_climb_consistency.py`, `tests/test_trail_titles.py`, `tests/test_trail_photo_credit.py`, `tests/test_gate_attribution.py`, `tests/test_pipeline_code_fixes.py` (node networks, registry order), `tests/test_nature_tiers.py`.
- App: `continent-app/tests/trailStory.test.mjs`.
- DOM checks: `continent-app/scripts/verify_trails.mjs`, `verify_trail_page.mjs`, `verify_trails_export.mjs`, `verify_trail_free_gpx.mjs`, `verify_cycling.mjs` (all in `continent-app/scripts/`).
- Lab: `pipeline/trails/smoke_test.py` (schema, 3D round trip), `pipeline/field_stubs/gate.py --layer trails`, `pipeline/trails/difficulty_gate.py --self-test`.
- Not verified here: whether the Python tests above pass on this branch (not run).

## How to rebuild

1. Start the lab: `cd tools/trailslab && docker compose up -d`; apply schema by first start (`tools/trailslab/initdb/`).
2. Warm rebuild of the wire only: `python run_pipeline.py --only trails_curate`, then each `--only` task in the order above through `trails_rate`; or `python pipeline/trails/rate.py && python pipeline/trails/export_wire.py --countries <list>`.
3. Cold: start at `trails_ingest` (hours, multi-GB) and expect a day end to end.
4. Cycling: `python pipeline/cycling/build_cycling.py` (flags `--skip-harvest`, `--skip-photos`, `--countries`).
5. Then `outdoor_pages` and `rating_v5_profile` (each export rewrites its files without their keys), and ship through `pipeline/field_stubs/publish.py`.
6. Reviewing by hand: `python tools/trailslab/review/api/server.py` (approve is the only human path to approved).
