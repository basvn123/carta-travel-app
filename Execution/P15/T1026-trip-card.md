# T1026: the place page's price card becomes one interactive trip card

## Task ID
T1026

## Date
2026-11-03

## What changed
The owner asked for three things:
- "Getting there from Belgium" closer to "What a day costs", integrated if possible
- a nicer card than "What a day costs", based on research
- the card interactive: change flights, change stays

Two research agents ran first:
- **Traveller research** (Rome2Rio, Omio, Kayak, Booking-style trip totals): show the real total early, as one anchor. Price and time decide the mode, so the ways there are rows to compare, with the cheapest and fastest marked, and picking one changes the total. The breakdown is shown, but under the choices.
- **Code audit:** the card priced only the flight, while "Getting there" listed train and car on its own, so the two never added up. No test pinned either.

**The card** (`DestPriceCard.jsx`, now "Your trip"):
- **Band:**
  - the dates and party pills
  - the trip's total for the party (40 px)
  - under it, a person and a person a day
- **Getting there from {home}:**
  - every way that prices (plane, train, bus, car), each a radio row with its time and its return price a person
  - Cheapest (sun) and Fastest badges
  - picking a way puts it in the total
  - on the plane: "Flight details" (the two flight passes and Book) and "Change flight" (the existing flight sheet: another home airport, or your own fare)
- **Where you sleep:** the stay types this place prices (`tiersAt`), as chips. They set `choices.stay_tier`, the same choice the Lifestyle panel holds, so every price follows.
- **The lines of the total:** the way there, the stay (type), food and drink (travel style), and "Total for N people". Stay and food still open Lifestyle.
- **Dropped:** the half-arc gauge and the four rows. "Plan one day here" moved under the primary as a quiet link.

**The page** (`DestinationPage.jsx`):
- The "Getting there" section and its jump pill leave wherever the card shows. A place with no day price keeps the section, because the card does not render there.
- The phone section title is now "Your trip" (`destx.dayCosts`, all six languages; this page is its only user).

**The engine** (`lib/price/nights.js`): `quoteNights` takes a seventh argument, `way = { mode, total }`. A train, bus or car pick stands where the flight would. The plane, or a way without a price, keeps the flight as before.

## Files touched
**Modified:**
- `continent-app/src/browse/DestPriceCard.jsx`, `DestinationPage.jsx`
- `continent-app/src/lib/price/nights.js`
- `continent-app/src/styles/88-place-template.css` (+ `.tcard*`; − `.ccard.dpc`, `.dpc-trip`, `.dpc-flt-toggle`, `.dpc-marks`)
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (+5 keys `tc.*`; `destx.dayCosts` retitled)
- `continent-app/tests/destPrice.test.mjs` (+1 test)

**Created:** `Execution/P15/T1026-shots/` (gitignored)

## Commands run
- `npm test`: 1219 pass, 0 fail (+1, the way-there test).
- `eslint` on the touched files: 0 errors, 0 warnings.
- `impeccable detect`: no findings.
- Browser: `npx vite --port 5219`, then Playwright on `#dest=FCO` at 390 × 844 and 1440 × 1000, with no page errors at either width.
  - **Phone, first open:** €2,125 for 2 people, 7 nights. The plane is picked (Cheapest, €98 return each).
  - **Picking the train:** the total goes to €2,642, and the first line reads "Train €714".
  - **Picking "Dorm bed":** the total goes to €1,624, and the stay line reads €560.
  - Flight details shows 2 passes. Change flight opens the flight sheet.
  - The Getting there section and its jump are gone; the section title is "Your trip".
  - No sideways scroll.
  - Fixed after the first round:
    - the open "Flight details" button went cream on cream
    - the flight's time line broke mid-figure in the 1440 side column

  Both were confirmed fixed in the second round.
- `/simplify` was not run for this task (see What is still open).

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Ways there in the card's total | plane only | the one picked (plane, train, bus, car) |
| Taps to change the stay type from the price card | 2 (open Lifestyle, pick) | 1 (chip) |
| Separate sections for cost and getting there | 2 | 1 |
| Rome total, 2 people, 7 nights, plane | €2,125 | €2,125 (unchanged default) |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| "Flight details" unreadable when open | The quiet button's pressed fill is cream | The card's own colours on every state |
| "2 h 5 / min" broke in the side column | One text run with no break point | The time and duration wrap as whole parts |

## What is still open
- **T1026-a:** `/simplify` (four review agents) did not run on this diff. Run it before the next card change.
- **T1026-b:** train, bus and car prices are estimates (`est: true` in the line), while the flight is a found fare. The card does not say which is which. Decide whether the estimate needs a word ("about").
- **T1026-c:** the plan tab's cost card (`planner/trip/CostCard.jsx`) still uses the arc. Decide whether it follows this card or stays.

## Rollback procedure
`git revert` the T1026 commit (root repo only; `continent-app/` is tracked in the root here). The arc card and the separate Getting there section come back.
