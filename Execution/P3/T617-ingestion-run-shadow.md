# T617: the ingestion collectors can run again

## Task ID

T617

## Date

2026-10-23

## What changed

The weekly `ingestion` task (the raw open-data mirror, `python -m src.ingestion.run_all`) had crashed on its first collector since 2026-10-01 with `TypeError: 'Run' object is not callable`. T078 made `register()` in `src/ingestion/core/registry.py` store each collector's cadence record as `cls.run`, which is also the name of `Collector.run()`, so the record replaced the method on every registered class. Nobody saw it because the laptop's scheduled task was switched off on 2026-10-02 (T298). The Hetzner box found it on its first verification run of the step (stage 7.6 of `Execution/_OPEN-MASTER.md`). The record now lives at `cls.schedule`, the one reader in `run_all --list` follows it, and the governance test also asserts that `cls.run` is still callable, so the shadowing cannot come back silently.

## Files touched

**Modified:**
- src/ingestion/core/registry.py (`cls.schedule = RUNS[cls.name]`, with a comment on why not `cls.run`)
- src/ingestion/run_all.py (`_print_roster` reads `cls.schedule`)
- tests/test_data_licences.py (asserts `cls.schedule is RUNS[name]` and `callable(cls.run)`)
- Execution/_OPEN.md (rows T617-a, T617-b)

**Created:**
- Execution/P3/T617-ingestion-run-shadow.md

## Commands run

```
git worktree add -b p3-ingestion-run-shadow ../wt/t617 main
python -m pytest -q tests/test_data_licences.py
python -m src.ingestion.run_all --list
python -c "... next(iter(REGISTRY.items())) ... callable(c().run)"
```

On the box (stage 7.6, before the fix): `bash infra/hetzner/cax11/verify_tasks.sh ingestion` failed in 6 s with the traceback above; `country_context` (24 s) and `image_audit` (1,104 s) passed.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Collectors callable through `run_all` | 0 | all registered | fixed |
| tests/test_data_licences.py failures | 3 | 3 | 0 (the same three, see T617-a) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `ingestion` crashed on the first collector | `cls.run = RUNS[...]` shadowed `Collector.run()` (T078) | Record moved to `cls.schedule` |

## What is still open

Three tests in `tests/test_data_licences.py` fail on `main` with and without this change: `pipeline/stays/calibrate_live.py` is a harvester with no `RUNS` entry or licence row, so `validate()` and the rendered ledger disagree (T617-a). The fix belongs to whoever owns the stay-price calibration, not here.

The box verifies `ingestion` again only once this branch is on `main` and pushed, because the box clones GitHub `main` (T617-b).

## Rollback procedure

`git revert <this commit>`. That brings back the crash, so only do it together with a different fix for the shadowing.
