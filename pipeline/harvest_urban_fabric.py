"""harvest_urban_fabric.py - measure the built beauty of a town from OSM.

The Beauty Index (A3, 2026-09) gains an urban-fabric component, because none
of its four inputs can see a beautiful built city: heritage counts UNESCO
sites, nature counts fjord/alps/lake tags, beach counts Blue Flags, iconic is
a curated list. Squares, riverfronts, pedestrian cores and dense listed
architecture - the things that make Bruges Bruges - were unmeasured, and the
index measurably penalised cities for being cities (corr with log population
-0.158).

This harvester walks the Geofabrik country extracts already on disk
(data/raw/geofabrik/, the same store the trails and lakes layers read) with
pyosmium - no network, reproducible - and measures, within WALK_KM of each
destination's centre:

  ped_m        metres of highway=pedestrian / living_street way segments
               (both segment endpoints inside the radius)
  heritage_n   objects tagged heritage=* (listed / protected buildings)
  historic_n   objects tagged historic=* (castles, gates, monuments, walls)
  citywalls    True when historic=citywalls|city_gate exists - the strongest
               cheap signal that a coherent old town survives
  square       True when a NAMED place=square (or named pedestrian area) sits
               within SQUARE_KM - the principal-square test
  canal_m      metres of waterway=canal segments - canal-network towns
  bridges_n    named man_made=bridge outlines + named historic bridges

Two passes per PBF (ways first to learn which nodes matter, then nodes for
their coordinates), so no full location index is ever built. Both passes run
through osmium.FileProcessor with C++-side filters (KeyFilter / IdFilter):
a Python callback per node would take days over the 30 GB store; the filters
keep the Python loop to the few objects that matter. One country at a time,
checkpointed to cache/urban_fabric.json after each, so a stopped run resumes
where it was.

Usage:
    python harvest_urban_fabric.py            # all countries not yet cached
    python harvest_urban_fabric.py DE FR      # just these ISO2 codes
    python harvest_urban_fabric.py --refresh DE
"""

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import osmium

from pipeline_io import atomic_write_json, load_json

sys.path.insert(0, str(Path(__file__).resolve().parent / "lakes"))
from osm_water import SLUG_TO_CC, newest_pbf  # noqa: E402  (one slug table)

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "urban_fabric.json"

WALK_KM = 1.0            # the measured core: a comfortable stroll from centre
SQUARE_KM = 0.6          # the principal square must be central, not suburban
GRID_DEG = 0.05          # spatial bucket size for core lookup (~5.5 km lat)
PED_KEYS = {"pedestrian", "living_street"}


def haversine_m(la1, lo1, la2, lo2):
    r = 6371000.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dp = math.radians(la2 - la1)
    dl = math.radians(lo2 - lo1)
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def dest_center(d):
    lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
    lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
    return lat, lon


class CoreIndex:
    """EVERY destination core within `km` of a point, via grid buckets.

    Every, not nearest: multi-airport siblings (FCO/CIA) share one city
    centre, and nearest-wins handed all of Rome's fabric to whichever
    sibling float jitter favoured, zeroing the rest. Each core measures its
    own full disc; overlap is intended, not double counting - the question
    is "what does the walkable core around THIS destination hold".
    """

    def __init__(self, cores, km):
        self.km = km
        self.buckets = defaultdict(list)
        for did, lat, lon in cores:
            self.buckets[(int(lat / GRID_DEG), int(lon / GRID_DEG))].append(
                (did, lat, lon))

    def within(self, lat, lon, km=None):
        km = km or self.km
        limit = km * 1000.0
        bi, bj = int(lat / GRID_DEG), int(lon / GRID_DEG)
        hits = []
        for i in range(bi - 1, bi + 2):
            for j in range(bj - 1, bj + 2):
                for did, clat, clon in self.buckets.get((i, j), ()):
                    if haversine_m(lat, lon, clat, clon) <= limit:
                        hits.append(did)
        return hits


def _way_is_candidate(tags):
    if tags.get("highway") in PED_KEYS:
        return "ped"
    if "heritage" in tags:
        return "heritage"
    if "historic" in tags:
        return "historic"
    if tags.get("place") == "square":
        return "square"
    if tags.get("waterway") == "canal":
        return "canal"
    if tags.get("man_made") == "bridge" and tags.get("name"):
        return "bridge"
    return None


FILTER_KEYS = ("highway", "heritage", "historic", "place", "waterway",
               "man_made")


def collect_candidates(pbf):
    """(ways, points, node_ids) via a single filtered scan.

    KeyFilter runs in C++, so Python only ever sees objects carrying one of
    FILTER_KEYS - a tiny fraction of the file.
    """
    ways, points, node_ids = [], [], set()
    fp = (osmium.FileProcessor(str(pbf),
                               osmium.osm.NODE | osmium.osm.WAY)
          .with_filter(osmium.filter.EmptyTagFilter())
          .with_filter(osmium.filter.KeyFilter(*FILTER_KEYS)))
    for o in fp:
        tags = dict((t.k, t.v) for t in o.tags)
        if o.is_way():
            kind = _way_is_candidate(tags)
            if not kind:
                continue
            refs = [n.ref for n in o.nodes]
            if not refs or len(refs) > 2000:
                continue
            ways.append((kind, tags.get("name"), tags.get("historic"), refs))
            node_ids.update(refs)
        else:
            if ("heritage" in tags or "historic" in tags
                    or tags.get("place") == "square"):
                kind = ("square" if tags.get("place") == "square"
                        else "heritage" if "heritage" in tags
                        else "historic")
                points.append((kind, tags.get("name"), tags.get("historic"),
                               o.location.lat, o.location.lon))
    return ways, points, node_ids


def collect_coords(pbf, wanted):
    """{node id: (lat, lon)} for exactly the referenced nodes, via IdFilter."""
    coords = {}
    fp = (osmium.FileProcessor(str(pbf), osmium.osm.NODE)
          .with_filter(osmium.filter.IdFilter(wanted)))
    for n in fp:
        coords[n.id] = (n.location.lat, n.location.lon)
    return coords


def blank():
    return {"ped_m": 0.0, "heritage_n": 0, "historic_n": 0,
            "citywalls": False, "square": False, "canal_m": 0.0,
            "bridges_n": 0}


def measure_country(pbf, cores):
    """{dest id: fabric dict} for one country's PBF."""
    idx = CoreIndex(cores, WALK_KM * 1.35)     # slack; exact test per segment
    way_rows, point_rows, node_ids = collect_candidates(pbf)
    coords = collect_coords(pbf, node_ids)

    out = {did: blank() for did, _a, _b in cores}

    for kind, name, historic, plat, plon in point_rows:
        for did in idx.within(plat, plon, WALK_KM):
            f = out[did]
            if kind == "square":
                if name and did in idx.within(plat, plon, SQUARE_KM):
                    f["square"] = True
            elif kind == "heritage":
                f["heritage_n"] += 1
            else:
                f["historic_n"] += 1
                if historic in ("citywalls", "city_gate"):
                    f["citywalls"] = True

    for kind, name, historic, refs in way_rows:
        pts = [coords[r] for r in refs if r in coords]
        if not pts:
            continue
        if kind in ("ped", "canal"):
            key = "ped_m" if kind == "ped" else "canal_m"
            for (a, b) in zip(pts, pts[1:]):
                mida, midb = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                seg = haversine_m(a[0], a[1], b[0], b[1])
                for did in idx.within(mida, midb, WALK_KM):
                    out[did][key] += seg
        else:
            la = sum(p[0] for p in pts) / len(pts)
            lo = sum(p[1] for p in pts) / len(pts)
            if kind == "square":
                if name:
                    for did in idx.within(la, lo, SQUARE_KM):
                        out[did]["square"] = True
            elif kind == "bridge":
                for did in idx.within(la, lo, WALK_KM):
                    out[did]["bridges_n"] += 1
            else:
                for did in idx.within(la, lo, WALK_KM):
                    f = out[did]
                    if kind == "heritage":
                        f["heritage_n"] += 1
                    else:
                        f["historic_n"] += 1
                        if historic in ("citywalls", "city_gate"):
                            f["citywalls"] = True

    for f in out.values():
        f["ped_m"] = round(f["ped_m"])
        f["canal_m"] = round(f["canal_m"])
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    refresh = "--refresh" in sys.argv
    data = json.loads(DATA.read_text(encoding="utf-8"))
    dests = data["destinations"]

    by_cc = defaultdict(list)
    for did, d in dests.items():
        lat, lon = dest_center(d)
        if lat is None or lon is None:
            continue
        by_cc[d.get("iso2")].append((did, lat, lon))

    cache = load_json(CACHE) if CACHE.exists() else {}
    done_ccs = set(cache.get("_countries", []))

    todo = []
    for slug, cc in SLUG_TO_CC.items():
        if args and cc not in args:
            continue
        if not args and cc in done_ccs and not refresh:
            continue
        if cc not in by_cc:
            continue
        _day, pbf = newest_pbf(slug)
        if not pbf:
            print(f"{cc}: no {slug} extract on disk, skipped")
            continue
        todo.append((cc, slug, pbf))

    print(f"{len(todo)} countries to measure "
          f"({sum(len(by_cc[cc]) for cc, _s, _p in todo)} destinations)")
    for cc, slug, pbf in todo:
        cores = by_cc[cc]
        print(f"{cc}: {pbf.name} ({pbf.stat().st_size / 1e9:.1f} GB, "
              f"{len(cores)} dests)...", flush=True)
        result = measure_country(pbf, cores)
        cache.update(result)
        done_ccs.add(cc)
        cache["_countries"] = sorted(done_ccs)
        atomic_write_json(CACHE, cache, indent=None, separators=(",", ":"))
        with_ped = sum(1 for did in result if result[did]["ped_m"] > 0)
        print(f"  {cc} done: {with_ped}/{len(cores)} dests with a pedestrian "
              f"core; cache -> {CACHE.name}", flush=True)
    print("urban fabric harvest complete")


if __name__ == "__main__":
    main()
