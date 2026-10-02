# T298 Stage 7 is ready to run, and the laptop schedule is off

## Task ID

T298

## Date

2026-10-02

## What changed

The laptop's weekly task `TravelAppFareRefresh` is disabled. It was due to run `run_pipeline.bat` on Monday 2026-10-05 at 09:00. `logs/pipeline_state.json` was last written on 2026-07-31, and the run of 2026-09-28, like the ones before it, was stopped inside the fare harvest (last result `0xC000013A`). So `run_pipeline.py --list` showed about forty tasks due: the master writers `fame`, `poi_significance` and `country_context`, and every layer export (trails, cycling, beaches, lakes, mountains, regions, trips). Since stage 1 the fare tasks are manual, so Monday's run would have reached all of them for the first time. The inputs most of them read (`data/raw`, `data/history`, `data/models` and the eleven archived cache layers) were removed from the laptop the same afternoon (T293). Disabling the task is the laptop half of stage 7.9, done ahead of the order T048-f set ("only after T048-d passes"), because that order assumed the laptop could still run the pipeline. It closes T048-f. Nothing runs the pipeline on a schedule until the box's units are installed in 7.9, and nothing needs to: production reads the data in R2, which does not change on its own.

Stage 7 of `Execution/_OPEN-MASTER.md` now matches the state after stages 5 and 6. The box sets `VITE_DATA_BASE` from the start. It gets its own R2 key pair, `carta-box`. Step 7.8 compares the app shell (`dist/`) and the data (`dist-data/`) separately, because both builds are split since T291. Step 7.9 records that the laptop half is done, and it gains the hand deploy that follows a weekly run while T262-a is open. Step 7.11 says what the 2026-10-02 clean-out already removed, and its `rm` no longer deletes `app_data/app_data.json`, which every laptop deploy reads. The rules block at the top no longer says that a push to GitHub makes a Vercel Preview. The install note for `hcloud` on Windows is new, because it was missing on the laptop.

T048-j asked how the box's output reaches production, and offered a deploy key with a git push, or R2 data shards. The R2 route has been live since T291, and T262 made the box upload each good week's data. The row is closed, and its remaining half (the app shell and the prune) is T262-a, still open.

T297-a does not block stage 7. The box clones `main`, which tracks the layer files again since T297, so the box's build stages all 17 entries. The box only refreshes the weekly tasks (`CARTA_MAX_CADENCE=weekly` in `run_pipeline.sh`), so the layers stay as they are in git until the monthly and quarterly tasks get a home (T048-h, open).

## Files touched

Root (branch p3-box-readiness, from main):

**Modified:**
- Execution/_OPEN-MASTER.md (stage 7 and the rules block)
- Execution/_OPEN.md (T048-f and T048-j closed by T298)

**Created:**
- Execution/P3/T298-box-readiness.md

Outside the repository: the Windows Scheduled Task `TravelAppFareRefresh`, disabled.

## Commands run

```bash
schtasks /Query /TN TravelAppFareRefresh /V /FO LIST     # Enabled, next run 5/10/2026 09:00, last result -1073741510
python run_pipeline.py --list                            # about 40 tasks due; state last written 2026-07-31
schtasks /Change /TN TravelAppFareRefresh /DISABLE       # Disabled, next run N/A
curl -s -o NUL -w "%{http_code}" https://api.github.com/repos/basvn123/carta-travel-app   # 200: public, the box clones without a key
git lfs status ; git lfs push --dry-run origin main      # nothing left to push: GitHub has every LFS object
bash -n infra/hetzner/cax11/{provision,run_pipeline,verify,verify_tasks,weekly,load-env}.sh infra/hetzner/cron/install.sh   # all 0
python -c "yaml.safe_load(open('infra/hetzner/cax11/cloud-init.yaml'))"                    # parses
python infra/hetzner/cax11/compare_wire.py summarize continent-app/dist-data -o lw_data.json
python infra/hetzner/cax11/compare_wire.py summarize continent-app/dist      -o lw_shell.json
python infra/hetzner/cax11/compare_wire.py compare lw_data.json continent-app/dist-data    # SAME SHAPE, 52,311 files
```

The master `app_data/app_data.json` was last written on 2026-09-17, before the T288 archive, so the copy the box pulls from R2 in 7.5 is the laptop's.

## Config and secrets set

None. The task was disabled on the laptop; no secret was read or written.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| TravelAppFareRefresh | Enabled, next run 2026-10-05 09:00 | Disabled | off |
| Tasks due on the laptop's next run | about 40 | none (no run) | |
| Owner steps in stage 7 that matched the post-stage-6 state | 7.1 to 7.7 and 7.10 | all | 7.3, 7.8, 7.9 and 7.11 rewritten |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The laptop's Monday run would have started about 40 due tasks with their inputs deleted | The 2026-10-02 clean-out happened before stage 7, as the stage 6 build needed the disk; the task was still enabled | Task disabled; 7.9 and 7.11 say so |
| Step 7.8 as written would compare the box's 64-file shell with a laptop `npm run build` of about 52,000 files | Written before builds were split (T291) | Compare `dist/` and `dist-data/` separately, both from split builds |
| Step 7.11's `rm` deleted the master that every laptop deploy reads | Written before production deploys moved to the laptop (T291, T293) | Removed from the command |

## What is still open

Stage 7 itself, the owner's steps 7.1 to 7.10, under the rows it already names (T046-a, T046-c to T046-g, T048-a to T048-e, T048-g). T262-a decides whether the box ever deploys the app shell itself. T048-h decides where the monthly and quarterly tasks run. T045-e covers the rest of the laptop clean-out. Nothing new is raised.

## Rollback procedure

`schtasks /Change /TN TravelAppFareRefresh /ENABLE`, but only after `python pipeline/archive/push.py --pull` has put the laptop's inputs back, or the next run meets the empty caches this task guards against. `git revert` the T298 commit to restore the earlier stage 7 text and reopen T048-f and T048-j.
