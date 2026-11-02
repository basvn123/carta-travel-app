# T1008: the Itinerary, compact

## Task ID
T1008

## Date
2026-11-02

## What changed
The owner looked at T1007's Itinerary on a phone and said:
- it is too big, and a phone has to scroll too much
- Add your fare makes no sense on its own row when there is already a fare: a small action beside Book instead
- research how to show it more compactly; keep only what adds clear value, placed and designed as well as possible

**Research.** One web search. It found little on the named apps. Two points carried over:
- A stay is defined by its first and last day, so the nights sit with the dates rather than in a block of their own (the shadcn travel calendar block).
- Lodging and transport work as modular cards edited in place (a modular planner template, and TripIt's card view).

**Flight.** Three rows:
- the airline, with its day and stops under the name, beside Change flight
- the two airports with their times
- the trip's figure for the flight with what a seat is under it ("€68.00 a seat, cabin bag in"), then **Own fare** and **Book** side by side

Gone: the rail icon, the separate "Add your fare" row (it is now Own fare), the "€53.00 a person, Cabin bag €15.00" row (now one line under the figure), the date in the foot, and the hours filter. The hours are in the flight sheet's preferences behind Change flight.

**Stop.**
- The head is the number, a 44 px photo, the town and its dates on one line ("Sat 05 Dec to Wed 09 Dec"). It replaces the two Arrive and Leave tiles.
- Where you sleep (a bed icon and the select, its label kept for screen readers) and the nights stepper share the next row.
- The price row shows Beds and the figure, then the providers by name ("Booking.com ↗", "Airbnb ↗"; the full "Find on …" is the accessible name) and **Own price**.
- Add a day trip stays.
- Move up, Move down, Swap city and Remove are now icon buttons, each named for screen readers.

**Hop.** A slim row: the mode with its distance, time and figure, Change, then the ticket site by name and Own price.

**What is unchanged:** every editing function (nights with its where-from question, stay type, reorder, swap, remove, day trips, own fares and prices), the Overview, and Costs.

## Files touched
**Modified:**
- `continent-app/src/planner/TripItinerary.jsx`: StayDays removed as unused
- `continent-app/src/planner/TripSummary.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`: `tp.pass.each`, `tp.pass.withCabin`, `tp.pass.withBag`, `tp.pass.ownFare`, `tp.pass.ownPrice`

**Created:** `Execution/P15/T1008-shots/`

## Commands run
- `npx eslint`: 0 errors.
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build. Playwright ran at 390 px (touch) and 1440 px with live flights proxied, opening Itinerary for whole-screen captures and measuring item heights.
- Two rounds plus one confirming round. The first compact pass showed:
  - the stepper squeezing the town's name
  - the providers' long labels on three lines
  - a loose band at the foot of each stop

  All three were fixed before the confirmation.

## Config and secrets set
None.

## Before/after measurements
| Item height at 390 px | Before (T1007) | After |
|---|---|---|
| Flight there | 357 px | 172 px |
| A stop (Rome) | 357 px | 275 px |
| At 1440 px: flight / stop | 170 / 277 px | 170 / 236 px |
| Horizontal scroll at 390 and 1440 px | none | none |

## What broke and how it was fixed
Nothing in the app. Bash heredocs with an apostrophe failed in this session's shell, so the edit scripts were written to files first.

## What is still open
Nothing new.

## Rollback procedure
`git revert 8744e4df0a`
