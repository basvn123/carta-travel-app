"""Europe as one drawn map for Your Europe (T970), pre-projected for SVG.

Tier: One-shot, done, kept for provenance (pipeline/oneoff)

Your Europe paints the countries a traveller has been to. T926 drew them as
a tile cartogram; the owner asked for "the cleanest, nicest looking map"
(2026-11-01). This projects Natural Earth 1:50m admin-0
(cache/ne_50m_admin0.geojson, already pulled by the crowding layer) to
Lambert azimuthal equal-area centred 52N 10E (the EU's EPSG:3035 framing),
frames Iceland to Cyprus, clips to that frame, simplifies in projected space
and writes SVG path strings, so the app draws it with no projection code.

The 43 catalogue countries come out one path each, with a label point and
their true area (equal-area projection, so a share of the area is honest);
the land around them (Ukraine, Belarus, Russia, Turkey, North Africa) comes
out as one context path so the map has no hole in the east. The smallest
countries carry dot=true: the app draws them as a dot that can be seen.

    python pipeline/oneoff/build_europe_map.py

Writes continent-app/public/europe_map.json (committed).
"""

import json
import math
from pathlib import Path

from shapely.geometry import box, shape, MultiPolygon, Polygon
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "cache" / "ne_50m_admin0.geojson"
OUT = ROOT / "continent-app" / "public" / "europe_map.json"

# Mirrors COUNTRY_ISO2 in continent-app/src/components/CountryFlag.jsx.
WANTED = {
    "AL", "AD", "AT", "BA", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE",
    "ES", "FI", "FO", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI",
    "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT",
    "RO", "RS", "SE", "SI", "SK", "SM", "XK",
}
# Parts of a catalogue country outside this box are not Europe on this map
# (French Guiana, the Canaries, the Azores, Madeira, Svalbard).
EUROPE = (-24.9, 34.0, 45.0, 71.5)   # west, south, east, north

R = 6371.0
LON0, LAT0 = math.radians(10.0), math.radians(52.0)
VIEW_W = 1000.0          # the SVG viewBox width; height follows the frame
PAD = 0.02               # of the frame, round the catalogue's extent
SIMPLIFY_PX = 0.45       # tolerance in viewBox units, under half a pixel at phone size
DOT_AREA_KM2 = 3000.0    # under this a country is drawn as a dot too (LU is 2,586)


def laea(lon, lat):
    """Lambert azimuthal equal-area, km, y up."""
    lam, phi = math.radians(lon), math.radians(lat)
    k = math.sqrt(2 / (1 + math.sin(LAT0) * math.sin(phi) + math.cos(LAT0) * math.cos(phi) * math.cos(lam - LON0)))
    x = R * k * math.cos(phi) * math.sin(lam - LON0)
    y = R * k * (math.cos(LAT0) * math.sin(phi) - math.sin(LAT0) * math.cos(phi) * math.cos(lam - LON0))
    return x, y


def project(geom):
    return transform(lambda xs, ys, zs=None: tuple(zip(*[laea(x, y) for x, y in zip(xs, ys)])), geom)


def europe_part(geom):
    """Only the polygons of a country that lie in Europe's box."""
    eu = box(*EUROPE)
    polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
    keep = [p for p in polys if eu.contains(p.representative_point())]
    return MultiPolygon(keep) if keep else None


def path_d(geom, fx):
    """SVG path data, one subpath per ring, 1 decimal."""
    out = []
    polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
    for p in polys:
        if not isinstance(p, Polygon) or p.is_empty:
            continue
        for ring in [p.exterior, *p.interiors]:
            pts = [fx(x, y) for x, y in ring.coords[:-1]]
            if len(pts) < 3:
                continue
            out.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z")
    return "".join(out)


def main():
    feats = json.loads(SRC.read_text(encoding="utf-8"))["features"]
    cat, ctx = {}, []
    for f in feats:
        p = f["properties"]
        cc = p.get("ISO_A2_EH") if p.get("ISO_A2_EH") not in (None, "-99") else p.get("ISO_A2")
        g = shape(f["geometry"])
        if cc in WANTED:
            part = europe_part(g)
            if part is not None:
                cat[cc] = project(part)
        else:
            ctx.append(g)
    missing = WANTED - set(cat)
    assert not missing, f"no shape for {sorted(missing)}"

    # The frame: the catalogue's extent, padded, in km.
    minx, miny, maxx, maxy = unary_union(list(cat.values())).bounds
    px, py = (maxx - minx) * PAD, (maxy - miny) * PAD
    minx, miny, maxx, maxy = minx - px, miny - py, maxx + px, maxy + py
    scale = VIEW_W / (maxx - minx)
    view_h = (maxy - miny) * scale
    frame_km = box(minx, miny, maxx, maxy)
    tol_km = SIMPLIFY_PX / scale

    def fx(x, y):
        return (x - minx) * scale, (maxy - y) * scale

    countries = []
    for cc in sorted(cat):
        g = cat[cc]
        area = g.area  # km2, true because the projection is equal-area
        drawn = g.simplify(tol_km, preserve_topology=True).intersection(frame_km)
        lp = g.representative_point() if area > DOT_AREA_KM2 else g.centroid
        cx, cy = fx(lp.x, lp.y)
        countries.append({
            "cc": cc,
            "d": path_d(drawn, fx),
            "x": round(cx, 1),
            "y": round(cy, 1),
            "km2": round(area),
            **({"dot": True} if area < DOT_AREA_KM2 else {}),
        })

    # Context land: every other country inside the frame, as one path.
    frame_deg = box(-45, 25, 60, 80)
    near = [g.intersection(frame_deg) for g in ctx if g.intersects(frame_deg)]
    land = project(unary_union([g for g in near if not g.is_empty]))
    land = land.simplify(tol_km * 1.5, preserve_topology=True).intersection(frame_km)

    out = {
        "source": "Natural Earth 1:50m admin-0, Lambert azimuthal equal-area 52N 10E",
        "w": VIEW_W,
        "h": round(view_h, 1),
        "countries": countries,
        "context": path_d(land, fx),
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.name}: {OUT.stat().st_size // 1024} kB, {len(countries)} countries, {VIEW_W:.0f}x{view_h:.0f}")


if __name__ == "__main__":
    main()
