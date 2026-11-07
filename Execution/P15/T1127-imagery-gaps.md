# T1127: Imagery gaps (G8, session 43)

## Date

2026-11-06

## What changed

Counted every screen and card that falls back to a placeholder, from the shipped wire in this container, and closed the part that licensed images can close. Only the trail cards had a real gap: 17,958 walks, 3,893 with their own photo, 10,841 borrowing the nearest place's hero within 25 km and 3,224 on the route glyph. A new selection rule (`lib/trailPhoto.js`) puts a licensed lake, summit or coast photograph within 5 km ahead of the town hero when the walk's highlights name that feature, and falls back to any licensed feature photograph within 10 km before the glyph. It is wired through `associateTrip` (4th argument, a per-country pool from `lib/trailPhotoPool.js`) and one hook line in `DestinationsTab.jsx`. Placeholders on trail cards go from 3,224 to 2,886. No component file was edited. No image is used that lacks a licence, and nothing is shown from further than the stated radii.

## Files touched

- continent-app/src/lib/trailPhoto.js (new), continent-app/src/lib/trailPhotoPool.js (new)
- continent-app/src/lib/trailCards.js (associateTrip uses the rule, returns photoSource, photoBy, photoLic, photoPage)
- continent-app/src/browse/DestinationsTab.jsx (pool hook, pool passed to associateTrip)
- continent-app/tests/trailPhoto.test.mjs, continent-app/scripts/verify_trail_photos.mjs (new)
- docs/HANDBOOK.md (no-photo section), ROADMAP.md (G8 status), Execution/_OPEN.md

## Commands run

- `node scripts/verify_trail_photos.mjs` (from continent-app/)
- `node --test tests/trailPhoto.test.mjs`; `npm test`

## Config and secrets set

None.

## Before/after measurements

Placeholder per screen (card shows the blank ground, initials or route glyph), from the shipped wire:

| Screen or card | Rows | Before | After |
|---|---|---|---|
| Destinations (Explore cards, rails, place page) | 3,868 | 27 (all gems) | 27 |
| Beaches | 2,745 | 0 | 0 |
| Lakes | 1,628 | 0 | 0 |
| Mountains | 728 | 0 | 0 |
| Composed trips | 5,866 | 0 | 0 |
| Cycling routes | 713 | 0 | 0 |
| Trails (own photo 3,893) | 17,958 | 3,224 | 2,886 |

Trail cards that show a photo of somewhere other than the walk: before, 10,841 town heroes; after, 10,046 town heroes, 697 licensed feature photos (matching the walk) and 436 nearby feature photos. Journeys were not counted (their photos sit on per-day records).

## What broke and how it was fixed

No issues. `npm test` has 71 failures that exist before this change (888 pass, 72 fail on the untouched tree; none touch trail code). ESLint could not run: `@eslint/js` is not installed in this container.

## Screens checked

Not opened in a browser (no dev server per the brief). The end check should look at Trails (a walk with a lake highlight, a walk far from towns) at phone and desktop width.

## What is still open

See rows T1127-a to T1127-d: the trail-photo harvest, the 27 gems, the credit line on cards, and map thumbnails. The remaining 2,886 walks stay on the route glyph; the 27 gems keep `hero-blank`.

## Rollback procedure

`git revert` the T1127 commit. No data changed.

## Owner steps (for the checklist)

- [T1127-a] Trail photo harvest | 2,886 walks still have no licensed photo | run `python pipeline/trails/trail_images.py` on the box with Commons access with a wider radius; re-export the trails wire; re-run `node scripts/verify_trail_photos.mjs` | pipeline/trails/trail_images.py
- [T1127-b] Heroes for 27 gem destinations | no licensed hero exists for them | run the Commons geosearch hero pass (`pipeline/audit_hero_images.py`) for the gem tier; re-run `pipeline/photos/hero_ladder.py` | pipeline/audit_hero_images.py
