"""The published cycle-route rating, 0 to 10, and the reasons behind it.

Nothing here is anybody's opinion, for the same reason nothing in the trail
rating is: Komoot, Strava, Ride with GPS and AllTrails all forbid reuse of
their ratings, and inventing one would be worse than having none. So the
rating is assembled from what open data can honestly say about a ride, and
every component is a claim a reader could check against the map.

  scenic        the composite enrich_cycling built: protection, views per
                kilometre, the sea, our own published places, and quiet.
  safety        the house metric. On a bike this is not a footnote; a
                beautiful road with lorries on it is not a good ride.
  surface       paved share and traffic-free share, weighted so that a
                segregated path beats a quiet lane beats a shoulder.
  designation   icn/ncn/rcn/lcn, plus membership of a EuroVelo family. A
                signed international route is maintained, waymarked and has
                somebody's budget behind it; a local link is not that.
  services      whether the route can actually be ridden over days: beds,
                food, water and a station, per hundred kilometres.
  shape         loops above there and back, and a mild bonus for a length
                that fits a day or a week rather than falling between.

RANK AT HOME FIRST (invariant 5). Absolute scoring would give the Alps and
the Dolomites every high mark and leave the Netherlands with nothing above
four, which tells a Dutch rider nothing about which Dutch route to take. Each
component becomes a percentile inside its own region where the region has
enough routes to rank within, and inside its country otherwise. The country
is the fallback, never the default.

No reading is not a bad reading (invariant 6). A component with no measured
value drops out and the remaining weights renormalise for that route, and the
row records which components were missing. Never a zero nobody earned.

The same evidence produces `reasons`, a list of codes the app turns into
sentences through cycleStory.js. The wire carries codes and numbers, never
prose, which is what puts the explanation in all six UI languages.

Runs after enrich_cycling.py and before validate_cycling.py.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/cycling/cycle_index.py
    python pipeline/cycling/cycle_index.py --countries GB --verbose
    python pipeline/cycling/cycle_index.py --dry-run --countries NL
"""

import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import cycle_sources as S  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

# Every lab connection in this layer goes through the patient wrapper:
# the machine is shared and a ten second connect timeout loses runs.
connect = S.lab_connect

MODEL_VERSION = "cycle_index_v1"

# Weights sum to 1. Scenic leads because it is the only component that says
# what the ride is FOR; safety and surface follow because together they decide
# whether it is a ride at all.
WEIGHTS = {
    "scenic": 0.26,
    "safety": 0.20,
    "surface": 0.16,
    "designation": 0.14,
    "services": 0.14,
    "shape": 0.10,
}

NETWORK_LEVEL = {"icn": 1.0, "ncn": 0.85, "rcn": 0.6, "lcn": 0.35}
NETWORK_DEFAULT = 0.2
EUROVELO_BONUS = 0.15        # on top of the network level, capped at 1.0

# A region has to hold this many routes before ranking inside it says
# anything. Below it the country is the honest peer group, which is exactly
# the rule the trails layer's percentile discipline already follows.
MIN_REGION_ROWS = 12

# Percentiles are padded away from the ends: the best route in a country is
# not a 10.0 and the worst is not a 0.0, because neither claim is measurable.
PAD = 0.12

# Reason thresholds. Each is the point at which the fact is worth a sentence,
# not a tuning knob for the score.
LONG_KM = 200
DAY_KM_LO, DAY_KM_HI = 25, 90
MOSTLY_PAVED = 0.85
MOSTLY_FREE = 0.5
QUIET_SCORE = 8.0
CLIMB_PER_KM = 12.0          # metres of ascent per kilometre, a rolling route
FLAT_PER_KM = 3.0
RICH_VIEWS = 0.7             # named features per kilometre
WELL_SERVED_PER_100KM = 4.0


def pct_rank(values):
    """Values to within-group percentiles, ties sharing the mean rank.

    Padded away from 0 and 1 so the extremes are not overclaimed, and stable
    for a group of one (which lands mid-scale rather than at either end).
    """
    pairs = sorted((v, i) for i, v in enumerate(values) if v is not None)
    out = [None] * len(values)
    if not pairs:
        return out
    if len(pairs) == 1:
        out[pairs[0][1]] = 0.5
        return out
    n = len(pairs)
    i = 0
    while i < n:
        j = i
        while j + 1 < n and pairs[j + 1][0] == pairs[i][0]:
            j += 1
        rank = (i + j) / 2.0
        share = rank / (n - 1)
        for k in range(i, j + 1):
            out[pairs[k][1]] = PAD + (1 - 2 * PAD) * share
        i = j + 1
    return out


# ---------------------------------------------------------------------------
# Raw component values
# ---------------------------------------------------------------------------

def scenic_raw(row):
    sc = row.get("scenic") or {}
    return sc.get("score")


def safety_raw(row):
    sf = row.get("safety") or {}
    # A score measured over a tenth of the route is not a reading about the
    # route. Below a third tagged, this component is absent.
    if sf.get("known_share") is not None and sf["known_share"] < 0.33:
        return None
    return sf.get("score")


def surface_raw(row):
    """Comfort: traffic-free counts double, because it is the thing riders
    actually choose a route for, and paved is the baseline underneath it."""
    su = row.get("surface") or {}
    paved = su.get("paved_share")
    free = su.get("traffic_free_share")
    if paved is None and free is None:
        return None
    known = su.get("surface_known_share") or 0
    if paved is not None and known < 0.25:
        paved = None
    parts = [p for p in ((paved, 1.0), (free, 2.0)) if p[0] is not None]
    if not parts:
        return None
    return sum(v * w for v, w in parts) / sum(w for _, w in parts)


def designation_raw(row):
    net = (row.get("network") or "").strip().lower()
    level = NETWORK_LEVEL.get(net, NETWORK_DEFAULT)
    tags = row.get("raw_tags") or {}
    if tags.get("carta:family_ref") or (row.get("cycle_network") or "") == "EuroVelo":
        level = min(1.0, level + EUROVELO_BONUS)
    return level


def services_raw(row):
    """Beds and food per hundred kilometres, capped.

    Measured per distance rather than absolutely, because a 40 km route with
    three towns on it is well served and a 400 km one with three is not.
    """
    towns = row.get("services") or []
    if not towns:
        return None
    km = max(10.0, (row.get("distance_m") or 0) / 1000.0)
    usable = [t for t in towns if (t.get("sleep") or 0) + (t.get("camp") or 0) > 0]
    per100 = len(usable) / km * 100
    return min(1.0, per100 / (WELL_SERVED_PER_100KM * 2))


def shape_raw(row):
    """Loops above there and back, and a length that is somebody's plan."""
    km = (row.get("distance_m") or 0) / 1000.0
    if km <= 0:
        return None
    value = 0.55 if row.get("roundtrip") else 0.3
    if DAY_KM_LO <= km <= DAY_KM_HI:
        value += 0.3                       # a day out
    elif 150 <= km <= 900:
        value += 0.35                      # a tour somebody can take a week for
    elif km > 900:
        value += 0.15                      # a corridor, not an itinerary
    return min(1.0, value)


RAW = {
    "scenic": scenic_raw,
    "safety": safety_raw,
    "surface": surface_raw,
    "designation": designation_raw,
    "services": services_raw,
    "shape": shape_raw,
}


# ---------------------------------------------------------------------------
# Reasons
# ---------------------------------------------------------------------------

def reasons_for(row, parts):
    """Codes and numbers the app turns into sentences. Strongest first."""
    out = []
    km = round((row.get("distance_m") or 0) / 1000.0)
    surface = row.get("surface") or {}
    safety = row.get("safety") or {}
    scenic = row.get("scenic") or {}
    tags = row.get("raw_tags") or {}
    towns = row.get("services") or []
    near = row.get("near") or {}

    family = tags.get("carta:family_ref")
    if family:
        out.append({"code": "eurovelo", "ref": family})
    net = (row.get("network") or "").lower()
    if net in ("icn", "ncn") and not family:
        out.append({"code": "national", "net": net, "ref": row.get("ref")})

    free = surface.get("traffic_free_share")
    if free is not None and free >= MOSTLY_FREE:
        out.append({"code": "trafficFree", "pct": round(free * 100)})
    paved = surface.get("paved_share")
    if paved is not None and paved >= MOSTLY_PAVED:
        out.append({"code": "paved", "pct": round(paved * 100)})
    elif paved is not None and paved < 0.5:
        out.append({"code": "gravel", "pct": round((1 - paved) * 100)})

    if safety.get("score") is not None and safety["score"] >= QUIET_SCORE:
        out.append({"code": "quiet", "score": round(safety["score"], 1)})

    ascent = row.get("ascent_m")
    if ascent and km:
        per_km = ascent / km
        if per_km >= CLIMB_PER_KM:
            out.append({"code": "climbing", "m": int(ascent),
                        "perKm": round(per_km)})
        elif per_km <= FLAT_PER_KM:
            out.append({"code": "flat", "m": int(ascent)})

    sparts = scenic.get("parts") or {}
    if (sparts.get("coast") or 0) >= 0.5:
        out.append({"code": "coast"})
    if (sparts.get("protected") or 0) >= 0.3:
        out.append({"code": "protected",
                    "pct": round(sparts["protected"] * 100)})
    if (scenic.get("views_per_km") or 0) >= RICH_VIEWS:
        out.append({"code": "views", "n": scenic.get("n_views"),
                    "perKm": round(scenic["views_per_km"], 1)})

    for layer, code in (("lake", "lakes"), ("beach", "beaches"),
                        ("peak", "peaks"), ("trail", "trails")):
        ids = near.get(layer) or []
        if len(ids) >= 2:
            out.append({"code": code, "n": len(ids)})

    if row.get("roundtrip"):
        out.append({"code": "loop"})
    if km >= LONG_KM:
        out.append({"code": "longDistance", "km": km})
    elif DAY_KM_LO <= km <= DAY_KM_HI:
        out.append({"code": "dayRide", "km": km})

    beds = [t for t in towns if (t.get("sleep") or 0) >= 3]
    if beds and km:
        out.append({"code": "served", "n": len(beds)})
    stations = [t for t in towns if t.get("station")]
    if stations:
        out.append({"code": "railAccess", "n": len(stations)})

    return out


# ---------------------------------------------------------------------------
# Rating
# ---------------------------------------------------------------------------

FETCH_SQL = """
    SELECT r.id, r.country, r.name, r.ref, r.network, r.cycle_network,
           r.distance_m, r.ascent_m, r.roundtrip, r.raw_tags,
           r.surface, r.safety, r.scenic, r.services, r.near, r.regions
    FROM cycle_routes r
    WHERE r.status <> 'rejected'
      AND r.distance_m >= 3000
      AND (%(countries)s::text[] IS NULL OR r.country = ANY(%(countries)s))
    ORDER BY r.id
"""

COLS = ("id", "country", "name", "ref", "network", "cycle_network",
        "distance_m", "ascent_m", "roundtrip", "raw_tags", "surface",
        "safety", "scenic", "services", "near", "regions")

UPDATE_SQL = """
    UPDATE cycle_routes SET rating = %s, rating_parts = %s, reasons = %s
    WHERE id = %s
"""


def peer_group(row):
    """Which set of routes this one is ranked against, and which it is.

    NUTS2 rather than NUTS3: a cycle route routinely crosses three NUTS3
    regions, so ranking within one of them would rank it against places it
    only clipped. The country is the fallback when the region is too thin.
    """
    rg = row.get("regions") or {}
    return rg.get("n2") or rg.get("co") or None


def rate_group(rows, basis, verbose=False):
    """Percentile every component inside one peer group and combine."""
    ranks = {}
    for name, fn in RAW.items():
        ranks[name] = pct_rank([fn(r) for r in rows])
    out = []
    for i, row in enumerate(rows):
        parts, missing = {}, []
        for name in WEIGHTS:
            value = ranks[name][i]
            if value is None:
                missing.append(name)
            else:
                parts[name] = round(value, 4)
        live = {k: w for k, w in WEIGHTS.items() if k in parts}
        total_w = sum(live.values())
        if total_w <= 0:
            out.append((row, None, None, None))
            continue
        score = sum(parts[k] * w for k, w in live.items()) / total_w
        detail = {
            "parts": parts,
            "missing": missing,
            "weights": {k: round(w / total_w, 4) for k, w in live.items()},
            "basis": basis,
            "peers": len(rows),
            "model": MODEL_VERSION,
        }
        out.append((row, round(score * 10, 2), detail, reasons_for(row, parts)))
    return out


def rate_country(rows, verbose=False):
    """Rank inside regions that are thick enough, inside the country
    otherwise, and never mix the two groups' peers."""
    by_region = defaultdict(list)
    for row in rows:
        by_region[peer_group(row)].append(row)

    thin, results = [], []
    for region, group in by_region.items():
        if region and len(group) >= MIN_REGION_ROWS:
            results.extend(rate_group(group, f"region:{region}", verbose))
        else:
            thin.extend(group)
    if thin:
        cc = thin[0]["country"]
        results.extend(rate_group(thin, f"country:{cc}", verbose))
    return results


def store(conn, results):
    with conn.cursor() as cur:
        for row, score, detail, reasons in results:
            cur.execute(UPDATE_SQL, (
                score, Jsonb(detail) if detail else None,
                Jsonb(reasons) if reasons else None, row["id"]))
    conn.commit()


def model_block():
    """The rating model for index.json. The model ships with the data."""
    return {
        "version": MODEL_VERSION,
        "weights": dict(WEIGHTS),
        "rank_within": {"primary": "nuts2", "fallback": "country",
                        "min_region_rows": MIN_REGION_ROWS},
        "percentile_pad": PAD,
        "network_level": dict(NETWORK_LEVEL),
        "network_default": NETWORK_DEFAULT,
        "eurovelo_bonus": EUROVELO_BONUS,
        "missing_components": "dropped and renormalised, never zero",
    }


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    countries = ([c.strip().upper() for c in args.countries.split(",")
                  if c.strip()] if args.countries else [])

    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(FETCH_SQL, {"countries": list(countries) or None})
            rows = [dict(zip(COLS, r)) for r in cur.fetchall()]
        by_country = defaultdict(list)
        for row in rows:
            by_country[row["country"]].append(row)
        print(f"{len(rows):,} route(s) across {len(by_country)} country(ies)")

        summary = Counter()
        bases = Counter()
        for cc, group in sorted(by_country.items()):
            results = rate_country(group, args.verbose)
            scored = [r for r in results if r[1] is not None]
            summary[cc] = len(scored)
            for _row, _score, detail, _reasons in results:
                if detail:
                    bases[detail["basis"].split(":")[0]] += 1
            if not args.dry_run:
                store(conn, results)
            top = sorted(scored, key=lambda r: -r[1])[:3]
            if args.verbose or args.dry_run:
                print(f"  {cc}: {len(scored)}/{len(group)} scored, top: "
                      + "; ".join(f"{(r[0]['name'] or r[0]['ref'])} "
                                  f"{r[1]:.1f}" for r in top))
        print(f"scored {sum(summary.values()):,} route(s); ranked "
              f"{bases['region']:,} within a region, {bases['country']:,} "
              f"within a country")
        if args.dry_run:
            print("dry run: nothing written")


if __name__ == "__main__":
    main()
