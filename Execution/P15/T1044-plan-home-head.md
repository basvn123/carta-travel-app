# T1044: Plan home head and Up next, refined

## Date

2026-11-04

## What changed

The top of the Plan home with trips (New trip, the Carta's own trips door, the Up next card) is refined at every width, keeping the umber, Figtree and photography. The owner asked for "more modern, clean, visually top notch" and "perfect on both mobile and desktop". New trip and the door are now one matched pair: the same height at every width (64 px on a phone, where they had been 64 and 72, and 72 px from 560 px). The disc is 48 px, lit from the top. The door loses its sun glow for a clean umber with a soft sheen and a hairline. Its name comes first and the photo deck sits at its end on a phone and a desktop alike, where before the deck was on the left on desktop only, and the arrow disc is gone. Up next sets its name at 700 rather than 800, with a soft text shadow, under an eased six-stop scrim rather than a hard three-stop fall. The countdown chip carries a calendar mark in the action brown, and the dates line adds the trip's nights ("5 Jun to 12 Jun, 7 nights", the key the My trips card already uses). On desktop the photo is 12:5 (340 to 420 px) rather than a 3:1 strip, the chip and the title share one 40 px inset (32 and 40 before; 24 px on a phone, 16 and 24 before), the arrow is 56 px, and on hover the photo zooms gently and the arrow fills brown. The slow drift is a little slower and smaller.

## Files touched

- `continent-app/src/planner/flow/PlanHome.jsx` (CartaDoor order and no arrow, UpNext nights and chip icon)
- `continent-app/src/styles/planners-held.css` (pfh-new-plus, pfh-door, pfh-door-deck and photo, pfh-next frame, chip, body, name, facts, go, desktop block, reduced motion)
- `continent-app/src/styles/planners/90-plan-home.css` (door order and phone deck, door hover, scrim, hover zoom)
- `Execution/P15/T1044-plan-home-head.md`, `Execution/_OPEN.md`

## Commands run

`npm test` in `continent-app/`, then `impeccable detect` on the touched files and `npx eslint src/planner/flow/PlanHome.jsx`. Screens were checked with a Playwright script that seeds three device trips (`carta.trips.v1`), against the worktree's dev server serving the main checkout's `public/`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Head heights on a phone, New trip and door (px) | 64 and 72 | 64 and 64 | matched |
| Up next height at 1440 px (px) | 403 | 420 | +17 |
| Up next height at 390 px (px) | 269 | 298 | +29 |
| Chip and title left inset at 1440 px (px) | 32 and 40 | 40 and 40 | aligned |
| Horizontal scroll at 360, 390, 1024, 1440 px | none | none | 0 |
| Tests | | 1214 pass, 3 fail | see below |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 3 tests fail in the worktree (`numbersPage.test.mjs`) | They read `public/boot.json`, which is gitignored and so missing from a fresh worktree | None needed: the same file passes 4 of 4 in the main checkout; this change does not touch it |
| The worktree's dev server showed "couldn't load travel data" | The ignored data files under `public/` (boot.json, dest/, poi/) are not in a worktree | A throwaway Vite config with `publicDir` pointed at the main checkout's `public/`, read only, no junction (not committed) |

## Screens checked

The Plan home with trips (one dated trip with a photo, one without, one draft) at 1440 by 900, 1024 by 768, 390 by 844 and 360 by 740, plus hover on the door and on Up next at 1440. Seen: New trip and the door level in one row; the deck whole inside the door at every width; at 360 px the door's name wraps onto two balanced lines, as before; the chip and the title on one inset; the scrim has no visible edge on the bright sky; the arrow clear of the name at 360 px. Impeccable detector: no findings. Screenshots are in `Execution/P15/T1044-shots/` (gitignored).

## What is still open

- T1044-a: the Up next trip is drawn twice, as the hero and again as the first card under Upcoming. Whether Upcoming should leave it out is a product call.

## Rollback procedure

`git revert` the T1044 commit. Nothing is one-way.
