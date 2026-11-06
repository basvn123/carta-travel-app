# T1183: Routed continuity repair for broken trails (D24)

ROADMAP item: D24 (trail quality pack, the `failed_continuity` bullet). Round 2 session S99, batch 5. Builds on T1094 (reorder pass, `chain.py`), T1180 and T1181 (T1181-b: 33 reference trails miss for broken geometry).

## Date

2026-11-06

## What changed

The trails chain has a new repair step for walks whose OSM relation breaks into pieces with gaps too long for a straight line. `pipeline/trails/route_bridge.py` takes what both splice passes left and routes each break on foot paths with BRouter's stock `hiking-mountain` profile. A route is repaired only when every break closes within strict limits. Each break may be at most 2 km in a straight line. The routed bridge must snap within 50 m at both ends, be at most 3 times its gap plus 200 m and never over 3 km, run at least 80% on path ways, and use not one metre of motorway, trunk or ferry. A route may have at most 8 bridges, and they may total at most 5 km and 10% of its length. Breaks up to 300 m that cannot be routed well may still take a straight connector, held to splice.py's 750 m total. The parts stay in relation order, and only their direction is chosen, so the line keeps the relation's start, end and order. A final check proves it before anything is stored. A repaired route lands in `trip_repairs` as `routed-bridge`, which curate, regionize and export already read. A refused route stays exactly as it was. Its reason is one of 14 named refusals, kept in `validation_runs` (`route_bridge`) and in `data/reports/trails_route_bridge.json`. The step runs as `trails_route_bridge`, after `trails_splice` and before `trails_curate`. It sits behind `CARTA_TRAILS_ROUTE_BRIDGE=1` and is skipped while the flag is off or BRouter is down. `splice.py --sync-only` now also syncs the stated distance of routed repairs. The 24 fixture tests cover every limit and every refusal, plus one recorded BRouter answer. No route was repaired here: the cloud container cannot reach the lab, BRouter tiles or OSM. The run is an owner step, and the expected counts are below.

## Research

A research subagent compared engines for this exact job: short foot bridges, offline per country in Docker, an open licence, and per-edge OSM highway tags so the "follows paths" rule can be checked.

| Engine | Version, licence | One country | Per edge tags | Setup here |
|---|---|---|---|---|
| BRouter | 1.7.10, MIT | rd5 tiles, about 1 GB disk, under 1 GB RAM | yes, `WayTags` per segment in the geojson `messages` | none: already in `tools/brouter/` for cycling |
| Valhalla, pedestrian | 3.x, MIT | a few GB of tiles, 8 to 16 GB RAM to build | partly (`trace_attributes`: edge use and road class, not the raw highway tag) | a new tile build per country, only CH exists |
| GraphHopper, foot | 11.1, Apache 2.0 | about 4 to 5 GB heap for Germany | yes (`details=road_class`) | a new Java service and graph per country |
| OSRM, foot | 6.x, BSD 2 | several GB to preprocess | no | most work, least fit |

Chosen: BRouter with the stock `hiking-mountain` profile. Paths, footways and tracks cost about 1. Main roads without a sidewalk cost 10 (primary) to 20 (trunk), and motorway costs 100000. `SAC_scale_limit` is 3, so bridges keep off alpine scrambles. `trekking` is a bike profile and `shortest` ignores way type, so both were rejected. The subagent found no published bridge caps, so the caps above are this task's own. They follow its suggested starting values (2 km gap, 3x and 3 km routed, 80% on paths, 50 m snap, no trunk or motorway), plus totals sized from splice.py's existing ones. The subagent read the WayTags behaviour in the profile guide but did not see a live answer, so the owner's dry run prints one (step T1183-a). Sources: [BRouter releases](https://github.com/abrensch/brouter/releases), [hiking-mountain.brf](https://raw.githubusercontent.com/abrensch/brouter/master/misc/profiles2/hiking-mountain.brf), [BRouter profile developers guide](https://brouter.de/brouter/profile_developers_guide.txt), [GraphHopper releases](https://github.com/graphhopper/graphhopper/releases), [GraphHopper self hosting](https://www.graphhopper.com/blog/2022/06/27/host-your-own-worldwide-route-calculator-with-graphhopper/). The Valhalla and OSRM figures are from the subagent's own knowledge, because their docs were unreachable.

Why each cap (also in the module docstring):
- `MAX_GAP_M = 2000`: about half an hour on foot, the size of a lost connector, a village crossing or a ford. Longer is a missing leg, so Offa's Dyke Path (one 189 km break) stays out.
- `ROUTED_FACTOR = 3`, `ROUTED_SLACK_M = 200`, `MAX_BRIDGE_M = 3000`: a longer answer is BRouter finding a detour, not the dropped path. The slack lets a 40 m break go round a fence.
- `PATH_SHARE_MIN = 0.80` and no motorway, trunk or ferry: the brief's "follows paths". Residential and service ways count as path ways, because waymarked trails cross villages on them.
- `MAX_BRIDGES = 8`, `MAX_BRIDGED_M = 5000`, `MAX_BRIDGED_SHARE = 0.10`: the count is splice.py's. The share stops a short walk from being mostly our line, and the absolute cap binds on long trails (10% of a 285 km trail would be 28 km).
- `SNAP_M = 50`: a snap further than this means there is no way at that end.

## Files touched

- Created: `pipeline/trails/route_bridge.py`, `tests/test_trail_route_bridge.py` (24 tests), `tests/fixtures/trail_route_bridge/brouter_answer.json`.
- Modified: `pipeline/trails/splice.py` (the `--sync-only` SQL also syncs `routed-bridge`), `run_pipeline.py` (task `trails_route_bridge` with guard `guard_trails_route_bridge`, and `trails_curate` now follows it), `docs/HANDBOOK.md` (trails, gap repair), `ROADMAP.md` (D24 status), `Execution/_OPEN.md` (rows T1183-a to T1183-f).
- Regenerated (not hand edited; CI checks them with `build_reference.py --check`): `docs/reference/tasks.md`, `docs/reference/python.md`.

## Commands run

```
python -m pytest tests/test_trail_route_bridge.py -q
ruff check --select E9,F63,F7,F82 run_pipeline.py pipeline/trails/splice.py pipeline/trails/route_bridge.py tests/test_trail_route_bridge.py
python -I scripts/docs/build_reference.py && python -I scripts/docs/build_reference.py --check
python -I scripts/docs/check_entry_points.py
python -m pytest tests -q (deselecting tests/quarantine.txt)
```

Full Python suite, quarantine deselected: 660 passed, 10 skipped, 2 failed. The two failures are `test_rating_inputs.py::test_beauty_v2_reads_no_register` (a JSON data file reads empty in this container) and `test_rating_stability.py::test_adding_places_moves_nobody_else`. Neither imports any file this task touched.

## Config and secrets set

New environment flag `CARTA_TRAILS_ROUTE_BRIDGE` (unset by default, so the step is skipped). The caps are module constants in `pipeline/trails/route_bridge.py`. No secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Fixture tests for the routed repair | 0 | 24 passing | +24 |
| Named refusal reasons kept per route | 0 (Valhalla `repair.py`: CH only, free text) | 14 | +14 |
| Routes repaired by routing outside CH | 0 | 0 here; the owner run measures it | not measured |
| `failed_continuity` rows, `data/reports/trails_coverage.json` (committed) | 4,555 (3,518 in the 2026-09-18 sweep) | owner run | not measured |
| T1181 reference misses for broken geometry | 33 | owner run | not measured |

### Expected before and after counts for the owner run

None of this could be measured here (no lab, tiles or OSM in the container), so these are expectations to check against, not results.

- Candidates (the dry run's first line): every staged multi-part hike of 2 to 400 km with no fresh repair. This is more than the registry's `failed_continuity` rows, because the step also sees relations no registry row names. Expect several thousand. Per country, the dry run prints the exact number.
- Refusals: `gap_too_long` should be the largest reason by far. The T1181 reviews put missing stages and order artefacts at the top, and splice.py already shows its reorder pass handles the rest. Offa's Dyke Path must come out as `gap_too_long` with a max gap near 189 km. If it is repaired, the limits are not working: stop and report.
- Repaired: expect a minority of candidates, about 10% to 30%, mostly relations with one to three breaks of 300 m to 2 km. An answer above 40% means a limit is too loose. Read 20 repaired routes on the map before the real run.
- Coverage after curate: `failed_continuity` in `trails_coverage.json` falls from 4,555 by at most the number of repaired registry routes that curate then publishes. The rest of the repaired routes still compete for quota.
- T1181-b: of the 33 misses, Offa's Dyke Path stays missing. The Irish National Waymarked Trails (10 of the 33) and the Moselsteig are the ones to watch. A pass is any of them moving from missing to matched in `trails_external.py`.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `keeps_order` could fail a valid line | a BRouter vertex can equal a part's first point, and the first version stopped at the first match | the search moves on after a mismatch; the happy-path tests cover it |
| No OSM geometry for the T1181-b trails in the container | api.openstreetmap.org, overpass-api.de and brouter.de are refused by the egress proxy | synthetic fixtures shaped like those trails (an Irish Way with a 600 m and a 1,200 m break, Offa's 189 km break, parts out of order); the real check is owner step T1183-a |

## Screens checked

None. Nothing a traveller sees changed. Repaired routes reach the wire only through the owner run and a normal export.

## What is still open

- T1183-a (user): the owner run on the box or laptop, with the expected counts above.
- T1183-b: routed bridges do not ship as `bridges` on the wire. `export_wire.bridges_of` reads `straight-splice` only, and the export logic was out of this task's scope. The trail page should say a route has routed bridges, as it does for spliced ones.
- T1183-c: ascent and the elevation profile of a routed repair come from the original relation (`elevation.py` samples `trips.geom`). A bridge's own climb is recorded in `repair_info.bridges[].ascend_m` but not counted. Re-sample repaired geometry, or add the bridge ascent.
- T1183-d: relations whose parts are out of order and also have a real break are refused as `gap_too_long`, because this step keeps relation order on purpose. A combined pass (splice reorder, then route the one real break) needs an owner rule on what "keeps the order" allows.
- T1183-e: the stock `hiking-mountain` profile has `hiking_routes_preference = 0.2`. A house `carta-hiking.brf` in `tools/brouter/profiles/` (outside this task's files) with about 0.5 would keep bridges on waymarked ways.
- T1183-f: `docs/data/pipeline.md` and `docs/architecture/lineage.md` list the trails tasks by hand and do not name `trails_route_bridge` yet (outside this task's files).

## Owner steps (for the checklist)

- [T1183-a] Run the routed trail repair on the box | repairs the broken trails D24 counts (3,518 in the sweep, 33 T1181 reference misses) and is the only way to measure the step | on the box with the lab up, stage tiles for one country first: `python tools/brouter/prepare.py --country IE --up --wait`; dry run and read the counts against the report's expected numbers: `python pipeline/trails/route_bridge.py --countries IE --dry-run --verbose`, then open data/reports/trails_route_bridge.json and check one route's bridges on the map; real run: `python pipeline/trails/route_bridge.py --countries IE` then `python pipeline/trails/splice.py --sync-only`; repeat per country (GB, DE next), or set `CARTA_TRAILS_ROUTE_BRIDGE=1` and let `python run_pipeline.py --only trails_route_bridge` run it with the tiles staged; then `python run_pipeline.py --only trails_curate`, the normal elevation and rate chain, `python pipeline/trails/coverage_report.py --all` and `python -I scripts/validation/trails_external.py --write`; put the before and after counts in the next task's report | Execution/P15/T1183-trail-continuity.md, pipeline/trails/route_bridge.py

## Rollback procedure

`git revert` the T1183 commits. Data written by an owner run is reversible: `DELETE FROM trip_repairs WHERE repair_info->>'method' = 'routed-bridge'` in the lab, then rerun `trails_curate` (the `route_bridge` rows in `validation_runs` are history and can stay). With the flag unset, the step never runs.
