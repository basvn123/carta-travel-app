# T168: What to pack becomes an icon grid

## Task ID

T168 (mind-map number T172).

## Date

2026-10-03

## What changed

The "What to pack" fold on a trip page used to be a bulleted list, and it was missing entirely on 153 of the 253 trips because their packingNotes array is empty. It is now a grid of 16 to 24 icons in one 20px, 1.5px stroke set, coloured --ink-soft with no tile behind them. Tapping an icon puts one line under the grid saying why that item is on this trip, and tapping it again clears the line. The fold now shows on every trip.

The grid is built in src/lib/packGrid.js. A trip file holds packingNotes either as v2.0 sentences or as v2.1 objects with icon, item and whyThisTrip, which is the shape the D1 backfill will write. Both become cells. For a sentence, a short ordered list of keyword rules picks the icon and a plain label, and the whole sentence becomes the why line. Written notes always come first.

Only 100 trips have written notes and they hold four to six each, so the grid is topped up to 16 from a standard kit for the trip type, then a common kit. Every such cell is flagged derived and its why line ends with "Standard kit for cycling trips, not yet written for this trip", so the grid never passes a template off as authored research. The why text names real facts of the trip file (months, duration, country, type) and no invented conditions. When D1 fills packingNotes, written cells take the slots and the standard kit stops being used on its own.

The line sits below the grid instead of floating over it. A floating tooltip hides the next icon on a phone and has no touch state, and a role=status line is announced to screen readers. The design brief names --ink-70, which does not exist in the tokens, so --ink-soft is used, as the carta-design skill says.

## Files touched

**Modified (continent-app):**
- src/browse/JourneyPage.jsx
- src/styles/25-feature-pages.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (one key each, journey.packHint)

**Created (continent-app):**
- src/browse/PackGrid.jsx
- src/components/PackIcons.jsx
- src/lib/packGrid.js
- scripts/verify_pack_grid.mjs

**Modified (root):**
- Execution/_OPEN.md

**Created (root):**
- Execution/P10/T168-packing-icon-grid.md

## Commands run

Dev server on port 5208, then a throwaway Playwright pass that opened a journey page at 380 and 1280 px, tapped an icon and read the why line. Then:

node scripts/verify_pack_grid.mjs
npm run lint
npm run build (dist and dist-data deleted afterwards)

## Config and secrets set

None. No migration.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips showing a packing section | 100 of 253 | 253 of 253 | +153 |
| Trips with a grid of 16 to 24 cells | 0 | 253 | +253 |
| Trips with a why line on every cell | 0 | 253 | +253 |
| Cells written for the trip | 715 | 715 | 0 |
| Cells from the standard kit | 0 | 3,333 | +3,333 |

The check is scripts/verify_pack_grid.mjs, which reads all 253 trip files and fails on any trip outside 16 to 24 cells, any cell without a label, known icon and a why line over ten characters, and any em dash or middot. It reported 253 trips, 0 bad. In the browser, a cycling trip at 380 px and at 1280 px showed 16 cells, no horizontal scroll, and the why line changed on tap.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 31 trips came out at 15 cells | Icon names are unique per grid and the type kit overlapped the common kit | Added five more common items |
| Six i18n files and JourneyPage showed whole-file diffs | A Python rewrite turned CRLF into LF | Restored CRLF, diff is now the real lines only |

## What is still open

The 3,333 standard-kit cells are a stopgap. D1 should write real packingNotes as {icon, item, whyThisTrip} for the 153 empty trips and fill the rest of the 100 written ones, which retires the standard kit. The icon keys in PackIcons.jsx are the allowed values for the icon field in that schema. The journeys wire is gitignored generated data, so this task did not write any trip file. The five non-English languages carry a translated hint line only; the why lines stay in authored English, like all editorial prose on this page. The 20px icons were drawn here by hand at one stroke weight and have had no design review beyond the browser check.

## Rollback procedure

In continent-app, git revert the T168 commit on master. In the root repo, revert the report commit. No data, schema or migration changed, so nothing else needs undoing.
