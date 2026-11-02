# T1010: the Itinerary's lodging and hop, tightened

## Task ID
T1010

## Date
2026-11-02

## What changed
The owner reviewed T1009 at 390 px:
- the bus icon sits outside its button, and the whole hop section needs optimising
- "Where you sleep in Rome" must be more compact, professional and clean

**Hop.** One white card on the dashed connector between the two stops:
- the mode, with its icon inside the control ("Bus ▾"; tap it to choose another mode, as before), and the figure on the right
- the time and distance under the mode
- after a hairline, the ticket site and Own price as chips

The icon had sat outside because of an old `.itin-leg-glyph { margin-left: -10px }` from the rail design; it is reset on the trip page. The card now spans the row: the base `.itin-hop` rule's `justify-content: space-between` had packed its grid column to the content's width (210 of 358 px, measured).

**Lodging.** Two rows under a hairline, with no label block and no tinted box:
- the bed's kind as a pill, "🛏 Entire place ▾", and the figure on the right. The pill is a native select laid over its own words, so it opens the system picker and is named "Where you sleep in Rome" for screen readers. When the stop sleeps the trip's way, the pill shows the trip's kind. A stay of your own reads "Your own stay".
- Booking.com ↗, Airbnb ↗ and Own price as chips

## Files touched
**Modified:**
- `continent-app/src/planner/TripItinerary.jsx`: the lodging's top row; the hop's card wrapper
- `continent-app/src/planner/TripSummary.css`

**Created:** `Execution/P15/T1010-shots/`

## Commands run
- `npx eslint`: 0 errors.
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build, Playwright at 390 px (touch) and 1440 px. A layout probe found the packed grid column.
- Two rounds plus one confirmation.

## Config and secrets set
None.

## Before/after measurements
| At 390 px | Before (T1009) | After |
|---|---|---|
| Stop height | 387 px | 314 px |
| Lodging rows | 4 (label, select, Beds, links) | 2 |
| Hop card width | 210 px (packed) | full row (310 px) |
| Hop mode icon | outside its control | inside |

## What broke and how it was fixed
Nothing in the app.

## What is still open
Nothing new.

## Rollback procedure
`git revert a034599c55`
