# T1220: the flight lever test holds the clock at its fixture's day (ROADMAP H14)

## Date

2026-11-07

## What changed

`continent-app/tests/recommendLevers.test.mjs` failed on the calendar alone, first on 2026-11-07, blocking the required `app` check on every pull request (PRs 11 and 12; it passed on 2026-11-06). "the flight lever re-orders under rule (a)" found 1 distinct order instead of at least 3.

Cause: the test passes `today: "2026-10-28"`, the day its fixture's fares (`tests/fixtures/tf1-flights-BRU.json`) were swept, but `price/trip.js` calls `pickLeg()` without `now`, so the fare age check (`flights.js` `maxAgeMs`) reads the real clock. Ten days on, every fixture fare counted as stale, no trip had a flight to rank on, and the lever could not move the order.

Fix, test only: the three catalogue tests run with `Date.now` held at noon on the fixture's day (`atFixtureDay`), restored after each test. In the app the input's today and the clock are the same moment, so travellers see no difference.

## Files touched

- `continent-app/tests/recommendLevers.test.mjs`
- `Execution/P15/T1220-lever-test-clock.md` (this report)

## Commands run

`node --test tests/recommendLevers.test.mjs` against the laptop's public data, before and after; `npx eslint` on the changed file: clean.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| recommendLevers.test.mjs on 2026-11-07 | 6 of 7 pass | 7 of 7 pass | +1 |

## What broke and how it was fixed

Nothing beyond the failure this task fixes.

## Screens checked

None: test only.

## What is still open

- T1220-a: `price/trip.js` prices flights against the real clock even when the caller passes a `today`; thread `today` (as `now`) into `pickLeg` so the finder is deterministic for a given input. Low priority: in the app both are the same moment.

## Rollback procedure

`git revert` of the T1220 commit; the test then fails again on any day more than about ten days after 2026-10-28.
