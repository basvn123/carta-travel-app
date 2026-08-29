# The region layer

The unit between "beach" and "country". From Knokke the beach list used to
run 3 km, 3 km, then 135, 141, 208, 216, 225, 236, 243, 243, 244, 244, 397,
415 km, all under a header that said "Near Knokke". The cause was never a
missing radius filter: the catalogue had no unit between a beach and a
country, and a country level publish cap decided Belgium gets 2 beaches and
Spain gets 120 no matter where in Spain they are. This layer builds that
missing unit and the machinery that uses it: region ids on every published
row, per region publication quotas, a coverage audit with a work queue, and
an app that says "within a day trip of Knokke" instead of "415 km away,
near you".

## What changed, and why

- **A region spine exists.** One GeoPackage holds NUTS 0..3 (2024) for 39
  countries, ONS ITL 1..3 for the UK (the UK is not in NUTS 2024, checked
  against the live GISCO files), geoBoundaries for Ukraine, Moldova and the
  microstates, 97,987 LAU municipalities, ~2,600 coastal stretches cut from
  the EEA coastline, 1,810 GMBA mountain ranges touching Europe, 171 WISE
  river basin districts and the EEA's eleven biogeographical regions.
- **Every layer row knows where it is.** Enrich stamps `rg` (nuts3, nuts2,
  coast stretch, range, basin, biogeo, H3 r4 cell) into the cache; export
  reads it back and ships it. The export never recomputes an assignment.
- **Quotas replace flat caps as the selection order.** The beach, lake and
  mountain gates now group candidates by their honest unit (stretch, NUTS3,
  range), cut each group at its opportunity sized quota, and interleave so
  every region's first pick outranks any region's second. The country cap
  still binds as a ceiling; lifting it is the per layer briefs' work, but
  WHICH rows fill it is now decided region first.
- **The photo gate no longer empties the floor's pool.** The standing
  mountain bug: COUNTRY_FLOOR=8 relaxed the score, but `publishable()` had
  already deleted every peak short a photograph, so Lithuania sat at 4. Gate
  order is now score -> photo -> quota -> floor fill -> dedupe -> write, and
  photo failures fall through to the floor as `listed` candidates.
- **A third outcome exists between publish and drop.** A `listed` row is
  verified to exist, named, deduped, in region, and NOT scored: the wire
  omits the score key entirely (absent, not null), the row lives in a
  separate `listed` array a screen has to opt into, and the app renders it
  as a visibly different card with a "not scored yet" chip.
- **Coverage is audited, with receipts.** `coverage.py` writes the wire
  status per region per layer (ok | thin | empty | na with the reason) and a
  backlog CSV joining every deficit region to the specific candidates the
  gate rejected and why ("score_4.9_below_5.4", "imgs_1_strong_0"), by
  replaying each layer's own gate code over its own caches.

## The chain

```
pipeline/regions/
  region_sources.py   polite clients: GISCO, ONS ArcGIS, geoBoundaries,
                      EarthEnv GMBA, EEA datashare and ArcGIS, cache first
  build_regions.py    one command: fetch -> normalise -> index ->
                      cache/regions/regions.gpkg (+ opportunity measures)
  coasts.py           cuts the EEA coastline into 40..120 km stretches,
                      borders hard, admin seams soft, numpy ring walk
  seed_coasts.py      the human decided file: ~200 traveller's names
                      (Costa de la Luz, Cote d'Opale, the Belgian coast)
  assign.py           point/line -> RegionIds; shapely STRtree by default,
                      PostGIS behind the same signature for the trails lab
  quotas.py           the quota table, floors and applicable(); the model
                      block that ships in every index.json
  opportunity.py      how much of each thing a region actually has
  coverage.py         the audit: coverage.json + backlog CSVs + coverage.html
  export_regions.py   region/{ID}.json + region/index.json, gate before write
pipeline/oneoff/
  backfill_regions.py stamps rg onto every cached row that predates the spine
```

```
continent-app/
  src/lib/regions.js        loaders, travel bands, the scope ladder,
                            #region= deep link, the ':' -> '_' file mapping
  src/browse/RegionPage.jsx the region record: rated, listed, neighbours
  src/browse/DestinationsTab.jsx  band chips on every card, band dividers
                            in near mode, the scope aware header
  scripts/verify_regions.mjs
```

## Rebuilding it

```
python pipeline/regions/build_regions.py            # fetch + gpkg + opportunity
python pipeline/oneoff/backfill_regions.py          # once, for pre-spine caches
python pipeline/beaches/export_beaches.py           # rg + quotas + listed
python pipeline/lakes/export_lakes.py
python pipeline/mountains/export_peaks.py
python pipeline/regions/coverage.py                 # audit + backlog
python pipeline/regions/export_regions.py --all     # region pages
python run_pipeline.py --only regions               # the scheduled shape
```

Cold, the fetch is ~600 MB and minutes; the build is ~15 minutes, most of
it the LAU read and the coastline walk. Warm (sources and gpkg on disk),
build_regions is minutes and everything downstream is seconds.

### Why a rebuild reproduces

- **The cache is the snapshot.** Every source lands in cache/regions/src
  and is never fetched again while the file exists; the geoBoundaries URLs
  are pinned to release commits so the licence recorded matches the bytes.
- **Assignment is stored, not recomputed.** Enrich stamps `rg` into the
  layer caches; exports read what enrich stored, so the wire never depends
  on this module being loadable.
- **The model ships with the data.** The quota table, floors and
  applicable() rules ride in every index.json as `region_quota`
  (region_quota_v1), and verify_regions.mjs holds the wire copy against
  quotas.py.
- **The gate runs before the write.** export_regions composes and validates
  every file first; a failure leaves the previous wire standing. Same rule
  the layer exports already lived by.
- **No reading is not a bad reading.** A region the opportunity table has
  not measured is quota-exempt, never quota-zero: `applicable()` reports
  n/a with the reason, and a beach that cleared every gate in an unmeasured
  region still publishes.

## Where the data comes from

| Source | What it gives | Licence |
|---|---|---|
| Eurostat GISCO NUTS 2024 | admin spine, 39 countries, levels 0..3 | EC reuse (CC BY compatible) + EuroGeographics notice |
| Eurostat GISCO LAU 2024 | 97,987 municipalities | same |
| ONS Open Geography ITL 2025 | the UK spine (not in NUTS post Brexit) | OGL v3 + OS Crown copyright |
| geoBoundaries gbOpen | UA, MD, AD, SM, FO, MC fill | mixed per release (ODbL / PD) |
| GMBA Mountain Inventory v2 | 1,810 named ranges with hierarchy | CC BY 4.0 |
| EEA coastline for analysis v3 | the shoreline the stretches are cut from | EEA re-use |
| EEA biogeographical regions | the eleven region axis | EEA re-use |
| EEA/WISE WFD RBD 2022 | river basin districts | EEA re-use |

Rejected on licence, recorded so nobody relitigates them: GADM and
WDPA/Protected Planet, both non-commercial.

## The model

Quotas are computed from opportunity, not fiat, and the table ships in the
wire verbatim:

```
beach     per coast stretch   coast_km / 12                    clamp 3..60
lake      per NUTS3           lakes_over_5ha ** 0.5 * 1.5      clamp 2..40
mountain  per GMBA range      peaks_over_p100 ** 0.4 * 2       clamp 2..40
trail     per NUTS3           4 + 8*protected_share + 6*relief_norm  3..45
cycling   per NUTS3           2 + route_km / 60                clamp 2..30
```

The floor is a different number from the quota, on purpose: the quota is
how many RATED rows a region should carry (a target the score gate still
polices), the floor is the minimum rows of ANY tier so a region page is
never empty, satisfiable by listed rows. Floor: 1 per applicable NUTS3, 3
per applicable NUTS2, country floors unchanged per layer.

`applicable()` keeps honesty symmetrical: a region is never held to a quota
it cannot meet. No coast and no big lakes, no beach quota; relief under
250 m, no mountain quota; Flanders is not failing at mountains.

Three opportunity inputs are labelled proxies in the artifact itself
(`cache/regions/opportunity.json` carries a basis string per input):
relief comes from GeoNames settlement DEM spread raised by the highest
pooled peak until the GLO-30 sweep lands; protected_share is OSM protected
site density until Natura 2000 + Emerald polygons land; lake counts come
from the harvest pool until the full OSM sweep lands. The quota formulas
are the brief's, unchanged; only the inputs upgrade.

### Travel bands and the scope ladder

Raw kilometres left the cards. A distance is grouped into the band a
traveller thinks in: nearby (<= 30 km, shown in km), day trip (<= 120 km,
shown as an estimated drive, tilde marked), weekend (<= 300 km), worth the
journey (beyond, shown in km again because at that range the number IS the
message). The drive time reuses the cartaRoute road model (1.3 detour,
72 km/h, 0.6 h fixed) and exists to size a chip, not to promise an arrival;
the precomputed gateway-to-row travel time matrix from the brief is future
work and the estimate is the sanctioned v1.

The near screen's header is composed from the scope that actually
answered, decided by the nearest row: "Near Knokke" (<= 30 km), "Within a
day trip of Knokke" (<= 120), otherwise the honest far phrasing with the
nearest row's region or distance. Band dividers rule the list at every
boundary, so a far row can never render under a near heading. That is the
assertion verify_regions.mjs makes, and the screenshot this programme
started from cannot come back.

## What gets published

- `public/region/index.json`: every region with counts per layer, the
  quota model block, the coverage version.
- `public/region/{ID}.json`: one file per NUTS2 region, coastal stretch
  and GMBA range: `region`, `rated` (ranked cards, each tagged with its
  layer), `listed` (no score key, separate array), `editorial` (seed picks,
  empty until the layer briefs land), `neighbours`. Windows cannot put a
  colon in a filename, so `COAST:ES-LUZ-CADIZ` ships as
  `COAST_ES-LUZ-CADIZ.json`; `fileForRegion()` in lib/regions.js mirrors
  the mapping, and reserved device names get an `R_` prefix (the fare layer
  paid for that lesson).
- An empty region still gets a file: under public/ a missing JSON is served
  as the SPA index with status 200.
- `public/coverage.json`: per region per layer, r / l counts against quota
  and floor, status ok | thin | empty | na with the n/a reason.
- `reports/coverage_backlog_{layer}_{date}.csv`: every deficit region
  joined to the candidates the gate rejected and why, straight from a
  replay of the layer's own gate. `--explain <candidate_id>` prints one
  row's full trace. `reports/coverage.html` is the human read.

## Deliberate deviations from the brief, and why

- **~2,600 stretches, not ~600.** The EEA shoreline at 1:100k carries
  281,719 km, over half of it Norwegian fjord and archipelago coast; 600
  stretches would mean 470 km each up north. The cut keeps stretches at a
  honest 40..120 km and lets Norway have its 629. A later outer-coast
  generalisation can merge fjord shorelines if browsing wants it.
- **Trails and trips ship rg but keep their own gates.** Trails' store is
  the lab database and its publication path is human approval; its quota
  adoption and backlog examiner belong to the trails brief. The audit
  counts both layers and lists their deficits without pretending the gate
  rejected anyone.
- **Country caps still bind.** This layer changes which rows fill the cap
  (region first), not the cap itself; the counts move when the layer briefs
  raise targets with the widened photo funnel behind them. The harness
  reports cap-shaped counts as WARN, not FAIL, until then.

## Checking it

```
cd continent-app && npm run build
node scripts/verify_regions.mjs
```

The harness asserts: the region index exists and its quota model matches
quotas.py; sampled region files exist, parse, keep listed scoreless and
rated ranked; top.json files carry rated rows only; sampled layer rows all
carry rg; with a mocked location on the Belgian coast the header scope is
`nearby`, cards carry band chips, and nothing beyond the nearby band
renders above the first band divider; `#region=COAST:BE-BELGIAN-COAST`
opens the page and Escape closes it.
