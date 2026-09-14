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
import re
import sys
import time
from collections import Counter, defaultdict
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
# cycling value is harvest_cycling.ROUTE_VALUE.
#
# ROUTES.md R8 adds the rest. They ride in the SAME graph rather than in
# tables of their own, because the hierarchy, the dedup and the attach are
# all activity-agnostic: a ski tour has stages and variants exactly as a
# pilgrim path does. A relation tagged for two activities ("hiking;mtb", 126
# of them) lands in both pools, which is two rows under the primary key and
# is right: the same ground is a walk and a ride.
#
# Skating is scanned because route=inline_skates exists and costs nothing to
# keep; it is not published anywhere and has no rules of its own.
ROUTE_ACTIVITY = {"hiking": "hiking", "foot": "hiking", "walking": "hiking",
                  "bicycle": "cycling", "mtb": "mtb", "ski": "ski",
                  "canoe": "canoe", "horse": "horse",
                  "inline_skates": "skating"}

# piste:type on a type=route relation, which is how ski routes are actually
# tagged in the Alps and Scandinavia: route=ski is the minority spelling.
# Downhill pistes are NOT routes anybody navigates, and sled runs and snow
# parks are not either; both are dropped rather than mapped to an activity.
PISTE_ACTIVITY = {"skitour": "ski", "nordic": "nordic", "hike": "winter_hike"}

ACTIVITIES = ("hiking", "cycling", "mtb", "ski", "nordic", "winter_hike",
              "canoe", "horse", "skating")
# The two the earlier steps built, and the ones whose store rows live in
# trips / cycle_routes. Everything else is graph-only until it earns a store.
STORED_ACTIVITIES = ("hiking", "cycling")
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
    # Two keys, not one: a ski route is often tagged piste:type=skitour with
    # no `route` key at all (399 of Austria's 401 ski tours), so a
    # KeyFilter("route") pass alone finds almost none of them. KeyFilter
    # takes one key, so this is two passes and a seen set rather than one.
    seen = set()
    for key in ("route", "piste:type"):
        fp = osmium.FileProcessor(str(pbf_path), osmium.osm.RELATION) \
            .with_filter(osmium.filter.KeyFilter(key))
        for rel in fp:
            if rel.id in seen:
                continue
            tags = rel.tags
            if tags.get("type") not in RELATION_TYPES:
                continue
            seen.add(rel.id)
            _absorb(rel, tags, pools)
    return pools


def _absorb(rel, tags, pools):
    """One relation into every activity pool it belongs to.

    A relation tagged for two activities lands in both: the primary key is
    (activity, osm_id), so "hiking;mtb" is two rows and not a collision, and
    the same ground being both a walk and a ride is a fact about it."""
    acts = {ROUTE_ACTIVITY[v.strip()]
            for v in (tags.get("route") or "").split(";")
            if v.strip() in ROUTE_ACTIVITY}
    # route=piste is a container: what it IS lives in piste:type.
    piste = PISTE_ACTIVITY.get((tags.get("piste:type") or "").strip())
    if piste:
        acts.add(piste)
    if not acts:
        return
    # Every tag, verbatim, and the members exactly as OSM orders them.
    tags_all = {t.k: t.v for t in tags}
    members = [[m.type, m.ref, m.role or ""] for m in rel.members]
    for act in acts:
        pools[act][rel.id] = {"tags": tags_all, "members": members}


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
    """osm relation id -> country of the trips / cycle_routes row.

    Empty for the R8 activities: they live in the graph only, so nothing
    "owns" them from a store and the first extract that scans one keeps it.""" 
    table = TABLE_OF_ACTIVITY.get(activity)
    if not table:
        return {}
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
        for activity in STORED_ACTIVITIES:
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
        for activity in STORED_ACTIVITIES:
            cur.execute(f"""
                SELECT count(*) FROM {TABLE_OF_ACTIVITY[activity]} s
                WHERE s.source = 'osm' AND s.source_ref ~ '^[0-9]+$'
                  AND NOT EXISTS (SELECT 1 FROM route_relations r
                                  WHERE r.activity = %s
                                    AND r.osm_id = CASE WHEN s.source_ref ~ '^[0-9]+$'
                                                        THEN s.source_ref::bigint END)""",
                        (activity,))
            out[activity] = cur.fetchone()[0]
    return out


def gate(totals, store):
    """The order-of-magnitude check, for the activities that HAVE a store to
    check against.

    Node-network relations are excluded from the cycling ratio because the
    harvest dropped them on purpose and they are the one population expected
    to be large.

    The R8 activities have no store at all, so there is nothing to compare a
    count with and a ratio would be a division by a number nobody measured.
    They are reported with their counts and no verdict, which is the honest
    shape: the gate exists to catch a filter that went wrong against a known
    population, and for these the scan IS the first measurement."""
    verdicts = {}
    for activity in ACTIVITIES:
        found = totals[activity]["relations"]
        if activity == "cycling":
            found -= totals[activity]["node_networks"]
        have = store.get(activity)
        if not have:
            verdicts[activity] = {
                "scanned_excluding_node_networks": found, "store": None,
                "ratio": None, "ok": None,
                "note": "no store to compare against: this scan is the first "
                        "measurement of this activity",
            }
            continue
        ratio = found / have
        verdicts[activity] = {
            "scanned_excluding_node_networks": found, "store": have,
            "ratio": round(ratio, 3),
            "ok": GATE_MIN_RATIO <= ratio <= GATE_MAX_RATIO,
        }
    return verdicts


# ---------------------------------------------------------------------------
# R3a: classify parent / stage / variant / standalone
# ---------------------------------------------------------------------------
#
# From route_relations alone. A parent has child relations of the same
# activity. A stage is a relation member of a route relation with a stage
# role ("" and "main" mostly; route_schema.role_kind lists the rest the data
# holds). A variant is a member with a variant role. Everything else is
# standalone, unless its NAME says stage, which is the logged fallback.
#
# The one place this departs from ROUTES.md's wording: the spec said a stage
# is a member of EXACTLY one route relation. The graph says 2,699 hiking and
# 2,433 cycling stage-role children sit under two or more parents, and the
# Via Alpina is the plain case: the Swiss national superroute and the
# international one both list the same twenty stage relations directly.
# "Exactly one" would make every one of them standalone. So a multi-parent
# stage picks ONE parent, deterministically, and keeps every parent in
# parent_refs:
#   1. drop any candidate that is an ancestor of another candidate (a stage
#      listed by both the regional section and the national path belongs
#      to the section);
#   2. prefer a parent whose name is contained in the stage's own name;
#   3. prefer the parent with the fewest stage children (the more specific
#      route);
#   4. lowest relation id.
# top_of is the root of the chosen chain, so "which path" is one column
# away for a stage three levels down.

REPORT_HIER = ROOT / "data" / "reports" / "routes_hierarchy.json"

# Names that say "stage": a stage word next to a number, a leading counter
# ("031 ~ Pot kurirjev"), or "<name> <n>: <from> - <to>". Every match is a
# guess and is written with hierarchy_src = 'name'.
STAGE_WORDS = (r"tappa|etappe|etapp|etape|étape|etapa|stage|sezione|tramo|"
               r"trecho|etap|odcinek|dagsetapp|abschnitt|teilstück|troncon|"
               r"tronçon|sección|seccion|section|leg|deel|dagwandeling|"
               r"tappe|tape")
NAME_STAGE_RE = re.compile(
    rf"\b(?:{STAGE_WORDS})\b\s*[:\-.]?\s*[A-Z]{{0,4}}(\d{{1,3}})\b"
    rf"|\b(\d{{1,3}})\s*[:.\-~]?\s*\b(?:{STAGE_WORDS})\b",
    re.IGNORECASE)
LEADING_COUNTER_RE = re.compile(r"^\s*(\d{1,4})\s*[~:.\-]\s+\S")
# The separator class holds a hyphen and an en dash, written as an escape so
# the file itself stays ASCII (house rule: no dashes of that kind anywhere).
NUMBERED_LEG_RE = re.compile("^\\S.*?\\s(\\d{1,3})\\s*:\\s+\\S.+\\s[-\\u2013]\\s\\S")
# A relation nobody wrapped in a superroute whose name says it is a variant
# of something ("Variante Nord Via Francigena"). Also a guess, also logged.
NAME_VARIANT_RE = re.compile(
    r"\b(variante?|variant[ea]?|alternativ\w*|alternat(?:e|ive)|bypass|"
    r"umleitung|deviazione|déviation|desvío|abstecher|zubringer|"
    r"approach|excursion|shortcut|raccourci|scorciatoia)\b", re.IGNORECASE)


def name_stage(name):
    """(is_stage, number or None) from the name alone."""
    n = name or ""
    m = NAME_STAGE_RE.search(n)
    if m:
        num = m.group(1) or m.group(2)
        return True, (int(num) if num and int(num) > 0 else None)
    m = LEADING_COUNTER_RE.match(n)
    if m:
        return True, int(m.group(1))
    m = NUMBERED_LEG_RE.match(n)
    if m:
        return True, int(m.group(1))
    return False, None


def name_variant(name):
    return bool(NAME_VARIANT_RE.search(name or ""))


def load_graph(conn, activity):
    """Everything classify needs, in memory: about 300k small dicts."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT osm_id, country, in_store, parent_refs, child_refs,
                   tags_all->>'name', tags_all->>'type',
                   (SELECT jsonb_agg(jsonb_build_array(m->>1, m->>2))
                    FROM jsonb_array_elements(members) m WHERE m->>0 = 'r')
            FROM route_relations WHERE activity = %s""", (activity,))
        graph = {}
        for osm_id, country, in_store, parents, children, name, rtype, rmembers in cur:
            graph[osm_id] = {
                "country": country, "in_store": in_store,
                "parents": list(parents or []), "children": list(children or []),
                "name": name or "", "type": rtype,
                "rmembers": [(int(ref), role or "") for ref, role in (rmembers or [])],
            }
    return graph


def classify_graph(graph, log):
    """Pure function of the graph. Returns {osm_id: decision dict}."""
    from route_schema import role_kind
    from popularity import fold

    # Memberships from the parents' member lists, first mention of a child
    # wins its position. Only children that are in the graph count.
    stage_children = defaultdict(list)     # parent -> [child, ...] in order
    memberships = defaultdict(list)        # child -> [(parent, kind, role)]
    unknown_roles = Counter()
    for pid, rec in graph.items():
        seen = set()
        for cid, role in rec["rmembers"]:
            if cid == pid or cid in seen or cid not in graph:
                continue
            seen.add(cid)
            kind = role_kind(role)
            if kind == "stage":
                stage_children[pid].append(cid)
            elif kind is None:
                unknown_roles[role.strip().lower() or "(empty)"] += 1
            memberships[cid].append((pid, kind, role))

    anc_memo = {}

    def ancestors(x):
        """Every relation above x through parent_refs, cycle safe."""
        if x in anc_memo:
            return anc_memo[x]
        out, frontier, depth = set(), [x], 0
        while frontier and depth < 8:
            nxt = []
            for y in frontier:
                for p in graph[y]["parents"] if y in graph else ():
                    if p not in out and p != x:
                        out.add(p)
                        nxt.append(p)
            frontier, depth = nxt, depth + 1
        anc_memo[x] = out
        return out

    decided_by = Counter()

    def choose(child, cands):
        cands = sorted(set(cands))
        if len(cands) == 1:
            return cands[0], "single"
        keep = [p for p in cands
                if not any(p in ancestors(q) for q in cands if q != p)]
        if len(keep) == 1:
            return keep[0], "ancestor"
        keep = keep or cands
        cname = fold(graph[child]["name"])
        named = [p for p in keep
                 if fold(graph[p]["name"]) and fold(graph[p]["name"]) in cname]
        if len(named) == 1:
            return named[0], "name"
        keep = named or keep
        keep.sort(key=lambda p: (len(stage_children.get(p, ())) or 10 ** 9, p))
        if len(keep) > 1 and (len(stage_children.get(keep[0], ())) or 10 ** 9) \
                < (len(stage_children.get(keep[1], ())) or 10 ** 9):
            return keep[0], "children"
        return keep[0], "id"

    out = {}
    for cid, rec in graph.items():
        ms = memberships.get(cid, [])
        stage_ps = [p for p, kind, _ in ms if kind == "stage"]
        var_ps = [p for p, kind, _ in ms if kind == "variant"]
        is_parent = bool(stage_children.get(cid)) or any(
            kind == "variant" for _, kind, _ in memberships_of_children(cid, graph, memberships))
        cls, src, stage_of, why = "standalone", "structure", None, None
        if stage_ps:
            cls = "stage"
            stage_of, why = choose(cid, stage_ps)
        elif var_ps:
            cls = "variant"
            stage_of, why = choose(cid, var_ps)
        if is_parent:
            cls = "parent"
        elif cls == "standalone" and not rec["parents"]:
            named, num = name_stage(rec["name"])
            if named:
                cls, src = "stage", "name"
                out[cid] = {"cls": cls, "src": src, "stage_of": None,
                            "index": num, "count": None, "why": "name"}
                log.append((cid, rec["country"], rec["name"]))
                continue
            if name_variant(rec["name"]):
                out[cid] = {"cls": "variant", "src": "name", "stage_of": None,
                            "index": None, "count": None, "why": "name"}
                log.append((cid, rec["country"], rec["name"]))
                continue
        if why and len(set(stage_ps or var_ps)) > 1:
            decided_by[why] += 1
        index = None
        if stage_of is not None and cls in ("stage", "parent") and stage_ps:
            kids = stage_children.get(stage_of, [])
            index = kids.index(cid) + 1 if cid in kids else None
        count = len(stage_children.get(cid, [])) if is_parent else None
        out[cid] = {"cls": cls, "src": src, "stage_of": stage_of,
                    "index": index, "count": count, "why": why}

    # top_of: walk stage_of upward, cycle safe.
    for cid, d in out.items():
        top, cur, hops = None, d["stage_of"], 0
        seen = {cid}
        while cur is not None and cur not in seen and hops < 8:
            seen.add(cur)
            top = cur
            cur = out.get(cur, {}).get("stage_of")
            hops += 1
        d["top_of"] = top
    return out, decided_by, unknown_roles


def memberships_of_children(pid, graph, memberships):
    """The (parent, kind, role) memberships of pid's children that point
    back at pid: used only to ask 'does pid have a variant child'."""
    for cid in graph[pid]["children"]:
        for p, kind, role in memberships.get(cid, ()):
            if p == pid:
                yield p, kind, role


def write_classification(conn, activity, decisions):
    """One COPY into a temp table, one UPDATE: 300k rows in seconds."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TEMP TABLE cls (osm_id bigint PRIMARY KEY, hierarchy text,
                hierarchy_src text, stage_of bigint, top_of bigint,
                stage_index integer, stage_count integer) ON COMMIT DROP""")
        with cur.copy("COPY cls FROM STDIN") as copy:
            for osm_id, d in decisions.items():
                copy.write_row((osm_id, d["cls"], d["src"], d["stage_of"],
                                d["top_of"], d["index"], d["count"]))
        cur.execute("""
            UPDATE route_relations r
               SET hierarchy = c.hierarchy, hierarchy_src = c.hierarchy_src,
                   stage_of = c.stage_of, top_of = c.top_of,
                   stage_index = c.stage_index, stage_count = c.stage_count
              FROM cls c
             WHERE r.activity = %s AND r.osm_id = c.osm_id
               AND (r.hierarchy IS DISTINCT FROM c.hierarchy
                    OR r.hierarchy_src IS DISTINCT FROM c.hierarchy_src
                    OR r.stage_of IS DISTINCT FROM c.stage_of
                    OR r.top_of IS DISTINCT FROM c.top_of
                    OR r.stage_index IS DISTINCT FROM c.stage_index
                    OR r.stage_count IS DISTINCT FROM c.stage_count)""",
                    (activity,))
        n_graph = cur.rowcount
        # Graph-only activities (ROUTES.md R8) have no store to copy onto:
        # their hierarchy lives in route_relations and is read from there.
        table = TABLE_OF_ACTIVITY.get(activity)
        if not table:
            return n_graph, 0
        # Copy onto the store rows, touching only rows whose values change,
        # because the updated_at trigger fires on any UPDATE.
        cur.execute(f"""
            UPDATE {table} t
               SET hierarchy = r.hierarchy, hierarchy_src = r.hierarchy_src,
                   parent_refs = r.parent_refs, stage_of = r.stage_of,
                   top_of = r.top_of, stage_index = r.stage_index,
                   stage_count = r.stage_count
              FROM route_relations r
             WHERE r.activity = %s
               AND r.osm_id = CASE WHEN t.source = 'osm'
                                    AND t.source_ref ~ '^[0-9]+$'
                                   THEN t.source_ref::bigint END
               AND (t.hierarchy IS DISTINCT FROM r.hierarchy
                    OR t.hierarchy_src IS DISTINCT FROM r.hierarchy_src
                    OR t.parent_refs IS DISTINCT FROM r.parent_refs
                    OR t.stage_of IS DISTINCT FROM r.stage_of
                    OR t.top_of IS DISTINCT FROM r.top_of
                    OR t.stage_index IS DISTINCT FROM r.stage_index
                    OR t.stage_count IS DISTINCT FROM r.stage_count)""",
                    (activity,))
        n_store = cur.rowcount
    return n_graph, n_store


def francigena_block(conn):
    """The acceptance case, as data: the top relation, its chain, and where
    every Italian row with Francigena in its title ends up."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT r.osm_id, r.tags_all->>'name', r.hierarchy, r.stage_count,
                   (SELECT jsonb_agg(jsonb_build_array(c.osm_id, c.tags_all->>'name',
                                                       c.hierarchy, c.stage_count)
                                     ORDER BY c.stage_index)
                    FROM route_relations c
                    WHERE c.activity = 'hiking' AND c.stage_of = r.osm_id
                      AND c.hierarchy IN ('stage', 'parent'))
            FROM route_relations r
            WHERE r.activity = 'hiking' AND r.osm_id IN (11860709, 955907)""")
        chain = {row[0]: {"name": row[1], "hierarchy": row[2],
                          "stage_count": row[3], "stages": row[4]}
                 for row in cur.fetchall()}
        cur.execute("""
            SELECT COALESCE(top.tags_all->>'name', 'no parent (' || t.hierarchy_src || ')')
                   AS path, t.hierarchy, count(*)
            FROM trips t
            LEFT JOIN route_relations top
                   ON top.activity = 'hiking'
                  AND top.osm_id = COALESCE(t.top_of, CASE WHEN t.hierarchy = 'parent'
                                                           THEN t.source_ref::bigint END)
            WHERE t.country = 'IT' AND t.source = 'osm'
              AND t.title ILIKE '%%francigena%%'
            GROUP BY 1, 2 ORDER BY 3 DESC""")
        rows = [{"path": p, "hierarchy": h, "rows": n} for p, h, n in cur.fetchall()]
        cur.execute("""
            SELECT t.id, t.title, t.hierarchy, t.hierarchy_src, t.stage_of, t.top_of,
                   t.stage_index
            FROM trips t WHERE t.id IN (6828, 735, 203027, 197887, 202887, 201656)
            ORDER BY t.id""")
        named = [dict(zip(("id", "title", "hierarchy", "src", "stage_of",
                           "top_of", "stage_index"), r)) for r in cur.fetchall()]
    return {"chain": chain, "italian_rows_by_path": rows, "named_rows": named}


def run_classify(args):
    conn = connect()
    ensure_schema(conn, verbose=args.verbose)
    activities = [a.strip() for a in args.activities.split(",") if a.strip()]
    report = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "activities": {}}
    t_all = time.time()
    for activity in activities:
        t0 = time.time()
        graph = load_graph(conn, activity)
        name_log = []
        decisions, decided_by, unknown_roles = classify_graph(graph, name_log)
        totals = Counter(d["cls"] for d in decisions.values())
        by_name = sum(1 for d in decisions.values()
                      if d["src"] == "name" and d["cls"] == "stage")
        variants_by_name = sum(1 for d in decisions.values()
                               if d["src"] == "name" and d["cls"] == "variant")
        multi = sum(1 for d in decisions.values() if d["why"] in
                    ("ancestor", "name", "children", "id"))
        per_country = defaultdict(Counter)
        for cid, d in decisions.items():
            cc = graph[cid]["country"] or "??"
            per_country[cc][d["cls"]] += 1
            if d["src"] == "name":
                per_country[cc]["stage_by_name"] += 1
        if args.dry_run:
            n_graph = n_store = 0
            conn.rollback()
        else:
            n_graph, n_store = write_classification(conn, activity, decisions)
            conn.commit()
        block = {
            "relations": len(decisions),
            "totals": dict(totals),
            "stage_by_name": by_name,
            "variant_by_name": variants_by_name,
            "multi_parent_decided": multi,
            "decided_by": dict(decided_by),
            "unknown_roles": dict(unknown_roles.most_common(20)),
            "countries": {cc: dict(c) for cc, c in sorted(per_country.items())},
            "rows_updated": {"route_relations": n_graph,
                             TABLE_OF_ACTIVITY.get(activity, "none"): n_store},
            "name_fallback_sample": [
                {"osm_id": i, "country": cc, "name": n} for i, cc, n in name_log[:40]],
            "seconds": round(time.time() - t0, 1),
        }
        report["activities"][activity] = block
        print(f"{activity}: {len(decisions):,} relations -> "
              + ", ".join(f"{k} {totals.get(k, 0):,}" for k in
                          ("parent", "stage", "variant", "standalone"))
              + f"; {by_name:,} stages and {variants_by_name:,} variants by name "
              f"only; {multi:,} multi-parent "
              f"stages decided ({', '.join(f'{k} {v}' for k, v in decided_by.most_common())})"
              + (f"; unknown roles {dict(unknown_roles.most_common(5))}" if unknown_roles else "")
              + f" [{block['seconds']}s]"
              + (" (dry run)" if args.dry_run else
                 f"; wrote {n_graph:,} graph + {n_store:,} store rows"))
    if not args.dry_run and "hiking" in activities:
        report["francigena"] = francigena_block(conn)
        conn.commit()
        f = report["francigena"]
        print("Via Francigena: " + json.dumps(f["italian_rows_by_path"], ensure_ascii=False))
    conn.close()
    if not args.dry_run:
        REPORT_HIER.parent.mkdir(parents=True, exist_ok=True)
        REPORT_HIER.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n",
                               encoding="utf-8")
        print(f"report: {REPORT_HIER.relative_to(ROOT).as_posix()} "
              f"[{time.time() - t_all:.0f}s]")
    return 0


# ---------------------------------------------------------------------------
# R3b: the stitch report. Verify and report; nothing is rewritten.
# ---------------------------------------------------------------------------

REPORT_STITCH = ROOT / "data" / "reports" / "routes_stitch.json"
GAP_BUCKETS = ((0, 0), (1, 1), (2, 4), (5, 9), (10, 49), (50, 10 ** 9))

# A trip's line is continuous when its own assembly had no gap, or when a
# fresh accepted repair (splice.py or repair.py) is a single part. The
# freshness test is repair.py's, and curate.py's continuity gate is the same
# expression: this report and that gate cannot disagree.
GAPLESS_SQL = """
    SELECT t.id, t.title, t.country, t.distance_m,
           (t.gap_info->>'gap_count')::int AS gaps,
           (t.gap_info->>'merged_segments')::int AS parts,
           EXISTS (SELECT 1 FROM trip_repairs r
                   WHERE r.trip_id = t.id AND r.repaired
                     AND ST_NumGeometries(r.geom) = 1
                     AND r.repair_info->>'source_geom_md5'
                         = md5(ST_AsBinary(ST_Force2D(t.geom)))) AS repaired_whole,
           t.status::text, t.source_ref
    FROM trips t
    WHERE t.source = 'osm'
"""


def run_stitch_report(args):
    conn = connect()
    out = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    with conn.cursor() as cur:
        cur.execute(GAPLESS_SQL)
        rows = cur.fetchall()
    dist = Counter()
    most = []
    for _id, title, cc, dist_m, gaps, parts, repaired, status, ref in rows:
        g = gaps if gaps is not None else -1
        for lo, hi in GAP_BUCKETS:
            if lo <= g <= hi:
                dist[f"{lo}" if lo == hi else f"{lo}-{hi if hi < 10**9 else 'plus'}"] += 1
                break
        else:
            dist["unknown"] += 1
    most = sorted(rows, key=lambda r: -(r[4] or 0))[:10]
    out["staged_rows"] = len(rows)
    out["gap_count_distribution"] = dict(dist)
    out["ten_most_gapped"] = [
        {"id": r[0], "name": r[1], "country": r[2], "gaps": r[4],
         "parts": r[5], "distance_km": round((r[3] or 0) / 1000, 1),
         "status": r[7]} for r in most]
    # Every hiking superroute in the graph, with its stitch state.
    by_ref = {r[8]: r for r in rows if r[8]}
    with conn.cursor() as cur:
        cur.execute("""
            SELECT osm_id, country, tags_all->>'name', in_store, stage_count,
                   hierarchy, top_of IS NULL AS is_root
            FROM route_relations
            WHERE activity = 'hiking' AND tags_all->>'type' = 'superroute'
            ORDER BY osm_id""")
        supers = cur.fetchall()
        cur.execute("""
            SELECT count(*), count(*) FILTER (WHERE in_store)
            FROM route_relations
            WHERE activity = 'cycling' AND tags_all->>'type' = 'superroute'""")
        cyc_total, cyc_store = cur.fetchone()
    states = Counter()
    listing = []
    for osm_id, cc, name, in_store, n_stages, hier, is_root in supers:
        row = by_ref.get(str(osm_id))
        if row is None:
            state = "not_staged"
        elif (row[4] == 0 and row[5] == 1) or row[6]:
            state = "gapless"
        else:
            state = "gapped"
        states[state] += 1
        listing.append({"osm_id": osm_id, "country": cc, "name": name,
                        "stages": n_stages, "root": bool(is_root),
                        "state": state,
                        "gaps": row[4] if row else None,
                        "parts": row[5] if row else None,
                        "repaired_whole": bool(row[6]) if row else None,
                        "trip_id": row[0] if row else None,
                        "status": row[7] if row else None})
    out["hiking_superroutes"] = {
        "total": len(supers), "states": dict(states),
        "roots_gapless": sum(1 for x in listing if x["root"] and x["state"] == "gapless"),
        "roots_total": sum(1 for x in listing if x["root"]),
        "list": listing,
    }
    out["cycling_superroutes"] = {
        "total": cyc_total, "with_store_row": cyc_store,
        "note": "harvest_cycling.py drops superroutes before assembly, so none "
                "has a line; their children do",
    }
    conn.close()
    REPORT_STITCH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_STITCH.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n",
                             encoding="utf-8")
    print(f"staged OSM rows: {len(rows):,}; gap_count distribution: {dict(dist)}")
    print("ten most gapped:")
    for x in out["ten_most_gapped"]:
        print(f"  {x['gaps']:4d} gaps, {x['parts']:4d} parts, {x['distance_km']:7.1f} km  "
              f"{x['country']} {x['name'][:60]}  [{x['status']}]")
    s = out["hiking_superroutes"]
    print(f"hiking superroutes: {s['total']:,} in the graph: {dict(states)}; "
          f"roots gapless {s['roots_gapless']} of {s['roots_total']}")
    print(f"cycling superroutes: {cyc_total:,} in the graph, {cyc_store} with a "
          f"store row (the harvest drops them)")
    print(f"report: {REPORT_STITCH.relative_to(ROOT).as_posix()}")
    return 0


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
    # `ok` is None for an activity with no store to check against, which is
    # not a failure: `is False` rather than `not`.
    bad = [a for a in ACTIVITIES if verdict[a]["ok"] is False]
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
                    help="relations-only pass over the extracts on disk (R2)")
    ap.add_argument("--classify", action="store_true",
                    help="parent / stage / variant / standalone from the graph, "
                         "copied onto trips and cycle_routes (R3a)")
    ap.add_argument("--stitch-report", action="store_true",
                    help="gap distribution and superroute stitch state (R3b)")
    ap.add_argument("--countries", default="",
                    help="comma-separated ISO2 codes (default: every country "
                         "with an extract on disk)")
    ap.add_argument("--activities", default=",".join(ACTIVITIES),
                    help=f"comma-separated (default: {','.join(ACTIVITIES)})")
    ap.add_argument("--dry-run", action="store_true",
                    help="scan and count, write nothing")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    if not (args.scan or args.classify or args.stitch_report):
        ap.print_help()
        print("\nnothing to do: pass --scan, --classify and/or --stitch-report")
        return 2
    rc = 0
    if args.scan:
        rc = run_scan(args) or rc
    if args.classify:
        rc = run_classify(args) or rc
    if args.stitch_report:
        rc = run_stitch_report(args) or rc
    return rc


if __name__ == "__main__":
    sys.exit(main())
