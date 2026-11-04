# T1042: the deploy's prune no longer deletes the flight sweep's files

## Task ID

T1042

## Date

2026-11-04

## What changed

The deploy's last step, `node scripts/r2/push-data.mjs --live --prune`, deletes every top-level name under `data/` on R2 that `R2_TIER` (src/lib/dataHost.js) does not list. `flights/` is not in that list, because the app build does not write it: the flight-sweep Worker writes the fares (`data/flights/{IATA}.json`, `_index.json`) and `pipeline/flights/build_routes.py --upload` writes the route list (`_routes.json`, `_airports.json`). A deploy on 2026-11-03 purged `data/flights/`. The Worker rewrote its fare files on its next publishes, but nothing rewrites the route list between monthly builds. Without `_routes.json`, the Worker made no search after 23:05 UTC on 2026-11-03, and the Hetzner box's late sweep and late fill retried every 5 minutes without searching (`_routes.json: 404` in journalctl). No fare in D1 was lost; about 10 hours of searching was. Now `push-data.mjs` keeps an `OTHER_WRITERS` list (`flights`) that the prune never touches, with a test. The route list itself is put back by the owner's script (T1042-a), because the permission check refused the R2 write from the session.

## Files touched

**Modified:**
- continent-app/scripts/r2/push-data.mjs (`OTHER_WRITERS`; `staleEntries` keeps them; header note)

**Created:**
- continent-app/tests/pushDataPrune.test.mjs

## Commands run

```
curl https://data.carta-europetravel.com/data/flights/_routes.json      # 404 (the cause)
npx wrangler d1 execute carta_flights --remote ...                        # last sweep minute 2026-11-03 23:05 UTC
ssh carta@46.225.237.75 journalctl -u carta-late-fill -u carta-late-sweep # _routes.json: 404, retrying
node --test tests/pushDataPrune.test.mjs                                  # 2 pass
npx eslint -c <main checkout>/continent-app/eslint.config.js scripts/r2/push-data.mjs tests/pushDataPrune.test.mjs
```

`npm test` in the sparse worktree fails 163 of 166 files because `src/` is not checked out there; the change touches no file those tests read. Restore (owner): `scratchpad/restore-routes.sh`, which runs `npx wrangler r2 object put carta/data/flights/_routes.json` and `_airports.json` from `data/flights/` (built 2026-10-21, 10,094 routes, 400 airports, the same as R2 held).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Top-level names the prune may delete that other writers own | `flights/` | none | -1 |
| Worker sweep minutes in the last hour (2026-11-04 09:34 UTC) | 0 | measured by T1042-b | |

## What broke and how it was fixed

- The R2 upload of the two route files was refused by the session's permission check; it moved into the owner's script.
- ESLint found no config in the sparse worktree; linted with the main checkout's config.

## What is still open

- T1042-a: the owner runs the restore script.
- T1042-b: after the restore, confirm the Worker's `/status` lastHour shows searches again and the box's journal shows sweep minutes and fill steps instead of 404s.
- A deploy also runs a prune on stays-live (kept by R2_TIER) but not on any other writer's prefix; a writer added under `data/` later must be added to `OTHER_WRITERS`, which the header says.

## Rollback procedure

`git revert` the T1042 commit. The restored route files stay on R2; they are the same files the monthly build uploads.
