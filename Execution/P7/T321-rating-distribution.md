# T321: the rating distribution contract fails on main

## Task ID

T321 (register row T252-b)

## Date

2026-10-03

## What changed

The ratings were wrong, not the contract. The frozen fitted-score curve in `reports/rating_calibration_anchors.json` did not reproduce the catalogue it says it was frozen on, and that is what broke the curated/fitted SD gate. The curve is now rebuilt, offline and deterministically, from the tracked wire at `798f1b84` (the catalogue the 2026-09-04 ruling named), and a new test checks the stored curve against the contract so a bad curve fails CI the day it is committed. No pipeline ran and no published score changed. The shipped wire still carries the old scores, so `rating-tests` keeps failing its wire check until the data lane re-scores (T321-a).

How it was found. The contract test (`tests/test_rating_distribution.py`) was run on the tracked wire at every commit that changed it. The gap on the reference population was 0.175 at `df6d951d2` (A5), 0.157 at `798f1b84` (wave 1), and 0.280 from `eb2797c30` (2026-09-12) on. That commit is the first wire scored by `fitted_quantile_v2_frozen`, the frozen curve. Between the two wires, 1,133 of the 3,038 reference scores moved and the fitted SD on the reference fell from 0.833 to 0.706, while the curated SD stayed at 0.991 to 0.987.

Why the curve was wrong. The anchor file says it was "fitted on the 3,746-destination catalogue shipped in 798f1b84". It was not. A fitted place's raw regression output can be rebuilt exactly from the wire (its stored components times that run's `fallback_fit` coefficients), and the old cohort calibration replayed from those rebuilt inputs reproduces the 798f1b84 scores to a mean absolute error of 0.02. The stored curve, replayed on the same inputs, misses them by 0.123 on average (city 0.232, metro 0.400), with only 73.3% of fitted places within 0.1. Its city axis holds 108 distinct knots where those inputs give 239, and ends at raw 7.566 where they reach 7.922. The heavy ties suggest it was captured from a run whose highlights were not the ones shipped, but the run log is gone and this was not proven. What is proven is that it is not the curve of the catalogue it names, and it compresses fitted scores: the fitted share at tier 2 or above fell from 8.2% to 2.0%, against the 8% to 13% band PLAN.md A4 set.

Why the contract is right. Gate 3 (`|curated SD - fitted SD| < 0.18`) was set at checkpoint 2 because the approved design (12% shrink, p95 cap) holds the fitted/curated SD ratio near 0.88 by construction. The shipped ratio is 0.715. The gate is reporting a real departure from the approved model, so loosening it would hide the bug.

The fix. `pipeline/diagnostics/calibration_anchors.py` rebuilds the curve from a named revision with the pipeline's own `appeal_scale.build_anchor_curves`, replays it on that revision's fitted scores, and refuses to write unless the mean error is at most 0.05 and 97% land within 0.1. The rebuilt curve replays 798f1b84 at 0.017 mean error, 99.9% within 0.1 (2,176 fitted places). `frozen` stays 2026-09-04; the file gains `rebuilt`, `replay` and `n_reference_curated`, and keeps `depth_p99` 9.193 and every key `rating_layer.py` reads. Projected through the rebuilt curve, the current wire gives a reference gap of 0.171, which passes. `--check` prints that projection for any wire.

What is left after the fix. 552 reference scores would still differ from 798f1b84 (18 by more than 0.2), and the projected gap is 0.171 rather than 0.157. That residue is the second cohort-relative layer: highlights changed on 2,233 of the 3,038 reference places between 798f1b84 and main, because `score_significance.py` writes `it.sig` as a catalogue-wide percentile (T321-b). It also leaves the projected fitted tier-2 rate at 7.8%, just under the A4 band.

## Files touched

**Modified:**
- reports/rating_calibration_anchors.json (curves rebuilt from 798f1b84; provenance and replay fields)
- tests/test_rating_distribution.py (new `test_anchor_curve_meets_the_contract`)
- pipeline/README.md (one Manual-tier row for the new script)

**Created:**
- pipeline/diagnostics/calibration_anchors.py
- Execution/P7/T321-rating-distribution.md

**Deleted:**
- None

`Execution/_OPEN.md` gains rows T321-a and T321-b. T252-b stays open (see below).

## Commands run

From the root worktree. The tracked wire is not in the sparse worktree, so the checks read a copy taken from git.

```
git show main:continent-app/public/app_data.json > <scratch>/wire_main.json
python pipeline/diagnostics/calibration_anchors.py --rebuild-from 798f1b84 --dry-run
python pipeline/diagnostics/calibration_anchors.py --rebuild-from 798f1b84
python pipeline/diagnostics/calibration_anchors.py --check --input <scratch>/wire_main.json
python -m pytest tests/test_golden_ratings.py tests/test_rating_distribution.py -q -rs
```

The pytest run pointed both suites at the scratch wire through a small plugin (`-p wireplug`, it sets the modules' `INPUT`), since the worktree has neither the master nor the wire. The anchor test was also run against the local master (`app_data/app_data.json`, read only): same 0.171.

## Config and secrets set

None.

## Before/after measurements

Gate 3 on the 3,038-place reference population. "Before" is what main ships and what the old curve gives; "after" is the rebuilt curve projected onto the same wire. The published scores move only when T321-a runs.

| Metric | Before | After | Delta |
|---|---|---|---|
| Curated/fitted SD gap (reference) | 0.280 | 0.171 | -0.109 |
| Fitted SD (reference) | 0.706 | 0.816 | +0.110 |
| Curated SD (reference) | 0.987 | 0.987 | 0 |
| Fitted share at tier 2 or above (full catalogue) | 2.0% | 7.8% | +5.8pp |
| Tier-3 count (gate 7, band 35 to 70) | 48 | 51 | +3 |
| corr(score, log pop) (gate 4, under 0.10) | +0.022 | -0.017 | |
| Curve replay error on 798f1b84, mean abs | 0.123 | 0.017 | -0.106 |
| Curve replay within 0.1 on 798f1b84 | 73.3% | 99.9% | +26.6pp |
| Reference scores differing from 798f1b84 | 1,133 | 552 | -581 |
| ...of which by more than 0.2 | 296 | 18 | -278 |
| Golden pairs passing | 120/120 | 120/120 | 0 |
| `test_rating_distribution` (wire) | fail | fail until T321-a | |
| `test_anchor_curve_meets_the_contract` | fail (0.281) | pass (0.171) | |

For reference, the same gate read 0.175 at `df6d951d2` and 0.157 at `798f1b84`. Gates 1, 2, 5 and 6 read components, not scores, and do not move. On the projected scores, `apply_rating_layer.validate` raises nothing: no famous floor broken, no airport-town ceiling crossed, no unconfirmed fitted 8.5. Re-scoring the current wire with the rebuilt curve moves 1,616 of 3,868 published scores. Most of those undo the September compression.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `rating-tests` fails gate 3 on main (gap 0.280) | The frozen anchor curve was not the 798f1b84 calibration it claims to be; applied from `eb2797c3` on, it compressed fitted scores (SD 0.833 to 0.706) and re-rated 1,133 reference places | Curve rebuilt from the 798f1b84 wire with a replay check; new test gates the curve itself |
| Nothing guarded the curve | The anchor file is read only when present, and its replay error was never checked after freezing (`appeal_scale.py` says `ANCHOR_KNOTS = 241` keeps it "under 0.05"; measured 0.123 mean) | `test_anchor_curve_meets_the_contract`, plus the refuse-to-write replay bound in `--rebuild-from` |

## What is still open

T321-a (owner, data lane): the published scores still come from the old curve, so `test_rating_distribution` keeps failing on the wire. Re-score in the data lane: `python pipeline/apply_rating_layer.py` on the master (it needs `cache/dest_pageviews.json`; pull the caches back from R2 first if they are not on the laptop), then the usual wire rebuild, then the two rating suites. The projection says gap 0.171, tier-3 51, golden 120/120 and a clean `validate`. This also moves 1,616 published scores, most of them back toward their 798f1b84 values, which the owner should see before it ships. T252-b stays open until that run turns `rating-tests` green, because the CI failure it records is still real today.

T321-b (next task): the second cohort-relative layer named in the 2026-09-04 notes is still live. `score_significance.py` writes `it.sig` as a catalogue-wide percentile, so every catalogue change re-normalises highlights: 2,233 of 3,038 reference places changed highlights since 798f1b84, and 102 curated reference scores moved with no curation change. That drift is why the projected gap is 0.171 and not 0.157, and why the fitted tier-2 rate projects to 7.8%, just under A4's 8% floor. The fix is the same treatment as the curve: freeze the percentile breakpoints on the reference cohort and look new POIs up on them. That is a code task, and its effect needs a data-lane run. The `fallback_fit` coefficients are also refit every run on the curated set; they barely moved (intercept 4.005 to 3.9986), but they are a third input the frozen curve assumes is stable.

## Rollback procedure

Revert the T321 commit on the root repo (`git revert <T321 commit>`). That restores the old anchor file, removes the new test and script and the README row. Nothing published changed, so there is nothing to roll back in the data. If T321-a has already run, the rating rollback is a data-lane step: restore the old anchor file, re-run `pipeline/apply_rating_layer.py`, then rebuild the wire.
