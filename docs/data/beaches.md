# Beaches data layer

Written by T1085 (ROADMAP B2) from the code in `pipeline/beaches/`, not from the retired `archive/docs-2026-11/BEACHES.md`. Constants are named so a reader can grep them. Anything not checked is marked "not verified". Rules for the traveller are in `docs/HANDBOOK.md` section "Beaches"; the area doc is `docs/areas/outdoors.md`.

## What the layer is

The Beaches category on the Destinations tab: named beaches across the 43 country catalogue (`COUNTRIES` in `pipeline/beaches/harvest_beaches.py`, same list as trails), each scored on a stated model (`beach_beauty_v2`), photographed from Wikimedia Commons, and described only through reason codes the app turns into sentences in six languages (`continent-app/src/lib/beachStory.js`). Built from open data only: Wikidata (CC0), OpenStreetMap (ODbL, credit travels on every row that used it), the EEA bathing water register, Wikipedia (as a fact source, prose never shipped), Commons photographs (licence and author kept per image).

There is no database lab here. State lives in per-country JSON caches and the wire is generated from them.

## What needs the owner box or network

- Cold build is a few hours, nearly all waiting on Overpass (one query per 12 beaches, `OSM_BATCH = 12`, radius `CONTEXT_RADIUS_M = 400`) and Commons. A warm re-run from the caches takes seconds (per the `build_beaches.py` docstring, not re-timed).
- Network sources: Wikidata SPARQL, Overpass mirrors (`pipeline/beaches/sources.py` holds polite clients, per host minimum intervals and the mirror list), Commons and Wikipedia APIs, the EEA ArcGIS services for Natura 2000 and Emerald sites (`pipeline/beaches/protection.py`).
- Local inputs: `cache/eea_bathing_water.json` (written by task `bathing_water`, `pipeline/harvest_bathing_water.py`, season pinned by `YEAR = 2025`), the Geofabrik extracts under data/raw/geofabrik for the bulk OSM pass (`pipeline/beaches/osm_extract.py`), app_data/app_data.json (nearest priced destination).
- State of this checkout (2026-11-05): `cache/eea_bathing_water.json` is present; the beach caches (cache/beaches/raw_*.json, `rich_*.json`, `dest_index.json`, `protected_sites.geojson`) and data/raw are NOT present, and there is no cache/sea_temp_beaches.json (only `cache/sea_temp/` tiles). So only the already published wire can be read here; the harvest, enrich and export cannot be re-run. The caches are kept in R2 (guard text: "pull beaches-cache from R2"); how to pull them is not verified here.
- Task guards in `run_pipeline.py`: `guard_beaches` (scripts present and `cache/eea_bathing_water.json` present, because without it the water term silently falls back to the country default), and for `beach_context` also at least 20 `raw_*.json` and 20 `rich_*.json` caches and Overpass reachable.

## The chain, in order

Scheduled task `beaches` (quarterly) runs `pipeline/beaches/build_beaches.py`, which calls the three stages in one process:

1. Harvest, `harvest_beaches.py` to cache/beaches/raw_CC.json. Wikidata items typed as beach (`P31/P279* Q40080`) plus OSM `natural=beach` and `leisure=beach_resort`, merged into one row per real beach: an OSM element naming its Wikidata id is the same beach; otherwise the two must be within `MERGE_KM = 0.6` km and share a folded name token. Bulk OSM comes from the Geofabrik extract (`osm_extract.py`: also `leisure=swimming_area`, `natural=shingle`, `natural=sand`, unnamed beaches named from the nearest bay with `name_src: "osm_near"`, beach length from the way). `eea_spine.py` reads the EEA register as a candidate source: a site within `MERGE_KM = 1.2` km of a beach with an agreeing name folds in as a water reading, any other site becomes a row with `name_src: "eea"`.
2. Enrich, `enrich_beaches.py` to cache/beaches/rich_CC.json. Free joins over every beach: nearest EEA site within `BATHING_MAX_KM = 2.5`, nearest protected area within `PROTECTED_MAX_KM = 6.0`, nearest priced destination within `DEST_MAX_KM = 90`. Then a shortlist (`SHORTLIST = 170` floor, `SHORTLIST_PER_QUOTA = 3.0` candidates per rated row wanted, `SHORTLIST_MAX = 2600`) gets Commons photographs (`IMAGES_WANTED = 4`, `MIN_IMAGE_W = 1000`, `GEO_STRICT_M = 250`), Wikipedia article facts and pageviews, and the Overpass context sweep (cliffs, dunes, parking, toilets, hotels within 400 m, rentals, kids pools). `CONTEXT_V = 2` marks which context generation a row has. `protection.py` gives polygon `inside` against Natura 2000 and Emerald, `coastline.py` gives the beach aspect and whether the sun sets over its water (`SUNSET_TOLERANCE_DEG = 50`), `uk_bathing.py` is the Great Britain water feed (see Known gaps).
3. Export, `export_beaches.py` to `continent-app/public/beaches/`. Scores, gates, validates, writes.

Follow-ups, scheduled separately: task `beach_context` (`enrich_beaches.py --max-hours 6`, then `harvest_beach_walks.py`, then the export through `pipeline/field_stubs/publish.py`; enrich stops after 6 h, saves every `CHECKPOINT_BATCHES = 10` and exits `EXIT_INCOMPLETE = 3`, the task stays due). `harvest_beach_walks.py` models the walk from town centre and ferry pier (straight line times 1.3 detour at 4.5 km/h, not a routed path). `pipeline/harvest_sea_temp.py` (task before it, `--beaches --dests --max-hours 6`) writes cache/sea_temp_beaches.json, read by the export. Then `pipeline/outdoor/derive_outdoor_pages.py` (task `outdoor_pages`), `pipeline/nature_tiers.py` (task `rating_v5_profile`) and the photo rescore (`pipeline/photos/rescore.py`, which must never run beside a rebuild: cache/beaches/.rescore_hold, `RESCORE_LAYERS` in `run_pipeline.py`).

## Scoring (`beauty_index.py`, `MODEL_VERSION = "beach_beauty_v2"`)

Eight components, each 0 to 1. Weights are the brief's ratios normalised to sum 1 (`WEIGHTS_AS_BRIEFED` sums 1.08, so `WEIGHTS` = each divided by 1.08; both ship in `index.json`):

| component | as briefed | in `WEIGHTS` | from |
|---|---|---|---|
| setting | 0.24 | 0.2222 | cliffs, cave, arch, dunes, pines, lagoon, islet, reef, viewpoint, lighthouse, protected area (0.45 park, 0.28 reserve), saturating (`_sat(points, 0.85)`) |
| acclaim | 0.18 | 0.1667 | `fame_raw` = log1p(sitelinks x 2.5 + views60 / 25 + photos x 2); 60% rank at home, 40% in Europe; Blue Flag +0.10, famous photo +0.12 |
| water | 0.16 | 0.1481 | EEA class `WATER_VALUE` Excellent 1.0, Good 0.7, Sufficient 0.35, Poor 0.0; no reading counts as the country median, else `WATER_DEFAULT = 0.62` |
| sand | 0.14 | 0.1296 | `SURFACE_VALUE` (sand 0.80, shingle 0.55, rock 0.38 ...), colour and water clarity lift |
| wildness | 0.14 | 0.1296 | 1 minus built count within 400 m (`BUILT_TAGS`), plus boat-only, hike-in; `WILDNESS_DEFAULT = 0.60` when unmeasured |
| comfort | 0.10 | 0.0926 | parking, toilets, showers, water, food, lifeguard; `COMFORT_DEFAULT = 0.35` |
| space | 0.06 | 0.0556 | beach length (`SPACE_MIN_M = 25` to `SPACE_MAX_M = 60000`) saturating against a reference length (`space_references`, `SPACE_FALLBACK_REF_M = 900` m when none); None when length unknown |
| photo | 0.06 | 0.0556 | photo engine beauty rank of the best `PHOTO_TOP_N = 3`, capped `PHOTO_CAP = 0.9` |

(Normalised figures are computed from the table above, not copied from a wire file.)

- A component that returns None is dropped and the others renormalised in the OLD score (`score_beach`); the wire `score` is `10 x min(1, base + STANDOUT_BONUS x standout)`, `STANDOUT_BONUS = 0.15`, standout = best of `STANDOUT_ON = (setting, sand, wildness, space)`.
- Protected claim distances `PARK_CLAIM_KM = 3.0`, `RESERVE_CLAIM_KM = 1.5` (`protected_of`).
- Bands `TIER_CUTOFFS = {1: 6.4, 2: 7.6, 3: 8.6}`.
- v5 (`v5_components`): Europe-wide acclaim only, facts (Blue Flag, lifeguard) taken out, nothing renormalised; `nature_tiers.py` places the beach on the frozen ladder and writes an additive `v5` key.

## The gate (`export_beaches.py`)

Rated tier (`t = "r"`), all must hold: a real name beyond the local word for beach (`name_tokens`), in Europe (`in_europe`), score at least `MIN_SCORE = 5.6`, at least `MIN_IMAGES = 4` usable images with a strongly evidenced lead (`STRONG_EVIDENCE = (p18, cat, name)`; a geotag may fill later slots only), at least one reason code, not within `DUPLICATE_KM = 0.15` of a better beach. Then `quota_ordered` fills each coastal stretch by `coast_km / 12` clamped 3 to 60 (`QUOTA["beach"]` in `pipeline/regions/quotas.py`); rows past a quota are deprioritised, not cut. `PUBLISH_MAX = 900` is only a sanity ceiling.

Listed tier (`t = "l"`): rows that miss the score or photo gate are promoted by `floor_fill` so every applicable NUTS3 carries at least one row and every coastal stretch at least three (`floor` in the quota module), with one strongly evidenced photograph or none (`MIN_IMAGES_LISTED = 1`), and NO score key at all.

`validate` and `validate_listed` run on everything before any write; one failure (duplicate id, off-scale score, fewer than 4 images, weak lead, non-https image, missing licence, missing credit, no reason, no region block `rg`) writes nothing and the previous wire stands. Countries with nothing publishable are pruned from the folder.

## Outputs and wire files

- `continent-app/public/beaches/{CC}.json`: `beaches` (rated), `listed`, `facets`, `n`. Facets in `FACETS` of `export_beaches.py`.
- `continent-app/public/beaches/index.json`: counts per country, the model block (version, weights, weights as briefed, tier cutoffs, `min_score`, `min_images`, `region_quota`), attribution list, per-country source timestamps (`provenance`).
- `continent-app/public/beaches/top.json`: Europe-wide opening list, `TOP_N = 240` capped at `TOP_PER_COUNTRY = 12` per country.
- After export: `nature_tiers.save_parts("beaches")` and `repair_places_wire.place_pass` (`pipeline/regions/`) run inside `main`.
- Published on this branch: `index.json` generated 2026-10-28, `n_beaches` 2,745, `n_listed` 3,873, 39 countries, model `beach_beauty_v2`, `min_score` 5.6.
- Contract: `docs/SCHEMA.md`. App readers: `continent-app/src/lib/beaches.js`, page `continent-app/src/browse/BeachPage.jsx`.

## Tests and verify scripts

- DOM check: `continent-app/scripts/verify_beaches.mjs` (needs the app running; phone then desktop).
- Python: `tests/test_nature_tiers.py` covers the shared v5 ladder; there is no test file for `pipeline/beaches/` by name or by import (searched `tests/`). The export's own `validate` is the main gate.
- App test touching outdoor pages: `continent-app/tests/outdoorV3.test.mjs`.

## How to rebuild

1. Get the beach caches (R2, not verified here) and `cache/eea_bathing_water.json` (`python run_pipeline.py --only bathing_water`; bump `YEAR` in `pipeline/harvest_bathing_water.py` for a new season, then `--refresh`).
2. Everything: `python pipeline/beaches/build_beaches.py` (flags `--countries GR,HR`, `--refresh`, `--skip-harvest`, `--skip-enrich`, `--dry-run`).
3. Re-score and re-export only: `python pipeline/beaches/build_beaches.py --skip-harvest --skip-enrich`, or `python pipeline/beaches/export_beaches.py --dry-run --verbose`. Do not pass `--countries` for a shipping run (the script warns that `index.json` and `top.json` then describe only those countries).
4. Context v2 and walks: `python run_pipeline.py --only beach_context`. To re-photograph without re-harvesting, delete the `rich_*.json` caches (per the task note).
5. Finish with `outdoor_pages` and `rating_v5_profile`, because each export rewrites its files without their keys.

## Known gaps

- Great Britain has no EEA class (post Brexit). `pipeline/beaches/uk_bathing.py` is written to the Defra interface but its docstring says the endpoints were unreachable from the author's network and cache/uk_bathing_water.json is absent here; until it lands the water component is dropped for GB, not defaulted. Not verified whether it has run since.
- Scotland and Northern Ireland feeds are not wired (module docstring).
- Norway and Iceland also lack a bathing register; same dropped-component rule.
