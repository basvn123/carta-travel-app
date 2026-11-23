---
status: accepted
date: 2026-11-22
decided-by: the owner, with Claude
run: .work/2026-11-22-mytrips-wow/
---

# 0015 · My trips speaks the map's language: the journey line, the wish hatch, past trips under the map

## Context
After 0013, the map was the strongest thing on every My trips tab, and everything beside it was text and rows. The owner asked for a final pass: "more visual traits, more design, more dynamic, more graphic, a wow on phone and desktop". Users should scroll less, and Eerdere reizen should sit under the map. The Today header ("Lisbon, Vandaag, dag 4 van 6, Je slaapt in Lisbon, Nog niets gepland") had to become clearer and more appealing.

## Options considered
1. **A. Cartographic, atlas-led.** The map and the route lead; one journey line recurs on every screen.
2. **B. Editorial, photo-led.** Big photos and big type, photo fans, a horizontal strip of past trips.
3. **C. Data-graphic, instrument-led.** Day dials, a country ring, heat strips, spend donuts.

Two critics (brand and generic look; hierarchy, scroll and accessibility) both ranked A first:
- B reads as any travel app, its photo credits are unverified, and its Today header breaks in the 540 to 620 px column.
- C reads as a fitness dashboard, and its 43-slot ring creates collect-them-all pressure.

## Decision
We chose **A, with B's countdown numeral and hover fan.** The owner approved the prototype ("perfect ga ervoor!!").

- **The journey line** (`atlas/JourneyLine.jsx`) is the one recurring object:
  - pills as long as the nights, and a bead per day;
  - done days filled, today the screen's one saffron mark (with an umber-800 ring), days to come outlined.
  - It appears on Today, on the next-trip card, and on the Uitgaven page, where each bead is sized by that day's own share.
- **Today:**
  - the place on a signpost plate with its flag, then the journey line with "Dag n van m";
  - one fact line: the weather, and "Nog n nachten";
  - nothing planned: "Vandaag ligt nog open", with a dotted path from the bed to Plan vandaag;
  - a plan: the day as a drawn route.
- **Bewaard:** hatched means "want", filled means "been". A been country keeps its fill with the hatch drawn over it.
- **Jouw Europa:**
  - the map fills year by year once a session. The count chip shows its final figure at once: a figure moves only when the traveller changes it.
  - From 1100 x 720, Eerdere reizen lives under the map in a labelled scroll region. The left column comes first in the DOM, and page scroll is never trapped.
  - The extremes form a compass, and milestones and grades are ink stamps.
- **Every function kept.** The phone tabs are no longer than before.

## Consequences
- **Good:**
  - Each tab has one authored moment on a tab change, never at first paint, and reduced motion shows the end state.
  - The desktop Europe column is about half as long.
- **Bad or costs:**
  - The past list under the map is a nested scroll on desktop.
  - The milestone stamp is 96 px wide to fit the longest German name.
  - Phone Jouw Europa stays long, because every chart stays.

## How we'll know it works
- Travellers share screenshots of Today and Jouw Europa.
- `verify_mytrips.mjs` stays at 0 fail in all six languages, including its flow placement and stamp-spill checks.

## Amendment 2026-11-22: the flow layout
The owner found Eerdere reizen under the map cramped (a short scroll region at 1180 x 800), the trip log a repeat of the past list, and the right side of every tab empty below the map. So:
- Eerdere reizen no longer sits in the map slot. From 1100 px each tab has a hero beside the map and a rest under both, at full width.
- The trip log is folded into Eerdere reizen, which sorts by year or by grade.
- Saved's followed prices and lists span the width above the rows and the sticky map.
- Cost: the left column is no longer one long scroll beside a fixed map. The nested scroll region and its `pastBeside` hook are gone.
