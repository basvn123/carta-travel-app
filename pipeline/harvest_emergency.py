"""Emergency numbers per country and the nearest hospital per destination.

Tier: On demand (T641; feeds `practical.emergency` through
pipeline/dossier/derive_practical.py, rebuilt with build_dossier.py)

Sources, both open and clear for commercial use:
  - Wikidata property P2852 "emergency phone number" on every country item:
    CC0 (public domain dedication). Wikidata carries the numbers but not which
    service answers each one, so the wire lists the numbers as a set and
    marks 112 as `general` when it is among them. No service is guessed.
  - OpenStreetMap `amenity=hospital` (ODbL 1.0, credit "OpenStreetMap
    contributors"), one Overpass union query per batch of 12 destinations (around 60 km). The nearest hospital to the destination centre is kept, with a
    preference for one that is tagged `emergency=yes` when such a hospital
    lies within 15 km. The distance is a straight line, said so in `km_line`.

Output cache/dest_emergency.json:
    rows[destination id] = {
      "numbers": ["112", "144"], "general": "112",
      "hospital": {"name", "km_line", "lat", "lon", "emergency": true|null,
                   "phone"?: str},
      "src": {"numbers": "Wikidata P2852 (CC0)", "hospital": "OpenStreetMap (ODbL)",
              "date": "YYYY-MM-DD", "method": "measured"}}
A destination whose country has no P2852 value keeps only the hospital, and a
destination with no hospital in 60 km keeps only the numbers. Mountain rescue
numbers are not in Wikidata; they are not invented here.

Usage, from the repo root:
    python pipeline/harvest_emergency.py --countries CH,LI        # sample
    python pipeline/harvest_emergency.py                          # all countries (about 10 min)
    --out-dir DIR  write under DIR instead of cache/

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(os.environ.get("CARTA_INPUT_ROOT", ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))
import explore_overlay as ov  # noqa: E402
import sources  # noqa: E402  (shared Overpass endpoints, pacing and user agent)

SPARQL = "https://query.wikidata.org/sparql"
HOSPITAL_MAX_KM = 60.0
EMERGENCY_PREFERENCE_KM = 15.0
BATCH = 12                 # destinations per Overpass union query


def wikidata_numbers() -> dict:
    """{iso2: [numbers]} from P2852. The item label is the number."""
    q = ('SELECT ?iso ?numLabel WHERE { ?c wdt:P297 ?iso . ?c wdt:P2852 ?num . '
         'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }')
    raw = sources.request(SPARQL + "?format=json&query=" + urllib.parse.quote(q), tries=3)
    out: dict = {}
    for b in json.loads(raw)["results"]["bindings"]:
        num = b["numLabel"]["value"].strip()
        if num and num.replace(" ", "").isdigit():
            out.setdefault(b["iso"]["value"], [])
            if num not in out[b["iso"]["value"]]:
                out[b["iso"]["value"]].append(num)
    for cc in out:
        out[cc].sort(key=lambda n: (n != "112", len(n), n))
    return out


def hospitals_near(batch: list) -> list:
    """[(lat, lon, name, emergency, phone)] within HOSPITAL_MAX_KM of any point
    of a batch of (id, lat, lon). One union query per batch: a country wide
    area query timed out on every mirror for Switzerland."""
    clauses = "".join(
        f'nwr(around:{int(HOSPITAL_MAX_KM * 1000)},{lat},{lon})["amenity"="hospital"];'
        for _, lat, lon in batch)
    q = f"[out:json][timeout:300];({clauses});out tags center;"
    last = None
    for ep in sources.OVERPASS_ENDPOINTS:
        try:
            raw = sources.request(ep, data={"data": q}, timeout=330, tries=2)
            els = json.loads(raw)["elements"]
            break
        except Exception as exc:
            last = exc
    else:
        raise RuntimeError(f"batch failed: {last}")
    out = []
    for e in els:
        t = e.get("tags") or {}
        c = e.get("center") or {}
        lat, lon = e.get("lat", c.get("lat")), e.get("lon", c.get("lon"))
        if lat is None or lon is None or not t.get("name"):
            continue
        em = t.get("emergency")
        out.append((lat, lon, t["name"], True if em == "yes" else (False if em == "no" else None),
                    t.get("phone") or t.get("contact:phone") or ""))
    return out


def km(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def nearest(lat, lon, hosp):
    best, best_em = None, None
    for h in hosp:
        d = km(lat, lon, h[0], h[1])
        if d > HOSPITAL_MAX_KM:
            continue
        if best is None or d < best[0]:
            best = (d, h)
        if h[3] and (best_em is None or d < best_em[0]):
            best_em = (d, h)
    pick = best_em if best_em and best and best_em[0] - best[0] <= EMERGENCY_PREFERENCE_KM else best
    if not pick:
        return None
    d, h = pick
    out = {"name": h[2], "km_line": round(d, 1), "lat": round(h[0], 5), "lon": round(h[1], 5),
           "emergency": h[3]}
    if h[4]:
        out["phone"] = h[4][:40]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--countries")
    ap.add_argument("--out-dir")
    a = ap.parse_args()
    doc = json.loads((INPUT / "continent-app" / "public" / "app_data.json").read_text(encoding="utf-8"))
    dests = doc["destinations"]
    want = set(a.countries.split(",")) if a.countries else None
    by_cc: dict = {}
    for did, d in dests.items():
        lat, lon = d.get("city_lat", d.get("lat")), d.get("city_lon", d.get("lon"))
        if d.get("iso2") and lat is not None and (not want or d["iso2"] in want):
            by_cc.setdefault(d["iso2"], []).append((did, lat, lon))
    numbers = wikidata_numbers()
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = {}
    for cc, pts in sorted(by_cc.items()):
        hosp_by = {}
        ordered = sorted(pts, key=lambda x: (x[1], x[2]))
        for i in range(0, len(ordered), BATCH):
            batch = ordered[i:i + BATCH]
            try:
                hosp = hospitals_near(batch)
            except Exception as exc:
                print(f"{cc}: a batch of {len(batch)} failed ({str(exc)[:80]}), numbers only for it", flush=True)
                hosp = []
            for did, _, _ in batch:
                hosp_by[did] = hosp
        n_h = 0
        for did, lat, lon in pts:
            row = {}
            if numbers.get(cc):
                row["numbers"] = numbers[cc]
                if "112" in numbers[cc]:
                    row["general"] = "112"
            hosp = hosp_by.get(did) or []
            h = nearest(lat, lon, hosp) if hosp else None
            if h:
                row["hospital"] = h
                n_h += 1
            if row:
                row["src"] = {"numbers": "Wikidata P2852 (CC0)", "hospital": "OpenStreetMap contributors (ODbL 1.0)",
                              "date": date, "method": "measured"}
                rows[did] = row
        print(f"{cc}: {len(pts)} destinations, {sum(len(v) for v in hosp_by.values())} hospital hits, {n_h} with a hospital in {HOSPITAL_MAX_KM:.0f} km, "
              f"numbers {numbers.get(cc)}", flush=True)
    meta = {"source": "Wikidata P2852 (CC0); OpenStreetMap amenity=hospital (ODbL 1.0)", "date": date,
            "method": "measured", "unit": "phone number; km straight line"}
    base = Path(a.out_dir) if a.out_dir else None
    p = ov.save("dest_emergency", rows, meta, base)
    print("wrote", p, len(rows))


if __name__ == "__main__":
    main()
