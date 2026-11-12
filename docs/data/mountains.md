# Mountains data layer

Written by T1085 (ROADMAP B2) from the code in `pipeline/mountains/`, not from the retired `archive/execution-2026-11-11:archive/docs-2026-11/MOUNTAINS.md`. Constants are named so they can be grepped. Anything not checked is marked "not verified". Rules for the traveller: `docs/HANDBOOK.md` section "Mountains and peaks". Area doc: `docs/project-map.md`.

## What the layer is

The Mountains category on the Destinations tab: summits, volcanoes, ridges, sea cliffs, plateaus and the lowland high points that stand in for mountains in flat countries, across the 43 country catalogue (`COUNTRIES` in `pipeline/mountains/harvest_peaks.py`). Each published row carries three shown sub scores (scenery, getting up, what is at the top), the WAY UP as codes (difficulty, access, lift, hazards), a measured view, a month-by-month season, and reason codes the app turns into sentences (`continent-app/src/lib/mountainStory.js`). Difficulty is deliberately a reason and a code, never a number, and nothing asserts a route exists; the page tells the reader to check locally (`peak_index.py` docstring).

State lives in per-country JSON caches, not a database; the wire is generated from them. Photographs come from Wikimedia Commons with licence and author per image.

## What needs the owner box or network

- Wikidata spine: `cache/features_wikidata.json` (present in this checkout). It is not re-queried; without it a build falls back to the seed plus country high points, a few hundred mountains instead of a few thousand (`guard_mountains` in `run_pipeline.py`).
- Overpass: `osm_spine.py` (named peaks, saddles, passes, ridges over 500 m, plateaus, per country, tiled on failure), the context sweep in `enrich_peaks.py` (`OSM_BATCH = 20`) and `harvest_lift_hours.py` (`LIFT_M = 2500`). Overpass is deliberately not guarded: a missing sweep is a documented state (`build_peaks.py --no-context`, later `enrich_peaks.py --context-only`).
- Commons and Wikipedia APIs (photographs `IMAGES_WANTED = 6`, article facts, pageviews).
- Copernicus GLO-30 over /vsicurl/ windowed reads (`DEM_URL` in `terrain.py`; about 0.3 MB per summit instead of whole 42 MB tiles).
- NASA POWER climatology (`season.py`, default source; `--source era5` is written but needs a `CDSAPI_KEY` or ~/.cdsapirc which the module says did not exist).
- State of this checkout (2026-11-05): `cache/features_wikidata.json` is present; cache/mountains/ (raw, rich, osm, terrain, season) is NOT present, so only the published wire can be read and no stage can be re-run here. The rich caches live in R2 (guard text: "pull mountains-cache from R2"; the pull procedure is not verified here). `peak_lift_hours.json` is also absent. Only `pipeline/mountains/repair_lift_wire.py` works on the published files without caches.

## The chain, in order

Task `mountains` (quarterly, `run_pipeline.py`) runs five commands:

1. `osm_spine.py` writes cache/mountains/osm_CC.json (stage `osm`, once, read forever; `osm_ok` is set only when every tile answered, and an empty answer never replaces a non-empty cache; `--refresh` to re-ask).
2. `build_peaks.py --skip-export` runs harvest then enrich:
   - Harvest, `harvest_peaks.py` to cache/mountains/raw_CC.json. Merges the Wikidata spine, the OSM spine (match within `OSM_MATCH_M = 150`), Wikidata P610 high points per country and region, a bounded hill and volcano pass for countries below `THIN_POOL = 900` spine rows, and the curated seed (`seed_peaks.py`, entries carry `why` of `brief` or `editorial`, a curated lift and `top: True` only where the lift reaches the summit; resolved within `SEED_NEAR_KM = 25`, `SEED_NEAR_KM_WIDE = 60` for massifs, ridges, plateaus and ranges). A pre score cuts each country to `SHORTLIST = 500`; seeded rows are never cut. Rows must be inside `EUROPE_WINDOW` (`pipeline/pipeline_io.py`).
   - Enrich, `enrich_peaks.py` to cache/mountains/rich_CC.json, top `ENRICH_TOP = 320` per country: Wikidata detail with units (prominence P2660, isolation P2659, elevation P2044, feet and km converted), Commons gallery, Wikipedia facts and pageviews, nearest priced destination within `DEST_MAX_KM = 120`, and the Overpass context (lifts within `NEAR_LIFT_M = 3000`, huts, graded ways, viewpoints, parking, transit). Re-run alone as `--context-only` for peaks with no context or one older than the hut records.
3. `terrain.py --workers 4` writes cache/mountains/terrain.json (`terrain_v1`): prominence and isolation by flooding the DEM (search windows `PROM_WINDOWS` 12, 40, 120 km; `prom_capped` marks a lower bound), the summit elevation the DEM holds (`SNAP_M = 150`), a viewshed (`VIEW_RADIUS_KM = 30`, `VIEW_STEP_M = 90`, `VIEW_AZIMUTHS = 720`, `REFRACTION = 0.13`, `EYE_M = 1.7`; water is cells at or below `WATER_ELE_M = 1` in patches of at least `WATER_MIN_KM2 = 4`), and the gentlest radial slope behind the difficulty fallback. The module computes these itself instead of using the precomputed akirmse/mountains CSVs, whose licence is unstated.
4. `season.py` writes cache/mountains/season.json (`peak_season_v1`): twelve monthly values and `best_months`. POWER cells `CELL_DEG = 0.5`, temperature lapse corrected at `LAPSE_C_PER_KM = 6.5` (capped `MAX_LAPSE_C = 26`), wet days from `WET_INTENSITY_MM = 5`, snow probability 0 to 100 (certain below `SNOW_ALL_BELOW_C = -2`, none above `SNOW_NONE_ABOVE_C = 4`, damped 0.75 in months under 20 mm), best months need snow probability at most `BEST_MAX_SNOW = 35` and a mean of at least `BEST_MIN_TEMP_C = 3` C (a summit that never clears the bar falls back to its three warmest months, marked). Climatology only; no live conditions enter the wire.
5. `export_peaks.py` scores, gates and writes (below).

Separately scheduled: task `peak_context` (`enrich_peaks.py --context-only`, `harvest_lift_hours.py`, then the export through `pipeline/field_stubs/publish.py`). `harvest_lift_hours.py` writes cache/peak_lift_hours.json (opening hours string of the nearest tagged lift, unparsed; no tag means no row). Then `outdoor_pages` (`pipeline/outdoor/derive_outdoor_pages.py`) and `rating_v5_profile` (`pipeline/nature_tiers.py`). The `run_v2_*.sh` scripts in the folder are one-off round runners; `run_v2_rescore.sh` queues the photo beauty rescore (`pipeline/photos/rescore.py`), which must not run beside a rebuild (`RESCORE_LAYERS` in `run_pipeline.py`).

## Scoring (`peak_index.py`, `MODEL_VERSION = "peak_index_v2"`)

Seven weighted components, each 0 to 1 (`WEIGHTS`, sum 1.00): scenery 0.24, access 0.20, acclaim 0.18, stature 0.16, experience 0.14, views 0.06, photo 0.02.

- Scenery: shape (`SHAPE_VALUE`, kind from `KIND_PATTERNS`) then setting; a curated seed adds `CURATED_BONUS` (brief 0.30, editorial 0.18); `FAME_TO_SCENERY = 0.15`.
- Access: `LIFT_VALUE` cableCar and gondola 1.0, funicular and rackRailway 0.97, road 0.88, chairlift 0.85, liftsNearby 0.55; a summit lift counts only within `SUMMIT_LIFT_M = 250` m of the summit (or a Wikidata id in `LIFT_TOP_CONFIRMED`, or a seed `top: True`); `NEAR_LIFT_M = 3000` for lifts on the mountain. Penalties for hazards in `HARD_FACTS` (climbing, via ferrata, glacier). Access codes `ACCESS_CODES` (liftTop, liftMountain, roadTop, trailhead, transit, remote; `TRANSIT_NEAR_M = 2000`, `PARKING_NEAR_M = 2500`) are a list because the filter ANDs them.
- Acclaim: 60% standing at home, 40% in Europe, log scaled; `CURATED_FAME` brief 0.50, editorial 0.40.
- Stature: prominence, isolation, height against the country's highest summit; `EUROPE_ELE_MAX = 4808`.
- Experience: `EXPERIENCE_TAGS` (viewpoint, restaurant, hut, observatory, cross, via ferrata, cave and so on).
- Views: measured viewshed, saturating at `VIEW_HALF_KM2 = 350` and `VIEW_HALF_PEAKS = 8`.
- Standout bonus `STANDOUT_BONUS = 0.15` of the best of `STANDOUT_ON = (scenery, access, experience, views)`.
- Difficulty ladder `DIFFICULTY` walkUp, hike, mountainHike, scramble, alpine, viaFerrata, technical; from graded ways within `GRADE_NEAR_M = 800` (`SAC_TO_DIFF`), else DEM slope bands `SLOPE_BANDS` (12, 22, 30, 40 degrees).
- Bands `TIER_CUTOFFS = {1: 6.2, 2: 7.4, 3: 8.5}`.
- `gem_score` is the residual against fame (`GEM_MAX_ACCLAIM = 0.55`); it never moves the ranking.
- v5: `v5_components` and `pipeline/nature_tiers.py` place the peak on the frozen shared ladder with an additive `v5` key; SAC grade, glacier and altitude are facts there, not score.

## The gate (`export_peaks.py`)

- Eligible in any tier (`eligible`): a real name, country agrees with the file, and some measurement (elevation, seed, or DEM).
- Rated (`t = "r"`): score at least `MIN_SCORE = 5.0` (or a `brief` seed), at least one reason code, `MIN_IMAGES = 4` photographs carried by a strong picture (`photo_gate`); not within `DUPLICATE_KM = 1.0` of a better entry.
- Quota: per GMBA range, else NUTS3, else country (`region_key`): `peaks_over_p100 ** 0.4 * 2` clamped 2 to 40 (`QUOTA["mountain"]` in `pipeline/regions/quotas.py`). Rows past quota are deprioritised, not dropped; `PUBLISH_MAX = 300` is a sanity ceiling.
- Floors, filled with LISTED rows (no score key, `MIN_IMAGES_LISTED = 0`, so a card may be drawn from the map): `COUNTRY_FLOOR = 8` rows of any tier per country and `RANGE_FLOOR = 2` per European range. A country that cannot reach 8 records why in `index.json` (`FLOOR_REASONS`: `poolExhausted`, `noCandidates`). `photo_shortfall` counts rows that would have been rated but lacked photographs.
- `validate` and `validate_listed` run before any write; a failure leaves the previous wire standing.
- Lift note: the wire's `lift_note` text says the lift rule is 700 m, but the code in `peak_index.py` uses 250 m (see Known gaps).

## Outputs and wire files

- `continent-app/public/mountains/{CC}.json`: `mountains` (rated) and `listed`.
- `continent-app/public/mountains/index.json`: model block (`version`, `weights`, `sub_scores`, `tier_cutoffs`, `min_score`, `min_images`, `country_floor`, `range_floor`, `terrain`, `season_model`, `region_quota`), `floor`, `photo_shortfall`, `absent`, attribution, source timestamps.
- `continent-app/public/mountains/top.json`: Europe-wide opening list, `TOP_N = 240`, `TOP_PER_COUNTRY = 6`.
- After the write: `nature_tiers.save_parts("mountains")` and `repair_places_wire.place_pass` (`pipeline/regions/`).
- Published on this branch: `index.json` generated 2026-10-28, `n_mountains` 728, 43 countries, `min_score` 5.0, `min_images` 4, floor target 8.
- Other modules that write the wire in place: `outdoor_pages` adds start, access, routes to the top (hikes passing within 150 m, height within 60 m plus the peak's `eleGap`) and stations; `repair_lift_wire.py` applies the T454 lift rule to published rows (idempotent).
- Contract: `docs/SCHEMA.md`. App readers: `continent-app/src/lib/mountains.js`, page `continent-app/src/browse/MountainPage.jsx`.

## Tests and verify scripts

- DOM check: `continent-app/scripts/verify_mountains.mjs`.
- Python: `tests/test_nature_tiers.py` (shared ladder). No test file exercises `pipeline/mountains/` by name or by import (searched `tests/`).
- App: `continent-app/tests/outdoorV3.test.mjs` touches the shared outdoor pattern; whether it covers mountains specifically is not verified.
- The export's own `validate` is the main gate.

## How to rebuild

1. Get the mountain caches (R2, not verified here) and keep `cache/features_wikidata.json`.
2. Full chain as scheduled: `python run_pipeline.py --only mountains`. By hand: `python pipeline/mountains/osm_spine.py`, `python pipeline/mountains/build_peaks.py --skip-export`, `python pipeline/mountains/terrain.py --workers 4`, `python pipeline/mountains/season.py`, `python pipeline/mountains/export_peaks.py`.
3. Re-score and re-export only: `python pipeline/mountains/export_peaks.py --dry-run --verbose`, then without `--dry-run`. Do not use `--countries` for a shipping run: `index.json` and `top.json` would then describe only those countries.
4. Cold build is hours (Commons and Overpass); warm runs read the caches. Timing is from the module docstrings, not re-measured.
5. Finish with `outdoor_pages` and `rating_v5_profile`, since each export rewrites its files without their keys.

## Known gaps

- `lift_note` in the wire (`export_peaks.py`) says 700 m while the rule is 250 m; `enrich_peaks.py` still collects with `SUMMIT_LIFT_M = 700` and `peak_index.py` applies 250.
- The season is a ~50 km grid climatology corrected by lapse rate; the module calls it an estimate.
- Opening seasons of lifts are not in this layer except the OSM `opening_hours` string where mapped.

## Route up fill (`pipeline/mountains/fill_route_up.py`)

T1186 (ROADMAP D24, D7). Rows with no `routes` (1,868 of 2,143 on 2026-11-07;
275 have one) get a `routeUp` block from OSM ways within 400 m of the summit:
`kind` marked, path, track or none, `near_m`, `sac` as tagged, `ways`, `names`,
`_src`, `_asof`. It states what is mapped, never that a route is safe. Run
(box, Overpass paced): `python pipeline/mountains/fill_route_up.py --harvest --apply`.
The batch route (T1201, row T1186-c) reads Geofabrik extracts with osmium
instead, one pass per country and no rate limit: `--extract <country>.osm.pbf`
(repeatable) sweeps every foot way and track within 600 m of each summit with
no route, and marks a way that is a member of a `route=hiking` relation, so a
summit can read `kind: marked`. Then `--apply` as before.
