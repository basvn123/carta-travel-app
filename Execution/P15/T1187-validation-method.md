# T1187: External validation method and scorecard

ROADMAP item **D23** (external validation of every layer), round 2 session S103, batch 4. Builds on T1142 (D2 quality engine), T1134 (scorecard), T1145, T1148 (eval platform) and T1181 (trails external check).

## Date

2026-11-06

## What changed

Carta now has one external validation method for every layer instead of one script per layer. `scripts/validation/runner.py` takes a layer plugin (references, a matcher, checks), samples the references per country by a stable hash, measures coverage, rank agreement (Kendall tau-b and Spearman), numeric error (MAE and median absolute % error) and the share of matching facts, each share with its 95% Wilson interval, and writes `data/reports/validation/<layer>/<date>.json` plus one scorecard for all layers (`data/reports/validation/scorecard.json`). Trails is the first layer (`scripts/validation/layer_trails.py`, T1181's matcher unchanged): on the wire of 2026-09-13 it gives the same coverage (149 of 282, 52.8%) and top band (93 of 282, 33.0%) as T1181, and adds a length fact for day walks (9 of 14 within 25%, MdAPE 14.5%) and rank agreement between fame and the v5 score (tau-b 0.008 over 149 trails: none). The D2 quality run (`scripts/quality/engine.py`) now re-checks each layer's latest validation result against its baseline, so a failed hard check fails the pipeline run (`validation.trails.coverage`). The admin Data health tab shows a new External validation section under the D2 card: per layer its checks, value, baseline, item count, status and a trend over the last 24 runs.

## Research

A research subagent compared frameworks, sampling, metrics and gate rules (2026-11-06):

| Question | Options | Choice and why |
|---|---|---|
| Framework | Great Expectations 1.24.1 (Apache-2.0, https://pypi.org/project/great-expectations/), Pandera 0.35.0 (MIT, https://pypi.org/project/pandera/), Evidently 0.7.23 (Apache-2.0, https://pypi.org/project/evidently/), Soda Core 4.30.0 (now proprietary or ELv2, https://pypi.org/project/soda-core/), deepchecks 0.19.1 (AGPL, https://pypi.org/project/deepchecks/), own stdlib code | Own stdlib code. All five check dataframe columns; none matches outside reference lists to records. Each would add pandas or a heavy tree to a gate that is stdlib plus PyYAML; two have licence risk. The result shape borrows GX's idea (observed value, threshold, success per check). |
| Sampling | Proportional with a per-stratum minimum; Neyman allocation; equal allocation | Proportional with a minimum per country (default 5). Neyman needs per-stratum variance per metric in advance; equal over-weights small countries. Selection by sha256(layer, salt, id) so items stay in the sample across runs. Shares weighted back by country. |
| Rank agreement | Spearman rho; Kendall tau-b | Kendall tau-b as the gated metric (handles ties, which ratings have many of; steadier on small samples), Spearman reported beside it. Tested against scipy's documented example (https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.kendalltau.html), scipy not added. |
| Numeric error | MAE; mean or median % error | MAE in the field's unit and the median absolute % error (robust to outliers, zero references left out). |
| Gate under sampling noise | Fixed points tolerance; Wilson interval (https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval) | Both: on the whole list a drop beyond the tolerance fails; on a sample a share fails only when the top of its Wilson interval is under baseline minus tolerance, else it warns. A minimum item count (`min_n`) turns thin metrics into "insufficient" warnings. |

## Files touched

Created:
- `scripts/validation/runner.py` (the runner, metrics, gate, scorecard, `gate_from_disk` hook)
- `scripts/validation/layer_trails.py` (trails layer on the runner)
- `data/reports/validation/trails/2026-11-06.json`, `data/reports/validation/trails/baseline.json`, `data/reports/validation/scorecard.json`
- `continent-app/src/components/admin/Validation.jsx`, `continent-app/src/components/admin/useValidation.js`, `continent-app/src/components/admin/validationScorecard.json` (snapshot)
- `tests/test_validation_runner.py`, `continent-app/tests/validationView.test.mjs`, `continent-app/tests/fixtures/validation-scorecard.json`
- `Execution/P15/T1187-validation-method.md`

Modified:
- `scripts/quality/engine.py` (only the call into the validation gate: `_validation_gate`, the `validation` argument of `run`, `--validation` and `--no-validation`)
- `continent-app/src/components/admin/DataHealth.jsx` (renders `<Validation />` under the card and in the empty state)
- `docs/HANDBOOK.md` (new section "External validation runner and scorecard (D23)")
- `ROADMAP.md` (D23 status), `Execution/_OPEN.md` (rows T1187-a to T1187-g appended)

## Commands run

```
python -I scripts/validation/runner.py trails --now 2026-11-06T12:00:00Z
python -I scripts/validation/runner.py trails --share 0.5 --min-per-country 3 --now 2026-11-06T12:00:00Z
python -I scripts/validation/runner.py trails --now 2026-11-06T12:00:00Z --write-baseline --write
python -I scripts/quality/engine.py
python -m pytest -q tests/test_validation_runner.py tests/test_quality_engine.py tests/test_trails_external.py tests/test_quality_scorecard.py
ruff check scripts/validation/runner.py scripts/validation/layer_trails.py scripts/quality tests/test_validation_runner.py
cd continent-app && npx eslint src/components/admin/Validation.jsx src/components/admin/useValidation.js src/components/admin/DataHealth.jsx tests/validationView.test.mjs
cd continent-app && node scripts/ci/design-lint.mjs && npm test
python -I scripts/docs/build_lineage.py --check --strict
```

## Config and secrets set

None. New optional environment variable `CARTA_VALIDATION_DIR` (folder of results the runner writes and the D2 hook reads; default `data/reports/validation`).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Layers reported through a shared validation runner | 0 | 1 (trails) | +1 |
| Trails coverage (reference trails Carta publishes) | 149 of 282, 52.8% (T1181) | 149 of 282, 52.8% | 0 |
| Trails in the top band | 93 of 282, 33.0% (T1181) | 93 of 282, 33.0% | 0 |
| Trails length fact (day walks within 25%) | not measured | 9 of 14, 64.3% (Wilson 38.8% to 83.7%) | new |
| Trails length error | not measured | MAE 4.5 km, MdAPE 14.5% (14 walks) | new |
| Trails rank agreement, fame weight against v5 score | not measured | Kendall tau-b 0.008, Spearman 0.011 (149) | new |
| Checks that can fail the D2 quality run | 75 rules (42 must-see) | 75 rules plus 2 hard validation checks (trails coverage, top band) | +2 |
| D2 gate on today's data | PASS, 0 failed, 0 warnings | PASS, 0 failed, 0 warnings | 0 |
| Trails validation run time | 11.5 s (T1181 script) | about 12 s (runner, whole list) | about 0 |
| Python tests for validation | 9 in test_trails_external.py | 9 plus 9 in test_validation_runner.py | +9 |
| App tests (npm test) | 1649 | 1654, 0 failed | +5 |
| Design lint new violations | 0 | 0 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A hard check with no baseline only warned at first | Draft treated "no baseline" as soft for every check, so deleting `baseline.json` would pass a run | A hard check with no baseline fails (T1181's rule kept); test `test_metrics_of_a_full_run` |
| The admin view used classes `adminpage-h3` and a trend cell class that do not exist | Not in the admin stylesheets (styles are out of scope) | Uses `adminpage-h2` and an inline flex wrapper; no new CSS |
| App tests could not run at first | `continent-app/node_modules` absent in the container | `npm ci` |

## Screens checked

No dev server run (unattended batch session). The view is checked by DOM rendering in `continent-app/tests/validationView.test.mjs` (server-side render of the fixture and the shipped snapshot: rows, statuses, bar counts, failed-run marks, aria labels, no dashes) and the existing `dataHealth.test.mjs` still passes. The end check of the batch should look at Admin, Data health tab, at phone and desktop width: the External validation section under the must-see table, its table scrolling inside `adminpage-tablewrap` at phone width.

## What is still open

- T1187-a: nothing runs the runner on its own. The D2 hook reads the latest result on disk, so a drop only fails a run after someone ran a validation. The release run (or `run_pipeline.py` after the trails export) should call `runner.py trails --write --check`; `run_pipeline.py` is outside this task's files.
- T1187-b: T1181's `trails_external.py` CLI, its `trails_external_baseline.json` and the `trails-external` eval adapter now duplicate the runner's trails gate. Point the eval adapter at `runner.py` (or its result file) and retire the old baseline, keeping `trails_external.py` as the matcher library.
- T1187-c: T1181-h (propose D2 rules for trails coverage and top band) is covered by the D2 hook to the validation gate (`validation.trails.coverage`, `validation.trails.in_top`); move T1181-h to `_OPEN-CLOSED.md` as closed by T1187 in its own commit.
- T1187-d: rank agreement between fame weight and the v5 score is 0.008 over 149 trails. Either fame weight (labels plus pageviews) is a weak rank reference or v5 does not reward famous walks; decide which in the next trails rating review before the soft check's baseline means anything.
- T1187-e: only 14 day walks carry a length fact (matched by id or exact name with a reference `length_km`): below a useful sample. Add reference lengths and starts when the reference list is verified (T1181-a), and climb (D23 trails row: distance and climb error).
- T1187-f: the other layers are not on the runner: beaches and prices are next by ROADMAP D23's order, each needing its research row for references and terms.
- T1187-g: the LLM judge for text and facts (D23 step 3) is not built; it needs D4's calibration (Cohen's kappa) first and runs only in a Claude Code session or through the pipeline's Gemini key, never the Claude API.

## Owner steps (for the checklist)

- [T1187-h] Run the first trails validation on the box | the committed result was made on the cloud copy of the wire of 2026-09-13; the box holds the newer lab state, and the D2 gate reads the latest result | after the next trails export run `python -I scripts/validation/runner.py trails --write --check`; if coverage or top band moved on purpose, rerun with `--write-baseline` and say why in a report; commit `data/reports/validation/` | `scripts/validation/runner.py`, `docs/HANDBOOK.md` (External validation runner and scorecard)

## Rollback procedure

`git revert` of the T1187 commits. Nothing is one-way: the results and the baseline are files in git, and the D2 hook can also be switched off per run with `engine.py --no-validation`.
