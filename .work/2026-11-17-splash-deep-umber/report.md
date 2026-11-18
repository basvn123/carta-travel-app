# Opening screen: deep umber (G5)

2026-11-17 · L1 · design · branch `p15-splash-deep-umber` (from `origin/main` 1cc83c93c8, the house style in production)

## What the owner asked

"Add a nicer loading screen when I open the app. It must be very nicely looking. Compare with other apps. First tell me how it would look." Three directions were shown as a playable preview (an Artifact with phones at three network speeds and a comparison with Airbnb, Google Maps, Spotify, Linear). The owner chose **C, deep umber**.

## What changed for a traveller

- The first frame is no longer a blank page. A deep umber screen paints before any script runs: the blaze paints itself (halo, stripe left to right, heel), "Carta" lifts in letter by letter, then the tagline in the reader's language.
- Along the bottom, the real ground around Chamonix rises in once, drawn by the house relief from Chamonix's own dossier peaks, with one real height: "Mont Blanc 4,806 m" (number formatted per language, "4.806 m" in Dutch).
- While the app still waits, the house loading mark shows. After 4 s one plain line: "Taking longer than usual" (six languages).
- When the app is ready, the whole screen lifts away like a curtain with rounded bottom corners and a soft shadow, onto the app. Before, a small logo screen cut straight to the app.
- The opening plays to its end only on the first open in a browser session (at most 1.5 s from first paint). Later opens lift the moment the app is ready; a tap skips the wait.

## How the preview changed on the way

The preview was drawn with the old compass mark and invented contour lines. The house style in production (G1) had since replaced the compass with the blaze, set Overpass, and made the relief rule "real peaks only, one real height printed". So the built screen uses the blaze and real Chamonix ground, not the preview's compass and made-up rings. Directions A (compass) and B (dotted route map) would both have broken the house style's ban on travel clichés.

## Departures from the house defaults (on purpose)

- A full deep umber ground with a soft glow (`--umber-700` into `--umber-800`); the owner chose it.
- Animation at first paint, which "What never animates" forbids; the opening screen is now the one named exception (DESIGN.md).
- The relief leaves rules 3 to 5 and 7: a new place (the opening screen), no cut (it fades in over its top third and the words centre above it, so no contour runs under text), contrast tuned for the dark ground, and one rise-in instead of only a fade. Rules 1, 2, 6 and 8 hold.
- The loading mark loops while the app waits; the house allows loops for a real loading indicator.

## Files

| File | Change |
|---|---|
| `continent-app/index.html` | Static `#boot-splash` markup after `#root`; `theme-color` starts umber with the stone ground in `data-app` |
| `continent-app/src/styles/06-boot-splash.css` | New: the screen, its arrivals, `.no-intro`, reduced motion, forced colours, short landscape |
| `continent-app/src/styles.css` | Imports it after `05-house.css` |
| `continent-app/src/lib/bootSplash.js` | New: draws the relief, takes the words, slow line, hold, release, settle, the lift, `liftDelay` |
| `continent-app/src/components/LoadingScreen.jsx` | New: holds the splash while mounted; draws the same screen itself if `index.html` has none |
| `continent-app/src/App.jsx` | Both waits (session, data) render `LoadingScreen`; the error screen is unchanged |
| `continent-app/src/main.jsx` | Imports `bootSplash.js` first; `BootSplashSettle` lifts it after the first commit |
| `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` | `shell.slowLoad` |
| `continent-app/tests/bootSplash.test.mjs` | New: prerender root intact, no inline style, theme colours match tokens, six languages without dashes, `liftDelay` |
| `DESIGN.md` | The opening screen under "Background graphics"; the exception in "What never animates" |
| `docs/HANDBOOK.md` | New section "Opening screen" |
| `ROADMAP.md` | G5 status |
| `docs/owner/owner-checks.md` | Step 15, G5-a: the installed app's launch colour (protected manifest) |

## Checks

- `node --test tests/bootSplash.test.mjs`: 5 of 5 pass.
- `npm test` (all app tests, Windows worktree): 2,161 tests, 2,117 pass, 31 fail. None involves this change: rerun on their own, the failures are Vite module runner timeouts (`pipelineOverrides`, `seasonStrip`, `sharedParts`, `sectionBoundary`), Windows path bugs in the tests (`cspHashes` scans `C:\C:\...`, `shareAssets` imports a `c:` URL), CRLF byte compares (`placeLinking` build-set check, `promptRegistry`, `pressKit`, `motion-tokens` self-test fixture; `docs/lessons.md` 2026-11-12), the Python guard missing a zero-width attack (`aiGateway`), and the docs eval (`askDocs` section5 0.896 to 0.875), which fails the same with this run's doc edits taken out. CI on Linux is the check that counts.
- `npx eslint` on the touched files: 0 errors; two warnings in `App.jsx` were there before.
- `node scripts/ci/design-lint.mjs`: 0 new violations (durations are house tokens; the opening's start times are one named block of `--boot-at-*` properties on `.boot-splash`; shadows `--elev-2`, `--elev-3`; the name `--text-display`).
- `impeccable detect` on the CSS, the component and `index.html`: no findings.
- `check_entry_points.py`: OK. `drift.py`: one drift, `docs/SCHEMA.md`'s wire table, not touched here (`docs/lessons.md` 2026-11-12: byte-compare checks fail in a CRLF worktree).
- Looked at in Chromium through the dev server, with the real stylesheet loaded render-blocking as in production and the real markup and module (no build: the disk had 25 MB free): phone 390 x 844, tablet 820 x 1180, desktop 1440 x 900, landscape phone 844 x 390, Dutch, reduced motion (0 running animations), a cached open (lifts with no wait), the lift mid-way, and the real app through the dev server (hold, lift, done; `theme-color` back to stone; the lift also uncovers the error screen correctly). No horizontal scroll. Screenshots in this folder's `shots/`, not committed.
- After the first look, the words were moved lower (`.boot-stack` bottom at 62 % of the relief's height) so the phone screen balances, and the literals became tokens; all eight scenarios were shot again and checked.

## Not done, and why

- **The installed app's launch colour** (G5-a, `docs/owner/owner-checks.md` step 15): `manifest.webmanifest` is a protected path, so an installed launch still shows stone, then umber.
- **No production build or `npm run ci`**: the C: drive ran out during the run (0 bytes at one point, about 3 GB later). CI on push runs the fast build; `npm run ci` locally also runs the CSP check (`verify_csp`) and the smoke test, which need about 1.3 GB.
- **A real phone**: not checked on a device.

## How to undo

`git revert <the commit>` on `p15-splash-deep-umber` (or on main after the merge). No data, schema or migration change.
