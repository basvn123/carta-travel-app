# T1007: the Itinerary and Costs tabs in the Overview's language

## Task ID
T1007

## Date
2026-11-02

## What changed
The owner asked whether the Itinerary and Costs tabs follow T1003 to T1006, and to update them if not. They added: update only those two tabs, and keep the Overview exactly as it is.

**Itinerary** (still the place for editing: nights, where you sleep, reorder, hours, airports, fares):
- **A known flight is a pass:**
  - the airline's mark and name, with Change flight, in the item's head
  - the two airports large with their times, and Direct or the stops on the line between them
  - the ticket a person and the bag a person
  - Add your fare
  - one foot: the date, the figure for the trip, and Book (named "Find on Google Flights" for screen readers)
  - the hours filter, as before
- **The repeated sentence is gone** ("easyJet, 20:50 to 23:05, Sat 05 Jun"), and so is the shared FlightRow's "Prices may have changed" note. A flight that is still loading, unknown or missing keeps the FlightRow.

**Costs:**
- **On a phone** the tab opens on the cost card. From 1024 px the card is in the side column already.
- **The receipt** under the card drops its own head, budget band and two-colour bar, because the card says those once.
- **The receipt's groups** carry the card's colours: sun, lagoon, sand and terracotta.
- **Change** is a small pill.

**The teal Food row.** `62-home-story.css` styled `.is-fly`, `.is-bed` and `.is-food` with no scope. Those rules are now scoped to the home story's bar (`.hm-row-track > …`). This closes T1003-a: no element on the Costs tab is lagoon any more (measured, 0).

The Overview is untouched.

## Files touched
**Modified:**
- `continent-app/src/planner/TripItinerary.jsx`
- `continent-app/src/planner/TripSummary.jsx`: the Costs tab body on a phone
- `continent-app/src/planner/TripSummary.css`
- `continent-app/src/styles/62-home-story.css`

**Created:** `Execution/P15/T1007-shots/`

## Commands run
- `npx eslint` on the touched JSX: 0 errors.
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build. Playwright ran at 390 px (touch) and 1440 px with live flights proxied, opening Itinerary and Costs and taking whole-screen captures.
- The home page's bar was not shot; its three rules only gained a parent selector.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| Teal `.is-food` elements on the Costs tab | 1 (the Food group) | 0 |
| Times a flight's airline, times and date are written in its Itinerary item | 2 | 1 |
| Horizontal scroll, Itinerary and Costs, at 390 and 1440 px | none | none |

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new. T1003-a is closed.

## Rollback procedure
`git revert f97c8f81dc`
