# Report: data wave 3 (fix programs, data)

Status: **merged into `p15-fix-programs` on 2026-11-23 (`ad1d243e2a`), with D7 left out.** Waves 1 to 3 are in, judged 4 on every line except trail names. The D7 rework failed one more re-judge (`judgement-4.md`: German joining words such as "bis" and "durch" end some cut names, and a trailing bracket is dropped before a place where cutting only the bracket would fit). So `names.py`, its replay and tests stay at the wave 1 version already on the integration branch (ACCEPT, unclean 3,937 to 1,203). The rework is kept on branch `p15-fix-data-d7`, and judgement-4 fixes 1 and 2 are its next step. Orchestrator instruction of 2026-11-23.

This wave answers: does every outdoor row reach Around, the place page and the wire through one row contract and one difficulty vocabulary? It is measured by `scripts/quality/grade_replay.py` and the dossier fixture.

## What changed and why
- **One grade vocabulary (D-4, D-13, D24):** `pipeline/grades.py` holds the one SAC table and `cap_derived`, so a derived grade is never alpine. `attributes.dem_grade` now needs both ladder terms, as its comment always said. The peak table agrees with the trail table for T4. The T5 summit step is documented and tested.
- **Eval first:** `grade_replay.py` was committed with `grade-before.json` before any grade moved. Before and after on the real wire (upper bounds, recomputed in memory on the 2026-09-13 build):
  - difficulty != f.g: 11,886 to 0
  - flat-hard: 899 to 313 (derived 855 to 269, tagged 44)
  - derived alpine: 212 to 0
  - leads that contradict the grade: 14 to 0
  - rated Around rows without v5: 34,786 to 0
- **One outdoor row (E12, D-1, D-2):** `pipeline/outdoor_row.py` builds `o`, which is stamped on every write by `nature_tiers.write_kind` and copied verbatim by `build_dossier`. A row without `o` is counted and logged. `contract.mjs` `validateOutdoorRow` guards it: keys absent, never null, `g` one of five, `v5.score` from 0 to 10. A chain on a temp copy gives 0 problems, and a seeded bad `o` gives 3.
- **Around distance (D-14):** distance is measured to the route line, `km_from` says whether it is `line` or `centre`.
- **Minors:** `not_for.py` constants (D-5; the day limit is now 20 km, a rating effect named in the HANDBOOK), lake water clamped at 0 C (D-10), `t_low is not None` (D-15), `allYear` beside `winter` (D-16). D-8 and D-9 are documented, with a default in `docs/owner/product-decisions.md`.
- **Box re-export (2.2a, 2.3):** the `credited()` gates check audit rejects and the takedown ledger. A narrow lead filter and a `difficulty == f.g` check run at export. Owner steps 12 to 15 have exact task keys.
- **Carried (D7, D4):** trail names fixes (dangling ends 0, id suffix 2, abbreviation dots kept); `agreement.py` counts image rows (25 kappa rows).
- **G4/G5:** `errors.md` covers 50 of 318 remaining failures. The biggest group, 268 derived flat days of 20 to 38 km graded hard by the effort ladder, is a product call (ROADMAP D24, G4-6). The 44 tagged flat-hard rows need the lab (G4-7).
- **Test hygiene:** `tests/test_outdoor_row.py` no longer leaves the dossier's `common` module cached, so `pipeline/stays/tests` collect in the same run.

## Checks
- pytest over the wave list plus `pipeline/stays/tests`: 167 passed. ruff clean, `check_entry_points` OK, docs `drift.py` 0.
- `wire-contract.test.mjs`: 56 of 57. The one failure is the CRLF SCHEMA.md table test, an environment baseline: the LF blob passes.
- Trail names replay: ACCEPT, unclean 3,937 to 1,218, 0 new duplicate groups (`replay-j3.txt`).
- Not run: full `npm test` and full pytest (hours on this laptop), a real dossier rebuild, anything on the box. Baselines also failing on main: `tests/test_trailslab_push_due.py`, and `test_registry_doc_and_enum_are_current` (yaml under `python -I`).

## Changed files
`ROADMAP.md`, `docs/HANDBOOK.md`, `docs/SCHEMA.md`, `docs/data/trails.md`, `docs/logic/trails.md`, `docs/owner/data-and-pipeline-runs.md`, `docs/owner/product-decisions.md`, `continent-app/scripts/ci/contract.mjs`, `evals/truth/agreement.py`, `pipeline/cycling/stage_planner.py`, `pipeline/dossier/build_dossier.py`, `pipeline/grades.py`, `pipeline/lakes/lake_index.py`, `pipeline/nature_tiers.py`, `pipeline/not_for.py`, `pipeline/outdoor_row.py`, `pipeline/trails/attach.py`, `pipeline/trails/attributes.py`, `pipeline/trails/export_wire.py`, `pipeline/trails/names.py`, `pipeline/trails/rate.py`, `scripts/quality/grade_replay.py`, `scripts/quality/trail_names_replay.py`, `tests/test_grades.py`, `tests/test_outdoor_row.py`, `tests/test_trail_difficulty_names.py`, `tests/test_truth_agreement.py`, `tests/test_wave3_export.py`, `tests/test_wave3_minors.py`.

Run records: `.work/2026-11-19-fix-data-w1/report.md`, `.work/2026-11-19-fix-data-w2/report.md`, this file, `.work/INDEX.md`.

## Requests
These requests to logic are in the run's `requests.md`:
- `lib/outdoorRow.js` reader
- not-for constants
- zero-count chips and the `allYear` label
- the `TrailPage` T5 label

An answer to the orchestrator explains why waves 1 and 2 were not merged alone.

## Undo
`git revert` the wave commits (`git log --oneline --no-merges 094e62878d..26636d8f39`). The keys are additive only, schema stays 20, and there is no migration.

## Next step
Next round: apply judgement-4 fixes 1 and 2 on `p15-fix-data-d7`, re-judge R8, merge it; then wave 4 (E11 ratings, POI kinds).
