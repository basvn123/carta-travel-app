# T1107: every pipeline task on a box schedule

Roadmap item **H9** (session S23 of `_NEXT-50-SESSIONS.md`). Branch `p15-s23-box-schedule`.

## Date

2026-11-06

## What changed

Every `run_pipeline.py` task now sits in one box tier, and the box can run all of them on its own. Before, the CAX11 had one timer (Monday 09:00) at the weekly ceiling (register row T048-h), so 6 of 75 tasks were on a schedule and every monthly and quarterly task ran only when named in `CARTA_EXTRA_TASKS`. Now three timers run `weekly.sh` at three ceilings: weekly (Monday 09:00), monthly (first Saturday 03:00) and quarterly (third Saturday of January, April, July and October 03:00), all Europe/Brussels. Each unit sets `CARTA_TIER`, which `run_pipeline.sh` passes as `--max-cadence`. `infra/hetzner/cron/schedule.py` is the table. Its `--dry-run --check` prints all 78 tasks in their tiers (6 weekly; 27 monthly, of which 11 are `after` tasks; 35 quarterly, of which 8 are `after` tasks; 10 manual), exits 1 when a task is in no tier or a unit file disagrees with the table, and runs before `install.sh` installs anything. `tests/test_box_schedule.py` holds the same rules in CI. Tonight's new harvests are on the schedule. T1095 place intros, T1096 place gallery and T1096 POI descriptions are new quarterly cadence entries, placed before `dossier`, which reads their caches. T1097 `sea_temp` and T1098 `crowding_uk` were already quarterly, and the T1093 and T1094 trail rebuilds run inside the existing trails chain. A cadence slack fixes a scheduling bug. `last_success` is stamped when a task finishes, so before this change a weekly task that ended at 11:00 was not due at the next Monday 09:00 and ran every other week. A task is now due once its interval minus 1.5, 4 or 10 days has passed (weekly, monthly, quarterly). That slack fits the calendars: two first Saturdays can be 28 days apart, and two third Saturdays of a quarter 84 days. Two runs never overlap. `weekly.sh` takes `logs/carta-run.lock` before its `git reset`, so a timer firing during a run can no longer reset the checkout under it. It waits up to 6 hours (weekly) or 36 hours (monthly, quarterly) for the lock, then gives up with exit 75, and the tasks stay due. After every run, good or failed, the new `infra/hetzner/cax11/push_status.py` writes the T1099 wire freshness report and a `last_run.json`. It then copies them, `pipeline_state.json` and `freshness_report.json` to `r2:carta/status/`, which no box ever pulls. `archive/state/` still moves only with the master after a good run, as T048-k requires.

## Files touched

- Modified: `run_pipeline.py` (three cadence entries `place_intros`, `place_gallery`, `poi_descriptions`; `CADENCE_SLACK_DAYS` and its one use in `is_due`), `infra/hetzner/cax11/weekly.sh` (lock before the code update), `infra/hetzner/cax11/run_pipeline.sh` (`CARTA_TIER`, lock reuse, quarterly cache classes, status push), `infra/hetzner/cax11/env.example` (comments), `infra/hetzner/cax11/verify.sh` (reports the two new timers), `infra/hetzner/cron/carta-weekly.service` (`CARTA_TIER`, `CARTA_LOCK_WAIT`), `infra/hetzner/cron/install.sh` (new units, schedule check first, enable and disable all), `infra/hetzner/cron/reboot-if-needed.sh` (waits for every tier), `infra/hetzner/README.md`, `docs/runbooks/build-box.md` (schedule table and enable commands), `docs/HANDBOOK.md` (The build box section), `ROADMAP.md` (H9 status), `Execution/_OPEN.md` (rows appended).
- Created: `infra/hetzner/cron/schedule.py`, `infra/hetzner/cron/carta-monthly.service`, `carta-monthly.timer`, `carta-quarterly.service`, `carta-quarterly.timer`, `infra/hetzner/cax11/push_status.py`, `tests/test_box_schedule.py`, this report.

## Commands run

```bash
python -I infra/hetzner/cron/schedule.py --dry-run --check --no-state      # 78 tasks, unscheduled: none, units match
systemd-analyze calendar "Sat *-*-01..07 03:00:00 Europe/Brussels" "Sat *-01,04,07,10-15..21 03:00:00 Europe/Brussels" --iterations 3
systemd-analyze verify infra/hetzner/cron/carta-{weekly,monthly,quarterly}.{service,timer}   # clean
bash infra/hetzner/cron/install.sh --dry-run
CARTA_PIPELINE_ENABLED=1 CARTA_AUTO_UPDATE=0 CARTA_TIER=quarterly CARTA_LOCK_WAIT=5 \
  CARTA_LOG_DIR=<scratch> CARTA_VENV=<scratch venv> CARTA_SHIP=none bash infra/hetzner/cax11/weekly.sh --dry-run   # rc 0
(flock logs/carta-run.lock sleep 8 &); CARTA_TIER=monthly CARTA_LOCK_WAIT=2 ... weekly.sh --dry-run             # rc 75, logged
python -I infra/hetzner/cax11/push_status.py --tier weekly --rc 0 --started 1762419600 --dry-run
ruff check infra/hetzner/cron/schedule.py infra/hetzner/cax11/push_status.py tests/test_box_schedule.py
ruff check --select E9,F63,F7,F82 run_pipeline.py
shellcheck -S warning infra/hetzner/cax11/{weekly,run_pipeline,verify}.sh infra/hetzner/cron/{install,reboot-if-needed}.sh
python -m pytest tests -q <quarantine deselected>
python -m src.ingestion.core.ledger --check
```

## Config and secrets set

None. New unit variables: `CARTA_TIER` (weekly, monthly, quarterly) and `CARTA_LOCK_WAIT` (21600, 129600, 129600 seconds). `CARTA_TIER` wins over `CARTA_MAX_CADENCE` from the secrets file, which now only matters for a hand run.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Tasks on a box timer | 6 of 75 (weekly tier; more only by hand in `CARTA_EXTRA_TASKS`) | 68 of 78, plus 10 manual with a written reason | 0 unscheduled |
| Box timers | 1 (weekly) | 3 (weekly, monthly, quarterly) | +2 |
| Real interval of a weekly task that ends after 09:00 | 14 days (not due at the next Monday) | 7 days (test `test_cadence_slack_matches_the_calendar`) | halved |
| Status in R2 after a failed run | nothing (state only after a good run, freshness never) | state, both freshness reports, last_run, one runs/ record | every run |
| Wires over their cadence (T1099 report, this checkout) | 8 | 8 (the box runs move it; owner step T1107-c) | not measured yet |
| pytest (quarantine deselected) | full suite not run on the base; the 2 tests below fail there too (clean worktree) | 2 failed, 429 passed, 6 skipped; the 2 (`test_rating_inputs::test_beauty_v2_reads_no_register`, `test_rating_stability::test_adding_places_moves_nobody_else`) need data missing in the container | 18 new tests, all pass |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Weekly tasks ran every other week | `last_success` is stamped at the end of a task and the timer fires on a fixed hour, so 7 days had not passed at the next Monday 09:00 | `CADENCE_SLACK_DAYS` in `run_pipeline.py` |
| A second timer would reset the checkout under a run | `weekly.sh` ran `git reset --hard` before `run_pipeline.sh` took the lock | `weekly.sh` takes the lock first and hands it on (`CARTA_RUN_LOCKED=1`, fd 9) |
| First version of push_status wrote to `data/derived/` | those files would show as untracked in git | moved to `logs/status/` (gitignored; `logs/` is never cleaned wholesale) |
| The local `run_pipeline.py --dry-run` rewrote `cache/hero_image_meta.json` and `data/reports/hero_images_audit.json` | the existing `hero_audit` dry probe writes its outputs (not this task's code) | restored with `git checkout`; row T1107-e |
| pytest collection errors at first | the container lacked requirements (psycopg, osmium, shapely) | `pip install -r requirements.txt` |

## Screens checked

None: no traveller-facing change.

## Decisions taken tonight (no one to ask)

- Backfill stays manual. The ten `backfill` tasks are refused without a terminal on purpose (T261), and several are null-risk patch writers. They count as scheduled in the manual tier, each with its reason in `schedule.py` `MANUAL`. A backfill task without a reason fails the test.
- The monthly tier now runs `stays`, `food` and `flight_routes`, which T640 held back under the weekly ceiling (price batch F0). The `stays` task was written for the box (owner, 2026-11-03), and H9 asks for every monthly task on the schedule, so they stay in. Row T1107-b asks the owner to confirm before the first Saturday.
- Quarterly is the third Saturday and monthly the first, so the two never queue in the same weekend; a quarterly run also takes due monthly and weekly tasks.
- `pipeline/trails/recover_walks.py` (T1094) is a one-off sizing report that writes a committed file, so it is not a scheduled task; the T1094 rebuild itself is the scheduled trails chain.
- Register rows T048-h (weekly ceiling) and T1099-b (push `freshness_wires.json` after each run) are closed by this task. The overnight brief forbids editing other rows, so T1107-f asks the next session to move them.

## What is still open

- T1107-a (owner): enable the schedule on the box with the commands below.
- T1107-b (owner): confirm `stays`, `food` and `flight_routes` in the monthly tier.
- T1107-c (owner): read `r2:carta/status/last_run.json` and the freshness report after the first monthly and the first quarterly run. Check the quarterly duration against its 120 h timeout: the `est_h` sum is 30.6 h, and the trails and cycling chains carry no `est_h`.
- T1107-d: the admin Data health panel (D2) should read `r2:carta/status/`; the archive bucket is private, so it needs a signed read or an Edge Function.
- T1107-e: the `hero_audit` dry probe writes tracked files under `--dry-run`; it should write to a scratch path.
- T1107-f: move T048-h and T1099-b to `_OPEN-CLOSED.md` as closed by T1107.

## Rollback procedure

`git revert` of the T1107 commit. On the box, if installed: `sudo bash infra/hetzner/cron/install.sh --disable`. Then `sudo systemctl disable --now carta-monthly.timer carta-quarterly.timer`, `sudo rm /etc/systemd/system/carta-{monthly,quarterly}.{service,timer}`, `sudo systemctl daemon-reload`, then rerun the old `install.sh` from the reverted checkout. `r2:carta/status/` holds copies only; deleting it loses nothing.

## Owner steps (for the checklist)

- [T1107-b] Confirm the price tasks in the monthly tier | the monthly timer now runs stays, food and flight_routes, which T640 held back for price batch F0 | answer yes, or tell the next session to move them to backfill in run_pipeline.py; do it before the first Saturday after T1107-a | Execution/P15/T1107-box-schedule.md
- [T1107-a] Enable the weekly, monthly and quarterly timers on the box | until install.sh runs, only the Monday timer exists and the monthly and quarterly tasks run nowhere | ssh carta@<box>; cd ~/carta && git fetch -q origin main && git reset -q --hard FETCH_HEAD; ~/venv/bin/python infra/hetzner/cron/schedule.py --dry-run --check (must end "unscheduled: none" and "units: match the schedule"); CARTA_TIER=quarterly CARTA_AUTO_UPDATE=0 CARTA_PIPELINE_ENABLED=1 bash infra/hetzner/cax11/weekly.sh --dry-run; sudo bash infra/hetzner/cron/install.sh --dry-run; sudo bash infra/hetzner/cron/install.sh; systemctl list-timers 'carta-*' --no-pager (four timers: weekly, monthly, quarterly, reboot) | docs/runbooks/build-box.md
- [T1107-c] Read the status after the first monthly and quarterly runs | proves the tiers ran and the status push reaches R2, and the first quarterly run's length is unknown | after the first Saturday: tail -n 5 ~/logs/weekly.log; rclone cat r2:carta/status/last_run.json (tier monthly, exit 0); rclone cat r2:carta/status/freshness_wires.json (n_over_cadence below 8); after 2027-01-16 the same for quarterly, and compare its duration with the 120 h TimeoutStartSec in carta-quarterly.service | docs/runbooks/build-box.md
