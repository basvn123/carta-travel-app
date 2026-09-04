"""The second spine: every named water body in OpenStreetMap, from the extracts.

Stage 1 of the lake layer used to have one spine. Wikidata, in two bounded
passes per country: the 700 most written about water bodies and the 250
largest. That is the right population for Italy and Switzerland and it is the
wrong one for Scotland, Ireland, Norway and Iceland, and the published counts
said so out loud: Great Britain 8, Ireland 9, Norway 13, Iceland 4, against
the Netherlands at 60 and Lithuania at 51. A Scottish loch wins neither
ranking. It is not written about the way an Italian lake is, and it is not
large the way a Dutch engineered water is, so it never entered the shortlist
at all and no amount of re-scoring could reach it.

So OpenStreetMap stops being "asked only what stands around a shortlisted
lake" and becomes a co-equal spine. Scotland alone holds about 31,000 named
freshwater bodies in OSM and Norway tens of thousands; the point is not to
publish them, it is to have them in the pool the region quota selects from.

Two things make this affordable, and both are already in the repository.

  The extracts are on disk.  pipeline/trails/ingest_osm_routes.py downloads
        per country Geofabrik .osm.pbf files into data/raw/geofabrik/. The
        public Overpass API is never asked a country sized question here, for
        the same reason the trails ingest does not: an extract answers it
        offline, reproducibly, and without spending somebody else's server.
  The filter runs before the geometry.  A pass with BackReferenceWriter
        writes a small water-and-shore extract per country (this is what
        `osmium tags-filter` does; pyosmium does it in-process). Everything
        after that reads a file two orders of magnitude smaller, which is
        what keeps the node location index inside the memory of a laptop
        that also has a browser open.

What comes out, per country, in cache/lakes/osm_CC.json:

  waters[]   a named water body: id, name, centroid, area in hectares, the
             tags the swimming rule and the index read, the wikidata id where
             the mapper recorded one, and a shore block.
  shore      what a person arriving on foot would find: metres of walkable
             path within 50 m of the waterline, beaches, slipways, mapped
             swimming places, marinas, car parks, and whether the ways that
             touch the water say access=private.

The keep rule is the brief's, in order: it must have a NAME, and then any one
of three things: five hectares of surface (the line under which OSM is mostly
farm ponds and village duck ponds), a wikidata or wikipedia tag (somebody
wrote about it, whatever its size), or a beach, a swimming place or an EEA
bathing site on its shore (somebody swims in it, whatever its size). The Blue
Eye in Albania is 0.2 ha and belongs in this layer; ten thousand unnamed field
ponds do not.

Area is measured on the ellipsoid with pyproj's Geod rather than from degrees,
because a degree of longitude in Lapland is half a degree of longitude in
Crete and a 5 ha cut applied in square degrees would keep Norwegian ponds and
drop Greek lakes.

Usage, from the repo root:
    python pipeline/lakes/osm_water.py                    # every country
    python pipeline/lakes/osm_water.py --countries GB,IE
    python pipeline/lakes/osm_water.py --countries NO --refresh
    python pipeline/lakes/osm_water.py --extract-only     # just the filter pass
    python pipeline/lakes/osm_water.py --no-shore         # skip the shore join

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

# Windows consoles and redirected pipes default to cp1252, which cannot encode
# a Latvian, Icelandic or Polish lake name. A print of one then raises
# UnicodeEncodeError and takes the stage down; the lake export died on
# "Lielais Baltezers" halfway through a logged run. The data was never the
# problem, the terminal was, so say so once here.
if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


ROOT = HERE.parents[1]
GEOFABRIK = ROOT / "data" / "raw" / "geofabrik"
CACHE = ROOT / "cache" / "lakes"
EXTRACTS = CACHE / "osm_extract"

# Geofabrik europe extract slug -> ISO2, the same table the trails ingest
# keeps. Two boundary quirks travel with it: great-britain excludes Northern
# Ireland, which arrives inside ireland-and-northern-ireland, and San Marino
# and Vatican City sit inside the italy extract. Both are dealt with by the
# point-in-country check below rather than by the file name.
SLUG_TO_CC = {
    "albania": "AL", "andorra": "AD", "austria": "AT", "belgium": "BE",
    "bosnia-herzegovina": "BA", "bulgaria": "BG", "croatia": "HR",
    "cyprus": "CY", "czech-republic": "CZ", "denmark": "DK",
    "estonia": "EE", "faroe-islands": "FO", "finland": "FI",
    "france": "FR", "germany": "DE", "great-britain": "GB",
    "greece": "GR", "hungary": "HU", "iceland": "IS",
    "ireland-and-northern-ireland": "IE", "italy": "IT", "kosovo": "XK",
    "latvia": "LV", "liechtenstein": "LI", "lithuania": "LT",
    "luxembourg": "LU", "macedonia": "MK", "malta": "MT",
    "moldova": "MD", "monaco": "MC", "montenegro": "ME",
    "netherlands": "NL", "norway": "NO", "poland": "PL",
    "portugal": "PT", "romania": "RO", "serbia": "RS",
    "slovakia": "SK", "slovenia": "SI", "spain": "ES",
    "sweden": "SE", "switzerland": "CH",
}
# San Marino has no extract of its own and never will; its one water body is
# inside the Italian file. The lake layer publishes SM through the seed, and
# the OSM spine reaches it by carving the enclave out of italy.
ENCLAVES = {"SM": ("italy", (12.395, 43.865, 12.520, 43.995))}

# ---------------------------------------------------------------------------
# The filter, which is the brief's, spelled as tag pairs
# ---------------------------------------------------------------------------
#
# Water: the five surface types plus the generic natural=water that most
# mappers reach for first. landuse=reservoir is deliberately NOT here: it is
# the deprecated spelling, natural=water + water=reservoir is the current one,
# and adding the old one brings back every sewage works and fish farm that
# still carries it.
WATER_TAGS = (
    ("natural", "water"),
    ("water", "lake"),
    ("water", "reservoir"),
    ("water", "lagoon"),
    ("water", "pond"),
    ("leisure", "swimming_area"),
)

# Shore: what proves a person can get to the water, and what proves they
# cannot. The brief names highway=path; footway, track, steps and bridleway
# are here with it because a lakeside path in Britain is nearly always tagged
# footway and in the Alps nearly always track, and a component that scored
# Britain low for a tagging convention would be measuring OSM rather than the
# shore.
SHORE_TAGS = (
    ("highway", "path"), ("highway", "footway"), ("highway", "track"),
    ("highway", "steps"), ("highway", "bridleway"), ("highway", "cycleway"),
    ("natural", "beach"),
    ("leisure", "slipway"), ("leisure", "marina"), ("leisure", "beach_resort"),
    ("leisure", "fishing"), ("leisure", "swimming_area"),
    ("sport", "swimming"),
    ("amenity", "boat_rental"), ("amenity", "parking"),
    ("man_made", "pier"),
    ("tourism", "camp_site"), ("tourism", "viewpoint"),
)

# Tags copied off the water polygon itself. These are read by the swimming
# rule (which is the one field in this layer that can hurt somebody) and by
# the index, so they travel with the row rather than being re-derived.
KEEP_KEYS = ("natural", "water", "leisure", "landuse", "access", "swimming",
             "drinking_water", "usage", "salt", "intermittent", "boat",
             "fishing", "sport", "name", "name:en", "wikidata", "wikipedia",
             "ele", "depth", "max_depth", "website", "operator", "tidal")

PATH_BUFFER_M = 50.0        # the brief's: a path within 50 m of the waterline
PATH_MIN_M = 300.0          # ... for at least 300 m, before it is a shore path
POINT_SHORE_M = 150.0       # a slipway or a beach counts when it is this close
MIN_AREA_HA = 5.0           # the brief's floor for a nameless-in-practice pond
BIG_LAKE_HA = 2000.0        # above this the shore join uses a coarser test


def log(msg):
    print(msg, flush=True)


def newest_pbf(slug):
    """The most recent Geofabrik extract for one slug, or None.

    The raw store keeps one dated folder per download day, so a re-download
    does not overwrite the file a previous build stands on."""
    found = []
    for day in sorted(GEOFABRIK.glob("*")):
        path = day / f"{slug}-latest.osm.pbf"
        if path.exists():
            found.append((day.name, path))
    return found[-1] if found else (None, None)


# ---------------------------------------------------------------------------
# Pass 1: the filtered extract
# ---------------------------------------------------------------------------

def build_extract(slug, pbf, want_shore=True, refresh=False):
    """Write cache/lakes/osm_extract/{slug}-water.osm.pbf and return its path.

    This is `osmium tags-filter` with the referenced nodes and member ways
    pulled in, which is what makes the result a file the geometry pass can
    read on its own. The cost is two or three streams over the country file
    and no geometry at all; the benefit is that everything after it reads
    something between fifty and five hundred times smaller."""
    import osmium
    from osmium import filter as osmium_filter

    EXTRACTS.mkdir(parents=True, exist_ok=True)
    out = EXTRACTS / f"{slug}-water.osm.pbf"
    if out.exists() and not refresh:
        log(f"  {slug}: extract cached ({out.stat().st_size // 1048576} MB)")
        return out
    if out.exists():
        out.unlink()

    tags = list(WATER_TAGS) + (list(SHORE_TAGS) if want_shore else [])
    t0 = time.time()
    kept = 0
    with osmium.BackReferenceWriter(str(out), ref_src=str(pbf),
                                    overwrite=True, relation_depth=1) as writer:
        for obj in osmium.FileProcessor(str(pbf)).with_filter(
                osmium_filter.TagFilter(*tags)):
            writer.add(obj)
            kept += 1
    size = out.stat().st_size // 1048576
    log(f"  {slug}: {kept} objects filtered out of {pbf.name} "
        f"-> {size} MB in {time.time() - t0:.0f}s")
    return out


# ---------------------------------------------------------------------------
# Local metres: a per lake frame, because Europe is 35 degrees of latitude tall
# ---------------------------------------------------------------------------

def local_frame(lat, lon):
    """(to_m, m_per_deg_lat, m_per_deg_lon) about one point.

    Everything measured against a lake is measured in the lake's own frame.
    A single country wide projection would be honest for Malta and wrong by
    a third for Norway, which spans 58 to 71 degrees north, and the shore
    tests here have a 50 m tolerance."""
    m_lat = 111132.0 - 559.8 * math.cos(2 * math.radians(lat))
    m_lon = 111320.0 * math.cos(math.radians(lat))
    return m_lat, max(1.0, m_lon)


def to_local(geom, lat0, lon0):
    """A shapely geometry moved into metres about (lat0, lon0)."""
    from shapely import affinity
    m_lat, m_lon = local_frame(lat0, lon0)
    moved = affinity.translate(geom, xoff=-lon0, yoff=-lat0)
    return affinity.scale(moved, xfact=m_lon, yfact=m_lat, origin=(0, 0))


# ---------------------------------------------------------------------------
# Pass 2: geometry, area, and the shore join
# ---------------------------------------------------------------------------

def scan_waters(extract, bbox=None):
    """[(record, shapely polygon)] for every NAMED water area in the extract.

    Area is ellipsoidal (pyproj Geod), not planar: a 5 ha cut computed in
    square degrees would keep Lapland's ponds and drop Crete's lakes."""
    import osmium
    import shapely.wkb as shapely_wkb
    from osmium import filter as osmium_filter
    from pyproj import Geod

    geod = Geod(ellps="WGS84")
    wkb = osmium.geom.WKBFactory()
    water_filter = osmium_filter.TagFilter(*WATER_TAGS)
    out = []
    seen = set()
    for obj in osmium.FileProcessor(str(extract)).with_areas(water_filter):
        if not isinstance(obj, osmium.osm.Area):
            continue
        tags = dict(obj.tags)
        name = (tags.get("name") or "").strip()
        if not name:
            continue
        # pyosmium synthesises an Area from either a closed way or a
        # multipolygon relation, and the same water can arrive as both. The
        # original id keeps them apart; `seen` keeps the same one out twice.
        oid = f"w{obj.orig_id()}" if obj.from_way() else f"r{obj.orig_id()}"
        if oid in seen:
            continue
        try:
            geom = shapely_wkb.loads(wkb.create_multipolygon(obj), hex=True)
        except Exception:
            continue
        if geom.is_empty:
            continue
        centroid = geom.representative_point()
        lat, lon = centroid.y, centroid.x
        if bbox and not (bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]):
            continue
        area_m2 = abs(geod.geometry_area_perimeter(geom)[0])
        seen.add(oid)
        rec = {
            "osm_id": oid,
            "name": name,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "area_ha": round(area_m2 / 10000.0, 3),
            "tags": {k: v for k, v in tags.items() if k in KEEP_KEYS},
        }
        wd = tags.get("wikidata") or ""
        if wd.startswith("Q") and wd[1:].isdigit():
            rec["wd"] = wd
        if tags.get("wikipedia"):
            rec["wikipedia"] = tags["wikipedia"]
        out.append((rec, geom))
    return out


def _shore_kind(tags):
    """Which shore signal an element carries, or None. One element gives at
    most one signal, so a beach with a car park on it cannot count twice."""
    if tags.get("natural") == "beach":
        return "beach"
    if tags.get("leisure") == "slipway":
        return "slipway"
    if tags.get("leisure") == "swimming_area" or tags.get("sport") == "swimming":
        return "swim_place"
    if tags.get("leisure") == "marina" or tags.get("amenity") == "boat_rental":
        return "marina"
    if tags.get("leisure") == "beach_resort":
        return "beach"
    if tags.get("amenity") == "parking":
        return "parking"
    if tags.get("tourism") == "camp_site":
        return "camp"
    if tags.get("leisure") == "fishing":
        return "fishing"
    if tags.get("man_made") == "pier":
        return "pier"
    if tags.get("tourism") == "viewpoint":
        return "viewpoint"
    return None


def join_shore(extract, waters):
    """Fill each water record's `shore` block from the same extract.

    Two questions are asked of every shore candidate, and they are different
    questions. A point feature (a slipway, a beach, a car park) counts when it
    is within POINT_SHORE_M of the waterline: it is a thing you arrive at. A
    walkable way counts by LENGTH inside a 50 m band around the waterline, and
    only reaches the `path` verdict at PATH_MIN_M, because thirty metres of
    footway crossing an outflow is not a shore path and three hundred metres
    beside the water is.

    `access` on the ways that touch the water is the other half of the answer
    the brief asks for, and it is the half nobody else records: a gorgeous
    lake ringed by private land is a different product from the same lake with
    a path around it."""
    import osmium
    import shapely.wkb as shapely_wkb
    from osmium import filter as osmium_filter
    from shapely import STRtree
    from shapely.geometry import Point, box

    if not waters:
        return
    polys = [g for _r, g in waters]
    tree = STRtree(polys)
    for rec, _g in waters:
        rec["shore"] = {}

    wkb = osmium.geom.WKBFactory()
    shore_filter = osmium_filter.TagFilter(*SHORE_TAGS)
    # Degrees per metre at 60 north, the widest cell this needs; the exact
    # test happens in the lake's own frame afterwards, this only sizes the
    # candidate box.
    pad_pt = POINT_SHORE_M / 55000.0
    pad_way = PATH_BUFFER_M / 55000.0
    # Per lake, computed once and held: the waterline in the lake's own
    # metres, and the 50 m band around it. Lake Constance has forty thousand
    # vertices and buffering that per candidate way is the difference between
    # a minute a country and an afternoon; simplifying to 10 m first is
    # invisible against a 50 m tolerance.
    frames = {}

    def frame_for(rec, poly):
        got = frames.get(rec["osm_id"])
        if got is None:
            line = to_local(poly, rec["lat"], rec["lon"]).boundary
            line = line.simplify(10.0, preserve_topology=False)
            got = (line, line.buffer(PATH_BUFFER_M))
            frames[rec["osm_id"]] = got
        return got

    fp = osmium.FileProcessor(str(extract)).with_locations().with_filter(
        shore_filter)
    for obj in fp:
        tags = dict(obj.tags)
        kind = _shore_kind(tags)
        access = tags.get("access") or ""
        walkable = tags.get("highway") in ("path", "footway", "track", "steps",
                                           "bridleway", "cycleway")
        if kind is None and not walkable:
            continue
        try:
            if isinstance(obj, osmium.osm.Node):
                geom = Point(obj.location.lon, obj.location.lat)
            elif isinstance(obj, osmium.osm.Way):
                if len(obj.nodes) < 2:
                    continue
                geom = shapely_wkb.loads(wkb.create_linestring(obj), hex=True)
            else:
                continue
        except Exception:
            continue
        pad = pad_way if walkable else pad_pt
        minx, miny, maxx, maxy = geom.bounds
        hits = tree.query(box(minx - pad, miny - pad, maxx + pad, maxy + pad))
        for idx in hits:
            rec, poly = waters[int(idx)]
            line, band = frame_for(rec, poly)
            here = to_local(geom, rec["lat"], rec["lon"])
            if walkable:
                try:
                    metres = here.intersection(band).length
                except Exception:
                    continue
                if metres <= 0:
                    continue
                rec["shore"]["path_m"] = round(
                    rec["shore"].get("path_m", 0.0) + metres)
                if access in ("private", "no"):
                    rec["shore"]["access_private"] = \
                        rec["shore"].get("access_private", 0) + 1
                elif access in ("yes", "permissive", "designated"):
                    rec["shore"]["access_public"] = \
                        rec["shore"].get("access_public", 0) + 1
            if kind:
                # "Within 150 m of the waterline" is a distance, not a second
                # buffer of the first one. Same answer, a fraction of the work.
                try:
                    if line.distance(here) <= POINT_SHORE_M:
                        rec["shore"][kind] = rec["shore"].get(kind, 0) + 1
                except Exception:
                    continue


def keepable(rec):
    """The brief's keep rule: a name, and then size, or a written record of
    it, or somebody swimming in it."""
    if not rec.get("name"):
        return False
    if rec.get("area_ha", 0) >= MIN_AREA_HA:
        return True
    if rec.get("wd") or rec.get("wikipedia"):
        return True
    shore = rec.get("shore") or {}
    if shore.get("beach") or shore.get("swim_place"):
        return True
    if (rec.get("tags") or {}).get("leisure") == "swimming_area":
        return True
    return False


def sweep_country(cc, want_shore=True, refresh=False, extract_only=False):
    slug = next((s for s, c in SLUG_TO_CC.items() if c == cc), None)
    bbox = None
    if slug is None and cc in ENCLAVES:
        slug, bbox = ENCLAVES[cc]
    if slug is None:
        log(f"  {cc}: no Geofabrik extract slug, skipped")
        return None
    day, pbf = newest_pbf(slug)
    if pbf is None:
        log(f"  {cc}: {slug}-latest.osm.pbf is not in {GEOFABRIK}, skipped")
        return None

    out_path = CACHE / f"osm_{cc}.json"
    if out_path.exists() and not refresh:
        log(f"  {cc}: cached")
        return json.loads(out_path.read_text(encoding="utf-8"))

    # The extract is named after the SLUG, not the country, so San Marino
    # reads the Italian one rather than filtering Italy a second time.
    extract = build_extract(slug, pbf, want_shore=want_shore,
                            refresh=refresh and bbox is None)
    if extract_only:
        return None

    t0 = time.time()
    waters = scan_waters(extract, bbox=bbox)
    log(f"  {cc}: {len(waters)} named water areas in {time.time() - t0:.0f}s")
    # An empty answer is a bad answer, and it has a known cause: an extract
    # left half written by an interrupted run reads as a valid PBF with the
    # tags stripped off every way, so the area pass finds nothing. Cyprus
    # published zero named water bodies that way and has 418. So a country
    # that comes back empty rebuilds its extract once and asks again, and
    # an empty result NEVER replaces a non-empty cache. Same rule the beach
    # harvest learned from Overpass: nothing does not replace something.
    if not waters and not bbox:
        log(f"  {cc}: nothing named in the extract, rebuilding it once")
        extract = build_extract(slug, pbf, want_shore=want_shore, refresh=True)
        waters = scan_waters(extract, bbox=bbox)
        log(f"  {cc}: {len(waters)} named water areas after the rebuild")
    if not waters and out_path.exists():
        log(f"  {cc}: still nothing, keeping the cache that is on disk")
        return json.loads(out_path.read_text(encoding="utf-8"))
    if want_shore and waters:
        t1 = time.time()
        join_shore(extract, waters)
        log(f"  {cc}: shore joined in {time.time() - t1:.0f}s")

    kept = [rec for rec, _g in waters if keepable(rec)]
    kept.sort(key=lambda r: -r.get("area_ha", 0))
    payload = {
        "country": cc,
        "swept_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": f"{slug}-latest.osm.pbf",
        "pbf_date": day,
        "n_named": len(waters),
        "n_kept": len(kept),
        "shore_swept": bool(want_shore),
        "keep_rule": ("named, and (area >= 5 ha or wikidata/wikipedia or a "
                      "beach or swimming place on the shore)"),
        "waters": kept,
    }
    CACHE.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False,
                                   separators=(",", ":")), encoding="utf-8")
    log(f"  {cc}: {len(kept)} kept of {len(waters)} named "
        f"-> {out_path.name} ({out_path.stat().st_size // 1024} KB)")
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--no-shore", action="store_true",
                        help="skip the shore join (a much smaller extract)")
    parser.add_argument("--extract-only", action="store_true",
                        help="write the filtered extracts and stop")
    parser.add_argument("--smallest-first", action="store_true",
                        help="order by extract size, so a long run shows "
                             "results early")
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or (sorted(SLUG_TO_CC.values()) + list(ENCLAVES))
    if args.smallest_first:
        def size_of(cc):
            slug = next((s for s, c in SLUG_TO_CC.items() if c == cc),
                        ENCLAVES.get(cc, (None,))[0])
            _day, pbf = newest_pbf(slug) if slug else (None, None)
            return pbf.stat().st_size if pbf else 0
        countries = sorted(countries, key=size_of)

    log(f"[osm_water] {len(countries)} countries")
    total = 0
    for cc in countries:
        try:
            got = sweep_country(cc, want_shore=not args.no_shore,
                                refresh=args.refresh,
                                extract_only=args.extract_only)
        except Exception as exc:
            log(f"  {cc}: FAILED, {type(exc).__name__}: {str(exc)[:160]}")
            continue
        if got:
            total += got.get("n_kept") or 0
    log(f"[osm_water] {total} water bodies kept")


if __name__ == "__main__":
    main()
