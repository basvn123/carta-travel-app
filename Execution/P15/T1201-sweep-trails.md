# T1201: Register follow-up sweep, trails

ROADMAP item: register follow-up (trails), the round 2 follow-up sweep of the trails rows (round 3 session S117, batch 13); the rows belong to D24 (Trail quality pack), whose status line gains this sweep. Branch `p15-s117-sweep-trails` from `p15-round3`. Brief: `Execution/P15/_run_r3/briefs/S117.md`.

## Date

2026-11-07

## What changed

The 30 open `next task` rows raised by T1179, T1181, T1182, T1183, T1184, T1185 and T1186 were worked through: 20 are closed, 8 stay open with a reason, and 2 turned out to be owner steps and moved to `user`. The fixes that matter most to a traveller: the loop flag and the route type now follow the line, not a wrong `roundtrip=yes` tag. On the shipped wire 296 rows called a loop have ends more than 1 km apart (all of the BergeSeen Trail), and 295 rows carry a loop route type with such ends. The trail page now reads those as one way, with the way back block, and drops a "loop" reason that the route type contradicts (Old Man of Storr). The pipeline fixes the cause at the next curate and attributes run. The retired describe.py leads ("This easy path ..." on 1,949 m of climb) leave the wire: the export now ships 0 of the 244 walk summaries it shipped before, and the app and planner rail no longer print them. A walk's highlights stop calling fountains, basins and harbours "lakes": 790 of 10,090 lake highlights carry such a name today. Rocks, ridges, saddles, capes and bays become highlights, which lifts walks like the Old Man of Storr off the scenery floor. Routed bridges (T1183) now reach the wire with their own sentence, their climb counts in the ascent, and they use a house BRouter profile that keeps to waymarked ways. A stage row now carries its superroute's stage count, so the trek block can say "stage 5 of 12". Treks get a third ordering method, chaining stage ends, but it adds no trek on today's wire. The trails external check now finds a famous day walk on a longer published route (Durdle Door on the England Coast Path): coverage rose from 149 to 157 of 282, and the top band from 93 to 98. The trail summaries joined the D2 quality gate. Every offline eval now runs in CI and in the box run. The famous registry now places superroutes and cross-border routes from member ways in the country's extract. The mountain route-up sweep can now read Geofabrik extracts with osmium. The box lab gets a 28-day push timer, and the box env file and Hetzner README now name it. Most of these reach the wire only on the next box run of the trails chain (owner step T1201-b).

## Research

None chosen as a new tool, library, service or data source. Each method was already chosen by the raising task's research (T1183: BRouter and its stock `hiking-mountain` profile, with 0.5 named in row T1183-e; T1184: chaining by ends as Waymarked Trails does; T1186: osmium over Geofabrik extracts). The house profile `carta-hiking.brf` is the stock BRouter 1.7.10 `misc/profiles2/hiking-mountain.brf` (MIT), fetched from raw.githubusercontent.com, with one value changed. So no research subagent was run.

## Rows, one by one

Group before: 43 open rows from T1179, T1181 to T1186 (30 `next task`, 13 `user`). After: 21 open (8 `next task`, 13 + 2 = 15 `user`), plus 3 new T1201 rows.

| Row | Outcome | What was done, or why it stays |
|---|---|---|
| T1179-b | open | Task half done: `trails_summaries` follows `trails_rate` in `run_pipeline.py`, so the file follows the wire. The export half waits on the owner's choice T1179-a (English `summary` or `parts` through t()) |
| T1179-c | closed | `scripts/quality/rules.yaml` `text_checks` re-check `data/trails/summaries.json` with `summaries.check()`: dash and banned words hard; facts and length soft (facts stays soft until T1179-b ships both in one run, else every rebuild fails the gate on a stale file). 2,089 summaries, 0 findings |
| T1179-d | closed | Fixed at the cause in `scenic.classify`: `natural=water` is a lake only for `water` absent or lake, pond, reservoir, oxbow, lagoon or stream_pool; a river is `water`; fountains, basins, harbours, canals and the like are no highlight. The S112 sampling half: 790 of 10,090 lake highlights on the wire carry a fountain, basin, harbour or pool name (a name sample, before) |
| T1179-f | closed | `export_wire.wire_summary` ships None for a walk whose lead is a retired describe.py lead (244 of 244 walk summaries on the wire; the 458 in the row also counted 215 city days, whose leads are kept). The app's `looksTemplated` learns the missing shapes ("Based on its distance", "is a 9.3 km walking route", "This easy path"), and the planner rail no longer prints a templated lead |
| T1181-b | moved to user | The code half is T1183 and T1184; what is left is the rerun after the owner's box run T1183-a, so it is an owner step |
| T1181-c | closed | Cause: `famous_registry.scan_osm_fame` took a relation's coordinate from its first member way only, so a superroute (stage relations only, the Cleveland Way) or a cross-border route whose first way lies in the neighbour's extract got none. It now tries up to 25 member ways and follows child relations two levels deep. 1,487 registry rows carry a relation and no coordinate today; the count after needs the next `trails_registry` run (owner T1181-i) |
| T1181-d | open | Needs a written rule for what a composed walk round a landmark is, and the lab and OSM to build one; its own task |
| T1181-f | closed | New highlight kinds rock (rock, stone), ridge (ridge, arete), saddle, cape and bay in `scenic.py` (Overpass selector, weight), with chip codes in `attributes.HIGHLIGHT_CODE` and labels in six languages. The re-rate is the box chain (T1201-b) |
| T1181-g | closed | The source is `rate.reasons_for`, which said "loop" from `is_loop`; `is_loop` is also true on an out and back (Old Man of Storr) and on near loops typed as one way (Quiraing). Now `says_loop` follows the route type, and the app drops a loop reason the route type contradicts |
| T1181-h | closed, already done | T1187 (D23 runner) made trails `coverage` and `in_top` hard checks with tolerance 0 (`scripts/validation/layer_trails.py` CHECKS), and the D2 engine fails on them (`engine._validation_gate`). `runner.py trails --check` passes |
| T1181-j | closed | `ci.yml` job `evals` runs `run.mjs --check` (all nine offline evals, about 30 s); `run_pipeline.py` runs `run.mjs --check --write --dashboard` after the quality gate (a failure is a soft failure, `CARTA_PYTHON` set to the run's interpreter); `docs/reference/evals.md` regenerated, now nine evals |
| T1181-k | closed | `trails_external.py`: a day walk nothing else matched counts on a longer row (at least 2 times its length) whose line passes within 600 m of its start, past the registry landmark when there is one, and which names one of the walk's words among its sights. The last rule rejects false hits a start-only test gave (Helvellyn on the Ullswater Way, Saana on the Nordkalottruta). 8 new matches, read one by one; baseline moved |
| T1182-c | open | Depends on T1182-d (which steps still go to the worker in box mode) and on a live box lab (T1182-a); pushing and restoring a live lab around a worker run cannot be tested here |
| T1182-d | moved to user | Which inputs live on the volume (extracts, DEM tiles, BRouter tiles) is a cost and sizing decision: volume GB at EUR 0.0572 a month each, against keeping those tasks on the worker |
| T1182-e | closed | `carta-trailslab-push.timer` (Tuesdays 02:30) runs `infra/hetzner/cax11/trailslab_push_due.sh`: `lab.sh push` when the last push is 21 days old or more (`CARTA_TRAILSLAB_PUSH_DAYS`), so pushes are at most 28 days apart; a logged skip outside box mode; `cron/install.sh` installs it |
| T1182-f | closed | `infra/hetzner/cax11/env.example` names `CARTA_TRAILSLAB_HOME` and `CARTA_TRAILSLAB_PUSH_DAYS` and points at `lab.env.example`; `infra/hetzner/README.md` gains "The box lab instead of the worker" |
| T1183-b | closed | `export_wire.bridges_of` ships `routed-bridge` repairs as `bridges {n, max_m, total_m, routed}`; the trail story says routed bridges follow mapped paths (three keys in six languages); `docs/SCHEMA.md` row added. Found on the way: `route_bridge.plan_route` lost the per-bridge list (the count overwrote it); it now rides as `bridge_list` |
| T1183-c | closed | `splice.py --sync-only` adds `repair_info.bridge_ascend_m` to `ascent_m` once, marked in `elevation.bridge_ascend_m` (elevation.py rewrites both together). Descent and walking time are not adjusted: row T1201-c |
| T1183-e | closed | `tools/brouter/profiles/carta-hiking.brf`: the stock profile with `hiking_routes_preference` 0.5; `route_bridge.PROFILE` uses it, `--profile hiking-mountain` runs the stock one |
| T1183-f | closed | `docs/data/pipeline.md` names `trails_route_bridge` (and `trails_summaries`); `docs/architecture/lineage.md` already named it (generated) and was regenerated |
| T1184-b | closed | `treks._chain`: stage ends within 200 m make neighbours, accepted only as one unique path through every stage (no branch, no ring), tried after position and name numbers. On the wire it adds no trek: the refused groups break into two or more chains because stages between them are not published (Guadiana 2 chains, Via Alpina Purple 8 pieces, Via Sancti Martini branches). Ordering such pieces is row T1201-a |
| T1184-c | open | Needs the planner's entry point for a multi-day walk, which does not exist; a design task |
| T1184-d | closed | Fixed at the cause: `curate.MARK_LOOPS_SQL` and `attributes.route_type_of` let the roundtrip tag win only while the merged line's ends are within 1 km (`TAG_LOOP_MAX_M`, the trail page's T430 bound). The trail page applies the same guard to the wire's route type now |
| T1184-e | closed | `hierarchy.classify_graph` gives each stage its superroute's stage count (`h.n`, null on every stage before); `treks.build` keeps it as the trek's optional `of`; the contract checks it (one seeded break); the trek block reads "5 of 12 stages published" and "This is stage 5 of 12" |
| T1184-f | open | A trek page of its own is its own design task (the row says so) |
| T1185-b | open | Needs an open GTFS feed per country with a licence review, and hosts the container cannot reach |
| T1185-c | open | Needs local OSRM or Valhalla on the box |
| T1185-d | closed | Same cause as T1184-d; on the shipped wire the page now says "One way" and shows the way back block for the BergeSeen stage (browser check below) |
| T1186-c | closed | `fill_route_up.harvest_extract`: a relations pass for hiking members, then foot ways and tracks with locations, kept per summit within 600 m on a 0.01 degree grid; `--extract <pbf>` replaces the Overpass sweep; a hiking member reads `kind: marked`. Tested on an OSM XML fixture |
| T1186-d | open | Ordered after the owner run T1186-b (its Order column); no `routeUp` is on the wire to export or show yet |

## Files touched

- Pipeline: `pipeline/trails/attributes.py`, `curate.py`, `rate.py`, `export_wire.py`, `route_bridge.py`, `splice.py`, `scenic.py`, `treks.py`, `hierarchy.py`, `famous_registry.py`; `pipeline/mountains/fill_route_up.py`; `run_pipeline.py` (task `trails_summaries`, the evals hook).
- Validation and quality: `scripts/validation/trails_external.py`, `scripts/quality/engine.py`, `scripts/quality/rules.yaml`; regenerated `data/reports/validation/trails_external.json`, `.md`, `trails_external_baseline.json`, `data/reports/evals/` (latest results and history).
- App: `continent-app/src/browse/TrailPage.jsx`, `src/browse/TrekStages.jsx`, `src/lib/trailStory.js`, `src/lib/treks.js`, `src/planner/dayExploreRails.js`, `src/i18n/{en,nl,de,fr,es,it}.js` (3 bridge keys, 5 highlight kinds, 2 trek keys), `scripts/ci/contract.mjs`, `scripts/ci/check-contract.mjs`.
- Infra and tools: `infra/hetzner/cax11/trailslab_push_due.sh` (new), `infra/hetzner/cron/carta-trailslab-push.service` and `.timer` (new), `infra/hetzner/cron/install.sh`, `infra/hetzner/cax11/env.example`, `infra/hetzner/README.md`, `tools/brouter/profiles/carta-hiking.brf` (new), `.github/workflows/ci.yml`.
- Tests: `tests/test_trail_loop_flag.py` (new), `tests/test_trailslab_push_due.py` (new), `tests/test_famous_registry_superroute.py` (new), `tests/test_trail_route_bridge.py`, `tests/test_trail_treks.py`, `tests/fixtures/trail_treks/DE.json`, `tests/test_trails_external.py`, `tests/test_quality_engine.py`, `tests/test_fill_outdoor.py`, `continent-app/tests/trailStory.test.mjs`, `continent-app/tests/trailTreks.test.mjs`.
- Docs: `docs/HANDBOOK.md` (trail rating, gap repair, treks, trail summaries, trails external check, quality gate, evals), `docs/SCHEMA.md` (`bridges`, trek `of`), `docs/data/pipeline.md`, `docs/data/mountains.md`, generated `docs/reference/{python,tasks,config,evals}.md`, `docs/architecture/lineage.md`; `ROADMAP.md` (D24 status); `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`; this report.

## Commands run

```
git checkout -b p15-s117-sweep-trails origin/p15-round3
pip install -r requirements.txt pytest ruff==0.14.3; cd continent-app && npm ci
python -I pipeline/trails/treks.py --report <scratch>/treks_before.json      # and after
python -I scripts/validation/trails_external.py --write-baseline --write --check
python -I scripts/validation/runner.py trails --check
python -I scripts/quality/engine.py --no-validation
cd continent-app && node scripts/eval/run.mjs --check --write --dashboard
python -I scripts/docs/build_reference.py; build_lineage.py; config_reference.py   # then each --check
python -I scripts/docs/drift.py; python infra/hetzner/cron/schedule.py --check --no-state
bash infra/hetzner/cron/install.sh --dry-run
python -m pytest tests -q <quarantine deselected>; ruff check --select E9,F63,F7,F82 pipeline src scripts run_pipeline.py tests
cd continent-app && npm test && npm run lint && node scripts/ci/design-lint.mjs
CARTA_CONTRACT_DERIVE_SPLIT=1 node scripts/ci/check-contract.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild
npm run data -- --split-only; vite on 5199; node <scratch>/verify_t1201.mjs   # then the generated boot.json and dest/ removed
```

## Config and secrets set

New environment names, no values: `CARTA_TRAILSLAB_PUSH_DAYS` (blank = 21) and the timer `carta-trailslab-push.timer`, installed only by `cron/install.sh`. `CARTA_PYTHON` is set by `run_pipeline.py` for the eval runner. No secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Group rows open (T1179, T1181 to T1186) | 43 (30 next task, 13 user) | 21 (8 next task, 15 user) + 3 new T1201 rows | 20 closed, 2 moved to user |
| Wire rows called a loop with ends more than 1 km apart (shipped wire) | 296 (`is_loop`), 295 (`f.rt` loop) | the trail page reads them as one way now; the pipeline writes them false at the next curate and attributes run | |
| Walk summaries the export ships that are retired describe.py leads | 244 of 244 (41 with "easy") | 0 (`wire_summary` on the same rows) | -244 |
| Lake highlights with a fountain, basin, harbour or pool name (name sample) | 790 of 10,090 | at the next scenic sweep (T1201-b) | |
| Trails external check: reference trails published | 149 of 282 (52.8%) | 157 of 282 (55.7%) | +8 |
| Trails external check: top band | 93 of 282 (33.0%) | 98 of 282 (34.8%) | +5 |
| Treks on the shipped wire | 119 (56 refused not_one_path) | 119 (56): the chain finds no unique path in them | 0 |
| Stage rows with the superroute's stage count `h.n` | 0 of 1,635 | at the next hierarchy run | |
| Registry rows with an OSM relation and no coordinate | 1,487 | at the next `trails_registry` run | |
| Evals run by CI or the box run | 0 of 9 | 9 of 9 (CI job, box hook) | +9 |
| D2 text checks on generated texts | 0 | 4 (2,089 summaries, 0 findings, about 6 s) | +4 |
| Python tests (quarantine deselected) | 582 pass in T1181's run | 1,008 pass, 2 fail (`test_rating_inputs`, `test_rating_stability`: LFS cache absent in this container, as in T1179 to T1183), 11 skipped | |
| App tests (`npm test`) | 1,716 pass (T1185) | 1,890 pass, 0 fail, 12 skipped | |
| Lint, design-lint, CSP | | lint 0 errors (36 warnings, as before); design-lint 0 new; CSP 0 violations over 40 screen loads | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The routed repair's per-bridge figures were lost | In `route_bridge.plan_route`, `**detail` (where `bridges` is the count) came after the list and overwrote it | The list rides as `bridge_list`; the count stays `bridges` |
| A start-only line test matched Helvellyn to the Ullswater Way and Saana to the Nordkalottruta | A trailhead on a long route says nothing about the summit walk | The longer row must also name one of the walk's words among its own sights |
| The chain order resolved the T1184 fixture's `order_conflict` case | Its two stages touch, which the new order can now put in a line | The fixture's second stage moved 0.2 degrees away so it still tests a conflict that cannot be settled; a new test covers the touching case. The fixture was rewritten in its own format (indent 1, ASCII escapes), 7 lines changed |
| `trekTotals` deep-equal tests failed | The totals gained the `of` key | Expectations name `of: null`; a new test covers `of` |
| A push-due test matched "LAB" inside "TRAILSLAB" | Marker too short | The fake lab prints FAKELAB |
| 3 app tests failed after the browser check | `npm run data -- --split-only` wrote `public/boot.json` and 262 `public/dest/` files (gitignored, generated by this session) | Removed them; suite green again (as T1184 recorded) |
| eslint would not start | `npm ci` not yet run in the container | `npm ci` |
| The house profile needed the stock text | Not in the repo (the image downloads it) | Fetched the 1.7.10 file from raw.githubusercontent.com, one value changed, header credits the source and licence |

## Screens checked

Trail page on the shipped wire at 390 x 844 and 1280 x 860 (scratch script, screenshots in `Execution/P15/T1201-shots/`, gitignored): BergeSeen Trail 15 (AT 20050), tagged roundtrip with ends 9.9 km apart, now reads "One way. It ends somewhere else, so plan the way back" and shows the way back block ("We do not know how to get back from the end of this walk"), no "Loop". Old Man of Storr (GB 188352) reads "Route: There and back" and no longer lists "A loop, so you finish where you parked". No horizontal scroll and no page errors on any of the four loads. Not seen in a browser, because no wire data carries them yet: the routed bridge sentence and the trek "of N" line (node tests cover both), and the planner rail's dropped lead (unit level). Every screen passed the CSP check.

## What is still open

- T1179-b (next task, narrowed): the export of the summaries in the form the owner picks in T1179-a.
- T1181-d, T1182-c, T1184-c, T1184-f, T1185-b, T1185-c, T1186-d: open, reasons in the table above.
- T1181-b and T1182-d: now owner rows (see Owner steps).
- T1201-a (next task): the 56 `not_one_path` treks split into several end chains because stages between them are unpublished; order the pieces by member position and accept a gap only where the missing positions explain it.
- T1201-b (user): the box run of the trails chain that carries this sweep to the wire, with its numbers.
- T1201-c (next task): a routed bridge's descent and the walking time are not adjusted (BRouter reports climb only).
- Cards still read the wire's `is_loop` (the loop icon on a card, the loops-only filter) until the next export writes the corrected flag; the page is guarded now, the cards follow the export (part of T1201-b).

## Rollback procedure

`git revert` the T1201 commits on `p15-s117-sweep-trails`. Nothing is one-way: no wire file, migration or live system changed. The new timer is only installed by `cron/install.sh`; `install.sh --disable` stops it. The baseline of the trails external check moves back with the revert.

## Owner steps (for the checklist)

- [T1201-b] Run the trails chain so the T1201 fixes reach the wire | the loop flag, route type, lake and landform highlights, stage counts, routed bridges and the dropped describe.py leads are in code but not on the wire | on the box with the lab up (T1182-a), run `python run_pipeline.py --only trails_hierarchy,trails_curate,trails_scenic,trails_attributes,trails_rate` (trails_rate exports, then `trails_summaries` follows); then count rows with `is_loop` true and ends over 1 km (296 before, expect about 0), lake highlights with fountain, basin or harbour names (790 before), walks with no highlight (a quarter before), stage rows with `h.n`, treks with `of`, walk summaries on the wire (244 before, expect 0); run `python -I scripts/validation/trails_external.py --write --check`; put the numbers in the next report | Execution/P15/T1201-sweep-trails.md
- [T1181-b] Rerun the trails external check after the routed repair | 33 reference trails miss for broken geometry, and only the box run of the routed repair can change that | after T1183-a and the export: `python -I scripts/validation/trails_external.py --write --check`; compare the 33 failed_continuity misses (Moselsteig, Offa's Dyke Path, 10 Irish Ways); move the baseline with `--write-baseline` if coverage rose | Execution/P15/T1181-trails-external.md, Execution/P15/T1183-trail-continuity.md
- [T1182-d] Decide which trails inputs live on the box volume | 14 of 22 lab-guarded tasks need extracts, DEM tiles, BRouter tiles, Overpass or Commons; on the volume they cost EUR 0.0572 a GB a month, otherwise those tasks stay with the worker | read T1182's task list; pick per input: volume (size it) or worker; tell the next session, which then writes T1182-c | Execution/P15/T1182-trails-lab-box.md
