# T511 to T519: live flight prices (batch report)

Batch on branch `p11-live-flights` in the root repo and in `continent-app/`, one commit or more per task, merged after this report. Owner request of 2026-10-21, reversing T272 ("Carta does not price flights"): show Google Flights' price for the flight, with airline, logo, times and bags, in every total, after removing all the old fare logic. Plan approved in plan mode (`~/.claude/plans/eager-tickling-beacon.md`). Groundwork the same day: fli (MIT) priced 49 of 50 European routes from this PC and from a Worker, matched Google Flights exactly on 12 checked routes, and a ramp of 2,020 requests met no Google refusal up to about 2.7 searches a second (memory note `travel-app-fli-google-flights-test`).

Shared header. Models: the lead on Opus; removal, screen and docs subagents on Opus or Sonnet as named in each section. Static checks per task (eslint on touched files, `npm test`, NOPUBLIC build for the size), one browser round on the merged batch at phone (375 px) and desktop (1280 px) width. `npm test` went from 558 passing to 577 passing, 0 failing. Fast build: 97 asset files both before and after, assets 7,179 KB to 7,199 KB, main bundle 801,374 to 820,624 bytes.

## Task ID

T511

## Date

2026-10-21

## What changed

All old flight fare logic is gone from both repos. Root: the Ryanair, Wizz Air, Vueling and Volotea harvesters, Travelpayouts and ryanair_archive collectors, the fare model (snapshot, features, model, drift), the tp_stage, fares, fares_targeted, fare_history, fare_model and flight_times pipeline tasks, the fares freshness ledger, `--max-origins`, and 18 tracked cache files (fare calendars, flight times, route graphs, carrier airport lists). App: `fareFile.js`, `FareProvenance.jsx`, the per-origin fare readers and the fare window, `pickFareForDates`, `planeFare`, `pickEstimateForDates`, `unpricedFlight`, `BAGGAGE_OPTIONS`, five fare verifiers, three fare traces, the gitignored `public/fares/` (286 files) and the admin drift-gate panel. The app priced ground only between T511 and T517. Behaviour beyond flights vanishing: date bounds are now tomorrow to a year out; the default origin is the nearest airport, not the one with most fares; the wizard lists nearest airports first; every anchored destination is reachable by plane from any origin.

## Files touched

**Deleted (root):** `pipeline/harvest_all_origins.py`, `pipeline/harvest_flight_times.py`, `pipeline/archive/harvest_{ryanair_schedules,volotea,vueling,wizzair}.py`, `archive/refresh_fares*.bat`, `archive/reharvest_flights.py`, `src/estimation/{snapshot,features,model,drift}.py`, `src/ingestion/pricing/{travelpayouts,ryanair_archive}.py`, 14 fare caches plus the 4 carrier airport caches (in T512).

**Modified (root):** `run_pipeline.py`, `src/estimation/common.py`, `src/estimation/__init__.py`, `src/ingestion/core/registry.py`, `docs/tos/data_licenses.md` (regenerated), `.gitignore`, `pipeline/archive/manifest.yml`, `infra/hetzner/cax11/verify_tasks.sh`, `pipeline/oneoff/fix_data.py`, `tests/test_data_licences.py`, `tests/test_monitor_check.py`, `tests/test_pipeline_code_fixes.py`.

**Deleted (app):** `src/lib/fareFile.js`, `src/components/FareProvenance.jsx`, `scripts/verify_{flight_estimates,fare_window,fares_url,fare_provenance,no_runtime_fares}.mjs`, `reports/fare_trace_*.json`.

**Modified (app):** `src/lib/{runtime_pricing,trip_planner_pricing,tripTotal,origins,appData,dataHost,bootIndex,reach,dossier,wizardTransit,format}.js`, `src/hooks/useAppData.js`, `src/planner/{TripItinerary,TripPlannerTab}.jsx`, `src/components/admin/PipelineHealth.jsx`, `scripts/sync-data.mjs`, `scripts/ci/{contract,check-contract,smoke}.mjs`, `scripts/ci/design-lint.baseline.json`, `tests/{combineTripLegs,rankTier}.test.mjs`.

## Commands run

`git rm` per file; `npx eslint`; `npm test`; `python -I -m py_compile`; `python run_pipeline.py --list`; `python -m unittest discover -s tests` (11 tests, all pass; the pytest-style tests could not run, see open items).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| App tests passing | 558 | 555 | 3 fare-only tests deleted |
| Root lines removed | | 51,412 | |
| App lines removed | | 8,992 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Admin page still drew "Fare model drift gate" | Not caught by the removal list | Panel removed (commit e6b8b3c) |

## What is still open

The 286 old objects under R2 `data/fares/` are unreferenced and can be purged with rclone (no R2 keys on this machine; register T511-a). The root's pytest-style tests could not run because pytest is not installed; the removal subagent reported 58 failures from an earlier full run that it did not triage (T511-b). Leftovers that mention the old sources: `src/estimation/ground_calibration.py:168` probes ryanair_archive, `requirements.txt` lists the fare model's libraries, `src/ingestion/CREDENTIALS.md` and `infra/hetzner/cax11/env.example` describe Travelpayouts (T511-c). The holidays and school_holidays tasks fed only the deleted model (T511-d). `src/auth/admin.js` still maps a drift-gate field that is now always null (T511-e).

## Rollback procedure

`git revert bda1acdb5` (root) and `git -C continent-app revert e19c899 e6b8b3c`. The deleted caches come back with the revert; the fare files would need the old harvest to be useful again.

---

## Task ID

T512

## Date

2026-10-21

## What changed

`pipeline/flights/build_routes.py` builds which flight routes exist in Europe from Eurostat's airport-pair tables (`avia_par_{cc}`, monthly commercial passenger departures, CC BY 4.0) and OurAirports (public domain): pairs with at least 4 departures in at least 2 of the last 12 months, European partners only, return direction filled in. It writes `data/flights/_routes.json` (10,094 one-way routes between 377 airports, a bitmask of active months per route, data through 2024-12, 116 KB) and `data/flights/_airports.json` (name, city, country, position). The app's origin picker now lists those 377 airports (`scripts/sync-data.mjs`), with the city taken from the catalogue destination for that IATA code where one exists (BRU reads Brussels, not Zaventem). A monthly `flight_routes` task uploads the list to R2. Carta's old route list matched only 3,715 of its own 7,596 pairs to Eurostat; BRU had 18 routes listed against 78 real ones.

## Files touched

**Created:** `pipeline/flights/build_routes.py`, `data/flights/_routes.json`, `data/flights/_airports.json`.
**Modified:** `run_pipeline.py` (task `flight_routes`), `continent-app/scripts/sync-data.mjs`.
**Deleted:** `cache/{ryanair,wizzair,vueling,volotea}_airports.json`.

## Commands run

`python -I pipeline/flights/build_routes.py --offline`; `npx wrangler r2 object put carta/data/flights/_routes.json --file ../data/flights/_routes.json --content-type application/json --remote`; `node scripts/sync-data.mjs`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Routes in the route list | 7,596 (Ryanair era, 3,715 real) | 10,094 | +2,498 |
| Home airports in the picker | 286 | 377 | +91 |
| Routes from BRU | 18 | 78 | +60 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First test run wrote to a stray `C:\c\...` folder | Windows Python read the Git Bash path `/c/Users/...` as `C:\c\Users\...` | Reran with Windows paths; the stray folder could not be removed by the session (safety check) and is the owner's to delete (T512-b) |
| Origin list circular | Routes filtered by origins that came from routes | Kept every European route; origins follow from it |
| Picker showed "Zaventem", "Paris (Roissy-en-France, Val-d'Oise)" | OurAirports' municipality | Catalogue city by IATA, else the town without its bracketed district |

## What is still open

Eurostat ends at 2024-12, the UK stopped reporting after 2019 and Czechia's dataset answers 404; the sweep's find tier adds routes Eurostat lacks, and the list should be rebuilt monthly (T512-a). Airports without a catalogue destination keep OurAirports' town (LGG reads Grâce-Hollogne, not Liège) (T512-c).

## Rollback procedure

`git revert 7729969d5 eb06a6512 4ed75328b` (root) and `git -C continent-app revert 77d3aa0 a98029d`; the four carrier airport caches return with the revert.

---

## Task ID

T513

## Date

2026-10-21

## What changed

fli-js (MIT, Punit Arani, `punitarani/fli`, package 0.0.4) is vendored unchanged in `continent-app/workers/shared/fli/` and bundled to `fli.bundle.mjs` (778 KB) by `build-fli.mjs`, so the Worker, the Pages Function and node tests import plain JS. `workers/shared/flightSearch.mjs` `searchDay()` loads one route and day and answers every flight cheapest first (price, airline, name, flight number, local times, stops, minutes, via) plus a Google Flights link; it never throws, tells a refusal (429, sorry page, consent wall, unusual-traffic page, empty page) apart from a day with no flight, and always hands fli a bound fetch (Workers throw "Illegal invocation" otherwise).

## Files touched

**Created:** `continent-app/workers/shared/{fli/,fli.bundle.mjs,build-fli.mjs,flightSearch.mjs}`, `continent-app/tests/flightSearch.test.mjs`, `continent-app/tests/fixtures/gflights-BRU-BCN-2026-11-18.txt` (the page's ds:1 script only, 43 KB; renamed from .html so Vite's dependency scan skips it).

## Commands run

`node workers/shared/build-fli.mjs`; `node --test tests/flightSearch.test.mjs` (5 pass).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| One live search, BRU to BCN | | 0.87 s | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| esbuild could not resolve zod, and the banner flag split on spaces | Scratch build outside the app; Windows shell | Build in the app tree; banner written after the build |

## What is still open

None.

## Rollback procedure

`git -C continent-app revert 966963a`.

---

## Task ID

T514

## Date

2026-10-21

## What changed

The Cloudflare Worker `flight-sweep` (`continent-app/workers/flight-sweep`) prices Europe's routes on its own. A cron every minute runs that minute's share (`plan.mjs`): near tier, the next 14 days every other day, each route every 12 hours; far tier, weeks 3 to 26 one day a week on a weekday that moves, each route weekly; find tier, every pair of airports over 150 km that no route covers, 21 days out, direct only, monthly. Off-season months are skipped; six checks in a row without a direct flight make a route dormant until the find tier sees it again. The cheapest flight per route and day goes to D1 `carta_flights`; at :07 every hour, airports whose flights changed are published to R2 `data/flights/{IATA}.json` with both directions (`to`, `back`) and `data/flights/_index.json`. Three refusals in a minute pause the sweep for an hour. `GET /status` shows the last hour. `scripts/flights/seed-local.mjs` fills the database from a PC.

## Files touched

**Created:** `continent-app/workers/flight-sweep/{wrangler.toml,schema.sql,src/index.mjs,src/plan.mjs,src/publish.mjs}`, `continent-app/tests/flightSweep.test.mjs`, `continent-app/scripts/flights/seed-local.mjs`.
**Modified:** `continent-app/.gitignore` (`.wrangler/`).

## Commands run

`npx wrangler d1 create carta_flights`; `npx wrangler d1 execute carta_flights --remote --file workers/flight-sweep/schema.sql -c workers/flight-sweep/wrangler.toml`; `npx wrangler deploy -c workers/flight-sweep/wrangler.toml`; `node scripts/flights/seed-local.mjs --origins BRU,CRL` and `--origins BRU --days 31,34,38`; `npx wrangler d1 execute ... --file .wrangler/seed/seed-*.sql`; publishes through `wrangler dev --remote --test-scheduled`.

## Config and secrets set

D1 database `carta_flights` (id 96e6ba1d-68de-4aab-9455-07bdda7cfb95, WEUR). Worker `flight-sweep` on workers.dev with crons `* * * * *` and `7 * * * *`, bindings DB and DATA (bucket `carta`).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Planned searches a minute, whole route list (week of minutes) | | 100 average, 124 at most | |
| Seed from this PC | | 2,040 + 468 searches, 8 failed, 0 refused, about 3.5 a second | |
| Sweep, last hour on the free plan | | 5,850 searches, 2,340 priced, 496 no flight, 3,010 failed, 4 refused | |
| Airports with a published file | 0 | 144 | |
| Airlines named, with logo | 0 | 73, 73 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A route went dormant after one minute | Its 7 near days ran in the same minute, 7 misses | One miss per route per minute (79c1e35) |
| More than half the searches fail | Free plan: 50 subrequests and 10 ms CPU per run | Needs Workers Paid (T514-a); the code is unchanged |
| Published files lacked `back` | The deployed version predated both directions; the publisher only republished changed airports | Redeployed; `published_at` reset once for a full publish |
| Wrangler temp files committed | `.wrangler/tmp` under the Worker | Untracked and ignored (b0a397d) |

## What is still open

Workers Paid is required for the sweep to cover Europe (T514-a, owner, first in order). In the last hour Google refused 4 searches from Cloudflare's addresses and the guard paused the sweep for an hour; whether that rate holds once Paid lets about 100 searches a minute through is the open question (T514-b). Coverage today is BRU and CRL from the seed plus what the free-plan sweep reached (144 airports with a file).

## Rollback procedure

`npx wrangler delete flight-sweep`; `npx wrangler d1 delete carta_flights`; delete R2 `data/flights/` and `data/airlines/`; `git -C continent-app revert 6d1dd33 79c1e35 b0a397d 9f23e07`.

---

## Task ID

T515

## Date

2026-10-21

## What changed

`continent-app/functions/api/flights.js` answers `/api/flights?o=&d=&date=` with every flight of that day, live from Google Flights, cheapest first, with the link. Answers are held an hour at the edge (Cache API) and ten minutes in the browser; a refusal or failure is a 502 with no body and is never cached. The Pages project gets `nodejs_compat`.

## Files touched

**Created:** `continent-app/functions/api/flights.js`. **Modified:** `continent-app/wrangler.toml`.

## Commands run

`npx wrangler pages functions build` (compiles).

## Config and secrets set

Pages `compatibility_flags = ["nodejs_compat"]`.

## Before/after measurements

Not measured before the deploy; the deploy check below covers it.

## What broke and how it was fixed

No issues.

## What is still open

The endpoint cannot run under the Vite dev server, so the planner's live price was checked in the browser only up to "Checking flights"; the deploy check covers the real call. Under the free plan's 10 ms CPU it will often fail and the planner falls back to the swept price (T514-a).

## Rollback procedure

`git -C continent-app revert b68f7c1`.

---

## Task ID

T516

## Date

2026-10-21

## What changed

The sweep keeps every airline it sees (Google's name) and at each publish copies Google's 70 px logo for up to 25 new airlines into R2 `data/airlines/{code}.png`; `_index.json` maps every airline to its name and whether a logo exists. The page's CSP allows images from the data host. The app's `AirlineMark` shows the logo in a small white square, or the airline's code when there is none.

## Files touched

**Modified:** `continent-app/workers/flight-sweep/{schema.sql,src/index.mjs,src/publish.mjs}`, `continent-app/public/_headers`, `continent-app/vercel.json`.

## Commands run

`npx wrangler d1 execute carta_flights --remote --file workers/flight-sweep/schema.sql`; `npx wrangler deploy -c workers/flight-sweep/wrangler.toml`.

## Config and secrets set

CSP `img-src` gains `https://data.carta-europetravel.com`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Airline logos on R2 | 0 | 73 | +73 |

## What broke and how it was fixed

No issues.

## What is still open

The logos are airline trademarks copied from Google's static host; the ledger row says Verify (T516-a).

## Rollback procedure

`git -C continent-app revert 79c1e35 489424a`; delete R2 `data/airlines/`.

---

## Task ID

T517

## Date

2026-10-21

## What changed

`continent-app/src/lib/flights/` prices the flight in every total. `flights.js` (pure): a swept day, the cheapest in a month, the nearest swept day within four days (the flight keeps and shows its own date), a return for the party, live beats swept, hours bands, prices older than three days never shown. `bagFees.js`: typical 10 kg cabin and 20 kg checked fees per airline, per person per way, the cabin bag included on full-service airlines, unknown airlines add nothing. `flightData.js` loads the home airport's file and the airline index from the data host (the production host when `VITE_DATA_BASE` is unset). `useLiveFlights.js` asks `/api/flights` for the planner's exact days. `priceTrip` adds Carta's flight each way the traveller did not type (typed, then live in the chosen hours, then swept), `tripLines` marks those lines `flight`, the planner keeps `flightHours` per direction, and `destPrice`, `tripPrice`, `composeTrip` (Destinations tab) and budget search's fly mode carry the flight.

## Files touched

**Created:** `continent-app/src/lib/flights/{flights,bagFees,flightData,useLiveFlights,useAirlines}.js`, `continent-app/tests/flights.test.mjs`.
**Modified:** `continent-app/src/hooks/{useAppData,useTripPlanner,useDestinationSearch}.js`, `continent-app/src/lib/{tripTotal,destPrice,tripPrice,runtime_pricing,budgetSearch}.js`, `continent-app/tests/budgetSearch.test.mjs`.

## Commands run

`npm test` (577 pass).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Rome, 21 to 28 Nov, 2 people, 10 kg bag: total | ~€1,220.38 est. (no flight) | ~€1,522.38 est. | +€302.00 (easyJet both ways, 2 × (€50 + €15 + €71 + €15)) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A typed total for both ways would count twice | Older records hold one figure for the pair | No Carta flight when that figure exists |
| Destination page found no way home | The seed had no day near the 28th and the window was 3 days | Seeded the dates; window 4 days, the far tier's worst case (1236d5a) |

## What is still open

The bag fee table is typical prices read from the airlines' pages, not checked row by row (T517-a).

## Rollback procedure

`git -C continent-app revert 5008cbb 66c37a6 1236d5a`.

---

## Task ID

T518

## Date

2026-10-21

## What changed

Every screen that prices a trip shows the flight, built with the impeccable skill (context read directly from PRODUCT.md, DESIGN.md and the app's surface brief because the launcher resolved the nested repo, then the craft floor and carta-design; its detector found nothing on the flight files). `src/components/flights/Flights.jsx`: `AirlineMark`, `FlightRow` (times as the title, airline and stops as meta, the fare a person in tabular cents, bags as `~€15.00 est.`, "Google Flights, checked 21:57" and "View on Google Flights" with the prices-may-change note), `FlightChip` and `HoursFilter`; styles in `src/styles/74-flights.css`. Explore cards and the hover receipt show "Flight from" with the airline's mark; the destination page price card adds a Flight line and two flight rows; Destinations city cards include the flight; curated weeks and trip pages add the flight to the gateway and back (the figure a day stays the days there); week tiles and journey gateways get a chip; the trip planner's there and home rows are flight rows with an hours filter and "Add your fare" one tap away; PlanTotal shows flight lines with the mark; the wizard's getting-there and review steps show the same flight; PDF, share text, print page and ICS carry airline, flight number, times and price. Carta-design's seven questions: no hex outside tokens; no gradient; brown only on the link and the selected hours segment; every figure 12 px or larger in tabular numerals through `formatMoney` or `Money`; one primary per view, no text on a photo; headings unchanged; the second date line was removed.

## Files touched

**Created:** `continent-app/src/components/flights/Flights.jsx`, `continent-app/src/styles/74-flights.css`, `continent-app/src/browse/cartaFlight.js`.
**Modified:** `continent-app/src/browse/{ExploreCards,ExploreTab,DestPriceCard,DestCards,TripPriceCard,TripPage,JourneyCards,JourneyPage,BudgetResults,BudgetSearch}.jsx`, `continent-app/src/components/CostSummary.jsx`, `continent-app/src/planner/{TravelLegsSection,PlanTotal,TripItinerary,TripPlannerTab,GuidedTripWizard}.jsx`, `continent-app/src/planner/wizard/{StepGettingThere,StepReview}.jsx`, `continent-app/src/lib/{planPdf,tripExport,icsExport}.js`, `continent-app/scripts/verify_trip_page.mjs`.

## Commands run

`npx eslint`; `npm test`; `node scripts/ci/design-lint.mjs` (one new violation, `src/components/Logo.jsx:26`, from T510); `impeccable detect --json` (no findings); browser round on the Vite dev server.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Fast build assets | 7,179 KB | 7,199 KB | +20 KB |
| Main bundle | 801,374 B | 820,624 B | +19,250 B |

End check (phone 375 px and desktop 1280 px): Explore cards and list rows with "Flight from" and marks, none where no flight, no horizontal scroll; Rome's destination page Flight €302.00 with two rows; wizard Florence to Rome, Vueling there €124.00 and easyJet home €116.00, receipt lines €248.00 and €232.00 with marks; planner rows with hours filter, Evening moving the 15:15 flight out and the total down by €248; Seville curated week Flight €498.00 with "+1" on the overnight arrival.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A flight a day off the wanted day printed its date twice | A second "Flies" line | Removed; the header date reads in ink when it is not the day asked (ed9ec03) |
| Inline style on the card chip, unstyled planner wrappers | Agents could not edit the stylesheet | Rules in 74-flights.css |
| Trip page "a day" figure included the flight | The receipt divided the whole total | The flight is in the total, not in the figure a day |
| Dev server needed minutes per page | Vite scanned for 14 minutes and queued hot reloads during the batch | Restarted Vite directly; fixture renamed to .txt |

## What is still open

Style cards have no gateway, so they show no flight (T518-a). The budget receipt's flight line has no airline or times (T518-b). The wizard has no hours filter or live price, the planner does (T518-d). The wizard's hint can name a different home airport (CIA) from the one the flight is priced from (FCO) (T518-f). Not seen in the browser: Destinations tab city cards and price sort, budget fly mode, exports and the trip page receipt (covered by tests and the subagents' checks only) (T518-g). Google's terms do not allow automated reading of its pages; the owner accepts the risk (T518-c).

## Rollback procedure

`git -C continent-app revert ed9ec03 2fef9ea 6b3d57f` and the T517 commits above.

---

## Task ID

T519

## Date

2026-10-21

## What changed

The copy and the docs say what is now true. Six languages: a `flight.*` block, `journey.incFlight`, and rewrites of `trip.flightNotPriced`, `itin.flightNotPriced`, `trip.legDisclaimer`, `journey.composedSub` and the FAQ answer on flight prices. Terms of Service: a flight price is Google Flights' price when checked, not an offer; bag fees are estimates; a typed fare replaces it. PRODUCT.md: "Carta brings everything together: the flight, the bed and the days, in one total", the flight order, no tilde on a flight, still no selling. The carta-design skill has a Flights rule block; SCHEMA, ESTIMATION, PIPELINE, SUPPORT, FIRST_RUN_RESULT, ONBOARDING, LAUNCH-METRICS, LAUNCH-OUTREACH-DRAFTS, 1.CARTA, the design briefs and the app README are current or carry dated notes. Licence ledger rows: `eurostat_avia_par`, `ourairports`, `google_flights_fli` (Verify), `google_airline_logos` (Verify).

## Files touched

**Modified (root):** `PRODUCT.md`, `1.CARTA.md`, `.claude/skills/carta-design/SKILL.md`, `Roadmap/1.2-baseline-audit.md`, `docs/{1.CARTA,ESTIMATION,FIRST_RUN_RESULT,LAUNCH-METRICS,LAUNCH-OUTREACH-DRAFTS,ONBOARDING_AND_EMPTY_STATES,PIPELINE,SCHEMA,SUPPORT}.md`, `docs/design-v6/briefs/{landing,shell,tripplanner}.md`, `docs/design-v6/plans/V3-explore.md`, `docs/tos/data_licenses.md`, `src/ingestion/core/registry.py`. **Created:** `.claude/launch.json`.
**Modified (app):** `src/i18n/{en,nl,fr,de,es,it}.js`, `src/components/TermsOfService.jsx`, `README.md`.

## Commands run

`node scripts/ci/banned-terms.mjs` (clean); `python -m src.ingestion.core.ledger --write` then `--check` (148 rows, current).

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

The Terms of Service paragraph on flights needs the owner's review (T519-a). `docs/SCHEMA.md` still carries older fare parts (lines about 122 to 135, the provenance section near 263 to 313, the wire-contract rows for `flight_model` and `fares_model_*`), `docs/PIPELINE.md` mentions the fare history on R2, and the README's Aviasales and Skyscanner text stays while `buildFlightLinks` exists (T519-b).

## Rollback procedure

`git revert 90c05d641` (root); `git -C continent-app revert 6b3d57f`.
