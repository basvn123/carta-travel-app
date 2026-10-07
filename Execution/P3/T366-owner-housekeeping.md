# T366: housekeeping the owner approved

## Task ID

T366 (register row T362-e)

## Date

2026-10-07

## What changed

Four small decisions the owner made on 2026-10-07 (T362, Execution/P3/T362-owner-decisions-applied.md) are now in code. The monthly flight_times task in run_pipeline.py is on the manual cadence, so the weekly run on the stage 7 box no longer calls the Ryanair timetable for CRL and BRU (T255-a). The lodging task passes --footprint to harvest_accommodation.py, which turns on the per-town median anchors inside the six regional snapshots (T311-b); the flag exists in pipeline/harvest_accommodation.py (line 480). The P3 report for the first T062 was renamed to T062b so the number is no longer used twice (T062-c). The Wikidata P18 exemption (T126-b) is written in pipeline/photos/vision_prompt.py: apply_distance_rule takes p18=True and then the marker_subject and too_far rejects never veto the image, while other rejects still do. The same file gains a distance_m function (great circle metres) so a caller no longer has to supply the distance by hand.

## Files touched

**Modified:**
- run_pipeline.py (two lines: flight_times cadence, lodging command)
- pipeline/photos/vision_prompt.py
- Execution/_OPEN.md (T362-e closed, T366-a raised)

**Created:**
- Execution/P3/T366-owner-housekeeping.md

**Renamed:**
- Execution/P3/T062-uncommitted-work-and-queue-runner.md to Execution/P3/T062b-uncommitted-work-and-queue-runner.md (content unchanged)

## Commands run

python -m py_compile run_pipeline.py; python run_pipeline.py --list (before and after, read only); python pipeline/photos/vision_prompt.py (its self test prints "vision_prompt ok"). No pipeline run. Supabase variables were unset in the shell.

## Config and secrets set

None.

## Before/after measurements

The cadence column of python run_pipeline.py --list, for the changed task.

| Metric | Before | After | Delta |
|---|---|---|---|
| flight_times cadence | monthly, writes app data yes | manual, writes app data "--" | leaves the scheduled tiers |
| lodging command | harvest_accommodation.py | harvest_accommodation.py --footprint | one flag added |

Source for both rows: run_pipeline.py --list output and the TASKS list in run_pipeline.py.

## What broke and how it was fixed

Nothing broke. The report text inside the renamed T062b file still says T062 in its own heading and in register rows T062-a and T062-b, because a closed report is never edited; the filename is the only change.

## What is still open

The P18 exemption has no caller yet. Nothing imports vision_prompt.py (T126-image-brief.md says so), so the scoring task must pass p18=True and compute distance_m. Raised as T366-a.

The lodging re-run with the footprint anchors is the data lane and stays with T311-a (runbook F5). The Spanish stay hold-out becomes in-sample once it runs.

## Rollback procedure

Revert the T366 commits. That puts flight_times back on the monthly tier, removes --footprint from the lodging task, restores the old report filename, and removes the P18 parameter and distance_m. Nothing else depends on them.
