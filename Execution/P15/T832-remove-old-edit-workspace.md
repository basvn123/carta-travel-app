# T832: remove the old half-screen edit workspace

## Task ID

T832

## Date

2026-10-29

## What changed

The owner asked to remove the old edit layout (row T830-a). TripPlannerTab now has two layouts:
- a trip with stops always shows the trip page, which opens the trip wizard over itself as its sheet;
- a trip with no stops, planned or not, shows the empty planner.

The old `plan-ws` workspace is deleted, along with everything only it used:
- the list and map grid;
- the phone map drawer;
- the total bar under the map;
- the stop peek on the map;
- the old head card;
- the planned footer and the edit footer;
- every `.plan-ws` CSS rule.

Two things that lived only in the old footer were kept:
- **Replan route and Start over** moved to a round More button on the trip page's top row, opening downward.
- **The 48 px Plan button on each day row** is now scoped to the trip page's Days tab (`.tpg .itin-day-plan-btn`).

`scripts/verify_planner_t8.mjs` now looks for `.tpg`.

## Files touched

**Modified:**
- `continent-app/src/planner/TripPlannerTab.jsx`
- `continent-app/src/styles/planners/67-v6-tripplanner.css`
- `continent-app/src/styles/planners-held.css`
- `continent-app/scripts/verify_planner_t8.mjs`

**App commit:** T832 on `p15-trip-page-v3`.

## Commands run

- `npm test`
- ESLint on the touched files
- The NOPUBLIC fast build (`wt/vite.pf2-batch.mjs`)
- `node wt/v3-walk.mjs 5830`
- `node wt/v3-carta.mjs 5830`

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Lines in the three app files | | | -387 net (33 added, 420 removed) |
| `.plan-ws` rules in the CSS | 39 | 0 | -39 |
| `npm test` | 997 of 997 | 997 of 997 | 0 |
| End walk | 124 of 124 | 130 of 130 | +6 checks: More shows Start over, no `.plan-ws` on the page, at three widths |
| Carta's trips walk | 42 of 42 | 42 of 42 | 0 |

## What broke and how it was fixed

- **Start over and Replan route lost their only door** when the footer went. Fixed with the round More button on the top row.
- **The text More button opened upward** off the top of the page. It now opens downward in its round form.

## What is still open

The path where "Plan a trip here" opens the wizard over an existing trip was not walked. It now opens over the trip page instead of the old workspace (T832-a).

## Rollback procedure

`git -C continent-app revert` the T832 commit. No data or schema change is involved.
