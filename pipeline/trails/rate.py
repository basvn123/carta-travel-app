"""The published trail rating, 0 to 10, and the reasons behind it.

Nothing in this file is anybody's opinion, because no opinion is available to
us: AllTrails and Komoot have no public API and forbid reuse of their reviews,
Strava's heatmap is licensed for improving OpenStreetMap and nothing else, and
Instagram removed location search in 2020. Buying a star rating is not an
option, and inventing one would be worse.

So the rating is built from what open data can honestly say about a walk, and
each component is a claim a reader could check:

  designation   iwn/nwn/rwn/lwn on the OSM relation. An international or
                national waymarked route is maintained, signposted and worth
                somebody's budget; a local link path is not the same thing.
  scenery       the named summits, viewpoints, waterfalls, lakes, gorges,
                castles and huts scenic.py found along the line, weighted by
                kind and measured PER KILOMETRE, so a 4 km walk past three
                waterfalls beats a 40 km one past four.
  relief        ascent per kilometre, how high it gets and how much the
                profile actually moves, from the Copernicus DEM. A flat
                towpath and an alpine traverse are not the same walk.
  prominence    whether anybody wrote about the route: the wikidata/wikipedia
                tag, and the sitelink and pageview signals popularity.py
                already computes.
  photographs   how many usable Commons photographs were taken ON the line.
                A place people stop to photograph is a place worth walking,
                and unlike the others this signal is about the view rather
                than the infrastructure.
  shape         loops score above there-and-back, which is the preference the
                whole layer is tuned for, plus a mild bonus for a length that
                fits a day.
  variety       how many DIFFERENT kinds of thing are on the line. A walk past
                a waterfall, a lake and a castle beats one past nine trees,
                and the scenery term above cannot tell those apart because it
                sums weights. (v2)
  surface       what is underfoot, from the member way tags, minus the share
                of the route that is a road. Road walking is the most common
                complaint about any OSM derived route and nothing scored it.
                (v2)

Scored within a REGION where the region has enough rows to rank against, and
within the country otherwise. Absolute scoring would hand the Alps every high
mark and leave the Netherlands with nothing above 4, which tells a Dutch
walker nothing about which Dutch walk to take; and within-country scoring
alone still ranks a Baltic coast walk against the Tatras. Each component is
converted to its percentile inside its reference class first, so every list
spans the scale and the top of it is that class's best.

The same evidence produces `reasons`, a list of codes the app turns into
sentences ("three named summits, the highest at 2,410 m"). The wire carries
codes and numbers, never prose, so the explanation lands in all six UI
languages instead of only in English.

Runs last, after curate.py, elevation.py, scenic.py and trail_images.py.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/rate.py
    python pipeline/trails/rate.py --countries SI --verbose
    python pipeline/trails/rate.py --dry-run --countries NO
"""

import argparse
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
from scenic import KINDS as SCENIC_WEIGHTS  # noqa: E402

# Weights sum to 1. Scenery leads because it is the only component that says
# what you will actually look at; designation and relief describe the walk,
# prominence and photographs describe how well known it is.
#
# v2 took two points off scenery and one each off prominence, shape,
# designation and photos to pay for the two new terms. Nothing was reweighted
# for its own sake: the six that were here keep their order and very nearly
# their size, because the model they encode was right and only incomplete.
WEIGHTS = {
    "scenery": 0.22,
    "relief": 0.16,
    "shape": 0.15,
    "prominence": 0.14,
    "designation": 0.13,
    "photos": 0.12,
    "variety": 0.05,
    "surface": 0.03,
}
MODEL = "open-signals-v2"

# How many rows a region needs before it is a fair reference class of its own.
# Below this the percentile is measuring noise: with six rows every one of
# them lands at a memorable percentile and none of them means anything, and
# the country is the honest fallback.
REGION_MIN_ROWS = 20

NETWORK_LEVEL = {"iwn": 1.0, "nwn": 0.85, "rwn": 0.6, "lwn": 0.35, "lcn": 0.3}
NETWORK_DEFAULT = 0.2

# The rating band. Nothing published scores below FLOOR: everything here
# already cleared the curation gate, and a 2/10 on a list we chose to publish
# is a statement about the list rather than about the walk.
FLOOR, CEILING = 4.0, 9.8
# How far off the floor the weakest published walk in a country sits. A whole
# country's list bottoming out at exactly FLOOR reads as a scale artefact; a
# little headroom says "this is the weakest of the ones we chose", which is
# what it is.
PAD = 0.12

# A walk that fits a day without filling it. Used for the mild shape bonus
# and for the "good day out" reason code.
DAY_MIN_M, DAY_MAX_M = 6_000, 22_000

# Reason thresholds. Each one is the point where a fact is worth a sentence.
MANY_SUMMITS = 3
BIG_CLIMB_M = 800
STEEP_M_PER_KM = 45
HIGH_ALTITUDE_M = 1_800
PHOTOGENIC = 4
RICH_SCENERY_PER_KM = 1.2
# Three different KINDS of thing on one walk is the point at which the variety
# is worth a sentence rather than a component.
VARIED_KINDS = 3
# A route this much of which is a road is one a walker deserves warning about.
# 20 percent of a 12 km walk is two and a half kilometres of tarmac.
ROAD_WALK_SHARE = 0.20


def pct_rank(values):
    """value -> 0..1 percentile within the list, ties sharing a rank.

    Plain min-max would let one outlier (a 200 km trek among day walks)
    compress everything else into the bottom tenth of the scale."""
    ordered = sorted(values)
    n = len(ordered)
    if n <= 1:
        return lambda v: 0.5
    # Index of the first item >= v, so equal values get the same rank.
    import bisect

    def rank(v):
        lo = bisect.bisect_left(ordered, v)
        hi = bisect.bisect_right(ordered, v)
        mid = (lo + hi - 1) / 2
        return mid / (n - 1)

    return rank


# Tier l is excluded, not merely unranked: a listed row is one the wire ships
# WITHOUT a rating key, and the only way to guarantee the app cannot render a
# number nobody earned is for the number never to exist. rate.py also NULLs
# any rating a row carried before it was demoted to l.
FETCH_SQL = """
    SELECT t.id, t.country, t.title, t.network, t.distance_m, t.ascent_m,
           t.is_loop, t.highlights, t.elevation, t.nuts3,
           t.highlight_kinds, t.surface,
           t.raw_tags->>'wikidata'  AS wikidata,
           t.raw_tags->>'wikipedia' AS wikipedia,
           p.score AS popularity,
           (SELECT count(*) FROM images i
             WHERE i.subject_type = 'trip' AND i.subject_id = t.id
               AND i.rank IS NOT NULL) AS n_photos
    FROM trips t
    LEFT JOIN LATERAL (
        SELECT v.score FROM validation_runs v
        WHERE v.subject_type = 'trip' AND v.subject_id = t.id
          AND v.check_name IN ('popularity', 'popularity_dayhike')
        ORDER BY v.score DESC NULLS LAST LIMIT 1
    ) p ON true
    WHERE t.country = %s AND t.category = 'hike'
      AND t.status IN ('approved', 'published')
      AND t.tier IS DISTINCT FROM 'l'
"""

CLEAR_LISTED_SQL = """
    UPDATE trips SET rating = NULL, rating_parts = NULL, rated_at = NULL
    WHERE country = %s AND category = 'hike' AND tier = 'l'
      AND rating IS NOT NULL
"""

COLS = ("id", "country", "title", "network", "distance_m", "ascent_m",
        "is_loop", "highlights", "elevation", "nuts3",
        "highlight_kinds", "surface", "wikidata", "wikipedia",
        "popularity", "n_photos")


def fetch(conn, cc):
    with conn.cursor() as cur:
        cur.execute(FETCH_SQL, (cc,))
        return [dict(zip(COLS, r)) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Raw components, before the within-country percentile
# ---------------------------------------------------------------------------

def scenery_raw(row):
    """Weighted scenic features per kilometre, damped for very short walks.

    Per kilometre rather than per route, or every long trek would out-score
    every day loop simply by covering more ground. The +1 km damping stops a
    2 km path past one viewpoint reading as denser than anything in the Alps."""
    h = row.get("highlights") or {}
    weight = float(h.get("weight") or 0)
    km = max(0.0, (row.get("distance_m") or 0) / 1000.0)
    return weight / (km + 1.0)


def relief_raw(row):
    """How much the ground moves: climb rate, top height and profile spread."""
    km = max(0.5, (row.get("distance_m") or 0) / 1000.0)
    ascent = float(row.get("ascent_m") or 0)
    per_km = ascent / km
    elev = row.get("elevation") or {}
    top = float(elev.get("ele_max_m") or 0)
    low = float(elev.get("ele_min_m") or 0)
    spread = max(0.0, top - low)
    # log damping: the difference between 0 and 400 m of climb matters far
    # more than the difference between 2,000 and 2,400.
    return (math.log1p(per_km) * 1.6
            + math.log1p(max(0.0, top)) * 0.5
            + math.log1p(spread) * 0.6)


def prominence_raw(row):
    own = 1.0 if (row.get("wikidata") or row.get("wikipedia")) else 0.0
    pop = float(row.get("popularity") or 0) / 100.0
    return own * 0.6 + min(1.0, max(0.0, pop)) * 0.4


def photos_raw(row):
    return float(row.get("n_photos") or 0)


def designation_raw(row):
    return NETWORK_LEVEL.get((row.get("network") or "").lower(), NETWORK_DEFAULT)


def shape_raw(row):
    """Loop first, then a walk whose length fits the day people have."""
    score = 0.62 if row.get("is_loop") else 0.0
    d = row.get("distance_m") or 0
    if DAY_MIN_M <= d <= DAY_MAX_M:
        score += 0.38
    elif d < DAY_MIN_M:
        score += 0.20
    elif d <= 40_000:
        score += 0.24
    return min(1.0, score)


def variety_raw(row):
    """How many DIFFERENT kinds of thing the route runs past.

    The scenery term sums weights, so nine viewpoints out-score a waterfall,
    a lake and a castle, and the second walk is the better day out by a
    distance. Distinct highlight CODES, from attributes.py, which is also
    exactly what the filter chips offer: a route that can answer three chips
    is a route with three things on it."""
    codes = row.get("highlight_kinds") or []
    return float(len(set(codes)))


def surface_raw(row):
    """What is underfoot, minus the share of the walk that is a road.

    attributes.py has already blended the tagged share towards neutral by how
    much of the line said anything, so a country that does not map surface
    scores mid-field rather than bottom. Nothing here punishes a route for
    the silence of its mappers."""
    s = row.get("surface") or {}
    q = s.get("quality")
    return float(q) if q is not None else 0.5


RAW = {
    "scenery": scenery_raw,
    "relief": relief_raw,
    "prominence": prominence_raw,
    "photos": photos_raw,
    "designation": designation_raw,
    "shape": shape_raw,
    "variety": variety_raw,
    "surface": surface_raw,
}


# ---------------------------------------------------------------------------
# Reasons: why is this one worth the walk
# ---------------------------------------------------------------------------

VIEW_KINDS = ("peak", "volcano", "viewpoint")
WATER_KINDS = ("waterfall", "lake", "hot_spring")
BUILT_KINDS = ("castle", "ruins", "monastery", "lighthouse")


def reasons_for(row, parts):
    """Reason codes plus the numbers the app needs to write the sentence.

    Ordered strongest first and capped by the caller, because three specific
    reasons read as an argument and eight read as a specification."""
    out = []
    h = row.get("highlights") or {}
    features = h.get("features") or []
    by_kind = Counter(f["kind"] for f in features)
    named = {k: [f for f in features if f["kind"] == k] for k in by_kind}
    km = max(0.1, (row.get("distance_m") or 0) / 1000.0)
    elev = row.get("elevation") or {}

    def add(code, **data):
        out.append({"code": code, **data})

    # What you will see, in the order a walker cares about.
    peaks = named.get("peak", []) + named.get("volcano", [])
    if peaks:
        highest = max(peaks, key=lambda f: f.get("ele_m") or 0)
        if len(peaks) >= MANY_SUMMITS:
            add("summits", n=len(peaks), name=highest.get("name"),
                ele=highest.get("ele_m"))
        else:
            add("summit", name=highest.get("name"), ele=highest.get("ele_m"))
    if by_kind.get("viewpoint"):
        add("viewpoints", n=by_kind["viewpoint"])
    if by_kind.get("waterfall"):
        f = named["waterfall"][0]
        add("waterfall", n=by_kind["waterfall"], name=f.get("name"))
    if by_kind.get("glacier"):
        add("glacier", name=named["glacier"][0].get("name"))
    if by_kind.get("gorge"):
        add("gorge", name=named["gorge"][0].get("name"))
    if by_kind.get("lake"):
        add("lakes", n=by_kind["lake"], name=named["lake"][0].get("name"))
    if by_kind.get("beach"):
        add("coast", n=by_kind["beach"])
    for kind in BUILT_KINDS:
        if by_kind.get(kind):
            add(kind, name=named[kind][0].get("name"))
            break
    if by_kind.get("cave"):
        add("cave", name=named["cave"][0].get("name"))

    # How the walk feels.
    ascent = row.get("ascent_m") or 0
    if ascent >= BIG_CLIMB_M:
        add("bigClimb", m=int(ascent))
    elif ascent / km >= STEEP_M_PER_KM:
        add("steady", perKm=int(ascent / km))
    top = elev.get("ele_max_m")
    if top and top >= HIGH_ALTITUDE_M:
        add("high", m=int(top))
    if by_kind.get("hut"):
        add("huts", n=by_kind["hut"])
    if by_kind.get("spring") or by_kind.get("water"):
        add("water", n=by_kind.get("spring", 0) + by_kind.get("water", 0))

    # What kind of outing it is.
    if row.get("is_loop"):
        add("loop")
    d = row.get("distance_m") or 0
    if DAY_MIN_M <= d <= DAY_MAX_M:
        add("dayOut", km=round(d / 1000.0, 1))
    elif d > 45_000:
        add("trek", km=round(d / 1000.0))

    # Why we believe it is any good.
    net = (row.get("network") or "").lower()
    if net in ("iwn", "nwn"):
        add("waymarked", level=net)
    if row.get("wikidata") or row.get("wikipedia"):
        add("known")
    if (row.get("n_photos") or 0) >= PHOTOGENIC:
        add("photogenic", n=row["n_photos"])
    if h.get("weight") and h["weight"] / km >= RICH_SCENERY_PER_KM:
        add("dense", n=h.get("n_near"))
    # v2. Variety is the claim the density term cannot make, and the road
    # share is the one complaint about an OSM derived route that nobody was
    # ever told about before they parked.
    kinds = set(row.get("highlight_kinds") or [])
    if len(kinds) >= VARIED_KINDS:
        add("varied", n=len(kinds))
    road = float((row.get("surface") or {}).get("road_share") or 0)
    if road >= ROAD_WALK_SHARE:
        add("roadWalk", pct=int(round(road * 100)))
    return out


# ---------------------------------------------------------------------------
# Rating
# ---------------------------------------------------------------------------

def reference_classes(rows):
    """{row id: (class key, [rows in that class])}.

    Invariant 5 of the regions brief, generalised: a row is ranked inside its
    own REGION when the region has enough rows to be a fair field, and inside
    its country otherwise. A Dutch dune walk is not judged against the Alps
    (the country rule, which was right), and a Bavarian valley walk is no
    longer judged against the Zugspitze either.

    The threshold is the whole honesty of it. Below REGION_MIN_ROWS the
    percentile is measuring the shape of a handful, and a region with four
    routes would publish one 9.8 and one 4.1 whatever they were like."""
    by_region = defaultdict(list)
    for r in rows:
        if r.get("nuts3"):
            by_region[r["nuts3"]].append(r)
    classes = {}
    for r in rows:
        n3 = r.get("nuts3")
        pool = by_region.get(n3) if n3 else None
        if pool is not None and len(pool) >= REGION_MIN_ROWS:
            classes[r["id"]] = (n3, pool)
        else:
            classes[r["id"]] = (r["country"], rows)
    return classes


def rate_country(rows, verbose=False):
    if not rows:
        return
    for r in rows:
        r["_raw"] = {k: fn(r) for k, fn in RAW.items()}

    classes = reference_classes(rows)
    # One rank function per (class, component), built once per class rather
    # than once per row: a German list is thousands of rows across hundreds of
    # regions, and rebuilding the sorted array for every one of them is
    # quadratic in the size of the country.
    pools = {key: pool for key, pool in classes.values()}
    ranked_by_class = {
        key: {k: pct_rank([r["_raw"][k] for r in pool]) for k in RAW}
        for key, pool in pools.items()}

    for r in rows:
        class_key, pool = classes[r["id"]]
        ranks = ranked_by_class[class_key]
        parts = {k: round(ranks[k](r["_raw"][k]), 4) for k in RAW}
        r["parts"] = parts
        r["scored_within"] = class_key
        r["scored_against"] = len(pool)
        r["_composite"] = sum(WEIGHTS[k] * parts[k] for k in WEIGHTS)

    # Stretch the composite across the band before it becomes a rating.
    #
    # A weighted sum of percentiles cannot reach its own ends: topping every
    # one of eight components at once does not happen, so the raw composite
    # ran about 0.25 to 0.70 and the first pass published every country's best
    # walk at 8.0 and its weakest at 5.5. That is not a rating, it is the
    # middle of one, and it wasted the half of the scale a reader actually
    # reads.
    #
    # Min-max within the COUNTRY, with a small pad so the floor is not exactly
    # FLOOR. Deliberately the country and not the reference class: the
    # percentile above is what makes a component fair inside a region, and
    # stretching per region as well would put a 9.8 at the top of every region
    # in Europe. One country, one scale, is what makes two numbers on two
    # cards in the same list comparable.
    #
    # Linear, not rank based: rank alone would put every country's best at the
    # ceiling whatever the gap behind it, and the gaps are the information.
    # What survives is the shape of the country's own field.
    composites = [r["_composite"] for r in rows]
    lo, hi = min(composites), max(composites)
    span = max(hi - lo, 1e-6)
    for r in rows:
        scaled = PAD + (1.0 - PAD) * ((r["_composite"] - lo) / span)
        r["rating"] = round(FLOOR + (CEILING - FLOOR) * scaled, 1)
        r["reasons"] = reasons_for(r, r["parts"])

    rows.sort(key=lambda r: -r["rating"])
    if verbose:
        for r in rows[:6]:
            codes = ", ".join(x["code"] for x in r["reasons"][:5])
            print(f"    {r['rating']:>4}  {r['title'][:44]:<44} {codes}")


UPDATE_SQL = """
    UPDATE trips SET rating = %s, rating_parts = %s, rated_at = now()
    WHERE id = %s
"""


def store(conn, rows):
    with conn.cursor() as cur:
        for r in rows:
            cur.execute(UPDATE_SQL, (r["rating"], Jsonb({
                "components": r["parts"],
                "composite": round(r["_composite"], 4),
                "weights": WEIGHTS,
                "raw": {k: round(v, 4) for k, v in r["_raw"].items()},
                "reasons": r["reasons"],
                "model": MODEL,
                # Which field this row's components were ranked inside, and
                # how big it was. Shipped so a reader who asks "8.4 against
                # what" has an answer.
                "scored_within": r.get("scored_within") or r["country"],
                "scored_against": r.get("scored_against"),
                "scaled_within": r["country"],
            }), r["id"]))
    conn.commit()


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
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    sys.stdout.reconfigure(errors="replace")
    with connect() as conn:
        countries = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
                     if args.countries else curated_countries(conn))
        totals = Counter()
        spread = defaultdict(list)
        for cc in countries:
            rows = fetch(conn, cc)
            if not rows:
                continue
            rate_country(rows, verbose=args.verbose)
            if not args.dry_run:
                store(conn, rows)
                # A row demoted to the listed tier since the last pass still
                # carries the rating it earned as a rated one. The wire's
                # promise is that a listed row has no rating key at all, and
                # a stale number in the column is how that promise breaks.
                with conn.cursor() as cur:
                    cur.execute(CLEAR_LISTED_SQL, (cc,))
                    totals["cleared"] += cur.rowcount
                conn.commit()
            totals["rated"] += len(rows)
            totals["no_reason"] += sum(1 for r in rows if not r["reasons"])
            totals["by_region"] += sum(1 for r in rows
                                       if r.get("scored_within") != cc)
            spread[cc] = [r["rating"] for r in rows]
            top = rows[0]
            print(f"{cc}: {len(rows):5d} rated, "
                  f"{min(spread[cc]):.1f}-{max(spread[cc]):.1f}, "
                  f"{sum(1 for r in rows if r.get('scored_within') != cc)} "
                  f"ranked within their region, "
                  f"best {top['title'][:40]} ({top['rating']})")

        print("\n" + "=" * 58)
        print(f"{totals['rated']:,} routes rated across {len(spread)} countries "
              f"({MODEL})")
        print(f"{totals['by_region']:,} ranked inside their own region "
              f"(>= {REGION_MIN_ROWS} rows), the rest against their country")
        if totals["cleared"]:
            print(f"{totals['cleared']:,} rating(s) cleared off rows that are "
                  f"now listed rather than rated")
        if totals["no_reason"]:
            print(f"{totals['no_reason']:,} carry no reason code at all: "
                  f"nothing named on the line, no relief, no article. They "
                  f"still rate, they just cannot explain themselves.")
        if args.dry_run:
            print("dry run: nothing written")


if __name__ == "__main__":
    main()
