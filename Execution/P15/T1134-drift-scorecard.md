# T1134: Docs drift check and the first data quality scorecard (ROADMAP B7, D2, session S50)

## Date

2026-11-06

## What changed

Two offline scripts. `scripts/docs/drift.py` fails when the docs stop saying what the code does: every constant named in `docs/logic/*.md` must still exist in the file the entry names, every plain value the entry gives (`= 7`, `= 0.6`, `= [5, 6]`, `= "priority"`) must equal the code or config value (config keys read as `rules[key].value` or nested JSON), every named test must still be in its file, `docs/SCHEMA.md`'s wire table must match `docs/wire.schema.json` (reuses `wire-table.mjs`), and `CLAUDE.md` and `MAP.md` may name only existing paths (reuses `check_entry_points.py`). It runs in the `python` job of `ci.yml` on every push and pull request, in 0.4 s. On its first run it found one real drift: T1127 had moved the 25 km borrowed-photo limit from `trailCards.js` `NEAR_PHOTO_KM` to `trailPhoto.js` `TOWN_KM`, and TRAIL-032 still named the old constant; the entry is fixed, so the known-drift baseline starts empty. Today it checks 738 of 738 constants, 254 values (79 more are objects or prose and are counted, not compared) and 399 of 399 tests. `scripts/quality/scorecard.py` writes the first per-layer quality scorecard (completeness, validity, freshness, accuracy) for the seven field groups of `app_data.json` and the five sharded nature wires, as JSON, markdown and a history line under `data/reports/quality/`. No app code, wire or schema changed.

## Files touched

- Created: `scripts/docs/drift.py`, `scripts/docs/drift_baseline.json` (empty), `scripts/quality/scorecard.py`, `tests/test_docs_drift.py` (13 tests), `tests/test_quality_scorecard.py` (6 tests), `docs/runbooks/drift-and-scorecard.md`, `data/reports/quality/2026-11-06.json`, `data/reports/quality/2026-11-06.md`, `data/reports/quality/quality_history.jsonl`, this report.
- Modified: `.github/workflows/ci.yml` (setup-node pinned by SHA in the python job, drift step), `docs/logic/trails.md` (TRAIL-032 constant line), `docs/runbooks/README.md` (index row), `ROADMAP.md` (B7 and D2 status), `Execution/_OPEN.md` (rows T1134-a to h).

## Commands run

```
python -I scripts/docs/drift.py --no-baseline                  # first run: 1 drift (TRAIL-032)
python -I scripts/docs/drift.py --update-baseline              # after the TRAIL-032 fix: baseline empty
sed -i 's/TOWN_KM = 25/TOWN_KM = 30/' continent-app/src/lib/trailPhoto.js; python -I scripts/docs/drift.py; git checkout continent-app/src/lib/trailPhoto.js
python -I scripts/quality/scorecard.py --now 2026-11-06T12:00:00Z --write
python -m pytest tests/test_docs_drift.py tests/test_quality_scorecard.py -q
python -m pytest tests -q $(quarantine deselects)
ruff check scripts/docs/drift.py scripts/quality/scorecard.py tests/test_docs_drift.py tests/test_quality_scorecard.py
```

Seeded drift on the real tree: with `TOWN_KM = 30` the gate printed `DRIFT [logic] TRAIL-032: TOWN_KM is 30.0 in code, the doc says 25` and exited 1; restored, it exits 0. The tests seed each kind on a fixture tree: a changed JS value, a changed value in a positional list, a removed constant, a changed config value and a sibling config key (`party.limits` / `max_babies`), a changed Python constant, a deleted file, a renamed test, a stale SCHEMA.md table row, a missing MAP.md path, and the baseline (known drift passes, fixed-but-listed drift fails).

## Config and secrets set

None. `CARTA_REPO_ROOT` points `drift.py` at another tree (tests only).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Logic catalogue constants checked against code in CI | 0 | 738 (738 found) | +738 |
| Catalogue values compared with code | 0 | 254 of 333 (79 objects or prose, not compared) | +254 |
| Catalogue tests checked to exist | 0 | 399 (399 found) | +399 |
| Docs drift on the real tree | unknown | 1 found (TRAIL-032), fixed; 0 now | -1 |
| Drift check run time | n/a | 0.4 s | new |
| Layers with a quality score | 0 | 12 | +12 |
| Scorecard run time on the shipped data | n/a | 5.3 s | new |
| pytest minus quarantine | 483 passed, 2 failed (T1133-g) | 502 passed, 2 failed (same two) | +19 new tests |

### The first scorecard (2026-11-06, data in `continent-app/public`)

| Layer | Wire | Records | Completeness | Validity | Freshness (age d) | Accuracy | Score |
|---|---|---:|---:|---:|---:|---:|---:|
| core | app_data | 3855 | 88.4% | 100.0% | 23.0% (152) | n/a | 70.5% |
| flights | app_data | 3855 | 49.9% | 100.0% | 23.0% (152) | n/a | 57.6% |
| prices | app_data | 3855 | 95.5% | 100.0% | 23.0% (152) | n/a | 72.9% |
| rating | app_data | 3855 | 100.0% | 100.0% | 23.0% (152) | 98.5% | 80.4% |
| climate | app_data | 3855 | 69.4% | 100.0% | 23.0% (152) | n/a | 64.1% |
| place | app_data | 3855 | 51.9% | 100.0% | 23.0% (152) | n/a | 58.3% |
| imagery | app_data | 3855 | 99.7% | 100.0% | 23.0% (152) | n/a | 74.2% |
| trails | trails | 17958 | 79.9% | 99.4% | 65.2% (54) | n/a | 81.5% |
| beaches | beaches | 2984 | 90.5% | 100.0% | 100.0% (9) | n/a | 96.8% |
| lakes | lakes | 1815 | 96.8% | 100.0% | 100.0% (9) | n/a | 98.9% |
| mountains | mountains | 932 | 100.0% | 100.0% | 100.0% (9) | n/a | 100.0% |
| cycling | cycling | 713 | 99.0% | 92.4% | 100.0% (14) | n/a | 97.2% |

Records are the 3,868 places minus the 13 gateways (rated as their city). Rating accuracy: 196 of 199 golden pairs right (one pair has a place without a score). The lowest field shares, from the JSON: `tags` 2.1%, `wikidata` 1.1%, `transfer` 3.3%, `bathing_water` 23.1%, `guide` 26.6%, `nature` 38.0%, `designations` 47.9% (app_data); trail `summary` 2.9% and `img` 21.7%; beach `wiki` 24.4%. Validity failures: 114 trails with an empty name, 54 cycling routes with no name. The whole wire has 0 contract problems in catalogue mode. Freshness repeats T1099: `app_data` is 152 days old against a 35 day cadence.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First parse found 40 false drifts | catalogue shorthand: a file named by its basename (`intent.js:369`), sibling config keys (`match.like_weight` / `size_weight`), rule keys with a nested value (`when.guide.hot_c`), a key inside a list row (`slots` ... `byPriority`), "Constant: none" lines | basenames resolve against folders already named in the same doc, then a unique `git ls-files` match; sibling keys take the first key's parent; rule keys resolve the longest prefix then descend; a key may sit anywhere in the JSON tree; "none" lines are skipped |
| `CAP = 20; // seats` read as not plain | the trailing comment was stripped after the `;` | comments first, then `;` and `,` |
| `iata` dragged the flights layer to 35% | only airport rows carry an IATA code, by design | left out of completeness (documented in `APP_LAYERS`) |

## Screens checked

None: nothing a traveller sees changed. The end check needs no screen for this task.

## What is still open

- T1134-a: the scorecard is not yet called by `run_pipeline.py` (outside this task's files); one call after `build_freshness_report` makes it per run.
- T1134-b (owner): run the scorecard on the box after the next full run and `npm run data`, and push the card with the data.
- T1134-c: the D2 rule half: `pipeline/quality/rules.yaml` with hard and soft rules, a failed run on a drop of more than 2 points on a must_see field, and the 90 day trend in the admin Data health panel.
- T1134-d: the rest of B7: per-area History drift (area doc to file globs from MAP.md), executable examples, `lychee` link check, `interrogate` floor, the `carta-docs` skill and Stop hook, the CLAUDE.md task step.
- T1134-e: 79 catalogue values are objects or prose (`= { trail 30, water 40 }`, `= unesco_whc 1.00, ...`) and are not compared; writing them as JSON literals would bring them under the check.
- T1134-f: MAP.md does not yet name `scripts/docs/drift.py`, `scripts/quality/scorecard.py` or `data/reports/quality/`.
- T1134-g (owner): which fields count for each layer is my call (see `APP_LAYERS`, `SHARD_LAYERS`); confirm whether `tags`, `wikidata` and `transfer` are meant to be on every place, since they set the flights, core and place completeness.
- T1134-h: data gaps the card shows: 114 trails with an empty name and 54 cycling routes with no name.

## Rollback procedure

`git revert` the T1134 commit. Nothing is one-way: no data, migration, wire or schema version changed. The TRAIL-032 doc fix reverts with it; keep that one line if only the scripts are reverted, since the old line names a constant that is gone.

## Owner steps (for the checklist)

- [T1134-b] Scorecard on the box after a real run | the card in the report is from the shipped wires in the cloud checkout, not a fresh pipeline run | on the box pull the branch; after the next full run and `cd continent-app && npm run data`, run `python -I scripts/quality/scorecard.py --write`; commit `data/reports/quality/` or push it with the data next to `freshness_wires.json` | scripts/quality/scorecard.py
- [T1134-g] Decide which fields count per quality layer | completeness for core, flights and place is set by fields that may be optional by design (tags 2%, wikidata 1%, transfer 3%) | read `APP_LAYERS` and `SHARD_LAYERS` at the top of the script; strike or keep each field; a session then edits the lists | scripts/quality/scorecard.py
