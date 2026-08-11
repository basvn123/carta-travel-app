# Carta, Europe Travel App

Find affordable European getaways by **total trip cost** (real Ryanair fares +
Airbnb-based stays + on-the-ground spend), then plan the trip city by city and
day by day. 1,570 destinations across 43 European countries (master schema v15,
see [SCHEMA.md](SCHEMA.md)).

## Repository layout

```
├── continent-app/          The React app (Vite). See continent-app/README.md
│   ├── src/
│   │   ├── components/     Shared UI (buttons, dropdowns, flags, CountryIntel, …)
│   │   ├── browse/         Map-tab browse experience (FilterBar, ResultsList,
│   │   │                   DetailPanel, Compare/Lifestyle/BestTime panels)
│   │   ├── map/            MapLibre views (MapView, TripMap, CountryPickerMap)
│   │   ├── planner/        Trip planner + Day planner + Guided wizard
│   │   ├── hooks/          Data/search/planner state hooks
│   │   ├── i18n/           6-language UI strings
│   │   ├── lib/            Pure logic: pricing, transport options, cost
│   │   │                   optimizer, dates, routing, data loading
│   │   └── auth/           Optional Supabase accounts (saved trips/plans)
│   ├── scripts/sync-data.mjs   Splits the master dataset for the wire (see below)
│   └── public/             app_data.json + activities_full.json + fares/ +
│                           country_insights.json (all generated; do not edit)
│
├── app_data/               MASTER datasets (source of truth for the app)
│   ├── app_data.json           1,570 destinations, schema v15 (gitignored,
│   │                           rebuilt by the pipeline; see SCHEMA.md)
│   └── country_insights.json   Deep per-country travel intel, 43 countries
│
├── run_pipeline.py         THE pipeline entry point: cadence-aware orchestrator
│                           (weekly fares, monthly fame/rating, quarterly
│                           open-data, manual backfills). `--list` shows tasks.
├── run_pipeline.bat        Windows Scheduled Task wrapper (task:
│                           TravelAppFareRefresh, Mon 09:00)
│
├── src/                    Python packages (run as modules from the repo root)
│   ├── ingestion/          26-collector raw open-data mirror -> data/raw/
│   │                       (NAP schedule feeds, GTFS-RT/SIRI, OpenSky ADS-B,
│   │                       ferries, pricing archives, holiday calendars)
│   └── estimation/         Fare model: snapshot history, quantile GBDT,
│                           PSI/KS drift gates. See ESTIMATION.md
│
├── pipeline/               All live data-pipeline code (run from the repo root)
│   ├── harvest_*.py            Fetch external sources -> cache/ and/or master
│   │                           (Ryanair fares, Wikipedia, Inside Airbnb,
│   │                           Overture POIs, Eurostat, EEA, WorldClim, …)
│   ├── apply_*.py              Idempotent patchers: fold a cache/layer into the
│   │                           master (beauty, rating, climate, lodging, tolls…)
│   ├── enrich_*.py             Additive POI image/description enrichment sweeps
│   ├── *_layer.py, *_io.py     Shared engines/libs imported by the above
│   └── oneoff/                 Historical one-time backfills + catalogue
│                               curation scripts (kept for provenance/reuse)
│
├── archive/                Superseded code kept for reference (legacy fares
│   │                       path, pre-Overture/pre-WorldClim harvesters)
│   └── notebooks/          The original v1 notebook pipeline (schema v7 era)
│
├── cache/                  Harvest caches (LFS-tracked; secrets gitignored)
├── logs/                   Pipeline logs + run state (gitignored)
└── supabase/               SQL schema + migrations (RLS on every table)
```

## Data pipeline

One command drives everything:

```
python run_pipeline.py           # run every task that is due (safe to re-run)
python run_pipeline.py --list    # show tasks, cadences, last run
python run_pipeline.py --only fares --ship data   # force one task, sync only
```

The orchestrator backs up the master before every write, refuses to run two
writers at once, and coverage-guards the patch steps that could null data.
Individual scripts in `pipeline/` can still be run by hand **from the repo
root** (e.g. `python pipeline/audit_gaps.py`).

The legacy fare refresher (`reharvest_flights.py` + `refresh_fares*.bat`) is in
`archive/` - the live fare system is `pipeline/harvest_all_origins.py`, driven
by the weekly `fares` task, which ships `continent-app/public/fares/`. The
`TravelAppFareRefresh` Scheduled Task (Mon 09:00) runs `run_pipeline.bat`, so
the whole cadence model fires unattended.

The same orchestrator drives the trails content lab (`trails_ingest`,
`trails_elevation`, `trails_validate`, `trails_popularity`), which stages into
the local PostGIS lab rather than the master and so never blocks the ship. Its
validation task also demotes published trips whose quality regressed, back to
`needs_review` and never further - see [tools/trailslab/README.md](tools/trailslab/README.md).

On top of the fare refresh sits an automated estimation layer (weekly
snapshot history -> quantile GBDT fare model -> PSI/KS drift-gated
retraining) plus a raw open-data ingestion mirror - see
[ESTIMATION.md](ESTIMATION.md).

## Data flow

1. The pipeline writes `app_data/app_data.json` (master, everything inline).
2. `continent-app/scripts/sync-data.mjs` (runs on `npm run dev/build/data`)
   splits it for the wire:
   - `public/app_data.json`, core dataset, heavy fields stripped
   - `public/activities_full.json`, full POI lists, lazy-fetched by the Day
     planner only
   - `public/country_insights.json`, copied verbatim, lazy-fetched when
     country intel is shown
3. The app fetches the core file at boot (kicked off at module-eval time) and
   the other two on demand.

## Country insights

`app_data/country_insights.json` is curated + web-verified (July 2026). To
update a country, edit that file and rerun `npm run data` in continent-app.
Volatile facts to re-check periodically: vignette prices, tourist taxes/fees
(e.g. Venice access fee, UK ETA), currency changes (Bulgaria → EUR in 2026).
