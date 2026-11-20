"""Derived routes: the publish gate trails_curate applies before its quotas.

Tier: Library (called by pipeline/trails/curate.py)

derive_routes.py builds a route out of named or graded OSM ways that no route
relation covers. It casts a wide net on purpose: it is what rescued the
countries with no relation culture (MD, XK, MK, MT, AL) and the famous lone
ways (T1094). But the net also catches every named farm lane in Europe. The
first sweep over all 44 countries (2026-11, D24) staged 116,756 of them, and a
hand check of Germany's 16,462 found 81% unmarked tracks, 18% asphalt or
concrete, 1,588 with no name at all, 70 called "Grenzweg" and a 20.7 km piece
of the Rennsteig sitting beside the 169 km relation. Curation approved 434 of
those in Germany alone: "Isweg", "Grauer Wall", "Stiergraben".

So a derived row now needs EVIDENCE that it is a walk before curate may pick
it: a waymark, a mountain grade, a rail-trail or greenway, a famous way of
real length, a trail word in a name that is not a lane type, or a real path
of real length. Rows without it stay needs_review: nothing is deleted, the
next curate run decides again, and adding a word here is the whole fix when a
language turns out to be missing. Relation rows never pass through this file.

`verdict()` is pure, so every rule has a unit test on the real samples
(tests/test_trail_derived_gate.py). `piece_of()` is the one spatial rule and
the one database call.
"""

import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

# The outside reference of famous European trails (T1181): 282 names with
# their countries, from certification bodies, national trail lists and
# Wikipedia's lists. Owner goal 2026-11-20: every one of them that OSM can
# draw as one continuous line is on the list.
REFERENCE_FILE = (Path(__file__).resolve().parents[2] / "data" / "reports"
                  / "validation" / "trails_reference.json")
# A reference name shorter than this matches only a title that equals it
# ("Rysy"); a longer one also matches inside a longer title ("Lechweg Etappe").
REFERENCE_CONTAINS_MIN = 6

# The countries derive_routes exists to rescue (derive_routes.THIN_COUNTRIES,
# kept in step by a test; importing derive_routes would pull in osmium). Their
# derived rows ARE their trail list, so only the title and bridge rules apply.
CONTROL = frozenset({"MD", "XK", "MK", "MT", "AL"})

# A waymark share this high means the ways are signed on the ground. Lower
# than derive's 0.60 "signed" claim on the wire, because here it only has to
# show somebody marked a walk, not that every metre carries the sign.
WAYMARK_MIN = 0.5

# Seed-way surfaces that make a lane a road. Asphalt is not bad in itself:
# greenways, voies vertes and rail trails are paved and are exactly what a
# traveller wants, so a rail or greenway word, or a waymark, lifts this.
HARD_SURFACES = frozenset({
    "asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes",
    "paving_stones", "sett", "cobblestone", "unhewn_cobblestone", "metal",
})
HARD_TRACKTYPE = "grade1"

# sac_scale above T1. "hiking" (T1) on a farm track is how mappers tag any
# walkable lane, so on a track it is not a grade; on a path it is.
MOUNTAIN_GRADES = frozenset({
    "mountain_hiking", "demanding_mountain_hiking", "alpine_hiking",
    "demanding_alpine_hiking", "difficult_alpine_hiking",
})
PATH_HIGHWAYS = frozenset({"path", "footway", "bridleway"})

# How long a named line must be before its name alone carries it. any-named
# stitches ways of different names under one seed name, so the name covers
# less of the line and asks for more length. A track is a farm road until it
# is long enough to be a day out.
NAME_MIN_M = {"base-name": 2_000, "same-name": 3_000, "any-named": 5_000}
TRACK_NAME_MIN_M = 5_000
PLAIN_PATH_MIN_M = 3_000
PLAIN_PATH_ANY_NAMED_MIN_M = 5_000
# A fame join on a short line is usually the street's own Wikidata item
# ("Schleissheimer Strasse", "Beilerstraat").
FAME_WALK_MIN_M = 3_000

# A folded name carried by this many derived candidates in one country is a
# kind of lane (Grenzweg 70, Mittelweg 48 in Germany), in any language.
REPEAT_MIN = 8

# A passing row that lies this much inside a relation at least PIECE_LONGER
# times its length is a piece of that walk, not a new one: the duplicate rule
# in derive_routes is mutual on purpose and keeps such pieces. Same buffer as
# derive_routes.DUPLICATE_BUFFER_M.
PIECE_SHARE = 0.80
PIECE_LONGER = 2.0
PIECE_BUFFER_M = 40.0
# Evidence strong enough that the row is its own walk even inside a longer
# route: the Fuerstensteig is a demanding mountain way inside the Via Alpina
# stage and is the walk people come for. A T1 grade is not enough: the first
# box dry run let two short stretches of the Kerry Way through on it.
OWN_EVIDENCE = frozenset({"waymark", "mountain-graded", "rail-trail", "fame-walk"})

# Words, matched on folded tokens (lowercase, accents and the sharp s folded).
# A token ending is used where the language compounds (German, Dutch, Nordic).
TRAIL_TOKENS = frozenset({
    # en
    "trail", "path", "footpath", "way", "loop", "walk", "ridgeway", "greenway",
    # de
    "wanderweg", "rundweg", "hohenweg", "panoramaweg", "kammweg", "steig",
    "pfad", "leinpfad", "hohenpfad", "wanderpfad", "saumpfad", "erlebnispfad",
    # fr
    "sentier", "boucle", "balcon", "corniche",
    # es, ca, pt
    "sendero", "senda", "trilho", "percurso", "ecopista", "ecovia",
    # it
    "sentiero", "percorso", "anello", "mulattiera",
    # nl
    "wandelpad", "wandelroute", "jaagpad", "kerkpad",
    # pl, cs, sk, hu, ro, sl, hr, bs, sr, el (latin)
    "szlak", "sciezka", "stezka", "chodnik", "turistaut", "osveny",
    "tanosveny", "traseu", "poteca", "pot", "staza", "planinarska",
    "monopati",
    # nordic, fi, baltic
    "leden", "stig", "sti", "stien", "natursti", "polku", "reitti", "rada",
    "matkarada", "takas",
})
TRAIL_ENDINGS = ("wanderweg", "rundweg", "hohenweg", "hohenpfad", "steig",
                 "pfad", "panoramaweg", "kammweg", "wandelpad", "leden",
                 "stigen", "stien", "polku", "reitti")
TRAIL_PHRASES = ("alta via", "chemin de randonnee", "grande randonnee",
                 "via ferrata", "camino de santiago", "rail trail")

GREENWAY_PHRASES = ("greenway", "voie verte", "coulee verte", "via verde",
                    "via verda", "ciclovia verde", "ecopista", "ecovia",
                    "groene wissel")

# Rail trails: the old line is the walk, asphalt and all. "-bahn" alone is
# not enough: Autobahn, Rennbahn and Rodelbahn are not railways a traveller
# walks, and a working Bergbahn or Seilbahn is not a trail.
RAIL_TOKENS = frozenset({
    "bahntrasse", "bahnstrecke", "bahnlinie", "bahndamm", "kleinbahn",
    "kreisbahn", "eisenbahn", "schmalspurbahn", "inselbahn", "talbahn",
    "railway", "spoorlijn", "spoorbaan", "ferrocarril", "ferrovia",
    "jernbane", "banvall", "ratapohja", "kolej", "zeleznice", "vasut",
})
NOT_RAIL_BAHN = frozenset({
    "autobahn", "rennbahn", "rodelbahn", "sommerrodelbahn", "bobbahn",
    "seilbahn", "bergbahn", "standseilbahn", "zahnradbahn", "sesselbahn",
    "kabinenbahn", "schwebebahn", "strassenbahn", "ubahn", "sbahn",
    "kegelbahn", "eisbahn", "radrennbahn", "reitbahn", "laufbahn", "rollbahn",
    "landebahn", "startbahn", "fahrbahn", "achterbahn", "kugelbahn",
})
# German compounds that start with the old line: Bahntrassenradweg.
RAIL_PREFIXES = ("bahntrasse", "bahnstrecke", "bahnlinie", "bahndamm")
RAIL_PHRASES = ("chemin de fer", "voie ferree", "ancienne voie", "rail trail",
                "old railway", "former railway", "vecchia ferrovia",
                "antiguo ferrocarril", "via del ferrocarril", "linha do")

# Streets and lanes: a name that says road. The trail, rail and greenway
# lists win over it ("Panoramaweg" passes, "Panoramastrasse" does not).
STREET_TOKENS = frozenset({
    "strasse", "str", "gasse", "allee", "damm", "platz", "schneise",
    "straat", "laan", "steeg", "dreef",
    "rue", "avenue", "boulevard", "impasse", "allee",
    "calle", "carrer", "avenida", "rua", "travessa", "pista",
    "strada", "vicolo", "viale",
    "ulica", "ul", "ulice", "utca", "ut", "gatan", "gata", "gade", "vej",
    "vei", "veien", "katu", "tie", "iela", "gatve", "g", "tanav", "ulitsa",
    "odos", "road", "street", "lane", "drive", "close", "rd",
    "triq", "signalka",
})
STREET_ENDINGS = ("strasse", "gasse", "allee", "schneise", "straat", "laan",
                  "gatan", "vagen", "veien", "katu", "tie")
# A leading "Via" in Italian is a street unless a trail word follows it.
STREET_LEADING = ("via ",)

BRIDGE_TOKENS = frozenset({
    "bridge", "brucke", "pont", "ponte", "puente", "pont", "most", "bro",
    "silta", "hid", "brug", "viaduct", "viadukt", "viaduc", "viadotto",
    "viaducto", "tunnel", "tunel", "galleria", "tunnelen",
})
BRIDGE_ENDINGS = ("brucke", "brug", "bron", "brua", "silta", "viadukt",
                  "tunnel")

# Lane types in any country: the name says what the lane is for, not where it
# goes. Kolonnenweg is the GDR border patrol road (concrete lanes).
GENERIC_NAMES = frozenset({
    "grenzweg", "mittelweg", "feldweg", "waldweg", "holzweg",
    "wirtschaftsweg", "hauptweg", "querweg", "kirchweg", "muhlweg",
    "sandweg", "heuweg", "wiesenweg", "triftweg", "viehweg", "hohlweg",
    "alter weg", "chemin rural", "chemin forestier", "chemin vicinal",
    "pista forestal", "camino forestal", "strada forestale",
    "strada vicinale", "droga lesna", "bosweg", "zandweg", "veldweg",
    "metsatie", "skogsvag", "skogsbilvag", "forest road", "forest track",
})
BORDER_ROAD = frozenset({"kolonnenweg"})
# Names that say the line is for something other than walking, or that a
# mapper wrote as a placeholder ("Approximative location of the hiking path").
NOT_A_WALK_TOKENS = frozenset({
    "mtb", "dh", "bike", "bikepark", "downhill", "enduro", "freeride", "singletrail",
    "loipe", "langlauf", "skipiste", "skiroute", "skiweg", "pumptrack",
    "approximative", "approximate", "fixme", "unknown",
})
RIGHT_OF_WAY_RE = re.compile(
    r"\b(foot|bridle)\s?path(\s+and\s+\w+)?\s+no\.?\s*\d+", re.IGNORECASE)


def fold(text):
    """Lowercase, accents off, sharp s to ss, punctuation to spaces."""
    if not text:
        return ""
    text = text.replace("ß", "ss").replace("ẞ", "ss")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^0-9a-z]+", " ", text.lower())
    return " ".join(text.split())


def _tokens(folded):
    return folded.split()


def _has(folded, tokens, endings=(), phrases=()):
    toks = _tokens(folded)
    if any(t in tokens for t in toks):
        return True
    if endings and any(t.endswith(e) for t in toks for e in endings):
        return True
    padded = f" {folded} "
    return any(f" {p} " in padded for p in phrases)


def is_rail(folded):
    toks = _tokens(folded)
    if any(t in RAIL_TOKENS or t.startswith(RAIL_PREFIXES) for t in toks):
        return True
    if any(t.endswith("bahn") and t not in NOT_RAIL_BAHN
           and not any(t.endswith(x) for x in NOT_RAIL_BAHN) for t in toks):
        return True
    padded = f" {folded} "
    return any(f" {p} " in padded for p in RAIL_PHRASES)


def is_greenway(folded):
    padded = f" {folded} "
    return any(f" {p} " in padded for p in GREENWAY_PHRASES)


def is_trail(folded):
    return _has(folded, TRAIL_TOKENS, TRAIL_ENDINGS, TRAIL_PHRASES)


def is_street(folded):
    if any(folded.startswith(p) for p in STREET_LEADING):
        return True
    return _has(folded, STREET_TOKENS, STREET_ENDINGS)


def is_bridge(folded):
    return _has(folded, BRIDGE_TOKENS, BRIDGE_ENDINGS)


def is_generic(folded):
    if folded in GENERIC_NAMES or RIGHT_OF_WAY_RE.search(folded):
        return True
    # "Alter Grenzweg", "Oberer Mittelweg": a qualifier on a lane type.
    toks = _tokens(folded)
    return bool(toks) and toks[-1] in GENERIC_NAMES and len(toks) <= 2


def squash(text):
    return re.sub(r"[^0-9a-z]+", "", fold(text))


_REFERENCE = None


def reference_keys():
    """{country: [(reference id, exact keys, contains keys)]}, squashed."""
    global _REFERENCE
    if _REFERENCE is None:
        _REFERENCE = defaultdict(list)
        try:
            data = json.loads(REFERENCE_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        for t in data.get("trails") or []:
            names = [t.get("name") or ""] + list(t.get("aliases") or [])
            exact = {squash(n) for n in names if squash(n)}
            contains = {k for k in exact if len(k) >= REFERENCE_CONTAINS_MIN}
            for cc in t.get("countries") or []:
                if exact:
                    _REFERENCE[cc.upper()].append((t.get("id"), exact, contains))
    return _REFERENCE


def reference_of(title, cc):
    """(reference id, exact) for the first reference trail this title names
    in country cc, or (None, False)."""
    key = squash(title)
    if not key:
        return None, False
    for ref_id, exact, contains in reference_keys().get((cc or "").upper(), []):
        if key in exact:
            return ref_id, True
        if any(k in key for k in contains):
            return ref_id, False
    return None, False


def _significant(folded):
    return {t for t in _tokens(folded) if len(t) >= 4
            and t not in GENERIC_NAMES and t not in STREET_TOKENS}


def names_overlap(a, b):
    """True when two names share a real word: "Kungsleden (summer)" inside
    the Kungsleden relation, "Adlerweg - Wanderweg 2" inside an Adlerweg
    stage. "Fuerstensteig" and "Via Alpina" share none."""
    return bool(_significant(fold(a)) & _significant(fold(b)))


def fame_title(row):
    """The Wikipedia title a fame join carries, or None. A bare Wikidata id
    names nothing a traveller can read, so it gives no title."""
    fame_key = row.get("derived_from") or ""
    # Only a fame join's key names an article; "base-name" is a join label.
    fame_key = fame_key[5:] if fame_key.startswith("fame:") else ""
    for raw in (row.get("wikipedia"), fame_key):
        raw = (raw or "").strip()
        if not raw or re.fullmatch(r"Q\d+", raw):
            continue
        raw = re.sub(r"^[a-z]{2,3}(-[a-z]+)?:", "", raw)
        raw = re.sub(r"\s*\([^)]*\)\s*$", "", raw).strip()
        if raw:
            return raw
    return None


def name_of(row):
    """(title to show, borrowed). A borrowed title came from the seed way's
    name tag or the fame key, and is written to the row's empty title only
    when curate picks it, so the wire never shows a nameless walk."""
    title = (row.get("title") or "").strip()
    if title:
        return title, False
    borrowed = (row.get("raw_name") or "").strip() or fame_title(row)
    return (borrowed, True) if borrowed else ("", False)


def _float(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def verdict(row, repeats=None):
    """(ok, rule, title) for one derived candidate row.

    `rule` names the evidence that passed it, or the reason it is held.
    `title` is the name to publish under (possibly borrowed from the fame
    key), or None when the stored title stands. `repeats` is a Counter of
    folded names over the country's derived candidates."""
    title, borrowed = name_of(row)
    new_title = title if borrowed else None
    if not title:
        return False, "untitled", None
    f = fold(title)
    cc = (row.get("country") or "").upper()
    # A trail on the famous reference list is published whatever its tags
    # say; the piece rule below still stops a stretch of it standing in for
    # the whole when the whole is there.
    if reference_of(title, cc)[0]:
        return True, "reference", new_title
    if any(t in NOT_A_WALK_TOKENS for t in _tokens(f)):
        return False, "not-a-walk", new_title
    waymarked = _float(row.get("waymark_share")) >= WAYMARK_MIN
    rail = is_rail(f)
    green = is_greenway(f)
    trail = is_trail(f)
    # A walk word beats a bridge word: "Pont-l'Abbé" is a town at the end of
    # a rail trail, "Ponte sobre o Tua" is the bridge itself.
    if is_bridge(f) and not (waymarked or rail or green or trail):
        return False, "bridge", new_title
    if cc in CONTROL:
        return True, "control", new_title

    highway = (row.get("highway") or "").lower()
    sac = (row.get("sac_scale") or row.get("raw_sac") or "").lower()
    graded = sac in MOUNTAIN_GRADES or (sac == "hiking" and highway in PATH_HIGHWAYS)
    km = _float(row.get("distance_m"))
    join = row.get("derived_join") or row.get("derived_from") or ""
    fame = (row.get("derived_from") or "").startswith("fame:")
    surface = (row.get("surface") or "").lower()
    hard = surface in HARD_SURFACES or (row.get("tracktype") or "") == HARD_TRACKTYPE
    generic = is_generic(f) or bool(repeats and repeats.get(f, 0) >= REPEAT_MIN)

    if any(t in BORDER_ROAD for t in _tokens(f)):
        return False, "border-road", new_title
    if is_street(f) and not (trail or rail or green or waymarked or graded):
        return False, "street", new_title
    if hard and not (rail or green or waymarked):
        return False, "hard-surface", new_title

    if waymarked:
        return True, "waymark", new_title
    if sac in MOUNTAIN_GRADES:
        return True, "mountain-graded", new_title
    if graded:
        return True, "graded", new_title
    if rail:
        return True, "rail-trail", new_title
    if green:
        return True, "greenway", new_title
    if fame and km >= FAME_WALK_MIN_M and (highway in PATH_HIGHWAYS or highway == "track"):
        return True, "fame-walk", new_title
    if generic:
        return False, "generic-name", new_title
    if trail:
        floor = NAME_MIN_M.get(join, NAME_MIN_M["any-named"])
        if highway == "track":
            floor = max(floor, TRACK_NAME_MIN_M)
        if km >= floor:
            return True, "trail-name", new_title
    if highway in PATH_HIGHWAYS:
        floor = PLAIN_PATH_ANY_NAMED_MIN_M if join == "any-named" else PLAIN_PATH_MIN_M
        if km >= floor:
            return True, "plain-path", new_title
    return False, "no-evidence", new_title


def repeat_counts(rows):
    """Folded-name counts over a country's derived candidates."""
    return Counter(fold(name_of(r)[0]) for r in rows
                   if r.get("derived_route") and name_of(r)[0])


PIECE_SQL = [
    "DROP TABLE IF EXISTS gate_d",
    "DROP TABLE IF EXISTS gate_r",
    """CREATE TEMP TABLE gate_d AS
       SELECT id, geom, ST_Transform(geom, 3035) AS g,
              ST_Length(ST_Transform(geom, 3035)) AS len
       FROM trips WHERE id = ANY(%(ids)s)""",
    "CREATE INDEX ON gate_d USING gist (geom)",
    # Only the relations that touch a passing row are projected and buffered:
    # buffering a country's every relation is what made derive's duplicate
    # check run 42 hours on Italy.
    """CREATE TEMP TABLE gate_r AS
       SELECT r.id, r.title,
              ST_Buffer(ST_Transform(r.geom, 3035), %(buf)s) AS gb,
              ST_Length(ST_Transform(r.geom, 3035)) AS len
       FROM trips r
       WHERE r.country = %(cc)s AND r.category = 'hike'
         AND NOT coalesce(r.derived_route, false) AND r.status <> 'rejected'
         AND EXISTS (SELECT 1 FROM gate_d d WHERE r.geom && d.geom)""",
    "CREATE INDEX ON gate_r USING gist (gb)",
]
PIECE_SELECT = """
    SELECT d.id, array_agg(coalesce(r.title, '') ORDER BY r.len DESC)
    FROM gate_d d JOIN gate_r r ON r.gb && d.g AND r.len >= %(longer)s * d.len
    WHERE ST_Length(ST_Intersection(d.g, r.gb)) >= %(share)s * d.len
    GROUP BY d.id
"""


def piece_of(conn, cc, ids):
    """{id: [relation titles, longest first]} for the rows lying inside a
    longer relation."""
    if not ids:
        return {}
    params = {"ids": list(ids), "cc": cc, "buf": PIECE_BUFFER_M,
              "longer": PIECE_LONGER, "share": PIECE_SHARE}
    with conn.cursor() as cur:
        for sql in PIECE_SQL:
            cur.execute(sql, params)
        cur.execute(PIECE_SELECT, params)
        found = {i: list(t or []) for i, t in cur.fetchall()}
        cur.execute("DROP TABLE IF EXISTS gate_d")
        cur.execute("DROP TABLE IF EXISTS gate_r")
    return found


def split(conn, cc, rows):
    """(kept rows, held {id: rule}, borrowed {id: title}, counts). Relation
    rows pass untouched. A kept derived row with a borrowed title carries it
    in row['title'] for the selection, and `borrowed` keeps it by id, because
    curate's family pass builds new row dicts. conn=None skips the spatial
    piece rule."""
    repeats = repeat_counts(rows)
    kept, held, counts, borrowed = [], {}, Counter(), {}
    passing = []
    for r in rows:
        if not r.get("derived_route"):
            kept.append(r)
            continue
        counts["derived"] += 1
        ok, rule, title = verdict(r, repeats)
        if not ok:
            held[r["id"]] = rule
            counts[f"held:{rule}"] += 1
            continue
        if title:
            r["title"] = title
            borrowed[r["id"]] = title
        r["derived_rule"] = rule
        passing.append(r)
    check = [r["id"] for r in passing
             if (r.get("country") or "").upper() not in CONTROL]
    pieces = piece_of(conn, cc, check) if conn is not None else {}
    for r in passing:
        rels = pieces.get(r["id"])
        # Inside a longer relation: a piece, unless the row has evidence of
        # its own AND a name of its own (the Fuerstensteig in the Via Alpina).
        # A shared name means a stretch of that walk ("Kungsleden (summer)").
        title = r.get("title") or ""
        if rels and (r["derived_rule"] not in OWN_EVIDENCE
                     or any(names_overlap(title, t) for t in rels)):
            named = next((t for t in rels if names_overlap(title, t)), rels[0])
            held[r["id"]] = f"piece-of {named or 'a longer route'}"
            counts["held:piece-of"] += 1
            continue
        counts[f"pass:{r['derived_rule']}"] += 1
        kept.append(r)
    for rid in held:
        borrowed.pop(rid, None)
    return kept, held, borrowed, counts


def count_line(cc, counts):
    held = sum(v for k, v in counts.items() if k.startswith("held:"))
    passed = sum(v for k, v in counts.items() if k.startswith("pass:"))

    def part(prefix):
        items = sorted(((k[len(prefix):], v) for k, v in counts.items()
                        if k.startswith(prefix)), key=lambda kv: -kv[1])
        return ", ".join(f"{k} {v:,}" for k, v in items) or "none"
    return (f"{cc} derived: {counts['derived']:,} candidates -> {passed:,} may "
            f"be picked ({part('pass:')}); {held:,} held ({part('held:')})")
