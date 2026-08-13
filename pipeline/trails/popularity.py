"""Popularity signals + curation ranking for staged trails.

Ranks the OSM-derived trips in the trailslab staging DB so a human curator
can start from a credible per-country shortlist instead of 20k+ rows.
Reuses the pipeline's existing fame infrastructure:

  own signals   - wikipedia/wikidata tags preserved on the relation by
                  ingest_osm_routes.py. Sitelink counts come through
                  harvest_activities.sitelink_counts (WDQS, cached in
                  cache/wikidata_sitelinks.json); average daily pageviews
                  through enrich_activities.pageviews_avg (cached here in
                  cache/trail_pageviews.json).
  anchor fame   - trips without their own article borrow fame from the
                  existing catalogue: destinations (cache/dest_pageviews.json)
                  and famous items_full POIs (enrich_cache pop, keyed by wiki
                  URL) within ANCHOR_KM of the line, matched with PostGIS in
                  EPSG:3035 so the buffer is metric across Europe.

curation_rank (0-100) blends network level (iwn above nwn above rwn),
portal agreement (validation_runs, from crosscheck_portals.py), quality_score
(validate.py) and popularity. Portal and quality checks may not have run yet:
missing signals score neutral instead of punishing the trip. Each ranked trip
gets an append-only validation_runs row (check_name='popularity', score =
curation_rank) so the review UI sees the same numbers as the CSVs.

Output: data/reports/trails_seed/{CC}.csv, top N per country with stage
relations collapsed into route families (best stage represents the family;
family_members says how many rows it stands for).

Usage, from the repo root (DB must be up):
    python pipeline/trails/popularity.py
    python pipeline/trails/popularity.py --countries CH,NO --top 15
    python pipeline/trails/popularity.py --offline --dry-run
"""

import argparse
import csv
import json
import math
import re
import sys
import time
import unicodedata
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
import enrich_activities as ea  # noqa: E402  (pageviews_avg + PV window)
import harvest_activities as ha  # noqa: E402  (sitelink_counts + WDQS cache)

APP_DATA = ROOT / "app_data" / "app_data.json"
ENRICH_CACHE = ROOT / "app_data" / "enrich_cache.json"
DEST_PV_CACHE = ROOT / "cache" / "dest_pageviews.json"
TRAIL_PV_CACHE = ROOT / "cache" / "trail_pageviews.json"
REPORT_DIR = ROOT / "data" / "reports" / "trails_seed"

COUNTRIES_DEFAULT = "CH,FR,NO,AT"

# Acceptance probes: famous routes that should sit near the top.
SPOT_CHECKS = {
    "CH": ["via alpina", "eiger trail"],
    "FR": ["gr 20", "tour du mont blanc", "gr 5"],
    "NO": ["besseggen", "olavsleden", "romsdalseggen"],
    "AT": ["adlerweg", "zentralalpenweg"],
}
ANCHOR_KM = 2.0            # prompt: catalogue entities within 2 km of the line
ANCHOR_POI_MIN_PV = 30     # POIs below this daily-view floor are not "famous"
ANCHORS_PER_TRIP = 3
PV_WORKERS = 8
PV_DELAY_S = 0.05

# All ranking knobs in one place. Weights sum to 1; each component is 0..1.
CONFIG = {
    "weights": {"network": 0.25, "portal": 0.15, "quality": 0.25,
                "popularity": 0.35},
    # iwn above nwn above rwn; lwn and untagged still rank, just low.
    "network_level": {"iwn": 1.0, "nwn": 0.8, "rwn": 0.55, "lwn": 0.3},
    "network_default": 0.2,
    # Checks that have not run yet score neutral, not zero: prompt order
    # allows popularity to run before validate.py and crosscheck_portals.py.
    "portal": {"agree": 1.0, "mismatch": 0.3, "missing": 0.6},
    "quality_missing": 0.6,
    # log10 scaling caps: daily views saturate at 10^4, sitelinks at ~200.
    "pv_log_cap": 4.0,
    "sitelink_log_cap": 2.3,
    "own_pv_weight": 0.65,
    "own_sitelink_weight": 0.45,
    # Borrowed fame is discounted: standing near the Matterhorn is not the
    # same as being the Matterhorn.
    "anchor_discount": 0.6,
    # Routes shorter than this ramp down linearly: extract-clipped crumbs of
    # famous routes (a 1 km 'Via Francigena parte Italia' stub at the border)
    # must not outrank real hikes. Real stages are comfortably above it.
    "full_length_km": 5.0,
    # Famous long-distance products are mapped as many stage relations
    # (Adlerweg 25, Via Alpina 29). Some, like the Adlerweg, carry no
    # wikipedia/wikidata identity anywhere, so this structural signal is the
    # only fame the staged data itself offers them.
    "family_bonus_weight": 0.35,
    "family_bonus_cap": 30,
}

# Stage naming conventions across the pilot countries; used to collapse the
# stages of one long route into a single shortlist family.
STAGE_WORDS = r"(?:etappe|etapp|etape|stage|dagsetapp|abschnitt|leg|section|tappa|troncon)"
_STAGE_RE = re.compile(r"\s*[-,(]*\s*\b" + STAGE_WORDS + r"\b.*$")
_COUNTER_RE = re.compile(r"\s+(?:r|n|s|e|w)?\d+[a-z.]?$")

_FOLD_MAP = str.maketrans({
    "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "ß": "ss", "ł": "l", "Ł": "l",
    "đ": "d", "Đ": "d", "œ": "oe", "Œ": "oe", "þ": "th", "Þ": "th",
    "ð": "d", "Ð": "d",
})


def fold(text):
    """Accent-folded lowercase. NFKD alone misses o-slash, l-stroke and
    friends (the POI-dedupe gotcha), hence the explicit map first."""
    text = (text or "").translate(_FOLD_MAP)
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c)).lower().strip()


def family_key(title, ref):
    """Collapse stages of one route into a family.

    'Via Alpina Red R21' -> 'via alpina red'; 'Nordlandsruta Etapp 17: ...'
    -> 'nordlandsruta'. A trailing counter is only stripped when a meaty stem
    remains, so 'GR 5' stays distinct from 'GR 65'. The ref tie-breaks routes
    whose stages carry only the parent name."""
    if title.startswith("OSM route "):
        return fold(title)   # synthetic titles must not merge into one family
    t = fold(title)
    t = _STAGE_RE.sub("", t)
    stripped = _COUNTER_RE.sub("", t)
    # Two-word guard: 'Wanderweg 563' must NOT fold to the generic word
    # 'wanderweg' (2,390 unrelated Austrian trails), while 'Via Alpina Red
    # R15' still folds to 'via alpina red'.
    if len(stripped) >= 6 and len(stripped.split()) >= 2:
        t = stripped
    t = t.rstrip(" :-,;.")
    if len(t) >= 4:
        return t
    r = fold(ref)
    return f"{t}|{r}" if r else (t or fold(title))


def ref_family_key(ref):
    """Normalised ref usable as a family key, or None.

    'GR20' and 'GR 20' both become 'gr 20', matching the title-derived
    family of untagged siblings. Digit-only refs (Austrian local Wanderweg
    numbers repeat across regions) and short ones never qualify."""
    r = re.sub(r"\s+", " ", fold(ref or "")).strip()
    r = re.sub(r"(?<=[a-z])(?=\d)", " ", r)
    compact = r.replace(" ", "").replace("-", "")
    if len(compact) < 3 or not any(c.isalpha() for c in compact):
        return None
    return r


# ---------------------------------------------------------------------------
# own fame: wikipedia pageviews + wikidata sitelinks on the relation
# ---------------------------------------------------------------------------

def wiki_url_from_tag(tag):
    """OSM wikipedia tag ('de:Adlerweg' or a full URL) -> article URL."""
    if not tag:
        return None
    if tag.startswith("http://") or tag.startswith("https://"):
        return tag
    m = re.match(r"^([a-z\-]+):(.+)$", tag)
    if m:
        return (f"https://{m.group(1)}.wikipedia.org/wiki/"
                + m.group(2).strip().replace(" ", "_"))
    return None


def fetch_pageviews(wiki_tags, offline):
    """{wikipedia tag: avg daily views}, cached in cache/trail_pageviews.json."""
    cache = {}
    if TRAIL_PV_CACHE.exists():
        try:
            cache = json.loads(TRAIL_PV_CACHE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}
    todo = sorted({t for t in wiki_tags
                   if t and t not in cache and wiki_url_from_tag(t)})
    if offline and todo:
        print(f"[pageviews] offline: skipping {len(todo)} uncached articles")
        todo = []
    if todo:
        print(f"[pageviews] fetching {len(todo)} articles "
              f"({len(cache)} cached), window {ea.PV_START}..{ea.PV_END}")

        def work(tag):
            time.sleep(PV_DELAY_S)
            return tag, ea.pageviews_avg(wiki_url_from_tag(tag))

        done = fails = 0
        with ThreadPoolExecutor(max_workers=PV_WORKERS) as ex:
            futs = [ex.submit(work, t) for t in todo]
            for f in as_completed(futs):
                tag, views = f.result()
                if views is None:
                    fails += 1     # hard failure: retry next run
                else:
                    cache[tag] = views
                done += 1
                if done % 200 == 0:
                    TRAIL_PV_CACHE.write_text(json.dumps(cache, indent=1),
                                              encoding="utf-8")
                    print(f"    {done}/{len(todo)} ({fails} failures)")
        TRAIL_PV_CACHE.parent.mkdir(exist_ok=True)
        TRAIL_PV_CACHE.write_text(json.dumps(cache, indent=1), encoding="utf-8")
        if fails:
            print(f"[pageviews] {fails} hard failures (will retry next run)")
    return {t: cache.get(t, 0) for t in wiki_tags if t}


def fetch_sitelinks(qids, offline):
    """{QID: sitelink count} through the shared WDQS cache."""
    qids = sorted({q for q in qids if q and re.fullmatch(r"Q\d+", q)})
    if offline:
        cache = ha._sitelink_cache()
        missing = sum(1 for q in qids if q not in cache)
        if missing:
            print(f"[sitelinks] offline: {missing} QIDs uncached, scoring 0")
        return {q: cache.get(q, 0) for q in qids}
    print(f"[sitelinks] resolving {len(qids)} QIDs via WDQS cache")
    return ha.sitelink_counts(qids)


# ---------------------------------------------------------------------------
# anchor fame: catalogue destinations and famous POIs near the line
# ---------------------------------------------------------------------------

def load_anchor_points(min_poi_pv):
    """[(name, fame_pv, lon, lat)] from the app catalogue.

    Destinations always anchor (their fame is the destination pageview
    cache); POIs only when their article draws at least min_poi_pv daily
    views, so a random chapel does not lend fame to every trail past it."""
    data = json.loads(APP_DATA.read_text(encoding="utf-8"))
    dest_pv = {}
    if DEST_PV_CACHE.exists():
        dest_pv = json.loads(DEST_PV_CACHE.read_text(encoding="utf-8"))
    poi_pv = {}
    if ENRICH_CACHE.exists():
        poi_pv = json.loads(ENRICH_CACHE.read_text(encoding="utf-8")).get("pop", {})

    anchors, n_dest, n_poi = [], 0, 0
    for did, d in data["destinations"].items():
        lat = d.get("city_lat", d.get("lat"))
        lon = d.get("city_lon", d.get("lon"))
        if lat is not None and lon is not None:
            pv = int(dest_pv.get(did) or 0)
            if pv > 0:
                anchors.append((d.get("city") or did, pv, lon, lat))
                n_dest += 1
        for it in (d.get("activities") or {}).get("items_full", []) or []:
            if it.get("lat") is None or it.get("lon") is None:
                continue
            pv = int(poi_pv.get(it.get("wiki") or "") or 0)
            if pv >= min_poi_pv:
                anchors.append((it["name"], pv, it["lon"], it["lat"]))
                n_poi += 1
    print(f"[anchors] {n_dest} destinations + {n_poi} famous POIs "
          f"(POI floor {min_poi_pv} views/day)")
    return anchors


def match_anchors(conn, countries, anchors, anchor_km, per_trip):
    """{trip_id: [(name, fame_pv, dist_m)]}, nearest-famous first.

    Both sides go through EPSG:3035 (LAEA Europe) so ST_DWithin works in
    metres for all pilot countries including northern Norway."""
    radius_m = anchor_km * 1000.0
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TEMP TABLE anchor_raw
                (name text, fame int, lon float8, lat float8)
            ON COMMIT DROP""")
        with cur.copy("COPY anchor_raw (name, fame, lon, lat) FROM STDIN") as cp:
            for row in anchors:
                cp.write_row(row)
        cur.execute("""
            CREATE TEMP TABLE anchor_pts ON COMMIT DROP AS
            SELECT name, fame,
                   ST_Transform(ST_SetSRID(ST_MakePoint(lon, lat), 4326), 3035)
                       AS geom
            FROM anchor_raw""")
        cur.execute("CREATE INDEX ON anchor_pts USING gist (geom)")
        cur.execute("""
            CREATE TEMP TABLE trip_proj ON COMMIT DROP AS
            SELECT id, ST_Transform(geom, 3035) AS g
            FROM trips
            WHERE source = 'osm' AND category = 'hike'
              AND country = ANY(%s)""", (countries,))
        cur.execute("CREATE INDEX ON trip_proj USING gist (g)")
        cur.execute("""
            SELECT id, name, fame, dist_m FROM (
                SELECT tp.id, a.name, a.fame,
                       ST_Distance(tp.g, a.geom)::int AS dist_m,
                       ROW_NUMBER() OVER (PARTITION BY tp.id
                                          ORDER BY a.fame DESC) AS rn
                FROM trip_proj tp
                JOIN anchor_pts a ON ST_DWithin(tp.g, a.geom, %s)
            ) ranked
            WHERE rn <= %s""", (radius_m, per_trip))
        out = defaultdict(list)
        for tid, name, fame, dist_m in cur.fetchall():
            out[tid].append((name, fame, dist_m))
    conn.commit()   # releases the ON COMMIT DROP temp tables
    return out


# ---------------------------------------------------------------------------
# scoring
# ---------------------------------------------------------------------------

def log_score(value, cap):
    return min(1.0, math.log10(1 + max(0, value)) / cap)


def network_score(network):
    tokens = {t.strip() for t in (network or "").replace(";", ",").split(",")}
    levels = CONFIG["network_level"]
    return max((levels[t] for t in tokens if t in levels),
               default=CONFIG["network_default"])


def popularity_score(has_own_tags, pv, sitelinks, anchor_fame, family_size):
    """pv and sitelinks are the trip's effective (claim-split) values.

    Anchors are a fallback, per the prompt: a relation with its own
    wikipedia/wikidata identity is judged on that identity alone. Otherwise
    an urban feeder stage brushing a famous city centre outranks routes that
    are famous in their own right. The family bonus rewards stage-structured
    routes on top of either base."""
    if has_own_tags:
        base = min(1.0,
                   CONFIG["own_pv_weight"] * log_score(pv, CONFIG["pv_log_cap"])
                   + CONFIG["own_sitelink_weight"]
                   * log_score(sitelinks, CONFIG["sitelink_log_cap"]))
    else:
        base = (CONFIG["anchor_discount"]
                * log_score(anchor_fame, CONFIG["pv_log_cap"]))
    cap = CONFIG["family_bonus_cap"]
    prominence = math.log10(1 + min(family_size, cap)) / math.log10(1 + cap)
    return min(1.0, base + CONFIG["family_bonus_weight"] * prominence)


def length_factor(distance_m):
    full = CONFIG["full_length_km"] * 1000.0
    return max(0.0, min(1.0, (distance_m or 0) / full))


# --------------------------------------------------------------------------
# Day-hike family: the flagship ranking's length factor exists to suppress
# extract-clipped crumbs of long routes, but it also buries genuine half-day
# loops, which rarely have their own Wikipedia footprint. This family flips
# the lens: eligibility is a walkable loop, and fame comes from the
# CATALOGUE anchors near the line (a loop above a famous lake inherits the
# lake's draw). Network level is ignored: day hikes are usually lwn/local.
# --------------------------------------------------------------------------

DAYHIKE_MIN_M = 5_000
DAYHIKE_MAX_M = 25_000
DAYHIKE_LOOP_GAP_M = 2_000
DAYHIKE_SAC_OK = {None, "", "hiking", "mountain_hiking"}
DAYHIKE_WEIGHTS = {"portal": 0.15, "quality": 0.35, "popularity": 0.50}


def is_dayhike(trip):
    d = trip["distance_m"] or 0
    if not DAYHIKE_MIN_M <= d <= DAYHIKE_MAX_M:
        return False
    if (trip.get("sac_scale") or "") not in DAYHIKE_SAC_OK:
        return False
    if (trip.get("roundtrip") or "").lower() == "yes":
        return True
    gap = trip.get("loop_gap_m")
    return gap is not None and gap <= DAYHIKE_LOOP_GAP_M


def dayhike_rank(trip):
    """0-100 rank for the dayhike family: anchored fame first, no network
    component, no length factor (eligibility already bounded the length)."""
    if trip["portal_agreement"] is None:
        portal = CONFIG["portal"]["missing"]
    elif trip["portal_agreement"]:
        portal = CONFIG["portal"]["agree"]
    else:
        portal = CONFIG["portal"]["mismatch"]
    quality = (CONFIG["quality_missing"] if trip["quality_score"] is None
               else max(0.0, min(1.0, float(trip["quality_score"]) / 100.0)))
    anchor_fame = max((f for _, f, _ in trip["anchors"]), default=0)
    own = min(1.0, CONFIG["own_pv_weight"]
              * log_score(trip["pageviews"], CONFIG["pv_log_cap"])
              + CONFIG["own_sitelink_weight"]
              * log_score(trip["sitelinks"], CONFIG["sitelink_log_cap"]))
    pop = max(log_score(anchor_fame, CONFIG["pv_log_cap"]), own)
    components = {"portal": portal, "quality": quality, "popularity": pop}
    rank = 100.0 * sum(DAYHIKE_WEIGHTS[k] * v for k, v in components.items())
    return round(rank, 2), components


def curation_rank(trip):
    w = CONFIG["weights"]
    if trip["portal_agreement"] is None:
        portal = CONFIG["portal"]["missing"]
    elif trip["portal_agreement"]:
        portal = CONFIG["portal"]["agree"]
    else:
        portal = CONFIG["portal"]["mismatch"]
    quality = (CONFIG["quality_missing"] if trip["quality_score"] is None
               else max(0.0, min(1.0, float(trip["quality_score"]) / 100.0)))
    components = {
        "network": network_score(trip["network"]),
        "portal": portal,
        "quality": quality,
        "popularity": trip["popularity"],
    }
    rank = 100.0 * sum(w[k] * v for k, v in components.items())
    factor = length_factor(trip["distance_m"])
    if factor < 1.0:
        components["length_factor"] = round(factor, 3)
        rank *= factor
    return round(rank, 2), components


# ---------------------------------------------------------------------------
# DB in/out
# ---------------------------------------------------------------------------

def load_trips(conn, countries):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, country, title, network, distance_m, quality_score,
                   status, source_ref, raw_tags->>'ref',
                   raw_tags->>'wikipedia', raw_tags->>'wikidata',
                   sac_scale, raw_tags->>'roundtrip',
                   ST_Distance(
                       ST_StartPoint(ST_GeometryN(geom, 1))::geography,
                       ST_EndPoint(ST_GeometryN(
                           geom, ST_NumGeometries(geom)))::geography)
            FROM trips
            WHERE source = 'osm' AND category = 'hike'
              AND country = ANY(%s)""", (countries,))
        cols = ("id", "country", "title", "network", "distance_m",
                "quality_score", "status", "source_ref", "ref",
                "wikipedia", "wikidata", "sac_scale", "roundtrip",
                "loop_gap_m")
        trips = [dict(zip(cols, row)) for row in cur.fetchall()]
        cur.execute("""
            SELECT DISTINCT ON (subject_id) subject_id, passed
            FROM validation_runs
            WHERE subject_type = 'trip' AND check_name = 'portal_agreement'
            ORDER BY subject_id, run_at DESC""")
        portal = dict(cur.fetchall())
    for t in trips:
        t["portal_agreement"] = portal.get(t["id"])
    return trips


def write_validation_rows(conn, trips, check_name="popularity"):
    from psycopg.types.json import Jsonb
    rows = [("trip", t["id"], check_name, True, t["curation_rank"],
             Jsonb({"curation_rank": t["curation_rank"],
                    "components": t["components"],
                    "pageviews_day": t["pageviews"],
                    "sitelinks": t["sitelinks"],
                    "anchors": [{"name": n, "fame": f, "dist_m": d}
                                for n, f, d in t["anchors"]],
                    "family": t["family"]}))
            for t in trips]
    with conn.cursor() as cur:
        cur.executemany("""
            INSERT INTO validation_runs
                (subject_type, subject_id, check_name, passed, score, details)
            VALUES (%s, %s, %s, %s, %s, %s)""", rows)
    conn.commit()


# ---------------------------------------------------------------------------
# shortlists
# ---------------------------------------------------------------------------

def shortlist(trips, top_n):
    """(top rows, full family ranking): best trip per route family, ranked.

    Relations that had neither a name nor a ref ingest under a synthetic
    'OSM route N' title; a curator cannot seed from those, so they stay in
    the DB scoring but out of the shortlists."""
    families = defaultdict(list)
    for t in trips:
        if t["title"].startswith("OSM route "):
            continue
        families[t["family"]].append(t)
    best = []
    for members in families.values():
        members.sort(key=lambda t: -t["curation_rank"])
        head = members[0]
        head["family_members"] = len(members)
        best.append(head)
    best.sort(key=lambda t: -t["curation_rank"])
    return best[:top_n], best


def spot_check(country, ranked):
    """Where do the famous routes actually sit in the family ranking?"""
    for needle in SPOT_CHECKS.get(country, []):
        hits = [(i, t) for i, t in enumerate(ranked, 1)
                if needle in fold(t["title"]) or needle in fold(t["ref"] or "")]
        if hits:
            i, t = hits[0]
            print(f"  spot check {needle!r}: family rank {i}/{len(ranked)} "
                  f"({t['title']}, {t['curation_rank']:.1f})")
        else:
            print(f"  spot check {needle!r}: NOT FOUND in staged trips")


def write_csv(path, rows):
    fields = ["rank", "curation_rank", "title", "ref", "network",
              "distance_km", "popularity", "pageviews_day", "sitelinks",
              "anchors", "quality_score", "portal_agreement", "status",
              "family_members", "trip_id", "osm_relation"]
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(fields)
        for i, t in enumerate(rows, 1):
            writer.writerow([
                i, t["curation_rank"], t["title"], t["ref"] or "",
                t["network"] or "",
                round((t["distance_m"] or 0) / 1000.0, 1),
                round(t["popularity"], 3), t["pageviews"], t["sitelinks"],
                "; ".join(f"{n} ({f}/day, {d} m)" for n, f, d in t["anchors"]),
                t["quality_score"] if t["quality_score"] is not None else "",
                {True: "agree", False: "mismatch"}.get(
                    t["portal_agreement"], ""),
                t["status"], t["family_members"], t["id"], t["source_ref"],
            ])


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(
        description="Rank staged trails by popularity and emit per-country "
                    "seed shortlists for curation.")
    parser.add_argument("--countries", default=COUNTRIES_DEFAULT,
                        help=f"ISO2 list (default: {COUNTRIES_DEFAULT})")
    parser.add_argument("--top", type=int, default=15,
                        help="shortlist size per country (default: 15)")
    parser.add_argument("--anchor-km", type=float, default=ANCHOR_KM,
                        help="anchor search radius around the line in km")
    parser.add_argument("--min-anchor-pv", type=int, default=ANCHOR_POI_MIN_PV,
                        help="daily-view floor for POI anchors")
    parser.add_argument("--offline", action="store_true",
                        help="no network calls; use fame caches as they are")
    parser.add_argument("--dry-run", action="store_true",
                        help="no validation_runs writes, CSVs still written")
    parser.add_argument("--family", choices=("flagship", "dayhikes"),
                        default="flagship",
                        help="flagship: famous long routes (default); "
                             "dayhikes: 5-25 km walkable loops ranked by "
                             "nearby catalogue fame")
    args = parser.parse_args()

    countries = [c.strip().upper() for c in args.countries.split(",")
                 if c.strip()]
    conn = connect()
    trips = load_trips(conn, countries)
    present = {t["country"] for t in trips}
    for c in countries:
        if c not in present:
            print(f"WARNING: no staged trips for {c}; "
                  f"run ingest_osm_routes.py for it first")
    if not trips:
        sys.exit("no staged trips for the requested countries")
    print(f"[trips] {len(trips)} staged trips in "
          f"{', '.join(sorted(present))}")

    pageviews = fetch_pageviews([t["wikipedia"] for t in trips], args.offline)
    sitelinks = fetch_sitelinks([t["wikidata"] for t in trips], args.offline)
    anchors = match_anchors(conn, countries,
                            load_anchor_points(args.min_anchor_pv),
                            args.anchor_km, ANCHORS_PER_TRIP)
    with_anchors = sum(1 for t in trips if anchors.get(t["id"]))
    print(f"[anchors] {with_anchors}/{len(trips)} trips have an anchor "
          f"within {args.anchor_km:g} km")

    # A wikipedia/wikidata tag shared across many route FAMILIES describes a
    # network (every local Jakobsweg feeder carries the world-famous Way of
    # St. James article), not the trip itself: split the article's fame
    # across the claiming families. Stages of one route sharing their own
    # route's article are a single family and keep full credit.
    # A ref shared by several relations names the ROUTE (all GR 20 pieces
    # carry ref 'GR 20'), so it unifies families that title folding cannot;
    # per-stage refs (Adlerweg AW1..AW19) stay below the count floor and
    # fall through to the title-derived family.
    ref_counts = defaultdict(int)
    for t in trips:
        rk = ref_family_key(t["ref"])
        if rk:
            ref_counts[rk] += 1

    wiki_claims, qid_claims = defaultdict(set), defaultdict(set)
    family_sizes = defaultdict(int)
    for t in trips:
        rk = ref_family_key(t["ref"])
        t["family"] = (rk if rk and ref_counts[rk] >= 3
                       else family_key(t["title"], t["ref"]))
        family_sizes[t["family"]] += 1
        if t["wikipedia"]:
            wiki_claims[t["wikipedia"]].add(t["family"])
        if t["wikidata"]:
            qid_claims[t["wikidata"]].add(t["family"])

    for t in trips:
        t["pageviews"] = pageviews.get(t["wikipedia"], 0)
        t["sitelinks"] = sitelinks.get(t["wikidata"], 0)
        pv_eff = t["pageviews"] / max(1, len(wiki_claims.get(t["wikipedia"], ())))
        sl_eff = t["sitelinks"] / max(1, len(qid_claims.get(t["wikidata"], ())))
        t["anchors"] = anchors.get(t["id"], [])
        anchor_fame = max((f for _, f, _ in t["anchors"]), default=0)
        has_own = bool(t["wikipedia"] or t["wikidata"])
        t["popularity"] = popularity_score(has_own, pv_eff, sl_eff,
                                           anchor_fame,
                                           family_sizes[t["family"]])
        t["curation_rank"], t["components"] = curation_rank(t)

    check_name, suffix = "popularity", ""
    if args.family == "dayhikes":
        trips = [t for t in trips if is_dayhike(t)]
        print(f"[dayhikes] {len(trips)} eligible walkable loops "
              f"({DAYHIKE_MIN_M / 1000:g}-{DAYHIKE_MAX_M / 1000:g} km)")
        for t in trips:
            t["curation_rank"], t["components"] = dayhike_rank(t)
            t["popularity"] = t["components"]["popularity"]
        check_name, suffix = "popularity_dayhike", "_dayhikes"

    if args.dry_run:
        print("[db] dry run: skipping validation_runs writes")
    elif trips:
        write_validation_rows(conn, trips, check_name)
        print(f"[db] wrote {len(trips)} {check_name} rows to validation_runs")
    conn.close()

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    by_country = defaultdict(list)
    for t in trips:
        by_country[t["country"]].append(t)
    for country in sorted(by_country):
        rows, ranked = shortlist(by_country[country], args.top)
        path = REPORT_DIR / f"{country}{suffix}.csv"
        write_csv(path, rows)
        print(f"\n[{country}] shortlist -> {path}")
        for i, t in enumerate(rows[:10], 1):
            nets = t["network"] or "-"
            print(f"  {i:2}. {t['curation_rank']:6.2f}  {t['title']} "
                  f"({nets}, {(t['distance_m'] or 0) / 1000:.0f} km, "
                  f"pop {t['popularity']:.2f}, {t['family_members']} in family)")
        if args.family == "flagship":
            spot_check(country, ranked)


if __name__ == "__main__":
    main()
