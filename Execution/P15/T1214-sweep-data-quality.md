# T1214: register follow-up sweep, data quality and catalogue

ROADMAP item: register follow-up (data quality and catalogue), status recorded on D2. Round 3 session S130, batch 16. Branch `p15-s130-sweep-data-quality`, from `p15-round3`.

## Date

2026-11-07

## What changed

The round 2 data quality and catalogue rows (raised by T1142, T1143, T1144, T1145, T1146 and T1173) were swept: 35 open `next task` rows before, 21 closed by T1214, 13 still open with a reason below, 1 moved to the owner. The quality gate now reads all four numbers of the card and the audit scripts' own reports: `rules.yaml` gains `layer_rules` (validity and rating accuracy hard, freshness soft, so a stale wire warns instead of failing every run) and `reports` (the dossier audit's HARD checks fail the run; its coverage checks, the hero image audit and the box-only POI audit warn); the runbook says what to do when the `quality` task fails. Provenance: the four writers that edit `activities` in place (`score_significance.py`, `poi_labels.py`, `harvest_pois_overture.py`, `backfill_landmarks.py`) now re-date only the blocks they changed (`provenance.touch_changed`), `build_lineage.py` fails when the block writers in `lineage-fields.json` and `sources.yaml` disagree (two drifts found and fixed), and `schema-contract.yml` runs on a registry-only change. Coverage: a new `coverage-parity.yml` workflow runs `coverage_parity.py --check` on its inputs; the crowding layer now takes a NUTS 3 region of the place's own country first, moving 10 border places (High Tatras, Krkonose, Goriska Brda, Prespa and six more) to their own country and labelling the 11 microstate and no-data places that borrow a neighbour's value as `proxy`; the Ask eval reports recall per language. Catalogue: `promote_place_candidates.py` no longer rejects every candidate with no parent city (126 of the 142 approved adds were hit). Truth set: the judge rubric is the registry prompt `truth-judge` (same hash, so old verdicts still match), and the five trail summaries the judge found unsupported are a `check()` regression test. Content ops: trail and cycle route override files exist and are applied (trail entries reach the detail file too), dest corrections reach the dossier, guided search and Ask index in the same run, and the admin Overrides tab flags entries past `review_by` and shows the live Content tab override beside a file entry. MAP.md, `docs/README.md` and `docs/data/README.md` name the quality, provenance, override and catalogue gap files. No catalogue write, no router edit, no pipeline run, no deploy.

## Research

None chosen. Every row was a fix or an extension of a tool the repo already has (the quality engine, the provenance helpers, the override step, the eval runner, a GitHub workflow in the shape of the existing ones). The crowding rule (own country first, then a labelled proxy) is a correction of the existing matcher, not a new method or source.

## Rows

| Row | Result | How, or why it stays open |
|---|---|---|
| T1142-a | closed | `rules.yaml` `reports` and `engine.reports_gate`: dossier audit, hero image audit, POI audit; `audit_gaps.py` is a manual print of what completeness already measures, trails freshness is the trails freshness layer rule |
| T1142-b | closed | `rules.yaml` `layer_rules` and `engine.evaluate_layers` |
| T1142-e | open | `verify_admin_panel.mjs` cannot load the app: the proxy denies data.carta-europetravel.com (403, checked 2026-11-07) |
| T1142-g | closed | MAP.md row "Data quality, provenance, overrides, catalogue gaps"; Admin row names the Data health and Overrides tabs |
| T1142-h | closed | `docs/runbooks/drift-and-scorecard.md`: the gate, every rule section, what to do on a failed `quality` task |
| T1143-b | open | file level provenance for the 12 other wire files is a wire contract change across their writers and the app loaders (D3 part 2), a task of its own, not a sweep fix |
| T1143-c | closed | `provenance.fingerprints` and `touch_changed`; `touch()` in the four in-place writers; `audit_hero_images.py` only writes its caches and report, never the master |
| T1143-d | open | which date "checked on" shows (`_asof` or the source vintage) is G9's decision; a `_vintage` key would be a schema change |
| T1143-e | closed | MAP.md, `docs/README.md`, `docs/data/README.md` (its stale "Quality rules" paragraph rewritten) |
| T1143-f | closed | `schema-contract.yml` paths plus a step running `provenance_sources.py --check` and `tests/test_provenance.py` |
| T1143-h | closed | `build_lineage.check_block_writers`, `tests/test_lineage_block_writers.py`; fixed `local_transport` (apply_airport_anchors.py only reads it) and added `poi_labels.py`, `backfill_landmarks.py` as activities writers in both lists |
| T1144-d | closed | `prompts/truth-judge/v1.md`, registry entry (runtime node, eval `truth`); `rubric.md` removed; `rubricSha()` still `e3997722b64c` |
| T1144-f | closed | `check()` already rejects all five (unknown word "waymarked", number 33466, raw figures); `compose()` text for the same walks passes and says none of it; pinned in `tests/test_trail_summaries.py`. Replacing the wire texts is T1179-b and T1179-e |
| T1144-g | open | reviewing four rows against their OSM tags needs the current OSM relations and the DEM, which the proxy and the container do not reach |
| T1144-h | closed, already fixed | T1201 (commit `a670181de9`) wrote the truth result to `data/reports/evals/latest/truth.json` and its row to `docs/reference/evals.md`; T1187-g stays with T1144-b (owner labels) |
| T1145-a | open | D15 place adds are catalogue writes; S63 waits on the owner |
| T1145-b | open | ONS, VisitBritain and national tourism hosts are blocked by the proxy |
| T1145-c | closed | the E1 set now has questions in six languages; `summarise` reports `by_lang`; numbers below |
| T1145-d | open | the 64 fill lines belong to D7 to D11 and I8, which cite them |
| T1145-f | closed | `.github/workflows/coverage-parity.yml` |
| T1145-g | open | Eurostat `demo_pjan` and `reg_area3` hosts are blocked by the proxy |
| T1145-h | closed | it was not intended: `pick_region` takes an own-country region first; a borrowed one carries `proxy` and `proxy_country` |
| T1146-b | closed | `promote_place_candidates.shipped_parent` tests a non-empty parent only |
| T1146-c | open | the merges are catalogue writes and the 3 reviews need the owner's answer (S63) |
| T1146-d | open | refilling 249 places runs the flights, place and imagery layers on the box with network |
| T1146-f | open | adding the seven designation registers needs their source lists (network) |
| T1146-g | open | needs the OSM and Wikidata register tracks (network) or a revised D6 expectation |
| T1146-h | closed | MAP.md row |
| T1173-a | closed | MAP.md Admin and new data quality rows |
| T1173-b | closed | `data/overrides/trail.json`, `cycle.json`; `apply_overrides.py` layers `trail` (country file, copies, `trails/trip/<id>.json`) and `cycle` |
| T1173-c | closed | `run_pipeline.py` `OVERRIDES_BEFORE` runs `apply_overrides.py --layers dest` before `dossier`, `guided_search`, `ask_index` |
| T1173-d | open | step 9i written in `verify_admin_panel.mjs`; running it needs the data host (as T1142-e) |
| T1173-e | closed, already fixed | `admin.nav.overrides` is in all six language files since the batch 10 merge (`49cfc1f896`) |
| T1173-g | moved to user | same decision as T1142-d (run-time path for the admin snapshots) |
| T1173-h | closed | `reviewDue`, `liveFor`, the "Review due" and "Live in the Content tab" tiles; the shell passes its live list |

## Files touched

- Quality gate: `scripts/quality/engine.py`, `scripts/quality/rules.yaml`, `tests/test_quality_engine.py`, `docs/runbooks/drift-and-scorecard.md`, `docs/reference/config.md` (generated).
- Provenance and lineage: `pipeline/provenance.py`, `pipeline/config/sources.yaml`, `docs/data/sources.md` (generated), `pipeline/score_significance.py`, `pipeline/poi_labels.py`, `pipeline/pois/harvest_pois_overture.py`, `pipeline/backfill_landmarks.py`, `scripts/docs/build_lineage.py`, `docs/architecture/lineage-fields.json`, `docs/architecture/lineage.md` (generated), `tests/test_provenance.py`, `tests/test_lineage_block_writers.py` (new), `.github/workflows/schema-contract.yml`.
- Coverage and crowding: `.github/workflows/coverage-parity.yml` (new), `pipeline/harvest_tourism_density.py`, `tests/test_tourism_density_regions.py` (new), `continent-app/scripts/eval/ask-eval-lib.mjs`, `continent-app/scripts/eval/ask-eval.mjs`, `continent-app/tests/askEval.test.mjs`.
- Catalogue: `pipeline/promote_place_candidates.py`, `tests/test_promote_shipped_parent.py` (new).
- Truth set: `prompts/truth-judge/v1.md` (new), `prompts/registry.json`, `evals/truth/judge/judge-lib.mjs`, `evals/truth/judge/rubric.md` (deleted), `evals/truth/GUIDE.md`, `tests/test_trail_summaries.py`, `tests/fixtures/trail_summary_judge_cases.json` (new).
- Content ops: `pipeline/apply_overrides.py`, `data/overrides/trail.json`, `data/overrides/cycle.json` (new), `run_pipeline.py` (`OVERRIDES_BEFORE` and its call only), `tests/test_apply_overrides.py`, `continent-app/src/components/admin/PipelineOverrides.jsx`, `continent-app/src/components/admin/pipelineOverrides.js`, `continent-app/src/admin/pipelineOverrides.json` (snapshot), `continent-app/src/admin/AdminPage.jsx` (one prop), `continent-app/tests/pipelineOverrides.test.mjs`, `continent-app/scripts/verify_admin_panel.mjs` (step 9i), `docs/runbooks/content-ops.md`.
- Docs and register: `MAP.md`, `docs/README.md`, `docs/data/README.md`, `docs/HANDBOOK.md` (sections "Data quality scorecard and gate", "Hand corrections", "Catalogue gaps", crowding, Ask eval runner, truth set), `docs/reference/python.md` (generated), `ROADMAP.md` (D2 status), `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`.

## Commands run

```
python -I scripts/quality/engine.py                          # gate on the shipped wire, check only
python -I pipeline/provenance_sources.py                     # regenerate docs/data/sources.md
python -I scripts/docs/build_lineage.py                      # regenerate lineage.md
python -I scripts/docs/config_reference.py                   # regenerate config.md
python -I scripts/docs/build_reference.py                    # regenerate python.md
python -I scripts/coverage/coverage_parity.py --check
node scripts/prompts/registry.mjs record truth-judge && node scripts/prompts/registry.mjs build
node scripts/prompts/registry.mjs check --base origin/p15-round3
cd continent-app && node scripts/eval/ask-eval.mjs --check scripts/eval/ask-baseline.json
python -I -c "...apply_overrides.write_snapshot(ROOT, None)"  # snapshot with the six layers, nothing applied
```

The crowding before and after was measured by running `harvest_tourism_density.match_destinations` in memory on the shipped wire with the cached Eurostat and GISCO files; nothing was written. No pipeline task run, no migration, no deploy.

## Config and secrets set

`scripts/quality/rules.yaml` gains `layer_rules` (6) and `reports` (7). `pipeline/config/sources.yaml`: `local_transport` writers lose `apply_airport_anchors.py`, `activities` writers gain `poi_labels.py` and `backfill_landmarks.py`. No secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Open `next task` rows raised by T1142 to T1146 and T1173 | 35 | 13 | 21 closed, 1 moved to the owner |
| Quality gate rule sections reading the card | completeness only (75 rules) | completeness 75, layer rules 6, report rules 7 | +13 |
| Quality gate on the 2026-09-13 wire | pass, 0 failed, 3 warnings | pass, 0 failed, 10 warnings (7 freshness, app_data 153 days old) | +7 warnings |
| Places with a foreign NUTS 3 crowding code, unlabelled | 21 | 0 (10 moved to their own country, 11 labelled proxies) | -21 |
| Places with a crowding value | 3,289 | 3,289 | 0 |
| In-place `activities` writers that re-date the block | 0 of 4 | 4 of 4 | +4 |
| Blocks whose writers differ between lineage-fields.json and sources.yaml | 2 (unchecked) | 0, checked in CI | -2 |
| Approved D15 adds rejected as "district of a shipped city" for having no parent | 126 of 142 (T1146) | 0 by construction (fixture test; the candidate file is not in this container) | -126 |
| Prompts in the registry | 21 | 22 (`truth-judge`, hash `e3997722b64c` unchanged) | +1 |
| Ask bm25 recall@10 per language | not measured | en 61.5% (61), it 62.8% (15), fr 56.9% (17), de 55.4% (17), es 53.5% (15), nl 49.4% (17) | measured |
| Override layers | 4 | 6 (trail, cycle) | +2 |
| Workflows checking coverage parity | 0 | 1 | +1 |
| Design lint violations | 4,459 | 4,459, 0 new | 0 |
| `npm test` | not run here before the change | 2,018 tests, 2,006 pass, 0 fail, 12 skipped | 2 new tests (askEval, pipelineOverrides) |
| Lint warnings (`npm run lint`) | 14 (T1211) | 14 | 0 |
| pytest minus quarantine | not run here before | PYTEST_AFTER | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The new block writer check failed on the repo at once | `sources.yaml` named `apply_airport_anchors.py` as a `local_transport` writer (it only reads `road_connected`), and `lineage-fields.json` named a one-off script as a `transfer` writer | the registry entry fixed; scripts under `pipeline/oneoff/` are left out of the comparison (they create whole records, not blocks) |
| `pytest` failed on `test_rating_inputs.py` in this container | LFS files not pulled | `git lfs pull` of the same six files `ci.yml` pulls |
| `promptRegistry.test.mjs` could not import react | `continent-app/node_modules` absent in the fresh container | `npm ci` |
| T1144-h and T1173-e were already done | T1201 wrote the truth result and dashboard; the batch 10 merge translated the nav keys | closed with the proof, no change |

## Screens checked

No browser check: the app cannot load here (the proxy denies data.carta-europetravel.com, T1142-e). The only screen touched is the admin Overrides tab (owner only, English only); it was checked by server-rendering it in `continent-app/tests/pipelineOverrides.test.mjs` (the review flag, the live override line and both new tiles), and `verify_admin_panel.mjs` step 9i is ready for a machine that can load the app. Nothing a traveller sees changed.

## What is still open

- The 13 rows above marked open, each with its reason; T1173-g is the owner's, with T1142-d.
- T1214-a: the POI audit report rules stay soft until a box report gives their baseline.
- T1214-b: freshness stays soft until the box ships app_data on its cadence.
- T1214-c: the crowding `proxy` flag is not shown on the place page.
- T1214-d: the crowding fix reaches the wire only after the box reruns the crowding task (owner step).
- T1214-e: Ask recall is lowest in Dutch and Spanish.

## Owner steps (for the checklist)

- [T1173-g] Pick a run-time path for the admin snapshots | the Data health and Overrides tabs show the committed snapshot, not the box run's outcome, because the weekly reset puts it back | decide R2 `status/` or a box commit (the T1142-d question); tell the next session which; it wires both tabs to fetch it | Execution/_OPEN.md rows T1142-d and T1173-g
- [T1214-d] Rerun the crowding task on the box | 10 border places still show a neighbouring country's crowding and 11 borrowed values are not labelled until the layer reruns | on the box: `python run_pipeline.py --only crowding`; let the run ship; check `crowding.proxy` on `gem:andorra-la-vella` in public/app_data.json | pipeline/harvest_tourism_density.py, docs/HANDBOOK.md crowding section

## Rollback procedure

`git revert` the T1214 commits on this branch (or of the merge). Nothing is one-way: no data was written to the catalogue, no migration, no deploy. Reverting the register commits moves the rows back to `_OPEN.md`.
