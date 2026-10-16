# T434 critique, before (2026-10-16)

Method: dual-agent. Assessment A (design review) and Assessment B (detector and browser evidence) ran as isolated sub-agents and did not see each other's output; a third sub-agent ran the impeccable `audit`. Their full write-ups are `assessment-a-before.md`, `assessment-b-before.md` and `audit-before.md` in this folder. Screenshots: `../T434-shots/before/` (360, 390, 820 and 1440 px, taken from a worktree of app HEAD 05c36df).

## Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Tab counts contradict their sections (Planned 3 against "Your upcoming journeys 2"); the record map is a blank box while it loads |
| 2 | Match with the real world | 2 | "Tap the star" where the save control is a bookmark; trips, journeys, plans, record and shortlist on one page |
| 3 | User control and freedom | 3 | Undo instead of confirm works well |
| 4 | Consistency and standards | 1 | Pre-Lagoon skin: grey cards on grey, tinted tiles instead of the kit, a 40 px h1, arrows in date ranges, seven stylesheets |
| 5 | Error prevention | 3 | |
| 6 | Recognition rather than recall | 2 | A planned trip shows a town's day rate, never the trip's price |
| 7 | Flexibility and efficiency | 2 | No filters on any tab; no way from the shortlist to a trip |
| 8 | Aesthetic and minimalist design | 2 | Captions on every shelf, an empty Day plans shelf, a friends table that explains it is not a ranking |
| 9 | Error recovery | 3 | |
| 10 | Help and documentation | 2 | |
| | **Total** | **22/40** | Acceptable |

Audit: **10/20** (accessibility 2, performance 2, responsive 2, theming 2, implementation 2).

## Where the two assessments agree, and what the detector added

- **Money rules (A P0, audit P1-9).** `SavedCost` prints `€69 a day` with no tilde or "est." and adds the retired word "national". Planned trips show the cheapest town's day rate while the Trip planner shows the trip total.
- **A different design system (A P1, B, audit theming).** `.saved-shell { --bg-card: var(--paper-dim) }` greys every card; the view switch is three tinted tiles on a phone and pills in an empty side panel on desktop; about 120 literal px sizes; legacy alias tokens. The meter: 24 raw buttons in SavedTripsPanel, 70 across the surface's JSX; 17-saved-trips.css carries 125 font-size literals, 72 radius literals and 366 legacy token reads.
- **Text under the floor (B, audit P1-6).** Phone tab labels 10.5 px, tab counts 10 px, country names 10 px, the city list 11.5 px.
- **Tabs that are not tabs (audit P1-4).** No tabpanel, no aria-controls, no arrow keys, two tablists rendered.
- **Performance (audit P1-1, P1-2).** The record map's props are a new object every render, so a tap re-pins and re-frames it; browser storage is parsed during render (ten times in one tap).
- **Visited buries the record (A P1).** Blank map, "3 / 43" with captions, a friends leaderboard, then the trips two screens down.
- **Shortlist is two lists (A P1).** "Nothing starred yet" over three saved places drawn as big tiles.

False positives set aside: the browser detector's occlusion, flush-card and clipping findings come from the Explore tab mounted behind the page; the map's clipped overflow is intended.

## Priority issues

1. **[P0] The figures break the money rules.** Fix: every figure through `<Money>`; a planned trip shows its `priceTrip` total for the party. Command: harden.
2. **[P1] Not on the kit.** Fix: Tiles as tabs (Destinations' grammar), kit Card rows, Buttons, one stylesheet on roles. Command: layout, polish.
3. **[P1] Visited does not show where you have been.** Fix: map first, one figures band, countries as flags (with marking by hand), trips by year with a year filter. Command: distill.
4. **[P1] Shortlist is two lists.** Fix: one list of compact rows priced as Explore prices, with type and order filters in the side panel, and a way to plan a trip from it. Command: distill, clarify.
5. **[P2] The next trip does not help a returning traveller.** Fix: a focal card with the countdown, the dates with "to", the trip cost for the party, the weather, days planned and who is going. Command: shape.

## Personas

- **Casey (phone, one hand):** about 230 px of header and tiles before any content; 10 px labels.
- **Jordan (first time):** "Sign in to save trips and find them back here on any device." and "No day plans yet. Shape a day in a city and it stays on this device." read as written for nobody.
- **Sam (keyboard, screen reader):** two tablists and no tabpanel; the country of a card is lost (flag hidden, name only when there is no flag).
- **A returning hiker with two trips:** the first trip's photo is more than half its card, the second is below the fold, and neither says what it costs.

Questions skipped: the owner set the direction and the full scope in the approved plan (2026-10-16), so the critique's questions were not put again.
