# T048 Port the Windows Scheduled Task to cron, task by task

## Task ID

T048

## Date

2026-09-27

## What changed

The weekly cadence can now run on the CAX11, but it has not. There is no box yet (T046 shipped code only), so no task was verified on arm64 and the done condition, a full weekly cadence on the CAX11 producing a wire identical in shape to the laptop's, is not met. What exists is the port, the harness that verifies it one task at a time, the tool that compares the two wires, and the owner procedure that walks through them. The laptop's Windows Scheduled Task TravelAppFareRefresh is untouched and remains the live schedule.

How it works, for whoever maintains it. The chain on the box is systemd timer, `weekly.sh`, `run_pipeline.sh`, `run_pipeline.py`. The timer (`infra/hetzner/cron/carta-weekly.timer`) fires Monday 09:00 Europe/Brussels, the Windows task's slot, with the zone written into `OnCalendar` so a change of the box's zone cannot move it. It is a systemd timer and not a crontab line for T046's reasons: it logs to the journal, `Persistent=true` catches up a Monday missed while the box was off, and `systemctl` gives `verify.sh` something exact to ask. The service gives the run `TimeoutStartSec=48h`. A oneshot service is killed after 90 seconds by default, and the laptop's last complete fare chain took 29.8 hours (fares 24.5 h, wizz_fares 4.7 h, vueling_fares 35 min, volotea_fares 58 s, from `docs/PIPELINE.md`). 48 hours leaves 60 percent headroom for a slower core and a week of rate limits and still ends days before the next Monday.

`weekly.sh` keeps writing the "cron fired" line that T046's `verify.sh` counts, then runs the pipeline only when the service sets `CARTA_PIPELINE_ENABLED=1`. The units cloud-init installs at first boot are still T046's, which fire ten minutes after every boot and do not set the variable. Without the gate, a box provisioned from this branch would start a 30-hour harvest ten minutes after its first boot, before its secrets file is filled and before anything was verified. So the real units in `infra/hetzner/cron/` are installed by hand with `install.sh`, as the last step of the procedure, and until then the box behaves exactly as T046 left it.

`run_pipeline.sh` is the successor of `run_pipeline.bat`, kept in `infra/hetzner/cax11/` rather than at the root because it depends on `load-env.sh` next to it and on the box's venv layout, and runs nowhere else. In order: it takes `logs/carta-run.lock` with flock, so a timer run, a hand run and a verification run never overlap; loads the secrets file; re-syncs the venv to `requirements.txt` plus `constraints.txt` whenever either changes (a stamp of both files in the venv); runs `npm ci` if `continent-app/node_modules` is missing, because the ship step needs it and cloud-init never ran it; pulls from R2 what the weekly cadence needs and the box lacks; runs `run_pipeline.py --max-cadence weekly`; dumps the databases; packs and pushes. It tees everything to `logs/pipeline_run.log`, the file the .bat appended to, and exits with the pipeline's code, or 3 when the pipeline succeeded and an archive step failed.

The archive steps close T045-g, and they live in the wrapper, not as `run_pipeline.py` tasks. They are not data tasks: they must run on every scheduled run whatever is due, the pull must happen before `run_pipeline.py` reads the master, the push must come after the ship and after the driver has released its lock, a snapshot push must still happen when the pipeline failed, and none of it belongs in `--list` or the state file. Each is skipped with a message when rclone or the `RCLONE_CONFIG_R2_*` values are missing, the same pattern as `web_sweep.py --if-configured`. The pull fetches `master-current` and `fare-estimation-history` only when the box does not have them. Once the box is running, its copy is the newest, and a pull would overwrite it with last week's if last week's push had failed. The pack and the push are limited to an explicit list (`fare-estimation-history` packed; `master-snapshots`, `master-current`, `fare-estimation-history` and `raw-mirrors` pushed), because `pack.py` over all layers would tar whatever fragment of another layer exists on the box and `push.py` would then replace the laptop's full tarball in R2 with it. When the pipeline fails, only the snapshots are pushed, so R2's master stays at the last good run. The Supabase dump runs when `SUPABASE_DB_URL`, `CARTA_BACKUP_KEY` and its public key are present and pg_dump is version 17 or newer; Ubuntu 24.04 ships 16, which refuses a Postgres 17 server, so it needs the PGDG client (T048-g). The trailslab lab is not on the box, so its dump is skipped unless `TRAILSLAB_HOST` is set, resolves and answers on its port.

The box runs the weekly tier only. The monthly and quarterly tasks have not been verified on arm64, several are heavy enough to belong on the on-demand CAX41 (T047), and a fresh state file makes every one of them due at once. `CARTA_MAX_CADENCE` (weekly, monthly, quarterly or all) raises the ceiling when a later task has verified them. Until then, once the Windows task is disabled, the monthly and quarterly tiers run nowhere (T048-h).

`run_pipeline.py` changed in four places, each behind `os.name` so Windows runs the same code as before. The concurrency guard's POSIX branch was `pgrep -f python`, which matches any process with "python" anywhere in its command line; on the box that would abort every writer run while unattended-upgrades or T047's spawn driver is alive. It now reads `ps -eo pid=,args=` and counts only a python process whose script is under `pipeline/` or `src/`, or is `run_pipeline.py`, or whose `-m` module starts with `src.`, resolved against the process's working directory from `/proc`. A lock file whose PID is no longer a running `run_pipeline.py` is removed as stale, because a run killed by the timeout or an OOM never reaches the `finally`, and nobody is at the box to delete it. SIGTERM, which systemd sends on stop and on timeout, becomes `SystemExit`, so the `finally` does release the lock. Node is still found on PATH first, with `/usr/local/bin` and `/opt/node/bin` as the Linux fallbacks where carta-bootstrap puts it. There was no `shell=True` and no .bat call to port. `--max-origins N` needed no change: the freshness report, the ranking and the cache invalidation are JSON and `pathlib` only, and the dry run below shows the same five origins it picks on Windows. `fares_step` compares the window to `date.today()`, the local date, which is the same on both machines because the box runs in Europe/Brussels.

`verify_tasks.sh` is the one-at-a-time harness. For a step it runs `run_pipeline.py --only <key> --ship none` first with `--dry-run` and then for real, each under `/usr/bin/time -v`, and writes `logs/arm64_verify/<step>.json` with exit code, wall time and peak resident memory per phase and the change in `logs/pipeline_state.json`. A step passes only when both phases exit 0 and the task's `last_success` moved, because a soft task that fails and a task its guard skips both leave the driver at exit 0. It refuses to start while another step is unfinished (a marker holds the step and its PID; a dead PID means an interrupted step, cleared only by `--abandon`), refuses a step whose predecessor has not passed unless `--out-of-order` is given and recorded, and refuses to run on a venv not synced to `constraints.txt`. The order is in `weekly_tasks.txt`, cheapest and least destructive first: report-only tasks before master writers, the first master writer a cheap one that refuses to write if any score moved, the scikit-learn retrain early because it is the one library-bound task, the carriers from the smallest harvest up, a five-origin `fares --max-origins 5` run to prove the Ryanair path in minutes, the day-long full `fares` refresh last because it rolls the window, and the wire build (`ship`) after it. The `ship` step also writes the wire shape summary for the comparison.

`compare_wire.py` compares two wire builds by shape: the same file set (everything except Vite's hashed `assets/`), the same keys three levels deep in every JSON file, the same schema version fields (`schema_version`, `version`, `schema`, `v`, at the root or under `meta`), and the size of every map and list at the top two levels within a tolerance, 5 percent by default. Objects whose keys are data (IATA codes, destination ids, dates) are treated as maps, so their size is compared and not their keys. Directories of many files of one kind are compared as a whole name set plus a merged shape over an evenly spaced sample of 200 files, taken from the sorted names so both machines sample the same files. Either side can be a directory or a small summary file, so the box and the laptop never need each other's 1.2 GB `public/`.

The requirements closed T046-i and T046-h. `anthropic` is gone from `requirements.txt` and `pyyaml` is in, which `git grep` confirms `pipeline/archive/pack.py` and `push.py` import. The Claude provider code in `rewrite_intros.py` and `parking_check.py` stays for T041-g; without the SDK it can no longer run. The version drift is fixed with a constraints file, `constraints.txt`, not a lock: it pins versions but installs nothing `requirements.txt` does not ask for, and it is used as `pip install -r requirements.txt -c constraints.txt`. The pins are the laptop's installed versions for every package in the dependency closure as resolved for the box, 71 packages, plus colorama for the laptop. That closure was computed with `uv pip compile --python-platform aarch64-manylinux_2_28 --python-version 3.12 --only-binary :all:`, because pip's own dry run evaluates environment markers for the machine it runs on and demanded pywin32 for a Linux target. The same compile against the pins resolves all 71 at exactly the laptop's versions, each with a Linux aarch64 CPython 3.12 wheel or pure Python. One pin forced a change: the laptop runs lxml 4.9.4 while `requirements.txt` asked for 5.2 or newer, a floor never enforced. The floor now follows the laptop to 4.9. The box's bootstrap still installs unpinned at first boot (cloud-init is outside this task); `run_pipeline.sh --pull-only` then re-syncs to the pins, and `verify_tasks.sh` refuses to run until it has.

T046-j and T046-k are decided. The always-on box keeps Git LFS: it clones once per box life and weekly runs never re-clone, so the 613 MB of LFS objects is a provisioning cost, not a weekly one. The per-run cost belongs to T047's CAX41, which clones every run (T048-l). `OnBootSec` is dropped from the real timer, because a reboot would otherwise start a 30-hour run, and `Persistent=true` already covers a missed Monday. The reboot window is a second timer, Sunday 04:00 Brussels, whose script reboots only when `/var/run/reboot-required` exists and no run is active (the weekly service, the flock, or any `run_pipeline.py` process). Sunday 04:00 is the point of the week furthest from a Monday run that ends Tuesday afternoon, so a kernel update waits at most seven days. Its timer is not persistent, so a missed window never fires at boot. Logrotate takes the two fixed-name logs weekly with copytruncate (tee holds the run log open for the whole run); `run_pipeline.sh` compresses the dated per-day logs after 7 days and deletes them after 90.

Two facts found on the way. The laptop's schedule has not refreshed fares since 2026-07-23: its last run, 2026-09-21, exited 1 when the any-python guard found another python process alive, and the shipped fare slices are 46 to 54 days old. The Windows guard is unchanged here by rule (T048-m). And nothing publishes what the box builds: it rewrites tracked files under `continent-app/public/` and builds `dist`, and on the laptop the commit, push and deploy were hand steps. That must be decided before the Windows task is disabled, or production fares stop moving (T048-j).

## Files touched

Code (commit 5281b5210):

**Modified:**
- run_pipeline.py
- run_pipeline.bat (comments only)
- requirements.txt
- docs/PIPELINE.md (new section "The Linux host (T048)")
- infra/hetzner/cax11/weekly.sh

**Created:**
- constraints.txt
- infra/hetzner/cax11/run_pipeline.sh
- infra/hetzner/cax11/verify_tasks.sh
- infra/hetzner/cax11/weekly_tasks.txt
- infra/hetzner/cax11/compare_wire.py
- infra/hetzner/cron/carta-weekly.service
- infra/hetzner/cron/carta-weekly.timer
- infra/hetzner/cron/carta-reboot.service
- infra/hetzner/cron/carta-reboot.timer
- infra/hetzner/cron/reboot-if-needed.sh
- infra/hetzner/cron/carta-logrotate
- infra/hetzner/cron/install.sh
- infra/hetzner/cron/.gitattributes

Execution (report commit):

**Created:**
- Execution/P3/T048-pipeline-cron-migration.md

**Modified:**
- Execution/P3/_OPEN-hetzner.md (steps 9 to 16 appended)
- Execution/_OPEN.md (rows T048-a to T048-m; T045-g, T046-h, T046-i, T046-j and T046-k closed)

**Deleted:**
- None.

`cloud-init.yaml`, `verify.sh`, `infra/hetzner/README.md` and `env.example` were not in scope and were not edited; what they now lack is T048-i.

## Commands run

From the repo root in Git Bash unless marked. `$S` is the session scratchpad under `C:\Users\GEBRUI~1\AppData\Local\Temp\claude\`.

```
git checkout -b p3-pipeline-cron-migration          # from p3-cax11-orchestrator, stacked
docker info                                          # daemon not running: arm64 smoke test skipped
wsl --status; wsl -l -v                              # PowerShell: only docker-desktop, stopped
wsl -d docker-desktop -- sh -c 'command -v systemd-analyze'   # absent
schtasks /query /tn TravelAppFareRefresh /v /fo LIST # PowerShell: enabled, Mon 09:00, last result 1

# requirements
git grep -nE "^\s*(import yaml|from yaml)" -- '*.py'
git grep -nE "import anthropic" -- '*.py'
python -m venv $S/uv-venv && $S/uv-venv/Scripts/python -m pip install uv
$S/uv-venv/Scripts/uv pip compile --python-platform aarch64-manylinux_2_28 --python-version 3.12 \
  --only-binary :all: requirements.txt -c constraints.txt -o $S/lock-arm64-final.txt   # 71 resolved, 0 mismatches
python -m pip install --dry-run -r requirements.txt -c constraints.txt              # nothing to install on the laptop

# run_pipeline.py on Windows
python run_pipeline.py --list                                  # exit 0, 65 tasks, 10 weekly
python run_pipeline.py --dry-run --max-cadence weekly          # exit 0, 3 s
python run_pipeline.py --dry-run                               # exit 0, 201 s (hero_audit probe ran)
python run_pipeline.py --only fares --max-origins 5 --dry-run  # exit 0: AGP, ALC, AMS, ATH, BCN
python $S/test_guard.py                                        # POSIX guard with faked ps and /proc: PASS
python -c "...rp._clear_stale_lock_posix()..."                 # dead PID removed, unparseable kept
git checkout -- cache/hero_image_meta.json data/derived/freshness_report.json data/reports/hero_images_audit.json

# shell and units
bash -n infra/hetzner/cax11/*.sh infra/hetzner/cron/*.sh       # all 8 OK
python $S/unit_lint.py infra/hetzner/cron/*.service infra/hetzner/cron/*.timer   # 4 OK
HOME=$S/fakehome bash infra/hetzner/cax11/weekly.sh             # exit 0, "pipeline not enabled" line
HOME=$S/fakehome CARTA_VENV=$S/fakevenv PATH=$S/shim:$PATH bash infra/hetzner/cax11/run_pipeline.sh --dry-run    # exit 0
HOME=$S/fakehome CARTA_VENV=$S/fakevenv PATH=$S/shim:$PATH bash infra/hetzner/cax11/run_pipeline.sh --pull-only  # exit 0
CARTA_PIPELINE_ENABLED=1 HOME=... bash infra/hetzner/cax11/weekly.sh --dry-run                                    # exit 0
bash infra/hetzner/cax11/verify_tasks.sh --status | --next | tp_stage --dry-only | fares_targeted --dry-only --out-of-order
rm -rf logs/arm64_verify logs/carta-run.lock

# compare_wire.py
python infra/hetzner/cax11/compare_wire.py summarize continent-app/public -o $S/public_summary.json
python -c "shutil.copytree('continent-app/public', '$S/public_copy')"
python infra/hetzner/cax11/compare_wire.py compare continent-app/public $S/public_summary.json   # exit 0
python infra/hetzner/cax11/compare_wire.py compare continent-app/public $S/public_copy          # exit 0
rm $S/public_copy/fares/CRL.json; ... compare $S/public_summary.json $S/public_copy             # exit 1, 1 DIFF
# then drop poi_credits.json "v" and 300 of 3,868 destinations in the copy                      # exit 1, 4 DIFF
```

The shims for the Git Bash smoke tests: `$S/fakevenv/bin/python` execs the laptop's Python, `$S/shim/flock` exits 0 (Git Bash has no flock), `$S/shim/faketime` stands in for GNU time and writes a fixed RSS line. `$S/unit_lint.py` checks each unit's sections, keys, time spans and calendar strings and that no carriage return is present; it is not `systemd-analyze`, which `install.sh` runs on the box before enabling anything.

## Config and secrets set

None were set. New variables, none secret, all optional: `CARTA_PIPELINE_ENABLED` (set by `carta-weekly.service`, not by hand), `CARTA_MAX_CADENCE` (default weekly), `CARTA_SHIP` (default build), `CARTA_VENV`, `CARTA_REPO`, `CARTA_TIME_BIN`. `CARTA_ARCHIVE_OUT` now defaults to `$HOME/archive-out` on the box, outside the checkout, as T045 asked. The box's weekly dumps additionally need `SUPABASE_DB_URL` and `CARTA_BACKUP_KEY` in its secrets file, both already listed in `env.example`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Live weekly schedule | laptop, TravelAppFareRefresh, Mon 09:00, enabled; last run 2026-09-21 exit 1 | the same; the CAX11 schedule exists as code, not installed | none live |
| Last measured full fare chain | 29.8 h on the laptop | not measured on arm64 | Not measured |
| Weekly-cadence task keys | 10 | 10 | 0 |
| Windows-specific call sites in run_pipeline.py | 5, 2 of them behind a platform check | 5, 4 behind a platform check | +2 guarded |
| shell=True or .bat calls in run_pipeline.py | 0 | 0 | 0 |
| POSIX concurrency guard matches | any process with "python" in its arguments | python running a repo pipeline script only | narrowed |
| Weekly tasks verified on arm64 | 0 of 10 | 0 of 10 | Not measured |
| Packages pinned for the pipeline | 0 | 72 | +72 |
| Box closure resolvable at the laptop's versions, aarch64 cp312 wheels | not checked | 71 of 71 | new |
| compare_wire.py: public/ against itself, against a copy with one file removed, against a copy with three injected changes | no tool | 0, 1 and 4 difference lines (the dropped version key reports twice) | new |

The five Windows sites are the cp1252 stdout reconfigure, the `C:\Program Files` Node directories, the `node.exe` and `npm.cmd` fallbacks and `tasklist`. The fifth, `npm.cmd` as a second PATH name in `npm_exe`, stays unguarded and is inert on Linux, where `npm` is found first. Wall time, peak memory and disk use of every task on arm64, and the duration of the full weekly chain there, need the box: Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The archive output directory silently fell back to `pipeline/archive/output` inside the repo in the smoke test | `run_pipeline.sh` set the default before sourcing `load-env.sh`; `env.example` ships `CARTA_ARCHIVE_OUT=` blank and load-env unsets blanks | Defaults are set after load-env; the rerun printed the scratch directory |
| The constraints could not be installed at all | `requirements.txt` asked for lxml 5.2 or newer; the laptop runs 4.9.4 | Floor lowered to 4.9, with the reason in the file |
| pip's cross-platform dry run failed on pywin32 | pip evaluates markers for the host, not the target | Resolved with `uv pip compile --python-platform aarch64-manylinux_2_28` in a scratch venv |
| compare_wire.py reported a type change when a sampled field was null on one side | A sample in which every value is null says nothing about the type | Null-only samples are informational; map and list values sampled at 256 instead of 64 |
| `--dry-only` counted as a pass for the order check, and `ship --dry-only` wrote a failed record | Status and argument checks were in the wrong place | New status `dry-passed`, which does not unlock the next step; `ship --dry-only` refused before anything is written |
| The full `--dry-run` modified three tracked files | Documented behaviour: the freshness report is always written and the hero_audit probe fills its Commons cache | Restored with `git checkout`; none of them is in this task's scope |
| The Git Bash shims were not found | `$S` as `C:/...` put a drive colon into PATH | `cygpath -u` |
| A smoke run of `run_pipeline.sh --pull-only` ran `pip install -r requirements.txt -c constraints.txt` against the laptop's Python through the fake venv | The fake venv points at the system interpreter | Nothing installed, since the pins equal what the laptop has; checked with pip's dry run and the versions of pandas, numpy, scikit-learn, lxml and pyyaml afterwards |

The smoke runs also appended their dry-run output to the laptop's `logs/pipeline_run.log`, which is gitignored. Docker was not running, so the `docker run --platform linux/arm64` smoke test was skipped. WSL holds only Docker Desktop's own distribution, which has no systemd-analyze, so the units were checked by a scratch lint and `install.sh` runs `systemd-analyze verify` on the box.

## What is still open

The owner steps are ordered in `Execution/P3/_OPEN-hetzner.md`, steps 9 to 16, and each is a register row. Prepare the box (T048-a): GNU time, the T048 branch, then `run_pipeline.sh --pull-only` to re-sync the venv and fetch the gitignored master and fare history, or copy them from the laptop. Verify the twelve steps one at a time in `weekly_tasks.txt` order (T048-b). Make the first full weekly run by hand through `weekly.sh` with every weekly key forced, since the verification leaves none due (T048-c); that also closes T046-g, which stays open until it happens. Compare the box's wire with a laptop build and get SAME SHAPE (T048-d). Install the real units with `install.sh` (T048-e). Decide how the box's output reaches production (T048-j). Only then disable the Windows task, the same day as the install (T048-f). The weekly dumps need the PGDG pg_dump 17, the backup public key and two secrets on the box (T048-g, after T045-d).

For later tasks. With the Windows task disabled, the monthly and quarterly tiers run nowhere until they are verified on arm64 or moved to the CAX41 and `CARTA_MAX_CADENCE` is raised (T048-h). `cloud-init.yaml` should install with `-c constraints.txt`, add the `time` and PGDG client packages, run `npm ci`, and either embed the T048 units or leave them to `install.sh` on purpose; `infra/hetzner/README.md` still calls `weekly.sh` a placeholder and `env.example` does not list `CARTA_MAX_CADENCE` (T048-i). `logs/pipeline_state.json` is not in the archive manifest, so a rebuilt box forgets every `last_success` and starts with everything due (T048-k). T047's CAX41 clones on every run, where the 613 MB of LFS objects does count against GitHub's quota (T048-l). The laptop's own schedule has not completed a fare refresh since 2026-07-23 because its any-python guard aborts it (T048-m).

Nothing in the weekly-cadence scripts was found that breaks on Linux. The ten tasks call `src/ingestion/run_all.py`, the four carrier harvesters, `src/estimation`, `country_context_layer.py` and `pipeline/images`; they were searched for tasklist, .bat and .cmd calls, `shell=True`, drive letters, backslash paths, Windows environment variables, `os.name` and `sys.platform` branches, file reads without an encoding, and repo paths whose case differs from the tracked file. The only hits were a Windows-only stdout reconfigure in `country_context_layer.py`, which is guarded, and a filename sanitiser in `src/ingestion/core/storage.py`, which is portable. The arm64 runs are what can prove it.

## Rollback procedure

Nothing was installed anywhere, so nothing live needs rolling back. The Windows Scheduled Task TravelAppFareRefresh was not touched and stays the live schedule until the owner disables it in step 15. If it has been disabled and the box has to be abandoned, on the laptop:

```
schtasks /Change /TN TravelAppFareRefresh /ENABLE
```

and on the box stop the schedule, which a run already in progress survives:

```
sudo bash ~/carta/infra/hetzner/cron/install.sh --disable
sudo systemctl stop carta-weekly.service        # only to stop a run in progress
```

Before the laptop writes the master again after the box has run, pull the box's master (`python pipeline/archive/push.py --pull --only master-current`), or the laptop continues from an older one.

In the repository, revert the two commits, newest first, or drop the branch before it is merged:

```
git revert <report commit> 5281b5210
# or, unmerged:
git checkout p3-cax11-orchestrator && git branch -D p3-pipeline-cron-migration
```

Reverting the report commit restores `Execution/_OPEN.md` and `Execution/P3/_OPEN-hetzner.md`. Reverting the code commit brings back `anthropic` in `requirements.txt` and the old floor pins; a box venv already synced to `constraints.txt` keeps its versions until someone reinstalls it.
