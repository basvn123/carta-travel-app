# T748: the planner steps lose the map, and the first step its booking sentence

## Task ID

T748 (P15), branch `p15-plan-no-map` in the root repo and in `continent-app/`. Follows T747.

## Date

2026-10-27

## What changed

The owner (2026-10-27): remove "Or add a booking and Carta reads it." from the first step; remove the map on desktop and phone, it serves no purpose; the same for the next steps that show the map.

- **No map on any planner step.** `PlanStage` (T654) drew `TripMap` behind every step of PlanFlow (trip kind, the eight setup questions, Create trip) and of TripFlow. Neither ever passed it a stop, so it was always an empty map of Europe. It is gone from the component, so no step loads MapLibre, the map chunk or a single tile any more (checked: 0 map requests through three steps).
- **The new stage.** Every step stands on the Plan place's warm paper (`--plan-ground`, now the background of the whole `.pf` page, not only the opening): straight on the paper on a phone, and on a white card (520 px, 640 px for a list of places, `--radius-sheet`, `--elev-2`) centred on the page from 769 px. The phone's grab handle and the sheet that overlapped the map are gone. The settings button sits on its own row above the step on a phone (it had stood over the map) and in the page's top right corner from 769 px; it never covers the step's close button (checked by position at 390 and 1440).
- **"Tell Carta about your trip"** now reads "Where, when, who and what you like." in all six languages; the Add a booking button below it stays.

## Files touched

**Modified:** `continent-app/src/planner/flow/PlanStage.jsx`, `continent-app/src/styles/86-plan-flow.css` (`.pf` ground, the `.pf-map` rules removed), `continent-app/src/styles/planners/86-plan-flow.css` (the stage block), `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (`pf.q.tellHelp`), `DESIGN.md`.

**Created:** none. **Deleted:** none.

## Commands run

`npm test` (833 pass), `node scripts/ci/design-lint.mjs` (nothing new in touched files), `npx eslint` (clean), the NOPUBLIC build (`wt/vite.t743.mjs`), `node scripts/css-routes.mjs --check` (no plan-flow problem), Playwright at 390×844 and 1440×900 through Start planning, the trip-kind sheet, "Tell Carta about your trip" and "What have you booked already?", with and without a trip in progress. No page errors, no horizontal scroll, no map request. Then `npm run build:pages` and a Pages preview deploy.

Before this task the working tree was left showing T746's files by a root `git checkout main` that failed on "unable to write symref for HEAD: Permission denied" after T747's commit. With the owner's approval the T747 paths were restored from the commit (`git restore --source=HEAD`), both repos were switched to main and master, and T748 branched from there.

## Config and secrets set

None.

## Before/after measurements

| Measure | Before | After |
|---|---|---|
| Map requests on the planner steps | MapLibre, the TripMap chunk and basemap tiles on every step | 0 |

## What broke and how it was fixed

Nothing broke.

## What is still open

T743-a stands. Not deployed to production.

## Rollback procedure

`git revert` the T748 commit in `continent-app/` and in the root repo, rebuild, redeploy. No data or schema change.
