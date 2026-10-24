"""Lake water detail: ferry lines, water sport zones, lifeguards, swimming bans, wind.

Tier: On demand (T641; read by export_lakes.py through explore_overlay)

One pass per lake, from the published lake wires (id, OSM id, area, centre).
Everything is read within a buffer of the lake's own OSM shape (Overpass
`around` a set), so a long lake such as Como is covered end to end, which a
circle around the centre cannot do.

Sources and licences (all allow commercial use):
  - OpenStreetMap via Overpass, ODbL 1.0, credit "OpenStreetMap contributors":
      * ferry lines: relations route=ferry within 300 m of the lake. OSM keeps
        one relation per scheduled trip, so trips are folded into a line by
        (operator, ref). A line carries its operator, ref, the stop names that
        occur at least twice (a single spelling mistake is not a stop), the
        shortest and longest `duration` tag among its trips, and the trip count.
      * water sport zones: sport=windsurfing, kitesurfing, sailing, water_ski,
        wakeboarding, canoe, kayak, rowing, scuba_diving, surfing on nodes,
        ways and relations within 200 m of the lake. Each zone keeps its sport,
        its name when it has one and its centre. No geometry, no polygon.
      * lifeguards: lifeguard=yes|seasonal, emergency=lifeguard*, or
        leisure=swimming_area with supervised=yes.
      * swimming bans: swimming=no, bathing=no (OSM), or an EEA bathing water
        record with a prohibition status where the bathing-water cache has one.
  - NASA POWER climatology (US government open data), mean 10 m wind
    (WS10M) per calendar month at the lake centre, 2001 to 2020. MODELLED
    (MERRA-2 cell of about 50 km). Thermal winds are NOT named by any open
    source: the wire carries no `thermal` key and the sheet slot stays a stub.

An empty answer is written as no key at all: OSM saying nothing about
lifeguards is "not mapped", never "no lifeguard". `checked` records that the
lake was asked, so the full run can resume.

    cache/lake_water_detail.json rows[lake id] = {
      "ferry": [{"ref", "operator", "stops": [...], "min": [lo, hi]?, "n": trips}],
      "sportZones": [{"sport", "name"?, "lat", "lon"}],
      "lifeguards": {"n", "sites": [{"n"?, "lat", "lon"}]},
      "ban": {"n", "sites": [{"n"?, "lat", "lon"}], "src": "osm"},
      "wind": {"ms": [12], "src": "NASA POWER WS10M 2001-2020", "m": "modelled"},
      "checked": "YYYY-MM-DD"}

Usage, from the repo root:
    python pipeline/lakes/harvest_water_detail.py --ids it-lake-como-Q15523          # sample
    python pipeline/lakes/harvest_water_detail.py --countries IT --min-area 5       # country
    python pipeline/lakes/harvest_water_detail.py --min-area 2                      # full run
    --out-dir DIR  write under DIR instead of cache/ (the file is merged, resumable)

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
INPUT = Path(os.environ.get("CARTA_INPUT_ROOT", ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))
import explore_overlay as ov  # noqa: E402
import sources  # noqa: E402

SPORTS = "windsurfing|kitesurfing|sailing|water_ski|wakeboarding|canoe|kayak|rowing|scuba_diving|surfing"
SHORE_M = 200
FERRY_M = 300
FERRY_MIN_AREA = 2.0       # km2: a pond has no ferry
POWER = "https://power.larc.nasa.gov/api/temporal/climatology/point"
UA = {"User-Agent": "CartaLakes/1.0 (https://carta-europetravel.com; bas.vannieuwenhuyse123@gmail.com)"}
MAX_SPORT_ZONES = 40
MAX_SITES = 12


def set_of(osm: str) -> str:
    kind = {"r": "rel", "w": "way", "n": "node"}[osm[0]]
    return f"{kind}({osm[1:]})->.lake;"


def tag_query(osm: str) -> str:
    return (
        "[out:json][timeout:180];\n" + set_of(osm) + "\n(\n"
        f'  nwr(around.lake:{SHORE_M})["sport"~"^({SPORTS})$"];\n'
        f'  nwr(around.lake:{SHORE_M})["lifeguard"~"^(yes|true|seasonal)$"];\n'
        f'  nwr(around.lake:{SHORE_M})["emergency"~"^lifeguard"];\n'
        f'  nwr(around.lake:{SHORE_M})["leisure"="swimming_area"]["supervised"="yes"];\n'
        f'  nwr(around.lake:{SHORE_M})["swimming"="no"];\n'
        f'  nwr(around.lake:{SHORE_M})["bathing"="no"];\n'
        ");\nout tags center 800;"
    )


def ferry_query(osm: str) -> str:
    return ("[out:json][timeout:180];\n" + set_of(osm) +
            f'\nrel(around.lake:{FERRY_M})["route"="ferry"];\nout tags;')


def overpass(query: str) -> list:
    last = None
    for ep in sources.OVERPASS_ENDPOINTS:
        try:
            return json.loads(sources.request(ep, data={"data": query}, timeout=240, tries=2))["elements"]
        except Exception as exc:
            last = exc
    raise RuntimeError(str(last)[:120])


def centre_of(e: dict):
    c = e.get("center") or {}
    lat, lon = e.get("lat", c.get("lat")), e.get("lon", c.get("lon"))
    return (round(lat, 5), round(lon, 5)) if lat is not None and lon is not None else None


def classify(elements: list) -> dict:
    zones, guards, bans, seen = [], [], [], set()
    for e in elements:
        t = e.get("tags") or {}
        pos = centre_of(e)
        if not pos:
            continue
        name = (t.get("name") or "")[:60]
        sport = t.get("sport")
        if sport and re.fullmatch(SPORTS, sport.split(";")[0].strip()):
            key = (sport, round(pos[0], 3), round(pos[1], 3))
            if key not in seen:
                seen.add(key)
                z = {"sport": sport.split(";")[0].strip(), "lat": pos[0], "lon": pos[1]}
                if name:
                    z["name"] = name
                zones.append(z)
        if (t.get("lifeguard") in ("yes", "true", "seasonal") or str(t.get("emergency", "")).startswith("lifeguard")
                or (t.get("leisure") == "swimming_area" and t.get("supervised") == "yes")):
            g = {"lat": pos[0], "lon": pos[1]}
            if name:
                g["n"] = name
            guards.append(g)
        if t.get("swimming") == "no" or t.get("bathing") == "no":
            b = {"lat": pos[0], "lon": pos[1]}
            if name:
                b["n"] = name
            bans.append(b)
    out: dict = {}
    if zones:
        out["sportZones"] = zones[:MAX_SPORT_ZONES]
    if guards:
        out["lifeguards"] = {"n": len(guards), "sites": guards[:MAX_SITES]}
    if bans:
        out["ban"] = {"n": len(bans), "sites": bans[:MAX_SITES], "src": "osm"}
    return out


def minutes(duration: str):
    m = re.fullmatch(r"(\d{1,2}):(\d{2})(?::\d{2})?", (duration or "").strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def fold_lines(rels: list) -> list:
    """Fold per trip relations into lines by (operator, ref)."""
    groups = defaultdict(list)
    for r in rels:
        t = r.get("tags") or {}
        key = ((t.get("operator") or "").strip(), (t.get("ref") or t.get("name") or "").strip())
        if key[1]:
            groups[key].append(t)
    lines = []
    for (op, ref), trips in groups.items():
        counts = Counter()
        for t in trips:
            for k in ("from", "to"):
                if t.get(k):
                    counts[t[k].strip()] += 1
        stops = [n for n, c in counts.most_common() if c >= 2] or [n for n, _ in counts.most_common()]
        durs = [d for d in (minutes(t.get("duration")) for t in trips) if d]
        line = {"ref": ref[:30], "stops": stops[:12], "n": len(trips)}
        if op:
            line["operator"] = op[:40]
        if durs:
            line["min"] = [min(durs), max(durs)]
        if stops:
            lines.append(line)
    lines.sort(key=lambda x: -x["n"])
    return lines[:12]


def wind_profile(lat: float, lon: float):
    url = f"{POWER}?parameters=WS10M&community=RE&longitude={lon}&latitude={lat}&format=JSON"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            p = json.load(r)["properties"]["parameter"]["WS10M"]
    except Exception:
        return None
    keys = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    vals = [p.get(k) for k in keys]
    if any(v is None or v < 0 for v in vals):
        return None
    return {"ms": [round(v, 1) for v in vals], "src": "NASA POWER WS10M 2001-2020", "m": "modelled"}


def lakes(countries, ids, min_area):
    for f in sorted((INPUT / "continent-app" / "public" / "lakes").glob("[A-Z][A-Z].json")):
        if countries and f.stem not in countries:
            continue
        for r in json.loads(f.read_text(encoding="utf-8")).get("lakes", []):
            if ids and r["id"] not in ids:
                continue
            area = (r.get("size") or {}).get("areaKm2") or 0
            if not ids and area < min_area:
                continue
            if r.get("osm"):
                yield r, area


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids")
    ap.add_argument("--countries")
    ap.add_argument("--min-area", type=float, default=0.0)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--no-wind", action="store_true")
    ap.add_argument("--out-dir")
    a = ap.parse_args()
    base = Path(a.out_dir) if a.out_dir else ov.CACHE
    out_path = base / "lake_water_detail.json"
    doc = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {"rows": {}}
    rows = doc["rows"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ids = set(a.ids.split(",")) if a.ids else None
    countries = set(a.countries.split(",")) if a.countries else None
    done = 0
    stats = Counter()
    for lake, area in lakes(countries, ids, a.min_area):
        if lake["id"] in rows and not ids:
            continue
        if a.limit and done >= a.limit:
            break
        done += 1
        row: dict = {}
        try:
            row.update(classify(overpass(tag_query(lake["osm"]))))
            if area >= FERRY_MIN_AREA:
                lines = fold_lines(overpass(ferry_query(lake["osm"])))
                if lines:
                    row["ferry"] = lines
            if not a.no_wind:
                w = wind_profile(lake["lat"], lake["lon"])
                if w:
                    row["wind"] = w
        except Exception as exc:
            print(f"  {lake['id']}: failed ({exc}), will retry on the next run", flush=True)
            continue
        row["checked"] = today
        rows[lake["id"]] = row
        for k in ("ferry", "sportZones", "lifeguards", "ban", "wind"):
            stats[k] += 1 if row.get(k) else 0
        print(f"  {lake['id']}: " + ", ".join(k for k in ("ferry", "sportZones", "lifeguards", "ban", "wind") if row.get(k)), flush=True)
        if done % 20 == 0:
            ov.save("lake_water_detail", rows, META, base)
    ov.save("lake_water_detail", rows, META, base)
    print("lakes asked", done, dict(stats), "rows", len(rows))


META = {
    "source": "OpenStreetMap contributors (ODbL 1.0) via Overpass; NASA POWER WS10M (open)",
    "method": "measured (OSM tags), modelled (wind)",
    "note": "absence of a key means not mapped, never an assertion that there is none",
}

if __name__ == "__main__":
    main()
