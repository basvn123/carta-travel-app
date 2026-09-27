# T047 Build the on-demand CAX41 spawn-and-destroy flow

## Task ID

T047

## Date

2026-09-27

## What changed

No CAX41 has been spawned, and none could be: there is no Hetzner account access, no hcloud, no R2 credential and no CAX11 on this machine. What exists is the flow as code, run end to end in dry-run and through fake hcloud and rclone binaries on the laptop, and the owner procedure that makes it real. The done condition, a heavy job run end to end on a spawned box that is then destroyed with its cost recorded, is not met. It is register row T047-d.

How it works, for whoever maintains it. `infra/hetzner/cax41/spawn.sh <job> [args]` runs on the CAX11 as `carta`, with `HCLOUD_TOKEN` and the R2 variables from the secrets file. It reads the job from `infra/hetzner/jobs/jobs.tsv` (inputs prefix, include patterns, outputs prefix, ceiling, planned hours, what the job needs), renders the worker's user data from `cax41/cloud-init.yaml` into a mode-600 temp file, and creates a CAX41 running Ubuntu 24.04 in the orchestrator's own location, with T046's SSH key and SSH-only firewall and the labels role=worker, job, run, created, deadline and keep. The worker boots, installs the pinned rclone, writes "started" to `archive/runs/<run>/status.json`, makes a sparse clone and hands over to `jobs/worker.sh`. That script installs what the job needs (docker.io, or a Python 3.12 venv from `requirements.txt` plus `constraints.txt`, plus the CPU torch and OpenCLIP stack for the photo job), mirrors the job's inputs from R2 into `/srv/carta/in`, runs `jobs/<job>.sh` under `timeout` with all 16 cores, pushes `/srv/carta/out` to `archive/runs/<run>/out/`, and writes the final status: state ok or failed, the exit code, the phase that failed, and the duration of every phase. The boot script then ships its logs to R2 and powers the box off. spawn.sh polls the status object every minute. On ok it copies the run's `out/` to the job's outputs prefix, then deletes the server, appends a ledger line and sweeps.

Why it is shaped this way. The status object in R2 is the whole interface between the two machines, so the orchestrator never needs to SSH into a worker and the worker needs no inbound port. The worker only ever writes to its own run prefix, and the orchestrator promotes, so a failed, timed-out or half-finished run cannot overwrite a good artifact in R2. And the delete belongs to the orchestrator and is unconditional, because a Hetzner server bills whether it is running or powered off, and the worker's poweroff saves nothing. A trap on EXIT, INT and TERM deletes the worker on every way out of spawn.sh. The create is marked as attempted before the call, so a create that errors on our side (and may have made the server anyway) is still followed by a delete by name. The delete is confirmed by the API answering "not found", not by any failure of `describe`, and retried three times; if it still cannot be confirmed, spawn.sh exits 7 with the command to run. After every run, and hourly from `carta-worker-sweep.timer`, a sweep deletes every role=worker server past its deadline label, or powered off with no live spawn.sh owning it. The timer covers what the trap cannot: the orchestrator rebooting, or spawn.sh killed outright. `--keep` skips the delete for debugging, prints a banner at the start and the end, labels the server keep=1 and extends its deadline by four hours, after which the sweep deletes it anyway.

The worker does not hold a Hetzner token by default. A Hetzner token covers the whole project: on a box that runs pip packages, docker images and downloads, and whose user data any process can read from the metadata service, it could delete the orchestrator or run up a bill. The worker does hold R2 credentials, because it cannot work without them; `CARTA_WORKER_R2_ACCESS_KEY_ID` and `CARTA_WORKER_R2_SECRET_ACCESS_KEY` let the owner give it a separate token that can be revoked on its own (T047-f). A self-delete would add one more net for the case where the orchestrator is down for longer than a job, and the ceiling plus the hourly sweep already bound that to a few hours at EUR 0.056. `CARTA_WORKER_SELF_DELETE=1` renders the token into the user data for an owner who weighs it differently, and the worker then calls the delete API as its last act.

IPv4 is on for workers by default, unlike T046's orchestrator default. github.com has no IPv6 address (T046's finding), so an IPv6-only worker cannot clone. `--no-ipv4` turns it off and warns.

Git LFS, register row T048-l, which this task closes. The worker never downloads an LFS object. The clone is shallow, blob-filtered and sparse: `pipeline/`, `infra/`, `tools/trailslab/valhalla/` and the root files, 5.0 MB plus 0.34 MB measured with `git ls-tree`. git-lfs is not installed and `GIT_LFS_SKIP_SMUDGE=1` is set anyway. No job reads a tracked LFS cache; every input comes from R2 by prefix. A run costs GitHub about 5 MB instead of a 1.25 GB tree and 613 MB of LFS objects.

The jobs. `selftest` is the cheapest real run: it writes what the box is (architecture, cores, memory, disk, commit) to `archive/built/selftest/`, proving the whole round trip for one started hour. `valhalla_tiles <country>` builds tiles with the same image and switches the trails lab's compose file uses, with `serve_tiles=False` so the scripted image builds and exits, `server_threads` set to the core count, and the tile tar, config, admin database and a SOURCE.txt (extract, sha256, image digest, seconds) promoted to `archive/built/valhalla/<country>/`. `clip_sweep <layer>` extracts T045's layer, embedding and model tarballs at the repo root, runs `pipeline/photos/rescore.py` for each layer in turn, and repacks with `pipeline/archive/pack.py` so the promoted tarballs in `archive/caches/` are byte-for-byte T045's format. Layers run one after another rather than side by side, because `aesthetics.embed()` writes each vector through a fixed `<key>.tmp` name and two processes scoring the same photograph could race on it. `planetiler` and `image_transcode` are stubs that exit 3. No Planetiler profile or consumer exists in the repository and section 5.4 says to leave the basemap alone; `pipeline/photos/derive.py`, the libvips stage, is step 4 of the migration and does not exist. Each stub's header holds the command it will run.

Two things found on the way. PyPI's torch wheels for Linux, aarch64 included, depend on the CUDA 13 runtime (nvidia-cudnn-cu13, nvidia-nccl-cu13 and more, several GB) with a bare `platform_system == "Linux"` marker, so the photo stack installs from the PyTorch CPU index, where `torch 2.13.0+cpu` and `torchvision 0.28.0+cpu` exist for cp312 aarch64; the versions match the laptop. And hcloud 1.69's server object has no `Datacenter` field, so the first draft's `{{.Datacenter.Location.Name}}` would have failed on the first live run; a local stand-in for the Hetzner API caught it and it is now `{{.Location.Name}}`.

The rescore hold stays, as a correctness guard. docs/PHOTOS.md gave two reasons for "rescore after a rebuild, never beside one": a rebuild rewrites the rows a rescore annotates, and CLIP's 2.5 GB did not fit beside a harvest fleet on a 15.6 GB laptop. The second does not apply to a 31 GB box running one job. Nothing in the code arbitrated memory (no script checks free RAM; the stand-down was sessions agreeing with each other), so no memory check had to be removed. The first reason is unchanged, and before this task it was only half enforced: the hold was written by hand, a scheduled rebuild ran unguarded, and nothing stopped a rebuild starting beside a sweep. Two edits outside `infra/` make it hold in both directions. `run_pipeline.py` writes `cache/<layer>/.rescore_hold` for the length of a beaches, lakes or mountains task (leaving an existing hand-written hold and its `released:` line alone) and removes it however the run ends; and it refuses to start one of those tasks while `cache/<layer>/.rescore_running` names a live process on this machine, or one from another machine less than 48 hours old. `pipeline/photos/rescore.py` writes that marker while it runs. spawn.sh refuses to create a worker for a layer held on the orchestrator (exit 5, nothing created), writes the marker for the length of the run, and checks the hold again before promoting (exit 6 if one appeared). On the worker, `clip_sweep.sh` refuses a layer whose tarball carries a hold, because that copy in R2 was packed mid-rebuild. The guard is real today: the laptop's `cache/lakes` and `cache/mountains` both carry holds from the brief 04 and 05 rebuilds, and a dry run of `spawn.sh clip_sweep lakes` against the real checkout refused with the hold's text. Direct runs of `build_lakes.py` and its siblings bypass `run_pipeline.py` and so bypass both files; PHOTOS.md says so.

Cost. `cax41/cost.py` is the one place the rates live: EUR 0.056 an hour, and the EUR 0.60 a month IPv4 pro-rated over 730 hours (EUR 0.000822 an hour). Every ledger line is priced two ways, at wall-clock hours (the architecture document's arithmetic) and at whole started hours (the pessimistic reading of hourly billing), until the first invoice shows which Hetzner uses (T047-e). The ledger is `logs/cax41_runs.tsv` on the orchestrator (run id, job, arguments, created, deleted, wall hours, started hours, IPv4, both costs, outcome, worker exit code), copied to `archive/logs/cax41_runs.tsv` in R2 after every change; `spawn.sh --cost` prints the month so far. It does not feed T043's `public.infra_ledger` directly. That table is keyed by month and line item and written by the owner through `admin_set_infra_cost`, and a computed figure is a model, not an invoice. `cost.py mtd` prints the month's total as a ready `hetzner_cax41` line marked `model`, and the invoice replaces it as `actual`. T043's files were not edited.

T048-h stays open. None of the 28 monthly and quarterly tasks is one of the worker's jobs. Most are network-bound and belong on the orchestrator once verified; the heavy ones (trails_ingest, trails_splice, trails_derive_routes, cycling_harvest) read and write the trailslab PostGIS lab, which lives on neither box, and moving them means a worker job that starts the lab in Docker, restores T045's dump and dumps it back. That is a task of its own.

## Files touched

Code (commit 2d85d3616):

**Created:**
- infra/hetzner/cax41/spawn.sh
- infra/hetzner/cax41/cloud-init.yaml
- infra/hetzner/cax41/cost.py
- infra/hetzner/cax41/verify.sh
- infra/hetzner/cax41/carta-worker-sweep.service
- infra/hetzner/cax41/carta-worker-sweep.timer
- infra/hetzner/cax41/.gitattributes
- infra/hetzner/jobs/jobs.tsv
- infra/hetzner/jobs/jobs_lib.sh
- infra/hetzner/jobs/worker.sh
- infra/hetzner/jobs/selftest.sh
- infra/hetzner/jobs/valhalla_tiles.sh
- infra/hetzner/jobs/clip_sweep.sh
- infra/hetzner/jobs/planetiler.sh
- infra/hetzner/jobs/image_transcode.sh
- infra/hetzner/jobs/requirements-torch-cpu.txt
- infra/hetzner/jobs/requirements-photos.txt
- infra/hetzner/jobs/.gitattributes

**Modified:**
- run_pipeline.py (the hold for the length of a beaches, lakes or mountains task, and the refusal while a rescore marker is live; additions only)
- pipeline/photos/rescore.py (writes `.rescore_running` while it runs; docstring of `held()`)
- docs/PHOTOS.md (the hold on the CAX41, both directions)
- infra/hetzner/README.md (introduction, cost table, the on-demand section, what comes next)

Execution (report commit):

**Created:**
- Execution/P3/T047-on-demand-cax41.md

**Modified:**
- Execution/P3/_OPEN-hetzner.md (steps 17 to 21 appended)
- Execution/_OPEN.md (rows T047-a to T047-l; T048-l closed)

**Deleted:**
- None.

The two pipeline edits are the only changes outside `infra/`, `docs/` and `Execution/`, and each is there because the hold's semantics required it: without the first, a scheduled rebuild is unguarded and nothing refuses a rebuild beside a sweep; without the second, a rescore on the orchestrator or the laptop leaves no trace for the rebuild to see. `infra/hetzner/cron/` (T048) and T043's files were not edited.

## Commands run

From the repo root in Git Bash. `$S` is the session scratchpad under `C:\Users\GEBRUI~1\AppData\Local\Temp\claude\`; nothing was installed outside it. The hcloud 1.69.0 Windows binary and cloud-init 25.2's schema JSON were already in the scratchpad from T046; the zip was re-downloaded and matched the published checksum (76ff326b...).

```
git checkout -b p3-on-demand-cax41                  # from p3-pipeline-cron-migration, stacked

# facts the design rests on
git grep -n rescore_hold; git grep -nE "psutil|virtual_memory|MemAvailable"   # no memory arbitration in code
git lfs ls-files -n                                  # 12 under app_data, 59 under cache; none in the sparse paths
git ls-tree -r -l HEAD pipeline infra tools/trailslab/valhalla   # 5.0 MB
curl -s https://pypi.org/pypi/torch/2.13.0/json      # aarch64 wheel requires nvidia-*-cu13 on Linux
curl -s https://download.pytorch.org/whl/cpu/torch/  # torch-2.13.0+cpu cp312 manylinux_2_28_aarch64 exists
python run_pipeline.py --list                        # 28 monthly and quarterly tasks

# the pipeline edits
python $S/t047/test_hold.py       # marker: none, live, dead pid, foreign 1 h, foreign 50 h; hold take/leave/release: 8 PASS, exit 0
python $S/t047/test_loop.py       # run_pipeline.main() with a fake lakes task: hold present inside the task and gone after; refused while a marker is live: PASS, exit 0
python $S/t047/test_mark.py       # rescore.mark_running writes, leaves another pass's marker, run_pipeline reads it as live: exit 0
python pipeline/photos/rescore.py --help            # imports and parses

# the flow
python infra/hetzner/cax41/cost.py check            # 7 PASS, exit 0
CARTA_PYTHON=python bash infra/hetzner/cax41/spawn.sh --dry-run clip_sweep lakes     # exit 5: the laptop's real lakes hold
CARTA_PYTHON=python bash infra/hetzner/cax41/spawn.sh --dry-run clip_sweep beaches   # exit 0
python $S/t047/fakeapi.py 18765 ... ; $S/hcloud/hcloud.exe --endpoint http://127.0.0.1:18765 server describe ...   # found the Datacenter template error
CARTA_CI_SCHEMA=$S/cloud-init-25.2/cloudinit/config/schemas/schema-cloud-config-v1.json \
CARTA_HCLOUD_BIN=$S/hcloud/hcloud.exe CARTA_VERIFY_PYTHON=python \
  bash infra/hetzner/cax41/verify.sh                 # 97 passed, 0 failed, 0 skipped, exit 0
bash infra/hetzner/cax41/verify.sh                   # 83 passed, 0 failed, 3 skipped, exit 0

git show --stat HEAD                                 # after each commit
```

What verify.sh ran, with its results on the final run. Section 1: `bash -n` on the 9 scripts and on the boot script extracted from the user data, `py_compile` and `cost.py check` (6 h is EUR 0.34 with or without the IPv4 share of EUR 0.0049; 8 h is EUR 0.45; 4, 16 and 30 h match the architecture table; 61 minutes is 2 started hours). Section 2: every job in the table has a script and a sane ceiling. Section 3: user data rendered for all five jobs, 8,261 to 8,278 bytes against Hetzner's 32,768, 0 schema errors against cloud-init 25.2 for the raw template and each render, no placeholder left, secrets redacted, and a CRLF copy of the template still renders LF. Section 4: for every job the dry run prints create, wait, promote, delete and the sweep in that order, with the labels and with IPv4 on; `--no-ipv4`, `--keep`, an unknown job (exit 2) and an unsafe argument (exit 2) behave. Section 5: each job script's dry run exits 0, the two stubs exit 3, `clip_sweep.sh` exits 5 on a tarball carrying a hold, and `worker.sh`'s dry run reports ok for clip_sweep and "failed, phase job, exit 3" for a stub. Section 6, the failure paths with fake `hcloud` and `rclone` first in PATH: a wait whose every describe errors after a successful create (delete issued, exit 1, ledger outcome api-error); SIGTERM mid-wait (delete issued, exit 143, outcome terminated); the ceiling (delete, outcome timeout); a create that errors (delete by name still issued, outcome create-failed); a delete never confirmed (three attempts, exit 7, loud warning, ledger NOT-DELETED); the ok path (promote before delete, exit 0, costed row, ledger pushed to R2); a held layer (exit 5, no create); clip_sweep's marker present during the run and gone after, outputs promoted to `archive/caches`; and the sweep (deletes the worker past its deadline and the finished one, leaves the young one and the kept one, writes two ledger rows). Section 7: every hcloud command spawn.sh prints (create with and without IPv4 and with `--keep`, describe in three formats, delete, list) is parsed by the real hcloud 1.69.0 and then fails to connect to 127.0.0.1:9, 8 of 8. Section 8: the real binary against a local stand-in for the Hetzner API executes the location, status and sweep templates, lists workers by label, deletes, and then reports "Server not found", which the delete confirmation relies on; 6 of 6.

## Config and secrets set

None were set, anywhere. The real run needs, in the orchestrator's `~/.config/carta/env`: `HCLOUD_TOKEN` (already listed in `env.example` for this task), and the three `RCLONE_CONFIG_R2_*` values T045-a creates. Optional new variables, none secret unless noted: `CARTA_WORKER_R2_ACCESS_KEY_ID` and `CARTA_WORKER_R2_SECRET_ACCESS_KEY` (secret; a separate R2 token for workers), `CARTA_WORKER_SELF_DELETE` (default 0), `CARTA_LOCATION`, `CARTA_CEILING_S`, `CARTA_POLL_S` (60), `CARTA_BOOT_WINDOW_S` (1800), `CARTA_KEEP_HOURS` (4), `CARTA_STATE_DIR`, `CARTA_CACHE_DIR`, `CARTA_PYTHON`, `VALHALLA_IMAGE`. The secrets reach the worker only through its user data, rendered into a mode-600 temp file deleted as soon as the create returns, and deleted by Hetzner with the server. The tests used the dummy token `dummy` and fake R2 values against fake binaries only.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Where heavy jobs run | the laptop, 15.6 GB RAM, CLIP about 2.5 GB, PHOTOS.md's stand-down protocol | the laptop still; the CAX41 flow exists as code | none live |
| On-demand boxes spawned | 0 | 0 | 0 |
| CAX41 spend | EUR 0 | EUR 0 | 0 |
| Planned cost per run, from jobs.tsv expected hours with IPv4 (wall-clock / started hours) | none | selftest 0.25 h EUR 0.01 / 0.06; valhalla_tiles 1 h EUR 0.06 / 0.06; clip_sweep 3 h EUR 0.17 / 0.17; planetiler (stub) 2 h EUR 0.11; image_transcode (stub) 6 h EUR 0.34 | new |
| Hard ceiling per job | none | 1, 6, 12, 8 and 8 h | new |
| GitHub download per worker clone | a full clone: 1.25 GB tree plus 613 MB LFS | about 5.3 MB, no LFS | new |
| Worker user data | none | 8,261 to 8,278 bytes of 32,768 | new |
| Directions in which the rescore hold is enforced | one, and only when written by hand | two, and written by run_pipeline.py for scheduled rebuilds | +1 |
| Offline checks | none | 97 passed, 0 failed (83 and 3 skipped without the schema and the hcloud binary) | new |

Not measured, because they need a live box: boot-to-started time, clone and setup time, the duration and peak memory of each job on arm64, the real cost of a run, and whether Hetzner bills wall-clock or started hours.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The location lookup would have failed on the first live run | hcloud 1.69's Server has no `Datacenter` field; `{{.Datacenter.Location.Name}}` errors | `{{.Location.Name}}`; verify.sh section 8 now runs every template against a local stand-in for the API |
| The sweep would misread a worker with a missing label | A space-separated `read` collapses empty fields | Fields joined with `\|` and read with `IFS='\|'`; tested with a label-less server |
| A failed delete could have been recorded as a success | The first draft took any failure of `describe` after the delete as "gone" | Gone only when the output says "not found"; any other failure is a failed attempt, retried, then exit 7 |
| The photo setup would have downloaded several GB of CUDA libraries on every run | PyPI's aarch64 torch requires nvidia-*-cu13 on any Linux | `requirements-torch-cpu.txt` installs `+cpu` builds from the PyTorch CPU index |
| Two layers swept side by side could crash one of them | `aesthetics.embed()` writes through a fixed `<key>.tmp` name | Layers run one after another, each with every core |
| Edits to run_pipeline.py and rescore.py came out with real newlines inside string literals | Bash heredocs strip one level of backslash (known repo gotcha) | Fixed with the Edit tool, checked with `ast.parse` |
| The first verify.sh run wrote a file into the repo | The boot-script extract was written next to the template | Removed; the extract now goes to the temp directory |
| verify.sh flagged a placeholder in every render | Its `@@` grep matched the template's header comment | The same `@@[A-Z0-9_]*@@` pattern spawn.sh uses |

shellcheck is not on PATH on this machine and was not run. There is no systemd-analyze here either; the two unit files follow T048's, which `install.sh` checks on the box, but these are installed by hand in step 17 and were not linted.

## What is still open

The owner steps are in `Execution/P3/_OPEN-hetzner.md`, steps 17 to 21, and each is a register row. Set the worker up on the orchestrator: a second Hetzner token in the secrets file, verify.sh on the box, a dry run, and the sweep timer installed (T047-a, order 44). Optionally give workers their own R2 token first (T047-f). Spawn `selftest` for real and watch the worker appear and disappear, then record its wall hours and cost from the ledger (T047-b, order 45). Interrupt a second selftest with Ctrl-C after the create and see the worker deleted (T047-c, order 46). Run the first heavy job, `valhalla_tiles switzerland`, which is the done condition (T047-d, order 47; it needs T045-c's Geofabrik push). After the invoice, decide wall-clock or started hours and enter the `hetzner_cax41` line in T043's ledger (T047-e, order 48).

For later tasks. The first promoted clip_sweep needs three things first (T047-g): the arm64 CLIP embeddings compared with the laptop's cached x86 vectors, as T006 asked; the photo caches pushed to R2 without a hold (lakes and mountains are held on the laptop today); and a decision on which machine owns each `cache/<layer>` and pulls the promoted tarballs before its next rebuild. The two stubs wait on work that does not exist yet (T047-h). Nothing consumes `archive/built/valhalla` yet (T047-i). The Valhalla image is `latest`, like the compose file, and should be pinned to the digest the first build records (T047-j). `archive/runs/` has no lifecycle rule, so every run's logs and staged outputs stay in R2 until one is added (T047-k). And T048's Sunday reboot window does not know about spawn.sh: a reboot mid-run loses the run, though the trap still deletes the worker (T047-l).

T048-l is closed by this task. T048-h stays open, for the reason given above.

The commit trailer names Claude Opus 5.5, the model that did the work, where the task prompt asked for Claude Fable 5.1.

## Rollback procedure

Nothing live was created or changed, so today there is nothing to roll back outside the repository. Once the owner has run spawns, any worker left behind is removed with the sweep or by hand, on the orchestrator:

```
bash ~/carta/infra/hetzner/cax41/spawn.sh --sweep
hcloud server list --selector role=worker
hcloud server delete <name>                  # for anything still listed
sudo systemctl disable --now carta-worker-sweep.timer
sudo rm /etc/systemd/system/carta-worker-sweep.{service,timer} && sudo systemctl daemon-reload
```

Run outputs in R2 live under `archive/runs/<run>/` and can be deleted with `rclone purge r2:carta/archive/runs/<run>`; promoted outputs replaced the object at the job's prefix, and for `archive/caches/` the previous tarball is recoverable only from the machine that pushed it (`python pipeline/archive/pack.py` and `push.py` from that machine).

In the repository, revert the two commits, newest first, or drop the branch before it is merged:

```
git revert <report commit> 2d85d3616
# or, unmerged:
git checkout p3-pipeline-cron-migration && git branch -D p3-on-demand-cax41
```

Reverting the code commit removes the hold that `run_pipeline.py` writes for layer tasks and the marker `rescore.py` writes, returning the hold to hand-written and one-way. If a revert happens while a layer task or a rescore is running, delete any leftover `cache/<layer>/.rescore_hold` or `.rescore_running` whose second line names this machine and a process that no longer exists. Reverting the report commit restores `Execution/_OPEN.md` (T048-l reopens) and `Execution/P3/_OPEN-hetzner.md`.
