# T1004: a more compact cost card, and Previous and Next on the passes

## Task ID
T1004

## Date
2026-11-02

## What changed
The owner looked at T1003 and said:
- **"On mobile phone I would like to swipe."** The screenshot was a desktop window.
- **"I really like the What it costs section, but just a little more compact."**

**Swipe.** Swiping already works on a phone. An emulated touch swipe at 390 px moved the row 235 px, and it snapped to the next card. A mouse cannot swipe, and the row hides its scrollbar. So on a device with a fine pointer and hover, Previous and Next now sit beside the count and step one card at a time. A touch device does not show them, and a finger swipes. When the row is scrolled to its end with two cards in view, the last card now counts as the one in view, so Next turns off.

**Compact card.** Same design, less height:
- The arc is 236 px wide (was 300) and its stroke is 12 (was 13).
- The total is 30 px (was 34).
- Rows are 48 px (were 56), marks 32 px (were 36), and row figures are body size.
- The card's padding and gaps are one step tighter.

## Files touched
**Modified:**
- `continent-app/src/planner/trip/BookPasses.jsx`
- `continent-app/src/planner/TripSummary.css`

**Created:** `Execution/P15/T1004-shots/`

## Commands run
- `npx eslint`: 0 errors.
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build. A Playwright touch swipe ran at 390 px with `isMobile` and `hasTouch`. The T1003 shoot script, with Next clicked, ran at 375 and 1440 px.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| Cost card height at 375 px | 571 px | 484 px |
| Pass row moved by a phone swipe | 235 px (already worked) | 235 px |
| Ways to step the passes with a mouse | the segments only | the segments, plus Previous and Next |

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new. T1003-a and T1003-b stay open.

## Rollback procedure
`git revert 70477c296b`
