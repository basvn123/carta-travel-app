# T1025: the place page head, full-width photos and the tabs on the first screen

## Task ID
T1025

## Date
2026-11-03

## What changed
The owner reviewed T1024 on a phone and asked for:
- photographs across the entire width
- cleaner and more compact
- no dot between "Italy" and the rating
- the tabs on a phone's first screen
- UNESCO not blue

Now:
- **Photographs, phone:** edge to edge, square corners, no peek, 3:2 at most 36% of the screen high. The arrows and "8 photos" sit inside the photograph. The credit line keeps the page margin.
- **Photographs, from 700 px:** the mosaic as before.
- **Margins as variables:** the page's side padding is two variables (`--pt-pad-l`, `--pt-pad-r`), so the photograph and the swipe rows can bleed to the screen exactly.
- **Head:**
  - title 32 px on a phone
  - tighter gaps
  - no dot between the country and the rating
  - the tags on one swipe row
  - UNESCO in the same warm tone as the rank tags
- **Order:**
  - before: name, rating, tags, intro, facts, tabs
  - now: name, rating, tags, tabs, intro, facts

  The intro and the facts open the page under the tabs.
- **Swipe rows:** below 1024 px the tag and tab rows run to the screen's edges, with the margin as their inner padding.

## Files touched
**Modified:** `continent-app/src/browse/DestinationPage.jsx`, `continent-app/src/styles/88-place-template.css`

**Created:** `Execution/P15/T1024-shots/` (replaced with this round's shots)

## Commands run
- `npm test`: 1218 pass. `eslint`: 0 errors. `impeccable detect`: `[]`.
- Playwright on `#dest=FCO`:
  - **390 × 844:** the photograph starts at x 0 and runs the full width. The tabs end at 551 px, above the foot bar at 775 px.
  - **375 × 667:** the tabs end at 541 px, above the foot bar at 598 px.
  - **1440:** the tabs stay in the main column.
  - At every size: no dot, no sideways scroll, no page errors.

## Config and secrets set
None.

## Before/after measurements
| | Before (T1024) | After |
|---|---|---|
| Photograph width on a 390 px phone | 342 px inset | full width |
| Tabs on a 390 × 844 first screen | no (below intro and facts) | yes (bottom at 551 px) |
| Tabs on a 375 × 667 first screen | no | yes (bottom at 541 px) |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The swipe rows did not bleed | The jump bar's own `margin` shorthand came later | Selector `.pt-wrap .pt-jump` |

## What is still open
Nothing new.

## Rollback procedure
`git revert` the T1025 commit; T1024's inset gallery and order come back.
