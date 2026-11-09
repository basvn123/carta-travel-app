# T1221: the flight route list uploads with rclone on the box

Roadmap item **H9** (every pipeline task on a box schedule, T1107). Branch `p15-routes-upload`.

## Date

2026-11-09

## What changed

The first box runs of the monthly tier failed on `flight_routes`, and a failed task stops a run before its ship. Both runs, the quarterly catch-up that started on 2026-11-07 at 23:57 and the queued `carta-catchup-lab` run, therefore built their data and published none of it. The cause: `pipeline/flights/build_routes.py --upload` put `_routes.json` on R2 with `npx wrangler r2 object put`. Wrangler authenticates with the box's `CLOUDFLARE_API_TOKEN`, a Pages deploy token without R2 object write, so Cloudflare answered `403 Authentication error` (code 10000). The route list was built correctly; only the upload failed.

`build_routes.py` now uploads with `rclone copyto <file> r2:carta/data/flights/_routes.json` when rclone has an `r2` remote. The box defines that remote through the `RCLONE_CONFIG_R2_*` variables of its secrets file and already writes its backups and archive with it. Wrangler stays the fallback on a machine without an rclone `r2` remote, so the laptop path is unchanged. The R2 key, the content type (`application/json`) and the build are unchanged.

## Research

None: no tool was chosen. rclone with the R2 S3 keys is what the box already uses for every other R2 write (archive, backups, status files).

## Files touched

- Modified: `pipeline/flights/build_routes.py` (`rclone_r2()`, `upload()`, `import os`).
- Created: this report.

## Commands run

```bash
python -m ruff check pipeline/flights/build_routes.py                          # clean
python -m pytest -q tests/test_famous_registry_superroute.py tests/test_trail_route_bridge.py   # 29 passed
# on the box, secrets loaded:
[ -n "$RCLONE_CONFIG_R2_TYPE" ]                                                  # set, so rclone_r2() is True
rclone copyto --dry-run data/flights/_routes.json r2:carta/data/flights/_routes.json --s3-no-check-bucket \
  --header-upload "Content-Type: application/json"                               # rc 0
```

## Config and secrets set

None. The box's `CLOUDFLARE_API_TOKEN` keeps its Pages scope; R2 writes go through the existing rclone keys.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `flight_routes` on the box | FAILED in both runs (55 s, 46 s), run stopped before ship | upload path checked with a dry run (rc 0); first real run is the next monthly or catch-up run | not measured yet |
| Box runs that shipped since T1107 | 0 of 2 | to be read in `r2:carta/status/last_run.json` after the next run | not measured yet |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two box runs built and did not ship | `flight_routes` upload: wrangler with a token without R2 write, 403 | rclone first in `build_routes.py` |

## Screens checked

None: no traveller-facing change.

## What is still open

Nothing. `git grep "wrangler.*r2"` finds only `continent-app/scripts/r2/provision.sh`, the one-time bucket setup run from the laptop; no other pipeline step writes R2 through wrangler. The first real upload is checked in the owner's box status (`r2:carta/status/last_run.json`, row T1107-c).

## Rollback procedure

`git revert` of the T1221 commit. The box then fails `flight_routes` again until the API token gets R2 object write.
