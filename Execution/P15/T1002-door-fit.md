# T1002: Carta's own trips door, whole photographs and its own width

## Task ID
T1002

## Date
2026-11-02

## What changed
The owner looked at T1001's screenshots and asked for two fixes:
1. On a phone, the door's photographs were only partly on screen.
2. On desktop, the Carta's own trips bar was far too wide.

Fixes:
- **Phone (under 560 px).** The deck no longer runs out of the tile's right edge. The deck is 62 px wide with no negative margin, and the door has right padding, so all three photographs sit whole inside the tile.
- **From 560 px.** The row is `auto auto`, starting at the left. The door is as wide as its deck, its name and its arrow, and sits beside New trip.

## Files touched
**Modified:** `continent-app/src/styles/planners/90-plan-home.css`

**Created:** `Execution/P15/T1002-shots/` (Plan home at 375 and 1440 px)

## Commands run
- A NOPUBLIC build went into the scratchpad.
- The T1001 Playwright script, with the seeded Julian Alps trip, measured and shot the Plan home head at 375 and 1440 px.
- `npm test` was not rerun: the change is CSS only (T1001: 1204 of 1204).

## Config and secrets set
None.

## Before/after measurements
| Metric | Before (T1001) | After |
|---|---|---|
| Door width at 1440 px | 1069 px | 322 px |
| Deck photographs clipped at 375 px | yes, right edge | none |
| Door width at 375 px | 216 px | 216 px |

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new. T998 to T1002 wait for a deploy.

## Rollback procedure
`git revert be60bb91e0`
