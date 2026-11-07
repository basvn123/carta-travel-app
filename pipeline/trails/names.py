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
_LEAD_PUNCT = " -:,;/.\u2013\u2014"
# Words a shortened title must not end on: they join two places.
_DANGLING = frozenset({
    "via", "to", "and", "the", "of", "from", "over", "by", "at", "in", "on",
    "de", "du", "des", "la", "le", "les", "di", "del", "della", "da",
    "et", "und", "zum", "zur", "nach", "von", "am", "im", "an", "naar",
    "en", "het", "van", "do", "na", "pod", "nad", "per", "por"})
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
    # An opening bracket at the start is part of the name ("[C] Cesky
    # Krumlov"), so only separators are stripped on the left (T1092).
    s = re.sub(r"\s+", " ", str(text or "")).lstrip(_LEAD_PUNCT) \
        .rstrip(_TRAIL_PUNCT)
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
    # T1092: the same for a quote ('"Kobyle' from '"Kobyle Jezioro"'), and
    # never end on a word that joins two places ("Circular via").
    if out.count('"') % 2:
        out = out[:out.rfind('"')]
    for q, close in (("\u201e", "\u201c"), ("\u00ab", "\u00bb")):
        if out.count(q) > out.count(close):
            out = out[:out.rfind(q)]
    out = out.rstrip(_TRAIL_PUNCT)
    words = out.split(" ")
    while len(words) > 1 and words[-1].lower() in _DANGLING:
        words.pop()
    return " ".join(words).rstrip(_TRAIL_PUNCT)


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


# The languages a place is locally named in, for the countries where the
# plain `name` tag is often in a script most readers of the app cannot read,
# or where two local languages share the ground. Used only to choose between
# Latin-script names: "Maja e Korabit" (name:sq) beats any other Latin
# spelling of a peak on the Albanian side, because it is what the signpost
# at the trailhead says. Every other country falls through to the first
# Latin name the tags carry, which is what the title ladder always did.
LOCAL_LANGS = {
    "AL": ("sq",), "XK": ("sq", "sr-Latn", "sr"), "MK": ("sq", "mk"),
    "ME": ("sr-Latn", "sq", "sr"), "RS": ("sr-Latn", "sr"),
    "BA": ("bs", "hr", "sr-Latn"), "BG": ("bg",), "GR": ("el",),
    "CY": ("el", "tr"), "UA": ("uk",), "MD": ("ro",), "TR": ("tr",),
}

# Keys that start with name: and are still never a display name.
_NOT_A_NAME = ("name:etymology", "name:pronunciation", "name:signed")


def display_name(tags, country=None):
    """The name a reader should see, from an OSM tag dict (spec 6.8).

    name:en first; then the plain `name` when it is Latin script; then the
    local language's name when that is Latin (LOCAL_LANGS); then int_name and
    any other Latin-script name:*; and only then whatever `name` holds, in any
    script, because a Cyrillic name is still better than no name. A lake on
    Mount Korab tagged with name (Macedonian Cyrillic), name:en and name:sq
    reads in English, never in a script the walker cannot match against the
    signpost.

    Pure; None when the tags carry no name at all."""
    tags = tags or {}
    en = str(tags.get("name:en") or "").strip()
    if en:
        return en
    plain = str(tags.get("name") or "").strip()
    if plain and is_latin(plain):
        return plain
    for lang in LOCAL_LANGS.get(str(country or "").upper(), ()):
        val = str(tags.get(f"name:{lang}") or "").strip()
        if val and is_latin(val):
            return val
    val = str(tags.get("int_name") or "").strip()
    if val and is_latin(val):
        return val
    for key, val in tags.items():
        if key.startswith("name:") and key not in _NOT_A_NAME \
                and val and is_latin(val):
            return str(val).strip()
    return plain or None


def source_name(tags, fallback=None, country=None):
    """Rung 2: name:en, then a Latin-script name, then any name at all.

    The relation's own tags through display_name(), the same order a
    highlight's name follows; `fallback` is the stored title for a row whose
    tags carry no name (a derived route, whose title was composed from its
    member ways and is the only name it has)."""
    return display_name(tags, country) or str(fallback or "").strip() or None


def feature_name(feature, country=None):
    """A highlight's display name: display_name() over the feature's tags when
    the harvest kept them, the stored `name` otherwise. scenic.py stores the
    plain name tag only, so until it keeps the name:* keys this returns what
    it always did; the order is decided here either way."""
    f = feature or {}
    tags = f.get("tags")
    if isinstance(tags, dict) and tags:
        return display_name(tags, country)
    name = str(f.get("name") or "").strip()
    return name or None


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
        name = str(feature_name(f) or "").split(" / ")[0].strip()
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


# ---------------------------------------------------------------------------
# T1092 (ROADMAP D7): network prefixes and transliteration
# ---------------------------------------------------------------------------

# A long network name in front of its own code says the code twice:
# "European long distance path E7, Andorra" is "E7, Andorra" on a signpost
# and on a card. Each pattern keeps the code and drops the words around it.
_NETWORK_RES = (
    # The E paths, in the languages the catalogue spells them in.
    (re.compile(r"^(?:European|Europ\u00e4ischer|Europese|Europ\u00e9en|"
                r"Europejski|Evropsk\u00e1|Eur\u00f3pai|Europsk\u00e1|"
                r"Europea|Europeo|Europeu|Europ\u00e6isk|Europeisk)\b"
                r"[^,\-\u2013(\d]*?\b(E)\s?(\d{1,2})\b",
                re.IGNORECASE), lambda m: f"E{m.group(2)}"),
    # Grande Randonnee in long form: "Sentier de Grande Randonnee 10".
    (re.compile(r"^(?:sentier de )?grande? randonn[e\u00e9]e\s*(\d{1,3})\b",
                re.IGNORECASE), lambda m: f"GR {m.group(1)}"),
)
# "E3 - part Poland (west)" reads "E3, Poland (west)".
_PART_RE = re.compile(r"\s*[-\u2013:]\s*(?:part|teil|deel|partie|parte|"
                      r"\u010d\u00e1st|cz\u0119\u015b\u0107)\s+", re.IGNORECASE)


def strip_network(text):
    """The name with a long network prefix folded to its code. Unchanged
    when no pattern matches; never empty when the input was not."""
    s = re.sub(r"\s+", " ", str(text or "")).strip()
    for rx, short in _NETWORK_RES:
        m = rx.match(s)
        if m:
            rest = s[m.end():].lstrip()
            s = short(m) + ((" " + rest) if rest and rest[0] not in ",:-\u2013"
                            else rest)
            break
    s = _PART_RE.sub(", ", s, count=1)
    return s.lstrip(_LEAD_PUNCT).rstrip(_TRAIL_PUNCT) or str(text or "").strip()


# Cyrillic to Latin. One base table (the BGN style most English maps use)
# and a national table per country, because the signpost at a Serbian
# trailhead says "Kopaonik" in the Serbian Latin alphabet, a Bulgarian one
# uses the 2009 streamlined system ("sht" for shta), and Ukrainian has its
# own 2010 national system. Used only when no Latin name exists in the tags.
_CYR_BASE = {
    "\u0430": "a", "\u0431": "b", "\u0432": "v", "\u0433": "g", "\u0434": "d",
    "\u0435": "e", "\u0451": "e", "\u0436": "zh", "\u0437": "z", "\u0438": "i",
    "\u0439": "y", "\u043a": "k", "\u043b": "l", "\u043c": "m", "\u043d": "n",
    "\u043e": "o", "\u043f": "p", "\u0440": "r", "\u0441": "s", "\u0442": "t",
    "\u0443": "u", "\u0444": "f", "\u0445": "kh", "\u0446": "ts", "\u0447": "ch",
    "\u0448": "sh", "\u0449": "shch", "\u044a": "", "\u044b": "y", "\u044c": "",
    "\u044d": "e", "\u044e": "yu", "\u044f": "ya",
    "\u0456": "i", "\u0457": "yi", "\u0454": "ye", "\u0491": "g",
    "\u0458": "j", "\u0459": "lj", "\u045a": "nj", "\u0452": "\u0111",
    "\u045b": "\u0107", "\u045f": "d\u017e", "\u0453": "gj", "\u045c": "kj",
    "\u0455": "dz",
}
# Serbian Latin (also Montenegro, Bosnia, Kosovo) and Macedonian, which
# share the caron letters on their signposts.
_CYR_SR = {"\u0436": "\u017e", "\u0445": "h", "\u0446": "c", "\u0447": "\u010d",
           "\u0448": "\u0161", "\u0439": "j"}
_CYR_NATIONAL = {
    "sr": _CYR_SR,
    "mk": _CYR_SR,
    "bg": {"\u0445": "h", "\u0449": "sht", "\u044a": "a", "\u044c": "y"},
    "uk": {"\u0433": "h", "\u0438": "y", "\u0445": "kh"},
}
_COUNTRY_CYR = {"RS": "sr", "ME": "sr", "BA": "sr", "XK": "sr", "MK": "mk",
                "BG": "bg", "UA": "uk"}

# Greek to Latin, ELOT 743 without its rarer rules. Pairs first.
_GREEK_PAIRS = {"\u03bf\u03c5": "ou", "\u03b1\u03b9": "ai",
                "\u03b5\u03b9": "ei", "\u03bf\u03b9": "oi",
                "\u03b3\u03b3": "ng", "\u03b3\u03ba": "gk",
                "\u03b1\u03c5": "av", "\u03b5\u03c5": "ev"}
_GREEK = {
    "\u03b1": "a", "\u03b2": "v", "\u03b3": "g", "\u03b4": "d", "\u03b5": "e",
    "\u03b6": "z", "\u03b7": "i", "\u03b8": "th", "\u03b9": "i", "\u03ba": "k",
    "\u03bb": "l", "\u03bc": "m", "\u03bd": "n", "\u03be": "x", "\u03bf": "o",
    "\u03c0": "p", "\u03c1": "r", "\u03c3": "s", "\u03c2": "s", "\u03c4": "t",
    "\u03c5": "y", "\u03c6": "f", "\u03c7": "ch", "\u03c8": "ps", "\u03c9": "o",
}


def _cyr_scheme(text, country):
    scheme = _COUNTRY_CYR.get(str(country or "").upper())
    if scheme:
        return scheme
    low = str(text).lower()
    if any(c in low for c in "\u0453\u045c\u0455"):
        return "mk"
    if any(c in low for c in "\u0452\u045b"):
        return "sr"
    if any(c in low for c in "\u0456\u0457\u0454\u0491"):
        return "uk"
    return None


def _cased(out, src_char, next_upper):
    if not out or not src_char.isupper():
        return out
    # A word in capitals stays in capitals: "ЖАБЉАК" is "ZHABLJAK".
    return out.upper() if next_upper else out[0].upper() + out[1:]


def transliterate(text, country=None):
    """Cyrillic and Greek letters to Latin; everything else unchanged.

    Pure. The country picks the national table (see _COUNTRY_CYR); without
    one the letters themselves hint at it, then the base table answers."""
    s = str(text or "")
    if not s:
        return s
    table = dict(_CYR_BASE)
    table.update(_CYR_NATIONAL.get(_cyr_scheme(s, country), {}))
    # Greek accents and diaeresis are dropped; Cyrillic breves are kept
    # (NFD would split the short i into i plus a breve).
    s = "".join(unicodedata.normalize("NFC", "".join(
        c for c in unicodedata.normalize("NFD", ch)
        if not unicodedata.combining(c))) if "\u0370" <= ch <= "\u03ff"
        or "\u1f00" <= ch <= "\u1fff" else ch for ch in s)
    out = []
    i = 0
    while i < len(s):
        ch = s[i]
        low = ch.lower()
        nxt = s[i + 1] if i + 1 < len(s) else ""
        next_upper = nxt.isupper() and ch.isupper()
        pair = (low + nxt.lower()) if nxt else ""
        if pair in _GREEK_PAIRS:
            out.append(_cased(_GREEK_PAIRS[pair], ch, next_upper))
            i += 2
            continue
        if low in _GREEK:
            out.append(_cased(_GREEK[low], ch, next_upper))
        elif low in table:
            out.append(_cased(table[low], ch, next_upper))
        else:
            out.append(ch)
        i += 1
    return re.sub(r"\s+", " ", "".join(out)).strip()


def readable(text, country=None):
    """A name a reader of the app can say: network prefix folded to its
    code, then non-Latin letters transliterated. Idempotent."""
    s = strip_network(text)
    if s and not is_latin(s) and any(c.isalpha() for c in s):
        s = transliterate(s, country)
    return s


def wire_name(title, country=None):
    """The `name` a trail ships with: the stored title (attributes.py, the
    title ladder) made readable and capped. The export applies it so a wire
    built before the ladder re-ran still reads clean; on a ladder title it
    changes nothing."""
    s = cap_title(readable(title, country))
    return s or str(title or "").strip() or None


def source_label(tags, title=None, shown=None):
    """The source name, as the mapper wrote it, for its own wire field.

    The relation's plain `name` tag (any script), else the stored title.
    None when it reads the same as `shown` (the display name), so the page
    prints it only when it adds something."""
    tags = tags or {}
    src = str(tags.get("name") or title or "").strip()
    if not src or is_raw_osm(src):
        return None
    if shown is not None and squash(src) == squash(shown):
        return None
    return src[:ORIGINAL_MAX]


def title_ladder(tags=None, *, title=None, features=None, passes=None,
                 route_type=None, distance_m=None, wikidata_label=None,
                 country=None):
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

    src = source_name(tags, fallback=title, country=country)
    if src and not is_raw_osm(src):
        # T1092: "European long distance path E7, Andorra" folds to "E7,
        # Andorra", and a name only in Cyrillic or Greek is transliterated.
        name, code = split_code(readable(src, country))
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
