"""Co-located routes: the same path carried by several relations.

ROUTES.md R3c. A European E-path, a national GR, a regional network route
and a local themed walk frequently share one trail on the ground, and OSM
carries each as its own relation. curate.py folds families by NAME (title,
article, E-path ref, and since R3a the relation tree), which catches the
relations that say they are the same route. This catches the ones that do
not say so: it measures.

Two rows of the same activity are co-located when the shorter one lies more
than SHARE of its length inside a BUFFER_M buffer of the longer, in
EPSG:3035 so the metres are metres from Marseille to Tromso. Nothing is
sampled: the candidate pairs come from the bounding boxes (the shorter's box
must sit inside the longer's box grown by BUFFER_M, which is exact, no false
negatives, and index-served), and the test on each pair is the true length
of the intersection.

What it writes: co_located on trips (hiking) and cycle_routes (cycling), the
group's head FIRST and the row itself included, so a row is a head exactly
when co_located[1] = id. The head is the member with the higher network tier
(iwn > nwn > rwn > lwn, icn > ncn > rcn > lcn), then the longer line, then
the lower id. NULL on a row that shares its line with nothing. This step
deletes, demotes and unpublishes nothing; curate.py reads co_located as a
family key and the family collapse decides the slot.

Per country, and a cross-border relation is compared in every country whose
extract carried it (route_relations.duplicate_in), so a GR that crosses into
Spain meets the Spanish relation on the same path. Groups are joined across
countries in one run; a single-country run rewrites only that country's rows.

Usage, from the repo root (lab must be up):
    python pipeline/trails/dedup.py                      # every country, both activities
    python pipeline/trails/dedup.py --countries LI,CH --activities hiking
    python pipeline/trails/dedup.py --dry-run --countries LI

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
from ingest_osm_routes import COUNTRIES  # noqa: E402
from route_schema import ensure_schema, TABLE_OF_ACTIVITY  # noqa: E402

REPORT = ROOT / "data" / "reports" / "routes_dedup.json"

BUFFER_M = 30.0        # the corridor either side of the longer line
SHARE = 0.8            # of the shorter's length that must lie in it
# A relation under this length is a connector or a mapping crumb, and
# "inside" a 300 km path says nothing about it. Reported, not compared.
MIN_LEN_M = 200.0
# The shorter must be at least this share of the longer's length. ROUTES.md
# measured co-location one-sidedly (80% of the shorter), and measured that
# way a 12 km village loop that follows a 500 km E-path for ten of its
# kilometres is "co-located" with the E-path, as are the 258 other walks on
# that path, and the family collapse would give all of them one slot. That
# loop LIES ON the E-path; it is not the same walk as the E-path. The same
# walk carried by several relations (the E-path stage, the national GR, the
# regional route, the themed local walk on one trail) has comparable
# extent, which is what this ratio asks for. Measured on Switzerland: the
# largest group went from 259 rows to a handful.
LEN_RATIO_MIN = 0.5

TIER = {"iwn": 4, "nwn": 3, "rwn": 2, "lwn": 1,
        "icn": 4, "ncn": 3, "rcn": 2, "lcn": 1}
NAME_COL = {"trips": "title", "cycle_routes": "COALESCE(name, ref)"}

ACTIVITIES = ("hiking", "cycling")

# The rows a country's pass compares: its own, plus every OSM relation that
# another country ingested but whose extract for THIS country also carried
# (cross-border), so the pair is tested from both sides.
# The relation id of a store row, or NULL: derived routes carry refs like
# "w401215252" and Postgres does not promise to test the pattern before it
# casts, so the cast lives inside the CASE.
OSM_ID = ("CASE WHEN t.source = 'osm' AND t.source_ref ~ '^[0-9]+$' "
          "THEN t.source_ref::bigint END")

IDS_SQL = f"""
    SELECT t.id FROM {{table}} t
    WHERE t.country = %(cc)s AND t.source IN ('osm', 'osm_ways')
    UNION
    SELECT t.id FROM {{table}} t
    JOIN route_relations r ON r.activity = %(activity)s
                          AND r.osm_id = {OSM_ID}
    WHERE %(cc)s = ANY(r.duplicate_in)
"""

# Metric copies of the lines, once per country. Two kinds of row are
# structure rather than a line to dedupe and are left out:
#   umbrellas      a parent's assembled line is the union of its stages, so
#                  every stage and every local path on them lies "inside"
#                  it, and a union-find over those pairs chained 1,891 Swiss
#                  rows behind the E4. The stages carry the physical paths.
#   node networks  a numbered-junction edge is a graph edge; a themed route
#                  made of edges contains each of them, and the mesh chains.
# Both are counted and reported.
CAND_SQL = f"""
    CREATE TEMP TABLE cand AS
    SELECT t.id, lower(t.network) AS network,
           ST_Transform(ST_Force2D(t.geom), 3035) AS g,
           ST_Length(ST_Transform(ST_Force2D(t.geom), 3035)) AS len,
           t.hierarchy = 'parent' AS umbrella,
           COALESCE(r.tags_all->>'network:type', '') = 'node_network' AS node_net
    FROM {{table}} t
    LEFT JOIN route_relations r ON r.activity = %(activity)s
                                AND r.osm_id = {OSM_ID}
    WHERE t.id = ANY(%(ids)s)
"""

# The longer lines cut into pieces of at most 128 vertices, each with its
# own box in the index, so "is any part of b within 30 m of a" is answered
# by the pieces near a and never by walking a 1,900 km line.
PIECES_SQL = """
    CREATE TEMP TABLE pieces AS
    SELECT c.id AS rid, c.len, ST_Subdivide(c.g, 128) AS g FROM cand c
"""

# a is the shorter, b the longer. Candidates: a piece of b lies within the
# corridor width of a (exact, index-served, necessary). The test: the length
# of a inside the buffer of the pieces of b near a, over a's length.
# ST_Buffer of a collection is one unioned polygon, so adjacent pieces do
# not double count at their seams.
PAIRS_SQL = """
    WITH near AS (
        SELECT a.id AS short_id, p.rid AS long_id
        FROM cand a
        JOIN pieces p
          ON p.rid <> a.id
         AND p.g && ST_Expand(a.g, %(buf)s)
         AND ST_DWithin(p.g, a.g, %(buf)s)
         AND (p.len > a.len OR (p.len = a.len AND p.rid < a.id))
         AND a.len >= %(len_ratio)s * p.len
        GROUP BY a.id, p.rid
    )
    SELECT n.long_id, n.short_id, a.len, b.len, x.ratio
    FROM near n
    JOIN cand a ON a.id = n.short_id
    JOIN cand b ON b.id = n.long_id
    CROSS JOIN LATERAL (
        SELECT ST_Length(ST_Intersection(
                   a.g,
                   ST_Buffer((SELECT ST_Collect(p.g) FROM pieces p
                              WHERE p.rid = b.id
                                AND p.g && ST_Expand(a.g, %(buf)s)),
                             %(buf)s))) / a.len AS ratio
    ) x
    WHERE x.ratio > %(share)s
"""


def country_ids(conn, table, activity, cc):
    with conn.cursor() as cur:
        cur.execute(IDS_SQL.format(table=table), {"cc": cc, "activity": activity})
        return [r[0] for r in cur.fetchall()]


def pairs_for(conn, table, activity, ids):
    """(pairs, n_compared, excluded) for one country's rows, where excluded
    counts the short, umbrella and node-network rows left out."""
    with conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS pieces")
        cur.execute("DROP TABLE IF EXISTS cand")
        cur.execute(CAND_SQL.format(table=table), {"ids": ids, "activity": activity})
        cur.execute("""
            SELECT count(*) FILTER (WHERE len < %s OR len IS NULL),
                   count(*) FILTER (WHERE umbrella),
                   count(*) FILTER (WHERE node_net)
            FROM cand""", (MIN_LEN_M,))
        short, umbrellas, node_nets = cur.fetchone()
        cur.execute("DELETE FROM cand WHERE len < %s OR len IS NULL "
                    "OR umbrella OR node_net", (MIN_LEN_M,))
        cur.execute("CREATE INDEX cand_g ON cand USING GIST (g)")
        cur.execute(PIECES_SQL)
        cur.execute("CREATE INDEX pieces_g ON pieces USING GIST (g)")
        cur.execute("CREATE INDEX pieces_rid ON pieces (rid)")
        cur.execute("ANALYZE cand")
        cur.execute("ANALYZE pieces")
        cur.execute("SELECT count(*) FROM cand")
        n = cur.fetchone()[0]
        cur.execute(PAIRS_SQL, {"buf": BUFFER_M, "share": SHARE,
                                "len_ratio": LEN_RATIO_MIN})
        pairs = cur.fetchall()
        cur.execute("DROP TABLE pieces")
        cur.execute("DROP TABLE cand")
    return pairs, n, {"under_min_len": short, "umbrellas": umbrellas,
                      "node_network": node_nets}


def row_facts(conn, table, ids):
    """network tier, length and name per row, for choosing heads and naming
    groups in the report."""
    if not ids:
        return {}
    name = NAME_COL[table]
    with conn.cursor() as cur:
        cur.execute(f"SELECT id, lower(network), distance_m, {name}, status::text, "
                    f"country FROM {table} WHERE id = ANY(%s)", (list(ids),))
        return {r[0]: {"tier": TIER.get(r[1] or "", 0), "len": r[2] or 0,
                       "name": r[3], "status": r[4], "country": r[5]}
                for r in cur.fetchall()}


class Groups:
    """Union-find over the pairs, Europe-wide within one run."""

    def __init__(self):
        self.parent = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb

    def groups(self):
        out = defaultdict(list)
        for x in self.parent:
            out[self.find(x)].append(x)
        return [sorted(v) for v in out.values() if len(v) > 1]


def head_of(members, facts):
    return max(members, key=lambda i: (facts[i]["tier"], facts[i]["len"], -i))


def write_groups(conn, table, groups, facts, touched):
    """co_located on every member (head first, self included); NULL on every
    touched row that ended up in no group."""
    in_group = set()
    rows = []
    for members in groups:
        head = head_of(members, facts)
        arr = [head] + [m for m in members if m != head]
        for m in members:
            rows.append((arr, m))
            in_group.add(m)
    with conn.cursor() as cur:
        cur.executemany(f"UPDATE {table} SET co_located = %s WHERE id = %s "
                        f"AND co_located IS DISTINCT FROM %s",
                        [(arr, m, arr) for arr, m in rows])
        loners = [i for i in touched if i not in in_group]
        if loners:
            cur.execute(f"UPDATE {table} SET co_located = NULL "
                        f"WHERE id = ANY(%s) AND co_located IS NOT NULL", (loners,))
    return len(rows)


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description="Co-located routes (ROUTES.md R3c).")
    ap.add_argument("--countries", default="",
                    help="comma-separated ISO2 (default: every country)")
    ap.add_argument("--activities", default=",".join(ACTIVITIES))
    ap.add_argument("--dry-run", action="store_true",
                    help="measure and report, write nothing")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    conn = connect()
    ensure_schema(conn, verbose=args.verbose)
    countries = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
                 if args.countries else sorted(set(COUNTRIES.values())))
    activities = [a.strip() for a in args.activities.split(",") if a.strip()]
    report = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "buffer_m": BUFFER_M, "share": SHARE, "min_len_m": MIN_LEN_M,
              "len_ratio_min": LEN_RATIO_MIN,
              "countries": countries, "activities": {}}
    t_all = time.time()
    for activity in activities:
        table = TABLE_OF_ACTIVITY[activity]
        groups = Groups()
        touched = set()
        per_cc = {}
        n_pairs = n_cand = 0
        excluded = Counter()
        for cc in countries:
            t0 = time.time()
            ids = country_ids(conn, table, activity, cc)
            if not ids:
                continue
            pairs, n, left_out = pairs_for(conn, table, activity, ids)
            conn.commit()
            touched.update(ids)
            for long_id, short_id, _la, _lb, _ratio in pairs:
                groups.union(long_id, short_id)
            n_pairs += len(pairs)
            n_cand += n
            excluded.update(left_out)
            per_cc[cc] = {"rows": len(ids), "compared": n, **left_out,
                          "pairs": len(pairs), "seconds": round(time.time() - t0, 1)}
            print(f"{activity} {cc}: {len(ids):,} rows, {n:,} compared "
                  f"({left_out['umbrellas']} umbrellas, {left_out['node_network']:,} "
                  f"node-network, {left_out['under_min_len']} short left out), "
                  f"{len(pairs):,} co-located pairs [{per_cc[cc]['seconds']}s]")
        glist = groups.groups()
        member_ids = {m for g in glist for m in g}
        facts = row_facts(conn, table, member_ids)
        sizes = Counter(len(g) for g in glist)
        largest = sorted(glist, key=lambda g: (-len(g), g[0]))[:5]
        pub_groups = [g for g in glist
                      if sum(1 for m in g if facts[m]["status"] == "published") >= 2]
        pub_rows = sum(sum(1 for m in g if facts[m]["status"] == "published")
                       for g in pub_groups)
        block = {
            "rows_touched": len(touched), "compared": n_cand,
            "excluded": dict(excluded), "pairs": n_pairs,
            "groups": len(glist),
            "size_distribution": {str(k): v for k, v in sorted(sizes.items())},
            "rows_in_groups": len(member_ids),
            "five_largest": [{
                "size": len(g), "head": head_of(g, facts),
                "head_name": facts[head_of(g, facts)]["name"],
                "country": facts[head_of(g, facts)]["country"],
                "members": [{"id": m, "name": facts[m]["name"],
                             "tier": facts[m]["tier"], "km": round(facts[m]["len"] / 1000, 1),
                             "status": facts[m]["status"]} for m in g][:12],
            } for g in largest],
            "published_sharing_a_group": {
                "groups": len(pub_groups), "rows": pub_rows,
                "examples": [[{"id": m, "name": facts[m]["name"]}
                              for m in g if facts[m]["status"] == "published"]
                             for g in pub_groups[:10]],
            },
            "countries": per_cc,
        }
        if not args.dry_run:
            n_written = write_groups(conn, table, glist, facts, touched)
            conn.commit()
            block["rows_written"] = n_written
        report["activities"][activity] = block
        print(f"{activity}: {len(glist):,} groups over {len(member_ids):,} rows "
              f"from {n_pairs:,} pairs; sizes {dict(sorted(sizes.items()))}; "
              f"{len(pub_groups):,} groups hold 2+ published rows ({pub_rows:,} rows)"
              + (" (dry run)" if args.dry_run else ""))
        for g in block["five_largest"]:
            print(f"   {g['size']:3d}  {g['country']} {g['head_name']}")
    conn.close()
    report["seconds"] = round(time.time() - t_all, 1)
    if not args.dry_run:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n",
                          encoding="utf-8")
        print(f"report: {REPORT.relative_to(ROOT).as_posix()} [{report['seconds']}s]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
