"""What the ground under a route is actually tagged as, member way by member way.

Everything the six filters need that a route RELATION does not carry. A
relation says "Eigertrail, nwn, 6 km". It does not say that 400 m of it is
graded T4, that a third of it is asphalt, that dogs are banned on the top
section or that the first kilometre is a wheelchair path. All of that lives
on the member WAYS, and the ingest never kept it: it read node refs and threw
the tags away.

So this is a fourth pass over the same Geofabrik extracts (already on disk,
30 GB, no re-download), collecting per member way:

    sac_scale via_ferrata_scale trail_visibility     how hard
    surface smoothness width                          what underfoot
    highway                                           path, track or road
    wheelchair dog                                    who it suits

and reducing them to LENGTH WEIGHTED shares per route, stored in
trips.way_tags. Length weighted, not way counted, because a route is fifty
20 m ways through a village and two 3 km ways over the pass, and counting
ways would say the village is the walk.

`cover` is the honest half and the one the derivations lean on hardest: the
share of the route's length that said anything at all about each key. OSM tag
coverage is wildly uneven (surface is dense in Germany and absent on remote
alpine paths), so a filter that cannot tell "no dogs" from "nobody wrote
dog=*" would be lying in the countries that map least. Everything downstream
reads cover before it reads a share.

Worst segment wins, with a noise floor: a route inherits its hardest graded
section, but only if that section is at least WORST_MIN_M long or
WORST_MIN_SHARE of the line. Without the floor a 30 m scramble spur mistagged
onto a valley path would grade the whole walk alpine, and one bad tag would
move a country's list.

Reuses ingest_osm_routes.py's own pool scan, way expansion and node locator,
so the way set here is exactly the way set the geometry was assembled from.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/way_tags.py                    # every curated route
    python pipeline/trails/way_tags.py --countries CH --verbose
    python pipeline/trails/way_tags.py --all --countries LI
    python pipeline/trails/way_tags.py --refresh          # re-read what is done
"""

import argparse
import sys
import time
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
    COUNTRIES, EARTH_RADIUS_M, cached_extract, expand_ways, load_locations,
    scan_relations,
)

SCHEMA_SQL = ROOT / "tools" / "trailslab" / "initdb" / "07_filters.sql"

# The tags worth carrying. Deliberately short: every key here is read by a
# named derivation in attributes.py, and a key nothing reads is a key that
# rots.
WAY_KEYS = ("highway", "sac_scale", "trail_visibility", "via_ferrata_scale",
            "surface", "smoothness", "wheelchair", "dog", "width", "tracktype")

# The SAC scale, hardest last. attributes.py maps these onto the published
# five value grade; here they are only ordered so "worst" has a meaning.
SAC_ORDER = ["hiking", "mountain_hiking", "demanding_mountain_hiking",
             "alpine_hiking", "demanding_alpine_hiking",
             "difficult_alpine_hiking"]
SAC_RANK = {v: i + 1 for i, v in enumerate(SAC_ORDER)}

# trail_visibility, best first. "horrible" and "no" are the two that turn a
# marked path into route finding.
VIS_ORDER = ["excellent", "good", "intermediate", "bad", "horrible", "no"]
VIS_RANK = {v: i for i, v in enumerate(VIS_ORDER)}

# highway values that are a ROAD you share with traffic. The single most
# common complaint about OSM derived routes is a "hike" that spends a third
# of itself on tarmac, and this is the set that measures it.
ROAD_HIGHWAYS = {"motorway", "trunk", "primary", "secondary", "tertiary",
                 "unclassified", "residential", "living_street", "service",
                 "road", "motorway_link", "trunk_link", "primary_link",
                 "secondary_link", "tertiary_link"}
# The good stuff: what a walker came for.
PATH_HIGHWAYS = {"path", "footway", "bridleway", "steps", "track",
                 "pedestrian", "cycleway"}

# Surfaces grouped by what they feel like underfoot, and scored 0..1 for the
# rating's surface component. Asphalt is not "bad quality" tarmac, it is a
# road surface on a walk, which is a different complaint and the reason the
# hard surfaces score low here while smoothness scores them high.
SURFACE_SCORE = {
    "ground": 1.0, "dirt": 1.0, "earth": 1.0, "grass": 1.0, "sand": 0.9,
    "rock": 0.9, "gravel": 0.85, "fine_gravel": 0.85, "pebblestone": 0.8,
    "compacted": 0.8, "woodchips": 0.9, "mud": 0.7, "snow": 0.7, "ice": 0.6,
    "wood": 0.8, "unpaved": 0.85, "stepping_stones": 0.8,
    "cobblestone": 0.5, "sett": 0.5, "unhewn_cobblestone": 0.5,
    "paving_stones": 0.35, "bricks": 0.35, "metal": 0.3, "concrete": 0.25,
    "concrete:plates": 0.25, "asphalt": 0.2, "paved": 0.25, "chipseal": 0.25,
}
# Surfaces a pushchair or a wheelchair can actually roll on.
ROLLABLE_SURFACE = {"asphalt", "paved", "concrete", "concrete:plates",
                    "paving_stones", "chipseal", "compacted", "fine_gravel",
                    "metal", "wood"}
SMOOTHNESS_ORDER = ["excellent", "good", "intermediate", "bad", "very_bad",
                    "horrible", "very_horrible", "impassable"]
SMOOTHNESS_RANK = {v: i for i, v in enumerate(SMOOTHNESS_ORDER)}

# The noise floor on worst-segment-wins.
WORST_MIN_M = 200.0
WORST_MIN_SHARE = 0.02

# How many routes are written per transaction.
BATCH = 500


def apply_schema(conn):
    ensure(conn, SCHEMA_SQL, verbose=True)


# ---------------------------------------------------------------------------
# The extract pass
# ---------------------------------------------------------------------------

def load_way_tags(pbf_path, way_ids):
    """{way id: (node refs, {tag: value})} for the member ways we want.

    One WAY pass with an IdFilter, same shape as ingest_osm_routes.load_ways,
    except the tags come with it. Only WAY_KEYS are kept: holding every tag of
    600,000 ways is a gigabyte of dictionaries for no reader."""
    ids = np.fromiter(way_ids, dtype=np.int64, count=len(way_ids))
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.WAY) \
        .with_filter(osmium.filter.IdFilter(ids))
    out = {}
    for way in fp:
        tags = way.tags
        kept = {k: tags[k] for k in WAY_KEYS if k in tags}
        out[way.id] = (np.fromiter((n.ref for n in way.nodes),
                                   dtype=np.int64), kept)
    return out


def way_length_m(refs, locator):
    """Haversine metres along one way, from the node locator."""
    ok, xs, ys = locator.coords_for(refs)
    if ok.sum() < 2:
        return 0.0
    lon, lat = xs[ok] / 1e7, ys[ok] / 1e7
    lam, phi = np.radians(lon), np.radians(lat)
    h = (np.sin(np.diff(phi) / 2) ** 2
         + np.cos(phi[:-1]) * np.cos(phi[1:]) * np.sin(np.diff(lam) / 2) ** 2)
    return float(2 * EARTH_RADIUS_M * np.sum(np.arcsin(np.sqrt(np.clip(h, 0, 1)))))


# ---------------------------------------------------------------------------
# Reduction: member ways -> one length weighted summary
# ---------------------------------------------------------------------------

def first_token(value):
    """OSM lists a value as 'hiking;mountain_hiking' or 'T2'. Take the first
    and lowercase it; the T grades are normalised by the callers that care."""
    return str(value or "").strip().lower().replace(";", ",").split(",")[0].strip()


def sac_value(raw):
    """sac_scale as one of SAC_ORDER, tolerant of the T1..T6 spelling."""
    token = first_token(raw)
    if token in SAC_RANK:
        return token
    if len(token) == 2 and token[0] == "t" and token[1].isdigit():
        i = int(token[1])
        if 1 <= i <= len(SAC_ORDER):
            return SAC_ORDER[i - 1]
    return None


def ferrata_value(raw):
    """via_ferrata_scale 0..6, tolerant of 'A'..'F' and 'K1'..'K6'."""
    token = first_token(raw)
    if token.isdigit():
        return min(6, int(token))
    if len(token) == 2 and token[0] == "k" and token[1].isdigit():
        return min(6, int(token[1]))
    if len(token) == 1 and "a" <= token <= "f":
        return ord(token) - ord("a") + 1
    return None


def _worst(shares, rank, total_m):
    """The hardest value that clears the noise floor, and its share.

    shares is {value: metres}. Below the floor a value is real tagging that is
    too short to describe the walk: it stays in the breakdown, it just does
    not decide the grade."""
    best, best_share = None, 0.0
    for value, metres in shares.items():
        if value not in rank:
            continue
        share = metres / total_m if total_m else 0.0
        if metres < WORST_MIN_M and share < WORST_MIN_SHARE:
            continue
        if best is None or rank[value] > rank[best]:
            best, best_share = value, share
    return best, round(best_share, 4)


def summarise(members):
    """[(length_m, tags)] -> the jsonb summary stored on the route."""
    total = sum(length for length, _ in members if length > 0)
    if total <= 0:
        return None

    by_key = {k: defaultdict(float) for k in WAY_KEYS}
    covered = defaultdict(float)
    sac_m = defaultdict(float)
    vis_m = defaultdict(float)
    ferrata_m = defaultdict(float)
    road_m = path_m = steps_m = rollable_m = 0.0
    surface_quality_m = smoothness_m = 0.0

    for length, tags in members:
        if length <= 0:
            continue
        for key, raw in tags.items():
            value = first_token(raw)
            if not value:
                continue
            by_key[key][value] += length
            covered[key] += length

        highway = first_token(tags.get("highway"))
        if highway in ROAD_HIGHWAYS:
            road_m += length
        elif highway in PATH_HIGHWAYS:
            path_m += length
        if highway == "steps":
            steps_m += length

        sac = sac_value(tags.get("sac_scale"))
        if sac:
            sac_m[sac] += length
        vis = first_token(tags.get("trail_visibility"))
        if vis in VIS_RANK:
            vis_m[vis] += length
        ferrata = ferrata_value(tags.get("via_ferrata_scale"))
        if ferrata is not None:
            ferrata_m[ferrata] += length

        surface = first_token(tags.get("surface"))
        if surface in SURFACE_SCORE:
            surface_quality_m += SURFACE_SCORE[surface] * length
        if surface in ROLLABLE_SURFACE:
            rollable_m += length
        smooth = first_token(tags.get("smoothness"))
        if smooth in SMOOTHNESS_RANK:
            # 0..1, excellent = 1. Only over the length that said something.
            smoothness_m += (1.0 - SMOOTHNESS_RANK[smooth]
                             / (len(SMOOTHNESS_ORDER) - 1)) * length

    def shares(mapping, limit=8):
        top = sorted(mapping.items(), key=lambda kv: -kv[1])[:limit]
        return {str(k): round(v / total, 4) for k, v in top if v > 0}

    sac_worst, sac_worst_share = _worst(sac_m, SAC_RANK, total)
    vis_worst, vis_worst_share = _worst(vis_m, VIS_RANK, total)
    ferrata_worst, ferrata_worst_share = _worst(
        ferrata_m, {k: k for k in ferrata_m}, total)

    surface_cov = covered.get("surface", 0.0)
    smooth_cov = covered.get("smoothness", 0.0)
    return {
        "len_m": int(round(total)),
        "ways": len(members),
        # How much of the line said anything about each key. Read before any
        # share below it.
        "cover": {k: round(v / total, 4) for k, v in sorted(covered.items())
                  if v > 0},
        "highway": shares(by_key["highway"]),
        "road_share": round(road_m / total, 4),
        "path_share": round(path_m / total, 4),
        "steps_share": round(steps_m / total, 4),
        "sac": shares(sac_m),
        "sac_worst": sac_worst,
        "sac_worst_share": sac_worst_share,
        "visibility": shares(vis_m),
        "visibility_worst": vis_worst,
        "visibility_worst_share": vis_worst_share,
        "ferrata_max": ferrata_worst,
        "ferrata_share": ferrata_worst_share,
        "surface": shares(by_key["surface"]),
        # Quality over the tagged length only, so a country that does not tag
        # surface scores nothing rather than scoring badly.
        "surface_quality": (round(surface_quality_m / surface_cov, 4)
                            if surface_cov else None),
        "rollable_share": round(rollable_m / total, 4),
        "smoothness": shares(by_key["smoothness"]),
        "smoothness_quality": (round(smoothness_m / smooth_cov, 4)
                               if smooth_cov else None),
        "wheelchair": shares(by_key["wheelchair"]),
        "dog": shares(by_key["dog"]),
        "tracktype": shares(by_key["tracktype"]),
    }


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

def wanted_trips(conn, country, all_staged, refresh):
    """{osm relation id: trip id} for the routes this run should read."""
    where = ["t.country = %(cc)s", "t.category = 'hike'", "t.source = 'osm'"]
    if not all_staged:
        where.append("t.status IN ('approved', 'published')")
    else:
        where.append("t.status <> 'rejected'")
    if not refresh:
        where.append("t.way_tags_at IS NULL")
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT t.source_ref, t.id FROM trips t
            WHERE {' AND '.join(where)} AND t.source_ref ~ '^[0-9]+$'""",
                    {"cc": country})
        return {int(ref): tid for ref, tid in cur.fetchall()}


UPDATE_SQL = """
    UPDATE trips SET way_tags = %s, way_tags_at = now() WHERE id = %s
"""


def store(conn, records):
    for i in range(0, len(records), BATCH):
        with conn.cursor() as cur:
            cur.executemany(UPDATE_SQL, records[i:i + BATCH])
        conn.commit()


# ---------------------------------------------------------------------------
# Per country
# ---------------------------------------------------------------------------

def run_country(conn, slug, country, args):
    wanted = wanted_trips(conn, country, args.all, args.refresh)
    conn.commit()
    if not wanted:
        print(f"[{slug}] nothing to read")
        return Counter({"skipped": 1})

    pbf = cached_extract(slug)
    if pbf is None:
        print(f"[{slug}] no extract on disk; run "
              f"pipeline/trails/ingest_osm_routes.py first")
        return Counter({"no_extract": 1})

    counts = Counter()
    t0 = time.time()
    pool = scan_relations(pbf)
    selected = [rid for rid in wanted if rid in pool]
    counts["missing_relation"] = len(wanted) - len(selected)
    print(f"[{slug}] {len(selected)}/{len(wanted)} route relation(s) found in "
          f"the extract ({time.time() - t0:.0f}s)", flush=True)
    if not selected:
        return counts

    expansions, needed = {}, set()
    for rid in selected:
        refs = expand_ways(rid, pool, Counter(), seen=set())
        expansions[rid] = refs
        needed.update(refs)

    t0 = time.time()
    ways = load_way_tags(pbf, needed)
    print(f"[{slug}] {len(ways)}/{len(needed)} member way(s) read with tags "
          f"({time.time() - t0:.0f}s)", flush=True)

    t0 = time.time()
    if ways:
        node_ids = np.unique(np.concatenate([refs for refs, _ in ways.values()]))
    else:
        node_ids = np.empty(0, dtype=np.int64)
    locator = load_locations(pbf, node_ids)
    print(f"[{slug}] {len(locator.ids)}/{len(node_ids)} node location(s) "
          f"({time.time() - t0:.0f}s)", flush=True)

    lengths = {wid: way_length_m(refs, locator) for wid, (refs, _) in ways.items()}

    records, tagged = [], Counter()
    for rid in selected:
        members = [(lengths.get(w, 0.0), ways[w][1])
                   for w in expansions[rid] if w in ways]
        summary = summarise(members)
        if summary is None:
            counts["no_length"] += 1
            continue
        for key in ("sac_scale", "surface", "smoothness", "wheelchair", "dog"):
            if summary["cover"].get(key):
                tagged[key] += 1
        records.append((Jsonb(summary), wanted[rid]))
        counts["summarised"] += 1

    if args.dry_run:
        print(f"[{slug}] dry run: {len(records)} summary(ies), nothing written")
    else:
        store(conn, records)
        print(f"[{slug}] wrote {len(records)} summary(ies)")
    for key in ("sac_scale", "surface", "smoothness", "wheelchair", "dog"):
        n = tagged[key]
        pct = 100.0 * n / max(1, counts["summarised"])
        print(f"    {key:<16} on {n:5d} route(s) ({pct:.0f}%)")
        counts[f"tagged_{key}"] += n
    return counts


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2 (default: every "
                                        "country with an extract on disk)")
    ap.add_argument("--all", action="store_true",
                    help="read every staged route, not only the curated ones")
    ap.add_argument("--refresh", action="store_true",
                    help="re-read routes that already carry a summary")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    by_iso = {}
    for slug, cc in COUNTRIES.items():
        by_iso.setdefault(cc, []).append(slug)
    wanted_iso = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
                  if args.countries else sorted(by_iso))

    totals = Counter()
    t0 = time.time()
    with connect() as conn:
        apply_schema(conn)
        for cc in wanted_iso:
            for slug in by_iso.get(cc, []):
                try:
                    totals += run_country(conn, slug, cc, args)
                except Exception as exc:      # coverage beats fail fast
                    print(f"[{slug}] FAILED: {type(exc).__name__}: {exc}")
                    totals["failed"] += 1

    print("\n" + "=" * 58)
    print(f"{totals['summarised']:,} route(s) summarised in "
          f"{(time.time() - t0) / 60:.1f} min")
    done = max(1, totals["summarised"])
    for key in ("sac_scale", "surface", "smoothness", "wheelchair", "dog"):
        n = totals[f"tagged_{key}"]
        print(f"  {key:<16} present somewhere on {n:,} route(s) "
              f"({100.0 * n / done:.0f}%)")
    if totals["failed"]:
        print(f"{totals['failed']} country pass(es) failed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
