# T780: the flight sweep down to what the app needs

## Task ID

T780

## Date

2026-10-27

## What changed

On 27 October around 20:30, Google started refusing the flight-sweep Worker: 40 refusals in 4 minutes, after a day of about 6,200 searches an hour with almost none. The owner asked for the sweep to be slowed to the minimum, with no blocks, and accepted that a price may be a few days old. The sweep now runs about 1,100 searches an hour instead of 6,200, which is 82% fewer.

How the work is split:

- **Near dates** (the next 14 days): every fourth day (1, 5, 9, 13 days out) instead of every other day, each route every 3 days instead of every 12 hours. The app already takes the nearest swept day within 4 days of the one asked for (`flights.nearest_day_spread`).
- **Far dates** (weeks 3 to 26): every 2 weeks instead of weekly. They are now spread evenly over the cycle. Before, a cycle longer than the route list ran all its routes in the first part and nothing after; for the 2-week cycle that would have meant about 20 far searches a minute for one week and none the next.
- **Finding new routes:** every 90 days instead of 30.
- **Pacing:** one search at a time instead of 3, a random 0.3 to 0.9 s gap after each search, and no new search after 50 s, so one minute's run never overlaps the next.

The guard is stricter too. The first refusal stops the minute right away and pauses for an hour. Before, the guard needed 3 refusals, and the count was taken only after every search of the minute had run, so it never cut a minute short. A refusal within 2 hours of the last pause ending doubles the pause, up to a day. Three hours without a refusal resets it to one hour.

The app's fare ages follow the new cadence: near 5 days and far 16 days, up from 3 and 8 (`flights.max_age_days` in `config/pricing.json`). Each age is one cycle plus a day or two for a pause. A test now fails if a cycle ever outgrows its age.

## Files touched

**Modified (continent-app, branch p11-sweep-gentle, 674771a and ddb9b88; mirrored here):**
- workers/flight-sweep/src/plan.mjs: NEAR_CYCLE 4320, FAR_CYCLE 20160, FIND_CYCLE 129600, NEAR_DAYS [1,5,9,13], routesInMinute, nextPause
- workers/flight-sweep/src/index.mjs: PARALLEL 1, GAP_MS, BUDGET_MS, BLOCKS_TO_PAUSE 1, live refusal count, pause_level state, /status pauseLevel
- config/pricing.json: flights.max_age_days near 5, far 16
- src/lib/flights/flights.js: comment only
- tests/flightSweep.test.mjs: nextPause, routesInMinute, cycles within fare ages, find tests loop over FIND_CYCLE
- tests/flights.test.mjs: fixture ages 10 and 16 days

**Created:**
- Execution/P11/T780-sweep-gentle.md

## Commands run

```
git -C continent-app worktree add -b p11-sweep-gentle ../../wt/t780-app master
npm test                                          (wt/t780-app: 791 pass, 3 fail; see What broke)
node load.mjs routes.json                         (jobsForMinute over 1,440 minutes, live _routes.json)
```

Not run (owner, T780-a). From continent-app/, after merging p11-sweep-gentle, the app first and then the Worker:

```
npm run build && (the usual Pages deploy)
npx wrangler deploy -c workers/flight-sweep/wrangler.toml
```

## Config and secrets set

`flights.max_age_days` near 3 to 5, far 8 to 16. The new D1 state key `pause_level` is written on the first pause.

## Before/after measurements

Measured with jobsForMinute over the live `data/flights/_routes.json` (10,094 routes), 1,440 minutes from now.

| Metric | Before | After | Delta |
|---|---|---|---|
| Searches an hour | 6,158 | 1,102 | -82% |
| Searches a minute | 102.6 | 18.4 | -82% |
| Near / far / find a minute | | 9.4 / 8.1 / 0.9 | |
| Searches at once | 3 | 1 | |
| Refusals before a pause | 3 (never cut a minute short) | 1 (stops the minute) | |
| Pause after repeated refusals | 1 h each time | 1 h, doubling to 24 h | |
| Oldest price the app shows | near 3 d, far 8 d | near 5 d, far 16 d | |

## What broke and how it was fixed

- The old guard's stop callback read a refusal count that nothing had incremented yet, so a minute with refusals ran all its searches. Fixed by counting refusals as results come in.
- A far cycle (20,160 minutes) longer than the route list would have bunched all far searches into its first week. Fixed by routesInMinute.
- `npm test` in the worktree: 3 numbersPage tests fail because `public/boot.json` is not in a fresh worktree. They pass on master (833 of 833) and do not touch these files.

## What is still open

- T780-a (owner): deploy the app (Pages) and then the Worker. The auto-mode classifier denied a production deploy from this session. Order matters. With the Worker alone, the live app still drops far prices after 8 days and near ones after 3, so far dates go blank for part of each 2-week cycle. Until the Worker deploy, the old cadence of 6,200 searches an hour keeps running.
- Watch `/status` `pauseLevel` for a few days. If refusals continue at 1,100 an hour, the next lever is fewer far weeks (needs a product call on how far ahead prices matter).

## Rollback procedure

`git -C continent-app revert ddb9b88 674771a`, then deploy the app and `npx wrangler deploy -c workers/flight-sweep/wrangler.toml`. Revert this root commit as well. The `pause_level` state row is harmless to leave.
