# T1033: Around as one block of kind tabs, how far, and the Explore rail

## Task ID
T1033

## Date
2026-11-03

## What changed
The owner asked for Around (walks, rides, peaks, lakes, beaches near a place) to be redesigned:
- one block with a tab per kind, each showing that kind's places for this destination
- maybe a control for how far to look
- the cards like the Explore tab's walks, rides and beaches cards: no white text section under the photo
- each card going to its detail page
- no GPX route files list, no "Peaks, lakes and beaches have no route line" note
- robust as new kinds are added
- the visual design in place now, with data quality to come later

Two research agents ran first.
- **What travellers want:**
  - the facts each kind is chosen on: length, climb and time for a route; height for a peak; the bathing water for a lake or a beach
  - kind chips with counts, showing only kinds that have something
  - distance as a few plain steps rather than a slider, which is fiddly on a phone and leaves people unsure what 23 km means
  - nearest first
- **Code audit:**
  - Explore's outdoor rails are `StoryRail` and `StoryCard`: a 4:5 photo with pills, the words on the page under it, and no box. The place page used kit `Card` tiles, which are white boxes.
  - The list of kinds was hard-coded in about seven places.
  - Rows carry their distance from the centre: complete to 20 km for every kind, up to 60 km for a few peaks, lakes and beaches.

**The block** (`DestAround` in `DestNearby.jsx`):
- **Kind chips:** one per kind that has places, with its true count. On a phone they form one swipe row.
- **How far:** steps of 5, 10 and 25 km, each shown only where it changes the list. The widest chip names the real reach of the rows ("Within 20 km", "Within 36 km" for Geneva's peaks), never "any distance". Changing the kind resets it.
- **The rail:** the kind's places as the Explore rail itself (`StoryRail` + `StoryCard`), nearest first, at most 16, titled "{Kind} near {place}".
- **Each card:** the photograph, or a map tile where the row has none; its grade or bathing water as a pill; its score; the name; then its facts and the distance with direction ("12 km long, 142 m up, 53 min, 4 km SW"; "1,718 m high, 17 km NW"). The whole card opens the kind's own page.
- **Below:** the day trips, then (inside an area) its villages.
- **Gone:** the GPX list (`DestRouteGpx.jsx`), its note, the photo track (`DestTrack.jsx`), `OutdoorTile`, the "Within 20 km, and day trips" note, and about 80 lines of their CSS.

**The registry** (`lib/destOverview.js` `AROUND_KINDS`): each kind names its dossier sources and its card style (`route`, `height`, `water`). The page, the chips, the facts and the PDF's layer list all read it. A new kind is one line there, plus what still lives elsewhere: its label in six languages, its `featureHref` page, and the pipeline lists that write its rows.

## Files touched
**Modified:**
- `continent-app/src/browse/DestNearby.jsx`, `DestinationPage.jsx`, `DestTiles.jsx`
- `continent-app/src/lib/destOverview.js`
- `continent-app/src/components/WaterQualityBadge.jsx` (exports its class keys)
- `continent-app/src/styles/88-place-template.css`, `64-v6-destination.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`:
  - added `ar.high`, `ar.water`, `ar.howFar`, `ar.within`, `ar.near`
  - removed `dest.gpx*`, `destx.aroundNote`
- `continent-app/scripts/verify_destination_page.mjs` (selectors point at the new rows)

**Deleted:** `continent-app/src/browse/DestRouteGpx.jsx`, `continent-app/src/browse/DestTrack.jsx`

**Created:** `Execution/P15/T1033-shots/` (gitignored)

## Commands run
- `npm test`: 1223 pass. `eslint`: 0 errors. The 4 warnings are WaterQualityBadge's fast-refresh notes: 3 existed before, and 1 comes from the newly exported `CLASS_KEY`, the same pattern.
- `/simplify`: two review agents (reuse with simplification, efficiency with altitude).

  **Fixed:**
  - the 16-card cap now applies after the distance filter, so a nearer, lower-rated place is not lost
  - the chips show the true count
  - the widest step names the real reach
  - the distance resets with the kind
  - one rail per kind, not one per distance step
  - facts by the registry's style, not by layer names
  - the PDF reads the registry
  - the shared `dest.ascentUp` key and the shared water-class keys reused
  - the shared bleed rule
  - dead CSS and keys removed
  - a stale verify script fixed

  **Skipped:** T1033-c.
- Browser: Playwright on Geneva at 390 and 1440, and Ljubljana at 390.
  - **Geneva chips:** Walks 15, Rides 16, Peaks 3, Lakes 1, Beaches 7.
  - **Ljubljana chips:** Walks 18, Rides 8, Peaks 6, Lakes 3, Beaches 4.
  - **Distance:** Ljubljana's lakes go from 3 to 1 within 10 km.
  - **Cards:** transparent, with no box. They link to `#cycle=...` and `#trail=...`.
  - No GPX list, no note, no sideways scroll, no page errors.
  - **Fixed in round one:** the kit chip group's `flex-wrap` won over the swipe row, so the chips wrapped.

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| White boxes in the Around cards | every card | 0 |
| Kind lists in the app's code | about 7 | 1 registry (plus label, page link, pipeline) |
| GPX rows and notes in Around | up to 12 + 1 note | 0 |
| Ways to narrow by distance | 0 | up to 3 steps plus the real reach |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| Chips wrapped on a phone | `.ui-chip-group { flex-wrap: wrap }` loads later, at equal weight | `.ui-chip-group.ar-kinds` |
| Test selectors found nothing | The kit chip's class is `.ui-chip` | Selectors fixed |

## What is still open
- **T1033-a:** most walk and ride cards show a map tile, because only about 22% of walk rows carry a photograph. A pipeline photo source for routes is needed.
- **T1033-b:** the pipeline's reach limits what the steps can offer:
  - `around` is 20 km and 24 per layer (Füssen has 34 rides, 24 ship)
  - `nearby` never writes walks or rides
  - routes stop at 25 km

  Also, the day trips under the rail are still white boxes.
- **T1033-c:**
  - `AroundHere.jsx` is mostly dead: only `FeaturePhoto` is used, and it has its own `fmtKm`. Move `FeaturePhoto` and delete the rest.
  - The route facts are built three times (Around, `rowMeta`, the PDF); a shared `routeFacts` would serve all three.
  - `clock()` and the bearing letters are English only.
  - `aroundCategories` is not memoised.

## Rollback procedure
`git revert` the T1033 commit. The tile track, the GPX list and the note come back.
