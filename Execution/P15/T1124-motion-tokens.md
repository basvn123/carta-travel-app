# T1124: Motion tokens and one reduced-motion path (G5, ungated half)

## Date

2026-11-06

## What changed

Every transition and animation duration and easing in the app's stylesheets now reads a motion token. `--dur-1` to `--dur-4`, `--ease-out` and `--ease-in-out` already existed (T380); seven ambient-loop tokens were added (`--dur-spin`, `-blink`, `-dots`, `-breathe`, `-pulse`, `-loop`, `-drift`). Literals were rounded to the nearest token. A new design-lint rule `motion-literal` and `tests/motion-tokens.test.mjs` keep it that way. The global reduced-motion floor in `02-base.css` was already in place and is verified in Chromium; five scripted `scrollIntoView({behavior: 'smooth'})` calls that bypassed it now use `scrollBehavior()` from `lib/motion.js`. No new animations (the T1111 direction is not approved).

## Files touched

- 28 stylesheets under `continent-app/src/` (transition and animation lines only), `01-tokens.css` (seven tokens), `02-base.css` (press 0.06s to `--dur-1`)
- `continent-app/scripts/ci/design-lint.mjs`, its baseline and fixtures (`bad/src/styles/t425.css`, `good/src/clean.css`)
- `SavedTab.jsx`, `SavedTripsPanel.jsx`, `StepStays.jsx`, `TripSummary.jsx`, `DestNearby.jsx` (scroll behaviour)
- `continent-app/tests/motion-tokens.test.mjs`, `DESIGN.md`, `ROADMAP.md`, `Execution/_OPEN.md`
- Not touched: `92-cost-card.css` (S38), accessibility files (S44)

## Commands run

`python3` migration script over `src/**/*.css`; `node scripts/ci/design-lint.mjs --self-test`, `--update-baseline`; `npm run lint`; `npm test`; fast build; Playwright Chromium with `reducedMotion` emulation.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Literal durations and easings in CSS transition/animation values (outside :root, excluding var()) | 243 | 1 (cost card, S38's file) | -242 |
| Most common literal | `.15s` x107 | 0 | |
| Raw `behavior: 'smooth'` in scripts | 5 | 0 | -5 |
| npm test | n/a | 1545 pass, 0 fail, 12 skipped (1557) | |

Feel shift is rounding only: `.15s` to 120 ms, `ease` to the in-out curve, so a few hovers are 30 ms quicker.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Lint flagged shorthand delays (`visibility 0s linear .26s`) | A delay that mirrors a duration | Set to `var(--dur-2)`; the sheen's 1.25s delay moved to `animation-delay` |
| Two legacy-token lines showed as new | Their text changed with the motion edit | Baseline regenerated; no net new violations except the cost card line |

## Screens checked

Not a screen task. Chromium with `reducedMotion: reduce`: transition and animation duration 0.00001s, iteration count 1, scroll-behavior auto. With no preference: 0.32s, 1.6s infinite, smooth. No visual check at phone or desktop width was done (no dev server tonight); the owner step below covers it.

## What is still open

See register rows T1124-a to T1124-c: the cost card literal, the gated richer motion (springs, photo move, INP), and a real-device look.

## Rollback procedure

`git revert` of the `T1124:` commits. Nothing is one-way.

## Owner steps (for the checklist)

- [T1124-b] Approve the T1111 design direction | G5 richer motion (springs, shared photo move) cannot start without it | read the T1111 direction; decide; tell the next session | Execution/P15/T1124-motion-tokens.md
- [T1124-c] Check reduced motion on a real phone | emulation passed but a device is the real test | turn on Reduce Motion in system settings; open Explore, Plan, a place page; sheets and tabs should snap, the home film should stand still | Execution/P15/T1124-motion-tokens.md
