"""harvest_geonames.py - real settlement size per destination (GeoNames).

A population / settlement-class layer independent of the fame signals the app
already carries (pageviews, curated appeal, crowding). GeoNames is the largest
open gazetteer - 25M+ names, CC BY 4.0 - and its populated-place records give
each town an official population, a feature class (city / town / village) and
elevation.

We download the cities500 dump (every populated place with population >= 500,
~200k rows worldwide) once into cache/geonames_cities500.txt, then match every
destination to the best nearby populated place: nearest within RADIUS_KM, with a
name-similarity tie-break so "Split" the city wins over a hamlet 8 km away that
happens to be marginally closer. Each matched destination gets:

    "geonames": {
      "population": 178102,       // official population of the settlement
      "settlement": "city",       // city | town | village (from feature_code)
      "elevation_m": 24,          // dem/elevation (m), when known
      "timezone": "Europe/Zagreb",
      "name": "Split",            // the matched GeoNames toponym
      "admin1": "13",             // admin-1 code (region)
      "dist_km": 0.6,             // how far the match is from our centre
      "geonameid": 3190261,
      "source": "geonames_cities500"
    }

Destinations with no populated place within the radius (a remote beach, a pass)
get no block - we never invent a population. Idempotent + resumable: the dump is
cached, so re-runs only re-match. Patches app_data.json master; sync-data.mjs
ships it. ASCII-clean, no em dashes, per project style.

Usage:
    python harvest_geonames.py            # download-if-needed, match, apply
    python harvest_geonames.py --refresh  # force re-download of the dump
"""
import io
import json
import sys
import urllib.error
import urllib.request
import zipfile
from math import radians
from pathlib import Path

import numpy as np

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
MASTER = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "geonames_cities500.txt"

UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; bas.vannieuwenhuyse123@gmail.com)"}
DUMP_URL = "https://download.geonames.org/export/dump/cities500.zip"
RADIUS_KM = 12.0                 # a destination centre and its town are close

# GeoNames feature_code (class P = populated place) -> our coarse settlement tag.
# PPL* variants collapse to city / town / village by capital/seat/population.
CITY_CODES = {"PPLC", "PPLA", "PPLA2", "PPLG"}   # capitals + admin seats = city
VILLAGE_CODES = {"PPLL", "PPLX", "PPLF", "PPLH", "PPLW", "PPLQ", "PPLS"}


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def http_bytes(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


# --------------------------------------------------------------------------- #
# 1. Download + cache the cities500 dump (tab-separated GeoNames format)        #
# --------------------------------------------------------------------------- #
def download_dump():
    print("Downloading GeoNames cities500 dump (zip)...")
    blob = http_bytes(DUMP_URL)
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        txt = z.read("cities500.txt").decode("utf-8")
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(txt, encoding="utf-8")
    print(f"  cities500 -> cache/{CACHE.name} ({len(txt)//1024} KB)")
    return txt


def load_places(refresh):
    if CACHE.exists() and not refresh:
        txt = CACHE.read_text(encoding="utf-8")
    else:
        txt = download_dump()
    places = []
    for line in txt.splitlines():
        f = line.split("\t")
        if len(f) < 19:
            continue
        try:
            lat = float(f[4]); lon = float(f[5])
        except ValueError:
            continue
        try:
            pop = int(f[14]) if f[14] else 0
        except ValueError:
            pop = 0
        try:
            elev = int(f[15]) if f[15] else (int(f[16]) if f[16] else None)
        except ValueError:
            elev = None
        places.append({
            "id": f[0],
            "name": f[1],
            "ascii": (f[2] or f[1]).lower(),
            "lat": lat, "lon": lon,
            "fcode": f[7],
            "iso2": f[8],
            "admin1": f[10],
            "pop": pop,
            "elev": elev,
            "tz": f[17],
        })
    print(f"GeoNames: {len(places)} populated places (pop >= 500)")
    return places


def settlement_tag(fcode, pop):
    if fcode in CITY_CODES or pop >= 100_000:
        return "city"
    if fcode in VILLAGE_CODES or pop < 5_000:
        return "village"
    return "town"


# --------------------------------------------------------------------------- #
# 2. Match each destination to the best nearby populated place                 #
# --------------------------------------------------------------------------- #
def _norm(s):
    return "".join(c for c in (s or "").lower() if c.isalnum())


def match(dests, places):
    plat = np.radians(np.array([p["lat"] for p in places]))
    plon = np.radians(np.array([p["lon"] for p in places]))
    pnorm = [_norm(p["name"]) for p in places]
    R = 6371.0

    matched = 0
    for d in dests.values():
        lat = d.get("city_lat") or d.get("lat")
        lon = d.get("city_lon") or d.get("lon")
        if lat is None or lon is None:
            d.pop("geonames", None)
            continue
        p1, l1 = radians(lat), radians(lon)
        dlat = plat - p1
        dlon = plon - l1
        a = np.sin(dlat / 2) ** 2 + np.cos(p1) * np.cos(plat) * np.sin(dlon / 2) ** 2
        dist = 2 * R * np.arcsin(np.sqrt(a))
        idx = np.where(dist <= RADIUS_KM)[0]
        if len(idx) == 0:
            d.pop("geonames", None)
            continue

        dname = _norm(d.get("city") or d.get("name") or "")
        # Score candidates: closer is better, exact/substring name match is a big
        # bonus, larger population breaks remaining ties (pick the real town).
        best, best_score = None, -1e18
        for i in idx:
            dkm = float(dist[i])
            pn = pnorm[i]
            name_bonus = 0.0
            if dname and pn:
                if pn == dname:
                    name_bonus = 40.0
                elif dname in pn or pn in dname:
                    name_bonus = 20.0
            score = name_bonus - dkm + min(places[i]["pop"], 500_000) / 500_000.0
            if score > best_score:
                best_score, best = score, (i, dkm)
        i, dkm = best
        p = places[i]
        d["geonames"] = {
            "population": p["pop"],
            "settlement": settlement_tag(p["fcode"], p["pop"]),
            "elevation_m": p["elev"],
            "timezone": p["tz"] or None,
            "name": p["name"],
            "admin1": p["admin1"] or None,
            "dist_km": round(dkm, 1),
            "geonameid": int(p["id"]),
            "source": "geonames_cities500",
        }
        matched += 1
    return matched


# --------------------------------------------------------------------------- #
def main():
    refresh = "--refresh" in sys.argv[1:]
    places = load_places(refresh)
    data = load(MASTER)
    dests = data["destinations"]

    matched = match(dests, places)
    print(f"Matched: {matched}/{len(dests)} destinations carry a geonames block")

    by_tag = {}
    for d in dests.values():
        g = d.get("geonames")
        if g:
            by_tag[g["settlement"]] = by_tag.get(g["settlement"], 0) + 1
    print("  by settlement:", {k: by_tag.get(k, 0) for k in ("city", "town", "village")})

    data["meta"].setdefault("data_sources", {})["geonames"] = {
        "provider": "GeoNames geographical database (cities500 dump)",
        "license": "CC BY 4.0",
        "used_for": "official population, settlement class and elevation per destination",
    }

    MASTER.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {MASTER}")
    print("done. Run `npm run data` (or dev/build) to ship it to the app.")


if __name__ == "__main__":
    main()
