# T844: no "Google Flights, checked" line on the trip page's flight cards

## Task ID

T844

## Date

2026-10-29

## What changed

The owner answered register row T840-a in chat ("Remove it there too"). The route's flight cards on the trip page no longer show "Google Flights, checked {date}".

- `FlightRow` takes `showChecked`, on by default, so Explore, the destination and trip pages and Ask Carta are unchanged. The trip page's route turns it off.
- The link out to Google Flights stays, with its "prices may have changed".
- This follows the rule as amended in T840: carta-design no longer requires the line.

## Files touched

**Modified:**
- `continent-app/src/components/flights/Flights.jsx`
- `continent-app/src/planner/TripItinerary.jsx` (kept CRLF)
- `Execution/P15/T840-T843-walk/walk-b.mjs` (two checks added)

**Created:**
- `Execution/P15/T840-T843-walk/walk-t844.json`

## Commands run

- ESLint on both files: 0 errors.
- `npm test`: 1023 of 1023.
- NOPUBLIC fast build.
- `walk-b.mjs` at 390 and 1440 on the build plus `public/`: 54 of 54, no page or console errors. It includes "no checked line on the route", "the route still links out to Google Flights" and "no checked line in the sheet".

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

None. Other screens still show the line where FlightRow is used without `showChecked={false}` (Explore's price card, the destination and trip pages, Ask Carta). The owner named the route's card only.

## Rollback

- continent-app: `git revert 6b0f02b`.
- Root: revert the T844 commit.

Branches: continent-app `p15-trip-page-v4-b` (`6b0f02b`) and the root `p15-trip-page-v4-b`. Not merged.
