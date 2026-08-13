# Price-map expansion: independent chunk prompts

Source blueprint: the compass research doc ("Building a Price-Based Travel Discovery Map of Europe").
Give each Claude Code session TWO things: the SHARED PREAMBLE below, then ONE chunk prompt, plus the compass markdown attached.

## How to use

1. Preferably give each session its own git worktree (`git worktree add ../carta-chunk-N -b chunk-N`) so parallel sessions never fight over files. If you run them in the same checkout, only run chunks from different parallel groups (see matrix at the bottom).
2. Paste the SHARED PREAMBLE at the top of every session prompt, then the chunk prompt, then attach the compass markdown.
3. Note: the compass markdown has mojibake (euro signs and dashes render as "â¬" / "â"). Sessions should read through it; the content is intact.

---

## SHARED PREAMBLE (paste at the top of EVERY session)

You are working on Carta, a European budget travel price app. Repo root: `c:\Users\Gebruiker\Documents\Portfolio\Travel App`. The React app lives in `continent-app/` (Vite, MapLibre). The Python data pipeline lives in `pipeline/` (dest master + fares), `src/ingestion/` (24-collector raw ETL framework with manifests, `run_all.py --list/--check`), and `src/estimation/` (fare snapshot history + quantile GBDT estimator). Run Python from the repo root. `run_pipeline.py` orchestrates everything on cadence tiers.

The attached research markdown is the blueprint. Your session implements ONE chunk of it, defined below. Read the blueprint sections your chunk cites, then the existing code named in the chunk, before writing anything.

Non-negotiable project rules:

1. FALLBACK CHAIN, ALWAYS: every price the app shows must resolve through: real harvested quote, then cached third-party quote, then model estimate. A price slot may never be blank because data is missing. Estimates must be flagged in the data (est flag) and visually distinct in the UI (tilde prefix, "est." styling).
2. Direct carrier scraping stays PRIMARY for flights: Ryanair (`pipeline/harvest_all_origins.py`), Wizz Air (`pipeline/harvest_wizzair.py`), Vueling (`pipeline/harvest_vueling.py`), Volotea (`pipeline/harvest_volotea.py`). Anything new merges cheapest-wins into the existing fare files and never replaces or overrides a cheaper direct quote.
3. No em dashes or en dashes anywhere: not in code, comments, UI copy, or data. Use commas, colons, or parentheses.
4. SVG icons only, no emoji in the UI.
5. If your chunk touches anything a user sees, load the `carta-design` skill first. UI strings go through i18n (6 languages, `continent-app/src/i18n/`).
6. Before running any script that writes `app_data/`, `continent-app/public/app_data.json`, or `continent-app/public/fares/`: check `Get-Process python` for a concurrent harvest from another session, and do not run master-mutating scripts while one is active.
7. Wire format must stay slim (the shipped JSON is already ~77MB): use short field keys, omit fields when absent, never pretty-print shipped JSON.
8. Windows gotcha: fare files for airport codes that are reserved DOS device names (PRN, CON, AUX, NUL) must go through the escaping in `continent-app/src/lib/fareFile.js` (PRN becomes PRN_.json) on both write and read.
9. Do not commit or push unless explicitly asked. Leave the working tree with your changes plus a short summary of what you changed and how you verified it.
10. Only touch the files your chunk owns. If you believe you must edit a file owned by another chunk, stop and report instead.

Shared data contracts (implement against these exactly, do not redesign them):

A. Fare provenance fields, added per fare record in the fare wire format (all optional, absent means legacy direct-harvest):
   - `s`: source code, one of `"FR"` `"W6"` `"VY"` `"V7"` (direct carriers), `"TP"` (Travelpayouts cache), `"EST"` (model estimate)
   - `o`: observed_at, unix epoch DAYS (not seconds, to stay slim)
   - `x`: expires_at, unix epoch days, only when the source supplies one
   - `e`: `1` when the price is a model estimate, omitted otherwise

B. Travelpayouts staging file `data/derived/tp_fares.json`:
   `{ "meta": {"generated_at": iso, "origins": [...]}, "fares": [{"org": IATA, "dst": IATA, "d": "YYYY-MM-DD", "eur": int_cents, "link": deeplink, "obs": epoch_days, "exp": epoch_days}] }`

C. Ground fare calibration artifact `data/derived/ground_fare_calibration.json`:
   `{ "meta": {"generated_at": iso, "samples": {...}}, "countries": { "<ISO2>": { "train": {"base_eur": float, "per_km_eur": float, "n": int}, "bus": {...}, "ferry": {...} } } }`
   Consumers fall back to built-in priors for any missing country or mode.

D. Reachability artifact, one file per origin, `continent-app/public/reach/<ORIGIN_IATA>.json`:
   `{ "origin": IATA, "computed_at": iso, "minutes": { "<destId>": int } }`
   (isochrone polygons optional later, minutes table is v1)

E. FlixBus network artifact `data/derived/flix_network.json`:
   `{ "meta": {"source": "gtfs.gis.flix.tech", "license": "...", "fetched_at": iso}, "pairs": [["<destIdA>", "<destIdB>", minutes]] }`

---

## CHUNK 1: Travelpayouts flight-cache collector (backend, new files only)

Blueprint sections: 1, 3, 4 (Travelpayouts block), 7.

Goal: a new ingestion collector that pulls Travelpayouts (Aviasales cache) cheapest-fare data for Carta's origin set and stages it as contract B. This is a COVERAGE BACKFILL for carriers Carta cannot scrape directly (easyJet, Brussels Airlines, Norwegian, Pegasus, Transavia, legacy carriers). It does not touch the live fare files, that is Chunk 2's job.

Owns (create only, modify nothing outside these): `src/ingestion/pricing/travelpayouts.py`, registry entry, `.env.example` addition, a note in `src/ingestion/CREDENTIALS.md`, output under `data/raw/travelpayouts/` and `data/derived/tp_fares.json`.

Do:
1. Read `src/ingestion/README.md`, `src/ingestion/core/collector.py`, `src/ingestion/core/registry.py`, and one existing pricing collector (`src/ingestion/pricing/sncf_availability.py`) to follow the framework conventions (manifests, storage, `--check` probe).
2. Token from env `TRAVELPAYOUTS_TOKEN` (X-Access-Token header). Currency EUR.
3. Origin set: derive from the fare files present in `continent-app/public/fares/` (or `continent-app/src/lib/origins.js`), so the collector automatically covers the origins the app actually serves.
4. Endpoints, in priority order: `/v1/city-directions` per origin (city-to-anywhere, the workhorse), `/aviasales/v3/prices_for_dates` for the top pairs it returns, `/v1/prices/calendar` for the top ~20 pairs per origin. Respect the per-minute limits listed in blueprint section 4, back off on 429 using the X-Rate-Limit-Reset header.
5. Store raw responses under `data/raw/travelpayouts/` with a manifest like the other collectors. Normalize into contract B at `data/derived/tp_fares.json`. Honour each quote's `expires_at`; drop already-expired quotes at write time.
6. Register the collector so `python -m src.ingestion.run_all --list` shows it and `--check` probes auth cheaply.

Verify: `run_all --check` passes for the new collector; a single-origin smoke run produces a valid contract B file; log how many origin-destination pairs came back and how many had no direct-carrier coverage (that overlap number is the value of this chunk, report it).

Done when: collector registered, staged output validates, no other files changed.

---

## CHUNK 2: fare provenance + cheapest-wins merge upgrade (backend, owns the fare write path)

Blueprint sections: 1, 3 (schema, TTL policy), 7.

Goal: every shipped fare carries provenance (contract A), the multi-carrier merge is finished and shipped, and Travelpayouts staging (contract B) joins the merge when present. IMPORTANT: this chunk writes `continent-app/public/fares/`, so it must not run its harvest steps while any other session runs Python harvests.

Owns: `pipeline/harvest_all_origins.py` (the merge step inside it), `pipeline/harvest_wizzair.py` / `harvest_vueling.py` / `harvest_volotea.py` (merge wiring only), `continent-app/src/lib/fareFile.js` (read side, only if needed), `SCHEMA.md` (document contract A).

Do:
1. Read the current merge in `pipeline/harvest_all_origins.py` and how W6/VY/V7 outputs are merged (per project memory the multi-carrier merge is smoke-tested but not fully shipped: finish it).
2. Add contract A fields to every fare written: `s` per carrier, `o` set at harvest time. Absent fields on old files must keep working (read side tolerant).
3. If `data/derived/tp_fares.json` exists: include unexpired TP quotes in the cheapest-wins merge with `s:"TP"`, `o`/`x` from the staging file, and the deeplink carried through however carrier links are carried today. A TP quote must never override an equal-or-cheaper direct quote. If the staging file is absent, the merge runs exactly as before (this keeps Chunk 1 and 2 independent).
4. Keep the wire format slim: measure fare file size before and after for one large origin and report the delta. Respect the reserved-filename escaping (rule 8).
5. Do NOT add estimate records here; `e`/`"EST"` is produced by the frontend fallback (Chunk 4) and possibly a later pipeline stage.

Verify: re-run the merge for ONE origin (e.g. CRL) after checking no other python harvest is running; load the app (`npm run dev` in `continent-app/`) and confirm fares render unchanged; spot-check a merged file contains `s` and `o` and that a known TP-only destination appears only if Chunk 1's staging exists.

Done when: one origin's fare files carry provenance, app renders them, size delta reported, merge is a no-op change when staging is absent.

---

## CHUNK 3: freshness + estimate labeling UI (frontend, display layer only)

Blueprint sections: 1 (freshness policy), 3 (stale-price UX), 7 (legal framing).

Goal: honest metasearch labeling. Prices become "from" prices, show their age when known, estimates look estimated, and booking click-outs warn that prices may have changed.

Owns: a new component `continent-app/src/components/FareProvenance.jsx` (badge/chip + click-through line), the price display call sites that need it (map popup, destination sheet, itinerary leg rows, receipt), and additions to all 6 files in `continent-app/src/i18n/`. Do not touch pricing logic in `src/lib/`.

Do:
1. Load the `carta-design` skill first.
2. Find every surface that renders a fare or leg price (grep for the formatting helpers in `continent-app/src/lib/format.js` usage). List them in your summary.
3. Behavior driven by contract A fields on the fare/leg object, all optional:
   - `o` present: an age chip, "seen today", "seen 3 days ago" (i18n, coarse buckets: today, yesterday, N days).
   - `e` truthy (or `s === "EST"`): tilde prefix and the estimate style, label "est." with a tooltip/line "estimated, not a live quote".
   - near any external booking link: one small line, "prices may have changed, confirm on the booking site".
   - fields absent: render exactly as today (this ships safely before Chunks 2/4 land).
4. "from €X" phrasing on discovery surfaces (map pins/popups, homepage cards), not on the final receipt where the sum must still equal the parts.
5. All 6 languages. No dashes in copy.

Verify: use the headless harness pattern (vite preview + Playwright, dismiss "Continue without an account", the "Got it" modal, and the START HERE coach mark; share-hash `#trip=` injection for a trip view). Screenshot one surface with a mocked fare carrying `o`, `x`, `e` and one without.

Done when: mocked provenance renders on every listed surface, absence of fields changes nothing, screenshots attached.

---

## CHUNK 4: ground fare resolution chain (frontend lib, the fallback guarantee)

Blueprint sections: 3 (price estimation model), 6 (Rome2Rio model).

Goal: formalize the guarantee that every train/bus/ferry leg always gets a price: real quote if one exists in data, else calibration artifact (contract C), else built-in per-km priors. Output flags so the UI (Chunk 3) can label it.

Owns: `continent-app/src/lib/transport.js`, a new `continent-app/src/lib/groundFares.js`, `continent-app/src/lib/countryTransport.js` (extend only). Do NOT touch components, i18n, or Python.

Do:
1. Audit how ground legs are priced today: `transport.js`, `trip_planner_pricing.js` (read only), `countryTransport.js` rail-quality profiles, and whatever commit 53f1d67 ("estimate the fares Carta cannot harvest") already added. Map every code path that can produce a leg price, and every path that can currently produce a missing/zero price. List both in your summary.
2. Build `groundFares.js` as the single resolver: `resolveGroundFare(legCtx) -> { eur, est: bool, src: string }`. Resolution order: (a) a real quote attached to the leg or dest data if present, (b) calibration table (contract C shape, bundled as an import when the artifact exists, otherwise skipped), (c) built-in priors per blueprint section 3: bus 0.05 to 0.12 EUR/km by country tier, rail per-country base fare plus per-km slope (short-haul roughly 0.15 to 0.20, long-haul roughly 0.10), ferries by existing sea-crossing logic. Distance: routed distance where transport.js already has one, else great-circle times a 1.3 detour factor. NaN-guard all coords via `src/map/coords.js` conventions (Number.isFinite).
3. Route every ground-leg pricing path in `transport.js` through the resolver so no path returns null/undefined/0-by-accident, and the `est`/`src` flags ride on the leg object where the itinerary components will find them (same place existing leg fields live).
4. Keep current outputs numerically identical wherever a real quote or existing estimate already existed; this chunk changes structure and guarantees, not prices (report any place where a price necessarily changed and why).

Verify: write `continent-app/scripts/verify_ground_fares.mjs` (follow the pattern of the existing verify-*.mjs scripts): enumerate a grid of sample legs across at least 10 countries and all modes, assert every result has a finite positive `eur` and a boolean `est`, print a table.

Done when: verifier passes, audit lists in summary, no component files touched.

---

## CHUNK 5: FlixBus GTFS network graph (backend, new files only)

Blueprint sections: 4 (FlixBus GTFS block), 5 (feeds), 7 (attribution).

Goal: ingest the public FlixBus GTFS feed (schedules and network, no fares) and derive which Carta destination pairs have direct bus service, as contract E. This later gates any per-pair price crawling and can inform bus-vs-train mode choice.

Owns (create only): `src/ingestion/bus/__init__.py`, `src/ingestion/bus/flixbus_gtfs.py`, registry entry, output `data/raw/flixbus_gtfs/` + `data/derived/flix_network.json`.

Do:
1. Follow the ingestion framework conventions (same reading list as Chunk 1).
2. Download `https://gtfs.gis.flix.tech/gtfs_generic_eu.zip`; fallback mirror `https://data.ndovloket.nl/flixbus/flixbus-eu.zip` (CC0). Record which source and license in the manifest and in contract E meta.
3. Parse stops, routes, trips, stop_times. Build direct-connection city pairs with a typical duration (median over trips).
4. Match GTFS stops to Carta destinations by proximity to `city_lat`/`city_lon` in the dest master (`continent-app/public/app_data.json` or the master under `app_data/`, read only): nearest dest within 25 km. Report match rate (matched stops / total stops, and how many of the 1,570+ dests get at least one bus edge).
5. Write contract E. Do not wire anything into the app.

Verify: known pairs present with sane durations (Brussels to Paris roughly 4h, Berlin to Prague roughly 4h30); artifact validates; nothing outside owned paths changed.

Done when: artifact exists with match-rate report, collector registered.

---

## CHUNK 6: ground per-km calibration from collected raw data (backend, estimation layer)

Blueprint sections: 3 (estimation model + priors), Caveats (priors are dated).

Goal: replace the blueprint's dated priors with numbers calibrated from data Carta already collects, producing contract C for Chunk 4's resolver.

Owns (create only): `src/estimation/ground_calibration.py`, output `data/derived/ground_fare_calibration.json`, a short section in `ESTIMATION.md`.

Do:
1. Inventory what raw pricing data exists: read `src/ingestion/README.md` and the manifests under `data/raw/` (SNCF availability, Renfe Kaggle, ferry collectors, anything with a price attached to an origin-destination pair). Report what is usable per country and mode.
2. For each (country, mode) with enough samples: robust fit (median or quantile regression, reuse helpers from `src/estimation/model.py`/`common.py` where sensible) of price against distance, giving `base_eur` + `per_km_eur`. Distance from stop/station coords, great-circle times 1.3 when no routed distance exists.
3. Below a minimum sample count (pick and document, e.g. 30), emit nothing for that cell so consumers fall back to priors. Record `n` per cell and totals in meta.
4. Sanity bounds: reject fits outside plausible ranges (per-km 0.02 to 0.40 EUR), log rejects.

Verify: artifact validates against contract C; print a calibration table; sanity-check at least FR rail and DE bus against the blueprint priors and note the deltas.

Done when: artifact exists, ESTIMATION.md documents the method, usable-data inventory reported.

---

## CHUNK 7: reachability precompute (backend, fully new directory)

Blueprint section: 5 (the whole section), 6 (chronotrains).

Goal: a duration table per origin (contract D): how many minutes by ground transport from each Carta origin city to each reachable Carta destination. This powers the "reachable in under N hours" filter (Chunk 8).

Owns (create only): `tools/reachability/` (scripts, config, README), output `continent-app/public/reach/<ORIGIN>.json` for a starter origin set.

Do:
1. Phase A (pragmatic first): probe whether the public Transitous instance (`api.transitous.org`, MOTIS-backed) exposes usable routing/one-to-all for our purposes within fair use. If yes, build the artifact by querying it politely (throttled, cached under `tools/reachability/cache/`) for origin-to-dest durations for a starter set: BRU/CRL origins, all dests within 1500 km, using each dest's `city_lat`/`city_lon`. This de-risks the whole layer without standing up infrastructure.
2. Phase B (own instance, only if A is insufficient): local MOTIS (docker or windows binary) on merged GTFS (FlixBus feed from Chunk 5's URL, gtfs.de for Germany, plus 2 or 3 national feeds from the european-transport-feeds catalogue) + Geofabrik OSM extracts, one-to-all per origin. Document setup in the README so it can be re-run; note the memory that gtfs.de splits return 403 without care (see `src/ingestion/` germany collector for the workaround).
3. Either phase: cap at 12h total travel, write contract D, keep each file slim (minutes table only, ints).
4. Do not touch the app; artifact plus README only.

Verify: spot-check at least 5 known durations (Brussels to Paris roughly 85 min rail, Brussels to Amsterdam roughly 110 min) and report the error margin; report coverage (how many dests got a duration per origin).

Done when: `public/reach/BRU.json` (at minimum) exists and passes spot-checks, README explains regeneration.

---

## CHUNK 8: "reachable under N hours" frontend filter (frontend, new overlay)

Blueprint sections: 2, 5 (combining time + price).

Goal: a map filter that intersects the price layer with the reachability layer: "everywhere under €X AND under Y hours".

Owns: a new component (e.g. `continent-app/src/components/ReachFilter.jsx`), a new loader `continent-app/src/lib/reach.js` (lazy-fetch `public/reach/<origin>.json`, cache in memory), wiring into the existing filter state, i18n additions. Create a small FIXTURE `continent-app/public/reach/BRU.json` with ~30 real-ish entries so this chunk does not depend on Chunk 7.

Do:
1. Load the `carta-design` skill first. Read how existing filters work (price range, `mt` rating param, `continent-app/src/lib/urlState.js`) and follow the same state + URL param pattern (add a param, e.g. `rh` for reach-hours).
2. Loader: fetch by current origin, tolerate 404 (filter disabled with a quiet "no travel-time data for this origin yet" state, never an error).
3. Filter semantics: when active, a destination shows only if it has a duration entry under the threshold AND passes the existing price filter. Intersect BEFORE pin styling, client side.
4. Respect the perf work (planeReachIndex memo pattern): memoize the intersection, no per-frame work. NaN-guard everything.
5. UI: a compact control near the existing filters (hours slider or stepped chips: 3h, 5h, 8h, 12h, off). Follow the fixed-position containing-block gotcha notes before anchoring any popover.

Verify: headless harness (same gates as Chunk 3), screenshots of the map with the filter off and at 5h using the fixture; confirm URL param round-trips through a reload.

Done when: filter works against the fixture, degrades silently without data, screenshots attached.

---

## CHUNK 9: price-pin rendering audit (frontend, perf; run AFTER Chunk 8 merges)

Blueprint section: 2 (rendering, clustering).

Goal: ensure the price pins scale to ~25k dests: GeoJSON source + symbol/circle layers (no DOM markers for bulk pins), cluster where appropriate, `symbol-sort-key` so the cheapest price wins label collisions, `minZoom` gates.

Owns: the main map pin source/layer code under `continent-app/src/map/` (locate it first) and the perf harness under `continent-app/scripts/perf/`. Do not touch the day-planner TripMap pin fan-out (that is a different, small-N system with its own declutter logic).

Do:
1. Audit first, change second: much of this may already be done (zoom-reveal, chip pins, the 24.8k perf pass). Produce a short audit: what renders as GL layers vs DOM markers today, at which zooms, and where the current bottleneck is per the perf harness numbers.
2. Convert only what the audit shows is DOM-bound or unsorted. Cheapest-wins labeling via `symbol-sort-key`; `text-allow-overlap: false`.
3. Re-run the perf harness before and after; report the numbers. Do not regress the 2.8s desktop load.
4. Mind the MapLibre gotchas in project memory: CSS order on lazy-loaded maplibre-gl.css, marker inline-transform clobber (visuals on an inner child), NaN coord guards.

Verify: perf harness numbers before/after, plus a headless screenshot at continental zoom and city zoom.

Done when: audit + numbers reported, no visual regressions in screenshots.

---

## CHUNK 10: staleness-tiered refresh scheduling (backend, orchestrator)

Blueprint sections: 1 (freshness tiers), 3 (crawl scheduling).

Goal: encode the Skyscanner-style freshness policy into the orchestrator: popular pairs refresh often, long tail refreshes rarely, everything reports its age.

Owns: `run_pipeline.py` (and `run_pipeline.bat` only if flags change), new output `data/derived/freshness_report.json`.

Do:
1. Read `run_pipeline.py`'s task/cadence model. The Windows scheduled task TravelAppFareRefresh runs `run_pipeline.bat` weekly with a long ExecutionTimeLimit; do not break its entry point or make the default run longer without flagging it.
2. Add a freshness report step: for each fare file in `continent-app/public/fares/`, record origin, newest and oldest `o` (contract A) or file mtime as fallback, and counts by source. Write `data/derived/freshness_report.json` and print a summary in `--check`/dry-run output.
3. Add a staleness-priority mechanism for fares: rank origins by (age times popularity), where popularity can be a static tier list of major origins for now, and let the fares task accept `--max-origins N` to refresh the N stalest-highest-priority first. Default behavior unchanged.
4. If Chunk 1's collector is registered by the time you work: schedule it as a cheap soft task (its API is cache-reads, it can run more often than scraping). If not registered, leave a commented hook.

Verify: dry-run shows the freshness summary; `--max-origins 2` refreshes exactly the 2 expected origins (verify against the report, do not actually run a full harvest if another session is harvesting).

Done when: report generated, priority flag works, scheduled task path unbroken.

---

## CHUNK 11: ToS groundwork, licensing, attribution (docs + one tiny data file)

Blueprint sections: 4 (Omio/Flix blocks), 7 (legal, attribution), Recommendations Stage 0, Caveats.

Goal: the Stage 0 de-risk the blueprint calls mandatory, plus a per-source license ledger so attribution and share-alike obligations are tracked before more sources land.

Owns (create only): `docs/tos/omio_outreach.md`, `docs/tos/flix_outreach.md`, `docs/tos/data_licenses.md`, `continent-app/src/data/attribution.js`.

Do:
1. Outreach drafts: two short, professional emails (Omio B2B/affiliate team; Flix online distribution/partner team) asking exactly one question each, per the blueprint: may we cache and display your prices on a discovery map, with freshness labels and deeplink click-through. Mention Carta is a live affiliate partner where true (Omio via Impact network per `continent-app/src/lib/omio.js`). Plain text, ready to paste into Gmail. No commitments, no legal claims.
2. License ledger: a table in `docs/tos/data_licenses.md` of every external data source currently in use. Sources: sweep `src/ingestion/` collectors and their manifests, `pipeline/harvest_*.py` headers, and the blueprint's license notes (gtfs.de CC BY-SA 4.0, NDOV CC0, transport.data.gouv.fr ODbL, OSM ODbL, Wikidata CC0, Wikipedia CC BY-SA, WorldClim, EEA, JRC/Eurostat, Inside Airbnb, Overture, GeoNames). Columns: source, what we take, license, attribution required, share-alike, where attributed today (or MISSING).
3. `attribution.js`: export a plain array of `{ source, license, credit }` for the sources whose license requires user-facing credit, derived from the ledger. Do not wire it into the UI (a later pass adds the footer); keep it dash-free.
4. Do not send anything, do not add any new scraping.

Verify: ledger covers every collector in `src/ingestion/run_all.py --list` output; emails read clean.

Done when: four files exist, MISSING attributions explicitly listed for follow-up.

---

## Parallelism matrix

Safe to run fully in parallel (disjoint files): 1, 3, 4, 5, 6, 7, 11.
Run alone among backend fare-writers (writes public/fares, checks for concurrent python): 2.
Sequential pair (both touch the main map): 8 then 9. Each is parallel-safe with everything else.
Anytime, but merge last (edits the orchestrator that schedules 1 and 2): 10.

Suggested value order if you run them in waves:
- Wave 1: 2 (alone) + 3 + 4 + 1 + 11 (labeling honesty, the fallback guarantee, and coverage backfill)
- Wave 2: 5 + 6 + 7 (network graph, calibration, reachability data)
- Wave 3: 8, then 9, then 10 (the new filter, perf, scheduling)
