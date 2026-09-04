"""The second spine: every NAMED landform OpenStreetMap knows about.

Wikidata is the first spine and its mountain coverage is uneven in exactly the
places this layer is thinnest. Luxembourg has 15 mountains in the Wikidata
spine and 165 named summits in OSM; Lithuania has 52 and Latvia 72, which is
why both published four and six. OSM's coverage is dense, it carries `ele`,
`prominence` and often a `wikidata` back link, and it is the only source that
maps the landforms the v1 argument already said this layer has to publish:
ridges, aretes, cliffs and plateaus, which have almost no presence in the
Wikidata mountain classes at all.

    natural=peak | volcano | saddle        nodes, named
    mountain_pass=yes                      nodes, named
    natural=ridge | arete | cliff          ways, named, LONGER THAN 500 m
    natural=plateau                        ways, named

The brief asks for this through `osmium tags-filter` over Geofabrik extracts.
That path wants 30 GB of planet extracts and a working osmium build, neither
of which is on this box, and it answers the same question this does: Overpass
with an `area["ISO3166-1"]` filter returns exactly the same elements, already
clipped to the country, without the download. The clauses above are what
`osmium tags-filter n/natural=peak ... w/natural=ridge` selects, one for one,
and the 500 m rule is enforced INSIDE the query (`if:length()>500`), so a
kilometre of Norwegian cliff line does not have to travel to be measured here.

Three rules, all of them scar tissue from the layers that came before:

  a timed out Overpass query answers 200 with an empty list.  peak_sources'
        client raises on the remark instead, and a country that fails is
        retried in tiles rather than recorded as having no mountains.
  an empty answer never replaces a non-empty cache.  Each country records
        `osm_ok`, set only when Overpass actually answered every tile, and a
        run that comes back with nothing for a country that already has rows
        keeps what it had.
  the cache is the snapshot.  cache/mountains/osm_CC.json is written once and
        read forever after; --refresh is the only way to ask again.

Reconciliation against the Wikidata spine happens in harvest_peaks.py, not
here: this module's job is to fetch and to normalise, and a harvest that
merges two spines should be readable in one place.

Usage, from the repo root:
    python pipeline/mountains/osm_spine.py                  # every country
    python pipeline/mountains/osm_spine.py --countries LT,LV,EE
    python pipeline/mountains/osm_spine.py --refresh --countries MT

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from peak_sources import load_cache, overpass, save_cache  # noqa: E402

if sys.platform == "win32":
    # A Bosnian summit name stops an export dead on a cp1252
    # console otherwise, which is a silly way to lose a build.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = HERE.parents[1]
STAGE = "osm"
ADMIN0 = ROOT / "cache" / "ne_50m_admin0.geojson"

# Countries whose Overpass `area` id is not derivable from ISO3166-1 on the
# admin_level=2 relation. Kosovo is the standing one: it has no ISO 3166-1
# assignment, and OSM tags the relation ISO3166-1=XK anyway, so it works; the
# Faroes and the microstates are their own admin_level=2 relations.
AREA_ISO = {}

# Tile side in degrees. A country wider than this is asked for one tile at a
# time, because a single query for every named peak in Norway is the shape
# that earns a remark rather than an answer.
# Shapely is used for one question, "does this rectangle touch this country",
# and the module works without it: no shapely means every tile is asked for,
# which is what this file did before.
try:
    from shapely.geometry import box as box_geom, shape
except ImportError:                                    # pragma: no cover
    box_geom = shape = None

TILE_DEG = 3.0
# How far outside the simplified outline a tile still counts as touching the
# country. About 28 km north to south: far more than the 1:50m simplification
# error, and a dropped tile is a silently missing mountain.
TILE_MARGIN = 0.25

# Above this many rows in one tile the answer is suspect rather than lucky:
# Overpass caps nothing here, so a huge count is real, but it is worth a line
# in the log next to the country it came from.
LOUD_ROWS = 20000

NODE_CLAUSES = (
    'node(area.a){bbox}["natural"~"^(peak|volcano|saddle)$"]["name"];\n'
    'node(area.a){bbox}["mountain_pass"="yes"]["name"];\n'
)
# The ways. Length is filtered in the query rather than after it: a named
# cliff line in Norway can be 40 km of geometry, and none of it needs to
# travel to answer "is it longer than 500 m".
WAY_CLAUSES = (
    'way(area.a){bbox}["natural"~"^(ridge|arete|cliff)$"]["name"]'
    '(if:length()>500);\n'
    'way(area.a){bbox}["natural"="plateau"]["name"];\n'
)

QUERY = ('[out:json][timeout:{timeout}];\n'
         'area["ISO3166-1"="{cc}"][admin_level=2]->.a;\n'
         '(\n{clauses});\nout tags center;\n')


def country_bbox(cc):
    """(W, S, E, N) for one country from the Natural Earth admin-0 file the
    rest of the pipeline already carries. Used only to decide the tiling, so
    a coarse 1:50m outline is exactly the right resolution: the `area` filter
    inside the query is what actually decides membership."""
    data = json.loads(ADMIN0.read_text(encoding="utf-8"))
    for feat in data.get("features") or []:
        props = feat.get("properties") or {}
        iso = (props.get("ISO_A2_EH") or props.get("ISO_A2") or "").upper()
        if iso != cc.upper():
            continue
        west = south = 1e9
        east = north = -1e9
        geom = feat.get("geometry") or {}
        polys = (geom.get("coordinates") or []) if geom.get("type") == "MultiPolygon" \
            else [geom.get("coordinates") or []]
        for poly in polys:
            for ring in poly:
                for lon, lat in ring:
                    west, east = min(west, lon), max(east, lon)
                    south, north = min(south, lat), max(north, lat)
        if west < 1e9:
            return (west, south, east, north)
    return None


def country_geom(cc):
    """The country's outline from the same admin-0 file, as one shapely
    geometry, or None when it cannot be built.

    Only ever used to decide whether a tile is worth asking for. The `area`
    filter inside the query is still what decides membership, so a coarse
    outline and a generous margin are the right trade here."""
    if shape is None:
        return None
    data = json.loads(ADMIN0.read_text(encoding="utf-8"))
    for feat in data.get("features") or []:
        props = feat.get("properties") or {}
        iso = (props.get("ISO_A2_EH") or props.get("ISO_A2") or "").upper()
        if iso == cc.upper() and feat.get("geometry"):
            try:
                geom = shape(feat["geometry"])
                return geom if geom.is_valid else geom.buffer(0)
            except Exception:                          # noqa: BLE001
                return None
    return None


def tiles_for(cc):
    """The bboxes one country is asked for, largest first.

    An empty list means "ask for the whole country in one query", which is
    what every country under one tile wide gets.

    Tiles that do not touch the country are dropped before anything is asked.
    A bounding box is a rectangle around a country and Europe's countries are
    not rectangles: the Netherlands' box reaches Bonaire, France's reaches
    Réunion, and even clamped to Europe's window those two tiled to 140 and
    234 rectangles, of which the great majority were open Atlantic. Every one
    of them was a full Overpass query that came back with nothing, and at the
    minutes-per-query this endpoint answers in under load, that is most of a
    day spent asking about the sea. Norway drops from 75 to the tiles that
    have Norway in them.

    The margin is deliberately generous. The outline is a simplified 1:50m
    coastline, so a skerry, a headland or a small island can sit outside it
    by a few kilometres, and a dropped tile is a silently missing mountain.
    Quarter of a degree is about 28 km north to south, which is far more
    than the simplification error, and it costs a handful of extra tiles."""
    box = country_bbox(cc)
    if not box:
        return [""]
    west, south, east, north = box
    # Europe's window, applied here as well as in harvest_peaks: the French
    # and Dutch overseas territories are not what a reader means by the
    # Mountains tab, and their bboxes would otherwise tile the Atlantic.
    west, east = max(west, -32.0), min(east, 46.0)
    south, north = max(south, 26.0), min(north, 72.0)
    if east <= west or north <= south:
        return [""]
    if (east - west) <= TILE_DEG and (north - south) <= TILE_DEG:
        return [""]

    land = country_geom(cc)
    skipped = 0
    out = []
    lat = south
    while lat < north:
        lon = west
        while lon < east:
            top, right = min(lat + TILE_DEG, north), min(lon + TILE_DEG, east)
            if land is not None and not land.intersects(
                    box_geom(lon - TILE_MARGIN, lat - TILE_MARGIN,
                             right + TILE_MARGIN, top + TILE_MARGIN)):
                skipped += 1
            else:
                out.append(f"({lat:.4f},{lon:.4f},{top:.4f},{right:.4f})")
            lon += TILE_DEG
        lat += TILE_DEG
    if skipped:
        print(f"  {cc}: {len(out)} tiles to ask, {skipped} skipped as sea or "
              f"another country")
    return out or [""]

def _row(el):
    """One Overpass element in the harvest's row shape, or None.

    `oid` is the identity for a row Wikidata has never heard of, and it is
    what peak_id() falls back to when there is no Q number: without it every
    OSM row in a country would slug to the same id tail and the export's
    duplicate check would be the only thing standing between the wire and
    forty rows called "peak-x"."""
    tags = el.get("tags") or {}
    name = (tags.get("name") or "").strip()
    if not name or len(name) < 2:
        return None
    centre = el.get("center") or {}
    lat = el.get("lat", centre.get("lat"))
    lon = el.get("lon", centre.get("lon"))
    if lat is None or lon is None:
        return None
    ele = None
    raw_ele = (tags.get("ele") or "").replace(",", ".").strip()
    if raw_ele:
        try:
            ele = float(raw_ele.split()[0])
        except ValueError:
            ele = None
        if ele is not None and not (-500.0 <= ele <= 6000.0):
            ele = None            # a foot value, a typo, or somebody's joke
    prom = None
    raw_prom = (tags.get("prominence") or "").replace(",", ".").strip()
    if raw_prom:
        try:
            prom = float(raw_prom.split()[0])
        except ValueError:
            prom = None
    natural = tags.get("natural") or ("mountain_pass" if tags.get("mountain_pass")
                                      else "")
    return {
        "oid": f"{el['type'][0]}{el['id']}",
        "wd": (tags.get("wikidata") or "").strip() or None,
        "name": name,
        "names": {k.split(":", 1)[1]: v for k, v in tags.items()
                  if k.startswith("name:") and len(k.split(":", 1)[1]) <= 3},
        "lat": round(float(lat), 6),
        "lon": round(float(lon), 6),
        "ele": ele,
        "prom": prom,
        "natural": natural,
        "wikipedia": (tags.get("wikipedia") or "").strip() or None,
        # The tags worth keeping whole, because they answer questions the
        # index asks later: how hard is it, is there a way up, is it a summit
        # somebody put a cross on.
        "tags": {k: v[:60] for k, v in tags.items()
                 if k in ("sac_scale", "via_ferrata_scale", "trail_visibility",
                          "summit:cross", "summit:register", "mountain_pass",
                          "tourism", "man_made", "access", "ref")},
    }


def harvest_country(cc, refresh=False):
    """Every named landform OSM has in one country, cached.

    Checkpointed per tile, because this is the longest single job in the
    layer and it does not get to finish uninterrupted. Norway is 75 tiles
    and Portugal's took ten hours under a loaded Overpass; a run that keeps
    everything in memory until the last tile hands all of it back the moment
    the process goes away, and this one has gone away twice: once when the
    shell that started it was torn down, losing 35 Norwegian tiles that had
    already been paid for.

    So each tile is written as it lands, and a re-run reads the checkpoint
    and asks only for the tiles that are missing from it. The tile list is
    deterministic (tiles_for is a pure function of the country's bbox), so a
    tile index means the same rectangle on every run. If the geometry ever
    changes, the checkpoint's `tiles` count no longer matches and the whole
    country is re-asked rather than stitched together from two grids."""
    cached = load_cache(STAGE, cc)
    if cached is not None and not cached.get("partial") and not refresh:
        print(f"  {cc}: cached ({len(cached.get('rows') or [])} OSM rows)")
        return cached

    tiles = tiles_for(cc)
    rows, ok, failed, done = {}, True, 0, set()

    resume = cached if (cached and cached.get("partial") and not refresh) else None
    if resume and resume.get("tiles") == len(tiles):
        for row in resume.get("rows") or []:
            rows.setdefault(row["oid"], row)
        done = set(resume.get("tiles_done") or [])
        failed = int(resume.get("tiles_failed") or 0)
        ok = bool(resume.get("osm_ok", True))
        print(f"  {cc}: resuming, {len(done)}/{len(tiles)} tiles already in "
              f"({len(rows)} rows)")

    started = time.time()

    def _checkpoint(partial):
        payload = {
            "cc": cc,
            "harvested_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "osm_ok": ok,
            "tiles": len(tiles),
            "tiles_failed": failed,
            "n": len(rows),
            "rows": sorted(rows.values(),
                           key=lambda r: (-(r.get("ele") or 0), r["oid"])),
            "source": "OpenStreetMap contributors, ODbL 1.0, via Overpass",
        }
        if partial:
            payload["partial"] = True
            payload["tiles_done"] = sorted(done)
        save_cache(STAGE, cc, payload)
        return payload

    for i, bbox in enumerate(tiles):
        if i in done:
            continue
        clauses = (NODE_CLAUSES + WAY_CLAUSES).format(bbox=bbox)
        query = QUERY.format(cc=cc.upper(), clauses=clauses, timeout=240)
        try:
            elements = overpass(query, timeout=300)
        except Exception as exc:                      # noqa: BLE001
            # Every failure, not just SourceError: an IncompleteRead from a
            # mirror halfway through Great Britain is not a SourceError and
            # it threw out of the country loop, losing fifteen tiles of work
            # that had already come back. A tile that fails costs a tile.
            print(f"    {cc} tile {i + 1}/{len(tiles)} failed: "
                  f"{type(exc).__name__}: {str(exc)[:90]}")
            ok, failed = False, failed + 1
            continue
        for el in elements:
            row = _row(el)
            if row:
                rows.setdefault(row["oid"], row)
        done.add(i)
        if len(tiles) > 1:
            print(f"    {cc} tile {i + 1}/{len(tiles)}: {len(elements)} elements, "
                  f"{len(rows)} rows so far")
            _checkpoint(partial=True)

    # An empty answer never replaces a non-empty cache. Straight from the
    # beach layer: a bad Overpass hour must cost nothing.
    if not rows and cached and cached.get("rows"):
        print(f"  {cc}: Overpass returned nothing, keeping {len(cached['rows'])} "
              f"cached rows")
        return cached

    payload = _checkpoint(partial=False)
    kinds = {}
    for row in payload["rows"]:
        kinds[row["natural"]] = kinds.get(row["natural"], 0) + 1
    shape = ", ".join(f"{k} {v}" for k, v in sorted(kinds.items()))
    flag = "" if ok else f"  [{failed} tile(s) failed]"
    print(f"  {cc}: {len(rows)} named OSM landforms in "
          f"{time.time() - started:.0f}s ({shape}){flag}")
    if len(rows) > LOUD_ROWS:
        print(f"      note: {cc} is a big country and this is a big answer")
    return payload

def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()

    from harvest_peaks import COUNTRIES
    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    # Thin countries first: they are the ones this spine exists for, and a run
    # that is interrupted after an hour should have fixed Lithuania rather
    # than half of Norway.
    countries = wanted or sorted(
        COUNTRIES, key=lambda cc: (country_bbox(cc) or (0, 0, 1, 1))[2]
        - (country_bbox(cc) or (0, 0, 1, 1))[0])
    total = 0
    for cc in countries:
        try:
            payload = harvest_country(cc, refresh=args.refresh)
            total += len(payload.get("rows") or [])
        except KeyboardInterrupt:
            raise
        except Exception as exc:                      # noqa: BLE001
            print(f"  {cc}: failed ({exc})")
    print(f"[osm spine] {total} named landforms across {len(countries)} countries")


if __name__ == "__main__":
    main()
