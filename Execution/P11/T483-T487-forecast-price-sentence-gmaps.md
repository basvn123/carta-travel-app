# T483, T486, T487: forecast proxy, one price sentence, Google Maps day link

Batch of three small code tasks from the week list (roadmap 1.10, 1.16, 1.14), run on `main` (root) and `master` (continent-app) at the owner's request, one commit per task in the app repo. T484 and T485 are design and audit tasks and were not part of this batch.

**Date:** 2026-10-21

**App commits (continent-app, master):** `a2e11a0` T483, `5acce8e` T486, `2f25ee3` T487 (hashes before push; see `git log --grep "^T48[367]"`).

**End check (once, on the merged state):** dev server, Florence destination page at 1536 px (forecast row, sources line, price card foot); day planner with a 9-point Florence day at 1536 px and at 390 px phone emulation with touch (Google Maps row). Lint on touched files: 0 errors (3 warnings that were there before). `npm test`: 463 of 463 pass, 7 new. NOPUBLIC build passes; `check-en-split` reports bad 0, lazyBad 0.

---

## T483: forecast from MET Norway through our own proxy

### What changed

The 7-day forecast no longer calls Open-Meteo from the browser (blocked by the live CSP, so it never showed in production, and non-commercial). A Pages Function, `functions/api/forecast.js`, fetches MET Norway's Locationforecast `complete` endpoint with an identifying User-Agent, rounds the point to a ~1 km cell, holds the upstream answer at the edge for 30 minutes and returns daily rows on the same origin, so `connect-src 'self'` covers it and no CSP change is needed. `public/_routes.json` sends `/api/*` to Functions. The conversion lives in `src/lib/metForecast.js` (shared by the Function, the Vite dev server and the test): four 6-hour blocks make a UTC day, the worst sky of the day wins (as Open-Meteo's daily code did), hi and lo come from the blocks' max and min, rain is the day's millimetres. MET gives no rain probability outside the Nordic model, so `rainPct` is gone: the destination page shows "3 mm" from 1 mm up, and the day planner's rain flag is the sky kind or 1 mm or more. The credit now reads "Forecast by MET Norway, updated {time}" (the model run time in the reader's clock) in six languages; `attribution.js` and `docs/tos/data_licenses.md` carry MET Norway, CC BY 4.0. The Vite dev server answers `/api/forecast` with the same Function, so localhost shows the forecast too.

### Files touched

**Created:** `continent-app/functions/api/forecast.js`, `continent-app/src/lib/metForecast.js`, `continent-app/tests/metForecast.test.mjs`

**Modified:** `continent-app/src/lib/weather.js` (fetches `/api/forecast`; the dead WMO `weatherKind` removed), `continent-app/src/browse/DestinationPage.jsx` (mm, credit time), `continent-app/src/planner/DayPlannerTab.jsx` (rain flag), `continent-app/src/auth/mytrips/TripCards.jsx` (comment), `continent-app/src/data/attribution.js`, `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`explore.weatherCredit`), `continent-app/public/_routes.json`, `continent-app/vite.config.js` (dev middleware), `continent-app/scripts/verify_no_runtime_fares.mjs` (weather host is now `api.met.no`, server side), `docs/tos/data_licenses.md`

### Commands run

`node --test tests/metForecast.test.mjs`; the Function called from Node for Florence, Reykjavik and Edinburgh (200, seven rows each, real highs and lows); `curl /api/forecast` on the dev server.

### Config and secrets set

None. MET needs no key.

### Before/after measurements

| | Before | After |
| --- | --- | --- |
| Forecast rows on a production destination page | 0 (CSP blocks api.open-meteo.com) | 7 (same origin; seen on the dev server, the deploy runs the same Function) |
| Forecast source licence | non-commercial | CC BY 4.0, commercial allowed |
| Upstream calls for one ~1 km cell | one per visitor | one per 30 minutes at each edge location |

### What broke and how it was fixed

MET's `compact` endpoint has no 6-hour max and min, so the first proxy run returned null highs and lows; switched to `complete`. A Python rewrite flattened CRLF in nine files; restored before commit, and the commits were rebuilt so every blob keeps the line endings HEAD had.

### What is still open

- The Function goes live only with a deploy that uploads `functions/` (T483-a).
- Days are UTC days and today holds only the blocks still ahead (after 18:00 UTC the list starts tomorrow); hourly detail for the first two days, "Usually" beyond day 9 and the certainty wording are roadmap 4.12, not this task.
- `scripts/ci/smoke.mjs` and four verify harnesses still filter `open-meteo` as console noise; harmless now, removable (T483-b).

### Rollback procedure

`git -C continent-app revert a2e11a0` (and drop the T483 lines from `docs/tos/data_licenses.md`). The forecast then goes back to the blocked Open-Meteo call; nothing else depends on the Function.

---

## T486: one sentence on what the price includes

### What changed

The day figure is a bed plus food and drink (`computeCosts`: stay plus `groundSpendPerPerson`, which sums meals, drinks, coffee, nights out and groceries; no transport). Home chapter 2, the FAQ answer, the trip-card tooltip, `index.html`'s description, og and twitter tags, the numbers page and the site share card all said it included local transport, while the destination page said it did not. Every one now says "a bed plus food and drink", and the excluded line is the same wherever it appears: "Not included: getting there, local transport and tickets" (with a typed fare: "Not included: local transport and tickets"). Six languages. The site share cards (`public/og/site.png`, `brand/social/site-square.png`) were regenerated from the new spec; same layout and type, new subtitle.

### Files touched

**Modified:** `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`home.ch2`, `account.fq.dayA`, `places.priceNoFlight`, `dest.priceExcludes`, `dest.priceExcludesFare`), `continent-app/index.html`, `continent-app/scripts/explainer/numbers.mjs`, `continent-app/scripts/og/specs.mjs`, `continent-app/public/og/site.png`, `continent-app/brand/social/site-square.png`

### Commands run

`node scripts/og/static.mjs`; grep for "local transport" across `src/`, `scripts/`, `index.html`.

### Config and secrets set

None.

### Before/after measurements

Shipped strings claiming the day figure includes local transport: 4 keys times 6 languages plus `index.html` (3 tags), the numbers page and the share card, before; 0 after.

### What broke and how it was fixed

Nothing.

### What is still open

- `detail.groundSub` ("Food, drinks and getting around") is used by no code; and `receipt.notIn` lives in the unmounted FirstRunReceipt (row T472-j). Remove with the dead-copy sweep (T486-a).
- T475-g also names the `index.html` description; that part is now true, the rest of T475-g (budget inputs) stays open.

### Rollback procedure

`git -C continent-app revert 5acce8e`.

---

## T487: Google Maps day link, moved up and split on a phone

### What changed

`googleMapsDirParts(points, mode, maxStops)` in `lib/routing.js` cuts the day into Google Maps links that each end where the next begins, so walking the parts in order walks the whole day and no stop is ever dropped (the old single link sent up to 9 stops and silently thinned anything past that). A phone (width up to 768 px, or a coarse pointer) gets parts of 3 stops between start and end, Google's mobile-browser limit; a desktop gets 9. The link moved from the bottom export row to a `DayGmaps` row right under the day summary: "Open Day 2 in Google Maps" when it fits in one link, otherwise that line as a heading over "Part 1: Your stay to Ponte Vecchio", "Part 2: Ponte Vecchio to Basilica of the Holy Cross". A shared day's text now carries phone-sized parts, since it is opened on someone's phone.

### Files touched

**Created:** `continent-app/tests/gmapsParts.test.mjs`

**Modified:** `continent-app/src/lib/routing.js`, `continent-app/src/planner/DayOverview.jsx` (`DayGmaps`; Google Maps out of `DayExports`), `continent-app/src/planner/DayPlannerTab.jsx`, `continent-app/src/styles/planners/68-v6-dayplanner.css` (`.dayx-gmaps`), `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`day.gmapsOpen`, `day.gmapsPart`)

### Commands run

`node --test tests/gmapsParts.test.mjs`; browser check below.

### Config and secrets set

None.

### Before/after measurements

| Florence day, stay plus 8 stops (9 points) | Before | After |
| --- | --- | --- |
| Links on a phone | 1 link, 9 points (Google drops or refuses past 5 in a mobile browser) | 2 links, 5 points each, joined at Ponte Vecchio |
| Links on desktop | 1 link, 9 points | 1 link, 9 points |
| Stops dropped on a 15-point day | 4 (thinned to 9 waypoints) | 0 |
| Where the link sits | bottom of the day, in the export row | under the day summary |

### What broke and how it was fixed

Nothing in the code. The browser check needed a clean dev server: three older Vite servers held ports 5173, 5174 and an IPv6-only 5173 from another project; at the owner's word all were stopped and one Carta server started on 5173.

### What is still open

- The trip planner's whole-trip link (`TripItinerary.jsx`, driving, city to city) and the day PDF's link (`dayPdf.js`) still build one link with the 9-stop thinning; the same mobile limit applies (T487-a).
- Checked at 390 px; 360 px with a long German part label was not looked at (the labels wrap inside the button).

### Rollback procedure

`git -C continent-app revert 2f25ee3`. The link returns to the export row as one link.
