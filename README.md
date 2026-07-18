# Carta, Europe Travel App

Find affordable European getaways by **total trip cost** (real Ryanair fares +
Airbnb-based stays + on-the-ground spend), then plan the trip city by city and
day by day. 447 destinations across 43 European countries.

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
│   │   ├── lib/            Pure logic: pricing, transport options, cost
│   │   │                   optimizer, dates, routing, data loading
│   │   └── auth/           Optional Supabase accounts (saved trips/plans)
│   ├── scripts/sync-data.mjs   Splits the master dataset for the wire (see below)
│   └── public/             app_data.json + activities_full.json +
│                           country_insights.json (all generated; do not edit)
│
├── app_data/               MASTER datasets (source of truth for the app)
│   ├── app_data.json           447 destinations, schema v11 (see SCHEMA.md)
│   └── country_insights.json   Deep per-country travel intel, 43 countries:
│                               rail/bus operators + booking links, driving
│                               rules (vignettes/tolls/left-side), must-sees,
│                               traveler warnings, budgets, food, events
│
├── 0*.ipynb                Pipeline notebooks (config → destinations → flights
│                           → costs → accommodation → combined → export)
├── destinations_master.py  Hand-curated catalogue (airports + hidden gems)
├── harvest_*.py            Data harvesters (Ryanair fares, Wikipedia images,
│                           OpenTripMap/Wikivoyage activities)
├── beauty_layer.py         Beauty index (UNESCO / Blue Flag / nature / iconic)
├── car_layer.py            Car cost model (per-country fuel, rentals, tolls)
├── apply_*.py / fix_data.py  Idempotent patchers that write into app_data/
├── refresh_fares.bat       Scheduled fare refresh (reharvest_flights.py)
├── cache/                  Harvest caches (gitignored where sensitive)
└── supabase/               SQL schema + migrations (RLS on every table)
```

## Data flow

1. Python pipeline writes `app_data/app_data.json` (master, everything inline).
2. `continent-app/scripts/sync-data.mjs` (runs on `npm run dev/build`) splits it
   for the wire:
   - `public/app_data.json`, core dataset (~1.5 MB), heavy fields stripped
   - `public/activities_full.json`, full POI lists (~1.5 MB), lazy-fetched by
     the Day planner only
   - `public/country_insights.json`, copied verbatim, lazy-fetched when
     country intel is shown
3. The app fetches the core file at boot (kicked off at module-eval time) and
   the other two on demand.

## Country insights

`app_data/country_insights.json` is curated + web-verified (July 2026). To
update a country, edit that file and rerun `npm run data` in continent-app.
Volatile facts to re-check periodically: vignette prices, tourist taxes/fees
(e.g. Venice access fee, UK ETA), currency changes (Bulgaria → EUR in 2026).
