# T751: Who can see it as three chips, the invite sentence removed, and an empty route that does not look like loading

## Task ID

T751 (P15), on branch `p15-plan-lifestyle-step` in the root repo and in `continent-app/`, stacked on T750. Not merged and not on a preview: the owner is batching changes.

## Date

2026-10-27

## What changed

The owner (through `/impeccable`): remove "Once the trip is saved, send them a link to plan together."; make the "Who can see it" dropdown cleaner; and, mid-task, the three grey bars on the new trip's page "feel like something needs to load still", find a cleaner way.

- **Who can see it?** The native `<select>` on Create trip and in Trip settings is replaced by one shared control, `planner/flow/VisibilityChoice.jsx`: the three answers as kit choice chips with a glyph each (a lock for Only me, two people for Friends, a link for Anyone with the link), the selected one in the one selected state with its tick. On Create trip it sits in its own card under an eye and "Who can see it?", set like the Travel buddies row beside it. The settings sheet uses the same chips under its label.
- **The invite sentence** under Travel buddies is gone, with its key in six languages.
- **The empty route.** The trip's page before any stop showed three grey skeleton rows. It now shows one dashed slot under the start, joined to the start's dot by a dashed line: a map pin, "No stops yet", "Start planning to add the places on your route." The dashed outline reads as a place to fill; nothing on the page looks unfinished. Six languages.
- The unused `.pf-select`, `.pf-field-label` and `.pf-home-empty` rules are removed (`css-routes --check` flagged the dead `.pf-field-label`).

## Files touched

**Modified:** `continent-app/src/planner/flow/setupScreens.jsx`, `continent-app/src/planner/flow/TripSettingsSheet.jsx`, `continent-app/src/planner/flow/TripFlow.jsx`, `continent-app/src/styles/86-plan-flow.css`, `continent-app/src/styles/planners/86-plan-flow.css`, `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (`pf.create.inviteLater` removed; `pf.home.noStops`, `pf.home.noStopsSub` added).

**Created:** `continent-app/src/planner/flow/VisibilityChoice.jsx`. **Deleted:** none.

## Commands run

`npm test` (833 pass), `node scripts/ci/design-lint.mjs` (nothing new in touched files), `npx eslint` (clean), the NOPUBLIC build, `node scripts/css-routes.mjs --check` (no plan-flow problem), Playwright at 390×844 and 1440×900 through the setup to Create trip (three chips, picking the third marks it, the invite sentence absent) and on to the new trip's page (the dashed slot, no skeleton rows), no page error.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

The first pass set "Who can see it?" at the lead size, larger than the Travel buddies row beside it; it is the button text size now.

## What is still open

T743-a stands. This branch is not merged and has no preview yet, at the owner's word.

## Rollback procedure

`git revert` the T751 commit in `continent-app/` and in the root repo (T750 stays). No data or schema change.
