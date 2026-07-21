"""harvest_tourism_density.py - a crowding / tourism-density layer.

Implements the JRC European Tourism Dashboard's Tourism Density indicator
(TD = nights spent / land area) at NUTS 3 (province) level, from two official
Eurostat open sources - independent of the fame/rating signals the app already
has (pageviews, hidden_gem, curated tourist_premium honeypots):

  1. tour_occ_nin3  - nights spent at tourist accommodation, per NUTS 3 region
                      (Eurostat JSON API, latest available year per region).
  2. NUTS 3 boundaries (GISCO 2021, 1:10M, EPSG:4326 GeoJSON) - used both for
     point-in-polygon (which province is a destination in?) and to compute each
     region's land area with a spherical-polygon formula (no projection dep).

density = nights / area_km2. Regions are ranked into four tiers by the
log-density distribution (quiet / moderate / busy / crowded). Each destination
is placed in its NUTS 3 region by point-in-polygon (shapely STRtree, with a
small nearest-region fallback for coastal points just outside the generalised
boundary) and gets:

    "crowding": {
      "nights_per_km2": 4210,     // regional tourism density (int)
      "tier": 3,                  // 0 quiet | 1 moderate | 2 busy | 3 crowded
      "label": "Crowded",
      "nuts3": "ES511",           // region code
      "region": "Barcelona",      // region name
      "year": 2024,               // reference year of the nights figure
      "source": "jrc_eurostat_nuts3"
    }

meta.crowding_model records the tier cutoffs and provenance. Idempotent +
cached (cache/eurostat_nights_nuts3.json, cache/nuts3_2021.geojson). Patches
app_data.json master; sync-data.mjs ships it. ASCII-clean, no em dashes.

Usage:
    python harvest_tourism_density.py            # download-if-needed, match, apply
    python harvest_tourism_density.py --refresh  # force re-download of both sources
"""
import json
import math
import sys
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
NIGHTS_CACHE = ROOT / "cache" / "eurostat_nights_nuts3.json"
GEO_CACHE = ROOT / "cache" / "nuts3_2021.geojson"

UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; bas.vannieuwenhuyse123@gmail.com)"}
NIGHTS_URL = (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
    "tour_occ_nin3?format=JSON&lang=EN&c_resid=TOTAL&unit=NR&nace_r2=I551-I553"
)
GEO_URL = (
    "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/"
    "NUTS_RG_10M_2021_4326_LEVL_3.geojson"
)
R_EARTH = 6371.0088  # km
TIER_LABELS = {0: "Quiet", 1: "Moderate", 2: "Busy", 3: "Crowded"}


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def http_bytes(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


# --------------------------------------------------------------------------- #
# 1. Eurostat nights per NUTS 3 (latest year with data)                        #
# --------------------------------------------------------------------------- #
def load_nights(refresh):
    if NIGHTS_CACHE.exists() and not refresh:
        return load(NIGHTS_CACHE)
    print("Downloading Eurostat nights per NUTS 3 (tour_occ_nin3)...")
    raw = json.loads(http_bytes(NIGHTS_URL).decode("utf-8"))
    geo_idx = raw["dimension"]["geo"]["category"]["index"]        # code -> row
    geo_lbl = raw["dimension"]["geo"]["category"]["label"]
    time_idx = raw["dimension"]["time"]["category"]["index"]      # year -> col
    years = sorted(time_idx, key=lambda y: time_idx[y])
    n_time = len(years)
    values = raw["value"]                                        # {flatidx: val}, sparse

    out = {}
    for code, gi in geo_idx.items():
        if len(code) != 5:            # NUTS 3 codes are 5 chars (CC + 3)
            continue
        best_year, best_val = None, None
        for yr in reversed(years):    # newest first
            flat = gi * n_time + time_idx[yr]
            v = values.get(str(flat))
            if v is not None:
                best_year, best_val = int(yr), float(v)
                break
        if best_val is not None:
            out[code] = {"nights": best_val, "year": best_year, "name": geo_lbl.get(code)}
    NIGHTS_CACHE.parent.mkdir(exist_ok=True)
    NIGHTS_CACHE.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"  nights: {len(out)} NUTS 3 regions with data -> cache/{NIGHTS_CACHE.name}")
    return out


# --------------------------------------------------------------------------- #
# 2. NUTS 3 boundaries + spherical land area                                   #
# --------------------------------------------------------------------------- #
def load_geo(refresh):
    if GEO_CACHE.exists() and not refresh:
        return load(GEO_CACHE)
    print("Downloading GISCO NUTS 3 2021 boundaries (GeoJSON)...")
    GEO_CACHE.parent.mkdir(exist_ok=True)
    GEO_CACHE.write_bytes(http_bytes(GEO_URL))
    print(f"  boundaries -> cache/{GEO_CACHE.name}")
    return load(GEO_CACHE)


def _ring_area_km2(coords):
    """Signed spherical area of one lon/lat ring (km^2)."""
    if len(coords) < 4:
        return 0.0
    lon = np.radians([c[0] for c in coords])
    lat = np.radians([c[1] for c in coords])
    # standard spherical shoelace
    lon2 = np.roll(lon, -1)
    lat2 = np.roll(lat, -1)
    total = np.sum((lon2 - lon) * (2 + np.sin(lat) + np.sin(lat2)))
    return abs(total) * R_EARTH * R_EARTH / 2.0


def polygon_area_km2(geom_json):
    """Land area of a (Multi)Polygon GeoJSON geometry, holes subtracted."""
    t = geom_json["type"]
    polys = geom_json["coordinates"] if t == "MultiPolygon" else [geom_json["coordinates"]]
    area = 0.0
    for poly in polys:
        if not poly:
            continue
        area += _ring_area_km2(poly[0])                 # exterior
        for hole in poly[1:]:
            area -= _ring_area_km2(hole)                # interiors
    return area


# --------------------------------------------------------------------------- #
# 3. Density, tiers, point-in-polygon match                                    #
# --------------------------------------------------------------------------- #
def build_regions(nights, geo):
    """Per NUTS 3: geometry, density, name. Only regions with nights data."""
    regions = []
    for feat in geo["features"]:
        code = feat["properties"].get("NUTS_ID") or feat["properties"].get("id")
        rec = nights.get(code)
        if not rec:
            continue
        area = polygon_area_km2(feat["geometry"])
        if area <= 0:
            continue
        regions.append({
            "code": code,
            "name": rec["name"] or feat["properties"].get("NUTS_NAME") or code,
            "density": rec["nights"] / area,
            "year": rec["year"],
            "geom": shape(feat["geometry"]),
        })
    return regions


def assign_tiers(regions):
    """Four tiers from the log-density distribution (25/50/75 percentiles)."""
    dens = np.array([r["density"] for r in regions])
    logd = np.log1p(dens)
    cuts = [float(np.percentile(logd, p)) for p in (25, 50, 75)]
    for r in regions:
        ld = math.log1p(r["density"])
        r["tier"] = 3 if ld >= cuts[2] else 2 if ld >= cuts[1] else 1 if ld >= cuts[0] else 0
    return [float(math.expm1(c)) for c in cuts]      # cutoffs back in density units


def match_destinations(dests, regions):
    geoms = [r["geom"] for r in regions]
    tree = STRtree(geoms)                              # shapely 2.x: query returns indices
    matched = 0
    for d in dests.values():
        lat = d.get("city_lat") or d.get("lat")
        lon = d.get("city_lon") or d.get("lon")
        if lat is None or lon is None:
            d.pop("crowding", None)
            continue
        pt = Point(lon, lat)
        cand = tree.query(pt)                          # bbox candidates (indices)
        region = None
        for i in np.atleast_1d(cand):
            if geoms[int(i)].contains(pt):
                region = regions[int(i)]
                break
        if region is None:
            # coastal point just outside the generalised boundary: nearest region
            near = tree.nearest(pt)
            j = int(np.atleast_1d(near)[0])
            if geoms[j].distance(pt) < 0.07:           # ~<8 km in degrees
                region = regions[j]
        if region is None:
            d.pop("crowding", None)
            continue
        d["crowding"] = {
            "nights_per_km2": int(round(region["density"])),
            "tier": region["tier"],
            "label": TIER_LABELS[region["tier"]],
            "nuts3": region["code"],
            "region": region["name"],
            "year": region["year"],
            "source": "jrc_eurostat_nuts3",
        }
        matched += 1
    return matched


# --------------------------------------------------------------------------- #
def main():
    refresh = "--refresh" in sys.argv[1:]
    nights = load_nights(refresh)
    geo = load_geo(refresh)
    regions = build_regions(nights, geo)
    print(f"Regions: {len(regions)} NUTS 3 with density (nights + area)")
    cuts = assign_tiers(regions)
    print(f"  tier cutoffs (nights/km2): "
          f"quiet<{cuts[0]:.0f}<=moderate<{cuts[1]:.0f}<=busy<{cuts[2]:.0f}<=crowded")

    data = load(MASTER)
    dests = data["destinations"]
    matched = match_destinations(dests, regions)
    print(f"Matched: {matched} destinations carry a crowding block")

    by_tier = {}
    for d in dests.values():
        c = d.get("crowding")
        if c:
            by_tier[c["label"]] = by_tier.get(c["label"], 0) + 1
    print("  by tier:", {k: by_tier.get(k, 0) for k in TIER_LABELS.values()})

    data["meta"]["crowding_model"] = {
        "indicator": "JRC Tourism Density (nights spent / land area) at NUTS 3",
        "tier_cutoffs_nights_per_km2": [round(c, 1) for c in cuts],
        "tier_labels": TIER_LABELS,
        "level": "NUTS 3 (province)",
    }
    data["meta"].setdefault("data_sources", {})["tourism_density"] = {
        "provider": "Eurostat (tour_occ_nin3 nights + GISCO NUTS 3 boundaries), JRC EU Tourism Dashboard indicator",
        "license": "Eurostat / GISCO open data (free reuse with attribution)",
        "used_for": "regional crowding tier (quiet..crowded) per destination",
    }

    MASTER.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {MASTER}")
    print("done. Run `npm run data` (or dev/build) to ship it to the app.")


if __name__ == "__main__":
    main()
