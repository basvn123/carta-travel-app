"""Scenic features along the curated routes: the evidence behind a rating.

A trail's rating cannot come from reviews. AllTrails, Komoot, Outdooractive
and Strava all forbid bulk reuse of their ratings, and Instagram has offered
no location search since 2020, so there is no legal way to buy an opinion.
What IS free is the reason the opinion would exist: the summits, viewpoints,
waterfalls, lakes, gorges, castles and mountain huts a route actually runs
past, all of it in OpenStreetMap under ODbL.

This sweeps those features across the grid cells the curated routes touch,
then joins them to the routes. It produces two things:

  a density signal   how much there is to look at per kilometre, which is the
                     largest single term in the published rating (rate.py)
  the highlights     the NAMED features on the line, in the order you meet
                     them, which is what the app shows as "what you will see"
                     and what makes a route's description specific instead of
                     "a moderate walk of 12.4 km"

One Overpass query per grid cell that a curated route actually touches, not
one per country and not one per trail: about 410 cells for Europe against
6,000 trail queries, and a country's empty quarters are never asked about.
Cells are deduped ACROSS countries, so the sweep over the Alps happens once
rather than once each for Austria, Switzerland and Italy, and --shard splits
the list across parallel processes aimed at different mirrors.

Overpass answers a query it could not finish with HTTP 200, an empty element
list and a remark, which reads exactly like "this cell has no viewpoints".
sources.overpass() raises on the remark instead, which is why this imports it
rather than calling the endpoint itself.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/scenic.py
    python pipeline/trails/scenic.py --countries SI,BG --verbose
    python pipeline/trails/scenic.py --link-only      # re-join, no fetching
    python pipeline/trails/scenic.py --shard 0/2      # half the cells
"""

import argparse
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "pipeline"))

from db import connect  # noqa: E402
from beaches import sources  # noqa: E402  (endpoint list is rewritten in place)
from beaches.sources import SourceError, load_cache, overpass, save_cache  # noqa: E402

# Grid cell for the Overpass sweep, in degrees.
#
# 1.0 needed 725 distinct cells to cover Europe's curated routes, and the
# public Overpass instances hand out 429s freely enough that a run that size
# takes most of a day. 1.5 cuts it to 410, which the consolidated query below
# still answers inside its timeout.
CELL_DEG = 1.5

# How close a feature has to be to count as "on this walk". 250 m is about
# what you can see and reach from a path; beyond that you are looking at
# something in the next valley.
HIGHLIGHT_M = 250
# Density is measured in a wider corridor: a viewpoint 600 m off the line is
# still part of why the area is worth walking, even if you do not touch it.
DENSITY_M = 600
# The most highlights a route ships. A list longer than this is a gazetteer.
HIGHLIGHTS_MAX = 12

# What counts as scenic, and how much each kind is worth when the density
# signal is computed. A summit is the reason for a walk; a drinking fountain
# is a convenience that still belongs on the page.
KINDS = {
    "peak": 1.0, "volcano": 1.0, "viewpoint": 1.0, "waterfall": 1.0,
    "glacier": 1.0, "arch": 0.9, "gorge": 0.9, "cave": 0.8, "hot_spring": 0.8,
    "lake": 0.7, "castle": 0.7, "ruins": 0.6, "monastery": 0.6,
    "lighthouse": 0.6, "beach": 0.6, "hut": 0.5, "spring": 0.25, "water": 0.15,
}

# Overpass selectors, consolidated into six statements with regex alternation.
#
# The first version listed each kind separately, twenty-five statements per
# cell, and Overpass charges for every one of them. Alternation asks the same
# question at a fraction of the cost, which is the difference between a sweep
# that finishes and one that spends the day in 429 backoff.
#
# Named-only where the tag is common and a nameless one says nothing to a
# reader: a nameless peak is a contour line, while a nameless viewpoint is
# still a viewpoint and a nameless hut is still shelter.
#
# amenity=drinking_water is deliberately NOT here. Germany alone has tens of
# thousands, they dominated the response by count, and a tap is not a reason
# to choose a walk. Named springs stay, because on a hill they are.
SELECTORS = [
    'node["natural"~"^(peak|volcano|cave_entrance|spring)$"]["name"]',
    'node["natural"~"^(arch|hot_spring)$"]',
    'nwr["natural"~"^(water|glacier|beach|gorge)$"]["name"]',
    'nwr["tourism"~"^(viewpoint|alpine_hut|wilderness_hut)$"]',
    'nwr["waterway"="waterfall"]',
    'nwr["historic"~"^(castle|ruins|monastery)$"]["name"]',
    'nwr["amenity"="monastery"]["name"]',
    'node["man_made"="lighthouse"]["name"]',
]


def build_query(south, west, north, east):
    bbox = f"({south},{west},{north},{east})"
    body = "\n".join(f"  {sel}{bbox};" for sel in SELECTORS)
    # `out center` gives a polygon its centroid, which is what a point table
    # wants; `tags` keeps the name and the elevation.
    return f"[out:json][timeout:300];\n(\n{body}\n);\nout center tags;"


# ---------------------------------------------------------------------------
# Which mirrors are actually up today
# ---------------------------------------------------------------------------

# Named peaks in a small box over the Serra da Estrela, Portugal. Deliberately
# outside every candidate mirror's home country, because the failure this
# guards against is not an error: a REGIONAL Overpass instance answers a
# query outside its extract with a perfectly well formed empty list, and the
# caller stores "this cell has nothing in it". A mirror that cannot find 27
# Portuguese peaks is not a planet mirror and does not get used.
PROBE_QUERY = ('[out:json][timeout:60];'
               '(node["natural"="peak"]["name"](40.2,-7.7,40.4,-7.5););out tags;')
PROBE_MIN_HITS = 5


def live_endpoints(verbose=False):
    """Reorder the shared endpoint list to the mirrors answering right now.

    Worth the half minute this costs. The public instances go down often and
    independently, and a dead one is expensive in a way a fast failure is not:
    overpass-api.de was refusing TCP connections for 42 s per attempt and kumi
    was timing out reads at 70 s, so with the standard three tries and
    exponential backoff a single cell spent over five minutes learning what
    one probe learns once. That is the difference between this sweep taking an
    hour and taking nine."""
    alive = []
    for endpoint in list(sources.OVERPASS_ENDPOINTS):
        started = time.time()
        try:
            raw = sources.request(endpoint, data={"data": PROBE_QUERY},
                                  timeout=45, tries=1, quiet=True)
            hits = len(json.loads(raw.decode("utf-8")).get("elements") or [])
        except (sources.SourceError, ValueError, OSError):
            hits = -1
        took = time.time() - started
        if hits >= PROBE_MIN_HITS:
            alive.append((took, endpoint))
        if verbose:
            state = f"{hits} hits" if hits >= 0 else "no answer"
            print(f"  probe {endpoint.split('/')[2]}: {state} in {took:.1f}s",
                  flush=True)
    if not alive:
        print("  no mirror answered the probe; keeping the full list and "
              "letting the per-request backoff try anyway", flush=True)
        return sources.OVERPASS_ENDPOINTS
    alive.sort()
    sources.OVERPASS_ENDPOINTS = [e for _, e in alive]
    print(f"  using {len(alive)} live mirror(s): "
          + ", ".join(e.split("/")[2] for _, e in alive), flush=True)
    return sources.OVERPASS_ENDPOINTS


KIND_OF_TAGS = [
    ("volcano", lambda t: t.get("natural") == "volcano"),
    ("peak", lambda t: t.get("natural") == "peak"),
    ("viewpoint", lambda t: t.get("tourism") == "viewpoint"),
    ("waterfall", lambda t: t.get("waterway") == "waterfall"),
    ("glacier", lambda t: t.get("natural") == "glacier"),
    ("arch", lambda t: t.get("natural") == "arch"),
    ("cave", lambda t: t.get("natural") == "cave_entrance"),
    ("hot_spring", lambda t: t.get("natural") == "hot_spring"),
    ("gorge", lambda t: t.get("natural") == "gorge"),
    ("castle", lambda t: t.get("historic") == "castle"),
    ("ruins", lambda t: t.get("historic") == "ruins"),
    ("monastery", lambda t: t.get("amenity") == "monastery"
                            or t.get("historic") == "monastery"),
    ("lighthouse", lambda t: t.get("man_made") == "lighthouse"),
    ("beach", lambda t: t.get("natural") == "beach"),
    ("hut", lambda t: t.get("tourism") in ("alpine_hut", "wilderness_hut")),
    ("lake", lambda t: t.get("natural") == "water"),
    ("spring", lambda t: t.get("natural") == "spring"),
]


def classify(tags):
    for kind, test in KIND_OF_TAGS:
        if test(tags):
            return kind
    return None


def parse_elements(elements):
    """Overpass elements to scenic_pois rows, centroids for anything drawn."""
    out = []
    for el in elements:
        tags = el.get("tags") or {}
        kind = classify(tags)
        if not kind:
            continue
        lat = el.get("lat")
        lon = el.get("lon")
        if lat is None:
            centre = el.get("center") or {}
            lat, lon = centre.get("lat"), centre.get("lon")
        if lat is None or lon is None:
            continue
        ele = tags.get("ele")
        try:
            ele = int(round(float(str(ele).replace(",", ".")))) if ele else None
        except ValueError:
            ele = None
        out.append({
            "kind": kind,
            "name": (tags.get("name") or "").strip()[:160] or None,
            "ele_m": ele,
            "wikidata": tags.get("wikidata"),
            "osm_ref": f"{el.get('type')}/{el.get('id')}",
            "lat": lat,
            "lon": lon,
        })
    return out


# ---------------------------------------------------------------------------
# Which cells to ask about
# ---------------------------------------------------------------------------

CELLS_SQL = """
    SELECT DISTINCT
        floor(ST_YMin(geom) / %(deg)s)::int AS south,
        floor(ST_XMin(geom) / %(deg)s)::int AS west
    FROM trips
    WHERE country = %(cc)s AND category = 'hike'
      AND status IN ('approved', 'published')
    UNION
    SELECT DISTINCT
        floor(ST_YMax(geom) / %(deg)s)::int,
        floor(ST_XMax(geom) / %(deg)s)::int
    FROM trips
    WHERE country = %(cc)s AND category = 'hike'
      AND status IN ('approved', 'published')
"""


def cells_for(conn, cc):
    """Grid cells the country's curated routes touch.

    Both corners of every route extent, so a walk that crosses a cell boundary
    has both halves covered. A route longer than one cell can still leave a
    middle cell unasked, which costs a few highlights on a 200 km trek and
    nothing on the day walks that are most of the list."""
    with conn.cursor() as cur:
        cur.execute(CELLS_SQL, {"cc": cc, "deg": CELL_DEG})
        return sorted({(r[0], r[1]) for r in cur.fetchall()})


# The unique index on osm_ref is partial (it excludes NULLs), and Postgres
# only infers a partial index when the statement repeats its predicate. Every
# row written here has an osm_ref, so the WHERE clause is bookkeeping rather
# than a filter, but leaving it out makes the whole insert fail.
INSERT_SQL = """
    INSERT INTO scenic_pois (country, kind, name, ele_m, wikidata, osm_ref, geom)
    VALUES (%s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
    ON CONFLICT (osm_ref) WHERE osm_ref IS NOT NULL DO NOTHING
"""


COUNT_SQL = """
    SELECT floor(ST_YMin(geom) / %(deg)s)::int AS south,
           floor(ST_XMin(geom) / %(deg)s)::int AS west,
           count(*)
    FROM trips
    WHERE country = ANY(%(cc)s) AND category = 'hike'
      AND status IN ('approved', 'published')
    GROUP BY 1, 2
"""


def all_cells(conn, countries):
    """Every grid cell any curated route touches, busiest first.

    Global rather than per country because cells straddle borders: the sweep
    over the Alps is one set of cells whether it was Austria, Switzerland or
    Italy that asked for it, and fetching it once per country would triple the
    slowest part of the run.

    Ordered by how many curated routes each cell holds, not geographically.
    Only one Overpass mirror is usually up, its queue is the whole cost of
    this pass, and the run takes hours; sweeping south to north meant those
    hours bought whichever routes happened to live at low latitudes. Busiest
    first means an interrupted or half-finished sweep has still covered most
    of the routes, and the ones it missed are in the sparse corners."""
    seen = set()
    for cc in countries:
        seen.update(cells_for(conn, cc))
    with conn.cursor() as cur:
        cur.execute(COUNT_SQL, {"deg": CELL_DEG, "cc": list(countries)})
        weight = {(s, w): n for s, w, n in cur.fetchall()}
    # Ties break on the grid key so a re-run walks the same order and the
    # on-disk cell cache lines up with where the last one stopped.
    return sorted(seen, key=lambda c: (-weight.get(c, 0), c))


def harvest_cells(conn, cells, verbose=False, refresh=False, shard=None):
    """Fetch and store one pass of cells.

    shard is (index, count): several processes can split the list and, with
    CARTA_OVERPASS pointed at different mirrors, halve or third the wall clock
    without any one instance seeing two requests at a time."""
    if shard:
        index, count = shard
        cells = [c for i, c in enumerate(cells) if i % count == index]
    stored = fetched = 0
    for i, (sy, sx) in enumerate(cells, 1):
        key = f"{sy}_{sx}"
        cached = None if refresh else load_cache("scenic_cell", key)
        if cached is None:
            south, west = sy * CELL_DEG, sx * CELL_DEG
            query = build_query(south, west, south + CELL_DEG, west + CELL_DEG)
            try:
                elements = overpass(query, timeout=420)
            except SourceError as exc:
                print(f"  cell {key} failed: {str(exc)[:100]}", flush=True)
                continue
            cached = parse_elements(elements)
            save_cache("scenic_cell", key, cached)
            fetched += 1
        # The country column records which sweep found the feature, not which
        # country it stands in: a cell straddles borders and nothing reads it.
        # The join that matters is spatial (ST_DWithin against the route line).
        rows = [("EU", r["kind"], r["name"], r["ele_m"], r["wikidata"],
                 r["osm_ref"], r["lon"], r["lat"]) for r in cached]
        if rows:
            with conn.cursor() as cur:
                cur.executemany(INSERT_SQL, rows)
            conn.commit()
        stored += len(rows)
        if verbose or i % 10 == 0:
            print(f"  {i}/{len(cells)} cells, {stored:,} features "
                  f"({fetched} fetched, {i - fetched} from cache)", flush=True)
    return len(cells), stored


# ---------------------------------------------------------------------------
# Join: what does each curated route actually pass?
# ---------------------------------------------------------------------------

# ST_LineLocatePoint wants a LineString, and a curated route is a single-part
# MultiLineString by construction (curate.py gates on merged_segments = 1),
# so GeometryN(geom, 1) is the whole walk. The distance test runs on geography
# so the radius means metres everywhere from Crete to Tromso.
#
# The `&&` line is what makes this finish. ST_DWithin on a GEOGRAPHY cast
# cannot use the GiST index on scenic_pois.geom, which is a geometry index, so
# the join degraded to a sequential scan over 800,000 landmarks PER ROUTE: the
# first attempt linked twelve routes in ten minutes. Overlapping the plain
# geometry against an expanded envelope first uses the index and leaves the
# exact metric test with a handful of candidates.
#
# DEG_PAD is the envelope in degrees. 0.02 covers DENSITY_M at every European
# latitude: 600 m of longitude is widest in degrees at the top of Norway, where
# one degree is only about 38 km, giving 0.016. Too generous costs nothing (the
# geography test still decides); too tight would silently drop landmarks in the
# north, which is exactly the kind of bug that never shows up in Slovenia.
HIGHLIGHTS_SQL = """
    WITH route AS (
        SELECT id, ST_Force2D(ST_GeometryN(geom, 1)) AS line,
               GREATEST(distance_m, 1) AS len
        FROM trips WHERE id = ANY(%(ids)s)
    )
    SELECT r.id, p.kind, p.name, p.ele_m, p.wikidata,
           ST_Distance(p.geom::geography, r.line::geography) AS off_m,
           ST_LineLocatePoint(r.line, p.geom) * r.len AS along_m,
           ST_Y(p.geom), ST_X(p.geom)
    FROM route r
    JOIN scenic_pois p
      ON p.geom && ST_Expand(r.line, %(pad)s)
     AND ST_DWithin(p.geom::geography, r.line::geography, %(radius)s)
    ORDER BY r.id, along_m
"""

DEG_PAD = 0.02


def link_country(conn, cc, verbose=False):
    """Write highlights + the density counts onto every curated route."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id FROM trips
            WHERE country = %s AND category = 'hike'
              AND status IN ('approved', 'published')""", (cc,))
        ids = [r[0] for r in cur.fetchall()]
    if not ids:
        return 0
    near = defaultdict(list)
    with conn.cursor() as cur:
        cur.execute(HIGHLIGHTS_SQL,
                    {"ids": ids, "radius": DENSITY_M, "pad": DEG_PAD})
        for (tid, kind, name, ele, wd, off_m, along_m, lat, lon) in cur.fetchall():
            near[tid].append({
                "kind": kind, "name": name, "ele_m": ele, "wikidata": wd,
                "off_m": round(off_m), "along_m": round(along_m),
                "lat": round(lat, 5), "lon": round(lon, 5),
            })

    written = 0
    with conn.cursor() as cur:
        for tid in ids:
            found = near.get(tid, [])
            # Density counts everything in the wide corridor, weighted by kind.
            weight = sum(KINDS.get(f["kind"], 0.3) for f in found)
            # The list a reader sees is only what the route genuinely touches,
            # named, best kinds first, then in walking order.
            on_line = [f for f in found
                       if f["off_m"] <= HIGHLIGHT_M and f["name"]]
            on_line.sort(key=lambda f: (-KINDS.get(f["kind"], 0.3), f["off_m"]))
            picked = on_line[:HIGHLIGHTS_MAX]
            picked.sort(key=lambda f: f["along_m"])
            payload = {
                "features": picked,
                "n_near": len(found),
                "weight": round(weight, 2),
                "by_kind": dict(Counter(f["kind"] for f in found)),
                "radius_m": DENSITY_M,
            }
            cur.execute("UPDATE trips SET highlights = %s WHERE id = %s",
                        (Jsonb(payload), tid))
            written += 1
    conn.commit()
    if verbose:
        with_any = sum(1 for tid in ids if near.get(tid))
        print(f"    {with_any}/{len(ids)} routes pass at least one feature")
    return written


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def curated_countries(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT country FROM trips
            WHERE category = 'hike' AND status IN ('approved', 'published')
            ORDER BY country""")
        return [r[0] for r in cur.fetchall()]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--link-only", action="store_true",
                    help="skip Overpass, re-join what is already stored")
    ap.add_argument("--refresh", action="store_true",
                    help="ignore the on-disk cell cache and re-fetch")
    ap.add_argument("--shard", help="i/n, e.g. 0/2, to split the cell sweep "
                                    "across parallel processes")
    ap.add_argument("--harvest-only", action="store_true",
                    help="sweep cells, do not join them to routes yet")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    sys.stdout.reconfigure(errors="replace")
    shard = None
    if args.shard:
        index, count = (int(x) for x in args.shard.split("/"))
        shard = (index, count)

    with connect() as conn:
        countries = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
                     if args.countries else curated_countries(conn))
        t0 = time.time()
        totals = Counter()
        if not args.link_only:
            live_endpoints(verbose=True)
            cells = all_cells(conn, countries)
            print(f"{len(cells)} distinct cells to sweep"
                  + (f" (shard {args.shard})" if shard else ""), flush=True)
            n_cells, found = harvest_cells(conn, cells, args.verbose,
                                           args.refresh, shard)
            totals["cells"] += n_cells
            totals["features"] += found
        if not args.harvest_only:
            for cc in countries:
                linked = link_country(conn, cc, args.verbose)
                totals["linked"] += linked
                print(f"{cc}: linked {linked} routes", flush=True)

        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM scenic_pois")
            stored = cur.fetchone()[0]
        print("\n" + "=" * 58)
        print(f"{stored:,} scenic features stored, {totals['linked']:,} routes "
              f"linked, in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
