"""Feature engineering: fare snapshots -> tabular matrix for the GBDT models.

Implements the fare-prediction feature vector
    P_f = f(lead_time, route_capacity, seasonality, distance, competition,
            holiday catalysts)
with the standard encodings: advance-purchase lead time in days plus its
exponential decay exp(-lead/30), cyclical sin/cos day-of-week and day-of-year,
per-route weekly frequency (capacity proxy from the fare calendar itself),
distinct-carrier count (competition index from the out_c/ret_c tags),
Haversine great-circle distance between the airports, and public/school
holiday flags from the events collectors (src/ingestion/events/holidays.py).

Departure time-of-day is deliberately absent: out_t/ret_t only cover two
origins so far; add TOD cyclicals here once the flight-times sweep widens.
"""
import datetime as dt
import random
import zlib

import numpy as np
import pandas as pd

from .common import RAW_DIR, load_json

LEAD_DECAY_DAYS = 30.0
DEFAULT_CARRIER = "FR"   # the base harvest is Ryanair; other carriers tag their wins
SCHOOL_SPAN_CAP = 100    # days; longer "holidays" in a payload are data errors

NUMERIC_FEATURES = [
    "lead_days", "lead_decay", "dow_sin", "dow_cos", "doy_sin", "doy_cos",
    "weekly_freq", "n_carriers", "dist_km",
    "hol_anchor", "hol_origin", "hol_near", "school_hol",
]
CATEGORICAL_FEATURES = ["carrier", "dirn", "anchor_cc", "origin_cc"]


# --------------------------------------------------------------------------- #
# Holiday calendars (raw ingestion output -> per-day lookup tables)
# --------------------------------------------------------------------------- #
def _latest_raw_day(source):
    base = RAW_DIR / source
    if not base.exists():
        return None
    days = sorted(p for p in base.iterdir() if p.is_dir())
    return days[-1] if days else None


def load_holiday_calendar():
    """{'public','public_near','school'} -> DataFrame(cc, day). Empty frames
    when the events collectors have not run yet; features degrade to zeros."""
    empty = pd.DataFrame({"cc": pd.Series(dtype=str), "day": pd.Series(dtype=str)})
    out = {"public": empty, "public_near": empty, "school": empty}

    day_dir = _latest_raw_day("holidays")
    if day_dir:
        rows, near = [], []
        for path in day_dir.glob("public_holidays_*.json"):
            try:
                for h in load_json(path):
                    cc, day = h.get("countryCode"), h.get("date")
                    if not (cc and day):
                        continue
                    rows.append((cc, day))
                    d = dt.date.fromisoformat(day)
                    for off in range(-3, 4):
                        near.append((cc, (d + dt.timedelta(days=off)).isoformat()))
            except (OSError, ValueError):
                continue
        if rows:
            out["public"] = pd.DataFrame(rows, columns=["cc", "day"]).drop_duplicates()
            out["public_near"] = pd.DataFrame(near, columns=["cc", "day"]).drop_duplicates()

    day_dir = _latest_raw_day("school_holidays")
    if day_dir:
        rows = []
        for path in day_dir.glob("school_holidays_*.json"):
            cc = path.stem.rsplit("_", 1)[-1]
            try:
                for h in load_json(path):
                    s, e = h.get("startDate"), h.get("endDate")
                    if not (s and e):
                        continue
                    d0, d1 = dt.date.fromisoformat(s), dt.date.fromisoformat(e)
                    for i in range(min((d1 - d0).days + 1, SCHOOL_SPAN_CAP)):
                        rows.append((cc, (d0 + dt.timedelta(days=i)).isoformat()))
            except (OSError, ValueError):
                continue
        if rows:
            out["school"] = pd.DataFrame(rows, columns=["cc", "day"]).drop_duplicates()
    return out


# --------------------------------------------------------------------------- #
# Snapshot -> raw rows
# --------------------------------------------------------------------------- #
def _snapshot_rows(snap, max_rows=None):
    """Flatten one archived snapshot to rows, optionally random-thinned to
    ~max_rows with a seed derived from the snapshot date (reproducible)."""
    anchors = snap["anchors"]
    total = sum(len(legs.get(d) or {})
                for origins in anchors.values()
                for legs in origins.values() for d in ("out", "ret"))
    keep = 1.0 if not max_rows or total <= max_rows else max_rows / total
    rng = random.Random(zlib.crc32(snap["snapshot_date"].encode()))

    rows = []
    for anchor, origins in anchors.items():
        for origin, legs in origins.items():
            carriers = (set((legs.get("out_c") or {}).values())
                        | set((legs.get("ret_c") or {}).values()))
            n_days = len(legs.get("out") or {})
            if n_days > len(legs.get("out_c") or {}) or not carriers:
                carriers.add(DEFAULT_CARRIER)
            n_carriers = len(carriers)
            for dirn in ("out", "ret"):
                table = legs.get(dirn) or {}
                tags = legs.get(f"{dirn}_c") or {}
                freq_days = len(table)
                for day, price in table.items():
                    if keep < 1.0 and rng.random() > keep:
                        continue
                    rows.append((snap["snapshot_date"], anchor, origin, dirn, day,
                                 float(price), tags.get(day, DEFAULT_CARRIER),
                                 freq_days, n_carriers))
    return rows


def _haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dlmb = np.radians(lon2) - np.radians(lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlmb / 2) ** 2
    return 2 * 6371.0 * np.arcsin(np.sqrt(a))


def _merge_flag(df, cal, cc_col, out_col):
    if cal.empty:
        df[out_col] = np.int8(0)
        return df
    flag = cal.copy()
    flag[out_col] = np.int8(1)
    df = df.merge(flag, how="left",
                  left_on=[cc_col, "dep"], right_on=["cc", "day"])
    df[out_col] = df[out_col].fillna(0).astype("int8")
    return df.drop(columns=["cc", "day"])


# --------------------------------------------------------------------------- #
# Public: build the feature frame
# --------------------------------------------------------------------------- #
def build_frame(snapshots, airport_meta, holidays=None, max_rows=None):
    """snapshots: list of parsed snapshot dicts. Returns a DataFrame holding
    the id columns (snap, anchor, origin, dirn, dep, price) plus every
    NUMERIC_FEATURES / CATEGORICAL_FEATURES column, ready for the model."""
    holidays = holidays if holidays is not None else load_holiday_calendar()
    per_snap = max_rows // max(len(snapshots), 1) if max_rows else None

    rows = []
    windows = {}
    for snap in snapshots:
        rows.extend(_snapshot_rows(snap, per_snap))
        win = snap.get("window") or [None, None]
        windows[snap["snapshot_date"]] = win
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=["snap", "anchor", "origin", "dirn", "dep",
                                     "price", "carrier", "freq_days", "n_carriers"])
    snap_d = pd.to_datetime(df["snap"])
    dep_d = pd.to_datetime(df["dep"])
    df["lead_days"] = (dep_d - snap_d).dt.days.astype("int32")
    df = df[df["lead_days"] >= 0].copy()
    dep_d = dep_d[df.index]

    df["lead_decay"] = np.exp(-df["lead_days"] / LEAD_DECAY_DAYS).astype("float32")
    dow = dep_d.dt.dayofweek.to_numpy()
    doy = dep_d.dt.dayofyear.to_numpy()
    df["dow_sin"] = np.sin(2 * np.pi * dow / 7).astype("float32")
    df["dow_cos"] = np.cos(2 * np.pi * dow / 7).astype("float32")
    df["doy_sin"] = np.sin(2 * np.pi * doy / 365.25).astype("float32")
    df["doy_cos"] = np.cos(2 * np.pi * doy / 365.25).astype("float32")

    # capacity proxy: bookable days per week on the route in this snapshot
    win_days = {}
    for s, (w0, w1) in windows.items():
        try:
            span = (dt.date.fromisoformat(w1) - dt.date.fromisoformat(w0)).days
        except (TypeError, ValueError):
            span = 150
        win_days[s] = max(span, 7)
    weeks = df["snap"].map(win_days) / 7.0
    df["weekly_freq"] = (df["freq_days"] / weeks).astype("float32")

    iso2 = {code: (m.get("iso2") or "UN") for code, m in airport_meta.items()}
    lat = {code: m.get("lat") for code, m in airport_meta.items()}
    lon = {code: m.get("lon") for code, m in airport_meta.items()}
    df["anchor_cc"] = df["anchor"].map(iso2).fillna("UN")
    df["origin_cc"] = df["origin"].map(iso2).fillna("UN")
    a_lat = df["anchor"].map(lat).astype(float)
    a_lon = df["anchor"].map(lon).astype(float)
    o_lat = df["origin"].map(lat).astype(float)
    o_lon = df["origin"].map(lon).astype(float)
    dist = _haversine_km(a_lat, a_lon, o_lat, o_lon)
    df["dist_km"] = dist.fillna(-1.0).astype("float32")

    df = _merge_flag(df, holidays["public"], "anchor_cc", "hol_anchor")
    df = _merge_flag(df, holidays["public"], "origin_cc", "hol_origin")
    df = _merge_flag(df, holidays["public_near"], "anchor_cc", "hol_near")
    school = _merge_flag(df[["anchor_cc", "dep"]].copy(), holidays["school"],
                         "anchor_cc", "s_a")["s_a"]
    school_o = _merge_flag(df[["origin_cc", "dep"]].copy(), holidays["school"],
                           "origin_cc", "s_o")["s_o"]
    df["school_hol"] = ((school.to_numpy() | school_o.to_numpy())).astype("int8")

    for col in CATEGORICAL_FEATURES:
        df[col] = df[col].astype("category")
    return df.drop(columns=["freq_days"]).reset_index(drop=True)


def route_key(df):
    return df["anchor"].astype(str) + "|" + df["origin"].astype(str) + "|" + df["dirn"].astype(str)
