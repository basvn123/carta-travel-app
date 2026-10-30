# T905: the phone header with the logo and Account, three places below

## Task ID

T905, branch `p15-phone-chrome`.

## Date

2026-10-30

## What changed

The owner sent two crops of the Plan home board's phone frame: the top row with the logo and the account icon, and the bottom nav with Explore, Plan and My trips. They asked for this placement on every tab on a phone.

Below 769 px, `AppHeader` used to be hidden (T496). It now shows as one slim row: the Carta logo on the left and the account door on the right. Its place links and Explore's search slot stay hidden there. `BottomNav` drops its Account slot and keeps Explore, Plan and My trips in three equal columns.

The top bar is measured into `--filter-h`, so every page under it moves down with the new row. From 769 px nothing changes.

## Files touched

**Modified:**

- `continent-app/src/components/BottomNav.jsx`
- `continent-app/src/styles/60-v6-shell.css`
- `continent-app/src/styles/10-shell.css`

## Commands run

eslint, design-lint, `npm test`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Bottom nav slots on a phone | 4 (Explore, Plan, My trips, Account) | 3 | -1 |
| Header on a phone | none | one 56 px row (logo, account) | +56 px of chrome at the top |

## What broke and how it was fixed

Nothing.

## What is still open

The whole app could not run in this session: its travel data would not load ("We couldn't load Carta's travel data"). The end check therefore rendered only `AppHeader` and `BottomNav` in a harness (`continent-app/__t906/`, deleted), at 390 and 1280. The real tabs on a phone still need one look:

- Explore's map under the new row;
- the Plan flow's sticky foot;
- the day planner's drawer;
- full-screen pages that cover the bar.

This is register row T905-a.

## End check screens

The header and bottom nav at 390 (the new row and three slots) and 1280 (unchanged).

## Rollback procedure

`git revert` the T905 commit.
