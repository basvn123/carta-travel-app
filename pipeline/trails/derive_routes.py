"""Routes built from way-level paths, for the countries with no relation culture.

Moldova publishes 3 walks, Kosovo 14, North Macedonia 16, Malta 30, Albania
34. None of those is a quota problem and raising a ceiling will not touch
them: the countries have paths on the ground and in OpenStreetMap, and almost
nobody has ever wrapped them in a `type=route` relation. The ingest reads
relations, so it reads almost nothing.

So this reads the WAYS. For one country it streams the Geofabrik extract for
every `highway=path|footway|track|bridleway|steps` that carries a NAME or a
`sac_scale`, clusters the ones that physically connect into candidate routes,
and stages the result as ordinary trips with `derived_route = true` and
`source = 'osm_ways'`.

They are then held to exactly the same gates as everything else. The
continuity gate is the same gate (a cluster is walked end to end and has to
come out as one line). The curation quotas are the same quotas. validate.py
scores them the same way. The only difference is that the wire says
`derived_route`, and the review UI shows it, because "somebody assembled this
from six named path segments" is a weaker claim than "a mapper published this
as a route" and a curator deserves to know which they are reading.

How the clustering works, and why it is conservative:

  seed        a NAMED or graded path, track or bridleway. Not a footway: a
              named footway is a pavement carrying a street name, and seeding
              on those grows the whole of a city's pavement network. A footway
              may still JOIN a cluster a path started, which is how a trail
              that crosses a village stays whole.
  grow        depth first from the seed's endpoints, in two passes. The first
              takes only ways sharing the seed's name (plus unnamed connectors
              under CONNECTOR_MAX_M, which is what rejoins a path split at a
              road crossing without swallowing the road). The second, over
              whatever the first left, takes any named or graded neighbour and
              is marked `derived_join: any-named` in the tags, because it is
              the weaker claim.
  stop        at a junction where more than JUNCTION_MAX ways meet, at
              CLUSTER_MAX_WAYS, or when the cluster passes CLUSTER_MAX_M.
  keep        clusters between MIN_M and MAX_M that assemble to ONE continuous
              line and carry a name. That last gate is the one doing most of
              the work: a branching blob of city pavement comes back as a
              dozen segments and is dropped, the same way a broken relation is.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/derive_routes.py                  # the five
    python pipeline/trails/derive_routes.py --countries MD --dry-run --verbose
    python pipeline/trails/derive_routes.py --countries XK --limit 200
"""

import argparse
import sys
import time
from array import array
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import osmium  # noqa: E402

from db import connect  # noqa: E402
from schema import ensure  # noqa: E402
from ingest_osm_routes import (  # noqa: E402
    COUNTRIES, EARTH_RADIUS_M, assemble_ordered, cached_extract,
    load_locations, part_geometry, stitch_segments,
)

SCHEMA_SQL = ROOT / "tools" / "trailslab" / "initdb" / "07_filters.sql"

# The countries the relation culture never reached. Not a permanent list: when
# a country starts mapping route relations this stops finding anything new,
# because the dedupe below refuses to derive a route that overlaps one.
THIN_COUNTRIES = ["MD", "XK", "MK", "MT", "AL"]

SOURCE = "osm_ways"
LICENSE = "ODbL 1.0"
ATTRIBUTION = "Trail data (c) OpenStreetMap contributors, ODbL"

# What can be part of a walk. Deliberately narrower than the route ingest's
# member set: a derived route is assembled by us, so it may only be made of
# ways that are unambiguously walking infrastructure.
WALK_HIGHWAYS = {"path", "footway", "track", "bridleway", "steps"}
# Tags worth carrying onto the derived trip, so way_tags.py and attributes.py
# read the same keys they read anywhere else.
KEEP_WAY_TAGS = ("highway", "name", "sac_scale", "surface", "smoothness",
                 "trail_visibility", "via_ferrata_scale", "wheelchair", "dog",
                 "operator", "ref", "network", "osmc:symbol", "wikidata",
                 "wikipedia", "tracktype")

# What may START a cluster. Narrower than what may join one: a named footway
# is a pavement with a street name on it, and seeding on those grows the
# whole of Chisinau's pavement network. A footway still joins a cluster a
# path started, which is how a trail that crosses a village stays whole.
SEED_HIGHWAYS = {"path", "track", "bridleway"}

# Clustering bounds.
CONNECTOR_MAX_M = 300.0     # an unnamed way this short may join two named halves
JUNCTION_MAX = 6            # more ends than this at a node is a network hub
CLUSTER_MAX_WAYS = 400
CLUSTER_MAX_M = 60_000.0
MIN_M = 2_000.0
MAX_M = 45_000.0

# How far a derived route may run alongside an existing relation before it is
# the same walk under another name. Metres, and the share of its length.
DUPLICATE_BUFFER_M = 40.0
DUPLICATE_SHARE = 0.5

BATCH = 200


# ---------------------------------------------------------------------------
# The extract pass
# ---------------------------------------------------------------------------

class WalkWays:
    """Every walkable way in the extract, with its tags and node refs."""

    def __init__(self):
        self.nodes = {}
        self.tags = {}

    def __len__(self):
        return len(self.nodes)


def scan_ways(pbf_path, verbose=False):
    """Walkable ways with a name or a grade, plus the short unnamed ways that
    could join two of them.

    Two claims, one pass: KeyFilter("highway") runs in C++ and the value test
    is cheap, so this reads a national extract in a minute or two. Only the
    ways that clear the highway test are held in memory."""
    out = WalkWays()
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.WAY) \
        .with_filter(osmium.filter.KeyFilter("highway"))
    seen = 0
    for way in fp:
        tags = way.tags
        if tags.get("highway") not in WALK_HIGHWAYS:
            continue
        seen += 1
        refs = np.fromiter((n.ref for n in way.nodes), dtype=np.int64)
        if len(refs) < 2:
            continue
        out.nodes[way.id] = refs
        out.tags[way.id] = {k: tags[k] for k in KEEP_WAY_TAGS if k in tags}
    if verbose:
        print(f"    {seen:,} walkable way(s), {len(out.nodes):,} usable")
    return out


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

def fold_name(text):
    """Lowercase, punctuation stripped: two halves of the same path spelled
    'Traseul Orheiul Vechi' and 'Traseul Orheiul-Vechi' are the same claim."""
    import re
    import unicodedata
    folded = unicodedata.normalize("NFKD", str(text or "").lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", folded)


def _grow(seed, key, ways, lengths, ends, named, used, same_name_only):
    """Depth first from one seed. Returns (members, total length).

    same_name_only is the difference between the two passes: the first grows
    a path along its own name, which is the honest reading of "these segments
    are one walk"; the second grows across any named or graded neighbour,
    which is what Moldova needs because its paths are named piecemeal or not
    at all. The second pass is only ever run on seeds the first left over."""
    members, total = [seed], lengths.get(seed, 0.0)
    used.add(seed)
    frontier = [int(ways.nodes[seed][0]), int(ways.nodes[seed][-1])]
    while frontier and len(members) < CLUSTER_MAX_WAYS and total < CLUSTER_MAX_M:
        node = frontier.pop()
        touching = ends.get(node, [])
        if len(touching) > JUNCTION_MAX:
            continue                      # a hub, not a continuation
        for wid in touching:
            if wid in used:
                continue
            other = named.get(wid)
            graded = bool(ways.tags[wid].get("sac_scale"))
            is_connector = (not other and not graded
                            and lengths.get(wid, 0.0) <= CONNECTOR_MAX_M)
            if same_name_only:
                joins = (other and other == key) or is_connector
            else:
                joins = bool(other) or graded or is_connector
            if not joins:
                continue
            used.add(wid)
            members.append(wid)
            total += lengths.get(wid, 0.0)
            refs = ways.nodes[wid]
            frontier.append(int(refs[0]))
            frontier.append(int(refs[-1]))
    return members, total


def cluster(ways, lengths, verbose=False):
    """Named ways grouped into candidate routes.

    Grows out from each unused seed along the endpoint graph. Union by growth
    rather than by union-find, because the stop conditions have to be checked
    as the cluster grows: a union-find over "shares a node" would merge a
    whole country's footpath network into one component and only discover
    that at the end.

    Two passes, in that order and never the other way round:

      same name   a path split into six segments that all say "Traseul
                  Orheiul Vechi" is one walk, and nothing else is folded in.
                  This is the strong claim and it goes first so the strong
                  claim gets the ways.
      any named   whatever the first pass could not use grows across named or
                  graded neighbours instead. This is a weaker claim, marked
                  as such in the tags (derived_join), and it is what actually
                  finds walks in the countries this module exists for:
                  Moldova names its paths piecemeal, so a same-name pass alone
                  produced 2,030 clusters under 500 m and 22 routes.

    Everything either pass produces still has to assemble into ONE continuous
    line to be staged, which is the gate that keeps a city's pavement network
    out: a branching blob comes back as a dozen segments and is dropped."""
    ends = defaultdict(list)
    for wid, refs in ways.nodes.items():
        ends[int(refs[0])].append(wid)
        ends[int(refs[-1])].append(wid)

    named = {wid: fold_name(t.get("name")) for wid, t in ways.tags.items()}
    seeds = [wid for wid, t in ways.tags.items()
             if (named.get(wid) or t.get("sac_scale"))
             and (t.get("highway") in SEED_HIGHWAYS or t.get("sac_scale"))]
    # Longest first: a cluster is named after the way it grew from, so growing
    # from the longest named piece gives the best name and the best anchor.
    seeds.sort(key=lambda wid: -lengths.get(wid, 0.0))

    # `claimed` is the ways an EMITTED cluster owns; `used` is the scratch set
    # one pass grows against. They have to be different sets, and getting that
    # wrong is what made the two-pass rule pointless the first time: pass one
    # marked every way it touched as used, including the 2,030 Moldovan
    # clusters under 500 m that were then thrown away, so pass two started
    # with nothing left to grow through and found two routes. A way only stops
    # being available when a cluster it is in actually ships.
    claimed, clusters = set(), []
    for same_name_only in (True, False):
        used = set(claimed)
        for seed in seeds:
            if seed in used:
                continue
            key = named.get(seed)
            if same_name_only and not key:
                continue          # a graded but unnamed path seeds pass two
            members, total = _grow(seed, key, ways, lengths, ends, named,
                                   used, same_name_only)
            if MIN_M <= total <= MAX_M:
                claimed.update(members)
                clusters.append({
                    "name": ways.tags[seed].get("name"),
                    "key": key, "ways": members, "len_m": total,
                    "seed": seed,
                    "join": "same-name" if same_name_only else "any-named",
                })
    if verbose:
        by_join = Counter(c["join"] for c in clusters)
        print(f"    {len(seeds):,} seed(s) -> {len(clusters):,} cluster(s) "
              f"in the length band {dict(by_join)}")
    return clusters


def merge_tags(cluster_rec, ways):
    """One tag set for the derived route: the seed's, plus anything the
    members agree on that the seed did not say."""
    tags = dict(ways.tags[cluster_rec["seed"]])
    for wid in cluster_rec["ways"]:
        for key, value in ways.tags[wid].items():
            tags.setdefault(key, value)
    tags["derived_from"] = f"{len(cluster_rec['ways'])} osm ways"
    # Which of the two growth rules built it. A curator reading the review
    # queue can tell "six segments that all say the same name" from "six
    # segments that happened to touch", and so can the wire.
    tags["derived_join"] = cluster_rec.get("join") or "same-name"
    tags["route"] = "hiking"
    return tags


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def build_geometry(cluster_rec, ways, locator):
    """(wkt, length m, gap_info) for one cluster, or (None, 0, info).

    Reuses the route ingest's own assembly, so a derived route is stitched by
    the same code with the same idea of what a break is, and its gap_info
    reads the same to every gate downstream.

    Where the cluster does NOT assemble into one line, its LONGEST continuous
    run is taken instead of the whole thing being dropped. That is not a
    softening of the continuity gate, it is the gate applied earlier: a
    branching cluster is a piece of path network, and the longest walk inside
    it is a walk, continuous end to end, with nothing bridged and nothing
    invented. Dropping the cluster whole cost 110 routes across the five
    countries this module exists for, including every candidate in Malta.

    gap_info records what was set aside (`trimmed_from`), so a reviewer sees
    that this line is part of something larger rather than all of it."""
    stats = Counter()
    refs = cluster_rec["ways"]
    ordered = assemble_ordered(refs, {w: array("q", ways.nodes[w].tolist())
                                      for w in refs}, stats)
    merged = stitch_segments(ordered) if len(ordered) > 1 else ordered
    pieces = []
    for seg in merged:
        wkt_part, part_len = part_geometry(seg, locator, stats)
        if wkt_part:
            pieces.append((part_len, wkt_part))
    gap_info = {
        "member_ways": len(refs),
        "ordered_segments": len(ordered),
        "merged_segments": len(merged),
        "gap_count": 0,
        "unordered_members": len(ordered) > len(merged),
        "derived_route": True,
    }
    if not pieces:
        gap_info["gap_count"] = 0
        return None, 0.0, gap_info
    if len(pieces) > 1:
        pieces.sort(key=lambda p: -p[0])
        gap_info["trimmed_from"] = len(pieces)
        gap_info["merged_segments"] = 1
    length_m, wkt_part = pieces[0]
    return "MULTILINESTRING(" + wkt_part + ")", length_m, gap_info


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

INSERT_SQL = """
    INSERT INTO trips (country, category, title, geom, distance_m, sac_scale,
                       network, source, source_ref, license, attribution_text,
                       raw_tags, gap_info, derived_route, status)
    VALUES (%(country)s, 'hike', %(title)s,
            ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)),
            %(length_m)s, %(sac_scale)s, %(network)s, %(source)s,
            %(source_ref)s, %(license)s, %(attribution)s,
            %(raw_tags)s, %(gap_info)s, true, 'needs_review'::trip_status)
    ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL
    DO UPDATE SET
        title = EXCLUDED.title, geom = EXCLUDED.geom,
        distance_m = EXCLUDED.distance_m, sac_scale = EXCLUDED.sac_scale,
        network = EXCLUDED.network, raw_tags = EXCLUDED.raw_tags,
        gap_info = EXCLUDED.gap_info, derived_route = true
"""

# A derived route that runs alongside an existing relation is the same walk.
# The relation wins: somebody published it as a route, which is a stronger
# claim than one we assembled.
DUPLICATE_SQL = """
    SELECT d.id
    FROM trips d
    WHERE d.country = %(cc)s AND d.source = %(source)s AND d.derived_route
      AND EXISTS (
        SELECT 1 FROM trips r
        WHERE r.country = d.country AND r.category = 'hike'
          AND r.source = 'osm' AND r.status <> 'rejected'
          AND r.geom && ST_Expand(d.geom, 0.01)
          AND ST_Length(
                ST_Intersection(
                    ST_Transform(d.geom, 3035),
                    ST_Buffer(ST_Transform(r.geom, 3035), %(buf)s)))
              >= %(share)s * ST_Length(ST_Transform(d.geom, 3035))
      )
"""


def drop_duplicates(conn, cc, verbose=False):
    with conn.cursor() as cur:
        cur.execute(DUPLICATE_SQL, {"cc": cc, "source": SOURCE,
                                    "buf": DUPLICATE_BUFFER_M,
                                    "share": DUPLICATE_SHARE})
        ids = [r[0] for r in cur.fetchall()]
        if ids:
            cur.execute("UPDATE trips SET status = 'rejected'::trip_status, "
                        "curation_note = %s WHERE id = ANY(%s)",
                        ("derived route duplicates an existing OSM relation",
                         ids))
    conn.commit()
    return len(ids)


# ---------------------------------------------------------------------------
# Per country
# ---------------------------------------------------------------------------

def run_country(conn, slug, cc, args):
    pbf = cached_extract(slug)
    if pbf is None:
        print(f"[{slug}] no extract on disk; run "
              f"pipeline/trails/ingest_osm_routes.py first")
        return Counter({"no_extract": 1})

    counts = Counter()
    t0 = time.time()
    ways = scan_ways(pbf, verbose=True)
    print(f"[{slug}] scanned in {time.time() - t0:.0f}s", flush=True)
    if not len(ways):
        return counts

    t0 = time.time()
    node_ids = np.unique(np.concatenate(list(ways.nodes.values())))
    locator = load_locations(pbf, node_ids)
    print(f"[{slug}] {len(locator.ids):,}/{len(node_ids):,} node location(s) "
          f"({time.time() - t0:.0f}s)", flush=True)

    lengths = {}
    for wid, refs in ways.nodes.items():
        ok, xs, ys = locator.coords_for(refs)
        if ok.sum() < 2:
            lengths[wid] = 0.0
            continue
        lon, lat = xs[ok] / 1e7, ys[ok] / 1e7
        lam, phi = np.radians(lon), np.radians(lat)
        h = (np.sin(np.diff(phi) / 2) ** 2
             + np.cos(phi[:-1]) * np.cos(phi[1:]) * np.sin(np.diff(lam) / 2) ** 2)
        lengths[wid] = float(2 * EARTH_RADIUS_M
                             * np.sum(np.arcsin(np.sqrt(np.clip(h, 0, 1)))))

    clusters = cluster(ways, lengths, verbose=True)
    if args.limit:
        clusters = clusters[:args.limit]

    records = []
    for rec in clusters:
        wkt, length_m, gap_info = build_geometry(rec, ways, locator)
        if not wkt:
            counts["no_geometry"] += 1
            continue
        # The same hard gate the relations face: one continuous line or it is
        # not a route. build_geometry has already reduced a branching cluster
        # to its longest continuous run, so anything still failing here has no
        # walkable run at all.
        if gap_info["merged_segments"] != 1 or gap_info["gap_count"]:
            counts["not_continuous"] += 1
            continue
        if gap_info.get("trimmed_from"):
            counts["trimmed"] += 1
        if not (MIN_M <= length_m <= MAX_M):
            counts["out_of_band"] += 1
            continue
        tags = merge_tags(rec, ways)
        records.append({
            "country": cc,
            "title": (rec["name"] or "").strip()[:200],
            "wkt": wkt,
            "length_m": int(round(length_m)),
            "sac_scale": tags.get("sac_scale"),
            "network": tags.get("network"),
            "source": SOURCE,
            # Stable across re-runs: the seed way is the longest named piece
            # and does not move unless the mapping does.
            "source_ref": f"w{rec['seed']}",
            "license": LICENSE,
            "attribution": ATTRIBUTION,
            "raw_tags": Jsonb(tags),
            "gap_info": Jsonb(gap_info),
        })
        counts["built"] += 1

    if args.dry_run:
        print(f"[{slug}] dry run: {len(records)} derived route(s), "
              f"longest: " + "; ".join(
                  f"{r['title'][:32]} ({r['length_m'] / 1000:.1f} km)"
                  for r in sorted(records, key=lambda r: -r["length_m"])[:3]))
        return counts

    for i in range(0, len(records), BATCH):
        with conn.cursor() as cur:
            cur.executemany(INSERT_SQL, records[i:i + BATCH])
        conn.commit()
    dropped = drop_duplicates(conn, cc, verbose=args.verbose)
    counts["duplicate"] += dropped
    print(f"[{slug}] staged {len(records)} derived route(s) "
          f"({counts['trimmed']} trimmed to their longest run), "
          f"{dropped} rejected as duplicates of existing relations, "
          f"{counts['not_continuous']} with no continuous run", flush=True)
    return counts


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default=",".join(THIN_COUNTRIES),
                    help=f"comma separated ISO2 "
                         f"(default: {','.join(THIN_COUNTRIES)})")
    ap.add_argument("--limit", type=int, default=0,
                    help="cap clusters per country (testing)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    by_iso = defaultdict(list)
    for slug, cc in COUNTRIES.items():
        by_iso[cc].append(slug)
    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]

    totals = Counter()
    with connect() as conn:
        ensure(conn, SCHEMA_SQL, verbose=True)
        for cc in wanted:
            for slug in by_iso.get(cc, []):
                try:
                    totals += run_country(conn, slug, cc, args)
                except Exception as exc:
                    print(f"[{slug}] FAILED: {type(exc).__name__}: {exc}")
                    totals["failed"] += 1

    print("\n" + "=" * 58)
    print(f"{totals['built']:,} derived route(s) staged, "
          f"{totals['duplicate']:,} rejected as duplicates")
    print(f"{totals['trimmed']:,} of them trimmed to their longest continuous "
          f"run out of a branching cluster")
    print(f"dropped: {totals['not_continuous']:,} with no continuous run, "
          f"{totals['out_of_band']:,} outside the length band, "
          f"{totals['no_geometry']:,} without geometry")
    return 1 if totals["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
