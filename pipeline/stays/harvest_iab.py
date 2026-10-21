"""Inside Airbnb listings -> Airbnb prices per destination (CC BY 4.0).

Reads every European listings.csv.gz linked from insideairbnb.com/get-the-data
(the newest snapshot per dataset, discovered on each run, never pinned), with
DuckDB, and keeps only what we need: lat, lon, room_type, accommodates, price.

Prices are in the listing's local currency (GBP in London, CZK in Prague, ...)
and are converted with the ECB euro reference rates of the run day.

For every Carta destination with listings inside its footprint (common.footprint_km)
it writes the medians the stay model uses:

  home {2,4,6,8}  entire place, by how many it sleeps (accommodates cap-1..cap)
  room            private room
  shared          shared room (a dorm-like bed)
  n, dataset, snapshot

Writes STATE/iab.json. Downloads land in STATE/iab/ (gitignored).

Usage:  python pipeline/stays/harvest_iab.py [--only ghent,lisbon] [--refresh]
"""

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (HOME_CAPS, STATE, USER_AGENT, footprint_km, haversine_km,  # noqa: E402
                    load_destinations, median, now_iso, write_json)

PAGE = "https://insideairbnb.com/get-the-data/"
ECB = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
DL = STATE / "iab"
OUT = STATE / "iab.json"
MIN_N = 8

EUROPE = {
    "austria": "EUR", "belgium": "EUR", "bulgaria": "BGN", "croatia": "EUR",
    "cyprus": "EUR", "czech-republic": "CZK", "denmark": "DKK",
    "estonia": "EUR", "finland": "EUR", "france": "EUR", "germany": "EUR",
    "greece": "EUR", "hungary": "HUF", "iceland": "ISK", "ireland": "EUR",
    "italy": "EUR", "latvia": "EUR", "lithuania": "EUR", "luxembourg": "EUR",
    "malta": "EUR", "the-netherlands": "EUR", "netherlands": "EUR",
    "norway": "NOK", "poland": "PLN", "portugal": "EUR", "romania": "RON",
    "slovakia": "EUR", "slovenia": "EUR", "spain": "EUR", "sweden": "SEK",
    "switzerland": "CHF", "turkey": "TRY", "united-kingdom": "GBP",
    "serbia": "RSD", "montenegro": "EUR", "albania": "ALL",
}
LINK = re.compile(r"https://data\.insideairbnb\.com/([^/]+)/([^\"]+?)/(\d{4}-\d{2}-\d{2})/data/listings\.csv\.gz")


def http():
    return httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=300,
                        follow_redirects=True)


def discover(client):
    html = client.get(PAGE).text
    newest = {}
    for m in LINK.finditer(html):
        country, path, snap = m.group(1), m.group(2), m.group(3)
        if country not in EUROPE:
            continue
        key = f"{country}/{path}"
        if key not in newest or snap > newest[key][1]:
            newest[key] = (m.group(0), snap, country)
    return newest


def ecb_rates(client):
    root = ET.fromstring(client.get(ECB).content)
    rates = {"EUR": 1.0}
    for el in root.iter():
        if el.get("currency") and el.get("rate"):
            rates[el.get("currency")] = float(el.get("rate"))
    return rates


def read_listings(path):
    import duckdb
    q = f"""
      select try_cast(latitude as double) lat, try_cast(longitude as double) lon,
             room_type, try_cast(accommodates as integer) acc,
             try_cast(regexp_replace(price, '[^0-9.]', '', 'g') as double) price
      from read_csv_auto('{path.as_posix()}', all_varchar=true)
      where price is not null and latitude is not null"""
    return duckdb.sql(q).fetchall()


def summarise(rows):
    home = {c: [] for c in HOME_CAPS}
    room, shared = [], []
    for _, _, rt, acc, p in rows:
        if rt == "Entire home/apt" and acc:
            for c in HOME_CAPS:
                if c - 1 <= acc <= c:
                    home[c].append(p)
        elif rt == "Private room":
            room.append(p)
        elif rt == "Shared room":
            shared.append(p)
    out = {"n": len(rows),
           "home": {str(c): round(median(v)) for c, v in home.items()
                    if len(v) >= MIN_N},
           "room": round(median(room)) if len(room) >= MIN_N else None,
           "shared": round(median(shared)) if len(shared) >= MIN_N else None}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    client = http()
    rates = ecb_rates(client)
    sets = discover(client)
    only = [s for s in a.only.split(",") if s]
    if only:
        sets = {k: v for k, v in sets.items() if any(o in k for o in only)}
    print(f"{len(sets)} European datasets")
    dests = load_destinations()
    result = {}
    DL.mkdir(parents=True, exist_ok=True)
    for key, (url, snap, country) in sorted(sets.items()):
        fx = rates.get(EUROPE[country])
        if not fx:
            print("no ECB rate for", key)
            continue
        f = DL / (key.replace("/", "_") + f"_{snap}.csv.gz")
        if a.refresh or not f.exists():
            r = client.get(url)
            r.raise_for_status()
            f.write_bytes(r.content)
        rows = [(lat, lon, rt, acc, p / fx) for lat, lon, rt, acc, p
                in read_listings(f) if lat and lon and p and 5 <= p / fx <= 3000]
        if not rows:
            continue
        lats = [r[0] for r in rows]
        lons = [r[1] for r in rows]
        box = (min(lats), max(lats), min(lons), max(lons))
        hit = 0
        for d in dests:
            if not (box[0] - 0.2 <= d["lat"] <= box[1] + 0.2 and
                    box[2] - 0.3 <= d["lon"] <= box[3] + 0.3):
                continue
            fp = footprint_km(d)
            near = [r for r in rows
                    if abs(r[0] - d["lat"]) < 0.12 and abs(r[1] - d["lon"]) < 0.18
                    and haversine_km(d["lat"], d["lon"], r[0], r[1]) <= fp]
            if len(near) < MIN_N:
                continue
            s = summarise(near)
            s.update(dataset=key, snapshot=snap)
            prev = result.get(d["id"])
            if not prev or s["n"] > prev["n"]:
                result[d["id"]] = s
                hit += 1
        print(f"{key} {snap}: {len(rows)} priced listings -> {hit} destinations",
              flush=True)
    write_json(OUT, {"captured": now_iso(), "rates": rates, "dests": result})
    print(f"done: {len(result)} destinations with own Airbnb medians")


if __name__ == "__main__":
    main()
