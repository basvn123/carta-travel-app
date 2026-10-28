# T781: owner review of rating v5 batch R2 applied

## Task ID

T781

## Date

2026-10-27

## What changed

The owner reviewed batch R2 (T757 to T760) on the review page https://claude.ai/artifact/59m2Bwr9JTKgTNp9jFXTzJ and accepted every item: the two redefined distribution gates (T759-b), the 5% spot check (T758-a), the 80 new golden pairs (T759-a), the six disputed hand scores as they are (T758-b), and all 30 verdicts of the external check (T760-a). The nine proposed appeals are applied: seven hand scores in `app_data/curated_appeal.json` (Belgrade 6.0 to 6.3, Toulouse and Marseille 6.5 to 6.8, Ortisei 8.6 to 8.0, Reykjavik 8.0 to 7.3, Cala Gonone 8.0 to 7.4, Fort William 8.2 to 7.2) and two rubric scores in `app_data/rubric_appeal.json` (Castel Gandolfo 7.1 to 6.8, Tenno 7.2 to 6.8, each marked with a `review` note). The re-score ran on the frozen v5.0-r2 reference, so only those nine places moved. Task number: T780 was the highest in `git log --all` (another session's flight sweep), so this is T781.

## Files touched

**Modified:**
- app_data/curated_appeal.json (7 appeals; bytes and line endings otherwise unchanged)
- app_data/rubric_appeal.json (2 appeals and bands)
- continent-app/public/app_data.json and 141 dossier verdicts (data)
- Execution/_OPEN.md

**Created:**
- Execution/P7/T781-rating-v5-review-applied.md

## Commands run

```
cd pipeline
python apply_rating_layer.py
python country_context_layer.py
cd ../continent-app && node scripts/sync-data.mjs
python -I <scratch>/refresh_verdicts.py .
python -m pytest tests/test_golden_ratings.py tests/test_rating_distribution.py tests/test_rating_stability.py tests/test_rating_inputs.py
```

## Config and secrets set

None.

## Before/after measurements

| Place | Appeal | Score before | Score after |
|---|---|---|---|
| Belgrade | 6.0 to 6.3 (hand) | 5.9 | 6.0 |
| Toulouse | 6.5 to 6.8 (hand) | 6.4 | 6.6 |
| Marseille | 6.5 to 6.8 (hand) | 7.0 | 7.1 |
| Castel Gandolfo | 7.1 to 6.8 (rubric) | 9.2 | 9.0 |
| Ortisei | 8.6 to 8.0 (hand) | 9.2 | 9.1 |
| Reykjavik (KEF) | 8.0 to 7.3 (hand) | 9.1 | 8.7 |
| Tenno | 7.2 to 6.8 (rubric) | 9.1 | 8.7 |
| Cala Gonone | 8.0 to 7.4 (hand) | 9.0 | 8.5 |
| Fort William | 8.2 to 7.2 (hand) | 9.0 | 8.1 |

No other place moved. Rating tests: 10 passed, 1 skipped (the idle fitted-curve check). Golden pairs 196 of 200.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first edit rewrote curated_appeal.json with LF line endings (7.8 KB smaller) | Text-mode read and write of a CRLF file | Restored from git and edited as bytes; the file size is unchanged |

## What is still open

- Castel Gandolfo (appeal 6.8, score 9.0) and Ortisei (8.0, 9.1) stay Exceptional after their appeals were lowered: the village class curve lifts a strong setting and nearby depth into the top 2.5%. This is the formula, not the appeal; weigh it with the weight review after T774 (T759-d).
- The catalogue problems (T758-d, T760-b) stay open: the review page asked for a mark where a fix is needed, and each fix (merge, reclass, re-anchor an airport row) is its own data change.

## Rollback procedure

`git revert` this task's commit, then re-run `apply_rating_layer.py`, `country_context_layer.py`, `node scripts/sync-data.mjs` and the verdict refresh.
