"""Point and line to region ids. The one lookup every layer's enrich calls.

    from assign import assign_point
    rg = assign_point(51.35, 3.27)
    rg.nuts3      -> 'BE251'         (or an ITL code for GB, geoBoundaries
    rg.coast      -> 'COAST:BE-BELGIAN-COAST'          ids for UA and MD)
    rg.biogeo     -> 'ATL'
    rg.h3r4       -> '841fa4dffffffff'

Rules, from the brief, and why:

  Cache first.     The STRtree spine is built once per process from
                   cache/regions/regions.gpkg. No network, ever.
  Sea snaps.       A point no admin polygon contains (every beach centroid,
                   half the lighthouses) snaps to the nearest level 3 region
                   within SNAP_KM before the lookup gives up. Beyond that it
                   is genuinely outside the spine (a ship, a bug) and the
                   admin fields come back None.
  Stored, not      Layers store the assignment in their cache during enrich.
  recomputed.      Export reads what enrich stored, so a wire rebuild never
                   depends on this module being loadable.
  Lines assign     A trail belongs to the region holding the midpoint of its
  by midpoint.     length, and additionally reports every region it crosses,
                   so a route shows up on each region's page.

Two backends behind the same signature: the default shapely STRtree (fast
enough for every layer without a database), and PostGIS for callers already
inside the trails lab (CARTA_REGIONS_BACKEND=postgis, or set_backend()).
The PostGIS path expects load_postgis() to have mirrored the GeoPackage
into the lab once.

ASCII clean, no em dashes, per project convention.
"""

import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

GPKG = ROOT / "cache" / "regions" / "regions.gpkg"

SNAP_KM = 5.0          # sea snap for admin, per the brief
COAST_KM = 15.0        # a lagoon beach sits inland of the EEA shoreline
BASIN_SNAP_KM = 10.0
DEG_KM = 111.32        # tree queries buffer in degrees; fine at this scale


@dataclass(frozen=True)
class RegionIds:
    country: str | None
    nuts1: str | None
    nuts2: str | None
    nuts3: str | None
    lau: str | None
    coast: str | None
    range: str | None
    basin: str | None
    biogeo: str
    h3r3: str
    h3r4: str
    h3r5: str


@dataclass(frozen=True)
class LineRegions:
    """assign_line's answer: the owning ids plus everything crossed."""
    ids: RegionIds
    crosses: tuple[str, ...]


_BACKEND = os.environ.get("CARTA_REGIONS_BACKEND", "shapely").strip() or "shapely"


def set_backend(name):
    global _BACKEND
    if name not in ("shapely", "postgis"):
        raise ValueError(f"unknown backend {name!r}")
    _BACKEND = name


# ---------------------------------------------------------------------------
# The shapely spine
# ---------------------------------------------------------------------------

class _Spine:
    _instance = None

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        import geopandas as gpd
        import numpy as np
        import shapely
        if not GPKG.exists():
            raise FileNotFoundError(
                f"{GPKG} missing. Run: python pipeline/regions/build_regions.py")
        self.np = np
        self.shp = shapely

        admin = gpd.read_file(GPKG, layer="admin")
        self.parent = dict(zip(admin["id"], admin["parent"]))
        self.level_of = dict(zip(admin["id"], admin["level"]))
        self.country_of = dict(zip(admin["id"], admin["country"]))
        a3 = admin[admin["level"] == 3].reset_index(drop=True)
        self.a3_ids = list(a3["id"])
        self.a3_cc = list(a3["country"])
        self.a3_geoms = np.array(a3.geometry.values)
        self.a3_tree = shapely.STRtree(self.a3_geoms)

        self._layers = {}
        self._lau = None

    def layer(self, name):
        if name not in self._layers:
            import geopandas as gpd
            import shapely
            try:
                gdf = gpd.read_file(GPKG, layer=name)
            except Exception:
                self._layers[name] = None
                return None
            geoms = self.np.array(gdf.geometry.values)
            self._layers[name] = (gdf, geoms, shapely.STRtree(geoms))
        return self._layers[name]

    def lau_layer(self):
        if self._lau is None:
            self._lau = self.layer("lau") or False
        return self._lau or None

    # -- lookups ----------------------------------------------------------

    def admin3(self, pt):
        """(n3_id, country) via containment, else the sea snap."""
        hits = self.a3_tree.query(pt, predicate="intersects")
        if len(hits):
            i = int(hits[0])
            return self.a3_ids[i], self.a3_cc[i]
        near = self.a3_tree.query_nearest(pt, max_distance=SNAP_KM / DEG_KM,
                                          all_matches=False)
        if len(near):
            i = int(near[0])
            return self.a3_ids[i], self.a3_cc[i]
        return None, None

    def contains(self, name, pt, snap_km=0.0):
        got = self.layer(name)
        if got is None:
            return None
        gdf, geoms, tree = got
        hits = tree.query(pt, predicate="intersects")
        if len(hits):
            return gdf, int(hits[0])
        if snap_km:
            near = tree.query_nearest(pt, max_distance=snap_km / DEG_KM,
                                      all_matches=False)
            if len(near):
                return gdf, int(near[0])
        return None

    def coast_near(self, pt):
        got = self.layer("coast")
        if got is None:
            return None
        gdf, geoms, tree = got
        near = tree.query_nearest(pt, max_distance=COAST_KM / DEG_KM,
                                  all_matches=False)
        if len(near):
            return str(gdf.iloc[int(near[0])]["id"])
        return None

    def range_at(self, pt):
        """The most specific GMBA range containing the point: deepest
        hierarchy level wins, smallest range breaks a tie."""
        got = self.layer("range")
        if got is None:
            return None
        gdf, geoms, tree = got
        hits = tree.query(pt, predicate="intersects")
        if not len(hits):
            return None
        rows = gdf.iloc[[int(h) for h in hits]]
        rows = rows.sort_values(["level"], ascending=False)
        return str(rows.iloc[0]["id"])

    def biogeo_at(self, pt):
        got = self.layer("biogeo")
        if got is None:
            return "OUT"
        gdf, geoms, tree = got
        hits = tree.query(pt, predicate="intersects")
        if len(hits):
            return str(gdf.iloc[int(hits[0])]["code"])
        near = tree.query_nearest(pt, all_matches=False)
        if len(near):
            return str(gdf.iloc[int(near[0])]["code"])
        return "OUT"


def _chain(spine, n3):
    """n3 -> (country, n1, n2). Works for NUTS and ITL through the parent
    column; geoBoundaries tiers may miss a level, which stays None."""
    if n3 is None:
        return None, None, None
    n1 = n2 = None
    node = n3
    for _ in range(4):
        node = spine.parent.get(node) or None
        if node is None:
            break
        lvl = spine.level_of.get(node)
        if lvl == 2:
            n2 = node
        elif lvl == 1:
            n1 = node
    return spine.country_of.get(n3), n1, n2


def _h3_cells(lat, lon):
    import h3
    return (h3.latlng_to_cell(lat, lon, 3),
            h3.latlng_to_cell(lat, lon, 4),
            h3.latlng_to_cell(lat, lon, 5))


def assign_point(lat, lon, *, include_lau=False):
    """RegionIds for one coordinate. See the module docstring for rules."""
    if _BACKEND == "postgis":
        return _assign_point_pg(lat, lon, include_lau=include_lau)
    if lat is None or lon is None or not (math.isfinite(lat) and math.isfinite(lon)):
        raise ValueError(f"assign_point needs finite coordinates, got {lat}, {lon}")
    spine = _Spine.get()
    pt = spine.shp.Point(lon, lat)

    n3, cc = spine.admin3(pt)
    country, n1, n2 = _chain(spine, n3)
    country = country or cc

    lau = None
    if include_lau:
        got = spine.lau_layer()
        if got is not None:
            gdf, geoms, tree = got
            hits = tree.query(pt, predicate="intersects")
            if len(hits):
                lau = str(gdf.iloc[int(hits[0])]["id"])

    got = spine.contains("basin", pt, snap_km=BASIN_SNAP_KM)
    basin = str(got[0].iloc[got[1]]["id"]) if got else None

    h3r3, h3r4, h3r5 = _h3_cells(lat, lon)
    return RegionIds(
        country=country, nuts1=n1, nuts2=n2, nuts3=n3, lau=lau,
        coast=spine.coast_near(pt), range=spine.range_at(pt), basin=basin,
        biogeo=spine.biogeo_at(pt), h3r3=h3r3, h3r4=h3r4, h3r5=h3r5)


def assign_line(coords, *, sample_km=3.0):
    """LineRegions for a route. `coords` is [(lat, lon), ...] in route
    order. The owning ids come from the point at half the route's length;
    `crosses` lists every level 3 region and every range the line passes
    through, so a route can appear on each of their pages."""
    if not coords:
        raise ValueError("assign_line needs at least one coordinate")
    if len(coords) == 1:
        ids = assign_point(coords[0][0], coords[0][1])
        crosses = tuple(x for x in (ids.nuts3, ids.range) if x)
        return LineRegions(ids=ids, crosses=crosses)

    # Cumulative length walk, then the midpoint by length, not by index:
    # a route with dense switchback vertices at one end would otherwise
    # "belong" to whichever end the GPS chattered in.
    from region_sources import haversine_km
    steps = [0.0]
    for (lat1, lon1), (lat2, lon2) in zip(coords, coords[1:]):
        steps.append(steps[-1] + haversine_km(lat1, lon1, lat2, lon2))
    total = steps[-1]
    half = total / 2.0
    mid = coords[0]
    for i in range(1, len(coords)):
        if steps[i] >= half:
            seg = steps[i] - steps[i - 1]
            f = 0.0 if seg == 0 else (half - steps[i - 1]) / seg
            mid = (coords[i - 1][0] + f * (coords[i][0] - coords[i - 1][0]),
                   coords[i - 1][1] + f * (coords[i][1] - coords[i - 1][1]))
            break
    ids = assign_point(mid[0], mid[1])

    crossed = []
    seen = set()
    want = max(2, int(total / sample_km) + 1)
    marks = [total * k / (want - 1) for k in range(want)]
    j = 0
    for m in marks:
        while j < len(steps) - 2 and steps[j + 1] < m:
            j += 1
        seg = steps[j + 1] - steps[j]
        f = 0.0 if seg == 0 else (m - steps[j]) / seg
        lat = coords[j][0] + f * (coords[j + 1][0] - coords[j][0])
        lon = coords[j][1] + f * (coords[j + 1][1] - coords[j][1])
        spine = _Spine.get()
        pt = spine.shp.Point(lon, lat)
        n3, _cc = spine.admin3(pt)
        rng = spine.range_at(pt)
        for rid in (n3, rng):
            if rid and rid not in seen:
                seen.add(rid)
                crossed.append(rid)
    return LineRegions(ids=ids, crosses=tuple(crossed))


def wire_rg(ids):
    """The compact per row wire block: {"n3","n2","co","bg","h4"}, absent
    keys dropped rather than nulled, ~60 bytes a card."""
    rg = {}
    if ids.nuts3:
        rg["n3"] = ids.nuts3
    if ids.nuts2:
        rg["n2"] = ids.nuts2
    if ids.coast:
        rg["co"] = ids.coast
    if ids.range:
        rg["ra"] = ids.range
    if ids.basin:
        rg["ba"] = ids.basin
    if ids.biogeo and ids.biogeo != "OUT":
        rg["bg"] = ids.biogeo
    rg["h4"] = ids.h3r4
    return rg


def stamp_rows(rows, *, force=False, quiet=False):
    """rg onto every row dict with a lat/lon that lacks one. The helper the
    enrich stages call: assignment happens at enrich and is STORED, so the
    export never needs this module loadable. A missing spine degrades to a
    warning rather than an error, because a fresh clone must still be able
    to enrich before it has ever built the GeoPackage."""
    try:
        _Spine.get()
    except Exception as exc:
        if not quiet:
            print(f"    [regions] spine unavailable, rg not stamped ({exc})")
        return 0
    n = 0
    for row in rows:
        if row.get("rg") and not force:
            continue
        lat, lon = row.get("lat"), row.get("lon")
        if lat is None or lon is None:
            continue
        try:
            row["rg"] = wire_rg(assign_point(lat, lon))
            n += 1
        except ValueError:
            continue
    return n


def rg_from_cache(rec):
    """The stored enrich assignment back into a wire block. Layers store
    assign_point's answer under rec['rg'] as a plain dict; export must not
    need the spine loaded (stored, not recomputed)."""
    rg = rec.get("rg")
    return dict(rg) if isinstance(rg, dict) else None


# ---------------------------------------------------------------------------
# The PostGIS path
# ---------------------------------------------------------------------------

def load_postgis():
    """Mirror the GeoPackage into the trails lab so trail ingestion can
    assign 236k staged routes with SQL instead of a Python loop. Idempotent:
    drops and reloads the regions_* tables."""
    import geopandas as gpd
    from sqlalchemy import create_engine
    sys.path.insert(0, str(ROOT / "pipeline" / "trails"))
    import db as trailsdb  # noqa: E402
    s = trailsdb.settings()
    engine = create_engine(
        f"postgresql+psycopg://{s['user']}:{s['password']}@{s['host']}:{s['port']}/{s['dbname']}")
    for layer in ("admin", "lau", "coast", "range", "basin", "biogeo"):
        try:
            gdf = gpd.read_file(GPKG, layer=layer)
        except Exception:
            continue
        gdf.to_postgis(f"regions_{layer}", engine, if_exists="replace", index=False)
        print(f"[regions] postgis: regions_{layer} loaded ({len(gdf)} rows)")


def _assign_point_pg(lat, lon, *, include_lau=False):
    sys.path.insert(0, str(ROOT / "pipeline" / "trails"))
    import db as trailsdb  # noqa: E402
    q_contains = ("SELECT id, country FROM regions_admin WHERE level = 3 AND "
                  "ST_Intersects(geometry, ST_SetSRID(ST_Point(%s, %s), 4326)) LIMIT 1")
    q_near = ("SELECT id, country FROM regions_admin WHERE level = 3 "
              "ORDER BY geometry <-> ST_SetSRID(ST_Point(%s, %s), 4326) LIMIT 1")
    with trailsdb.connect() as conn, conn.cursor() as cur:
        cur.execute(q_contains, (lon, lat))
        row = cur.fetchone()
        if row is None:
            cur.execute(q_near, (lon, lat))
            row = cur.fetchone()
        n3 = row[0] if row else None

        def one(sql, args):
            cur.execute(sql, args)
            got = cur.fetchone()
            return got[0] if got else None

        coast = one("SELECT id FROM regions_coast WHERE ST_DWithin(geometry, "
                    "ST_SetSRID(ST_Point(%s, %s), 4326), %s) "
                    "ORDER BY geometry <-> ST_SetSRID(ST_Point(%s, %s), 4326) LIMIT 1",
                    (lon, lat, COAST_KM / DEG_KM, lon, lat))
        rng = one("SELECT id FROM regions_range WHERE ST_Intersects(geometry, "
                  "ST_SetSRID(ST_Point(%s, %s), 4326)) "
                  "ORDER BY level DESC LIMIT 1", (lon, lat))
        basin = one("SELECT id FROM regions_basin WHERE ST_Intersects(geometry, "
                    "ST_SetSRID(ST_Point(%s, %s), 4326)) LIMIT 1", (lon, lat))
        biogeo = one("SELECT code FROM regions_biogeo ORDER BY "
                     "geometry <-> ST_SetSRID(ST_Point(%s, %s), 4326) LIMIT 1",
                     (lon, lat)) or "OUT"
        lau = None
        if include_lau:
            lau = one("SELECT id FROM regions_lau WHERE ST_Intersects(geometry, "
                      "ST_SetSRID(ST_Point(%s, %s), 4326)) LIMIT 1", (lon, lat))

    spine = _Spine.get()  # parent chain still comes from the light tables
    country, n1, n2 = _chain(spine, n3)
    h3r3, h3r4, h3r5 = _h3_cells(lat, lon)
    return RegionIds(country=country, nuts1=n1, nuts2=n2, nuts3=n3, lau=lau,
                     coast=coast, range=rng, basin=basin, biogeo=biogeo,
                     h3r3=h3r3, h3r4=h3r4, h3r5=h3r5)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Try the region lookup on one point")
    ap.add_argument("lat", type=float)
    ap.add_argument("lon", type=float)
    ap.add_argument("--lau", action="store_true")
    args = ap.parse_args()
    print(assign_point(args.lat, args.lon, include_lau=args.lau))
