# T1031: the rating sheet in plain words; no park-and-ride subline

## Task ID
T1031

## Date
2026-11-03

## What changed
The owner reviewed T1029-T1030 and asked for:
- the line under each part removed, in every section
- "Weighted 60, 15, 15..." removed
- the country line, "The best of 647 places", made human: "now it doesn't mean anything"
- in Practical, "Leave the car at the edge and ride in on public transport" removed

Now:
- **Rating sheet:** the four parts are each a name, a value and a bar, with nothing under them. The weights line is gone.
- **The standing in words:**
  - **In the country:** "The highest-rated place" for rank 1; "In the top {n}% of places" inside the top tenth; else "Rated above {n}% of places" (Alicante: 41%). The figure is the rank as a share of the country's places.
  - **In Europe:** "In the top 1% of big cities" or "Rated above 39% of big cities".
- **Where to park:** the park-and-ride group has no subline.
- **Removed keys:** `rs.bestOf`, `rs.rankOf`, `rs.how`, `rs.sub.*`, `pk.ridesSub` (all six languages).
- **Replaced keys:** `rs.top` and `rs.above` got new wording; `rs.cBest`, `rs.cTop` and `rs.cAbove` are new.
- **CSS:** the `.rs-part-sub`, `.rs-how` and `.bf-sub` rules are gone; the hidden-gem note has its own `.rs-gem`.

## Files touched
**Modified:** `continent-app/src/browse/RatingSheet.jsx`, `DestBefore.jsx`, `continent-app/src/styles/88-place-template.css`, `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`

## Commands run
- `npm test`: 1223 pass. `eslint`: 0 errors, 0 warnings.
- Browser: Playwright, the rating sheet and the park tab.
  - Rome, 390 and 1440: "The highest-rated place" and "In the top 1% of big cities".
  - Amsterdam, 390: the same two lines.
  - Alicante, 390: "Rated above 41% of places" and "Rated above 39% of big cities".
  - No page errors, no sideways scroll.

## Config and secrets set
None.

## Before/after measurements
Not measured.

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| A regex step did not apply | A Bash heredoc ate the backslashes | A script file |

## What is still open
Nothing new.

## Rollback procedure
`git revert` the T1031 commit.
