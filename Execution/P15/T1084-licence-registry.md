# T1084: licence registry current, two CI failures on PR #10

## Date

2026-11-05

## What changed

Auto-fix on PR #10 reported three failing checks.
- **coverage-contract:** red by design until the owner generates the contract on the box (T1057-b). Not touched.
- **scan (secret-scan.yml):** T1078's new `tests/bundleSecrets.test.mjs` held a key-shaped literal (`sb_secret_` followed by letters), which the source scan rightly refuses. The test now builds the fake key at runtime.
- **ledger (data-licences.yml):** the licence registry was behind the code. This was the same gap that kept three pytest tests quarantined (T1068-b). It ran now because the batch touched files it watches. In `src/ingestion/core/registry.py`:
  - Four harvesters got a `RUNS` entry and a ledger row, each from the source and licence its own header states:
    - `harvest_emergency.py`: Wikidata P2852, CC0, and OpenStreetMap hospitals, ODbL.
    - `harvest_swim_bans.py`: OpenStreetMap `swimming=no`, ODbL.
    - `harvest_poi_fees.py`: OpenStreetMap `charge` and `fee`, ODbL.
    - `harvest_sea_temp.py`: NASA JPL MUR SST via ERDDAP, public domain, credit requested.
    - Each row also has a storable verdict.
  - The six `RUNS` entries of the stays scripts T1021 deleted are removed. The six ledger rows naming them are marked `retired=True`, so they stay as history.
  - `harvest_tourism_density.py` now says `soft`, matching run_pipeline's `crowding` task.
  - `docs/tos/data_licenses.md` was regenerated from the registry, as the ledger requires.
  - The three `tests/test_data_licences.py` IDs left `tests/quarantine.txt`, which is now empty.

## Files touched

Modified: `src/ingestion/core/registry.py`, `docs/tos/data_licenses.md` (generated), `tests/quarantine.txt`, `continent-app/tests/bundleSecrets.test.mjs`.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| `ledger --check` errors | 23 | 0 (27 collectors, 26 harvesters, 161 rows) |
| tests/test_data_licences.py | 10 pass, 3 quarantined | 13 pass, 0 quarantined |
| Quarantined pytest IDs | 3 | 0 |
| Key-shaped literals in the source tree | 1 | 0 |

## What broke and how it was fixed

Nothing new. The first `--write` refused the four new rows for lacking a storable verdict, which was added.

## Screens checked

None; registry and tests only.

## What is still open

- T1084-a: the sea temperature on the beach and climate screens is NASA JPL MUR SST, whose policy requests credit. The app's Data sources screen (`src/data/attribution.js`) credits NASA POWER but not MUR SST. Add one line.

## Register rows to add

| T1084-a | T1084 | Credit NASA JPL MUR SST (sea temperatures) in the Data sources screen, src/data/attribution.js; its data policy requests credit | next task | open |  |

T1068-b closes.

## Rollback procedure

`git revert` the T1084 commit.
