# T1175: Shareable assets, the 100 a day map, the cheapest week and the trip receipt (K7, S91)

## Date

2026-11-07

## What changed

ROADMAP K7. Carta can now make three share images from its own data, each with a numbers check and the data credits printed on it. `scripts/share/share_assets.mjs` draws "Europe on 100 EUR a day": every priced place on the Natural Earth map of Europe, filled where one person's day (a bed in an entire place for two plus food and drink, the app's default request) is 100 EUR or less. On today's catalogue that is 535 of 3,353 priced places (3,868 in the catalogue), most of them in Czechia (66), Poland (49) and Romania (44). The same script draws "the cheapest week" calendar per place: the 52 weeks of 2027 priced at their own dates through the app's engine, cheapest marked. It reads the stays wire from `--stays DIR`, which is on the data host and not in this container, so the calendars were made only from a fixture curve here and the real run is an owner step. In the app, a saved trip's menu in My trips offers "Share the receipt" behind the flag `?receipt=1`. A sheet draws the trip as a 1080 x 1350 PNG on a canvas, checks every printed figure against the trip's price by a second path, then offers Share (Web Share with the file, where the browser can) and Save the image. All three images are built by one drawing format (`lib/share/draw.js`), drawn on a canvas in the app and as SVG in the script, so the tests read the same image a traveller shares. No new dependency.

## Research

A research subagent compared tools for the three jobs (2026-11-07, versions from `npm view`):

| Job | Options | Choice and why |
|---|---|---|
| Offline rendering in Node | hand-written SVG to PNG with [@resvg/resvg-js](https://github.com/thx1011/resvg-js) 2.6.2 (MPL-2.0, about 4.5 MB native); [satori](https://github.com/vercel/satori) 0.63 plus resvg (about 26 MB); [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) 1.1 (MIT, about 40 MB); node-canvas 3.2 (Cairo, hard on Windows); [sharp](https://sharp.pixelplumbing.com) 0.35 (librsvg, fonts hard to pin); headless Chromium through Playwright (already a devDependency) | Hand-written SVG, rasterised with the Playwright Chromium the repo already has, Figtree inlined as a data URL. The subagent ranked resvg first for determinism and speed; it would add a package, and this task may not touch `package.json`. The SVG stays the checked artefact either way, so swapping the rasteriser later is a one-file change (row T1175-f). |
| Browser receipt | Canvas 2D with `toBlob` (0 KB); SVG to Image to canvas (fonts as data URIs, Safari fussy); [modern-screenshot](https://github.com/qq15725/modern-screenshot) 4.7, [html-to-image](https://github.com/bubkoo/html-to-image) 1.11, [html2canvas](https://github.com/niklasvh/html2canvas) 1.4 (foreignObject or a CSS re-implementation, CSP friction, iOS flaky, html2canvas unmaintained) | Canvas 2D: no bytes added, CSP safe, the app's own Figtree. The PNG is made when the sheet opens, so `navigator.share` runs inside the tap (iOS refuses a share after an await). Web Share with files works on iOS and iPadOS Safari 15 and later, Android Chrome, desktop Safari and Chrome on Windows, ChromeOS and macOS (128 and later); not on Firefox, so Share shows only when `navigator.canShare({ files })` is true and Save always ([web.dev](https://web.dev/articles/web-share), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare)). |
| Base map | [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) (public domain); OSM tiles (ODbL, visible credit, tile server terms, network); no base map | Natural Earth, already projected in `public/europe_map.json` (the Your Europe map), credited on the image although not required. |

Credits printed on the images come from `docs/tos/data_licenses.md`: Natural Earth (map), GeoNames CC BY 4.0 and OpenStreetMap contributors ODbL (places), and for prices Carta's own samples of list prices, Inside Airbnb CC BY 4.0, Eurostat and Open Food Facts Open Prices ODbL. The receipt has no photo or map, so it needs no image credit; its foot says the figures are Carta's estimate on a date, and that a flight line is the fare Google Flights showed.

## Files touched

- Created: `continent-app/src/lib/share/draw.js`, `receipt.js`, `flag.js`
- Created: `continent-app/src/components/ShareReceiptSheet.jsx`
- Modified: `continent-app/src/auth/SavedTripsPanel.jsx` (the flagged menu item, the lazy sheet)
- Modified: `continent-app/src/i18n/en.js`, `nl.js`, `de.js`, `fr.js`, `es.js`, `it.js` (17 `share.receipt*` keys each)
- Created: `scripts/share/share_assets.mjs`, `scripts/share/render_png.mjs`, `scripts/share/.gitignore` (outputs in `scripts/share/out/`)
- Created: `continent-app/tests/shareAssets.test.mjs`, `continent-app/tests/fixtures/share/PT.json` (a made-up month curve, never published)
- Created: `continent-app/scripts/verify_share_receipt.mjs`
- Modified: `docs/HANDBOOK.md` (new section "Shareable assets"), `ROADMAP.md` (K7 status), `Execution/_OPEN.md` (rows T1175-a to f)
- Created: `Execution/P15/T1175-shareable-assets.md`

## Commands run

```
cd continent-app && npm ci && cd ..
node scripts/share/share_assets.mjs
node scripts/share/share_assets.mjs --stays continent-app/tests/fixtures/share --places LIS,OPO
node scripts/share/share_assets.mjs --stays continent-app/tests/fixtures/share --places LIS,OPO --check
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/share/render_png.mjs --dir scripts/share/out
cd continent-app && node scripts/sync-data.mjs --split-only   # local boot files for the dev server, removed after
VITE_E2E_SEAMS=1 npx vite --port 5231 --strictPort
CARTA_PORT=5231 SHOTS=../Execution/P15/T1175-shots node scripts/verify_share_receipt.mjs
npm test; npm run lint; node scripts/ci/design-lint.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild
cd .. && python -m pytest tests -q -rs $(grep -v '^#' tests/quarantine.txt | grep . | sed 's/^/--deselect /')
```

## Config and secrets set

None. The flag is off by default (`?receipt=1`, localStorage `carta.shareReceipt`, or `VITE_SHARE_RECEIPT=1`).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Share images Carta can generate from data | 0 | 3 (map, calendar per place, receipt) | +3 |
| Places under 100 EUR a day, one person (default request) | n/a | 535 of 3,353 priced | |
| Calendars made in this container | n/a | 2 from the fixture curve; 0 from live data (no stays wire here) | |
| Printed figures failing the numbers check | n/a | 0 (map, 2 calendars, sample receipt, receipt in the browser at 2 widths) | |
| Generator runtime, map and 2 calendars | n/a | 0.6 s alone, 6.8 s beside the test suite | |
| My trips chunk (`SavedTripsPanel-*.js`, fast build) | 166,641 B, 49,672 B gzip | 168,936 B, 50,572 B gzip | +2,295 B, +900 B gzip |
| Receipt sheet chunk, loaded on first use | none | 10,922 B, 4,451 B gzip | +1 lazy chunk |
| All JS in the fast build | 8,530,125 B | 8,549,352 B | +19,227 B (mostly the six catalogues) |
| App tests | 1,882 passing before this file | 9 new in `shareAssets.test.mjs`, all passing | +9 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `cspHashes.test.mjs` failed: `style=""` in a string | The SVG writer set `font-variant-numeric` through a style attribute | Dropped it; the SVG carries presentation attributes only |
| The dev server showed "We couldn't load Carta's travel data" | No `boot.json` or `dest/` in a fresh container (the pipeline output is not here), and the data host is out of reach | `node scripts/sync-data.mjs --split-only` for the check (its rank tier check fails on this copy and skips that file), files removed afterwards; the verify script answers data host requests from `public/` or empty |
| Three catalogue tests failed while those local boot files existed | They read `public/boot.json` when present | Removed the generated files; the tests pass |
| Playwright's default browser is missing in the container | The preinstalled Chromium is a different revision | `CHROMIUM_PATH` in `render_png.mjs` and the verify script |
| `--savedmock` opened on the trip happening today, with no next-trip card | The mock's first trip is in progress | The verify script uses `?savedmock=next` |
| Full pytest: 855 passed, 2 failed (`tests/test_rating_inputs.py`, beauty v2 and adding places) | `cache/unesco_whc.json` is a Git LFS pointer the container never fetched (JSONDecodeError), not this task: no Python changed | None here; they pass where LFS files are present |

Design: the receipt follows the carta-design receipt and cost bar (bed `--action` umber, food `--lagoon-600`, flight `--sun-400`, other lines slate) on a deep umber frame, the colour of the home page's real-cost act; one display total, whole euros. Departure from the defaults: the deep umber surround, so the card reads as one object when posted on a white or dark feed. Seven questions: one composition with the app's receipt; compact (one 4:5 card, no scroll); no motion (a still image); every figure from data through `formatMoney()` and checked; text contrast on white and umber-100 above 4.5:1, Save 44 px, Escape closes, the image has alt text with the trip and total; six languages, no dashes, no banned words; nothing left to remove that the receipt needs. The offline images use the same tokens (umber-100 land, lagoon dots for fits, hollow umber for over).

## Screens checked

My trips with `?savedmock=next`, at 390 x 844 and 1440 x 900, by `scripts/verify_share_receipt.mjs`: with `?receipt=0` the menu has no "Share the receipt"; with `?receipt=1` the item opens the sheet, the numbers check passes, the PNG is 1080 x 1350 (356 px wide in a 390 px sheet on the phone, 486 px in the 520 px dialog on desktop), alt "Lisbon, Porto: EUR 1,697 for 6 nights", no sideways scroll, Save is 44 px and downloads `carta-lisbon-porto.png`, Escape closes. Share does not show in headless Chromium (no file sharing there), as intended. One screenshot per width, in `Execution/P15/T1175-shots/` (not committed). The map, two calendars and the sample receipt were rendered to PNG and looked at.

## What is still open

- T1175-a (user): look at the receipt on a real phone and a desktop with `?receipt=1`, then flip the default in `lib/share/flag.js`.
- T1175-b (user): run the generator with the stays wire on the owner box to make the real calendars, and pick the places to publish.
- T1175-c (user): before publishing the map or calendars, confirm the credit line and that aggregates of the owner-run list price samples may be shown (same question as T1130-c).
- T1175-d (next task): the offline images are English only; words come from the script, not the six catalogues.
- T1175-e (next task): the trip kept on a device without an account has an empty menu, so it cannot share its receipt.
- T1175-f (next task): no count of receipts shared, and the rasteriser could move to resvg if a package may be added.
- The blog (S94) is untouched; using these images there is its call.

## Rollback procedure

`git revert` the T1175 commits on `p15-s91-shareable-assets`. Nothing is one-way: no data, schema or live file changed, and the flag is off by default.

## Owner steps (for the checklist)

- [T1175-a] Turn on the trip receipt share | the button is built but hidden behind a flag until someone has seen the image on real devices | open My trips with ?receipt=1 on a phone and a desktop; open a saved trip's menu and choose Share the receipt; check the figures against the trip page, then share or save once; if it reads right, set the default in shareReceiptOn to on (a next task can do the edit) | continent-app/src/lib/share/flag.js
- [T1175-b] Make the real cheapest week calendars | the stays wire with the month curves lives on the data host and the owner box, not in the cloud container | on the box, copy the stays files (data/stays-live/v1/{cc}.json, or stays/v1) into one folder; run node scripts/share/share_assets.mjs --stays that-folder --png; look at scripts/share/out/calendar/*.png and pick the places to share | scripts/share/share_assets.mjs
- [T1175-c] Clear the credit line before publishing | the map and calendars quote aggregates of owner-run list price samples, whose terms are not settled (T1130-c) | read the credit line printed on map_100.png; decide whether "Carta's own samples of list prices" may be published and whether a source must be named; note the answer in the register | docs/tos/data_licenses.md
