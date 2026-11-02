# T1014: Export & share on the page ground

## Task ID
T1014

## Date
2026-11-02

## What changed
The owner asked to remove the tiles' border, and the card's white background too.

- Export & share no longer has a card: no white background, no shadow, no padding. It sits on the page ground like the other sections.
- Its tiles are white with no border. On hover they turn umber-50.
- Its title now matches the page's other section titles: title size, weight 600.

## Files touched
**Modified:** `continent-app/src/planner/TripSummary.css`

**Created:** `Execution/P15/T1014-shots/`

## Commands run
- NOPUBLIC build. Playwright ran at 390 px (touch) and 1440 px: no horizontal scroll.
- The title change came after the screenshot. It is a single CSS rule that sets the same values as the page's `.itin-h`.
- CSS only, so the unit tests were not rerun (T1013: 1204 of 1204).

## Config and secrets set
None.

## Before/after measurements
Not measured.

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new.

## Rollback procedure
`git revert 440eb6e6ab`
