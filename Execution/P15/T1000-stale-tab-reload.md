# T1000: a tab open across a deploy reloads instead of crashing

## Task ID
T1000

## Date
2026-11-02

## What changed
The owner sent a screenshot of "This page stopped working" with the note "plan tab right now".

Findings:
- **A deploy went out while the tab was open.** A production deploy about 12:10 put `dist/` (the T998 build from 11:09) live while the owner's tab still ran T989-T991. Cloudflare Pages then no longer serves the previous build's chunks.
- **Plan already reloads.** Plan is loaded through `lazyWithReload`, which reloads on any chunk failure. A stale Plan chunk, JS or CSS, already recovered, and Playwright confirms it on the T999 build.
- **My trips crashes.** My trips, Together and the other `lazy` pages rely on the crash panel's stale-bundle test, `CHUNK_ERROR_RE`. That test knew the browsers' module-script messages but not Vite's "Unable to preload CSS for ...". A stale My trips stylesheet therefore showed the crash panel with no reload.

Fixes:
- **`main.jsx`:** a `vite:preloadError` listener (Vite's documented hook for this case) reloads the page for the fresh build. It reloads at most once a minute (`continent.preloadReloadAt.v1` in sessionStorage), so a chunk that is really broken still reaches the panel instead of looping.
- **`ErrorBoundary.jsx`:** `CHUNK_ERROR_RE` also matches "unable to preload css".

The headless walks did not reproduce a crash on Plan itself in any state: no trips, device trips (upcoming, empty, past), New trip, the Carta door, Up next, tab switches and Together. One case is untested: a signed-in account (T1000-a).

## Files touched
**Modified:**
- `continent-app/src/main.jsx`
- `continent-app/src/components/ErrorBoundary.jsx`

## Commands run
- `npx eslint`: 0 errors. One warning, there before.
- `npm test`: 1204 of 1204 pass.
- Fast builds without `public/` of T999 and T1000 into the scratchpad, served by `scratchpad/serve.mjs`.
- Playwright `stale.mjs` answers one chunk with a 404 and then opens the page.

## Config and secrets set
None.

## Before/after measurements
| Case (one chunk answers 404) | T999 build | T1000 build |
|---|---|---|
| Plan, `planners-*.css` | reload, Plan opens | reload, Plan opens |
| My trips, `SavedTripsPanel-*.css` | crash panel, no reload | reload, My trips opens |

## What broke and how it was fixed
Nothing.

## What is still open
T1000-a: if Plan still shows the crash panel after "Reload the app", the owner copies the console line that starts with "App crashed:" (desktop: F12, then Console). The panel itself never shows the error text (T401).

## Rollback procedure
`git revert 6305ba1e14`.
