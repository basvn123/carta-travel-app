"""Curation: choose which staged routes deserve to be published, per country.

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

What comes out is up to --target routes per country, spread across distance
bands and across the map, loop-first, with the country's famous routes
guaranteed a place. Everything selected moves to `approved`; anything that was
published or approved and did NOT survive re-selection drops back to
needs_review, so the app's list is exactly this pass's opinion.

On the approval gate: the review UI remains the way a person clears a route,
and trip_reviews still records who cleared what. This pass writes its rows as
reviewer 'pipeline:trails_curate' with the gates it applied in the note, so
the ledger always distinguishes a machine-curated route from a human-read one.
Curating 6,000 routes by hand was never going to happen, and shipping 545 was
the alternative.

Runs before elevation.py, scenic.py, trail_images.py and rate.py, all of which
work on the selection rather than on the whole pool.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/curate.py
    python pipeline/trails/curate.py --countries BG,SI --target 150 --verbose
    python pipeline/trails/curate.py --dry-run --verbose
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

from db import connect  # noqa: E402
from popularity import family_key, fold  # noqa: E402

SCHEMA_SQL = ROOT / "tools" / "trailslab" / "initdb" / "06_curation.sql"
REVIEWER = "pipeline:trails_curate"

# ---------------------------------------------------------------------------
# Gates and targets
# ---------------------------------------------------------------------------

# How many routes a country gets, at most. Countries with a thin pool simply
# publish fewer; nothing here invents a walk to hit a number.
TARGET_DEFAULT = 150
# Loops are filled first and get this many slots before point-to-point routes
# are considered at all. The brief's own target, and the number that a
# well-mapped country can actually supply (24 of 43 can, measured).
LOOP_TARGET = 60

# A walk, not a crumb and not a continent. Below 2 km there is nothing to
# describe; above 45 km it is a multi-day trek, which needs the fame gate
# below before it takes a slot from the day walks people actually browse.
MIN_M = 2_000
MAX_M = 45_000
# Multi-day treks: allowed, but only when the route is famous enough that
# somebody was looking for it by name, and never more than TREK_QUOTA of them.
TREK_MAX_M = 400_000
TREK_QUOTA = 12
# How many slots the famous pass may claim before loops and bands get theirs.
# Uncapped it took all 150 in Germany and France, both of which have thousands
# of loops, because a well-mapped country tags hundreds of routes with a
# wikidata id. A third of the list is a guarantee; the whole list is a bug.
FAMOUS_QUOTA = 45

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

# Spatial spread. Candidate routes are binned by the centroid of their extent
# on a coarse grid and each cell is capped, so a country's list cannot be
# forty walks in one massif. The cap lifts in later passes when a country
# cannot fill its target any other way.
GRID_DEG = 0.35
CELL_CAP = 3

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
    """Add the curation columns to a lab that predates them. Every statement
    in 06_curation.sql is IF NOT EXISTS or ON CONFLICT, so this is a no-op on
    a lab that already has them."""
    conn.execute(SCHEMA_SQL.read_text(encoding="utf-8"))
    conn.commit()


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
           t.is_loop, t.loop_source, t.sac_scale,
           (ST_XMin(t.geom) + ST_XMax(t.geom)) / 2 AS clon,
           (ST_YMin(t.geom) + ST_YMax(t.geom)) / 2 AS clat,
           p.score AS popularity
    FROM trips t
    LEFT JOIN LATERAL (
        SELECT v.score FROM validation_runs v
        WHERE v.subject_type = 'trip' AND v.subject_id = t.id
          AND v.check_name IN ('popularity', 'popularity_dayhike')
        ORDER BY v.score DESC NULLS LAST LIMIT 1
    ) p ON true
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
             "is_loop", "loop_source", "sac_scale", "clon", "clat",
             "popularity")


def fetch_candidates(conn, cc):
    with conn.cursor() as cur:
        cur.execute(CANDIDATES_SQL, {
            "cc": cc, "synth": SYNTHETIC_PREFIX + "%",
            "min_m": MIN_M, "trek_max": TREK_MAX_M,
        })
        return [dict(zip(CAND_COLS, r)) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------

# Match the recall list with every separator removed on both sides. OSM writes
# the same route as "Eigertrail", "Eiger Trail" and "Eiger-Trail" depending on
# who mapped it, and a substring test on the spaced form found none of them:
# Switzerland shipped without the Eiger trail because of a space.
def _squash(text):
    return re.sub(r"[^a-z0-9]+", "", fold(text))


def named_famous(row):
    """True when the route matches the country's recall list by name."""
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

    families = defaultdict(list)
    for r in rows:
        families[find(("trip", r["id"]))].append(r)

    heads = []
    for members in families.values():
        members.sort(key=lambda r: -r["rank"])
        head = members[0]
        head["family"] = title_family(head)
        head["family_members"] = len(members)
        heads.append(head)
    return heads


# ---------------------------------------------------------------------------
# Selection
# ---------------------------------------------------------------------------

class Picker:
    """Accumulates the country's picks while enforcing the spatial cap.

    The cap is a soft one on purpose: a country that cannot fill its target
    within CELL_CAP per grid cell is better served by a second walk in the
    same valley than by a short list, so callers relax it rather than stop."""

    def __init__(self):
        self.picked = []
        self.ids = set()
        self.cells = Counter()
        self.series = Counter()

    def take(self, row, reason, cell_cap):
        if row["id"] in self.ids:
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
        if series is not None:
            self.series[series] += 1
        row["pick_reason"] = reason
        self.picked.append(row)
        return True

    def fill(self, rows, want, reason, cell_caps=(CELL_CAP, CELL_CAP * 2, None)):
        """Take up to `want` rows, loosening the spatial cap only when the
        stricter pass could not find enough."""
        taken = 0
        for cap in cell_caps:
            if taken >= want:
                break
            for row in rows:
                if taken >= want:
                    break
                if self.take(row, reason, cap):
                    taken += 1
        return taken


def select_country(rows, target, loop_target, verbose=False):
    """The country's list, in the order the wire will carry it.

    Order of claims on a slot, strongest first:
      1. famous routes, whatever their shape or length
      2. loops, up to loop_target
      3. everything else, by distance band quota
      4. best of the rest, if the quotas could not fill the target
    """
    for r in rows:
        r["rank"] = rank_of(r)
        r["band"] = band_of(r["distance_m"])
        r["named"] = named_famous(r)
        r["famous"] = is_famous(r)

    heads = collapse_families(rows)
    heads.sort(key=lambda r: -r["rank"])

    # A long route has to earn its length. Anything past MAX_M is a multi-day
    # trek, which only enters as a famous one and only up to TREK_QUOTA.
    day_pool = [r for r in heads if r["distance_m"] <= MAX_M]
    trek_pool = [r for r in heads if r["distance_m"] > MAX_M and r["famous"]]

    picker = Picker()

    # 1. Famous first, and never blocked by the spatial cap: if a country's
    #    two best-known walks share a massif, they both still ship.
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
    picker.fill(famous_day, min(FAMOUS_QUOTA, len(famous_day)), "famous",
                cell_caps=(None,))
    treks = sorted(trek_pool, key=fame_order)[:TREK_QUOTA]
    picker.fill(treks, TREK_QUOTA, "famous-trek", cell_caps=(None,))

    # 2. Loops, the shape people actually want, up to their own target.
    loops = [r for r in day_pool if r.get("is_loop")]
    have_loops = sum(1 for r in picker.picked if r.get("is_loop"))
    picker.fill(loops, max(0, loop_target - have_loops), "loop")

    # 3. The rest by band, so the list is not forty strolls or forty treks.
    remaining = max(0, target - len(picker.picked))
    if remaining:
        for key, _, _ in BANDS:
            want = int(round(remaining * BAND_SHARE.get(key, 0)))
            if want <= 0:
                continue
            band_rows = [r for r in day_pool if r["band"] == key]
            picker.fill(band_rows, want, f"band:{key}")

    # 4. Whatever is left over, best first, so a country with an unusual
    #    length profile still reaches its target.
    if len(picker.picked) < target:
        picker.fill(day_pool, target - len(picker.picked), "fill")

    picked = picker.picked[:target]
    # Published order is the wire order, and the app shows it unsorted, so the
    # best walk in the country has to be the first row.
    picked.sort(key=lambda r: -r["rank"])
    if verbose:
        by_reason = Counter(r["pick_reason"] for r in picked)
        by_band = Counter(r["band"] for r in picked)
        n_loop = sum(1 for r in picked if r.get("is_loop"))
        print(f"    reasons {dict(by_reason)}")
        print(f"    bands   {dict(by_band)}")
        print(f"    loops   {n_loop}/{len(picked)}")
    return picked


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
            note = (f"curated: {row['pick_reason']}, rank {row['rank']:.3f}, "
                    f"band {row['band']}, "
                    f"{'loop' if row.get('is_loop') else 'point to point'}, "
                    f"family of {row.get('family_members', 1)}, "
                    f"continuous single segment")
            cur.execute("""
                UPDATE trips SET status = 'approved'::trip_status,
                                 curated_at = now(), curation_note = %s
                WHERE id = %s AND status <> 'approved'""", (note, row["id"]))
            moved = cur.rowcount
            cur.execute("""
                UPDATE trips SET curated_at = now(), curation_note = %s
                WHERE id = %s""", (note, row["id"]))
            cur.execute("""
                INSERT INTO validation_runs
                    (subject_type, subject_id, check_name, passed, score, details)
                VALUES ('trip', %s, 'curated', true, %s, %s)""",
                        (row["id"], round(row["rank"] * 100, 2), Jsonb({
                            "reason": row["pick_reason"],
                            "band": row["band"],
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


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2, default every "
                                        "country with staged hikes")
    ap.add_argument("--target", type=int, default=TARGET_DEFAULT,
                    help=f"routes per country, default {TARGET_DEFAULT}")
    ap.add_argument("--loop-target", type=int, default=LOOP_TARGET,
                    help=f"loop slots filled first, default {LOOP_TARGET}")
    ap.add_argument("--dry-run", action="store_true",
                    help="select and report, write nothing")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    with connect() as conn:
        apply_schema(conn)
        countries = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
                     if args.countries else all_countries(conn))

        print(f"marking loops across {len(countries)} countries ...")
        n = mark_loops(conn, countries)
        print(f"  {n:,} routes classified\n")

        totals = Counter()
        report = []
        for cc in countries:
            rows = fetch_candidates(conn, cc)
            if not rows:
                print(f"{cc}: no candidate clears the continuity gate")
                report.append((cc, 0, 0, 0))
                continue
            picked = select_country(rows, args.target, args.loop_target,
                                    verbose=args.verbose)
            n_loop = sum(1 for r in picked if r.get("is_loop"))
            n_fam = sum(1 for r in picked if r.get("famous"))
            print(f"{cc}: {len(picked):3d} of {len(rows):6,} candidates  "
                  f"({n_loop} loops, {n_fam} famous)")
            if not args.dry_run:
                promoted, demoted = apply_selection(conn, cc, picked,
                                                    verbose=args.verbose)
                totals["promoted"] += promoted
                totals["demoted"] += demoted
            totals["picked"] += len(picked)
            totals["loops"] += n_loop
            report.append((cc, len(picked), n_loop, n_fam))

        print("\n" + "=" * 58)
        print(f"selected {totals['picked']:,} routes across {len(countries)} "
              f"countries, {totals['loops']:,} of them loops")
        if not args.dry_run:
            print(f"promoted {totals['promoted']:,} to approved, "
                  f"demoted {totals['demoted']:,} back to needs_review")
        else:
            print("dry run: nothing written")

        thin = [(cc, n) for cc, n, _, _ in report if n < args.target * 0.5]
        if thin:
            print(f"\n{len(thin)} countries under half the target "
                  f"(the pool is genuinely that thin):")
            print("  " + ", ".join(f"{cc} {n}" for cc, n in thin))


if __name__ == "__main__":
    main()
