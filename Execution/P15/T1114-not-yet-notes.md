# T1114: The thin-bed and not-yet notes on every price screen (ROADMAP D10, row T1075-c)

## Date

2026-11-06

## What changed

The "Few listings measured" and "Not yet measured" notes that only the destination price card showed now show on the trip page, the Plan day receipt, the Ask place card and the Explore cards (grid and rails), from one rule and one component. `priceNotes()` (`lib/price/notes.js`) decides, from the engine row's own lines, whether a bed is thin and which parts have no figure; `components/PriceNotes.jsx` draws them (`ThinBedNote`, `NotMeasuredValue` and a caption line `PriceNotes`). The destination price card now uses the same rule and components instead of its own copy. The trip page merges the rows of every stop (each note once), the receipt reads the stop row the day figures come from, and Ask and Explore read the card's cost row. No figure or total moves. Owner decision 2 (show "Not yet measured" on the destination page) is met: the notes use their own classes, never `.not-yet`, so the 2026-10-30 hide rule gives way for price parts only.

## Files touched

- Created: `continent-app/src/lib/price/notes.js`, `continent-app/src/components/PriceNotes.jsx`, `continent-app/tests/priceNotes.test.mjs`, this report.
- Modified: `src/browse/DestPriceCard.jsx`, `src/browse/ExploreCards.jsx`, `src/browse/ExploreRails.jsx`, `src/browse/ask/AskTripCard.jsx` (UI only; no Ask function touched), `src/planner/DayCost.jsx`, `src/planner/DayPlannerTab.jsx` (one line: `row: costRow` in the day cost), `src/planner/trip/CostCard.jsx`, `src/styles/86-price-items.css`, the six `src/i18n/*.js` (`price.noteBed`, `price.noteMissing`), `docs/HANDBOOK.md` (Destination price card step 8), `ROADMAP.md` (D10 status).

## Commands run

```
npm ci --ignore-scripts    (continent-app)
node --test tests/priceNotes.test.mjs tests/priceThin.test.mjs
npx eslint <touched files>
npm test
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Price screens showing the notes | 1 (destination card) | 5 (plus trip page, receipt, Ask card, Explore cards) | +4 |
| App tests | 1,387 run (est.) | 1,395 run, 1,383 pass, 12 skipped, 0 fail | +8 |
| Any displayed figure | unchanged | unchanged | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First test run failed to import `react` | `continent-app/node_modules` was not installed in the container | `npm ci --ignore-scripts` |
| The browser check could not run | the dev server shows "We couldn't load Carta's travel data": the shipped data is not reachable in this container | owner step T1114-a |

## Screens checked

Not checked in the browser. The dev server started but the app could not load its data here (load-error screen), so no card rendered. Checked by tests instead: one test per screen renders the shared component with the row that screen passes and pins that the screen's source passes it. The end check must look at: an Explore card (grid and rail), the Ask place card, the trip page cost card (side column and Overview), and the day receipt sheet, each at 375 and 1440 wide, for a caption of at most two short lines under the price that does not move the total or crowd the card; and a Dutch pass for string length. The carta-design seven questions were answered in text only: the note is a quiet caption (`--text-2`, caption size), honest about money, no new token or colour.

## What is still open

- T1114-a: the browser look above.
- Row T1075-c is closed by this task and T1075-d is decided by owner decision 2 (show it); the orchestrator should move both to `_OPEN-CLOSED.md` (this session only appends).
- On an Explore card every place without a local fare says "Local transport: not yet measured", which is nearly every card until fares exist (T1075-b). If that reads as noise on cards, the owner may want the transport note on the destination page and trip only; that is one prop in `ExploreCards`/`ExploreRails`.

## Rollback procedure

`git revert` the T1114 commit. No data or schema change.

## Owner steps (for the checklist)

- [T1114-a] Look at the price notes on four screens | the container could not load app data, so no screen was seen | npm run dev; open an Explore card (grid and rail), an Ask place card, a trip page and a day receipt; check 375 and 1440 wide; check Dutch | continent-app/src/components/PriceNotes.jsx
