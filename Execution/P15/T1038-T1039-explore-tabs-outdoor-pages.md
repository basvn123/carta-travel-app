# T1038-T1039: Explore's outdoor tabs tidied; the outdoor pages follow the place page

## Shared header
**Date:** 2026-11-03

**Branch:** `p15-explore-tabs`, on top of the unmerged T1026-T1037 branches

**The owner asked for:**
- the Explore outdoor tabs (Trails, Beaches, Lakes, Mountains, Cycling) aligned with the main tab:
  - the filters under the tabs optimised in position and logic, maybe moved into Filters
  - rows closer together
  - "browse the full list" higher up
- the outdoor pages (Mont Blanc as the example) styled like the place page: the top bar, its colour, the tabs that are now white, When to go

**Two audit agents ran first:**
- **The outdoor tabs:** the four quick chips ("One day in the saddle", "Paved nearly the whole way"...) are rails beyond the cap shown as one-tap presets. Every preset is already an option in All filters. On a phone the row wrapped onto a second line.
- **The outdoor pages:** all five already share one shell (`OutdoorPage`), built from the place page's own parts (the page bar, the photo mosaic, the fact tiles, the pill tabs). The owner's screenshot shows production, where none of the T1024+ work is deployed; the "1 / 6" counter no longer exists in the code. What still differed:
  - the head layout
  - the tabs placed under the facts
  - the PDF in a white card
  - about a dozen white boxes
  - the why-it-rates box

## T1038: the outdoor tabs

### What changed
- **One swipe row on a phone:** All filters, Full list, Countries, Sort, then Map; never a second line.
  - Full list moves from the end to right after All filters.
  - On a desktop the facet chips (surface, length, climb) stay in the same row.
- **No starter rows at rest:** the cuts with no rail are presets of options that already live in All filters. In Full list mode the doors to every rail stay.
- **Spacing on a phone:** rails 16 px apart (was 32), as the Places tab's are (T983); the door row sits 12 px above the rails.

### Files
**Modified:**
- `continent-app/src/browse/DestinationsTab.jsx`
- `continent-app/src/styles/83-where-bar.css`, `30-section-opening.css`
- `continent-app/scripts/verify_destinations.mjs` (no starter row at rest)

## T1039: the outdoor pages

### What changed (`OutdoorPage` in `OutdoorParts.jsx`, all five pages at once)
- **Head:** the place page's markup.
  - the name, then the other name
  - the flag and the region with the score on one line (`.pt-meta`, no dot)
  - the rank and badges as tags on one row (`.pt-tags`, warm tone)
- **The pill tabs come right under the head,** before the intro and facts, as on the place page.
- **The intro** in the place page's lead style.
- **PDF:** a download icon in the page bar ("Download PDF guide"), out of the card and the route sections. GPX downloads stay where they are.
- **No white boxes:**
  - the phone's card (Directions, Stay nearby) sits on the page
  - the desktop side card goes soft
  - every block on the soft sunken ground with no border, changed in the original rules: route, grade, checklist, safety, facilities, water, months, cells, rest stops, mix, stages
  - the inner tiles in the page colour
  - the why-it-rates fold a row under a rule
- **When to go:** keeps its month strip, now on the soft ground (see T1039-a).

### Files
**Modified:**
- `continent-app/src/browse/OutdoorParts.jsx`, `PageBar.jsx`, `DestinationPage.jsx`
- `continent-app/src/browse/MountainPage.jsx`, `LakePage.jsx`, `BeachPage.jsx`, `TrailPage.jsx`, `CyclePage.jsx`
- `continent-app/src/styles/89-outdoor-page.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (removed `ox.pdf`)

## Commands run (both)
- `npm test`: 1223 pass. `eslint`: 0 errors. The warnings are existing fast-refresh notes.
- `/simplify`: one review agent covering all four angles.

  **Fixed:**
  - the white blocks changed in their original rules (the override block also missed white inner tiles)
  - one flat PDF wiring: `onPdf` / `pdfBusy` / `pdfModel`, with `PageBar` defaulting its label
  - the tag markup matching the place page
  - dead imports and the `ox.pdf` key removed

  **Skipped:** T1039-b, T1039-c.
- Browser: Playwright at 390 and 1440.
  - **The Cycling tab:**
    - **Phone:** the row reads All filters, Full list, Countries, Sort, Map, with no wrap and no starters.
    - **Desktop:** the row reads All filters, Full list, Countries, Sort, Surface, Length, Climb.
  - **Mont Blanc:**
    - **Bar:** shortlist, Download PDF guide, Share.
    - **Head:** the meta line "Italy, Mont Blanc massif" with 9.4 Exceptional, and 2 tags.
    - **Tabs:** they come before the facts; no PDF button in the body.
    - **White boxes:** none in the body; the foot bar stays white, as on the place page.
  - No page errors.

## Before/after measurements
| | Before | After |
|---|---|---|
| Lines of controls under the outdoor tabs (phone) | 4 (filter row on 2 lines, chips on 2) | 1 |
| Rail gap (phone) | 32 px | 16 px |
| White boxes on an outdoor page body | about 12 kinds | 0 |
| Where the PDF lives | a card button (and in route sections) | the page bar |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| White tiles inside the soft boxes | The first pass overrode only the containers | The original rules changed, inner tiles in the page colour |

## What is still open
- **T1039-a:** the outdoor When to go keeps its own month strip, now on the soft ground, rather than the place page's `DestWhen` design. The data differs (snow and storm for peaks, water temperature for lakes and beaches), so a shared `OutdoorWhen` on the `when-*` styles needs its own design call.
- **T1039-b:** the head markup now lives in `DestinationPage` and `OutdoorPage`, and an older form in `JourneyPage`. Make one `PlaceHead`.
- **T1039-c:**
  - `DestinationsTab`'s `openingRails.starters` now only feeds the full-list doors; simplify it to one `doors` list.
  - CyclePage and TrailPage show GPX twice (card and route section; this predates the change).

## Rollback procedure
`git revert` the T1039 commit, then the T1038 commit.
