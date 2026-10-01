# T262: the box publishes its data to R2 and remembers its runs

## Task ID

T262

## Date

2026-10-01

## What changed

Stage 4 of `Execution/_OPEN-MASTER.md`, items 6, 7 and the second half of 9:
the three archive and publish gaps between the CAX11's weekly run and
production.

The weekly run now publishes (T054-e). `infra/hetzner/cax11/run_pipeline.sh`
has a step 9 after the archive pushes. When `VITE_DATA_BASE` is set on the
box, the run succeeded and its build was split, it uploads the staged tree with
`node scripts/r2/push-data.mjs --live`. That is phase 1: it adds and replaces
objects and deletes nothing. This is the route `_OPEN-MASTER.md` stage 5
chose for T048-j: the box's output reaches production as R2 data, with no
deploy key and no git push from the box. The step refuses in five cases, each
with a log line. `VITE_DATA_BASE` is unset (the default: a same-origin build
stays on the box). `CARTA_SHIP` is not `build`. The pipeline failed. This run
made no new staged tree: `dist-data/` survives between runs, so `_stage.json`
must be newer than a marker the script touches before the pipeline starts.
Or the tree was staged for a different data base than `VITE_DATA_BASE`. A
failed upload or a base mismatch makes the run exit 3, the same code as a
failed archive step. Phase 2 (`--prune`) never runs here, because it must
follow an app deploy, and the box has no deploy credential (row T262-a).

Mixing an old boot index with new country files was checked before choosing
phase 1 alone. `mergeCatalogue` (`continent-app/src/lib/bootIndex.js`) takes
each destination whole from the country file named by the old boot row. It
skips ids the old index does not list and counts listed ids it cannot find.
Because phase 1 deletes nothing, every file the live index names still
exists. The live site therefore serves the new detail of the destinations it
already knows. New destinations wait for the next app deploy.

The box remembers its runs (T048-k). `logs/pipeline_state.json` is a new
manifest class, `pipeline-state` (`archive/state/pipeline_state.json`, no
lifecycle rule). `run_pipeline.sh` pulls it when the box has none and pushes
it with the master, only after a good run, so R2 never holds a state that
claims work the R2 master lacks. Before, a rebuilt box started with every
task due.

Worker staging expires (T047-k). `archive/runs/` is a new manifest class,
`worker-runs`, of a new kind `run-staging` with a 14-day lifecycle. `push.py`
skips it on push and pull with a message, and `push.py --lifecycle` now adds a
third rule, `carta-archive-runs-expire-14d`, beside the existing 60-day and
30-day ones. Fourteen days leaves time to promote a run that `spawn.sh` held
back and to read a failed run's logs; `spawn.sh` copies those to
`logs/cax41/<run>` anyway. `pack.py` reads only `derived-cache` classes, so it
is unaffected.

`env.example` gained `VITE_DATA_BASE` with when to set it.
`_OPEN-MASTER.md` 5.2 now expects three lifecycle rules, and 7.3 says when to
fill `VITE_DATA_BASE`. `docs/PIPELINE.md`'s Linux host paragraph describes
the state file and the publish step.

## Files touched

**Modified:**
- infra/hetzner/cax11/run_pipeline.sh
- infra/hetzner/cax11/env.example
- pipeline/archive/manifest.yml
- pipeline/archive/push.py
- docs/PIPELINE.md
- Execution/_OPEN-MASTER.md (5.2 lifecycle check, 7.3 secrets)
- Execution/_OPEN.md (T048-k, T047-k, T054-e closed; T262-a added)

**Created:**
- Execution/P3/T262-box-publishes-to-r2.md

## Commands run

```
bash -n infra/hetzner/cax11/run_pipeline.sh
python pipeline/archive/push.py --lifecycle --dry-run        # three rules: db 30, runs 14, snapshots 60
python pipeline/archive/push.py --dry-run --only pipeline-state
python pipeline/archive/push.py --pull --dry-run --only pipeline-state
python pipeline/archive/push.py --dry-run --only worker-runs  # skipped with a message
python pipeline/archive/push.py --pull --dry-run --only worker-runs
python pipeline/archive/pack.py --dry-run                     # unchanged
bash t262_harness.sh                                          # 17 passed, 0 failed
```

`t262_harness.sh` (session scratchpad; no test file is in scope) builds a fake
repo around copies of `run_pipeline.sh` and `load-env.sh`, with shims for
python, node, rclone and flock that log their calls. It checks:

- a good split run pulls the missing state, pushes it, publishes with
  `--live` after the master push, and never prunes;
- a failed run pushes snapshots only, publishes nothing, and exits 1;
- with no `VITE_DATA_BASE`, nothing is published and the run exits 0;
- a stale staged tree from an earlier run is not re-sent;
- a staged base mismatch, or a failing `push-data`, exits 3;
- with no R2 credentials, nothing is sent and the run exits 0;
- `--dry-run` prints the publish command and sends nothing;
- a state file already on the box is not pulled over.

Nothing touched R2: this machine has no R2 credentials.

## Config and secrets set

None set. One new variable on the box, `VITE_DATA_BASE`, blank in
`env.example`, to be filled after the stage 5 cutover.

## Before/after measurements

Not measured. Nothing ran against R2 or on the box.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first harness run failed 13 of 17 | The fake repo had no `run_pipeline.py`, so the script exited 5 (environment broken) before doing anything | Harness creates an empty one; 17 of 17 |

## What is still open

The app deploy (row T262-a, owner). After each good week the box puts new
data in R2. But the boot index and the app shell live on the app host and
change only with an app deploy, and phase 2 (`--prune`) must come after that
deploy. Until a deploy happens, destinations the pipeline adds stay invisible,
and objects the new build no longer has stay in R2. The choice is whether the
box gets a Pages deploy token after stage 6, so it can deploy and then prune
by itself, or whether "deploy, then `push-data.mjs --live --prune`" stays a
hand step after a run. T048-j remains the owner's row to close: stage 5's
decision is now built, and closing it is the owner's call.

## Rollback procedure

```
git revert <this task's commit>
```

On the box, a revert stops step 9 and the state push and pull. Objects
already in R2 stay and are harmless. `archive/state/pipeline_state.json` can
be deleted by hand. The 14-day rule, if `push.py --lifecycle` was run, is
removed with `npx wrangler r2 bucket lifecycle remove carta
carta-archive-runs-expire-14d`. To stop publishing without a revert, blank
`VITE_DATA_BASE` in `~/.config/carta/env`.
