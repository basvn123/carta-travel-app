# T999: one ground, no seams, and the Plan home's two tiles

## Task ID
T999

## Date
2026-11-02

## What changed
The owner sent three screenshots with three requests:
1. Remove the line under My trips' tab bar.
2. Remove the line between the top bar and the page, and make their colours exactly the same.
3. The New trip and Carta's own trips tiles look off: New trip has too much white space. Check them on a phone too.

What was measured live:
- On desktop the top bar drew a 1 px `--border` hairline on every place.
- Plan stood on `--plan-ground` (`--umber-50`, rgb 250 246 241), while every other place, the top bar and the page outside `.pf` stood on `--surface-page` (rgb 246 245 242). That left a visible seam wherever Plan met them.
- On New trip, the kit `Button` wrapped the plus disc and the words in `.btn-label`, so the disc stacked above the words in a tile half the row wide.

Fixes:
- **One ground.** `--plan-ground` is `--surface-page`. `DESIGN.md` is updated in the same commit. The `body:has(.pf) .top-bar` rule from T988 is gone, because it is no longer needed.
- **No line under the top bar.** A top bar with no settings band under it has no bottom rule at any width, not only on a phone. Explore's filter band keeps its own rule.
- **No line under My trips' tabs.** The `.mt-tabs` hairline is removed. The brown underline still marks the open tab.
- **The two tiles.**
  - New trip passes its disc as the button's `iconStart`, so the 36 px disc sits beside the words and the content is centred.
  - On a phone the row is split 1 : 1.25, both tiles 64 px tall.
  - From 560 px New trip is as wide as its words and the Carta door takes the rest; from 769 px both are 72 px.

## Files touched
**Modified:**
- `continent-app/src/planner/flow/PlanHome.jsx`
- `continent-app/src/styles/planners/90-plan-home.css`
- `continent-app/src/styles/01-tokens.css`
- `continent-app/src/styles/60-v6-shell.css`
- `continent-app/src/styles/70-mytrips.css`
- `DESIGN.md`

**Created:** `Execution/P15/T999-shots/` (375, 600 and 1440 px)

## Commands run
- `npx eslint`: 0 errors.
- `npm test`: 1204 of 1204 pass.
- **Visual check.** The weekly pipeline was writing into `public/`, so the Vite dev server answered nothing. Instead:
  - A build without `public/` (a temporary config, removed afterwards) went into the scratchpad.
  - A small static server served it, falling back to `public/` for the data.
  - Playwright then measured Plan and My trips at 375, 600 and 1440 px.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before (live) | After |
|---|---|---|
| Top bar bottom rule, desktop | 1 px | 0 px |
| Top bar colour on Plan / page under it | rgb(250, 246, 241) / rgb(250, 246, 241), page outside `.pf` rgb(246, 245, 242) | rgb(246, 245, 242) / rgb(246, 245, 242) |
| My trips tab bar rule | 1 px | 0 px |
| Horizontal scroll at 375, 600, 1440 | none | none |

## What broke and how it was fixed
Nothing in the app. The Vite dev server could not serve a page while the pipeline ran, and stopping an old dev-server process was refused by the session's safety check. Process 23328, a dev server this session started, still listens on port 5188. The owner can end it.

## What is still open
Nothing new. T998 (pushed, not deployed) and T999 wait for a deploy, which the owner runs or allows.

## Rollback procedure
`git revert f1e14b1c81`. This brings back the cream Plan ground, both hairlines and the half-and-half tiles.
