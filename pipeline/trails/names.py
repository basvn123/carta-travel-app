"""One definition of what two trail names being "the same name" means.

Tier: Library

Four modules need this and three of them had grown their own copy:
famous_registry.py folds "Sentier des Roches [secteur 4]" onto "Sentier des
Roches" so 18 tagged ways register as one candidate; coverage_report.py folds
the same way to match a registry row against a published title; and
derive_routes.py had fold_name(), which was squash() minus the o-slash table
and with no section stripping at all. Three foldings of one idea is three
chances for "Malzalaka" and "Ma<l-stroke>zalaka" to be two different trails in
one pass and one trail in the next.

So the folding lives here, and the modules import it. famous_registry keeps
re-exporting squash/base_name because coverage_report already imports them
from there, and a module that has been imported from for a whole phase should
not change its surface just to move a function.

Phase 2 of CARTA_TRAILS_BUILD_BRIEF.md needs the section markers in the
chainer, which is what forced the extraction: the brief's rule 2 is "normalised
name, section markers stripped", and that list of markers must be the same list
the registry counted ways with, or the chainer and the report disagree about
what they are looking at.

ASCII clean, no em dashes, per project convention.
"""

import re
import unicodedata

# Section markers stripped before a name is compared, in the languages the
# catalogue covers. The brief's rule 2 list, plus the trailing (3/8) counter.
# A trail split into stages is one trail: "Sentier des Roches [secteur 4]" and
# "Sentier des Roches [secteur 5]" are the same walk, and the 43-country
# catalogue spells that eight different ways.
SECTION_RE = re.compile(
    r"\s*(?:\[|\(|-|,)?\s*"
    r"(?:secteur|section|etappe|etape|étape|abschnitt|tappa|deel|teil|"
    r"odcinek|szakasz|stage|leg|dio|etapa|etapp|osa|dalis|posms)"
    r"\s*\.?\s*\d+[a-z]?\s*(?:\]|\))?\s*$",
    re.IGNORECASE)
COUNTER_RE = re.compile(r"\s*\(\s*\d+\s*/\s*\d+\s*\)\s*$")


def squash(text):
    """Accent-folded, punctuation-free lowercase, for name equality.

    NFKD does not decompose o-slash, l-stroke or ae, so those are folded by
    hand; this repo has been bitten by that before (see the l-stroke note in
    the POI dedupe work). Without the table, 'Malzalaka' and 'Malzalaka' with
    a stroked l are two different trails."""
    s = unicodedata.normalize("NFKD", str(text or "").casefold())
    s = "".join(c for c in s if not unicodedata.combining(c))
    for a, b in (("ø", "o"), ("ł", "l"), ("æ", "ae"),
                 ("ß", "ss"), ("đ", "d"), ("þ", "th"),
                 ("ð", "d")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def base_name(text):
    """The trail's name with a stage marker stripped, once.

    'Sentier des Roches [secteur 4]' -> 'Sentier des Roches'. Applied before
    the named-way count, so the 15 tagged secteur ways register as one
    candidate carrying 15 ways, not as 8 candidates nobody can match."""
    s = COUNTER_RE.sub("", str(text or "").strip())
    prev = None
    while prev != s:
        prev = s
        s = SECTION_RE.sub("", s).strip(" -,[](){}")
    return s or str(text or "").strip()


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", squash(text)).strip("-") or "unnamed"


# ---------------------------------------------------------------------------
# The title ladder (carta-destinations-enhancement-spec 6.6)
# ---------------------------------------------------------------------------
#
# A title is what a card prints in 42 characters, and the catalogue's titles
# came straight from the relation's `name` tag, which on 1,295 European rows
# is a code ("GR 564", "33-36", "PWHa2"), on 443 starts with a digit and on
# 631 runs past 55 characters. Nothing new is harvested to fix that: every
# rung below reads something the row already carries, in a fixed order, and
# the first rung that yields a real name wins.
#
#   1  a Wikidata label, when one has been stored on the row
#   2  a real source name: name:en, then a Latin-script name, then any name
#   3  the from and to tags, "Radomire to Korab"
#   4  the landmark formula, from the best named feature the line touches
#   5  shape plus place, from the route type and the nearest anchor
#
# Whatever rung wins is capped at TITLE_MAX on a word boundary, and the string
# the title replaced (the code, the overlong name) is handed back as the ref
# chip so the walker who knows the route as "GR 564" still finds it. Region
# never enters a title: the subtitle carries it.

TITLE_MAX = 42
REF_MAX = 24          # a signpost reference, as waymark_ref always was
ORIGINAL_MAX = 64     # the string a generated title replaced, shown as a chip

# A token that is a code rather than a word: letters and digits mixed, or
# digits alone, with the separators signposts use. "GR", "E4", "SH-MR-009",
# "5/03", "33-36". Pure letters of three or more are a word.
_CODE_TOKEN_RE = re.compile(
    r"^[A-Za-z]{0,3}[\s\-/.]?\d+[A-Za-z]?(?:[\s\-/.]\d+[A-Za-z]?)*$")
# A word is a run of three or more letters standing on its own: "PWHa2" has
# four letters and is still a code, because they are glued to a digit.
_WORD_RE = re.compile(r"(?<![^\W_])[^\W\d_]{3,}(?![^\W_])", re.UNICODE)
# A parenthesised or bracketed code at either end: "(SH-MR-009)", "[E4]".
_PAREN_CODE_RE = re.compile(
    r"\s*[\(\[]\s*([A-Za-z]{0,4}(?:[\s\-/.][A-Za-z]{1,4})?[\s\-/.]?\d[\w\s\-/.]*)"
    r"\s*[\)\]]\s*")
# A whole string that is a code and then a bracketed name: "7 (The Blue Eye)".
_CODE_THEN_NAME_RE = re.compile(r"^(\S{1,12})\s*[\(\[]\s*(.+?)\s*[\)\]]\s*$")
# A leading code followed by a separator or a space: "612 Berwang", "5/03
# Sois". One or two bare digits before a word are left alone ("5 Elemente
# Weg" is a name).
_LEAD_CODE_RE = re.compile(
    r"^(?:[A-Za-z]{1,4}[\s\-]?\d+[A-Za-z]?|\d{3,}|\d+[\-/.]\d+[A-Za-z]?)"
    r"(?:\s*[:\-\u2013]\s*|\s+)(?=\S)")
_TAG_SYNTAX_RE = re.compile(
    r"[=;{}<>|]|\bosm route\b|^\s*(?:node|way|relation)/\d+", re.IGNORECASE)
_TRAIL_PUNCT = " -:,;/.\u2013\u2014([{"
_SEGMENT_SEPS = (" - ", " \u2013 ", ": ", ", ", " / ")

# Landmark kinds in the order a reader would name the walk after them.
# scenic.py's kinds, not the chip codes.
LANDMARK_ORDER = ("peak", "volcano", "waterfall", "glacier", "lake", "gorge",
                  "castle", "monastery", "ruins", "lighthouse", "cave",
                  "viewpoint", "hut", "beach", "village")

SHAPE_WORD = {"loop": "Loop", "figure8": "Loop", "out_back": "Out and back",
              "point": "Walk"}


def is_latin(text):
    """True when every letter in the string is Latin script. Digits and
    punctuation do not count either way; an empty string is not Latin."""
    letters = [c for c in str(text or "") if c.isalpha()]
    if not letters:
        return False
    return all(unicodedata.name(c, "").startswith("LATIN") for c in letters)


def is_code(text):
    """True when the string is a route code rather than a name: a signpost
    reference shape ("GR 564", "33-36") or no word of three letters."""
    s = str(text or "").strip()
    if not s:
        return True
    if _CODE_TOKEN_RE.match(s):
        return True
    return not _WORD_RE.search(s)


def is_raw_osm(text):
    """A string that is tag syntax or an ingest placeholder, never a title."""
    return bool(_TAG_SYNTAX_RE.search(str(text or "")))


def cap_title(text, limit=TITLE_MAX):
    """Shorten to `limit` on a word boundary, trailing separators dropped.

    No ellipsis: the full string is on the ref chip, and a title that ends in
    three dots reads as broken rather than as a name."""
    s = re.sub(r"\s+", " ", str(text or "")).strip(_TRAIL_PUNCT)
    if len(s) <= limit:
        return s
    cut = s[:limit + 1]
    # An "A - B - C" name cuts between its segments, not inside one, when a
    # segment boundary sits in the second half of the allowance.
    seg = max(cut.rfind(sep) for sep in _SEGMENT_SEPS)
    if seg >= limit // 2:
        at = seg
    else:
        at = max(cut.rfind(" "), cut.rfind("-"), cut.rfind("/"))
    if at < limit // 3:          # one enormous word; cut it hard
        return s[:limit].rstrip(_TRAIL_PUNCT)
    out = s[:at]
    # Never leave a bracket open: "(historic route)" cut to "(historic" reads
    # as a typo, so the whole bracket goes.
    if out.count("(") > out.count(")"):
        out = out[:out.rfind("(")]
    if out.count("[") > out.count("]"):
        out = out[:out.rfind("[")]
    return out.rstrip(_TRAIL_PUNCT)


def split_code(name):
    """(name without its code, the code) for "7 (The Blue Eye)",
    "612 Berwang - Roter Stein" and "Katund i Vjeter (SH-MR-002)".
    The code is None when nothing was split off."""
    s = re.sub(r"\s+", " ", str(name or "")).strip()
    code = None
    m = _CODE_THEN_NAME_RE.match(s)
    if m and is_code(m.group(1)) and not is_code(m.group(2)):
        return m.group(2).strip(_TRAIL_PUNCT), m.group(1)
    m = _PAREN_CODE_RE.search(s)
    if m and is_code(m.group(1)):
        code = m.group(1).strip()
        s = (s[:m.start()] + " " + s[m.end():]).strip()
    m = _LEAD_CODE_RE.match(s)
    if m and not is_code(s[m.end():]):
        rest = s[m.end():].strip(_TRAIL_PUNCT)
        # "GR 7 - Andorra" is a name; "Andorra" alone is a place. The code
        # stays when what follows it is one word and the whole thing fits.
        if len(rest.split()) > 1 or len(s) > TITLE_MAX:
            code = code or s[:m.end()].strip(_TRAIL_PUNCT)
            s = rest
    return s.strip(_TRAIL_PUNCT), code


def source_name(tags, fallback=None):
    """Rung 2: name:en, then a Latin-script name, then any name at all.

    Reads the relation's own tags; `fallback` is the stored title for a row
    whose tags carry no name (a derived route, whose title was composed from
    its member ways and is the only name it has)."""
    tags = tags or {}
    en = str(tags.get("name:en") or "").strip()
    if en:
        return en
    plain = str(tags.get("name") or "").strip()
    if plain and is_latin(plain):
        return plain
    for key, val in tags.items():
        if key.startswith("name:") and key != "name:etymology" \
                and val and is_latin(val):
            return str(val).strip()
    if plain:
        return plain
    return str(fallback or "").strip() or None


def from_to_title(tags):
    """Rung 3: the from and to tags as a pair."""
    tags = tags or {}
    a = str(tags.get("from") or "").strip()
    b = str(tags.get("to") or "").strip()
    if a and b and not is_code(a) and not is_code(b):
        if squash(a) == squash(b):
            return f"{a} loop"
        return f"{a} to {b}"
    if b and not is_code(b):
        return f"To {b}"
    if a and not is_code(a):
        return f"From {a}"
    return None


def landmark_title(features, route_type=None):
    """Rung 4: the best named thing the line touches, in a formula.

    features is scenic.py's list ({"kind", "name", "off_m", ...}), already
    limited to what the route genuinely passes."""
    best = None
    for f in features or []:
        # A bilingual "Veliki Mojan / Maja e Mojanit" takes its first name,
        # and a code in brackets goes the same way it does for a title.
        name = str(f.get("name") or "").split(" / ")[0].strip()
        name, _code = split_code(name)
        if not name or is_code(name) or f.get("kind") not in LANDMARK_ORDER:
            continue
        rank = LANDMARK_ORDER.index(f["kind"])
        if best is None or rank < best[0]:
            best = (rank, name)
    if best is None:
        return None
    name = best[1]
    if route_type in ("loop", "figure8"):
        return f"{name} loop"
    if route_type == "out_back":
        return f"Walk to {name} and back"
    return f"Walk to {name}"


def shape_place_title(route_type, passes=None, distance_m=None):
    """Rung 5: shape plus place, "Loop near Radomire". When not even an
    anchor is known, the shape and the distance: "Loop walk, 12 km"."""
    shape = SHAPE_WORD.get(route_type or "", "Walk")
    place = None
    for p in passes or []:
        name = str(p.get("name") or "").strip()
        if name and not is_code(name):
            place = name
            break
    if place:
        return f"{shape} near {place}"
    if distance_m:
        km = round(float(distance_m) / 1000.0)
        return f"{shape} walk, {km} km" if shape != "Walk" else f"Walk, {km} km"
    return None


def title_ladder(tags=None, *, title=None, features=None, passes=None,
                 route_type=None, distance_m=None, wikidata_label=None):
    """The title a row ships with, and where it came from.

    Returns {"title", "rung", "ref", "original"}: rung names the step that
    produced the title ("wikidata", "name", "from_to", "landmark", "shape",
    "kept"), ref is the signpost reference for the mono chip (the tag ref
    when there is one, otherwise the string the title replaced), original is
    the source string before the ladder touched it.

    Pure: no I/O, so a test can hold any row against it and a re-run reads
    the same tags and lands on the same answer."""
    tags = tags or {}
    original = str(tags.get("name") or tags.get("ref") or title or "").strip()
    tag_ref = str(tags.get("ref") or "").strip()
    ref = tag_ref if 0 < len(tag_ref) <= REF_MAX else None

    # Every rung's candidate is judged AFTER the cap: a 60-character Hungarian
    # name that caps down to its own waymark symbol has not produced a title,
    # and the next rung gets its turn.
    label = _usable(wikidata_label)
    if label:
        return _finish(label, "wikidata", ref, original)

    src = source_name(tags, fallback=title)
    if src and not is_raw_osm(src):
        name, code = split_code(src)
        name = _usable(name)
        if name:
            if code and not ref:
                ref = code[:REF_MAX]
            return _finish(name, "name", ref, original)

    pair = _usable(from_to_title(tags))
    if pair:
        return _finish(pair, "from_to", ref, original)

    mark = _usable(landmark_title(features, route_type))
    if mark:
        return _finish(mark, "landmark", ref, original)

    shape = _usable(shape_place_title(route_type, passes, distance_m))
    if shape:
        return _finish(shape, "shape", ref, original)

    # Nothing to build from: only a row with no tags, no features, no anchors
    # and no distance gets here. A real name is kept, capped; a code or a
    # symbol is not a title at any rung, so the chip keeps it and the title
    # says the one thing still known.
    kept = _usable(original or title)
    if kept:
        return _finish(kept, "kept", ref, original)
    return _finish("Walk", "kept", ref, original)


def _usable(text):
    """The capped candidate when it is a title, None when it is not."""
    capped = cap_title(text)
    if not capped or is_code(capped) or is_raw_osm(capped):
        return None
    return capped


def _finish(text, rung, ref, original):
    capped = cap_title(text)
    if not ref and original and squash(original) != squash(capped) \
            and len(original) <= ORIGINAL_MAX:
        ref = original
    return {"title": capped, "rung": rung, "ref": ref or None,
            "original": original or None}
