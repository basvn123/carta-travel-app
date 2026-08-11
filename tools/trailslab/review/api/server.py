"""Local review API for the trailslab staging DB.

Serves the review app in tools/trailslab/review/ and nothing else. Three
things are true of this process by construction:

  1. It binds 127.0.0.1 only. Nothing on the network can reach it.
  2. It talks to the local PostGIS lab (pipeline/trails/db.py) and refuses to
     start against a non-local host, so a stray TRAILSLAB_HOST in .env cannot
     quietly point the review queue at somewhere else. A host that looks like
     Supabase is refused outright, flag or no flag: the live project has a
     zero-billing posture and never receives writes from tooling.
  3. status='approved' is reachable only through POST /api/trips/{id}/decision
     with action=approve, which is only reachable from a human clicking
     Approve. Nothing here publishes: approved rows wait for the export step.

Every write also appends a trip_reviews row (who, what, which fields moved),
so the human half of the ledger sits next to the automated validation_runs
half.

Run from the repo root, with the lab DB up:

    python tools/trailslab/review/api/server.py            # port 8011
    python tools/trailslab/review/api/server.py --port 8012 --reload
"""

import argparse
import getpass
import json
import os
import re
import sys
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

from db import connect, settings  # noqa: E402
from repair import REPAIR_FRESH_SQL  # noqa: E402

INITDB = ROOT / "tools" / "trailslab" / "initdb"
# Applied at startup, in order, because initdb scripts only run against an
# empty volume and a lab created before these existed has neither the
# description columns nor the review ledger.
RUNTIME_MIGRATIONS = ("03_trip_descriptions.sql", "04_trip_reviews.sql")

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
# Browsers send Origin on cross-site requests. Any page in the reviewer's
# browser could otherwise POST to this port; only the dev server and direct
# (no-Origin) callers get to write.
ALLOWED_ORIGINS = {
    "http://127.0.0.1:5174", "http://localhost:5174",
    "http://127.0.0.1:4174", "http://localhost:4174",
}

# Display geometry only: 5e-5 degrees is roughly 5 m, well under a map pixel
# at the zooms a reviewer uses, and it turns a 400 km route from tens of
# thousands of vertices into something the browser draws without stalling.
# Metrics never come from this: they are read off the stored geometry.
SIMPLIFY_DEG = 0.00005
PROFILE_POINTS = 700          # elevation chart resolution after downsampling
PORTAL_RADIUS_M = 120.0       # overlay: how close official geometry has to sit
PORTAL_STEP_M = 250.0         # overlay: spacing of the probe points
PORTAL_MAX_POINTS = 400       # overlay: probes per trip, however long it is
PORTAL_PER_POINT = 3          # overlay: nearest segments kept per probe
PORTAL_CAP = 1500             # overlay: segments returned before we stop
PORTAL_TIMEOUT_MS = 15000

# Who is deciding. Resolved at import so a --reload worker (which never runs
# main) still stamps its reviews with a name.
REVIEWER = os.environ.get("TRAILSLAB_REVIEWER") or getpass.getuser()


# ---------------------------------------------------------------------------
# Startup guards and migrations
# ---------------------------------------------------------------------------

def assert_local_db(allow_remote=False):
    """Refuse to run against anything but the local lab."""
    host = str(settings()["host"]).lower()
    if "supabase" in host:
        raise SystemExit(
            f"refusing to start: TRAILSLAB_HOST is {host!r}. The review app "
            "never talks to the live Supabase project.")
    if host not in LOCAL_HOSTS and not allow_remote:
        raise SystemExit(
            f"refusing to start: TRAILSLAB_HOST is {host!r}, which is not a "
            "local host. Point it at the trailslab container, or pass "
            "--allow-remote-db if you really mean it.")


def apply_migrations():
    with connect() as conn:
        for name in RUNTIME_MIGRATIONS:
            sql = (INITDB / name).read_text(encoding="utf-8")
            with conn.cursor() as cur:
                cur.execute(sql)
        conn.commit()


# ---------------------------------------------------------------------------
# Tag normalisation: source tags say what the mapper claimed, the trips
# columns say what the DEM and the geometry measured. The review UI puts the
# two side by side, so the fiddly unit parsing lives here, once.
# ---------------------------------------------------------------------------

def tag_distance_m(raw):
    """OSM distance tag to metres. Bare numbers are km by convention."""
    if not raw:
        return None
    s = str(raw).strip().lower().replace(",", ".")
    m = re.match(r"^([0-9]*\.?[0-9]+)\s*(km|m|mi|miles?)?$", s)
    if not m:
        return None
    val, unit = float(m.group(1)), (m.group(2) or "km")
    if unit == "m":
        return round(val)
    if unit.startswith("mi"):
        return round(val * 1609.34)
    return round(val * 1000)


def tag_metres(raw):
    """Ascent/descent tags: metres, occasionally with a unit suffix."""
    if not raw:
        return None
    s = str(raw).strip().lower().replace(",", ".")
    m = re.match(r"^([0-9]*\.?[0-9]+)\s*(m|km)?$", s)
    if not m:
        return None
    val = float(m.group(1))
    return round(val * 1000) if m.group(2) == "km" else round(val)


def tag_duration_min(raw):
    """Duration tags: 'PT5H30M', '5:30', '5 h', '330'."""
    if not raw:
        return None
    s = str(raw).strip().upper()
    m = re.match(r"^PT(?:([0-9]+)H)?(?:([0-9]+)M)?$", s)
    if m and (m.group(1) or m.group(2)):
        return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)
    m = re.match(r"^([0-9]+):([0-9]{1,2})$", s)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    m = re.match(r"^([0-9]*\.?[0-9]+)\s*(H|HOURS?|MIN|M)?$", s)
    if m:
        val = float(m.group(1))
        unit = m.group(2) or "H"
        return round(val if unit in ("MIN", "M") else val * 60)
    return None


def comparison_rows(trip):
    """Computed metric next to the source tag it can be checked against."""
    tags = trip.get("raw_tags") or {}
    rows = [
        {"field": "distance", "unit": "m", "computed": trip.get("distance_m"),
         "tag_key": "distance", "tag_raw": tags.get("distance"),
         "tag_value": tag_distance_m(tags.get("distance"))},
        {"field": "ascent", "unit": "m", "computed": trip.get("ascent_m"),
         "tag_key": "ascent", "tag_raw": tags.get("ascent"),
         "tag_value": tag_metres(tags.get("ascent"))},
        {"field": "descent", "unit": "m", "computed": trip.get("descent_m"),
         "tag_key": "descent", "tag_raw": tags.get("descent"),
         "tag_value": tag_metres(tags.get("descent"))},
        {"field": "duration", "unit": "min", "computed": trip.get("duration_min"),
         "tag_key": "duration", "tag_raw": tags.get("duration"),
         "tag_value": tag_duration_min(tags.get("duration"))},
    ]
    for row in rows:
        c, t = row["computed"], row["tag_value"]
        row["delta_pct"] = round((c - t) / t * 100, 1) if c and t else None
    return rows


def downsample_profile(profile, target=PROFILE_POINTS):
    """Thin an elevation profile without flattening its peaks.

    Every bucket contributes its lowest and its highest sample, in distance
    order, so a summit never disappears between two evenly spaced picks the
    way a naive every-nth-point stride loses it.
    """
    pts = [p for p in (profile or [])
           if isinstance(p, (list, tuple)) and len(p) >= 2
           and isinstance(p[0], (int, float)) and isinstance(p[1], (int, float))]
    if len(pts) <= target:
        return pts
    bucket = len(pts) / (target / 2)
    out, i = [], 0
    while i < len(pts):
        chunk = pts[int(i):int(i + bucket)] or []
        if chunk:
            lo = min(chunk, key=lambda p: p[1])
            hi = max(chunk, key=lambda p: p[1])
            first, second = (lo, hi) if lo[0] <= hi[0] else (hi, lo)
            out.append(first)
            if second is not first:
                out.append(second)
        i += bucket
    return out


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

QUEUE_SQL = """
SELECT t.id, t.title, t.country, t.category::text AS category,
       t.status::text AS status, t.quality_score, t.distance_m, t.ascent_m,
       t.duration_min, t.difficulty, t.network, t.source, t.updated_at,
       (t.description_md IS NOT NULL) AS has_description,
       pop.score AS curation_rank,
       portal.passed AS portal_ok,
       (rev.id IS NOT NULL) AS reviewed
FROM trips t
LEFT JOIN LATERAL (
    SELECT v.score FROM validation_runs v
    WHERE v.subject_type = 'trip' AND v.subject_id = t.id
      AND v.check_name = 'popularity'
    ORDER BY v.run_at DESC LIMIT 1) pop ON true
LEFT JOIN LATERAL (
    SELECT v.passed FROM validation_runs v
    WHERE v.subject_type = 'trip' AND v.subject_id = t.id
      AND v.check_name = 'portal_agreement'
    ORDER BY v.run_at DESC LIMIT 1) portal ON true
LEFT JOIN LATERAL (
    SELECT r.id FROM trip_reviews r
    WHERE r.trip_id = t.id ORDER BY r.created_at DESC LIMIT 1) rev ON true
WHERE {where}
ORDER BY {order}
LIMIT %(limit)s OFFSET %(offset)s
"""

SORTS = {
    "curation": "pop.score DESC NULLS LAST, t.id",
    "quality": "t.quality_score DESC NULLS LAST, t.id",
    "distance": "t.distance_m DESC NULLS LAST, t.id",
    "title": "t.title, t.id",
    "recent": "t.updated_at DESC, t.id",
}

TRIP_SQL = f"""
SELECT t.id, t.country, t.category::text AS category, t.title,
       t.distance_m, t.ascent_m, t.descent_m, t.duration_min, t.difficulty,
       t.sac_scale, t.network, t.source, t.source_ref, t.license,
       t.attribution_text, t.status::text AS status, t.quality_score,
       t.raw_tags, t.gap_info, t.elevation, t.description_md, t.described_at,
       t.created_at, t.updated_at, t.last_validated_at,
       ST_NPoints(t.geom) AS n_points,
       ST_Length(t.geom::geography) AS geom_length_m,
       ST_AsGeoJSON(ST_Force2D(ST_Simplify(t.geom, %(tol)s)), 6) AS geom_json,
       r.repaired, r.divergence_pct, r.original_len_m, r.repaired_len_m,
       r.repair_info, r.created_at AS repaired_at,
       {REPAIR_FRESH_SQL} AS repair_fresh,
       CASE WHEN r.geom IS NOT NULL
            THEN ST_AsGeoJSON(ST_Force2D(ST_Simplify(r.geom, %(tol)s)), 6)
       END AS repair_geom_json
FROM trips t
LEFT JOIN trip_repairs r ON r.trip_id = t.id
WHERE t.id = %(id)s
"""

CHECKS_SQL = """
SELECT check_name, passed, score, details, run_at
FROM validation_runs
WHERE subject_type = 'trip' AND subject_id = %(id)s
ORDER BY run_at DESC, id DESC
LIMIT 200
"""

REVIEWS_SQL = """
SELECT action, reviewer, note, changed, prev_status::text AS prev_status,
       new_status::text AS new_status, quality_score, created_at
FROM trip_reviews
WHERE trip_id = %(id)s
ORDER BY created_at DESC
LIMIT 50
"""

# Overlay only, and sampled the way crosscheck_portals.py samples.
#
# The obvious query (portal segments within N metres of the whole trip line)
# is fine for a 15 km walk and hopeless for the 423 km E4: one geography
# distance test per candidate over an envelope that covers half a country,
# which ran into the statement timeout. Walking a few hundred points along
# the route instead turns it into a few hundred KNN probes on the GiST index,
# bounded by route length rather than by how much portal data sits in the
# bounding box.
PORTAL_SQL = """
WITH trip AS (SELECT country, geom FROM trips WHERE id = %(id)s),
pts AS (
    SELECT (d.dp).geom AS pt, row_number() OVER () AS rn
    FROM (SELECT ST_DumpPoints(
                     ST_Segmentize(geom::geography, %(step)s)::geometry) AS dp
          FROM trip) d
), stats AS (SELECT count(*) AS n FROM pts),
sampled AS (
    SELECT pt FROM pts, stats
    WHERE (rn - 1) %% GREATEST(1, CEIL(n::numeric / %(maxpts)s))::int = 0
),
near AS (
    SELECT p.id, p.name, p.source, p.geom
    FROM sampled s, trip
    CROSS JOIN LATERAL (
        SELECT p2.id, p2.name, p2.source, p2.geom
        FROM portal_trails p2
        WHERE p2.country = trip.country
          AND ST_DWithin(p2.geom::geography, s.pt::geography, %(radius)s)
        ORDER BY p2.geom::geography <-> s.pt::geography
        LIMIT %(per_point)s) p
)
SELECT DISTINCT ON (id) id, name, source,
       ST_AsGeoJSON(ST_Force2D(ST_Simplify(geom, %(tol)s)), 6) AS geom_json
FROM near
ORDER BY id
LIMIT %(cap)s
"""


def fetch_trip(conn, trip_id):
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(TRIP_SQL, {"id": trip_id, "tol": SIMPLIFY_DEG})
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"no trip {trip_id}")
    return row


def log_review(cur, trip_id, action, note=None, changed=None,
               prev_status=None, new_status=None, quality_score=None):
    cur.execute(
        """INSERT INTO trip_reviews (trip_id, action, reviewer, note, changed,
                                     prev_status, new_status, quality_score)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (trip_id, action, REVIEWER, note or None,
         Jsonb(changed) if changed else None, prev_status, new_status,
         quality_score))


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="trailslab review", docs_url=None, redoc_url=None)


@app.middleware("http")
async def local_only(request: Request, call_next):
    """Writes need a same-origin (or no) Origin header."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and origin not in ALLOWED_ORIGINS:
            return JSONResponse(status_code=403,
                                content={"detail": f"origin {origin} not allowed"})
    return await call_next(request)


@app.get("/api/health")
def health():
    cfg = settings()
    with connect() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("""SELECT status::text AS status, count(*) AS n
                       FROM trips GROUP BY 1 ORDER BY 1""")
        counts = {r["status"]: r["n"] for r in cur.fetchall()}
        cur.execute("SELECT DISTINCT country FROM trips ORDER BY 1")
        countries = [r["country"] for r in cur.fetchall()]
    return {"ok": True, "reviewer": REVIEWER, "counts": counts,
            "countries": countries,
            "db": {"host": cfg["host"], "port": cfg["port"], "dbname": cfg["dbname"]}}


@app.get("/api/queue")
def queue(status: str = "needs_review", country: str = "", q: str = "",
          category: str = "", sort: str = "curation",
          limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    where, params = ["true"], {"limit": limit, "offset": offset}
    if status and status != "all":
        where.append("t.status = %(status)s::trip_status")
        params["status"] = status
    if country:
        where.append("t.country = %(country)s")
        params["country"] = country
    if category:
        where.append("t.category = %(category)s::trip_category")
        params["category"] = category
    if q:
        where.append("(t.title ILIKE %(q)s OR t.source_ref = %(qexact)s)")
        params["q"] = f"%{q}%"
        params["qexact"] = q
    sql = QUEUE_SQL.format(where=" AND ".join(where),
                           order=SORTS.get(sort, SORTS["curation"]))
    with connect() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
        count_sql = ("SELECT count(*) AS n FROM trips t WHERE "
                     + " AND ".join(where))
        cur.execute(count_sql, params)
        total = cur.fetchone()["n"]
    return {"total": total, "limit": limit, "offset": offset, "trips": rows}


@app.get("/api/trips/{trip_id}")
def trip_detail(trip_id: int):
    with connect() as conn:
        row = fetch_trip(conn, trip_id)
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(CHECKS_SQL, {"id": trip_id})
            checks = cur.fetchall()
            cur.execute(REVIEWS_SQL, {"id": trip_id})
            reviews = cur.fetchall()

    elevation = dict(row.pop("elevation") or {})
    profile = downsample_profile(elevation.pop("profile", None))
    geom = json.loads(row.pop("geom_json")) if row.get("geom_json") else None
    repair_geom = (json.loads(row.pop("repair_geom_json"))
                   if row.get("repair_geom_json") else None)
    row.pop("repair_geom_json", None)

    repair = None
    if row.get("repaired") is not None:
        repair = {
            "repaired": row["repaired"], "fresh": row.get("repair_fresh"),
            "divergence_pct": row.get("divergence_pct"),
            "original_len_m": row.get("original_len_m"),
            "repaired_len_m": row.get("repaired_len_m"),
            "repair_info": row.get("repair_info"),
            "repaired_at": row.get("repaired_at"),
            "geometry": repair_geom,
        }
    for key in ("repaired", "repair_fresh", "divergence_pct", "original_len_m",
                "repaired_len_m", "repair_info", "repaired_at"):
        row.pop(key, None)

    # Newest row per check is the live verdict; the rest is history.
    latest, history = {}, []
    for c in checks:
        if c["check_name"] not in latest:
            latest[c["check_name"]] = c
        else:
            history.append(c)

    return {
        "trip": row,
        "geometry": geom,
        "repair": repair,
        "elevation": {"profile": profile, "meta": elevation},
        "comparison": comparison_rows(row),
        "checks": {"latest": list(latest.values()), "history": history},
        "reviews": reviews,
    }


@app.get("/api/trips/{trip_id}/portal")
def trip_portal(trip_id: int, radius: float = PORTAL_RADIUS_M):
    """Official portal geometry near this trip, for the map overlay."""
    with connect() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(f"SET LOCAL statement_timeout = {PORTAL_TIMEOUT_MS}")
        try:
            cur.execute(PORTAL_SQL, {
                "id": trip_id, "tol": SIMPLIFY_DEG, "radius": radius,
                "step": PORTAL_STEP_M, "maxpts": PORTAL_MAX_POINTS,
                "per_point": PORTAL_PER_POINT, "cap": PORTAL_CAP})
            rows = cur.fetchall()
        except Exception as exc:                      # timeout or bad geometry
            conn.rollback()
            return {"segments": [], "capped": False, "radius_m": radius,
                    "error": str(exc).splitlines()[0]}
    segments = [{"name": r["name"], "source": r["source"],
                 "geometry": json.loads(r["geom_json"])} for r in rows]
    return {"segments": segments, "capped": len(segments) >= PORTAL_CAP,
            "radius_m": radius}


EDITABLE = {"description_md": str, "title": str, "difficulty": str}


def apply_edits(cur, trip_id, current, payload):
    """Write the editable fields that actually changed. Returns the diff."""
    changed, sets, params = {}, [], {}
    for field in EDITABLE:
        if field not in payload:
            continue
        new = payload[field]
        new = new.strip() if isinstance(new, str) else new
        new = new or None
        if new == (current.get(field) or None):
            continue
        changed[field] = {"from": current.get(field), "to": new}
        sets.append(f"{field} = %({field})s")
        params[field] = new
    if not sets:
        return {}
    params["id"] = trip_id
    cur.execute(f"UPDATE trips SET {', '.join(sets)} WHERE id = %(id)s", params)
    return changed


@app.patch("/api/trips/{trip_id}")
def save_edits(trip_id: int, payload: dict = Body(...)):
    with connect() as conn:
        current = fetch_trip(conn, trip_id)
        with conn.cursor() as cur:
            changed = apply_edits(cur, trip_id, current, payload)
            if changed:
                log_review(cur, trip_id, "edit", note=payload.get("note"),
                           changed=changed, prev_status=current["status"],
                           new_status=current["status"],
                           quality_score=current["quality_score"])
        conn.commit()
        row = fetch_trip(conn, trip_id)
    return {"saved": bool(changed), "changed": changed,
            "status": row["status"], "updated_at": row["updated_at"]}


# The publish gate. approve is the only transition into 'approved', it only
# arrives here from a human clicking Approve, and nothing downstream is
# triggered: the export step picks approved rows up on its own schedule.
DECISIONS = {"approve": "approved", "reject": "rejected", "reopen": "needs_review"}


@app.post("/api/trips/{trip_id}/decision")
def decide(trip_id: int, payload: dict = Body(...)):
    action = str(payload.get("action", "")).lower()
    if action not in DECISIONS:
        raise HTTPException(status_code=400,
                            detail=f"unknown action {action!r}")
    new_status = DECISIONS[action]
    with connect() as conn:
        current = fetch_trip(conn, trip_id)
        if current["status"] == "published":
            raise HTTPException(
                status_code=409,
                detail=("this trip is published. Published content is demoted "
                        "by the validation regression path (pipeline/trails/"
                        "regression.py, run by `run_pipeline.py --only "
                        "trails_validate`), not from here."))
        with conn.cursor() as cur:
            # Pending edits ride along, so Approve commits what the reviewer
            # sees on screen rather than an older description.
            changed = apply_edits(cur, trip_id, current, payload)
            cur.execute(
                "UPDATE trips SET status = %s::trip_status WHERE id = %s",
                (new_status, trip_id))
            log_review(cur, trip_id, action, note=payload.get("note"),
                       changed=changed or None, prev_status=current["status"],
                       new_status=new_status,
                       quality_score=current["quality_score"])
        conn.commit()
        row = fetch_trip(conn, trip_id)
    return {"id": trip_id, "action": action, "changed": changed,
            "prev_status": current["status"], "status": row["status"]}


def main():
    global REVIEWER
    ap = argparse.ArgumentParser(
        description="Local review API for the trailslab staging DB.")
    ap.add_argument("--port", type=int, default=8011)
    ap.add_argument("--host", default="127.0.0.1",
                    help="kept as a flag for oddities like WSL, not for exposure")
    ap.add_argument("--reload", action="store_true")
    ap.add_argument("--allow-remote-db", action="store_true")
    ap.add_argument("--reviewer", default=None)
    args = ap.parse_args()

    assert_local_db(args.allow_remote_db)
    if args.reviewer:
        os.environ["TRAILSLAB_REVIEWER"] = args.reviewer
        REVIEWER = args.reviewer
    apply_migrations()
    cfg = settings()
    print(f"[review] db {cfg['user']}@{cfg['host']}:{cfg['port']}/{cfg['dbname']}")
    print(f"[review] reviewer {REVIEWER}")
    print(f"[review] api http://{args.host}:{args.port}/api/health")

    import uvicorn
    uvicorn.run("server:app" if args.reload else app, host=args.host,
                port=args.port, reload=args.reload, log_level="info",
                app_dir=str(Path(__file__).resolve().parent))


if __name__ == "__main__":
    main()
