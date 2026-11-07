"""Trails external check: Carta's walks against outside references (T1181).

Tier: Validation (ROADMAP D23 and D24). Run by hand, by the eval runner
(continent-app/scripts/eval/run.mjs trails-external) and, from P3 on, by the
release run.

What it answers:
  coverage  which well-known trails from outside references Carta lacks;
  ranking   which of them Carta has but rates below its top band (v5
            exceptional or excellent);
  gaps      the largest of both, by how well known the trail is, each with
            the cause the data shows (the coverage report's reason code, the
            length cap, the weakest rating parts).

Inputs, all read only:
  data/reports/validation/trails_reference.json   the reference list (names,
      aliases, countries, an approximate start, labels, sources). Facts
      only, no copied text; sources and their terms are in the same file.
  continent-app/public/trails/*.json and trip/*.json   the shipped wire.
  data/trails/famous_registry.json, data/reports/trails_coverage.json
      Carta's own famous registry and its coverage reasons, used for the
      cause of a miss and for the Wikidata and OSM ids of a reference.

Matching, strongest first. A reference trail is matched by a published row
(rated or listed tier) in one of its countries when:
  1. ids     the row's OSM relation or Wikidata id equals the one the famous
             registry holds for that trail (found by exact name), or
  2. name    one of the trail's names, folded, equals or is contained as
             whole words in one of the row's names: its title, its family,
             the parent it is a stage of (h.of, h.top) or its ref, or
  3. near    the row starts or ends within NEAR_M of the trail's start and
             shares at least half of the trail's content words.
A name with a compass word the trail's name lacks ("North Kerry Way") does
not match, and a row that carries the name only as the trunk of a side loop
or link path ("Moselsteig Seitensprung ...", "Liaison ... GR20") is recorded
as a side trail: a trail with nothing but side trails counts as missing.
A trail split into stages is matched by any stage. Its representative row,
for ranking, is the matched row with the highest v5 score among the
strongest kind of match present (an id or an exact name, then a name inside
a longer title, then a nearby start), so a link path named after the trail
does not stand in for it when the trail itself is published.

The gate (--check): the share of reference trails matched and the share
whose representative row is in the top band must not fall below the
baseline in data/reports/validation/trails_external_baseline.json, which is
today's value. --write-baseline moves it, deliberately, with the report.

    python -I scripts/validation/trails_external.py            # report
    python -I scripts/validation/trails_external.py --write    # + files
    python -I scripts/validation/trails_external.py --check    # gate only

No network, no model, no Claude API.
"""

import argparse
import hashlib
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

from names import base_name

DATA_ROOT = Path(os.environ.get("CARTA_DATA_ROOT") or ROOT).resolve()
WIRE_DIR = DATA_ROOT / "continent-app" / "public" / "trails"
VALID_DIR = ROOT / "data" / "reports" / "validation"
REFERENCE = VALID_DIR / "trails_reference.json"
BASELINE = VALID_DIR / "trails_external_baseline.json"
OUT_JSON = VALID_DIR / "trails_external.json"
OUT_MD = VALID_DIR / "trails_external.md"
REGISTRY = ROOT / "data" / "trails" / "famous_registry.json"
COVERAGE = ROOT / "data" / "reports" / "trails_coverage.json"

TOP_BANDS = ("exceptional", "excellent")
BAND_ORDER = ["exceptional", "excellent", "very_good", "good", "pleasant",
              "below_pleasant"]
TOP_CUT = 8.3            # lowest v5 score in the top band on the wire
NEAR_M = 1500.0          # start or end of a row near the trail's start
TREK_MAX_KM = 400        # curate.TREK_MAX_M, the longest single record
LINE_NEAR_M = 600.0      # T1201: a day walk's start this close to a longer row's line
LONGER_FACTOR = 2.0      # that row at least twice the walk's length
LONGER_MIN_KM = 15.0     # or, for a walk with no length, at least this long
GAPS_N = 30
GAPS_MISSING = 20        # of the 30: the largest coverage gaps
GAPS_LOW = GAPS_N - GAPS_MISSING   # and the largest ranking gaps

# How much a label says about fame. A certified or national trail is one a
# traveller looks for by name; a Wikipedia list entry less so on its own.
LABEL_WEIGHT = {
    "lqt": 3.0,
    "national_trail": 3.0,
    "quality_label": 2.0,
    "famous_day": 2.5,
    "wikipedia_list": 1.0,
}

STOPWORDS = {
    "gr", "e", "de", "du", "des", "la", "le", "les", "el", "il", "der", "di",
    "die", "das", "den", "dem", "von", "van", "of", "the", "and", "to", "da",
    "del", "della", "dei", "degli", "do", "dos", "y", "et", "und",
    "sentier", "chemin", "tour", "trail", "path", "way", "weg", "wanderweg",
    "route", "circuit", "boucle", "sendero", "camino", "ruta", "via",
    "sentiero", "pot", "staza", "szlak", "stezka", "traseu", "parte", "part",
    "etappe", "etape", "stage", "tappa", "north", "south", "east", "west",
    "nord", "sud", "est", "ouest", "national", "park", "grande", "randonnee",
    "walk", "loop", "circular", "st", "saint", "round", "rundweg", "steig",
    "hiking", "lake", "lago", "lac", "see", "mount", "monte", "mont", "gorge",
    "coast", "coastal", "high", "alta", "alto", "upper", "lower", "valley",
    "river", "trek", "long", "distance", "great", "old", "new", "main",
    "ring", "rota", "percorso", "anello", "giro", "kammweg", "hohenweg",
    "panoramaweg", "hut", "huts", "line", "track", "footpath",
}


# ---------------------------------------------------------------------------
# Names
# ---------------------------------------------------------------------------

def fold(text):
    """Accent-folded lowercase with every script kept (Greek and Cyrillic
    names must not fold to nothing), punctuation to spaces, and a code such
    as "GR 20" or "E 4" joined to "gr20", "e4"."""
    s = unicodedata.normalize("NFKD", str(text or "").casefold())
    s = "".join(c for c in s if not unicodedata.combining(c))
    for a, b in (("ø", "o"), ("ł", "l"), ("æ", "ae"), ("ß", "ss"),
                 ("đ", "d"), ("þ", "th"), ("ð", "d"), ("œ", "oe")):
        s = s.replace(a, b)
    s = re.sub(r"[\W_]+", " ", s).strip()
    s = re.sub(r"\b([a-z]{1,3}) (\d+[a-z]?)\b", r"\1\2", s)
    return s


def keys_of(text):
    """The folded forms one name answers to: as written, and with a stage
    marker stripped."""
    out = set()
    if not text:
        return out
    for t in (text, base_name(text)):
        k = fold(t)
        if k:
            out.add(k)
    return out


def usable_key(k):
    """A reference key long enough to match on its own. A lone short word
    ("tmb", "whw") would match half the map; a code with a digit ("gr20",
    "e4") is fine because it is matched as a whole word."""
    words = k.split()
    if len(words) >= 2:
        return any(w not in STOPWORDS for w in words)
    w = words[0] if words else ""
    if any(c.isdigit() for c in w):
        return len(w) >= 2
    return len(w) >= 5 and w not in STOPWORDS


def word_in(needle, hay):
    return bool(needle and hay) and f" {needle} " in f" {hay} "


DIRECTIONS = {"north", "south", "east", "west", "nord", "sud", "ost", "northern", "southern", "eastern", "western", "noord", "zuid",
              "oost", "norra", "sodra", "ostra", "vastra"}

# A row whose title names the trail only as the trunk of a side loop, a spur
# or a link path is not the trail: "Moselsteig Seitensprung ..." is one of
# the certified side loops, "Liaison ... GR20" a link to it.
SIDE_RE = re.compile(r"\b(seitensprung|spur|zuweg|zubringer|zugangsweg|liaison|"
                     r"link|verbindungsweg|anbindung|raccordement|bretelle|"
                     r"collegamento|enlace)\b")


def direction_conflict(ref_key, row_key):
    """True when the row's name carries a compass word the trail's name does
    not: "North Kerry Way" is not the Kerry Way."""
    rw, kw = set(row_key.split()), set(ref_key.split())
    return bool((rw & DIRECTIONS) - kw)


def content_words(k):
    return {w for w in k.split()
            if w not in STOPWORDS and len(w) >= 4 and not w.isdigit()}


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def dist_m(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371000.0 * 2 * math.asin(min(1.0, math.sqrt(a)))


def line_of(geometry):
    """[(lat, lon)] of every vertex of a (Multi)LineString, parts in order."""
    if not geometry:
        return []
    coords = geometry.get("coordinates") or []
    if geometry.get("type") == "LineString":
        coords = [coords]
    return [(c[1], c[0]) for part in coords if part for c in part]


def line_near_m(lat, lon, line):
    """Shortest distance in metres from a point to a polyline, on a local
    flat projection (fine at the few kilometres this is asked about)."""
    if not line:
        return math.inf
    kx = 111320.0 * math.cos(math.radians(lat))
    ky = 110540.0
    pts = [((b - lon) * kx, (a - lat) * ky) for a, b in line]
    if len(pts) == 1:
        return math.hypot(*pts[0])
    best = math.inf
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        dx, dy = x2 - x1, y2 - y1
        L = dx * dx + dy * dy
        t = 0.0 if L == 0 else max(0.0, min(1.0, -(x1 * dx + y1 * dy) / L))
        best = min(best, math.hypot(x1 + t * dx, y1 + t * dy))
    return best


def ends_of(geometry):
    """[(lat, lon)] of the first and last point of a (Multi)LineString."""
    if not geometry:
        return []
    coords = geometry.get("coordinates") or []
    if geometry.get("type") == "LineString":
        coords = [coords]
    lines = [c for c in coords if c]
    if not lines:
        return []
    a, b = lines[0][0], lines[-1][-1]
    return [(a[1], a[0]), (b[1], b[0])]


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def band_of(row):
    v = row.get("v5") or {}
    if v.get("band"):
        return v["band"]
    if v.get("score") is not None:
        return "below_pleasant"
    return None


def load_carta(wire_dir=WIRE_DIR, details=True):
    """Every published walk (rated and listed tiers) as a compact dict."""
    wire_dir = Path(wire_dir)
    rows, generated_at = [], None
    for path in sorted(wire_dir.glob("[A-Z][A-Z].json")):
        blob = load_json(path, {})
        generated_at = generated_at or blob.get("generated_at")
        for tier, items in (("rated", blob.get("trips") or []),
                            ("listed", blob.get("listed") or [])):
            for r in items:
                if r.get("category") != "hike":
                    continue
                names = [r.get("name")]
                h = r.get("h") or {}
                names += [h.get("of"), h.get("top"),
                          (r.get("fam") or {}).get("n"),
                          (r.get("f") or {}).get("ref")]
                keys = set()
                for n in names:
                    keys |= keys_of(n)
                v = r.get("v5") or {}
                rows.append({
                    "id": r["id"], "cc": r.get("country") or path.stem,
                    "name": r.get("name"), "tier": tier, "keys": keys,
                    "osm": r.get("osm"), "wikidata": None,
                    "ends": ends_of(r.get("geometry")),
                    "line": line_of(r.get("geometry")),
                    "km": round((r.get("distance_m") or 0) / 1000, 1),
                    "score": v.get("score"), "band": band_of(r),
                    "rank": v.get("rank"),
                })
    if details:
        for row in rows:
            d = load_json(wire_dir / "trip" / f"{row['id']}.json")
            if not d:
                continue
            tags = d.get("tags_raw") or {}
            row["wikidata"] = tags.get("wikidata")
            for k in ("name:en", "official_name", "alt_name"):
                row["keys"] |= keys_of(tags.get(k))
            row["parts"] = d.get("rating_parts")
            # T1201 (T1181-k): the named sights on the line, so a famous day
            # walk is found on a longer row only when that row names its
            # landmark (Durdle Door on the England Coast Path).
            sights = set()
            for h in (d.get("highlights") or []) + (d.get("passes") or []):
                if isinstance(h, dict):
                    sights |= keys_of(h.get("name"))
            row["sights"] = sights
    return rows, generated_at


def load_registry(registry=REGISTRY, coverage=COVERAGE):
    """{country: [{keys, id, wikidata, osm, pageviews, fame, reason}]}."""
    reg = load_json(registry, {}) or {}
    cov = load_json(coverage, {}) or {}
    reason = {r["id"]: r.get("reason") for r in cov.get("rows") or []}
    out = defaultdict(list)
    for r in reg.get("rows") or []:
        ev = r.get("evidence") or {}
        keys = keys_of(r.get("name"))
        for a in r.get("aliases") or []:
            keys |= keys_of(a)
        wp = ev.get("wikipedia") or {}
        keys |= keys_of(wp.get("title"))
        out[r.get("country")].append({
            "id": r["id"], "name": r.get("name"), "keys": keys,
            "wikidata": ev.get("wikidata"),
            "osm": (ev.get("osm") or {}).get("relation_id")
            or (ev.get("waymarked") or {}).get("relation_id"),
            "pageviews": wp.get("pageviews_avg"),
            "fame": r.get("fame_score"),
            "reason": reason.get(r["id"]),
            "lat": r.get("lat"), "lon": r.get("lon"),
        })
    return out


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

def ref_keys(ref):
    keys = set()
    for n in [ref.get("name")] + list(ref.get("aliases") or []):
        keys |= keys_of(n)
    return {k for k in keys if usable_key(k)}


def registry_hits(ref, keys, reg):
    """Registry rows in the trail's countries whose name equals one of its
    keys, best known first."""
    hits = []
    for cc in ref.get("countries") or []:
        for r in reg.get(cc, []):
            if r["keys"] & keys:
                hits.append(r)
    hits.sort(key=lambda r: -(r.get("fame") or 0))
    return hits


class Index:
    def __init__(self, rows):
        self.rows = rows
        self.by_cc = defaultdict(list)
        self.by_osm = defaultdict(list)
        self.by_qid = defaultdict(list)
        for r in rows:
            self.by_cc[r["cc"]].append(r)
            if r.get("osm"):
                self.by_osm[r["osm"]].append(r)
            if r.get("wikidata"):
                self.by_qid[r["wikidata"]].append(r)


def match_ref(ref, idx, reg):
    """(matched rows with their method, registry hits) for one trail."""
    keys = ref_keys(ref)
    ccs = set(ref.get("countries") or [])
    hits = registry_hits(ref, keys, reg)
    found = {}

    # Ids count only inside the trail's countries: one Wikidata item for "the
    # Way of St James" is cited by pilgrim paths from Basel to Budapest.
    for h in hits[:3]:
        for r in idx.by_osm.get(h.get("osm"), []) if h.get("osm") else []:
            if r["cc"] in ccs:
                found.setdefault(r["id"], (r, "osm id"))
        for r in idx.by_qid.get(h.get("wikidata"), []) if h.get("wikidata") else []:
            if r["cc"] in ccs:
                found.setdefault(r["id"], (r, "wikidata id"))
    if ref.get("wikidata"):
        for r in idx.by_qid.get(ref["wikidata"], []):
            if r["cc"] in ccs:
                found.setdefault(r["id"], (r, "wikidata id"))

    for cc in ccs:
        for r in idx.by_cc.get(cc, []):
            if r["id"] in found:
                continue
            own_side = bool(SIDE_RE.search(fold(r["name"])))
            if keys & r["keys"]:
                found[r["id"]] = (r, "side trail" if own_side else "name exact")
                continue
            hit = [(k, rk) for k in keys for rk in r["keys"]
                   if word_in(k, rk) and not direction_conflict(k, rk)]
            if hit:
                side = own_side or any(SIDE_RE.search(rk) for _, rk in hit)
                found[r["id"]] = (r, "side trail" if side else "name")

    start = ref.get("start") or {}
    if start.get("lat") is not None and start.get("lon") is not None:
        words = set()
        for k in keys:
            words |= content_words(k)
        need = max(1, math.ceil(len(words) / 2))
        if words:
            for cc in ccs:
                for r in idx.by_cc.get(cc, []):
                    if r["id"] in found or not r["ends"]:
                        continue
                    near = min(dist_m(start["lat"], start["lon"], a, b)
                               for a, b in r["ends"])
                    if near > NEAR_M:
                        continue
                    rw = set()
                    for rk in r["keys"]:
                        rw |= content_words(rk)
                    if len(words & rw) >= need and not any(
                            direction_conflict(k, rk) for k in keys for rk in r["keys"]
                            if content_words(k) & content_words(rk)):
                        found[r["id"]] = (r, "near start")
    # T1201 (T1181-k): a famous day walk on a longer published row (Lulworth
    # Cove to Durdle Door on the England Coast Path). Only when nothing else
    # matched, only for day walks, and only rows at least LONGER_FACTOR times
    # the walk whose line passes within LINE_NEAR_M of its start. The starts
    # are recalled to two decimals (about 0.5 km), hence the radius. When the
    # registry places the walk's landmark (the summit, the lake, the arch),
    # the row must pass that too, and the row must name one of the walk's
    # words among its own sights: a lakeside path that starts where the
    # Helvellyn walk starts does not climb Helvellyn.
    if not found and ref.get("kind") == "day" and start.get("lat") is not None \
            and start.get("lon") is not None:
        words_all = set()
        for k in keys:
            words_all |= content_words(k)
        mark = next(((h["lat"], h["lon"]) for h in hits[:1]
                     if h.get("lat") is not None and h.get("lon") is not None), None)
        need_km = LONGER_FACTOR * (ref.get("length_km") or LONGER_MIN_KM / LONGER_FACTOR)
        for cc in ccs:
            for r in idx.by_cc.get(cc, []):
                if (r["km"] or 0) < need_km or not r.get("line"):
                    continue
                if SIDE_RE.search(fold(r["name"] or "")):
                    continue
                if line_near_m(start["lat"], start["lon"], r["line"]) > LINE_NEAR_M:
                    continue
                if mark and line_near_m(mark[0], mark[1], r["line"]) > LINE_NEAR_M:
                    continue
                rs = set()
                for k in r.get("sights") or ():
                    rs |= content_words(k)
                if not words_all & rs:
                    continue
                found[r["id"]] = (r, "on a longer route")
    return list(found.values()), hits


METHOD_RANK = {"osm id": 0, "wikidata id": 0, "name exact": 0, "name": 1,
               "near start": 2, "on a longer route": 3, "side trail": 4}


def score_key(r):
    return r["score"] if r.get("score") is not None else -1


def fame_weight(ref, hit):
    w = sum(LABEL_WEIGHT.get(lb, 0.5) for lb in set(ref.get("labels") or []))
    pv = (hit or {}).get("pageviews") or 0
    return round(w + min(2.0, math.log10(1 + pv) / 1.5), 2)


REASON_TEXT = {
    "way_only_not_derived": "named OSM ways but no route relation, and way chaining did not build it",
    "failed_continuity": "OSM route geometry is broken and failed the one-line gate",
    "below_quota": "ingested and eligible but not picked by curate's regional quota",
    "no_osm_data": "nothing in OSM to build from",
    "unplaced": "in the registry with no coordinate, so no region holds it",
    "unresolved_seed": "a seeded name that resolved to no evidence",
    "out_of_scope": "outside the catalogue or not a walk",
    "matched": ("the coverage report (the lab's state) has it published and the shipped wire "
                "does not: it ships with the next trails export"),
}


def auto_cause(ref, res):
    """A first cause from the data; the 30 largest are then read by hand."""
    hit = res["registry"]
    if res["status"] == "missing":
        if (ref.get("length_km") or 0) > TREK_MAX_KM:
            return ("too_long", (f"longer than the {TREK_MAX_KM} km single-record cap "
                                 "(curate.TREK_MAX_M); needs one parent record with stages (D24, S100)"))
        side = (f"; only {res['side_trails']} side loops or link paths named after it are published"
                if res.get("side_trails") else "")
        if hit and hit.get("reason"):
            return (hit["reason"], REASON_TEXT.get(hit["reason"], hit["reason"]) + side)
        if side:
            return ("side_trails_only", side[2:])
        if hit:
            return ("not_in_coverage", "in the famous registry but not in the coverage report")
        return ("not_in_registry", ("not in the famous registry under this name: no Wikidata, "
                                    "OSM fame tag or Waymarked route found by the harvest"))
    if not res["in_top"]:
        best = res["best"]
        if best.get("band") is None:
            return ("unrated", "published in the listed tier only, without a v5 rating")
        parts = best.get("parts") or {}
        weak = sorted(parts.items(), key=lambda kv: kv[1])[:2]
        w = ", ".join(f"{k} {v:.2f}" for k, v in weak)
        return ("rated_low", f"v5 {best['score']} ({best['band']}); weakest parts: {w or 'n/a'}")
    return (None, None)


def evaluate(refs, rows, reg):
    idx = Index(rows)
    out = []
    for ref in refs:
        matched, hits = match_ref(ref, idx, reg)
        hit = hits[0] if hits else None
        side_only = [r for r, m in matched if m == "side trail"]
        if len(side_only) == len(matched):
            matched = []
        res = {
            "id": ref["id"], "name": ref["name"],
            "countries": ref.get("countries") or [],
            "kind": ref.get("kind"), "labels": sorted(set(ref.get("labels") or [])),
            "length_km": ref.get("length_km"),
            "status": "matched" if matched else "missing",
            "methods": dict(Counter(m for _, m in matched)),
            "n_rows": len(matched),
            "side_trails": len(side_only),
            "registry": ({k: hit.get(k) for k in ("id", "name", "wikidata", "osm",
                                                  "pageviews", "fame", "reason")}
                         if hit else None),
            "best": None, "in_top": False,
        }
        if matched:
            # The representative row comes from the strongest kind of match
            # present: an id or an exact name before a name inside a longer
            # title, and that before a nearby start.
            tier = min(METHOD_RANK[m] for _, m in matched)
            rated = sorted((r for r, m in matched if METHOD_RANK[m] == tier),
                           key=score_key, reverse=True)
            b = rated[0]
            res["best"] = {"id": b["id"], "name": b["name"], "cc": b["cc"],
                           "tier": b["tier"], "score": b["score"], "band": b["band"],
                           "km": b["km"], "parts": b.get("parts")}
            res["in_top"] = b["band"] in TOP_BANDS
            res["rows"] = [{"id": r["id"], "name": r["name"], "band": r["band"],
                            "score": r["score"], "method": m}
                           for r, m in sorted(matched, key=lambda x: -score_key(x[0]))[:5]]
        res["weight"] = fame_weight(ref, hit)
        code, text = auto_cause(ref, res)
        res["cause_code"], res["cause"] = code, text
        out.append(res)
    return out


def gap_size(res):
    """Missing trails count in full; a low-rated one by how far below the
    top band its best row sits, at most 0.9 of a miss."""
    if res["status"] == "missing":
        return res["weight"]
    if res["in_top"]:
        return 0.0
    s = (res["best"] or {}).get("score")
    if s is None:
        return round(res["weight"] * 0.6, 3)
    return round(res["weight"] * min(0.9, max(0.0, (TOP_CUT - s) / 3.0 + 0.1)), 3)


def summarise(results):
    n = len(results)
    matched = sum(r["status"] == "matched" for r in results)
    in_top = sum(r["in_top"] for r in results)
    by_label, by_kind, by_cc = {}, {}, {}

    def add(d, k, r):
        e = d.setdefault(k, {"n": 0, "matched": 0, "in_top": 0})
        e["n"] += 1
        e["matched"] += r["status"] == "matched"
        e["in_top"] += r["in_top"]

    bands = Counter()
    for r in results:
        for lb in r["labels"]:
            add(by_label, lb, r)
        add(by_kind, r["kind"] or "unknown", r)
        for cc in r["countries"]:
            add(by_cc, cc, r)
        bands[(r["best"] or {}).get("band") or ("unrated" if r["best"] else "missing")] += 1
    causes = Counter(r["cause_code"] for r in results if r["cause_code"])
    return {
        "n": n, "matched": matched, "in_top": in_top,
        "coverage": round(matched / n, 4) if n else None,
        "top_share": round(in_top / n, 4) if n else None,
        "top_share_of_matched": round(in_top / matched, 4) if matched else None,
        "bands": dict(bands), "causes": dict(causes.most_common()),
        "by_label": by_label, "by_kind": by_kind,
        "by_country": dict(sorted(by_cc.items())),
    }


def ref_sha(blob):
    raw = json.dumps(blob.get("trails") or [], sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


def gate(summary, baseline):
    """[] when coverage and the top-band share hold at the baseline."""
    fails = []
    if not baseline:
        return ["no baseline: run with --write-baseline once"]
    for key in ("coverage", "top_share"):
        was, now = baseline.get(key), summary.get(key)
        if was is None:
            continue
        if now is None or now + 1e-9 < was:
            fails.append(f"{key} fell from {was} to {now}")
    return fails


def run(reference=REFERENCE, wire_dir=WIRE_DIR, registry=REGISTRY,
        coverage=COVERAGE, baseline_path=BASELINE):
    blob = load_json(reference, {}) or {}
    refs = blob.get("trails") or []
    rows, wire_at = load_carta(wire_dir)
    reg = load_registry(registry, coverage)
    results = evaluate(refs, rows, reg)
    summary = summarise(results)
    baseline = load_json(baseline_path)
    fails = gate(summary, baseline) if rows else ["no wire rows read"]
    # The review list: the largest coverage gaps and the largest ranking gaps,
    # GAPS_MISSING and GAPS_LOW of each, so a long tail of misses never hides
    # the famous walks Carta has but rates low.
    ranked = sorted((r for r in results if gap_size(r) > 0),
                    key=lambda r: (-gap_size(r), r["id"]))
    gaps = ([r for r in ranked if r["status"] == "missing"][:GAPS_MISSING]
            + [r for r in ranked if r["status"] == "matched"][:GAPS_LOW])
    gaps.sort(key=lambda r: (-gap_size(r), r["id"]))
    payload = {
        "schema": "carta-validation/1", "layer": "trails",
        "reference": {"path": str(Path(reference).relative_to(ROOT))
                      if str(reference).startswith(str(ROOT)) else str(reference),
                      "sha": ref_sha(blob), "n": len(refs),
                      "sources": len(blob.get("sources") or [])},
        "wire_generated_at": wire_at, "wire_rows": len(rows),
        "summary": summary,
        "gate": {"ok": not fails, "failures": fails,
                 "baseline": baseline, "rule": "coverage and top_share at or above the baseline"},
        "gaps": [{**r, "gap": gap_size(r)} for r in gaps],
        "results": results,
    }
    return payload


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def pct(x):
    return "n/a" if x is None else f"{x * 100:.1f}%"


def render_md(p, reviews=None):
    s = p["summary"]
    reviews = reviews or {}
    lines = [
        "# Trails external check",
        "",
        "Generated by `python -I scripts/validation/trails_external.py --write` (T1181, ROADMAP D23 and D24). Do not edit by hand.",
        "",
        (f"Reference list: {p['reference']['n']} trails from {p['reference']['sources']} sources "
         f"(`{p['reference']['path']}`, sha `{p['reference']['sha']}`). Wire of {p['wire_generated_at']}, {p['wire_rows']} walks."),
        "",
        (f"Gate: {'pass' if p['gate']['ok'] else 'FAIL'}. "
         f"Coverage {s['matched']} of {s['n']} ({pct(s['coverage'])}); in the top band {s['in_top']} of {s['n']} "
         f"({pct(s['top_share'])}, {pct(s['top_share_of_matched'])} of the matched)."),
    ]
    for f in p["gate"]["failures"]:
        lines.append(f"- {f}")
    lines += ["", "## By label", "", "| Label | Trails | Matched | In top band |", "|---|---|---|---|"]
    for k, e in sorted(s["by_label"].items()):
        lines.append(f"| {k} | {e['n']} | {e['matched']} ({pct(e['matched'] / e['n'])}) | {e['in_top']} ({pct(e['in_top'] / e['n'])}) |")
    lines += ["", "## By kind", "", "| Kind | Trails | Matched | In top band |", "|---|---|---|---|"]
    for k, e in sorted(s["by_kind"].items()):
        lines.append(f"| {k} | {e['n']} | {e['matched']} | {e['in_top']} |")
    lines += ["", "## Band of the best matched row", "", "| Band | Trails |", "|---|---|"]
    for b in BAND_ORDER + ["unrated", "missing"]:
        if s["bands"].get(b):
            lines.append(f"| {b} | {s['bands'][b]} |")
    lines += ["", "## Causes (automatic)", "", "| Cause | Trails |", "|---|---|"]
    for k, v in s["causes"].items():
        lines.append(f"| {k} | {v} |")
    lines += ["", f"## The {GAPS_N} largest gaps ({GAPS_MISSING} coverage, {GAPS_LOW} ranking)", "",
              "Causes from the hand review in `trails_gap_reviews.json` where one exists, else the automatic cause.", "",
              "| # | Trail | Countries | Labels | Status | Best row | Gap | Cause |",
              "|---|---|---|---|---|---|---|---|"]
    for i, g in enumerate(p["gaps"], 1):
        b = g["best"]
        best = f"{b['id']} {b['band'] or 'unrated'} {b['score'] if b['score'] is not None else ''}".strip() if b else "none"
        cause = reviews.get(g["id"]) or g["cause"] or ""
        lines.append(f"| {i} | {g['name']} | {', '.join(g['countries'])} | {', '.join(g['labels'])} | "
                     f"{g['status']} | {best} | {g['gap']} | {cause.replace('|', '/')} |")
    lines += ["", "## Missing reference trails", "", "| Trail | Countries | Kind | Cause |", "|---|---|---|---|"]
    for r in sorted(p["results"], key=lambda r: (-r["weight"], r["id"])):
        if r["status"] == "missing":
            lines.append(f"| {r['name']} | {', '.join(r['countries'])} | {r['kind']} | {r['cause_code']} |")
    lines += ["", "## Matched but below the top band", "", "| Trail | Best row | Band | Score |", "|---|---|---|---|"]
    for r in sorted(p["results"], key=lambda r: (-r["weight"], r["id"])):
        if r["status"] == "matched" and not r["in_top"]:
            b = r["best"]
            lines.append(f"| {r['name']} | {b['id']} {b['name']} | {b['band'] or 'unrated'} | {b['score'] if b['score'] is not None else ''} |")
    return "\n".join(lines) + "\n"


def compact(p):
    """The JSON written to disk: results without rating parts per row."""
    q = json.loads(json.dumps(p))
    for r in q["results"] + q["gaps"]:
        if r.get("best"):
            r["best"].pop("parts", None)
    return q


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--reference", default=str(REFERENCE))
    ap.add_argument("--wire", default=str(WIRE_DIR))
    ap.add_argument("--baseline", default=str(BASELINE))
    ap.add_argument("--write", action="store_true", help="write the json and md report")
    ap.add_argument("--write-baseline", action="store_true",
                    help="set the gate baseline to this run (deliberate, with a report)")
    ap.add_argument("--check", action="store_true", help="exit 1 when the gate fails")
    ap.add_argument("--json", action="store_true", help="print the summary and gate as JSON")
    a = ap.parse_args(argv)
    p = run(a.reference, a.wire, baseline_path=a.baseline)
    s = p["summary"]
    if a.write_baseline:
        base = {"at": p["wire_generated_at"], "reference_sha": p["reference"]["sha"],
                "n": s["n"], "matched": s["matched"], "in_top": s["in_top"],
                "coverage": s["coverage"], "top_share": s["top_share"]}
        Path(a.baseline).write_text(json.dumps(base, indent=1) + "\n", encoding="utf-8")
        p["gate"] = {**p["gate"], "ok": True, "failures": [], "baseline": base}
    if a.write:
        reviews = (load_json(VALID_DIR / "trails_gap_reviews.json", {}) or {}).get("reviews") or {}
        OUT_JSON.write_text(json.dumps(compact(p), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        OUT_MD.write_text(render_md(p, {k: f"{v.get('cause')} Next: {v.get('next')}."
                                        for k, v in reviews.items()}), encoding="utf-8")
    if a.json:
        print(json.dumps({"summary": s, "gate": p["gate"], "reference": p["reference"],
                          "wire_generated_at": p["wire_generated_at"], "wire_rows": p["wire_rows"]}))
    else:
        print(f"reference {s['n']} trails; matched {s['matched']} ({pct(s['coverage'])}); "
              f"top band {s['in_top']} ({pct(s['top_share'])})")
        print(f"gate: {'pass' if p['gate']['ok'] else 'FAIL'}")
        for f in p["gate"]["failures"]:
            print(f"  {f}")
    if a.check and not p["gate"]["ok"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
