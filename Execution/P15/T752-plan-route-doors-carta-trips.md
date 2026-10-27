# T752: Plan your route, the country picker in Explore's language, and one page for Carta's own trips

## Task ID

T752 (P15), on branch `p15-plan-lifestyle-step` in the root repo and in `continent-app/`, stacked on T750 and T751. Not merged and not on a preview: the owner is batching changes.

## Date

2026-10-27

## What changed

The owner (through `/impeccable`): the doors title "How do you want to choose where?" is not professional; remove its line and the three option lines; "I know where I want to go" must not offer Help me choose again (that door has its own questions) and its choose-by-hand picker must take Explore's styling (the cards, the buttons, how grid and map are switched); "Start from a ready trip" becomes the custom Carta trips door, and it and the Plan opening's Carta's own trips lead to one new, very professional page of all of Carta's predefined trips.

- **The doors.** "Plan your route", with three options and no lines under them: Help me choose, I know where I want to go, Use one of Carta's own trips. The page's line under the title is gone too.
- **I know where I want to go** opens the wizard's Where step locked to the picker (`lockWhereTab`, TripFlow to TripPlannerTab to GuidedTripWizard to StepWhere `whereTabs={false}`): no Help me choose / Choose by hand tabs, no quiz line. Help me choose behaves as before.
- **The picker in Explore's language.** Each country is the kit Card in its tile layout, as Explore's rails draw places: the photograph, a round brown tick on it once picked plus the one selected state, the flag and the full name, the shortlist count, what a day costs from, and the info button as a round surface button in the corner. The grid is `auto-fill` from 156 px. Grid and map switch with Explore's one pill (T592): in the grid it offers Map, on the map it offers List, with the icon of where it goes; from 1024 px the map already stands in the right column and the pill does not show.
- **Carta's own trips** (`planner/flow/CartaTrips.jsx`), one page for two doors: the Plan opening's button and card (PlanFlow screen `carta`) and the trip's third door (TripFlow phase `carta`), each with a back button to where it came from. Carta's mark and the title; what every trip includes, as four quiet tiles (planned day by day, where to sleep, how to get there, what each day costs); the fifteen styles as choice chips after All (one swipe row on a phone, wrapped from 769 px); "In season now", the six cheapest weeks in season this month as a band to swipe; then every week as the journeys library's own trip card (photographs to swipe, the full title, where, the towns, the best months, From €X a person a day, the flight chip when the sweep has one), in season first then cheapest, 24 at a time with Show more trips. A card opens the whole week (`openFeature('journey')`), now also from the trip planner (App `openJourneyPage`, stable, to TripPlannerTab to TripFlow).
- Keys: `pf.doors.title`, `pf.doors.ready` rewritten; `pf.doors.help`, `guideSub`, `guideFlightSub`, `knowSub`, `readySub` removed; `pf.carta.*` added, in six languages.

## Files touched

**Modified:** `continent-app/src/App.jsx`, `continent-app/src/planner/TripPlannerTab.jsx`, `continent-app/src/planner/GuidedTripWizard.jsx`, `continent-app/src/planner/wizard/StepWhere.jsx`, `continent-app/src/planner/flow/TripFlow.jsx`, `continent-app/src/planner/flow/PlanFlow.jsx`, `continent-app/src/planner/flow/PlanHome.jsx`, `continent-app/src/styles/86-plan-flow.css`, `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`.

**Created:** `continent-app/src/planner/flow/CartaTrips.jsx`. **Deleted:** none.

## Commands run

`npm test` (833 pass), `node scripts/ci/design-lint.mjs` (nothing new in touched files), `npx eslint` (no errors), the NOPUBLIC build, `node scripts/css-routes.mjs --check` (no plan-flow problem), two Playwright rounds at 390×844 and 1440×900: the opening's button opens Carta's own trips (4 included tiles, 16 chips, 6 in season, 24 cards, a style filters the grid); a trip created through the setup reaches "Plan your route" (three options, no help line); I know where opens the picker with no tabs and no quiz line (43 country tiles, a tap picks one, the Map pill on a phone); the third door opens the same Carta page and its back button returns to Plan your route. No page error.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

On a phone the style chips first wrapped six rows deep: the kit's `.ui-chip-group` sets `flex-wrap: wrap`, so the page's row now overrides it explicitly. Long country names (Bosnia and Herzegovina) were cut; the tiles take the kit's `card-wrap`. `css-routes --check` then flagged two of the page's selectors as able to clash with the planner sheets (`.pf-carta-rail > *` and a `.card-body` padding): the rail now names `.jcard`, and the padding rule is gone (the kit's tile padding stays).

## What is still open

T743-a stands: a week of Carta's own trips opens its written plan but cannot yet be loaded into the planner as a route, because the journeys wire carries no catalogue stops. The wizard's old ready-trip mode (`buildMode: 'ready'`, composed trips) is no longer reached from the doors; its code stays. This branch is not merged and has no preview yet, at the owner's word.

## Rollback procedure

`git revert` the T752 commit in `continent-app/` and in the root repo (T750 and T751 stay). No data or schema change.
