# T1043: the flight-sweep Worker at half speed from 22:00 to 05:00 UTC

## Task ID

T1043

## Date

2026-11-04

## What changed

Google refused the flight-sweep Worker every night this week, always between 22:00 and 03:00 UTC (2, 3 and 4 November: refusals at 22:00, 23:00, 00:00, 02:00), and never by day. Each refusal paused it 1, 2, then 4 hours, and the routes due in a pause missed their turn until the next round. The owner asked (2026-11-04) for the box's rule: half speed at night. The Worker's plan now counts each cycle in slots instead of minutes: two slots a minute by day and one from 22:00 to 05:00 UTC (`slotsAt`, `routesForMinute` in plan.mjs). A night minute carries half a day minute's share, each cycle still takes exactly its 3 days, 2 weeks or 90 days, so every route keeps its turn and no fare outlives its age, and a day minute carries about 17% more than before (on average about 23 searches a minute, was 19.5; the busiest minute of the last day fitted 37 within the 50 s budget). The box's far fill, already done, reads the Worker's position the same way.

## Files touched

**Modified:**
- continent-app/workers/flight-sweep/src/plan.mjs (`NIGHT_UTC`, `SLOTS_PER_DAY`, `slotsAt`, `routesForMinute`; near, far and find use them)
- continent-app/workers/late-sweep/run.mjs (the far fill's start position in slots)
- continent-app/tests/flightSweep.test.mjs (two tests; the far fill test finds a route's minute with `routesForMinute`)

## Commands run

```
node --test tests/flightSweep.test.mjs        # 26 pass (24 before)
npx eslint --no-warn-ignored -c <main checkout>/continent-app/eslint.config.js <the three files>
npx wrangler d1 execute carta_flights --remote ...   # refusals by hour; jobs per minute (max 37, average 19.5)
```

Deploy (owner, T1043-a): `scratchpad/deploy-t1043.sh`, `npx wrangler deploy` in `continent-app/workers/flight-sweep`, because the session's permission check refuses Worker deploys. The box needs no update for this (its far fill is done); it gets run.mjs at its next code move.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Worker searches in a night minute, 22:00 to 05:00 UTC | 1 share | 0.5 share (about 10 a minute) | -50% |
| Worker searches in a day minute (average) | 19.5 | about 23 | +17% |
| Each route's turn per near / far cycle | once | once (tested over a whole cycle, 10,285 routes) | none |
| Nights with a refusal, this week | 3 of 3 | measured by T1043-b | |

## What broke and how it was fixed

`npx eslint` pulled eslint 10.14 into the npx cache because the sparse worktree has no node_modules; it passed with the app's config.

## What is still open

- T1043-a: the owner runs the deploy script.
- T1043-b: after three nights, count the Worker's refusals by hour (the runs table, blocked); if nights are clean and days stay clean at the higher day rate, keep it; a day refusal means the day share is too high.

## Rollback procedure

`git revert` the T1043 commit and redeploy the Worker. The routes' slots move back to whole minutes; for one cycle some routes get their turn early or late, within the age limits.
