"""Railway stations, from the extracts, so "car-free start" is a fact.

ROUTES.md R6 needs one question answered per access point: can you get here
without a car. The cycling layer already answers it inside its own service
towns (cycle_services.station_n), but that is a count per TOWN on a cycle
route, not a point anybody can measure a hiking trailhead against. This
builds the point layer once, for both activities.

What counts as a station is not the railway tag. OSM puts railway=station on
zoo miniatures, funiculars, heritage lines and freight yards, and the first
Chilterns cycle tour composed in this repo offered "Whipsnade Central", a
15 inch gauge line inside a zoo, as its bail-out. The classifier here is
enrich_cycling._amenity_kind's station branch, imported rather than copied so
the two layers cannot drift, plus amenity=bus_station, which is a building
somebody scheduled coaches into. Ordinary bus stops are deliberately absent:
there are millions of them, most serve four buses a day, and one beside a
trailhead proves nothing about getting there.

Sources: the same Geofabrik extracts every other pass reads, already on disk.
Two passes per country, nodes then ways, each KeyFilter driven so the
filtering happens in C++; a way-mapped station contributes its first node,
which is inside the building.

Usage, from the repo root (lab up):
    python pipeline/trails/transit_stops.py                 # every country
    python pipeline/trails/transit_stops.py --countries CH,LI
    python pipeline/trails/transit_stops.py --dry-run --countries LI

ASCII clean, no em dashes, per project convention.
"""

import argparse
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import osmium

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "pipeline" / "cycling"))

from db import connect  # noqa: E402
from ingest_osm_routes import COUNTRIES, cached_extract  # noqa: E402
from schema import ensure  # noqa: E402

SCHEMA_SQL = ROOT / "tools" / "trailslab" / "initdb" / "10_transit.sql"

# The station test, from the cycling layer, so a tourist railway that is not
# a bail-out there is not a car-free start here either.
_amenity_kind = None


def station_kind(tags):
    """'station' for a real railway station, 'bus_station' for a coach
    station, else None."""
    global _amenity_kind
    if _amenity_kind is None:
        import enrich_cycling
        _amenity_kind = enrich_cycling._amenity_kind
    if tags.get("amenity") == "bus_station":
        return "bus_station"
    return "station" if _amenity_kind(tags) == "station" else None


KEYS = ("railway", "amenity")


def scan(pbf):
    """(kind, lat, lon, name) for every station in one extract."""
    out = []
    for key in KEYS:
        fp = osmium.FileProcessor(str(pbf), osmium.osm.NODE) \
            .with_filter(osmium.filter.KeyFilter(key))
        for node in fp:
            kind = station_kind(node.tags)
            loc = node.location
            if kind and loc.valid():
                out.append((kind, loc.lat, loc.lon, node.tags.get("name")))

    pending = []
    for key in KEYS:
        fp = osmium.FileProcessor(str(pbf), osmium.osm.WAY) \
            .with_filter(osmium.filter.KeyFilter(key))
        for way in fp:
            kind = station_kind(way.tags)
            if kind and len(way.nodes) >= 1:
                pending.append((kind, way.nodes[0].ref, way.tags.get("name")))
    if pending:
        wanted = np.unique(np.fromiter((r for _k, r, _n in pending),
                                       dtype=np.int64, count=len(pending)))
        coords = {}
        fp = osmium.FileProcessor(str(pbf), osmium.osm.NODE) \
            .with_filter(osmium.filter.IdFilter(wanted))
        for node in fp:
            loc = node.location
            if loc.valid():
                coords[node.id] = (loc.lat, loc.lon)
        for kind, ref, name in pending:
            got = coords.get(ref)
            if got:
                out.append((kind, got[0], got[1], name))
    return out


INSERT_SQL = """
    INSERT INTO transit_stops (country, kind, name, geom)
    SELECT %(cc)s, %(kind)s, %(name)s,
           ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)
"""


def store(conn, cc, rows):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM transit_stops WHERE country = %s", (cc,))
        cur.executemany(INSERT_SQL, [
            {"cc": cc, "kind": k, "name": n, "lat": lat, "lon": lon}
            for k, lat, lon, n in rows])


def slug_of(iso2):
    for slug, code in COUNTRIES.items():
        if code == iso2:
            return slug
    return None


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    conn = connect()
    ensure(conn, SCHEMA_SQL, verbose=True)
    wanted = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
              or sorted(set(COUNTRIES.values())))
    totals = Counter()
    t_all = time.time()
    for cc in wanted:
        slug = slug_of(cc)
        pbf = cached_extract(slug) if slug else None
        if pbf is None:
            print(f"{cc}: no extract on disk, skipped")
            continue
        t0 = time.time()
        rows = scan(pbf)
        kinds = Counter(k for k, _, _, _ in rows)
        if not args.dry_run:
            store(conn, cc, rows)
            conn.commit()
        totals.update(kinds)
        print(f"{cc}: {len(rows):,} stops ({kinds.get('station', 0):,} rail, "
              f"{kinds.get('bus_station', 0):,} coach) [{time.time() - t0:.0f}s]"
              + ("  (dry run)" if args.dry_run else ""))
    if not args.dry_run:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO data_sources (name, license, attribution_template,
                                          last_refreshed_at, refresh_cadence)
                VALUES ('osm_transit_stops', 'ODbL 1.0',
                        'Station locations (c) OpenStreetMap contributors, ODbL',
                        now(), 'quarterly')
                ON CONFLICT (name) DO UPDATE SET last_refreshed_at = now()""")
        conn.commit()
    conn.close()
    print(f"total {sum(totals.values()):,} stops in {time.time() - t_all:.0f}s: "
          f"{dict(totals)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
