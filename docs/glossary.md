# Glossary

Carta words, one line each, with the place in the code or docs that grounds it. Built by T1073 (ROADMAP B2) from the code, `docs/SCHEMA.md` and the handbook. Where a term was not traced to code, the line says "not verified". Add a term here in the same commit that introduces it. Paths starting `app/` mean `continent-app/`.

## Data and pipeline

| Term | Meaning | Grounded in |
|---|---|---|
| Pipeline | The Python tasks that harvest sources and write the data. Run as `python run_pipeline.py <task>`. | `run_pipeline.py`, `pipeline/` |
| Task | One named step of the pipeline (`fame`, `trips`, `dossier`...); listed with cadence by `python run_pipeline.py --list`. | `run_pipeline.py` (`TASKS`), MAP.md "Pipeline" |
| Cadence | How often a task is due: the driver is "resumable, cadence-aware"; `--max-cadence weekly` runs only weekly tier tasks. | `run_pipeline.py` header |
| Master | The one dataset the pipeline writes, `app_data/app_data.json`, with `meta.schema_version` 19. | `docs/SCHEMA.md`, handbook "The data wire" |
| Layer | A pipeline step's contribution to the master or its own wire folder, usually `pipeline/<name>_layer.py` (rating layer, place layer, ask index layer); also the numbered `Schema vN` sections of SCHEMA.md. | `pipeline/`, `docs/SCHEMA.md` |
| Wire | What the app actually downloads: the master split into a boot index, country shards and detail files by `sync-data.mjs`. | `app/scripts/sync-data.mjs`, handbook "The data wire" |
| Wire contract | The table of top-level fields at the end of SCHEMA.md that CI checks against the shipped data. | `docs/SCHEMA.md`, `app/scripts/ci/check-contract.mjs` |
| Boot index | The small first file (`public/boot.json`): ids, coordinates, country, flags and rating band for every place. | `app/src/lib/bootIndex.js` |
| Shard | One per-country file `public/dest/{cc}.json`; `_rank.json` holds the fields default screens rank on. | handbook "The data wire" |
| R2 tier | The list of wire folders served from the R2 data host instead of the Pages deploy (`R2_TIER`). Not to be confused with cadence tier, place tier or pass tier. | `app/src/lib/dataHost.js` |
| Data host | `data.carta-europetravel.com`, the public R2 bucket the app reads shards from. | `app/scripts/build-pages.mjs` (`PRODUCTION_DATA_BASE`) |
| Dossier | The per-place contract that feeds the place page and the PDF. | `pipeline/dossier/build_dossier.py`, `app/src/lib/dossier.js` |
| Ledger | The data licence ledger generated from the ingestion registry. | `src/ingestion/core/ledger.py` (run by CI), `docs/tos/data_licenses.md` |
| Registry | `src/ingestion/core/registry.py`: what runs (cadence, task, failure mode) and what each source is licensed for. | `docs/tos/data_licenses.md` header |
| Quarantine | `tests/quarantine.txt`: Python test IDs CI skips; the list may only shrink. | `tests/quarantine.txt` |
| Golden set | A fixed set of places checked by the `golden-set.yml` workflow; contents not verified here. | `.github/workflows/golden-set.yml` |
| Sweep | The scheduled harvest of flight fares into R2 (Worker `flight-sweep`), plus the late sweep for weeks 27 to 45. | `app/workers/`, handbook "Flight sweep" |
| Prerender | About 32,000 static HTML pages for search engines, kept in the private R2 bucket `carta-prerender` and served by one Pages Function. | `app/functions/[[path]].js`, `app/wrangler.toml` |
| Trailslab, BRouter | The routing and repair tools for trails. | `tools/trailslab/`, `tools/brouter/` |
| Build box | The Hetzner server that runs the weekly pipeline. | `infra/hetzner/` |

## Places and scores

| Term | Meaning | Grounded in |
|---|---|---|
| Place, destination | One row of the catalogue (a city, town, village, metro or area), with an id such as `gem:bled`. | `docs/SCHEMA.md`, `app/src/browse/home/` (`STORY_PLACE`) |
| Class (kind) | The size class of a place: metro, city, town, village, area. The rating reads appeal on a per-class scale. | handbook "Place rating", "Explore" |
| Gateway | An extra airport row of the same city; the city row lists them (`gateways`), the airport row carries `gateway_of`. | `docs/SCHEMA.md`, `app/tests/gateways.test.mjs` |
| Score, rating | The Carta rating from 0 to 10 (`rating.score`), pipeline written, from a frozen calibration. | handbook "Place rating (Carta rating v5)", `reports/rating_reference_v5.json` |
| Appeal | The judgement part of the score (weight 0.60): a hand score, else a rubric score. | handbook "Appeal: hand scores and the rubric" |
| Beauty, depth | Two other inputs of the rating. | handbook "Beauty", "Depth" |
| Fame | Average daily Wikipedia pageviews over 12 months; it never changes the score, it only drives the hidden gem flag. | handbook "Fame and hidden gems" |
| Gem, hidden gem | A place that rates high but few people look up (rule in config `hidden_gem`). | handbook "Fame and hidden gems" |
| Designation | Recognition such as UNESCO that feeds the rating. | handbook "Designations and recognition" |
| Vibe | A 0 to 100 score for up to eight of twenty vibes (quiet, old town, food, beach...) per place. | handbook "Vibe scores", `pipeline/guided_search_layer.py` |
| Taste profile | The place's like profile used for personal match. | handbook "Place taste profile", `pipeline/place_taste_profile.py` |
| For you | Personal match ordering of Explore; off by default until the persona gate passes. | handbook "Personal match", `app/config/rating.json` |
| POI | A point of interest inside a place; labelled must-see, recommended or worth a look. | handbook "POI significance and labels" |
| Estimate tilde | The mark on a figure that is a stand-in or estimate, not a measured value. | handbook "Explore" (day price) |

## Prices

| Term | Meaning | Grounded in |
|---|---|---|
| Price request | The one question every screen asks the price engine: party, lifestyle, month, nights. | handbook "The price request", `app/src/lib/price/` |
| Day price | Bed plus food and drink for one person for one day, plus local transport where a fare exists. | handbook "The day price and the five price bands" |
| Price band | One of five words (Very cheap to Very pricey) from fixed euro cut points. | handbook (same), `app/config/pricing.json` |
| Lifestyle | How the traveller eats and goes out; six presets (Backpacker, Easygoing, Foodie, Cafe and culture, Nightlife, Family). | handbook "Lifestyle levels" |
| Party | Group size and who is in it, which sets seats and rooms. | handbook "Group size and the party" |
| Buffer | The margin used by Ask budget search. | handbook "The buffer (Ask budget search)" |
| Quality (of a price line) | `live`, `measured`, `modelled` or `missing`; a missing line is never counted as zero. | handbook "The day price..." |

## Product

| Term | Meaning | Grounded in |
|---|---|---|
| Explore | The catalogue as grid and map. | `app/src/browse/ExploreTab.jsx` |
| Plan, plan flow, wizard | The route from settings to a trip. | `app/src/planner/flow/PlanFlow.jsx` |
| Finder, Trips for you | The trip finder that ranks ready-made trips. | `app/src/planner/finder/TripsForYou.jsx` |
| Journeys | Carta's own hand written week-long trips in 15 styles. | `pipeline/journeys/build_wire.py`, handbook "Carta's own trips" |
| Trips layer | About four thousand generated 2 to 14 day trips, each checked before it ships. | `pipeline/trips/`, handbook "Ready-made composed trips" |
| Trip page | The traveller's own planned trip (not `app/src/browse/TripPage.jsx`, which is a library trip). | MAP.md "Watch out" |
| Day planner, plan-day | Day by day planning; `plan-day` is the Gemini Edge Function behind the AI day plan. | `app/src/planner/DayPlannerTab.jsx`, `supabase/functions/plan-day/` |
| Magic import | Reading a pasted booking into a trip (`parse-booking`). | `supabase/functions/parse-booking/` |
| Together | Shared trips, friends, votes, split costs. | handbook "Together, sharing and collaborative trips" |
| Ask Carta | The chat that answers from the catalogue with retrieval and an open model. | handbook "Ask Carta" |
| Pass, tier (pass) | The paid plan. Tier order is `free`, `trip`, `year`. | `app/src/lib/pricing.js` (`TIER_ORDER`) |
| Paywall | The gate that checks the pass tier. | `app/src/hooks/usePaywall.jsx` |
| Neurons | Workers AI's unit of use; Ask stops at 9,000 a day through the KV counter. | `app/wrangler.toml` |
| Shortlist | Places a traveller has saved. | handbook "Shortlist (saving places)" |
| Search dock | The phone search pill and sheet. | handbook "Search dock" |
| Image ladder | Sized copies of a photo; live path is resized Wikimedia links. | handbook "Image ladder (sized copies)" |
| Hero | The lead photo of a place, beach, lake, peak or trail. | handbook "Hero image choice" |
| Outage line | The one sentence shown at the foot of the app during an incident. | `docs/runbooks/incident.md` |

## Project process

| Term | Meaning | Grounded in |
|---|---|---|
| Task number (`T1073`) | The ID of one unit of work; reports live in `Execution/P{n}/`. | CLAUDE.md |
| Register | `Execution/_OPEN.md`, one row per open item. | CLAUDE.md |
| Digest | `Execution/P{n}/_DIGEST.md`, one file per finished phase. | CLAUDE.md |
| Roadmap item (`B2`) | An item of the plan of record, `ROADMAP.md`. | CLAUDE.md |
| Fast build | The 10 second Vite build used for checks (`scripts/vite.fast.mjs`). | CLAUDE.md |
| Handbook | `docs/HANDBOOK.md`, every feature and how it works. | `docs/README.md` |
