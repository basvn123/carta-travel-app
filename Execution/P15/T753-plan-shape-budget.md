# T753: What kind of trip takes several answers, and the budget is one figure for the whole trip

## Task ID

T753 (P15), on branch `p15-plan-lifestyle-step` in the root repo and in `continent-app/`, stacked on T750 to T752. Not merged and not on a preview: the owner is batching changes.

## Date

2026-10-27

## What changed

The owner (through `/impeccable`): "What kind of trip?" should take several answers and a no-preference answer; "Do you have a budget?" should be more professional and aligned, the traveller fills in their own price, for the whole trip only, and the line "Bed and food for one person. Carta marks what fits." goes.

- **What kind of trip?** is a multi-pick (`g:shape`, `multi`, `none: 'any'`) with a sixth answer, No preference, which it opens on and which clears the others, the same behaviour the Avoid question has. The settings keep the answers in a new `guide.shapes` array; `guide.shape` stays, derived (the one shape when exactly one is picked), so older readers and saved trips keep working, and an older trip's single shape is read into `shapes`. The pace the wizard's quiz gets reads all of them: any of road trip, several countries or one way means moving; only one place means a base; otherwise a few stops. The free-text prefill's "road trip" sets `shapes` too.
- **Do you have a budget?** asks one thing: the whole trip, a person. A large figure in a white field with the euro sign before it (the sign taken from the one money formatter, never a literal), grouped as it is typed, tabular; the label "For the whole trip, per person" centred under the title, since the removed line was what said "for one person"; six quick amounts (€500 to €4,000) as an even grid, three across on a phone and six from 769 px, each filling the field; Continue (enabled once there is a figure) and No set budget as a quiet text button. The A day / For the whole trip switch is gone; a day budget saved earlier opens empty. New settings default to `kind: 'total'`; `budgetCheck` already handles both kinds.
- Keys: `pf.o.shapeAny`, `pf.budget.label`, `pf.budget.quick` added; `pf.q.budgetHelp`, `pf.budget.day`, `pf.budget.total`, `pf.budget.upTo` removed; six languages.

## Files touched

**Modified:** `continent-app/src/planner/flow/questions.js`, `continent-app/src/planner/flow/tripSettings.js`, `continent-app/src/planner/flow/prefill.js`, `continent-app/src/planner/flow/setupScreens.jsx`, `continent-app/src/styles/86-plan-flow.css`, `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`.

**Created:** none. **Deleted:** none.

## Commands run

`npm test` (833 pass), `node scripts/ci/design-lint.mjs` (nothing new in touched files), `npx eslint` (no errors), the NOPUBLIC build, `node scripts/css-routes.mjs --check` (no plan-flow problem), two Playwright rounds at 390×844 and 1440×900 through Help me choose: What kind of trip opens on No preference, takes two picks, No preference clears them; the budget has no help line and no switch, a quick amount fills the field (1,200), typing 21500 shows 21,500 and enables Continue. No page error.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

The first build showed "€0" before the figure and would have zeroed a five-digit amount: a shell heredoc ate the backslashes of the two regular expressions (`\d`, `\D`), a gotcha already in memory; both were fixed in the editor and a five-digit figure checked. The field first drew both a brown border and the focus ring; it keeps the ring only. A grey placeholder at that size failed contrast; it is `--text-3`.

## What is still open

T743-a stands. This branch is not merged and has no preview yet, at the owner's word.

## Rollback procedure

`git revert` the T753 commit in `continent-app/` and in the root repo (T750 to T752 stay). Saved trips keep `guide.shape`, so a revert reads them as before. No data or schema change.
