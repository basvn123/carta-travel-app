# T1019: the place page's price card in the plan tab's language

## Task ID
T1019

## Date
2026-11-03

## What changed
The owner asked that the place page's "What a day costs" card become "clean, more structured, optimized, production ready, no redundant text", and that it follow how the plan tab (Overview, Itinerary) presents costs and flights.

The card is now the plan tab's umber cost card:
- **Inputs:** the dates and travellers are two cream pills on the card. Each opens its picker (the calendar, or the stepper) on a white sheet inside the card. The Stay field is gone: the Bed and Food rows say the bed and the way of travelling and open the Lifestyle, as on the plan tab.
- **The day:** the day figure for a person ("€154 a person a day") stands inside the half arc. The arc is the day's split, in the cost card's colours.
- **Split rows:** the plan tab's rows, each with a colour disc, the label, its Lifestyle subline with a pencil, and the figure.
- **The trip at these inputs:** "7 nights", then Flights with the airline's mark (a tap shows the passes), then "Total for 2 people" in bold.
- **The flights:** the itinerary's passes (the airline and day, BRU 20:50 to FCO 23:00 on the dashed line, the party's figure and a seat's). One line under them says where the price is from and that it may have changed, with one Book button.
- **The foot:** "Or plan one day here" and "Add your fare".
- **The primary:** "Plan a trip here" stays under the card from 1024 px; below that the foot bar carries it.

Removed as redundant:
- the Dates, Travellers and Stay box
- the thin bars
- the "Google Flights, checked" line under each leg (now said once)
- the separate "View this return on Google Flights" link and its note
- "Cabin bag" fee rows (the pass says "cabin bag in")

**Bug fixed: the way home before the way out.** In the owner's screenshot, home was 12 Jan and out was 16 Jan. `cheapestReturn` (`lib/flights/flights.js`) picked the month's cheapest flight out and cheapest flight home independently.
- It now picks the cheapest pair with home after out, in one linear pass, and of equal prices the shorter trip.
- The exact-dates path (`sweptNear`, used by `roundTripNear` and `lib/price/flight.js`) gained an `after` guard for the same reason.
- Rome now pairs 17 Jan with 20 Jan for the same €196.

**Shared pieces (from `/simplify`):**
- The umber card's CSS moved from `planner/TripSummary.css` to `styles/92-cost-card.css`, and the pass's to `styles/93-flight-pass.css`. Both are loaded by `styles.css`.
- The card's prefix was renamed `.tpc` to `.ccard`. The Explore trip card in `86-plan-flow.css` also used `.tpc` / `.tpc-hit`, so the plan tab's cost card had been inheriting that card's hover lift and `content-visibility`.
- `components/CostCardKit.jsx` (`CostArc`, `CostRow`) serves both cost cards.
- `PassHead` and `PassEnds` (`components/flights/Flights.jsx`) serve the itinerary and the place card.
- `stopsText` and `checkedLabel` now live in `lib/flights/flightText.js`.
- The dead `.dprice` rules were deleted.

Departures from the carta-design contract, under the 2026-10-30 design-freedom decision: the umber card with its sun glow, and the cream-on-umber text. Both are the plan tab's, already approved by the owner (T1003).

## Files touched
**Modified:**
- `continent-app/src/browse/DestPriceCard.jsx`
- `continent-app/src/planner/trip/CostCard.jsx`: uses `CostArc` and `CostRow`; `.ccard`
- `continent-app/src/planner/TripItinerary.jsx`: `PassHead` and `PassEnds`
- `continent-app/src/planner/TripSummary.css`: the cost card and pass rules moved out
- `continent-app/src/components/flights/Flights.jsx`
- `continent-app/src/lib/flights/flights.js`, `continent-app/src/lib/price/flight.js`
- `continent-app/src/styles.css`, `styles/88-place-template.css` (`.dpc`), `styles/64-v6-destination.css` and `styles/74-flights.css` (dead `.dprice` rules)
- `continent-app/tests/flights.test.mjs` (3 tests)

**Created:**
- `continent-app/src/components/CostCardKit.jsx`
- `continent-app/src/lib/flights/flightText.js`
- `continent-app/src/styles/92-cost-card.css`, `continent-app/src/styles/93-flight-pass.css`
- `Execution/P15/T1019-shots/` (Rome `FCO` at 375 and 1440: the card, Flights opened, the dates sheet)

## Commands run
- `npx eslint` on the touched JS: 0 errors. One warning, the known destructured-`Icon` false positive.
- `npm test`: 1212 pass, 0 fail.
- `impeccable detect` on the changed UI: `[]`.
- `/simplify`, four review agents. Fixed: the pass shared, the row shared, the existing helpers reused, the sheets loaded from `styles.css`, the `is-plain` modifier, one sidebar padding rule, the dead `.dprice` CSS, a linear `cheapestReturn`, the exact-date guard, the tuple map, `useAirlines` once.
- Browser: `npx vite --port 5219`, then Playwright on `#dest=FCO` at 375 and 1440, with the data host's flight files proxied (it does not answer localhost). Two rounds. The first showed:
  - the row figures 30 px short of the trip figures
  - the way home picked 19 days after the way out on an equal fare

  Both were fixed. Final round: no page errors, no sideways scroll; the primary is hidden below 1024 px and shown at 1440.

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Lines of text on the card (Rome, flights shown) | 21 | 12 (passes behind Flights) |
| "Google Flights" / "may have changed" lines | 3 | 1 |
| Way home before way out (Rome, year mode) | 16 Jan out, 12 Jan home | 17 Jan out, 20 Jan home, same €196 |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The way home before the way out | `cheapestReturn` paired the month's two cheapest legs independently | Cheapest pair with home after out; `after` guard in `sweptNear` |
| The plan tab's cost card lifted on hover | `.tpc` was also the Explore trip card's class | Prefix renamed to `.ccard` |
| A white border around the umber card | The legacy `.dprice` rule | Class dropped; the dead rules deleted |
| Row figures 30 px short of the trip figures | The cost card's chevron column | `ccard-rows is-plain` modifier |
| 17 Jan to 5 Feb picked on an equal fare | Ties went to the longest gap | Ties prefer the shorter trip |

## What is still open
- **T1019-a (owner).** With Carta's default dates, the card prices the year's cheapest return. The pill says 5 to 12 Dec, while the passes show January. This predates this task (T663, the bed's date mode). Should default-date flights follow the shown dates?
- **T1019-b.** Copies of the stops text remain in `TripItinerary.jsx`, `TravelLegsSection.jsx`, `ChangeFlight.jsx`, `Journey.jsx` and `finderText.js`. `Journey.jsx` keeps its own ends markup. They should point to `lib/flights/flightText.js` and `PassEnds`.
- **T1019-c.** `scripts/verify_destination_page.mjs` still reads `.dprice`, `.dprice-lines` and `.dprice-day`, which T912 and this task removed. Point it at `.dpc`.
- **T1019-d.** `roundTripNear` (`lib/flights/flights.js`) and `flightLegs`' exact branch (`lib/price/flight.js`) do the same pairing. Merge them.
- **T1019-e.** The plan tab's cost card after the `.ccard` rename was checked statically only (no `tpc` left in `CostCard.jsx` or the sheet), not in a browser: a planner trip could not be seeded here. Look at it in the next end check.

## Rollback procedure
`git revert` the two T1019 commits (the flight pairing fix and the card). No data or schema change.
