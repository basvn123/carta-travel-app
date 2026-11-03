# T1035: Around as kind tiles, each opening its own page

## Task ID
T1035

## Date
2026-11-03

## What changed
The owner reviewed T1033: "the tabs must lead to a totally new designed page ... the buttons must be more nicely looking. Only the tabs must be visible at first (walks, rides, peaks, lakes) and then when you click on one you go to a detailed page, with the details right ... clean and professional."

**Around on the place page** (`DestAround`):
- only the kinds, as photo tiles: two across on a phone, up to five on a desktop
- each tile shows the kind's best photograph under a dark scrim (the umber ground where there is none), its icon in a frosted disc, its name and count in white, and an arrow
- a tile opens the kind's page
- the day trips and an area's villages follow below, as before

**A kind's page** (new `NearPage.jsx`, for example "Walks near Geneva"):
- **Frame:** the place page's own frame, one layer up. The bar goes back to the place, and Escape closes it.
- **Header:** the title, then how many within what reach ("15 within 23 km of the centre").
- **Tools:** how far as steps (5, 10 and 25 km where they change the list, the widest naming the real reach), and Nearest / Best rated.
- **Every place of the kind** as the Explore card in a grid (two across on a phone, auto-filled on a desktop):
  - **Photo pills:** the grade or bathing water, and the score.
  - **Facts:** length, climb and time; height; distance and direction.
  - **Link:** the whole card opens the place's own page.

The T1033 inline rail and its chip rows are gone. `DestinationPage` no longer keeps the chosen kind.

## Files touched
**Modified:**
- `continent-app/src/browse/DestNearby.jsx`, `DestinationPage.jsx`
- `continent-app/src/styles/88-place-template.css` (+ `.ar-tile*`, `.near-*`; − the T1033 rail and kind-chip rules)
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (+ `ar.nearSub`, `ar.sort`, `ar.sortNear`, `ar.sortBest`)
- `continent-app/scripts/verify_destination_page.mjs`

**Created:** `continent-app/src/browse/NearPage.jsx`

## Commands run
- `npm test`: 1223 pass. `eslint`: 0 errors, 0 warnings.
- Browser: Playwright on Geneva at 390 and 1440, and Ljubljana at 390.
  - **Tiles:** Geneva has Walks 15, Rides 16, Peaks 3, Lakes 1, Beaches 7, five with a photo. Ljubljana has five tiles, four with a photo. No cards sit inline in Around.
  - **The Walks tile opens its page:**
    - Geneva: "Walks near Geneva", "15 within 23 km of the centre", the steps 5 / 10 / 23 km, 15 cards.
    - Ljubljana: 18 cards.
  - **On the page:** focus moves into it, Best rated reorders the cards, the cards link to `#trail=...`, and Escape closes it.
  - No sideways scroll, no page errors.
- `/simplify` was not rerun for this round (T1033's review covered the shared helpers, which moved here unchanged).

## Config and secrets set
None.

## Before/after measurements
| | T1033 | After |
|---|---|---|
| What Around shows first | kind chips, distance chips and a rail | kind tiles only |
| A kind's places | inline rail, at most 16 | its own page, all of them, with sort |

## What broke and how it was fixed
Nothing broke.

## What is still open
- **T1035-a:** the kind's page has no address of its own. The browser's back button leaves the place page rather than the kind page, and the page cannot be shared. Add a hash key (for example `&near=walks`) that `DestinationPage` reads on load and on back.

The data rows from T1033 (route photos, reach) still stand.

## Rollback procedure
`git revert` the T1035 commit; T1033's inline rail comes back.
