"""Quantile GBDT fare models: train on the snapshot history, export estimates.

    python -m src.estimation.model train [--force]
    python -m src.estimation.model estimate

Four HistGradientBoostingRegressor models on log1p(price): a squared-error
point estimator plus pinball-loss models at the 10th/50th/90th percentiles,
so every estimate ships with an uncertainty band instead of a bare number
(the role LightGBM + quantile TFT outputs play in the reference
architecture, sized to this stack - sklearn is already a dependency and the
inference target is a weekly batch export, not a live microservice).

High-cardinality route ids are target-encoded (smoothed mean log price,
fitted on the training split only); country/carrier/direction are native
categorical splits. Evaluation is out-of-time - the newest snapshot is the
test set once history has >= 3 refreshes - reporting MAPE (the concept-drift
metric drift.py re-checks weekly) and q10..q90 interval coverage.

`estimate` fills the sparse fare calendar: for every route in the latest
snapshot it predicts all departure days to the window end and exports
route x month quantile summaries to data/models/fare_estimates.json.gz.
Nothing downstream consumes that file automatically yet; it is the reviewed
artifact a future UI "typical price" layer would read.

Training baselines (feature deciles, category mixes, a price sample) are
stored in the artifact for drift.py's PSI/KS comparison.
"""
import argparse
import datetime as dt
import gzip
import json
import sys
import zlib

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from . import features as F
from .common import (ESTIMATES_PATH, METRICS_PATH, MODEL_PATH, MODELS_DIR,
                     dump_json, load_airport_meta, latest_snapshot_path,
                     read_snapshot, snapshot_paths)

MAX_ROWS = 1_200_000
SNAPSHOT_LIMIT = 26          # ~ half a year of weekly history
TE_SMOOTHING = 20.0
QUANTILES = (0.10, 0.50, 0.90)
PRICE_SAMPLE = 5000
PREDICT_CHUNK = 250_000
MIN_ROUTE_FARES = 3          # routes thinner than this are too noisy to estimate


def _hash_split(df, test_frac=0.2):
    keys = (df["anchor"].astype(str) + df["origin"].astype(str) + df["dep"].astype(str))
    h = keys.map(lambda s: zlib.crc32(s.encode()) % 1000)
    return h >= int(test_frac * 1000), h < int(test_frac * 1000)


def _fit_route_te(train_df, y):
    grp = y.groupby(F.route_key(train_df))
    global_mean = float(y.mean())
    te = ((grp.sum() + TE_SMOOTHING * global_mean)
          / (grp.count() + TE_SMOOTHING))
    return te.to_dict(), global_mean


def _apply_route_te(df, te, global_mean):
    return F.route_key(df).map(te).fillna(global_mean).astype("float32")


def _matrix(df, categories):
    X = df[F.NUMERIC_FEATURES + ["route_te"] + F.CATEGORICAL_FEATURES].copy()
    for col, cats in categories.items():
        X[col] = pd.Categorical(df[col].astype(str), categories=cats)
    return X


def _baseline(df, categories):
    """Reference distributions for drift.py: decile edges + expected bin
    proportions per numeric feature, category mixes, and a price sample."""
    base = {"numeric": {}, "categorical": {}, "rows": int(len(df))}
    for col in F.NUMERIC_FEATURES + ["route_te"]:
        vals = df[col].to_numpy(dtype=float)
        edges = np.unique(np.quantile(vals, np.linspace(0, 1, 11)))
        if len(edges) < 3:      # near-constant feature (e.g. all-zero flags)
            base["numeric"][col] = None
            continue
        counts, _ = np.histogram(vals, bins=edges)
        base["numeric"][col] = {"edges": edges.tolist(),
                                "props": (counts / counts.sum()).tolist()}
    for col, cats in categories.items():
        props = df[col].astype(str).value_counts(normalize=True)
        base["categorical"][col] = {c: float(props.get(c, 0.0)) for c in cats}
    rng = np.random.RandomState(7)
    sample = df["price"].to_numpy()
    if len(sample) > PRICE_SAMPLE:
        sample = rng.choice(sample, PRICE_SAMPLE, replace=False)
    base["price_sample"] = np.sort(sample).tolist()
    return base


def train(force=False):
    paths = snapshot_paths()[-SNAPSHOT_LIMIT:]
    if not paths:
        print("no fare snapshots yet - run `python -m src.estimation.snapshot` first")
        return 1
    if MODEL_PATH.exists() and not force:
        print("model exists; retraining anyway (weekly cadence keeps it on the "
              "trailing window)")

    snaps = [read_snapshot(p) for p in paths]
    airport_meta = load_airport_meta()
    print(f"building features from {len(snaps)} snapshot(s) "
          f"({paths[0].name} .. {paths[-1].name})")
    df = F.build_frame(snaps, airport_meta, max_rows=MAX_ROWS)
    if df.empty:
        print("feature frame is empty")
        return 1

    snap_dates = sorted(df["snap"].unique())
    if len(snap_dates) >= 3:
        test_mask = df["snap"] == snap_dates[-1]
        train_mask = ~test_mask
        split = f"out-of-time (test = {snap_dates[-1]})"
    else:
        train_mask, test_mask = _hash_split(df)
        split = "hashed 80/20 (out-of-time once history >= 3 snapshots)"

    y = np.log1p(df["price"])
    te, te_global = _fit_route_te(df[train_mask], y[train_mask])
    df["route_te"] = _apply_route_te(df, te, te_global)

    categories = {col: sorted(df[col].astype(str).unique())
                  for col in F.CATEGORICAL_FEATURES}
    X_train = _matrix(df[train_mask], categories)
    X_test = _matrix(df[test_mask], categories)
    y_train, y_test = y[train_mask.to_numpy()], y[test_mask.to_numpy()]
    print(f"train {len(X_train)} rows / test {len(X_test)} rows, split: {split}")

    common = dict(categorical_features="from_dtype", max_iter=300,
                  learning_rate=0.08, min_samples_leaf=40,
                  early_stopping=True, random_state=7)
    models = {"point": HistGradientBoostingRegressor(loss="squared_error", **common)}
    for q in QUANTILES:
        models[f"q{int(q * 100)}"] = HistGradientBoostingRegressor(
            loss="quantile", quantile=q, **common)
    for name, m in models.items():
        m.fit(X_train, y_train)
        print(f"  fitted {name} ({m.n_iter_} iters)")

    metrics = {"split": split, "rows_train": int(len(X_train)),
               "rows_test": int(len(X_test)), "snapshots": [p.name for p in paths]}
    if len(X_test):
        actual = np.expm1(y_test.to_numpy())
        pred = np.expm1(models["point"].predict(X_test))
        ape = np.abs(pred - actual) / np.maximum(actual, 1.0)
        lo = np.expm1(models["q10"].predict(X_test))
        hi = np.expm1(models["q90"].predict(X_test))
        metrics.update(
            mape_test=float(ape.mean()), medape_test=float(np.median(ape)),
            interval_coverage_q10_q90=float(((actual >= lo) & (actual <= hi)).mean()),
        )
        print(f"  MAPE {metrics['mape_test']:.1%}  medAPE {metrics['medape_test']:.1%}  "
              f"q10-q90 coverage {metrics['interval_coverage_q10_q90']:.1%}")

    artifact = {
        "models": models,
        "features": {"numeric": F.NUMERIC_FEATURES, "categorical": F.CATEGORICAL_FEATURES,
                     "categories": categories, "route_te": te, "te_global": te_global},
        "baseline": _baseline(df[train_mask], categories),
        "trained_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "metrics": metrics,
    }
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, MODEL_PATH, compress=3)
    dump_json(METRICS_PATH, {"trained_at": artifact["trained_at"], **metrics})
    print(f"saved {MODEL_PATH.name} + {METRICS_PATH.name}")
    return 0


# --------------------------------------------------------------------------- #
# Estimate export
# --------------------------------------------------------------------------- #
def _grid_frame(snap, airport_meta, artifact):
    """Feature rows for EVERY departure day to the window end, for every
    route observed in the snapshot (fills the gaps between bookable days)."""
    snap_date = dt.date.fromisoformat(snap["snapshot_date"])
    w1 = None
    if snap.get("window") and snap["window"][1]:
        try:
            w1 = dt.date.fromisoformat(snap["window"][1])
        except ValueError:
            w1 = None
    if w1 is None:
        all_days = [d for o in snap["anchors"].values()
                    for legs in o.values() for k in ("out", "ret")
                    for d in (legs.get(k) or {})]
        w1 = dt.date.fromisoformat(max(all_days)) if all_days else snap_date
    days = [(snap_date + dt.timedelta(days=i)).isoformat()
            for i in range((w1 - snap_date).days + 1)]

    synth = {}
    stats = {}
    for anchor, origins in snap["anchors"].items():
        synth[anchor] = {}
        for origin, legs in origins.items():
            entry = {}
            for dirn in ("out", "ret"):
                table = legs.get(dirn) or {}
                if len(table) < MIN_ROUTE_FARES:
                    continue
                tags = legs.get(f"{dirn}_c") or {}
                dom = (pd.Series(list(tags.values())).mode().iat[0]
                       if len(tags) >= len(table) and tags else F.DEFAULT_CARRIER)
                entry[dirn] = {d: 1.0 for d in days}
                entry[f"{dirn}_c"] = {d: dom for d in days}
                stats[(anchor, origin, dirn)] = (len(table), len(
                    set(tags.values()) | ({F.DEFAULT_CARRIER}
                                          if len(table) > len(tags) else set())))
            if entry:
                synth[anchor][origin] = entry

    grid = F.build_frame([{"snapshot_date": snap["snapshot_date"],
                           "window": snap.get("window"), "anchors": synth}],
                         airport_meta)
    if grid.empty:
        return grid
    # capacity/competition must reflect what was OBSERVED, not the dense grid
    key = list(zip(grid["anchor"], grid["origin"], grid["dirn"]))
    win_weeks = max(((w1 - snap_date).days), 7) / 7.0
    grid["weekly_freq"] = np.array(
        [stats.get(k, (0, 1))[0] for k in key], dtype="float32") / win_weeks
    grid["n_carriers"] = np.array(
        [stats.get(k, (0, 1))[1] for k in key], dtype="int64")
    feats = artifact["features"]
    grid["route_te"] = _apply_route_te(grid, feats["route_te"], feats["te_global"])
    return grid


def estimate():
    if not MODEL_PATH.exists():
        print("no trained model - run `python -m src.estimation.model train`")
        return 1
    latest = latest_snapshot_path()
    if latest is None:
        print("no fare snapshots - run `python -m src.estimation.snapshot`")
        return 1
    artifact = joblib.load(MODEL_PATH)
    snap = read_snapshot(latest)
    grid = _grid_frame(snap, load_airport_meta(), artifact)
    if grid.empty:
        print("no routes thick enough to estimate")
        return 1
    print(f"predicting {len(grid)} route-days "
          f"({grid[['anchor', 'origin', 'dirn']].drop_duplicates().shape[0]} routes)")

    cats = artifact["features"]["categories"]
    preds = {}
    for name in ("q10", "q50", "q90"):
        model = artifact["models"][name]
        out = np.empty(len(grid))
        for i in range(0, len(grid), PREDICT_CHUNK):
            chunk = _matrix(grid.iloc[i:i + PREDICT_CHUNK], cats)
            out[i:i + PREDICT_CHUNK] = model.predict(chunk)
        preds[name] = np.expm1(out)

    grid = grid[["anchor", "origin", "dirn", "dep"]].copy()
    for name, vals in preds.items():
        grid[name] = vals
    grid["month"] = grid["dep"].str.slice(0, 7)

    tree = {}
    for (anchor, origin, dirn, month), g in grid.groupby(
            ["anchor", "origin", "dirn", "month"], sort=True, observed=True):
        q50 = g["q50"].to_numpy()
        best = int(q50.argmin())
        tree.setdefault(anchor, {}).setdefault(origin, {}).setdefault(dirn, {})[month] = [
            int(round(float(np.median(g["q10"])))),
            int(round(float(np.median(q50)))),
            int(round(float(np.median(g["q90"])))),
            int(round(float(q50[best]))),
            g["dep"].iat[best],
        ]

    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "snapshot_date": snap["snapshot_date"],
        "trained_at": artifact["trained_at"],
        "format": "estimates[anchor][origin][out|ret][YYYY-MM] = "
                  "[p10, p50, p90, cheapest_p50, cheapest_day] (EUR, month medians)",
        "estimates": tree,
    }
    ESTIMATES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(ESTIMATES_PATH, "wt", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {ESTIMATES_PATH.name}: {len(tree)} anchors")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m src.estimation.model")
    ap.add_argument("cmd", choices=["train", "estimate"])
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args(argv)
    return train(args.force) if args.cmd == "train" else estimate()


if __name__ == "__main__":
    sys.exit(main())
