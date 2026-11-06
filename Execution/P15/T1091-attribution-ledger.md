# T1091: Attribution ledger audit (I3, row T1084-a)

## Date

2026-11-05

## What changed

NASA JPL MUR SST is now credited in the app (Imprint > Data credits, from `attribution.js`), closing T1084-a. The audit of the ledger's credit column found that `ledger --check-app` was already failing on four mismatches: the app credited Mapterhorn, Xotelo and MET Norway with no registry entry, and the registry named Open-Meteo, which the app replaced with MET Norway in T483. Fixed with two new ledger rows (MET Norway, Mapterhorn), Open-Meteo retired, and Xotelo and MUR added to `APP_CREDITS`. A new rule, `uncredited_rows()`, requires every live row whose attribution column asks for a credit to be (a) an `APP_CREDITS` entry, (b) in `CREDIT_COVERED_BY` with the entry whose wording covers it, or (c) in `CREDIT_NOT_SHOWN` with the reason no traveller sees it. 57 rows were uncredited in the tables before; all are accounted for, 15 as not shown. `--check-app` runs the rule, so CI fails when a credit-required row has no entry.

## Files touched

`continent-app/src/data/attribution.js`, `src/ingestion/core/registry.py`, `src/ingestion/core/ledger.py`, `docs/tos/data_licenses.md` (regenerated), `tests/test_data_licences.py`, `ROADMAP.md` (I3 status), `Execution/_OPEN.md`.

## Commands run

`python -m src.ingestion.core.ledger --write`; `--check`; `--check-app continent-app/src/data/attribution.js` (46 entries match); `python -m pytest tests/test_data_licences.py -q` (16 passed).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `--check-app` problems | 4 | 0 | -4 |
| App credit entries | 45 | 46 | +1 |
| Credit-required rows with no entry, cover or reason | untracked | 0 | n/a |

## What broke

`--check-app` was already red before this task (see above). `npm test` not run: the only app change is one data entry in `attribution.js`, a plain list rendered by Imprint.jsx.

## Screens for the end check

Imprint > Data credits: the NASA JPL MUR SST line appears once, between UNESCO and CHELSA. Not looked at in a browser (no dev server run tonight).

## How to undo

`git revert` of the T1091 commit.

## What is still open

- T1091-a: Open Food Facts credit before any OFF figure ships.
- T1091-b: move row T1084-a to `_OPEN-CLOSED.md`.
- The credit-required test is a text heuristic on the attribution column ("Yes", "Requested", "Credit"); a row worded otherwise, such as "Per feed, verify", is not caught. The Xotelo and Entur-style rows with unclear terms stay under the I3 terms decisions.
- HANDBOOK: no feature behaviour changed, so no section was edited.

## Owner steps (for the checklist)

None.
