# T493: T483 to T487 follow-ups, and the deploy

## Task ID

T493 (T488 to T492 are the design and audit tasks in the owner's week list, so the follow-ups took the next free number). Closes T483-a, T483-b, T486-a and T487-a.

## Date

2026-10-21

## What changed

Three code follow-ups, one commit each in continent-app, then a production deploy of all of master.

- **T487-a.** The trip planner's city-to-city Google Maps link (`TripItinerary.jsx`) and the day PDF's link (`dayPdf.js`) now use `googleMapsDirParts`, so neither thins a route past 9 stops nor sends a phone browser more than 3 stops a link. The trip link splits on a phone (narrow or coarse pointer) into "Part 1: Prague to Vienna" style buttons, one link on desktop. The PDF always uses phone-sized parts, since it is read on a phone, under "Open Day N in Google Maps".
- **T483-b.** `open-meteo` taken out of the console-noise filters in `scripts/ci/smoke.mjs` and four verify harnesses; a forecast error now counts as an error.
- **T486-a.** The unused `detail.groundSub` ("Food, drinks and getting around") removed in six languages; no code or template key built it.
- **T483-a.** Deployed: `npm run build:pages` (163 files, under the Pages ceiling) and `npx wrangler pages deploy dist --project-name carta-app --branch main`, which uploaded the `functions/` bundle with `api/forecast.js` and the new `_routes.json`. Deployment `4b860e73`. The deploy ships all of master, so the T473 to T482 work went live with it.

## Files touched

**Modified (continent-app):** `src/planner/TripItinerary.jsx`, `src/lib/dayPdf.js`, `scripts/ci/smoke.mjs`, `scripts/verify_explore.mjs`, `scripts/verify_tab_switching.mjs`, `scripts/verify_top_bar.mjs`, `scripts/verify_trips.mjs`, `src/i18n/{en,nl,de,fr,es,it}.js`

**Modified (root):** the continent-app mirror of the above, `Execution/_OPEN.md`

**Created:** this report

## Commands run

`npx eslint` on the two touched sources (0 errors; one warning at dayPdf.js:100 that was there before), `npm test` (463 of 463), `npm run build:pages`, `node scripts/i18n/check-en-split.mjs . dist` (bad 0, lazyBad 0), the data comparison below, the deploy, live probes.

## Config and secrets set

None. R2 credentials were not in this shell, so no data was pushed (see "still open").

## Before/after measurements

| | Before | After (live, www.carta-europetravel.com) |
| --- | --- | --- |
| `/api/forecast?lat=43.77&lon=11.25` | no such route | 200, JSON, `cache-control: public, max-age=1800`, seven Florence days |
| `/api/forecast?lat=x` | | 400 |
| Florence page forecast row | empty (CSP blocked Open-Meteo) | 7 days with highs, lows and mm; "Forecast by MET Norway, updated 10:21" |
| Home meta description | "bed, food and local transport" | "a bed plus food and drink" |
| Failed requests on the Florence page | | 1, `data/status.json` 404, the optional T316 status file, by design |

Data check before deploying: production reads data from `https://data.carta-europetravel.com/data`. `coverage.json`, `journeys/index.json`, a country shard and 39 of 40 random data files are byte-identical to this build's `dist-data/`. The journey detail files are not (264 differ): the local ones carry the T474 photo credit (author and licence), R2 still has the older credit. The app code guards both fields (`filter(Boolean)`), so live journey pages show the shorter credit they showed before.

## What broke and how it was fixed

Nothing in the deploy. `/italy` and other prerendered paths answer 404 on the new deploy and on the previous one (`e0455baa`) alike, so this deploy did not cause that.

## What is still open

- The journey credit data reaches visitors only after the full R2 push, `node scripts/r2/push-data.mjs --live` with the rclone keys; that is row T445-b, which this task does not duplicate.
- The trip planner's split link was not seen in a browser (no quick path into a multi-city itinerary from the journey page); it uses the same tested helper as the day link (T493-a).

## Rollback procedure

App: `git -C continent-app revert` the three T493 commits. Production: redeploy the previous build, or in the Cloudflare Pages dashboard roll `carta-app` back to deployment `e0455baa`; that also removes `/api/forecast`, and the forecast goes back to being blocked.
