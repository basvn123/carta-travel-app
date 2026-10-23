"""Entry fee flag (and a price record) for things to do, from OpenStreetMap.

Tier: On demand (T641; read by pipeline/dossier/derive_do.py facts_of through
explore_overlay, rebuilt with build_dossier.py)

Source: OpenStreetMap contributors, ODbL 1.0 (commercial use allowed, credit
required), via Overpass: the `fee` tag (yes or no) and the `charge` tag on the
object that is the POI. An OSM object is the POI when it lies within MATCH_M of
the shard row AND its `name` or `name:en` shares a folded word of three letters
or more with the row name. No match means no key: absence is "unknown".

What is written (cache/poi_fees.json rows["lat,lon" at 4 decimals]):
    {"fee": "yes" | "no",
     "price": {"value": 12.0, "unit": "per person", "currency": "EUR",
               "source": "OpenStreetMap charge tag", "date": "YYYY-MM-DD",
               "quality": "osm_text"}}            # only when `charge` parses
`price` is the price record price plan phase F9 reads. It is NOT `fee_eur`: the
app's thing-to-do tile shows `fee_eur` as an amount, and this batch shows no
price. derive_do.facts_of copies `fee` into the dossier item and `price` into
`do[].price`, which no screen reads.

Duration: there is no structured open source of visit duration (OSM has none,
Wikivoyage listings carry none), so `do[].duration_min` stays a stub. The
dossier already falls back to the place layer's `visit_h` where present.

Usage, from the repo root:
    python pipeline/harvest_poi_fees.py --shards AAL,VRN --out-dir DIR      # sample
    python pipeline/harvest_poi_fees.py --wiki-only                         # full run, about 1,100 queries
    python pipeline/harvest_poi_fees.py --min-rate 3                        # larger (97k rows)
Resumable: rows already in the output are not asked again.

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(os.environ.get("CARTA_INPUT_ROOT", ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))
import explore_overlay as ov  # noqa: E402
import sources  # noqa: E402

MATCH_M = 60
BATCH = 40
SYMBOL_CUR = {"€": "EUR", "£": "GBP", "$": "USD", "CHF": "CHF", "Fr.": "CHF", "kr": "SEK", "zl": "PLN", "Kč": "CZK"}
CODES = {"EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "HRK", "ISK", "USD"}


def key_of(lat: float, lon: float) -> str:
    return f"{lat:.4f},{lon:.4f}"


def words(s: str) -> set:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return {w for w in re.findall(r"[a-z0-9]+", s) if len(w) >= 3}


def parse_charge(text: str):
    """(value, currency) of the first adult looking amount in a charge tag, or
    None. Handles '10 EUR', 'EUR 10', '€10', '10.50 CHF'; refuses ranges and
    prose it cannot read."""
    t = (text or "").strip()
    if re.search(r"\d\s*[-/;]\s*\d|;", t):
        return None   # a range or several prices: not one adult price
    m = re.search(r"(\d+(?:[.,]\d{1,2})?)\s*(EUR|GBP|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|ISK|USD|€|£)", t, re.I) or \
        re.search(r"(EUR|GBP|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|ISK|USD|€|£)\s*(\d+(?:[.,]\d{1,2})?)", t, re.I)
    if not m:
        return None
    a, b = m.group(1), m.group(2)
    num, cur = (a, b) if a[0].isdigit() else (b, a)
    cur = SYMBOL_CUR.get(cur, cur.upper())
    try:
        v = float(num.replace(",", "."))
    except ValueError:
        return None
    if cur not in CODES or v < 0 or v > 500:
        return None
    return v, cur


def query(batch: list) -> list:
    clauses = "".join(
        f'nwr(around:{MATCH_M},{p["lat"]},{p["lon"]})["fee"];'
        f'nwr(around:{MATCH_M},{p["lat"]},{p["lon"]})["charge"];' for p in batch)
    q = f"[out:json][timeout:240];({clauses});out tags center;"
    last = None
    for ep in sources.OVERPASS_ENDPOINTS:
        try:
            return json.loads(sources.request(ep, data={"data": q}, timeout=280, tries=2))["elements"]
        except Exception as exc:
            last = exc
    raise RuntimeError(str(last)[:100])


def match(poi: dict, els: list):
    pw = words(poi.get("name"))
    best = None
    for e in els:
        t = e.get("tags") or {}
        c = e.get("center") or {}
        lat, lon = e.get("lat", c.get("lat")), e.get("lon", c.get("lon"))
        if lat is None:
            continue
        if abs(lat - poi["lat"]) > 0.0008 or abs(lon - poi["lon"]) > 0.0012:
            continue
        if pw & (words(t.get("name")) | words(t.get("name:en")) | words(t.get("official_name"))):
            best = t
            break
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shards")
    ap.add_argument("--wiki-only", action="store_true")
    ap.add_argument("--min-rate", type=int, default=0)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--out-dir")
    a = ap.parse_args()
    base = Path(a.out_dir) if a.out_dir else None
    out_path = (base or ov.CACHE) / "poi_fees.json"
    rows = json.loads(out_path.read_text(encoding="utf-8"))["rows"] if out_path.exists() else {}
    asked = set(rows)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    want = set(a.shards.split(",")) if a.shards else None
    pois = []
    for f in sorted((INPUT / "continent-app" / "public" / "poi").glob("*.json")):
        if want and f.stem not in want:
            continue
        for p in json.loads(f.read_text(encoding="utf-8")):
            if p.get("lat") is None or not p.get("name"):
                continue
            if a.wiki_only and not p.get("wiki"):
                continue
            if (p.get("rate") or 0) < a.min_rate:
                continue
            if key_of(p["lat"], p["lon"]) in asked:
                continue
            pois.append(p)
    if a.limit:
        pois = pois[:a.limit]
    pois.sort(key=lambda p: (round(p["lat"], 1), round(p["lon"], 1)))
    hit = 0
    for i in range(0, len(pois), BATCH):
        batch = pois[i:i + BATCH]
        try:
            els = query(batch)
        except Exception as exc:
            print(f"  batch {i} failed ({exc})", flush=True)
            continue
        for p in batch:
            t = match(p, els)
            row = {}
            if t and t.get("fee") in ("yes", "no"):
                row["fee"] = t["fee"]
            if t and t.get("charge"):
                got = parse_charge(t["charge"])
                if got:
                    row["price"] = {"value": got[0], "unit": "per person", "currency": got[1],
                                    "source": "OpenStreetMap charge tag", "date": today, "quality": "osm_text"}
                    row.setdefault("fee", "yes" if got[0] > 0 else "no")
            rows[key_of(p["lat"], p["lon"])] = row   # an empty row records "asked, nothing mapped"
            hit += 1 if row else 0
        print(f"  {min(i + BATCH, len(pois))}/{len(pois)} asked, {hit} with a fee tag", flush=True)
        if (i // BATCH) % 10 == 0:
            ov.save("poi_fees", rows, META, base)
    ov.save("poi_fees", rows, META, base)
    print("asked", len(pois), "with a fee tag", hit)


META = {"source": "OpenStreetMap contributors (ODbL 1.0) fee and charge tags", "method": "measured",
        "note": "an empty row means asked and nothing mapped; derive_do ignores empty rows"}

if __name__ == "__main__":
    main()
