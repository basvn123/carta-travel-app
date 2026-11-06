# T1184: Multi-stage treks as one parent record with ordered stages

ROADMAP item D24 (Trail quality pack), round 2 session S100, batch 6. Branch `p15-s100-multi-stage-treks`.

## Date

2026-11-06

## What changed

The trails export now groups the published stages of one long walk into one trek record with its stages in order, and the trail page of every stage shows the whole trek. `pipeline/trails/treks.py` reads the evidence already on the export's rows, strongest first: the OSM superroute (`h.of` and the member position `h.i`), stage numbers in names ("Etappe 12", "(Section 4)", "15: A - B", "(1. posms)") and the famous registry (registry name and Wikidata id). It refuses a group with a named reason (`single_stage`, `order_conflict`, `loop_network`, `not_one_path`, `too_many`), leaves variants out, and checks the order against the line: neighbouring stages must lie within 40 km per missing stage, and a group tied only by names must mostly share an end. `export_wire.py` writes `treks[]` into the country file of each trek's first stage (with `_src` and `_asof` per T1143) and `trek {id, cc, i, n}` on each stage row; the contract check `validateTrailTreks` holds the two together with six seeded breaks. The trail page shows the trek's stages in order with distance and climb, the total ("12 published stages, 203 km, 8,458 m up. About 12 days on foot"), the stage numbers not published, a link to every other stage and to the trek's own row when that is published. Measured on the shipped 2026-09-13 wire (the export itself is a box run): of 579 superroute stage groups, 56 had a published parent record before; after the export 151 will (119 treks from 445 stage rows, 95 of them with no published parent row, 14 cross-border, 70 named by the registry). 374 of the remaining 428 groups have only one published stage, so there is nothing to group; 56 are refused because neither member order nor name numbers is the walking order (T1184-b). The brief's "540 of 594" comes from the HANDBOOK baseline, counted another way; on this wire the same question gives 523 of 579.

## Research

The evidence sources (superroutes, names, registry) were set by the brief; the choice made here is the ordering method. A research subagent compared it with OSM practice and Waymarked Trails (wiki.openstreetmap.org and waymarkedtrails.org were blocked in the container; it read mailing list threads and shallow clones of the WMT code):

| Option | Source | Licence | Fit |
|---|---|---|---|
| Superroute member position | OSM convention, not a spec: tagging list 2018 "Route members: ordered or not" ended at "order it if you can" (https://lists.openstreetmap.org/pipermail/tagging/2018-May/036056.html) | ODbL | Good evidence, not trustworthy alone |
| Numbers in stage names, or a `stage=` tag | names on the relations; `stage=1` proposal, rarely used | ODbL | Fallback |
| Chaining by shared end nodes | Waymarked Trails `wmt_db/geometry/route_builder.py` `_make_linear`: member order first, else join by end nodes, flag `linear=yes/sorted/no`; its API lists subroutes unordered | GPL-3.0 (copy the method, not the code) | Third fallback, later |
| Wikidata "has part" (P527) with series ordinal (P1545), P155/P156 | https://www.wikidata.org | CC0 | Patchy, famous trails only; a cross check through the registry ids |

Choice: member position when it passes the line check, else name numbers when they pass, else refuse with a reason; the trek records which set the order (`order`). No open, commercially usable dataset of ordered European trek stages was found. Chaining by ends is registered as T1184-b.

## Files touched

Created: `pipeline/trails/treks.py`, `tests/test_trail_treks.py`, `tests/fixtures/trail_treks/DE.json`, `tests/fixtures/trail_treks/AT.json`, `continent-app/src/browse/TrekStages.jsx`, `continent-app/src/lib/treks.js`, `continent-app/tests/trailTreks.test.mjs`, `continent-app/scripts/verify_trail_treks.mjs`, this report.

Modified: `pipeline/trails/export_wire.py` (build treks across the run's countries before writing, `parent_osm_of`, `country_file(..., trek_list)`), `continent-app/src/lib/trails.js` (`loadTreks`), `continent-app/src/browse/TrailPage.jsx` (trek block in "Along the way"; the relation's Stages list and the family line hide when a trek is shown), `continent-app/src/browse/RouteParts.jsx` (`Stages` takes an optional `sub` line), `continent-app/src/i18n/{en,de,fr,es,it,nl}.js` (nine `trek.*` keys each), `continent-app/scripts/ci/contract.mjs` (`validateTrailTreks`), `continent-app/scripts/ci/check-contract.mjs` (runs it with seeded breaks), `docs/SCHEMA.md` (section "Multi-stage treks on the trails wire"), `docs/HANDBOOK.md` (trails: step 7 and the trek baseline), `ROADMAP.md` (D24 status), `Execution/_OPEN.md` (T1184-a to f).

## Commands run

```
python -I pipeline/trails/treks.py --report <scratch>/treks_baseline.json         # measure the shipped wire
python -I pipeline/trails/treks.py --wire <scratch>/wire --report <scratch>/r.json --apply   # stamp a scratch copy
python -m pytest tests/test_trail_treks.py tests/test_trail_*.py tests/test_trails_external.py tests/test_wire_stamps.py -q
cd continent-app && npm test && node scripts/ci/design-lint.mjs && node scripts/ci/check-contract.mjs
npx eslint src/browse/TrekStages.jsx src/browse/TrailPage.jsx src/browse/RouteParts.jsx src/lib/trails.js src/lib/treks.js tests/trailTreks.test.mjs
CHROMIUM=/opt/pw-browsers/chromium TREK_WIRE=<scratch>/wire node scripts/verify_trail_treks.mjs   # with vite on 5199
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
```

## Config and secrets set

None.

## Before/after measurements

On the shipped 2026-09-13 trails wire (17,670 rows, 1,635 stage rows), measured with `treks.py`; the "after" column is what the export will write.

| Metric | Before | After | Delta |
|---|---|---|---|
| Superroute stage groups with a parent record | 56 of 579 | 151 of 579 | +95 |
| Superroute stage groups without one | 523 | 428 (374 of them one published stage) | -95 |
| Trek records on the wire | 0 | 119 | +119 |
| Stage rows that link to their trek | 0 | 445 | +445 |
| Cross-border treks | 0 | 14 | +14 |
| Treks named by the registry | 0 | 70 | +70 |
| Groups refused (all evidence) | n/a | 449 single_stage, 62 loop_network, 56 not_one_path, 2 order_conflict, 0 too_many | |
| Variant rows left out | n/a | 98 | |
| Trails country files, bytes (45 files) | 33,080,557 | 33,185,539 | +104,982 (+0.32%) |
| Fixture: treks, refusals, stages | n/a | 4 treks, one per refusal reason, 13 stages | |
| pytest, trail suites and wire stamps | not measured | 171 passed, 1 skipped (25 new in test_trail_treks.py) | |
| npm test | not measured | 1,686 passed, 0 failed (6 new in trailTreks.test.mjs) | |
| design-lint new violations | 0 | 0 | 0 |

Largest treks expected: Columba Way and Camino Lituano (17 stages), Goldsteig-Suedroute (15), Goldsteig-Nordroute and John O'Groats Trail (14), BergeSeen Trail and Signatur Omveien (12), Haelsingeleden (10), West Highland Way (7). Bundle size: not measured (the fast build passes; TrailPage chunk 28 KB).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Numbered loops round one village grouped as treks ("Rundwanderweg Birkenau 8") | a name pattern alone cannot tell a stage from a numbered loop | `loop_network` refusal; a name-only group must also share ends |
| BergeSeen Trail first refused as a loop network | the wire's `is_loop` is true on its A to B stages | loops judged by each stage's own line (`LOOP_KM`); the flag is T1184-d |
| "HRP Etape 32" with an accented capital did not parse | the hand fold table missed capitals | per-character NFKD fold that keeps length |
| design-lint: two new `raw-button` | own buttons in TrekStages | renders through the shared `Stages` list and the kit `Button` |
| Three app tests failed during the browser check | `npm run data -- --split-only` wrote a partial `public/boot.json` and `dest/` for the dev server | removed those generated, gitignored files afterwards; suite green |
| `react-hooks/exhaustive-deps` error | effect read `tr` | `tr` in the deps |

## Screens checked

Trail page of BergeSeen Trail 05 (AT, id 20040) with the scratch wire stamped by `treks.py --apply`, served through route interception, at 390 px and 1280 px (`scripts/verify_trail_treks.mjs`, 16 of 16 checks): the block names the trek, says "This is stage 5. 12 published stages, 203 km, 8,458 m up. About 12 days on foot", lists 12 stages with distance and climb, marks "this stage", states "Not published here yet: stage 6, 9, 10, 13, 14, 19, 20, 21, 22", and opening stage 3 from the list lands on its page with stage 3 marked. Seen in the screenshots: the list reads as the existing Stages list, wraps cleanly at phone width. Seen but out of scope: the side card says "Route: Loop" for this one-way stage (T1184-d). Shots in `Execution/P15/T1184-shots/` (gitignored).

## What is still open

- T1184-a (owner): the export run that puts treks on the wire; see Owner steps.
- T1184-b: a third order by chaining stage ends for the 56 `not_one_path` groups (research recommendation).
- T1184-c: the "walk it as a trip" link to the trip planner, one stage per day.
- T1184-d: `is_loop` true on A to B stages, shown as "Route: Loop".
- T1184-e: `h.n` is never filled, so the whole path's stage count is unknown.
- T1184-f: a trek page of its own with one map.

## Owner steps (for the checklist)

- [T1184-a] Run the trails export with treks and check the counts | puts the 119 trek records and 445 stage links on the wire, which is what the trail page shows | where the lab is up, run `python run_pipeline.py --only trails_rate` (or the trails publish task), which ends in `export_wire.py` and prints a "treks:" line; open data/reports/trails_treks.json and check against this report (expect about 119 treks, 445 stages, refused 449 single_stage, 56 not_one_path, 62 loop_network, if the wire is otherwise the 2026-09-13 one; more if T1183-a repaired routes first); run `cd continent-app && node scripts/ci/check-contract.mjs` and confirm "treks and stage rows agree"; open one stage page (for example BergeSeen Trail, AT 20040) and see the trek block | Execution/P15/T1184-multi-stage-treks.md, pipeline/trails/treks.py

## Rollback procedure

`git revert` the T1184 commits. Nothing is one-way: the wire changes only at the next export, and an export after the revert writes country files with no `treks` or `trek` keys (the app shows nothing when they are absent).
