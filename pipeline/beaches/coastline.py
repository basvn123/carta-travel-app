"""Which way a beach faces, and whether the sun sets over its water.

"Watch the sunset from the sand" is a real reason to choose one beach over
the next one along the same coast, it is the kind of thing a person plans an
evening around, and no competitor offers it as a filter. It is also entirely
computable from data already on this disk, which is why the brief calls it
low cost: the EEA coastline polygon says where the land stops, and spherical
astronomy says where the sun goes down.

Two numbers come out of it, and the second depends on the first:

  aspect          the true bearing from the sand out to sea, 0..359. This is
                  the useful primitive: it is what "west facing" means, and
                  once a beach has one, sunset is arithmetic.
  sunset_facing   whether that bearing looks into the arc the sun sets
                  through at this latitude during the bathing season.

How the aspect is found, and why it is not just the shore bearing: the shore
runs ALONG the beach, so its bearing is the one direction that is certainly
not the answer. The two perpendiculars are the candidates, and the sea is
whichever of them is not land. The EEA coastline is a POLYGON dataset, so
"is this point land" is a containment test rather than a guess, and that is
the whole trick. A point 300 m off the sand on the seaward normal is water;
the same distance on the landward normal is not.

Where it refuses to answer:

  A beach whose two probes are both land, or both sea, gets no aspect. That
  is a narrow spit, a lagoon mouth or a digitising artefact, and a bearing
  derived from it would be fiction.
  A lake or river beach gets no sunset claim even with a good aspect. The sun
  does set over the far shore of Balaton, but "sunset beach" on a card means
  the sea, and the layer already knows which beaches are inland.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import math
import sys
from pathlib import Path

# Windows consoles default to cp1252, and this layer prints beach names:
# "Ir-Ramla tal-Mixquqa" and "Plaza Zlatni Rat" both raise UnicodeEncodeError
# on the way to a terminal that cannot spell them. Replacing the character is
# right for a progress line and wrong for a data file, which is why this
# touches stdout only; every cache and wire write goes through an explicit
# encoding="utf-8".
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = HERE.parents[1]
COASTLINE_ZIP = (ROOT / "cache" / "regions" / "src" / "eea"
                 / "eea_coastline_polygon_v3.zip")
SHP_INNER = ("eea_v_3035_100_k_coastline-poly_p_1995-2017_v03_r00/"
             "EEA_Coastline_20170228.shp")
REGIONS_GPKG = ROOT / "cache" / "regions" / "regions.gpkg"

# How far out the land/sea probe is thrown. Far enough to clear the beach
# itself (a wide strand is 100 m of sand) and near enough that it is still
# this beach's water rather than the next bay's.
PROBE_M = 300
# How far apart the two boundary samples that give the shore its local
# bearing stand. 150 m each way smooths the 1:100k coastline's own vertices
# without averaging away a cove.
SHORE_SPAN_M = 150
# Beyond this the nearest coastline is not this beach's coastline, and the
# beach is inland: no aspect, no sunset.
MAX_SHORE_KM = 5.0

# The bathing season, as solar declination. Late May through late September
# is when a European beach is used, and the sun sets furthest north at the
# June solstice (declination +23.44) and close to due west by the equinox
# (declination ~0). A beach that sees the sun go down over water at any point
# in that window is sunset facing.
SEASON_DECLINATION = (0.0, 23.44)
# Slack on the beach's own aspect. The shore bearing is read off a 1:100k
# coastline and the sand is not a straight line, so a beach is not disowned
# for twenty degrees.
ASPECT_TOLERANCE_DEG = 22.0

# Two indexes, and using the right one for each question is the difference
# between 1 millisecond a beach and 3 seconds a beach, measured.
#
#   the LAND polygons  answer "is this probe point on land". 70,972 of them,
#                      queried through shapely's C level predicate rather
#                      than by looping candidates and calling contains() in
#                      Python.
#   the COAST lines    answer "which way does the shore run here". These are
#                      the stretches regions/coasts.py already cut to 40..120
#                      km, so walking one to find a point along it is a short
#                      walk. Walking a land polygon's own exterior ring
#                      instead is the quadratic ring walk this repository has
#                      paid for before: project() and interpolate() on a ring
#                      with millions of vertices is what made the first
#                      version take three seconds a beach.
_land = None
_land_tree = None
_shore = None
_shore_tree = None


def _load_land():
    """The EEA coastline polygons and the cut coastal stretches, indexed.

    Read straight out of the zip through GDAL's virtual filesystem, so the
    50 MB shapefile is never unpacked onto disk. Cached in the process: this
    runs once per enrich, not once per beach."""
    global _land, _land_tree, _shore, _shore_tree
    if _land is not None:
        return
    import geopandas as gpd
    from shapely import STRtree
    _land, _shore = [], []
    if COASTLINE_ZIP.exists():
        path = f"/vsizip/{COASTLINE_ZIP.as_posix()}/{SHP_INNER}"
        frame = gpd.read_file(path)
        if frame.crs is None or frame.crs.to_epsg() != 3035:
            frame = frame.to_crs(3035)
        _land = list(frame.geometry)
        _land_tree = STRtree(_land)
    else:
        print("  note: no EEA coastline on disk, aspect skipped")
    if REGIONS_GPKG.exists():
        coast = gpd.read_file(REGIONS_GPKG, layer="coast").to_crs(3035)
        for geom in coast.geometry:
            if geom is None or geom.is_empty:
                continue
            if geom.geom_type.startswith("Multi"):
                _shore.extend(list(geom.geoms))
            else:
                _shore.append(geom)
        if _shore:
            _shore_tree = STRtree(_shore)


def _transformers():
    from pyproj import Transformer
    return (Transformer.from_crs(4326, 3035, always_xy=True),
            Transformer.from_crs(3035, 4326, always_xy=True))


def bearing_deg(lat1, lon1, lat2, lon2):
    """True bearing from the first point to the second, 0..359.

    Computed on the sphere in degrees rather than in the projection's metres,
    because EPSG:3035 grid north and true north differ by several degrees at
    the edges of Europe, and several degrees is the whole width of the answer
    this module gives."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_lambda = math.radians(lon2 - lon1)
    y = math.sin(d_lambda) * math.cos(phi2)
    x = (math.cos(phi1) * math.sin(phi2)
         - math.sin(phi1) * math.cos(phi2) * math.cos(d_lambda))
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def sunset_azimuth(lat_deg, declination_deg):
    """Where on the horizon the sun sets, as a true bearing.

    Standard spherical astronomy for an unrefracted sun at h = 0:
        cos(A) = sin(declination) / cos(latitude)
    with A measured from north through east, so the SUNSET bearing is
    360 - A. Returns None inside the polar circles in the season where the
    sun does not set at all, which is not an error and is the honest answer
    for a beach in Finnmark in June."""
    phi = math.radians(lat_deg)
    if abs(math.cos(phi)) < 1e-9:
        return None
    value = math.sin(math.radians(declination_deg)) / math.cos(phi)
    if value < -1.0 or value > 1.0:
        return None                      # midnight sun, or no sunrise at all
    return (360.0 - math.degrees(math.acos(value))) % 360.0


def season_sunset_arc(lat_deg):
    """(from, to) true bearings the sun sets through during the season."""
    low = sunset_azimuth(lat_deg, SEASON_DECLINATION[0])
    high = sunset_azimuth(lat_deg, SEASON_DECLINATION[1])
    if low is None or high is None:
        return None
    return (min(low, high), max(low, high))


def _angular_gap(a, b):
    """The smaller angle between two bearings, 0..180."""
    return abs((a - b + 180.0) % 360.0 - 180.0)


def faces_sunset(aspect_deg, lat_deg):
    """Whether a beach with this aspect watches the sun go down over water."""
    arc = season_sunset_arc(lat_deg)
    if arc is None or aspect_deg is None:
        return False
    low, high = arc
    if low - ASPECT_TOLERANCE_DEG <= aspect_deg <= high + ASPECT_TOLERANCE_DEG:
        return True
    # The arc can straddle due north at extreme latitudes; compare on the
    # circle rather than on the number line before saying no.
    return min(_angular_gap(aspect_deg, low),
               _angular_gap(aspect_deg, high)) <= ASPECT_TOLERANCE_DEG


class AspectReader:
    """Answers "which way does this beach face" for a whole country's worth
    of beaches, holding the coastline in memory once."""

    def __init__(self):
        _load_land()
        self.to_3035, self.to_4326 = _transformers()

    @property
    def ready(self):
        return bool(_land) and _shore_tree is not None

    def _is_land(self, x, y):
        """Containment through shapely's C level predicate. Looping the
        candidate polygons and calling contains() from Python was measured at
        three seconds a beach; this is one millisecond.

        The predicate is `intersects`, NOT `contains`, and that is not a
        preference. STRtree.query runs its predicate against a PREPARED copy
        of each tree geometry, and prepared `contains` answers False for a
        point that the same polygon's own .contains() answers True for: the
        first version of this returned "not land" for Brussels, Madrid and
        every beach in Europe, so every beach got two sea probes and no
        aspect at all. For a point against a polygon, `intersects` is the
        test that means what this function is asking."""
        from shapely.geometry import Point
        return len(_land_tree.query(Point(x, y), predicate="intersects")) > 0

    def aspect_of(self, lat, lon):
        """(aspect_deg, shore_km) or (None, None).

        The aspect is the true bearing from the sand out to sea."""
        if not self.ready:
            return None, None
        from shapely.geometry import Point

        x, y = self.to_3035.transform(lon, lat)
        here = Point(x, y)
        idx = _shore_tree.nearest(here)
        if idx is None:
            return None, None
        line = _shore[idx]
        shore_km = here.distance(line) / 1000.0
        if shore_km > MAX_SHORE_KM:
            return None, None

        # The local run of the shore, from two samples either side of the
        # nearest point. The line is one cut stretch, tens of kilometres and
        # a few thousand vertices, so this walk is short.
        along = line.project(here)
        before = line.interpolate(max(0.0, along - SHORE_SPAN_M))
        after = line.interpolate(min(line.length, along + SHORE_SPAN_M))
        on_shore = line.interpolate(along)
        run_x, run_y = after.x - before.x, after.y - before.y
        norm = math.hypot(run_x, run_y)
        if norm < 1.0:
            return None, round(shore_km, 3)
        run_x, run_y = run_x / norm, run_y / norm

        # The two perpendiculars, probed for water.
        candidates = []
        for sign in (1.0, -1.0):
            nx, ny = -run_y * sign, run_x * sign
            px, py = on_shore.x + nx * PROBE_M, on_shore.y + ny * PROBE_M
            candidates.append((px, py, self._is_land(px, py)))
        sea = [c for c in candidates if not c[2]]
        # Both land, or both sea: a spit, a lagoon mouth or an artefact. A
        # bearing taken from either would be invented.
        if len(sea) != 1:
            return None, round(shore_km, 3)
        px, py, _ = sea[0]
        sea_lon, sea_lat = self.to_4326.transform(px, py)
        shore_lon, shore_lat = self.to_4326.transform(on_shore.x, on_shore.y)
        aspect = bearing_deg(shore_lat, shore_lon, sea_lat, sea_lon)
        return round(aspect, 1), round(shore_km, 3)

    def stamp(self, beaches, verbose=False):
        """Write `aspect`, `shore_km` and `sunset_facing` onto each row.

        Idempotent: a row that already carries an answer is left alone, so a
        re-run costs nothing and an interrupted one resumes."""
        if not self.ready:
            return 0
        done = 0
        for beach in beaches:
            if beach.get("aspect_done"):
                continue
            try:
                aspect, shore_km = self.aspect_of(beach["lat"], beach["lon"])
            except Exception:
                aspect, shore_km = None, None
            beach["aspect_done"] = True
            if shore_km is not None:
                beach["shore_km"] = shore_km
            if aspect is None:
                continue
            beach["aspect"] = aspect
            # Sea beaches only. The sun does set over the far shore of
            # Balaton, but a "sunset beach" chip on a lake card promises the
            # sea, and the layer already knows which beaches are inland.
            if beach.get("coastal", True):
                beach["sunset_facing"] = faces_sunset(aspect, beach["lat"])
            done += 1
        return done


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    args = ap.parse_args()
    if args.lat is None:
        for lat in (36, 43, 52, 60, 68):
            arc = season_sunset_arc(lat)
            print(f"  lat {lat}: sun sets between {arc[0]:.0f} and "
                  f"{arc[1]:.0f} degrees" if arc else f"  lat {lat}: no sunset")
        return
    reader = AspectReader()
    aspect, shore_km = reader.aspect_of(args.lat, args.lon)
    print(f"aspect {aspect}, shore {shore_km} km, "
          f"sunset {faces_sunset(aspect, args.lat)}")


if __name__ == "__main__":
    main()
