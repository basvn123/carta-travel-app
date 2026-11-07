# T1185: The way back for one-way walks

ROADMAP item D24 (Trail quality pack), round 2 session S101, batch 7. Branch `p15-s101-way-back`.

## Date

2026-11-07

## What changed

A one-way walk now says how to get back to its start. At export, `pipeline/trails/way_back.py` stamps `wb` on every published one-way row (line ends more than 0.5 km apart, judged by the line) and on every trek (from the end of its last stage to the start of its first; trek stages carry none). The record has the straight line back, the walk back along the route, a taxi estimate (flagged `est`), and the public transport modes found within 500 m of each end, with `_src` and `_asof`. No public transport time is shipped, because the repo has no timetable; a database without the transit table ships no `pt`, which the page reads as "we have no public transport data", not as "none". The trail page's Getting there section shows the block, with "Plan this day" opening the day planner on the walk, and a one-way walk with no record says "we do not know how to get back". The wire rebuild is a box run, so the shipped wire has no `wb` yet. Measured on the shipped 2026-09-13 wire: 6,348 of 17,619 rows are one-way by their line.

## Research

A research subagent compared the options (web, about 10 minutes).

| Option | Source | Licence | Fit |
|---|---|---|---|
| Straight line x circuity factor | MapAtlas detour study, 116 European city pairs, median 1.18 to 1.26, 1.29 under 150 km (https://mapatlas.eu/blog/distance-as-the-crow-flies) | n/a | Chosen: 1.3 |
| Road speed from engine defaults | OSRM car profile 55 km/h secondary, 40 tertiary; Valhalla defaults (https://valhalla.github.io/valhalla/speeds) | n/a | Chosen: 50 km/h, a judgement between them, not a published average |
| Local OSRM or Valhalla on the OSM extract | ODbL | free | Best later (T1185-c) |
| OSM stop presence | https://wiki.openstreetmap.org/wiki/Public_transport | ODbL | Chosen: stop within 500 m, no times |
| GTFS feeds, Transitland, OpenTripPlanner | https://www.transit.land, https://docs.opentripplanner.org | per feed, free to $250 a month, LGPL | Needs a licence review per country (T1185-b) |
| Navitia, Rome2rio, Google transit | vendor terms | paid or AGPL, caching limits | Rejected |

## Files touched

Created: `pipeline/trails/way_back.py`, `tests/test_trail_way_back.py`, `continent-app/src/lib/wayBack.js`, `continent-app/src/browse/WayBack.jsx`, `continent-app/tests/wayBack.test.mjs`, `continent-app/scripts/verify_way_back.mjs`, this report.

Modified: `pipeline/trails/export_wire.py` (end-of-line transit column `TRANSIT_END_COL`, `way_back.apply` after the treks), `continent-app/src/browse/TrailPage.jsx`, `continent-app/src/styles/88-place-template.css` (`.pt-way-list`), `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (17 `wayBack.*` keys each), `continent-app/scripts/ci/contract.mjs` (`validateTrailWayBack`), `continent-app/scripts/ci/check-contract.mjs` (seven seeded breaks), `docs/SCHEMA.md`, `docs/HANDBOOK.md` (trails step 8), `ROADMAP.md`, `Execution/_OPEN.md` (T1185-a to d).

## Commands run

```
python -m pytest tests/test_trail_way_back.py -q
python -I <scratch>/stamp.py <scratch>/wire          # measure and stamp a scratch copy of the shipped wire
cd continent-app && npm test && node scripts/ci/design-lint.mjs && npx eslint <touched files>
node scripts/ci/check-contract.mjs
npm run data -- --split-only                          # so the dev server boots; generated files are gitignored
CHROMIUM=/opt/pw-browsers/chromium WB_WIRE=<scratch>/wire node scripts/verify_way_back.mjs   # vite on 5199
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Rows with a way back on the shipped wire | 0 | 6,348 of 17,619 would get one (36%); the real run needs the box | |
| Treks with a way back | 0 | 0 (the shipped wire has no treks; the T1184 export is pending) | |
| pytest, new suite | n/a | 7 passed | |
| npm test | not measured | 1,716 passed, 0 failed, 12 skipped, before the last TrailPage edit; new tests in wayBack.test.mjs | |
| design-lint new violations | 0 | 0 | 0 |
| Wire size | not measured | not measured (the export is a box run) | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The block did not show on a BergeSeen stage | the row's `is_loop` flag is true on many A to B walks (T1184-d), so the page's loop test hid it | the block is shown when a record exists, which is judged by the line; recorded as T1185-d |
| App showed "couldn't load travel data" in the browser check | no generated `boot.json` in the container | `npm run data -- --split-only`; the generated files are gitignored |
| Two test expectations off by 0.1 km | my arithmetic | expectations corrected, code unchanged |

## Screens checked

Trail page of a one-way BergeSeen Trail stage (AT 20050) on a scratch copy of the shipped wire stamped by `way_back.py` (public transport modes on that row were set by hand, since the wire has no stop data), at 390 x 844 and 1280 x 860: title, straight line 9.9 km, "A train stop is near both ends. We do not know the times", taxi about 20 min, 12.9 km (an estimate), on foot 16.4 km about 7 h 50 min, "Plan this day". No horizontal scroll, no page errors. The unknown wording ("we do not know how to get back") is covered by node tests only. Screenshots in `Execution/P15/T1185-shots/` (gitignored).

## What is still open

- T1185-a: the export run on the box (needs the lab with `transit_stops`).
- T1185-b: public transport times need an open GTFS feed per country.
- T1185-c: road time per trail end from local OSRM or Valhalla instead of the factors.
- T1185-d: the `is_loop` flag still mislabels A to B walks elsewhere on the page.

## Owner steps (for the checklist)

- [T1185-a] Run the trails export with way back | the wire carries no `wb` until the export runs on the box with the lab | start the lab; run `python pipeline/trails/export_wire.py`; run `node continent-app/scripts/ci/check-contract.mjs` and open one one-way trail page | Execution/P15/T1185-way-back.md

## Rollback procedure

`git revert` the T1185 commits. Nothing live changed; the wire is rewritten only by the next export run, and an older app ignores the extra `wb` key.
