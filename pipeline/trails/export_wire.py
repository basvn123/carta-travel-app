"""Export approved trailslab content into the app as produced works.

The lab (tools/trailslab, port 5433) is the content store; the app ships
static JSON like every other layer. This is the bridge, and the last gate in
the chain: a human approves in the review UI, the export promotes approved to
published and writes the wire files, regression.py polices what is out there.

    draft -> needs_review -> approved -> published        (rejected leaves)
             validate.py     review UI    THIS SCRIPT

Why the promotion happens here and not on the Approve button: approved means
"a person cleared this", published means "this is live in the app". Keeping
them apart is what lets the review queue run ahead of a release, and what
lets regression.py demote live content back to the queue without a curator's
decision being rewritten. Both ledger halves get a row per promotion, the
same convention regression.py uses in the other direction.

What ships, and why it is not a database:

  {country}.json   one file per country, published trips only, each with the
                   fields a list or a map overlay needs plus a Douglas-Peucker
                   simplified 2D line. Selected, scored, described and
                   human-approved: a produced work, not an extract.
  trip/{id}.json   full-resolution 3D geometry, the full description, the DEM
                   profile and the stop list, one file per trip, fetched on
                   demand when a trip is opened.
  index.json       which countries have content, with counts.

ODbL matters here. The trips table IS a derived database, so shipping it in
bulk would carry share-alike onto anything built from it. Publishing selected
finished items instead keeps this in produced-work territory, and every item
carries its own attribution_text and source so the credit travels with the
content rather than living only in the footer.

A country with nothing published still gets a file with an empty trips array.
That is deliberate: under public/ a missing JSON is served as the SPA index
with status 200, so "no file" reaches the app as HTML that parses as neither
JSON nor an error. An empty file says "nothing here yet" in one hop.

Usage, from the repo root (DB must be up):
    python pipeline/trails/export_wire.py
    python pipeline/trails/export_wire.py --dry-run --verbose
    python pipeline/trails/export_wire.py --countries CH --tolerance 10
    python pipeline/trails/export_wire.py --no-promote      # already-live only
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402  (also puts pipeline/ on sys.path)
from validate import PILOT_COUNTRIES  # noqa: E402

# The lake layer's card-shape helpers, loaded by path as the beach, peak and
# trip layers load them. The frame here is the 9/4 .places-tcard strip.
import importlib.util  # noqa: E402

_LAKE_IMAGES = ROOT / "pipeline" / "lakes" / "lake_images.py"
if "carta_lake_images" in sys.modules:
    lake_images = sys.modules["carta_lake_images"]
else:
    _lake_spec = importlib.util.spec_from_file_location("carta_lake_images",
                                                        _LAKE_IMAGES)
    lake_images = importlib.util.module_from_spec(_lake_spec)
    sys.modules["carta_lake_images"] = lake_images
    _lake_spec.loader.exec_module(lake_images)

TRAIL_CARD_AR = 9 / 4


def card_images(trip):
    """The trip's ranked photographs, with a card-shaped one leading.

    Rank order is preserved for everything else, and no picture is dropped:
    this only decides which of them the card crops."""
    return lake_images.lead_by_fit(list(trip.get("images") or []),
                                   lambda i: (i.get("w"), i.get("h")),
                                   frame_ar=TRAIL_CARD_AR)

OUT_DIR = ROOT / "continent-app" / "public" / "trails"
REVIEWS_DDL = ROOT / "tools" / "trailslab" / "initdb" / "04_trip_reviews.sql"

# Who the ledger says published this. Machine name on purpose, so a curator
# reading a trip's history can tell an export from their own Approve click.
REVIEWER = "pipeline:trails_export"

# Douglas-Peucker tolerance in metres, applied in EPSG:3035 so it means the
# same thing from Marseille to Tromso.
#
# 20 m was right when a country shipped 13 routes. At 150 it is not: France
# carried 44 routes in 692 KB, so the same tolerance over a full list would
# make the browser fetch well over 2 MB before it can draw a single card.
#
# The line in the country file is a PLACEHOLDER. It exists so the trail page
# can sketch the route in the moment between the card being tapped and
# trip/{id}.json arriving, after which the full-resolution geometry replaces
# it and is what the map, the GPX and the follow maths all use. 90 m is
# invisible at the zoom where a whole route fits the screen and cuts the
# country files by roughly four fifths.
SIMPLIFY_M = 90.0

# Wire coordinate precision. 5 decimals is about 1.1 m of longitude at the
# equator and less further north: below the simplification tolerance, so it
# costs nothing and roughly halves the file.
WIRE_DECIMALS = 5
FULL_DECIMALS = 6

# Elevation fields worth shipping. The rest of the jsonb (geom_md5, nodata
# fractions, coast fixes) is sampling bookkeeping the app has no use for.
ELEVATION_KEYS = ("profile", "step_m", "ele_min_m", "ele_max_m",
                  "max_grade_pct", "duration_rule", "source")


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

# Simplify in a metric CRS, then come back to WGS84 and drop Z for the wire:
# the list and the map overlay never use the third ordinate, and carrying it
# would add a third of the bytes. ST_SimplifyPreserveTopology is Douglas-
# Peucker with the guarantee that no line collapses to nothing, which plain
# ST_Simplify does not give on a switchback tighter than the tolerance.
# ST_Multi on both: simplifying a single-part route hands back a LineString,
# and a wire whose geometry type depends on how many parts a trail happens to
# have would make every consumer branch. Always MultiLineString.
# Publishes the REPAIRED geometry when there is a fresh accepted one, which is
# how a route whose relation had a seven metre break ships as the continuous
# line it is on the ground. `eff` resolves that once and every geometry
# expression below reads it, so the extent, the placeholder line, the
# full-resolution line and the point count can never disagree about which
# geometry this trip is.
TRIPS_SQL = """
    SELECT t.id, t.country, t.category::text, t.title, t.description_md,
           t.distance_m, t.ascent_m, t.descent_m, t.duration_min,
           t.difficulty, t.sac_scale, t.network,
           t.source, t.license, t.attribution_text,
           t.quality_score, t.status::text, t.updated_at,
           t.raw_tags, t.elevation,
           t.rating, t.rating_parts, t.is_loop, t.loop_source, t.highlights,
           eff.info AS repair_info,
           ST_NPoints(eff.geom) AS n_full,
           ST_XMin(eff.geom), ST_YMin(eff.geom),
           ST_XMax(eff.geom), ST_YMax(eff.geom),
           ST_AsGeoJSON(
               ST_Multi(ST_Force2D(ST_Transform(ST_SimplifyPreserveTopology(
                   ST_Transform(eff.geom, 3035), %(tol)s), 4326))),
               %(wire_dp)s) AS wire_geom,
           ST_AsGeoJSON(ST_Multi(eff.geom), %(full_dp)s) AS full_geom
    FROM trips t
    CROSS JOIN LATERAL (
        SELECT COALESCE(r.geom, t.geom) AS geom, r.repair_info AS info
        FROM (SELECT 1) one
        LEFT JOIN trip_repairs r
          ON r.trip_id = t.id AND r.repaired
         AND r.repair_info->>'source_geom_md5'
             = md5(ST_AsBinary(ST_Force2D(t.geom)))
    ) eff
    WHERE t.status::text = ANY(%(statuses)s)
      AND (%(countries)s::text[] IS NULL OR t.country = ANY(%(countries)s))
    ORDER BY t.country, t.category, t.rating DESC NULLS LAST,
             t.quality_score DESC NULLS LAST, t.id
"""

TRIP_COLS = ("id", "country", "category", "title", "description",
             "distance_m", "ascent_m", "descent_m", "duration_min",
             "difficulty", "sac_scale", "network",
             "source", "license", "attribution_text",
             "quality", "status", "updated_at", "raw_tags", "elevation",
             "rating", "rating_parts", "is_loop", "loop_source", "highlights",
             "repair_info",
             "n_full", "xmin", "ymin", "xmax", "ymax",
             "wire_geom", "full_geom")


def fetch_trips(conn, statuses, countries, tolerance):
    with conn.cursor() as cur:
        cur.execute(TRIPS_SQL, {
            "tol": tolerance,
            "wire_dp": WIRE_DECIMALS,
            "full_dp": FULL_DECIMALS,
            "statuses": list(statuses),
            "countries": list(countries) or None,
        })
        return [dict(zip(TRIP_COLS, r)) for r in cur.fetchall()]


def published_ids(conn):
    """Every published trip in the lab, whatever country this run covers."""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM trips WHERE status = 'published'::trip_status")
        return {r[0] for r in cur.fetchall()}


COMMONS_CREDIT = ("Photographs from Wikimedia Commons, "
                  "per-file licences on record")

# Commons' Artist field is free-form wikitext, and a good number of uploads
# put the licence there instead of a name: "This file is available under the
# Creative Commons ...". Printed as an author under a photograph that reads
# as nonsense, and worse, it looks like we mangled the credit. When the field
# is not a name we ship no author and let the licence line stand alone, which
# is what the licence actually requires when no author is asserted.
NOT_A_NAME_RE = re.compile(
    r"^\s*(this file|the (copyright|original)|available under|licen[cs]ed?|"
    r"creative commons|public domain|unknown|no machine[- ]readable)", re.I)
LICENCE_BLURB_RE = re.compile(
    r"available under|creative commons attribution|gnu free documentation",
    re.I)


def clean_author(raw):
    """The photographer's name, or None when the field is not one."""
    text = " ".join(str(raw or "").split())
    if not text or len(text) > 120:
        return None
    if NOT_A_NAME_RE.match(text) or LICENCE_BLURB_RE.search(text):
        return None
    return text


# The MediaWiki imageinfo API appends its own campaign tracking to every
# thumbnail URL it hands back ("?utm_source=commons.wikimedia.org&
# utm_campaign=imageinfo&..."). It is theirs, not ours, it says nothing about
# the file, and shipping it puts a tracking query string in front of every
# reader. The bare thumbnail URL serves the identical image.
UTM_RE = re.compile(r"[?&]utm_[^&]*")


def clean_url(url):
    if not url:
        return url
    cleaned = UTM_RE.sub("", str(url))
    # Removing the first parameter can leave a dangling separator.
    return cleaned.replace("?&", "?").rstrip("?&")


def fetch_images(conn, ids):
    """Ranked photographs per trip, hero first.

    Only rows the photo pass ranked: the citytrip layer stores unranked
    candidates in the same table and those are borrowed city pictures, which
    is exactly what this layer exists to stop showing on a trail."""
    if not ids:
        return {}
    out = defaultdict(list)
    with conn.cursor() as cur:
        cur.execute("""
            SELECT subject_id, rank, url, title, author, license, license_url,
                   source_url, width, height, caption, along_m
            FROM images
            WHERE subject_type = 'trip' AND subject_id = ANY(%s)
              AND rank IS NOT NULL
            ORDER BY subject_id, rank""", (ids,))
        for (tid, rank, url, title, author, lic, lic_url, page, w, h,
             caption, along_m) in cur.fetchall():
            out[tid].append({
                "u": clean_url(url), "w": w, "h": h, "rank": rank,
                "title": (title or "").replace("File:", ""),
                "author": clean_author(author), "license": lic,
                "license_url": lic_url or None, "page": page,
                "caption": caption or None, "along_m": along_m,
            })
    return out


def fetch_stops(conn, ids):
    """Ordered stops per trip. poi_ref points at the app's own catalogue, so
    the app resolves names and images from data it already has; leg_* says how
    you reach this stop from the previous one."""
    if not ids:
        return {}
    out = defaultdict(list)
    with conn.cursor() as cur:
        cur.execute("""
            SELECT trip_id, seq, poi_ref, dwell_min, leg_mode, leg_duration_min
            FROM trip_stops WHERE trip_id = ANY(%s)
            ORDER BY trip_id, seq""", (ids,))
        for trip_id, seq, poi_ref, dwell, mode, leg_min in cur.fetchall():
            out[trip_id].append({"seq": seq, "poi_ref": poi_ref,
                                 "dwell_min": dwell, "leg_mode": mode,
                                 "leg_duration_min": leg_min})
    return out


# ---------------------------------------------------------------------------
# Promotion (approved -> published)
# ---------------------------------------------------------------------------

INSERT_CHECK_SQL = """
    INSERT INTO validation_runs
        (subject_type, subject_id, check_name, passed, score, details)
    VALUES ('trip', %s, 'published', true, %s, %s)
"""

INSERT_REVIEW_SQL = """
    INSERT INTO trip_reviews
        (trip_id, action, reviewer, note, prev_status, new_status, quality_score)
    VALUES (%s, 'publish', %s, %s, 'approved'::trip_status,
            'published'::trip_status, %s)
"""


def promote(conn, rows, tolerance):
    """Move approved trips to published and write both ledger halves. The
    UPDATE re-checks the status it read, so a curator who reopened the trip
    between the read and this write is never overwritten."""
    moved = []
    with conn.cursor() as cur:
        for r in rows:
            cur.execute("UPDATE trips SET status = 'published'::trip_status "
                        "WHERE id = %s AND status = 'approved'::trip_status",
                        (r["id"],))
            if not cur.rowcount:            # status changed under us
                r["skipped"] = "status changed during the run"
                continue
            r["status"] = "published"
            moved.append(r)
            note = (f"exported to continent-app/public/trails/{r['country']}.json "
                    f"({r['category']}, {r['n_wire']} of {r['n_full']} points "
                    f"at {tolerance:g} m)")
            cur.execute(INSERT_CHECK_SQL, (r["id"], r["quality"], Jsonb({
                "country": r["country"],
                "category": r["category"],
                "wire_file": f"{r['country']}.json",
                "detail_file": f"trip/{r['id']}.json",
                "simplify_m": tolerance,
                "points": {"full": r["n_full"], "wire": r["n_wire"]},
            })))
            cur.execute(INSERT_REVIEW_SQL, (r["id"], REVIEWER, note, r["quality"]))
    conn.commit()
    return moved


# ---------------------------------------------------------------------------
# Shaping
# ---------------------------------------------------------------------------

def summary_of(description):
    """The lead of a generated description: describe.py writes two summary
    sentences, then a blank line, then one paragraph of detail. The list and
    the map popup want the lead; the detail file carries the whole thing."""
    if not description:
        return None
    lead = description.strip().split("\n\n", 1)[0]
    return re.sub(r"\s+", " ", lead).strip() or None


def anchor_of(raw_tags):
    """Which catalogue destination a daytrip or citytrip hangs off, so the app
    can shelve it under that city without geocoding the line."""
    tags = raw_tags or {}
    dest, city = tags.get("anchor_dest"), tags.get("anchor_city")
    if not dest and not city:
        return None
    out = {"dest": dest, "city": city}
    centre = tags.get("anchor_centre") or {}
    if centre.get("lat") is not None and centre.get("lon") is not None:
        out["lat"], out["lon"] = centre["lat"], centre["lon"]
    return out


def elevation_of(raw):
    """The DEM profile, minus the sampling bookkeeping."""
    if not raw or raw.get("status") != "ok":
        return None
    return {k: raw[k] for k in ELEVATION_KEYS if raw.get(k) is not None}


# How many reasons a card carries. The list shows one or two; the page
# shows the lot, and it reads them from the detail file.
WIRE_REASONS = 3


def reasons_of(rating_parts, limit=None):
    """The reason codes rate.py wrote, trimmed for the wire.

    Codes and numbers only. The sentence is composed in the app through t(),
    so it lands in six languages instead of being frozen in English here."""
    reasons = (rating_parts or {}).get("reasons") or []
    return reasons[:limit] if limit else reasons


def bridges_of(repair_info):
    """How much of a published line was joined rather than mapped."""
    info = repair_info or {}
    if info.get("method") != "straight-splice" or not info.get("bridges"):
        return None
    return {
        "n": int(info["bridges"]),
        "max_m": info.get("max_bridge_m"),
        "total_m": info.get("total_bridge_m"),
    }


def highlights_of(raw):
    """The named things on the line, in walking order, for the detail file."""
    features = (raw or {}).get("features") or []
    if not features:
        return None
    return [{
        "kind": f.get("kind"),
        "name": f.get("name"),
        "ele_m": f.get("ele_m"),
        "along_m": f.get("along_m"),
        "lat": f.get("lat"),
        "lon": f.get("lon"),
    } for f in features]


def wire_item(t, n_stops):
    """One trip as the country file carries it: enough to list it, filter it,
    draw it and credit it, and a pointer to the rest."""
    item = {
        "id": t["id"],
        "name": t["title"],
        "category": t["category"],
        "country": t["country"],
        "summary": summary_of(t["description"]),
        "distance_m": t["distance_m"],
        "ascent_m": t["ascent_m"],
        "duration_min": t["duration_min"],
        "difficulty": t["difficulty"],
        "bbox": [round(t["xmin"], WIRE_DECIMALS), round(t["ymin"], WIRE_DECIMALS),
                 round(t["xmax"], WIRE_DECIMALS), round(t["ymax"], WIRE_DECIMALS)],
        "geometry": t["wire"],
        "source": t["source"],
        "license": t["license"],
        "attribution_text": t["attribution_text"],
        "detail": f"/trails/trip/{t['id']}.json",
    }
    if t.get("rating") is not None:
        item["rating"] = float(t["rating"])
    if t.get("is_loop") is not None:
        item["is_loop"] = bool(t["is_loop"])
    reasons = reasons_of(t.get("rating_parts"), WIRE_REASONS)
    if reasons:
        item["reasons"] = reasons
    # The hero, and only the hero. A card shows one picture; the gallery is
    # part of the detail file, which is fetched when the trail is opened.
    #
    # The rank the photo pass assigned is a judgement about the photograph and
    # says nothing about the shape of the card it lands in (.places-tcard, a
    # 9/4 strip). Where the best-ranked shot is a tall or a panoramic frame
    # and another ranked shot of the same walk fills the card, that one leads:
    # the gallery keeps every picture, and the reader is not shown a sliver.
    hero = (card_images(t) or [None])[0]
    if hero:
        item["img"] = {"u": hero["u"], "w": hero["w"], "h": hero["h"]}
    if n_stops:
        item["n_stops"] = n_stops
    anchor = anchor_of(t["raw_tags"])
    if anchor:
        item["anchor"] = anchor
    return item


def detail_item(t, stops, generated_at):
    """One trip in full: the on-demand half. Full-resolution 3D geometry lives
    here and only here, one file per trip, so nothing serves the lab's
    geometry in bulk."""
    out = {
        "id": t["id"],
        "name": t["title"],
        "category": t["category"],
        "country": t["country"],
        "generated_at": generated_at,
        "description_md": t["description"],
        "distance_m": t["distance_m"],
        "ascent_m": t["ascent_m"],
        "descent_m": t["descent_m"],
        "duration_min": t["duration_min"],
        "difficulty": t["difficulty"],
        "sac_scale": t["sac_scale"],
        "network": t["network"],
        "bbox": [round(t["xmin"], FULL_DECIMALS), round(t["ymin"], FULL_DECIMALS),
                 round(t["xmax"], FULL_DECIMALS), round(t["ymax"], FULL_DECIMALS)],
        "geometry": t["full"],
        "source": t["source"],
        "license": t["license"],
        "attribution_text": t["attribution_text"],
    }
    elevation = elevation_of(t["elevation"])
    if elevation:
        out["elevation"] = elevation
    if t.get("rating") is not None:
        out["rating"] = float(t["rating"])
        out["rating_model"] = (t.get("rating_parts") or {}).get("model")
        out["rating_parts"] = (t.get("rating_parts") or {}).get("components")
    if t.get("is_loop") is not None:
        out["is_loop"] = bool(t["is_loop"])
        out["loop_source"] = t.get("loop_source")
    reasons = reasons_of(t.get("rating_parts"))
    if reasons:
        out["reasons"] = reasons
    highlights = highlights_of(t.get("highlights"))
    if highlights:
        out["highlights"] = highlights
    # A straight connector is a claim about ground nobody checked, so it is
    # said out loud rather than smoothed over (pipeline/trails/splice.py).
    bridges = bridges_of(t.get("repair_info"))
    if bridges:
        out["bridges"] = bridges
    images = t.get("images") or []
    if images:
        out["images"] = images
        out["image_credit"] = COMMONS_CREDIT
    if stops:
        out["stops"] = stops
    return out


def country_file(country, items, generated_at, tolerance):
    counts = Counter(i["category"] for i in items)
    credits = {i["attribution_text"] for i in items if i["attribution_text"]}
    if any(i.get("img") for i in items):
        credits.add(COMMONS_CREDIT)
    n_loops = sum(1 for i in items if i.get("is_loop"))
    return {
        "country": country,
        "generated_at": generated_at,
        "simplify_m": tolerance,
        "n_trips": len(items),
        "counts": dict(sorted(counts.items())),
        # What a filter can offer before the file is read: the app uses these
        # to decide whether a loop chip is worth showing for this country.
        "n_loops": n_loops,
        "attribution": sorted(credits),
        "trips": items,
    }


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------

def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Compact on purpose: these are fetched by the browser, not read by hand.
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def previous_countries(out_dir, wanted):
    """Country files this run does not touch, read back so the index keeps
    describing every file on disk. Without this, `--countries CH` would
    rewrite index.json into a one-country index while FR.json still sits
    there, and the app would stop seeing content that is still published."""
    kept = []
    for path in sorted(out_dir.glob("*.json")):
        code = path.stem
        if code == "index" or code in wanted or not re.fullmatch(r"[A-Z]{2}", code):
            continue
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        kept.append({
            "country": code,
            "n_trips": len(doc.get("trips") or []),
            "counts": doc.get("counts") or {},
            "file": f"/trails/{code}.json",
            "_attribution": doc.get("attribution") or [],
        })
    return kept


def prune_details(detail_dir, keep_ids):
    """Delete detail files for trips that are no longer published, so a
    demoted trip stops being served the moment the country file drops it.

    keep_ids is the whole live set, not this run's slice: exporting one
    country must not delete another country's details."""
    if not detail_dir.exists():
        return 0
    dropped = 0
    for path in detail_dir.glob("*.json"):
        if path.stem.isdigit() and int(path.stem) in keep_ids:
            continue
        path.unlink()
        dropped += 1
    return dropped


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(
        description="Publish approved trailslab trips into "
                    "continent-app/public/trails as static JSON.")
    parser.add_argument("--countries", default=PILOT_COUNTRIES,
                        help=f"comma-separated ISO codes, empty for every "
                             f"country in the lab (default: {PILOT_COUNTRIES})")
    parser.add_argument("--out", default=str(OUT_DIR),
                        help="output directory (default: continent-app/public/trails)")
    parser.add_argument("--tolerance", type=float, default=SIMPLIFY_M,
                        help=f"Douglas-Peucker tolerance in metres "
                             f"(default {SIMPLIFY_M:g})")
    parser.add_argument("--no-promote", action="store_true",
                        help="export what is already published; approve "
                             "nothing new into the live set")
    parser.add_argument("--require-summary", action="store_true",
                        help="hold back trips with no generated description "
                             "(describe.py has not reached them yet)")
    parser.add_argument("--dry-run", action="store_true",
                        help="report only: no promotion, no files written")
    parser.add_argument("--verbose", action="store_true",
                        help="one line per exported trip")
    args = parser.parse_args()

    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    out_dir = Path(args.out)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    conn = connect()
    with conn.cursor() as cur:      # labs created before the review app exists
        cur.execute(REVIEWS_DDL.read_text(encoding="utf-8"))
    conn.commit()

    statuses = ["published"] if args.no_promote else ["approved", "published"]
    trips = fetch_trips(conn, statuses, countries, args.tolerance)
    conn.commit()

    for t in trips:
        t["wire"] = json.loads(t["wire_geom"])
        t["full"] = json.loads(t["full_geom"])
        t["n_wire"] = sum(len(part) for part in t["wire"]["coordinates"]) \
            if t["wire"]["type"].startswith("Multi") else len(t["wire"]["coordinates"])
        t["quality"] = float(t["quality"]) if t["quality"] is not None else None

    no_summary = [t for t in trips if not summary_of(t["description"])]
    if args.require_summary and no_summary:
        held = {t["id"] for t in no_summary}
        trips = [t for t in trips if t["id"] not in held]

    fresh = [t for t in trips if t["status"] == "approved"]
    already = [t for t in trips if t["status"] == "published"]
    print(f"{len(trips)} trip(s) to export"
          f"{' (' + ', '.join(countries) + ')' if countries else ''}: "
          f"{len(already)} already published, {len(fresh)} newly approved")
    if no_summary:
        verb = "held back" if args.require_summary else "exported without one"
        print(f"  {len(no_summary)} trip(s) have no generated description, "
              f"{verb} (run pipeline/trails/describe.py)")

    if args.dry_run:
        for t in trips:
            print(f"  would publish [{t['id']}] {t['country']} {t['category']}: "
                  f"{t['title'][:52]} ({t['n_wire']} of {t['n_full']} points)")
        countries_with = sorted({t["country"] for t in trips})
        print(f"dry run: nothing promoted, nothing written. Would write "
              f"{len(countries or countries_with)} country file(s) plus "
              f"{len(trips)} detail file(s) under {out_dir}")
        return 0

    if fresh and not args.no_promote:
        moved = promote(conn, fresh, args.tolerance)
        print(f"  promoted {len(moved)} of {len(fresh)} approved trip(s) to published")
        blocked = [t for t in fresh if t.get("skipped")]
        for t in blocked:
            print(f"  SKIPPED [{t['id']}] {t['title'][:48]}: {t['skipped']}")
        trips = [t for t in trips if not t.get("skipped")]

    trip_ids = [t["id"] for t in trips]
    stops = fetch_stops(conn, trip_ids)
    images = fetch_images(conn, trip_ids)
    for t in trips:
        t["images"] = images.get(t["id"], [])
    n_shot = sum(1 for t in trips if t["images"])
    print(f"  {n_shot} of {len(trips)} trip(s) carry a photograph of the route")
    live_ids = published_ids(conn)
    conn.commit()
    conn.close()

    by_country = defaultdict(list)
    for t in trips:
        by_country[t["country"]].append(t)

    # Every requested country gets a file even when it has nothing published,
    # so the app reads an empty list instead of the SPA fallback HTML.
    wanted = sorted(set(countries) | set(by_country)) if countries \
        else sorted(by_country)

    total_bytes, index_countries, credits = 0, [], set()
    for country in wanted:
        rows = by_country.get(country, [])
        items = [wire_item(t, len(stops.get(t["id"], []))) for t in rows]
        payload = country_file(country, items, generated_at, args.tolerance)
        size = write_json(out_dir / f"{country}.json", payload)
        total_bytes += size
        credits.update(payload["attribution"])
        index_countries.append({"country": country, "n_trips": len(items),
                                "counts": payload["counts"],
                                "file": f"/trails/{country}.json"})
        if args.verbose:
            for t in rows:
                print(f"  [{t['id']}] {country} {t['category']}: "
                      f"{t['title'][:48]} {t['n_wire']}/{t['n_full']} points")
        print(f"  {country}.json: {len(items)} trip(s), {size / 1024:.1f} KB")

    # Countries this run did not cover keep their files and their index entry.
    for entry in previous_countries(out_dir, set(wanted)):
        credits.update(entry.pop("_attribution"))
        index_countries.append(entry)
    index_countries.sort(key=lambda e: e["country"])

    detail_dir = out_dir / "trip"
    for t in trips:
        total_bytes += write_json(detail_dir / f"{t['id']}.json",
                                  detail_item(t, stops.get(t["id"], []),
                                              generated_at))
    # A held-back trip is published but deliberately absent from the wire, so
    # its detail file goes too: nothing is served that no country file lists.
    held_back = {t["id"] for t in no_summary} if args.require_summary else set()
    dropped = prune_details(detail_dir, live_ids - held_back)

    total_bytes += write_json(out_dir / "index.json", {
        "generated_at": generated_at,
        "simplify_m": args.tolerance,
        "n_trips": sum(e["n_trips"] for e in index_countries),
        "countries": index_countries,
        "attribution": sorted(credits),
    })

    print(f"wrote {len(wanted)} country file(s) + {len(trips)} detail file(s) "
          f"+ index.json to {out_dir} ({total_bytes / 1024:.1f} KB total)"
          + (f", pruned {dropped} stale detail file(s)" if dropped else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
