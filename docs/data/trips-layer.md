# The trips layer (composed itineraries)

Written for T1085 (ROADMAP B2) from `pipeline/trips/` and the wire in `continent-app/public/trips/`. The retired `archive/execution-2026-11-11:archive/docs-2026-11/trips_layer.md` was not used as a source. Model version `MODEL_VERSION` = `trips_v1` (`pipeline/trips/trip_sources.py`).

## Not the journeys layer

Two separate trip products exist. This one is composed offline by `pipeline/trips/` into `continent-app/public/trips/`. The curated journeys are built by `pipeline/journeys/build_wire.py` into `continent-app/public/journeys/`, and workflow `trip-validator.yml` guards those (paths `pipeline/journeys/**`, `Trips/carta-unified/carta-unified/**`), not this layer. Nothing in this layer calls the Claude API (not used); every sentence the app shows is composed in the app from reason codes the pipeline emits.

## Pipeline

Task `trips` in `run_pipeline.py`: monthly, `writes_wire`, soft, guard `guard_trips`. It runs one command, `pipeline/trips/build_trips.py`, which runs three stages as subprocesses and stops on the first failure.

| Stage | Script | Reads | Writes |
|---|---|---|---|
| harvest | `harvest_routes.py` | Wikivoyage API (`en.wikivoyage.org`), `cache/wikivoyage.json` | `cache/trips/routes.json`, and extends `cache/wikivoyage.json` |
| compose | `compose_trips.py` | master `app_data/app_data.json`, `cache/trips/routes.json`, `cache/wikivoyage_listings.json`, `cache/dest_pageviews.json`, `cache/eurostat_nights_nuts3.json`, published layer wires | `cache/trips/composed.json` (`--out`) |
| export | `export_trips.py` (runs `validate_trips.py` first) | `cache/trips/composed.json`, `data/reports/hero_images_audit.json`, `data/reports/trip_hero_patch.json` | `continent-app/public/trips/` |

Options of `build_trips.py`: `--countries AT,CH`, `--refresh` (re-query Wikivoyage), `--skip-harvest`, `--skip-compose`, `--dry-run` (export only, writes no wire). `guard_trips` skips the task when a pipeline file or the master is missing; a missing `cache/trips/routes.json` is allowed (the harvest runs cold). `cache/trips/` and `app_data/app_data.json` are absent in this checkout, so the stages were not run for this document. Run times quoted in the script docstrings (about 5 minutes cold, 3 warm) are not verified.

Harvest constants (`harvest_routes.py`): `TITLES_PER_REQ` 20, `WIKITEXT_PER_REQ` 12, `COORD_TOL_KM` 90 (a guide whose centre is further is a namesake), `PACE_S` 0.12, `RETRIES` 5, `TIMEOUT_S` 60. It stores link structure, article class and coordinates, never prose.

## Composition rules

Three archetypes, day counts from `compose_trips.py`:

| Archetype | Constant | Days |
|---|---|---|
| `base` (one bed, days out) | `BASE_DAYS` | 2, 3, 4, 5, 6 |
| `chain` (2 to 5 bases by train or coach) | `CHAIN_DAYS` | 4, 5, 6, 7, 8, 10, 12, 14 |
| `loop` (car, returns to start) | `LOOP_DAYS` | 6, 7, 8, 10, 12, 14 |

Pace (`PACES`: relaxed, balanced, packed; balanced carries `score` 0.15) and scale (`SCALES`: `icons` seeds in metro and city with `min_seed` 7.2, `hidden` seeds in town, village, area with `min_seed` 6.6).

| Constant | Value | Meaning |
|---|---|---|
| `MIN_BASE_SCORE` / `THIN_BASE_SCORE` | 6.2 / 4.2 | Below 6.2 a place is a stop, not a base; 4.2 is the floor for a country with fewer than `MIN_BASES_FOR_A_COUNTRY` = 4 bases |
| `MIN_SEED_SCORE` | 7.2 | A trip opens on something worth the flight |
| `MIN_NIGHTS_PER_BASE` | 2 | |
| `BASE_SEPARATION_KM` | 55 | Closer bases make moving hotel pointless |
| `CHAIN_MAX_LEG_H`, `CHAIN_GOOD_LEG_H` | 5.0, 2.5 | Travel day cap, and the leg that costs only a morning |
| `LOOP_MAX_LEG_H`, `LOOP_MAX_DAILY_DRIVE_H` | 3.5, 2.6 | Car caps |
| `BEAM_WIDTH`, `KEEP_PER_CELL` | 8, 3 | Beam search width; survivors per country, archetype, length, scale and pace |
| `MAX_DAYTRIPS_PER_BASE`, `DAYTRIP_BEARING_SPREAD` | 4, 55 degrees | Day outs per base, and the bearing gap so two days out do not compete |
| `CROSS_BORDER_KM` | 320 | How far outside its own borders a country's chain search may reach |

Model (`trip_model.py`): `can_be_base` needs `accommodation.per_person_night_eur`, and for class `area` a population of at least `AREA_MIN_POP` = 500, for a `village` at least 250. `MAX_NIGHTS_BY_CLASS` metro 5, city 4, town 3, village 2, area 3. `base_score` starts from the 0 to 10 rating, adds depth (+0.5 at 12 or more top sights, +0.25 at 8, minus 1.2 under `MIN_POIS_FOR_A_DAY` = 4), a Wikivoyage guide bonus (star 0.9, guide 0.6, usable 0.25) and a designation bonus capped at 0.8. Day trips: `DAY_LENGTH_H` 11, `MIN_ON_SITE_H` 4 (5 by car), `DAYTRIP_MAX_KM` 150, `DAYTRIP_MIN_KM` 12. `SIGHT_HOURS_PER_DAY` 7. Legs are a Python port of the app estimator (`continent-app/src/lib/transport.js`, `countryTransport.js`, `groundFares.js`); keep them in step (`COUNTRY_TRANSPORT`, `DETOUR` 1.30, `RAIL_DETOUR` 1.17). Costs are per person (`cost.group` 2, `cost.est` true) and estimates.

## Validation gate

`validate_trips.py` `HARD_CHECKS` has 11 checks, applied in order; the first failure drops the trip with a reason:

`stops`, `no_repeats`, `nights`, `legs`, `loop_closes`, `daytrips`, `plan`, `enough_to_do`, `hero`, `images`, `cost`.

Notable constants: `MIN_HIGHLIGHTS_PER_STOP` 3, `MAX_CHAIN_LEG_MIN` 300, `MAX_LOOP_LEG_MIN` 210, cost drop at `per_day_eur` over 900 or no `stay_eur`, `stops_too_close` under 40 km, `ALLOWED_IMAGE_HOSTS` for photographs. Soft checks only warn (`no_shared_season`, `no_editorial_link`, `no_written_guide`, `sights_are_spread_out`, `stay_prices_are_country_level`, `every_stop_is_crowded`); `quality` = `max(0.4, 1.0 - 0.07 * warnings)` and the trip score is multiplied by `0.88 + 0.12 * quality`. A failure of the export leaves the previous wire standing.

## The wire (`continent-app/public/trips/`)

| File | Content |
|---|---|
| `index.json` | `generated_at`, `model`, `n_trips`, `n_dropped`, `shapes`, `days`, per country `{cc, n, best, cover, days, shapes, dropped}`, `absent`, `attribution` (6 sources) |
| `top.json` | Best across Europe: `TOP_PER_COUNTRY` 9, at most `TOP_PER_PACE` 3 of one pace and `TOP_PER_SCALE` 6 of one scale per country, `TOP_TOTAL` 400 |
| `{CC}.json` | `country`, `generated_at`, `model`, `n`, `trips` as cards, sorted by score desc, days, id. A multi country trip is written into every country file it touches |
| `trip/{id}.json` | Full trip: `stops`, `legs`, `daytrips`, `plan`, `checks`, `gallery` (max `GALLERY_MAX` 5), `hero`, `lat`, `lon`, `model`. Joins add `nb` per stop (see `docs/data/joins.md`) |

A card carries `id`, `rg` (region id), `cc`, `countries`, `abroad`, `archetype`, `scale`, `pace`, `days`, `nights`, `score`, `quality`, `themes`, `season`, `seasonBasis`, `transport`, `lat`, `lon`, `km`, `cities`, `outs`, `img`, `sights`, `why`, `warned`, `cost`, `follows`, `detail`. A full export (no `--countries`) deletes country files and `trip/` before rewriting, so a country that no longer qualifies loses its file. Hero choice (`hero_of`) goes in route order, skips destinations flagged in `data/reports/hero_images_audit.json`, and applies per trip overrides from `data/reports/trip_hero_patch.json`.

Readers: `continent-app/src/lib/trips.js` (loader), `continent-app/scripts/verify_trips.mjs` (headless check), `continent-app/scripts/audit-trip-heroes.mjs`. Area doc: `docs/project-map.md`.

## State of the local wire

| Fact | Value |
|---|---|
| `index.json` `generated_at` | 2026-09-15 |
| `n_trips`, `n_dropped` | 3,984, 19 |
| Shapes | base 1,778, chain 1,676, loop 530 |
| Countries in index | 43 |
| Files in `trip/` | 3,949 (does not equal `n_trips`; not investigated) |

## Not verified

- Whether the Hetzner build box runs `trips` (monthly tasks are held back under a weekly ceiling unless named in `CARTA_EXTRA_TASKS`).
- The docstring figures for guide counts and the catalogue size in `trip_sources.py` and `harvest_routes.py` (3,038 places; 1,570 earlier); they are not computed by code.
