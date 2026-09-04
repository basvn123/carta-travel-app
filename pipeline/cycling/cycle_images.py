"""Photographs of the RIDE, anchored on the route line.

This is pipeline/trails/trail_images.py pointed at cycle_routes, and it
imports that module rather than restating it: the candidate search, the
category fetch, the junk regexes, the view-evidence test, the scoring and the
hero/gallery pick are all the trails engine, which was tuned against a swept
evalset and should not be re-tuned by hand for a second layer. What changes
here is only where the geometry comes from and where the answer is stored.

Why anchoring matters more on a bike than on foot. A trail card that borrows
the nearest town's hero shows the wrong mountain. A cycle route card that
borrows one shows a town the rider passes through in four minutes on a
three hundred kilometre route. Every candidate here had its camera standing
within CANDIDATE_M of the line, measured against the real geometry with
ST_Distance, not against the probe that happened to find it.

Two writes, on purpose:
  images table       one row per photograph, which is where the NC and ND
                     CHECK constraint lives. A non-commercial file cannot
                     physically reach the app through this path.
  cycle_routes.images  the same rows denormalised for the export, so the
                     wire build is one query rather than one per route.

Storage layout for GB and IE also picks up Geograph through the trails
engine's own source list, which is the photo hole brief 02 widened the funnel
for and is most of what exists for a Scottish B road.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/cycling/cycle_images.py --countries GB
    python pipeline/cycling/cycle_images.py --countries GB --limit 40 --verbose
    python pipeline/cycling/cycle_images.py --refresh --countries NL
"""

import argparse
import importlib.util
import json
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))
sys.path.insert(0, str(ROOT / "pipeline"))

import cycle_sources as S  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

# Every lab connection in this layer goes through the patient wrapper:
# the machine is shared and a ten second connect timeout loses runs.
connect = S.lab_connect


def _trail_images():
    """pipeline/trails/trail_images.py, loaded by path under its own folder."""
    path = ROOT / "pipeline" / "trails" / "trail_images.py"
    spec = importlib.util.spec_from_file_location("carta_trail_images", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["carta_trail_images"] = mod
    old = list(sys.path)
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.path[:] = old
    return mod


T = _trail_images()

SUBJECT = "cycle_route"
POINT_RE = re.compile(r"(-?\d+\.?\d*)\s+(-?\d+\.?\d*)")

# A cycle route is far longer than a walk, so it wants more probes spread
# further apart. Six to sixteen, one roughly every 12 km: a 380 km NCN route
# probed every 3.5 km like a hike would be a hundred Commons calls for a
# gallery of six.
PROBES_MIN, PROBES_MAX, PROBE_EVERY_M = 6, 16, 12_000
# Named features from the scenic sweep are where people actually stop and
# photograph, so they get probes of their own on top of the even spacing.
FEATURE_PROBES = 8
WORKERS = 6


def log(msg):
    print(f"[cycling] {msg}", flush=True)


def n_probes(distance_m):
    n = int((distance_m or 0) / PROBE_EVERY_M)
    return max(PROBES_MIN, min(PROBES_MAX, n))


# ---------------------------------------------------------------------------
# Which routes to search
# ---------------------------------------------------------------------------

TARGETS_SQL = """
    SELECT r.id FROM cycle_routes r
    WHERE r.status <> 'rejected'
      AND r.distance_m >= 10000
      AND (r.name IS NOT NULL OR r.ref IS NOT NULL)
      AND (%(countries)s::text[] IS NULL OR r.country = ANY(%(countries)s))
      {having}
    ORDER BY r.rating DESC NULLS LAST, r.distance_m DESC
"""

HAVE_PHOTOS = """
      AND NOT EXISTS (SELECT 1 FROM images i
                      WHERE i.subject_type = '%s' AND i.subject_id = r.id
                        AND i.rank IS NOT NULL)""" % SUBJECT

SEARCHED_EMPTY = """
      AND NOT EXISTS (SELECT 1 FROM validation_runs v
                      WHERE v.subject_type = '%s' AND v.subject_id = r.id
                        AND v.check_name = 'cycle_photos')""" % SUBJECT


def fetch_targets(conn, countries, refresh, missing=False, limit=0):
    """Routes worth searching, best first.

    Two exclusions, the same pair the trails engine learned to need. Skipping
    routes that already HAVE photographs is obvious; skipping routes a
    previous run searched and found nothing for is the one that matters,
    because Commons genuinely has no free photograph of most anonymous
    regional loops and without the record of the empty answer every re-run
    spends its first hour re-asking about them.
    """
    having = "" if refresh else (HAVE_PHOTOS if missing
                                 else HAVE_PHOTOS + SEARCHED_EMPTY)
    with conn.cursor() as cur:
        cur.execute(TARGETS_SQL.format(having=having),
                    {"countries": list(countries) or None})
        ids = [r[0] for r in cur.fetchall()]
    return ids[:limit] if limit else ids


PROBES_SQL = """
    SELECT r.id, coalesce(r.name, r.ref), r.country, r.distance_m,
           ST_AsText(ST_Points(ST_LineInterpolatePoints(
               ST_LineMerge(ST_Force2D(coalesce(cr.geom, r.geom))),
               %(frac)s, true))) AS probes
    FROM cycle_routes r
    LEFT JOIN cycle_repairs cr
           ON cr.route_id = r.id AND cr.repaired
          AND cr.repair_info->>'source_geom_md5'
              = md5(ST_AsBinary(ST_Force2D(r.geom)))
    WHERE r.id = ANY(%(ids)s)
      AND GeometryType(ST_LineMerge(ST_Force2D(coalesce(cr.geom, r.geom))))
          = 'LINESTRING'
"""

# Degree prefilter first, exact planar second, and MATERIALIZED so the route
# geometry is simplified and reprojected ONCE rather than once per candidate.
# The geography version of this query scanned all 972,000 scenic points for
# every route and never reached its first log line; the same trap the service
# join and the scenic score each had to be dug out of.
FEATURE_PREFILTER_DEG = 0.02
FEATURE_M = 400

FEATURES_SQL = """
    WITH r AS MATERIALIZED (
        SELECT ST_Simplify(ST_Force2D(geom), 0.0002) AS g4326,
               ST_Transform(ST_Simplify(ST_Force2D(geom), 0.0002), 3035) AS g
        FROM cycle_routes WHERE id = %(id)s
    )
    SELECT s.kind, s.name, ST_Y(s.geom), ST_X(s.geom)
    FROM r, scenic_pois s
    WHERE s.kind = ANY(%(kinds)s)
      AND s.name IS NOT NULL
      AND ST_DWithin(s.geom, r.g4326, %(pad)s)
      AND ST_DWithin(ST_Transform(s.geom, 3035), r.g, %(m)s)
    LIMIT %(n)s
"""

FEATURE_KINDS = ("peak", "viewpoint", "waterfall", "lake", "castle", "gorge",
                 "monastery", "lighthouse", "beach", "arch", "glacier")


def load_rows(conn, ids):
    """One search row per route: probe coordinates plus its named features."""
    out = []
    with conn.cursor() as cur:
        for rid in ids:
            cur.execute("""SELECT distance_m FROM cycle_routes WHERE id = %s""",
                        (rid,))
            got = cur.fetchone()
            if not got:
                continue
            n = n_probes(got[0])
            # ST_LineInterpolatePoints takes ONE spacing fraction plus
            # repeat=true, not a list of positions: it walks the line laying
            # down a point every `frac` of its length. Passing a list is the
            # obvious-looking mistake and the function simply does not exist
            # with that signature.
            frac = 1.0 / float(n - 1) if n > 1 else 0.5
            cur.execute(PROBES_SQL, {"ids": [rid], "frac": frac})
            row = cur.fetchone()
            if not row:
                continue
            rid, title, country, distance_m, probes = row
            pts = [(float(la), float(lo))
                   for lo, la in POINT_RE.findall(probes or "")]
            seen = {(round(a, 4), round(b, 4)) for a, b in pts}
            cur.execute(FEATURES_SQL, {"id": rid, "kinds": list(FEATURE_KINDS),
                                       "n": FEATURE_PROBES,
                                       "pad": FEATURE_PREFILTER_DEG,
                                       "m": FEATURE_M})
            features = []
            for kind, name, lat, lon in cur.fetchall():
                features.append({"kind": kind, "name": name,
                                 "lat": float(lat), "lon": float(lon)})
                key = (round(float(lat), 4), round(float(lon), 4))
                if key not in seen:
                    seen.add(key)
                    pts.append((float(lat), float(lon)))
            if not pts:
                continue
            out.append({"id": rid, "title": title, "country": country,
                        "distance_m": distance_m, "points": pts,
                        "highlights": {"features": features}})
    return out


# ---------------------------------------------------------------------------
# Measure candidates against the real line
# ---------------------------------------------------------------------------

MEASURE_SQL = """
    WITH line AS MATERIALIZED (
        SELECT ST_LineMerge(ST_Force2D(coalesce(cr.geom, r.geom))) AS g,
               ST_Length(ST_LineMerge(ST_Force2D(
                   coalesce(cr.geom, r.geom)))::geography) AS len_m
        FROM cycle_routes r
        LEFT JOIN cycle_repairs cr
               ON cr.route_id = r.id AND cr.repaired
              AND cr.repair_info->>'source_geom_md5'
                  = md5(ST_AsBinary(ST_Force2D(r.geom)))
        WHERE r.id = %(id)s
    ), pt AS (
        SELECT ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326) AS p
    )
    SELECT ST_Distance(pt.p::geography, line.g::geography) AS off_m,
           ST_LineLocatePoint(line.g, pt.p) * line.len_m AS along_m,
           (SELECT min(ST_Distance(pt.p::geography, s.geom::geography))
              FROM scenic_pois s
             WHERE s.kind = ANY(%(view_kinds)s)
               AND ST_DWithin(s.geom, pt.p, %(pad)s)) AS view_m
    FROM line, pt
"""


def measure(conn, rid, cands):
    """Attach off_m, along_m and view_m to every candidate, from the geometry.

    Measuring against the probe that found a file would rank a photograph by
    which probe caught it rather than by where the camera stood, which is the
    mistake the trails engine documents and does not make.
    """
    kept = []
    with conn.cursor() as cur:
        for cand in cands:
            if cand.get("lat") is None:
                continue
            cur.execute(MEASURE_SQL, {"id": rid, "lat": cand["lat"],
                                      "lon": cand["lon"],
                                      "view_kinds": list(T.VIEW_KINDS),
                                      "pad": T.VIEW_PAD_DEG})
            got = cur.fetchone()
            if not got:
                continue
            off_m, along_m, view_m = got
            if off_m is None:
                continue
            cand["off_m"] = float(off_m)
            cand["along_m"] = float(along_m or 0)
            cand["view_m"] = float(view_m) if view_m is not None else None
            kept.append(cand)
    return kept


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------

UPSERT_SQL = """
    INSERT INTO images (subject_type, subject_id, url, title, author,
                        source_url, license, attribution_text, is_approved,
                        rank, score, width, height, caption, license_url,
                        taken_lat, taken_lon, along_m)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true,
            %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (subject_type, subject_id, url) DO UPDATE SET
        rank = EXCLUDED.rank, score = EXCLUDED.score,
        along_m = EXCLUDED.along_m, is_approved = true
"""

CLEAR_SQL = "DELETE FROM images WHERE subject_type = %s AND subject_id = %s"

EMPTY_SQL = """
    INSERT INTO validation_runs
        (subject_type, subject_id, check_name, passed, score, details)
    VALUES (%s, %s, 'cycle_photos', false, 0, %s)
"""


def _meta(cand, key):
    info = cand.get("info") or {}
    return ((info.get("extmetadata") or {}).get(key) or {}).get("value")


def store(conn, rid, picked):
    """Write the photographs, then denormalise onto the route.

    The images table carries the NC/ND CHECK, so a non-commercial licence
    raises here rather than reaching the wire. The jsonb copy on the route is
    a convenience for the export and is rebuilt from the table every time.
    """
    rows = []
    with conn.cursor() as cur:
        cur.execute(CLEAR_SQL, (SUBJECT, rid))
        for rank, cand in enumerate(picked):
            info = cand["info"]
            title = cand["title"]
            author = T.strip_html(_meta(cand, "Artist") or "") or None
            caption = T.strip_html(_meta(cand, "ImageDescription") or "") or None
            license_name = _meta(cand, "LicenseShortName") or "unknown"
            license_url = _meta(cand, "LicenseUrl")
            source_url = ("https://commons.wikimedia.org/wiki/"
                          + title.replace(" ", "_"))
            attribution = ", ".join(x for x in (author, license_name) if x)
            cur.execute(UPSERT_SQL, (
                SUBJECT, rid, info["url"], title, author, source_url,
                license_name, attribution, rank, round(float(cand["score"]), 3),
                info.get("width"), info.get("height"),
                (caption or "")[:400] or None, license_url,
                cand.get("lat"), cand.get("lon"),
                int(round(cand.get("along_m") or 0))))
            rows.append({
                "rank": rank,
                "url": info["url"],
                "thumb": info.get("thumburl") or info["url"],
                "w": info.get("width"), "h": info.get("height"),
                "title": title,
                "author": author,
                "license": license_name,
                "license_url": license_url,
                "source": source_url,
                "score": round(float(cand["score"]), 2),
                "evidence": "view" if cand.get("is_view") else "near",
                "along_m": int(round(cand.get("along_m") or 0)),
                "off_m": int(round(cand.get("off_m") or 0)),
            })
        cur.execute("UPDATE cycle_routes SET images = %s WHERE id = %s",
                    (Jsonb(rows), rid))
    conn.commit()
    return rows


def mark_empty(conn, rid, n_candidates, n_points):
    with conn.cursor() as cur:
        cur.execute(EMPTY_SQL, (SUBJECT, rid,
                                Jsonb({"candidates": n_candidates,
                                       "probes": n_points,
                                       "note": "Commons had nothing usable "
                                               "on this line"})))
        cur.execute("UPDATE cycle_routes SET images = '[]'::jsonb "
                    "WHERE id = %s AND images IS NULL", (rid,))
    conn.commit()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(conn, countries, refresh=False, missing=False, limit=0, verbose=False):
    ids = fetch_targets(conn, countries, refresh, missing, limit)
    log(f"photos: {len(ids)} route(s) to search")
    if not ids:
        return Counter()
    rows = load_rows(conn, ids)
    log(f"photos: {len(rows)} route(s) have a continuous line to probe")

    categories = T.load_categories()
    done = Counter()
    t0 = time.time()
    for i in range(0, len(rows), WORKERS):
        chunk = rows[i:i + WORKERS]
        found = {}
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {pool.submit(T.candidates_for, row, verbose): row
                       for row in chunk}
            for fut in as_completed(futures):
                row = futures[fut]
                try:
                    found[row["id"]] = fut.result()
                except Exception as exc:               # noqa: BLE001
                    done["search_failed"] += 1
                    if verbose:
                        log(f"    {row['id']}: {type(exc).__name__}: {exc}")
                    found[row["id"]] = []
        titles = [c["title"] for cands in found.values() for c in cands]
        if titles:
            T.fetch_categories(titles, categories, verbose)
        for row in chunk:
            cands = measure(conn, row["id"], found.get(row["id"]) or [])
            picked = T.pick(cands, row, categories) if cands else []
            if picked:
                store(conn, row["id"], picked)
                done["with_photos"] += 1
                done["photos"] += len(picked)
                if len(picked) >= 4:
                    done["four_plus"] += 1
            else:
                mark_empty(conn, row["id"], len(cands), len(row["points"]))
                done["empty"] += 1
        T.save_categories(categories)
        if (i // WORKERS) % 10 == 0:
            log(f"  photos {min(i + WORKERS, len(rows))}/{len(rows)} "
                f"({done['with_photos']} with a picture, "
                f"{time.time() - t0:.0f}s)")
    log(f"photos: {done['with_photos']} route(s) got a gallery "
        f"({done['four_plus']} of them four or more), {done['empty']} had "
        f"nothing usable on Commons, {done['photos']} photographs stored")
    return done


# A hold file, honoured before any work. Same pattern the photo engine uses
# for its lake rescore (cache/lakes/.rescore_hold), and it exists for the same
# reason: the photo pass is the longest stage in the layer by an order of
# magnitude, and a run already in flight cannot be re-scoped by editing the
# shell script driving it, because bash reads that script by byte offset.
#
# Delete the file to let photos run again. The reason is stored inside it so
# whoever finds it does not have to guess why the galleries stopped.
HOLD_FILE = ROOT / "cache" / "cycling" / ".photos_hold"


def held():
    if not HOLD_FILE.exists():
        return None
    try:
        return HOLD_FILE.read_text(encoding="utf-8").strip() or "no reason given"
    except OSError:
        return "unreadable hold file"


def main():
    sys.stdout.reconfigure(errors="replace")
    why = held()
    if why:
        log(f"photos: HELD, skipping. {why}")
        log(f"photos: delete {HOLD_FILE} to run again")
        return
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--missing-only", action="store_true",
                    help="retry only the routes that still have no picture")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    countries = ([c.strip().upper() for c in args.countries.split(",")
                  if c.strip()] if args.countries else [])
    with connect() as conn:
        run(conn, countries, args.refresh, args.missing_only, args.limit,
            args.verbose)


if __name__ == "__main__":
    main()
