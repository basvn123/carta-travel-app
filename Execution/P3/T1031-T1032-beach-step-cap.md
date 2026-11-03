# T1031 to T1032: the beach step can no longer hold a Monday run for days

Batch of two tasks on branch `p3-beach-step-cap` (root repo; no app change), 2026-11-03. Owner request: let run 2 finish everything, and fix what made it slow. T1033 was reserved and not used.

Shared context. Run 2 started on 2026-11-02 09:00. By 2026-11-03 10:00 the weekly tasks, `airports` (fixed by T740), `climate_daily` and a capped `sea_temp` were done, and `beach_context` had run 16.5 hours: `enrich_beaches.py` re-asks Overpass for every beach whose context predates `CONTEXT_V` 2, the public Overpass mirrors kept refusing or timing out (357 retries), and Spain alone had taken 7 hours for 612 of 2,124 beaches, saved only when the country finishes. The run's own `--max-hours 16` only stops new `--also` tasks, never a running one, so the build, publish and archive at the end of the run waited behind it.

Done on the box in the same session, outside the repository: a temporary drop-in `/etc/systemd/system/carta-weekly.service.d/run2-timeout.conf` with `TimeoutStartSec=167h`, because the unit's 48 h (2 d) would have killed run 2 at 2026-11-04 09:00:16; `systemctl show` read `6d 23h` after `daemon-reload`. `~/drop_timeout_override.sh` removes the drop-in when the service stops and logs it in `~/logs/weekly.log`. `~/move_to_main.sh` (T994-a, armed 2026-11-02) still waits to move the clone to main after the run. On the laptop, C: had 4 MB free; with the owner's approval the finished worktrees `wt/t617` and `wt/t992` (both merged and pushed, no junctions inside) and the T992 test builds were removed, leaving 6.1 GB.

Checks: both files parse; `tests/test_pipeline_code_fixes.py` 46 of 47 pass, and the one failure fails identically on unchanged main (T1032-a); `run_pipeline.py --list` still lists `beach_context`; a harness with a fake two-country catalogue and a stubbed Overpass call (below). Nothing a traveller sees changed, so no browser check. The new code first runs on the box at the first Monday after T994-a has moved it to main.

---

## T1031: checkpoints and a time budget in enrich_beaches

### Task ID

T1031

### Date

2026-11-03

### What changed

Steps 4 to 6 of `enrich_country` (region ids, aspect, protection) and the save moved into one inner function, `finish()`. The Overpass loop calls it every `CHECKPOINT_BATCHES` (10) batches, so a country is saved every 120 beaches instead of once at the end, and every saved file is complete row for row. A beach not reached yet keeps its old context at the old `context_v`, so `stale()` asks for it again on the next run. `--max-hours` sets a deadline: past it no new Overpass batch and no new country starts, the current country is saved, the script prints which countries were not started and exits 3. Without the flag nothing changes.

### Files touched

**Modified:**
- pipeline/beaches/enrich_beaches.py

### Commands run

A harness (scratchpad, not committed) that stubs `load_cache`, `save_cache`, `context_for` (50 ms per batch) and the local joins, with two countries of 100 beaches whose cached context is at `context_v` 1 and `CHECKPOINT_BATCHES` 3:

```
python t1031_harness.py            # --max-hours 0.25 s
python t1031_harness_nolimit.py    # --max-hours 0
```

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Harness, time-limited: saves of country AA | 1 at the end | at 36 (checkpoint) and 60 (deadline) | |
| Harness, time-limited: country BB | enriched | not started, exit 3 | |
| Harness, no limit: rows at the new version | 100 + 100 | 100 + 100, exit 0 | none |
| Beaches saved between two saves, live | a whole country (Spain 2,124) | 120 | |

### What broke and how it was fixed

No issues.

### What is still open

The whole-Europe `CONTEXT_V` 2 refresh now advances six hours a week; at run 2's pace that is several Mondays, and `beach_context` shows INCOMPLETE until it is through (T1031-a).

### Rollback procedure

`git revert` the T1031 commit (revert T1032 first, or `beach_context` passes a flag the old script refuses).

---

## T1032: a task can end incomplete and still ship

### Task ID

T1032

### Date

2026-11-03

### What changed

`run_pipeline.py` stopped a task's command list at the first non-zero exit, so a capped `enrich_beaches` would also have skipped the walks and the export and this week's part would never reach the app. A task may now name `partial_rc`: a command exiting with it is logged as "stopped incomplete", the task's remaining commands still run, and the task ends INCOMPLETE (listed with the soft failures, no `last_success`), so it stays due. `beach_context` runs `enrich_beaches.py --max-hours 6` with `partial_rc` 3. Any other failing exit behaves as before.

### Files touched

**Modified:**
- run_pipeline.py (the cmd loop, the INCOMPLETE branch, `beach_context`)

### Commands run

```
python -m pytest -q tests/test_pipeline_code_fixes.py
python run_pipeline.py --list
```

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Longest `beach_context` enrich in one run | unbounded (16.5 h and counting on run 2) | 6 h plus the batch in flight | |

### What broke and how it was fixed

No issues.

### What is still open

`tests/test_pipeline_code_fixes.py::test_photo_sources_follows_the_exports` expects `photo_sources` to be the last task, but `trailslab_worker` (T647) was added after it; it fails on main without this change (T1032-a).

### Rollback procedure

`git revert` the T1032 commit.
