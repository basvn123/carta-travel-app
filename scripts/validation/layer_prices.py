"""Prices on the D23 validation runner (T1190, ROADMAP D23 Prices row).

Three layers, one per kind of outside evidence, each its own scorecard row:

  prices          (this file) Carta's country price levels for food, drink,
                  groceries and beds against Eurostat's price level indices
                  (prc_ppp_ind, EU27_2020 = 100, CC BY 4.0). Offline: the
                  indices are a committed subset, reference_pli.json.
  prices_fares    published fare examples against the swept fares
                  (layer_prices_fares.py; owner-supplied examples).
  prices_sample   a hand-checked sample of live listings against Carta's bed
                  prices (layer_prices_sample.py; the sample is drawn here,
                  the owner checks it by hand on the sites, nothing scraped).

What a result says, per reference item (one country and one Carta item):

  flags   matched      Carta prices the item in that country from at least
                       MIN_PLACES places. This is the coverage.
          independent  Carta's number does not itself come from the same
                       Eurostat index. Food bases of countries without a
                       measured basket ARE built from prc_ppp_ind
                       (pipeline/apply_food_prices.py), so comparing them
                       with it would only test the arithmetic: they are kept
                       in the table and the gaps but not in the facts,
                       rank or error.
  facts   level        Carta's relative level (country median over the
                       geometric mean of the EU27 countries both sides have)
                       is within TOL[group] of Eurostat's, re-pivoted to the
                       same countries. Independent items only.
  rank    (Eurostat level, Carta level): do the dearer countries read dearer.
  error   (Eurostat level, Carta level), both indices with the same pivot.

Both sides are pivoted with a geometric mean (symmetric on a log scale);
Eurostat's own EU27 = 100 is expenditure weighted, so the re-pivot to the
countries both sides have removes most, not all, of that difference.

Price level indices are relative, not prices: Carta's euros are never
compared with an index directly, only Carta's spread between countries with
Eurostat's. A bias common to every country (a basket that is dear
everywhere) cannot show here; the hand sample and the fare examples catch
that.

    python -I scripts/validation/runner.py prices --write
    python -I scripts/validation/layer_prices.py --table     # errors per country and category
    python -I scripts/validation/layer_prices.py --refresh-reference   # from cache/food_price_inputs.json

No network, no model.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "reports" / "validation" / "prices"
REFERENCE = OUT_DIR / "reference_pli.json"
INPUTS = ROOT / "cache" / "food_price_inputs.json"
APP_DATA = ROOT / "continent-app" / "public" / "app_data.json"

NAME = "prices"
SHARE = 1.0                # about 400 items: the whole list
MIN_PER_COUNTRY = 5
MIN_PLACES = 3             # fewer places in a country: no country median
ISO_ALIAS = {"EL": "GR", "UK": "GB"}
EU27 = ("AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE",
        "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK")

# Carta item -> (group, Eurostat ppp_cat in order of preference). The first
# category the reference file carries is used (research, T1190):
#   A011101 catering services (restaurants, cafes, bars) for eating out and
#           drinks served; the food model itself reads the broader A0111;
#   A011102 accommodation services for beds;
#   A0111   restaurants and hotels, the fallback for both while the committed
#           subset lacks the narrow levels (owner step T1190-b);
#   A010101 food, for a day of groceries.
# Club entry is left out: no Eurostat category prices it (unvalidated).
ITEMS = {
    "meal_mid_eur": ("eat", ("A011101", "A0111")),
    "meal_cheap_eur": ("eat", ("A011101", "A0111")),
    "fastfood_eur": ("eat", ("A011101", "A0111")),
    "coffee_eur": ("eat", ("A011101", "A0111")),
    "drink_out_eur": ("drink", ("A011101", "A0111")),
    "cocktail_eur": ("drink", ("A011101", "A0111")),
    "grocery_day_eur": ("shop", ("A010101",)),
    "bed.dorm": ("bed", ("A011102", "A0111")),
    "bed.private": ("bed", ("A011102", "A0111")),
    "bed.home": ("bed", ("A011102", "A0111")),
    "bed.hotel3": ("bed", ("A011102", "A0111")),
}
HARVEST_CATS = ("A0111", "A011101", "A011102", "A010101", "A010201")
CAT_NAMES = {"A0111": "restaurants and hotels", "A011101": "catering services",
             "A011102": "accommodation services", "A010101": "food", "A010201": "alcoholic beverages"}
GROUPS = ("eat", "drink", "shop", "bed")
TOL = {"eat": 0.20, "drink": 0.25, "shop": 0.20, "bed": 0.30}
# Food anchors whose country base does not come from prc_ppp_ind
# (meta.food_model.anchors in app_data). City-anchored bases blend a
# Eurostat-scaled reference with what measured cities imply, so they count
# as built from the index too (conservative).
INDEPENDENT_ANCHORS = {"measured"}
GAPS_N = 30

CHECKS = [
    {"metric": "coverage", "kind": "hard", "direction": "higher", "tolerance_points": 0},
    {"metric": "fact.level", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "agreement_tau", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "error_mdape", "kind": "soft", "direction": "lower", "tolerance_points": 3, "min_n": 30},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def iso2(code):
    code = (code or "").strip().upper()
    return ISO_ALIAS.get(code, code)


def gmean(xs):
    xs = [x for x in xs if x and x > 0]
    return math.exp(statistics.fmean(math.log(x) for x in xs)) if xs else None


def load_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def bed_value(acc, tier):
    """Annual median per night for a tier; `home` is the entire place for two."""
    beds = (acc or {}).get("beds") or {}
    v = beds.get("bnb_home") if tier == "home" else beds.get(tier)
    if isinstance(v, dict):
        v = v.get("2")
    return float(v) if isinstance(v, (int, float)) and v > 0 else None


# ---------------------------------------------------------------------------
# Reference
# ---------------------------------------------------------------------------

def refresh_reference(inputs=INPUTS, out=REFERENCE):
    """Write the committed subset of prc_ppp_ind from the food harvest."""
    blob = load_json(inputs)
    if not blob or "pli" not in blob:
        raise SystemExit(f"prices: {inputs} has no price levels (git lfs pull it, or run harvest_food_prices.py)")
    pli = {c: {iso2(g): v for g, v in sorted((blob["pli"].get(c) or {}).items())}
           for c in HARVEST_CATS if blob["pli"].get(c)}
    doc = {"source": "Eurostat prc_ppp_ind, na_item PLI_EU27_2020 (EU27_2020 = 100)",
           "licence": "CC BY 4.0 (Eurostat reuse policy)",
           "url": "https://ec.europa.eu/eurostat/databrowser/view/prc_ppp_ind/default/table",
           "harvested": blob.get("harvested"), "categories": {c: CAT_NAMES[c] for c in pli},
           "pli": pli}
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return doc


def references(ctx):
    path = Path(ctx.get("reference") or REFERENCE)
    blob = load_json(path, {}) or {}
    ctx["_ref_path"], ctx["_ref"] = path, blob
    pli = blob.get("pli") or {}
    out = []
    for item, (group, prefs) in ITEMS.items():
        cat = next((c for c in prefs if pli.get(c)), None)
        if not cat:
            continue
        for cc, rec in sorted((pli.get(cat) or {}).items()):
            if len(cc) != 2 or not isinstance(rec, dict) or not rec.get("value"):
                continue
            out.append({"id": f"{cc}:{item}", "countries": [cc], "item": item, "group": group,
                        "cat": cat, "pli": float(rec["value"]), "year": rec.get("year")})
    return out


# ---------------------------------------------------------------------------
# Carta
# ---------------------------------------------------------------------------

def load(ctx):
    """{'values': {cc: {item: [eur per place]}}, 'base': {cc: {item: eur}},
    'anchor': {cc: kind}, 'generated_at'}."""
    data = ctx.get("app_data")
    if data is None:
        data = load_json(ctx.get("app") or APP_DATA, {}) or {}
    meta = data.get("meta") or {}
    dests = data.get("destinations") or {}
    if isinstance(dests, dict):
        dests = list(dests.values())
    values = {}
    for d in dests:
        cc = iso2(d.get("iso2") or d.get("country"))
        if len(cc) != 2:
            continue
        slot = values.setdefault(cc, {})
        costs = d.get("costs") or {}
        for item in ITEMS:
            if item.startswith("bed."):
                v = bed_value(d.get("accommodation"), item[4:])
            else:
                v = costs.get(item)
                v = float(v) if isinstance(v, (int, float)) and v > 0 else None
            if v:
                slot.setdefault(item, []).append(v)
    fm = meta.get("food_model") or {}
    anchor = {iso2(cc): kind for kind, ccs in (fm.get("anchors") or {}).items() for cc in ccs}
    base = {iso2(cc): {k: v for k, v in row.items() if k in ITEMS}
            for cc, row in (meta.get("food_country") or {}).items()}
    return {"values": values, "base": base, "anchor": anchor,
            "generated_at": meta.get("generated_at"), "places": len(dests),
            "food_asof": fm.get("asof")}


def country_medians(carta):
    out = {}
    for cc, items in carta["values"].items():
        for item, vs in items.items():
            if len(vs) >= MIN_PLACES:
                out.setdefault(item, {})[cc] = statistics.median(vs)
    return out


def independent(item, cc, carta):
    if item.startswith("bed."):
        return True
    return carta["anchor"].get(cc) in INDEPENDENT_ANCHORS


# ---------------------------------------------------------------------------
# Match
# ---------------------------------------------------------------------------

def match(refs, carta):
    med = country_medians(carta)
    by_item = {}
    for r in refs:
        by_item.setdefault(r["item"], []).append(r)
    out = []
    for item, rs in by_item.items():
        cm = med.get(item) or {}
        pivot_cc = [r["countries"][0] for r in rs if r["countries"][0] in EU27 and r["countries"][0] in cm]
        piv_ref = gmean([r["pli"] for r in rs if r["countries"][0] in pivot_cc])
        piv_car = gmean([cm[c] for c in pivot_cc])
        base_cm = {c: (carta["base"].get(c) or {}).get(item) for c in pivot_cc}
        piv_base = gmean([v for v in base_cm.values() if v]) if not item.startswith("bed.") else None
        for r in rs:
            cc = r["countries"][0]
            group = r["group"]
            v = cm.get(cc)
            res = {"id": r["id"], "country": cc, "item": item, "group": group, "cat": r["cat"],
                   "pli": r["pli"], "n_places": len((carta["values"].get(cc) or {}).get(item) or []),
                   "anchor": None if item.startswith("bed.") else carta["anchor"].get(cc)}
            ok = bool(v and piv_ref and piv_car)
            indep = independent(item, cc, carta)
            # A country Carta does not cover at all (TR) is out of scope, not a miss.
            in_scope = cc in carta["values"]
            res["flags"] = {"matched": ok if in_scope else None, "independent": indep if ok else None}
            res["facts"], res["rank"], res["error"] = {"level": None}, None, None
            if ok:
                ref_ix = 100 * r["pli"] / piv_ref
                car_ix = 100 * v / piv_car
                res.update(carta_eur=round(v, 2), ref_index=round(ref_ix, 1), carta_index=round(car_ix, 1),
                           ratio=round(car_ix / ref_ix, 4))
                b = (carta["base"].get(cc) or {}).get(item)
                if b and piv_base:
                    res["base_index"] = round(100 * b / piv_base, 1)
                if indep:
                    res["facts"] = {"level": abs(car_ix / ref_ix - 1) <= TOL[group]}
                    res["rank"] = (round(ref_ix, 2), round(car_ix, 2))
                    res["error"] = (round(ref_ix, 2), round(car_ix, 2))
                res["note"] = cause(res)
            else:
                res["note"] = ("not_in_catalogue" if not in_scope else "no_carta_price" if not v else "no_pivot")
            out.append(res)
    return out


def gap_size(r):
    return abs(math.log(r["ratio"])) if r.get("ratio") else 0.0


def cause(r):
    """A first cause code for a gap; the reviewer confirms or changes it."""
    ratio = r.get("ratio")
    if not ratio:
        return "no_carta_price"
    if abs(ratio - 1) <= TOL[r["group"]]:
        return "agrees"
    if r["group"] == "bed":
        if r["n_places"] < 10:
            return "bed_few_places"
        return "bed_tourist_mix_or_proxy"
    base = r.get("base_index")
    if base and r.get("ref_index") and abs(base / r["ref_index"] - 1) <= TOL[r["group"]] / 2:
        return "local_tilt"
    kind = r.get("anchor")
    if kind == "measured":
        return "measured_basket_differs"
    if kind == "legacy":
        return "legacy_basket"
    if kind == "city-anchored":
        return "city_anchor_pull"
    return "model_drift"


def gaps(results, n=GAPS_N):
    pick = sorted((r for r in results if r.get("ratio")), key=lambda r: (-gap_size(r), r["id"]))[:n]
    return [{"id": r["id"], "country": r["country"], "item": r["item"], "group": r["group"],
             "ref_index": r["ref_index"], "carta_index": r["carta_index"],
             "base_index": r.get("base_index"), "ratio": r["ratio"], "carta_eur": r["carta_eur"],
             "n_places": r["n_places"], "anchor": r.get("anchor"),
             "independent": r["flags"]["independent"], "cause_code": r["note"]} for r in pick]


def describe(ctx, carta):
    blob = ctx.get("_ref") or {}
    path = ctx.get("_ref_path") or REFERENCE
    try:
        path = str(Path(path).relative_to(ROOT))
    except ValueError:
        path = str(path)
    return {"reference": {"path": path, "source": blob.get("source"), "licence": blob.get("licence"),
                          "harvested": blob.get("harvested")},
            "carta": {"app_generated_at": carta["generated_at"], "places": carta["places"],
                      "food_asof": carta["food_asof"]}}


# ---------------------------------------------------------------------------
# Errors per country and category
# ---------------------------------------------------------------------------

def table(results):
    """{cc: {group: {'mdape', 'n', 'independent_n', 'median_ratio'}}} over matched items."""
    out = {}
    for r in results:
        if not r.get("ratio"):
            continue
        g = out.setdefault(r["country"], {}).setdefault(r["group"], {"ratios": [], "ind": 0})
        g["ratios"].append(r["ratio"])
        g["ind"] += bool(r["flags"]["independent"])
    for groups in out.values():
        for grp, g in groups.items():
            rs = g.pop("ratios")
            groups[grp] = {"median_ratio": round(statistics.median(rs), 3),
                           "mdape": round(statistics.median(abs(x - 1) for x in rs), 3),
                           "n": len(rs), "independent_n": g["ind"]}
    return dict(sorted(out.items()))


def group_summary(results):
    out = {}
    for grp in GROUPS:
        rs = [r for r in results if r["group"] == grp and r.get("ratio")]
        ind = [r for r in rs if r["flags"]["independent"]]
        out[grp] = {"matched": len(rs), "independent": len(ind),
                    "mdape_all": round(statistics.median(abs(r["ratio"] - 1) for r in rs), 3) if rs else None,
                    "mdape_independent": (round(statistics.median(abs(r["ratio"] - 1) for r in ind), 3)
                                          if ind else None),
                    "within_tol_independent": (round(sum(abs(r["ratio"] - 1) <= TOL[grp] for r in ind) / len(ind), 3)
                                               if ind else None)}
    return out


def table_markdown(tab, summary, at):
    lines = [f"# Prices against Eurostat price levels ({at})", "",
             ("Ratio = Carta's relative level / Eurostat's (both pivoted to the EU27 countries both sides have);"
              " 1.00 agrees. Median ratio per country and group, `*` where every item is built from the index"
              " itself (not counted in the facts)."), "",
             "| Group | Matched | Independent | MdAPE all | MdAPE independent | Within tolerance |",
             "|---|---|---|---|---|---|"]
    for g, s in summary.items():
        lines.append(f"| {g} (tol {int(TOL[g] * 100)}%) | {s['matched']} | {s['independent']} | {s['mdape_all']} "
                     f"| {s['mdape_independent']} | {s['within_tol_independent']} |")
    lines += ["", "| Country | " + " | ".join(GROUPS) + " |", "|---|" + "---|" * len(GROUPS)]
    for cc, groups in tab.items():
        cells = []
        for g in GROUPS:
            c = groups.get(g)
            cells.append("" if not c else f"{c['median_ratio']:.2f}{'' if c['independent_n'] else '*'}")
        lines.append(f"| {cc} | " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description="Prices validation helpers (T1190)")
    ap.add_argument("--refresh-reference", action="store_true")
    ap.add_argument("--table", action="store_true", help="write errors.json and errors.md")
    ap.add_argument("--out", default=str(OUT_DIR))
    a = ap.parse_args(argv)
    if a.refresh_reference:
        doc = refresh_reference(out=Path(a.out) / "reference_pli.json")
        print(f"reference: {sum(len(v) for v in doc['pli'].values())} levels, harvested {doc['harvested']}")
    if a.table:
        ctx = {"reference": Path(a.out) / "reference_pli.json"}
        res = match(references(ctx), load(ctx))
        tab, summ = table(res), group_summary(res)
        at = datetime.now(timezone.utc).date().isoformat()
        Path(a.out).mkdir(parents=True, exist_ok=True)
        (Path(a.out) / "errors.json").write_text(json.dumps({"groups": summ, "countries": tab}, indent=1) + "\n",
                                                 encoding="utf-8")
        (Path(a.out) / "errors.md").write_text(table_markdown(tab, summ, at), encoding="utf-8")
        for g, s in summ.items():
            print(g, s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
