# T749: "What have you booked already?" gets its plane icon and loses "Carta plans around it"

## Task ID

T749 (P15), branch `p15-plan-booked-step` in the root repo and in `continent-app/`. Follows T748.

## Date

2026-10-27

## What changed

The owner (2026-10-27): remove "Carta plans around it." and give "Flights or train" an icon like the other options.

- **The plane icon.** `questions.js` already named `PlaneIcon` for the flights option, but ChoiceRows looks icons up in `components/Icons.jsx`, and the only `PlaneIcon` lived in `components/TransportIcons.jsx` (stroke 1.7), so the row drew nothing. `Icons.jsx` now has its own `PlaneIcon` in the kit's glyph frame (stroke 1.5, the same plane drawing), so it matches the bed, the car and the ticket beside it. Every other icon name the planner steps use (42) was checked against `Icons.jsx`; the plane was the only one missing.
- **The help line** reads "Pick all that apply." in six languages (the second sentence removed).

## Files touched

**Modified:** `continent-app/src/components/Icons.jsx`, `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (`pf.q.bookedHelp`).

**Created:** none. **Deleted:** none.

## Commands run

`npm test` (833 pass), `npx eslint` and `node scripts/ci/design-lint.mjs` on `Icons.jsx` (clean), the NOPUBLIC build, a Playwright pass at 390×844 to the booked step (five rows, five icons, the help line shortened, no page error), `npm run build:pages` and a Pages preview deploy.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

Nothing broke.

## What is still open

T743-a stands. Not deployed to production.

## Rollback procedure

`git revert` the T749 commit in `continent-app/` and in the root repo, rebuild, redeploy.
