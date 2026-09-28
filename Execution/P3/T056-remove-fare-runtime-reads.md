# T056 Remove fare runtime reads

## Task ID

T056

## Date

2026-09-28

## What changed

There was no runtime fare read to remove. The app never asks a travel API for a price while someone is using it, and it already worked this way before this task began. What this task adds is proof, plus a guard that keeps it true. `continent-app/scripts/verify_no_runtime_fares.mjs` lists every place in the code that can open a network connection and records every request the browser makes along the user-facing paths. It fails the moment a price request to a travel host shows up, or a new call site appears that nobody has reviewed.

How fares reach a traveller today. The weekly pipeline (`run_pipeline.py`) harvests the carriers and the Travelpayouts cache, merges them cheapest-wins, and `scripts/sync-data.mjs` writes one static slice per departure airport to `public/fares/{IATA}.json`. There are 286 slices, 26 MB in total. The CRL slice is 375 KB raw and 65 KB gzipped. Since T054 those slices sit in the R2 tier (`src/lib/dataHost.js`), so they move to the data host with everything else once `VITE_DATA_BASE` is set. At runtime, `fetchFares()` in `src/lib/appData.js` fetches the slice for the chosen origin once, caches the promise per origin, and hands it to `hydrateForOrigin()`. From there every price on every screen, the trip planner's legs and receipt included, is computed in memory from that slice and the destination records. While a new origin's slice downloads, `useAppData` keeps showing the previous origin's prices instead of a loading screen. The planner does not fetch anything fare-related at all. It reads the prices already in memory. The only travel-site traffic a traveller can cause is a click-out link (Aviasales, Skyscanner, Rome2rio, Omio), and that is a navigation they choose, not a fetch. So the architecture 1.CARTA.md describes ("precompute and cache, never live-search the map") holds in the code as shipped. There was nothing to move into the background, because nothing was in the foreground.

The harness has two passes, and both have to pass. The static pass scans `continent-app/src/` and `supabase/functions/` for `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon`. Every hit must sit in a module listed in the harness's `CALL_SITES` table, which names what that module talks to. There are 21 such sites today. Twelve read Carta's own static files. Five go to Nominatim, Wikipedia, Overpass, OSRM and Open-Meteo. Four sit in the three Edge Functions: three calls to Gemini, plus parse-booking's fetch of a booking page the traveller pasted in, which imports their own reservation and reads no price list. None of them is a fare source. The trace pass serves `dist/` on 127.0.0.1:4392 and runs seven paths at desktop and phone sizes: Explore on the default origin, STN and CRL; the Destinations tab; a destination page; the trip planner walked through Booked, From, When, Where (Austria and Czechia), a published trip, Getting there with the first leg set to fly, and on to Finish; and the day planner seeded on a city. Every request is classified by host. The run fails on four conditions: a request to a fare or travel API host (carriers, Travelpayouts API, Aviasales, Skyscanner, Kiwi, Omio, Flix, Trainline, Transitous, Booking, Airbnb and others), a request to a host nobody has classified, a trace that never read a fare slice, and a planner walk that never reached its priced legs. The last two exist because a gate that sees nothing passes trivially. To prove the gate is not vacuous, I injected a Travelpayouts price call into `dist/index.html` and a stray `fetch` into a temporary file under `src/lib/`. The run failed on both and exited 1. Both were removed afterwards.

One piece of third-party travel code does run in every session: the Travelpayouts Drive script in `index.html` (emrldtp.com). It makes 8 requests per page load: its loader, five code chunks and `entrypoint_config`. None of them asks for a price. Its job is to turn outbound links into affiliate links. The harness allows it by host but fails any of its requests whose path looks like a price query (price, fare, cheap, calendar, latest, search, offer). It stays because removing it is a revenue decision, not an engineering one. See What is still open.

## Files touched

**Created (continent-app, branch `p3-remove-fare-runtime-reads`, based on `76ba406`, commit `0d48811`):**
- continent-app/scripts/verify_no_runtime_fares.mjs
- continent-app/reports/fare_trace_T056.json (the "after" trace, final harness)
- continent-app/reports/fare_trace_T056_before.json (the "before" trace, first harness version, planner walk stalled after one step)

**Created (root repo, branch `p3-remove-fare-runtime-reads`, based on `a316aceb1`):**
- Execution/P3/T056-remove-fare-runtime-reads.md

**Modified (root repo):**
- Execution/_OPEN.md (rows T056-a to T056-c)

No product file changed. `continent-app/src/components/PrivacyPolicy.jsx` and `continent-app/src/data/attribution.js` were already modified and unstaged by another session before this task started, as T054 and T055 also recorded. I left them untouched and unstaged. The root repo's stale copies of `continent-app/` files that show as modified were also left alone.

## Commands run

From `continent-app/`, against the same-origin build T055 left in `dist/` (built from `76ba406`; no `src/` change since, apart from the two unstaged files above).

```bash
git checkout -b p3-remove-fare-runtime-reads          # and the same in the root repo
node scripts/verify_no_runtime_fares.mjs --json reports/fare_trace_T056_before.json
# harness iterations: planner walk extended to Getting there and Finish,
# data-host fare paths classified, debug output removed
node scripts/verify_no_runtime_fares.mjs --json reports/fare_trace_T056.json

# mutation check, reverted straight after
cp dist/index.html /tmp/index.html.bak
#   insert <script>fetch('https://api.travelpayouts.com/v1/prices/cheap?origin=CRL')</script> after #root
echo "export const x = () => fetch('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');" > src/lib/_t056_mutant.js
node scripts/verify_no_runtime_fares.mjs              # FARE API on every path, 1 unclassified call site, exit 1
cp /tmp/index.html.bak dist/index.html
rm src/lib/_t056_mutant.js

git add scripts/verify_no_runtime_fares.mjs reports/fare_trace_T056.json reports/fare_trace_T056_before.json
git commit -m "T056: Network-trace harness ..."
```

To re-run: `npm run build`, then `node scripts/verify_no_runtime_fares.mjs` from `continent-app/`. A full run takes about four minutes. It needs Playwright's Chromium and network access, because the trace loads real third-party tiles, images and fonts. To check the split build, build with `VITE_DATA_BASE` pointing at a data host. Fare slices on `data.carta-europetravel.com` are recognised. A loopback stand-in on 127.0.0.1 counts as self.

## Config and secrets set

None.

## Before/after measurements

"Before" comes from the static audit and the first trace, taken before the harness was finished. "After" is the final harness on the same build. Product code did not change, so the fare numbers are the same. What changed is how much of the app the trace can see.

| Metric | Before | After | Delta |
|---|---|---|---|
| Runtime requests to a fare or travel API host, all traced paths | 0 | 0 | 0 |
| Network call sites in src/ and supabase/functions/ | 21, unreviewed | 21, each classified | +21 classified |
| Call sites that can reach a fare source | 0 | 0 | 0 |
| Fare slices read per path (static, same origin) | 1 | 1 | 0 |
| Paths x viewports traced | 14 | 14 | 0 |
| Deepest trip-planner step reached in the trace | step 1 | Finish (via Getting there) | priced legs now covered |
| Requests recorded across all 14 runs | 1,749 | 1,884 | +135 (the deeper planner walk) |
| Travelpayouts Drive requests per page load | 8 | 8 | 0 |
| Of which ask for a price | 0 | 0 | 0 |

Across the 14 final runs, the 1,884 requests break down as follows: 1,022 to the app itself, 14 static fare slices, 603 images (Wikimedia, flagcdn), 112 to the Drive script, 68 fonts, 34 Supabase (`site_config`, `list_public_guides`), 25 basemap tiles, 4 Open-Meteo and 2 inline. There were no unclassified hosts. Every path read exactly one fare slice, the one for its origin. Even the trip planner, which considers nearby departure airports, fetched no second slice.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First harness run died with "Target page, context or browser has been closed" on the first path | Not reproduced; every later run was clean. Most likely a one-off Chromium exit while loading the 43 country files | Added a crash listener and per-path progress lines so a repeat names the path |
| Sample destination fell back to a hard-coded id | `boot.json` rows are positional; the column is `cc`, not `country` | Read the column index from `boot.cols` |
| Planner walk stopped at step 1, then at the trips step | Generic "first option" clicking cannot answer the When step, and a trip card opens nothing until its Choose button is pressed | Followed the route `verify_planner_v2_flow.mjs` takes, and pressed Choose. The walk now reaches Getting there and Finish on both viewports, and a check asserts it |

## What is still open

The Travelpayouts Drive script is remote code that Carta does not control. Today it fetches only its own code and config, and the harness would catch a price-shaped request. But the harness only sees what the script does on the day it runs, and the vendor can change that script at any time. Keeping it is a trade between affiliate revenue and a third party in every session, and that trade is the owner's call (T056-a).

The trace ran only against the same-origin build on loopback. Once the owner steps T054-a to T054-c are done, it should run once against the split build and once against the live deploy, so the data-host fare paths are exercised for real (T056-b).

`src/lib/wizardTransit.js` still exports `loadFareSlices`, `flyInOptionsMulti` and `countryTransitMatrix`, and nothing imports them. Revived as they stand, they would fetch up to six fare slices in parallel inside a planner step. Those are static files, so it would not be a travel-API call, but it would be exactly the in-step wait this task is meant to prevent. Removing them was outside this task's named files, so it is filed as cleanup (T056-c).

Like every harness here, this one is not wired to CI. It only protects the rule if someone runs it after a change that adds a network call or touches the planner.

## Rollback procedure

Nothing in the product changed, so there is nothing in the running app to roll back. To remove the harness, run `git revert 0d48811` in `continent-app/`, or delete the branch before it is merged. In the root repo, revert the report commit, which also removes the T056 rows from `Execution/_OPEN.md`.
