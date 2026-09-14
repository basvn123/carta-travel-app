"""Node-network cycling: a mesh is not a route, so it is not published as one.

ROUTES.md R8. In the Netherlands and Belgium you do not ride a route, you
ride a number: junctions carry `rcn_ref`, you note a sequence of them, and
the signs between them are the navigation. There are 50,600 km of it in
24,171 signed edges, and every one of those edges is a two kilometre
connector between two numbered posts.

The cycling layer already learned what happens if you treat those as
routes: the Netherlands would publish forty thousand two-kilometre
"routes", which is why harvest_cycling.py filters `network:type=node_network`
out of the catalogue entirely. That filter is right and stays.

What is wrong is the silence that follows it. A reader in Maastricht is
shown nothing, and "nothing" is false: they are standing in one of the
densest cycling networks in Europe. So this measures the MESH rather than
its edges, and the destination page says how much signed network is within
reach and where the nearest junction is. One sentence and a map link, not
a list of routes, because a list of routes is the thing that does not
exist.

What a summary holds, per destination with any network inside RADIUS_KM:
    km          signed edge length inside the radius
    junctions   numbered posts inside it
    nearest     the closest junction, its number and how far away

Written into data/derived/node_networks.json, which pipeline/trails/
attach.py reads and carries in the attach row under `node_network` for the
cycling half. No new table: the graph is already in cycle_nodes and
cycle_node_edges, and this is a read over it.

Usage, from the repo root (lab up):
    python pipeline/trails/node_networks.py
    python pipeline/trails/node_networks.py --dry-run

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402

APP_DATA = ROOT / "continent-app" / "public" / "app_data.json"
OUT = ROOT / "data" / "derived" / "node_networks.json"
REPORT = ROOT / "data" / "reports" / "routes_node_networks.json"

# How far out "the network around here" reaches. 15 km is a flat hour on a
# bike, which is the unit this kind of riding is planned in.
RADIUS_KM = 15.0
# Below this there is a signed junction or two rather than a network, and
# saying "3 km of signed routes" would promise something that is not there.
MIN_KM = 25.0

# Degrees of latitude and longitude that bound the radius, the same
# index-served prefilter the attach uses. Longitude is corrected for
# latitude, though in the Low Countries that correction is small.
SQL = """
WITH pt AS MATERIALIZED (
    SELECT ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326) AS g,
           ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography AS gg,
           ST_Expand(ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326),
                     %(deg_lon)s, %(deg_lat)s) AS box
)
SELECT
    (SELECT COALESCE(sum(
        ST_Length(ST_Intersection(e.geom, ST_Buffer(pt.gg, %(m)s)::geometry)::geography)
     ), 0)
     FROM cycle_node_edges e, pt
     WHERE e.geom && pt.box AND ST_DWithin(e.geom::geography, pt.gg, %(m)s)),
    (SELECT count(*) FROM cycle_nodes n, pt
     WHERE n.geom && pt.box AND ST_DWithin(n.geom::geography, pt.gg, %(m)s)),
    (SELECT jsonb_build_object(
        'ref', n.rcn_ref, 'km',
        round((ST_Distance(n.geom::geography, pt.gg) / 1000.0)::numeric, 1),
        'lat', round(ST_Y(n.geom)::numeric, 5), 'lon', round(ST_X(n.geom)::numeric, 5))
     FROM cycle_nodes n, pt
     WHERE n.geom && pt.box AND ST_DWithin(n.geom::geography, pt.gg, %(m)s)
     ORDER BY n.geom <-> pt.g LIMIT 1)
"""


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    conn = connect()
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT country FROM cycle_nodes ORDER BY 1")
        have = {r[0] for r in cur.fetchall()}
    print(f"node networks are mapped in: {', '.join(sorted(have)) or 'nowhere'}")

    dests = json.loads(APP_DATA.read_text(encoding="utf-8"))["destinations"]
    subjects = [(did, d) for did, d in sorted(dests.items())
                if d.get("iso2") in have]
    print(f"{len(subjects):,} destinations in those countries")

    out, t0 = {}, time.time()
    deg_lat = RADIUS_KM / 111.0
    for did, d in subjects:
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        if lat is None or lon is None:
            continue
        import math
        deg_lon = RADIUS_KM / (111.0 * max(0.25, math.cos(math.radians(lat))))
        with conn.cursor() as cur:
            cur.execute(SQL, {"lat": lat, "lon": lon, "m": RADIUS_KM * 1000.0,
                              "deg_lat": deg_lat, "deg_lon": deg_lon})
            metres, junctions, nearest = cur.fetchone()
        conn.commit()
        km = round((metres or 0) / 1000.0)
        if km < MIN_KM or not junctions:
            continue
        out[did] = {"km": km, "junctions": junctions,
                    "radius_km": RADIUS_KM, "nearest": nearest}
        if args.verbose:
            print(f"  {did} {str(d.get('city'))[:22]:<22} {km:>5} km, "
                  f"{junctions:>4} junctions")
    conn.close()

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "radius_km": RADIUS_KM, "min_km": MIN_KM,
        "countries": sorted(have),
        "destinations_considered": len(subjects),
        "destinations_with_a_network": len(out),
        "biggest": sorted(
            ({"id": k, "km": v["km"], "junctions": v["junctions"]}
             for k, v in out.items()), key=lambda x: -x["km"])[:10],
        "seconds": round(time.time() - t0, 1),
    }
    if not args.dry_run:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                       encoding="utf-8")
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n",
                          encoding="utf-8")
    print(f"{len(out):,} destinations have a signed network within "
          f"{RADIUS_KM:g} km ({time.time() - t0:.0f}s)")
    for b in report["biggest"][:5]:
        print(f"  {b['id']}: {b['km']:,} km, {b['junctions']} junctions")
    print("dry run: nothing written" if args.dry_run
          else f"wrote {OUT.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
