# T1029-T1030: why a place rates what it rates; What to bring and Where to park

## Shared header
**Date:** 2026-11-03

**Branch:** `p15-practical-cards` (root repo; it also carries T1026-T1028, not merged)

**What the owner asked for:**
- **Rating:** the insights behind the rating label at the top, clean on phone and desktop, with a clear but insightful reason why a place rates as it does.
- **Parking and packing:** What to bring and Where to park as two separate tabs, with What to bring as swipe cards on a phone.
- **Parking design:** more professional and better designed, without the "Locations and fees come from..." line.
- **Data validity:** every parking source checked, with a real-world fact check; what is not valid goes, and missing information is added from research.
- **Process:** /impeccable and /simplify.

**Research agents:** three ran first.
- **The rating in the repo:**
  - **Formula:** 0.60 appeal + 0.15 beauty + 0.15 depth + 0.10 recognition, read through a per-class curve.
  - **Misleading today:**
    - "Beauty 5.3" beside Rome's 10.0 (beauty gives heritage no weight, since UNESCO counts under recognition)
    - "Measured" for what is a hand judgement
    - "% of the score" bars that do not add up to the score
- **Parking sources, with a fact check:**
  - The OSM list is mostly unusable in historic centres. All three of Rome's spots are inside the ZTL, and Hallstatt's are street bays inside the barrier.
  - Rome's "Trastevere park and ride" is a station car park 1.45 km out.
  - The web check named "Stazione Tiburtina" as a car park, but ATAC lists it as a park-and-ride.
  - Hallstatt's check says "no restricted zone", which is wrong.
  - Amsterdam's flag holds only as a low-emission zone.
  - Rome's four park-and-rides (Anagnina, Laurentina, Battistini, Cipro) and Amsterdam's underground garages are real.
- **What drivers want:**
  1. Can I drive into the centre?
  2. Where do I leave the car? (one or two places)
  3. Park-and-ride
  4. No prices unless they come from an official source with a date.

  Navigation is handed off to Maps, not rebuilt.

One commit covers both tasks, because the two share DestPractical, DestinationPage, the i18n files and the stylesheet. Reverting it undoes both.

## T1029: the rating, behind the Score

### What changed
- The Score in the page head is a button that opens **Why {place} rates {score}**: a bottom sheet on a phone, a centred panel from 600 px. It uses the flight sheet's frame and focus trap, and Escape closes it.
- **The sheet:**
  - the Score and its band, then the reason sentence in the reader's language (`ratingWhy`, English standing in)
  - **Standing:** two tiles from the wire's ranks, "In Italy: the best of 647 places" and "In Europe: top 1% of big cities". Outside the top tenth it says "Above 39% of big cities".
  - **What goes into it:** the four parts in weight order, each with a plain name and a line saying what it measures:
    - Appeal to travellers
    - Sights within {min} minutes
    - Scenery within {km} km ("monuments count under sights", which answers Rome's 5.3)
    - Official recognition, naming the registers the place is on

    Each part shows its value out of ten and a bar.
  - **One line on the maths:** "Weighted 60, 15, 15 and 10 percent, then set against other big cities in Europe, so the bars are not a sum."
  - The weights, the 5 km and the 30 minutes come from `config/rating.json` (`PART_WEIGHTS`, new `PART_REACH`), so a recalibration moves the copy too.
- **Gone:**
  - the "Why it rates" fold in Practical
  - `RatingBreakdown.jsx`, which had no other user
  - "Measured"
  - "% of the score"
- `lib/rating.js` gains `classRank()`. `classRankLine()` and the sheet share it, along with its 90% threshold.

### Files
- **Created:** `continent-app/src/browse/RatingSheet.jsx`
- **Deleted:** `continent-app/src/browse/RatingBreakdown.jsx`
- **Modified:** `DestinationPage.jsx`, `DestPractical.jsx`, `lib/rating.js`, the i18n files
  - +15 `rs.*` keys
  - −`rating.measured`, `rating.estimated`, `rating.weight`, `rating.part.*`

## T1030: What to bring and Where to park

### What changed
- **Two tabs in Practical** (the app's `Tabs`): What to bring and Where to park. They replace the one fold.
- **What to bring:**
  - the month's list as the Practical cards: a swipe row on a phone, a grid from 700 px
  - each card is the item plus why it is on the list, from the same facts the list rule reads ("About 91 mm of rain in December", "Lows around 5°C in December", "Churches ask for covered shoulders and knees")
  - new `packingReasons()`
- **Where to park,** from the new `lib/parkingTruth.js` only (the fact-checked subset, with tests on the real Rome, Amsterdam and Hallstatt data):
  1. **The zone first:** "The centre has a restricted or low-emission zone", which holds for both a ZTL and a milieuzone, plus what it means (camera fines; park outside). A "no zone" is never claimed.
  2. **Park and ride:** the sites the check names, plus an OSM site only when it is named and at least 3 km out. Each has Google Maps directions.
  3. **Car parks:**
     - **The city's own names:** park-and-rides, street names and coach parks filed there are dropped, and the price notes go with them (stale, some were season tickets).
     - **OSM car parks:** named, 50 spaces or more, no street bays, and only garages inside a zone.
     - Each car park row shows its type, spaces, fee and distance from the centre, with Google Maps and Waze. The walk minutes went: they were a guess.
  4. **The foot:** the check's date, the official page and "Search parking on Google Maps".
- **The OSM line:** "Locations and fees come from..." is gone. The ODbL credit moved to "Sources and photo credits", shown only when an OSM row is on screen.
- **The PDF** prints the same checked parking. Before, it printed the raw list: unnamed spots, street bays, the in-centre "P+R" and walk minutes.
- `cleanName` moved to `lib/format.js` (re-exported from `destParts.js`), so the lib module can use it.

### Files
- **Created:** `continent-app/src/browse/DestBefore.jsx`, `continent-app/src/lib/parkingTruth.js`, `continent-app/tests/parkingTruth.test.mjs`
- **Modified:**
  - `DestPractical.jsx`, `lib/packing.js`, `lib/destinationPdf.js`, `lib/format.js`, `browse/destParts.js`
  - `styles/88-place-template.css` (+ `.bf*`, `.rs*`)
  - the i18n files:
    - + `pk.*` and `pack.why.*` keys
    - − `dest.parkSource`, `dest.parkVerified`, `dest.parkChecked`, `dest.parkCityNamed`, `explore.parkUnnamed`, `dest.walkMin`, `explore.parkSpaces`

## Commands run (both)
- `npm test`: 1223 pass, 0 fail (+4, `parkingTruth`). `eslint` on the touched files: 0 errors, 0 warnings.
- `/simplify`: three review agents (reuse, simplification, efficiency with altitude).

  **Fixed:**
  - the sheet uses `ratingWhy` and a shared `classRank`
  - labels take their reach from config
  - parking uses `safeUrl` and `cleanName`
  - `parkingTruth` is memoised
  - the OSM credit also covers an OSM park-and-ride
  - the PDF uses `parkingTruth`
  - one distance phrase
  - one sunken list rule
  - dead imports, keys and a comment removed

  **Skipped:** see the register rows.
- Browser: Playwright on Rome and Amsterdam at 390 × 844 and 1440 × 1000.
  - **Rating sheet:** opens, focus goes inside it, Escape closes it. Its content is as above.
  - **Tabs:** they switch between the two panels.
  - **Rome's parking:** the zone, 4 park-and-rides, Stazione Tiburtina, and no surface lots.
  - **Amsterdam's parking:** the zone, 4 park-and-rides, 2 named car parks, and 3 underground garages.
  - At every size: no sideways scroll, no page errors.
  - The Hallstatt run could not open the page by `#dest=`, because village pages use another address. Its rules are covered by the unit test.

## Before/after measurements
| | Before | After |
|---|---|---|
| Rome parking rows that fail the fact check | 4 of 9 (3 spots in the ZTL, the in-centre P+R) | 0 |
| Hallstatt car parks shown | 3 (2 street bays in the closed centre, 1 coach park) | P1, P2, P3 (the operator's lots) |
| Taps from the head to why it rates | 1 tap, then a jump to the foot of the page | 1 tap, sheet in place |
| Rating jargon in the panel | "Measured", "Beauty index", "% of the score" | none |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| A script step did not apply | A Bash heredoc ate a backslash (known gotcha) | Edited the script file directly |
| `parkingTruth` could not import `cleanName` | `destParts.js` imports React and a JSX file, so the Node tests could not load it | `cleanName` moved to `lib/format.js` |

## What is still open
- **T1030-a:**
  - **Move the parking rules into the pipeline:** `compose_parking` should filter before its top-3 cut (today it can drop a valid 4th car park, and it picks the nearest P+R, which the app then rejects), and `parking_check` should clean the names.
  - **Re-check the web records:** the `restricted: false` ones (Hallstatt is wrong), and Rome's Tiburtina, which is filed as a car park.
  - Stop emitting `walk_min`.
  - Then cut `parkingTruth` down to display shaping.
- **T1030-b:**
  - `scripts/verify_destination_page.mjs` and `scripts/verify_rating_words.mjs` still look for the removed `#sec-rating` fold.
  - About 50 lines of CSS for the old fold are dead: `.destp-park*`, `.dpark-*`, `.xp-pack*`, `.destp-exit`, `.rb-country`, `.rb-conf`, `.rb-why`, `.rb-tick` in 24-, 25- and 64-*.css.
  - Their entries in `design-lint.baseline.json` are stale.
- **T1030-c:** `packingList` should return each item with its reason, so the rule and its reason live on one line.
- **T1029-a:** small duplicates the reviewers found, to fold into shared helpers:
  - five Google Maps search-URL builders
  - four long-date formatters
  - a second title-case helper in `WaterQualityBadge.jsx`

## Rollback procedure
`git revert` the T1029-T1030 commit. The fold comes back, along with `RatingBreakdown.jsx` and the raw parking list.
