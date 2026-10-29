# T854: trip page v4 pushed and deployed

## Task ID

T854

## Date

2026-10-29

## What changed

The owner said "you can deploy" and then "deploy fully". Trip page v4 (T834 to T851, merged in T852, routes held in T853) is now live on www.carta-europetravel.com.

- **Push:** root `main` went from `6dfa7a734` to `61d8465df` on origin. The app repo has no remote, and its `master` is `d195640`.
- **Build:** `VITE_E2E_SEAMS= npm run build:pages`.
  - PASS: 277 files (19,723 under the ceiling).
  - Entry `index-B88WwWMz.js`.
  - No verify seam in the bundle (`aiplanmock` and `savedmock` absent).
  - `css-routes --check dist/assets`: 1 problem (T833-a, pre-existing).
- **Data:** `push-data.mjs --rclone-dry-run` transferred 0 B (44 of 44 checks), so there was no data push.
- **Preview:** Pages `adac49e2` (preview.carta-app.pages.dev). The four v4 walks scored 109, 81, 69 and 48, so 307 of 307, with no page or console errors.
- **Production:** Pages `49df9b95`. www.carta-europetravel.com serves `index-B88WwWMz.js`. The same four walks scored 307 of 307, with no page or console errors (`T853-walk/prod-*.json`).

## Files touched

Created:
- `Execution/P15/T854-deploy-trip-page-v4.md`
- `Execution/P15/T853-walk/prod-*.json`

## Commands run

1. `git push origin main`
2. `VITE_E2E_SEAMS= npm run build:pages`
3. `node scripts/css-routes.mjs --check dist/assets`
4. `node scripts/r2/push-data.mjs --rclone-dry-run`
5. `npx wrangler pages deploy dist --project-name carta-app --branch preview`
6. The walks against preview. These are copies of walk-a to walk-d with the origin swapped; the walks route their own fixtures.
7. `npx wrangler pages deploy dist --project-name carta-app --branch main`
8. The walks against production

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Live entry | `index-BXfBMilD.js` (Pages `f88ea7bc`) | `index-B88WwWMz.js` (Pages `49df9b95`) |
| `npm test` on main | 999 | 1029 |
| Walks on production | not run for v4 | 307 of 307 |

## What broke and how it was fixed

No issues.

## What is still open

These carry over unchanged; no new rows:
- the batch rows T839-a, T849-a, T849-b and T851-a;
- T852-b;
- T833-a.

## Rollback

1. **Production:** roll back to `f88ea7bc` in the Pages dashboard (`npx wrangler pages deployment list --project-name carta-app`), or deploy a build of root main `6dfa7a734`.
2. **Code:**
   - In the root: `git revert -m 1 722e6ca42` and revert `61d8465df`.
   - In the app: `git revert -m 1 faa4958` and `d195640`.
3. **Data:** nothing to roll back.
