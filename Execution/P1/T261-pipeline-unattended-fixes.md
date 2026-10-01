# T261: run_pipeline.py fails loudly, in order, and keeps backfill manual

## Task ID

T261

## Date

2026-10-01

## What changed

Stage 4 of `Execution/_OPEN-MASTER.md`, items 2 to 5: the orchestrator fixes
that matter once the pipeline runs on a timer on the CAX11, where nobody reads
a traceback. All four come from the T028 and T029 audits.

A task that raises is now a failed task. The guard, the rescore hold, the
master backup and the task's `run(ctx)` or `cmds` sit in one `try` per task.
An exception logs `RAISED <type>: <message>` and the traceback, then takes the
same soft or hard path as a task that returns false. The state file, the ship
decision, the freshness report, the `pipeline_runs` row and the heartbeat
`/fail` all still happen. Before, the exception escaped `main()` and skipped
every one of them, which is the one failure the heartbeat existed to catch. A
run stopped from outside (SIGTERM from systemd's stop or its 48 hour timeout,
which `_exit_on_sigterm` turns into `SystemExit`, or Ctrl-C) is treated
separately: nothing ships, but before the process exits it writes a
`pipeline_runs` row with `interrupted` among the failed keys and pings
`/fail`. The `failed` column is free text (`text[]`, migration 041) and any
entry marks the run not ok, the same as the existing `ship` key.

`bathing_water` now sits directly before `beaches` in `TASKS`. Both `beaches`
and `lakes` refuse to run without `cache/eea_bathing_water.json`, which
`bathing_water` writes, and the plan runs in list order. On a fresh box the
first quarterly run therefore skipped both layers, and the next chance came
90 days later. The guards' messages named a `bathing` task that does not
exist; they now name `bathing_water`.

`poi_enrich` is no longer a task. Its three commands were exactly
`poi_images`' two plus `must_descs`' one, without `poi_images`' 12 retries. It
is now an entry in a new `TASK_ALIASES` map, so `--only poi_enrich` runs
`poi_images` (with its retries) and then `must_descs`, deduplicated against
any keys listed beside it. The task count goes from 65 to 64 and the backfill
count from 11 to 10.

The backfill tasks were already off every timer, since they never come due.
What could still reach them was `--only` from a script, a timer unit or an
agent. `--only` now refuses any backfill task, or an alias naming one, unless
stdin is a terminal, the run is `--dry-run`, or `--allow-backfill` is passed.
On Windows, `isatty()` is also true for the `NUL` device, which is a
scheduled task's usual stdin, so `stdin_is_terminal()` asks
`GetConsoleMode` there. On Linux, systemd's `/dev/null` is not a TTY.

Monthly and quarterly tasks still do not run on the box (T048-h stays open,
because only arm64 verification closes it). A `--max-cadence` run now logs
`HELD BACK by --max-cadence weekly: N due task(s) will not run here: ...`, so
the gap shows in every weekly log, not only in a document.

`docs/PIPELINE.md` was brought up to date wherever it described the old
behaviour.

## Files touched

**Modified:**
- run_pipeline.py
- docs/PIPELINE.md

**Created:**
- Execution/P1/T261-pipeline-unattended-fixes.md

## Commands run

The work was done in a sparse worktree, because another Claude session was
working in the main checkout at the same time:

```
GIT_LFS_SKIP_SMUDGE=1 git worktree add --no-checkout ../carta-stage4 p1-truncate-lc-guard
cd ../carta-stage4
git sparse-checkout init --cone
git sparse-checkout set Execution pipeline infra docs src tests
git checkout p1-pipeline-unattended-fixes
```

Tests. A throwaway harness imports `run_pipeline.py`, replaces `TASKS` with
fake tasks, and records every side effect (heartbeat, `pipeline_runs`, build,
backup, freshness report) instead of performing it. It covers a hard raise, a
soft raise, a raising guard, a SIGTERM-style `SystemExit`, backfill with and
without a terminal, `--allow-backfill` and `--dry-run`, alias order and
deduplication, and the held-back line:

```
python t261_harness.py < /dev/null          # 21 of 21 passed
python t261_before.py                       # the same harness on the parent commit's file:
                                            # the first case dies with RuntimeError out of main()
python run_pipeline.py --list               # bathing_water listed before beaches and lakes; no poi_enrich
python run_pipeline.py --only poi_enrich --dry-run --ship none
                                            # plan: poi_images, must_descs
python run_pipeline.py --only poi_enrich --ship none < /dev/null
                                            # refusing backfill task(s) poi_images, must_descs without a terminal
```

The harness lives in the session scratchpad, not the repo, because the task
names no test file. `stdin_is_terminal()` was checked with `NUL` and with a
pipe as stdin (both False). A real interactive console could not be tested
from this session.

## Config and secrets set

None. One new command-line flag, `--allow-backfill`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Harness cases passing (raise, interrupt, backfill, alias, held-back) | the first case crashes the harness | 21 of 21 | |
| Tasks in `TASKS` | 65 | 64 | -1 (`poi_enrich` became an alias) |
| Backfill tasks | 11 | 10 | -1 |
| Position of `bathing_water` relative to `beaches` and `lakes` | after both | before both | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A real `--only poi_enrich` run from this session passed the new backfill refusal and was stopped only by the other-python guard (nothing ran: the worktree holds no master) | On Windows, CPython's `isatty()` returns True for `NUL`, which this shell gives as stdin | `stdin_is_terminal()` also asks `GetConsoleMode` on Windows; re-run refused as intended |
| A `--dry-run` in the worktree rewrote `data/derived/freshness_report.json` there | Every dry run writes the freshness report, by design | Restored with `git checkout --` in the worktree; never staged |

## What is still open

None new. T048-h (the monthly and quarterly tasks run nowhere once the
Windows task is disabled) stays open with its existing owner. This task makes
it visible in every box log but cannot close it; only arm64 verification or a
move to the CAX41 can. A person running a backfill task from Git Bash's mintty
(where stdin is a pipe) must now add `--allow-backfill`; the refusal message
says so.

## Rollback procedure

```
git revert <this task's commit>
```

This restores the old task table (`poi_enrich` as a task, `bathing_water`
after the beach and lake tasks) and the old loop. The state file needs
nothing: an entry for `poi_enrich` left in `logs/pipeline_state.json` is
ignored by this version and read again after a revert.
