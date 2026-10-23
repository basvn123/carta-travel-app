"""Lake outlines for the beach join (T642, closes T631-e).

Tier: Library

export_lakes.beaches_around used a circle of the lake's area around its centre
and only beaches flagged `inland`. A long lake (Como is 46 km long and 4 km
wide) is nothing like a circle, and 10 of 176 Italian beaches carry the flag,
so the list was empty nearly everywhere. This module gives the export a real
shore line:

  - fetch():   OSM way/relation outline per lake via Overpass (`out geom`),
               stitched into a polygon, simplified to <= MAX_POINTS vertices,
               written to cache/lake_outlines.json {lake_id: [[lon, lat], ...]}.
               Resumable, small queries (BATCH ids each), ODbL like the rest of
               the lake layer's shore detail.
  - outline_for(lake): the cached outline, else None.
  - near(outline, lat, lon, buffer_m): metres from a point to the outline
               (0 inside), by a planar approximation about the point.

Usage (from the repo root):
    python pipeline/lakes/lake_outlines.py            # all lakes in the wires, resumes
    python pipeline/lakes/lake_outlines.py --ids it-lake-como-Q15523
"""
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "cache" / "lake_outlines.json"
WIRE = ROOT / "continent-app" / "public" / "lakes"
UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; data@carta-europetravel.com)"}
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
BATCH = 25
MAX_POINTS = 160
SIMPLIFY_DEG = 0.0004  # ~40 m
BUFFER_M = 400.0       # a beach "on the shore" sits within this of the water line

_cache = None


def load():
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(CACHE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _cache = {}
    return _cache


def outline_for(lake, lake_id=None):
    got = load().get(lake_id or lake.get("id") or "")
    return got or lake.get("outline") or None


def _m_per_deg(lat):
    return 111320.0, 111320.0 * math.cos(math.radians(lat))


def _seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def near(outline, lat, lon):
    """Metres from (lat, lon) to the polygon: 0 inside, else the distance to
    the nearest edge. `outline` is [[lon, lat], ...] (one exterior ring)."""
    ky, kx = _m_per_deg(lat)
    pts = [((x - lon) * kx, (y - lat) * ky) for x, y in outline]
    inside = False
    for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
        if (ay > 0) != (by > 0) and 0 < ax + (bx - ax) * (0 - ay) / (by - ay):
            inside = not inside
    if inside:
        return 0.0
    return min(_seg_dist(0, 0, ax, ay, bx, by) for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]))


def _overpass(query):
    last = None
    for ep in ENDPOINTS:
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": query}).encode(), headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(5)
    raise RuntimeError(f"overpass failed: {last}")


def _polygon(el):
    """Largest exterior ring of one way/relation element with geometry."""
    from shapely.geometry import LineString, MultiPolygon, Polygon
    from shapely.ops import linemerge, polygonize, unary_union
    lines = []
    if el["type"] == "way":
        g = el.get("geometry") or []
        if len(g) >= 4:
            lines.append(LineString([(p["lon"], p["lat"]) for p in g]))
    else:
        for m in el.get("members", []):
            if m.get("role") == "outer" and m.get("geometry"):
                lines.append(LineString([(p["lon"], p["lat"]) for p in m["geometry"]]))
    if not lines:
        return None
    polys = list(polygonize(unary_union(linemerge(lines))))
    if not polys and el["type"] == "way":
        polys = [Polygon(lines[0])]
    if not polys:
        return None
    big = max(polys, key=lambda p: p.area)
    if not big.is_valid:
        big = big.buffer(0)
        if isinstance(big, MultiPolygon):
            big = max(big.geoms, key=lambda p: p.area)
    tol = SIMPLIFY_DEG
    ring = big.simplify(tol).exterior.coords
    while len(ring) > MAX_POINTS:
        tol *= 1.5
        ring = big.simplify(tol).exterior.coords
    return [[round(x, 5), round(y, 5)] for x, y in list(ring)[:-1]]


def fetch(only=None):
    out = dict(load())
    todo = []
    for f in sorted(WIRE.glob("??.json")):
        for l in json.loads(f.read_text(encoding="utf-8")).get("lakes", []):
            o = str(l.get("osm") or "")
            if only and l["id"] not in only:
                continue
            if l["id"] in out or not o or o[0] not in "wr":
                continue
            kind = "way" if o[0] == "w" else "relation"
            todo.append((l["id"], kind, o[1:].lstrip("/")))
    print(f"{len(todo)} outlines to fetch")
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        ids = {"way": [], "relation": []}
        for _, k, n in chunk:
            ids[k].append(n)
        q = "[out:json][timeout:150];("
        for k, v in ids.items():
            if v:
                q += f"{k}(id:{','.join(v)});"
        q += ");out geom;"
        data = _overpass(q)
        by = {(e["type"], str(e["id"])): e for e in data.get("elements", [])}
        for lid, k, n in chunk:
            el = by.get((k, n))
            ring = _polygon(el) if el else None
            out[lid] = ring or []
        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
        print(f"  {min(i + BATCH, len(todo))}/{len(todo)}")
        time.sleep(2)
    return out


if __name__ == "__main__":
    ids = None
    if "--ids" in sys.argv:
        ids = set(sys.argv[sys.argv.index("--ids") + 1:])
    fetch(ids)
