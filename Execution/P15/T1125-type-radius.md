# T1125: Type and radius debt (G6)

## Date

2026-11-06

## What changed

ROADMAP G6. Every `font-size` and `border-radius` literal in the stylesheets that equals a locked token exactly was replaced by the token (804 font sizes, 405 radii), so nothing moves on screen. The 5 violations red on the base were fixed: AroundHere.jsx has one raw `<button>` element instead of two, and the press-kit and support rules in 69-v6-account.css now use tokens. The baseline was regenerated and shrank from 7,722 to 6,479.

Rounding done in 69-v6-account.css (visible, small): font sizes .95rem to 14px (--text-body), .8rem to 12px (--text-caption), 1.4rem to 20px (--text-title), .9rem to 13px (--text-label); the support-status and press-fact borders now use --border and the radius is --radius-control (10px, unchanged); the old `var(--line, ...)` and `var(--surface, #fff)` fallbacks with hex are now --border and --surface. All sit on the press-kit and Help pages only.

Values that are not on a token (for example 15px, .85rem, 9px radii) were left alone: rounding them is a look decision, not debt.

## Files touched

continent-app/src/styles/*.css (47 files, literals only), continent-app/src/browse/AroundHere.jsx, continent-app/scripts/ci/design-lint.baseline.json, Execution/P15/T1125-type-radius.md, Execution/_OPEN.md, ROADMAP.md.

## Commands run

Scripted exact-match replace (regex on `font-size:` and `border-radius:` values equal to a token), then `node scripts/ci/design-lint.mjs --update-baseline`, `node scripts/ci/design-lint.mjs --self-test`, `npm test`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Violations found on the base (vs baseline) | 7,697 (10 new, red) | 6,479 (0 new) | -1,218 |
| Baseline total | 7,722 | 6,479 | -1,243 |
| font-size-literal | 1,699 | 895 | -804 |
| radius-literal | 819 | 414 | -405 |
| raw-button | 425 | 423 | -2 |

The baseline also lost stale entries other sessions had already fixed (money-literal 42 to 12, em-dash 9 to 8, js-hex-literal 15 to 14). `npm test`: 1,483 pass, 0 fail, 12 skipped. Self-test ok.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Lint showed "new" violations after the replace | The baseline keys on line text, so edited lines count as new for other rules (legacy-token) | Regenerated the baseline; every rule count stayed equal or fell |

## Screens checked

Not looked at. The dev server loads but the app shows "We couldn't load Carta's travel data" in this container (data and network not available), so no real screen rendered. Only the error screen at 390 and 1366 wide was seen, and it is unchanged. The tokens equal the replaced values, so the risk is low, but a look is an owner step.

## What is still open

- T1125-a: look at Explore, Plan, Help and the press kit at phone and desktop width with data loaded.
- T1125-b: 895 font sizes and 414 radii off the scale remain; each needs a rounding decision.

## Rollback procedure

`git revert` the T1125 commit.

## Owner steps (for the checklist)

- [T1125-a] Look at the type and radius change with data | no screen could render in the cloud container | run npm run dev with data; open Explore, Plan, Help, press kit; check phone 390 and desktop 1366 | Execution/P15/T1125-type-radius.md
