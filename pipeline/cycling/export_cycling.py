"""The gate and the wire. Nothing reaches the app except through this file.

Four artifacts, and the split between the first two is a licence decision,
not a file-size one:

  index.json         which countries have content, the counts, the model
                     blocks (the model ships with the data, invariant 2) and
                     the attribution every consumer has to carry.
  {CC}.json          one file per country: rated route cards, listed route
                     cards in their own array, and the tour cards.
  route/{id}.json    one route in full. TWO BLOCKS, on purpose:
                       "osm"   the geometry and the source tags. This is a
                               database extract. ODbL travels with it, and
                               the attribution string is inside the object
                               so it cannot be separated from the data.
                       "carta" our scenic score, safety score, service towns
                               and reasons. Original work layered on top;
                               share-alike attaches to the OSM facts, not to
                               this.
  tour/{slug}.json   one composed tour in full: stages, overnights, surfaces,
                     bail-outs. Ours entirely, and it references route ids
                     rather than restating their geometry.

That structure is the whole of section 7 of the brief made concrete. A
rendered tile is a produced work and may be licensed freely; a GPX export is
a database extract and the OSMF's own guideline names it as the paradigm
case. So the GPX the app writes carries the credit in its own <copyright>
and <desc>, fed from `osm.attribution` here.

THE TIER MODEL (master spec section 3), enforced here and nowhere else:

  r  rated     clears the score gate and the photo gate. Ranked lists,
               top.json, everywhere.
  l  listed    exists, named, deduped, in region, but under one of the two
               gates. HAS NO score KEY AT ALL. Not null, not zero: absent,
               because the app cannot render what is not there and that is
               the only reliable way to guarantee a number nobody earned is
               never shown.
  e  editorial a person vouched for it. Same photo bar as listed, pinned.

Publication is by REGION QUOTA, not by country cap. quotas.published_target
decides how many rated rows a region gets from how much cycling there
actually is in it; the country cap survives only as a sanity ceiling far
above the sum, so that no country's published count can ever equal a global
constant.

THE GATE RUNS BEFORE THE WRITE (invariant 7). Every file is composed and
checked in memory first; a validation failure leaves the previous wire
standing.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/cycling/export_cycling.py
    python pipeline/cycling/export_cycling.py --dry-run --verbose
    python pipeline/cycling/export_cycling.py --countries GB
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))
sys.path.insert(0, str(ROOT / "pipeline" / "regions"))

import cycle_index as IDX  # noqa: E402
import cycle_sources as S  # noqa: E402
import stage_planner as P  # noqa: E402
import validate_cycling as V  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

# Every lab connection in this layer goes through the patient wrapper:
# the machine is shared and a ten second connect timeout loses runs.
connect = S.lab_connect

try:
    import quotas as Q
except Exception:                                          # noqa: BLE001
    Q = None

OUT_DIR = ROOT / "continent-app" / "public" / "cycling"

# Douglas-Peucker tolerance in metres for the country-file placeholder line,
# applied in EPSG:3035 so it means the same thing from Malaga to Tromso. The
# same 90 m the trails layer settled on, and for the same reason: the line in
# the country file exists so a card can sketch the route in the moment before
# route/{id}.json arrives, and 90 m is invisible at the zoom where a whole
# route fits the screen.
SIMPLIFY_M = 90.0
WIRE_DECIMALS = 5
FULL_DECIMALS = 6

# The score gate. A route below this is listed rather than rated: it exists,
# it is named, but nothing here says it is worth the day.
SCORE_GATE = 5.4
# The photo gate for a rated row. The programme target is four; two with one
# strong is the floor a row must clear to carry a score at all.
PHOTOS_RATED_MIN = 2
PHOTOS_TARGET = 4
# A country may never publish exactly a global constant (definition of done),
# so this is a ceiling far above any region quota sum, not a cap that binds.
COUNTRY_CEILING = 900

ATTRIBUTION = [
    {"source": "OpenStreetMap",
     "license": "ODbL 1.0",
     "credit": "Cycle route geometry and the surface, safety and service "
               "tags behind every figure on these pages "
               "(c) OpenStreetMap contributors, ODbL"},
    {"source": "EuroVelo",
     "license": "ODbL 1.0",
     "credit": None},        # filled per download date, see eurovelo_credit
    {"source": "Copernicus",
     "license": "Copernicus DEM terms (free use with credit)",
     "credit": "Elevation data: Copernicus GLO-30 (c) ESA and Airbus"},
    {"source": "European Environment Agency",
     "license": "EEA re-use policy (CC BY 4.0)",
     "credit": "Natura 2000 and Emerald Network site boundaries, and the "
               "coastline for analysis, from the European Environment Agency"},
    {"source": "NASA POWER",
     "license": "US Government work (no restriction)",
     "credit": "Best months from the NASA POWER project, NASA Langley "
               "Research Center"},
    {"source": "Walk Wheel Cycle Trust (Sustrans)",
     "license": "Open Government Licence v3.0",
     "credit": "National Cycle Network alignments used to cross-check the "
               "British routes (c) Walk Wheel Cycle Trust, OGL v3.0; "
               "contains Ordnance Survey data (c) Crown copyright and "
               "database right"},
]

RESERVED = {"con", "prn", "aux", "nul", "com1", "com2", "com3", "com4",
            "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2", "lpt3",
            "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"}


def log(msg):
    print(f"[cycling] {msg}", flush=True)


def safe_name(stem):
    """Windows refuses a file called PRN.json. The fare layer paid for this
    lesson once already; every layer that writes per-key files inherits it."""
    if stem.split(".")[0].lower() in RESERVED:
        return "R_" + stem
    return stem


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

ROUTES_SQL = """
    SELECT r.id, r.country, r.name, r.ref, r.network, r.cycle_network,
           r.operator, r.distance_m, r.ascent_m, r.descent_m, r.roundtrip,
           r.source, r.source_ref, r.license, r.attribution_text,
           r.status::text, r.tier, r.rating, r.rating_parts, r.reasons,
           r.surface, r.safety, r.scenic, r.services, r.elevation, r.season,
           r.regions, r.near, r.images, r.agreement, r.raw_tags, r.gap_info,
           cr.repair_info,
           ST_AsGeoJSON(ST_Simplify(
               ST_Transform(ST_Force2D(coalesce(cr.geom, r.geom)), 3035),
               %(tol)s)::geometry, %(dec)s) AS placeholder_3035,
           ST_AsGeoJSON(ST_Transform(ST_Simplify(
               ST_Transform(ST_Force2D(coalesce(cr.geom, r.geom)), 3035),
               %(tol)s), 4326), %(dec)s) AS placeholder,
           ST_AsGeoJSON(ST_Force2D(coalesce(cr.geom, r.geom)), %(fdec)s)
               AS full_line,
           Box2D(coalesce(cr.geom, r.geom))::text AS bbox,
           ST_NumGeometries(ST_LineMerge(ST_Force2D(coalesce(cr.geom, r.geom))))
               AS merged_parts
    FROM cycle_routes r
    LEFT JOIN cycle_repairs cr
           ON cr.route_id = r.id AND cr.repaired
          AND cr.repair_info->>'source_geom_md5'
              = md5(ST_AsBinary(ST_Force2D(r.geom)))
    WHERE r.status <> 'rejected'
      AND r.distance_m >= 3000
      AND (%(countries)s::text[] IS NULL OR r.country = ANY(%(countries)s))
    ORDER BY r.country, r.rating DESC NULLS LAST, r.id
"""

ROUTE_COLS = ("id", "country", "name", "ref", "network", "cycle_network",
              "operator", "distance_m", "ascent_m", "descent_m", "roundtrip",
              "source", "source_ref", "license", "attribution_text", "status",
              "tier", "rating", "rating_parts", "reasons", "surface",
              "safety", "scenic", "services", "elevation", "season",
              "regions", "near", "images", "agreement", "raw_tags",
              "gap_info", "repair_info", "_ph3035", "placeholder", "full_line",
              "bbox", "merged_parts")

TOURS_SQL = """
    SELECT t.id, t.country, t.slug, t.title, t.route_ids, t.pace,
           t.bike_type, t.days, t.distance_m, t.ascent_m, t.stages, t.checks,
           t.season, t.scenic, t.safety, t.rating, t.regions, t.near,
           t.images, t.status::text,
           ST_AsGeoJSON(ST_Transform(ST_Simplify(
               ST_Transform(ST_Force2D(t.geom), 3035), %(tol)s), 4326),
               %(dec)s) AS line,
           Box2D(t.geom)::text AS bbox
    FROM cycle_tours t
    WHERE t.status IN ('needs_review', 'approved', 'published')
      AND (%(countries)s::text[] IS NULL OR t.country = ANY(%(countries)s))
    ORDER BY t.country, t.rating DESC NULLS LAST, t.slug
"""

TOUR_COLS = ("id", "country", "slug", "title", "route_ids", "pace",
             "bike_type", "days", "distance_m", "ascent_m", "stages",
             "checks", "season", "scenic", "safety", "rating", "regions",
             "near", "images", "status", "line", "bbox")


def parse_bbox(text):
    """BOX(minx miny,maxx maxy) -> [minx, miny, maxx, maxy]."""
    nums = re.findall(r"-?\d+\.?\d*", text or "")
    return [round(float(n), 5) for n in nums[:4]] if len(nums) >= 4 else None


def load_routes(conn, countries):
    with conn.cursor() as cur:
        cur.execute(ROUTES_SQL, {"tol": SIMPLIFY_M, "dec": WIRE_DECIMALS,
                                 "fdec": FULL_DECIMALS,
                                 "countries": list(countries) or None})
        return [dict(zip(ROUTE_COLS, r)) for r in cur.fetchall()]


def load_tours(conn, countries):
    with conn.cursor() as cur:
        cur.execute(TOURS_SQL, {"tol": SIMPLIFY_M, "dec": WIRE_DECIMALS,
                                "countries": list(countries) or None})
        return [dict(zip(TOUR_COLS, r)) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# The gate
# ---------------------------------------------------------------------------

# WHY THIS IMPORTS RATHER THAN DECIDES. A photograph whose licence demands a
# credit we cannot give must not reach a card: "CC BY-SA 3.0" printed with
# nobody named is the credit removed and the licence notice kept, which is
# worse than shipping no photograph because it looks like compliance.
#
# This layer had one such row of 1,186 and originally answered the question
# here, with a licence-string test. That test FAILED OPEN: it asked whether a
# licence begins with "cc by", which is true of everything in this layer today
# and false of GFDL, which requires attribution too.
#
# pipeline/photos/credit.owes_credit is now the single answer for every layer.
# It is a whitelist of exemptions, so an unrecognised licence fails closed; it
# reads the `no_attribution_required` flag that the photo engine stamps at
# HARVEST time from Commons' own AttributionRequired field, which beats any
# string test; it makes no network calls; and it accepts both cache-shaped
# records (license/author) and wire-shaped ones (lic/by). Verified against all
# twelve cases this layer cares about, including the two easy ones to get
# wrong: CC0 with a null author ships, and a record with no licence at all
# does not.
#
# The division of labour: the HARVEST decides when the metadata is in hand and
# the request is already paid for, the GATE reads the answer. Parsing a
# licence string at export time was always the fallback, and it is now only
# the fallback inside credit.py for records harvested before the flag existed.
sys.path.insert(0, str(ROOT / "pipeline" / "photos"))
from credit import owes_credit  # noqa: E402


def creditable(img):
    """False for a photograph whose licence demands a credit we cannot give."""
    return not owes_credit(img)


def usable_images(row):
    """This row's photographs, minus any we cannot lawfully credit."""
    return [img for img in (row.get("images") or []) if creditable(img)]


def photo_count(row):
    return len(usable_images(row))


def has_strong_photo(row):
    """One photograph that is of the route rather than merely near it."""
    for img in usable_images(row):
        if (img.get("evidence") or "") in ("on_line", "named", "view"):
            return True
        if (img.get("rank") == 0) and (img.get("score") or 0) >= 2.0:
            return True
    return False


def basic_row(row):
    """The floor for existing in the wire at all, in any tier.

    Named, long enough to be a route, one continuous line, and with the
    riding actually measured. A row that fails this is not listed, it is
    absent: 'listed' means verified to exist and correctly named, and an
    unnamed fragment of somebody's working set is neither.
    """
    if not (row.get("name") or row.get("ref")):
        return "unnamed"
    if (row.get("distance_m") or 0) < 3000:
        return "too_short"
    if (row.get("merged_parts") or 0) != 1:
        return "not_continuous"
    if not row.get("regions"):
        return "no_region"
    return None


def tier_of(row):
    """r, l or e, derived. Never hand set, except e from a seed."""
    if (row.get("tier") or "") == "e":
        return "e"
    score = row.get("rating")
    if score is None or float(score) < SCORE_GATE:
        return "l"
    if photo_count(row) < PHOTOS_RATED_MIN or not has_strong_photo(row):
        return "l"
    return "r"


def region_key(row):
    rg = row.get("regions") or {}
    return rg.get("n3") or rg.get("n2") or rg.get("co")


def apply_quotas(rows, verbose=False):
    """Region quotas decide how many RATED rows publish, per region.

    The soft target is a target: the score gate still applies and nothing is
    invented to hit it. What the quota changes is the direction of the
    binding constraint. A country cap gave Spain and Belgium the same budget;
    a region quota gives the Highlands a budget drawn from how much cycling
    is in the Highlands.
    """
    if Q is None or not Q.has_data():
        log("quotas: opportunity table unavailable, publishing every row "
            "that clears the gate")
        return rows, Counter()

    by_region = defaultdict(list)
    for row in rows:
        by_region[region_key(row)].append(row)
    kept, demoted = [], Counter()
    for rid, group in by_region.items():
        group.sort(key=lambda r: -(r.get("rating") or 0))
        rated = [r for r in group if r["_tier"] == "r"]
        listed = [r for r in group if r["_tier"] != "r"]
        quota = Q.published_target(rid, "cycling") if rid else 0
        if rid and quota and len(rated) > quota:
            for row in rated[quota:]:
                row["_tier"] = "l"
                demoted[rid] += 1
            rated = rated[:quota]
        # The floor: a region page is never empty when the region has
        # anything at all. Satisfied by listed rows when nothing is rated.
        floor = Q.floor(rid, "cycling") if rid else 0
        if rid and floor and not rated and not listed:
            demoted["_empty_region"] += 1
        kept.extend(rated + listed)
    return kept, demoted


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------

def _geo(text):
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def route_card(row, tier):
    """The country-file card. A listed row has NO score key."""
    surface = row.get("surface") or {}
    safety = row.get("safety") or {}
    scenic = row.get("scenic") or {}
    images = usable_images(row)
    card = {
        "id": row["id"],
        "name": row.get("name") or row.get("ref"),
        "ref": row.get("ref"),
        "net": row.get("network"),
        "km": round((row.get("distance_m") or 0) / 1000.0, 1),
        "t": tier,
        "bbox": parse_bbox(row.get("bbox")),
        "geometry": _geo(row.get("placeholder")),
        "rg": row.get("regions") or {},
        "src": row.get("source"),
        "lic": row.get("license"),
    }
    if row.get("ascent_m") is not None:
        card["asc"] = row["ascent_m"]
    if row.get("roundtrip"):
        card["loop"] = True
    if row.get("cycle_network"):
        card["fam"] = row["cycle_network"]
    if surface.get("paved_share") is not None:
        card["paved"] = surface["paved_share"]
    if surface.get("traffic_free_share") is not None:
        card["free"] = surface["traffic_free_share"]
    if surface.get("bike"):
        card["bike"] = surface["bike"]
    if safety.get("score") is not None:
        card["safe"] = safety["score"]
    if images:
        card["img"] = images[0].get("thumb") or images[0].get("url")
        card["nimg"] = len(images)
    if row.get("near"):
        card["near"] = row["near"]
    if row.get("season"):
        card["season"] = row["season"]

    # The tier contract: a score key exists only on a rated row.
    if tier == "r":
        card["score"] = round(float(row["rating"]), 1)
        if scenic.get("score") is not None:
            card["scenic"] = round(float(scenic["score"]), 1)
        if row.get("reasons"):
            card["why"] = row["reasons"][:6]
    else:
        card["k"] = "unrated_coverage"
    return card


def route_full(row, tier):
    """route/{id}.json: the licence split made structural."""
    osm = {
        "geometry": _geo(row.get("full_line")),
        "source": row.get("source"),
        "source_ref": row.get("source_ref"),
        "license": row.get("license"),
        "attribution": row.get("attribution_text"),
        "tags": {k: v for k, v in (row.get("raw_tags") or {}).items()
                 if not k.startswith("carta:")},
        "gap_info": row.get("gap_info"),
    }
    if row.get("repair_info"):
        osm["repair"] = {
            "bridges": row["repair_info"].get("bridges"),
            "total_bridge_m": row["repair_info"].get("total_bridge_m"),
            "method": row["repair_info"].get("method"),
        }
    family = (row.get("raw_tags") or {}).get("carta:family_ref")
    if family:
        osm["family_ref"] = family

    carta = {
        "surface": row.get("surface"),
        "safety": row.get("safety"),
        "scenic": row.get("scenic"),
        "services": row.get("services"),
        "elevation": {k: v for k, v in (row.get("elevation") or {}).items()
                      if k in ("profile", "step_m", "ele_min_m", "ele_max_m",
                               "max_grade_pct", "source", "status")},
        "season": row.get("season"),
        "near": row.get("near"),
        "regions": row.get("regions"),
        "agreement": row.get("agreement"),
        "images": row.get("images"),
        "model": IDX.MODEL_VERSION,
    }
    if tier == "r":
        carta["score"] = round(float(row["rating"]), 1)
        carta["parts"] = row.get("rating_parts")
        carta["reasons"] = row.get("reasons")

    return {
        "id": row["id"],
        "country": row["country"],
        "name": row.get("name") or row.get("ref"),
        "ref": row.get("ref"),
        "net": row.get("network"),
        "operator": row.get("operator"),
        "km": round((row.get("distance_m") or 0) / 1000.0, 1),
        "asc": row.get("ascent_m"),
        "desc": row.get("descent_m"),
        "loop": bool(row.get("roundtrip")),
        "t": tier,
        "bbox": parse_bbox(row.get("bbox")),
        "osm": osm,
        "carta": carta,
    }


def tour_card(tour):
    stages = tour.get("stages") or []
    return {
        "slug": tour["slug"],
        "title": tour["title"],
        "pace": tour["pace"],
        "bike": tour["bike_type"],
        "days": tour["days"],
        "km": round((tour.get("distance_m") or 0) / 1000.0),
        "asc": tour.get("ascent_m"),
        "routes": list(tour.get("route_ids") or []),
        "bbox": parse_bbox(tour.get("bbox")),
        "geometry": _geo(tour.get("line")),
        "towns": [(s.get("to") or {}).get("name") for s in stages],
        "season": tour.get("season"),
        "scenic": round(float(tour["scenic"]), 1) if tour.get("scenic") else None,
        "safe": round(float(tour["safety"]), 1) if tour.get("safety") else None,
        "rg": tour.get("regions") or {},
        "img": ((tour.get("images") or [{}])[0] or {}).get("thumb"),
    }


def tour_full(tour):
    return {
        "slug": tour["slug"],
        "country": tour["country"],
        "title": tour["title"],
        "pace": tour["pace"],
        "bike": tour["bike_type"],
        "days": tour["days"],
        "km": round((tour.get("distance_m") or 0) / 1000.0, 1),
        "asc": tour.get("ascent_m"),
        "routes": list(tour.get("route_ids") or []),
        "bbox": parse_bbox(tour.get("bbox")),
        "geometry": _geo(tour.get("line")),
        "stages": tour.get("stages"),
        "season": tour.get("season"),
        "checks": tour.get("checks"),
        "scenic": tour.get("scenic") and round(float(tour["scenic"]), 1),
        "safe": tour.get("safety") and round(float(tour["safety"]), 1),
        "rg": tour.get("regions"),
        "near": tour.get("near"),
        "images": tour.get("images") or [],
        "model": P.MODEL_VERSION,
        "note": ("Composed at build time and checked against ten hard rules "
                 "before publication. Nothing here was generated when you "
                 "asked for it."),
    }


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def write_json(path, payload, dry_run=False):
    if dry_run:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(path)
    return path.stat().st_size


def eurovelo_credit_line():
    """The ECF's prescribed sentence, with the real download date."""
    import cycle_sources as S
    table = S.load_cache("eurovelo_ids", default={}) or {}
    dates = []
    base = S.ingest_config.DATA_DIR / "eurovelo"
    if base.exists():
        dates = sorted(p.name for p in base.iterdir() if p.is_dir())
    if not dates:
        return None
    return S.eurovelo_credit(dates[-1])


def country_list(conn, countries):
    """Which countries to export, in a stable order."""
    if countries:
        return sorted(countries)
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT country FROM cycle_routes ORDER BY 1")
        return [r[0] for r in cur.fetchall()]


def build(conn, countries, dry_run=False, verbose=False):
    """Compose and write the whole wire, ONE COUNTRY AT A TIME.

    The per-country loop is a memory decision, not an organisational one.
    Loading every route at once was fine at 6,065 rows for Great Britain and
    is not at 65,375 across 43 countries: each row carries its full-resolution
    geometry as GeoJSON, so the whole set is gigabytes of Python objects on a
    16 GB machine shared with three other sessions.

    Nothing about the gate changes. The region quota groups by region id and a
    region belongs to exactly one country, so quotas computed per country are
    the same quotas. What crosses countries is the index and the EuroVelo
    families, and both need only a few fields per route, which is why the loop
    keeps a slim family row rather than the route itself.
    """
    ccs = country_list(conn, countries)
    stamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    by_country = defaultdict(lambda: {"routes": [], "listed": [], "tours": []})
    counts = defaultdict(Counter)
    fam_rows = []
    published_ids = set()
    refused_all = Counter()
    written = total_bytes = n_routes_seen = n_usable = n_tours_kept = 0

    for cc in ccs:
        got = _build_country(conn, cc, stamp, by_country, counts,
                             fam_rows, published_ids, refused_all,
                             dry_run, verbose)
        n_routes_seen += got["seen"]
        n_usable += got["usable"]
        n_tours_kept += got["tours"]
        written += got["written"]
        total_bytes += got["bytes"]

    log(f"{n_routes_seen} route(s) read from the lab across {len(ccs)} country(ies)")
    log("refused before tiering: "
        + (", ".join(f"{k}={v}" for k, v in refused_all.most_common()) or "none"))
    log(f"tours: {n_tours_kept} pass all ten checks")

    families = family_files(fam_rows, published_ids, stamp, dry_run)
    return _write_index(by_country, counts, families, stamp, written,
                        total_bytes, n_usable, n_tours_kept, dry_run)


def _build_country(conn, cc, stamp, by_country, counts, fam_rows,
                   published_ids, refused_all, dry_run, verbose):
    routes = load_routes(conn, [cc])
    tours = load_tours(conn, [cc])

    # 1. the floor
    usable = []
    for row in routes:
        # The slim family row, kept before anything is discarded: a section
        # that fails the gate still belongs to its EuroVelo and should appear
        # in the manifest marked unpublished.
        fam = (row.get("raw_tags") or {}).get("carta:family_ref")
        if fam and EV_RE.match(fam):
            fam_rows.append({
                "id": row["id"], "country": row["country"],
                "name": row.get("name"), "ref": row.get("ref"),
                "distance_m": row.get("distance_m"),
                "raw_tags": {"carta:family_ref": fam},
                "agreement": row.get("agreement"),
            })
        why = basic_row(row)
        if why:
            refused_all[why] += 1
            continue
        row["_tier"] = tier_of(row)
        usable.append(row)

    # 2. region quotas
    usable, demoted = apply_quotas(usable, verbose)
    if demoted:
        log(f"quotas demoted {sum(v for k, v in demoted.items() if not k.startswith('_'))} "
            f"rated row(s) over their region's target")

    # 3. the tour gate
    kept_tours, dropped_tours, reasons = V.validate(
        [dict(t, parts=1, bike=t["bike_type"]) for t in tours])
    if verbose and reasons:
        for why, n in reasons.most_common(6):
            log(f"    [{cc}] {why}: {n}")
    tours_by_slug = {t["slug"]: t for t in tours}

    # 4. compose every file in memory, then write
    # by_country and counts are the CALLER's, accumulated across every
    # country; re-declaring them here shadowed the shared ones and made
    # the index report zero of everything while the files wrote fine.

    for row in usable:
        tier = row["_tier"]
        card = route_card(row, tier)
        bucket = "routes" if tier == "r" else "listed"
        by_country[row["country"]][bucket].append(card)
        counts[row["country"]][tier] += 1
        counts[row["country"]]["photos"] += photo_count(row)
        if photo_count(row) >= PHOTOS_TARGET:
            counts[row["country"]]["four_plus"] += 1
    for tour in kept_tours:
        full = tours_by_slug[tour["slug"]]
        by_country[full["country"]]["tours"].append(tour_card(full))
        counts[full["country"]]["tours"] += 1

    # A country over the sanity ceiling means the region quota is not
    # binding and something upstream is wrong. Say so; do not silently trim.
    for cc, bundle in by_country.items():
        n = len(bundle["routes"])
        if n > COUNTRY_CEILING:
            log(f"WARNING {cc}: {n} rated rows is over the sanity ceiling "
                f"({COUNTRY_CEILING}); the region quota is not binding")

    written, total_bytes = 0, 0
    for _cc, bundle in [(cc, by_country[cc])]:
        bundle["routes"].sort(key=lambda c: -(c.get("score") or 0))
        bundle["listed"].sort(key=lambda c: c.get("name") or "")
        bundle["tours"].sort(key=lambda c: -(c.get("scenic") or 0))
        payload = {"generated_at": stamp, "country": cc,
                   "simplify_m": SIMPLIFY_M, **bundle}
        total_bytes += write_json(OUT_DIR / safe_name(f"{cc}.json"), payload,
                                  dry_run)
        written += 1

    for row in usable:
        published_ids.add(row["id"])
        total_bytes += write_json(
            OUT_DIR / "route" / f"{row['id']}.json",
            route_full(row, row["_tier"]), dry_run)
    for tour in kept_tours:
        full = tours_by_slug[tour["slug"]]
        full["checks"] = tour.get("checks")
        total_bytes += write_json(
            OUT_DIR / "tour" / safe_name(f"{tour['slug']}.json"),
            tour_full(full), dry_run)

    return {"seen": len(routes), "usable": len(usable),
            "tours": len(kept_tours), "written": written,
            "bytes": total_bytes}


def _write_index(by_country, counts, families, stamp, written, total_bytes,
                 n_usable, n_tours, dry_run):
    attribution = [a for a in ATTRIBUTION if a["credit"]]
    ev = eurovelo_credit_line()
    if ev:
        attribution.insert(1, {"source": "EuroVelo", "license": "ODbL 1.0",
                               "credit": ev})
    index = {
        "generated_at": stamp,
        "simplify_m": SIMPLIFY_M,
        "n_routes": sum(len(b["routes"]) for b in by_country.values()),
        "n_listed": sum(len(b["listed"]) for b in by_country.values()),
        "n_tours": sum(len(b["tours"]) for b in by_country.values()),
        "tiers": {"r": "rated, carries a score",
                  "l": "listed, exists and is named, no score key",
                  "e": "editorial, a person vouched for it"},
        "model": {
            "rating": IDX.model_block(),
            "tours": P.model_block(),
            "gate": {"score": SCORE_GATE,
                     "photos_rated_min": PHOTOS_RATED_MIN,
                     "photos_target": PHOTOS_TARGET,
                     "country_ceiling": COUNTRY_CEILING},
            "quota": Q.model_block() if (Q and Q.has_data()) else None,
            "scenic": {"weights": dict(P.E.SCENIC_WEIGHTS),
                       "version": P.E.SCENIC_MODEL},
            "safety": {"highway_penalty": dict(P.E.HIGHWAY_PENALTY),
                       "speed_free_kmh": P.E.SPEED_FREE_KMH,
                       "speed_per_kmh": P.E.SPEED_PER_KMH,
                       "segregation_bonus": P.E.SEGREGATION_BONUS,
                       "version": "carta_cycle_safety_v1"},
        },
        "checks": [name for name, _ in V.HARD_CHECKS],
        # EV1 to EV19, each a manifest of its per-country sections.
        "families": [
            {"ref": f["ref"], "km": f["km"], "n_sections": f["n_sections"],
             "n_published": f["n_published"],
             "countries": [c["cc"] for c in f["countries"]],
             "ecf_agreement": f["ecf_agreement"],
             "file": f"/cycling/family/{safe_name(f['ref'] + '.json')}"}
            for f in families],
        "attribution": attribution,
        "countries": [
            {"country": cc,
             "n_routes": len(bundle["routes"]),
             "n_listed": len(bundle["listed"]),
             "n_tours": len(bundle["tours"]),
             "photos_four_plus": counts[cc]["four_plus"],
             "file": f"/cycling/{safe_name(cc + '.json')}"}
            for cc, bundle in sorted(by_country.items())],
    }
    total_bytes += write_json(OUT_DIR / "index.json", index, dry_run)

    log(f"{'would write' if dry_run else 'wrote'} {written} country file(s), "
        f"{n_usable} route file(s), {n_tours} tour file(s), "
        f"{len(families)} family file(s), "
        f"{total_bytes / 1e6:.1f} MB")
    log(f"rated {index['n_routes']:,}, listed {index['n_listed']:,}, "
        f"tours {index['n_tours']:,}")
    return index


EV_RE = re.compile(r"^EV(\d+)$")


def family_files(rows, published_ids, stamp, dry_run):
    """family/{EV1}.json: a EuroVelo route as one thing across its countries.

    The brief asks for EV1 to EV19 "published as families". In OSM a
    EuroVelo is not one relation: it is one `route=bicycle` relation PER
    COUNTRY SECTION, grouped under a `type=superroute`. The harvest
    deliberately does not assemble the superroute, because a continental
    relation clipped by a country extract is a broken line, and stamps
    `carta:family_ref` on each child instead.

    This is where that membership becomes a surface. A family file is a
    manifest, not geometry: the sections in riding order by country, what each
    contributes, and where the whole thing runs. The geometry stays in the
    per-route files, so nothing here restates an ODbL extract and the
    prescribed EuroVelo credit travels with the object.
    """
    fams = defaultdict(list)
    for row in rows:
        ref = (row.get("raw_tags") or {}).get("carta:family_ref") or ""
        if EV_RE.match(ref):
            fams[ref].append(row)
    out = []
    for ref, members in fams.items():
        members.sort(key=lambda r: (r["country"], -(r["distance_m"] or 0)))
        per_cc = defaultdict(lambda: {"n": 0, "km": 0.0})
        for m in members:
            slot = per_cc[m["country"]]
            slot["n"] += 1
            slot["km"] += (m["distance_m"] or 0) / 1000.0
        # Only sections that actually reached the wire can be opened, so the
        # manifest says which are published rather than implying all are.
        published = published_ids
        agree = [ (m.get("agreement") or {}).get("eurovelo_gpx", {}).get("share")
                  for m in members ]
        agree = [a for a in agree if a is not None]
        payload = {
            "ref": ref,
            "n": int(EV_RE.match(ref).group(1)),
            "generated_at": stamp,
            "n_sections": len(members),
            "n_published": sum(1 for m in members if m["id"] in published),
            "km": round(sum((m["distance_m"] or 0) for m in members) / 1000.0),
            "countries": [
                {"cc": cc, "n": v["n"], "km": round(v["km"])}
                for cc, v in sorted(per_cc.items())],
            # The share of the OSM line the ECF's own developed-sections GPX
            # also draws. A LOW number is not a fault in either: the ECF
            # publishes only developed sections, so this reads as how much of
            # the signed route the ECF considers finished.
            "ecf_agreement": (round(sum(agree) / len(agree), 3)
                              if agree else None),
            "sections": [
                {"id": m["id"], "cc": m["country"],
                 "name": m.get("name") or m.get("ref"),
                 "km": round((m["distance_m"] or 0) / 1000.0),
                 "published": m["id"] in published}
                for m in members],
            "license": "ODbL 1.0",
            "attribution": eurovelo_credit_line() or ATTRIBUTION[0]["credit"],
        }
        out.append(payload)
        write_json(OUT_DIR / "family" / safe_name(f"{ref}.json"),
                   payload, dry_run)
    out.sort(key=lambda f: f["n"])
    return out


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
        index = build(conn, countries, args.dry_run, args.verbose)
    for row in index["countries"]:
        print(f"  {row['country']}: {row['n_routes']} rated, "
              f"{row['n_listed']} listed, {row['n_tours']} tours")


if __name__ == "__main__":
    main()
