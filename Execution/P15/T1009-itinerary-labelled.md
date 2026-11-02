# T1009: the Itinerary labelled, after a research round

## Task ID
T1009

## Date
2026-11-02

## What changed
The owner reviewed T1008 at 390 px and asked for:
- Own fare as big as Book
- no line between the top bar and the tabs, and none under the tabs
- no cut-off "As the trip: Entire …", and a cleaner way to show "Sat 05 Dec to Wed 09 …"
- the bed icon, Beds, its links and the stay type grouped together
- every button placed so it is crystal clear what it means, as other travel apps do it
- a more modern "Add a day trip"
- the bus section ("637 km …") made into a good transition, informed by a research agent

**Research.** A subagent searched and read pages from Wanderlog, Rome2Rio, Polarsteps, Apple's Wallet guidelines, Airbnb and TripIt. Its sources are listed below. Public sources gave nothing on the layouts of Omio, Trainline, Booking.com, Kayak or Google Travel. What was taken:
- **Between stops** (Wanderlog, Rome2Rio, Polarsteps): a slim row on the connector between two places. The mode is tappable to change it. Rome2Rio's order is mode, then time, then price, and the booking site is a separate action.
- **A stay** (Apple Wallet's labelled fields, Airbnb's and TripIt's check-in and check-out events): every value under a short label, and each thing on its own line rather than truncated.
- **Add** (Wanderlog's "Add a place" row): one add row at the end of the stay.
- **Flight foot:** two actions at the same height, side by side.

**Changes:**
- **The tabs.** No rule under them. When the tabs are scrolled to (for example after a tab is picked), they come up flush under the top bar. The "line" above them was the trip bar's shadow peeking out at a 16 px scroll margin.
- **Flight.** The figure with what a seat is on one row, then **Own fare** and **Book** as an equal pair, each half the width and 40 px tall.
- **Stop:**
  - The head is the number, the photo and the town.
  - Under it, **Check-in** and **Check-out** are the two ends, each under its label, with the nights stepper (and "nights") between them.
  - The lodging is one tinted group:
    - "Where you sleep in Rome", with its select at full width so nothing is cut off
    - Beds and the figure
    - Booking.com ↗, Airbnb ↗ and Own price
  - **Add a day trip** is a dashed full-width row with a plus disc.
  - The tools are icons, as in T1008.
- **Hop.** A dashed connector line runs between the two stops. On it sits a **Bus ▾** pill (tap it to choose another mode, as before), then "~9 h 23 min, 637 km", then the figure. Under it are the ticket site (Trainline ↗) and Own price.

## Files touched
**Modified:**
- `continent-app/src/planner/TripItinerary.jsx`: the stop's rows, the lodging group, ItinLeg's markup
- `continent-app/src/planner/TripSummary.css`

**Created:** `Execution/P15/T1009-shots/`

## Commands run
- `npx eslint`: 0 errors.
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build. Playwright ran at 390 px (touch) and 1440 px with live flights proxied: the tabs strip, the flight, a stop and the hop, as whole screens.
- A probe found the two lines (the `.ui-tabs` 1 px rule, and the trip bar's shadow at the scroll margin).
- Two rounds plus one confirmation. The first showed:
  - the flight's two actions stacking
  - the per-seat line wrapping
  - the Bus pill stretching across the row

  All three were fixed before the confirmation.

## Config and secrets set
None.

## Before/after measurements
| At 390 px | Before (T1008) | After |
|---|---|---|
| Truncated text in a stop | 2 (the stay select, the dates) | 0 |
| Own fare / Book height | 32 / 44 px | 40 / 40 px |
| Rules under or above the tabs | 2 | 0 |
| Flight item / stop height | 172 / 275 px | 200 / 387 px |

The stop is taller. That is the cost of the labels and of nothing being cut off, which the owner asked for over compactness this round.

## What broke and how it was fixed
Nothing in the app.

## What is still open
Nothing new.

## Sources (research round)
- https://wanderlog.com/blog/faq
- https://www.rome2rio.com/s/Rome/Ljubljana
- https://news.polarsteps.com/releases/planning-update-2025
- https://developer.apple.com/design/human-interface-guidelines/wallet
- https://news.airbnb.com/product-releases/airbnb-2025-summer-release/
- https://thriftytraveler.com/guides/travel/tripit-review/

## Rollback procedure
`git revert 9708c6b8e5`
