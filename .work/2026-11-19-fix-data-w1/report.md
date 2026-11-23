# Report: data wave 1 (fix programs, data)

Status: **judged, not merged on its own.** Six of seven rubric lines score 4. R3 (trail names, D7) scored 3 in all three judge loops (`judgement-1.md`, `judgement-2.md`, `judgement-3.md`). After the third loop crew's hard stop applies, so wave 1 carries R3 into wave 2. Wave 2 starts with the judge-3 name fixes, its fresh judge scores them as a carried line, and waves 1 and 2 merge into `p15-fix-programs` together only when every line is at 4 or more.

This wave answers: does the box keep its measured bed prices, refuse a bad publish and ship clean trail names, heat and fire, and true docs? Measured by the bed repro, the seeded guard, the names replay, the launch gate, the hooks script and the heat end-to-end run. Done when every rubric line is at 4.

## What changed and why
- **Beds (0.1, D10):** one predicate for a measured bed (`pipeline/stays/bed_rules.py`). The box now applies its own stays build to its master (`apply_stays.apply_build`, `box_stays.py`, `prices.py writes_app_data`). In memory, measured beds go from 8 to 3,340 and dorm above hotel3 from 589 to 0 (`cause.md`).
- **Publish guard (0.3, D1, D2):** `scripts/quality/publish_guard.py` runs the contract, D2 rules and bed invariants before every box publish (`run_pipeline.sh` step 9). Seeded with `CARTA_PUBLISH_SEED_BREAK=beds` on the real wire, it refuses (81.6% under the 84% floor). Today's wire is refused for 35 dorm above hotel3 rows until the box runs the patch.
- **Trail names (0.4, D7):** `pipeline/trails/names.py` with the replay `scripts/quality/trail_names_replay.py`. Replay: ACCEPT, unclean 3,937 to 1,208 (cap 1,312), too long 0, head cut 0, new duplicate groups 0, raw id suffix 57, 48 end losses all over the cap. **Open (R3):** judge 3 measured about 35 rows made worse by the dedupe ladder, among them raw ids on the West Highland Way and other main trails, cut ends, Santa Giulia variant codes colliding, and cut starts no counter sees. The fixes are listed in `judgement-3.md` and are wave 2 step 0.
- **Launch gate (0.7, D2, D9):** `scripts/quality/launch_gate.py` builds the section 4 table. Places pass 0 of 7 rows and trails 2 of 6 (`checks.md`).
- **Copy (0.8, D9):** lake and beach pages lead with what is particular to the place (`chooseLead`). Lake leads 30.7% to 16.4%, beach 62.9% to 17.9%. Plurals and `tip.pairWith` are in six languages.
- **Heat and fire (F-4, V-8, D20):** `heat_fire.py` reads the master's `climate.months`; `wireClimate.mjs` keeps `heat`, `fire` and `risk` on the wire. End to end on a temp copy of the box master: 3,868 places, 61 with heat months, 669 with fire months, 0 contract errors. They reach the live wire after the next box run.
- **Activities order (V-4, I-17, D9):** `merge_items` keeps old order and enrichment, appends new items and keeps old on an empty fetch.
- **Docs:** ROADMAP D1, D2, D3, D7, D9, D10, D15, D20; HANDBOOK sections; owner steps 5 to 8 in `docs/owner/data-and-pipeline-runs.md`; defaults 19 and 20 in `docs/owner/product-decisions.md`; project map. Requests appended to the run's `requests.md`.
- **Merge of `origin/main` (wave start, plan section 6):** conflicts resolved, keeping both sides. Decision `0013-ai-cheapest-layer-first.md` renumbered `0016` because main took 0013 to 0015 (`docs/decisions/README.md`, `docs/owner/ai.md`).

## Checks
- pytest on the wave files: 83 passed. `pipeline/stays/tests` with the gate: 54 passed. ruff clean. `check_entry_points` OK. `drift.py`: 0 drift.
- Node: wireClimate, storyLead, i18nParity 28 of 28. wire-contract 56 of 57: the failure is the CRLF working copy of `docs/SCHEMA.md`, confirmed by the judge (the LF blob passes).
- Not run: full `npm test`, full pytest (hours on this laptop), `verify_lakes.mjs` and `verify_beaches.mjs` (need a server). They run before the merge.

## Changed files
Wave 1:
- `pipeline/stays/bed_rules.py`, `pipeline/stays/apply_stays.py`, `pipeline/stays/box_stays.py`, `pipeline/stays/build_stays.py`, `pipeline/stays/tests/test_publish.py`, `pipeline/stays/tests/test_stays.py`, `pipeline/tasks/prices.py`, `infra/hetzner/cax11/run_pipeline.sh`
- `scripts/quality/publish_guard.py`, `scripts/quality/engine.py`, `scripts/quality/rules.yaml`, `scripts/quality/scorecard.py`, `scripts/quality/launch_gate.py`, `scripts/quality/trail_names_replay.py`, `scripts/quality/editorial_hooks.mjs`
- `pipeline/trails/names.py`, `pipeline/trails/export_wire.py`, `pipeline/harvest_activities.py`, `pipeline/heat_fire.py`
- `continent-app/scripts/ci/contract.mjs`, `continent-app/scripts/sync-data.mjs`, `continent-app/scripts/lib/wireClimate.mjs`, `continent-app/src/lib/lakeStory.js`, `continent-app/src/lib/beachStory.js`, `continent-app/src/i18n/en.js`, `continent-app/src/i18n/nl.js`, `continent-app/src/i18n/de.js`, `continent-app/src/i18n/fr.js`, `continent-app/src/i18n/es.js`, `continent-app/src/i18n/it.js`
- `continent-app/tests/storyLead.test.mjs`, `continent-app/tests/wireClimate.test.mjs`
- `tests/test_bed_rules.py`, `tests/test_publish_guard.py`, `tests/test_launch_gate.py`, `tests/test_trail_difficulty_names.py`, `tests/test_trail_titles.py`, `tests/test_heat_fire.py`, `tests/test_activities_merge.py`
- `docs/SCHEMA.md`, `docs/wire.schema.json`, `docs/HANDBOOK.md`, `ROADMAP.md`, `docs/owner/data-and-pipeline-runs.md`, `docs/owner/product-decisions.md`, `docs/project-map.md`, `docs/reference/config.md`, `docs/reference/tasks.md`, `docs/research/2026-11-17-data-quality.md`

From the `origin/main` merge (conflict resolution):
- `.work/INDEX.md`, `continent-app/src/browse/ExploreTab.jsx`, `docs/decisions/README.md`, `docs/decisions/0016-ai-cheapest-layer-first.md` (renamed from `0013-ai-cheapest-layer-first.md`), `docs/owner/ai.md`, `docs/owner/supabase-migrations.md`, `docs/reference/app-lib.md`, `docs/reference/openapi.md`, `docs/reference/python.md`, `docs/reference/supabase.md`

## Owner steps
In `docs/owner/data-and-pipeline-runs.md` steps 5 to 8: pull the patch on the box and run stays, then publish (the guard refuses until then); the 0.2 stopgap re-publish; the 2027-01-16 trail name deadline; the box pull for the guard.

## Undo
`git revert` the wave commits (`4a632dc714`, `14fee7874a`, `f06ff461b8`, `9bfe624859`, `ab86eb8791`, `57575cc0fd`, `cc2df52222`, `1869821d78`, `3857047a17`, `cd2050ff72`, `1de78eefa7`, `40b63425d5`). No data migration and no schema change (schema stays 20).

## Next step
Wave 2 step 0: the judge-3 trail name fixes, then W2 (correct place wire, G3 drift gate, G2 labels).
