"""Trail running and gravel: two activities OSM does not tag, derived here.

ROUTES.md R8. Six of its activities are native OSM tags and reach the graph
through hierarchy.py's scan. Three are not tagged at all, and this module
holds the two that can be answered honestly from what we already measure.
The rules are HERE, in the docstring, because a derived activity is an
opinion wearing a filter's clothes and the opinion has to be legible.

TRAIL RUNNING, over published hiking routes.

  shape         loop or out-and-back. A point-to-point needs a car at both
                ends, which is a different sport's logistics.
  distance      8 to 30 km. Below 8 is a warm-up somebody does from their
                own door without consulting an app; above 30 is an ultra,
                and the people who run those are not looking for a
                suggestion from a travel catalogue.
  ascent        under 60 m per km. Past that it is a climb with running
                shoes on, and the pace assumptions behind every other
                number stop holding.
  underfoot     more path and track than road, from way_tags: a route that
                is mostly asphalt is a road run, and a road run does not
                need a trail catalogue.
  grade         sac_scale T1 or T2 where it is tagged. T3 is exposed
                scrambling; running it is a claim we will not make for
                somebody else.
  waymarked     signposted on the ground. Running is the activity where
                stopping to re-read a map is most expensive.

  It is SCORED for runnability rather than merely filtered, because the
  rules above admit a 29 km route with 1,700 m of climb and a 9 km rolling
  loop equally, and they are not equally worth a runner's Saturday. The
  score is the mean of four readings, each 0 to 1: how flat, how soft
  underfoot, how close to a natural 10 to 20 km, and how well signed.

GRAVEL, over published cycle routes.

  unpaved       40 to 85% of the LENGTH, measured from way_spans, which are
                positioned: a route that is 60% unpaved in one block and one
                that alternates every kilometre are different rides, and
                only positioned spans can tell them apart. Below 40% is a
                road ride; above 85% is mountain biking on a gravel bike.
  tracktype     grade1 to grade3 where tagged. grade4 and grade5 are mud
                and loose rock.
  mtb:scale     absent or 0 or 1. Anything above that is singletrack.

BIKEPACKING is deliberately NOT built here. ROUTES.md asks for routes over
150 km segmented into day stages with an overnight near each break, and
pipeline/cycling/stage_planner.py already does exactly that, gated by ten
hard checks, and publishes 15 tours. A second segmenter over the same rows
would be a worse copy of a working one. What is missing there is candidate
routes, not a module.

Nothing here creates a row. Both activities are FLAGS on the route they
derive from, written into a `derived` jsonb, so one line is one line in the
store however many sports it serves, and the app filters rather than
browsing a parallel catalogue.

Usage, from the repo root (lab up):
    python pipeline/trails/derived_activities.py
    python pipeline/trails/derived_activities.py --countries AT --dry-run

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
from schema import ensure  # noqa: E402

SCHEMA_SQL = ROOT / "tools" / "trailslab" / "initdb" / "11_derived.sql"
REPORT = ROOT / "data" / "reports" / "routes_derived.json"

# Trail running
RUN_MIN_M, RUN_MAX_M = 8_000, 30_000
RUN_MAX_ASCENT_PER_KM = 60.0
RUN_SHAPES = ("loop", "out_back")
RUN_SAC_OK = ("hiking", "mountain_hiking")      # T1, T2
RUN_MIN_PATH_SHARE = 0.5
# The natural shape of a training run: long enough to be worth the drive,
# short enough to be over by lunch.
RUN_SWEET_MIN_M, RUN_SWEET_MAX_M = 10_000, 20_000

# Gravel
GRAVEL_MIN_UNPAVED, GRAVEL_MAX_UNPAVED = 0.40, 0.85
GRAVEL_BAD_TRACKTYPE = ("grade4", "grade5")
GRAVEL_MAX_MTB_SCALE = 1

PAVED_SURFACES = {"asphalt", "paved", "concrete", "concrete:plates",
                  "paving_stones", "sett", "cobblestone", "chipseal",
                  "metal", "wood"}


def clamp(v):
    return max(0.0, min(1.0, v))


def runnable(row):
    """(ok, reasons, score) for one published hiking route."""
    fail = []
    dist = row["distance_m"] or 0
    if not (RUN_MIN_M <= dist <= RUN_MAX_M):
        fail.append("distance")
    if (row["route_type"] or "") not in RUN_SHAPES:
        fail.append("shape")
    per_km = (row["ascent_m"] or 0) / max(0.001, dist / 1000.0)
    if per_km >= RUN_MAX_ASCENT_PER_KM:
        fail.append("ascent")
    wt = row["way_tags"] or {}
    path_share = float(wt.get("path_share") or 0)
    if path_share < RUN_MIN_PATH_SHARE:
        fail.append("underfoot")
    sac = (wt.get("sac_worst") or row["sac_scale"] or "").strip()
    if sac and sac not in RUN_SAC_OK:
        fail.append("grade")
    if not (row["raw_tags"] or {}).get("osmc:symbol"):
        fail.append("waymarked")
    if fail:
        return False, fail, None
    # Runnability: flat, soft, the right length, well signed.
    flat = clamp(1.0 - per_km / RUN_MAX_ASCENT_PER_KM)
    soft = clamp(path_share)
    if RUN_SWEET_MIN_M <= dist <= RUN_SWEET_MAX_M:
        length = 1.0
    elif dist < RUN_SWEET_MIN_M:
        length = clamp((dist - RUN_MIN_M) / (RUN_SWEET_MIN_M - RUN_MIN_M))
    else:
        length = clamp((RUN_MAX_M - dist) / (RUN_MAX_M - RUN_SWEET_MAX_M))
    signed = 1.0 if row["waymark_ref"] else 0.75
    score = round((flat + soft + length + signed) / 4.0, 3)
    return True, [], score


def gravel(row):
    """(ok, reasons, parts) for one cycle route, from positioned way_spans."""
    spans = (row["way_spans"] or {}).get("spans") or []
    tagsets = (row["way_spans"] or {}).get("tagsets") or []
    if not spans:
        return False, ["no_spans"], None
    total = unpaved = 0.0
    worst_mtb = 0
    bad_track = 0.0
    for start, end, idx in spans:
        length = max(0.0, float(end) - float(start))
        total += length
        tags = tagsets[idx] if 0 <= idx < len(tagsets) else {}
        surf = (tags.get("surface") or "").split(";")[0].strip().lower()
        if surf and surf not in PAVED_SURFACES:
            unpaved += length
        if (tags.get("tracktype") or "") in GRAVEL_BAD_TRACKTYPE:
            bad_track += length
        raw = (tags.get("mtb:scale") or "").strip()
        if raw[:1].isdigit():
            worst_mtb = max(worst_mtb, int(raw[0]))
    if total <= 0:
        return False, ["no_length"], None
    share = unpaved / total
    fail = []
    if not (GRAVEL_MIN_UNPAVED <= share <= GRAVEL_MAX_UNPAVED):
        fail.append("unpaved_share")
    if worst_mtb > GRAVEL_MAX_MTB_SCALE:
        fail.append("mtb_scale")
    if bad_track / total > 0.1:
        fail.append("tracktype")
    parts = {"unpaved": round(share, 3), "worst_mtb": worst_mtb,
             "rough_share": round(bad_track / total, 3)}
    return (not fail), fail, parts


HIKE_SQL = """
    SELECT id, country, title, distance_m, ascent_m, route_type, sac_scale,
           way_tags, raw_tags, waymark_ref
    FROM trips
    WHERE status = 'published' AND category = 'hike'
      AND (%(cc)s::text[] IS NULL OR country = ANY(%(cc)s))
"""

CYCLE_SQL = """
    SELECT id, country, COALESCE(name, ref) AS title, distance_m, way_spans
    FROM cycle_routes
    WHERE rating IS NOT NULL
      AND (%(cc)s::text[] IS NULL OR country = ANY(%(cc)s))
"""


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    ccs = [c.strip().upper() for c in args.countries.split(",") if c.strip()] or None

    conn = connect()
    ensure(conn, SCHEMA_SQL, verbose=True)
    t0 = time.time()
    report = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "rules": {
                  "trail_running": {
                      "distance_m": [RUN_MIN_M, RUN_MAX_M],
                      "shapes": list(RUN_SHAPES),
                      "max_ascent_per_km": RUN_MAX_ASCENT_PER_KM,
                      "min_path_share": RUN_MIN_PATH_SHARE,
                      "sac_scale": list(RUN_SAC_OK), "waymarked": True},
                  "gravel": {
                      "unpaved_share": [GRAVEL_MIN_UNPAVED, GRAVEL_MAX_UNPAVED],
                      "max_mtb_scale": GRAVEL_MAX_MTB_SCALE,
                      "rejects_tracktype": list(GRAVEL_BAD_TRACKTYPE)},
                  "bikepacking": "not built: stage_planner.py already segments "
                                 "long cycle routes into day stages behind ten "
                                 "hard checks",
              }}

    with conn.cursor() as cur:
        cur.execute(HIKE_SQL, {"cc": ccs})
        cols = ("id", "country", "title", "distance_m", "ascent_m",
                "route_type", "sac_scale", "way_tags", "raw_tags", "waymark_ref")
        hikes = [dict(zip(cols, r)) for r in cur.fetchall()]
        cur.execute(CYCLE_SQL, {"cc": ccs})
        ccols = ("id", "country", "title", "distance_m", "way_spans")
        cycles = [dict(zip(ccols, r)) for r in cur.fetchall()]
    conn.commit()

    run_rows, run_fail = [], Counter()
    for row in hikes:
        ok, fail, score = runnable(row)
        if ok:
            run_rows.append((row["id"], row["country"], row["title"], score))
        else:
            run_fail[fail[0]] += 1
    grav_rows, grav_fail = [], Counter()
    for row in cycles:
        ok, fail, parts = gravel(row)
        if ok:
            grav_rows.append((row["id"], row["country"], row["title"], parts))
        else:
            grav_fail[fail[0]] += 1

    if not args.dry_run:
        with conn.cursor() as cur:
            cur.execute("UPDATE trips SET derived = derived - 'trail_running' "
                        "WHERE derived ? 'trail_running'")
            cur.executemany(
                "UPDATE trips SET derived = COALESCE(derived, '{}'::jsonb) || %s "
                "WHERE id = %s",
                [(Jsonb({"trail_running": {"score": s}}), i)
                 for i, _cc, _t, s in run_rows])
            cur.execute("UPDATE cycle_routes SET derived = derived - 'gravel' "
                        "WHERE derived ? 'gravel'")
            cur.executemany(
                "UPDATE cycle_routes SET derived = COALESCE(derived, '{}'::jsonb) || %s "
                "WHERE id = %s",
                [(Jsonb({"gravel": p}), i) for i, _cc, _t, p in grav_rows])
        conn.commit()
    conn.close()

    run_cc = Counter(cc for _i, cc, _t, _s in run_rows)
    grav_cc = Counter(cc for _i, cc, _t, _p in grav_rows)
    report["trail_running"] = {
        "candidates": len(hikes), "qualified": len(run_rows),
        "countries": len(run_cc), "per_country": dict(sorted(run_cc.items())),
        "rejected_by": dict(run_fail.most_common()),
        "best": [{"id": i, "cc": cc, "name": t, "score": s}
                 for i, cc, t, s in sorted(run_rows, key=lambda r: -r[3])[:15]],
    }
    report["gravel"] = {
        "candidates": len(cycles), "qualified": len(grav_rows),
        "countries": len(grav_cc), "per_country": dict(sorted(grav_cc.items())),
        "rejected_by": dict(grav_fail.most_common()),
        "best": [{"id": i, "cc": cc, "name": t, **p}
                 for i, cc, t, p in sorted(grav_rows,
                                           key=lambda r: -r[3]["unpaved"])[:15]],
    }
    report["seconds"] = round(time.time() - t0, 1)
    if not args.dry_run:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n",
                          encoding="utf-8")

    r, g = report["trail_running"], report["gravel"]
    print(f"trail running: {r['qualified']:,} of {r['candidates']:,} published "
          f"hikes, in {r['countries']} countries; rejected by {r['rejected_by']}")
    print(f"gravel: {g['qualified']:,} of {g['candidates']:,} scored cycle "
          f"routes, in {g['countries']} countries; rejected by {g['rejected_by']}")
    for label, block in (("trail running", r), ("gravel", g)):
        print(f"  best {label}:")
        for x in block["best"][:5]:
            extra = (f"score {x['score']}" if "score" in x
                     else f"{int(x['unpaved'] * 100)}% unpaved")
            print(f"    {x['cc']}  {str(x['name'])[:46]:<46} {extra}")
    print("dry run: nothing written" if args.dry_run
          else f"report: {REPORT.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
