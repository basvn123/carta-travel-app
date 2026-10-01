"""Ground-cost benchmark: the engine's bed and food figures against data it
never saw.

Three checks, each written to be repeatable from the files already on disk:

  STAY   Inside Airbnb listings (CC BY 4.0, cache/iab/*.csv.gz) around every
         destination that carries a COUNTRY-level stay price. The engine
         priced those towns from a national prior; the listings within
         STAY_RADIUS_KM of the town are real asks it never read. The same
         listings are also scored around the measured (city-level) towns,
         reported apart, because there they are in-sample.

  FOOD   Eurostat price level indices (data/eurostat_pli.json) against the
         engine's country food baskets. Eurostat publishes relative levels,
         not euros, so the suite converts each country's index to euros with
         a scale fitted on every OTHER country (leave-one-out) and scores the
         residual. This tests whether the cross-country shape of the baskets
         is right; it cannot test the absolute level, and the report says so.
         Countries whose basket was itself scaled from Eurostat (price_source
         pli_scaled) are excluded from the score as circular.

  HOTELS samples/hotels.csv, hand-sampled real hotel listings (T095's
         hold-out). Scored when rows exist; the file ships empty.

The headline is the weekly ground cost for one mid-range traveller, seven
nights at the entire-place tier plus seven days of the default lifestyle,
and the share of hold-out destinations where the engine lands within
WEEKLY_TOLERANCE_EUR of the observation, with a bootstrap confidence
interval. Two intervals are printed: one resampling destinations, one
resampling countries. Errors share a national prior within a country, so the
country one is the honest headline.

    node tools/benchmark/predict.mjs --app <continent-app> --data <app_data.json> --out tools/benchmark/work/predictions.json
    python tools/benchmark/benchmark.py --root "<main checkout>" [--predictions tools/benchmark/work/predictions.json]

Writes results/<date>.json and results/<date>.md. Nothing outside tools/benchmark.
"""
import argparse
import csv
import json
import statistics
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent

STAY_RADIUS_KM = 10.0        # listings this close to the town centre describe it
STAY_MIN_LISTINGS = 30       # same floor the harvester trusts a median at
WEEKLY_TOLERANCE_EUR = 40.0  # the statement the task asks for
FRESH_PLI_YEAR = 2023        # older Eurostat rows (the UK stops at 2020) are not scored
BOOTSTRAP_N = 4000
SEED = 20261001


# ----------------------------------------------------------------- helpers

def haversine_km(lat1, lon1, lat2, lon2):
    """Vectorised over lat2/lon2 (numpy arrays)."""
    r = 6371.0
    p1 = np.radians(lat1)
    p2 = np.radians(lat2)
    dphi = p2 - p1
    dl = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def pct_within(errs, tol):
    errs = np.asarray(errs, dtype=float)
    return float(np.mean(np.abs(errs) <= tol)) if errs.size else float("nan")


def bootstrap_share(errs, tol, clusters=None, n=BOOTSTRAP_N, seed=SEED):
    """95% percentile interval for the share of |err| <= tol.

    With `clusters` (one label per error) the resample draws clusters with
    replacement and keeps every member, so correlated errors inside a country
    are never treated as independent evidence."""
    rng = np.random.default_rng(seed)
    errs = np.asarray(errs, dtype=float)
    if errs.size == 0:
        return (float("nan"), float("nan"))
    hit = (np.abs(errs) <= tol).astype(float)
    if clusters is None:
        draws = rng.choice(hit, size=(n, hit.size), replace=True).mean(axis=1)
    else:
        labels = np.asarray(clusters)
        uniq = np.unique(labels)
        members = [hit[labels == u] for u in uniq]
        draws = np.empty(n)
        for i in range(n):
            pick = rng.integers(0, len(uniq), size=len(uniq))
            draws[i] = np.concatenate([members[j] for j in pick]).mean()
    return (float(np.percentile(draws, 2.5)), float(np.percentile(draws, 97.5)))


def summarise(errs, tol, clusters=None):
    errs = np.asarray(errs, dtype=float)
    if errs.size == 0:
        return {"n": 0}
    lo_d, hi_d = bootstrap_share(errs, tol)
    out = {
        "n": int(errs.size),
        "tolerance_eur": tol,
        "share_within": round(pct_within(errs, tol), 4),
        "ci95_destinations": [round(lo_d, 4), round(hi_d, 4)],
        "median_abs_err_eur": round(float(np.median(np.abs(errs))), 2),
        "mean_err_eur": round(float(errs.mean()), 2),
        "p80_abs_err_eur": round(float(np.percentile(np.abs(errs), 80)), 2),
    }
    if clusters is not None:
        lo_c, hi_c = bootstrap_share(errs, tol, clusters)
        out["ci95_countries"] = [round(lo_c, 4), round(hi_c, 4)]
        out["n_countries"] = int(len(set(clusters)))
    return out


# -------------------------------------------------------------------- stay

def load_listings(root):
    """region -> (lat[], lon[], price_eur[], accommodates[]) from the cached
    Inside Airbnb snapshots, parsed by the harvester's own function so the
    filters (entire homes, 2 to 8 sleepers, positive price) are identical."""
    sys.path.insert(0, str(root / "pipeline"))
    import harvest_accommodation as ha  # noqa: E402  (read-only use)

    out = {}
    for ds in ha.DATASETS:
        region = ds["region"]
        fp = root / "cache" / "iab" / f"{region}.csv.gz"
        if not fp.exists():
            print(f"  [{region}] no cached listings, skipped")
            continue
        rows = ha.parse_listings(fp)
        per_eur = ha.FX[ds["cur"]]
        lat = np.array([r[0] for r in rows])
        lon = np.array([r[1] for r in rows])
        acc = np.array([r[2] for r in rows], dtype=float)
        price = np.array([r[3] for r in rows], dtype=float) / per_eur
        captured = ds["path"].rstrip("/").split("/")[-1]
        out[region] = {"lat": lat, "lon": lon, "acc": acc, "price": price,
                       "captured": captured, "n": len(rows)}
        print(f"  [{region}] {len(rows)} entire-home listings, captured {captured}")
    return out


def observed_per_person(price, acc):
    """The harvester's construction: 1..99% trimmed median whole-home price
    over the median capacity, so the engine's figure and the observation are
    the same statistic."""
    order = np.sort(price)
    lo = order[max(0, int(len(order) * 0.01))]
    hi = order[min(len(order) - 1, int(len(order) * 0.99))]
    keep = (price >= lo) & (price <= hi)
    night = float(np.median(price[keep]))
    cap = max(2, int(round(float(np.median(acc[keep])))))
    return night, cap, int(keep.sum())


def usable_band(root):
    """The whole-home nightly band apply_accommodation_anchors.py trusts an
    anchor inside (12 to 2000 EUR). A snapshot whose median falls outside it
    is a broken harvest (Geneva's prices parse to fractions of a franc), not
    an observation, and is dropped on the same rule the pipeline uses."""
    sys.path.insert(0, str(root / "pipeline"))
    import apply_accommodation_anchors as aa  # noqa: E402  (read-only use)
    return aa.MIN_NIGHT_EUR, aa.MAX_NIGHT_EUR


def stay_holdout(pred, listings, band):
    """One row per destination with enough listings around it. The engine's
    nightly is lifted to the capture month with the curve the runtime would
    use, so both sides are a June ask per person. Returns (rows, dropped)."""
    global_curve = pred["global_seasonality"]
    rows = []
    dropped = []
    for region, L in listings.items():
        if L["n"] < STAY_MIN_LISTINGS:
            continue
        cm = int(L["captured"][5:7])
        lat_lo, lat_hi = L["lat"].min() - 0.15, L["lat"].max() + 0.15
        lon_lo, lon_hi = L["lon"].min() - 0.2, L["lon"].max() + 0.2
        for d in pred["rows"]:
            if d["lat"] is None or d["stay_eur"] is None:
                continue
            if not (lat_lo <= d["lat"] <= lat_hi and lon_lo <= d["lon"] <= lon_hi):
                continue
            km = haversine_km(d["lat"], d["lon"], L["lat"], L["lon"])
            near = km <= STAY_RADIUS_KM
            if near.sum() < STAY_MIN_LISTINGS:
                continue
            night, cap, n = observed_per_person(L["price"][near], L["acc"][near])
            if not (band[0] <= night <= band[1]):
                dropped.append({"id": d["id"], "city": d["city"], "region": region,
                                "obs_whole_home": round(night, 2), "n_listings": n})
                continue
            obs_pp = night / cap
            curve = d["stay_seasonality"]
            factor = curve[cm - 1] if curve and len(curve) == 12 else global_curve[str(cm)]
            pred_pp = d["stay_eur"] * factor
            rows.append({
                "id": d["id"], "city": d["city"], "iso2": d["iso2"],
                "level": d["stay_level"], "source": d["stay_source"],
                "region": region, "captured": L["captured"], "n_listings": n,
                "pred_pp_night": round(pred_pp, 2), "obs_pp_night": round(obs_pp, 2),
                "obs_whole_home": round(night, 1), "obs_capacity": cap,
                "err_pp_night": round(pred_pp - obs_pp, 2),
                "err_pct": round(100 * (pred_pp - obs_pp) / obs_pp, 1),
            })
    # A town inside two overlapping snapshots keeps the one with more listings.
    best = {}
    for r in rows:
        if r["id"] not in best or r["n_listings"] > best[r["id"]]["n_listings"]:
            best[r["id"]] = r
    return sorted(best.values(), key=lambda r: (r["iso2"], r["city"])), dropped


# -------------------------------------------------------------------- food

def food_holdout(pred, pli):
    """Per-country LOO scale from index to euros, then per-destination residual.

    The scale K is the median over the OTHER independent countries of
    (engine basket x 100 / index). A country never sets its own scale, so a
    basket that is wrong for that country shows up as error rather than
    being absorbed. Dining out is scaled on 'Restaurants and hotels',
    groceries on 'Food and non-alcoholic beverages'."""
    rest = pli["categories"]["rest_hotels"]["by_iso2"]
    groc = pli["categories"]["food_nonalc"]["by_iso2"]

    # Country basket = median over the country's country-level destinations.
    by_cc = defaultdict(lambda: {"out": [], "groc": [], "sources": set()})
    for d in pred["rows"]:
        if d["food_level"] != "country" or d["food_out_eur"] is None:
            continue
        by_cc[d["iso2"]]["out"].append(d["food_out_eur"])
        by_cc[d["iso2"]]["groc"].append(d["food_groceries_eur"])
        by_cc[d["iso2"]]["sources"].add(d["food_source"])

    countries = {}
    for cc, v in by_cc.items():
        r, g = rest.get(cc), groc.get(cc)
        status = "scored"
        if r is None or g is None:
            status = "no_eurostat_index"
        elif min(r["year"], g["year"]) < FRESH_PLI_YEAR:
            status = f"stale_index_{min(r['year'], g['year'])}"
        elif "pli_scaled" in v["sources"]:
            status = "circular_pli_scaled"
        countries[cc] = {
            "basket_out": statistics.median(v["out"]),
            "basket_groc": statistics.median(v["groc"]),
            "pli_rest": r["value"] if r else None, "pli_rest_year": r["year"] if r else None,
            "pli_groc": g["value"] if g else None, "pli_groc_year": g["year"] if g else None,
            "sources": sorted(v["sources"]), "status": status, "n_destinations": len(v["out"]),
        }

    scored = [cc for cc, c in countries.items() if c["status"] == "scored"]
    for cc in scored:
        others = [o for o in scored if o != cc]
        k_out = statistics.median(countries[o]["basket_out"] * 100 / countries[o]["pli_rest"] for o in others)
        k_groc = statistics.median(countries[o]["basket_groc"] * 100 / countries[o]["pli_groc"] for o in others)
        c = countries[cc]
        c["implied_out"] = round(k_out * c["pli_rest"] / 100, 2)
        c["implied_groc"] = round(k_groc * c["pli_groc"] / 100, 2)
        c["implied_day"] = round(c["implied_out"] + c["implied_groc"], 2)
        c["k_out_loo"] = round(k_out, 2)
        c["k_groc_loo"] = round(k_groc, 2)

    rows = []
    for d in pred["rows"]:
        c = countries.get(d["iso2"])
        if not c or c["status"] != "scored" or d["food_level"] != "country":
            continue
        err = d["food_eur"] - c["implied_day"]
        rows.append({
            "id": d["id"], "city": d["city"], "iso2": d["iso2"], "source": d["food_source"],
            "pred_food_day": round(d["food_eur"], 2), "implied_food_day": c["implied_day"],
            "err_food_day": round(err, 2), "err_pct": round(100 * err / c["implied_day"], 1),
        })
    return countries, rows


# ------------------------------------------------------------------ hotels

def hotel_sample(pred):
    """samples/hotels.csv: real hotel listings sampled by hand. Each row is a
    whole booking; the suite turns it into a per-person nightly for a double
    room and sets it beside the engine's entire-place nightly for the same
    month. Different product, so it is reported, never folded into the
    headline."""
    fp = HERE / "samples" / "hotels.csv"
    rows = []
    if not fp.exists():
        return rows
    by_id = {d["id"]: d for d in pred["rows"]}
    global_curve = pred["global_seasonality"]
    with fp.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(l for l in f if not l.startswith("#")):
            d = by_id.get((r.get("dest_id") or "").strip())
            if not d:
                continue
            try:
                nights = int(r["nights"])
                total = float(r["total_eur"])
                occupancy = int(r.get("occupancy") or 2)
                month = int(r["checkin"][5:7])
            except (KeyError, ValueError):
                continue
            obs_pp = total / nights / max(1, occupancy)
            curve = d["stay_seasonality"]
            factor = curve[month - 1] if curve and len(curve) == 12 else global_curve[str(month)]
            pred_pp = d["stay_eur"] * factor
            rows.append({
                "id": d["id"], "city": d["city"], "iso2": d["iso2"], "stars": r.get("stars"),
                "checkin": r["checkin"], "nights": nights, "obs_pp_night": round(obs_pp, 2),
                "pred_home_pp_night": round(pred_pp, 2), "err_pp_night": round(pred_pp - obs_pp, 2),
                "source": r.get("source", ""),
            })
    return rows


# -------------------------------------------------------------------- main

def write_markdown(res, out_md):
    s = res["summary"]
    lines = [f"# Ground-cost benchmark, {res['date']}", ""]
    lines.append(f"Engine data generated {res['data_generated_at']}, schema {res['schema_version']}, "
                 f"{res['n_destinations']} destinations. Default lifestyle, entire-place tier, one traveller.")
    lines.append("")

    def block(title, m, note):
        lines.append(f"## {title}")
        lines.append("")
        if m.get("n", 0) == 0:
            lines.append("No rows.")
            lines.append("")
            return
        lines.append(note)
        lines.append("")
        lines.append("| Metric | Value |")
        lines.append("|---|---|")
        lines.append(f"| Destinations scored | {m['n']} |")
        if "n_countries" in m:
            lines.append(f"| Countries | {m['n_countries']} |")
        lines.append(f"| Within EUR {m['tolerance_eur']:.0f} | {100 * m['share_within']:.1f}% |")
        lines.append(f"| 95% CI, resampling destinations | {100 * m['ci95_destinations'][0]:.1f}% to {100 * m['ci95_destinations'][1]:.1f}% |")
        if "ci95_countries" in m:
            lines.append(f"| 95% CI, resampling countries | {100 * m['ci95_countries'][0]:.1f}% to {100 * m['ci95_countries'][1]:.1f}% |")
        lines.append(f"| Median absolute error | EUR {m['median_abs_err_eur']:.2f} |")
        lines.append(f"| 80th percentile absolute error | EUR {m['p80_abs_err_eur']:.2f} |")
        lines.append(f"| Mean signed error (plus = engine high) | EUR {m['mean_err_eur']:.2f} |")
        lines.append("")

    block("Weekly ground cost, hold-out towns", s["weekly_holdout"],
          "Seven nights plus seven days, towns priced from a national prior, against Inside Airbnb "
          "listings within 10 km and the Eurostat-implied food basket.")
    block("Stay per person per night, hold-out towns (country prior)", s["stay_holdout"],
          "Engine nightly at the capture month against the trimmed median listing within 10 km "
          "over the median capacity.")
    block("Stay per person per night, measured towns (in-sample)", s["stay_insample"],
          "Towns within 20 km of an Inside Airbnb anchor carry that anchor's median; this is how "
          "far the local 10 km listings sit from the inherited city figure.")
    block("Food per person per day, country baskets", s["food"],
          "Engine basket against the Eurostat price level index scaled to euros leave-one-out. "
          "Tests the shape across countries, not the absolute level.")
    block("Weekly food, country baskets", s["food_weekly"], "The same residual times seven.")
    lines.append("## Hotels")
    lines.append("")
    lines.append(f"{len(res['hotel_sample'])} sampled hotel listings in samples/hotels.csv." if res["hotel_sample"]
                 else "samples/hotels.csv holds no rows yet; nothing scored.")
    lines.append("")
    lines.append("## Food countries by status")
    lines.append("")
    lines.append("| Country | Status | Basket out | Basket groceries | PLI rest. | PLI food | Implied day | Engine day |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for cc, c in sorted(res["food_countries"].items()):
        lines.append(f"| {cc} | {c['status']} | {c['basket_out']:.2f} | {c['basket_groc']:.2f} | "
                     f"{c['pli_rest'] if c['pli_rest'] is not None else ''} | {c['pli_groc'] if c['pli_groc'] is not None else ''} | "
                     f"{c.get('implied_day', '')} | {round(c['basket_out'] + c['basket_groc'], 2)} |")
    lines.append("")
    if res["stay_dropped"]:
        lines.append("## Snapshots dropped as not a price")
        lines.append("")
        for x in res["stay_dropped"]:
            lines.append(f"{x['city']} ({x['id']}): {x['region']} median whole-home {x['obs_whole_home']} EUR "
                         f"off {x['n_listings']} listings, outside the 12 to 2000 EUR band the pipeline trusts.")
        lines.append("")
    lines.append("## Stay hold-out rows")
    lines.append("")
    lines.append("| Destination | Country | Snapshot | Listings | Engine pp/night | Observed pp/night | Error | Error % |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for r in res["stay_holdout"]:
        lines.append(f"| {r['city']} ({r['id']}) | {r['iso2']} | {r['region']} | {r['n_listings']} | "
                     f"{r['pred_pp_night']:.2f} | {r['obs_pp_night']:.2f} | {r['err_pp_night']:+.2f} | {r['err_pct']:+.1f} |")
    out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    global STAY_RADIUS_KM, STAY_MIN_LISTINGS
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(HERE.parents[1]),
                    help="repo root holding cache/iab and pipeline/ (the main checkout)")
    ap.add_argument("--predictions", default=str(HERE / "work" / "predictions.json"))
    ap.add_argument("--pli", default=str(HERE / "data" / "eurostat_pli.json"))
    ap.add_argument("--out-dir", default=str(HERE / "results"))
    ap.add_argument("--tag", default=date.today().isoformat())
    ap.add_argument("--radius-km", type=float, default=STAY_RADIUS_KM,
                    help="sensitivity only; the committed figure uses the default")
    ap.add_argument("--min-listings", type=int, default=STAY_MIN_LISTINGS)
    a = ap.parse_args()
    STAY_RADIUS_KM, STAY_MIN_LISTINGS = a.radius_km, a.min_listings

    root = Path(a.root)
    pred = json.loads(Path(a.predictions).read_text(encoding="utf-8"))
    pli = json.loads(Path(a.pli).read_text(encoding="utf-8"))
    print(f"predictions: {pred['n']} destinations from data generated {pred['data_generated_at']}")

    print("listings:")
    listings = load_listings(root)
    stay_rows, stay_dropped = stay_holdout(pred, listings, usable_band(root))
    for x in stay_dropped:
        print(f"  dropped {x['city']} ({x['id']}): {x['region']} median whole-home "
              f"{x['obs_whole_home']} EUR off {x['n_listings']} listings is not a price")
    stay_hold = [r for r in stay_rows if r["level"] != "city"]
    stay_in = [r for r in stay_rows if r["level"] == "city"]

    food_countries, food_rows = food_holdout(pred, pli)
    food_by_id = {r["id"]: r for r in food_rows}

    weekly = []
    for r in stay_hold:
        f = food_by_id.get(r["id"])
        if not f:
            continue
        weekly.append({
            "id": r["id"], "city": r["city"], "iso2": r["iso2"],
            "pred_week": round(7 * (r["pred_pp_night"] + f["pred_food_day"]), 2),
            "obs_week": round(7 * (r["obs_pp_night"] + f["implied_food_day"]), 2),
            "err_week": round(7 * (r["err_pp_night"] + f["err_food_day"]), 2),
            "err_stay_week": round(7 * r["err_pp_night"], 2),
            "err_food_week": round(7 * f["err_food_day"], 2),
        })

    hotels = hotel_sample(pred)

    summary = {
        "weekly_holdout": summarise([w["err_week"] for w in weekly], WEEKLY_TOLERANCE_EUR,
                                    [w["iso2"] for w in weekly]),
        "stay_holdout": summarise([r["err_pp_night"] for r in stay_hold], WEEKLY_TOLERANCE_EUR / 7,
                                  [r["iso2"] for r in stay_hold]),
        "stay_insample": summarise([r["err_pp_night"] for r in stay_in], WEEKLY_TOLERANCE_EUR / 7,
                                   [r["iso2"] for r in stay_in]),
        "food": summarise([r["err_food_day"] for r in food_rows], WEEKLY_TOLERANCE_EUR / 7,
                          [r["iso2"] for r in food_rows]),
        "food_weekly": summarise([7 * r["err_food_day"] for r in food_rows], WEEKLY_TOLERANCE_EUR,
                                 [r["iso2"] for r in food_rows]),
        "hotels": summarise([h["err_pp_night"] for h in hotels], WEEKLY_TOLERANCE_EUR / 7,
                            [h["iso2"] for h in hotels]) if hotels else {"n": 0},
    }
    stay_holdout_weekly = summarise([7 * r["err_pp_night"] for r in stay_hold], WEEKLY_TOLERANCE_EUR,
                                    [r["iso2"] for r in stay_hold])
    summary["stay_holdout_weekly"] = stay_holdout_weekly

    res = {
        "date": a.tag, "generated": date.today().isoformat(),
        "data_generated_at": pred["data_generated_at"], "schema_version": pred["schema_version"],
        "n_destinations": pred["n"],
        "parameters": {"stay_radius_km": STAY_RADIUS_KM, "stay_min_listings": STAY_MIN_LISTINGS,
                       "weekly_tolerance_eur": WEEKLY_TOLERANCE_EUR, "fresh_pli_year": FRESH_PLI_YEAR,
                       "bootstrap_n": BOOTSTRAP_N, "seed": SEED, "lifestyle": pred["lifestyle"]},
        "sources": {"stay": "Inside Airbnb snapshots in cache/iab (CC BY 4.0)",
                    "food": pli["source"], "food_fetched": pli["fetched"]},
        "summary": summary,
        "weekly_holdout": weekly, "stay_holdout": stay_hold, "stay_insample": stay_in,
        "stay_dropped": stay_dropped,
        "food_countries": food_countries, "food_rows_n": len(food_rows), "hotel_sample": hotels,
    }
    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{a.tag}.json").write_text(json.dumps(res, indent=1, sort_keys=True), encoding="utf-8")
    write_markdown(res, out_dir / f"{a.tag}.md")

    for k in ("weekly_holdout", "stay_holdout", "stay_holdout_weekly", "stay_insample", "food", "food_weekly", "hotels"):
        m = summary[k]
        if m.get("n"):
            print(f"{k:20s} n={m['n']:4d} within EUR {m['tolerance_eur']:.2f}: {100*m['share_within']:.1f}% "
                  f"(dest CI {100*m['ci95_destinations'][0]:.1f}-{100*m['ci95_destinations'][1]:.1f}"
                  + (f", country CI {100*m['ci95_countries'][0]:.1f}-{100*m['ci95_countries'][1]:.1f}" if 'ci95_countries' in m else "")
                  + f") median |err| {m['median_abs_err_eur']:.2f} mean err {m['mean_err_eur']:+.2f}")
        else:
            print(f"{k:20s} n=0")
    print(f"wrote {out_dir / (a.tag + '.json')} and .md")


if __name__ == "__main__":
    main()
