# T750: "How do you like to travel?" holds the whole Lifestyle, compact on a phone

## Task ID

T750 (P15), branch `p15-plan-lifestyle-step` in the root repo and in `continent-app/`. Follows T749. Not merged and not on a preview: the owner will add more changes first.

## Date

2026-10-27

## What changed

The owner (through `/impeccable`): on a phone make the choice buttons smaller and cleaner, desktop at Claude's discretion; add a button to fine-tune the counts; say cleanly that this can be changed later in trip settings; make sure everything from the Lifestyle is here.

- **A step of its own.** The planner's sleep step rendered `LifestyleChoices` (two questions, shared with the old trip wizard's Who step). It now renders `planner/flow/LifestyleStep.jsx`, which holds everything the Lifestyle panel (`browse/LifestylePanel.jsx`) holds, in its order: where you sleep and which kind, how you spend, getting there, and the seven counts. It reads and writes the same `choices.stay_tier`, `choices.lifestyle` and `choices.transport_mode`, so Explore, the panel and every price move with it. The wizard keeps `LifestyleChoices`, untouched.
- **Getting there** (any way, plane, train, bus, car) is new on this step, as kit choice chips with the settings line's icons. No other planner question asked it (`g:reach` asks how far, not how).
- **Fine tune the counts:** a quiet secondary button that opens the seven counts behind the spend (dinners out, casual meals, fast food, cook-at-home days, drinks at bars, coffees a day, club nights) with the per week / per day switch, on the shared Stepper. The cadence switch and its rounding are the panel's own (`toCadence`, `PERIOD_FIELDS`, `COFFEE_MAX`, now exported from `LifestylePanel.jsx`). "Tuned by hand" shows under the spend tiles when the counts match no preset, as in the panel.
- **The later line:** "You can change all of this later in Trip settings.", caption size, a settings glyph, in six languages, naming the settings button by its own label in each.
- **Size.** A phone shows compact rows, the icon beside its word, 48 px high (were 80 px): sleep three across, spend two across. From 769 px the tiles keep the kit's icon-over-word shape at 76 px, three across for both.

## Files touched

**Modified:** `continent-app/src/planner/flow/setupScreens.jsx` (SleepScreen renders LifestyleStep), `continent-app/src/browse/LifestylePanel.jsx` (three helpers exported), `continent-app/src/styles/86-plan-flow.css` (the step's rules), `continent-app/src/styles/planners/86-plan-flow.css` (the old `.pf-life` rule removed), `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (`pf.sleep.later`).

**Created:** `continent-app/src/planner/flow/LifestyleStep.jsx`. **Deleted:** none.

## Commands run

`npm test` (833 pass), `node scripts/ci/design-lint.mjs` (nothing new in touched files), `npx eslint` (no errors; LifestylePanel's fast-refresh notice now covers three more exports, as it already did for its others), the NOPUBLIC build, `node scripts/css-routes.mjs --check` (no plan-flow problem), Playwright at 390×844 and 1440×900 to the step, closed and with Fine tune open: 7 counts, 5 way chips, tiles 48 px on a phone and 76 px on desktop, no horizontal scroll, no page error.

## Config and secrets set

None.

## Before/after measurements

| Measure | Before | After |
|---|---|---|
| Choice tile height on a phone | 80 px | 48 px |
| Lifestyle settings reachable on the step | 2 of 4 (sleep, spend) | 4 of 4 (sleep, spend, getting there, counts) |

## What broke and how it was fixed

Nothing broke.

## What is still open

T743-a stands. This branch is not merged and has no preview yet, at the owner's word.

## Rollback procedure

`git revert` the T750 commit in `continent-app/` and in the root repo. No data or schema change.
