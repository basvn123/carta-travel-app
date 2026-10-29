# T848: the Costs head is the total for the party only

## Task ID

T848

## Date

2026-10-29

## What changed

The owner answered register row T845-a in chat ("Remove it"). On the Costs tab, the receipt's head now reads "Total for 2 people" under the figure, without "€1,048.83 a person, €150 a person a day", as the Overview band does since T839 (board panel 3).

The receipt keeps that line where it is not grouped (other screens' receipts), so only the trip page's Costs tab changes.

## Files touched

**Modified:**
- `continent-app/src/planner/PlanTotal.jsx`
- `Execution/P15/T845-T847-walk/walk-c.mjs` (one check added)

**Created:**
- `Execution/P15/T845-T847-walk/walk-t848.json`

## Commands run

- ESLint: 0 errors.
- `npm test`: 1023 of 1023.
- NOPUBLIC fast build.
- `walk-c.mjs` at 390 and 1440 on the build plus `public/`: 46 of 46, no page or console errors. It includes "no a person line on the Costs head".

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

None.

## Rollback

`git revert` the T848 commit in continent-app (branch `p15-trip-page-v4-c`) and in the root. Not merged.
