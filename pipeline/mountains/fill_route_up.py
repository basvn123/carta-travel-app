"""Fill the route up for mountains with no route (T1186, ROADMAP D24, D7).

Tier: Scheduled (owner run on the box; the geometry steps are pure and offline)

The wire's `routes` come from hiking relations that pass within 150 m of the
summit (outdoor_pages). Most summits have none, because the way up is a plain
OSM path, not a relation. This step reads OSM ways near the summit
(highway=path, footway, steps, track, bridleway) and writes a `routeUp` block:

    kind      marked  a hiking relation member passes within MARKED_M
              path    a foot way gets within PATH_M of the summit
              track   only a vehicle track gets within PATH_M
              none    nothing within PATH_M
    near_m    distance from the summit to the nearest way
    sac       hardest sac_scale among ways within PATH_M, as tagged
    ways      number of ways within PATH_M
    names     up to three way names
    _src      "osm"      _asof  ISO date of the run

Source choice (Execution/P15/T1186-mountains-lakes.md): Geofabrik extracts
filtered with osmium are the batch route; Overpass per summit is the paced
fallback used here, through the lake layer's polite client. Both are ODbL, so
the wire credits "OpenStreetMap contributors". Nothing here claims a safe
route: `kind` says what is mapped, sac is shown as tagged.

    python pipeline/mountains/fill_route_up.py --harvest --apply   # network
    python pipeline/mountains/fill_route_up.py --extract data/raw/geofabrik/austria-latest.osm.pbf --apply
    python pipeline/mountains/fill_route_up.py --dry-run           # numbers
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from itertools import pairwise
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WIRE = ROOT / "continent-app" / "public" / "mountains"
CACHE = ROOT / "cache" / "mountains"
WAYS = CACHE / "route_up_ways.json"

MARKED_M = 60
PATH_M = 400
SEARCH_M = 600
FOOT = {"path", "footway", "steps", "bridleway"}
SAC_ORDER = ["hiking", "mountain_hiking", "demanding_mountain_hiking",
             "alpine_hiking", "demanding_alpine_hiking", "difficult_alpine_hiking"]


def point_to_line_m(lat, lon, geom) -> float:
    """Metres from a point to a polyline of {lat, lon} (local flat projection)."""
    k = math.cos(math.radians(lat))
    pts = [((g["lon"] - lon) * k * 111320.0, (g["lat"] - lat) * 110574.0) for g in geom]
    if len(pts) == 1:
        return math.hypot(*pts[0])
    best = float("inf")
    for (ax, ay), (bx, by) in pairwise(pts):
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0.0 if L == 0 else max(0.0, min(1.0, (-ax * dx - ay * dy) / L))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def query(lat: float, lon: float, r_m: int = SEARCH_M) -> str:
    return ("[out:json][timeout:60];(\n"
            f'way(around:{r_m},{lat},{lon})'
            '["highway"~"^(path|footway|steps|track|bridleway)$"];\n'
            ");out tags geom 80;")


def route_up(lat: float, lon: float, ways: list, hiking_ids=frozenset(),
             asof: str | None = None) -> dict:
    """The routeUp block from OSM way elements that carry `geometry`."""
    block = {"_src": "osm", "_asof": asof or datetime.now(timezone.utc).date().isoformat()}
    near = []
    for w in ways:
        geom, t = w.get("geometry") or [], w.get("tags") or {}
        if geom and t.get("highway") in FOOT | {"track"}:
            near.append((point_to_line_m(lat, lon, geom), w, t))
    near.sort(key=lambda x: x[0])
    inside = [n for n in near if n[0] <= PATH_M]
    if not inside:
        block.update({"kind": "none", "ways": 0})
        if near:
            block["near_m"] = round(near[0][0])
        return block
    foot = [n for n in inside if n[2]["highway"] in FOOT]
    marked = [n for n in inside if n[0] <= MARKED_M and n[1].get("id") in hiking_ids]
    block.update({"kind": "marked" if marked else ("path" if foot else "track"),
                  "near_m": round(inside[0][0]), "ways": len(inside)})
    sacs = [SAC_ORDER.index(n[2]["sac_scale"]) for n in inside
            if n[2].get("sac_scale") in SAC_ORDER]
    if sacs:
        block["sac"] = SAC_ORDER[max(sacs)]
    names = list(dict.fromkeys((n[2].get("name") or "")[:60] for n in inside
                               if n[2].get("name")))
    if names:
        block["names"] = names[:3]
    return block


def rows_of(doc):
    for key in ("mountains", "listed"):
        yield from doc.get(key) or []


def wire_files(wire: Path):
    return [p for p in sorted(wire.glob("*.json")) if len(p.stem) == 2]


def harvest(wire: Path = WIRE, refresh: bool = False) -> dict:
    """Paced Overpass sweep for rows with no routes. Network; owner run."""
    sys.path.insert(0, str(ROOT / "pipeline" / "lakes"))
    import water_sources as ws
    cache = json.loads(WAYS.read_text(encoding="utf-8")) if WAYS.exists() else {}
    todo = [r for p in wire_files(wire)
            for r in rows_of(json.loads(p.read_text(encoding="utf-8")))
            if not r.get("routes")]
    for i, r in enumerate(todo, 1):
        if r["id"] in cache and not refresh:
            continue
        cache[r["id"]] = ws.overpass(query(r["lat"], r["lon"]))
        if i % 25 == 0:
            WAYS.parent.mkdir(parents=True, exist_ok=True)
            WAYS.write_text(json.dumps(cache), encoding="utf-8")
            print(f"  {i}/{len(todo)} swept")
    WAYS.parent.mkdir(parents=True, exist_ok=True)
    WAYS.write_text(json.dumps(cache), encoding="utf-8")
    return cache


def summits_without_route(wire: Path = WIRE) -> list:
    """[(id, lat, lon)] of every wire row with no relation route."""
    return [(r["id"], r["lat"], r["lon"]) for p in wire_files(wire)
            for r in rows_of(json.loads(p.read_text(encoding="utf-8")))
            if not r.get("routes") and r.get("lat") is not None and r.get("lon") is not None]


GRID_DEG = 0.01       # summit grid cell, about 1.1 km north to south


def harvest_extract(pbf_paths, summits, search_m: int = SEARCH_M) -> dict:
    """{summit id: [way element]} from Geofabrik extracts (T1201, row T1186-c).

    The batch route the T1186 research named: no rate limit, one pass per
    country instead of one Overpass query per summit. Pass 1 collects the way
    members of route=hiking relations; pass 2 reads every foot way and track
    with node locations and keeps it for each summit it comes within
    `search_m` of. The elements have the Overpass shape route_up() reads
    (`tags`, `geometry` of {lat, lon}), plus `hiking` when the way is a
    hiking relation member, so a summit's way can read `marked`."""
    import osmium
    grid = {}
    for sid, lat, lon in summits:
        grid.setdefault((int(math.floor(lat / GRID_DEG)), int(math.floor(lon / GRID_DEG))),
                        []).append((sid, lat, lon))
    reach_lat = int(math.ceil(search_m / 111000.0 / GRID_DEG))
    out = {}
    for pbf in pbf_paths:
        hiking = set()
        for rel in osmium.FileProcessor(str(pbf), osmium.osm.RELATION):
            if rel.tags.get("route") == "hiking":
                hiking.update(m.ref for m in rel.members if m.type == "w")
        fp = osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY).with_locations()
        for obj in fp:
            if not obj.is_way():
                continue
            hw = obj.tags.get("highway")
            if hw not in FOOT and hw != "track":
                continue
            geom = []
            for n in obj.nodes:
                if n.location.valid():
                    geom.append({"lat": n.location.lat, "lon": n.location.lon})
            if not geom:
                continue
            near = {}
            for g in geom:
                ci, cj = int(math.floor(g["lat"] / GRID_DEG)), int(math.floor(g["lon"] / GRID_DEG))
                reach_lon = int(math.ceil(reach_lat / max(0.2, math.cos(math.radians(g["lat"])))))
                for di in range(-reach_lat, reach_lat + 1):
                    for dj in range(-reach_lon, reach_lon + 1):
                        for sid, lat, lon in grid.get((ci + di, cj + dj), ()):
                            near[sid] = (lat, lon)
            if not near:
                continue
            tags = {k: obj.tags.get(k) for k in ("highway", "sac_scale", "name")
                    if obj.tags.get(k)}
            el = {"type": "way", "id": obj.id, "tags": tags, "geometry": geom}
            if obj.id in hiking:
                el["hiking"] = True
            for sid, (lat, lon) in near.items():
                if point_to_line_m(lat, lon, geom) <= search_m:
                    out.setdefault(sid, []).append(el)
    return out


def fill(wire: Path = WIRE, ways_by_id: dict | None = None, asof=None) -> tuple:
    """(fills, stats). Pure. 'with route' counts a relation route or a
    routeUp of kind marked or path."""
    ways_by_id = ways_by_id or {}
    fills = {}
    st = {"rows": 0, "with_route_before": 0, "with_route_after": 0, "swept": 0}
    for p in wire_files(wire):
        for r in rows_of(json.loads(p.read_text(encoding="utf-8"))):
            st["rows"] += 1
            has = bool(r.get("routes"))
            st["with_route_before"] += has
            if not has and r["id"] in ways_by_id:
                st["swept"] += 1
                ways = ways_by_id[r["id"]]
                # T1201: an extract sweep marks hiking relation members.
                marked = frozenset(w.get("id") for w in ways if w.get("hiking"))
                fills[r["id"]] = b = route_up(r["lat"], r["lon"], ways,
                                              hiking_ids=marked, asof=asof)
                has = b["kind"] in ("marked", "path")
            st["with_route_after"] += has
    return fills, st


def apply(fills: dict, wire: Path = WIRE) -> int:
    n = 0
    for p in wire_files(wire):
        doc = json.loads(p.read_text(encoding="utf-8"))
        ch = False
        for r in rows_of(doc):
            if r.get("id") in fills and not r.get("routes"):
                r["routeUp"] = fills[r["id"]]
                ch = True
                n += 1
        if ch:
            p.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")),
                         encoding="utf-8")
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--wire", default=str(WIRE))
    ap.add_argument("--harvest", action="store_true")
    ap.add_argument("--extract", action="append", default=[],
                    help="a Geofabrik .osm.pbf to sweep instead of Overpass "
                         "(repeatable; T1201, the batch route)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    wire = Path(a.wire)
    if a.extract and not a.dry_run:
        cache = json.loads(WAYS.read_text(encoding="utf-8")) if WAYS.exists() else {}
        found = harvest_extract([Path(x) for x in a.extract], summits_without_route(wire))
        cache.update({str(k): v for k, v in found.items()})
        WAYS.parent.mkdir(parents=True, exist_ok=True)
        WAYS.write_text(json.dumps(cache), encoding="utf-8")
        print(f"extract sweep: {len(found)} summits with a way within {SEARCH_M} m")
    elif a.harvest and not a.dry_run:
        harvest(wire)
    try:
        ways = json.loads(WAYS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        ways = {}
    fills, st = fill(wire, ways)
    print(json.dumps(st))
    if a.apply and not a.dry_run:
        print("patched", apply(fills, wire))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
