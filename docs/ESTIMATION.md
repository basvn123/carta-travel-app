# Ground fare estimation + data architecture

How the repo turns collected open data into the ground fare estimates the app
shows, sized to this stack (local Windows box, batch cadence, static-wire app).

Flights are no longer estimated here (T511, 2026-10-21). The flight fare model
(snapshot archive, feature builder, GBDT point and quantile models, drift
gates, the `e_out`/`e_ret` month bands) and the carrier harvests that fed it
were removed with the old fare logic. Flight prices now come from Google
Flights through the `flight-sweep` Worker and the `/api/flights` endpoint
(T513 to T515); see `docs/PIPELINE.md`, "Flights", and `docs/SCHEMA.md`,
"Flight prices". They are Google Flights' figures, not Carta estimates, so
they carry no tilde. The per-airline bag fees the app adds
(`continent-app/src/lib/flights/bagFees.js`) are Carta's estimates and do
carry the tilde and "est.".

| Domain | Implementation | Where |
| --- | --- | --- |
| Static + realtime transit ingestion (NAPs, GTFS/NeTEx, GTFS-RT, SIRI, ADS-B) | Collector raw mirror with per-day manifests, polite HTTP, credential SKIPs | `src/ingestion/` -> `data/raw/` |
| Ground pricing archives | Renfe/SNCF pricing archives | `src/ingestion/pricing/` |
| Exogenous demand catalysts | Public + school holiday calendars (Nager.Date, OpenHolidays) | `src/ingestion/events/holidays.py` |
| Ground per-km fare model (price-per-km per mode per country, calibrated on collected samples) | Robust per-country base + per-km fits from the raw pricing archives, contract C artifact for the app's ground fare resolver | `src/estimation/ground_calibration.py` -> `data/derived/ground_fare_calibration.json` |
| Orchestration | Cadence-tiered `run_pipeline.py`: `ingestion` (weekly), `demand_events` (monthly) | repo root |

## Ground fare calibration (contract C)

`python -m src.estimation.ground_calibration` replaces the blueprint's dated
ground-transport priors (10.7 ct/km for German coaches, 2018; 0.10 to 0.20
EUR/km rail from mixed-vintage studies) with per-country fits from pricing
data the ingestion layer already collects. Output:
`data/derived/ground_fare_calibration.json`,

    { "meta": { "generated_at": iso, "samples": {...} },
      "countries": { "<ISO2>": { "train|bus|ferry":
          { "base_eur": float, "per_km_eur": float, "n": int } } } }

consumed by `continent-app/src/lib/groundFares.js`. Any (country, mode) cell
absent from the artifact falls back to the curated priors in
`countryTransport.js`; the calibrator therefore only emits cells it can
defend and stays silent everywhere else.

Method per cell: raw priced rows reduce to one "from" fare per (origin,
destination, service day), the minimum across trains, classes and fare
buckets, matching the app's cheapest-wins fare semantics. Each OD pair
collapses to (distance, median daily minimum), with distance = great-circle
between city centres x 1.3 (no routed distances exist in the raw data).
The line price = base + per_km x km is fit with the Theil-Sen estimator
(median of pairwise slopes) so a single odd corridor cannot bend it; a
slightly negative intercept is clamped to zero with the slope refit as the
median price/km. Gates: at least 30 daily-minimum observations AND 5
distinct OD pairs per cell, per-km within 0.02 to 0.40 EUR, base within 0
to 30 EUR. Anything gated out is logged in `meta.samples.rejects` and not
emitted. `n` per cell is the daily-minimum count behind the fit;
`meta.samples` also records per-source usability, pair counts, the
observation date range and unmatched city names.

Usable-data inventory (2026-08-05): of everything collected, only the Renfe
Kaggle archive (`data/raw/renfe_kaggle/`, thegurus 2019-2020 ticket prices)
carries prices attached to OD pairs, so the artifact currently calibrates
ES train alone. TGV MAX (`sncf_availability`) has ODs and times but no
price column (occupancy proxy only); the Flix GTFS and every national GTFS
mirror (DE, NL, SE, NO) ship schedules without fare files; the Nordic ferry
sources are an operator index without fares. FR rail, DE bus and all ferry
cells therefore stay on priors until a source with prices lands (Ferryhopper
sampling, an Omio partner feed, or LCC-style ground crawls). The ES fit is
2019-2020 vintage promo-fare data; `meta.samples` records the date range so
consumers can judge freshness.

## Commands

```
python -m src.ingestion.run_all --list         collector roster (+ needed keys)
python -m src.ingestion.run_all --check        HEAD-probe the static endpoints
python -m src.ingestion.run_all --only holidays,school_holidays
python -m src.estimation.ground_calibration    fit contract C ground per-km cells
python -m src.estimation.ground_calibration --inventory   what raw pricing data is usable
python run_pipeline.py --list                  what the automation will do, when
```

## Deliberately out of scope (and why)

- **Live route-graph mutation (GTFS-RT/SIRI -> PostGIS)**: the realtime feeds
  are mirrored raw (`sncf_realtime`, Entur SIRI snapshots) but the app's
  transport engine stays static; a batch-shipped static wire cannot surface
  minute-level delays, so mutating a live graph would have no consumer.
- **Feast/Redis/ONNX/FastAPI serving**: the ground calibration is a batch
  export read as static JSON; no online model service is needed at this scale.
- **PredictHQ**: commercial. Its scheduled non-attendance layer (public +
  school holidays) is implemented from free sources; concerts/sports impact
  scoring would need a paid key and can slot in as extra `events` collectors
  later.
