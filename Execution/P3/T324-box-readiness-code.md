# T324 box readiness code before stage 7

## Task ID

T324 (branch p3-box-readiness-2; the name p3-box-readiness was taken by T298). Register rows T218-c, T300-f, T269-c, T047-h.

## Date

2026-10-03

## What changed

Four small changes in the code the owner will put on the Hetzner boxes, none of which changes an interface the boot path uses. First, weekly.sh now pings the heartbeat URL with /fail when run_pipeline.sh returns any non-zero exit, so an exit 3 (pipeline ok, R2 archive or publish failed) is no longer silent (T218-c). Second, jobs/image_transcode.sh accepts the eight wire layers derive.py reads (trails, cycling, region, dossier, poi, dest, trips, journeys) with no tarball, passes --recheck in the first seven days of a UTC month, and runs derive.py gc as a dry run at the end (T269-c). worker.sh needed one matching change: it failed a job with exit 91 when the mirrored inputs were empty, which is the normal case for a wire layer. Third, the trailslab compose file now points at a multi-arch PostGIS and pgRouting image pinned by digest, and _landcover_big.sh counts running extract passes with pgrep where pgrep exists and keeps the PowerShell query where it does not (T300-f). run_pipeline.py's pgrep use was already removed by T048 (its POSIX guard reads ps), so nothing was needed there, and it is outside this task's scope anyway. Fourth, the planetiler stub stays: the decision and its reason are in its header and the README (T047-h).

## Files touched

**Modified:**
- infra/hetzner/cax11/weekly.sh
- infra/hetzner/jobs/image_transcode.sh
- infra/hetzner/jobs/worker.sh
- infra/hetzner/jobs/planetiler.sh (comment only)
- infra/hetzner/README.md (two lines)
- pipeline/cycling/_landcover_big.sh
- tools/trailslab/docker-compose.yml
- Execution/_OPEN.md (four rows closed, three added)

**Created:**
- Execution/P3/T324-box-readiness-code.md

Not touched: cloud-init.yaml, verify.sh, verify_tasks.sh, the systemd units, jobs.tsv, spawn.sh, load-env.sh, run_pipeline.sh, run_pipeline.py.

## Commands run

bash -n on every script touched (weekly.sh, image_transcode.sh, worker.sh, planetiler.sh, _landcover_big.sh): all clean. shellcheck is not installed on this machine, so it was not run.

A stub test of weekly.sh in a temp directory with a fake run_pipeline.sh and a fake curl on PATH: exit 3 pings the heartbeat URL plus /fail once (a trailing slash is handled), appends "heartbeat /fail sent" to weekly.log and still exits 3; exit 0 sends no ping; a failing curl logs "could not be sent" and still exits 3. No real URL was called.

CARTA_JOB_DRY_RUN=1 runs of image_transcode.sh in a temp tree: beaches (tar extract, selfcheck, derive run with --recheck when forced, gc dry run at the end), trails with cycling (no tarball line, two derive runs, one gc), an unknown layer (exit 2), --recheck given after -- (passed once, not doubled), CARTA_DERIVE_RECHECK=0 (never passed). Today is the 3rd, so auto passed it.

A read-only registry lookup of imresamu/postgis (manifest list for the tag, tag list on Docker Hub). No Hetzner, R2 or healthchecks call.

## Config and secrets set

None. New optional variables read by the job: CARTA_DERIVE_RECHECK (auto by default; 1 or 0) and CARTA_JOB_SKIP_GC (any value skips the gc step). New optional variable for compose: TRAILSLAB_IMAGE. CARTA_HEARTBEAT_URL is read by weekly.sh as before (env.example already lists it).

## Before/after measurements

Not measured. No number moved. The image facts come from the registry: tag 17-3.5-bundle0-bookworm resolves to the digest T006 recorded (sha256:a8ea1a9b..., Execution/P0/T006-arm64-coverage-audit.md) and lists linux/amd64 and linux/arm64. The old pgrouting/pgrouting:17-3.5-3.7 is amd64 only (same report).

## What a box operator will notice

1. weekly.sh: on any non-zero exit it now sends /fail to CARTA_HEARTBEAT_URL and writes one more line to weekly.log. Exit 75 (another run holds the lock) now also alerts. Without the variable nothing changes. A failed ping never changes the exit code.
2. image_transcode: new layer names are accepted. A wire layer prints "is a wire layer: no tarball" and skips the tar extract and the hold check. An unknown layer still exits 2, with a longer message.
3. image_transcode: in the first seven days of a UTC month, derive.py run gets --recheck, so those runs make one extra Commons request per 50 held titles. CARTA_DERIVE_RECHECK=0 turns it off, 1 forces it, and an explicit --recheck after -- wins.
4. image_transcode: after the last layer it copies img/manifest again, lists all of img/ once more (about as slow as the existing listing) and runs derive.py gc without --apply, leaving gc-plan.json and the two lists in out/gc/. The worker pushes them with the rest of out/. Nothing is deleted. A gc failure or refusal is logged and does not change the job's exit code. CARTA_JOB_SKIP_GC=1 skips the step.
5. worker.sh: for image_transcode with only wire layers, empty inputs no longer end the run with exit 91. Any cache layer among the arguments keeps the old check, and every other job is unchanged.
6. Trailslab compose: a fresh docker compose up now pulls imresamu/postgis (bundle0) instead of pgrouting/pgrouting. See the laptop warning below.
7. _landcover_big.sh: on Git Bash for Windows (no pgrep) behaviour is identical. On Linux it uses pgrep -f with a regex anchored on a python command line, so the script itself is not counted.
8. planetiler: no behaviour change.

The laptop warning for item 6. The existing trailslab_pgdata volume has pgRouting recorded at the old extension version. The new image may ship a newer pgRouting, and the lab's only pgRouting call is the version check in smoke_test.py. After a swap, run ALTER EXTENSION pgrouting UPDATE once in the lab database, or keep the old image with TRAILSLAB_IMAGE=pgrouting/pgrouting:17-3.5-3.7. I did not start the lab (port 5433 is off limits) and did not run the smoke test; that is row T324-a.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| My first edits wrote CRLF line endings and collapsed some backslashes | Python text mode on Windows, and escape handling in the tool input | Re-wrote the affected lines, converted back to LF (git ls-files --eol shows w/lf), re-ran bash -n and the stub tests |
| A dry run of image_transcode.sh failed at cd | My temp repo directory did not exist; the script has always assumed the repo exists | Test setup only, no script change |

## What is still open

T324-a: the multi-arch lab image is untested on arm64 and the laptop volume needs ALTER EXTENSION before a swap (owner, after the box exists). T324-b: other Windows-only helpers (mountains run_v2 shell scripts, the ps1 drivers, the Docker Desktop path in the trailslab README) are untouched; they matter only when the data lane moves to the box. T324-c: a wire layer derives nothing until its sources file is in R2 (T269-a), and the first live wire run, the recheck cadence and the gc dry-run plan need an owner look.

## Rollback procedure

git revert the T324 commit (or reset the branch). Nothing was deployed, provisioned or run against a real service, so there is no state to undo. A box that already booted from cloud-init keeps its clone until it pulls; reverting restores the previous weekly.sh and jobs.
