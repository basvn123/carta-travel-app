"""harvest_bathing_water.py - real bathing-water quality per destination.

A new open data layer on top of the beach/coast catalogue, independent of
Wikipedia/OSM: the European Environment Agency's WISE Bathing Water Quality
database (Bathing Water Directive 2006/7/EC). It classifies ~22,000 official
EU + EEA bathing sites - coastal beaches, lakes and rivers - into four classes
(Excellent / Good / Sufficient / Poor) from a rolling four-season sample window.

For every destination we find the official bathing waters within RADIUS_KM of
its centre and store a summary under dest["bathing_water"]:

    rating        median class of the nearby classified sites (the headline)
    excellent_pct share of nearby sites rated Excellent in the latest year
    n_sites       classified bathing waters within the radius
    counts        {Excellent, Good, Sufficient, Poor} tallies
    water_types   which of Coastal / Lake / River / Transitional are present
    nearest       the single closest site (name, class, dist, type, profile URL)
    trend         improving / stable / declining vs three years earlier
    year          reference bathing season
    source        eea_wise_<year>

Inland cities with no official bathing water within the radius get no block -
we never invent a rating. Lake and river destinations (Bled, Titisee,
Hallstatt, Bohinj) benefit as much as beaches.

Idempotent + resumable: the full site list is cached in
cache/eea_bathing_water.json, so re-runs only re-match (no re-download unless
--refresh). Patches app_data.json master; sync-data.mjs ships it to the app.
ASCII-clean, no em dashes, per project style.

Usage:
    python harvest_bathing_water.py            # download-if-needed, match, apply
    python harvest_bathing_water.py --refresh  # force re-download of the EEA data
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from math import radians
from pathlib import Path

import numpy as np
from pipeline_io import atomic_write_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "eea_bathing_water.json"

UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; data@carta-europetravel.com)"}

# EEA discomap ArcGIS REST - the 2025 bathing season point layer (id 3).
YEAR = 2025
LAYER = (
    "https://water.discomap.eea.europa.eu/arcgis/rest/services/"
    f"BathingWater/BathingWater_Dyna_WM_{YEAR}/MapServer/3/query"
)
PAGE = 2000                      # ArcGIS maxRecordCount for this layer
RADIUS_KM = 15.0                 # "beaches you would actually swim at" catchment
BACKOFFS = [5, 15, 40]

# Directive classes, ordered worst..best so a numeric median maps back cleanly.
CLASS_SCORE = {"Poor": 1, "Sufficient": 2, "Good": 3, "Excellent": 4}
SCORE_CLASS = {v: k for k, v in CLASS_SCORE.items()}


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def http(url):
    for i, back in enumerate([0] + BACKOFFS):
        if back:
            time.sleep(back)
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if i == len(BACKOFFS):
                print(f"    ! give up: {e}")
                return None
    return None


# --------------------------------------------------------------------------- #
# 1. Download the full EEA bathing-water list (cached)                         #
# --------------------------------------------------------------------------- #
def download_sites():
    """Page through every bathing water, keeping only what we summarise."""
    out = []
    offset = 0
    # bathingWaterIdentifier is the registry's own stable key, and it is what
    # the beach layer's EEA spine builds its row ids from: a site that moves a
    # few metres between seasons must not become a different beach and orphan
    # somebody's saved favourite (pipeline/beaches/eea_spine.py).
    #
    # The ten year class history is asked for as well. The Directive class is
    # a four season rolling window, so minus1 is what says whether this site
    # is on the way up or the way down, and minus10 is what says whether a
    # Poor reading is this site's character or one bad summer.
    fields = ",".join([
        "bathingWaterIdentifier",
        "bathingWaterName", "countryName", "countryCode", "bwWaterCategory",
        "latitude", "longitude", "qualityStatus",
        "qualityStatus_minus1", "qualityStatus_minus2", "qualityStatus_minus3",
        "qualityStatus_minus10",
        "bwProfileLink",
    ])
    while True:
        q = {
            "where": "1=1",
            "outFields": fields,
            "returnGeometry": "false",
            "orderByFields": "OBJECTID",       # stable paging for resultOffset
            "resultOffset": str(offset),
            "resultRecordCount": str(PAGE),
            "f": "json",
        }
        j = http(LAYER + "?" + urllib.parse.urlencode(q))
        feats = (j or {}).get("features") or []
        if not feats:
            break
        for f in feats:
            a = f["attributes"]
            lat, lon = a.get("latitude"), a.get("longitude")
            if lat is None or lon is None:
                continue
            out.append({
                # The registry key. Additive: every consumer that predates it
                # reads the rest of the row exactly as before.
                "bwid": (a.get("bathingWaterIdentifier") or "").strip(),
                "name": (a.get("bathingWaterName") or "").strip(),
                "country": a.get("countryName"),
                "iso2": a.get("countryCode"),
                "type": a.get("bwWaterCategory"),      # Coastal / Lake / River / Transitional
                "lat": float(lat),
                "lon": float(lon),
                "q": a.get("qualityStatus"),           # latest season
                "q1": a.get("qualityStatus_minus1"),   # last season, the direction
                "q3": a.get("qualityStatus_minus3"),   # three seasons earlier
                "q10": a.get("qualityStatus_minus10"), # ten seasons, the character
                "profile": a.get("bwProfileLink"),
            })
        print(f"  downloaded {len(out)} sites...")
        offset += len(feats)
        if len(feats) < PAGE:
            break
        time.sleep(0.3)
    return out


def load_sites(refresh):
    if CACHE.exists() and not refresh:
        sites = load(CACHE)
        print(f"EEA cache: {len(sites)} bathing-water sites (cache/{CACHE.name})")
        return sites
    print(f"Downloading EEA WISE {YEAR} bathing-water sites (ArcGIS, paged)...")
    sites = download_sites()
    CACHE.parent.mkdir(exist_ok=True)
    atomic_write_json(CACHE, sites, indent=None, ensure_ascii=False)
    print(f"EEA download: {len(sites)} sites -> cache/{CACHE.name}")
    return sites


# --------------------------------------------------------------------------- #
# 2. Match sites to destinations (vectorised haversine)                        #
# --------------------------------------------------------------------------- #
def summarise(dests, sites):
    slat = np.radians(np.array([s["lat"] for s in sites]))
    slon = np.radians(np.array([s["lon"] for s in sites]))
    R = 6371.0

    matched = 0
    for d in dests.values():
        lat = d.get("city_lat") or d.get("lat")
        lon = d.get("city_lon") or d.get("lon")
        if lat is None or lon is None:
            continue
        p1, l1 = radians(lat), radians(lon)
        dlat = slat - p1
        dlon = slon - l1
        a = np.sin(dlat / 2) ** 2 + np.cos(p1) * np.cos(slat) * np.sin(dlon / 2) ** 2
        dist = 2 * R * np.arcsin(np.sqrt(a))
        idx = np.where(dist <= RADIUS_KM)[0]
        if len(idx) == 0:
            d.pop("bathing_water", None)      # keep re-runs clean
            continue

        near = [(sites[i], float(dist[i])) for i in idx]
        near.sort(key=lambda t: t[1])

        counts = {"Excellent": 0, "Good": 0, "Sufficient": 0, "Poor": 0}
        scores, deltas, types = [], [], set()
        for s, _ in near:
            if s["type"]:
                types.add(s["type"])
            q = s["q"]
            if q in CLASS_SCORE:
                counts[q] += 1
                scores.append(CLASS_SCORE[q])
                if s["q3"] in CLASS_SCORE:
                    deltas.append(CLASS_SCORE[q] - CLASS_SCORE[s["q3"]])
        if not scores:
            d.pop("bathing_water", None)
            continue

        rating = SCORE_CLASS[int(round(float(np.median(scores))))]
        excellent_pct = round(100 * counts["Excellent"] / len(scores))

        trend = "stable"
        if deltas:
            avg = sum(deltas) / len(deltas)
            trend = "improving" if avg > 0.25 else "declining" if avg < -0.25 else "stable"

        # nearest classified site for the "closest beach" hint
        nearest = None
        for s, dkm in near:
            if s["q"] in CLASS_SCORE:
                nearest = {
                    "name": s["name"],
                    "class": s["q"],
                    "dist_km": round(dkm, 1),
                    "type": s["type"],
                    "profile": s["profile"] or None,
                }
                break

        d["bathing_water"] = {
            "rating": rating,
            "excellent_pct": excellent_pct,
            "n_sites": len(scores),
            "counts": {k: v for k, v in counts.items() if v},
            "water_types": sorted(types),
            "nearest": nearest,
            "trend": trend,
            "radius_km": int(RADIUS_KM),
            "year": YEAR,
            "source": f"eea_wise_{YEAR}",
        }
        matched += 1
    return matched


# --------------------------------------------------------------------------- #
def main():
    refresh = "--refresh" in sys.argv[1:]
    # --sites-only refreshes cache/eea_bathing_water.json and stops. The beach
    # layer reads that cache as a SPINE (every site is a place a European
    # government says people swim), and it must be able to pull a fresh copy
    # without this script also rewriting the 68 MB catalogue master, which is
    # a different writer with a different cadence.
    if "--sites-only" in sys.argv[1:]:
        sites = load_sites(refresh or "--sites-only" in sys.argv[1:])
        with_id = sum(1 for s in sites if s.get("bwid"))
        print(f"  {len(sites)} sites cached, {with_id} carry a registry id")
        return
    sites = load_sites(refresh)
    data = load(MASTER)
    dests = data["destinations"]

    matched = summarise(dests, sites)
    print(f"Matched: {matched} destinations carry a bathing_water block "
          f"(within {int(RADIUS_KM)} km of an official EEA site)")

    # a quick sanity breakdown
    by_rating = {}
    for d in dests.values():
        bw = d.get("bathing_water")
        if bw:
            by_rating[bw["rating"]] = by_rating.get(bw["rating"], 0) + 1
    print("  by rating:", dict(sorted(by_rating.items())))

    data["meta"].setdefault("data_sources", {})["eea_bathing_water"] = {
        "provider": f"European Environment Agency - WISE Bathing Water Quality {YEAR}",
        "license": "EEA open data (free reuse with attribution)",
        "used_for": "per-destination water-quality rating for nearby coastal/lake/river bathing sites",
        "directive": "Bathing Water Directive 2006/7/EC",
        "radius_km": int(RADIUS_KM),
    }

    atomic_write_json(MASTER, data, indent=None, ensure_ascii=False)
    print(f"  wrote {MASTER}")
    print("done. Run `npm run data` (or dev/build) to ship it to the app.")


if __name__ == "__main__":
    main()
