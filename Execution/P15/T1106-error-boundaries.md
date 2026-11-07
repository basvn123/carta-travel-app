# T1106: Errors that stay local (S22, ROADMAP H13)

## Date

2026-11-06.

## What changed

A render error inside one main screen now stays inside that screen. A new `SectionBoundary` (in `ErrorBoundary.jsx`) wraps the seven main screens in `App.jsx` (home, explore, places, trip, day, planstart, pricing): the traveller sees one short sentence and a "Try again" button where the screen was, and the header and bottom nav keep working. The whole-app `ErrorBoundary` is unchanged and still catches what escapes. A stale-chunk error is deliberately re-thrown so the top guard still does its one reload. The plan flow, trail cards, beach strip and auth files were not touched: they are wrapped from outside, at the screen level. `SectionBoundary` takes `compact` (a card-sized message) and `resetKey`, so other sessions can wrap single cards later with no new code. `lib/seedError.js` is the seeded-error helper: a boundary with a `name` throws when that name is seeded, in tests via `seedError('x')`, in `npm run dev` via `?seedError=explore,trip` (dev builds only, inert in production).

## Files touched

- `continent-app/src/components/ErrorBoundary.jsx` (SectionBoundary)
- `continent-app/src/lib/seedError.js` (new)
- `continent-app/src/App.jsx` (seven screen wraps + import)
- `continent-app/src/i18n/en.js`, `nl.js` (`crash.section`, `crash.card`; other languages fall back to English)
- `continent-app/src/styles.css` (`.section-crash`)
- `continent-app/tests/sectionBoundary.test.mjs` (new, 4 tests), `continent-app/tests/section-boundary.spec.mjs` (new Playwright spec, owner box)
- `ROADMAP.md` (H13 status), `Execution/_OPEN.md`

## Commands run

`npm ci`; `node --test tests/sectionBoundary.test.mjs`; `npm test` (1344 tests, 1332 pass, 0 fail, rest skipped); `npx eslint` on touched files (0 errors; the 2 App.jsx warnings were already there).

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Browser check of the seven screens could not run here | The container has no wire data (`/boot.json` is not in the repo), so the app stops at "couldn't load travel data" before any screen renders | Unit tests cover the boundary logic and that every screen is wrapped; the browser spec is an owner step |
| `react-dom/server` failed under vite ssrLoadModule (`require is not defined`) | Vite tried to inline CJS React | The test imports react natively and loads only the app files through vite |

## Screens checked

None in a browser (no data in the container, see above). Checked by test: the boundary renders its message, a retry, no raw error text and no crash-screen markup; siblings render normally; retry clears the error.

## What is still open

- T1106-a: run `node tests/section-boundary.spec.mjs` (and look at `?seedError=explore` in `npm run dev`) on a box with the app data, phone and desktop width.
- T1106-b: wrap individual cards (explore cards, price cards) with `<SectionBoundary compact name="...">`; not done here because trail cards, the beach strip, plan flow and auth are edited by other sessions tonight and the explore card files were outside the named scope.
- T1106-c: the 107 silent catches in H13's description were not reviewed; this task covers render errors only.

## Rollback procedure

`git revert` the T1106 commit. No data or schema involved.

## Owner steps (for the checklist)

- [T1106-a] Check seeded errors stay in their screen | the container has no app data, so the browser check could not run | in continent-app run `node tests/section-boundary.spec.mjs` (set CHROMIUM_PATH if needed); open `npm run dev` at `/?tab=map&seedError=explore` at phone and desktop width and confirm one short message with Try again, header and nav still working | Execution/P15/T1106-error-boundaries.md
