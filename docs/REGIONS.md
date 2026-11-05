# The region layer

Rewritten from the code on 2026-11-05 (T1085, ROADMAP B2). The code wins over
this page. The previous 574 line version is in git history; it carried
build-session narrative that no code reads.

The region layer is the unit between "beach" and "country". It gives every
published row a region id, sizes how many rows each region should publish
(the quota), audits coverage per region and country, writes one wire file per
region, and gives the app the distance bands behind "within a day trip of
Knokke".

Code lives in `pipeline/regions/`. The app side is
`continent-app/src/lib/regions.js`. The pipeline task is `regions` in
`run_pipeline.py` (order: `build_regions.py --skip-fetch`, `coverage.py`,
`export_regions.py --all`; its guard needs geopandas and h3).

## What this document promises the wire contains

Every field named below is checked by `continent-app/scripts/verify_regions.mjs`
against the shipped wire (it reads this block, it keeps no copy). Keep the list
in step when you add a pointer.

```pointers
coverage.json           quota_units
coverage.json           refreshed
coverage.json           layers
region/index.json       model.quotas.beach.hi
region/index.json       coverage_version
region/{ID}.json        listed
region/{ID}.json        editorial
region/{ID}.json        neighbours[].name
```

## Invariants and measurements

An invariant is a constant in code (quota formulas, `lo`/`hi`, band cut points).
If this page and the module disagree, this page is wrong. A measurement is a
reading from a wire at a moment, and is stamped with its date.

Measurements on the wire in this checkout (read 2026-11-05): `region/index.json`
`generated_at` 2026-09-16, `version` `regions_v1`, `n_regions` 4,848 (372
`nuts2`, 2,666 `coast`, 1,810 `range`); `coverage.json` `version`
`coverage_v1`, `generated_at` 2026-09-04. `cache/regions/` is not present in
this checkout, so the spine (`regions.gpkg`) and `opportunity.json` could not be
re-read here. Any other count you meet is unknown until re-read.

## The chain

```
region_sources.py   download the sources into cache/regions/src (cached, never re-fetched)
build_regions.py    normalise into cache/regions/regions.gpkg (six layers)
coasts.py           cut the EEA coastline into stretches      (called by build_regions)
seed_coasts.py      hand names for stretches travellers search for
opportunity.py      per region measures -> cache/regions/opportunity.json
quotas.py           the quota model (reads opportunity.json)
assign.py           point or line to region ids (every layer's enrich calls it)
coverage.py         audit -> public/coverage.json, reports/coverage_contract.json, backlog CSVs
coverage_gate.py    CI judge of the contract (stdlib only)
export_regions.py   public/region/{ID}.json and index.json
place_truth.py      place lines from the spine (T456); repair_places_wire.py fixes the published wire
```

### The spine (`build_regions.py`)

One GeoPackage, `cache/regions/regions.gpkg`, EPSG:4326, six layers:

| Layer | Content |
|---|---|
| `admin` | NUTS 0..3 (2024) for the NUTS countries; ONS ITL 1..3 for the UK; geoBoundaries for Ukraine, Moldova and the microstates (`GEOBOUNDARIES_UA` and friends in `region_sources.py`); one `system` column |
| `lau` | GISCO Local Administrative Units 2024 (`--skip-lau` drops them) |
| `coast` | named coastal stretches (see below) |
| `range` | GMBA Mountain Inventory v2 ranges touching Europe, hierarchy kept |
| `basin` | WISE WFD river basin districts |
| `biogeo` | the EEA biogeographical regions (`BIOGEO_CODES`) |

Region ids stay as the source minted them (`EL30` stays `EL30`); the `country`
column carries the app ISO2 (`CC_APP = {"EL": "GR", "UK": "GB"}`). Lengths and
areas are measured in EPSG:3035 and stored as attributes. The Europe bounding
box is `EUROPE_BBOX = (-32, 27, 45.5, 72)`. Sources change yearly: delete
`cache/regions/src` to refresh them (note on the `regions` task in
`run_pipeline.py`).

### Coastal stretches (`coasts.py`, `seed_coasts.py`)

The EEA coastline polygon is exploded into rings. Rings shorter than
`RING_OWN_KM` (40) become one islands stretch per NUTS3. Longer rings are
sampled every `SAMPLE_M` (2000) m, assigned to the nearest level 3 region, cut
hard at a national border and soft at a regional seam, and merged until a
stretch reaches `TARGET_KM` (75), never beyond `MAX_KM` (120), minimum
`MIN_KM` (40). `seed_coasts.py` names the stretches a traveller would search
for (merging neighbours by `span_km`); the rest are labelled "<region> coast".
Known edge: the EEA coastline lacks the Ukrainian Black Sea coast, so rows
there carry no coast id and the audit says why.

### Assignment (`assign.py`)

`assign_point(lat, lon)` returns `nuts3`, `coast`, `biogeo` and `h3r4`. A point
no admin polygon contains snaps to the nearest level 3 region within `SNAP_KM`
(5); a coast match tolerates `COAST_KM` (15, lagoon beaches sit inland); basins
snap within `BASIN_SNAP_KM` (10). `assign_line` gives a trail the region of its
length midpoint and lists every region it crosses. Layers store the result at
enrich time (`rg`); export reads what was stored, so a wire rebuild never needs
the spine. Backend is shapely STRtree by default, PostGIS with
`CARTA_REGIONS_BACKEND=postgis`.

## The quota model (`quotas.py`, `opportunity.py`)

`MODEL_VERSION = "region_quota_v1"`. `published_target(region, layer)` is
`clamp(round(per_unit(region)), lo, hi)`, or 0 when the layer does not apply.
The score gate still applies: a quota is a target, nothing is invented to hit
it.

| Layer | Unit | per_unit | lo | hi |
|---|---|---|---|---|
| beach | coast | `coast_km / 12` | 3 | 60 |
| lake | nuts3 | `lakes_over_5ha ** 0.5 * 1.5` | 2 | 40 |
| mountain | range | `peaks_over_p100 ** 0.4 * 2` | 2 | 40 |
| trail | nuts3 | `4 + 8 * protected_share + 6 * relief_norm` | 3 | 45 |
| cycling | nuts3 | `2 + route_km / 60` | 2 | 30 |

`applicable()`: a `COAST:` id applies to beach, cycling, trail; a `GMBA:` id to
mountain, trail, cycling; elsewhere beach needs `coast_km > 0 or
lakes_over_20ha > 0`, lake needs `lakes_over_5ha > 0`, mountain needs
`relief_m > 250`, trail and cycling always apply. An inapplicable region is
`na` with a reason code (`why_not_applicable`), not a hole. `floor()` is the
minimum rows of any tier so a page is never empty: 1 at NUTS3, 3 at NUTS2
(`level == 2`); listed rows may satisfy it. `model_block()` writes the model
into `region/index.json` (`model.quotas`, `model.floor`, `model.applicable`).

`opportunity.py` writes `cache/regions/opportunity.json`: `coast_km` (EEA
coastline), `lakes_over_5ha` and `lakes_over_20ha` (lake harvest pool; an
unmeasured area counts for the 5 ha rung only), `peaks_over_p100` (prominence
>= 100 m), `relief_m` (GeoNames settlement DEM p98 minus p02, raised by the
highest known peak; a proxy), `protected_share` (OSM protected-site density,
capped at 1; a proxy), `route_km` (published trail km), with
`RELIEF_NORM_M = 2000`. A missing measure is 0, which yields the `lo` clamp.
If the file is absent `has_data()` is false and gates skip the quota step.

Callers of `published_target`: `pipeline/beaches/export_beaches.py`,
`pipeline/lakes/export_lakes.py`, `pipeline/trails/curate.py`, plus the
reports in `pipeline/trails/coverage_report.py` and `coverage.py`.

## Coverage audit (`coverage.py`, `coverage_gate.py`)

Outputs: `continent-app/public/coverage.json` (per region per layer: published
vs quota and floor, status `ok | thin | empty | na`, reason code beside every
non-ok status; plus `contract` per country per layer: `pass | fail | n/a`),
`reports/coverage_contract.json` (failing cells with the named rows they are
made of), `reports/coverage_backlog_{layer}_{date}.csv` (deficit regions joined
to the candidates the gate rejected, replayed through each layer's own export
gate), `reports/coverage.html`. `--strict` exits 1 on a blank cell. The gate
(`coverage_gate.py`, workflow `coverage-contract.yml`) fails on a missing or
blank cell, a non-passing cell without a reason code or detail, and an `ok`
cell below its floor; with `--baseline` a cell that was ok may not regress.
Reason codes: `no_open_data`, `way_only_not_derived`, `failed_continuity`,
`below_quota`, `not_applicable`, `licence_blocked`, `pending_partnership`.
Trails are counted but not examined (publication is human approval in the lab).
See `docs/data/coverage.md`.

## The wire (`export_regions.py`)

`public/region/{FILE}.json` for every NUTS2 region, coastal stretch and GMBA
range, plus `index.json` (`regions[]` with `id`, `name`, `kind`, `country`,
`counts`, `file`) and the quota model. A region file holds `region`
(`id`, `name`, `kind`, `country`), `generated_at`, `rated` (cards ranked by
score, each tagged `layer`), `listed` (cards with no score key, a separate
array on purpose so a screen opts in), `editorial` (pinned seed picks) and
`neighbours`. Layer wires read: beaches, lakes, mountains, trails (key
`trips`), cycling (key `routes`) (`LAYER_WIRES`). Rules the export keeps:

- An empty region still gets a file, because a missing JSON under `public/` is
  served as the SPA index with status 200.
- A region that leaves the spine has its file deleted, only on `--all`;
  `--regions A,B` never de-indexes.
- The gate runs before any write; a validation failure leaves the old wire.
- `file_for()` maps `:` to `_` and prefixes reserved device names (`con`,
  `prn`, `com1`...) with `R_`; the app mirrors it as `fileForRegion()`.
- Trail cards drop their geometry.

## Travel bands and the scope ladder (`lib/regions.js`)

`TRAVEL_BANDS`: nearby <= 30 km, daytrip <= 120, weekend <= 300, journey
beyond (straight line). The drive estimate next to the middle bands is
`0.6 + km * 1.3 / 72` hours (`LEG_FIXED_H`, `ROAD_FACTOR`, `LEG_KMH`) and is
shown with a tilde. `scopeForRows()` picks the header from the nearest row:
<= 30 `nearby`, <= 120 `day_trip`, <= 300 `region`, else `neighbours`, so a
row beyond 100 km never sits under a "near you" header. Other exports: `loadRegionIndex`,
`loadRegion`, `loadCoverage`, `bandChip`, `groupByBand`, `regionShareUrl`.

## Checking it

- `node continent-app/scripts/verify_regions.mjs` (needs the app served; checks
  the wire against `quotas.py`, every pointer above, and whether a quota clamp
  decides outcomes).
- `python pipeline/regions/coverage_gate.py --self-test` and `--check
  reports/coverage_contract.json`.
- Pytest for the region modules lives under `tests/` (not enumerated here).

## Not verified here

The spine, opportunity file and region page screens were not rebuilt in this
session (no `cache/regions/`, no network). Region page UI rules belong to
`docs/areas/regions.md`.
