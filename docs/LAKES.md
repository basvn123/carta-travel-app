# The lake layer

Rewritten from the code on 2026-11-05 (T1085, ROADMAP B2). The code wins over
this page; the previous 942 line version (build-session narrative) is in git
history. `python pipeline/lakes/check_doc.py` checks every path, symbol and wire
pointer named here.

The Lakes category on the Destinations tab: where water bodies come from, what
the index measures, how the swimming verdict is decided, how reasons are
written, and how to rebuild it.

## What this layer is for

A lake list has to carry what a beach list does not: whether you may swim at all
(Plitvice, Morskie Oko and most drinking water reservoirs forbid it), when you
can (a tarn at 2,000 m versus a shallow lowland lake), and what kind of water it
is (lake, reservoir, lagoon, tarn, crater, geothermal). So the wire carries
three standalone sub scores (scenery, swimming, activity), a swimming verdict
with its source, an estimated season, a hazards list, and the combined score the
list is ordered by.

## The chain

`python pipeline/lakes/build_lakes.py` runs every stage (run_pipeline task
`lakes`; its guard needs `cache/lakes/chelsa/tas_07_europe.tif`). Each stage is
idempotent and caches per country.

| Stage | Module | Writes |
|---|---|---|
| climate | `pipeline/lakes/lake_climate.py` | `cache/lakes/chelsa/` (CHELSA V2.1 monthly air temperature, CC BY 4.0, cropped to Europe once; replaced WorldClim, which is non commercial) |
| osm | `pipeline/lakes/osm_water.py` (`sweep_country`, `keepable`) | cache/lakes/osm_CC.json (per machine): every named water body in the Geofabrik extract in data/raw/geofabrik (per machine), with a shore block (walkable path, beaches, slipways), read offline |
| harvest | `pipeline/lakes/harvest_lakes.py`, `seed_lakes.py` | cache/lakes/raw_CC.json (per machine): Wikidata (700 most written about plus 250 largest per country), the OSM spine folded in (wikidata tag, else centroid within 500 m and area within 40 per cent, else centroid and a shared name word), and the curated `SEED` (pinned; carries swim rules) |
| enrich | `pipeline/lakes/enrich_lakes.py` | cache/lakes/rich_CC.json (per machine): EEA bathing water (class and site count, lake and river sites only), nearest protected area, CHELSA sample, our trails wire, nearest priced destination, then for the shortlist (`shortlist_for`) up to `IMAGES_WANTED` (5) Commons photos, Wikipedia facts, Overpass shore truth |
| export | `pipeline/lakes/export_lakes.py` | `continent-app/public/lakes/` |

Support: `pipeline/lakes/water_sources.py` reuses the beach layer's HTTP client
(`pipeline/beaches/sources.py`) with its own cache and user agent;
`pipeline/lakes/lake_images.py` and `harvest_water_detail.py` feed photos and
detail; `pipeline/lakes/lake_outlines.py` writes outlines;
`pipeline/lakes/rebuild_v2.py` is a manual driver that folds each country's OSM
sweep and enriches it as it lands.

`build_lakes.py` options: `--countries`, `--refresh`, `--skip-climate`,
`--skip-osm`, `--skip-harvest`, `--skip-enrich`, `--no-context` (no Overpass),
`--dry-run`. A cold build takes about a day (OSM filtering and paced Commons
requests); a warm re-run takes seconds. The caches are the snapshot: with them
in place the wire is reproducible, and `generated_at` is the only clock read.
Needs network and the owner box for a cold run. Large inputs (`cache/lakes/`,
the Geofabrik extracts) are not in this checkout.

## The index (`pipeline/lakes/lake_index.py`)

`MODEL_VERSION = "lake_index_v2"`. `score_lake` computes eight components, each
0..1, then `score01 = min(1, sum(WEIGHTS[k] * comp[k]) + STANDOUT_BONUS * max of
STANDOUT_ON)` and `score = 10 * score01`.

| Component | Weight (`WEIGHTS`) | What it reads |
|---|---|---|
| scenery | 0.25 | relief, glacial or volcanic origin, islands, forest, cliffs, waterfall, protected area (`PARK_CLAIM_KM` 4, `RESERVE_CLAIM_KM` 2, `PARK_NEAR_KM` 16) |
| swimming | 0.20 | the `swim_rule` verdict, season, bathing sites, beach, swim place, geothermal bonus, hazards subtracted |
| activity | 0.14 | kayak, sailing, marina, slipway, dive, boat trips, fishing, walks (`WALKS_TERM` 0.18) |
| acclaim | 0.13 | fame, 60 per cent standing at home and 40 per cent in Europe, log scaled |
| water | 0.10 | EEA class via `WATER_VALUE` (Excellent 1.0, Good 0.7, Sufficient 0.35, Poor 0); `WATER_DEFAULT` 0.62 or the country median when no site |
| wildness | 0.08 | what is built within 800 m, subtracted; default `WILDNESS_DEFAULT` 0.60 |
| photo | 0.06 | `photo_raw` from the photo engine's beauty rank, 60/40 home and Europe |
| shore | 0.04 | path along the shore within `SHORE_PATH_M` 300, beach, slipway; default `SHORE_DEFAULT` 0.45 |

The weights sum to exactly 1.0 (asserted). `STANDOUT_BONUS` is 0.15 on the
best of `STANDOUT_ON` = scenery, swimming, activity. Tiers: `TIER_CUTOFFS`
{1: 6.3, 2: 7.5, 3: 8.5}. Unmeasured parts use defaults in the wire score; the
v5 view (`v5_components`, read by `pipeline/nature_tiers.py`) leaves them
unmeasured and uses Europe only fame and photo.

`gem_score` is the residual of quality (`quality_of`, fame and photo excluded)
against what fame predicts; it never moves the ranking, and lakes above
`GEM_MAX_ACCLAIM` (0.55) are never gems. `reasons_for` emits up to `REASON_MAX`
(10) reason codes with parameters; the app turns them into sentences in
`continent-app/src/lib/lakeStory.js`. `best_for` and `hazard_codes` derive the
tags and the hazards list.

### The swimming verdict (`swim_rule`)

Returns (`yes` | `limited` | `no` | `unknown`, source). Order: curated seed
`swim` wins (`curated`); then a ban from OSM (`swimming=no`, `access=no` or
`private`), an article fact `swim_ban`, or `SWIM_BAN_RE` in the Wikipedia swim
text gives `limited` if the lake has designated EEA sites, else `no`; then EEA
designated sites give `yes` (`eea`); then a mapped swimming place or beach
(OSM tags, context, shore sweep) gives `yes` (`osm`); then a reservoir whose
text or facts say drinking water gives `limited` (`article`); else `unknown`.
`SWIM_VALUE` maps the verdict to 1.0, 0.55, 0.4, 0.0, and a `no` makes the
swimming component 0 and is said so, not ranked low silently. Never guess a
`no` into a `yes`: this is the one field that can hurt somebody.

### The season estimate (`water_temp_estimate`, `swim_season`)

Twelve monthly surface temperatures from CHELSA air normals: thermal lag
(0.35 to 0.60 by depth), a solar gain up to 3 C, a shallow water bonus up to
1.2 C, a depth penalty up to 1.2 C, 0.003 C per metre above 1,000 m, and 3 C
off for glacier fed water. A geothermal lake returns None. The season is the
contiguous months at or above `SWIM_WARM_C` (18); `SWIM_GOOD_C` is 20. It is
published as an estimate with the model named (`model.season_model`), never as a
measurement.

### Hazards (`hazards_of`)

`cold_shock` (peak below 16 C, 1,200 m or higher, latitude 63 or more, glacier),
`algal_bloom` (Poor or Sufficient class, algae or eutrophic fact, or shallow
large and warm), `currents`, `dam_release`, `water_quality`, `boat_traffic`,
plus the seed's own `haz`. Each subtracts from swimming (0.04 to 0.12).

## The gate (`pipeline/lakes/export_lakes.py`)

1. Rated: score at least `MIN_SCORE` (5.4), at least `MIN_IMAGES` (4) usable
   photos, a lead photo evidenced by one of `HERO_TIERS`, a name
   (`publishable`).
2. Duplicates within `DUPLICATE_KM` (1.2) collapse (`dedupe`).
3. Region quota (`quota_ordered`): rows group by NUTS3, a region's first
   `published_target` rows rank ahead of every region's overflow. Overflow is
   deprioritised, never dropped, so the quota decides which rows fill a
   country's budget.
4. Country cap `PUBLISH_MAX` (400) decides how many; `verify_lakes.mjs` fails if
   more than two countries sit on the same maximum.
5. Floors (`region_floor_fill`): every applicable NUTS3 at least 1 row of any
   tier (`quotas.floor`), every river basin at least `BASIN_FLOOR` (2), and a
   `COUNTRY_FLOOR` (4) backstop of scored rows down to `FLOOR_MIN_SCORE` (4.0).
   Promoted rows are `listed`: no score key, in a separate array
   (`listable`, `wire_listed`).
6. `validate` and `validate_listed` run before write; a failure leaves the old
   wire.

The quota constants are in `pipeline/regions/quotas.py` (`QUOTA`,
`published_target`, `floor`): lake unit nuts3, `lakes_over_5ha ** 0.5 * 1.5`,
lo 2, hi 40 (see `docs/REGIONS.md`).

## The wire (`continent-app/public/lakes/`)

`index.json` (`generated_at`, `n_lakes`, `n_listed`, `model`, `countries`,
`absent`, `attribution`, `sources`), `top.json` (Europe wide list, at most
`TOP_PER_COUNTRY` (6) per country, `TOP_N` (200) rows), and `CC.json` per
country (`country`, `generated_at`, `n`, `lakes`, `listed`). A lake row carries
`id`, `name`, `cc`, `kind`, `lat`, `lon`, `score`, `tier`, `sub`, `measured`,
`comp`, `gem`, `why`, `hazards`, `tags`, `bestFor`, `images`, `swim`, `water`,
`access`, `services`, `sports`, `ferry`, `base`, `rg`, `region`, `v5` and
source ids. The model block is in the index: `model.version`, `model.weights`,
`model.tier_cutoffs`, `model.min_score`, `model.country_floor`,
`model.basin_floor`, `model.region_quota`, `model.season_model`,
`model.warm_c`, `model.hero_tiers`.

Measurements read from the wire in this checkout (2026-11-05): `generated_at`
2026-10-28, `n_lakes` 1,628 rated, `n_listed` 1,048, 45 country files plus
`index.json` and `top.json`. They move with every export.

Images are Commons only, with author and licence kept per image
(`ATTRIBUTION` in the export, `credit` in the row); `CARD_PX` (500) sizes the
card thumbnail. Place lines come from the spine via
`pipeline/regions/place_truth.py`.

## Checking it

- `python pipeline/lakes/check_doc.py` after editing this file or renaming
  anything in `pipeline/lakes`.
- `node continent-app/scripts/verify_lakes.mjs` against the wire.
- App side: `continent-app/src/lib/lakeStory.js` (sentences) and the Lakes
  category screens, documented in `docs/areas/outdoors.md`.

## Not verified here

No network and no `cache/lakes/` in this session, so no stage was re-run; the
numbers above are from code constants and the committed wire only.
