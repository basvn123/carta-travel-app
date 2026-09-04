"""Curation: choose which staged routes deserve to be published, per region.

The ingest leaves ~236,000 OSM route relations sitting in needs_review. The
first wave that reached the app took the top rows by quality_score, which is a
measure of how well FORMED a relation is, not of whether the walk is any good.
That produced three visible faults, all of them fixed here:

  a broken GPX      142 of 545 published hikes were multi-part geometries with
                    gaps between the parts, the worst of them 552 km wide. A
                    file like that draws a route that teleports, and no hiking
                    app can follow it. Continuity is now a HARD gate: one
                    continuous line, or the route is not published. A relation
                    broken only by breaks short enough to be mapping artefacts
                    passes on the joined line splice.py stored for it, which is
                    why running splice.py FIRST is worth about 10,000 routes.
  a list of stages  Bulgaria's list was ST424, ST427, ST701 ... ST710, ten
                    consecutive stages of the same long-distance path. Route
                    families are collapsed to their best member, so one route
                    takes one slot.
  no loops          walkers overwhelmingly want to end where they parked. Loops
                    are detected (tagged or geometric) and filled FIRST, up to
                    LOOP_TARGET, before anything point-to-point is considered.

And one fault that took a second wave to see:

  a country constant  Twelve countries published exactly 158 rows and
                      twenty-nine exactly 150 hikes, because the budget was
                      "150 per country". A constant was deciding the tail
                      rather than the data, so Spain and Belgium got the same
                      number of walks and the Pyrenees competed with Flanders
                      for the same 150 slots. The budget is now a QUOTA PER
                      NUTS3 REGION (pipeline/regions/quotas.py, `trail`:
                      4 + 8*protected_share + 6*relief_norm, clamped 3..45),
                      summed to a country target that is a consequence rather
                      than a setting. The 0.35 degree grid cap stays as the
                      finer spread rule inside a region.

What comes out is a per-region quota's worth of routes, spread across distance
bands and across the map, loop-first, with the country's famous routes
guaranteed a share. Everything selected moves to `approved`; anything that was
published or approved and did NOT survive re-selection drops back to
needs_review, so the app's list is exactly this pass's opinion.

Two tiers come out, not one:

  r  rated. The walk we are recommending. Scored by rate.py, ranked in the
     wire, and what a card shows.
  l  listed. Continuity and geometry sanity passed, named, deduped, in
     region, and NOT scored. It exists because a region page in Moldova
     (3 published) or Kosovo (14) was empty, and an empty page says "this
     app does not cover here" when the truth is "nothing here cleared the
     rating bar". A listed row ships without a rating key at all, in its own
     array, and the app renders it as a visibly different card.

Scope: the 43 country catalogue every other layer sells. Trails alone used to
publish Turkey (47) and Ukraine (150), which meant a traveller could find a
Ukrainian trail and no Ukrainian anything else, and read that as breakage.
Both are behind --include (see CATALOGUE below) until the other layers cover
them.

On the approval gate: the review UI remains the way a person clears a route,
and trip_reviews still records who cleared what. This pass writes its rows as
reviewer 'pipeline:trails_curate' with the gates it applied in the note, so
the ledger always distinguishes a machine-curated route from a human-read one.
Curating 15,000 routes by hand was never going to happen, and shipping 545 was
the alternative.

Runs after regionize.py (whose nuts3 column the quota groups by) and before
way_tags.py, attributes.py, scenic.py, trail_images.py and rate.py, all of
which work on the selection rather than on the whole pool.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/curate.py
    python pipeline/trails/curate.py --countries BG,SI --verbose
    python pipeline/trails/curate.py --dry-run --verbose
    python pipeline/trails/curate.py --target 150      # the old country cap
    python pipeline/trails/curate.py --include TR,UA   # off catalogue
"""

import argparse
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "pipeline" / "regions"))

from db import connect  # noqa: E402
from schema import ensure  # noqa: E402
from popularity import family_key, fold  # noqa: E402

try:
    import quotas as region_quotas  # noqa: E402
except Exception:                   # a clone with no region spine still runs
    region_quotas = None

SCHEMA_SQL = ROOT / "tools" / "trailslab" / "initdb" / "06_curation.sql"
FILTERS_SQL = ROOT / "tools" / "trailslab" / "initdb" / "07_filters.sql"
REVIEWER = "pipeline:trails_curate"

# The catalogue this app sells: the 43 countries every other layer publishes
# (destinations, beaches, lakes, mountains, trips). Trails is the only layer
# that ever held TR and UA, and a layer answering for a continent the rest of
# the app does not sell reads as breakage rather than as generosity. Pass
# --include TR,UA to curate them anyway.
CATALOGUE = {
    "AD", "AL", "AT", "BA", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE",
    "ES", "FI", "FO", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI",
    "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT",
    "RO", "RS", "SE", "SI", "SK", "SM", "XK",
}

# ---------------------------------------------------------------------------
# Gates and targets
# ---------------------------------------------------------------------------

# The old country ceiling, which is now a FLOOR.
#
# This is the correction that the first quota run forced, and it matters. The
# regions programme's rule is that the quota replaces the flat cap as the
# SELECTION ORDER while the country cap still binds as a ceiling, and that
# lifting the ceiling is each layer brief's work. Read as a ceiling instead,
# the quota does not raise coverage evenly: it raises it enormously where a
# country has many NUTS3 regions and CUTS it where a country has few. The
# first run published Cyprus at 12 (from 101), Luxembourg at 19 (from 150) and
# Estonia at 30 (from 150), because Cyprus is one NUTS3 region and the quota
# formula clamps a region at 45.
#
# That is a finding about the quota's proxy inputs (protected_share is OSM
# site density and relief_norm is GeoNames settlement spread; both are
# labelled proxies in the opportunity artifact itself), not about those
# countries. So the country target is
#
#     max(sum of its region quotas, min(COUNTRY_FLOOR, what it actually has))
#
# which raises Germany to 4,666 and leaves Cyprus where it was. A country
# sitting exactly on the floor is cap-bound and the run says so by name; the
# harness reports that as a warning rather than as a failure, because it is a
# true statement about a known weak input rather than a new constant.
TARGET_DEFAULT = 150
COUNTRY_FLOOR = TARGET_DEFAULT

# The budget is now a sum of per-region quotas. Everything that used to be a
# constant against 150 becomes a SHARE of whatever that sum comes to, so the
# same balance holds whether a country's target is 17 (Malta) or 4,700
# (Germany). The three shares are the old numbers over the old target:
#   loops    60/150
#   famous   45/150
#   treks    12/150
LOOP_SHARE = 0.40
FAMOUS_SHARE = 0.30
TREK_SHARE = 0.08
# Floors, so a small country still gets the guarantee the share was for.
FAMOUS_MIN, TREK_MIN = 8, 4
# And ceilings, so a large one does not become a list of nothing but famous
# treks. Fame buys a share of the list, not the list, at any size.
FAMOUS_MAX, TREK_MAX_SLOTS = 120, 60

# A walk, not a crumb and not a continent. Below 2 km there is nothing to
# describe; above 45 km it is a multi-day trek, which needs the fame gate
# below before it takes a slot from the day walks people actually browse.
MIN_M = 2_000
MAX_M = 45_000
# Multi-day treks: allowed, but only when the route is famous enough that
# somebody was looking for it by name, and never more than the trek share.
TREK_MAX_M = 400_000

# Distance bands, as (key, low, high) in metres, and the share of the
# non-loop remainder each one may claim. A country's list should not be
# forty 6 km strolls because short routes are the most numerous.
BANDS = [
    ("<5", 0, 5_000),
    ("5-10", 5_000, 10_000),
    ("10-20", 10_000, 20_000),
    ("20-40", 20_000, 40_000),
    ("40+", 40_000, TREK_MAX_M),
]
BAND_SHARE = {"<5": 0.16, "5-10": 0.26, "10-20": 0.30, "20-40": 0.20, "40+": 0.08}

# Spatial spread, INSIDE a region. The region quota decides how many walks a
# NUTS3 area gets; this decides that they are not all in one massif of it.
# Candidate routes are binned by the centroid of their extent on a coarse grid
# and each cell is capped. The cap lifts in later passes when a region cannot
# fill its quota any other way.
GRID_DEG = 0.35
CELL_CAP = 3

# The floor a region page is held to, of ANY tier. Separate from the quota on
# purpose (pipeline/regions/quotas.py says why): the quota is how many RATED
# rows a region should carry and the score gate still polices it; the floor is
# the minimum rows so a page is never empty, and a `listed` row satisfies it.
REGION_FLOOR = 1
# The most listed rows one region may take. A floor, not a second quota: past
# this it would be a list of unrated walks competing with the rated ones.
LISTED_PER_REGION_MAX = 3
# A listed row still has to be a walk. Everything the rated gate asks except
# the rating: continuity (the candidate query), a real name (SYNTHETIC_PREFIX),
# a sane geometry (the validation ledger), and a length somebody could walk.
LISTED_MIN_M = 2_000
LISTED_MAX_M = 60_000

# Selection rank weights. All components are 0..1 and the weights sum to 1.
# Deliberately the same shape as the brief's composite: designation, how well
# formed the relation is, how well known the route is, and whether it loops.
WEIGHTS = {"network": 0.24, "quality": 0.22, "popularity": 0.34, "loop": 0.20}
NETWORK_LEVEL = {"iwn": 1.0, "nwn": 0.85, "rwn": 0.6, "lwn": 0.35}
NETWORK_DEFAULT = 0.2
# A route with no popularity row scores neutral rather than zero: the ranking
# pass is allowed to run after this one.
POPULARITY_MISSING = 0.35

# Endpoints this close count as the same place. 250 m is the brief's figure
# and about the length of a car park.
LOOP_GAP_M = 250

# Routes whose title is a synthetic "OSM route 12345" have neither a name nor
# a ref upstream. They cannot be presented to a traveller as anything, so they
# never enter the pool.
SYNTHETIC_PREFIX = "OSM route "

# The routes a country is embarrassed to be missing. Matched loosely against
# title and ref, and force-included ahead of every quota when they clear the
# continuity gate. Not a data source: it is a recall net over OSM's own names,
# so that "did you get the famous ones" has an answer that is not "probably".
FAMOUS = {
    "AD": ["gran recorregut", "gr 11", "gr 7", "coronallacs"],
    "AL": ["peaks of the balkans", "valbona", "theth"],
    "AT": ["adlerweg", "zentralalpenweg", "nordalpenweg", "salzsteigweg",
           "karnischer hohenweg", "arlberger", "berliner hohenweg"],
    "BA": ["via dinarica", "cvrsnica", "sutjeska"],
    "BE": ["gr 5", "gr 12", "sentier de grande randonnee", "ravel"],
    "BG": ["kom emine", "e3", "e8", "rila", "pirin", "seven rila lakes",
           "sultans trail"],
    "CH": ["via alpina", "eigertrail", "haute route", "tour du cervin",
           "vier quellen", "sursilvana", "alpine passe", "trans swiss",
           "jurahoehenweg", "bernese oberland"],
    "CY": ["aphrodite", "artemis", "caledonia", "troodos"],
    "CZ": ["prazsky okruh", "cesky raj", "krkonos", "sumava",
           "moravsky kras", "jizerske", "brdy", "praded", "jiraskova",
           "beskydy", "vysocina"],
    "DE": ["rennsteig", "westweg", "malerweg", "rheinsteig", "eifelsteig",
           "heidschnuckenweg", "goldsteig", "moselsteig", "harzer hexenstieg",
           "kammweg", "albsteig", "traumschleife"],
    "DK": ["hærvejen", "haervejen", "gendarmstien", "camonoen", "molleruprute"],
    "EE": ["oandu", "perakula", "forest brothers", "rmk"],
    "ES": ["camino de santiago", "gr 11", "caminito del rey", "cares",
           "gr 131", "carros de foc", "xanas", "camino primitivo",
           "camino del norte", "ordesa", "picos de europa"],
    "FI": ["karhunkierros", "hetta pallas", "ukk", "kevo", "bear trail"],
    "FO": ["postrouten", "slattaratindur"],
    "FR": ["gr 20", "tour du mont blanc", "gr 5", "gr 10", "gr 34",
           "gr 65", "tour des ecrins", "tour du queyras", "sentier des douaniers",
           "chemin de stevenson", "gr 70", "tour du vercors"],
    "GB": ["west highland way", "pennine way", "coast to coast",
           "coast path", "hadrian", "offa", "cotswold way",
           "great glen way", "snowdon", "ben nevis", "helvellyn", "ridgeway",
           "pembrokeshire", "north downs", "south downs"],
    "GR": ["vikos", "menalon", "samaria", "olympus", "olymbos",
           "corfu trail", "zagori", "athos", "pindos", "mytikas"],
    "HR": ["premuziceva", "dinarica", "paklenica", "plitvice",
           "velebit", "biokovo"],
    "HU": ["orszagos kektura", "kektura", "alfoldi kektura", "rockenbauer"],
    "IE": ["wicklow way", "kerry way", "dingle way", "burren way",
           "causeway coast", "western way", "beara way"],
    "IS": ["laugavegur", "fimmvorduhals", "hornstrandir", "askja",
           "reykjavegur", "hellismannaleid", "glymur"],
    "IT": ["alta via", "sentiero degli dei", "selvaggio blu",
           "via francigena", "sentiero azzurro", "cinque terre", "tre cime",
           "sentiero italia", "grande traversata", "path of the gods",
           "monterosso", "vernazza", "dolomiti"],
    "LI": ["furstensteig", "furstin gina", "liechtenstein weg"],
    "LT": ["aukstaitija", "curonian", "baltic coastal"],
    "LU": ["mullerthal", "escapardenne", "lee trail", "sentier du nord"],
    "LV": ["gauja", "baltic coastal", "jurtaka", "meztaka"],
    "MD": ["orheiul vechi", "codrii"],
    "ME": ["via dinarica", "durmitor", "peaks of the balkans", "coastal trail"],
    "MK": ["high scardus", "shar", "matka", "vodno"],
    "MT": ["victoria lines", "dingli", "gozo coastal"],
    "NL": ["pieterpad", "pelgrimspad", "trekvogelpad", "waddenwandelen",
           "grote wandelroute", "floris v pad"],
    "NO": ["besseggen", "romsdalseggen", "trolltunga", "preikestolen",
           "kjerag", "olavsleden", "jotunheimen", "hardangervidda",
           "reinebringen", "pulpit", "gjendesheim", "galdhopiggen",
           "prekestolen"],
    "PL": ["beskidzki", "orla perc", "sokolica", "morskie oko",
           "sudecki", "swietokrzyski", "piastowski", "tatrzanski",
           "bieszczadzki", "rysy", "sniezka", "gorczanski"],
    "PT": ["rota vicentina", "fishermen", "levada", "vereda",
           "caminho", "paiva", "sete cidades", "pico", "geres"],
    "RO": ["transilvania", "via transilvanica", "bucegi", "fagaras",
           "retezat", "piatra craiului"],
    "RS": ["via dinarica", "tara", "djerdap", "fruska gora", "stara planina"],
    "SE": ["kungsleden", "sormlandsleden", "skaneleden", "hoga kusten",
           "bohusleden", "padjelantaleden"],
    "SI": ["juliana", "slovenska planinska", "triglav", "vintgar",
           "soska", "koroska planinska", "bohinj", "pot ob zici",
           "tolminska", "savica"],
    "SK": ["cesta hrdinov", "tatranska magistrala", "stredoslovenska",
           "rysy", "slovensky raj"],
    "TR": ["lycian", "likya", "st paul", "kackar", "kapadokya",
           "cappadocia", "karia", "evliya"],
    "UA": ["carpathian", "hoverla", "chornohora", "transcarpathian"],
    "XK": ["peaks of the balkans", "rugova", "via dinarica"],
}


def utcnow():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

def apply_schema(conn):
    """Add the curation and filter columns to a lab that predates them.

    Through schema.ensure rather than by running the files: every statement in
    them is IF NOT EXISTS, but a no-op ALTER TABLE still takes ACCESS
    EXCLUSIVE on trips, which is enough to freeze a lab that has a long read
    open (this repo runs several passes at once). ensure() looks first."""
    ensure(conn, SCHEMA_SQL, verbose=True)
    ensure(conn, FILTERS_SQL, verbose=True)


# ---------------------------------------------------------------------------
# Loop detection
# ---------------------------------------------------------------------------

# Reads the geometry that will be PUBLISHED, not the raw relation: a route
# in two parts can only be judged on the roundtrip tag, but once splice.py has
# joined it, its endpoints are comparable like any other single line. Judging
# the raw geometry would leave every spliced loop reading as point to point.
MARK_LOOPS_SQL = """
    UPDATE trips t SET
        is_loop = CASE
            WHEN lower(coalesce(g.roundtrip, '')) IN ('yes', 'true') THEN true
            WHEN ST_NumGeometries(g.geom) = 1 AND ST_DWithin(
                    ST_StartPoint(ST_GeometryN(g.geom, 1))::geography,
                    ST_EndPoint(ST_GeometryN(g.geom, 1))::geography, %(gap)s)
                THEN true
            ELSE false END,
        loop_source = CASE
            WHEN lower(coalesce(g.roundtrip, '')) IN ('yes', 'true')
                THEN 'tagged'
            WHEN ST_NumGeometries(g.geom) = 1 AND ST_DWithin(
                    ST_StartPoint(ST_GeometryN(g.geom, 1))::geography,
                    ST_EndPoint(ST_GeometryN(g.geom, 1))::geography, %(gap)s)
                THEN 'geometry'
            ELSE NULL END
    FROM (
        SELECT t2.id,
               t2.raw_tags->>'roundtrip' AS roundtrip,
               COALESCE(r.geom, t2.geom) AS geom
        FROM trips t2
        LEFT JOIN trip_repairs r
               ON r.trip_id = t2.id AND r.repaired
              AND r.repair_info->>'source_geom_md5'
                  = md5(ST_AsBinary(ST_Force2D(t2.geom)))
        WHERE t2.category <> 'daytrip' AND t2.country = ANY(%(cc)s)
    ) g
    WHERE g.id = t.id
"""


def mark_loops(conn, countries):
    """Set is_loop/loop_source across the pool.

    Tagged wins over measured: a mapper who wrote roundtrip=yes on a figure of
    eight knows something the endpoints do not say. Measured catches the
    overwhelming majority, since only 48k of 236k relations carry the tag."""
    with conn.cursor() as cur:
        cur.execute(MARK_LOOPS_SQL, {"gap": LOOP_GAP_M, "cc": countries})
        n = cur.rowcount
    conn.commit()
    return n


# ---------------------------------------------------------------------------
# Candidates
# ---------------------------------------------------------------------------

# The continuity gate lives in the WHERE clause, not in a scoring term,
# because a route whose GPX teleports is not a worse route, it is not a route.
#
# Two ways to pass it. Either the relation is already one continuous line, or
# splice.py has bridged breaks short enough to be mapping artefacts and stored
# the joined line as a repair. The second clause is what puts the Walker's
# Haute Route back: its relation is in two parts separated by seven metres.
CANDIDATES_SQL = """
    SELECT t.id, t.country, t.title, t.network, t.distance_m, t.quality_score,
           t.status::text, t.source_ref, t.raw_tags->>'ref' AS ref,
           t.raw_tags->>'wikidata' AS wikidata,
           t.raw_tags->>'wikipedia' AS wikipedia,
           t.raw_tags->>'operator' AS raw_operator,
           t.is_loop, t.loop_source, t.sac_scale, t.nuts3, t.derived_route,
           (ST_XMin(t.geom) + ST_XMax(t.geom)) / 2 AS clon,
           (ST_YMin(t.geom) + ST_YMax(t.geom)) / 2 AS clat,
           p.score AS popularity,
           g.passed AS geometry_ok
    FROM trips t
    LEFT JOIN LATERAL (
        SELECT v.score FROM validation_runs v
        WHERE v.subject_type = 'trip' AND v.subject_id = t.id
          AND v.check_name IN ('popularity', 'popularity_dayhike')
        ORDER BY v.score DESC NULLS LAST LIMIT 1
    ) p ON true
    LEFT JOIN LATERAL (
        SELECT v.passed FROM validation_runs v
        WHERE v.subject_type = 'trip' AND v.subject_id = t.id
          AND v.check_name = 'geometry_sanity'
        ORDER BY v.run_at DESC LIMIT 1
    ) g ON true
    WHERE t.country = %(cc)s
      AND t.category = 'hike'
      AND t.title NOT LIKE %(synth)s
      AND t.distance_m BETWEEN %(min_m)s AND %(trek_max)s
      AND t.status <> 'rejected'
      AND (
            ((t.gap_info->>'gap_count')::int = 0
             AND (t.gap_info->>'merged_segments')::int = 1)
            OR EXISTS (
              SELECT 1 FROM trip_repairs r
              WHERE r.trip_id = t.id AND r.repaired
                AND ST_NumGeometries(r.geom) = 1
                AND r.repair_info->>'source_geom_md5'
                    = md5(ST_AsBinary(ST_Force2D(t.geom))))
          )
"""

CAND_COLS = ("id", "country", "title", "network", "distance_m", "quality",
             "status", "source_ref", "ref", "wikidata", "wikipedia",
             "raw_operator",
             "is_loop", "loop_source", "sac_scale", "nuts3", "derived_route",
             "clon", "clat", "popularity", "geometry_ok")


def fetch_candidates(conn, cc):
    with conn.cursor() as cur:
        cur.execute(CANDIDATES_SQL, {
            "cc": cc, "synth": SYNTHETIC_PREFIX + "%",
            "min_m": MIN_M, "trek_max": TREK_MAX_M,
        })
        return [dict(zip(CAND_COLS, r)) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# The region budget
# ---------------------------------------------------------------------------

def region_quota(n3):
    """How many RATED routes one level 3 region should carry.

    Straight from pipeline/regions/quotas.py so the number the gate spends and
    the number the coverage audit checks against are the same number, computed
    once, in one place. A region the opportunity table has not measured is
    quota exempt, never quota zero: no reading is not a bad reading."""
    if region_quotas is None or not n3 or not region_quotas.has_data():
        return None
    if not region_quotas.applicable(n3, "trail"):
        return None
    return region_quotas.published_target(n3, "trail")


def region_budget(rows, fallback_target):
    """({region id: quota}, summed quota).

    The country target is a CONSEQUENCE of the region quotas, which is the
    whole point: no country's count can equal a constant unless its regions
    happen to add up to one, or unless the legacy floor above is what binds.
    Routes with no region (the spine could not place the midpoint, or it has
    not been built) fall into a single unplaced bucket that keeps the old flat
    behaviour, so a clone without the GeoPackage still curates the same way it
    always did."""
    quotas, unplaced = {}, 0
    for row in rows:
        n3 = row.get("nuts3")
        if not n3:
            unplaced += 1
            continue
        if n3 not in quotas:
            got = region_quota(n3)
            # An unmeasured or inapplicable region still gets the quota floor
            # rather than zero: it has candidates, so it is somewhere people
            # walk, and the audit reports it as n/a rather than as a hole.
            quotas[n3] = got if got is not None else (
                region_quotas.QUOTA["trail"]["lo"] if region_quotas else 3)
    target = sum(quotas.values())
    if not quotas:
        return {}, fallback_target
    if unplaced:
        # Whatever the spine could not place keeps a share proportional to how
        # much of the pool it is, so an unbuilt region layer degrades to the
        # old country cap instead of publishing nothing.
        target += min(fallback_target,
                      int(round(fallback_target * unplaced / max(1, len(rows)))))
    return quotas, target


# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------

# Match the recall list with every separator removed on both sides. OSM writes
# the same route as "Eigertrail", "Eiger Trail" and "Eiger-Trail" depending on
# who mapped it, and a substring test on the spaced form found none of them:
# Switzerland shipped without the Eiger trail because of a space.
def _squash(text):
    return re.sub(r"[^a-z0-9]+", "", fold(text))


# The twelve European long distance paths, E1 to E12. The European Ramblers
# Association publishes no data of its own (its own page sends walkers to
# Waymarked Trails for GPX), so an E path is nothing more exotic than an OSM
# route=hiking network=iwn relation, which this layer already holds.
#
# Matched on the REF and anchored, never by substring: `_squash` strips
# separators, so a loose "e1" needle would match E10, E11, E12 and any route
# whose name happens to contain those two characters in a row. A ref of
# exactly E1..E12, optionally with a national suffix ("E1 DE", "E4-GR"), is
# the whole rule.
EPATH_REF_RE = re.compile(r"^e(1[0-2]|[1-9])(?![0-9]).*$", re.IGNORECASE)
EPATH_NAME_RE = re.compile(
    r"european\s+(long\s+distance\s+)?(path|walking\s+route)|"
    r"europ(a|ai)?ischer\s+fernwanderweg|sentier\s+europeen", re.IGNORECASE)


def is_epath(row):
    """True when this route is a stage of one of E1..E12.

    They are guaranteed a slot for the same reason the recall lists exist:
    somebody looking for the E5 is looking for it by name, and a continent
    spanning path that no country's own famous list happens to mention would
    otherwise fall through every gate."""
    ref = (row.get("ref") or "").strip()
    if ref and EPATH_REF_RE.match(ref):
        return True
    return bool(EPATH_NAME_RE.search(row.get("title") or ""))


def epath_family(row):
    """'epath:e4' for a stage of E4, or None.

    Per COUNTRY rather than continent-wide, because the fold runs inside a
    country's candidate list: E4 crossing Serbia and E4 crossing Greece are
    two walks a traveller would choose between, and merging them would leave
    the path published once for the whole of Europe."""
    ref = (row.get("ref") or "").strip()
    m = EPATH_REF_RE.match(ref) if ref else None
    return f"epath:e{m.group(1)}" if m else None


def named_famous(row):
    """True when the route matches the country's recall list by name, or is a
    stage of a European long distance path."""
    if is_epath(row):
        return True
    needles = FAMOUS.get(row["country"]) or []
    if not needles:
        return False
    hay = _squash(row["title"]) + "|" + _squash(row.get("ref") or "")
    return any(_squash(n) in hay for n in needles)


def is_famous(row):
    """True when this route is one the country is known for.

    Two independent claims, either of which counts: somebody wrote an article
    about it (the wikidata/wikipedia tag on the relation), or its name matches
    the country's recall list."""
    return bool(row.get("wikidata") or row.get("wikipedia")
                or named_famous(row))


def band_of(distance_m):
    for key, low, high in BANDS:
        if low <= (distance_m or 0) < high:
            return key
    return BANDS[-1][0]


def rank_of(row):
    """0..1 selection rank. Not the published rating: that one needs the
    elevation, photograph and landmark passes, which run after this."""
    net = NETWORK_LEVEL.get((row.get("network") or "").lower(), NETWORK_DEFAULT)
    quality = max(0.0, min(1.0, float(row["quality"] or 0) / 100.0))
    pop = (POPULARITY_MISSING if row.get("popularity") is None
           else max(0.0, min(1.0, float(row["popularity"]) / 100.0)))
    loop = 1.0 if row.get("is_loop") else 0.0
    score = (WEIGHTS["network"] * net + WEIGHTS["quality"] * quality
             + WEIGHTS["popularity"] * pop + WEIGHTS["loop"] * loop)
    # A route with its own article outranks an anonymous one of equal shape:
    # this is what keeps Besseggen above the local Wanderweg it shares a valley
    # with, when neither has a popularity row yet.
    if row.get("wikidata") or row.get("wikipedia"):
        score += 0.12
    return min(1.0, score)


def grid_key(row):
    if row["clat"] is None or row["clon"] is None:
        return None
    return (int(row["clat"] // GRID_DEG), int(row["clon"] // GRID_DEG))


# A stage number written in FRONT of the route name: "128 ~ Pot kurirjev in
# vezistov NOV Slovenije", "031 ~ Pot kurirjev ...". popularity.family_key
# strips a trailing counter ("Via Alpina Red R15") and a spelled-out stage
# word ("Nordkalottruta Etapp 4"), but a bare leading number is neither, so
# seventeen stages of Slovenia's partisan courier trail each got their own
# family and four of them took the top of the country's list.
LEADING_COUNTER_RE = re.compile(
    r"^\s*(?:etapa|etappe|etapp|etape|stage|deel|part|dagwandeling)?\s*"
    r"\d{1,4}\s*[~:.\-]\s*", re.IGNORECASE)


def title_family(row):
    """family_key over a title with any leading stage counter removed."""
    title = LEADING_COUNTER_RE.sub("", row["title"]).strip() or row["title"]
    return family_key(title, row.get("ref") or "")


def wiki_family(row):
    """The article a route belongs to, as a family key, or None.

    This is the rule that Bulgaria needed. Every stage of the Sultans Trail
    carries wikipedia=en:Sultans Trail and an individual title ('ST701 Sofia -
    Mladost3', 'ST702 Mladost3 - Red Cross'), so a title-derived key sees
    forty different routes and the article tag sees one. It also makes each
    stage independently "famous", which is how they took every slot in the
    country before this existed.

    Wikidata first: it is language independent, so de:Rennsteig and
    en:Rennsteig cannot split one route in two."""
    wd = (row.get("wikidata") or "").strip()
    if wd:
        return f"wd:{wd.lower()}"
    wp = (row.get("wikipedia") or "").strip()
    if not wp:
        return None
    # 'en:Sultans Trail' and 'de:Sultans Trail' are the same walk. Drop the
    # language prefix and fold what is left.
    if ":" in wp and len(wp.split(":", 1)[0]) <= 3:
        wp = wp.split(":", 1)[1]
    folded = fold(wp)
    return f"wp:{folded}" if folded else None


# A ref like 'ST701' or 'GSB 12': an alphabetic stem plus a stage number.
# The stem alone is a weak family signal (Austria numbers thousands of
# unrelated Wanderwege), so it caps a group rather than collapsing it.
STEM_RE = re.compile(r"^([a-z]{2,6})[\s-]?\d")
# How many routes one operator's numbered series may contribute to a country.
# Enough that a real network of distinct walks is represented, few enough that
# a single long path cannot become the country's whole list.
SERIES_CAP = 4


def series_key(row):
    """(operator, ref stem) for a numbered series, or None.

    Deliberately soft: unlike the article key this does not merge routes, it
    only caps how many of one series a country may show. A club that numbers
    400 genuinely different day walks keeps them; a foundation that numbers
    the forty stages of one path does not get forty slots."""
    ref = fold(row.get("ref") or "")
    operator = fold((row.get("raw_operator") or ""))
    if not ref or not operator:
        return None
    m = STEM_RE.match(ref)
    return (operator, m.group(1)) if m else None


def collapse_families(rows):
    """One route, one slot: the best-ranked member of each family represents
    it. This is what stops a country's list reading as ST701, ST702, ST703.

    Union-find over BOTH keys rather than one key falling back to the other,
    because each key catches what the other misses and either one used alone
    splits a family the other had already merged:

      the title key   collapses 'Nordkalottruta Etapp 4' and 'Etapp 17' to
                      'nordkalottruta'. It misses the Sultans Trail, whose
                      stages are named after their endpoints.
      the article key collapses every stage tagged wikipedia=en:Sultans Trail.
                      It SPLIT the Norwegian route, because somebody gave each
                      of its 19 stages its own wikidata item (Q134270706,
                      Q134270723, ...), and preferring it cost Norway a list
                      of nothing but Nordkalottruta stages.

    Sharing either key puts two routes in one family, so a route split across
    both tagging styles still takes one slot."""
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for r in rows:
        node = ("trip", r["id"])
        find(node)
        title_key = title_family(r)
        if title_key:
            union(node, ("title", title_key))
        wiki_key = wiki_family(r)
        if wiki_key:
            union(node, ("wiki", wiki_key))
        # A third key, for the one family shape the other two both miss.
        #
        # An E path stage is named after the towns it runs between ("E4:
        # Sokobanja - Jalovik izvor"), so the title key gives every stage its
        # own family; and the stages are not individually articled, so the
        # wiki key gives them nothing. Serbia therefore published SEVEN
        # separate E4 rows, which is the ST701-to-ST710 fault this fold exists
        # to prevent, wearing a different tag. The ref is the thing they
        # genuinely share.
        epath_key = epath_family(r)
        if epath_key:
            union(node, ("epath", epath_key))

    families = defaultdict(list)
    for r in rows:
        families[find(("trip", r["id"]))].append(r)

    heads = []
    for members in families.values():
        members.sort(key=lambda r: -r["rank"])
        head = members[0]
        head["family"] = title_family(head)
        head["family_name"] = family_display(members)
        head["family_members"] = len(members)
        heads.append(head)
    return heads


# A stage suffix written AFTER the route name: "Via Alpina Stage 58: Sucka -
# Sargans", "Nordkalottruta Etapp 4". The leading counter is stripped by
# LEADING_COUNTER_RE above; this is the other half, and between them they turn
# a stage title back into the path's own name.
STAGE_SUFFIX_RE = re.compile(
    r"\s*[-,:(]*\s*\b(?:etappe|etapp|etape|etapa|stage|dagsetapp|abschnitt"
    r"|leg|section|tappa|troncon|deel|part)\b.*$", re.IGNORECASE)


def family_display(members):
    """The name of the path a family of stages belongs to.

    Needed because a family PAGE has to be called something, and the E paths
    are the case that forces it: E1 to E12 are OSM route=hiking network=iwn
    relations mapped as dozens of national stage relations, so the family that
    takes one slot is "E1" and its stages are named after the towns they run
    between. Without a name lifted out of them, the family the reader can
    follow across a continent would be labelled after whichever stage happened
    to rank highest.

    Shortest sensible stem wins: 'E1' beats 'E1 Sued', which beats
    'E1 Sued Etappe 12'."""
    # An E path is named after its number, whatever its stages are called.
    # This is the case the family name exists for: E1 is mapped as dozens of
    # national stage relations named after the towns they run between, so the
    # shortest-stem rule below would call the family "Bad Meinberg to Horn"
    # and the continent spanning path would be nameless.
    for r in members:
        ref = (r.get("ref") or "").strip()
        if ref and EPATH_REF_RE.match(ref):
            return ref.split()[0].split("-")[0].upper()

    stems = []
    for r in members:
        title = LEADING_COUNTER_RE.sub("", r["title"]).strip()
        stem = STAGE_SUFFIX_RE.sub("", title).strip(" :-,;.")
        if len(stem) >= 3:
            stems.append(stem)
    if not stems:
        return (members[0].get("title") or "").strip() or None
    return min(stems, key=lambda s: (len(s), s))


# ---------------------------------------------------------------------------
# Selection
# ---------------------------------------------------------------------------

class Picker:
    """Accumulates the country's picks while enforcing the spatial caps.

    Two of them now, and they answer different questions. The REGION quota is
    the budget: how many walks this NUTS3 area is worth, from how much of the
    thing it actually has. The grid cell cap is the spread inside it: not all
    of them in one massif. The region quota is hard (it is the whole reason
    the country constant is gone); the cell cap is soft on purpose, because a
    region that cannot fill its quota within CELL_CAP per grid cell is better
    served by a second walk in the same valley than by a short list, so
    callers relax it rather than stop.
    """

    def __init__(self, quotas=None):
        self.picked = []
        self.ids = set()
        self.cells = Counter()
        self.series = Counter()
        self.quotas = quotas or {}
        self.regions = Counter()

    def region_full(self, row):
        n3 = row.get("nuts3")
        quota = self.quotas.get(n3)
        return quota is not None and self.regions[n3] >= quota

    def take(self, row, reason, cell_cap, respect_region=True):
        if row["id"] in self.ids:
            return False
        if respect_region and self.region_full(row):
            return False
        # The series cap applies to every pass, the famous one included. Two
        # Bulgarian stages reached the list through fame alone after the
        # article key had merged the other fifty-two: ST426 carries
        # wikipedia=en:Sultans Trail and ST701 does not, so they landed in
        # different families while being the same walk. Capping the operator's
        # numbered series is what catches the ones tagging inconsistency lets
        # through.
        series = series_key(row)
        if series is not None and self.series[series] >= SERIES_CAP:
            return False
        cell = grid_key(row)
        if cell is not None and cell_cap is not None and self.cells[cell] >= cell_cap:
            return False
        self.ids.add(row["id"])
        self.cells[cell] += 1
        self.regions[row.get("nuts3")] += 1
        if series is not None:
            self.series[series] += 1
        row["pick_reason"] = reason
        self.picked.append(row)
        return True

    def fill(self, rows, want, reason, cell_caps=(CELL_CAP, CELL_CAP * 2, None),
             respect_region=True):
        """Take up to `want` rows, loosening the spatial cap only when the
        stricter pass could not find enough."""
        taken = 0
        for cap in cell_caps:
            if taken >= want:
                break
            for row in rows:
                if taken >= want:
                    break
                if self.take(row, reason, cap, respect_region=respect_region):
                    taken += 1
        return taken

    def interleave(self, rows, want, reason):
        """Round robin across regions: every region's first pick outranks any
        region's second.

        The regions brief's rule, and the difference between a country list
        that reads as a tour and one that is forty walks in the one massif
        that happens to be best mapped. Inside a region the order is still by
        rank, so the round robin costs nothing in quality."""
        by_region = defaultdict(list)
        for row in rows:
            by_region[row.get("nuts3")].append(row)
        queues = [iter(v) for v in by_region.values()]
        taken, live = 0, True
        while taken < want and live:
            live = False
            for queue in queues:
                if taken >= want:
                    break
                for row in queue:
                    live = True
                    if self.take(row, reason, CELL_CAP * 2):
                        taken += 1
                        break
        return taken


def listed_fill(rows, picker, quotas, verbose=False):
    """The `l` tier: one row of ANY quality for a region the rated gate left
    empty, so a region page is never blank.

    Held to everything the rated gate asks except the rating: continuity (the
    candidate query already gated it), a real name, a geometry the validation
    ledger did not fail, and a length somebody could walk in a day or two.
    NOT scored, and rate.py skips it, so the wire ships no rating key at all
    rather than a number nobody earned.

    Drawn from the WHOLE candidate pool rather than from the family heads,
    which is the difference between a tier that fires and one that never does.
    A region is left empty by the rated gate in exactly three ways, and only
    the first of them leaves a family head behind:

      every candidate is a long route nobody famous walks (the day pool stops
      at 45 km and the trek pool needs fame), so nothing was eligible;
      every candidate was folded into a family whose best member sits in the
      NEXT region, so the region has walks and no heads;
      the region's quota was spent on routes that turned out to be elsewhere.

    Moldova published three routes and Kosovo fourteen. Neither is fixed by
    this and neither is fixed by raising a quota, because neither has the
    pool: that is derive_routes.py's work. What this fixes is the region page
    that said nothing at all while the region had walks in it."""
    have = Counter(r.get("nuts3") for r in picker.picked)
    pools = defaultdict(list)
    for row in rows:
        n3 = row.get("nuts3")
        if row["id"] in picker.ids:
            continue
        if not n3 or have.get(n3):
            continue
        if quotas and n3 not in quotas:
            continue
        if row.get("geometry_ok") is False:
            continue
        if not (LISTED_MIN_M <= (row["distance_m"] or 0) <= LISTED_MAX_M):
            continue
        if row["title"].startswith(SYNTHETIC_PREFIX):
            continue
        row.setdefault("rank", rank_of(row))
        row.setdefault("band", band_of(row["distance_m"]))
        pools[n3].append(row)

    listed = []
    for n3, cands in pools.items():
        cands.sort(key=lambda r: -r["rank"])
        room = min(REGION_FLOOR, LISTED_PER_REGION_MAX)
        for row in cands[:room]:
            row["pick_reason"] = "listed:region-floor"
            row["tier"] = "l"
            listed.append(row)
    if verbose and listed:
        print(f"    listed  {len(listed)} row(s) across "
              f"{len({r['nuts3'] for r in listed})} empty region(s)")
    return listed


def select_country(rows, target, quotas, loop_target=None, verbose=False,
                   floor=COUNTRY_FLOOR):
    """The country's list, in the order the wire will carry it.

    Order of claims on a slot, strongest first:
      1. famous routes, whatever their shape or length
      2. loops, up to the loop share
      3. everything else, by distance band quota, interleaved across regions
      4. best of the rest, if the quotas could not fill the target

    Every claim after the first spends against a REGION's quota rather than
    against a country number, which is what stops a country's count landing on
    a constant. Returns (rated, listed).
    """
    for r in rows:
        r["rank"] = rank_of(r)
        r["band"] = band_of(r["distance_m"])
        r["named"] = named_famous(r)
        r["famous"] = is_famous(r)
        r["tier"] = "r"

    heads = collapse_families(rows)
    heads.sort(key=lambda r: -r["rank"])

    # A long route has to earn its length. Anything past MAX_M is a multi-day
    # trek, which only enters as a famous one and only up to the trek share.
    day_pool = [r for r in heads if r["distance_m"] <= MAX_M]
    trek_pool = [r for r in heads if r["distance_m"] > MAX_M and r["famous"]]

    # The legacy floor, applied here rather than in region_budget because it
    # needs the pool AFTER the family collapse: a country with 300 stages of
    # one path has one walk, not 300, and a floor read off the raw candidate
    # count would promise coverage that does not exist.
    eligible = len(day_pool) + len(trek_pool)
    floor_target = min(floor, eligible) if floor else 0
    quota_target = target
    if floor_target > target:
        target = floor_target
        # Share the extra out the way the quotas would have: scale every
        # region's quota by the same factor rather than letting the fill pass
        # dump the difference into whichever region ranks best. The point of
        # the quota is WHICH rows fill the budget, and that survives the
        # budget being raised.
        if quotas and quota_target:
            scale = target / quota_target
            quotas = {n3: max(q, int(round(q * scale)))
                      for n3, q in quotas.items()}

    famous_quota = min(FAMOUS_MAX, max(FAMOUS_MIN, int(target * FAMOUS_SHARE)))
    trek_quota = min(TREK_MAX_SLOTS, max(TREK_MIN, int(target * TREK_SHARE)))
    if loop_target is None:
        loop_target = int(round(target * LOOP_SHARE))

    picker = Picker(quotas)

    # 1. Famous first, and never blocked by either spatial cap: if a country's
    #    two best-known walks share a massif, or its most famous one sits in a
    #    region whose quota is three, they both still ship. A route somebody
    #    was looking for by name is not a coverage decision.
    #
    #    Quota, not "all of them". Germany has more than 150 routes carrying a
    #    wikidata tag, so an uncapped famous pass filled the entire target and
    #    left Germany with ZERO loops out of the 13,775 it has. Fame buys a
    #    guaranteed share of the list, not the list.
    #
    #    Inside the quota, a route on the country's recall list outranks one
    #    that is merely tagged with a wikidata id. Germany has hundreds of the
    #    latter, and sorting by rank alone spent the whole trek quota on them
    #    while the Rennsteig, clean single-segment geometry and all, sat in
    #    needs_review. The named list is the answer to "did you get the famous
    #    ones", so it gets first refusal on the slots reserved for fame.
    fame_order = (lambda r: (not r["named"], -r["rank"]))
    famous_day = sorted((r for r in day_pool if r["famous"]), key=fame_order)
    picker.fill(famous_day, min(famous_quota, len(famous_day)), "famous",
                cell_caps=(None,), respect_region=False)
    treks = sorted(trek_pool, key=fame_order)[:trek_quota]
    picker.fill(treks, trek_quota, "famous-trek", cell_caps=(None,),
                respect_region=False)

    # 2. Loops, the shape people actually want, up to their own target, and
    #    round robin across regions so the loop budget is not spent entirely
    #    in whichever region maps loops best.
    loops = [r for r in day_pool if r.get("is_loop")]
    have_loops = sum(1 for r in picker.picked if r.get("is_loop"))
    picker.interleave(loops, max(0, loop_target - have_loops), "loop")

    # 3. The rest by band, so the list is not forty strolls or forty treks.
    remaining = max(0, target - len(picker.picked))
    if remaining:
        for key, _, _ in BANDS:
            want = int(round(remaining * BAND_SHARE.get(key, 0)))
            if want <= 0:
                continue
            band_rows = [r for r in day_pool if r["band"] == key]
            picker.interleave(band_rows, want, f"band:{key}")

    # 4. Whatever is left over, best first, and NOT held to the region quota.
    #
    #    A quota is a PRIORITY, not a ceiling, and getting that backwards was
    #    the second fault of the first quota run. Passes 1 to 3 spend the
    #    quotas and interleave across regions, so every region's allocation
    #    leads; this pass fills what the country target still has room for out
    #    of whatever is left, wherever it is. Held to the quota it published
    #    Belgium at 509 against a target of 652 and Greece at 324 against 548,
    #    not because the walks were not there but because every region had hit
    #    its own number while the country budget sat unspent.
    #
    #    The 0.35 degree cell cap still applies, so "wherever it is" is not
    #    "forty more walks in the one massif that maps best".
    if len(picker.picked) < target:
        picker.fill(day_pool, target - len(picker.picked), "fill",
                    respect_region=False)

    picked = picker.picked
    # Published order is the wire order, and the app shows it unsorted, so the
    # best walk in the country has to be the first row.
    picked.sort(key=lambda r: -r["rank"])
    listed = listed_fill(rows, picker, quotas, verbose=verbose)
    if verbose:
        by_reason = Counter(r["pick_reason"] for r in picked)
        by_band = Counter(r["band"] for r in picked)
        n_loop = sum(1 for r in picked if r.get("is_loop"))
        filled = sum(1 for n3, q in quotas.items() if picker.regions[n3] >= q)
        print(f"    reasons {dict(by_reason)}")
        print(f"    bands   {dict(by_band)}")
        print(f"    loops   {n_loop}/{len(picked)}")
        print(f"    regions {filled}/{len(quotas)} at quota, "
              f"target {target}"
              + (f" (region quotas asked {quota_target}, floor raised it)"
                 if target > quota_target else ""))
    return picked, listed, {"target": target, "quota": quota_target,
                            "floor_bound": target > quota_target,
                            "eligible": eligible}


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------

REVIEW_SQL = """
    INSERT INTO trip_reviews
        (trip_id, action, reviewer, note, prev_status, new_status, quality_score)
    VALUES (%s, %s, %s, %s, %s::trip_status, %s::trip_status, %s)
"""


def apply_selection(conn, cc, picked, verbose=False):
    """Promote the picks to approved, drop everything else in the country out
    of the published/approved set, and record both halves in the ledger."""
    keep = [r["id"] for r in picked]
    promoted = demoted = 0
    with conn.cursor() as cur:
        # Demote first: a route that lost its slot must not stay live just
        # because the export runs before the next curation pass.
        cur.execute("""
            SELECT id, status::text FROM trips
            WHERE country = %s AND category = 'hike'
              AND status IN ('approved', 'published')
              AND NOT (id = ANY(%s))""", (cc, keep))
        losers = cur.fetchall()
        for trip_id, prev in losers:
            cur.execute("UPDATE trips SET status = 'needs_review'::trip_status, "
                        "curation_note = %s WHERE id = %s",
                        ("dropped by trails_curate: not in the country shortlist",
                         trip_id))
            cur.execute(REVIEW_SQL, (trip_id, "reopen", REVIEWER,
                                     "not selected by the curation pass",
                                     prev, "needs_review", None))
            demoted += 1

        for row in picked:
            tier = row.get("tier") or "r"
            note = (f"curated: {row['pick_reason']}, rank {row['rank']:.3f}, "
                    f"band {row['band']}, tier {tier}, "
                    f"region {row.get('nuts3') or 'unplaced'}, "
                    f"{'loop' if row.get('is_loop') else 'point to point'}, "
                    f"family of {row.get('family_members', 1)}, "
                    f"continuous single segment")
            cur.execute("""
                UPDATE trips SET status = 'approved'::trip_status,
                                 curated_at = now(), curation_note = %s
                WHERE id = %s AND status <> 'approved'""", (note, row["id"]))
            moved = cur.rowcount
            # tier and the family are set on every pick, moved or not: a route
            # that was already approved still has to carry this pass's opinion
            # of which tier it is in, or a demotion from r to l would be silent.
            cur.execute("""
                UPDATE trips SET curated_at = now(), curation_note = %s,
                                 tier = %s, family_key = %s, family_name = %s,
                                 family_size = %s
                WHERE id = %s""",
                        (note, tier, row.get("family"), row.get("family_name"),
                         row.get("family_members", 1), row["id"]))
            cur.execute("""
                INSERT INTO validation_runs
                    (subject_type, subject_id, check_name, passed, score, details)
                VALUES ('trip', %s, 'curated', true, %s, %s)""",
                        (row["id"], round(row["rank"] * 100, 2), Jsonb({
                            "reason": row["pick_reason"],
                            "tier": tier,
                            "band": row["band"],
                            "region": row.get("nuts3"),
                            "is_loop": bool(row.get("is_loop")),
                            "loop_source": row.get("loop_source"),
                            "famous": bool(row.get("famous")),
                            "family": row.get("family"),
                            "family_members": row.get("family_members", 1),
                            "network": row.get("network"),
                        })))
            if moved:
                cur.execute(REVIEW_SQL, (row["id"], "approve", REVIEWER, note,
                                         row["status"], "approved",
                                         row["quality"]))
                promoted += 1
    conn.commit()
    return promoted, demoted


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def all_countries(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT country FROM trips "
                    "WHERE category = 'hike' ORDER BY country")
        return [r[0] for r in cur.fetchall()]


def drop_country(conn, cc):
    """Take a whole country out of the published set, ledger and all.

    Used by the scope gate: TR and UA were published by this layer and by no
    other, so leaving their rows live while every other layer says the country
    does not exist is worse than dropping them. Nothing is deleted; the rows
    go back to needs_review with a reason, exactly like any other demotion."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, status::text FROM trips
            WHERE country = %s AND category = 'hike'
              AND status IN ('approved', 'published')""", (cc,))
        losers = cur.fetchall()
        for trip_id, prev in losers:
            cur.execute("UPDATE trips SET status = 'needs_review'::trip_status, "
                        "tier = NULL, curation_note = %s WHERE id = %s",
                        ("dropped by trails_curate: outside the 43 country "
                         "catalogue the other layers publish", trip_id))
            cur.execute(REVIEW_SQL, (trip_id, "reopen", REVIEWER,
                                     "country is outside the catalogue scope",
                                     prev, "needs_review", None))
    conn.commit()
    return len(losers)


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2, default every "
                                        "country with staged hikes")
    ap.add_argument("--target", type=int, default=0,
                    help="fixed routes per country, overriding the region "
                         "quotas. 0 (the default) means the quotas decide, "
                         f"which is the point; {TARGET_DEFAULT} restores the "
                         "old country cap")
    ap.add_argument("--loop-target", type=int, default=0,
                    help=f"loop slots filled first, 0 means "
                         f"{LOOP_SHARE:.0%} of the target")
    ap.add_argument("--include", default="",
                    help="comma separated ISO2 outside the 43 country "
                         "catalogue to curate anyway (TR, UA)")
    ap.add_argument("--skip-loops", action="store_true",
                    help="do not re-run the loop marking pass. It reads every "
                         "staged geometry and takes about ten minutes, and "
                         "nothing but a re-ingest or a splice can change its "
                         "answer, so a second curation run in the same session "
                         "should skip it")
    ap.add_argument("--no-listed", action="store_true",
                    help="skip the l tier: rated rows only")
    ap.add_argument("--dry-run", action="store_true",
                    help="select and report, write nothing")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    extra = {c.strip().upper() for c in args.include.split(",") if c.strip()}
    in_scope = CATALOGUE | extra

    with connect() as conn:
        apply_schema(conn)
        asked = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
                 if args.countries else all_countries(conn))
        countries = [cc for cc in asked if cc in in_scope]
        out_of_scope = [cc for cc in asked if cc not in in_scope]

        if region_quotas is None or not region_quotas.has_data():
            print("region quotas unavailable (no cache/regions/opportunity.json); "
                  f"falling back to the flat country cap of "
                  f"{args.target or TARGET_DEFAULT}\n")

        for cc in out_of_scope:
            dropped = drop_country(conn, cc)
            if dropped:
                print(f"{cc}: outside the catalogue, {dropped} published or "
                      f"approved route(s) reopened")

        if args.skip_loops:
            print("skipping the loop marking pass (--skip-loops)\n")
        else:
            print(f"marking loops across {len(countries)} countries ...")
            n = mark_loops(conn, countries)
            print(f"  {n:,} routes classified\n")

        totals = Counter()
        report = []
        floor_bound = []
        for cc in countries:
            rows = fetch_candidates(conn, cc)
            if not rows:
                print(f"{cc}: no candidate clears the continuity gate")
                report.append((cc, 0, 0, 0, 0))
                continue
            quotas, target = region_budget(rows, args.target or TARGET_DEFAULT)
            floor = 0 if args.target else COUNTRY_FLOOR
            if args.target:
                target = args.target
                quotas = {}
            picked, listed, budget = select_country(
                rows, target, quotas, floor=floor,
                loop_target=args.loop_target or None, verbose=args.verbose)
            target = budget["target"]
            if budget["floor_bound"]:
                floor_bound.append(cc)
            if args.no_listed:
                listed = []
            n_loop = sum(1 for r in picked if r.get("is_loop"))
            n_fam = sum(1 for r in picked if r.get("famous"))
            print(f"{cc}: {len(picked):5d} rated + {len(listed):4d} listed of "
                  f"{len(rows):6,} candidates across {len(quotas):4d} region(s) "
                  f"(target {target}"
                  + (f", quota {budget['quota']} raised by the floor"
                     if budget["floor_bound"] else "")
                  + f", {n_loop} loops, {n_fam} famous)")
            if not args.dry_run:
                promoted, demoted = apply_selection(conn, cc, picked + listed,
                                                    verbose=args.verbose)
                totals["promoted"] += promoted
                totals["demoted"] += demoted
            totals["picked"] += len(picked)
            totals["listed"] += len(listed)
            totals["loops"] += n_loop
            totals["target"] += target
            report.append((cc, len(picked), len(listed), n_loop, target))

        print("\n" + "=" * 58)
        print(f"selected {totals['picked']:,} rated and {totals['listed']:,} "
              f"listed routes across {len(countries)} countries, "
              f"{totals['loops']:,} of them loops")
        print(f"region quotas asked for {totals['target']:,}")
        if not args.dry_run:
            print(f"promoted {totals['promoted']:,} to approved, "
                  f"demoted {totals['demoted']:,} back to needs_review")
        else:
            print("dry run: nothing written")

        # The check the country cap used to make impossible: if several
        # countries land on the same count, a constant is deciding the tail
        # again. Floor-bound countries are called out separately and excluded
        # from it, because a country sitting on the legacy floor is a true
        # statement about a weak quota input rather than a new cap, and
        # reporting both in one warning would let a real regression pass as
        # the known one.
        if floor_bound:
            print(f"\n{len(floor_bound)} country(ies) at the legacy floor of "
                  f"{COUNTRY_FLOOR}, because their region quotas came out "
                  f"below it: {', '.join(floor_bound)}")
            print(f"  their NUTS3 quotas rest on protected_share and "
                  f"relief_norm, both labelled proxies in "
                  f"cache/regions/opportunity.json")
        counts = Counter(n for cc, n, _, _, _ in report
                         if n and cc not in floor_bound)
        repeated = {n: k for n, k in counts.items() if k >= 3}
        if repeated:
            print(f"\nWARNING: {len(repeated)} count(s) shared by three or "
                  f"more countries that are NOT floor bound, which is what a "
                  f"cap looks like: "
                  + ", ".join(f"{n} ({k} countries)"
                              for n, k in sorted(repeated.items())))

        thin = [(cc, n, target) for cc, n, _, _, target in report
                if target and n < target * 0.5 and cc not in floor_bound]
        if thin:
            print(f"\n{len(thin)} countries under half their region quota "
                  f"(the pool is genuinely that thin):")
            print("  " + ", ".join(f"{cc} {n}/{t}" for cc, n, t in thin))


if __name__ == "__main__":
    main()
