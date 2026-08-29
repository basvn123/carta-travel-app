"""Cut the EEA coastline into named coastal stretches.

Nobody plans a trip around a NUTS3 code, and nobody says "the coast of
postcode ES618" either. They say the Costa de la Luz, the Cote d'Azur, the
Zeeland delta. This module builds that unit: contiguous stretches of 40 to
120 km of coastline, cut at national borders first and administrative seams
second, hand named where a traveller has a name for them (seed_coasts.py)
and honestly labelled "<region> coast" where nobody does.

How the cut works, ring by ring:

  1. The EEA coastline for analysis (polygon, v3.0, EPSG:3035) is exploded
     into its exterior rings. A ring is one island or one mainland outline.
  2. Rings shorter than RING_OWN_KM are archipelago noise at stretch scale;
     they are grouped per NUTS3 into one "islands" stretch each, because
     "the Cyclades" is a real browsing unit and forty separate 3 km rings
     are not.
  3. Longer rings are walked at SAMPLE_M intervals and every sample is
     assigned to the nearest level 3 admin region. Where the country of the
     sample changes the ring is cut hard (a stretch never crosses a
     border); where only the region changes it is cut soft.
  4. Soft cut arcs are merged greedily along the ring until a stretch is at
     least TARGET_KM, never beyond MAX_KM. An arc longer than MAX_KM on its
     own (a long uniform coast inside one region) is split evenly.
  5. seed_coasts.py then puts real names on the stretches a traveller
     would search for, merging neighbouring auto stretches when the named
     coast is longer than one cut (span_km).

Every walk along a ring runs on a numpy cumulative distance table rather
than shapely's interpolate/substring. The mainland ring carries a couple of
million vertices at 1:100k, and per sample interpolation against it is a
scan: the first cut of Europe spent half an hour inside GEOS before this
table replaced it with searchsortedding minutes.

Everything is measured in EPSG:3035 metres and shipped in EPSG:4326.

Known coverage edge, recorded rather than papered over: the EEA coastline
covers the EEA39 area, so the Ukrainian Black Sea coast is absent. Rows
there carry no coast id and the coverage audit reports the reason.

ASCII clean, no em dashes, per project convention.
"""

import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import LineString, MultiLineString

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import region_sources as rs  # noqa: E402

SAMPLE_M = 2000.0
RING_OWN_KM = 40.0     # a ring below this joins its region's islands group
TINY_GROUP_MIN_KM = 12.0
TARGET_KM = 75.0       # close a stretch once it is at least this long
MAX_KM = 120.0
MIN_KM = 40.0
FAR_RING_KM = 60.0     # a ring whose samples sit farther than this from any
                       # level 3 region is outside the admin spine (odd
                       # artefacts, far archipelagos) and is dropped

CRS_M = "EPSG:3035"


def log(msg):
    print(f"[regions] {msg}", flush=True)


class _Ring:
    """One exterior ring as a vertex array plus its cumulative distances.
    All the walking (sampling, cutting, measuring) happens against the
    table; shapely only ever sees the finished pieces."""

    def __init__(self, coords):
        self.xy = np.asarray(coords, dtype=float)
        seg = np.hypot(np.diff(self.xy[:, 0]), np.diff(self.xy[:, 1]))
        self.cum = np.concatenate([[0.0], np.cumsum(seg)])
        self.length = float(self.cum[-1])

    def points_at(self, dists):
        dists = np.clip(np.asarray(dists, dtype=float), 0.0, self.length)
        i = np.clip(np.searchsorted(self.cum, dists, side="right") - 1,
                    0, len(self.cum) - 2)
        seg = self.cum[i + 1] - self.cum[i]
        f = np.where(seg > 0, (dists - self.cum[i]) / np.where(seg == 0, 1, seg), 0.0)
        x = self.xy[i, 0] + f * (self.xy[i + 1, 0] - self.xy[i, 0])
        y = self.xy[i, 1] + f * (self.xy[i + 1, 1] - self.xy[i, 1])
        return shapely.points(x, y)

    def substring(self, a, b):
        """The piece between distances a < b, wrapping past the seam."""
        if b > self.length:
            return (self.substring(a, self.length)
                    + self.substring(0.0, b - self.length))
        a = max(0.0, a)
        b = min(self.length, b)
        i0 = int(np.searchsorted(self.cum, a, side="right"))
        i1 = int(np.searchsorted(self.cum, b, side="left"))
        pa = self._point_tuple(a)
        pb = self._point_tuple(b)
        middle = [tuple(p) for p in self.xy[i0:i1]]
        pts = [pa] + middle + [pb]
        if len(pts) < 2:
            pts = [pa, pb]
        return [LineString(pts)]

    def _point_tuple(self, d):
        i = int(np.clip(np.searchsorted(self.cum, d, side="right") - 1,
                        0, len(self.cum) - 2))
        seg = self.cum[i + 1] - self.cum[i]
        f = 0.0 if seg == 0 else (d - self.cum[i]) / seg
        return (float(self.xy[i, 0] + f * (self.xy[i + 1, 0] - self.xy[i, 0])),
                float(self.xy[i, 1] + f * (self.xy[i + 1, 1] - self.xy[i, 1])))


def _coastline_rings():
    """Exterior rings of the EEA coastline polygons, in metres."""
    import geopandas as gpd
    zip_path = rs.SRC / "eea" / "eea_coastline_polygon_v3.zip"
    with zipfile.ZipFile(zip_path) as z:
        shp = next(n for n in z.namelist() if n.endswith(".shp"))
    gdf = gpd.read_file(f"zip://{zip_path}!{shp}")
    gdf = gdf.to_crs(CRS_M)
    rings = []
    for geom in gdf.geometry:
        if geom is None:
            continue
        parts = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
        for part in parts:
            ring = _Ring(part.exterior.coords)
            if ring.length > 500.0:  # half a km of shoreline minimum
                rings.append(ring)
    rings.sort(key=lambda r: -r.length)
    log(f"coasts: {len(rings)} rings, "
        f"{sum(r.length for r in rings) / 1000:,.0f} km of shoreline")
    return rings


class _Admin3:
    """Nearest level 3 region lookup, in metres, via one STRtree."""

    def __init__(self, admin):
        a3 = admin[admin["level"] == 3].reset_index(drop=True)
        a3m = a3.to_crs(CRS_M)
        self.ids = list(a3["id"])
        self.cc = list(a3["country"])
        self.names = dict(zip(a3["id"], a3["name"]))
        self.geoms = np.array(a3m.geometry.values)
        self.tree = shapely.STRtree(self.geoms)

    def nearest(self, points):
        """(n3_idx array, distance array) for an array of points."""
        idx = self.tree.query_nearest(points, all_matches=False)
        out = np.full(len(points), -1, dtype=int)
        out[idx[0]] = idx[1]
        dist = np.where(out >= 0,
                        shapely.distance(points, self.geoms[np.clip(out, 0, None)]),
                        np.inf)
        return out, dist


def _walk_ring(ring, a3):
    """Sample one ring and return per-sample (distance, n3 index, metres
    to that region)."""
    n = max(4, int(ring.length // SAMPLE_M))
    dists = np.linspace(0.0, ring.length, n, endpoint=False)
    pts = ring.points_at(dists)
    idx, far = a3.nearest(pts)
    return dists, idx, far


def _arcs_from_samples(ring, dists, idx):
    """Cut the ring where the assigned region changes.

    Returns (start_m, end_m, n3_idx) arcs covering the ring in order. The
    cut lands halfway between the last sample of one region and the first
    of the next, which at SAMPLE_M spacing puts the seam within a kilometre
    of the truth, better than the 20 m coastline generalisation deserves."""
    arcs = []
    start = 0.0
    for i in range(1, len(dists)):
        if idx[i] != idx[i - 1]:
            cut = (dists[i - 1] + dists[i]) / 2.0
            arcs.append((start, cut, idx[i - 1]))
            start = cut
    arcs.append((start, ring.length, idx[-1]))
    # A ring is circular: if it opens and closes in the same region, the
    # first and last arcs are one arc that happens to straddle the seam.
    if len(arcs) > 1 and arcs[0][2] == arcs[-1][2]:
        s_last, e_last, r = arcs.pop()
        s_first, e_first, _ = arcs.pop(0)
        arcs.append((s_last, e_last + e_first, r))
    return arcs


def _greedy_stretches(arcs, a3):
    """Merge same country arcs along the ring into stretches of
    MIN..MAX km, targeting TARGET km."""
    stretches = []
    run = []
    run_km = 0.0
    run_cc = None

    def close():
        nonlocal run, run_km, run_cc
        if run:
            stretches.append(list(run))
        run, run_km, run_cc = [], 0.0, None

    for arc in arcs:
        s, e, r = arc
        km = (e - s) / 1000.0
        cc = a3.cc[r]
        if run and cc != run_cc:
            close()
        if km > MAX_KM:
            close()
            pieces = int(np.ceil(km / TARGET_KM))
            step = (e - s) / pieces
            for p in range(pieces):
                stretches.append([(s + p * step, s + (p + 1) * step, r)])
            continue
        run.append(arc)
        run_km += km
        run_cc = cc
        if run_km >= TARGET_KM:
            close()
    close()

    # Sweep short leftovers into a neighbour from the same country: the tail
    # of a ring, or a sliver region between two long coasts.
    merged = []
    for st in stretches:
        km = sum((e - s) / 1000.0 for s, e, _ in st)
        cc = a3.cc[st[0][2]]
        if (merged and km < MIN_KM
                and a3.cc[merged[-1][0][2]] == cc
                and sum((e - s) / 1000.0 for s, e, _ in merged[-1]) + km <= MAX_KM):
            merged[-1].extend(st)
        else:
            merged.append(st)
    return merged


def build_stretches(admin):
    """The whole cut. Returns (GeoDataFrame in 4326, coast_km_by_n3)."""
    import geopandas as gpd

    a3 = _Admin3(admin)
    rings = _coastline_rings()

    coast_km_by_n3 = defaultdict(float)
    rows = []          # dicts with metres geometry, converted at the end
    tiny = defaultdict(list)   # n3_idx -> [ring LineStrings]
    tiny_km = defaultdict(float)

    for count, ring in enumerate(rings):
        if count and count % 2000 == 0:
            log(f"coasts: {count}/{len(rings)} rings walked")
        ring_km = ring.length / 1000.0
        dists, idx, far = _walk_ring(ring, a3)
        if float(np.median(far)) > FAR_RING_KM * 1000.0:
            continue
        if ring_km < RING_OWN_KM:
            r = int(np.bincount(idx[idx >= 0]).argmax()) if (idx >= 0).any() else -1
            if r >= 0:
                tiny[r].append(LineString(ring.xy))
                tiny_km[r] += ring_km
                coast_km_by_n3[a3.ids[r]] += ring_km
            continue
        for i in np.nonzero(idx >= 0)[0]:
            coast_km_by_n3[a3.ids[idx[i]]] += SAMPLE_M / 1000.0
        for st in _greedy_stretches(_arcs_from_samples(ring, dists, idx), a3):
            parts, share = [], defaultdict(float)
            for s, e, r in st:
                parts.extend(ring.substring(s, e))
                share[r] += (e - s) / 1000.0
            dom = max(share, key=share.get)
            rows.append({
                "cc": a3.cc[dom],
                "n3": a3.ids[dom],
                "n3_list": ",".join(sorted({a3.ids[r] for r in share})),
                "length_km": round(sum(share.values()), 1),
                "kind": "island" if ring_km <= MAX_KM else "mainland",
                "geom_m": MultiLineString([p for p in parts
                                           if not p.is_empty and p.length > 0]),
            })

    for r, geoms in tiny.items():
        if tiny_km[r] < TINY_GROUP_MIN_KM:
            # Too little shoreline to be a browsing unit on its own; ride
            # along with the region's biggest stretch if it has one.
            host = next((row for row in sorted(rows, key=lambda x: -x["length_km"])
                         if row["n3"] == a3.ids[r]), None)
            if host is not None:
                host["geom_m"] = MultiLineString(
                    list(host["geom_m"].geoms) + geoms)
                host["length_km"] = round(host["length_km"] + tiny_km[r], 1)
                continue
        rows.append({
            "cc": a3.cc[r],
            "n3": a3.ids[r],
            "n3_list": a3.ids[r],
            "length_km": round(tiny_km[r], 1),
            "kind": "islands",
            "geom_m": MultiLineString(geoms),
        })

    # Stable ids before naming: COAST:CC-N3 with a -2, -3 suffix where one
    # region owns several stretches, in coast order as cut (rings are
    # walked longest first, so the order is stable build to build).
    seen = defaultdict(int)
    for row in rows:
        seen[row["n3"]] += 1
        k = seen[row["n3"]]
        base = f"COAST:{row['cc']}-{row['n3']}"
        row["id"] = base if k == 1 else f"{base}-{k}"
        suffix = " islands" if row["kind"] == "islands" else " coast"
        row["name"] = f"{a3.names[row['n3']]}{suffix}"
        row["named"] = False

    import seed_coasts
    n_named = seed_coasts.apply(rows)
    log(f"coasts: {len(rows)} stretches, {n_named} carry a traveller's name")

    _neighbours(rows)

    gdf = gpd.GeoDataFrame(
        [{k: v for k, v in row.items() if k != "geom_m"} for row in rows],
        geometry=[_as_mls(row["geom_m"]) for row in rows],
        crs=CRS_M).to_crs("EPSG:4326")
    return gdf, {k: round(v, 1) for k, v in sorted(coast_km_by_n3.items())}


def _as_mls(geom):
    """One geometry type for the layer, whatever the cut produced."""
    if geom.geom_type == "MultiLineString":
        return geom
    if geom.geom_type == "LineString":
        return MultiLineString([geom])
    return MultiLineString([g for g in geom.geoms
                            if g.geom_type == "LineString" and not g.is_empty])


def _skeleton(geom, step=25):
    """Every step-th vertex as a MultiPoint: close enough for a 25 km
    adjacency question, hundreds of times cheaper than exact distance
    between two hundred thousand vertex shorelines."""
    pts = []
    for part in geom.geoms:
        xy = np.asarray(part.coords)
        pts.append(xy[::step])
        pts.append(xy[-1:])
    return shapely.multipoints(np.vstack(pts))


def _neighbours(rows):
    """Adjacent stretches, for "nothing here, try next door". Two stretches
    are neighbours when their skeletons come within 25 km, which covers
    ring order adjacency, island groups off their mainland, and a strait."""
    skel = [_skeleton(r["geom_m"]) for r in rows]
    cent = [shapely.centroid(s) for s in skel]
    tree = shapely.STRtree(skel)
    for i, row in enumerate(rows):
        cand = tree.query(shapely.buffer(cent[i], 200_000.0))
        near = []
        for j in cand:
            j = int(j)
            if j == i:
                continue
            if shapely.distance(skel[i], skel[j]) <= 25_000.0:
                near.append((shapely.distance(cent[i], cent[j]), rows[j]["id"]))
        near.sort()
        row["neighbours"] = ",".join(nid for _, nid in near[:6])
