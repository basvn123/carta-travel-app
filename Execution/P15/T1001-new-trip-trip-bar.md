# T1001: New trip without a tile, and a trip bar that never cuts a value

## Task ID
T1001

## Date
2026-11-02

## What changed
The owner sent two screenshots with two requests:
1. New trip: remove the white background, and let Carta's own trips grow wider, closer to the plus.
2. In the trip bar, When ("Sat 05 Jun to Sat 12...") and Stay ("Entire place, Easygoi...") were cut off. Show the same facts without cutting them.

Fixes:
- **New trip.** It has no background and no shadow. It is the brown plus disc, now 44 px with a soft shadow, and the words "New trip", straight on the page ground. At every width the row is `auto 1fr`, so the umber door takes all the space New trip does not need. At 375 px New trip is 115 px wide and the door is 216 px. At 1440 px they are 127 px and 1069 px.
- **Trip bar.** A cell can have a value line and a quiet second line, and neither line ends in an ellipsis any more.
  - When shows "5 Jun to 12 Jun" over "Sat to Sat, 7 nights". If fewer nights are planned than the dates allow, the second line says so ("5 of 7 nights planned").
  - Stay shows the bed ("Entire place") over the way of travelling ("Easygoing").
  - The screen reader label reads both lines.
  - The new `useLifestyleParts()` hook returns the two words. `useLifestyleLabel()` now builds its string from it, so every other caller is unchanged.

## Files touched
**Modified:**
- `continent-app/src/planner/TripSummary.jsx`
- `continent-app/src/planner/TripSummary.css`
- `continent-app/src/planner/planHooks.js`
- `continent-app/src/styles/planners/90-plan-home.css`

**Created:** `Execution/P15/T1001-shots/` (Plan home and the trip bar at 375 and 1440 px)

## Commands run
- `npx eslint` on the touched files: 0 errors.
- `npm test`: 1204 of 1204 pass.
- A NOPUBLIC build went into the scratchpad and a small static server served it, falling back to `public/`. Playwright opened a seeded Julian Alps trip (`#trip=` link), measured and shot the trip bar, then opened the Plan home and shot its head, at 375 and 1440 px.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| Trip bar cells that cut their text (375 px) | 2 of 4 (When, Stay) | 0 of 4 |
| New trip background | `--surface` with `--elev-1` | transparent |
| Carta door width, 375 px | about 55% of the row | 216 of 343 px (63%) |
| Horizontal scroll at 375 and 1440 px | none | none |

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new. T998 to T1001 wait for a deploy, which the owner runs or allows.

## Rollback procedure
`git revert c5cc0fca03`
