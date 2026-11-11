# T1223: derived routes fit the 4 GB box (D24, H9)

## Date

2026-11-11

## What changed

`trails_derive_routes` (pipeline/trails/derive_routes.py) no longer runs the box out of memory. On 2026-11-11 at 07:20 the kernel killed it on Spain at 3.35 GB on the 3.7 GB box. systemd's default `OOMPolicy=stop` then ended the whole catch-up run, so nothing shipped. 38 of 44 countries had finished; Spain, France, Germany, Italy, Great Britain and Poland had not.

There were two causes:

1. Every walkable way was held as separate Python objects: one numpy array and one tag dict per way, plus per-way dicts for the endpoint graph and the folded names.
2. osmium's `IdFilter` keeps a bitmap over the span of the ids it is given, so one country's node ids cost about 1.6 GB however many there are.

The ways now live in `pipeline/trails/way_store.py`:

- Node refs are stored as int32 positions into the sorted unique node ids.
- Tag sets are interned, and anything computed from tags is computed once per tag set.
- The endpoint graph is a sorted index.
- Coordinates are aligned with the node ids.

Locations load in passes over id slices, each capped at `CARTA_DERIVE_IDSET_MB` (400).

**Results.** On five real Geofabrik extracts, the new code's records and counts are identical to the old code's. Peak memory fell 56 to 72 percent (Albania 1,934 to 559 MB). Slovenia, the biggest checked (314 MB), went from 2,240 to 616 MB.

**Runs.**
- Each country now runs in its own child process and prints its peak memory, so an out-of-memory kill costs that country, not the sweep.
- The task passes `--fresh-days 14`, so a rerun after a crash skips the countries it finished.
- On Linux, a country whose extract would need more memory than the machine has left is not started. That makes the task soft-fail with a message instead of being killed.
- The three run units set `OOMPolicy=continue`, so a killed task is a soft failure and the run still ships. This was applied on the box by hand on 2026-11-11, and the repo units now carry it.

## Research

None chosen. This changes how the existing method stores its data and adds no tool, library or service. The `IdFilter` cost was measured instead of assumed, with pyosmium 4.3.1 on Windows:

| Input | Memory |
|---|---|
| 1,000 ids over a span of 1e8 | 12.6 MB |
| 1,000 ids over a span of 1e9 | 130 MB |
| 30 M ids over the whole node id range | 1,630 MB |
| 600 k ids inside one range of 4 M | 4 MB |

So the cost follows the span, not the count, wherever the span starts. That is why the passes slice by id span.

## Files touched

- Created:
  - `pipeline/trails/way_store.py`
  - `tests/test_trail_derive_memory.py`
  - `Execution/P15/T1223-derive-routes-memory.md`
- Modified:
  - `pipeline/trails/derive_routes.py`: the scan uses the store, lengths go in an array, and `cluster()` uses `EndIndex` and `PerTagSet`. `main()` now has child processes, `--fresh-days`, `--in-process`, `--no-preflight`, the preflight and the peak memory line.
  - `pipeline/tasks/trails.py`: the task passes `--fresh-days 14`.
  - `tests/fixtures/pipeline_tasks.json`
  - `infra/hetzner/cron/carta-weekly.service`, `carta-monthly.service`, `carta-quarterly.service`: `OOMPolicy=continue`.
  - `docs/HANDBOOK.md`: Trails, point 2, a memory bullet.
  - `ROADMAP.md`: D24 status.
  - `Execution/_OPEN.md`

## Commands run

```
# on the box, 2026-11-11 (before this branch)
sudo tee /etc/systemd/system/carta-{weekly,monthly,quarterly}.service.d/oom.conf   # [Service] OOMPolicy=continue
sudo systemctl daemon-reload
sudo systemd-run --unit=carta-catchup-3 ... -p OOMPolicy=continue ... weekly.sh   # CARTA_TIER=quarterly

# equivalence and memory, laptop (scratchpad scripts, not committed)
python derive_compare.py <old checkout|new worktree> <country>-latest.osm.pbf out.json
python -m pytest -q tests/test_trail_derive_memory.py tests/test_trail_recover_walks.py tests/test_box_schedule.py
```

## Config and secrets set

- New optional environment keys, not set anywhere:
  - `CARTA_DERIVE_IDSET_MB` (default 400): the bitmap cap for one location pass.
  - `CARTA_DERIVE_MB_PER_EXTRACT_MB` (default 0.6): the preflight's peak memory per MB of extract, on top of `BASE_MB` (100 plus the bitmap cap). Slovenia measured about 0.5 above that base.
- On the box: drop-ins `/etc/systemd/system/carta-{weekly,monthly,quarterly}.service.d/oom.conf` with `OOMPolicy=continue`. They duplicate the repo units once `install.sh` runs again, which is harmless.

## Before/after measurements

Peak memory (Windows peak working set) and time for `derive_extract` on Geofabrik extracts of 2026-11-11, old code (main at 2a2379d44e) against this branch. Records and counts were compared as JSON.

| Extract | Size | Peak before | Peak after | Time before | Time after | Records identical |
|---|---|---|---|---|---|---|
| Liechtenstein | 3.5 MB | 1,047 MB | 459 MB | 12 s | 8 s | yes (42) |
| Malta | 9 MB | 1,502 MB | 513 MB | 5 s | 6 s | yes (1) |
| Luxembourg | 48 MB | 1,936 MB | 537 MB | 37 s | 51 s | yes (58) |
| Albania | 54 MB | 1,934 MB | 559 MB | 46 s | 58 s | yes (362) |
| Slovenia | 314 MB | 2,240 MB | 616 MB | 91 s | 144 s | yes (671) |

The box: catch-up 2 was killed at 3.35 GB resident on Spain. The Spain figure after this change comes from the next box run; each child prints `peak memory ... MB per MB`. A run is up to about 60 percent slower (Slovenia 91 to 144 s), because locations are read in several passes. That is minutes per country on a quarterly task. Spain, the largest on the box so far, scanned in 182 s before.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Catch-up 2 was killed overnight with nothing shipped | `trails_derive_routes` reached 3.35 GB on Spain; systemd `OOMPolicy=stop` ended the whole unit for one soft task | `OOMPolicy=continue` on the units and the box; the compact store; a child process per country |
| The first version used more memory on Liechtenstein than the old code (1,283 MB) | Passes were sized by touched 4 M id chunks, but `IdFilter`'s bitmap covers the whole span of its ids | Passes are sized by id span (budget times 8 M ids) |
| The first version took over 15 minutes on Slovenia (91 s before) | `keys_by_rule or {}` in `_grow` called `len()` on the sparse base-name map, a walk over every way, on every call; and `EndIndex.get` searched an int32 array with a Python int, so numpy cast the whole array on every call | The count is cached and `__bool__` added; the search uses `np.int32` |

## Screens checked

None. Pipeline and box only.

## What is still open

- T1223-a: the box measurement. The next quarterly run, or a hand run of `trails_derive_routes` once catch-up 3 is done, prints each country's peak. Spain, France and Germany set the real `CARTA_DERIVE_MB_PER_EXTRACT_MB`; the 0.6 default is from Slovenia and smaller. If Germany or France still do not fit in 3.7 GB plus 2 GB swap, the preflight skips them with a message, and the choice is the owner's: a bigger box, more swap on the volume, or splitting those two by Geofabrik region.
- T1223-b: `ingest_osm_routes.load_locations` still makes one `IdFilter` over all the ids, which is the same 1.6 GB bitmap. `trails_ingest` finished on the box for every country in catch-up 2, so it fits today. It could use `way_store.load_aligned_locations` the same way.

## Rollback procedure

`git revert` this task's commit. It is code only: no data, schema or wire change, and the derived routes are the same rows. To undo the box drop-ins: `sudo rm /etc/systemd/system/carta-{weekly,monthly,quarterly}.service.d/oom.conf && sudo systemctl daemon-reload`.
