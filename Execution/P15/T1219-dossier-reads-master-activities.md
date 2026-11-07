# T1219: the dossier reads its things to do from the master, so it runs again (ROADMAP A3, explore data fill)

## Date

2026-11-07

## What changed

The weekly dossier task never ran on the box: its guard in `run_pipeline.py` refused while `continent-app/public/activities_full.json` was missing. That file is gone for good. `continent-app/scripts/sync-data.mjs` now writes one shard per destination to `public/poi/` (without the `rate` field, which the app derives on load) and deletes the combined file on every wire build. The dossier ranks things to do on `rate`, so the shards are not a drop-in.

The fix reads the lists where `sync-data.mjs` cuts them from: the master `app_data/app_data.json`, `destinations[id].activities.items_full`, which still carries `rate`.

- `pipeline/dossier/common.py`: new `load_activities_full()`. A leftover combined file still wins (an older checkout keeps working); otherwise it reads the master; neither returns `{}`.
- `pipeline/dossier/build_dossier.py` (`load_context`) and `pipeline/dossier/web_sweep.py` use it instead of reading the combined file.
- `run_pipeline.py` `guard_dossier`: passes when either the combined file or the master is on disk.

Found by the owner-requested dry run on the box for the explore data step (`Execution/P15/_OPEN-explore-data-runs.md`, step 6), output in `~/dry-2026-11-07.out` on the box.

## Files touched

- `pipeline/dossier/common.py`
- `pipeline/dossier/build_dossier.py`
- `pipeline/dossier/web_sweep.py`
- `run_pipeline.py`
- `Execution/P15/T1219-dossier-reads-master-activities.md` (this report)

## Commands run

- `python -m ruff check` on the four files: the same three findings as unchanged main (F841 `lat`/`lon` in build_dossier, F401 `re` in web_sweep), none new.
- `python -I -m py_compile` on the four files: ok.
- `python -m pytest -q tests/test_pipeline_code_fixes.py`: 47 passed.
- `load_activities_full()` against the laptop master (140 MB, 2026-11-03) with no combined file: see measurements.
- On the box, before the fix: `CARTA_AUTO_UPDATE=0 CARTA_PIPELINE_ENABLED=1 bash infra/hetzner/cax11/weekly.sh --dry-run`, exit 0, dossier guard refused.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Dossier guard on the box | refuses (activities_full.json missing) | passes (master on disk) | runs |
| Destinations with a things-to-do list the dossier sees | 0 | 3,865 (equals the 3,865 shards in public/poi/) | +3,865 |
| POI items loaded | 0 | 157,775, every one with `rate`; 11,161 at rate 3 | +157,775 |
| Load time, laptop | n/a | 12.9 s | |
| Peak Python memory of the load | n/a | 1,265 MB (box has about 3.2 GB available) | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Loader test failed on import in the sparse worktree | `common.py` reads `supabase/functions/_shared/blocked_domains.json` at import | added that folder to the worktree's sparse set; not a code problem |

## Screens checked

None: the dossier is pipeline output. The real check is Monday's box run: the run log should show the dossier task started, not refused, and `public/dossier/` should be rewritten.

## What is still open

- T1219-a: check after the box run of Mon 2026-11-09 that the dossier task ran (run log, `pipeline_runs` row) and how long it took; the --also list is about 28 h against a 16 h cap, so the dossier may start a week later.
- `pipeline/normalize_poi_kinds.py` still lists `public/activities_full.json` as a target. Harmless: it skips a missing file and also normalises the master, which is now the dossier's source. No row.

## Rollback procedure

`git revert` of the T1219 commit. The dossier guard then refuses again on every machine without the combined file.
