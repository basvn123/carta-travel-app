"""Ground fare per-km calibration from collected raw data (contract C).

    python -m src.estimation.ground_calibration              # inventory + fit + write
    python -m src.estimation.ground_calibration --inventory  # report usable data, write nothing
    python -m src.estimation.ground_calibration --dry-run    # fit + table, write nothing

Replaces the blueprint's dated per-km priors (10.7 ct/km DE bus from 2018,
0.10-0.20 EUR/km rail from mixed-vintage studies) with numbers calibrated
from pricing data the ingestion layer already collects, wherever that data
actually carries prices. The output is the contract C artifact

    data/derived/ground_fare_calibration.json
    { "meta": {"generated_at": iso, "samples": {...}},
      "countries": { "<ISO2>": { "<mode>": {"base_eur": f, "per_km_eur": f, "n": i} } } }

consumed by continent-app/src/lib/groundFares.js: any (country, mode) cell
absent here falls back to the curated priors in countryTransport.js, so this
module only emits cells it can defend and stays silent everywhere else.

Method, per (country, mode) cell:

1. Reduce raw priced rows to one "from" fare per (origin, destination,
   service day): the MINIMUM price across trains, classes and fare buckets
   that day. This mirrors the app's cheapest-wins fare semantics; a median
   over all sold tickets would calibrate the average basket, not the
   "from EUR X" figure the map shows.
2. Collapse each OD pair to (distance_km, median of its daily minima).
   Distance is great-circle between city centres times 1.3 (the standard
   detour factor, same constant as transport.js and car_layer.py); no routed
   distances exist in the raw data.
3. Robust line fit price = base_eur + per_km_eur * km over the OD points
   with the Theil-Sen estimator (median of pairwise slopes), so one weird
   corridor cannot bend the fit. A slightly negative intercept is clamped to
   zero and the slope refit as the median of y/x.
4. Gates, in order, each logged when it fires:
   - MIN_OBS (30) daily-minimum observations and MIN_PAIRS (5) distinct OD
     pairs, else the cell is not emitted at all (a slope through fewer
     distances is a guess, and consumers have priors);
   - fits outside PER_KM_BOUNDS (0.02 to 0.40 EUR/km) or BASE_BOUNDS
     (0 to 30 EUR) are rejected and logged, cell not emitted.

`n` in each cell is the number of daily-minimum observations behind the
fit; meta.samples carries the full per-source inventory, per-cell pair
counts, observation date range and every reject.
"""
import argparse
import datetime as dt
import io
import json
import math
import sys
import unicodedata
import zipfile
from pathlib import Path

from .common import DATA, RAW_DIR, dump_json

OUT_PATH = DATA / "derived" / "ground_fare_calibration.json"

GC_DETOUR = 1.3          # great-circle -> ground km, matches transport.js
MIN_OBS = 30             # daily-minimum observations per cell
MIN_PAIRS = 5            # distinct OD pairs per cell (need distance spread)
MIN_KM = 50.0            # under this, base fare + centroid noise dominate
MAX_PRICE_EUR = 500.0    # obvious outlier guard on single tickets
PER_KM_BOUNDS = (0.02, 0.40)
BASE_BOUNDS = (0.0, 30.0)

# City centres for the OD names the Renfe archive uses. Lookups go through
# _fold() (upper-case + strip accents: the raw data mixes MALAGA and MALAGA
# with the accent, and uses the Valencian CASTELLO). Unmatched names are
# reported, never guessed.
ES_CITIES = {
    "MADRID": (40.4168, -3.7038), "BARCELONA": (41.3874, 2.1686),
    "SEVILLA": (37.3891, -5.9845), "VALENCIA": (39.4699, -0.3763),
    "PONFERRADA": (42.5461, -6.5962), "GRANADA": (37.1773, -3.5986),
    "MALAGA": (36.7213, -4.4214), "CORDOBA": (37.8882, -4.7794),
    "ALICANTE": (38.3452, -0.4810), "ZARAGOZA": (41.6488, -0.8891),
    "TOLEDO": (39.8628, -4.0273), "CIUDAD REAL": (38.9848, -3.9274),
    "ALBACETE": (38.9943, -1.8585), "CUENCA": (40.0704, -2.1374),
    "GUADALAJARA": (40.6337, -3.1674), "HUESCA": (42.1401, -0.4089),
    "TARRAGONA": (41.1189, 1.2445), "GIRONA": (41.9794, 2.8214),
    "LLEIDA": (41.6176, 0.6200), "PAMPLONA": (42.8125, -1.6458),
    "LOGRONO": (42.4627, -2.4449), "VALLADOLID": (41.6523, -4.7245),
    "SALAMANCA": (40.9701, -5.6635), "ZAMORA": (41.5034, -5.7467),
    "SEGOVIA": (40.9429, -4.1088), "PALENCIA": (42.0095, -4.5284),
    "BURGOS": (42.3439, -3.6969), "VITORIA": (42.8467, -2.6716),
    "SAN SEBASTIAN": (43.3183, -1.9812), "BILBAO": (43.2630, -2.9350),
    "SANTANDER": (43.4623, -3.8100), "GIJON": (43.5322, -5.6611),
    "OVIEDO": (43.3619, -5.8494), "LEON": (42.5987, -5.5671),
    "LUGO": (43.0121, -7.5560), "OURENSE": (42.3358, -7.8639),
    "A CORUNA": (43.3623, -8.4115), "CORUNA": (43.3623, -8.4115),
    "SANTIAGO DE COMPOSTELA": (42.8782, -8.5448), "SANTIAGO": (42.8782, -8.5448),
    "PONTEVEDRA": (42.4310, -8.6444), "VIGO": (42.2406, -8.7207),
    "CADIZ": (36.5271, -6.2886), "JEREZ DE LA FRONTERA": (36.6850, -6.1261),
    "HUELVA": (37.2614, -6.9447), "JAEN": (37.7796, -3.7849),
    "ALMERIA": (36.8340, -2.4637), "MURCIA": (37.9922, -1.1307),
    "CARTAGENA": (37.6257, -0.9966), "CASTELLON": (39.9864, -0.0513),
    "CASTELLO": (39.9864, -0.0513),
    "PUERTOLLANO": (38.6871, -4.1076), "TALAVERA DE LA REINA": (39.9634, -4.8305),
    "MERIDA": (38.9161, -6.3437), "BADAJOZ": (38.8794, -6.9707),
    "CACERES": (39.4753, -6.3724), "PLASENCIA": (40.0300, -6.0883),
    "AVILA": (40.6565, -4.6818), "SORIA": (41.7636, -2.4649),
    "TERUEL": (40.3440, -1.1069), "CALATAYUD": (41.3535, -1.6432),
    "FIGUERES": (42.2662, 2.9622), "GANDIA": (38.9680, -0.1819),
}


def _fold(name):
    """Upper-case + strip combining accents, so CORDOBA with or without the
    accent hits the same city entry."""
    s = unicodedata.normalize("NFD", name.strip().upper())
    return "".join(c for c in s if not unicodedata.combining(c))


def haversine_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def _latest(pattern):
    hits = sorted(RAW_DIR.glob(pattern))
    return hits[-1] if hits else None


# --------------------------------------------------------------------------- #
# Inventory: what raw data carries a price attached to an OD pair?
# --------------------------------------------------------------------------- #
def inventory():
    """One row per collected pricing-relevant source: does it carry usable
    (origin, destination, price) rows, and for which (country, mode)?"""
    rows = []

    def probe(name, path, cell, usable, note):
        rows.append({
            "source": name,
            "on_disk": path is not None,
            "cell": cell,
            "usable": usable and path is not None,
            "note": note if path is not None else "not collected yet: " + note,
        })

    probe("renfe_kaggle", _latest("renfe_kaggle/*/spanish-high-speed-rail-system-ticket-pricing.zip"),
          "ES train", True,
          "thegurus Renfe archive: real ticket prices per OD city pair, "
          "fare bucket and class (2019-2020 vintage)")
    probe("sncf_availability", _latest("sncf_availability/*/tgvmax_sample_100.json"),
          "FR train", False,
          "TGV MAX 30-day seat availability: OD + times, NO price column "
          "(occupancy proxy only)")
    probe("flixbus_gtfs", _latest("flixbus_gtfs/*/gtfs_generic_eu.zip"),
          "EU bus", False,
          "Flix GTFS carries no fare_attributes/fare_rules/fare_products "
          "(confirmed against the archive)")
    probe("germany gtfs.de", _latest("germany/*/gtfsde_full.zip"),
          "DE train+bus", False, "schedules only, no fare files")
    probe("netherlands OVapi", _latest("netherlands/*/gtfs-nl.zip"),
          "NL train+bus", False, "schedules only, no fare files")
    probe("sweden Trafiklab", _latest("sweden/*/gtfs_sweden3.zip"),
          "SE train+bus", False, "schedules only, no fare files")
    probe("norway Entur", _latest("norway/*/rb_norway-aggregated-gtfs.zip"),
          "NO train+bus+ferry", False, "schedules only, no fare files")
    probe("nordic_ferries", _latest("nordic_ferries/*/entur_operators_page.html"),
          "Nordic ferry", False,
          "operator index + SL regional GTFS, no fares; Ferryhopper "
          "sampling not collected (commercial terms unconfirmed)")
    probe("ryanair_archive", _latest("ryanair_archive/*/manifest.jsonl"),
          "flights", False,
          "LCC scraper code repos, flights anyway: out of scope for ground")

    return rows


def print_inventory(rows):
    print("usable-data inventory (price attached to an OD pair):")
    for r in rows:
        flag = "USABLE" if r["usable"] else ("absent" if not r["on_disk"] else "no prices")
        print(f"  [{flag:>9}] {r['source']:<22} {r['cell']:<18} {r['note']}")


# --------------------------------------------------------------------------- #
# ES train: the Renfe Kaggle archive
# --------------------------------------------------------------------------- #
def collect_renfe(zip_path, chunk_rows=2_000_000):
    """Stream the 7.8GB CSV, reduce to daily-minimum fares per OD pair.

    Returns (od_stats, report): od_stats maps (origin, destination) to a
    dict with the pair's daily minima; report carries row counts, unmatched
    city names and the observation date range.
    """
    import pandas as pd

    daily_min = {}                      # (org, dst, day) -> min price
    raw_rows = 0
    priced_rows = 0
    date_lo, date_hi = "9999-99-99", "0000-00-00"

    with zipfile.ZipFile(zip_path) as zf:
        name = next(i.filename for i in zf.infolist() if i.filename.endswith(".csv"))
        with zf.open(name) as fh:
            reader = pd.read_csv(
                io.TextIOWrapper(fh, encoding="utf-8", errors="replace"),
                usecols=["origin", "destination", "departure", "price"],
                dtype={"origin": "string", "destination": "string",
                       "departure": "string"},
                chunksize=chunk_rows, low_memory=True)
            for chunk in reader:
                raw_rows += len(chunk)
                chunk["price"] = pd.to_numeric(chunk["price"], errors="coerce")
                chunk = chunk.dropna(subset=["price", "origin", "destination",
                                             "departure"])
                chunk = chunk[(chunk["price"] > 0) & (chunk["price"] <= MAX_PRICE_EUR)]
                priced_rows += len(chunk)
                if not len(chunk):
                    continue
                chunk["day"] = chunk["departure"].str.slice(0, 10)
                grp = chunk.groupby(["origin", "destination", "day"],
                                    observed=True)["price"].min()
                for key, price in grp.items():
                    prev = daily_min.get(key)
                    if prev is None or price < prev:
                        daily_min[key] = float(price)
                print(f"    ..{raw_rows:,} rows scanned, "
                      f"{len(daily_min):,} OD-day minima", flush=True)

    od_stats = {}
    unmatched = {}
    for (org, dst, day), price in daily_min.items():
        if day < date_lo:
            date_lo = day
        if day > date_hi:
            date_hi = day
        a, b = ES_CITIES.get(_fold(org)), ES_CITIES.get(_fold(dst))
        if a is None or b is None:
            miss = org if a is None else dst
            unmatched[miss] = unmatched.get(miss, 0) + 1
            continue
        km = haversine_km(a, b) * GC_DETOUR
        if km < MIN_KM:
            continue
        s = od_stats.setdefault((org, dst), {"km": km, "mins": []})
        s["mins"].append(price)

    report = {
        "raw_rows": raw_rows, "priced_rows": priced_rows,
        "od_day_minima": len(daily_min), "pairs": len(od_stats),
        "date_range": [date_lo, date_hi],
        "unmatched_cities": dict(sorted(unmatched.items(), key=lambda x: -x[1])),
    }
    return od_stats, report


# --------------------------------------------------------------------------- #
# Robust fit
# --------------------------------------------------------------------------- #
def median(vals):
    vals = sorted(vals)
    n = len(vals)
    return vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2


def theil_sen(points):
    """(slope, intercept) via median of pairwise slopes; points = [(x, y)]."""
    slopes = []
    for i in range(len(points)):
        x1, y1 = points[i]
        for j in range(i + 1, len(points)):
            x2, y2 = points[j]
            if abs(x2 - x1) > 1e-9:
                slopes.append((y2 - y1) / (x2 - x1))
    if not slopes:
        return None, None
    slope = median(slopes)
    intercept = median([y - slope * x for x, y in points])
    return slope, intercept


def fit_cell(od_stats, rejects, label):
    """Contract C cell from per-pair aggregates, or None with the reason
    appended to rejects."""
    points = [(s["km"], median(s["mins"])) for s in od_stats.values()]
    n_obs = sum(len(s["mins"]) for s in od_stats.values())

    if n_obs < MIN_OBS or len(points) < MIN_PAIRS:
        rejects.append({"cell": label, "reason": "below minimum samples",
                        "n_obs": n_obs, "pairs": len(points),
                        "min_obs": MIN_OBS, "min_pairs": MIN_PAIRS})
        return None

    per_km, base = theil_sen(points)
    if per_km is None:
        rejects.append({"cell": label, "reason": "degenerate distances"})
        return None
    if base < 0:
        # promo pricing on long corridors can pull the intercept slightly
        # under zero; a negative boarding fee is not a thing, so pin it
        base = 0.0
        per_km = median([y / x for x, y in points])

    if not (PER_KM_BOUNDS[0] <= per_km <= PER_KM_BOUNDS[1]) or \
       not (BASE_BOUNDS[0] <= base <= BASE_BOUNDS[1]):
        rejects.append({"cell": label, "reason": "fit outside sanity bounds",
                        "base_eur": round(base, 2), "per_km_eur": round(per_km, 4),
                        "per_km_bounds": PER_KM_BOUNDS, "base_bounds": BASE_BOUNDS})
        return None

    resid = median([abs(y - (base + per_km * x)) for x, y in points])
    return {
        "base_eur": round(base, 2),
        "per_km_eur": round(per_km, 4),
        "n": n_obs,
        "_pairs": len(points),
        "_median_abs_resid_eur": round(resid, 2),
    }


# --------------------------------------------------------------------------- #
# Build + validate
# --------------------------------------------------------------------------- #
def build():
    inv = inventory()
    print_inventory(inv)

    countries = {}
    samples = {"sources": {r["source"]: {"usable": r["usable"], "note": r["note"]}
                           for r in inv},
               "cells": {}, "rejects": []}
    rejects = samples["rejects"]

    renfe = next(r for r in inv if r["source"] == "renfe_kaggle")
    if renfe["usable"]:
        zip_path = _latest("renfe_kaggle/*/spanish-high-speed-rail-system-ticket-pricing.zip")
        print(f"\nES train: streaming {zip_path.name} "
              f"({zip_path.stat().st_size / 1e6:.0f} MB zip)..")
        od_stats, report = collect_renfe(zip_path)
        cell = fit_cell(od_stats, rejects, "ES train")
        samples["cells"]["ES.train"] = {
            **{k: report[k] for k in ("raw_rows", "priced_rows", "od_day_minima",
                                      "pairs", "date_range")},
            "unmatched_cities": report["unmatched_cities"],
        }
        if cell is not None:
            samples["cells"]["ES.train"].update(
                pairs_fit=cell.pop("_pairs"),
                median_abs_resid_eur=cell.pop("_median_abs_resid_eur"))
            countries["ES"] = {"train": cell}

    artifact = {
        "meta": {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "method": "daily-min fares -> per-pair medians -> Theil-Sen "
                      f"price ~ km (great-circle x {GC_DETOUR}); cells below "
                      f"{MIN_OBS} obs / {MIN_PAIRS} pairs or outside "
                      f"{PER_KM_BOUNDS} EUR/km, {BASE_BOUNDS} EUR base are "
                      "not emitted (consumers fall back to priors)",
            "samples": samples,
        },
        "countries": countries,
    }
    return artifact


def validate_contract(artifact):
    """Assert the artifact matches contract C exactly."""
    assert isinstance(artifact.get("meta"), dict), "meta missing"
    assert "generated_at" in artifact["meta"], "meta.generated_at missing"
    assert isinstance(artifact["meta"].get("samples"), dict), "meta.samples missing"
    countries = artifact.get("countries")
    assert isinstance(countries, dict), "countries missing"
    for iso2, modes in countries.items():
        assert isinstance(iso2, str) and len(iso2) == 2 and iso2.isupper(), \
            f"bad country key {iso2!r}"
        assert isinstance(modes, dict) and modes, f"{iso2}: no modes"
        for mode, cell in modes.items():
            assert mode in ("train", "bus", "ferry"), f"{iso2}: bad mode {mode!r}"
            assert isinstance(cell["base_eur"], float), f"{iso2}.{mode}: base_eur"
            assert isinstance(cell["per_km_eur"], float), f"{iso2}.{mode}: per_km_eur"
            assert isinstance(cell["n"], int) and cell["n"] >= MIN_OBS, f"{iso2}.{mode}: n"
            assert set(cell) == {"base_eur", "per_km_eur", "n"}, \
                f"{iso2}.{mode}: extra keys {set(cell) - {'base_eur', 'per_km_eur', 'n'}}"
    return True


def print_table(artifact):
    cells = artifact["meta"]["samples"]["cells"]
    print("\ncalibration table:")
    print(f"  {'cell':<10} {'base_eur':>8} {'per_km':>8} {'n':>8} "
          f"{'pairs':>5} {'resid':>7}  date range")
    any_row = False
    for iso2, modes in sorted(artifact["countries"].items()):
        for mode, cell in sorted(modes.items()):
            info = cells.get(f"{iso2}.{mode}", {})
            rng = info.get("date_range", ["?", "?"])
            print(f"  {iso2 + ' ' + mode:<10} {cell['base_eur']:>8.2f} "
                  f"{cell['per_km_eur']:>8.4f} {cell['n']:>8,} "
                  f"{info.get('pairs_fit', 0):>5} "
                  f"{info.get('median_abs_resid_eur', 0):>6.2f}E  "
                  f"{rng[0]} .. {rng[1]}")
            any_row = True
    if not any_row:
        print("  (no cell cleared the gates; consumers keep their priors)")
    for rej in artifact["meta"]["samples"]["rejects"]:
        print(f"  reject: {json.dumps(rej)}")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m src.estimation.ground_calibration")
    ap.add_argument("--inventory", action="store_true",
                    help="report usable raw data and exit")
    ap.add_argument("--dry-run", action="store_true",
                    help="fit and print, write nothing")
    args = ap.parse_args(argv)

    if args.inventory:
        print_inventory(inventory())
        return 0

    artifact = build()
    validate_contract(artifact)
    print_table(artifact)

    if args.dry_run:
        print("\ndry run, nothing written")
        return 0
    dump_json(OUT_PATH, artifact)
    print(f"\nwrote {OUT_PATH.relative_to(Path.cwd()) if OUT_PATH.is_relative_to(Path.cwd()) else OUT_PATH} "
          f"({len(artifact['countries'])} countr{'y' if len(artifact['countries']) == 1 else 'ies'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
