# T875: plan flow v3 merged, pushed and deployed

The owner said "Merge, push and deploy" (2026-10-30). Plan flow v3 (T855 to T874, Batches A to G) is now live on www.carta-europetravel.com.

## What changed

- **Merge:** fast-forward, no merge commits. App `master` d195640 to a0001d2 (`p15-plan-flow-v3-g`), then T875 8af8923. Root `main` d392962b9 to edf7e1627, then T875 sync 7cece0092.
- **CSS route hold:** the first `css-routes --check` on the merged build found 4 problems where the last deploy had 1. Three were plan flow rules in `planners/86-plan-flow.css` that a later rule could override: `.pf-help`, `.pf-set-rows li + li` and `.dtg-rows > li + li`. `--hold` moved them into `planners-held.css` (12 lines added, 13 removed). The check is back to its 1 known problem (T833-a).
- **Push:** root `main` d392962b9 to 7cece0092 on origin. The app repo has no remote.
- **Build:** `VITE_E2E_SEAMS= npm run build:pages`: PASS, 279 files (19,721 under the ceiling), entry `index-DdQJtM0h.js`.
- **Data:** `push-data.mjs --rclone-dry-run` transferred 0 B (44 of 44 checks), so there was no data push.
- **Preview:** Pages 11ad9a15. `walk-g-remote.mjs`, the T874 walk pointed at an origin, passed 88 of 88 with 0 console errors.
- **Production:** Pages 8c452891. www.carta-europetravel.com serves `index-DdQJtM0h.js`. The same walk passed 88 of 88 with 0 console errors.

## Files touched

- `continent-app/src/styles/planners-held.css`
- `continent-app/src/styles/planners/86-plan-flow.css`
- `Execution/P15/T874-walk/walk-g-remote.mjs` (new)
- `Execution/P15/T875-deploy-plan-flow-v3.md` (new)
- `Execution/P15/_RUN-plan-flow-v3.md`

## Commands run

1. `git -C continent-app fetch . p15-plan-flow-v3-g:master`, then `git fetch . p15-plan-flow-v3-g:main`. These are fast-forwards of the branch refs, then a checkout of the same tree.
2. `npm test`: 1109 of 1109, before and after the hold.
3. `VITE_E2E_SEAMS= npm run build:pages`, then `node scripts/css-routes.mjs --check dist/assets --hold`, then a rebuild and a recheck.
4. `git push origin main`
5. `node scripts/r2/push-data.mjs --rclone-dry-run`
6. `npx wrangler pages deploy dist --project-name carta-app --branch preview`, then the walk.
7. `npx wrangler pages deploy dist --project-name carta-app --branch main`, then the walk.

## What broke

Only the route check: 3 new route-sheet rules that a later rule could override. The hold fixed them before the deploy.

## What is still open

No new rows. The 25 `user` rows from T855 to T874 are still open; they are listed in `_RUN-plan-flow-v3.md` under "Morning summary". T833-a is still open as well.

## Rollback

- **Production:** in the Pages dashboard, roll back to 49df9b95. Get the list with `npx wrangler pages deployment list --project-name carta-app`.
- **Code:** reset root `main` to d392962b9 and app `master` to d195640. Undoing the pushed root history needs a revert range `d392962b9..7cece0092`, not a force-push.

## Measurements

| Metric | Before | After |
|---|---|---|
| Live entry | `index-B88WwWMz.js` (Pages 49df9b95) | `index-DdQJtM0h.js` (Pages 8c452891) |
| `npm test` on main | 1029 | 1109 |
| css-routes problems | 1 | 1 (4 before the hold) |
| Walk on production | n/a | 88 of 88 |
