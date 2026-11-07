# T1126: Breakpoints and CSS consolidation (G7, S42)

## Date

2026-11-06

## What changed

G7 is partly done. Every `@media` width in the stylesheets now sits on one written scale: 43 distinct width values (32 boundaries) became 18 values (14 boundaries), 44 files rewritten by `scripts/ci/css-breakpoints.mjs`, which also checks the scale (`npm run ci:breakpoints`) and is written up at the top of `src/styles/01-tokens.css`. A selector-usage scan (`scripts/ci/css-dead.mjs`, postcss over every stylesheet against every word in `src/`) removed 2,983 rules or selectors whose class is named nowhere in the app or built at runtime; the CSS on the fast build fell from 1,528,484 to 1,254,884 bytes (-17.9%). The pixel check of 8 screens at 4 widths shows no change. `css-routes --check` now passes on the fast build (it failed with 899 problems before: 3 route sheets imported by hand had no global twin, and the rest were held-rule moves other sessions never made; `--hold` moved 615 route selectors back to the first paint). design-lint went from 6,479 to 4,613 violations because dead rules carried violations.

Not done (see register): the widths a `matchMedia` call in JSX also uses (700, 1100, 1200, 1240, 599, 1023) stay because I may not edit JSX and the CSS must keep matching the JS; the "four tokens" target (560/768/1024/1440) therefore became a 14-boundary scale; the 60 to 69 v6 override layer was not folded; no file over 2,500 lines was split; `!important` went 50 to 48 only.

## Files touched

- `continent-app/src/styles/**` (44 files for widths; 62 for dead rules; `planners-held.css`, `items-held.css`, `admin-held.css` written by `--hold`)
- `continent-app/src/planner/TripSummary.css`, `continent-app/src/styleguide/styleguide.css` (dead rules)
- Created: `continent-app/scripts/ci/css-breakpoints.mjs`, `continent-app/scripts/ci/css-dead.mjs`
- `continent-app/scripts/css-routes.mjs` (route sheets that a component or `planners.css` imports itself are owned, not flagged)
- `continent-app/scripts/ci/design-lint.baseline.json`, `continent-app/package.json` (`ci:breakpoints`), `ROADMAP.md` (G7), `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`
- No JSX touched.

## Commands run

```
cd continent-app && npm ci
node scripts/ci/css-breakpoints.mjs --rewrite
node scripts/ci/css-dead.mjs --apply
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
node scripts/css-routes.mjs --check ../.fastbuild/assets --hold   # then --check again
node scripts/ci/design-lint.mjs --update-baseline
npm test
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Distinct `@media` width values | 43 | 18 | -25 |
| Distinct width boundaries | 32 | 14 | -18 |
| All CSS files on the fast build (bytes) | 1,528,484 | 1,254,884 | -273,600 (-17.9%) |
| Main sheet `index-*.css` (bytes) | 1,044,389 | 840,870 | -203,519 |
| `planners-*.css` route sheet (bytes) | 113,512 | 53,897 | -59,615 (rules held back in the first paint by `--hold` are counted in the main sheet) |
| Dead rules or selectors removed | 0 | 2,983 | about 329 KB of source |
| design-lint violations | 6,479 | 4,613 | -1,866 |
| css-routes --check problems | 899 | 0 | -899 |
| `!important` in styles | 50 | 48 | -2 |
| `npm test` | 1,540 pass, 12 skipped | 1,540 pass, 12 skipped | same |

Widths in use before (value: rules): the `--list` output of the old tree is in git at the commit before this one. Snapped: 359 to 360, 400 to 420, 499/520 to 480, 560/620/640 to 600, 680/720 to 700, 760 to 768, 880/900/910/1000/1040 to 1024, 1060/1120 to 1100, 1180 to 1200 (the boundary of each query, with its -1 partner). After: 360, 380, 420, 430, 480, 600, 700, 768, 1024, 1100, 1200, 1240, 1280, 1440, 1600, 1800 (the 14 in use).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| design-lint reported 2 new violations after dead removal | Removing a dead selector from a comma list changes the rule's text, and the baseline keys on that text | `--update-baseline` (count only fell) |
| css-routes failed with 899 problems before my change | Route-only sheets 88/89/90 imported directly (no global twin), plus rules that other sessions' later sheets could override | The check treats sheets that JSX or `planners.css` import as owned; `--hold` moved 615 selectors into `*-held.css` |
| Pixel diffs of 7 to 14 pixels at the same spot on unrelated pages | Animated element; a build compared with itself shows the same on Home at 1024 and 1440 | Treated as noise |

## Screens checked

Playwright with the local Chromium on the before and after builds, with app data, at 390, 768, 1024 and 1440 px: Home, Explore, Plan, Destinations, Pricing, Trips, Style guide, one place page (32 pixel comparisons). 27 identical; 5 differ by 7 to 14 pixels in one 4 by 100 px box at the same spot on pages that share nothing else (animation; the same box differs when the old build is compared with itself). The screens needing an account (trip page with a saved trip, day planner steps, admin) were not seen. Shots were not committed.

## What is still open

- T1126-a: JSX `matchMedia` calls and the CSS share 700, 1100, 1200, 1240, 599 and 1023; move both together onto 768/1024/1440 (and 560) in one task.
- T1126-b: fold the v6 override files 60 to 69 into their domain files; split files over 2,500 lines; halve `!important` (50 now).
- T1126-c: dead-CSS rules that need a human: `.money-est` (12 rules, no JS use but the scan kept them, see why), `.trip-leg*`, `.savedmap`, `.fare-badge` already gone; and CSS whose class is built from data in JSON under `public/`, which the scan could not see.
- T1126-d: signed-in screens (saved trip page, day planner steps, admin, account) were not looked at after the removal; walk them at 390 and 1440.
- T1126-e: wire `npm run ci:breakpoints` into the design-lint workflow (a `.github/workflows` edit I was not asked to make).

Closed by this task (moved to `_OPEN-CLOSED.md`): T833-a, T1040-a, T1090-c (css-routes sheets 88 to 90), T838-b (old stop editor CSS). The brief spoke of 26 register rows folded into G7; only these four are about this work, and I did not invent others.

## Rollback procedure

`git revert` the T1126 commits (widths commit and the dead-CSS commit are separate). No data or schema change.

## Owner steps (for the checklist)

- [T1126-d] Look at signed-in screens after the dead-CSS removal | the saved trip page, day planner, admin and account need an account and were not seen | open each at 390 and 1440 on a preview build and compare with production; run `node scripts/verify_admin_panel.mjs` | continent-app/src/styles
