"""The relation graph: every route relation, every tag, every member, kept.

ROUTES.md R2 (this file's --scan) and R3 (--classify, later). The ingest
reads route relations from the Geofabrik extracts and keeps 21 tags and a
flattened way list per relation; the member list, the roles, and which
relation is a stage of which never reach the lab. This pass reads the same
extracts once more, relations only, and stores exactly what the ingest
threw away into route_relations (initdb/09_hierarchy.sql):

    tags_all      every tag, verbatim
    members       the ordered [[type, ref, role], ...] list, OSM order kept
    parent_refs   route relations of the same activity this one belongs to
    child_refs    member relations of the same activity
    in_store      whether a trips (hiking) or cycle_routes (cycling) row
                  exists for it, by (source = 'osm', source_ref)
    duplicate_in  the other country extracts that also carried it

What is scanned: type=route or type=superroute with route=hiking, foot or
walking (activity hiking) or route=bicycle (activity cycling). Node-network
relations (network:type=node_network) are kept and are not special here;
the tag is on the row and R8 reads it. No geometry, no DEM, no ways, no
nodes: a relations-only pyosmium pass with KeyFilter("route"), the same
shape as ingest_osm_routes.scan_relations, minus its tag pruning.

Ownership across extracts. A cross-border relation sits in more than one
country file. One row exists per (activity, osm_id), and its `country` is
the country that INGESTED it (trips.country / cycle_routes.country), else
the first extract that scanned it. The owner's extract supplies tags_all,
members and scanned_at; every other extract that carries the relation adds
itself to duplicate_in and contributes its parent and child refs, which are
merged as sets and never overwritten. That is what lets a superroute whose
children live in the neighbouring country's file still know its children.

Resumable per country: --countries CH rewrites CH-owned rows and touches
another country's rows only to add CH to duplicate_in or merge refs, never
their scanned_at. The report data/reports/routes_extract.json is merged
per country, so a partial run updates its own entries and leaves the rest.

Usage, from the repo root (lab must be up):
    python pipeline/trails/hierarchy.py --scan                    # every extract on disk
    python pipeline/trails/hierarchy.py --scan --countries CH,LI  # a subset
    python pipeline/trails/hierarchy.py --scan --dry-run --countries AD

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import osmium
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
from ingest_osm_routes import COUNTRIES, cached_extract  # noqa: E402
from route_schema import ensure_schema, TABLE_OF_ACTIVITY  # noqa: E402

REPORT = ROOT / "data" / "reports" / "routes_extract.json"

# route=* value -> activity. The hiking set is the ingest's ROUTE_VALUES; the
# cycling value is harvest_cycling.ROUTE_VALUE. route=mtb stays out until R8.
ROUTE_ACTIVITY = {"hiking": "hiking", "foot": "hiking", "walking": "hiking",
                  "bicycle": "cycling"}
ACTIVITIES = ("hiking", "cycling")
RELATION_TYPES = ("route", "superroute")
NODE_NETWORK = "node_network"

BATCH = 1000

# Sanity gate for a FULL scan, per activity: the store already holds N rows
# of this activity from the same extracts, so the scan must find at least
# most of them and not an order of magnitude more. Outside these bounds the
# filter is wrong and the report says so instead of the numbers being
# trusted. Hiking scans above the store count on purpose: the ingest's
# first-pass filter dropped unnamed local relations, this keeps them.
GATE_MIN_RATIO = 0.5
GATE_MAX_RATIO = 10.0


# ---------------------------------------------------------------------------
# The pass
# ---------------------------------------------------------------------------

def slug_of(iso2):
    for slug, code in COUNTRIES.items():
        if code == iso2:
            return slug
    return None


def scan_extract(pbf_path):
    """One relations-only pass. Returns {activity: {osm_id: {tags, members}}}.

    A relation whose route tag names both activities ("hiking;bicycle")
    lands in both pools; the primary key is (activity, osm_id), so that is
    two rows and not a collision."""
    pools = {a: {} for a in ACTIVITIES}
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.RELATION) \
        .with_filter(osmium.filter.KeyFilter("route"))
    for rel in fp:
        tags = rel.tags
        if tags.get("type") not in RELATION_TYPES:
            continue
        acts = {ROUTE_ACTIVITY[v.strip()]
                for v in (tags.get("route") or "").split(";")
                if v.strip() in ROUTE_ACTIVITY}
        if not acts:
            continue
        # Every tag, verbatim, and the members exactly as OSM orders them.
        tags_all = {t.k: t.v for t in tags}
        members = [[m.type, m.ref, m.role or ""] for m in rel.members]
        for act in acts:
            pools[act][rel.id] = {"tags": tags_all, "members": members}
    return pools


def link_refs(pool):
    """parent_refs and child_refs inside one country's pool of one activity.

    Only relations that are themselves in the pool count: a ferry relation
    inside a hiking superroute is in the member list but is not a child
    route. Sets, sorted, so a re-run is byte-identical."""
    parents, children = defaultdict(set), defaultdict(set)
    for rid, rec in pool.items():
        for mtype, ref, _role in rec["members"]:
            if mtype == "r" and ref != rid and ref in pool:
                children[rid].add(ref)
                parents[ref].add(rid)
    return parents, children


# ---------------------------------------------------------------------------
# The store: who ingested what
# ---------------------------------------------------------------------------

def store_owners(conn, activity):
    """osm relation id -> country of the trips / cycle_routes row."""
    table = TABLE_OF_ACTIVITY[activity]
    with conn.cursor() as cur:
        cur.execute(f"SELECT source_ref::bigint, country FROM {table} "
                    f"WHERE source = 'osm' AND source_ref ~ '^[0-9]+$'")
        return dict(cur.fetchall())


def existing_owners(conn, activity, ids):
    """osm relation id -> country already recorded in route_relations."""
    if not ids:
        return {}
    with conn.cursor() as cur:
        cur.execute("SELECT osm_id, country FROM route_relations "
                    "WHERE activity = %s AND osm_id = ANY(%s)",
                    (activity, list(ids)))
        return dict(cur.fetchall())


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------

# Set union of the stored array and the incoming one, sorted and distinct.
def union_expr(col, kind):
    return (f"(SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{{}}'::{kind}[]) "
            f"FROM unnest(route_relations.{col} || EXCLUDED.{col}) AS x)")

# The owner's write: this extract is the truth for tags, members and
# scanned_at. Refs merge. If another country had claimed the row first (it
# scanned before the owner did), it moves into duplicate_in.
OWNER_SQL = f"""
    INSERT INTO route_relations
        (activity, osm_id, country, tags_all, members, parent_refs,
         child_refs, in_store, duplicate_in, scanned_at)
    VALUES (%(activity)s, %(osm_id)s, %(country)s, %(tags)s, %(members)s,
            %(parents)s, %(children)s, %(in_store)s, '{{}}'::text[], now())
    ON CONFLICT (activity, osm_id) DO UPDATE SET
        country      = EXCLUDED.country,
        tags_all     = EXCLUDED.tags_all,
        members      = EXCLUDED.members,
        in_store     = EXCLUDED.in_store,
        scanned_at   = EXCLUDED.scanned_at,
        parent_refs  = {union_expr('parent_refs', 'bigint')},
        child_refs   = {union_expr('child_refs', 'bigint')},
        duplicate_in = array_remove(
            (SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{{}}'::text[])
             FROM unnest(route_relations.duplicate_in
                         || CASE WHEN route_relations.country <> EXCLUDED.country
                                 THEN ARRAY[route_relations.country]
                                 ELSE '{{}}'::text[] END) AS x),
            EXCLUDED.country)
"""

# A non-owner's sighting: the row is created with the owner's country if it
# does not exist yet (data from this extract is better than none, scanned_at
# stays NULL until the owner writes), otherwise only refs and duplicate_in
# change. tags_all, members, country, in_store and scanned_at are never
# touched on conflict, which is the per-country resumability contract.
DUP_SQL = f"""
    INSERT INTO route_relations
        (activity, osm_id, country, tags_all, members, parent_refs,
         child_refs, in_store, duplicate_in, scanned_at)
    VALUES (%(activity)s, %(osm_id)s, %(owner)s, %(tags)s, %(members)s,
            %(parents)s, %(children)s, %(in_store)s, ARRAY[%(country)s]::text[],
            NULL)
    ON CONFLICT (activity, osm_id) DO UPDATE SET
        parent_refs  = {union_expr('parent_refs', 'bigint')},
        child_refs   = {union_expr('child_refs', 'bigint')},
        duplicate_in = array_remove(
            (SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{{}}'::text[])
             FROM unnest(route_relations.duplicate_in
                         || ARRAY[%(country)s]::text[]) AS x),
            route_relations.country)
"""


def write_pool(conn, activity, country, pool, store, dry_run, verbose):
    """Upsert one country's pool of one activity. Returns the count block."""
    parents, children = link_refs(pool)
    existing = {} if dry_run else existing_owners(conn, activity, pool.keys())
    owned, dup = [], []
    counts = {"relations": len(pool), "superroutes": 0, "node_networks": 0,
              "in_store": 0, "owned": 0, "duplicates_seen": 0,
              "with_children": 0, "with_parents": 0}
    for rid, rec in pool.items():
        tags = rec["tags"]
        if tags.get("type") == "superroute":
            counts["superroutes"] += 1
        if tags.get("network:type") == NODE_NETWORK:
            counts["node_networks"] += 1
        in_store = rid in store
        counts["in_store"] += in_store
        counts["with_children"] += bool(children.get(rid))
        counts["with_parents"] += bool(parents.get(rid))
        owner = store.get(rid) or existing.get(rid) or country
        row = {"activity": activity, "osm_id": rid, "country": country,
               "owner": owner, "tags": Jsonb(tags), "members": Jsonb(rec["members"]),
               "parents": sorted(parents.get(rid, ())),
               "children": sorted(children.get(rid, ())),
               "in_store": in_store}
        if owner == country:
            owned.append(row)
        else:
            dup.append(row)
    counts["owned"] = len(owned)
    counts["duplicates_seen"] = len(dup)
    if dry_run:
        return counts
    with conn.cursor() as cur:
        for i in range(0, len(owned), BATCH):
            cur.executemany(OWNER_SQL, owned[i:i + BATCH])
        for i in range(0, len(dup), BATCH):
            cur.executemany(DUP_SQL, dup[i:i + BATCH])
    if verbose:
        print(f"    {activity}: {len(owned)} owned, {len(dup)} carried for "
              f"another country, {counts['superroutes']} superroutes, "
              f"{counts['node_networks']} node-network")
    return counts


# ---------------------------------------------------------------------------
# Report and gate
# ---------------------------------------------------------------------------

def load_report():
    if REPORT.exists():
        try:
            return json.loads(REPORT.read_text(encoding="utf-8"))
        except ValueError:
            pass
    return {"countries": {}}


def store_totals(conn):
    out = {}
    with conn.cursor() as cur:
        for activity in ACTIVITIES:
            cur.execute(f"SELECT count(*) FROM {TABLE_OF_ACTIVITY[activity]} "
                        f"WHERE source = 'osm'")
            out[activity] = cur.fetchone()[0]
    return out


def graph_totals(conn):
    """What route_relations holds now, per activity."""
    out = {}
    with conn.cursor() as cur:
        for activity in ACTIVITIES:
            cur.execute("""
                SELECT count(*),
                       count(*) FILTER (WHERE tags_all->>'type' = 'superroute'),
                       count(*) FILTER (WHERE tags_all->>'network:type' = %s),
                       count(*) FILTER (WHERE in_store),
                       count(*) FILTER (WHERE cardinality(duplicate_in) > 0),
                       count(*) FILTER (WHERE cardinality(child_refs) > 0),
                       count(*) FILTER (WHERE cardinality(parent_refs) > 0),
                       count(*) FILTER (WHERE scanned_at IS NULL)
                FROM route_relations WHERE activity = %s""",
                        (NODE_NETWORK, activity))
            (n, sup, nn, ins, dups, kids, pars, unowned) = cur.fetchone()
            out[activity] = {"relations": n, "superroutes": sup,
                             "node_networks": nn, "in_store": ins,
                             "cross_border": dups, "with_children": kids,
                             "with_parents": pars,
                             "owner_not_scanned": unowned}
    return out


def store_coverage(conn):
    """Store rows with NO route_relations row: the acceptance criterion."""
    out = {}
    with conn.cursor() as cur:
        for activity in ACTIVITIES:
            cur.execute(f"""
                SELECT count(*) FROM {TABLE_OF_ACTIVITY[activity]} s
                WHERE s.source = 'osm' AND s.source_ref ~ '^[0-9]+$'
                  AND NOT EXISTS (SELECT 1 FROM route_relations r
                                  WHERE r.activity = %s
                                    AND r.osm_id = s.source_ref::bigint)""",
                        (activity,))
            out[activity] = cur.fetchone()[0]
    return out


def gate(totals, store):
    """The order-of-magnitude check, per activity. Node-network relations
    are excluded from the cycling ratio because the harvest dropped them on
    purpose and they are the one population expected to be large."""
    verdicts = {}
    for activity in ACTIVITIES:
        found = totals[activity]["relations"]
        if activity == "cycling":
            found -= totals[activity]["node_networks"]
        have = store[activity] or 1
        ratio = found / have
        verdicts[activity] = {
            "scanned_excluding_node_networks": found, "store": store[activity],
            "ratio": round(ratio, 3),
            "ok": GATE_MIN_RATIO <= ratio <= GATE_MAX_RATIO,
        }
    return verdicts


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def run_scan(args):
    conn = connect()
    ensure_schema(conn, verbose=args.verbose)

    wanted = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
              if args.countries else sorted(set(COUNTRIES.values())))
    unknown = [c for c in wanted if slug_of(c) is None]
    if unknown:
        print(f"no Geofabrik slug for: {', '.join(unknown)}")
        return 2
    activities = [a.strip() for a in args.activities.split(",") if a.strip()]
    for a in activities:
        if a not in ACTIVITIES:
            print(f"unknown activity {a}; choose from {', '.join(ACTIVITIES)}")
            return 2

    store = {a: store_owners(conn, a) for a in activities}
    conn.commit()
    for a in activities:
        print(f"store: {len(store[a]):,} {a} rows with an OSM relation id")

    report = load_report()
    report.setdefault("countries", {})
    skipped, done = [], 0
    t_all = time.time()
    for iso2 in wanted:
        slug = slug_of(iso2)
        pbf = cached_extract(slug)
        if pbf is None:
            skipped.append(iso2)
            print(f"{iso2}: no extract on disk for {slug}, skipped (never downloads)")
            continue
        t0 = time.time()
        pools = scan_extract(pbf)
        t_scan = time.time() - t0
        entry = {
            "extract": pbf.relative_to(ROOT).as_posix(),
            "extract_date": pbf.parent.name,
            "size_mb": round(pbf.stat().st_size / 1048576, 1),
            "scanned_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        for a in activities:
            entry[a] = write_pool(conn, a, iso2, pools[a], store[a],
                                  args.dry_run, args.verbose)
        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()
        entry["seconds"] = round(time.time() - t0, 1)
        entry["scan_seconds"] = round(t_scan, 1)
        report["countries"][iso2] = entry
        done += 1
        line = ", ".join(f"{a} {entry[a]['relations']:,} "
                         f"({entry[a]['in_store']:,} in store, "
                         f"{entry[a]['superroutes']} super, "
                         f"{entry[a]['node_networks']:,} node-net)"
                         for a in activities)
        print(f"{iso2}: {line} [{entry['size_mb']:.0f} MB, "
              f"{entry['seconds']:.0f}s]" + ("  (dry run)" if args.dry_run else ""))

    if args.dry_run:
        print(f"dry run: {done} extract(s) scanned, nothing written")
        conn.close()
        return 0

    totals = graph_totals(conn)
    store_n = store_totals(conn)
    missing = store_coverage(conn)
    conn.commit()
    conn.close()

    full = not args.countries and not skipped
    verdict = gate(totals, store_n)
    report["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    report["last_run"] = {"countries": wanted, "skipped": skipped,
                          "full": full, "seconds": round(time.time() - t_all, 1)}
    report["totals"] = totals
    report["store"] = store_n
    report["store_rows_without_relation"] = missing
    report["gate"] = verdict
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n",
                      encoding="utf-8")

    print(f"\n{done} extract(s) scanned in {time.time() - t_all:.0f}s"
          + (f", skipped {', '.join(skipped)}" if skipped else ""))
    for a in ACTIVITIES:
        t = totals[a]
        print(f"  {a}: {t['relations']:,} relations in the graph, "
              f"{t['superroutes']:,} superroutes, {t['node_networks']:,} node-network, "
              f"{t['in_store']:,} in store, {t['cross_border']:,} cross-border, "
              f"{t['with_children']:,} with children; "
              f"store rows without a relation row: {missing[a]:,}")
    print(f"  report: {REPORT.relative_to(ROOT).as_posix()}")
    bad = [a for a in ACTIVITIES if not verdict[a]["ok"]]
    if full and bad:
        for a in bad:
            v = verdict[a]
            print(f"STOP: {a} scan found {v['scanned_excluding_node_networks']:,} "
                  f"relations against {v['store']:,} in the store (ratio "
                  f"{v['ratio']}); outside {GATE_MIN_RATIO}..{GATE_MAX_RATIO}, "
                  f"the filter is wrong. Report written, nothing else trusted.")
        return 2
    if not full:
        print("  (partial run: the order-of-magnitude gate is only judged on a "
              "full scan)")
    return 0


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(
        description="Route relation graph: scan the cached Geofabrik extracts "
                    "into route_relations (ROUTES.md R2).")
    ap.add_argument("--scan", action="store_true",
                    help="relations-only pass over the extracts on disk")
    ap.add_argument("--countries", default="",
                    help="comma-separated ISO2 codes (default: every country "
                         "with an extract on disk)")
    ap.add_argument("--activities", default=",".join(ACTIVITIES),
                    help=f"comma-separated (default: {','.join(ACTIVITIES)})")
    ap.add_argument("--dry-run", action="store_true",
                    help="scan and count, write nothing")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    if not args.scan:
        ap.print_help()
        print("\nnothing to do: pass --scan (R2). --classify arrives with R3.")
        return 2
    return run_scan(args)


if __name__ == "__main__":
    sys.exit(main())
