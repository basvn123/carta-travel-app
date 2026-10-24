# T736: price engine PB3 merged into the planner branch

## Task ID

T736

## Date

2026-10-24

## What changed

App master moved to d930450 (price engine PB3, T699 to T713) after T735 made the planner branch ready, so T735-a's own condition applied: merge master in again and rerun the end check.

- **App:** one conflict, in `src/lib/tripTotal.js`. PB3 moved the trip price from there into `lib/price/trip.js` (`quoteTrip`); `tripTotal.js` now only re-exports it. Master's version was taken. The move had dropped the planner's flight ranking (T657: `flightRank`, the trip settings' "what matters most"), which `quoteTrip`'s `pickLeg` call no longer passed. It is back, with its doc line. The callers already pass `flightRank` (`useTripPlanner`, and the wizard into `priceWholeTrip`). No planner module of batches 1 and 2 or T731 to T735 calls a renamed kernel function; PB3's V2 guard test (`tests/priceSources.test.mjs`) passes.
- **Root:** main 7e87c707f merged. `tripTotal.js` was taken from main and the same fix applied under `continent-app/`. The register's two appended blocks were kept, and T661-a, which both sides carried, kept once, as closed by T711. The rows T514-a and T514-b appear twice on main itself; that is not this task's to change.
- **Mirror:** the root's `continent-app/` matches the app head file for file, line endings aside.

## Files touched

**App:** merge commit 464cce3 (`src/lib/tripTotal.js` from master, `src/lib/price/trip.js` + rank). **Root:** merge commit 9a8ed68a0 (`Execution/_OPEN.md`, `continent-app/src/lib/tripTotal.js`, `continent-app/src/lib/price/trip.js`).

## Commands run

`git merge --no-ff --no-commit master` (app), `git checkout --theirs src/lib/tripTotal.js`, the rank patch, `npm test`, the fast build, `css-routes --check`, `design-lint`. The end check, on a build with the verify seams and the fake Supabase host: `t676.mjs`, `scripts/verify_plan_mocks.mjs` and `t733.mjs`. Then the same merge in the root with `main`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Commits on app master missing from the branch | 22 | 0 | -22 |
| node tests | 809 (765 pass) | 824 (780 pass; the same 3 worktree failures) | +15, from master |
| css-routes / design-lint | 4 / 32 | 4 / 32 (master: 4 / 32) | 0 |
| End check | | 17 of 17 (t676) and 16 of 16 (mocks) at 390, 820, 1280; 5 of 5 (real flight data) at 390 and 1280 | all pass |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Comfort first would have stopped re-ranking the planned trip's flights | PB3's quoteTrip dropped the `rank` argument T657 added | `rank: state?.flightRank` passed again |
| T661-a twice in the register | both sides carried it, one open, one closed | kept once, closed by T711 |

## What is still open

T735-a stands: the owner merges `p15-planner-final` (app head 464cce3, root head after this report) and deploys. If master moves again first, repeat this task's steps.

## Rollback procedure

App: `git reset --hard 2ba2363` on `p15-planner-final`. Root: `git reset --hard 452c47e84`. Nothing reached master, main or production.
