# T1032: What to see and Best things to do as photo cards; a photo map

## Task ID
T1032

## Date
2026-11-03

## What changed
The owner asked for:
- bigger images, swipeable on a phone
- a custom explanation for each sight
- modern and clean
- the best possible map: zoomable, showing where everything is from the start, with the listed sights' own photographs on it
- Best things to do with images, in the same style as What to see: "completely redesign it, more user friendly"

Two research agents ran first.
- **Patterns, from Apple's Maps HIG and Google lists (most other sites block automated reads):**
  - a swipe row of photo cards with the next one peeking, a vertical list or grid on wider screens
  - one line of specific explanation per card
  - the same card frame for sights and activities
  - a map fitted to all pins, where a card and its pin are linked
- **Code and data audit:**
  - Highlights carry a licensed photo (Rome 10 of 12), but no description ships: the builder writes `hl.fact`, yet 0 of 19,186 shipped highlights have it.
  - The POI shard has a short Wikidata line for 8 of Rome's 12.
  - 7 of Rome's 10 things to do have no photo of their own anywhere in our data.
  - The map fitted the pin points, so wide name pills hung off its edges.

**One card for both lists** (`SpotCard` in `DestNearby.jsx`, `.spot*`):
- the photograph on top, 4:3
- the number that matches its map pin
- a "Must-see" chip on the photo
- the name, then one line of what and where ("Museum, 800 m from the centre")
- the description, up to 3 lines: for sights, the pipeline's `fact` when it ships, else the Wikidata line, English only (Colosseum: "Ancient Roman amphitheater in Rome"); for things to do, their own sentence
- a thing to do without a photograph shows its kind's icon (activity, experience, festival) on the warm ground, never another place's picture

**Layout:**
- **Phone:** a swipe row bled to the screen, the next card peeking.
- **From 700 px:** three columns, the first six with Show all.

**Card and map work together:**
- Hovering or focusing a card rings its pin, and its name selects the pin.
- Tapping a pin highlights its card and scrolls it into view.

**The map** (`DestMap.jsx`):
- **Pins:** each sight is pinned by its own photograph in a round frame (a 120 px image for a 40 px pin), with its number on the corner. The name shows on hover and on the chosen pin. Pins without a photo keep the pill.
- **The first view:** padding sized for the photo pins shows every sight. When the column changes width it refits, once a frame and never while the map is moving, until the traveller moves the map.
- **Height:** 420 px.

## Files touched
**Modified:**
- `continent-app/src/browse/DestNearby.jsx`, `DestMap.jsx`, `DestinationPage.jsx`
- `continent-app/src/styles/88-place-template.css`:
  - added `.spots`, `.spot*`, `.dmap-pin.has-photo`, `.dmap-pin-ph`
  - removed the old `.pt-sights`, `.pt-dolist`, `.pt-thumb`, `.pt-sight-text`, `.pt-more` rules

**Created:** `Execution/P15/T1032-shots/` (gitignored)

## Commands run
- `npm test`: 1223 pass. `eslint`: 0 errors, 0 warnings.
- `/simplify`: three review agents.

  **Fixed:**
  - the photo pin built with DOM APIs (no hand-made CSS escaping) and a small 120 px image
  - one row per sight feeds both its card and its pin
  - one count for "first six"
  - the shared bleed rule
  - the kit card's press fix (T428) on the stretched name
  - the wait height in CSS
  - the existing `ai.showOnMap` key reused, not a new one
  - descriptions capitalised once
  - the pipeline's `fact` preferred
  - the refit coalesced
  - dead CSS removed
  - A first version broke the hooks rule (`useMemo` after an early return); it is a plain map now.

  **Skipped:** see T1032-a to T1032-c.
- Browser: Playwright on Rome at 390 and 1440, and Amsterdam at 390.
  - **Sight cards:** Rome 10 of 12 with photos, 8 with a description.
  - **The first view:** all 12 pins inside it at 1440, 11 of 12 at 390 (one pin at the edge).
  - **Photo pins:** Rome 10, Amsterdam 12.
  - Picking a pin highlights its card.
  - No sideways scroll, no page errors.
  - **Fixed in round one:** photo pins were blank. The URL was encoded twice; the photo is now built with DOM APIs.

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Sight image size (phone) | 56 × 56 px | about 296 × 222 px (4:3, 76% of the screen) |
| Rome sights with an explanation | 0 of 12 | 8 of 12 |
| Rome pins whole inside the first view (1440) | some pills cut at the edges | 12 of 12 |
| Photographs on the map | 0 | 10 (Rome), 12 (Amsterdam) |
| Rome things to do with an image | 2 of 6 shown | 3 of 10 photos, the rest a kind icon |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| Blank photo pins | The URL was encoded twice inside an HTML string | The photo is set with `el.style.backgroundImage` |
| Lint error | `useMemo` after an early return | Plain map |

## What is still open
- **T1032-a:**
  - `build_dossier.py` writes `hl.fact`, but none ship (0 of 19,186), so the cards fall back to the Wikidata line in the POI shard (English only, 8 of 12 for Rome).
  - Find where `fact` is dropped and ship it, in all six languages. The card already prefers it.
- **T1032-b:** things to do need their own licensed photo. Rome has 7 of 10 without one; a pipeline step should resolve `do[].image`, for example Commons for the activity's place, and ship it.
- **T1032-c:**
  - `SpotCard` restyles the kit `Card` tile (`layout="tile"`), and `.spots` repeats `.pcards`. Fold them into the kit card and one swipe-row class.
  - Photo pins load as soon as the map builds; TripMap waits for the zoom (`hydratePinPhotos`). Share one pin-photo helper.

## Rollback procedure
`git revert` the T1032 commit.
