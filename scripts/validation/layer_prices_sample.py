"""The hand-checked sample of live listings (T1190, D23 Prices row).

Nothing is scraped. This file draws a fixed sample of Carta places and
writes a sheet; the owner opens each site by hand, reads the prices and
fills the sheet in; the runner then compares Carta with what was found.

Design (research, T1190): stratified by the country's price tercile (from
Carta's own country bed level, cheap / mid / dear) x place class (metro or
city / town / village or area), PER_CELL places per cell, so 9 cells x 4 =
36 places. Each place gets one bed row (a tier it prices: dorm, home or
hotel3, chosen by hash) and the first DINNER_N places a dinner row (a
mid-range main course with a drink, read from one or two menus). The same
places come back on every draw (sha256 of salt and id), so a later recheck
compares like with like.

Sheet: data/reports/validation/prices/hand_sample.csv. The owner fills
checked_on, site, found_eur (the median of the first 20 results sorted by
price for the same stay: same tier, check-in 30 to 60 days out, one night,
two adults for home and hotel3, one adult for dorm; taxes included),
n_seen, url and notes. Rows without found_eur are left out of the run.

  flags   matched  the row has Carta's price and a found price;
  facts   within   Carta is within TOL of the found price;
  rank    (found, Carta); error (found, Carta).

    python -I scripts/validation/layer_prices_sample.py --draw     # write the sheet
    python -I scripts/validation/runner.py prices_sample --write   # once filled in
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import layer_prices as lp

NAME = "prices_sample"
SHARE = 1.0
MIN_PER_COUNTRY = 1
SHEET = lp.OUT_DIR / "hand_sample.csv"
PER_CELL = 4
DINNER_N = 12
TOL = 0.30
TIERS = ("dorm", "home", "hotel3")
CLASSES = {"metro": "city", "city": "city", "town": "town", "village": "small", "area": "small"}
COLUMNS = ["id", "place", "country", "tercile", "class", "item", "unit", "carta_eur",
           "checked_on", "site", "found_eur", "n_seen", "url", "notes"]
UNITS = {"dorm": "one bed in a dorm, one adult, per night",
         "home": "entire place for two, per night, before Airbnb style fees",
         "hotel3": "3 star double room for two, per night",
         "meal_mid_eur": "mid-range dinner main course and a drink, one person"}
CHECKS = [
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 10, "min_n": 10},
    {"metric": "fact.within", "kind": "soft", "direction": "higher", "tolerance_points": 10, "min_n": 10},
    {"metric": "error_mdape", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 10},
]


def _h(salt, key):
    return hashlib.sha256(f"{salt}|{key}".encode()).hexdigest()


def draw(app_data, salt="d23"):
    dests = app_data.get("destinations") or {}
    dests = list(dests.values()) if isinstance(dests, dict) else dests
    by_cc = {}
    for d in dests:
        cc = lp.iso2(d.get("iso2"))
        v = lp.bed_value(d.get("accommodation"), "home")
        if v:
            by_cc.setdefault(cc, []).append(v)
    level = {cc: statistics.median(vs) for cc, vs in by_cc.items() if len(vs) >= lp.MIN_PLACES}
    order = sorted(level, key=lambda c: (level[c], c))
    third = len(order) / 3
    tercile = {c: ("cheap", "mid", "dear")[min(2, int(i / third))] for i, c in enumerate(order)}
    cells = {}
    for d in dests:
        cc = lp.iso2(d.get("iso2"))
        cls = CLASSES.get((d.get("place") or {}).get("class"))
        tiers = [t for t in TIERS if lp.bed_value(d.get("accommodation"), t)]
        if cc not in tercile or not cls or not tiers:
            continue
        cells.setdefault((tercile[cc], cls), []).append((d, tiers))
    rows, picked = [], []
    for key in sorted(cells):
        items = sorted(cells[key], key=lambda e: _h(salt, e[0].get("id")))
        seen = set()
        for d, tiers in items:
            cc = lp.iso2(d.get("iso2"))
            if cc in seen:          # spread over countries: one place per country per cell
                continue
            seen.add(cc)
            picked.append((key, d, tiers))
            if len(seen) == PER_CELL:
                break
    picked.sort(key=lambda e: _h(salt, "order|" + str(e[1].get("id"))))
    for i, (key, d, tiers) in enumerate(picked):
        tier = tiers[int(_h(salt, "tier|" + str(d.get("id"))), 16) % len(tiers)]
        base = {"id": d.get("id"), "place": d.get("city") or d.get("id"), "country": lp.iso2(d.get("iso2")),
                "tercile": key[0], "class": key[1]}
        rows.append({**base, "item": f"bed.{tier}", "unit": UNITS[tier],
                     "carta_eur": round(lp.bed_value(d.get("accommodation"), tier), 2)})
        meal = (d.get("costs") or {}).get("meal_mid_eur")
        if i < DINNER_N and meal:
            rows.append({**base, "item": "meal_mid_eur", "unit": UNITS["meal_mid_eur"], "carta_eur": meal})
    return rows


def write_sheet(rows, path=SHEET):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in COLUMNS})
    return path


def _num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x > 0 else None


def references(ctx):
    path = Path(ctx.get("reference") or SHEET)
    ctx["_ref_path"] = path
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    return [{"id": f"{r['id']}:{r['item']}", "countries": [r["country"]], "item": r["item"],
             "found": _num(r.get("found_eur")), "carta": _num(r.get("carta_eur")),
             "site": r.get("site") or "", "checked_on": r.get("checked_on") or ""}
            for r in rows if _num(r.get("found_eur"))]


def load(ctx):
    return {}


def match(refs, carta):
    out = []
    for r in refs:
        ok = bool(r["carta"] and r["found"])
        res = {"id": r["id"], "country": r["countries"][0], "flags": {"matched": ok},
               "facts": {"within": None}, "rank": None, "error": None, "found": r["found"], "carta": r["carta"]}
        if ok:
            res["facts"]["within"] = abs(r["carta"] / r["found"] - 1) <= TOL
            res["rank"] = res["error"] = (r["found"], r["carta"])
            res["note"] = ("agrees" if res["facts"]["within"]
                           else "carta_above" if r["carta"] > r["found"] else "carta_below")
        out.append(res)
    return out


def gaps(results, n=30):
    rs = [r for r in results if r["flags"]["matched"]]
    rs.sort(key=lambda r: (-abs(r["carta"] / r["found"] - 1), r["id"]))
    return [{"id": r["id"], "found": r["found"], "carta": r["carta"], "cause_code": r.get("note")} for r in rs[:n]]


def describe(ctx, carta):
    return {"reference": {"path": str(ctx.get("_ref_path") or SHEET), "kind": "hand-checked by the owner"},
            "carta": {}}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Draw the hand-checked price sample (T1190)")
    ap.add_argument("--draw", action="store_true")
    ap.add_argument("--out", default=str(SHEET))
    ap.add_argument("--salt", default="d23")
    a = ap.parse_args(argv)
    if a.draw:
        rows = draw(lp.load_json(lp.APP_DATA, {}) or {}, a.salt)
        p = write_sheet(rows, a.out)
        print(f"wrote {p}: {len(rows)} rows, {len({r['id'] for r in rows})} places, "
              f"{len({r['country'] for r in rows})} countries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
