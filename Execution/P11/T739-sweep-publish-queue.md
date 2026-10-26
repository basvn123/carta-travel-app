# T739: the flight sweep publishes through a queue

## Task ID

T739

## Date

2026-10-26

## What changed

The flight-sweep Worker's hourly publish had failed on every run since 2026-10-23 02:07 UTC with "Too many API requests by single Worker invocation" (live log, 2026-10-26 02:07 UTC: exception after 63 s). One run may make 1,000 calls; an airport costs four (two D1 reads, the previous R2 file read by the T645 route check, one R2 write), and after the 2026-10-23 seed every one of the 377 home airports had changed, so a run needed about 1,900. Nothing reached R2 for three days: D1 holds 73,838 fares (62,172 priced) that the app never received. Workers Paid (the owner, 2026-10-26, T514-a) did not lift this limit. Publishing now works through a queue: `nextBatch` (publish.mjs) takes up to `PUBLISH_BATCH` = 60 airports a run (about 240 calls), saves the rest in `state.publish_queue`, and the publish cron runs every 10 minutes (`*/10 * * * *`, was `7 * * * *`); the index file and the logos are written when the queue is empty, and `published_at` takes the queue's start, so a fare checked while the queue drained is published next time. A full publish of all 377 airports takes about an hour. Searches run 3 at once, was 6: in the hour before, Google dropped 3,439 of 6,407 searches from Cloudflare's servers ("GET request to Google Flights (www.google.com) failed"), with about 1 s of CPU per run, so not a plan limit. `/status` shows `publishQueued`.

Coordination: the price-engine session (travel-app-db) owns T693 on the same Worker; it was not running and could not be told. T739 is built on app master 3db06b0, which carries T693, and changes only the publish loop and the cron.

## Files touched

**Modified (app, mirrored in root):** `workers/flight-sweep/wrangler.toml`, `workers/flight-sweep/src/index.mjs`, `workers/flight-sweep/src/publish.mjs`, `tests/flightSweep.test.mjs`.
**Created:** this report.

## Commands run

`npx wrangler tail flight-sweep` twice (5 minutes of searches; the 02:07 UTC publish); `node --test tests/flightSweep.test.mjs` (11 passed); `node --check` on both Worker files; `npx wrangler deploy --dry-run` (991 KiB, bundles). The deploy itself was refused by this session's permission settings (production deploy) and is the owner's (T739-a).

## Config and secrets set

`wrangler.toml` cron `7 * * * *` became `*/10 * * * *`. Nothing live until the deploy.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Calls per publish run | about 1,900 (377 airports x 4 + index), over the 1,000 limit | at most about 250 (60 airports) |
| Last successful publish | 2026-10-23 02:07 UTC | after the deploy, the first batch within 10 minutes and all airports within about an hour (to check: T739-a) |
| Searches failing, last hour before the change | 3,439 of 6,407 (54%), all Google not answering Cloudflare | to measure after the deploy (T739-b) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| No publish for three days | One run needed about 1,900 calls; the limit is 1,000, on Workers Paid too | The queue |
| The T645 route check added a call per airport | It reads the previous file to compare medians | Kept, and counted inside the batch |

## What is still open

T739-a (deploy, then check the publish), T739-b (if Google still drops most searches at 3 at once, search from the laptop on a schedule and keep the Worker for publishing). T645-e was already closed by the owner (deployed 2026-10-25, version de8283eb); its route-median lines are in the live log.

## Rollback procedure

`git revert d8d4d71` in the app (and this report's mirror commit in root), then `npx wrangler deploy -c workers/flight-sweep/wrangler.toml` from continent-app. The `publish_queue` state row is ignored by the old code.
