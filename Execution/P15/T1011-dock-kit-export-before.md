# T1011: the dock, the trip kit, Export & share and Before you go

## Task ID
T1011

## Date
2026-11-02

## What changed
The owner asked for four things:
1. **The dock.** Keep it fixed, but with no white background and no line between it and the footer. Show only one Change your trip on the page. Drop the sublines from the Change your trip sheet.
2. **Colour.** Make Export & share, Your trip kit and Before you go more colourful (in Carta's style), modern and dynamic, and check they are correct.
3. **The kit.** Remove Notes (they have their own tab), keep the packing list, and move expenses to Costs. Everything that stays must earn its place.
4. **Before you go.** Make it easy to digest and swipeable on a phone.

**Research.** A subagent searched TripIt, Wanderlog, KAYAK, Sherpa, PackPoint, QuickPack, Voyager and Terra Firma. Booking.com, Airbnb, Hopper, Google Travel, Polarsteps and Tripadvisor published no layout detail. What was taken:
- **Sharing:** one Share door, with the other exports under it (TripIt, Wanderlog, KAYAK). No app used coloured tiles, so the colour here comes from the Carta card and its marks.
- **Packing:** a count with a thin bar (QuickPack).
- **Before you go:** a fixed set of short country facts, each with a one-line answer (TripIt's International Travel Tools; Voyager and Terra Firma).
- **Expenses:** spending sits beside costs (Wanderlog's Budget/Expenses tab).

No source documented a swipe row for country facts; that format is Carta's own.

**Changes:**
- **The dock.**
  - The page's own ground fades in under the two buttons: no white band, no rule, no shadow. Each button carries its own small shadow.
  - The bottom nav's top line turns transparent while the dock is up.
  - Change your trip is the dock's on a phone and the top row's from 1024 px. It is never a tool as well; the Overview's tools row keeps Export & share.
- **The Change your trip sheet** shows names only.
- **The kit** is two rows, Bookings and Packing list. Each has a tinted mark (lagoon, sun), its state ("0 of 5 booked", "Not started") and a progress bar once there is something to count. Notes and Expenses are no longer kit tools.
- **Expenses** sit on the Costs tab under the receipt (the same ledger).
- **Export & share** is an umber card:
  - **Share trip** is the cream primary, with **PDF** beside it.
  - Under them, chips with coloured marks: Copy trip link (lagoon), Add to calendar (sun), Google My Maps (terracotta), Open in Google Maps (sand).
  - The "More ways to export" fold is gone, since every way out is now in view.
- **Before you go:**
  - Each card has a topic mark in its colour: best time in sun, getting around in lagoon, car in umber, food in terracotta, don't-miss in sun, good-to-know in lagoon, tips in umber.
  - Each card shows the topic and country, the short answer, and at most three lines of detail. Show all lists them in full.
  - The cards swipe on a phone, with a segment pager under them like the passes. A tap on a segment brings its card in; Previous and Next show only for a mouse.
  - **Correctness:** a card whose body only repeats its title drops the body (for example, the car card whose title and body were both the tolls).

## Files touched
**Modified:**
- `continent-app/src/planner/TripSummary.jsx`
- `continent-app/src/planner/TripSummary.css`
- `continent-app/src/planner/TripItinerary.jsx`
- `continent-app/src/planner/TripPlannerTab.jsx`: the Costs panel carries expenses
- `continent-app/src/planner/CheapTipsSection.jsx`
- `continent-app/src/planner/trip/ChangeTripSheet.jsx`

**Created:** `Execution/P15/T1011-shots/`

## Commands run
- `npx eslint`: 0 errors. One warning predates this task (ChangeTripSheet's `Icon`, a false positive).
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build. Playwright ran at 390 px (touch) and 1440 px with live flights proxied, shooting:
  - the Overview's end with the dock
  - the Change your trip sheet
  - the kit, Export & share and Before you go
  - a touch swipe on Before you go (it moved 316 px)
  - Costs with Expenses
  - a count of visible Change your trip buttons
- Two rounds. The first showed:
  - a second Change your trip on desktop
  - an older rule beating the three-line clamp
  - a half-width lone tool

  All three were fixed in the second round.

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Visible Change your trip buttons, 390 / 1440 px | 2 / 2 | 1 / 1 |
| Kit tools | 4 (bookings, packing, notes, expenses) | 2 (bookings, packing) |
| Expenses | a kit tool on the Itinerary | a section on Costs |
| Before you go on a phone | Previous / Next buttons and "1 of 8" | swipe, plus a segment pager |
| Touch swipe on Before you go | not measured | 316 px, snapped to the next card |

## What broke and how it was fixed
Nothing in the app.

## What is still open
- **T1011-a.** The expense ledger on Costs is still the old form (two traveller fields, a stack of inputs). It works, but it was not redesigned in this task.

## Rollback procedure
`git revert 1f9390bb1e`
