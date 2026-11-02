# T1003: Still to book as passes, and a new What it costs card

## Task ID
T1003

## Date
2026-11-02

## What changed
The owner gave full design freedom for two parts of the trip page.

**1. Still to book.** The request: swipe to see the other parts still to book; make the flight line, "BRU to FCO, Sat 05 Jun, easyJet 20:50 to 23:05, €172", structured; research how other travel apps do it.

The research was one web search. It found two patterns worth taking:
- TripIt's card view: one card per booking, swiped side by side.
- Design guides: lay a collapsed card out for the decision, and keep the operational facts ahead of decoration.

No source described a boarding-pass layout, so that anatomy follows how airline apps show a pass.

The block is now `BookPasses`:
- **One pass per part not yet booked**, side by side. On a phone they swipe and snap, and the next card shows at the edge. From 600 px two show at a time.
- **Flight pass.** The airline's mark and name, and the date. Below that the two airports large, each with its time, and a dashed line with the plane between them.
- **Stay pass.** The bed type and the nights, the town large, then Check-in and Check-out as the two ends.
- **Hop pass.** The two towns, with the bus, train or ferry on the line between them.
- **Under a notched perforation:** the figure and Book, which opens the operator's site.
- **The segment row** is both the booked count and the pager. There is one segment per part: booked parts are lagoon, and the card in view is umber. Tapping a segment brings its card in.
- **The count** now reads the same rows as the cards. Before, `bookedCount()` said "0 of 5" over 7 segments.

**2. What it costs.** The request: fully redesign it. It was busy and unstructured. The owner asked for no white background, a different visual from the two line bars, Carta colours and a modern look. They also asked for custom icons in the breakdown, Stay and Food linked to the Lifestyle with the figure changing live, and the airline mark on Flights with a way to change the flight.

`CostCard` is rewritten:
- **The card.** Umber, the same ground as the Carta's own trips door, with its sun glow.
- **The arc.** The total sits inside a half arc, and the arc is the breakdown. Flights are sun, Getting around lagoon, Stay sand and Food terracotta. The arc draws in on arrival, and each length moves to its new value when a figure changes. It replaces both the cost bar and the budget bar.
- **The budget.** It is one centred line: the gap shows as a pill, sun when over budget. Edit budget sits under it.
- **The four groups** are always open. The Breakdown toggle is gone. Each group's mark is a disc in its arc colour.
  - **Flights** shows the airline's own marks on white discs and their names. A tap opens the flight sheet, the same `ChangeFlight` the Itinerary opens.
  - **Stay and Food** show the Lifestyle's bed and its way of travelling, each with a pencil. A tap opens the Lifestyle panel. On desktop the panel opens on the left and the card stays in view, repricing as you choose.
  - **Getting around** opens its group in the Costs tab.
- **The foot:** Costs (the full receipt) and Add what you paid.

**Found on the way.** `62-home-story.css:146` sets `.is-food { background: var(--lagoon-600) }` with no scope. That is why the old breakdown's Food row was teal in the owner's screenshot. The new card uses `tpc-k-*` class names, so the rule does not reach it.

## Files touched
**Modified:**
- `continent-app/src/planner/trip/CostCard.jsx` (rewritten)
- `continent-app/src/planner/trip/ReadyToBook.jsx`: `bookRows()` rows carry a `pass` object with the pass's own fields
- `continent-app/src/planner/TripSummary.jsx`
- `continent-app/src/planner/TripSummary.css`: the `.tpc` block and the `.tpg-next` block replaced
- `continent-app/src/planner/TripPlannerTab.jsx`: passes `onChangeFlight`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`: `tp.pass.in`, `tp.pass.out`, `tp.pass.of`

**Created:**
- `continent-app/src/planner/trip/BookPasses.jsx`
- `Execution/P15/T1003-shots/`

## Commands run
- `npx eslint` on the touched files: 0 errors. One warning predates this task (ReadyToBook exports a function beside a component).
- `npm test`: 1204 of 1204 pass.
- A NOPUBLIC build went into the scratchpad and a static server served it.
- Playwright opened a seeded Rome and Ljubljana trip at 375 and 1440 px. The flight answers and fare files were proxied from carta-europetravel.com, because the local server has none.
- It shot the passes, the pager after a tap on its second segment, the cost card, and the Lifestyle panel opened from the Stay row before and after picking a hostel.
- Two rounds. The first showed:
  - the global `.is-food` and `.is-around` leaks
  - the count and segment mismatch
  - the figures out of line
  - the ground arc's round ends showing
  - the airline logos cropped

  All five were fixed before the second round.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| Parts to book visible from the Overview | 1 (the next one) | all not yet booked (5 on the test trip) |
| Taps to see the four cost groups | 1 (Breakdown) | 0 |
| Stay figure after picking Hostel in the Lifestyle panel opened from the card | not reachable from the card | €1,165 to €342, live, panel open |
| Horizontal scroll at 375 and 1440 px | none | none |

## What broke and how it was fixed
- The new rows first took global `.is-food` and `.is-around` backgrounds. The card's classes were renamed to `tpc-k-*`.
- The header said "0 of 5 booked" over 7 segments. The count now comes from the same rows as the passes.

## What is still open
- **T1003-a.** `62-home-story.css:146` styles every `.is-food` on the page lagoon. It should be scoped to the home story. That file is outside this task.
- **T1003-b.** On desktop the Lifestyle panel's scrim dims the cost card while it reprices. It is readable, but not crisp. On a phone the sheet covers the card, so the new figure shows when the sheet closes. A later task could lift the card above the scrim, or put a live total in the panel.

## Rollback procedure
`git revert 499fe4440e`
