# Fare estimation + automated data architecture

How the repo implements the "Automated Architectural Framework for Accurate
Flight Estimation, Dynamic Route Tracking, and Event-Driven Yield
Forecasting" blueprint, sized to this stack (local Windows box, weekly batch
cadence, static-wire app) instead of a cloud microservice fleet. Every
functional domain of the blueprint has a concrete counterpart here:

| Blueprint domain | Implementation | Where |
| --- | --- | --- |
| Static + realtime transit ingestion (NAPs, GTFS/NeTEx, GTFS-RT, SIRI, ADS-B) | 26-collector raw mirror with per-day manifests, polite HTTP, credential SKIPs | `src/ingestion/` -> `data/raw/` |
| Historical yield labels | Weekly fare snapshot archive + community LCC price-history mirrors + Renfe/SNCF pricing archives | `src/estimation/snapshot.py`, `src/ingestion/pricing/` |
| Exogenous demand catalysts | Public + school holiday calendars (Nager.Date, OpenHolidays; the free subset of what PredictHQ sells) | `src/ingestion/events/holidays.py` |
| Feature engineering (lead time + decay, cyclical encodings, capacity, competition, distance) | Tabular feature builder over the snapshot history | `src/estimation/features.py` |
| Non-linear temporal modeling (GBDT point + quantile forecasts) | sklearn HistGradientBoosting: point + q10/q50/q90 on log price, target-encoded routes, out-of-time MAPE | `src/estimation/model.py` |
| MLOps: drift detection, retraining, schema gate | PSI + KS + MAPE gates -> drift-triggered retrain; dead-letter quarantine for anomalous fare payloads | `src/estimation/drift.py`, `snapshot.py`, `run_pipeline.py` |
| Orchestration (the blueprint's Airflow DAGs) | Cadence-tiered `run_pipeline.py`, driven weekly by the `TravelAppFareRefresh` Scheduled Task -> `run_pipeline.bat` | repo root |

## The weekly loop

Every Monday 09:00 the Scheduled Task runs `run_pipeline.bat`, and the
orchestrator executes whatever is due:

1. `fares` + `wizz_fares` + `vueling_fares` + `volotea_fares` re-fetch the
   live carrier calendars and merge cheapest-wins into
   `continent-app/public/fares/` (this is the data the app actually ships).
2. `fare_history` schema-gates those wire files and archives the merged
   snapshot to `data/history/fares/<date>.json.gz`. Structurally anomalous
   payloads are copied to `data/deadletter/<date>/` with the reason and kept
   out of the training history; the previously trained model stays in use.
3. `fare_model` runs the drift check (below), retrains when told to (or when
   the artifact is >30 days old), and exports fresh route-month price bands.
4. `ingestion` refreshes the raw open-data mirror (schedules, realtime,
   ADS-B, ferries, pricing archives); `demand_events` (monthly) refreshes the
   holiday calendars.

Steps 2-4 are `soft` tasks: a failure there is logged loudly and retried next
run but can never block the fare refresh + app build. The pipeline's existing
guards (single-writer lock, master backup, coverage-guarded patches) are
unchanged.

Because the live harvest overwrites the wire files in place each week, the
history archive is what turns "one price per route-day" into the
(lead time, price) escalation curves the model needs: after N weekly
refreshes every route-day has up to N observations at different advance
purchase lead times.

## Features

One row per (snapshot, anchor, origin, direction, departure day, price):

- `lead_days` advance-purchase lead time, plus `lead_decay = exp(-lead/30)`
- `dow_sin/cos`, `doy_sin/cos` cyclical day-of-week and day-of-year encodings
- `weekly_freq` bookable days per week on the route (capacity proxy from the
  fare calendar itself)
- `n_carriers` distinct carriers on the route (competition index from the
  `out_c`/`ret_c` merge tags; base harvest = Ryanair)
- `dist_km` Haversine great-circle distance between the two airports
- `hol_anchor`, `hol_origin`, `hol_near` (+-3 days), `school_hol` from the
  holiday calendars, matched on the airports' countries
- `route_te` smoothed target encoding of the anchor|origin|direction route
  (fitted on the training split only); `carrier`, `direction` and the two
  country codes as native categorical splits

Departure time-of-day is deliberately absent: `out_t`/`ret_t` only cover two
origins so far. Add TOD cyclicals to `features.py` when the flight-times
sweep widens.

## Model + estimates

Four `HistGradientBoostingRegressor` models on `log1p(price)`: a
squared-error point estimator plus pinball-loss models at the 10th/50th/90th
percentiles, so every estimate carries an uncertainty band. Evaluation is
out-of-time (newest snapshot = test set once history has >= 3 refreshes) and
reports MAPE, median APE and q10-q90 interval coverage
(`data/models/fare_model_metrics.json`).

`estimate` predicts every departure day to the window end for every observed
route and exports month-level summaries to
`data/models/fare_estimates.json.gz`:

    estimates[anchor][origin][out|ret]["YYYY-MM"] =
        [p10, p50, p90, cheapest_p50, cheapest_day]   (EUR, month medians)

Nothing in the app consumes this file automatically yet; it is the artifact
a "typical price for this month" UI layer would read, and it fills the gaps
in the sparse fare calendar.

## Drift gates (weekly, before any retrain)

| Check | Threshold | Action |
| --- | --- | --- |
| PSI per feature vs training deciles | `0.10 <= PSI < 0.25` | minor: logged in the report, no retrain |
| PSI per feature, or KS test on the price distribution | `PSI >= 0.25` or `p < 0.05` | major data drift: retrain on the trailing snapshot window |
| Point-model MAPE on the newest snapshot | `> max(25%, 1.5x test MAPE)` | concept drift: retrain |
| Schema gate on fare payloads | structural anomaly | dead-letter the file, keep the cached model |

Full report: `logs/drift_report.json`. Even drift-free, the model retrains
once the artifact is older than 30 days, so it always reflects the trailing
window.

## Commands

```
python -m src.ingestion.run_all --list         collector roster (+ needed keys)
python -m src.ingestion.run_all --check        HEAD-probe the static endpoints
python -m src.ingestion.run_all --only holidays,school_holidays
python -m src.estimation.snapshot              schema-gate + archive today's fares
python -m src.estimation.model train           fit point + quantile models
python -m src.estimation.drift                 PSI/KS/MAPE report (exit 3 = retrain)
python -m src.estimation.model estimate        export route-month price bands
python run_pipeline.py --list                  what the automation will do, when
```

## Deliberately out of scope (and why)

- **Live route-graph mutation (GTFS-RT/SIRI -> PostGIS)**: the realtime feeds
  are mirrored raw (`sncf_realtime`, Entur SIRI snapshots) but the app's
  transport engine stays static; a batch-shipped static wire cannot surface
  minute-level delays, so mutating a live graph would have no consumer.
- **Feast/Redis/ONNX/FastAPI serving**: inference here is a weekly batch
  export, not an online microservice; the joblib artifact + gzip JSON export
  fill those roles at this scale.
- **Temporal Fusion Transformers**: the quantile requirement TFT serves is
  covered by the pinball-loss GBDTs; revisit only if multi-year history and
  a GPU materialise.
- **PredictHQ**: commercial. Its scheduled non-attendance layer (public +
  school holidays) is implemented from free sources; concerts/sports impact
  scoring would need a paid key and can slot in as extra `events` collectors
  plus features later.
