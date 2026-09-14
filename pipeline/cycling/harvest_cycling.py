"""Cycle route ingestion: Geofabrik extracts -> trailslab cycle_routes.

The sibling of pipeline/trails/ingest_osm_routes.py, and deliberately the same
shape: three memory-safe passes over the per-country .osm.pbf that the trails
layer already downloaded, relation members stitched into ordered geometry,
every break recorded in gap_info for the continuity gate. Nothing here
re-solves a problem trails solved.

One thing IS new, and it is the reason this file is not just the hiking
ingest with a different tag filter.

    A hike is a line. A cycle route is a line MADE OF SURFACES.

Everything the layer promises downstream (percent paved, percent traffic
free, the safety score, the bike-type facet, and the stage planner's
"a touring tour may not contain grade-4 track") is a length-weighted
property of the member ways, not of the relation. And the stage planner
needs it POSITIONED: the worst surface on stage three is a different
question from the worst surface on the route. So this pass keeps, for every
metre of assembled line, which way it came from and what that way was tagged,
and stores it as way_spans:

    {"tagsets": [{"highway": "cycleway", "surface": "asphalt", ...}, ...],
     "spans":   [[start_m, end_m, tagset_index], ...],
     "n_ways":  412, "untagged_m": 120}

A tagset dictionary plus integer references, because a 900 km route crosses
four thousand ways and perhaps thirty distinct tag combinations. enrich
reads the spans; stage_planner slices them.

Three kinds of relation come out of the same scan:

  routes          type=route, route=bicycle. The catalogue. One row per
                  relation in cycle_routes.
  node-network    the same tags plus network:type=node_network. These are
  connections     not routes anybody rides end to end, they are the EDGES of
                  the numbered-junction graph in NL, BE and parts of DE/FR.
                  They go to cycle_node_edges, never to the catalogue, or
                  the Netherlands would publish forty thousand two-kilometre
                  "routes".
  superroutes     type=superroute, usually EuroVelo. NOT assembled: a
                  continental relation clipped by a country extract is a
                  broken line, and the ECF GPX is the better geometry
                  anyway. What is kept is MEMBERSHIP: every child relation
                  gets the family ref stamped on it, so EV6's German section
                  knows it is EV6.

Junction nodes (rcn_ref + network:type=node_network) are scanned only for
the countries that actually have a node network, because it costs a full
node pass. NL and BE by default, per the brief.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/cycling/harvest_cycling.py --countries great-britain
    python pipeline/cycling/harvest_cycling.py --dry-run --limit 200
    python pipeline/cycling/harvest_cycling.py --nodes netherlands,belgium
    python pipeline/cycling/harvest_cycling.py --counts       # Overpass census
"""

import argparse
import json
import sys
import time
from array import array
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import osmium
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import cycle_sources as S  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

# Every lab connection in this layer goes through the patient wrapper:
# the machine is shared and a ten second connect timeout loses runs.
connect = S.lab_connect

DDL = ROOT / "tools" / "trailslab" / "initdb" / "07_cycling.sql"

EARTH_RADIUS_M = 6371008.8

# Only route=bicycle. route=mtb is a different product (single track, a
# different bike, a different risk profile) and mixing the two would make the
# surface facet meaningless. Out of scope, on purpose.
ROUTE_VALUE = "bicycle"
NODE_NETWORK = "node_network"

# Roles that mark a spur or a variant rather than the line itself. Same set
# the hiking ingest excludes, plus the cycling-specific ones.
VARIANT_ROLES = {"alternative", "alternate", "variant", "excursion",
                 "approach", "connection", "link", "shortcut", "detour",
                 "spur", "backward_alternative"}

# Relation tags worth keeping. distance/ascent are the mapper's own claim and
# are kept to be checked against ours, never to be published in their place.
KEEP_TAGS = ("type", "route", "name", "name:en", "ref", "network",
             "cycle_network", "operator", "distance", "ascent", "descent",
             "roundtrip", "from", "to", "via", "symbol", "colour",
             "wikipedia", "wikidata", "website", "description",
             "network:type", "state", "surface")

# Way tags that decide what the riding is actually like. Everything the
# surface, safety and bike-type work downstream needs, and nothing else:
# way_spans is stored per route and a wide tag set would multiply it.
WAY_TAGS = ("highway", "surface", "smoothness", "tracktype", "maxspeed",
            "cycleway", "bicycle", "segregated", "access", "oneway",
            "mtb:scale")

LICENSE = S.LICENSE_OSM
ATTRIBUTION = S.ATTRIBUTION_OSM

# Countries with a numbered-junction network worth building a graph from.
# NL and BE are complete; DE and FR have one in places. Everywhere else this
# would be a full node pass for nothing.
NODE_NETWORK_COUNTRIES = ("netherlands", "belgium")

# Acceptance probes, the same idea as the hiking ingest's: if the famous
# routes are not in the table, the filter is wrong and no count will say so.
SPOT_CHECKS = {
    "GB": ["%caledonia way%", "NCN 78", "%hebridean way%", "NCN 1"],
    "NL": ["LF%"],
    "DE": ["%elberadweg%", "%bodensee%"],
    "FR": ["%loire a velo%", "%velodyssee%"],
    "CH": ["%rhone route%", "%mittelland%"],
    "AT": ["%donauradweg%"],
}


def log(msg):
    print(f"[cycling] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Pass 1: relations
# ---------------------------------------------------------------------------

def scan_relations(pbf_path):
    """Every bicycle route and superroute relation in the extract.

    The pool keeps all of them regardless of the publish filter, because a
    superroute resolves its children out of this same pool and a child that
    the filter would drop still has to be findable.
    """
    pool = {}
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.RELATION) \
        .with_filter(osmium.filter.KeyFilter("route"))
    for rel in fp:
        tags = rel.tags
        rtype = tags.get("type")
        if rtype not in ("route", "superroute"):
            continue
        if tags.get("route") != ROUTE_VALUE:
            continue
        pool[rel.id] = {
            "tags": {k: tags[k] for k in KEEP_TAGS if k in tags},
            "members": [(m.type, m.ref, (m.role or "").lower())
                        for m in rel.members],
        }
    return pool


def is_node_network(tags):
    """A connection between two numbered junctions, not a route to ride."""
    return (tags.get("network:type") == NODE_NETWORK
            or tags.get("network") == "rcn"
            and tags.get("network:type") == NODE_NETWORK)


def is_superroute(tags):
    return tags.get("type") == "superroute"


def publishable(tags):
    """The first-pass filter: a signed network, or at least a name.

    A relation with neither is a mapper's working set. The hiking ingest uses
    the same rule and it is the reason the catalogue is routes rather than
    fragments.
    """
    if is_node_network(tags) or is_superroute(tags):
        return False
    network = (tags.get("network") or "").replace(";", ",")
    tokens = {t.strip().lower() for t in network.split(",")}
    return bool(tokens & {"icn", "ncn", "rcn", "lcn"}) or bool(tags.get("name"))


def family_refs(pool):
    """child relation id -> the superroute ref that contains it.

    This is how EuroVelo survives without assembling a continental relation
    out of a country extract. The ECF publishes one route=bicycle relation
    per country section grouped under a type=superroute per EV number; the
    superroute has no ways of its own, so the only thing worth taking from it
    is which sections belong to it.
    """
    out = {}
    for rid, info in pool.items():
        tags = info["tags"]
        if not is_superroute(tags):
            continue
        ref = tags.get("ref") or tags.get("name")
        if not ref:
            continue
        family = {"ref": ref, "network": tags.get("cycle_network")
                  or tags.get("network"), "rel": rid,
                  "name": tags.get("name")}
        for mtype, mref, _role in info["members"]:
            if mtype == "r":
                out.setdefault(mref, family)
    return out


def expand_ways(rid, pool, stats, seen, depth=0):
    """Ordered member way refs, resolving child relations depth first."""
    if rid in seen:
        stats["relation_cycles"] += 1
        return []
    if depth > 4:
        stats["depth_capped"] += 1
        return []
    seen.add(rid)
    out = []
    for mtype, ref, role in pool[rid]["members"]:
        if role in VARIANT_ROLES:
            stats["variant_ways" if mtype == "w" else "variant_relations"] += 1
            continue
        if mtype == "w":
            out.append(ref)
        elif mtype == "r":
            if ref in pool:
                out.extend(expand_ways(ref, pool, stats, seen, depth + 1))
            else:
                stats["missing_relations"] += 1
    return out


# ---------------------------------------------------------------------------
# Passes 2 and 3: member ways (with their tags) and node locations
# ---------------------------------------------------------------------------

def load_ways(pbf_path, way_ids):
    """Member way node refs AND the tags that decide what riding it is like.

    The hiking ingest only needs the node refs. Here the tags are half the
    point, so they come back in the same pass rather than in a fourth one.
    """
    ids = np.fromiter(way_ids, dtype=np.int64, count=len(way_ids))
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.WAY) \
        .with_filter(osmium.filter.IdFilter(ids))
    way_nodes, way_tags = {}, {}
    for way in fp:
        way_nodes[way.id] = array("q", (n.ref for n in way.nodes))
        tags = way.tags
        kept = {k: tags[k] for k in WAY_TAGS if k in tags}
        if kept:
            way_tags[way.id] = kept
    return way_nodes, way_tags


class NodeLocations:
    """Sorted id -> nano-degree coordinate lookup on flat numpy arrays."""

    def __init__(self, ids, xs, ys):
        order = np.argsort(ids, kind="stable")
        self.ids, self.xs, self.ys = ids[order], xs[order], ys[order]

    def coords_for(self, refs):
        refs = np.asarray(refs, dtype=np.int64)
        if not len(self.ids):
            zero = np.zeros(len(refs))
            return np.zeros(len(refs), dtype=bool), zero, zero
        pos = np.minimum(np.searchsorted(self.ids, refs), len(self.ids) - 1)
        ok = self.ids[pos] == refs
        return ok, self.xs[pos], self.ys[pos]


def load_locations(pbf_path, node_ids):
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.NODE) \
        .with_filter(osmium.filter.IdFilter(node_ids))
    ids, xs, ys = array("q"), array("i"), array("i")
    for node in fp:
        loc = node.location
        if not loc.valid():
            continue
        ids.append(node.id)
        xs.append(loc.x)
        ys.append(loc.y)
    return NodeLocations(np.frombuffer(ids, dtype=np.int64).copy(),
                         np.frombuffer(xs, dtype=np.int32).copy(),
                         np.frombuffer(ys, dtype=np.int32).copy())


# ---------------------------------------------------------------------------
# Geometry assembly, carrying way provenance
# ---------------------------------------------------------------------------
#
# A segment here is (node_ids, edge_ways): node_ids[i] to node_ids[i+1] is one
# edge, and edge_ways[i] is the way it came from. Every flip and every join
# below has to keep the two in step, which is the only real difference from
# the hiking assembler; get it wrong and the surface of a route describes
# somebody else's road.

def assemble_ordered(way_refs, way_nodes, stats):
    """Stitch member ways in relation order into (nodes, edge_ways) segments."""
    segments = []
    cur_nodes, cur_ways, cur_single = None, None, False

    def flip():
        cur_nodes.reverse()
        cur_ways.reverse()

    for wref in way_refs:
        nds = way_nodes.get(wref)
        if nds is None:
            stats["missing_ways"] += 1
            continue
        if len(nds) < 2:
            stats["degenerate_ways"] += 1
            continue
        way = list(nds)
        ways = [wref] * (len(way) - 1)
        if cur_nodes is None:
            cur_nodes, cur_ways, cur_single = way, ways, True
            continue
        if way[0] == cur_nodes[-1]:
            cur_nodes.extend(way[1:])
            cur_ways.extend(ways)
        elif way[-1] == cur_nodes[-1]:
            cur_nodes.extend(way[-2::-1])
            cur_ways.extend(ways)
        elif cur_single and way[0] == cur_nodes[0]:
            flip()
            cur_nodes.extend(way[1:])
            cur_ways.extend(ways)
        elif cur_single and way[-1] == cur_nodes[0]:
            flip()
            cur_nodes.extend(way[-2::-1])
            cur_ways.extend(ways)
        else:
            segments.append((cur_nodes, cur_ways))
            cur_nodes, cur_ways, cur_single = way, ways, True
            continue
        cur_single = False
    if cur_nodes:
        segments.append((cur_nodes, cur_ways))
    return segments


# Above this many segments the stitch is not worth its own cost. Each pass
# rebuilds the endpoint index over every segment and a pathological relation
# needs a pass per join, so the work grows with the square of the segment
# count. Germany's regional networks include relations with thousands of
# unordered members, and a route in four thousand pieces is not one the merge
# was going to rescue: it is a mapper's working set, and it fails the
# continuity gate either way. Skipping the merge there costs nothing real and
# keeps a country harvest from stalling on a handful of rows.
MAX_STITCH_SEGMENTS = 1500


def stitch_segments(segments):
    """Merge segments where exactly two segment ends meet, ST_LineMerge style.

    Junctions of three or more ends never merge, so a drop in the segment
    count cleanly flags a relation whose members were merely stored out of
    order rather than one with a real gap.
    """
    if len(segments) > MAX_STITCH_SEGMENTS:
        return list(segments)
    segs = list(segments)
    while True:
        ends = defaultdict(list)
        for i, seg in enumerate(segs):
            if seg is not None:
                ends[seg[0][0]].append((i, 0))
                ends[seg[0][-1]].append((i, 1))
        joined = False
        for node, touches in ends.items():
            if len(touches) != 2:
                continue
            (i, end_a), (j, end_b) = touches
            if i == j:
                continue
            a, b = segs[i], segs[j]
            # An earlier join in this pass may have consumed or re-ended one
            # of the two; stale entries simply retry on the next pass.
            if a is None or b is None:
                continue
            an, aw = a
            bn, bw = b
            if (an[0] if end_a == 0 else an[-1]) != node:
                continue
            if (bn[0] if end_b == 0 else bn[-1]) != node:
                continue
            if end_a == 1 and end_b == 0:
                merged = (an + bn[1:], aw + bw)
            elif end_a == 1 and end_b == 1:
                merged = (an + bn[-2::-1], aw + bw[::-1])
            elif end_a == 0 and end_b == 0:
                merged = (an[::-1] + bn[1:], aw[::-1] + bw)
            else:
                merged = (bn + an[1:], bw + aw)
            segs[i], segs[j] = merged, None
            joined = True
        segs = [s for s in segs if s is not None]
        if not joined:
            return segs


def part_geometry(part, locator, stats):
    """One segment -> (wkt coords, length m, per-edge lengths, per-edge ways).

    A node whose location the extract does not hold is dropped, and the edges
    either side of it collapse into one. The surviving edge inherits the way
    of the first original edge it covers, which is the honest answer when the
    two are almost always the same way anyway.
    """
    nodes, edge_ways = part
    ok, xs, ys = locator.coords_for(nodes)
    missing = int(len(nodes) - ok.sum())
    if missing:
        stats["missing_node_locations"] += missing
        keep = np.flatnonzero(ok)
        xs, ys = xs[keep], ys[keep]
        edge_ways = [edge_ways[int(keep[i])]
                     for i in range(len(keep) - 1)] if len(keep) > 1 else []
    if len(xs) < 2:
        stats["dropped_parts"] += 1
        return None, 0.0, None, None
    lon, lat = xs / 1e7, ys / 1e7
    lam, phi = np.radians(lon), np.radians(lat)
    h = (np.sin(np.diff(phi) / 2) ** 2
         + np.cos(phi[:-1]) * np.cos(phi[1:]) * np.sin(np.diff(lam) / 2) ** 2)
    edge_m = 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(h))
    coords = ",".join(f"{x:.7f} {y:.7f}" for x, y in zip(lon, lat))
    return ("(" + coords + ")", float(edge_m.sum()), edge_m,
            edge_ways[:len(edge_m)])


def build_spans(edge_lengths, edge_ways, way_tags, offset):
    """Per-way runs of the line, as (start_m, end_m, tagset) triples.

    Consecutive edges of the same way collapse into one span, which is what
    keeps way_spans at a few dozen entries on a route with four thousand
    member edges. Offset carries the cumulative distance across parts, so a
    span's start is measured along the whole route and the stage planner can
    slice it without re-walking the geometry.
    """
    spans, cursor = [], offset
    if edge_lengths is None or not len(edge_lengths):
        return spans, cursor
    run_way, run_start = edge_ways[0] if edge_ways else None, cursor
    for i, seg_m in enumerate(edge_lengths):
        this_way = edge_ways[i] if i < len(edge_ways) else None
        if this_way != run_way:
            if cursor > run_start:
                spans.append((run_start, cursor, way_tags.get(run_way)))
            run_way, run_start = this_way, cursor
        cursor += float(seg_m)
    if cursor > run_start:
        spans.append((run_start, cursor, way_tags.get(run_way)))
    return spans, cursor


def pack_spans(spans):
    """Spans into the wire-and-jsonb shape: a tagset dictionary plus refs."""
    tagsets, index, packed, untagged = [], {}, [], 0.0
    for start, end, tags in spans:
        if not tags:
            untagged += end - start
            key = None
        else:
            key = json.dumps(tags, sort_keys=True)
        if key is None:
            ref = -1
        else:
            if key not in index:
                index[key] = len(tagsets)
                tagsets.append(tags)
            ref = index[key]
        # Merge with the previous span when the tagset repeats across a
        # junction: two ways tagged identically are one stretch of riding.
        if packed and packed[-1][2] == ref and abs(packed[-1][1] - start) < 1.0:
            packed[-1][1] = round(end, 1)
        else:
            packed.append([round(start, 1), round(end, 1), ref])
    return {"tagsets": tagsets, "spans": packed,
            "untagged_m": int(round(untagged))}


def build_record(rid, info, way_refs, rstats, way_nodes, way_tags, locator,
                 family):
    """Assemble one relation into an insertable record, or None if empty."""
    ordered = assemble_ordered(way_refs, way_nodes, rstats)
    merged = stitch_segments(ordered) if len(ordered) > 1 else ordered

    parts, all_spans, length_m = [], [], 0.0
    for seg in merged:
        wkt_part, part_len, edge_m, edge_ways = part_geometry(
            seg, locator, rstats)
        if not wkt_part:
            continue
        spans, length_m = build_spans(edge_m, edge_ways, way_tags, length_m)
        all_spans.extend(spans)
        parts.append(wkt_part)
    if not parts:
        return None

    tags = info["tags"]
    gap_info = {
        "member_ways": len(way_refs),
        "missing_ways": rstats["missing_ways"],
        "duplicate_ways": len(way_refs) - len(set(way_refs)),
        "ordered_segments": len(ordered),
        "merged_segments": len(merged),
        "gap_count": len(parts) - 1,
        "unordered_members": len(ordered) > len(merged),
    }
    for extra in ("variant_ways", "variant_relations", "missing_relations",
                  "degenerate_ways", "missing_node_locations", "dropped_parts",
                  "relation_cycles", "depth_capped"):
        if rstats[extra]:
            gap_info[extra] = rstats[extra]
    if rstats["missing_ways"]:
        gap_info["clipped"] = True     # the extract border is the usual cause

    raw = dict(tags)
    if family:
        raw["carta:family_ref"] = family["ref"]
        if family.get("network"):
            raw["carta:family_network"] = family["network"]

    packed = pack_spans(all_spans)
    packed["n_ways"] = len(set(way_refs))
    return {
        "source_ref": str(rid),
        "name": tags.get("name"),
        "ref": tags.get("ref"),
        "title": tags.get("name") or tags.get("ref") or f"OSM cycle route {rid}",
        "wkt": "MULTILINESTRING(" + ",".join(parts) + ")",
        "length_m": int(round(length_m)),
        "network": (tags.get("network") or "").split(";")[0].strip() or None,
        "cycle_network": (family or {}).get("network") or tags.get("cycle_network"),
        "operator": tags.get("operator"),
        "roundtrip": _yesno(tags.get("roundtrip")),
        "raw_tags": raw,
        "gap_info": gap_info,
        "way_spans": packed,
    }


def _yesno(value):
    if value is None:
        return None
    return str(value).strip().lower() in ("yes", "true", "1")


# ---------------------------------------------------------------------------
# The node network: junctions and the edges between them
# ---------------------------------------------------------------------------

def scan_junctions(pbf_path):
    """Numbered junction nodes: rcn_ref plus network:type=node_network.

    A full node pass, which is why this only runs for the countries that
    actually have a node network. The KeyFilter runs in C++, so the cost is
    the read, not the Python.
    """
    out = {}
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.NODE) \
        .with_filter(osmium.filter.KeyFilter("rcn_ref"))
    for node in fp:
        loc = node.location
        if not loc.valid():
            continue
        tags = node.tags
        out[node.id] = {
            "ref": tags.get("rcn_ref"),
            "network": tags.get("network:name") or tags.get("name"),
            "lat": loc.lat, "lon": loc.lon,
        }
    return out


NODE_UPSERT = """
    INSERT INTO cycle_nodes (country, rcn_ref, network_name, osm_node, geom)
    VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
    ON CONFLICT (country, osm_node) DO UPDATE SET
        rcn_ref = EXCLUDED.rcn_ref,
        network_name = EXCLUDED.network_name,
        geom = EXCLUDED.geom
    RETURNING id
"""

EDGE_UPSERT = """
    INSERT INTO cycle_node_edges
        (country, ref, from_node, to_node, geom, length_m, source_ref)
    VALUES (%s, %s, %s, %s,
            ST_GeomFromText(%s, 4326), %s, %s)
    ON CONFLICT (source_ref) DO UPDATE SET
        country = EXCLUDED.country, ref = EXCLUDED.ref,
        from_node = EXCLUDED.from_node, to_node = EXCLUDED.to_node,
        geom = EXCLUDED.geom, length_m = EXCLUDED.length_m
"""


def store_node_network(conn, country, junctions, edges, counts):
    """Junctions and connection relations into the routable graph.

    Duplicate rcn_ref across provinces is real and expected (numbering
    resets), which is why the node key is the OSM node id and the ref is
    just a label. An edge links to the junctions nearest its own two ends
    rather than to "the node numbered 34", for the same reason.
    """
    with conn.cursor() as cur:
        node_ids = {}
        for osm_id, j in junctions.items():
            cur.execute(NODE_UPSERT, (country, j["ref"], j["network"], osm_id,
                                      j["lon"], j["lat"]))
            node_ids[osm_id] = cur.fetchone()[0]
        counts["junctions"] += len(node_ids)
        for edge in edges:
            ends = edge["ends"]
            from_id = node_ids.get(ends[0])
            to_id = node_ids.get(ends[1])
            cur.execute(EDGE_UPSERT, (
                country, edge["ref"], from_id, to_id, edge["wkt"],
                edge["length_m"], f"osm:{edge['source_ref']}"))
            counts["node_edges"] += 1
    conn.commit()


def node_edge_record(rid, info, way_refs, rstats, way_nodes, locator):
    """One connection relation as a single LineString between two junctions."""
    ordered = assemble_ordered(way_refs, way_nodes, rstats)
    merged = stitch_segments(ordered) if len(ordered) > 1 else ordered
    if len(merged) != 1:
        return None                     # a broken connection is not an edge
    wkt_part, length_m, _edge_m, _ways = part_geometry(merged[0], locator, rstats)
    if not wkt_part:
        return None
    nodes = merged[0][0]
    return {
        "source_ref": str(rid),
        "ref": info["tags"].get("ref"),
        "wkt": "LINESTRING" + wkt_part,
        "length_m": int(round(length_m)),
        "ends": (nodes[0], nodes[-1]),
    }


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

INSERT_SQL = """
    INSERT INTO cycle_routes
        (country, name, ref, network, cycle_network, operator, geom,
         distance_m, roundtrip, source, source_ref, license, attribution_text,
         raw_tags, gap_info, way_spans)
    VALUES (%(country)s, %(name)s, %(ref)s, %(network)s, %(cycle_network)s,
            %(operator)s, ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)),
            %(length_m)s, %(roundtrip)s, 'osm', %(source_ref)s,
            %(license)s, %(attribution)s, %(raw_tags)s, %(gap_info)s,
            %(way_spans)s)
    ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL
    DO UPDATE SET
        country = EXCLUDED.country, name = EXCLUDED.name, ref = EXCLUDED.ref,
        network = EXCLUDED.network, cycle_network = EXCLUDED.cycle_network,
        operator = EXCLUDED.operator, geom = EXCLUDED.geom,
        distance_m = EXCLUDED.distance_m, roundtrip = EXCLUDED.roundtrip,
        license = EXCLUDED.license,
        attribution_text = EXCLUDED.attribution_text,
        raw_tags = EXCLUDED.raw_tags, gap_info = EXCLUDED.gap_info,
        way_spans = EXCLUDED.way_spans
    RETURNING id
"""

UPDATE_SQL = """
    UPDATE cycle_routes
    SET country = %(country)s, name = %(name)s, ref = %(ref)s,
        network = %(network)s, cycle_network = %(cycle_network)s,
        operator = %(operator)s,
        geom = ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)),
        distance_m = %(length_m)s, roundtrip = %(roundtrip)s,
        license = %(license)s, attribution_text = %(attribution)s,
        raw_tags = %(raw_tags)s, gap_info = %(gap_info)s,
        way_spans = %(way_spans)s
    WHERE id = %(id)s
"""


def load_db_index(conn):
    """source_ref -> [id, country, length]. Cross-border relations appear in
    every extract that clips them and the longest assembly has to win."""
    with conn.cursor() as cur:
        cur.execute("""SELECT source_ref, id, country,
                              COALESCE(ST_Length(geom::geography), 0)
                       FROM cycle_routes WHERE source = 'osm'""")
        return {ref: [rid, cc, float(length)]
                for ref, rid, cc, length in cur.fetchall()}


def upsert(cur, index, country, rec, counts):
    hit = index.get(rec["source_ref"])
    if hit and hit[1] != country and hit[2] >= rec["length_m"]:
        counts["skipped_cross_border"] += 1
        return
    params = {**rec, "country": country, "license": LICENSE,
              "attribution": ATTRIBUTION, "raw_tags": Jsonb(rec["raw_tags"]),
              "gap_info": Jsonb(rec["gap_info"]),
              "way_spans": Jsonb(rec["way_spans"])}
    if hit:
        params["id"] = hit[0]
        cur.execute(UPDATE_SQL, params)
        counts["updated"] += 1
        index[rec["source_ref"]] = [hit[0], country, float(rec["length_m"])]
    else:
        cur.execute(INSERT_SQL, params)
        counts["inserted"] += 1
        index[rec["source_ref"]] = [cur.fetchone()[0], country,
                                    float(rec["length_m"])]


def apply_ddl(conn):
    """initdb scripts only run on an empty volume, so apply ours at runtime."""
    with conn.cursor() as cur:
        cur.execute(DDL.read_text(encoding="utf-8"))
    conn.commit()


def spot_check(conn, country):
    with conn.cursor() as cur:
        for pattern in SPOT_CHECKS.get(country, []):
            cur.execute(
                """SELECT name, ref, distance_m FROM cycle_routes
                   WHERE source = 'osm' AND country = %s
                     AND (name ILIKE %s OR ref ILIKE %s)
                   ORDER BY distance_m DESC NULLS LAST LIMIT 3""",
                (country, pattern, pattern))
            rows = cur.fetchall()
            sample = "; ".join(
                f"{name or ref} ({(dist or 0) / 1000:.0f} km)"
                for name, ref, dist in rows)
            log(f"  spot check {pattern!r}: {len(rows)} shown"
                + (f", {sample}" if sample else " (NOTHING FOUND)"))


# ---------------------------------------------------------------------------
# Per-country drive
# ---------------------------------------------------------------------------

def harvest_country(slug, country, args, conn, index):
    counts = Counter()
    pbf = S.extract_for(slug, args.refresh)

    t0 = time.time()
    pool = scan_relations(pbf)
    families = family_refs(pool)
    routes = [rid for rid in sorted(pool) if publishable(pool[rid]["tags"])]
    connections = [rid for rid in sorted(pool)
                   if is_node_network(pool[rid]["tags"])]
    want_nodes = args.nodes and slug in args.nodes
    if not want_nodes:
        connections = []
    if args.limit:
        routes = routes[:args.limit]
    counts["pool"] = len(pool)
    counts["selected"] = len(routes)
    counts["connections"] = len(connections)
    log(f"[{slug}] relations: {len(pool)} bicycle routes, {len(routes)} pass "
        f"the filter, {len(connections)} node-network connections, "
        f"{len(families)} family memberships ({time.time() - t0:.0f}s)")

    expansions, needed_ways = {}, set()
    for rid in routes + connections:
        rstats = Counter()
        way_refs = expand_ways(rid, pool, rstats, seen=set())
        expansions[rid] = (way_refs, rstats)
        needed_ways.update(way_refs)

    t0 = time.time()
    way_nodes, way_tags = load_ways(pbf, needed_ways)
    counts["ways_needed"], counts["ways_found"] = len(needed_ways), len(way_nodes)
    log(f"[{slug}] ways: {len(way_nodes)}/{len(needed_ways)} loaded, "
        f"{len(way_tags)} carry riding tags ({time.time() - t0:.0f}s)")

    t0 = time.time()
    if way_nodes:
        node_ids = np.unique(np.concatenate(
            [np.frombuffer(a, dtype=np.int64) for a in way_nodes.values()]))
    else:
        node_ids = np.empty(0, dtype=np.int64)
    locator = load_locations(pbf, node_ids)
    counts["nodes"] = len(locator.ids)
    log(f"[{slug}] nodes: {len(locator.ids)}/{len(node_ids)} locations "
        f"({time.time() - t0:.0f}s)")

    t0 = time.time()
    records = []
    for rid in routes:
        way_refs, rstats = expansions[rid]
        rec = build_record(rid, pool[rid], way_refs, rstats, way_nodes,
                           way_tags, locator, families.get(rid))
        counts["ways_missing"] += rstats["missing_ways"]
        if rec is None:
            counts["no_geometry"] += 1
            continue
        gi = rec["gap_info"]
        counts["with_gaps"] += 1 if gi["gap_count"] else 0
        counts["unordered"] += 1 if gi["unordered_members"] else 0
        counts["clipped"] += 1 if gi.get("clipped") else 0
        counts["in_family"] += 1 if families.get(rid) else 0
        records.append(rec)

    edges = []
    for rid in connections:
        way_refs, rstats = expansions[rid]
        edge = node_edge_record(rid, pool[rid], way_refs, rstats, way_nodes,
                                locator)
        if edge:
            edges.append(edge)
        else:
            counts["broken_connections"] += 1

    if args.dry_run:
        counts["assembled"] = len(records)
        longest = sorted(records, key=lambda r: -r["length_m"])[:3]
        log(f"[{slug}] dry run: {len(records)} routes assembled, "
            f"{len(edges)} node edges ({time.time() - t0:.0f}s), longest: "
            + "; ".join(f"{r['title']} ({r['length_m'] / 1000:.0f} km)"
                        for r in longest))
        return counts

    with conn.cursor() as cur:
        for rec in records:
            upsert(cur, index, country, rec, counts)
    conn.commit()
    log(f"[{slug}] db: {counts['inserted']} inserted, {counts['updated']} "
        f"updated, {counts['skipped_cross_border']} cross-border skips, "
        f"{counts['no_geometry']} without geometry ({time.time() - t0:.0f}s)")

    if want_nodes:
        junctions = scan_junctions(pbf)
        used = {n for e in edges for n in e["ends"]}
        junctions = {k: v for k, v in junctions.items() if k in used}
        store_node_network(conn, country, junctions, edges, counts)
        log(f"[{slug}] node network: {counts['junctions']} junctions, "
            f"{counts['node_edges']} edges, "
            f"{counts['broken_connections']} connections dropped as broken")

    spot_check(conn, country)
    conn.commit()
    log(f"[{slug}] quality: {counts['with_gaps']} with gaps, "
        f"{counts['unordered']} unordered, {counts['clipped']} clipped at the "
        f"border, {counts['ways_missing']} member ways missing, "
        f"{counts['in_family']} in a EuroVelo-style family")
    return counts


# ---------------------------------------------------------------------------
# Cross-check: is the OSM line the same line the official source draws?
# ---------------------------------------------------------------------------
#
# Two ground truths, and the same measurement for both: what share of the OSM
# route lies within AGREE_TOL_M of the official geometry. That number ships
# as a trust signal per route, exactly as the trails layer ships its portal
# agreement, and it is deliberately NOT a gate. A low percentage can mean the
# OSM relation is wrong, or that the official dataset is stale, or that the
# route was rebuilt last year; what it always means is that a reader should
# know the two disagree.
#
# EuroVelo is the special case. The ECF publishes only DEVELOPED sections, so
# a stretch that exists in OSM and not in the GPX is usually a stretch that
# is signed on paper and not on the ground. The agreement row records the
# direction of the difference, which is more useful than the number alone.

import xml.etree.ElementTree as ET  # noqa: E402

GPX_NS = {"g": "http://www.topografix.com/GPX/1/1",
          "g0": "http://www.topografix.com/GPX/1/0"}

AGREE_TOL_M = 40.0          # a lane's width plus survey error
AGREE_SEARCH_M = 250.0      # how far to look for official geometry at all

PORTAL_INSERT = """
    INSERT INTO cycle_portal_routes (country, name, ref, geom, source, license)
    VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326), %s, %s)
"""

AGREE_SQL = """
    WITH r AS MATERIALIZED (
        SELECT ST_Transform(ST_Simplify(
                   ST_Force2D(coalesce(cr.geom, c.geom)), 0.0002), 3035) AS g
        FROM cycle_routes c
        LEFT JOIN cycle_repairs cr
               ON cr.route_id = c.id AND cr.repaired
              AND cr.repair_info->>'source_geom_md5'
                  = md5(ST_AsBinary(ST_Force2D(c.geom)))
        WHERE c.id = %(id)s
    ), p AS (
        -- geom_3035 is precomputed and indexed. Transforming every candidate
        -- inside the query cannot use an index and made this pass unable to
        -- reach its first progress line over 37,206 Sustrans geometries.
        SELECT ST_Union(ST_Buffer(pr.geom_3035, %(tol)s)) AS b,
               count(*) AS n
        FROM cycle_portal_routes pr, r
        WHERE pr.source = %(source)s
          AND pr.geom_3035 IS NOT NULL
          AND (%(ref)s::text IS NULL OR pr.ref = %(ref)s)
          AND pr.geom_3035 && ST_Expand(r.g, %(search)s)
          AND ST_DWithin(pr.geom_3035, r.g, %(search)s)
    )
    SELECT CASE WHEN ST_Length(r.g) > 0 AND p.b IS NOT NULL
                THEN ST_Length(ST_Intersection(r.g, p.b)) / ST_Length(r.g)
           END AS share,
           p.n
    FROM r, p
"""


def gpx_tracks(path):
    """Every <trkseg> in a GPX as (name, WKT LINESTRING).

    Segment by segment rather than track by track: the ECF files carry one
    track per developed section and a track whose segments were concatenated
    would draw a straight line across every gap the file exists to show.
    """
    tree = ET.parse(path)
    root = tree.getroot()
    out = []
    for ns in ("g", "g0"):
        for trk in root.findall(f"{{{GPX_NS[ns]}}}trk"):
            name_el = trk.find(f"{{{GPX_NS[ns]}}}name")
            name = (name_el.text or "").strip() if name_el is not None else None
            for seg in trk.findall(f"{{{GPX_NS[ns]}}}trkseg"):
                pts = []
                for pt in seg.findall(f"{{{GPX_NS[ns]}}}trkpt"):
                    try:
                        pts.append((float(pt.get("lon")), float(pt.get("lat"))))
                    except (TypeError, ValueError):
                        continue
                if len(pts) >= 2:
                    coords = ",".join(f"{x:.7f} {y:.7f}" for x, y in pts)
                    out.append((name, f"LINESTRING({coords})"))
        if out:
            break
    return out


def load_eurovelo(conn, refresh=False, numbers=None):
    """The ECF GPX tracks into cycle_portal_routes, one row per segment."""
    numbers = numbers or S.EUROVELO_NUMBERS
    stored, dates = 0, set()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM cycle_portal_routes WHERE source = 'eurovelo_gpx'")
        for number in numbers:
            try:
                path, on = S.eurovelo_gpx(number, refresh=refresh)
            except Exception as exc:                       # noqa: BLE001
                log(f"EV{number}: unavailable ({type(exc).__name__}: {exc})")
                continue
            dates.add(on)
            credit = S.eurovelo_credit(on)
            segments = gpx_tracks(path)
            for name, wkt in segments:
                cur.execute(PORTAL_INSERT, (None, name, f"EV{number}", wkt,
                                            "eurovelo_gpx", credit))
                stored += 1
            log(f"EV{number}: {len(segments)} developed segment(s) from "
                f"{path.name}")
    conn.commit()
    _project_portals(conn)
    log(f"eurovelo: {stored} segment(s) stored, downloaded "
        f"{', '.join(sorted(dates)) or 'never'}")
    return stored


def load_portals(conn, names=None, refresh=False):
    """National cross-check geometries into cycle_portal_routes."""
    todo = names or [n for n, s in S.PORTALS.items() if s["status"] == "open"]
    stored = Counter()
    for name in todo:
        feats, meta = S.portal_geojson(name, refresh=refresh)
        if not feats:
            log(f"portal {name}: {meta.get('status')}, "
                f"{meta.get('why') or 'no features'}")
            continue
        spec = S.PORTALS[name]
        cc = spec["agreement_cc"][0]
        with conn.cursor() as cur:
            cur.execute("DELETE FROM cycle_portal_routes WHERE source = %s",
                        (name,))
            for feat in feats:
                geom = feat.get("geometry") or {}
                if geom.get("type") not in ("LineString", "MultiLineString"):
                    continue
                props = feat.get("properties") or {}
                label = (props.get("Name") or props.get("NAME")
                         or props.get("name") or props.get("RouteName"))
                ref = str(props.get("NCN_Number") or props.get("Route_Number")
                          or props.get("ref") or "") or None
                # ST_Force2D because some portals publish 3D lines (Sustrans
                # ships LineString Z) and this column is 2D, which fails the
                # insert with "Geometry has Z dimension but column does not"
                # and takes the whole crosscheck stage down. The Z is no loss
                # here: this table exists to measure how much of a portal's
                # alignment our own routes agree with, which is a question
                # about the ground plan. Our elevation comes from the DEM.
                cur.execute(
                    """INSERT INTO cycle_portal_routes
                           (country, name, ref, geom, source, license)
                       VALUES (%s, %s, %s,
                               ST_Force2D(
                                   ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)),
                               %s, %s)""",
                    (cc, label, ref, json.dumps(geom), name, spec["license"]))
                stored[name] += 1
        conn.commit()
        _project_portals(conn)
        log(f"portal {name}: {stored[name]} geometry(ies) stored for {cc}")
    return stored


def _project_portals(conn):
    """Fill geom_3035 for anything newly loaded, and index it once.

    The agreement measurement is planar in EPSG:3035 and cannot use an index
    if it transforms each candidate in-line: over 37,206 Sustrans geometries
    that pass could not reach its first progress line.
    """
    with conn.cursor() as cur:
        cur.execute("""ALTER TABLE cycle_portal_routes
                       ADD COLUMN IF NOT EXISTS geom_3035 geometry(Geometry, 3035)""")
        cur.execute("""UPDATE cycle_portal_routes
                       SET geom_3035 = ST_MakeValid(ST_Transform(geom, 3035))
                       WHERE geom_3035 IS NULL""")
        n = cur.rowcount
        cur.execute("""CREATE INDEX IF NOT EXISTS cycle_portal_3035_gist
                       ON cycle_portal_routes USING gist (geom_3035)""")
        cur.execute("ANALYZE cycle_portal_routes")
    conn.commit()
    if n:
        log(f"projected {n} portal geometry(ies) into EPSG:3035")
    return n


AGREE_TARGETS = """
    SELECT id, country, name, ref, raw_tags->>'carta:family_ref'
    FROM cycle_routes
    WHERE status <> 'rejected' AND distance_m >= 5000
      AND (%(countries)s::text[] IS NULL OR country = ANY(%(countries)s))
    ORDER BY country, distance_m DESC
"""


def measure_agreement(conn, countries, verbose=False):
    """The share of each OSM route that the official source also draws."""
    with conn.cursor() as cur:
        cur.execute("""SELECT DISTINCT source FROM cycle_portal_routes""")
        have = {r[0] for r in cur.fetchall()}
    if not have:
        log("agreement: no official geometry loaded, nothing to compare")
        return Counter()
    by_country = defaultdict(list)
    for name, spec in S.PORTALS.items():
        if name not in have:
            continue
        # A portal that is ITSELF an OSM export is not independent evidence.
        # France's Base Nationale des Amenagements Cyclables is exactly that,
        # by its own description, so agreement against it would report a high
        # number that says only "both sides read the same database". Fetched
        # and credited as a schema reference, excluded from the measurement.
        if spec.get("agreement") is False or spec.get("derived_from_osm"):
            log(f"agreement: {name} excluded, {spec.get('why', 'not independent')}")
            continue
        for cc in spec["agreement_cc"]:
            by_country[cc].append(name)

    with conn.cursor() as cur:
        cur.execute(AGREE_TARGETS, {"countries": list(countries) or None})
        rows = cur.fetchall()
    log(f"agreement: {len(rows)} route(s) to compare against "
        f"{len(have)} official source(s)")

    done = Counter()
    with conn.cursor() as cur:
        for i, (rid, cc, name, ref, family) in enumerate(rows, 1):
            payload = {}
            sources = list(by_country.get(cc, []))
            if family and "eurovelo_gpx" in have:
                sources.append("eurovelo_gpx")
            for source in sources:
                cur.execute(AGREE_SQL, {
                    "id": rid, "source": source, "tol": AGREE_TOL_M,
                    "search": AGREE_SEARCH_M,
                    "ref": family if source == "eurovelo_gpx" else None})
                got = cur.fetchone()
                if not got or got[0] is None:
                    continue
                share, n = got
                payload[source] = {"share": round(float(share), 4),
                                   "features": int(n or 0),
                                   "tol_m": AGREE_TOL_M}
                done[source] += 1
            if payload:
                payload["note"] = ("share of this OSM line that the official "
                                   "source also draws, within "
                                   f"{AGREE_TOL_M:g} m")
                cur.execute("UPDATE cycle_routes SET agreement = %s "
                            "WHERE id = %s", (Jsonb(payload), rid))
                done["measured"] += 1
            if i % 300 == 0:
                conn.commit()
                log(f"  agreement {i}/{len(rows)}")
    conn.commit()
    log("agreement: " + ", ".join(f"{k}={v}" for k, v in done.most_common()))
    return done


def crosscheck(conn, countries, refresh=False, verbose=False):
    load_eurovelo(conn, refresh=refresh)
    load_portals(conn, refresh=refresh)
    return measure_agreement(conn, countries, verbose)


# ---------------------------------------------------------------------------
# The census: real per-network numbers, since taginfo blocks automated fetches
# ---------------------------------------------------------------------------

CENSUS_QUERY = ('[out:json][timeout:180];area["ISO3166-1"="%s"][admin_level=2]'
                '->.a;relation["route"="bicycle"]["network"="%s"](area.a);'
                'out count;')


def census(countries_iso, networks=("icn", "ncn", "rcn", "lcn"), refresh=False):
    """Per-country, per-network relation counts, straight from Overpass.

    The brief asks for the real numbers rather than a guess, and taginfo's
    site blocks automated fetches. `out count` returns one tiny element, so
    this is cheap even against a public instance.
    """
    table = S.load_cache("census", default={}) or {}
    for cc in countries_iso:
        row = table.setdefault(cc, {})
        for net in networks:
            if not refresh and net in row:
                continue
            try:
                payload = S.overpass(CENSUS_QUERY % (cc, net))
                tags = (payload.get("elements") or [{}])[0].get("tags") or {}
                row[net] = int(tags.get("relations") or tags.get("total") or 0)
            except S.SourceError as exc:
                log(f"census {cc}/{net}: {exc}")
                continue
            log(f"census {cc}/{net}: {row[net]}")
            S.save_cache("census", "", table)
    S.save_cache("census", "", table)
    return table


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(errors="replace")
    known = S.countries()
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default=",".join(known),
                    help="comma separated Geofabrik slugs")
    ap.add_argument("--nodes", default=",".join(NODE_NETWORK_COUNTRIES),
                    help="slugs to build the junction graph for "
                         "(a full node pass each); empty string disables")
    ap.add_argument("--refresh", action="store_true",
                    help="re-download extracts even when cached")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--counts", action="store_true",
                    help="Overpass census of route=bicycle per network, "
                         "then exit")
    ap.add_argument("--crosscheck", action="store_true",
                    help="load the EuroVelo GPX and the national portals and "
                         "measure agreement per route, then exit")
    args = ap.parse_args()

    if args.crosscheck:
        iso2 = ([c.strip().upper() for c in (args.countries or "").split(",")
                 if c.strip() and len(c.strip()) == 2] or [])
        with connect() as conn:
            apply_ddl(conn)
            crosscheck(conn, iso2, args.refresh)
        return

    slugs = [s.strip().lower() for s in args.countries.split(",") if s.strip()]
    unknown = [s for s in slugs if s not in known]
    if unknown:
        ap.error(f"unknown countries: {', '.join(unknown)}")
    args.nodes = {s.strip().lower() for s in (args.nodes or "").split(",")
                  if s.strip()}

    if args.counts:
        table = census(sorted({known[s] for s in slugs}))
        total = sum(sum(v.values()) for v in table.values())
        for cc, row in sorted(table.items()):
            print(f"  {cc}: " + ", ".join(f"{k}={v}" for k, v in sorted(row.items())))
        print(f"total route=bicycle relations on signed networks: {total:,}")
        return

    conn, index = None, {}
    if not args.dry_run:
        conn = connect()
        apply_ddl(conn)
        index = load_db_index(conn)
        # End the implicit read transaction before any multi-GB download:
        # an ACCESS SHARE lock held that long queues every concurrent ALTER.
        conn.commit()

    failures, totals = [], Counter()
    for slug in slugs:
        try:
            totals += harvest_country(slug, known[slug], args, conn, index)
        except Exception as exc:      # coverage beats fail-fast, as in trails
            failures.append(f"{slug}: {type(exc).__name__}: {exc}")
            log(f"[{slug}] FAILED: {type(exc).__name__}: {exc}")

    if conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE data_sources SET last_refreshed_at = now() "
                        "WHERE name = 'osm'")
        conn.commit()
        conn.close()

    print(f"\ntotal: {totals['selected']} routes selected, "
          f"{totals['inserted']} inserted, {totals['updated']} updated, "
          f"{totals['skipped_cross_border']} cross-border skips, "
          f"{totals['junctions']} junctions, {totals['node_edges']} node edges")
    if failures:
        print("failures: " + " | ".join(failures))
        sys.exit(1)


if __name__ == "__main__":
    main()
