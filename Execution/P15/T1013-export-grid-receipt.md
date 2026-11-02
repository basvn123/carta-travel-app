# T1013: Export & share structured, the Costs receipt aligned

## Task ID
T1013

## Date
2026-11-02

## What changed
The owner asked for two things:
1. **Export & share:** align it better, give it more structure, and make Share trip smaller.
2. **The Costs receipt:**
   - more Carta-like colours
   - better line heights
   - each line's price aligned with its label (Food and drink sat higher than its price)
   - no price shown twice
   - optimal and clean

**Export & share:**
- The title and a compact Share trip (a 36 px umber pill) share one row.
- Under them, an even two-column grid of warm tiles: Download as PDF, Copy trip link, Add to calendar, Google My Maps and Open in Google Maps. Each tile is a coloured mark and its words on one centre line.

**The Costs receipt** (the trip page's Costs tab):
- **Alignment.** Each line's words and figure sit on one centre line. Rows were top-aligned beside a 44 px Change button; the label-to-figure centre offset is now 0 px on every line, measured at 390 and 1440 px.
- **No price twice.** A group with one line says its figure once, on the group's head. That line keeps its words and Change. Groups with several lines (Flights: there and home) keep each line's figure.
- **Carta colours.** Totals are in umber 800. Change is a small umber-50 pill with umber text. Line icons are umber. The one-more-night note sits on sun.
- **Line height.** Rows are at least 52 px and group heads 52 px, with labels at body size and group names at lead size.

## Files touched
**Modified:**
- `continent-app/src/planner/PlanTotal.jsx`: a one-line group's figure once
- `continent-app/src/planner/TripItinerary.jsx`: the export card's head and tiles
- `continent-app/src/planner/TripSummary.css`

**Created:** `Execution/P15/T1013-shots/`

## Commands run
- `npx eslint`: 0 errors.
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build. Playwright ran at 390 px (touch) and 1440 px:
  - the export card
  - the Costs receipt, top and lower half
  - each line's label-to-figure centre offset
  - the figures per group (2, 0, 0, 0: Flights keeps its two)

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Line label vs figure centre offset | label higher (top-aligned) | 0 px on all 5 lines |
| Single-line groups showing their figure twice | 3 | 0 |
| Share trip | full-width row button, 44 px | 36 px pill beside the title |

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new.

## Rollback procedure
`git revert a0142c3503`
