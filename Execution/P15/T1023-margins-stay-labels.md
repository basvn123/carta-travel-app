# T1023: wider page margins, prices on the stay bars, no stay sublines

## Task ID
T1023

## Date
2026-11-03

## What changed
The owner reviewed T1022's shots and asked for three things. First, remove the lines under Hostels, Hotels and Entire places in Where to stay. Second, give the content more room from the screen's edges on every device. Third, they asked why no pricing showed. It showed only as one line under the stay bars ("€129 a night in August"), which the fixed foot bar covered on a phone.

- Where to stay shows the name and the booking buttons only. The `stay.for.*` keys are gone from all six languages.
- The place page's side margins (`.pt-wrap`) are 24 px on a phone (16 px before) and 32 px from 600 px. They are never less than the screen's safe area (notch, curved edge). Desktop from 1024 px keeps its 32 px.
- Each scraped month's bar in "Stay prices by month" carries its price above it, like the temperatures above the weather bars, with the cheapest month's price in green. The chosen month's line stays under the bars.

## Files touched
**Modified:**
- `continent-app/src/browse/DestPractical.jsx`, `continent-app/src/browse/DestWhen.jsx`
- `continent-app/src/styles/88-place-template.css`, `continent-app/src/styles/94-when-stay.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (3 keys removed each)

**Created:** `Execution/P15/T1023-shots/` (full-screen, not cropped to the section)

## Commands run
- `npm test`: 1218 pass. `eslint`: 0 errors. `impeccable detect`: `[]`.
- Playwright on `#dest=FCO` at 390 and 1440 px, full-viewport shots. Results:
  - the section starts 24 px from the left at 390 px
  - the five price labels show: €113, €129, €139, €129, €129
  - no sublines
  - no sideways scroll, no page errors

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Side margin on a 390 px phone | 16 px | 24 px |
| Side margin, 600 to 1023 px | 16 px | 32 px |
| Prices visible on the stay bars | 0 | 5 (the scraped months) |

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new.

## Rollback procedure
`git revert` the T1023 commit.
