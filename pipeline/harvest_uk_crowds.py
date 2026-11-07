"""harvest_uk_crowds.py - monthly crowds for places Eurostat does not cover (D11).

Tier: Scheduled (run_pipeline task crowding_uk), after crowding.

Eurostat tour_occ_nin3 / tour_occ_nin2m (see harvest_tourism_density.py) leave out
the UK and a few non-EU places. This module fills dest.crowding for them with the
SAME method and output shape, from an open national source:

  GB  ONS / VisitBritain monthly nights by region (ITL 1, 12 regions), matched to
      places by point-in-polygon on ONS ITL1 boundaries (Open Geography Portal).
  BA, FO, MD, XK  national monthly nights from the national statistics office,
      matched by the place's iso2 (one region per country).

Method (identical to the Eurostat layer, imported from it, not copied):
  density = annual nights / land area (km2)
  tier    = density against the Eurostat cutoffs in meta.crowding_model
            (so a UK tier 3 means the same as a Spanish tier 3)
  monthly = month_tier(annual tier, month share), rule t649-v1

Input, one long CSV the owner prepares from the published tables (see
docs/HANDBOOK.md "Crowds by month", Owner step): cache/uk_crowds_nights.csv
    geo,name,year,month,nights
    TLC,North East,2023,1,812000
geo is an ITL1 code (TLC..TLN, TLM Scotland, TLL Wales) or an iso2 (BA FO MD XK).
Only years with all 12 months count; the last three such years are averaged.

A place that already has a crowding block (Eurostat) is never overwritten.
Idempotent. ASCII-clean, no em dashes.

Usage:
    python pipeline/harvest_uk_crowds.py [--csv PATH] [--geo PATH]
"""
import csv
import json
import sys
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harvest_tourism_density import (
    MASTER,
    MONTHLY_MAX_YEARS,
    RULE_VERSION,
    TIER_LABELS,
    month_tier,
    polygon_area_km2,
)
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "cache" / "uk_crowds_nights.csv"
GEO_PATH = ROOT / "cache" / "uk_itl1_boundaries.geojson"

# Land area in km2 for the one-region-per-country places (national statistics offices).
COUNTRY_AREA_KM2 = {"BA": 51209, "FO": 1393, "MD": 33846, "XK": 10887}
CODE_KEYS = ("ITL121CD", "ITL125CD", "ITL1CD", "NUTS_ID", "code")
NAME_KEYS = ("ITL121NM", "ITL125NM", "ITL1NM", "NUTS_NAME", "name")
SOURCE = "ons_visitbritain_itl1"
SOURCE_NATIONAL = "national_statistics_office"


def tier_of(density, cuts):
    return 3 if density >= cuts[2] else 2 if density >= cuts[1] else 1 if density >= cuts[0] else 0


def read_nights(path):
    """{geo: {"share": [12], "years": [...], "name": str, "nights": float}} from the long CSV."""
    by = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            try:
                geo, yr, mo = row["geo"].strip(), int(row["year"]), int(row["month"])
                n = float(row["nights"])
            except (KeyError, ValueError, AttributeError):
                continue
            if not geo or not 1 <= mo <= 12 or n < 0:
                continue
            g = by.setdefault(geo, {"name": (row.get("name") or geo).strip(), "years": {}})
            g["years"].setdefault(yr, {})[mo] = n
    out = {}
    for geo, g in by.items():
        shares, used, totals = [], [], []
        for yr in sorted(g["years"], reverse=True):
            ym = g["years"][yr]
            if len(ym) == 12 and sum(ym.values()) > 0:
                tot = sum(ym.values())
                shares.append([ym[m] / tot for m in range(1, 13)])
                used.append(yr)
                totals.append(tot)
            if len(used) >= MONTHLY_MAX_YEARS:
                break
        if shares:
            avg = [sum(c) / len(shares) for c in zip(*shares)]
            out[geo] = {"share": [round(x, 5) for x in avg], "years": sorted(used),
                        "name": g["name"], "nights": totals[0]}   # newest complete year
    return out


def build_regions(nights, geo_json):
    """Polygon regions (UK ITL1) with density; plus country-level entries."""
    regions = []
    for feat in (geo_json or {}).get("features", []):
        p = feat["properties"]
        code = next((p[k] for k in CODE_KEYS if p.get(k)), None)
        rec = nights.get(code)
        area = polygon_area_km2(feat["geometry"]) if rec else 0
        if rec and area > 0:
            name = next((p[k] for k in NAME_KEYS if p.get(k)), rec["name"])
            regions.append({"code": code, "name": name, "density": rec["nights"] / area,
                            "rec": rec, "geom": shape(feat["geometry"]), "source": SOURCE})
    countries = {}
    for cc, area in COUNTRY_AREA_KM2.items():
        rec = nights.get(cc)
        if rec:
            countries[cc] = {"code": cc, "name": rec["name"], "density": rec["nights"] / area,
                             "rec": rec, "source": SOURCE_NATIONAL}
    return regions, countries


def _crowding(region, cuts):
    tier = tier_of(region["density"], cuts)
    rec = region["rec"]
    return {
        "nights_per_km2": round(region["density"]),
        "tier": tier,
        "label": TIER_LABELS[tier],
        "nuts3": region["code"],
        "region": region["name"],
        "year": rec["years"][-1],
        "source": region["source"],
        "monthly": {
            "share": rec["share"],
            "tier": [month_tier(tier, x) for x in rec["share"]],
            "geo": region["code"],
            "years": rec["years"],
            "source": region["source"],
            "rule": RULE_VERSION,
        },
    }


def apply(dests, regions, countries, cuts):
    """Fill dest.crowding where absent. Returns {geo: places filled}."""
    geoms = [r["geom"] for r in regions]
    tree = STRtree(geoms) if geoms else None
    filled = {}
    for d in dests.values():
        if d.get("crowding"):
            continue
        region = None
        if d.get("iso2") in countries:
            region = countries[d["iso2"]]
        elif tree is not None and d.get("iso2") in ("GB", "UK"):
            lat = d.get("city_lat") or d.get("lat")
            lon = d.get("city_lon") or d.get("lon")
            if lat is None or lon is None:
                continue
            pt = Point(lon, lat)
            for i in tree.query(pt):
                if geoms[int(i)].contains(pt):
                    region = regions[int(i)]
                    break
            if region is None:                      # coast just outside the generalised line
                j = int(tree.nearest(pt))
                if geoms[j].distance(pt) < 0.07:
                    region = regions[j]
        if region is None:
            continue
        d["crowding"] = _crowding(region, cuts)
        filled[region["code"]] = filled.get(region["code"], 0) + 1
    return filled


def main():
    args = sys.argv[1:]
    csv_path = Path(args[args.index("--csv") + 1]) if "--csv" in args else CSV_PATH
    geo_path = Path(args[args.index("--geo") + 1]) if "--geo" in args else GEO_PATH
    if not csv_path.exists():
        print(f"No {csv_path}: nothing to do (owner step: prepare the nights CSV).")
        return 0
    data = json.loads(MASTER.read_text(encoding="utf-8"))
    cuts = data["meta"]["crowding_model"]["tier_cutoffs_nights_per_km2"]
    nights = read_nights(csv_path)
    geo_json = json.loads(geo_path.read_text(encoding="utf-8")) if geo_path.exists() else None
    regions, countries = build_regions(nights, geo_json)
    filled = apply(data["destinations"], regions, countries, cuts)
    print(f"Regions {len(regions)} UK, {len(countries)} national; places filled: {sum(filled.values())}")
    for k, v in sorted(filled.items()):
        print(f"  {k}: {v}")
    data["meta"].setdefault("data_sources", {})["uk_crowds"] = {
        "provider": "ONS / VisitBritain regional nights (GB); national statistics offices (BA, FO, MD, XK)",
        "license": "Open Government Licence v3.0 (GB); national terms for the others, see HANDBOOK",
        "used_for": "monthly crowd tier where Eurostat has no region",
    }
    atomic_write_json(MASTER, data, indent=None, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
