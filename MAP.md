# Carta map

To understand what a feature does and exactly how it works (rules, formulas, thresholds), read [docs/HANDBOOK.md](docs/HANDBOOK.md). This map only says where the files are. The plan to production is [ROADMAP.md](ROADMAP.md).

Where each part of Carta lives. Find the area, open the files named, stop. App paths start with `app/`, meaning `continent-app/` (tracked in this repo). Docs are in `docs/`. "Latest" are the newest task reports on the area: grep `Execution/P15/` and `Execution/P*/_DIGEST.md` for the ID. Checked against the code on 2026-11-03 (T1034); a task that moves an area's main files updates its row.

## Product areas

| Area | App code | Pipeline / backend | Docs | Latest |
|---|---|---|---|---|
| Home | app/src/browse/home/HomePage.jsx, app/src/browse/home/HomeHero.jsx, app/src/lib/homeVisit.js | | 1.CARTA.md (root) | T998, T988 |
| Explore (map, cards, filters, rails) | app/src/browse/ExploreTab.jsx, app/src/browse/ExploreMap.jsx, app/src/browse/ExploreCards.jsx, app/src/browse/ExploreRails.jsx | pipeline/explore_overlay.py, pipeline/guided_search_layer.py | | T980-T983, T968 |
| Place page and PDF | app/src/browse/DestinationPage.jsx, app/src/browse/PlaceOverview.jsx, app/src/lib/dossier.js, app/src/lib/destinationPdf.js | pipeline/dossier/build_dossier.py, pipeline/place_layer.py | ITEM_PAGE_DATA_CONTRACT.md | T1019, T1022 |
| Trip library, journeys, trip finder | app/src/browse/JourneyPage.jsx, app/src/lib/journeys.js, app/src/lib/trips.js, app/src/planner/finder/TripsForYou.jsx | pipeline/trips/, pipeline/journeys/build_wire.py | trips_layer.md | T1030, T879-T884 |
| Plan flow and wizard | app/src/planner/flow/PlanFlow.jsx, app/src/planner/flow/PlanHome.jsx, app/src/planner/wizard/, app/src/planner/GuidedTripWizard.jsx | | | T1002, T989-T991 |
| Trip page (the traveller's trip) | app/src/planner/finder/TripPage.jsx, app/src/planner/trip/ | | ITEM_PAGE_DATA_CONTRACT.md | T1017, T1001-T1016 |
| Day planner and plan-day AI | app/src/planner/DayPlannerTab.jsx, app/src/planner/days/, app/src/planner/aiDayPlan.js, app/src/planner/dayPlanStore.js | supabase/functions/plan-day/, supabase/functions/suggest-city/ | | T1015-T1016, T895-T900 |
| My trips, account, together | app/src/auth/mytrips/, app/src/auth/account/, app/src/together/TogetherPage.jsx, app/src/auth/tripStorage.js | supabase/migrations/ | | T984-T987, T933-T936 |
| Pass, paywall, Stripe | app/src/pass/PricingPage.jsx, app/src/components/PassModal.jsx, app/src/hooks/usePaywall.jsx, app/src/lib/billing.js | supabase/functions/checkout/, supabase/functions/stripe-webhook/ | REFUND_SOP.md; owner steps in Execution/P2/_OPEN-stripe-launch.md | T1003, T314 |
| Ask Carta (chat, RAG) | app/src/browse/ask/AskChat.jsx, app/src/lib/ask/, app/functions/api/ask.js | pipeline/ask_index_layer.py, app/scripts/build-ask-bm25.mjs | | T572-T576 |
| Price engine (bed, food, trip total) | app/src/lib/price/, app/config/pricing.json, app/src/lib/stayPrice.js, app/src/browse/DestFood.jsx | pipeline/pricing_config.py, pipeline/apply_food_prices.py | ESTIMATION.md | T1018, T714-T716 |
| Flights, fares, airports | app/src/lib/flights/, app/src/components/FlightSheet.jsx, app/functions/api/flights.js, app/workers/flight-sweep/ | pipeline/flights/build_routes.py, pipeline/airport_access.py | ESTIMATION.md | T1020, T844 |
| Stays (Booking, Hostelworld scrape) | app/src/lib/liveStays.js, app/src/lib/staysData.js, app/functions/api/stays.js, app/src/planner/wizard/StepStays.jsx | pipeline/stays/box_stays.py, pipeline/stays/scrape_booking.py, pipeline/stays/scrape_hostelworld.py | Execution/P15/_OPEN-stays-box.md | T1021-T1023 |
| Ratings and For you | app/src/lib/rating.js, app/config/rating.json, app/src/browse/RatingBreakdown.jsx, app/src/lib/recommend/rank.js | pipeline/rating_layer.py, pipeline/rating_config.py, pipeline/place_taste_profile.py | RATING_RUBRIC.md, 2.SIGNIFICANCE.md | T879-T884, T785-T791 |
| Trails, cycling, routes | app/src/browse/TrailPage.jsx, app/src/browse/CyclePage.jsx, app/src/lib/trails.js, app/src/lib/cycling.js | pipeline/trails/, pipeline/cycling/, tools/trailslab/ | TRAILS.md, TRAILS_DATA_QUALITY.md, CYCLING.md | T918-T922 |
| Beaches, lakes, mountains, nature | app/src/browse/BeachPage.jsx, app/src/browse/LakePage.jsx, app/src/browse/MountainPage.jsx, app/src/browse/OutdoorParts.jsx | pipeline/beaches/, pipeline/lakes/, pipeline/mountains/, pipeline/outdoor/derive_outdoor_pages.py | BEACHES.md, LAKES.md, MOUNTAINS.md | T1031-T1033, T918-T922 |
| Climate, crowds, seasons | app/src/browse/ClimateStrip.jsx, app/src/browse/CrowdCalendar.jsx, app/src/lib/crowdMonth.js, app/src/lib/when.js | pipeline/apply_climate.py, pipeline/harvest_tourism_density.py, pipeline/harvest_sea_temp.py | | T1022, T667 |
| Regions, countries, coverage | app/src/browse/RegionPage.jsx, app/src/browse/CountryPage.jsx, app/src/lib/regions.js | pipeline/regions/, pipeline/intake/ | REGIONS.md, COVERAGE.md | T450, T456 |
| Images and photos | app/src/components/HeroImage.jsx, app/src/lib/imageLadder.js, app/src/browse/PhotoGallery.jsx | pipeline/photos/, pipeline/images/ | PHOTOS.md, IMAGE_BRIEF.md | T620-T623 |
| Languages (6) | app/src/i18n/index.jsx and en, de, fr, es, it, nl .js (grep, never read whole), app/scripts/i18n/ | | | T158 |
| Admin, moderation, telemetry | app/src/admin/AdminPage.jsx, app/src/components/admin/, app/src/auth/moderation.js, app/src/lib/launchEvents.js | supabase/migrations/ | LAUNCH-METRICS.md, INCIDENT_RUNBOOK.md | T365, T315 |
| Data wire (pipeline to app) | app/scripts/sync-data.mjs, app/src/lib/appData.js, app/src/lib/bootIndex.js | run_pipeline.py, pipeline/pipeline_io.py, pipeline/joins/ | SCHEMA.md, PIPELINE.md, JOINS.md | T322, T054 |
| Deploy (Cloudflare Pages, R2) | app/scripts/build-pages.mjs, app/scripts/r2/, app/wrangler.toml | app/scripts/prerender/ | SEO.md, BACKUP.md | T954, T875 |
| Build box (Hetzner, scheduled runs) | | infra/hetzner/, scripts/stays_scrape_task.ps1, run_pipeline.bat | | T992-T996, T740 |
| Tests and checks | app/tests/*.test.mjs (unit), app/tests/*.spec.mjs (browser), app/scripts/verify_*.mjs | tests/test_*.py | | |

Watch out: there are two `TripPage.jsx`. `app/src/browse/TripPage.jsx` is a ready-made library trip; `app/src/planner/finder/TripPage.jsx` is the traveller's own trip. The root `src/` is Python (`src/ingestion`, `src/estimation`), not app code.

## Pipeline

`python run_pipeline.py <task>` from the repo root; the `TASKS` list is near line 1200 of `run_pipeline.py`. The ones touched most:

| Task | Does |
|---|---|
| `fame` | fame, designations, beauty, place and traveller rating |
| `poi_significance` | POI signals, dedupe, re-tier, rating |
| `trips` | ready-made 2 to 14 day trips into public/trips |
| `dossier` | the per-place contract for the page and the PDF |
| `stays` | Booking and Hostelworld scrape into the live stays wire |
| `food` | food and drink prices per place |
| `airports` | airports in reach per place, transfer per mode |
| `trails_rate` | the 0 to 10 trail rating (end of the trails_* chain) |
| `rating_v5_profile` | nature items on the place ladder, place taste profile |
| `ask_index` | Ask Carta passages, vectors and BM25 |

Others: `beaches`, `lakes`, `mountains`, `joins`, `regions`, `crowding`, `climate_daily`, `cycling_*`, `image_audit`, `photo_sources`, `trailslab_worker`.

## App commands (in continent-app/)

| Command | Does |
|---|---|
| `npm run dev` | sync data, then the Vite dev server |
| `npm test` | node unit tests |
| `npm run test:browser` | browser specs |
| `npm run lint` | eslint on src |
| `npm run ci` | the full chain: lint, test, verify, routes, contract, build |
| `npm run build:pages` | the deploy build (needs about 1.3 GB free) |
| `npm run data:push`, `data:verify` | push the data to R2, check it there |
| fast build | see CLAUDE.md, Checks (`scripts/vite.fast.mjs`) |

## Docs to distrust

These are older plans the code has since moved past. Read the code or the latest report instead: `PRODUCT_ROADMAP.md` (marked historical), `CYCLING_RESUME.md`, `TRAILS_EXPANSION_PLAN.md`, `trails-daytrips-setup-prompts.md`, `SHARING_FRIENDS_PLAN.md`, `SHARING_FRIENDS_BUILD.md`, `CATEGORY_UI_PLAN.md`, `PRICEMAP_CHUNKS.md`, `QUALITY_UPGRADE_PLAN.md`, `HANDOFF_LLM_RUNS.md`, `FIRST_RUN_RESULT.md`, `ONBOARDING_AND_EMPTY_STATES.md`, and `docs/1.CARTA.md` (an older copy of the root `1.CARTA.md`).
