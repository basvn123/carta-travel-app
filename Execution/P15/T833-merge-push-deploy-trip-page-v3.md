# T833: trip page v3 (T819 to T832) merged, pushed and deployed

## Task ID

T833

## Date

2026-10-29

## What changed

The owner asked to "merge, deploy and push". This task merged, pushed and deployed batch `p15-trip-page-v3` (T819 to T832).

**Merges.**
- **App:** master `044188d`, a `--no-ff` merge of the branch.
- **Root:** main `e7c6d43d0`. Root main had moved while the batch was open: another session added two box commits (`2622514a7`, `f7ca1ab38`, the late fill), with no overlap.
  - The root working tree also holds the owner's uncommitted `public/` deletions, so the merge commit was built without a checkout: `git merge-tree --write-tree`, then `git commit-tree`, then `update-ref`.
  - The working tree's continent-app files equal app master; the only differences are line endings.
- **Number collision:** that other session also used **T819** for its box commits. This batch's T819 is the trip page. Both stay, since renumbering would rewrite pushed history.

**Tests on merged main:** `npm test` 999 of 999.

**Push:** root main `f7ca1ab38..e7c6d43d0`, then `dce7b87cd` and this report. The app repo has no remote.

**CSS route split.**
- `css-routes --check` reported 421 problems: the new trip card and the days bar moved Explore's card and the day planner into new route sheets.
- **Fixes:**
  - Two broad selectors made specific: `.pf-carta-bar > .xchips` and `.tpc-where-text`.
  - The flagged route rules held in the first paint with `--hold` (281 selectors).
- **Result:** 1 problem left, `88-pf2-wizard.css`, from T809, already shipped.
- **Re-walk:** 130 of 130 and 42 of 42 after the move.
- **Commits:** app `effacb5`, root `dce7b87cd`.

**Build:** `VITE_E2E_SEAMS= npm run build:pages`.
- Pages limit check PASS: 277 files.
- No verify seam in the bundle (`aiplanmock` and `savedmock` absent).
- Entry `index-BXfBMilD.js`.

**Data:** `push-data.mjs --rclone-dry-run` found nothing to transfer, so there was no data push.

**Preview:** `wrangler pages deploy dist --branch preview` (`ce4a0cc5`).
- `wt/v3-live.mjs`: 108 of 114, no page errors.
- `wt/v3-carta-live.mjs`: 42 of 42.

**Production:** `wrangler pages deploy dist --branch main` (`f88ea7bc`). www.carta-europetravel.com serves `index-BXfBMilD.js`.
- `wt/v3-live.mjs`: 108 of 114, no page errors.
- `wt/v3-carta-live.mjs`: 42 of 42 on the second run. The first run timed out on a cold load before its first check.

**Why 108 of 114.** The 6 misses are expected: two per width. The production build has no `?aiplanmock` seam, so a guest's "Let Carta plan them" opens the bot's sign-in form instead of the queue. The walk then waits for the progress bar and cannot reach All trips behind the form.

## Files touched

**Modified:** the `css-routes --hold` changes in:
- `continent-app/src/styles/`: `86-plan-flow.css`, `items-held.css`, `planners-held.css` and the route sheets under `items/` and `planners/`
- `continent-app/src/browse/TripPlaceCard.jsx`

**Created:** `Execution/P15/T833-merge-push-deploy-trip-page-v3.md`.

## Commands run

1. `git -C continent-app merge --no-ff p15-trip-page-v3`
2. `git merge-tree --write-tree main p15-trip-page-v3`, `git commit-tree`, `git update-ref refs/heads/main`, `git symbolic-ref HEAD refs/heads/main`, `git reset -q`
3. `npm test`
4. `git push origin main`
5. `VITE_E2E_SEAMS= npm run build:pages`
6. `node scripts/css-routes.mjs --check dist/assets --hold`, then the build again and the check again
7. `node scripts/r2/push-data.mjs --rclone-dry-run`
8. `npx wrangler pages deploy dist --project-name carta-app --branch preview`
9. The walks against preview
10. `npx wrangler pages deploy dist --project-name carta-app --branch main`
11. The walks against production

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Live entry | `index-BdxJfvVz.js` (Pages `0907dd04`) | `index-BXfBMilD.js` (Pages `f88ea7bc`) |
| `npm test` on main | 980 | 999 |
| `css-routes` problems | 421 after the batch | 1 (pre-existing) |
| Pages files | 274 | 277 |

## What broke and how it was fixed

- **The root checkout of main** was refused over the shared working tree. The merge commit was built without a checkout instead.
- **The CSS route proof** was fixed as described above.

## What is still open

- **T823-a (owner):** walk "Let Carta plan them" once with a real account on the live `plan-day` function. Guests get the form, as before.
- **T832-a:** walk Plan a trip here over an existing trip.
- **T833-a:** `88-pf2-wizard.css` has no global sheet in `styles.css` (T809).

## Rollback procedure

1. **Production:** `npx wrangler pages deployment list --project-name carta-app`, then roll back to `0907dd04` in the Pages dashboard, or deploy a build of root main `f7ca1ab38`.
2. **Code:** `git revert -m 1 e7c6d43d0` and `dce7b87cd` in root. In the app, `git revert -m 1 044188d` and `effacb5`.
3. **Data:** nothing to roll back.
