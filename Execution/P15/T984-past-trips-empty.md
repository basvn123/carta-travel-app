# T984: an empty Past trips is one add tile

## Task ID
T984

## Date
2026-11-01

## What changed
On Your Europe, an empty travel record used to show three things that all said the same: the "Past trips" head with its own "+ Add a past trip", a "No past trips yet" title, and a primary "Add a past trip" button. It now shows the head, which already names the section, and one tile under it. The tile is full width, 64 px tall, with a dashed outline mixed toward the brown, a plus in a round `--select-bg` disc, and the words "Add a past trip" in `--select-ink`. Once the record holds a trip, the head's quiet "+ Add a past trip" returns as before. The unused key `saved.pastEmptyShort` is gone from all six languages, and `Empty` is no longer imported in `YourEurope.jsx`.

Branch `p15-past-trips-empty` (root repo), commit `8f6b13930a`.

## Files touched
**Modified:** `continent-app/src/auth/mytrips/YourEurope.jsx`, `continent-app/src/styles/70-mytrips.css`, `continent-app/src/i18n/{en,de,es,fr,it,nl}.js`

**Created:** `Execution/P15/T984-past-empty-375.png`, `Execution/P15/T984-past-empty-1440.png`

## Commands run
- `npx eslint src/auth/mytrips/YourEurope.jsx`: 0 problems.
- `npm test`: 1204 of 1204 pass.
- A Playwright check on a fresh device at 375 and 1440 px. At both widths the section shows the tile, with no head action. A tap on the tile opens the past-trip form. No page errors.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| Add-a-past-trip controls in an empty record | 2 | 1 |
| Lines in an empty record under the head | title and button (about 110 px) | one tile (64 px) |

## What broke and how it was fixed
The first patch to strengthen the outline missed its line because of a line-ending mismatch. It was applied with a regex and folded into the same commit before the push.

## What is still open
Nothing.

## Rollback procedure
`git revert 8f6b13930a`.
