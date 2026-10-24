# T737: price engine PB5 merged into the planner branch

## Task ID

T737

## Date

2026-10-24

## What changed

App master moved to 4ffe6b6 (price engine PB5, T714 to T716: local transport joins the day once a place has a fare, activity switches, tolls from the own start), and root main to de59e8db2, PB5 plus its production deploy (Pages c9ecb462). T735-a's condition applied again, so both were merged into `p15-planner-final`.

Both merges were clean. In `lib/price/trip.js` the flight leg now carries both changes:

- the planner's rank (`rank: state?.flightRank`, T657, restored by T736);
- T713's lap fee for babies (`BABY_LAP_FEE_LEG`).

The days overview (`planner/days/tripCost.js`) reads the receipt lines from `tripLines`, whose keys did not change. Local transport sits inside the `days` line, which the price card and the overview both call "Food and drink". The overview copies the card on purpose, so the label stays the price card's to change. The price session has been told.

The root's `continent-app/` equals the app head file for file, line endings aside. The register merged without a conflict; its only duplicate IDs, T514-a and T514-b, are on main itself.

## Files touched

**App:** merge commit 3db06b0 (no file changed by hand). **Root:** merge commit 2064bad20, and this report.

## Commands run

`git merge --no-ff --no-commit master` (app) and `main` (root), `npm test`, the fast build, `css-routes --check`, `design-lint`, then the end check on a build with the verify seams and the fake Supabase host: `t676.mjs` and `scripts/verify_plan_mocks.mjs` at 390, 820 and 1280, `t733.mjs` at 390 and 1280.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Commits on app master missing from the branch | 1 merge (PB5) | 0 | -1 |
| node tests | 824 (780 pass) | 832 (787 pass; the same 3 worktree failures) | +8, from master |
| css-routes / design-lint | 4 / 32 | 4 / 32 (master: 4 / 32) | 0 |
| End check | | 17 of 17 and 16 of 16 at every width, 5 of 5 at both | all pass |

## What broke and how it was fixed

No issues.

## What is still open

T735-a stands. The owner merges `p15-planner-final` (app head 3db06b0, root head after this report) into master and main and deploys. Production already carries PB1 to PB5 (Pages c9ecb462), so this deploy adds only the planner rebuild. If master moves again first, repeat these steps.

## Rollback procedure

App: `git reset --hard 464cce3` on `p15-planner-final`. Root: `git reset --hard 61f4f920a`. Nothing reached master, main or production.
