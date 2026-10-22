# T567: the trip planner's bed-line rule back in the main sheet

## Task ID

T567

## Date

2026-10-22

## What changed

`npm run ci:css-routes` failed on app master since T538. One rule, `.itin-bed-cost .costrow { padding: 0; }`, sat in the planners route sheet (`src/styles/planners/67-v6-tripplanner.css`), while the main sheet's `.itin-days-list .itin-day-row-main` has the same specificity and also sets `padding`. The checker cannot prove the two never match one element. A route sheet loads after the main sheet, but its order against a rule in its own source file is not guaranteed once split, so the check refused it.

The rule now lives in the main `src/styles/67-v6-tripplanner.css`, right after `.itin-days-list .itin-day-row-main`, so it still comes after that rule as it did in the route sheet. The check passes again. Both rules set `padding: 0`, so nothing on screen moves. `.itin-bed-cost` itself stays in the route sheet; it was not flagged.

## Files touched

**Modified:**
- `continent-app/src/styles/67-v6-tripplanner.css`
- `continent-app/src/styles/planners/67-v6-tripplanner.css`

## Commands run

- App branch `p11-css-routes-tripplanner` off master in `wt/p11-ask-carta-app`, commit `9330a0a`, fast-forwarded into app master.
- Fast build `npx vite build --config ../vite.t558.mjs` (out `wt/.out-t567`), then `node scripts/css-routes.mjs --check ../.out-t567/assets`.
- In the main checkout: `npm run build:pages`, `npm run ci:css-routes`, `npm test`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| ci:css-routes problems | 1 | 0 | -1 |
| Route selectors checked | 2,319 | 2,319 | 0 |
| npm test | 630 pass | 630 pass | 0 |
| Pages build | 210 files | 210 files | 0 |

## What broke and how it was fixed

No issues. The rule was confirmed in the built main sheet (`index-*.css`). No browser check was run: the rule's value is identical to the one it could have lost to, so no screen can change.

## What is still open

None.

## Rollback procedure

`git -C continent-app revert 9330a0a`, then `git revert` the root T567 commit.
