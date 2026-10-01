# T255: Every fare harvest leaves the weekly schedule

## Task ID

T255

## Date

2026-10-01

## What changed

No fare source is live any more. Wizz Air, Vueling, Volotea and Travelpayouts
were retired on 2026-09-27, and on 2026-10-01 the owner retired Ryanair too.
Until this task the scheduler still treated all of them as weekly work, so the
first run on the Hetzner box would have spent about 30 hours calling fare APIs
that are no longer meant to be called. It would also have re-archived and
retrained on the same frozen fares every week.

Seven tasks in `run_pipeline.py` moved from the `weekly` cadence to `manual`:
`tp_stage`, `fares`, `wizz_fares`, `vueling_fares`, `volotea_fares`,
`fare_history` and `fare_model`. `manual` already existed and is never
auto-due (`is_due` returns False for it), so none of them appears in a
scheduled plan, while `--only <key>` still runs any of them. No task, script or
model file was deleted. Switching a source back on means setting its cadence
back to `"weekly"`. A comment above `TASKS` and the cadence table in the module
docstring say why.

`infra/hetzner/cax11/weekly_tasks.txt`, the order the box's
`verify_tasks.sh` walks, lost its eight fare steps (the seven tasks plus
`fares_targeted`, which was `fares --max-origins 5`). Four steps remain:
`country_context`, `image_audit`, `ingestion`, `ship`.

`HARVESTED_FAMILY` is now the empty set in both
`pipeline/harvest_all_origins.py` and `src/ingestion/pricing/travelpayouts.py`.
The set named the carriers whose stored calendars are complete, so that only
a quote from some other airline counted as evidence that a route-month flies.
With no harvest running, no calendar is complete, and T058-b's concern (the
service gate rejecting cached quotes from retired carriers, so bands go dark)
goes away with it. Each comment records the old families for the day a harvest
returns.

## Files touched

**Modified:**
- run_pipeline.py
- infra/hetzner/cax11/weekly_tasks.txt
- pipeline/harvest_all_origins.py
- src/ingestion/pricing/travelpayouts.py
- Execution/_OPEN.md (T046-l and T058-b closed; T255-a to T255-c added)

**Created:**
- Execution/P4/T255-retire-fare-harvests.md

## Commands run

```
python -m py_compile run_pipeline.py pipeline/harvest_all_origins.py src/ingestion/pricing/travelpayouts.py
python run_pipeline.py --list                      # all seven show cadence manual, due "--"
python run_pipeline.py --dry-run --max-cadence weekly   # no fare task in the plan
```

The dry run's freshness line, for the record: 286 origins in `public/fares/`,
aged 49.4 to 57.4 days, all 286 older than 14 days.

## Config and secrets set

None. `TRAVELPAYOUTS_TOKEN` and the carrier settings are left where they are;
nothing reads them on a scheduled run any more.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Fare tasks in a weekly plan | 7 | 0 | -7 |
| Steps in the box verification order | 12 | 4 | -8 |
| Laptop time of the last full fare chain the box would have repeated | 29.8 h | 0 h | -29.8 h |
| HARVESTED_FAMILY size (both copies) | 8 | 0 | -8 |

## What broke and how it was fixed

No issues.

## What is still open

`flight_times` (monthly) still runs `pipeline/harvest_flight_times.py all
CRL,BRU`, which refreshes departure times for Ryanair legs from the Ryanair
timetable. It is not a fare harvest and the plan did not name it, but it is a
call to Ryanair. Whether it should also go to `manual` is the owner's call
(T255-a).

`infra/hetzner/cron/carta-weekly.service` sets `TimeoutStartSec=48h`, and its
comment justifies that with the 29.8-hour fare chain. The timeout is still
safe, only generous. The comment and the figure need revising once the first
box run gives a real duration; the file was outside this task (T255-b).

`docs/PIPELINE.md`, `docs/ESTIMATION.md` and `docs/SCHEMA.md` still describe
the fare tasks as weekly (T255-c).

The old verification order, for restoring a source: `tp_stage`,
`fare_history`, `country_context`, `fare_model`, `image_audit`,
`volotea_fares`, `vueling_fares`, `ingestion`, `fares_targeted` (`fares
--max-origins 5`), `wizz_fares`, `fares`, `ship`. The removed comment blocks
are in git history at this task's parent commit.

## Rollback procedure

`git revert <T255 commit>`. It restores the weekly cadences, the twelve-step
verification order and both family sets. Nothing ran and no data moved, so
nothing else needs undoing.
