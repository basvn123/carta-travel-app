# T1090: CSP without style-src 'unsafe-inline', and the CSP gate in CI

Roadmap item C5 (Web and API hardening). Rows T1079-c and T1079-e. Session S06 of `Execution/P15/_NEXT-50-SESSIONS.md`.

## Date

2026-11-05

## What changed

The shipped CSP no longer allows inline style: `style-src 'self' 'unsafe-inline'` is now `style-src 'self'` plus two sha256 hashes, and no directive carries `'unsafe-inline'`. What really works on a static Pages host, checked in Chromium: React `style` props, MapLibre's marker and control positioning, `el.style.x = ...`, `style.cssText` and `style.setProperty('--x')` all go through the CSSOM, which no style-src governs, so they needed nothing. What CSP does refuse is a `style=""` attribute in parsed HTML (an innerHTML string), `setAttribute('style', ...)`, and any `<style>` element without a matching hash or nonce. A nonce is useless on a static host (it must change per response), so hashes are the tool. The app had four such inline styles: the `@font-face` block in `index.html` (moved to `src/styles/00-fonts.css`, now part of the bundled sheet, so it needs no hash), one `style="background:..."` in a DestMap pin string (now set through the CSSOM), the print view's popup stylesheet (the popup is about:blank and inherits the app's CSP; its CSS is now the exported constant `PRINT_CSS`, allowed by hash) and the prerendered page's reading-column stylesheet (served by the Pages Function under the shell's CSP; the constant `STYLE`, allowed by hash). `scripts/csp-hashes.mjs` computes both hashes from the sources and writes them into `public/_headers`; `tests/cspHashes.test.mjs` fails on a stale hash, on any `'unsafe-inline'`, on a CSP line over the Pages limit, and on any `style=""` string, `setAttribute('style')` or new `<style>` in `src/`. `scripts/verify_csp.mjs` was rebuilt into a real gate: it serves a build (the fast build plus `public/`) under the header from `_headers`, walks 20 screens at phone and desktop width plus the print popup and a prerendered page spliced the way the Function does it, stubs the basemap style so every MapLibre map finishes loading with no network, and fails on any CSP refusal or a screen that never painted. It found 0 violations on all 40 loads. CI runs it as the new `csp` job in `ci.yml`.

## Files touched

- `continent-app/public/_headers`: style-src without `'unsafe-inline'`, two hashes; amendment note.
- `continent-app/index.html`: inline `<style>` with the two `@font-face` rules removed; comment points to the new file.
- `continent-app/src/styles/00-fonts.css` (new): the two Figtree faces.
- `continent-app/src/styles.css`: imports `00-fonts.css` first.
- `continent-app/src/browse/DestMap.jsx`: nature pin dot colour through the CSSOM instead of a `style=""` string.
- `continent-app/src/lib/tripExport.js`: print CSS as the exported `PRINT_CSS`; `tripPrintHtml` exported for the gate.
- `continent-app/scripts/prerender/html.mjs`: `STYLE` exported (content unchanged, so pages already in R2 keep matching if they were built from this STYLE).
- `continent-app/scripts/csp-hashes.mjs` (new): print, `--check`, `--write` the style-src.
- `continent-app/scripts/verify_csp.mjs`: rewritten as the gate (all screens, both widths, popup, prerender, hermetic, any directive).
- `continent-app/tests/cspHashes.test.mjs` (new): four tests.
- `continent-app/scripts/ci/design-lint.mjs`: `font-family` inside `@font-face` is the face's name, not a use of a typeface, so it is no longer a font-literal.
- `.github/workflows/ci.yml`: new job `csp`.
- `docs/HANDBOOK.md` (response headers paragraph), `ROADMAP.md` (C5 status), `Execution/_OPEN.md` (rows appended).

## Commands run

```
cd continent-app
npm ci
node scripts/csp-hashes.mjs --write
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/verify_csp.mjs --dist ../.fastbuild
# negative control: the same policy with the two hashes taken out
node scripts/verify_csp.mjs --dist ../.fastbuild --only print-view,prerendered --csp "<real policy with style-src 'self'>"
npm test
node scripts/ci/design-lint.mjs
node scripts/css-routes.mjs --check ../.fastbuild/assets
```

`CHROMIUM_PATH` is only for this container, whose preinstalled Chromium is not the build the lockfile's Playwright downloads; CI installs the matching browser with `npx playwright install --with-deps chromium`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `'unsafe-inline'` in the shipped CSP | 1 (style-src) | 0 | -1 |
| Inline `<style>` in the built `index.html` | 1 | 0 | -1 |
| Inline style sources in `src/` the CSP would refuse | 1 (`DestMap.jsx`) | 0 | -1 |
| CSP violations under the shipped policy, 40 screen loads (20 screens x phone, desktop) | not gated (old harness: 6 phone screens, image hosts only, never served `?v=` URLs) | 0 | |
| Same, with the two hashes removed (negative control, print and prerender screens) | | 10 refusals, 4 of 4 loads fail, print style visibly not applied | gate is not vacuous |
| CSP header length (Pages limit 2,000) | 979 characters | 1,071 | +92 |
| `npm test` | | 1,301 tests, 1,289 pass, 0 fail (12 skipped) | +4 tests |
| Design lint new violations | | 0 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The old `verify_csp.mjs` could not test the real app | Its server looked up `req.url` with the query string, so every `?v=` data file was a 404; it only listened for image refusals on 6 phone screens. | Rewritten: strips the query, falls back to `public/` for a fast build, any directive, 20 screens, two widths. |
| First full run reported 0 on everything | Maps never loaded (the CARTO style is remote), and the print screen opened `/undefined`. | Basemap style stubbed locally, print screen fixed, and a negative control run to prove refusals are caught. |
| Design lint flagged `font-family: 'Figtree'` in the new fonts file | The rule read the `@font-face` descriptor as a use of a typeface. | `design-lint.mjs` skips `font-family` inside an `@font-face` block. |
| Playwright in `node_modules` wants a browser build this container lacks | Container has Chromium 1243, the lockfile's Playwright wants 1228. | `CHROMIUM_PATH` env in the gate; CI installs its own. |

Gotchas for the next session:

- Motion would inject a `<style>` for `AnimatePresence mode="popLayout"` and for view transitions (`animateView`). The app uses neither today; adding one breaks under this CSP, and the gate will say so.
- A prerendered page in R2 carries the `STYLE` of the run that wrote it. Change `STYLE`, run `csp-hashes.mjs --write`, and re-run the prerender upload in the same sitting, or the live pages lose their reading-column style.
- Do not add `'unsafe-hashes'` to allow `style=""` attributes by hash; set the style through the CSSOM instead.

## Screens checked

`scripts/verify_csp.mjs` on the fast build, Chromium, at 390x844 and 1280x800, under the policy read from `public/_headers`: home (first visit), map, trip planner tab, day planner tab, a city (`#dest=FCO`), a gem (`#dest=gem%3Abled`), a region, a trail, a beach, a lake, a mountain, a cycle route, a tour, active trips, bike trips, journeys index, a journey, an itinerary, a prerendered trail page spliced into the built shell (the app boots over it), and the print view popup written by the real `tripPrintHtml`. Every load painted; 0 violations; the print popup's and the prerender column's stylesheets were checked as applied (computed `max-width` 640px and 760px). A one-off probe confirmed the mechanism in Chromium: an innerHTML `style=""` and `setAttribute('style')` are refused and reported as `style-src-attr`, while `el.style.color`, `style.cssText` and `style.setProperty('--x')` apply. No screenshots: this is a DOM and event check. The deployed header and a real phone are owner steps.

## What is still open

- T1090-a (user): check the deployed header and the two hashed documents on the preview deploy, and that the prerendered pages in R2 were built from the current `STYLE`.
- T1090-b (next task): watch the first run of the `csp` CI job on GitHub (browser install with `--with-deps`, about 5 minutes) and fix it if the runner differs.
- T1090-c (next task): `node scripts/css-routes.mjs --check` reports 3 problems on this base, independent of this task: `planners/88-pf2-wizard.css`, `89-plan-days.css` and `90-plan-home.css` have no global sheet of that name in `src/styles.css`. Not in CI.
- Rows T1079-c and T1079-e are done by this task. Per the overnight rule (append only to `_OPEN.md`), they were left in place; the orchestrator moves them to `_OPEN-CLOSED.md` with `closed by T1090`.

## Rollback procedure

`git revert` the T1090 commits. Nothing is one-way: no data, no migration, no deploy. Reverting restores `'unsafe-inline'` and the inline font block together, so no screen loses style on the way back.

## Owner steps (for the checklist)

- [T1090-a] Check the strict style-src on the preview deploy | the CSP without 'unsafe-inline' only proves itself on the real Pages host and real Safari | after the next deploy to the preview branch, run `curl -sI https://preview.carta-app.pages.dev/ | grep -i content-security-policy` and confirm style-src reads `'self'` plus two sha256 hashes and no 'unsafe-inline'; open the preview in Chrome with DevTools Console open, walk the map, a destination, a trail and the trip planner, and confirm no "Refused to apply inline style" line; open a prerendered page (any /spain/trails/... link from the sitemap) and confirm the reading column is styled and the console is clean, and if it is not, re-run the prerender upload (`node scripts/prerender/build.mjs` then `push.mjs`) so the pages carry the current STYLE; print a saved trip and confirm the print view is styled; repeat the trail and print checks on an iPhone in Safari | Execution/P15/T1090-csp-no-inline-style.md
