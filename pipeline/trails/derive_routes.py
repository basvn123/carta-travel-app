"""Routes built from way-level paths, for the countries with no relation culture.

Tier: Scheduled (run_pipeline task trails_derive_routes)

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

Phase 2 of CARTA_TRAILS_BUILD_BRIEF.md turned this from a rescue for five
countries into the way every country's way-only walks arrive. Two passes were
added ahead of the original two, and they are the ones that recover a famous
trail mapped as named ways and no relation:

  fame        ways carrying the same wikipedia/wikidata value. Sentier des
              Roches is 18 ways, no relation, every one tagged
              fr:Sentier des Roches.
  base-name   the same name with its stage marker stripped, so
              "[secteur 4]" and "[secteur 5]" are one walk.

Both consult a 50 m endpoint graph (the brief's chaining tolerance) and both
REFUSE a branching cluster rather than publishing its longest run: they ship
under a name somebody searched for, and half of a famous trail under that
trail's full name is worse than not having it, because it matches in the
coverage report and turns the one instrument that can find the miss green.
The two original passes are untouched, exact-node only, still taking the
longest run, which is what holds the control countries still.

On "derivation only adds": the control countries went 539 routes to 542, but
Albania went 351 to 350, and that -1 is a MERGE, not a loss. Measured: no old
route's ways are entirely absent from the new set, and Albania's published
walk went from 1,079 km to 1,589 km. Two short routes becoming one longer one
reads as a count decrease and is more walk published, so count the kilometres
before believing a regression here.

Memory (T1223): every walkable way of a country is held while it clusters,
and Spain (2.9 million ways) took 3.35 GB on the 4 GB box until the kernel
killed the quarterly run. The ways now live in way_store.py's compact arrays,
node locations load in passes that keep osmium's id bitmap under
CARTA_DERIVE_IDSET_MB, and each country runs in its own child process, so the
memory one country took is given back before the next and an out-of-memory
kill costs one country, not the sweep. Each child prints its peak memory.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/derive_routes.py                  # every country
    python pipeline/trails/derive_routes.py --resume         # after a crash
    python pipeline/trails/derive_routes.py --fresh-days 14  # skip recent ones
    python pipeline/trails/derive_routes.py --countries MD,XK,MK,MT,AL --dry-run
    python pipeline/trails/derive_routes.py --countries FR --dry-run --verbose
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from array import array
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import osmium  # noqa: E402

from chain import spine  # noqa: E402
from db import connect  # noqa: E402
from names import base_name, squash  # noqa: E402
from schema import ensure  # noqa: E402
from ingest_osm_routes import (  # noqa: E402
    COUNTRIES, EARTH_RADIUS_M, assemble_ordered, cached_extract,
    part_geometry, stitch_segments,
)
from way_store import (  # noqa: E402
    IDSET_BUDGET_MB, EndIndex, PerTagSet, WayFloats, WayStoreBuilder,
    load_aligned_locations, mem_available_mb, peak_rss_mb,
)

# The preflight (T1223): a country whose extract would need more memory than
# the machine has left is skipped with a message, not started and killed.
# MB of peak memory per MB of .osm.pbf, measured with the compact store
# (T1223): Slovenia 616 MB for 314 MB, Albania 559 MB for 54 MB, Liechtenstein
# 459 MB for 4 MB, so about 0.5 above a fixed base; 0.6 leaves a margin.
# Override with the environment once the box prints its own figures.
MB_PER_EXTRACT_MB = float(os.environ.get("CARTA_DERIVE_MB_PER_EXTRACT_MB",
                                         "0.6"))
# Interpreter, numpy, scipy and osmium, plus one location pass's id bitmap.
BASE_MB = 100.0 + IDSET_BUDGET_MB

SCHEMA_SQL = ROOT / "tools" / "trailslab" / "initdb" / "07_filters.sql"
# Which countries this sweep has already finished. A 44-country run is hours;
# a crash at country 38 must not mean starting again. Correctness never
# depends on it (the staging INSERT is idempotent on (source, source_ref)),
# only the clock does.
PROGRESS = ROOT / "data" / "reports" / "derive_routes_progress.json"

# The countries the relation culture never reached. Not a permanent list: when
# a country starts mapping route relations this stops finding anything new,
# because the dedupe below refuses to derive a route that overlaps one.
#
# Phase 2 stopped treating this as the run list. It is now the CONTROL GROUP:
# the two original passes are unchanged and the two new ones never touch these
# countries differently, so `--countries MD,XK,MK,MT,AL --dry-run` must keep
# printing the same numbers it printed before the phase (539 routes, 110
# trimmed, 33 out of band). A change there is a regression, not a finding.
THIN_COUNTRIES = ["MD", "XK", "MK", "MT", "AL"]

# Every country with an extract. The brief's Phase 2 is "run for all 43", and
# the reason it was five is that the module was written to rescue countries
# with no relation culture; the fame and base-name passes below are about
# something else entirely (a famous walk mapped only as named ways), and that
# happens in France and Switzerland as readily as in Moldova.
ALL_COUNTRIES = sorted(set(COUNTRIES.values()))

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
                 "wikipedia", "tracktype",
                 # The brief's second waymark signal. Without these two the
                 # only evidence a derived route could ever have for being
                 # signed on the ground was osmc:symbol, so a trail marked
                 # the other way round read as unmarked.
                 "marked_trail:hiking", "marked_trail:foot")

# The keys that claim a route is WAYMARKED, i.e. signed where you walk it.
# Held apart from every other tag because they are a claim about the whole
# line, not a property one member may speak for: export_wire turns them into
# the "signed on the ground" flag a walker plans around.
WAYMARK_KEYS = ("osmc:symbol", "marked_trail:hiking", "marked_trail:foot")
# Share of the chain's LENGTH that must carry the key before the chain may
# claim it. Length, not member count: one 40 m signed step inside a 12 km
# walk is noise, and six short signed members must not outvote the walk.
WAYMARK_SHARE_MIN = 0.60

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

# The length floor exists to stop an anonymous scrap of path network being
# published as a walk. A chain with REAL TRAIL EVIDENCE is not that, and the
# Fuerstensteig is the case that found it: 5 ways all named Fuerstensteig,
# four citing Q1483351, sac_scale=demanding_mountain_hiking, one continuous
# line once an 8.7 m near-join is bridged, and 1,888 m long. Liechtenstein's
# best-known walk, refused by the plain floor by 112 m.
#
# The lower floor is NOT granted to every strong-key chain, and Malta is why.
# A shared base name is a weak key in a country whose streets are named
# "Triq X": dropping the floor for base-name alone published 14 new Maltese
# "walks", every one of them graded=0 fame=0, mostly short agricultural
# tracks (Triq Tal-Mozz, Marsa Old Racing Track). A shared ARTICLE is a
# different claim: somebody wrote the place up.
#
# So the lower floor needs evidence a street does not have: an article tag,
# or a grade. Still a floor, not an absence of one.
MIN_M_STRONG = 600.0

# How far a derived route may run alongside an existing relation before it is
# the same walk under another name. Metres, and the share of its length.
DUPLICATE_BUFFER_M = 40.0
DUPLICATE_SHARE = 0.5
# ... and how much of the RELATION the derived route has to cover before the
# two count as one walk. Without this half of the test, every named trail
# short enough to lie inside a long-distance route was rejected as its
# duplicate. 0.5 both ways means "these two lines are each mostly the other".
DUPLICATE_SHARE_BACK = 0.5

# --- Phase 2: chaining across a gap -----------------------------------------
# The brief's rule: two ways may chain when their ENDS are within 50 m, not
# only when they share a node id. Mappers split a path at a road, a ford or a
# county line and leave two nodes a few metres apart; the exact-node graph
# below cannot see that, which is one reason a famous walk arrives in pieces.
NEAR_ENDPOINT_M = 50.0
# An endpoint with more near partners than this is a plaza or a trailhead fan,
# not a continuation. Without this the 50 m tolerance turns a car park into a
# junction and the cluster grows into the whole network.
NEAR_MAX_PARTNERS = 4
# A near-join is a few metres of line THAT NOBODY MAPPED. It is drawn so the
# route is one continuous geometry, it is recorded in gap_info, and past this
# total the route is refused rather than published with invented line in a
# file somebody navigates by.
BRIDGE_MAX_TOTAL_M = 200.0

# A member hanging off either end of the chain, that the cluster key does not
# name and no grade defends, longer than this, is a farm track the growth
# wandered onto. Trimmed rather than published as part of the walk.
TAIL_MAX_M = 150.0

# The passes whose claim is strong enough that a branching cluster is refused
# outright instead of being reduced to its longest run. See build_geometry.
STRICT_JOINS = {"fame", "base-name"}
# A fame-pass chain whose length disagrees with the length Wikidata publishes
# for that item by more than this is not that trail. Same tolerance
# coverage_report.py matches lengths with, so the deriver and the report
# cannot disagree about what "the right trail" means.
EXPECTED_KM_TOL = 0.40

# --- T1094 (D7): three rules for the famous walks the strict passes lost ----
#
# 1. One article, two spellings. A mapper tags one way wikidata=Q123 and the
#    next only wikipedia=pl:Orla Perc. The fame key used to be "wikidata, else
#    wikipedia", so those two ways carried different keys, the fame pass saw
#    a hole in the middle of the walk and refused it as branching. Where any
#    way in the extract carries BOTH tags, that pair is learnt and a way with
#    only the wikipedia tag joins under the wikidata key. No guess: the pair
#    is the mapper's own statement that the two name one thing.
#
# 2. A famous walk mapped as ONE way. Besseggen in the registry has one named
#    way, and the strict passes skip a lone way ("a lone way is not a
#    chain"). Right for a name, wrong for a way that cites an article AND is
#    graded or waymarked: that is a mapped walk, only not a split one. It
#    still has to clear MIN_M_STRONG, so a famous bridge deck (Charles Kuonen
#    494 m) cannot, and a way tagged bridge or tunnel never seeds this rule.
LONE_EVIDENCE_KEYS = ("sac_scale",) + WAYMARK_KEYS
#
# 3. The main line of a branching famous chain. Orla Perc has a one-way
#    section with a parallel return and spurs to the cols; Ruta del Cares has
#    the Cain spur. Every strict chain that branched was refused, so the
#    worst miss in Europe stayed missing. chain.spine() takes the longest
#    continuous line through the pieces, and it ships only when it carries
#    chain.SPINE_SHARE_MIN (80%) of the chain: a walk with a variant, not two
#    walks. What it sets aside is recorded in gap_info (spine_set_aside_m).
#    Pieces join only where they already share a node (SPINE_JOIN_M), so the
#    rule draws no line; the 50 m near-joins were already bridged and counted
#    against BRIDGE_MAX_TOTAL_M before it runs.
SPINE_JOIN_M = 1.0

BATCH = 200


def has_trail_evidence(cluster_rec, ways):
    """Does this chain carry evidence beyond somebody naming its pieces?

    A fame key IS the evidence: the ways cite an article. Otherwise a member
    has to be graded, which is a claim no street carries."""
    if cluster_rec.get("fame"):
        return True
    return any(ways.tags[w].get("sac_scale") for w in cluster_rec["ways"])


# ---------------------------------------------------------------------------
# The extract pass
# ---------------------------------------------------------------------------

class WalkWays:
    """Every walkable way in the extract, with its tags and node refs.

    `nodes` and `tags` are way_store's compact mappings (T1223): read them
    like dicts by way id, in scan order; the tag mappings are shared between
    ways and read-only."""

    def __init__(self):
        self.index = None
        self.nodes = {}
        self.tags = {}
        # Ways that are a bridge or a tunnel. Not in KEEP_WAY_TAGS, because
        # the derived trip should not inherit bridge=yes from one member; held
        # apart so the lone-way rule can refuse a famous bridge deck.
        self.structure = set()

    def __len__(self):
        return len(self.nodes)


def scan_ways(pbf_path, verbose=False):
    """Walkable ways with a name or a grade, plus the short unnamed ways that
    could join two of them.

    Two claims, one pass: KeyFilter("highway") runs in C++ and the value test
    is cheap, so this reads a national extract in a minute or two. Only the
    ways that clear the highway test are held in memory."""
    build = WayStoreBuilder()
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.WAY) \
        .with_filter(osmium.filter.KeyFilter("highway"))
    seen = 0
    for way in fp:
        tags = way.tags
        if tags.get("highway") not in WALK_HIGHWAYS:
            continue
        seen += 1
        refs = [n.ref for n in way.nodes]
        if len(refs) < 2:
            continue
        build.add(way.id, refs,
                  {k: tags[k] for k in KEEP_WAY_TAGS if k in tags})
        if tags.get("bridge", "no") != "no" or tags.get("tunnel", "no") != "no":
            build.structure.add(way.id)
    out = build.finish(WalkWays())
    if verbose:
        print(f"    {seen:,} walkable way(s), {len(out.nodes):,} usable, "
              f"{len(out.tags.sets):,} distinct tag set(s)")
    return out


# ---------------------------------------------------------------------------
# The near-endpoint graph
# ---------------------------------------------------------------------------

def near_endpoints(ways, locator, verbose=False):
    """Pairs of way ends within NEAR_ENDPOINT_M that do NOT share a node id.

    The exact-node graph in cluster() can only chain ways a mapper joined at a
    shared node. Real data is full of ends a few metres apart: a path split at
    a road crossing, at a ford, at a boundary, or redrawn by a second mapper
    who snapped to nothing. Those gaps are why a famous walk arrives as six
    pieces none of which is long enough to publish.

    Returns (pairs, near) where `near` maps a node id to the way ids whose
    ends are close to it, and `pairs` maps a frozenset of two way ids to the
    gap in metres, which build_geometry needs to draw the join and gap_info
    needs to declare it.

    Two things make this safe rather than a way to merge a country:

      the unit sphere   endpoints are embedded as 3D vectors and queried with
                        a chord radius. Querying raw lon/lat degrees with a
                        euclidean radius is the trap: at 60 North a degree of
                        longitude is half a degree of latitude, so a "50 m"
                        circle would be an ellipse twice as tolerant
                        east-west as north-south, and it would be a different
                        ellipse in Tromso than in Malta.
      the hub rule      an end with more than NEAR_MAX_PARTNERS neighbours is
                        a trailhead fan or a plaza, and contributes nothing.

    Only the fame and base-name passes consult this. The two original passes
    stay on the exact-node graph, which is what keeps the five control
    countries bit-identical."""
    from scipy.spatial import cKDTree

    # Only ways that could take part in a strong-key pass get an endpoint in
    # the tree. Measured on Liechtenstein, admitting every walkable way gave
    # 34,238 pairs over 7,992 ways, a median near-degree of 7, and 31,759 of
    # those pairs joined two ways that were NEITHER named NOR graded: the
    # pavement fragments of Vaduz, which is precisely the network this module
    # must not grow into. Restricting the tree to named, graded or fame-tagged
    # ways is what makes a 50 m tolerance a chaining rule rather than a
    # flood fill. An unnamed connector still joins a cluster through the
    # exact-node graph, as it always did.
    wid_list = [w for w, t in ways.tags.items()
                if t.get("name") or t.get("sac_scale")
                or t.get("wikidata") or t.get("wikipedia")]
    if len(wid_list) < 2:
        return {}, {}
    ends = np.empty(2 * len(wid_list), dtype=np.int64)
    for i, wid in enumerate(wid_list):
        refs = ways.nodes[wid]
        ends[2 * i] = refs[0]
        ends[2 * i + 1] = refs[-1]
    ok, xs, ys = locator.coords_for(ends)
    if ok.sum() < 2:
        return {}, {}
    wids_a = np.repeat(np.asarray(wid_list, dtype=np.int64), 2)[ok]
    nodes_a = ends[ok]
    lons, lats = xs[ok] / 1e7, ys[ok] / 1e7

    phi, lam = np.radians(lats), np.radians(lons)
    cos_phi = np.cos(phi)
    xyz = np.column_stack([cos_phi * np.cos(lam), cos_phi * np.sin(lam),
                           np.sin(phi)])
    # Chord length for a NEAR_ENDPOINT_M arc on the unit sphere. At this scale
    # chord and arc differ by parts per billion, so the simple form is exact
    # enough and is what keeps the query isotropic.
    radius = 2.0 * np.sin(NEAR_ENDPOINT_M / (2.0 * EARTH_RADIUS_M))
    tree = cKDTree(xyz, leafsize=32)
    raw = tree.query_pairs(r=radius, output_type="ndarray")

    partners = defaultdict(set)
    pairs = {}
    for i, j in raw:
        wi, wj = int(wids_a[i]), int(wids_a[j])
        if wi == wj:
            continue                      # a way's own two ends, or a loop
        if nodes_a[i] == nodes_a[j]:
            continue                      # already joined; the exact graph has it
        gap = float(EARTH_RADIUS_M * 2.0
                    * np.arcsin(min(1.0, np.linalg.norm(xyz[i] - xyz[j]) / 2.0)))
        key = frozenset((wi, wj))
        if gap < pairs.get(key, 1e9):
            pairs[key] = gap
        partners[int(nodes_a[i])].add(wj)
        partners[int(nodes_a[j])].add(wi)

    near = {}
    hubs = 0
    for node, wset in partners.items():
        if len(wset) > NEAR_MAX_PARTNERS:
            hubs += 1
            continue
        near[node] = sorted(wset)
    if verbose:
        print(f"    {len(pairs):,} near-endpoint pair(s) under "
              f"{NEAR_ENDPOINT_M:.0f} m, {hubs:,} hub(s) ignored")
    return pairs, near


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

# Two halves of the same path spelled 'Traseul Orheiul Vechi' and 'Traseul
# Orheiul-Vechi' are the same claim. This used to be a local fold_name() that
# was squash() minus the o-slash/l-stroke table, so a Norwegian or Polish
# trail folded differently here than in the registry that is supposed to
# match it. One definition now, in names.py.
fold_name = squash

# Marks a way with no name in the per-tag-set base-name key, so that mapping
# holds only named ways, as the dict it replaced did.
_NO_NAME = object()


def _grow(seed, key, ways, lengths, ends, named, used, rule,
          keys_by_rule=None, near=None):
    """Depth first from one seed. Returns (members, total length).

    `rule` names the pass and decides what may join:

      fame        a neighbour carrying the SAME wikipedia/wikidata value.
                  The strongest claim in the module: two ways a mapper tagged
                  with the same article are the same walk even when they are
                  named differently, or not named at all.
      base-name   a neighbour whose name, with its stage marker stripped,
                  equals the seed's. "[secteur 4]" chains onto "[secteur 5]".
      same-name   the original first pass: a neighbour with the identical
                  folded name, plus short unnamed connectors.
      any-named   the original second pass: any named or graded neighbour.
                  The weakest claim, and the one Moldova needs.

    The two original rules keep their exact predicate and their exact
    adjacency (shared node ids only), which is what holds the control
    countries still. Only the two new rules consult `near`, the 50 m
    endpoint graph, and only they carry a key strong enough to make that
    tolerance safe: a near neighbour still has to name the same article or
    the same trail before it may join."""
    members, total = [seed], lengths.get(seed, 0.0)
    used.add(seed)
    frontier = [int(ways.nodes[seed][0]), int(ways.nodes[seed][-1])]
    keys_by_rule = keys_by_rule or {}
    strong = rule in STRICT_JOINS
    while frontier and len(members) < CLUSTER_MAX_WAYS and total < CLUSTER_MAX_M:
        node = frontier.pop()
        touching = list(ends.get(node, []))
        # The 50 m partners count towards the junction test, not around it:
        # a node that is busy once you allow for the gap is just as much a
        # hub as one that is busy on shared ids alone.
        if strong and near:
            touching += [w for w in near.get(node, []) if w not in touching]
        if len(touching) > JUNCTION_MAX:
            continue                      # a hub, not a continuation
        for wid in touching:
            if wid in used:
                continue
            other = named.get(wid)
            graded = bool(ways.tags[wid].get("sac_scale"))
            is_connector = (not other and not graded
                            and lengths.get(wid, 0.0) <= CONNECTOR_MAX_M)
            if strong:
                # No unnamed connectors here. A strong pass chains on the
                # strength of a shared claim, and an unnamed way makes none;
                # letting it in would be the weak pass wearing the strong
                # pass's provenance label.
                joins = keys_by_rule.get(wid) == key and key is not None
            elif rule == "same-name":
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


def fame_keys(ways):
    """{way id: the article it cites}, one key per article (T1094 rule 1).

    wikidata when the way carries it. A way citing only a Wikipedia title
    takes the wikidata id another way in the same extract pairs with that
    title, so "wikidata on some members, wikipedia on the rest" is one walk
    and not a walk with holes in it. A title nobody pairs keeps itself."""
    qid_of = {}
    for t in ways.tags.values():
        wd, wp = t.get("wikidata"), t.get("wikipedia")
        if wd and wp:
            qid_of.setdefault(str(wp).strip(), str(wd).strip())
    out = {}
    for wid, t in ways.tags.items():
        wd, wp = t.get("wikidata"), t.get("wikipedia")
        if wd:
            out[wid] = str(wd).strip()
        elif wp:
            wp = str(wp).strip()
            out[wid] = qid_of.get(wp, wp)
    return out


def lone_walk(wid, ways):
    """May this single way be derived as a walk on its own? (T1094 rule 2)

    It cites an article (the fame pass only seeds on those), it carries a
    grade or a waymark, it is a path, track or bridleway or graded, and it
    is not a bridge or a tunnel. The length floor is applied by the caller,
    the same MIN_M_STRONG every strong chain gets."""
    t = ways.tags.get(wid, {})
    if wid in getattr(ways, "structure", ()):
        return False
    if not any(t.get(k) for k in LONE_EVIDENCE_KEYS):
        return False
    return t.get("highway") in SEED_HIGHWAYS or bool(t.get("sac_scale"))


def cluster(ways, lengths, near=None, can_ship=None, verbose=False):
    """Named ways grouped into candidate routes.

    Grows out from each unused seed along the endpoint graph. Union by growth
    rather than by union-find, because the stop conditions have to be checked
    as the cluster grows: a union-find over "shares a node" would merge a
    whole country's footpath network into one component and only discover
    that at the end.

    FOUR passes, in this order and never another, because each pass takes the
    ways from the one below it and the strongest claim must get them first:

      fame        ways carrying the same wikipedia/wikidata value. The brief's
                  rule 1, and the pass that recovers Sentier des Roches: 18
                  ways, no relation, all tagged fr:Sentier des Roches. It is
                  also the only pass whose output can be matched back to a
                  registry row BY QID, which is how a fixed miss is proven
                  rather than hoped for.
      base-name   the same name with its stage marker stripped, so
                  "[secteur 4]" and "[secteur 5]" are one walk. The brief's
                  rule 2.
      same-name   the original first pass, unchanged: identical folded name
                  plus short unnamed connectors.
      any-named   the original second pass, unchanged: any named or graded
                  neighbour. The weakest claim, marked as such, and the one
                  that finds walks in Moldova, which names its paths
                  piecemeal (a same-name pass alone produced 2,030 clusters
                  under 500 m and 22 routes).

    The two new passes consult the 50 m near-endpoint graph and refuse a
    branching cluster outright; the two old ones use shared node ids only and
    keep taking the longest continuous run. That split is deliberate: it is
    what lets the new rules be strict about a famous name while the control
    countries keep the 110 routes the longest-run rule won them.

    Everything every pass produces still has to assemble into ONE continuous
    line to be staged, which is the gate that keeps a city's pavement network
    out: a branching blob comes back as a dozen segments and is dropped."""
    # The endpoint graph, and the two name keys, are per way over every
    # walkable way of the country. Held as way_store's arrays and per-tag-set
    # values (T1223); they read exactly as the dicts they replace.
    ends = EndIndex(ways.nodes)

    named = PerTagSet(ways.tags, lambda t: fold_name(t.get("name")))
    # The key each pass chains on, per way. A way with no key for a pass can
    # neither seed it nor join it.
    fame_key = fame_keys(ways)
    base_key = PerTagSet(
        ways.tags,
        lambda t: (squash(base_name(t["name"])) or None) if t.get("name")
        else _NO_NAME,
        skip=_NO_NAME)
    keys = {"fame": fame_key, "base-name": base_key,
            "same-name": named, "any-named": named}

    # Seeds per pass. The two strong passes may seed on a footway, which the
    # old passes must never do: a named footway is a pavement with a street
    # name, but a footway carrying an article tag or a trail's full name is a
    # different object, and rare enough to be safe (all of France is 557
    # fame-tagged groups).
    old_seeds = [wid for wid, t in ways.tags.items()
                 if (named.get(wid) or t.get("sac_scale"))
                 and (t.get("highway") in SEED_HIGHWAYS or t.get("sac_scale"))]
    # Longest first: a cluster is named after the way it grew from, so growing
    # from the longest named piece gives the best name and the best anchor.
    old_seeds.sort(key=lambda wid: -lengths.get(wid, 0.0))
    seeds_by_rule = {
        "fame": sorted(fame_key, key=lambda w: -lengths.get(w, 0.0)),
        "base-name": sorted(
            [w for w in base_key
             if ways.tags[w].get("highway") in SEED_HIGHWAYS
             or ways.tags[w].get("sac_scale") or w in fame_key],
            key=lambda w: -lengths.get(w, 0.0)),
        "same-name": old_seeds,
        "any-named": old_seeds,
    }

    # `claimed` is the ways an EMITTED cluster owns; `used` is the scratch set
    # one pass grows against. They have to be different sets, and getting that
    # wrong is what made the two-pass rule pointless the first time: pass one
    # marked every way it touched as used, including the 2,030 Moldovan
    # clusters under 500 m that were then thrown away, so pass two started
    # with nothing left to grow through and found two routes. A way only stops
    # being available when a cluster it is in actually ships.
    claimed, clusters = set(), []
    for rule in ("fame", "base-name", "same-name", "any-named"):
        key_map = keys[rule]
        used = set(claimed)
        for seed in seeds_by_rule[rule]:
            if seed in used:
                continue
            key = key_map.get(seed)
            if rule in ("fame", "base-name", "same-name") and not key:
                continue          # a graded but unnamed path seeds any-named
            members, total = _grow(seed, key, ways, lengths, ends, named,
                                   used, rule, key_map, near)
            lone = False
            if rule in STRICT_JOINS and len(members) < 2:
                # A lone way is not a chain, unless it is a famous walk
                # mapped as one way (T1094 rule 2).
                if not (rule == "fame" and lone_walk(seed, ways)):
                    continue
                lone = True
            floor = MIN_M
            if rule in STRICT_JOINS and has_trail_evidence(
                    {"fame": fame_key.get(seed), "ways": members}, ways):
                floor = MIN_M_STRONG
            if not (floor <= total <= MAX_M):
                continue
            rec = {
                "name": ways.tags[seed].get("name"),
                "key": key, "ways": members, "len_m": total,
                "seed": seed, "join": rule,
                "fame": fame_key.get(seed),
                "lone": lone,
            }
            if rule == "fame":
                rec["fame_raw"] = sorted({
                    str(ways.tags[w][k]).strip() for w in members
                    for k in ("wikidata", "wikipedia") if ways.tags[w].get(k)})
            # A strict cluster has to prove it is one line BEFORE it claims
            # its ways. Refusing it later and claiming anyway is how the
            # strong passes silently cost Albania two routes on the first
            # run of this phase: the ways were gone, and the weak pass that
            # would have found a walk in them never saw them. The rule the
            # claimed/used split has always encoded is that a way stops
            # being available when a cluster SHIPS, and a refused cluster
            # does not ship.
            if rule in STRICT_JOINS and can_ship and not can_ship(rec):
                continue
            claimed.update(members)
            clusters.append(rec)
    if verbose:
        by_join = Counter(c["join"] for c in clusters)
        print(f"    {len(old_seeds):,} seed(s) -> {len(clusters):,} cluster(s) "
              f"in the length band {dict(by_join)}")
    return clusters


def merge_tags(cluster_rec, ways, lengths):
    """One tag set for the derived route: the seed's, plus anything the
    members agree on that the seed did not say.

    The waymark keys are the exception, and they are why this function takes
    lengths. Every other tag describes a piece of the walk and is worth
    carrying: if one member says `surface=gravel`, that is true of that
    member and useful. A waymark key is different, because export_wire turns
    it into a claim about the WHOLE line, the flag that tells a walker this
    route is signed where they will be standing. Inheriting it from a single
    member meant one 40 m signed step could make 12 km of unmarked hillside
    claim to be waymarked. So a waymark key is carried only when the members
    carrying it cover WAYMARK_SHARE_MIN of the chain's length, and the share
    is recorded either way so the claim can be audited rather than trusted."""
    seed_tags = ways.tags[cluster_rec["seed"]]
    tags = {k: v for k, v in seed_tags.items() if k not in WAYMARK_KEYS}
    for wid in cluster_rec["ways"]:
        for key, value in ways.tags[wid].items():
            if key in WAYMARK_KEYS:
                continue
            tags.setdefault(key, value)

    total = cluster_rec.get("len_m") or sum(
        lengths.get(w, 0.0) for w in cluster_rec["ways"]) or 1.0
    best_share = 0.0
    for key in WAYMARK_KEYS:
        carried = sum(lengths.get(w, 0.0) for w in cluster_rec["ways"]
                      if ways.tags[w].get(key))
        share = carried / total
        best_share = max(best_share, share)
        if share >= WAYMARK_SHARE_MIN:
            for wid in cluster_rec["ways"]:
                if ways.tags[wid].get(key):
                    tags[key] = ways.tags[wid][key]
                    break
    tags["waymark_share"] = round(best_share, 2)

    # Which growth rule built it, and on what. A curator reading the review
    # queue can tell "18 ways that all cite one Wikipedia article" from "six
    # segments that happened to touch", and so can the wire. The brief asks
    # for the rule that fired; the member count lives in gap_info.
    rule = cluster_rec.get("join") or "same-name"
    fame = cluster_rec.get("fame")
    tags["derived_from"] = f"fame:{fame}" if rule == "fame" and fame else rule
    tags["derived_join"] = rule
    tags["route"] = "hiking"
    return tags


def trim_tail(cluster_rec, ways, lengths):
    """Drop a long member hanging off either end that the key does not name.

    The brief asks for leading and trailing `highway=service` and
    `parking_aisle` to be trimmed. Those values cannot occur here: scan_ways
    admits only path, footway, track, bridleway and steps, so no chain can
    contain a service road, and implementing that rule would be dead code.
    The reachable version of the same complaint is a chain that ends on a way
    the cluster key does not name and no grade defends, long enough to be a
    detour rather than a connector: a farm track the growth wandered onto,
    published as the last 400 m of the walk.

    Only the strong passes call this, because only they have a key that makes
    "the cluster does not name this" mean anything."""
    key = cluster_rec.get("key")
    if not key or len(cluster_rec["ways"]) < 3:
        return
    members = list(cluster_rec["ways"])
    seed = cluster_rec["seed"]
    rule = cluster_rec.get("join")

    def off_key(wid):
        if wid == seed:
            return False
        tags = ways.tags.get(wid, {})
        if tags.get("sac_scale"):
            return False
        if rule == "fame":
            # Either spelling of the article counts (T1094 rule 1): the
            # chain's key is the wikidata id where a pair was learnt.
            own = {str(tags[k]).strip() for k in ("wikidata", "wikipedia")
                   if tags.get(k)}
            if own & ({key} | set(cluster_rec.get("fame_raw") or ())):
                return False
        elif tags.get("name") and squash(base_name(tags["name"])) == key:
            return False
        return lengths.get(wid, 0.0) > TAIL_MAX_M

    dropped = 0.0
    while len(members) > 2 and off_key(members[-1]):
        dropped += lengths.get(members.pop(), 0.0)
    while len(members) > 2 and off_key(members[0]):
        dropped += lengths.get(members.pop(0), 0.0)
    if dropped:
        cluster_rec["ways"] = members
        cluster_rec["len_m"] = max(0.0, cluster_rec["len_m"] - dropped)
        cluster_rec["trimmed_tail_m"] = round(dropped, 1)


def load_progress():
    if not PROGRESS.exists():
        return {}
    try:
        return json.loads(PROGRESS.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


def save_progress(done):
    PROGRESS.parent.mkdir(parents=True, exist_ok=True)
    PROGRESS.write_text(json.dumps(done, indent=1, sort_keys=True),
                        encoding="utf-8")


def load_expected_km():
    """{qid: km} from the Phase 1 registry, for the length cross-check.

    The registry records what Wikidata publishes as a trail's length (P2043).
    A fame chain that comes out at half or double that is not that trail, and
    catching it here is what stops a fragment shipping under a famous name
    and reporting green in the coverage report."""
    path = ROOT / "data" / "trails" / "famous_registry.json"
    if not path.exists():
        return {}
    try:
        rows = json.loads(path.read_text(encoding="utf-8")).get("rows") or []
    except (ValueError, OSError):
        return {}
    out = {}
    for row in rows:
        qid = (row.get("evidence") or {}).get("wikidata")
        if qid and row.get("expected_km"):
            out[str(qid)] = float(row["expected_km"])
    return out


def expected_km_ok(cluster_rec, length_m, expected_km):
    """False when the chain's length contradicts the published length."""
    fame = cluster_rec.get("fame")
    want = expected_km.get(str(fame or "").strip())
    if not want:
        return True
    got = length_m / 1000.0
    return abs(got - want) <= EXPECTED_KM_TOL * want


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def bridge_near(segments, pairs, member_of):
    """Join segments whose facing ends are a known near-pair.

    assemble_ordered works on node ids, so it cannot see that two segments
    end 12 m apart at two different nodes: it hands back two pieces and the
    continuity gate drops the walk. This splices those pieces, and returns
    (segments, bridges) where each bridge is the gap in metres that was
    drawn over.

    Every bridge is a few metres of line NOBODY MAPPED. It is recorded, it is
    capped, and it is why gap_info carries `bridged_m`: a reviewer and a
    walker are both entitled to know that part of this track is our joinery
    rather than somebody's survey."""
    if not pairs or len(segments) < 2:
        return segments, []
    segs = [list(seg) for seg in segments]
    bridges = []
    changed = True
    while changed and len(segs) > 1:
        changed = False
        for a in range(len(segs)):
            for b in range(len(segs)):
                if a == b:
                    continue
                wa, wb = member_of.get(segs[a][-1]), member_of.get(segs[b][0])
                gap = pairs.get(frozenset((wa, wb))) if wa and wb else None
                if gap is None or wa == wb:
                    continue
                segs[a] = segs[a] + segs[b]
                bridges.append(gap)
                segs.pop(b)
                changed = True
                break
            if changed:
                break
    return [tuple(x) for x in segs], bridges


def build_geometry(cluster_rec, ways, locator, pairs=None, strict=False):
    """(wkt, length m, gap_info) for one cluster, or (None, 0, info).

    Reuses the route ingest's own assembly, so a derived route is stitched by
    the same code with the same idea of what a break is, and its gap_info
    reads the same to every gate downstream.

    Two behaviours, chosen by `strict`, and the split is the whole point:

      strict      the fame and base-name passes. A cluster that still breaks
                  into pieces after bridging is REFUSED. These passes publish
                  under a name somebody searched for, and half of a famous
                  trail under that trail's full name is worse than not having
                  it: it would match in the coverage report and turn the one
                  instrument that can find the miss green.
      lenient     the same-name and any-named passes, unchanged. The LONGEST
                  continuous run is taken rather than the cluster being
                  dropped: a branching cluster is a piece of path network and
                  the longest walk inside it is still a walk, continuous end
                  to end, nothing bridged and nothing invented. Dropping the
                  cluster whole cost 110 routes across the five countries
                  this module was written for.

    gap_info records what was set aside (`trimmed_from`) and what was joined
    over (`bridged_m`), so a reviewer sees that this line is part of
    something larger, or is two somethings we drew together."""
    stats = Counter()
    refs = cluster_rec["ways"]
    way_nodes = {w: array("q", ways.nodes[w].tolist()) for w in refs}
    ordered = assemble_ordered(refs, way_nodes, stats)
    merged = stitch_segments(ordered) if len(ordered) > 1 else ordered

    gap_info = {
        "member_ways": len(refs),
        "ordered_segments": len(ordered),
        "merged_segments": len(merged),
        "gap_count": 0,
        "unordered_members": len(ordered) > len(merged),
        "derived_route": True,
    }

    bridges = []
    if strict and pairs and len(merged) > 1:
        # Which member way owns each end node, so a near-pair between two
        # WAYS can be recognised between two SEGMENTS.
        member_of = {}
        for wid in refs:
            nodes = ways.nodes[wid]
            member_of.setdefault(int(nodes[0]), wid)
            member_of.setdefault(int(nodes[-1]), wid)
        merged, bridges = bridge_near(merged, pairs, member_of)
        if bridges:
            gap_info["bridged"] = [round(g, 1) for g in bridges]
            gap_info["bridged_m"] = round(sum(bridges), 1)
            gap_info["merged_segments"] = len(merged)

    if sum(bridges) > BRIDGE_MAX_TOTAL_M:
        gap_info["refused"] = "bridged_too_far"
        return None, 0.0, gap_info

    pieces = []
    for seg in merged:
        wkt_part, part_len = part_geometry(seg, locator, stats)
        if wkt_part:
            pieces.append((part_len, wkt_part))
    if not pieces:
        gap_info["gap_count"] = 0
        return None, 0.0, gap_info
    if len(pieces) > 1:
        if strict:
            # A network, not a line, unless one continuous line through it
            # carries nearly all of it (T1094 rule 3): then that line is the
            # walk and the rest is a variant or a spur, set aside and
            # recorded. Otherwise refused rather than published as a fragment
            # under the whole walk's name.
            main = spine_line(merged, locator, stats)
            if main is None:
                gap_info["refused"] = "branching"
                gap_info["pieces"] = len(pieces)
                return None, 0.0, gap_info
            wkt_part, length_m, set_aside_m, n_aside = main
            gap_info["spine_from"] = len(pieces)
            gap_info["spine_set_aside"] = n_aside
            gap_info["spine_set_aside_m"] = round(set_aside_m, 1)
            gap_info["merged_segments"] = 1
            return "MULTILINESTRING(" + wkt_part + ")", length_m, gap_info
        pieces.sort(key=lambda p: -p[0])
        gap_info["trimmed_from"] = len(pieces)
        gap_info["merged_segments"] = 1
    length_m, wkt_part = pieces[0]
    return "MULTILINESTRING(" + wkt_part + ")", length_m, gap_info


def split_at_junctions(segments):
    """Cut node-id segments wherever another segment touches them.

    The ingest stitcher walks straight through a junction when the member
    order allows, so a segment can carry, in its middle, the node a variant
    or a spur leaves from. The spine needs pieces that meet END TO END, so
    every segment is cut at each interior node that is an end of another
    segment or lies on more than one segment."""
    seen = defaultdict(int)
    ends = set()
    for seg in segments:
        ends.add(seg[0])
        ends.add(seg[-1])
        for node in set(seg):
            seen[node] += 1
    out = []
    for seg in segments:
        cur = [seg[0]]
        for node in seg[1:-1]:
            cur.append(node)
            if node in ends or seen[node] > 1:
                out.append(cur)
                cur = [node]
        cur.append(seg[-1])
        out.append(cur)
    return [tuple(x) for x in out if len(x) >= 2]


def spine_line(segments, locator, stats):
    """(wkt part, length, set-aside m, set-aside count) or None.

    The main line through node-id segments that meet at shared nodes, by
    chain.spine(). Segments with no located points are left out of the
    choice, the same as part_geometry drops them."""
    parts, nodes = [], []
    for seg in split_at_junctions(segments):
        ok, xs, ys = locator.coords_for([seg[0], seg[-1]])
        _wkt, seg_len = part_geometry(seg, locator, stats)
        if not ok.all() or not seg_len:
            continue
        parts.append({"start": (xs[0] / 1e7, ys[0] / 1e7),
                      "end": (xs[1] / 1e7, ys[1] / 1e7),
                      "len_m": seg_len})
        nodes.append(list(seg))
    if len(parts) < 2:
        return None
    got = spine(parts, SPINE_JOIN_M)
    if got is None:
        return None
    line = []
    for i, flipped in got["order"]:
        pts = nodes[i][::-1] if flipped else nodes[i]
        if line and line[-1] == pts[0]:
            pts = pts[1:]
        line.extend(pts)
    wkt_part, length_m = part_geometry(line, locator, stats)
    if not wkt_part:
        return None
    return wkt_part, length_m, got["set_aside_m"], len(got["set_aside"])


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

INSERT_SQL = """
    INSERT INTO trips (country, category, title, geom, distance_m, sac_scale,
                       network, source, source_ref, license, attribution_text,
                       raw_tags, gap_info, derived_route, member_way_ids,
                       status)
    VALUES (%(country)s, 'hike', %(title)s,
            ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)),
            %(length_m)s, %(sac_scale)s, %(network)s, %(source)s,
            %(source_ref)s, %(license)s, %(attribution)s,
            %(raw_tags)s, %(gap_info)s, true, %(member_way_ids)s::bigint[],
            'needs_review'::trip_status)
    ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL
    DO UPDATE SET
        title = EXCLUDED.title, geom = EXCLUDED.geom,
        distance_m = EXCLUDED.distance_m, sac_scale = EXCLUDED.sac_scale,
        network = EXCLUDED.network, raw_tags = EXCLUDED.raw_tags,
        gap_info = EXCLUDED.gap_info, derived_route = true,
        member_way_ids = EXCLUDED.member_way_ids
"""

# A derived route that runs alongside an existing relation is the same walk.
# The relation wins: somebody published it as a route, which is a stronger
# claim than one we assembled.
#
# But "alongside" has to be MUTUAL, and this is where the rule was wrong. It
# asked only whether the derived route lay inside the relation, which is
# trivially true for any short trail that runs along a longer one. The
# Fuerstensteig, Liechtenstein's best-known walk, built correctly at 2.01 km
# and was then rejected four times over: it is 100% inside the Via Alpina
# stage, the Panoramaweg and two others, while covering 13 to 21% of each of
# them. It is a named segment WITHIN those routes, not a duplicate of any,
# and a traveller searching for it was offered "Gaflei - Planken".
#
# So a derived route is a duplicate only when the relation is also mostly
# covered by IT. Two lines that are each mostly the other are one walk; a
# short line inside a long one is a walk with its own name.
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
          AND ST_Length(
                ST_Intersection(
                    ST_Transform(r.geom, 3035),
                    ST_Buffer(ST_Transform(d.geom, 3035), %(buf)s)))
              >= %(back)s * ST_Length(ST_Transform(r.geom, 3035))
      )
"""


def drop_duplicates(conn, cc, verbose=False):
    with conn.cursor() as cur:
        cur.execute(DUPLICATE_SQL, {"cc": cc, "source": SOURCE,
                                    "buf": DUPLICATE_BUFFER_M,
                                    "share": DUPLICATE_SHARE,
                                    "back": DUPLICATE_SHARE_BACK})
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

def run_country(conn, slug, cc, args, expected_km=None):
    pbf = cached_extract(slug)
    if pbf is None:
        print(f"[{slug}] no extract on disk; run "
              f"pipeline/trails/ingest_osm_routes.py first")
        return Counter({"no_extract": 1})

    records, counts = derive_extract(pbf, cc, expected_km=expected_km,
                                     limit=args.limit, label=slug)
    peak = peak_rss_mb()
    if peak:
        # The preflight's calibration: peak memory against extract size.
        size_mb = pbf.stat().st_size / 1e6
        print(f"[{slug}] peak memory {peak:,.0f} MB for a {size_mb:,.0f} MB "
              f"extract ({peak / max(size_mb, 1):.2f} MB per MB)", flush=True)
    for r in records:
        r["raw_tags"] = Jsonb(r["raw_tags"])
        r["gap_info"] = Jsonb(r["gap_info"])

    if args.dry_run:
        print(f"[{slug}] dry run: {len(records)} derived route(s), "
              f"longest: " + "; ".join(
                  f"{r['title'][:32]} ({r['length_m'] / 1000:.1f} km)"
                  for r in sorted(records, key=lambda r: -r["length_m"])[:3]))
        print(f"[{slug}] T1094 rules: {counts['lone_way']} lone famous "
              f"way(s), {counts['spine']} main line(s) of a branching "
              f"famous chain, {counts['fame_key_joined']} way(s) joined "
              f"by a wikipedia/wikidata pair", flush=True)
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


def derive_extract(pbf, cc, expected_km=None, limit=0, label=None):
    """Every derived route one extract yields, as plain dicts, no database.

    The whole derivation short of staging: scan, locate, near-pairs, the four
    passes, the geometry and every gate. run_country stages what this
    returns; the tests run it on small .osm fixtures shaped like the real
    mapping (T1094), which is how the chaining rules are proven without a
    44-country extract on the machine."""
    label = label or cc
    counts = Counter()
    t0 = time.time()
    ways = scan_ways(pbf, verbose=True)
    print(f"[{label}] scanned in {time.time() - t0:.0f}s", flush=True)
    if not len(ways):
        return [], counts

    t0 = time.time()
    node_ids = ways.nodes.node_ids
    locator, passes = load_aligned_locations(pbf, node_ids)
    print(f"[{label}] {locator.n_found:,}/{len(node_ids):,} node location(s) "
          f"({time.time() - t0:.0f}s, {passes} pass(es))", flush=True)

    # Same formula, same float operations, as the dict it replaced: only the
    # storage moved (a float64 per way in scan order).
    length_arr = np.zeros(len(ways), dtype=np.float64)
    for p in range(len(ways)):
        ok, xs, ys = locator.coords_at(ways.nodes.positions(p))
        if ok.sum() < 2:
            continue
        lon, lat = xs[ok] / 1e7, ys[ok] / 1e7
        lam, phi = np.radians(lon), np.radians(lat)
        h = (np.sin(np.diff(phi) / 2) ** 2
             + np.cos(phi[:-1]) * np.cos(phi[1:]) * np.sin(np.diff(lam) / 2) ** 2)
        length_arr[p] = float(2 * EARTH_RADIUS_M
                              * np.sum(np.arcsin(np.sqrt(np.clip(h, 0, 1)))))
    lengths = WayFloats(ways.index, length_arr)

    pairs, near = near_endpoints(ways, locator, verbose=True)
    expected_km = expected_km or {}

    def can_ship(rec):
        """Would this strict cluster survive its own gates?

        Asked while clustering, so a cluster that will be refused never
        claims ways the weaker passes could still have made a walk out of.
        The trim runs here too, because trimming changes the answer."""
        trim_tail(rec, ways, lengths)
        wkt, length_m, _info = build_geometry(rec, ways, locator,
                                              pairs=pairs, strict=True)
        return bool(wkt) and expected_km_ok(rec, length_m, expected_km)

    clusters = cluster(ways, lengths, near=near, can_ship=can_ship,
                       verbose=True)
    if limit:
        clusters = clusters[:limit]
    fk = fame_keys(ways)
    counts["fame_key_joined"] = sum(
        1 for w, t in ways.tags.items()
        if not t.get("wikidata") and t.get("wikipedia")
        and fk.get(w) != str(t["wikipedia"]).strip())

    records = []
    for rec in clusters:
        strict = rec["join"] in STRICT_JOINS
        wkt, length_m, gap_info = build_geometry(rec, ways, locator,
                                                 pairs=pairs, strict=strict)
        if not wkt:
            counts[gap_info.get("refused") or "no_geometry"] += 1
            continue
        if strict and not expected_km_ok(rec, length_m, expected_km):
            counts["length_mismatch"] += 1
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
        floor = (MIN_M_STRONG if strict and has_trail_evidence(rec, ways)
                 else MIN_M)
        if not (floor <= length_m <= MAX_M):
            counts["out_of_band"] += 1
            continue
        if gap_info.get("spine_from"):
            counts["spine"] += 1
        if rec.get("lone"):
            gap_info["lone_way"] = True
            counts["lone_way"] += 1
        tags = merge_tags(rec, ways, lengths)
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
            "raw_tags": tags,
            "gap_info": gap_info,
            # The working: which ways this chain was assembled from. Null on
            # relation-sourced rows, which resolve theirs via route_relations.
            "member_way_ids": [int(w) for w in rec["ways"]],
        })
        counts["built"] += 1
    return records, counts


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default=",".join(ALL_COUNTRIES),
                    help="comma separated ISO2 (default: every country with "
                         "an extract; --countries " + ",".join(THIN_COUNTRIES)
                         + " is the control group)")
    ap.add_argument("--limit", type=int, default=0,
                    help="cap clusters per country (testing)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--resume", action="store_true",
                    help="skip countries already recorded in the progress "
                         "file; a 44-country sweep is hours and a crash at "
                         "country 38 must not restart from zero")
    ap.add_argument("--force", action="store_true",
                    help="ignore the progress file and re-run every country")
    ap.add_argument("--fresh-days", type=float, default=0.0,
                    help="skip a country the progress file says finished "
                         "less than this many days ago. The pipeline task "
                         "passes 14: a rerun after a crash picks up where it "
                         "stopped, and a quarter later every country runs "
                         "again (T1223)")
    ap.add_argument("--in-process", action="store_true",
                    help="run every country in this process. The default "
                         "runs each in a child process, so the memory one "
                         "country took is given back before the next and an "
                         "out-of-memory kill costs that country, not the "
                         "sweep (T1223)")
    ap.add_argument("--no-preflight", action="store_true",
                    help="start a country even when its extract looks too "
                         "big for the memory this machine has left")
    # Internal: a child writes its counts here for the parent to add up.
    ap.add_argument("--counts-out", help=argparse.SUPPRESS)
    args = ap.parse_args()

    by_iso = defaultdict(list)
    for slug, cc in COUNTRIES.items():
        by_iso[cc].append(slug)
    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]

    # Smallest extract first, so a systematic bug shows up in minute two
    # rather than in hour three with France half written.
    def extract_size(cc):
        return max((p.stat().st_size for p in
                    (cached_extract(s) for s in by_iso.get(cc, [])) if p),
                   default=0)
    wanted.sort(key=extract_size)

    if args.in_process:
        totals = run_in_process(args, wanted, by_iso)
    else:
        totals = run_children(args, wanted, extract_size)
    if args.counts_out:
        Path(args.counts_out).write_text(json.dumps(dict(totals)),
                                         encoding="utf-8")
        return 1 if totals["failed"] else 0

    print("\n" + "=" * 58)
    print(f"{totals['built']:,} derived route(s) staged, "
          f"{totals['duplicate']:,} rejected as duplicates")
    print(f"{totals['trimmed']:,} of them trimmed to their longest continuous "
          f"run out of a branching cluster")
    print(f"dropped: {totals['not_continuous']:,} with no continuous run, "
          f"{totals['out_of_band']:,} outside the length band, "
          f"{totals['no_geometry']:,} without geometry")
    # The strong passes refuse rather than publish a fragment, and a refusal
    # that nobody prints is the silence this phase exists to end.
    print(f"refused by the strict passes: {totals['branching']:,} branching "
          f"into a network, {totals['bridged_too_far']:,} needing more than "
          f"{BRIDGE_MAX_TOTAL_M:.0f} m of drawn line, "
          f"{totals['length_mismatch']:,} disagreeing with the length "
          f"Wikidata publishes")
    if totals["skipped"] or totals["too_big"] or totals["failed"]:
        print(f"not run: {totals['skipped']:,} finished recently, "
              f"{totals['too_big']:,} too big for this machine's memory, "
              f"{totals['failed']:,} failed")
    # A country left out for memory is a soft failure: the task shows it in
    # the run log instead of the sweep looking complete.
    return 1 if totals["failed"] or totals["too_big"] else 0


def skip_reason(cc, args, done):
    """Why this country is not run now, or None."""
    if args.force or cc not in done:
        return None
    when = done[cc].get("done_at")
    if args.resume:
        return f"done {when}"
    if args.fresh_days > 0 and when:
        try:
            at = datetime.fromisoformat(when)
        except ValueError:
            return None
        if datetime.now(timezone.utc) - at < timedelta(days=args.fresh_days):
            return f"done {when}, under {args.fresh_days:g} day(s) ago"
    return None


def record_done(cc, got):
    """Add one finished country to the progress file. Read fresh each time:
    in a sweep the parent and its children share the file."""
    done = load_progress()
    done[cc] = {"done_at": datetime.now(timezone.utc)
                .replace(microsecond=0).isoformat(),
                "counts": dict(got)}
    save_progress(done)


def run_in_process(args, wanted, by_iso):
    done = load_progress()
    expected_km = load_expected_km()
    if expected_km and not args.counts_out:
        print(f"{len(expected_km):,} published length(s) from the registry, "
              f"for the fame-pass cross-check")
    totals = Counter()
    with connect() as conn:
        ensure(conn, SCHEMA_SQL, verbose=not args.counts_out)
        for cc in wanted:
            why = skip_reason(cc, args, done)
            if why:
                print(f"[{cc}] {why}, skipping")
                totals["skipped"] += 1
                continue
            got = Counter()
            for slug in by_iso.get(cc, []):
                try:
                    got += run_country(conn, slug, cc, args, expected_km)
                except Exception as exc:
                    print(f"[{slug}] FAILED: {type(exc).__name__}: {exc}")
                    got["failed"] += 1
            totals += got
            if not args.dry_run and not got["failed"]:
                record_done(cc, got)
    return totals


def too_big(cc, size_bytes):
    """A message when this extract will not fit in the memory left, else
    None. Linux only (reads /proc/meminfo); elsewhere every country runs."""
    avail = mem_available_mb()
    if avail is None or not size_bytes:
        return None
    need = BASE_MB + MB_PER_EXTRACT_MB * size_bytes / 1e6
    if need <= avail:
        return None
    return (f"[{cc}] not started: its {size_bytes / 1e6:,.0f} MB extract needs "
            f"about {need:,.0f} MB and this machine has {avail:,.0f} MB of "
            f"memory and swap left (CARTA_DERIVE_MB_PER_EXTRACT_MB="
            f"{MB_PER_EXTRACT_MB:g}); run it on a bigger machine or with "
            f"--no-preflight")


def run_children(args, wanted, extract_size):
    """One child process per country (T1223)."""
    done = load_progress()
    expected = load_expected_km()
    if expected:
        print(f"{len(expected):,} published length(s) from the registry, "
              f"for the fame-pass cross-check")
    totals = Counter()
    base = [sys.executable, str(Path(__file__).resolve()), "--in-process",
            "--force"]
    if args.dry_run:
        base.append("--dry-run")
    if args.verbose:
        base.append("--verbose")
    if args.limit:
        base += ["--limit", str(args.limit)]
    for cc in wanted:
        why = skip_reason(cc, args, done)
        if why:
            print(f"[{cc}] {why}, skipping", flush=True)
            totals["skipped"] += 1
            continue
        msg = None if args.no_preflight else too_big(cc, extract_size(cc))
        if msg:
            print(msg, flush=True)
            totals["too_big"] += 1
            continue
        fd, counts_path = tempfile.mkstemp(prefix=f"derive_{cc}_",
                                           suffix=".json")
        os.close(fd)
        try:
            rc = subprocess.run(base + ["--countries", cc,
                                        "--counts-out", counts_path]).returncode
            try:
                got = Counter(json.loads(
                    Path(counts_path).read_text(encoding="utf-8") or "{}"))
            except (ValueError, OSError):
                got = Counter()
        finally:
            try:
                os.unlink(counts_path)
            except OSError:
                pass
        if rc != 0 and not got["failed"]:
            # Killed before it could write its counts: on Linux a negative
            # code is the signal, and SIGKILL (-9) is the out-of-memory killer.
            hint = (" (killed by signal %d; -9 is most likely the "
                    "out-of-memory killer)" % -rc) if rc < 0 else ""
            print(f"[{cc}] FAILED: child exited {rc}{hint}", flush=True)
            got["failed"] += 1
        totals += got
    return totals


if __name__ == "__main__":
    sys.exit(main())
