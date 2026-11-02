# T1006: a more compact route, and the price change as a mark

## Task ID
T1006

## Date
2026-11-02

## What changed
The owner reviewed T1005's route on a phone and asked:
- make it even more compact
- remove the cut-off "Getting there"
- place the Find on link more cleanly
- give Add what you paid a place in the section that takes little space
- add margin at the right
- remove "4 nights, Entire place" from the stay card
- make Change flight look good on a phone
- show the "€… more for the trip" more nicely and shorter, with a colour and an icon

**Flight card.** The airline's mark and name, and Change flight. Below, the two airports with their times, and "Direct" (or "1 stop") under the plane on the line between them. "Getting there" is gone.

**Stay card.** A 40 px photograph and the town, then check-in and check-out. The nights and the bed are gone from the card; they stay in the cost card and the trip bar.

**Hop card.** Only the two towns, with the mode between them. The duplicate "Bus to Ljubljana" header is gone.

**Every card ends in one row:** To book or Booked, the figure ("yours" beside a typed figure), and Book with an external mark. Book's accessible name is the old link's label, for example "Find on Google Flights".

**Add what you paid** is one quiet action beside "Your route". It goes to the Itinerary's paid fields, the same place the cost card's action goes. The per-card fields are gone from the Overview.

**Change flight.** Each flight row now shows its effect on the total as a pill: an arrow and the signed figure, "+€34" on terracotta when the trip costs more, "-€12" on lagoon when less. The full sentence ("€34.00 more for the trip") is the pill's accessible name.

**The right margin.** On a phone the route keeps the page's 16 px gutter on both sides: measured at 390 and 408 px, the card's right edge is 16 px from the screen's. The edge-to-edge look in the owner's image came from T1005's screenshot, which was cropped to the section's own box. This task's screenshots are whole phone screens.

## Files touched
**Modified:**
- `continent-app/src/planner/trip/Journey.jsx`
- `continent-app/src/planner/trip/ChangeFlight.jsx`
- `continent-app/src/planner/TripSummary.jsx`
- `continent-app/src/planner/TripSummary.css`

**Created:** `Execution/P15/T1006-shots/` (whole screens at 390 px touch and at 1440 px, and the Change flight sheet)

## Commands run
- `npx eslint` on the touched files: 0 errors.
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build. Playwright ran on an emulated phone (390 px, touch) and at 1440 px, with flights proxied from the live site. It took whole-screen captures of the route, the rest of the route, and Change flight opened by a tap.
- Two rounds. The first showed the duplicate hop header, which was removed before the second.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before (T1005) | After |
|---|---|---|
| Flight card height at 390 px | about 336 px | about 182 px |
| Card gutter at 390 px, left of the rail / right | 16 px / 16 px | 16 px / 16 px |
| Price change in Change flight | "€34.00 more for the trip" | "▲ +€34" pill |

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new.

## Rollback procedure
`git revert 5199d5698b`
