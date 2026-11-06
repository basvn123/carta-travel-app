# Cross-layer joins (`nb`)

Written for T1085 (ROADMAP B2) from `pipeline/joins/neighbours.py` (397 lines, the only file in `pipeline/joins/`) and its readers in `continent-app/src/`. The retired `archive/docs-2026-11/JOINS.md` was not used as a source.

## What it does

One spatial pass over the already exported layer wires. For every published row it writes an `nb` object of neighbour ids, so a mountain page can list the trails that climb it without any geo query in the browser. Tier: scheduled, task `joins` in `run_pipeline.py`.

| Property | Value (constant) |
|---|---|
| Key written | `nb` (not `near`: mountain rows already ship `near` as the nearest priceable hub) |
| Model version | `MODEL_VERSION` = `joins_v1` |
| Projection | EPSG:3035 (`pyproj` transformer from 4326); distances in metres |
| Index | one `shapely` `STRtree` per destination layer per country (`CountryIndex`) |
| Dependencies | `pyproj`, `shapely` (the module imports them at top level) |

## Layers

`LAYERS` maps a short layer name to its wire folder, rated array and listed array. Both arrays are joined and both receive `nb`.

| Layer key | Wire folder | Rated array | Geometry used |
|---|---|---|---|
| `beach` | `continent-app/public/beaches/` | `beaches` | `lat`, `lon` |
| `lake` | `lakes/` | `lakes` | `lat`, `lon` |
| `peak` | `mountains/` | `mountains` | `lat`, `lon` |
| `trail` | `trails/` | `trips` | `geometry` LineString or MultiLineString, else the `bbox` centre |
| `cycle` | `cycling/` | `routes` | same as trail |

Country files are `{ISO2}.json` in each folder. A row with no usable geometry is skipped. Trips are not a destination layer; they are handled apart (below).

## Rules

`RULES` is `(source, destination) -> (radius km, max ids)`. A source layer only searches the destinations it has a rule for.

| Source to destination | Radius km | Max ids |
|---|---|---|
| beach to trail | 5 | 4 |
| beach to beach | 15 | 4 |
| beach to cycle | 3 | 3 |
| lake to trail | 4 | 4 |
| lake to peak | 15 | 4 |
| peak to trail | 6 | 6 |
| peak to peak | 20 | 5 |
| trail to beach | 3 | 3 |
| trail to lake | 2 | 4 |
| trail to peak | 3 | 4 |
| cycle to every other layer (`*`) | 5 | 6 |
| trip stop to every layer (`TRIP_RULE`) | 25 | 8 per layer |

Pairs with no rule are never searched: beach to lake or peak, lake to beach, lake, or cycle, peak to beach, lake or cycle, trail to trail or cycle (so a mountain lists no lakes, and a trail lists no other trail).

Ranking in `rank_hits`: rated rows before listed rows, then higher `score`, then smaller distance, then id. The row itself is excluded, duplicates dropped, list cut at the limit. This keeps a warm rebuild byte identical.

## Output shape

```
"nb": {"trail": ["65085", "21526"], "lake": ["si-lake-bled-Q648902"]}
```

- Keys are the layer short names `beach`, `lake`, `peak`, `trail`, `cycle`. Ids are the neighbour's wire id in the same country file. Empty lists are omitted; a row with no neighbours carries no `nb` (the key is popped first, so a re-run removes stale ids).
- Point layer joins are same-country only: a Belgian beach never lists a Dutch trail. `stamp_country` loads one country at a time.
- Cycling tours: each entry under `tours` in a cycling country file gets an `nb` over its whole line, using the cycle rule.
- Trips: `stamp_trips` writes `nb` onto each stop in `continent-app/public/trips/trip/<id>.json`, resolved against the stop's own `iso2` (so a stop abroad uses that country's index), radius and limit from `TRIP_RULE`.
- Model file: a full run (no `--countries`, not `--dry-run`) writes `continent-app/public/joins.json` with `generated_at`, `version`, `key`, `rules_km_limit` (keys like `beach->trail`, value `[km, limit]`), `trip_rule_km_limit`, `rows_stamped`, `trip_details_stamped` and per country stamped counts. A targeted run does not touch it.

## Running it

```
python pipeline/joins/neighbours.py                     # every country that has a wire file
python pipeline/joins/neighbours.py --countries SI,AT --verbose
python pipeline/joins/neighbours.py --skip-trips --dry-run
```

Task `joins` is cadence `after` with `after` = `beaches`, `lakes`, `mountains`, `trails_rate`, `cycling_publish`, `trips`; flags `writes_wire`, `soft`. It rewrites the wire files in place (compact JSON, `separators=(",", ":")`).

## Ordering hazard

Any layer export rewrites its files without `nb`, so the join must run after the last export of a build. In `TASKS` the `joins` entry sits before `regions`, whose note says region pages are composed from stamped rows. But an `after` task enters the plan at start only when a dependency already succeeded more recently than it did; when `beaches` or `trips` succeeds in the same run, `chain_followups` appends `joins` to the END of the plan, after `regions`. In that case the region pages are composed from rows without `nb`. Not verified against a real run log.

Evidence of the effect in this checkout: `continent-app/public/joins.json` is dated 2026-09-13 and counts 23,990 rows stamped, but a scan of the five layer wires here finds 0 of 46,080 rows with `nb`, and 0 of 3,949 trip detail files with a stop `nb`. The app handles this: `continent-app/src/browse/NearbyOutdoors.jsx` renders the "nothing nearby" line only for a row that carries an `nb` block, so an unjoined row renders no neighbour block at all.

## Readers

| Reader | Use |
|---|---|
| `continent-app/src/lib/neighbours.js` | `NB_ORDER` = trail, peak, lake, beach, cycle; resolves ids against country files |
| `continent-app/src/browse/NearbyOutdoors.jsx` | Renders one section per neighbouring layer on layer pages; carries a copy of the radii from `RULES` |
| `continent-app/src/browse/{BeachPage,LakePage,MountainPage,TrailPage}.jsx`, `ExploreTab.jsx`, `GuidedSearch.jsx` | Mention `nb` or `joins.json` |

## Not verified

- Whether `NearbyOutdoors.jsx` radii still match `RULES` (not diffed).
- Whether the production build box stamps `nb` after the last export; the local wire says it did not at the time of this checkout.
