# T1132: Logic catalogue, first pass over eight domains (ROADMAP B3, session S48)

## Date

2026-11-06

## What changed

`docs/logic/` went from an empty stub to a catalogue of 298 rules in eight domain files, in the B3 order: rating (37), price (45), recommendation (38), seasons and crowds (36), trails (38), Ask (40), plan-day (34), quotas and paywall (30). Each rule has an ID (`RATING-001`, `PRICE-018`...), what it decides, the constant or config key with its file, line and value, and the test that pins it (file and test name) or "no test". 99 rules have no test and 28 places where the HANDBOOK and the code disagree were found; each is one register row (T1132-a to T1132-dw). The entries were written from the code, not from old docs. The code tags and the CI check (the second half of B3) are not done: B3 is now "in progress".

## Files touched

- Created: `docs/logic/rating.md`, `price.md`, `recommendation.md`, `seasons-crowds.md`, `trails.md`, `ask.md`, `plan-day.md`, `quotas-paywall.md`
- Modified: `docs/logic/README.md` (index), `docs/README.md` (the `logic/` row), `ROADMAP.md` (B3 Status only), `Execution/_OPEN.md` (129 rows appended)
- No code, config, test or HANDBOOK change.

## Commands run

```
python -I scripts/docs/check_entry_points.py   # Entry points OK: 198 paths checked
```

The register rows were generated from each file's "Rules with no test" list and "HANDBOOK disagreements" table with a throwaway script, so the rows and the files match one to one.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Domain files in `docs/logic/` | 0 | 8 | +8 |
| Catalogued rules | 0 | 298 | +298 |
| Rules with no test | unknown | 99 (33%) | |
| HANDBOOK and code disagreements known | 0 | 28 | +28 |

No test, by domain: rating 20 of 37, price 2 of 45, recommendation 3 of 38, seasons 15 of 36, trails 21 of 38, Ask 9 of 40, plan-day 16 of 34, quotas 13 of 30.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Three of the four reading agents stopped on the usage limit overnight | 5-hour usage limit | The files they had already written were checked for their closing sections and committed; the quotas file was finished on resume. Each domain is now committed on its own so a stop loses nothing |
| Several plan-day and quotas "tests" are not in `npm test` | They are `check()` harnesses in `continent-app/scripts/ai/test_*.mjs`, `scripts/verify_plan_tiers.mjs` and a SQL diagnostic | Named as they are in the entries; whether they run in CI is not claimed |

Findings that look like real bugs, not only doc drift (all in the register, code wins until a task decides):
- `pipeline/cycling/stage_planner.py:599`: `(m.get("t_low") or -99)` turns a mean low of exactly 0.0 C into -99, so that month is not rideable (verified in the code).
- Price engine `costChoices` (`continent-app/src/lib/price/request.js:147`) drops `accommodation_model`, so the pipeline's entire-place fees never reach engine prices.
- `usePaywall.nudge()` is never called, so the soft-gate once-a-session and 30-day snooze limits never apply; `plansLow` and `expiring` can open for a payer.
- `isLongWalk` ignores the SAC tag on cards, nearby rows and the PDF, while the trail page checks it.
- `scripts/ai/test_passes.mjs` applies migrations only to 044, so it still asserts a Trip Pass adds 30 days, not the live 60.

## Screens checked

None: docs only.

## What is still open

- T1132-a to T1132-dw: one row per rule with no test (99) and per HANDBOOK disagreement (28), in file order (rating, price, recommendation, seasons, trails, Ask, plan-day, quotas). A next task adds the test or fixes the HANDBOOK (or the code, where the disagreement is a bug) and names the test in the catalogue entry.
- T1132-dx: the second half of B3, tags in code and `scripts/docs/logic_check.py` in CI. Until then line numbers drift; the constant names are the handle.
- T1132-dy: link the HANDBOOK rules to their catalogue IDs once tags exist.
- Line numbers were read on 2026-11-06; a spot check of seven references (plan-day leg cap, start time, store delete, suggest-city cache key, crowd quiet tier, cycling low, engine choices) matched.

## Rollback procedure

`git revert` of the T1132 commits on `p15-s48-logic-catalogue`. Docs only; nothing is one-way.

## Owner steps (for the checklist)

None. Every open item is a next-task row.
