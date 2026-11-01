# T967: Carta's own trips, owner polish

## Task ID

T967

## Date

2026-11-01

## What changed

Three owner calls on the T964 block. The line "258 weeks in 39 countries, each one planned by Carta" is gone, so the block is the deck, the title and the button. The block's brown is now the Ask door's own (the same `linear-gradient(150deg, --umber-600, --umber-800)` with the warm `--sun-400` glow as `.sdock-ask`; checked equal in the computed styles). The photographs are sharper: they could load at most 500 px wide and were lazy; they now load up to 960 px (`sizes` 45vw on a phone, 320 px on a desktop) and the five on show load at once.

## Files touched

**Modified:** `continent-app/src/browse/CartaOwnTrips.jsx`, `continent-app/src/styles/97-carta-own-trips.css`, `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`xown.facts` removed)

## Commands run

Fast build (`wt/vite.t960.mjs` with `PF_OUT`), Playwright at 390 px with device scale 3, then `VITE_E2E_SEAMS= npm run build:pages` and `npx wrangler pages deploy dist --project-name carta-app --branch main`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Photo width loaded on a 390 px phone at 3x | 500 px (cap) | 960 px | +460 px |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| With 960 px photos the cards stood empty and brown for a moment | Lazy loading of larger files | The five on show load eagerly |

## What is still open

None. Rollback: `git revert` this task's commit.
