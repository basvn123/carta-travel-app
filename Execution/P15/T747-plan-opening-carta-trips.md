# T747: the Plan opening's way to Carta's own trips: a fan of trip photographs, the mark and one button

## Task ID

T747 (P15), branch `p15-plan-opening-v5` in the root repo and in `continent-app/`. Follows T746 (`Execution/P15/T746-plan-opening-play-a-day.md`).

## Date

2026-10-27

## What changed

The owner reviewed T746 live in the session and steered in five short messages: no video (the played day), no specific trip, keep it general and say the trips are Carta's own; the words "See Carta's own trips"; then no explanatory line, the Carta mark and "Carta's own recommended trips", smaller, a collection of images of the different trips with a button, dynamic, clean; then the headline and buttons more to the middle. The owner approved the result ("yess", "I really love it").

- **The played day is gone** (bars, play, pause, replay, the named week), with its icons and keys.
- **Carta's own recommended trips:** one white card, at the bottom of a phone and centred on the right from 1024 px. A fan of five trip-style photographs (October: hiking in the middle, then cities, the sea, cycling, small towns), each framed in white and turned 5 degrees a step; under it Carta's compass mark, "Carta's own recommended trips" and a brown pill "See the trips →". The whole card is one link to the planned-trips overview (the 15 styles).
- **Dynamic:** the fan opens once from a stack when the page arrives (480 ms, 50 ms apart) and spreads a little further on hover, the pill's arrow nudges. Nothing loops; reduced motion stills it all.
- **The fan always fits:** each photograph is a share of the card's width (27 per cent on a phone, 22 on a short phone, 21 from 1024 px) and steps a share of its own width, so no photograph leaves the card at any size, hover included.
- **The headline and the two big buttons** sit centred in the room the card leaves on a phone. The secondary button reads "Carta's own trips".
- **Loading:** the journeys index only (one file).
- Six languages: `pf.promo.title`, `pf.promo.link`; `pf.home.browse` rewritten; `pf.day.*` and `pf.promo.text` removed.

## Files touched

**Modified:** `continent-app/src/planner/flow/PlanHome.jsx` (rewritten), `continent-app/src/components/Icons.jsx` (`PlayIcon`, `PauseIcon`, `ReplayIcon` removed), `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`, `continent-app/src/styles/86-plan-flow.css`, `DESIGN.md`.

**Created:** none. **Deleted:** none.

## Commands run

`npm test` (833 pass), `node scripts/ci/design-lint.mjs` (nothing new in touched files; the en.js hit "Easy without a car" is older than this task), `npx eslint` (clean), the NOPUBLIC build (`wt/vite.t743.mjs`), `node scripts/css-routes.mjs --check` (no plan-flow problem), Playwright rounds at 360×640, 375×667, 390×844, 820×1100, 1280×720 and 1440×900 plus a desktop hover (0 px scroll everywhere, five photographs), and a click round: Start planning opens the trip-kind sheet, the secondary button and the card each open the 15 styles. No page errors. Then `npm run build:pages` and a Pages preview deploy.

## Config and secrets set

None.

## Before/after measurements

| Measure | T746 | T747 |
|---|---|---|
| Scroll on the first Plan screen, every size above | 0 px | 0 px |
| Journeys files fetched by the opening | 2 to 3 | 1 (the index) |

## What broke and how it was fixed

The fan was first sized from its height, so on a phone and on desktop hover the outer photographs stood outside the card; it is now sized from the card's width. With `animation-fill-mode: both` the finished arrival would have held `transform` and blocked the hover spread; it is `backwards`.

## What is still open

T743-a stands. Not deployed to production: the owner asked for push and a preview link.

## Rollback procedure

`git revert` the T747 commit in `continent-app/` and in the root repo (restores T746), rebuild, redeploy. No data or schema change.
