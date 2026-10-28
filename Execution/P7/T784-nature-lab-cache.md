# T784: the rating chain runs without the trails lab

## Task ID

T784

## Date

2026-10-28

## What changed

`pipeline/nature_tiers.py` read the trail and cycling lab rows from the trails lab (PostGIS in Docker on the laptop, port 5433) on every run, so a rating re-score failed whenever Docker was down and anyone running the chain had to start Docker Desktop. The owner asked for the pipeline to be independent of it (2026-10-28, during T782). Now every read from the lab is also written to `cache/nature/trails_lab_rows.json` and `cache/nature/cycling_lab_rows.json`; when the lab cannot be reached, `lab_rows()` reads that file instead, as long as it holds every id asked for, and prints that it did. A missing or short cache still stops the run with a message, so a stale file can never stand in for rows it does not have.

Measured: `python pipeline/nature_tiers.py --check` with the lab up and again with the container stopped gives the same five lines ("wire matches frozen: True; remeasured breakpoints identical: True" for trails, beaches, lakes, mountains and cycling). The cache is 64.4 MB (trails, 17,404 rows) and 5.7 MB (cycling, 513 rows); like the rest of `cache/`, it is not committed.

The trails lab itself stays on the laptop: the Hetzner box has no PostgreSQL server and no Docker, 4 GB of memory and 9.8 GB of free disk, and the lab's dump is 4.9 GB compressed. Moving it to a worker is owner decision D5 (2026-10-22), not done here.

## Files touched

**Modified:**
- `pipeline/nature_tiers.py` (`lab_rows`, with `_plain` and `LAB_CACHE`)

## Commands run

```
python pipeline/nature_tiers.py --check          # lab up: writes the cache
docker stop trailslab-db
python pipeline/nature_tiers.py --check          # lab down: reads the cache, same output
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `nature_tiers.py --check` with the lab down | fails (connection timeout) | passes, same output as with the lab up | fixed |

## What broke and how it was fixed

No issues.

## What is still open

- **T784-a (owner).** The trails lab still lives in Docker on the laptop; scripts under `pipeline/trails/` that build or validate trails need it. Moving it to a worker is decision D5 (2026-10-22), waiting on stage 8. The rating chain no longer needs it once the cache exists.

## Rollback procedure

`git revert` the T784 commit; delete `cache/nature/*_lab_rows.json` if wanted.
