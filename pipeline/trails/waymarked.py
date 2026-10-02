"""Waymarked Trails: the pan-European list of walks a country should have.

Tier: Manual (feeds famous_registry.py; re-run when the registry is rebuilt)

The famous-trail registry (famous_registry.py) is built from fame evidence:
Wikidata, Wikipedia pageviews, fame-tagged OSM objects, national portals and
a seed list. Every one of those is a FAME signal, and a walk that nobody
wrote an article about and nobody tagged with wikidata= cannot enter the
registry through any of them. That is fine for "which three walks is this
region known for", and it is a blind spot for the other question the spec
(6.1) asks the registry to answer: what SHOULD exist in this country.

Waymarked Trails answers that one. It renders every OSM hiking route and
sorts them into four groups by the network tag: INT (iwn, the E-paths and
the pilgrim routes), NAT (nwn, a country's national trails), REG and LOC.
The INT and NAT groups are the closest thing Europe has to one list of
"the trails a country officially has", maintained by the people who sign
them, in every country identically. This module harvests those two groups
for the whole catalogue and places each route in every country it crosses,
so the registry can be diffed against it: a national trail Waymarked knows
and the registry does not is a recall gap in the registry, and one the
registry knows and the wire does not is a recall gap in the catalogue.

REG and LOC are left out on purpose. Germany alone has tens of thousands of
regional Rundwege; holding a region to them is the "OSM tagging culture
measured as coverage" failure the spec (0.2) is written against.

How it works, and why each step is shaped the way it is:

  1. Harvest. /api/v1/list/by_area returns at most 100 routes per box,
     sorted INT, NAT, REG, LOC. So a box whose 100th route is still INT or
     NAT may have been cut short, and is split into four; a box whose list
     ends in REG or LOC (or holds fewer than 100) has given every INT and
     NAT route it touches. Boxes start at 204.8 km on the Web Mercator grid
     the API speaks and are only asked for where a NUTS3 polygon of the
     regions spine lies under them, so the sea costs nothing.
  2. Place. The list API returns no geometry, and the details endpoint
     returns the full route (12 MB for the E3). So each route is placed from
     the Geofabrik extracts already on disk, the same files the trails
     ingest reads: one tag-filtered relation pass per country records which
     wanted relations the extract holds and their members, then id passes
     resolve up to nine of the member ways the extract holds to a node each,
     and the first node that lies inside the country (NUTS3 point in
     polygon) wins. A route present in three national extracts is placed in
     all three, each at a point inside that country, which is what a
     per-country registry needs. Super-routes
     (an E-path is a relation of relations) are followed down three levels.
  3. Write data/trails/waymarked_routes.json, committed, which
     famous_registry.py reads as its fifth evidence source.

Never the details endpoint in bulk, and never Overpass: the extracts are the
same OSM data without anybody's rate limit.

Licence: the route list is OSM data, ODbL 1.0, (c) OpenStreetMap
contributors, served by waymarkedtrails.org (Sarah Hoffmann). Only ids, names,
refs and groups are kept; no geometry is taken from the service.

Usage, from the repo root:
    python pipeline/trails/waymarked.py                 # harvest + place
    python pipeline/trails/waymarked.py --harvest-only  # step 1 only
    python pipeline/trails/waymarked.py --place-only    # reuse the harvest

In a sparse worktree set CARTA_DATA_ROOT (regions spine) and
INGEST_DATA_DIR (the Geofabrik extracts) at the main checkout; nothing is
written there.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from famous_registry import DATA_ROOT, WAYMARKED, write_json, load_json  # noqa: E402
from ingest_osm_routes import COUNTRIES, cached_extract  # noqa: E402

API = "https://hiking.waymarkedtrails.org/api/v1/list/by_area"
HEADERS = {"User-Agent": "Carta trails registry (carta-europetravel.com)"}
GPKG = DATA_ROOT / "cache" / "regions" / "regions.gpkg"

WANT_GROUPS = ("INT", "NAT")
PAGE = 100                      # the API's own cap per box
BASE_M = 204800.0               # 204.8 km; halves cleanly to 6.4 km at depth 5
MAX_DEPTH = 6
WORKERS = 3                     # a volunteer-run server; be polite
ROUTE_VALUES = {"hiking", "foot", "walking"}
CANDIDATES = 9                  # held ways tried per route per country
CHECKPOINT = Path(tempfile.gettempdir()) / "carta_waymarked_cells.json"
# A fresh harvest with fewer routes than this share of the current file is an
# outage or a throttled run, not Europe losing its national trails, and is not
# written (T311, for the monthly trails_registry task). INT and NAT routes are
# signed long-distance paths; a month moves a handful, never a tenth.
HARVEST_FLOOR = 0.9


def harvest_floor(prior):
    """The fewest routes a harvest may return and still replace `prior`."""
    n = len((prior or {}).get("routes") or [])
    return int(n * HARVEST_FLOOR)


# ---------------------------------------------------------------------------
# Step 1: harvest the INT and NAT routes, box by box
# ---------------------------------------------------------------------------

def land_index():
    """NUTS3 polygons in EPSG:3857 with a spatial index, for the sea test."""
    import geopandas as gpd
    admin = gpd.read_file(GPKG, layer="admin")
    a3 = admin[admin["level"] == 3].to_crs(3857)
    return a3


def has_land(a3, box):
    from shapely.geometry import box as mkbox
    return len(a3.sindex.query(mkbox(*box), predicate="intersects")) > 0


def fetch(box):
    """One by_area call. None after four failures, never an empty list:
    an empty answer would read as "no national trails here"."""
    import requests
    params = {"bbox": ",".join(f"{v:.0f}" for v in box), "limit": PAGE}
    for attempt in range(4):
        try:
            r = requests.get(API, params=params, headers=HEADERS, timeout=180)
            if r.status_code == 200:
                return r.json().get("results") or []
        except Exception:
            pass
        time.sleep(5 * (attempt + 1))
    return None


def children(box):
    x0, y0, x1, y1 = box
    xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
    return [(x0, y0, xm, ym), (xm, y0, x1, ym),
            (x0, ym, xm, y1), (xm, ym, x1, y1)]


def harvest(verbose=True):
    """{relation id: {name, ref, group}} for every INT and NAT route that
    touches a NUTS3 polygon, plus the harvest's own bookkeeping."""
    a3 = land_index()
    minx, miny, maxx, maxy = a3.total_bounds
    gx0 = (minx // BASE_M) * BASE_M
    gy0 = (miny // BASE_M) * BASE_M
    frontier = []
    x = gx0
    while x < maxx:
        y = gy0
        while y < maxy:
            box = (x, y, x + BASE_M, y + BASE_M)
            if has_land(a3, box):
                frontier.append((box, 0))
            y += BASE_M
        x += BASE_M

    done = load_json(CHECKPOINT, {}) or {}
    routes, stats = {}, {"requests": 0, "split": 0, "failed": 0,
                         "saturated_at_max_depth": 0}
    if verbose:
        print(f"  harvest: {len(frontier)} land box(es) at "
              f"{BASE_M / 1000:.1f} km, {len(done)} already in the checkpoint")

    def key(box):
        return ",".join(f"{v:.0f}" for v in box)

    while frontier:
        todo = [(b, d) for b, d in frontier if key(b) not in done]
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            got = list(ex.map(lambda bd: (bd, fetch(bd[0])), todo))
        for (box, depth), res in got:
            stats["requests"] += 1
            if res is None:
                stats["failed"] += 1
                continue
            done[key(box)] = {"depth": depth, "results": [
                {k: r.get(k) for k in ("id", "name", "ref", "group")}
                for r in res if r.get("type") == "relation"]}
        write_json(CHECKPOINT, done)
        nxt = []
        for box, depth in frontier:
            cell = done.get(key(box))
            if cell is None:
                continue
            res = cell["results"]
            for r in res:
                if r.get("group") in WANT_GROUPS:
                    routes.setdefault(r["id"], {
                        "name": r.get("name"), "ref": r.get("ref"),
                        "group": r["group"]})
            cut = (len(res) >= PAGE and res[-1].get("group") in WANT_GROUPS)
            if cut:
                if depth >= MAX_DEPTH:
                    stats["saturated_at_max_depth"] += 1
                    continue
                stats["split"] += 1
                nxt += [(c, depth + 1) for c in children(box)
                        if has_land(a3, c)]
        if verbose:
            print(f"    depth pass: {len(todo)} box(es) asked, "
                  f"{len(routes):,} INT/NAT route(s) so far, "
                  f"{len(nxt)} box(es) to split into", flush=True)
        frontier = nxt
    stats["boxes"] = len(done)
    return routes, stats


# ---------------------------------------------------------------------------
# Step 2: place every route in every country extract that holds it
# ---------------------------------------------------------------------------

def place_in_country(cc, slug, wanted, verbose=True):
    """{relation id: {lat, lon, tags}} for the wanted ids in one extract.

    One tag-filtered relation pass keeps every walking route relation's way
    and relation members, so a super-route can be followed to a way without
    a second relation pass. Then up to CANDIDATES of the ways the extract
    actually holds are resolved to their first nodes; choose_points() keeps
    the first one that lies inside this country."""
    import osmium
    pbf = cached_extract(slug)
    if pbf is None:
        if verbose:
            print(f"    {cc}: no extract on disk, skipped")
        return None
    t0 = time.time()
    members, tags_of = {}, {}
    fp = osmium.FileProcessor(str(pbf), osmium.osm.RELATION).with_filter(
        osmium.filter.KeyFilter("route"))
    for rel in fp:
        if rel.tags.get("route") not in ROUTE_VALUES \
                and rel.tags.get("type") != "superroute":
            continue
        ways = [m.ref for m in rel.members if m.type == "w"]
        rels = [m.ref for m in rel.members if m.type == "r"]
        members[rel.id] = (ways, rels)
        if rel.id in wanted:
            tags_of[rel.id] = {k: rel.tags.get(k) for k in (
                "network", "wikidata", "wikipedia", "name", "ref")
                if rel.tags.get(k)}

    # Walk each wanted route down to its way members, three levels deep.
    way_lists = {}
    for rid in tags_of:
        order, seen, queue = [], set(), [(rid, 0)]
        while queue:
            cur, depth = queue.pop(0)
            if cur in seen or cur not in members:
                continue
            seen.add(cur)
            ways, rels = members[cur]
            order += ways
            if depth < 3:
                queue += [(r, depth + 1) for r in rels]
        # No early cut: a super-route lists its neighbours' sections first
        # (the E2 reaches Luxembourg after 941 Walloon ways), and only the
        # ways this extract holds can place the route in this country.
        if order:
            way_lists[rid] = order

    want_ways = {w for ws in way_lists.values() for w in ws}
    first_node = {}
    if want_ways:
        fp = osmium.FileProcessor(str(pbf), osmium.osm.WAY).with_filter(
            osmium.filter.IdFilter(want_ways))
        for way in fp:
            try:
                first_node[way.id] = way.nodes[0].ref
            except Exception:
                continue
    # Up to CANDIDATES held ways, spread evenly along the member list, and
    # later the first of them whose node really lies in this country. One
    # fixed pick does not work: an extract carries a cross-border relation
    # with many of its neighbour's ways (measured on the first full run:
    # 223 of 1,453 added rows landed in a neighbour's NUTS3 from the middle
    # held way, the Julius Kugy Alpine Trail in Italy as an Austrian row).
    pick = {}
    for rid, ws in way_lists.items():
        held = [w for w in ws if w in first_node]
        if held:
            n = min(CANDIDATES, len(held))
            idx = sorted({int((k + 0.5) * len(held) / n) for k in range(n)})
            pick[rid] = [first_node[held[i]] for i in idx]
    coords = {}
    if pick:
        fp = osmium.FileProcessor(str(pbf), osmium.osm.NODE).with_filter(
            osmium.filter.IdFilter({n for ns in pick.values() for n in ns}))
        for node in fp:
            if node.location.valid():
                coords[node.id] = (round(node.location.lat, 6),
                                   round(node.location.lon, 6))
    out = {}
    for rid, tags in tags_of.items():
        pts = [coords[n] for n in pick.get(rid, []) if n in coords]
        out[rid] = {"candidates": pts, "tags": tags}
    if verbose:
        placed = sum(1 for v in out.values() if v["candidates"])
        print(f"    {cc}: {len(out):,} wanted route(s) in the extract, "
              f"{placed:,} placed, {time.time() - t0:.0f}s", flush=True)
    return out


def choose_points(per_cc, verbose=True):
    """One [lat, lon] per route per country: the first candidate inside
    that country by the regions spine, else None.

    Point-in-polygon on the same NUTS3 layer the registry's region
    assignment uses, so a row the registry places lands in its own country.
    None is the honest answer when no candidate is inside: Geofabrik cuts
    its extracts with a margin, so a route that runs along the far side of
    a border is held by the neighbour's extract without entering the
    neighbour (the first full run kept 225 such placements at a middle
    point, and they became rows of the wrong country). famous_registry.py
    attaches evidence for such a route but never adds it as a row."""
    import geopandas as gpd
    admin = gpd.read_file(GPKG, layer="admin")
    a3 = admin[admin["level"] == 3][["country", "geometry"]]
    keys, xs, ys = [], [], []
    for cc, got in per_cc.items():
        for rid, hit in got.items():
            for i, (lat, lon) in enumerate(hit["candidates"]):
                keys.append((cc, rid, i))
                xs.append(lon)
                ys.append(lat)
    country_at = {}
    if keys:
        pts = gpd.GeoDataFrame({"_k": range(len(keys))},
                               geometry=gpd.points_from_xy(xs, ys),
                               crs="EPSG:4326")
        hit = gpd.sjoin(pts, a3, how="left", predicate="within")
        hit = hit[~hit["_k"].duplicated(keep="first")]
        for k, c in zip(hit["_k"], hit["country"]):
            country_at[keys[int(k)]] = c if isinstance(c, str) else None
    outside = 0
    for cc, got in per_cc.items():
        for rid, hit in got.items():
            cands = hit["candidates"]
            point = None
            for i, pt in enumerate(cands):
                if country_at.get((cc, rid, i)) == cc:
                    point = list(pt)
                    break
            if point is None and cands:
                outside += 1
            hit["point"] = point
    if verbose:
        print(f"  {outside} placement(s) with no candidate inside the "
              f"country; written as null")
    return outside


def place(routes, countries, verbose=True):
    wanted = set(routes)
    slug_of = {c: s for s, c in COUNTRIES.items()}
    per_cc, missing_extract = {}, []
    for cc in countries:
        got = place_in_country(cc, slug_of[cc], wanted, verbose=verbose)
        if got is None:
            missing_extract.append(cc)
            continue
        per_cc[cc] = got
    outside = choose_points(per_cc, verbose=verbose)
    return per_cc, missing_extract, outside


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="",
                    help="ISO2 list to place in (default: every catalogue "
                         "country)")
    ap.add_argument("--harvest-only", action="store_true")
    ap.add_argument("--place-only", action="store_true",
                    help="reuse the routes in the existing output file")
    args = ap.parse_args()

    countries = ([c.strip().upper() for c in args.countries.split(",")
                  if c.strip()] or sorted(set(COUNTRIES.values())))

    prior = load_json(WAYMARKED, {}) or {}
    if args.place_only:
        routes = {int(r["relation_id"]): {k: r.get(k) for k in
                                          ("name", "ref", "group")}
                  for r in prior.get("routes") or []}
        stats = prior.get("harvest") or {}
        print(f"waymarked: reusing {len(routes):,} harvested route(s)")
    else:
        print("waymarked: [1/2] harvest INT and NAT routes")
        routes, stats = harvest()
        print(f"  {len(routes):,} route(s) from {stats['requests']} request(s)"
              f", {stats['failed']} failed box(es)")
        if stats["failed"]:
            print("  ! some boxes never answered; re-run to retry them "
                  f"(checkpoint {CHECKPOINT})")
        floor = harvest_floor(prior)
        if len(routes) < floor:
            # run_pipeline.py's monthly trails_registry task runs this first
            # (T113-b). A Waymarked outage must not replace the committed
            # harvest with a near-empty one that famous_registry.py would
            # then trust: keep the old file and let the registry read it.
            print(f"  ! only {len(routes):,} route(s) against {floor:,} needed "
                  f"({HARVEST_FLOOR:.0%} of the {len(prior.get('routes') or []):,}"
                  f" in the current file); the current file is kept as it is")
            return 0

    per_cc, no_extract, outside = {}, [], 0
    keep_placements = args.harvest_only
    if not args.harvest_only:
        print("waymarked: [2/2] place each route in the extracts on disk")
        per_cc, no_extract, outside = place(routes, countries)
        if countries and len(no_extract) >= len(countries):
            # No extract on disk at all (a box that never pulled data/raw):
            # placing would write every route as unplaced. Keep the old
            # placements, exactly as --harvest-only does.
            print("  ! no Geofabrik extract found for any country; the "
                  "previous placements are kept")
            keep_placements = True

    rows = []
    for rid in sorted(routes):
        r = routes[rid]
        placed, tags = {}, {}
        for cc, got in per_cc.items():
            hit = got.get(rid)
            if hit is None:
                continue
            tags = tags or hit["tags"]
            placed[cc] = hit["point"]
        rows.append({"relation_id": rid, "name": r.get("name"),
                     "ref": r.get("ref"), "group": r.get("group"),
                     "network": tags.get("network"),
                     "wikidata": tags.get("wikidata"),
                     "wikipedia": tags.get("wikipedia"),
                     "countries": placed})
    by_group = {}
    for r in rows:
        by_group[r["group"]] = by_group.get(r["group"], 0) + 1
    per_country = {}
    for r in rows:
        for cc in r["countries"]:
            per_country.setdefault(cc, {"INT": 0, "NAT": 0})
            per_country[cc][r["group"]] += 1
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(
            timespec="seconds"),
        "source": API,
        "licence": "ODbL 1.0, (c) OpenStreetMap contributors; route list "
                   "served by waymarkedtrails.org",
        "groups": list(WANT_GROUPS),
        "harvest": stats,
        "placed_in": sorted(per_cc),
        "no_extract": no_extract,
        "counts": {
            "routes": len(rows),
            "by_group": by_group,
            "in_no_catalogue_country": sum(1 for r in rows
                                           if not r["countries"]),
            "placed_outside_country": outside,
            "per_country": dict(sorted(per_country.items())),
        },
        "note": "Every INT (iwn) and NAT (nwn) hiking route Waymarked Trails "
                "lists over a NUTS3 polygon, placed in each catalogue "
                "country whose Geofabrik extract holds it. countries maps "
                "ISO2 to a [lat, lon] inside that country, or null when the "
                "extract holds the relation but none of its sampled ways "
                "has a node inside the country (held across the border by "
                "the extract's margin). A route "
                "with no countries touched only a neighbour outside the "
                "catalogue.",
        "routes": rows,
    }
    if keep_placements and prior.get("routes"):
        # Keep the old placements rather than writing an unplaced file.
        old = {r["relation_id"]: r for r in prior["routes"]}
        for r in rows:
            if r["relation_id"] in old:
                r.update({k: old[r["relation_id"]].get(k) for k in
                          ("network", "wikidata", "wikipedia", "countries")})
    write_json(WAYMARKED, payload)
    print(f"  -> {WAYMARKED}")
    print(f"  routes {len(rows):,}  by group {by_group}  "
          f"outside the catalogue {payload['counts']['in_no_catalogue_country']:,}")


if __name__ == "__main__":
    main()
