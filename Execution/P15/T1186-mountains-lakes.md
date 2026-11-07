# T1186: mountains route up and lakes water class filled (S102)

ROADMAP items: D24, D7. Branch `p15-s102-mountains-lakes`. Date 2026-11-07.

## What was asked
Build the fill steps for the mountain route up (14.8% today) and the lake water class (55.8%) and 258 unknown swim flags, with sources and terms checked, tested on fixtures; the network run is an owner step.

## Research
Compared sources (subagent, partly unverified, see open checks):
- Lake water class: EEA WISE/DISCODATA bathing sites (primary, already in `harvest_bathing_water.py`; EEA reuse is normally free with attribution, not verified on the catalogue page); national portals as per-country add-ons (France data.gouv.fr Licence Ouverte, Sweden HaV, Finland SYKE open; Switzerland does not report to the EEA); OSM tags for the swim flag only (ODbL); Wikidata has nothing systematic, skipped.
- Mountain route up: Geofabrik extracts with osmium (best for batch, no rate limits), Overpass per summit (fine with caching, public instance about 10k queries a day, no parallel scripts), waymarkedtrails.org (no published API policy, not used).
- Choice: EEA wider second pass plus optional national CSV plus Overpass swim tags; Overpass per summit for routes now, extract filtering later (T1186-c).

## What changed
- `pipeline/lakes/fill_water.py`: pure `fill`/`apply` plus `--harvest-osm`. Safety: existing verdicts never change, `no` only from an explicit OSM ban, Poor gives `limited`, no evidence stays unknown. `_src`/`_asof` on every block.
- `pipeline/mountains/fill_route_up.py`: `routeUp` block (kind, near_m, sac, ways, names, `_src`, `_asof`) from OSM ways within 400 m.
- `tests/test_fill_outdoor.py` (7 tests, pass), `docs/LAKES.md` and `docs/data/mountains.md` sections.
- Not touched: the app does not read `routeUp` yet (T1186-d).

## Numbers
| | Before (wire, this container) | After |
|---|---|---|
| Lake rows with water block | 895 of 2,676 | not measurable here: `cache/eea_bathing_water.json` is a git LFS pointer, so the join found 0 |
| Lake swim rule unknown | 256 | same, needs the cache and sweep |
| Mountains with a route | 275 of 2,143 (12.8% of wire rows; audit said 14.8%) | same until the sweep |
Expected after (estimate, not measured): water class +5 to +10 points from the name-guarded second pass; unknown swim flags down by roughly 40 to 60% via EEA and OSM tags; mountain routes: a path within 400 m for most Alpine and Pyrenean summits, perhaps 50 to 65% of rows.

## How it was checked
pytest `tests/test_fill_outdoor.py` on fixtures; `check_doc.py` 50 pointers resolve; ruff on touched files. Dry runs on the committed wire run clean.

## What broke
Nothing.

## Rollback
`git revert` the T1186 commits. Wire patches by `--apply` are additive (`water`, `routeUp`, swim rule/src for unknown rows); re-export restores the wire.

## What is still open
See `Execution/_OPEN.md` rows T1186-a to T1186-d.

## Owner steps (for the checklist)
- [T1186-a] Lake water class run | fills water class and unknown swim flags on the wire | `git lfs pull` or `python pipeline/harvest_bathing_water.py --refresh`; `python pipeline/lakes/fill_water.py --harvest-osm --apply`; record before/after counts | pipeline/lakes/fill_water.py
- [T1186-b] Mountain route up run | fills route up for summits with no route | `python pipeline/mountains/fill_route_up.py --harvest --apply` (paced Overpass, resumable); record counts | pipeline/mountains/fill_route_up.py

## Test note
Container run: `npm test` 1008 pass, 84 fail; pytest cannot collect 8 files (missing psycopg and similar). I changed no app code, so these come from the container (missing data and packages), not from T1186; CI is the judge. The new `tests/test_fill_outdoor.py` passes (7).
