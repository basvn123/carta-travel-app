# T1099: Wire freshness and stamps (D12, S15)

## Date

2026-11-06

## What changed

Every wire writer already read the clock except the one that stamps `app_data.json`: nothing in this repo refreshed `meta.generated_at`, so it read 2026-06-07 on a schema 19 build (P-29). `pipeline/apply_rating_layer.py` now stamps the master and the served copy with the real run time through the new `pipeline/wire_stamp.py`. New `scripts/freshness_report.py` reports per wire the built-at stamp, source date (trips: `harvested_at`), age in days and over-cadence flag, and writes `freshness_wires.json` for the box to push. `tests/test_wire_stamps.py` fails on a writer with a literal stamp or no clock read, and on a report that misses a missing or constant stamp. No wire payload changed beyond the stamp; schema stays 19. The refresh of the stale wires needs the box and is an owner step.

## Files touched

- Created: `pipeline/wire_stamp.py`, `scripts/freshness_report.py`, `tests/test_wire_stamps.py`, this report.
- Modified: `pipeline/apply_rating_layer.py` (stamp lines), `docs/HANDBOOK.md` (data wire section), `ROADMAP.md` (D12 status), `Execution/_OPEN.md`.

## Commands run

- `python -I scripts/freshness_report.py --out <path>`
- `python -m pytest tests/test_wire_stamps.py -q` (5 passed)
- `ruff check` on the touched Python files (clean; 120 existing findings in other tests not touched)

## Config and secrets set

None. Cadences are constants in `WIRES` in the report script (35 days monthly wires, 45 layers, 90 reach), for the owner to tune.

## Before/after measurements

Age in days on 2026-11-06 from the shipped files (before). After: the writers stamp the run time, so a wire is as old as its last box run; the data in this container is not rebuilt (no network, box inputs), so the ages are unchanged until H9 runs.

| Wire | Before (age days) | Over cadence |
|---|---|---|
| app_data | 151.5 | yes |
| destinfo | 71.4 | yes |
| trails | 53.3 | yes |
| joins | 53.6 | yes |
| trips | 51.7 | yes |
| region | 50.3 | yes |
| coverage | 63.1 | yes |
| reach (BRU) | 91.7 | yes |
| guided | 23.2 | no |
| cycling | 13.3 | no |
| beaches, lakes, mountains | 8.7 | no |
| dossier | 6.2 | no |
| journeys | 0.4 | no |
| ask | no manifest in this checkout | missing |

The brief's four old wires (destinfo, trails, trips, region) are 71, 53, 52 and 50 days; app_data (151) is older than any of them.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `app_data.json` stamp 2026-06-07 | No applier refreshed `meta.generated_at` after the master was assembled | `apply_rating_layer.py` stamps it on each run; other appliers left alone (wire-neutral) |

## Screens checked

None; no traveller-facing change. The app does not show a stamp today.

## What is still open

- T1099-a: run the stale wire builds on the box (H9 schedule), so every wire is inside its cadence.
- T1099-b: schedule `scripts/freshness_report.py --out` after each run and push `freshness_wires.json` to R2 next to the data.
- T1099-c: the other `app_data` appliers (place, stays, climate) do not stamp; only the rating layer does. Add `build_stamp()` there if they run without it.
- T1099-d: no cadence per wire was ever decided; the 35/45/90 values are placeholders for the owner.

## Owner steps (for the checklist)

- [T1099-a] Refresh the stale wires | seven wires are 50 to 150 days old and the pipeline inputs live on the box | on the box run the destinfo, trips, region, trails, coverage, joins and reach builds, then the rating applier (stamps app_data); rerun the report | scripts/freshness_report.py
- [T1099-b] Push the freshness report with the data | the box should publish per wire age next to the data | after each run: `python -I scripts/freshness_report.py --out dist-data/freshness_wires.json`; push with `node scripts/r2/push-data.mjs --live` (H9 owns the schedule) | scripts/freshness_report.py
- [T1099-d] Set the cadence per wire | the 35/45/90 day limits are placeholders | edit `WIRES` in the script; use `--strict` as the gate | scripts/freshness_report.py

## Rollback procedure

`git revert` the T1099 commit. Nothing was deployed or migrated.
