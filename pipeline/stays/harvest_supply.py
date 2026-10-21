"""OpenStreetMap stays -> what exists in each town, and star class (ODbL).

One Overpass query per country for tourism=hotel|hostel|guest_house|motel|
apartment with their stars=* tag. Two uses:

  supply    per destination footprint: how many hostels, hotels per star class,
            guesthouses and apartments exist. A bed type with no supply is
            hidden in the app instead of being invented.
  stars     build_stays gives a Xotelo hotel the OSM star class of the OSM hotel
            with the same name within 150 m (Xotelo carries no star class).

Overpass returns an EMPTY result with a 'remark' on timeout (see memory
overpass-empty-on-timeout), so a remark is treated as a failure and retried.

Writes STATE/osm_stays.json {iso2: [[lat, lon, kind, stars, name], ...]}
and STATE/supply.json {dest_id: {hostel, guesthouse, apartment, hotel,
hotel1..hotel5}}.

Usage:  python pipeline/stays/harvest_supply.py [--countries IT,MT] [--refresh]
"""

import argparse
import re
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (STATE, USER_AGENT, footprint_km, haversine_km,  # noqa: E402
                    load_destinations, now_iso, read_json, write_json)

OVERPASS = "https://overpass-api.de/api/interpreter"
RAW = STATE / "osm_stays.json"
OUT = STATE / "supply.json"
KINDS = {"hotel": "hotel", "motel": "hotel", "hostel": "hostel",
         "guest_house": "guesthouse", "apartment": "apartment"}
STAR = re.compile(r"^\s*([1-5])(\.5)?\s*S?\s*$", re.I)

# OSM uses ISO 3166-1; Kosovo has no official code, OSM tags it XK.
QUERY = """[out:json][timeout:900];
area["ISO3166-1"="{cc}"][admin_level=2]->.a;
nwr["tourism"~"^(hotel|motel|hostel|guest_house|apartment)$"](area.a);
out center tags qt;"""


def stars_of(tags):
    m = STAR.match(tags.get("stars") or "")
    return int(m.group(1)) if m else None


def fetch(client, cc):
    for attempt in range(4):
        r = client.post(OVERPASS, data={"data": QUERY.format(cc=cc)})
        if r.status_code in (429, 502, 503, 504):
            time.sleep(60 * (attempt + 1))
            continue
        r.raise_for_status()
        body = r.json()
        if body.get("remark"):
            print(f"  {cc}: remark {body['remark'][:80]}, retrying")
            time.sleep(60 * (attempt + 1))
            continue
        rows = []
        for el in body.get("elements", []):
            t = el.get("tags") or {}
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if lat is None:
                continue
            rows.append([round(lat, 5), round(lon, 5), KINDS[t["tourism"]],
                         stars_of(t), t.get("name")])
        return rows
    raise RuntimeError(f"Overpass failed for {cc}")


def supply_for(dest, rows):
    fp = footprint_km(dest)
    s = {"hostel": 0, "guesthouse": 0, "apartment": 0, "hotel": 0}
    for k in range(1, 6):
        s[f"hotel{k}"] = 0
    for lat, lon, kind, st, _ in rows:
        if abs(lat - dest["lat"]) > 0.12 or abs(lon - dest["lon"]) > 0.18:
            continue
        if haversine_km(dest["lat"], dest["lon"], lat, lon) > fp:
            continue
        s[kind] += 1
        if kind == "hotel" and st:
            s[f"hotel{st}"] += 1
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--countries", default="")
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    dests = load_destinations()
    want = [c for c in a.countries.split(",") if c] or \
        sorted({d["iso2"] for d in dests})
    raw = read_json(RAW, {}) or {}
    client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=1000)
    for cc in want:
        if cc in raw and not a.refresh:
            continue
        try:
            raw[cc] = fetch(client, cc)
        except Exception as e:  # keep going: one country must not sink the run
            print(f"{cc}: {e}")
            continue
        print(f"{cc}: {len(raw[cc])} stays, "
              f"{sum(1 for r in raw[cc] if r[3])} with stars", flush=True)
        write_json(RAW, raw, compact=True)
        time.sleep(10)
    supply = {d["id"]: supply_for(d, raw.get(d["iso2"], []))
              for d in dests if d["iso2"] in raw}
    write_json(OUT, {"captured": now_iso(), "dests": supply})
    print(f"supply for {len(supply)} destinations")


if __name__ == "__main__":
    main()
