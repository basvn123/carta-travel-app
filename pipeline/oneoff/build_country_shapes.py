"""Country outlines for the Visited map, one small file the browser can hold.

The saved-trips map paints every country the traveller has finished a trip in.
The basemap is raster-free vector tiles with no admin polygons in them, so the
shapes have to ship with the app. Natural Earth 1:50m admin-0 is the source
(cache/ne_50m_admin0.geojson, already pulled by the crowding layer); this
reduces it to the 43 countries the catalogue knows, keyed by ISO2, simplified
to roughly 2 km and rounded to 3 decimals. That is far coarser than a border
map would want and exactly right for a 300 px map of Europe at zoom 3 to 6.

    python pipeline/oneoff/build_country_shapes.py

Writes continent-app/public/country_shapes.json (committed, ~200 kB).
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "cache" / "ne_50m_admin0.geojson"
OUT = ROOT / "continent-app" / "public" / "country_shapes.json"

# Mirrors COUNTRY_ISO2 in continent-app/src/components/CountryFlag.jsx.
WANTED = {
    "AL", "AD", "AT", "BA", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE",
    "ES", "FI", "FO", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI",
    "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT",
    "RO", "RS", "SE", "SI", "SK", "SM", "XK",
}

EPS = 0.02          # Douglas-Peucker tolerance in degrees, about 2 km
PRECISION = 3       # ~110 m, below what a zoom-6 map can show
MIN_RING_SHARE = 0.004   # drop islands under 0.4% of the country's main ring
MAX_RINGS = 60
# Natural Earth files overseas departments under their sovereign: France's
# admin-0 shape reaches French Guiana, which would paint a patch of South
# America (and wreck any framing) the moment a traveller visits France.
EUROPE = (-32.0, 26.0, 45.0, 82.0)   # west, south, east, north


def ring_area(ring):
    """Twice the signed area of a closed ring, in square degrees."""
    a = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[i + 1][0], ring[i + 1][1]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def simplify(points, eps):
    """Douglas-Peucker, iterative so a 20k-point coastline cannot blow the stack."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi <= lo + 1:
            continue
        x1, y1 = points[lo][0], points[lo][1]
        x2, y2 = points[hi][0], points[hi][1]
        dx, dy = x2 - x1, y2 - y1
        norm = (dx * dx + dy * dy) ** 0.5
        worst, worst_i = -1.0, lo
        for i in range(lo + 1, hi):
            px, py = points[i][0], points[i][1]
            if norm == 0:
                d = ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
            else:
                d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
            if d > worst:
                worst, worst_i = d, i
        if worst > eps:
            keep[worst_i] = True
            stack.append((lo, worst_i))
            stack.append((worst_i, hi))
    return [p for p, k in zip(points, keep) if k]


def clean_ring(ring):
    out = simplify(ring, EPS)
    out = [[round(x, PRECISION), round(y, PRECISION)] for x, y in ((p[0], p[1]) for p in out)]
    # Rounding can collapse neighbours; a ring needs 4 points to close.
    deduped = [out[0]]
    for p in out[1:]:
        if p != deduped[-1]:
            deduped.append(p)
    if deduped[0] != deduped[-1]:
        deduped.append(deduped[0])
    return deduped if len(deduped) >= 4 else None


def in_europe(ring):
    """Does this ring's bounding box touch the European window at all?"""
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    w, s, e, n = EUROPE
    return max(xs) >= w and min(xs) <= e and max(ys) >= s and min(ys) <= n


def clean_polygons(geom):
    """MultiPolygon in, list of polygons (list of rings) out, islands pruned."""
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    polys = [p for p in polys if p and len(p[0]) >= 4 and in_europe(p[0])]
    sized = sorted(((ring_area(p[0]), p) for p in polys), key=lambda t: -t[0])
    if not sized:
        return []
    biggest = sized[0][0] or 1.0
    out = []
    for area, poly in sized[:MAX_RINGS]:
        if area / biggest < MIN_RING_SHARE:
            break
        rings = []
        for r in poly:
            cleaned = clean_ring(r)
            if cleaned:
                rings.append(cleaned)
        if rings:
            out.append(rings)
    return out


def main():
    src = json.loads(SRC.read_text(encoding="utf-8"))
    by_iso = {}
    for f in src["features"]:
        p = f["properties"]
        # ISO codes only. Natural Earth's POSTAL field collides across the
        # world (eSwatini posts as "ES"), and that feature sorts before Spain,
        # so a postal fallback silently drew Spain in southern Africa.
        iso = next((p.get(k) for k in ("ISO_A2_EH", "ISO_A2") if p.get(k) in WANTED), None)
        if not iso or iso in by_iso:
            continue
        polys = clean_polygons(f["geometry"])
        if polys:
            by_iso[iso] = polys

    missing = sorted(WANTED - set(by_iso))
    features = [{
        "type": "Feature",
        "properties": {"iso2": iso},
        "geometry": {"type": "MultiPolygon", "coordinates": polys},
    } for iso, polys in sorted(by_iso.items())]
    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"{len(features)} countries -> {OUT} ({OUT.stat().st_size / 1024:.0f} kB)")
    if missing:
        print("missing:", ", ".join(missing))


if __name__ == "__main__":
    main()
