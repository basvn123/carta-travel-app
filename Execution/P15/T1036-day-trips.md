# T1036: Day trips as the Explore rail of photo cards

## Task ID
T1036

## Date
2026-11-03

## What changed
The owner, on "Around Rome": make it "more professional, more clean, more simple, align it with how the app is designed ... for every day trip a clean image". A research agent was to say what information belongs there and whether filters are needed.

**Research:** Rough Guides, Time Travel Turtle, Rome2Rio and The Tour Guy loaded; the rest is product knowledge.
- **What decides a day trip:** the trip time with its mode, whether a car is needed, the one line it is known for, and half or full day.
- **Card:** a photo card with the time on the photo.
- **Filters:** none for 6 to 12 trips, except perhaps one, "no car needed".

**The block** (`DayTrips` in `DestNearby.jsx`, replacing the white `TripRow` list): "Day trips from Rome" as the Explore rail (`StoryRail` + `StoryCard`), with arrows on a desktop and a swipe row on a phone.
- **On the photo:** the trip ("About 38 min by train"; "About" because the time is modelled rather than routed, the same honesty as T446), or "4-day route", plus the score.
- **Under the photo:** the name, then how far and how long it wants ("27 km, half day", from `visitLength`, the rule the place's own page uses), then the line it is known for where the catalogue has a real one.
- **Order:** the dossier's own (its rank, the composed route last).

**Changes after review:**
- **No filter after all.** A review found the data holds the fastest way there, not whether a car is needed. A town 60 minutes by car and 75 by train would have been hidden under "No car needed". See T1036-a.
- **Stock descriptions** ("Italian comune.", "Commune in Jura, France.") go through one shared `cleanBlurb` (`lib/format.js`), on the page and in the PDF.

**Removed:**
- the white trip list and its CSS
- `DestTiles.jsx` (nothing imported it)
- the unused `dest.aroundKind.trips` key
- a filter slot that was briefly added to `StoryRail`

## Files touched
**Modified:**
- `continent-app/src/browse/DestNearby.jsx`
- `continent-app/src/lib/format.js` (+ `cleanBlurb`), `continent-app/src/lib/destinationPdf.js`
- `continent-app/src/styles/88-place-template.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`:
  - added `dt.title`, `dt.half`, `dt.full`, `dt.days`, `dt.byAbout`
  - removed `dest.aroundKind.trips`

**Deleted:** `continent-app/src/browse/DestTiles.jsx`

**Created:** `Execution/P15/T1036-shots/` (gitignored)

## Commands run
- `npm test`: 1223 pass. `eslint`: 0 errors, 0 warnings.
- `/simplify`: two review agents (reuse with simplification, efficiency with altitude).

  **Fixed:**
  - the dishonest filter removed
  - half or full day from the shared `visitLength`, not a fourth cut-off
  - the estimate wording back
  - the dossier's order kept
  - the blurb cleaner shared with the PDF
  - no remount on a filter
  - dead CSS, keys and file removed

  **Skipped:** the pipeline fixes, T1036-a to T1036-c.
- Browser: Playwright on Rome at 390 and 1440, and Geneva at 390.
  - **Rome:** 9 cards, each with a photograph except Campo Imperatore (a map tile).
  - **Cards:** "About 38 min by train" and "27 km, half day". Tivoli's line shows; Ronciglione keeps only "A member of I Borghi più belli d'Italia." Links go to `#dest=gem:...`.
  - **Geneva:** 7 cards. "Commune in Jura, France." is gone from Saint-Claude.
  - No sideways scroll, no page errors.

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Day trips with a photograph (Rome) | 0 of 9 | 8 of 9 (one map tile) |
| White boxes in the day trips | 9 | 0 |
| Stock lines shown ("Italian comune.") | on the page and in the PDF | 0 |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The time pill was cut off on a phone ("About 34 min b") | The whole sentence in a pill on a narrow card | Owner review: the mode's icon and a short time ("~34 min"), the full sentence for screen readers (`dt.approx`) |
| Facts and blurb ran together on desktop | The Explore card's meta is a nowrap line | The two lines stack in this rail |
| `visitLength` not defined | My import check matched the doc comment | Import added |

## What is still open
- **T1036-a:** `travel.mode` is the fastest way there, not "no car needed". Have the trip builder emit the transit minutes (or `no_car`), so a "No car needed" filter can be told honestly.
- **T1036-b:**
  - The stock descriptions should be fixed in the pipeline: add them to `TEMPLATE_BLURB_RE`, which writes a line from two named sights instead. Then `cleanBlurb` can go.
  - Campo Imperatore has no travel time and no photograph.
- **T1036-c:** the PDF titles the same block "Best trips from here" (`dest.tripsTitle`) and the page says "Day trips from Rome". Pick one. `.dtile-meta` and `.dtrip2` CSS may be dead with `DestTiles` gone.

## Rollback procedure
`git revert` the T1036 commit; the white list comes back.
