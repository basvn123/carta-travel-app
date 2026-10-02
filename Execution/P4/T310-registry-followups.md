# T310: registry follow-ups

## Task ID

T310

## Date

2026-10-02

## What changed

Five register rows raised by T078, T113 and T300 are closed. The licence registry (`src/ingestion/core/registry.py`) now carries a storable-copy verdict for every ledger row, and the generated ledger shows it as a seventh column, Storable copy. The registry also holds a new `APP_CREDITS` table that names, for each of the 43 entries in `continent-app/src/data/attribution.js`, the ledger row that obliges it, and the ledger tool can check the app file against it. Retired rows that sat inside live chapters (WorldClim, the Wikivoyage description signal, the Claude/Gemini describe.py row) now close the ledger in a new chapter 15, "Retired rows (history)". The Waymarked Trails route list has its ledger row. `run_all --list` prints cadence, task, failure mode and licence for every collector.

The storable verdicts are a reading of each row's licence cell by rule, with hand overrides, using T010's three classes. They are not legal advice. 22 rows come out as `Verify`, because their own licence cell says verify or the terms are agreement-bound; those need the owner. T010 claimed it had written verdicts into the ledger. It had not (T300 found this); this task is the first time they exist in the file.

Decisions: T078-b was done as a check, not a generator, because the credit wording in attribution.js is hand-written licence text and the registry has no field for it. T078-d moved retired rows to a closing chapter instead of leaving them in place, so a skimming reader cannot take them for current.

## Files touched

**Modified (root repo, branch p4-registry-followups):**
- src/ingestion/core/registry.py (STORABLE, STORABLE_VOCAB, APP_CREDITS, a Waymarked row, a "retired_rows" section, three new validate rules)
- src/ingestion/core/ledger.py (storable column, retired chapter, `check_app`, `--check-app`, a note in the generated header)
- src/ingestion/run_all.py (`--list` prints runs and licence lines)
- tests/test_data_licences.py (five new tests)
- docs/tos/data_licenses.md (regenerated)
- Execution/_OPEN.md (five rows closed, new rows appended)

**Modified (app repo, branch p4-registry-followups):**
- src/data/attribution.js (header comment only, names the check)

**Created:**
- Execution/P4/T310-registry-followups.md

**Deleted:**
- none

## Commands run

```
cd C:\Users\Gebruiker\Documents\Portfolio\wt\T310
python -m src.ingestion.core.ledger --write
python -m src.ingestion.core.ledger --check
python -m src.ingestion.core.ledger --check-app ..\T310-app\src\data\attribution.js
python -m pytest tests/test_data_licences.py -q
python -m src.ingestion.run_all --list
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Ledger rows | 150 | 151 | +1 (Waymarked) |
| Rows with a storable verdict | 0 | 151 | +151 |
| Verdict split: with credit / with credit and share-alike / per file / Yes / Verify / No / n/a / per row above | not recorded | 43 / 38 / 14 / 20 / 22 / 6 / 7 / 1 | n/a |
| attribution.js entries checked against the registry | 0 | 43 of 43 | +43 |
| Retired rows sitting in live chapters | 3 | 0 (all in chapter 15) | -3 |
| Tests in tests/test_data_licences.py | 8 | 13 passing | +5 |

Sources: `python -m src.ingestion.core.ledger --check` output (151 rows, 29 collectors, 28 harvesters), `Counter(STORABLE.values())`, the pytest run, and the T078 report for the 150 and the 8.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First `STORABLE` literal had a stray closing brace | The generator script appended it twice | Removed one; `validate()` and import passed |
| `--check-app` found 0 entries | A back-reference in the regex was turned into a control character by a shell heredoc | Rewrote the pattern; the tests now pin it |

## What is still open

The 22 `Verify` verdicts need the owner to confirm the terms before any stored copy of those sources ships (T310-a). The CI workflow `.github/workflows/data-licences.yml` runs `--check` but not `--check-app`, because CI for the root repo has no checkout of the app repo (T310-b). The ledger's "Ready to paste into attribution.js" section is now partly redundant with the check and can be retired once the owner agrees (T310-c, low priority).

## Rollback procedure

`git revert` the T310 commit in the root repo restores the old registry, ledger tool, `run_all.py`, tests and the generated ledger (regenerate with `--write` to confirm). In the app repo, `git revert` the one comment-only commit. No data, schema, migration, secret or deploy is involved, and nothing was pushed. The browser was not used: no screen was touched, and the app change is a code comment.
