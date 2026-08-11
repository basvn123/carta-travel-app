"""Fare estimation layer: snapshot -> features -> quantile GBDT -> drift.

Turns the weekly live fare harvest into a predictive yield model:

  snapshot.py   schema-gates the shipped fare wire files (dead-letter
                quarantine for anomalous payloads) and archives a compact
                gzip snapshot per refresh, building the (lead time, price)
                escalation history the model trains on
  features.py   tabular feature matrix: advance-purchase lead time + decay,
                cyclical day-of-week/day-of-year encodings, route capacity
                and competition proxies, Haversine distance, holiday flags
  model.py      gradient-boosted point + q10/q50/q90 quantile fare models,
                out-of-time evaluation (MAPE), route-month estimate export
  drift.py      PSI + KS input drift and MAPE concept drift against the
                training baseline; exit code tells run_pipeline to retrain

Everything runs headless via `python -m src.estimation.<module>` and is
scheduled by run_pipeline.py (fare_history + fare_model tasks).
"""
