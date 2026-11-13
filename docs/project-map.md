# Project map

Where everything in Carta lives and how the parts work together. Find the part, open the files named, stop. Keep this true: update it in the same change that moves, adds or removes a part. `scripts/docs/check_entry_points.py` fails CI when a path here does not exist.

_Last updated: 2026-11-13_

## In one paragraph
Carta is a Europe trip planner for independent travellers. A Python data pipeline at the repo root (`run_pipeline.py`, `pipeline/`) harvests, rates and prices places, trails, beaches, lakes, mountains, stays and flights, and writes versioned "wire" JSON into `continent-app/public/`. The Vite + React app in `continent-app/` reads that wire, adds live prices and AI (Gemini, through Supabase Edge Functions and Cloudflare Pages Functions), and ships to Cloudflare Pages with the data on R2. A Hetzner box runs the scheduled pipeline and scrapes.

## The big picture

```
cache/, app_data/, data/  ->  run_pipeline.py + pipeline/  ->  continent-app/public/ (wire, schema 20)
                                                                   |
Supabase (auth, trips, Edge Functions: plan-day, parse-booking)  <-+->  continent-app/src (React app)
Cloudflare Pages Functions (ask, flights) + Workers (flight-sweep)  ->  Cloudflare Pages + R2 (deploy)
Hetzner box (infra/hetzner/): scheduled pipeline, stays scrape, backups (ops/)
```

## Parts

| Part | Where | What it does | Talks to |
|---|---|---|---|
| App | `continent-app/src/` | React screens: browse, planner, auth, pass, together, admin, 6 languages | wire in `continent-app/public/`, Supabase, Pages Functions |
| App shell | `continent-app/src/App.jsx`, `continent-app/src/shell/` | overlays, lazy screens, openers, settings | every screen |
| Pages Functions, Workers | `continent-app/functions/`, `continent-app/workers/` | `api/ask.js`, `api/flights.js`, flight sweep | Gemini, Aviasales, R2 |
| App tooling | `continent-app/scripts/` | data sync, deploy build, R2 push, CI gates (`ci/`), evals (`eval/`), browser checks (`verify_*.mjs`) | `continent-app/public/`, R2 |
| App config | `continent-app/config/` | pricing, rating, AI models, quotas (keys listed in `docs/reference/config.md`) | app and pipeline |
| Pipeline | `run_pipeline.py`, `pipeline/` | tasks in `pipeline/tasks/<domain>.py`, joined in `pipeline/tasks/__init__.py` | `cache/`, `app_data/`, `data/`, `continent-app/public/` |
| Ingestion and fare model | `src/ingestion/`, `src/estimation/` | Python (not app code): transport collectors, licence registry, ground fare model | pipeline |
| Trips dataset | `Trips/carta-unified/carta-unified/`, `pipeline/journeys/` | curated trips, validators, trip wire | prompts, journeys wire |
| Backend | `supabase/functions/`, `supabase/migrations/` | plan-day, parse-booking, checkout, stripe-webhook, notify and more; Postgres schema with RLS | Gemini, Stripe |
| Services | `services/intelligence/`, `services/mcp/` | FastAPI Intelligence API, read-only MCP server | wire data |
| Prompts and evals | `prompts/`, `evals/`, `continent-app/scripts/eval/` | versioned prompt registry, offline evals (`node scripts/eval/run.mjs` in the app) | AI functions |
| Repo tooling | `scripts/` | ship, worktrees, docs checks (`docs/`), quality gate (`quality/`), validation, coverage, blog, monitor | CI, docs |
| Build box | `infra/hetzner/`, `ops/` | provisioning, systemd timers, jobs; backups and restore drills | R2, Supabase |
| Local tools | `tools/` | trailslab, brouter, reachability, benchmark (hours to rebuild: never delete) | trails pipeline |
| Data inputs | `cache/`, `app_data/`, `data/`, `reports/` | harvest caches, master data, curation and overrides, frozen rating calibration | pipeline |
| Blog content | `content/blog/` | drafts and data for the data blog | `scripts/blog/`, app blog build |
| Tests | `tests/` (pytest), `continent-app/tests/` (`*.test.mjs` unit, `*.spec.mjs` browser) | unit, contract, browser | CI |
| CI | `.github/workflows/` | `ci.yml` on every push plus path-triggered gates (contract, design lint, RLS, licences, evals) | everything |
| Static analysis and scanning | `.semgrep/` (rules, baseline), `.semgrepignore`, `.zap/rules.tsv` | Semgrep and OWASP ZAP gates (`docs/security/static-analysis.md`) | `.github/workflows/` |
| Design surface config | `.impeccable/design.json` | settings the impeccable design skill reads | `.claude/skills/impeccable/` |
| Python dependencies | `requirements.txt`, `requirements-ml.txt`, `requirements-docs.txt`, `constraints.txt` | pipeline, ML extras, docs site; versions pinned by the constraints file | CI, the box |
| Docs site | `mkdocs.yml`, `docs/assets/ask-docs/` | MkDocs site over `docs/` with "Ask the docs" search (built in CI; deploy is an owner step) | `docs/` |
| Local state (not in git) | `logs/`, `cache/`, `.work/` run folders | Task Scheduler runners and pipeline state, harvest caches, crew working files | pipeline, sessions |
| Claude config | `.claude/skills/carta-design/`, `.claude/skills/impeccable/`, `.claude/protected-paths.txt`, `.claude/launch.json` | design skill, protected files, dev-server launch | sessions |

## Product areas

App paths start with `app/`, meaning `continent-app/`. The Handbook column names the part of `docs/HANDBOOK.md` that explains the rules and numbers: grep it, never read it whole.

| Area | App code | Pipeline / backend | Handbook |
|---|---|---|---|
| Home | app/src/browse/home/HomePage.jsx, app/src/browse/home/HomeHero.jsx, app/src/lib/homeVisit.js | | Discover |
| Explore (map, cards, filters, rails) | app/src/browse/ExploreTab.jsx, app/src/browse/explore/, app/src/browse/DestinationsTab.jsx, app/src/browse/destinations/, app/src/browse/ExploreMap.jsx, app/src/browse/ExploreCards.jsx, app/src/browse/ExploreRails.jsx | pipeline/explore_overlay.py, pipeline/guided_search_layer.py | Discover |
| Place page and PDF | app/src/browse/DestinationPage.jsx, app/src/browse/PlaceOverview.jsx, app/src/lib/dossier.js, app/src/lib/destinationPdf.js | pipeline/dossier/build_dossier.py, pipeline/place_layer.py | Discover |
| Trip library, journeys, trip finder | app/src/browse/JourneyPage.jsx, app/src/browse/TripPage.jsx (a library trip), app/src/lib/journeys.js, app/src/lib/trips.js, app/src/planner/finder/TripsForYou.jsx, app/src/planner/finder/FoundTripPage.jsx (one found trip) | pipeline/trips/, pipeline/journeys/build_wire.py | Planning |
| Travel styles (named ways of travelling, header door on every tab) | app/src/lib/travelStyles.js, app/src/hooks/useTravelStyles.js, app/src/browse/TravelStylesSheet.jsx, app/src/components/StyleDoor.jsx, app/src/planner/flow/styleSeed.js | | Planning |
| Plan flow and wizard | app/src/planner/flow/PlanFlow.jsx, app/src/planner/flow/PlanHome.jsx, app/src/planner/wizard/, app/src/planner/GuidedTripWizard.jsx | | Planning |
| Trip page (the traveller's planned trip) | app/src/planner/TripPlannerTab.jsx, app/src/planner/TripSummary.jsx, app/src/planner/trip/ | | Planning |
| Day planner and plan-day AI | app/src/planner/DayPlannerTab.jsx, app/src/planner/days/, app/src/planner/aiDayPlan.js, app/src/planner/dayPlanStore.js | supabase/functions/plan-day/, supabase/functions/suggest-city/ | Planning |
| My trips, account, together | app/src/auth/mytrips/, app/src/auth/account/, app/src/together/TogetherPage.jsx, app/src/auth/tripStorage.js | supabase/migrations/ | Platform |
| Pass, paywall, Stripe | app/src/pass/PricingPage.jsx, app/src/components/PassModal.jsx, app/src/hooks/usePaywall.jsx, app/src/lib/pricing.js | supabase/functions/checkout/, supabase/functions/stripe-webhook/; owner steps docs/owner/stripe.md | Platform |
| Ask Carta (chat, RAG) | app/src/browse/ask/AskChat.jsx, app/src/lib/ask/, app/functions/api/ask.js | pipeline/ask_index_layer.py, app/scripts/build-ask-bm25.mjs | Platform |
| AI gateway, prompts and models | app/functions/_lib/prompts.js, app/src/lib/aiCalls.js, app/src/components/admin/AiCalls.jsx, app/config/ai_models.json | supabase/functions/_shared/aiModels.mjs, supabase/functions/_shared/aiGuard.mjs, pipeline/ai_gateway.py, prompts/, docs/ai/model-strategy.md | Platform ("Prompt registry") |
| Travel intelligence (taxonomy, taste, linking, API, MCP) | app/src/lib/taste/, app/src/auth/mytrips/TasteChips.jsx, app/src/lib/linking/ | pipeline/taxonomy/, services/intelligence/, services/mcp/, docs/ai/taxonomy.md | Platform |
| Price engine (bed, food, trip total) | app/src/lib/price/, app/config/pricing.json, app/src/lib/stayPrice.js, app/src/browse/DestFood.jsx | pipeline/pricing_config.py, pipeline/apply_food_prices.py | Prices |
| Flights, fares, airports | app/src/lib/flights/, app/src/components/FlightSheet.jsx, app/functions/api/flights.js, app/workers/flight-sweep/ | pipeline/flights/build_routes.py, pipeline/airport_access.py | Prices |
| Stays (Booking, Hostelworld scrape) | app/src/lib/staysData.js, app/src/planner/wizard/StepStays.jsx | pipeline/stays/box_stays.py, pipeline/stays/scrape_booking.py, pipeline/stays/scrape_hostelworld.py; owner steps docs/owner/stays-box.md | Prices |
| Ratings and For you | app/src/lib/rating.js, app/config/rating.json, app/src/browse/RatingSheet.jsx, app/src/lib/recommend/rank.js | pipeline/rating_layer.py, pipeline/rating_config.py, pipeline/place_taste_profile.py, reports/rating_reference_v5.json (frozen) | Scores |
| Trails, cycling, routes | app/src/browse/TrailPage.jsx, app/src/browse/CyclePage.jsx, app/src/lib/trails.js, app/src/lib/cycling.js | pipeline/trails/, pipeline/cycling/, tools/trailslab/ | Outdoors |
| Beaches, lakes, mountains | app/src/browse/BeachPage.jsx, app/src/browse/LakePage.jsx, app/src/browse/MountainPage.jsx, app/src/browse/OutdoorParts.jsx | pipeline/beaches/, pipeline/lakes/, pipeline/mountains/, pipeline/outdoor/derive_outdoor_pages.py; docs/LAKES.md | Outdoors |
| Climate, crowds, seasons | app/src/browse/ClimateStrip.jsx, app/src/lib/crowdMonth.js, app/src/lib/when.js | pipeline/apply_climate.py, pipeline/harvest_tourism_density.py, pipeline/harvest_uk_crowds.py, pipeline/harvest_sea_temp.py | Scores |
| Regions, countries, coverage | app/src/browse/RegionPage.jsx, app/src/browse/CountryPage.jsx, app/src/lib/regions.js | pipeline/regions/ (coverage.py, coverage_gate.py), pipeline/intake/; docs/REGIONS.md | Discover |
| Images and photos | app/src/components/HeroImage.jsx, app/src/lib/imageLadder.js, app/src/browse/PhotoGallery.jsx | pipeline/photos/, pipeline/images/ | Outdoors |
| Languages (6) | app/src/i18n/index.jsx and en, de, fr, es, it, nl .js (grep, never read whole), app/scripts/i18n/ | | Platform |
| Admin, moderation, telemetry | app/src/admin/AdminPage.jsx, app/src/components/admin/, app/src/admin/dataHealth.json, app/src/admin/pipelineOverrides.json, app/src/auth/moderation.js, app/src/lib/launchEvents.js | supabase/migrations/ | Platform |
| Data wire (pipeline to app) | app/scripts/sync-data.mjs, app/src/lib/appData.js, app/src/lib/bootIndex.js | run_pipeline.py, pipeline/pipeline_io.py, pipeline/joins/; docs/SCHEMA.md, docs/wire.schema.json | Platform |
| Data quality, provenance, overrides | app/src/lib/provenance.js | scripts/quality/engine.py, scripts/quality/rules.yaml, scripts/quality/scorecard.py, pipeline/provenance.py, pipeline/config/sources.yaml, pipeline/apply_overrides.py, data/overrides/, pipeline/catalogue_gaps.py, scripts/coverage/coverage_parity.py, evals/truth/ | Platform |
| Deploy (Cloudflare Pages, R2) | app/scripts/build-pages.mjs, app/scripts/r2/, app/wrangler.toml, app/scripts/prerender/ | scripts/ship.mjs | Platform; docs/runbooks/deploy.md |
| Build box (Hetzner, scheduled runs) | | infra/hetzner/, ops/, scripts/stays_scrape_task.ps1, run_pipeline.bat | Platform; docs/runbooks/build-box.md |
| Licences and data credits | app/src/data/attribution.js | src/ingestion/core/registry.py, docs/tos/data_licenses.md (generated) | Platform |

Watch out:
- `app/src/browse/TripPage.jsx` is a ready-made library trip; `app/src/planner/finder/FoundTripPage.jsx` is one found trip; the traveller's own planned trip is `app/src/planner/TripPlannerTab.jsx` with `app/src/planner/TripSummary.jsx`.
- The root `src/` is Python, not app code.
- `Trips/carta-unified/carta-unified/` is nested twice on purpose: four workflows and the trip tests use that path.
- `pipeline/archive/` is live (`pack.py`, `push.py` back up the box); it is not old code.

## How a typical change flows
1. A pipeline task (`python run_pipeline.py <task>`) reads `cache/`, `app_data/` and `data/`, and writes a layer.
2. The wire build writes versioned JSON into `continent-app/public/`; `docs/SCHEMA.md` and `docs/wire.schema.json` are the contract, pinned by `continent-app/scripts/ci/contract.mjs`.
3. `npm run dev` syncs the data (`continent-app/scripts/sync-data.mjs`) and the app hydrates it (`continent-app/src/lib/appData.js`).
4. A deploy (`node scripts/ship.mjs`, owner only) builds Pages, pushes the data to R2 first, then the site.

Pipeline tasks touched most: `fame`, `poi_significance`, `trips`, `dossier`, `stays`, `food`, `airports`, `trails_rate`, `rating_v5_profile`, `ask_index`. Others: `beaches`, `lakes`, `mountains`, `joins`, `regions`, `crowding`, `climate_daily`, `cycling_*`, `image_audit`, `photo_sources`, `trailslab_worker`. Full list: `docs/reference/tasks.md` (generated).

## Data
- Wire format: `docs/SCHEMA.md` (schema version 20, set in each layer's writer).
- Where each wire field comes from: `docs/architecture/lineage.md` (generated by `scripts/docs/build_lineage.py`); request paths in `docs/architecture/request-paths.md`.
- Sources and licences: `docs/data/sources.md`, `docs/tos/data_licenses.md` (both generated).
- Hand notes per data layer: `docs/data/`.

## Configuration and secrets
- Every config key and its readers: `docs/reference/config.md` (generated by `scripts/docs/config_reference.py`).
- Secret names and where they are set: `docs/security/SECRETS.md`. Template: `.env.example`. Never commit values.

## Docs: what to read for what
| I want to know… | Read |
|---|---|
| how a feature works (rules, formulas, thresholds) | `docs/HANDBOOK.md`, grep the feature |
| who Carta is for, voice, banned words | `PRODUCT.md` |
| design tokens and components | `DESIGN.md` (grep), the carta-design skill |
| what is planned and its status | `ROADMAP.md` (grep the item ID, for example `D24`) |
| a business rule with its constant and test | `docs/logic/` (checked by `scripts/docs/drift.py`) |
| AI models, prompts, model cards | `docs/ai/` |
| how to run or recover something | `docs/runbooks/` |
| security posture | `docs/security/` |
| generated API, task and config reference | `docs/reference/` (never hand-edit) |
| what only the owner can do next | `docs/owner/README.md` |
| why the project works this way | `docs/decisions/` |
| mistakes not to repeat | `docs/lessons.md` |
| what every past task did | `.work/INDEX.md` |
| Carta words | `docs/glossary.md` |

Files that code reads by path (never move or rename): `docs/HANDBOOK.md` (its headings too), `docs/SCHEMA.md`, `docs/wire.schema.json`, `docs/REGIONS.md`, `docs/LAKES.md`, `docs/tos/data_licenses.md`, `docs/legal/ARTICLE30.md`, `docs/data/`, `docs/architecture/`, `docs/reference/`, `docs/logic/`, `docs/marketing/journalist-list-template.csv`, `docs/brand/data-stories/data/basket_2027.json`. The whole `docs/` tree is also the corpus of the "Ask the docs" eval (`continent-app/scripts/eval/ask-docs/set.json`).

## Where to add things
| I want to add… | Put it in… | Follow the example of… |
|---|---|---|
| a screen | `continent-app/src/browse/` or `continent-app/src/planner/` | `continent-app/src/browse/LakePage.jsx` |
| shared app logic | `continent-app/src/lib/` | `continent-app/src/lib/when.js` |
| a pipeline task | `pipeline/tasks/<domain>.py` | `pipeline/tasks/outdoor.py` |
| a wire field | the layer writer, then `docs/SCHEMA.md`, `docs/wire.schema.json` | the schema contract workflow `.github/workflows/schema-contract.yml` |
| an Edge Function | `supabase/functions/<name>/` | `supabase/functions/plan-day/` |
| a migration | `supabase/migrations/` with a down migration | the newest file there |
| a CI gate | `.github/workflows/` | `.github/workflows/entry-points.yml` |
| a business rule doc | `docs/logic/` | `docs/logic/price.md` |
| an owner-only step | `docs/owner/<system>.md` | `docs/owner/stripe.md` |

## Work history and open items
- Every task since T001 has one line in `.work/INDEX.md`. Old reports (T001 to T1222) are in git: `git show archive/execution-2026-11-11:"Execution/P15/<file>"` (tag on commit `2a2379d44e`). See `docs/decisions/0002-run-history-in-work-index.md`.
- A reference written `archive/execution-2026-11-11:archive/docs-2026-11/TRAILS.md` (tag, colon, path) is a file in git history: open it with `git show` and that reference. The root `archive/` and `Execution/` folders were retired that way on 2026-11-11.
- New work runs in `.work/<date>-<slug>/`; only `report.md` and `INDEX.md` are committed.
- Owner-only steps: `docs/owner/`. Engineering follow-ups: the matching item in `ROADMAP.md`. See `docs/decisions/0003-open-items-owner-steps-and-roadmap.md`.

## Related docs
- Decisions: `docs/decisions/`
- Lessons: `docs/lessons.md`
- Run history: `.work/INDEX.md`
