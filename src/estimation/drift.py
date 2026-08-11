"""Statistical drift monitoring: live fares vs the model's training baseline.

    python -m src.estimation.drift

Exit codes drive the run_pipeline fare_model task:
    0  no drift (or minor: logged, no action)
    2  no model / no snapshots yet -> train first
    3  major data drift or concept drift -> retrain recommended

Thresholds follow the reference MLOps table:
    PSI  in [0.10, 0.25)      minor data drift  -> log a warning
    PSI  >= 0.25 or KS p<0.05 major data drift  -> retrain on trailing window
    MAPE > max(25%, 1.5x the model's test MAPE)  concept drift -> retrain

PSI (Population Stability Index) compares each feature's current decile mix
against the proportions stored at training time; the two-sample KS test
compares the live price distribution against the training price sample. The
full report lands in logs/drift_report.json.
"""
import datetime as dt
import sys

import joblib
import numpy as np

from . import features as F
from .common import (DRIFT_REPORT, MODEL_PATH, dump_json, load_airport_meta,
                     latest_snapshot_path, read_snapshot)
from .model import _apply_route_te, _matrix

PSI_MINOR = 0.10
PSI_MAJOR = 0.25
KS_ALPHA = 0.05
MAPE_FLOOR = 0.25
MAX_ROWS = 500_000
EPS = 1e-4


def _psi(expected, actual):
    e = np.clip(np.asarray(expected, dtype=float), EPS, None)
    a = np.clip(np.asarray(actual, dtype=float), EPS, None)
    e, a = e / e.sum(), a / a.sum()
    return float(np.sum((a - e) * np.log(a / e)))


def _numeric_psi(baseline, values):
    edges = np.asarray(baseline["edges"], dtype=float)
    edges[0], edges[-1] = -np.inf, np.inf   # count out-of-range values too
    counts, _ = np.histogram(values, bins=edges)
    return _psi(baseline["props"], counts)


def _categorical_psi(baseline, series):
    props = series.astype(str).value_counts(normalize=True)
    cats = list(baseline)
    expected = [baseline[c] for c in cats] + [EPS]
    actual = [float(props.get(c, 0.0)) for c in cats]
    actual.append(max(0.0, 1.0 - sum(actual)))   # categories unseen in training
    return _psi(expected, actual)


def _ks(sample_a, sample_b):
    try:
        from scipy.stats import ks_2samp
        res = ks_2samp(sample_a, sample_b)
        return float(res.statistic), float(res.pvalue)
    except ImportError:
        a, b = np.sort(sample_a), np.sort(sample_b)
        grid = np.concatenate([a, b])
        cdf_a = np.searchsorted(a, grid, side="right") / len(a)
        cdf_b = np.searchsorted(b, grid, side="right") / len(b)
        stat = float(np.max(np.abs(cdf_a - cdf_b)))
        n = len(a) * len(b) / (len(a) + len(b))
        p = float(min(1.0, 2.0 * np.exp(-2.0 * n * stat * stat)))
        return stat, p


def main():
    if not MODEL_PATH.exists():
        print("no trained model yet -> train")
        return 2
    latest = latest_snapshot_path()
    if latest is None:
        print("no fare snapshots yet -> snapshot + train")
        return 2

    artifact = joblib.load(MODEL_PATH)
    snap = read_snapshot(latest)
    df = F.build_frame([snap], load_airport_meta(), max_rows=MAX_ROWS)
    if df.empty:
        print("latest snapshot produced no rows")
        return 2
    feats = artifact["features"]
    df["route_te"] = _apply_route_te(df, feats["route_te"], feats["te_global"])
    baseline = artifact["baseline"]

    psi = {}
    for col, base in baseline["numeric"].items():
        if base is None:
            continue
        psi[col] = round(_numeric_psi(base, df[col].to_numpy(dtype=float)), 4)
    for col, base in baseline["categorical"].items():
        psi[col] = round(_categorical_psi(base, df[col]), 4)
    worst = max(psi, key=psi.get)
    max_psi = psi[worst]

    rng = np.random.RandomState(11)
    cur = df["price"].to_numpy()
    if len(cur) > len(baseline["price_sample"]):
        cur = rng.choice(cur, len(baseline["price_sample"]), replace=False)
    ks_stat, ks_p = _ks(np.asarray(baseline["price_sample"]), cur)

    actual = df["price"].to_numpy()
    pred = np.expm1(artifact["models"]["point"].predict(
        _matrix(df, feats["categories"])))
    mape_now = float(np.mean(np.abs(pred - actual) / np.maximum(actual, 1.0)))
    mape_test = artifact["metrics"].get("mape_test")
    mape_threshold = max(MAPE_FLOOR, 1.5 * mape_test) if mape_test else MAPE_FLOOR

    major = max_psi >= PSI_MAJOR or ks_p < KS_ALPHA
    concept = mape_now > mape_threshold
    minor = PSI_MINOR <= max_psi < PSI_MAJOR
    verdict = ("concept" if concept else "major" if major
               else "minor" if minor else "ok")
    action = ("retrain" if (major or concept) else
              "warn" if minor else "none")

    report = {
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "snapshot_date": snap["snapshot_date"], "rows": int(len(df)),
        "model_trained_at": artifact["trained_at"],
        "psi": psi, "max_psi": max_psi, "worst_feature": worst,
        "ks": {"stat": round(ks_stat, 4), "p": ks_p},
        "mape": {"now": round(mape_now, 4), "threshold": round(mape_threshold, 4),
                 "at_training": mape_test},
        "verdict": verdict, "action": action,
    }
    dump_json(DRIFT_REPORT, report)
    print(f"drift: verdict={verdict}  max PSI={max_psi} ({worst})  "
          f"KS p={ks_p:.2g}  MAPE now={mape_now:.1%} (threshold {mape_threshold:.1%})")
    print(f"report -> {DRIFT_REPORT}")
    return 3 if action == "retrain" else 0


if __name__ == "__main__":
    sys.exit(main())
