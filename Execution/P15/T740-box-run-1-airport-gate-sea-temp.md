# T740: the first Monday box run read, and its two failures fixed

## Task ID

T740

## Date

2026-10-27

## What changed

The first weekly box run with the Explore data fill (T640) started on Monday 2026-10-26 at 09:00 and ended on Tuesday at 07:49, after 22.7 hours. The owner read its log on the box (`pipeline_2026-10-26.log`). Two tasks soft-failed. As designed, each kept the previous data, so production was never affected. Eight tasks were deferred to the next Monday.

1. **`airports`: the master gate refused 731 values.** Examples: Český Krumlov `straight_km=143.4`, Étretat 186.4 and Loire Valley 226.6, against a range of 0 to 110 (and road 0 to 200).
   - **Cause:** `airports_for` (`pipeline/airport_access.py`) keeps a place's anchor airport whatever its distance, because its flights are priced through it. Across the catalogue 558 anchors lie beyond 110 km, the furthest Flores via PDL at 514 km. The gate's range was meant for the other airports, all within `MAX_STRAIGHT_KM` (110).
   - **Fix, in the gate:** for the master layer, the anchor entry's `straight_km` and `road_km` are left out of the range; every other airport keeps the rule.
   - **Fix, in the data:** the check then surfaced one real error, Flores: 617 minutes "by car" to PDL, on another island. A place marked `road_connected: false` no longer gets a road option for a far anchor airport. That entry carries its distance and no options, and the app shows the airport code alone, as `airportPick.js` already handles. 105 such invented car transfers are gone.
   - **Proof:** rebuilt `airports[]` from the laptop's catalogue, the gate's range check gives 731 out of range before the fix and 0 after.
2. **`sea_temp`: 12.7 hours, then one tile's HTTP 503 from NOAA ERDDAP ended it.** The failure was tile 35,24, after four tries. Its estimate in the plan was 2 to 3 hours.
   - **What went wrong:** one refused tile was fatal and nothing was written, although every finished tile was cached. With no budget of its own, the task took the batch's 16 hours, so climate_daily, beach_context, peak_context, lake_detail, dest_overlays, poi_fees, trails_fields and dossier were deferred.
   - **Fixes:**
     - a refused tile is logged and skipped, then retried on the next run;
     - `--max-hours` stops fetching new tiles once spent (the plan passes 6), while cached tiles are still read;
     - an unfinished run writes what it has and exits 3, so the pipeline keeps it due and the next Monday resumes from `cache/sea_temp/`.

`trails_fields` skipped as expected: the trails lab worker is off (T647).

## Files touched

**Modified:** `pipeline/field_stubs/gate.py` (`without_anchor_distance`, two self-test cases), `pipeline/airport_access.py` (no road option to a far anchor for a place with no road link), `pipeline/harvest_sea_temp.py` (refused tiles skipped, `--max-hours`, exit 3 when unfinished), `run_pipeline.py` (`sea_temp` runs with `--max-hours 6`).
**Created:** `tests/test_airport_access_island.py`, `tests/test_sea_temp_resilience.py`.

## Commands run

`python pipeline/field_stubs/gate.py --self-test`, `python -m pytest tests/test_airport_access_island.py tests/test_sea_temp_resilience.py tests/test_price_gates.py` (all pass), and `airports[]` rebuilt in memory from `app_data/app_data.json` with the gate's `range_failures`. Read on the box by the owner: `systemctl status carta-weekly.service` and greps of the run log.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Master gate, out-of-range values for the rebuilt airports[] | 731 | 0 |
| Invented car transfers to an anchor across the sea | 105 | 0 |
| sea_temp: one refused tile | ends the task, nothing written | logged, skipped, retried next run |
| sea_temp: time it may take of the batch | unbounded (12.7 h) | 6 h, then resumes next run |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first resilience test proved nothing | its 20 km window stayed inside one tile | the point moved next to a tile corner |

## What is still open

- Before next Monday 09:00, the box needs this code: after the merge to main, move it with the same three lines as Sunday (`git fetch origin main` and `git checkout -B carta-run origin/main`) (T740-a).
- With sea_temp capped at 6 h, next Monday's plan is about 6 + 2.2 + 4 to 6 + 2 to 4 + 3 to 6 hours for sea_temp, climate_daily, beach_context, peak_context and lake_detail. Some may still defer to the Monday after; read the log again then (T740-b).

## Rollback procedure

`git revert` the two T740 commits (5dfe1a98c, 344c749b9) on main. The box keeps its own copy until it is moved again.
