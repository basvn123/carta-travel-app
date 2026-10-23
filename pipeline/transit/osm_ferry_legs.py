"""Ferry legs between towns from OpenStreetMap route=ferry relations.

Tier: On demand (T641; fallback and complement to gtfs_lines.py, which only
knows ferries that publish a GTFS feed)

Source: OpenStreetMap contributors, ODbL 1.0 (credit required, commercial use
allowed), via Overpass. OSM keeps one relation per scheduled ferry trip, with
`from`, `to`, `operator`, `ref` and often `duration`. Trips are folded into a
leg by (ref, operator, other end).

For every node (a destination centre or a member town, see gtfs_lines.load_dests)
the relations within PORT_M of the node are read. A relation whose `from` or
`to` text matches the node's name (accent and case folded, either contains the
other) gives a leg from the node to the other end. A relation that touches the
node's port but names neither end after the node is dropped: no guessing.

Output cache/dest_transit_ferry.json rows[destination id] = {"ferry": [leg]},
leg as in gtfs_lines.py with method "measured" and source "OpenStreetMap
contributors (ODbL 1.0)". Frequency is unknown in OSM, so `freq_per_day` is
omitted; `trips` is the number of OSM trip relations folded into the leg.

Usage, from the repo root:
    python pipeline/transit/osm_ferry_legs.py --dests gem:como,gem:lugano   # sample
    python pipeline/transit/osm_ferry_legs.py --countries IT,CH,HR,GR      # coast and lake countries
    python pipeline/transit/osm_ferry_legs.py                              # all, about 1 hour
    --out-dir DIR  write under DIR instead of cache/

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
INPUT = Path(os.environ.get("CARTA_INPUT_ROOT", ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))
sys.path.insert(0, str(HERE))
import explore_overlay as ov  # noqa: E402
import sources  # noqa: E402
from gtfs_lines import load_dests  # noqa: E402

PORT_M = 1500
BATCH = 15
LEGS = 6


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", "", s).strip()


def minutes(duration: str):
    m = re.fullmatch(r"(\d{1,2}):(\d{2})(?::\d{2})?", (duration or "").strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def relations_near(batch: list) -> dict:
    """{node id: [relation tags]} for a batch of (id, lat, lon)."""
    out = {}
    for nid, la, lo in batch:
        out[nid] = []
    clauses = "".join(f'rel(around:{PORT_M},{la},{lo})["route"="ferry"];' for _, la, lo in batch)
    q = f"[out:json][timeout:240];({clauses});out tags center;"
    last = None
    for ep in sources.OVERPASS_ENDPOINTS:
        try:
            els = json.loads(sources.request(ep, data={"data": q}, timeout=280, tries=2))["elements"]
            break
        except Exception as exc:
            last = exc
    else:
        raise RuntimeError(str(last)[:100])
    return {"elements": els}


def legs_for(node: dict, tags_list: list, today: str) -> list:
    me = fold(node["city"])
    groups = {}
    for t in tags_list:
        a, b = (t.get("from") or "").strip(), (t.get("to") or "").strip()
        if not a or not b:
            continue
        fa, fb = fold(a), fold(b)
        if me and (me in fa or fa in me):
            other = b
        elif me and (me in fb or fb in me):
            other = a
        else:
            continue
        key = ((t.get("ref") or t.get("name") or "").strip()[:30], (t.get("operator") or "").strip(), fold(other))
        g = groups.setdefault(key, {"name": key[0] or "ferry", "from": node["city"], "to": other,
                                    "trips": 0, "mins": []})
        g["trips"] += 1
        m = minutes(t.get("duration"))
        if m:
            g["mins"].append(m)
        if key[1]:
            g["operator"] = key[1][:40]
    legs = []
    for g in sorted(groups.values(), key=lambda x: -x["trips"])[:LEGS]:
        leg = {k: g[k] for k in ("name", "from", "to") }
        if g["mins"]:
            leg["minutes"] = min(g["mins"])
        if g.get("operator"):
            leg["operator"] = g["operator"]
        leg.update({"trips": g["trips"], "source": "OpenStreetMap contributors (ODbL 1.0)", "date": today,
                    "method": "measured"})
        legs.append(leg)
    return legs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dests")
    ap.add_argument("--countries")
    ap.add_argument("--out-dir")
    a = ap.parse_args()
    nodes = load_dests()
    doc = json.loads((INPUT / "continent-app" / "public" / "app_data.json").read_text(encoding="utf-8"))["destinations"]
    want_d = set(a.dests.split(",")) if a.dests else None
    want_c = set(a.countries.split(",")) if a.countries else None
    todo = {n: v for n, v in nodes.items()
            if (not want_d or v["owner"] in want_d) and (not want_c or doc[v["owner"]].get("iso2") in want_c)
            # a destination with member towns is an area (Lake Como): its centre
            # name would match the lake's own ferries from every town
            and not (n == v["owner"] and doc[n].get("members"))}
    ordered = sorted(todo.items(), key=lambda kv: (kv[1]["lat"], kv[1]["lon"]))
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows: dict = {}
    for i in range(0, len(ordered), BATCH):
        batch = ordered[i:i + BATCH]
        try:
            els = relations_near([(n, v["lat"], v["lon"]) for n, v in batch])["elements"]
        except Exception as exc:
            print(f"batch {i} failed ({exc})", flush=True)
            continue
        for n, v in batch:
            legs = legs_for(v, [e.get("tags") or {} for e in els], today)
            if legs:
                rows.setdefault(v["owner"], {}).setdefault("ferry", []).extend(legs)
        print(f"  {min(i + BATCH, len(ordered))}/{len(ordered)} nodes, {len(rows)} destinations with ferry legs", flush=True)
    for r in rows.values():
        r["ferry"] = sorted(r["ferry"], key=lambda x: -x["trips"])[:LEGS]
    meta = {"source": "OpenStreetMap contributors (ODbL 1.0) route=ferry", "method": "measured", "date": today}
    ov.save("dest_transit_ferry", rows, meta, Path(a.out_dir) if a.out_dir else None)
    print("wrote dest_transit_ferry", len(rows))


if __name__ == "__main__":
    main()
