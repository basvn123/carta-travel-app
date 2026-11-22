---
status: accepted
date: 2026-11-22
decided-by: the owner, with Claude
run: .work/2026-11-22-mytrips-levelup/
---

# 0016 · My trips in ink and photo: larger photos, line and ink controls, no beige

## Context
After 0015 the owner still saw "beige slop" in My trips: the selected chip's wash, the sunken seg wells, the price-move pills, the grey tiles of Today and the extremes, the watch cards. The photos were small (the Saved row was 72 x 64 on a phone). He asked for a visual level-up that keeps every function: larger photos, minimal text, umber brown, no beige, no teal, no gradients, smooth and clean on phone and desktop.

## Options considered
1. **A. Postcards.** A large photo grid, tickets, postmarks and an overprint.
2. **B. Tiles.** Every figure as a tile scale, like the rating; one frame control and one section head.
3. **C. Atlas chapters.** Saved grouped into country chapters, a passport row, a compass for the extremes, umber 800 slabs.

The three critics (hierarchy, brand, accessibility) split their rankings, but all recommended the same core: one section head, one frame control for two-way choices, an outlined chip with a tick, ink price moves on their own line, a dashed "no price" cell, A's photo grid for Saved, C's compass, tiles only where a count is capped.

## Decision
We chose **"Ink and photo"**, a combination (decision.md in the run). The owner approved it ("je kan uitvoeren") with amendments: clean bars instead of stacked cells, no counts on the sub-tabs, no helper line under the charts, minimal text throughout.

- **Every list is photo-led.** Saved places and past trips are 4:3 photo cards, two across on a phone and three across beside the map; Reizen rows carry a 4:3 photo (120 x 90 to 160 x 120).
- **Every control is ink and line** (`atlas/Ink.jsx`, `styles/73-mytrips-ink.css`): `SectHead`, `Frame2` (an inset umber 800 outline at radius 6, the chosen cell in the action paint, 44 px cells), `MoveInk`, `NoPrice`, `GradeCells`.
- **The rating's tile language is kept** for the grade (ten cells, "9/10" printed) and the food plan on the Uitgaven page (ten tiles, the figure printed).
- **Charts:** solid bars on one baseline; a picked year is ringed, never the others dimmed; an empty month is a tick.
- **The extremes:** a drawn compass rose with the four places at its points, on every width.
- **No beige and no sunken fill** in My trips and the Uitgaven page. Kept on purpose: the map's year ramp and wish hatch, the journey line's pills, the year card's own art, the rating's paper cells.

House-style exceptions (the owner's yes in the artifact):
1. Inside My trips the chosen chip is an umber 800 outline with a tick, not the beige wash (`DESIGN.md` "Colour rules").
2. Frame controls (two-way choices, the grade, the value scales) use radius 6; chips stay pills.

Refused: umber 800 as a fill for a chosen state; the Score as an ink ruler inside My trips only. The Score plate stays black, app-wide.

## Consequences
- **Good:**
  - The photos are about five times larger on a phone (171 x 128 against 72 x 64), and the controls speak one language.
  - The desktop Saved list is shorter (4418 against 5098 at 1440).
- **Bad or costs:**
  - Saved on a phone is longer: 5697 against 4993 at 390 (+14 %, within the 15 % cap). To meet the cap, the Score shares the figure line and a place drops its kind word ("Plek").
  - Jouw Europa stays at its old length only because the cost rows became a tight ledger, the charts are a little shorter and a past trip's move against the estimate shows when it is opened, not on the card.
  - Today's doors as rows make Reizen during a trip 33 px longer on a phone (971 against 938).

## How we'll know it works
- `verify_mytrips.mjs` stays at 0 fail in all six languages, and `verify_spend.mjs` at 0 fail.
- No beige wash or sunken fill reappears in `.mt-panel` (grep `--select-bg`, `--umber-100`, `--surface-sunken` in `73-mytrips-ink.css` and the My trips rules).
- The owner reads My trips as "smooth, clean" on phone and desktop.
