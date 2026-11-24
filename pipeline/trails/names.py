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
    r"^(?:[A-Za-z]{1,4}[\s\-]?\d+[A-Za-z]?|\d{3,}|\d+[\-/.]\d+[A-Za-z]?|"
    r"[A-Z]{2,5}-[A-Z]\d{2,4}(?:_[A-Z]?\d+)?)"
    r"(?:\s*[:\-\u2013]\s*|\s+)(?=\S)")
# A one or two digit stage number before a spaced dash: "08 - Roosteren".
_BARE_NUM_LEAD_RE = re.compile(r"^\d{1,2}\s+[-\u2013]\s+(?=\S)")
_TAG_SYNTAX_RE = re.compile(
    r"[=;{}<>|]|\bosm route\b|^\s*(?:node|way|relation)/\d+", re.IGNORECASE)
_TRAIL_PUNCT = " -:,;/.\u2013\u2014([{>_|"
_LEAD_PUNCT = " -:,;/.\u2013\u2014"
# Words a shortened title must not end on: they join two places.
_DANGLING = frozenset({
    "via", "to", "and", "the", "of", "from", "over", "by", "at", "in", "on",
    "de", "du", "des", "la", "le", "les", "di", "del", "della", "da",
    "et", "und", "zum", "zur", "nach", "von", "am", "im", "an", "naar",
    "en", "het", "van", "do", "na", "pod", "nad", "per", "por"}) | frozenset({
    # D7 (wave 2, judge 2): a cut name must not end on a joining word; one list, per language.
    "around", "near", "with", "for", "into", "along", "through",
    "dei", "dello", "delle", "degli", "al", "alla", "ai", "con", "sul", "sulla",
    "dans", "sur", "aux", "au", "avec", "pour",
    "wokół", "przez", "koło", "obok", "dla", "około",
    "um", "rund", "bei", "mit", "auf", "aus", "entre", "hacia", "desde", "los", "las", "el",
    "alrededor", "rond", "door", "langs", "om", "til", "fra", "och", "kring", "runt",
    "ve", "pro", "kolem", "okolo", "mezi", "és", "körül"}) | frozenset({
    # D7 (wave 3 step 0): the joining words, articles and conjunctions of the data's
    # languages (de nl fr it es pl cs sk sl hr hu da sv no fi et lt lv pt ro). One list
    # for the cut (`trim_dangling`) and for the replay's `dangling_end`.
    "der", "den", "dem", "die", "das", "ein", "eine", "einer", "oder", "zum", "zur", "vom", "mit", "bei", "aus", "f\u00fcr", "fur",
    "het", "een", "voor", "met", "op", "tot", "uit", "onder", "tussen",
    "un", "une", "les", "sous", "pour", "par", "ou", "entre", "chez", "vers",
    "il", "lo", "gli", "le", "una", "ed", "nel", "nella", "nei", "nelle", "su", "tra", "fra",
    "un", "unos", "unas", "por", "para", "sobre", "bajo", "tras", "ante",
    "oraz", "od", "pod", "nad", "obok", "przed", "za", "bez", "ze",
    "ve", "se", "ke", "u", "k", "p\u0159ed", "mezi", "bez", "pre", "so", "vo",
    "ob", "pri", "sa", "kod", "iz", "uz",
    "az", "egy", "meg", "\u00e9s",
    "og", "af", "ved", "om", "med", "til", "p\u00e5", "fr\u00e5n", "\u00f6ver", "under", "vid", "och", "av", "mot", "ett", "f\u00f6r",
    "ja", "ning", "ir", "un", "ei",
    "o", "os", "as", "dos", "das", "do", "da", "ao", "aos", "\u00e0s", "no", "na", "nos", "nas", "com", "em", "sem",
    "\u0219i", "si", "cu", "pe", "din", "pentru", "\u00een", "la", "de",
    "n\u1d52", "n\u00ba", "nr", "son", "w", "z", "y", "e", "i"}) | frozenset({
    # D7 (wave 3b, judge 4 fix 1): "Hohe D\u00fcne bis", "Rinkerode und durch". The whole
    # wire was scanned for the last word of every cut name; none of these ends a real
    # name there. "bis" after a number ("Tappa 19 bis") is a suffix, see _trim_dangling.
    "bis", "durch", "zu", "ins", "\u00fcber", "unter", "gegen", "hinter", "vor", "ohne",
    "entlang", "przy"})

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


_DASH_SEP_RE = re.compile(r"\s[-\u2013]\s")
# A short head before a colon: "BergeSeen Trail 15: Gosau-Hintertal - Hallstatt".
_HEAD_RE = re.compile(r"^([^:]{1,40}):\s+(?=\S)")
_END_CODE_RE = re.compile(_PAREN_CODE_RE.pattern + r"$")


def _close_brackets(out):
    """Drop an opener left without its closer, and what follows it."""
    if out.count("(") > out.count(")"):
        out = out[:out.rfind("(")]
    if out.count("[") > out.count("]"):
        out = out[:out.rfind("[")]
    if out.count('"') % 2:
        out = out[:out.rfind('"')]
    for q, close in (("\u201e", "\u201c"), ("\u00ab", "\u00bb")):
        if out.count(q) > out.count(close):
            out = out[:out.rfind(q)]
    return out.rstrip(_TRAIL_PUNCT)


def trim_dangling(out):
    """_trim_dangling, but a final abbreviation with its dot ("Szlak Śl.",
    "Trasa 1241 r.", "Droga pl.") stays when the name before it is clean: the
    dot makes it a word, not a stray one or two letter token."""
    res = _trim_dangling(out)
    # One abbreviation rule with strip_network and cap_title: "Szkl.", "v.W.", "n.D.".
    if out.endswith(".") and " " in out and _ends_in_abbrev(out[:-1]) and len(res) < len(out):
        head = out.rsplit(" ", 1)[0]
        if _trim_dangling(head) == head:
            return out
    return res


def _trim_dangling(out):
    """What a cut name must not end on, taken off (D7, wave 3 step 0): a last
    token of two letters or fewer (no digit), a word of `_DANGLING` (joining
    words and articles per language), a lone "&", an open quote or bracket.
    Used after every word cut and by the replay's `dangling_end`, so the rule
    and the counter cannot drift apart. Keeps at least three characters."""
    while True:
        prev = out
        if re.search(r"\w-,\s[^\s]+-$", out):
            return out              # "Rad-, Lauf-": the hyphen is a word
        out = _close_brackets(out)
        # A Sardinian "'e" or elided "'n" is a word ("Janna 'e Ferulargiu"); an open quote goes.
        if not re.search(r"(?:^|\s)'[a-z]{1,2}\s\S", out):
            out = re.sub(r"(?:^|\s)'[^']*$", "", out).rstrip(_TRAIL_PUNCT)
        m = re.search(r"(?:^|[\s\-&/]+)([^\s\-&/]+)$", out)
        if m:
            tok = m.group(1)
            low = tok.lower().strip(".,;:")
            unit = low in ("km", "h", "m", "mi") and bool(re.search(r"\d\s*$", out[:m.start(1)]))
            short = len(tok) <= 2 and not unit and not any(c.isdigit() for c in tok) and not re.fullmatch(r"-+", m.group(0)[:-len(tok)].strip(" "))
            after_number = low == "bis" and bool(re.search(r"\d\s+\S+$", out))
            if (low in _DANGLING and not after_number) or short:
                cut = out[:m.start()].rstrip(_TRAIL_PUNCT)
                if len(cut) >= 3:
                    out = cut
        if re.search(r"\s&$", out):
            out = out[:-2].rstrip(_TRAIL_PUNCT)
        if out == prev:
            return out


def _head_words(text, room):
    """The longest run of whole words from the start that fits `room`, never
    ending on a joining word or a one or two letter word; "" when not even a
    word that is not a code fits."""
    if len(text) <= room:
        return text
    out = []
    for w in text.split(" "):
        if len(" ".join(out + [w])) > room:
            break
        out.append(w)
    while out and (out[-1].lower().strip(_TRAIL_PUNCT) in _DANGLING
                   or (len(out[-1].strip(_TRAIL_PUNCT)) <= 2
                       and not any(c.isdigit() for c in out[-1]))):
        out.pop()
    res = _close_brackets(" ".join(out).rstrip(_TRAIL_PUNCT))
    return res if res and not is_code(res) else ""


def _final_bracket(s):
    """(name, inner) when s ends in a bracket holding one "A - B", else None:
    "Bodensee-Rundwanderweg (Stein a. R. - Lindau)". Nested brackets count."""
    if not s.endswith(")"):
        return None
    depth = 0
    for i in range(len(s) - 1, -1, -1):
        depth += {")": 1, "(": -1}.get(s[i], 0)
        if depth == 0:
            break
    inner, name = s[i + 1:-1].strip(), s[:i].rstrip(_TRAIL_PUNCT)
    if depth or not name or is_code(name) or len(_DASH_SEP_RE.findall(inner)) != 1:
        return None
    return name, inner


def _boundary_head(text, room, phrase=False):
    """The longest start of `text` that fits `room` and ends at a natural
    boundary (before ", ", ": ", " - " or an opening bracket), never inside a
    phrase; "" when none does. D7 (wave 2, judge 2): a start is whole or it is
    cut at a boundary, never at a word ("Tour Du Mont" for Tour Du Mont Blanc)."""
    if len(text) <= room:
        return text
    best = ""
    # phrase: also before a trailing "di Ivrea" / "of X" / "von X", a whole phrase.
    rx = r", |: | - | – | [(\[]" + (r"| (?=(?:di|de|del|della|du|des|of|von|van|vom|zu|bei) )" if phrase else "")
    for m in re.finditer(rx, text):
        if 0 < m.start() <= room:
            if m.group(0) == ", " and text[m.start() - 1] == "-":
                continue            # "Rad-, Lauf-": a suspended hyphen is not a boundary
            cand = text[:m.start()].rstrip(_TRAIL_PUNCT)
            if m.group(0) == " " and not (len(cand.split()) >= 3 and len(cand) >= 16):
                continue        # a phrase cut must leave a name ("Ruta" is not one)
            best = cand
    return best if best and not is_code(best) else ""


def _keep_the_end(s, limit):
    """D7 (wave 1, 0.4): a two-part name "A - B" or "X: A - B" keeps its end.

    A walk named from where it starts to where it ends is no use with the end
    cut off ("BergeSeen Trail 15: Gosau-Hintertal"), so the head X goes
    first, then A is shortened from its right; B stays whole. None when the
    name is not two parts, or B alone does not fit: the plain cut decides.
    Three or more parts keep the plain cut (a loop's last stop repeats its
    first, and the first two of four say where it goes)."""
    fb = _final_bracket(s)
    if fb:
        # "N (A - B)": N stays with a shorter A when that fits, else the walk
        # is named from A to B, as "X: A - B" is; N rides on the chip.
        name, inner = fb
        a, b = (x.strip() for x in _DASH_SEP_RE.split(inner))
        sep = _DASH_SEP_RE.search(inner).group(0)
        head = _boundary_head(a, limit - len(name) - 3 - len(sep) - len(b)) if a else ""
        if head:
            return f"{name} ({head}{sep}{b})"
        return _keep_the_end(inner, limit)
    m = _HEAD_RE.match(s)
    body = s[m.end():] if m else s
    seps = _DASH_SEP_RE.findall(body)
    if len(seps) != 1:
        return None
    a, b = (x.strip() for x in _DASH_SEP_RE.split(body))
    sep = seps[0]
    if not a or not b or b.count(")") > b.count("(") or b.count("]") > b.count("["):
        return None
    if len(a) + len(sep) + len(b) <= limit:
        return a + sep + b
    # D7 (wave 2, judge 1 fix 4): the code rides the chip, so it goes before a
    # word of the start does ("PRC43SMI Pico das Camarinhas - Ponta da
    # Ferraria" lost Camarinhas to a cut that kept the code). A stage code in
    # the middle ("Via Sancti Martini HW-33-01 Geisenhausen - Landshut") takes
    # the route's head with it: the walk is named from its start town.
    stripped = split_code(a)[0]
    tok, _sp, rest = a.partition(" ")
    if is_code(tok) and rest and not is_code(rest) and len(tok) >= 4:
        stripped = rest                 # "PRC43SMI Pico das Camarinhas"
    sym = re.match(r"^\[[^\]\s]{1,3}\]\s+(\S.*)$", a)
    if sym and not is_code(sym.group(1)):
        stripped = sym.group(1)         # "[C] Moravsky Krumlov": the waymark symbol goes
    if stripped and stripped != a and not is_code(stripped):
        a = stripped
        if len(a) + len(sep) + len(b) <= limit:
            return a + sep + b
    mid = _MID_CODE_RE.search(a)
    if mid and mid.start() >= 8:
        town = a[mid.end():].strip()
        if town and len(town) + len(sep) + len(b) <= limit:
            return town + sep + b
    code = _END_CODE_RE.search(b)
    if code and is_code(code.group(1)) and not is_code(b[:code.start()]):
        b = b[:code.start()].rstrip(_TRAIL_PUNCT)   # the code is on the ref chip
    if len(b) > limit and b.endswith(")") and b.count("(") == b.count(")"):
        # A note in brackets after the end place ("(quarta sezione)") goes
        # before the place does.
        b = b[:b.rfind("(")].rstrip(_TRAIL_PUNCT)
    if not b or len(b) > limit:
        return None
    # A short or stage-like end ("Tappa 8") says less than the start does; the
    # stage rides on as a suffix from the original (dedupe_names).
    if len(a) <= limit and (len(b) < 12 or _STAGE_RE.search(b)):
        return a
    head = _boundary_head(a, limit - len(sep) - len(b))
    if head:
        return head + sep + b      # "Kantanos-Selino - Day 2" keeps its stage
    return None if is_code(b) else b


_MID_CODE_RE = re.compile(r"\s+(?=[A-Z]{1,4}-\S*\d)[A-Z]{1,4}-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+(?![\w-])|\s+[A-Z]\d{2}-\d+(?![\w-])")


def _keep_the_start(s, limit):
    """D7 (judge fix 1): a two-part name "A - B" whose end B alone is over the
    limit keeps its start A whole, never cut and never followed by a piece of
    B's code ("Il Cammino di santa, CSG-T002_V26 Valle"). A leading part of B
    rides along only when it is two or more words and fits; otherwise B is
    dropped, a loss no title can avoid. None when A does not fit or the name
    is not two parts: the plain cut decides."""
    m = _HEAD_RE.match(s)
    body = s[m.end():] if m else s
    if len(_DASH_SEP_RE.findall(body)) != 1:
        return None
    a, b = (x.strip() for x in _DASH_SEP_RE.split(body))
    # B is measured as written, code included: "CSG-T022_V24 Cicognara_..."
    # is 47 characters whatever chip the code later rides on.
    raw_b = b
    sep = _DASH_SEP_RE.search(body).group(0)
    # "Via Sancti Martini HW-37-02 Speyer - Neustadt ...": the name is what
    # stands before the stage code, the town after it is the walk's own start
    # and the stage code tells the rows apart (dedupe_names).
    mid = _MID_CODE_RE.search(a)
    if mid and mid.start() >= 8 and mid.start() + len(sep) + len(b) > limit:
        return a[:mid.start()]
    a, b = split_code(a)[0] or a, split_code(b)[0] or b
    if not a or is_code(a) or len(a) > limit or len(raw_b) <= limit:
        return None
    if b.endswith(")") and b.count("(") == b.count(")"):
        # A note in brackets goes before the place does: "Lorrach Bahnhof -
        # Rohrberg (Westweg ...)" fits once the note is gone, so it is no
        # case for dropping B.
        note_less = b[:b.rfind("(")].rstrip(_TRAIL_PUNCT)
        if note_less and len(a) + len(sep) + len(note_less) <= limit:
            return None
    head = _head_words(b, limit - len(a) - len(sep))
    # A cut that leaves '"Okretaljka", put' hangs on a comma: cut at the
    # comma, so the part kept is a whole piece of the name.
    at_mark = ", " in head
    if at_mark:
        head = head[:head.rfind(", ")].rstrip(_TRAIL_PUNCT)
    if (head and not is_code(head) and (at_mark or len(head.split()) >= 2)
            and len(a) + len(sep) + len(head) <= limit):
        return a + sep + head
    return a


def cap_title(text, limit=TITLE_MAX, keep_note=False, safe=False, uncut=True):
    """cap_title_plain, then a suspended hyphen kept: "Rad-, Lauf- und Wander"
    cut after "Lauf" reads "Rad-, Lauf", a word lost; the hyphen stays."""
    out = _cap_title_plain(text, limit, keep_note, safe, uncut)
    s = re.sub(r"\s+", " ", str(text or "")).lstrip(_LEAD_PUNCT).rstrip(_TRAIL_PUNCT)
    if out and len(out) < len(s) and s.startswith(out + "-") and s[len(out) + 1:len(out) + 2] in (" ", ","):
        out += "-"

    if out and len(out) < len(s):
        out = trim_dangling(out)    # "Bagnoles-de", "Watersmeet &", "Route der", an open quote
    if out and not out.endswith("-") and re.search(r"\w-,\s[^\s]+-$", str(text or "").strip()) and len(out) >= len(s) - 1:
        out += "-"              # the whole name already ended on its suspended hyphen
    whole = str(text or "").strip()
    # D7 (wave 3b, judge 2 fix 3): "... - 11.1 km" cut after its number leaves a
    # bare number that reads as a route or stage number; the number goes with its unit.
    if out and len(out) < len(s):
        um = re.search(r"[\s,\-\u2013]+\d+(?:[.,]\d+)?$", out)
        if um and re.match(r"\s*(?:km|h|mi|m)\b", s[len(out):], re.IGNORECASE):
            bare = out[:um.start()].rstrip(_TRAIL_PUNCT)
            if len(bare) >= 3 and not is_code(bare):
                out = trim_dangling(bare)
    if out and whole.endswith(out + ".") and len(out) < limit and _ends_in_abbrev(out):
        out += "."              # D7: "1241 r.", "Śl.", "v.W." keep the dot of a closing abbreviation
    if uncut and out and len(s) > limit and len(out) < len(s):
        # D7 (wave 4, judge 2): the check runs on the cut as the boundary made it. A cut that
        # a trim had to shorten, that does not end at a listed boundary, that loses every
        # place or that ends on a joiner ships the whole name.
        if trim_dangling(out) != out or not _keeps_a_place(out, s):
            return s
        if s.startswith(out) and not re.match(r"(?: [-–/:] |: |, | \(| \[| (?=[A-Z]{1,4}-[A-Za-z0-9]*\d))", s[len(out):]):
            return s
    return out


_DESCRIPTOR_ENDS = ("weg", "wege", "pfad", "steig", "route", "trail", "rundgang", "wanderung", "runde")
_DESCRIPTORS_MORE = frozenset({
    "coast", "way", "circular", "rail", "okru\u017en\u00ed", "trasa", "stezka", "chodn\u00edk", "nau\u010dn\u00e1", "\u015bcie\u017cka", "szlak",
    "sendero", "camino", "percorso", "anello", "giro", "ruta", "tocht", "wandelpad", "natuurpad", "lehrpfad",
    "promenade", "parcours", "chemin", "balade", "rando", "tura", "tur", "utvandring"})


def _is_descriptor(token):
    low = token.casefold()
    return low in _GENERIC_PART or low in _DESCRIPTORS_MORE or low.endswith(_DESCRIPTOR_ENDS)


def _place_words(text, skip_first=False):
    """Capitalised mixed-case tokens of three letters or more that name something:
    not a descriptor (_GENERIC_PART), not a joining word, not a code. The first
    word of a name is the kind of walk as often as a place ("Rail Trail:"), so by
    default it does not count (judge 1, wave 4)."""
    out = []
    first = re.search(r"[^\W\d_]+", str(text or ""))
    for m in re.finditer(r"[^\W\d_]{3,}", str(text or "")):
        t = m.group(0)
        if skip_first and first and m.start() == first.start():
            continue
        if (t[0].isupper() and any(c.islower() for c in t) and not _is_descriptor(t)
                and t.casefold() not in _DANGLING and not is_code(t)):
            out.append(t)
    return out


def _keeps_a_place(out, whole):
    """A boundary cut is accepted when the kept part holds a place word and
    does not end on a joiner (trim_dangling would change nothing)."""
    if trim_dangling(out) != out:
        return False
    # A whole with no place word has none to lose.
    # The first word is the kind of walk as often as a place, so it does not count.
    return bool(_place_words(out, True)) or not _place_words(whole, True)


def _cap_title_plain(text, limit=TITLE_MAX, keep_note=False, safe=False, uncut=True):
    """Shorten to `limit` on a word boundary, trailing separators dropped.

    No ellipsis: the full string is on the ref chip, and a title that ends in
    three dots reads as broken rather than as a name."""
    # An opening bracket at the start is part of the name ("[C] Cesky
    # Krumlov"), so only separators are stripped on the left (T1092).
    s = re.sub(r"\s+", " ", str(text or "")).lstrip(_LEAD_PUNCT) \
        .rstrip(_TRAIL_PUNCT)
    if len(s) <= limit:
        return s
    # D7 (wave 1): "P (Agfalva, foter - ...)" is a waymark and then the name;
    # cutting inside the bracket left "P".
    m = _CODE_THEN_NAME_RE.match(s)
    if not safe and m and is_code(m.group(1)) and not is_code(m.group(2)):
        return cap_title(m.group(2), limit)
    # D7 (wave 3b, judge 2 fix 4): 'Natura Trail "Krofdorfer Forst - Im Reich
    # der Wildkatze"': a quoted "A - B" is the walk's name when it fits; a cut
    # inside the quote left a stray closing mark.
    q = re.search(r'[\u201e\u201c"\u00ab]([^\u201e\u201c\u201d"\u00ab\u00bb]+)[\u201c\u201d"\u00bb]$', s)
    if (not safe and q and s[:q.start()].strip() and _DASH_SEP_RE.search(q.group(1))
            and len(q.group(1).strip()) <= limit and not is_code(q.group(1))):
        return q.group(1).strip()
    # D7 (wave 3b, judge 4 fix 2): "A - B (note)" is "A - B" once the trailing
    # bracket goes, when that fits; a segment cut would lose a place and keep
    # the noise. A bracket that holds its own "A - B" is _keep_the_end's case.
    if not safe and not keep_note and s.endswith((")", "]")) and not _final_bracket(s):
        at_open = max(s.rfind("(") if s.endswith(")") else -1,
                      s.rfind("[") if s.endswith("]") else -1)
        plain = s[:at_open].rstrip(_TRAIL_PUNCT) if at_open > 0 else ""
        hm = _HEAD_RE.match(plain)
        if hm and _DASH_SEP_RE.search(plain[hm.end():]):
            plain = plain[hm.end():]    # "section 16: A - B": the head goes, as in _keep_the_end
        if (plain and len(plain) <= limit and _DASH_SEP_RE.search(plain)
                and plain.count("(") == plain.count(")")
                and plain.count("[") == plain.count("]") and not is_code(plain)):
            return plain
    # The start is kept before the end is: when B alone is over the limit,
    # shortening A to make room for a B that is cut anyway loses both.
    kept = None if safe else (_keep_the_start(s, limit) or _keep_the_end(s, limit))
    if kept:
        return kept
    cut = s[:limit + 1]
    # An "A - B - C" name cuts between its segments, not inside one, when a
    # segment boundary sits in the second half of the allowance.
    # A separator that starts right at the limit counts: the segment before
    # it fits whole (D7, wave 1).
    seg = max(s.rfind(sep, 0, limit + len(sep)) for sep in _SEGMENT_SEPS + (" (", " ["))
    if uncut:
        # D7 (wave 4, judge 1): no word cuts. A name with no boundary that keeps it
        # within the limit ships whole; the app truncates on screen.
        if seg <= 0:
            return s
        at = seg
    elif seg >= limit // 2:
        at = seg
    else:
        at = max(cut.rfind(" "), cut.rfind("-"), cut.rfind("/"))
    if at < limit // 3 and not uncut:          # one enormous word; cut it hard
        return s[:limit].rstrip(_TRAIL_PUNCT)
    # Never leave a bracket open: "(historic route)" cut to "(historic" reads
    # as a typo, so the whole bracket goes. T1092: the same for a quote
    # ('"Kobyle' from '"Kobyle Jezioro"'), and never end on a word that joins
    # two places ("Circular via").
    out = _close_brackets(s[:at])
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
    # D7 (wave 1): a lone letter is a waymark symbol, not a code ("P (...)");
    # cap_title takes the bracket's name when it has to shorten.
    if m and is_code(m.group(1)) and (len(m.group(1)) > 1 or m.group(1).isdigit()) \
            and not is_code(m.group(2)):
        return m.group(2).strip(_TRAIL_PUNCT), m.group(1)
    m = _PAREN_CODE_RE.search(s)
    if m and is_code(m.group(1)):
        code = m.group(1).strip()
        s = (s[:m.start()] + " " + s[m.end():]).strip()
    # D7 (wave 1): "RVN 5 - Pe 2 - 08 - Roosteren-Thorn" carries three codes;
    # up to three are peeled, the bare "08 - " included.
    peeled = []
    for _ in range(3):
        m = _LEAD_CODE_RE.match(s) or _BARE_NUM_LEAD_RE.match(s)
        if not m or is_code(s[m.end():]):
            break
        rest = s[m.end():].strip(_TRAIL_PUNCT)
        # "GR 7 - Andorra" is a name; "Andorra" alone is a place. The code
        # stays when what follows it is one word and the whole thing fits.
        if not peeled and len(rest.split()) <= 1 and len(s) <= TITLE_MAX:
            break
        peeled.append(s[:m.end()].strip(_TRAIL_PUNCT))
        s = rest
    if peeled:
        code = code or " - ".join(peeled)
    # An opening bracket at the start is part of the name ("[M] Taborskeho
    # cesta"), as in cap_title.
    out = _rstrip_keep_abbrev(s.lstrip(_LEAD_PUNCT))
    if re.search(r"\w-,\s[^\s]+-$", s):
        out += "-"                      # "Rad-, Lauf-": a suspended hyphen is a word
    return _drop_stray_closers(out), code


def _drop_stray_closers(out):
    """A closer whose opener went with a lead code ("Wm 03 (Untergrafenrieder
    Weg)" is "Untergrafenrieder Weg)" once "Wm 03" and the "(" are peeled) is
    taken off, so no name is made unbalanced (D7, wave 3b). Quotes count as
    brackets: the closing marks of \u201e\u201c and \u201c\u201d."""
    # The guillemets are left out: they are used both ways round.
    depth = {"(": 0, "[": 0, "\u201e": 0, "\u201c": 0}
    pair = {")": "(", "]": "[", "\u201d": "\u201c"}
    keep = []
    for ch in out:
        if ch in "\u201c\u201d" and depth["\u201e"]:
            depth["\u201e"] -= 1           # the closer of a German or Polish quote
        elif ch in depth:
            depth[ch] += 1
        elif ch in pair:
            if depth[pair[ch]] == 0:
                continue
            depth[pair[ch]] -= 1
        keep.append(ch)
    res = "".join(keep)
    return re.sub(r"\s+", " ", res).lstrip(_LEAD_PUNCT).rstrip() if res != out else out


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


_ABBREV_END = re.compile(r"(?:^|[\s.\-])([^\W\d_]{1,4})$")   # "Szabó-pallag-eh." (judge 4)
_ABBREV_EARLIER = re.compile(r"[^\W\d_]\.\s?\S")


def _ends_in_abbrev(out):
    """The last word is an abbreviation that owns a dot: 1 to 3 letters
    ("r", "pl", the "D" of "n.D"), or 4 ("Szkl") when the name already has
    another dotted abbreviation. "walk" alone is a word, not "walk."."""
    m = _ABBREV_END.search(out)
    if not m:
        return False
    return len(m.group(1)) <= 3 or bool(_ABBREV_EARLIER.search(out[:m.start(1)]))


def _rstrip_keep_abbrev(s):
    """Trailing punctuation off, except the dot of a closing abbreviation.

    D7 (wave 3, judge 2): "Szlak Bitwy 1241 r." and "... Śl." read wrong
    as "1241 r" and "Śl"; a dot after a short final word is part of it."""
    out = s.rstrip(_TRAIL_PUNCT)
    if s[len(out):].startswith(".") and _ends_in_abbrev(out):
        return out + "."
    return out


def strip_network(text):
    """The name with a long network prefix folded to its code. Unchanged
    when no pattern matches; never empty when the input was not."""
    s = re.sub(r"\s+", " ", str(text or "")).strip()
    for rx, short in _NETWORK_RES:
        m = rx.match(s)
        if m:
            rest = s[m.end():].lstrip()
            # D7 (wave 1): only a comma or colon sits tight ("E7, Andorra");
            # a dash keeps its space ("E7 - Andorra", once "E7- Andorra").
            s = short(m) + (rest if not rest or rest[0] in ",:" else " " + rest)
            break
    s = _PART_RE.sub(", ", s, count=1)
    return _rstrip_keep_abbrev(s.lstrip(_LEAD_PUNCT)) or str(text or "").strip()


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
        prev = s[i - 1] if i else ""
        # D7 (wave 1): the last letter of "СТОРГОЗИЯ" has no next capital, but
        # its word is in capitals: "STORGOZIYA", never "STORGOZIYa".
        next_upper = ch.isupper() and (nxt.isupper() or (not nxt.isalpha() and prev.isupper()))
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


_FIXME_RE = re.compile(r"\bfixme\b", re.IGNORECASE)
_ROMAN_RE = re.compile(r"^[IVXLC]{1,4}$")
_WORD_START_RE = re.compile(r"(^|[^\w'\u2019])(\w)")


def _strip_fixme(text):
    """The mapper's "fixme" placeholder taken out, with the separator it
    hung on: "Saulcy - fixme" is "Saulcy", "fixme - fixme" is ""."""
    s = str(text or "")
    if not _FIXME_RE.search(s):
        return s
    s = _FIXME_RE.sub(" ", s)
    s = re.sub(r"\s*[-\u2013:,/]\s*(?:[-\u2013:,/]\s*)+", " - ", s)
    return re.sub(r"\s+", " ", s).lstrip(_LEAD_PUNCT).rstrip(_TRAIL_PUNCT)


def _shouting(text):
    """The classifier's all-caps test: six letters or more, over 85% upper."""
    letters = [c for c in str(text or "") if c.isalpha()]
    return len(letters) >= 6 and sum(c.isupper() for c in letters) / len(letters) > 0.85


def _title_case(text):
    """A name in capitals in title case: "GLENTIES TO KILLETER" is "Glenties
    to Killeter". Codes (a digit, a Latin token of two letters, a Roman
    numeral) keep their capitals; joining words after the first go lower.
    Unchanged when the name is not shouting, so it is idempotent."""
    if not _shouting(text):
        return text
    out = []
    for i, w in enumerate(str(text).split(" ")):
        core = w.strip("\"'()[],.:;-\u2013")
        low = core.lower()
        if any(c.isdigit() for c in w) or (low not in _DANGLING and (
                (is_latin(core) and len(core) <= 2) or _ROMAN_RE.match(core))):
            out.append(w)
        elif i and low in _DANGLING:
            out.append(w.lower())
        else:
            out.append(_WORD_START_RE.sub(lambda m: m.group(1) + m.group(2).upper(), w.lower()))
    return " ".join(out)


def readable(text, country=None):
    """A name a reader of the app can say: the fixme placeholder out,
    network prefix folded to its code, capitals to title case, then
    non-Latin letters transliterated. Idempotent. Title case runs before the
    transliteration, so "КРЕПОСТ" reads "Krepost", not "KREPOST"."""
    s = _strip_fixme(text)
    if not s.strip():
        return ""
    s = _title_case(strip_network(s))
    if s and not is_latin(s) and any(c.isalpha() for c in s):
        s = _title_case(transliterate(s, country))
    return s


def wire_name(title, country=None):
    """The `name` a trail ships with: the stored title (attributes.py, the
    title ladder) made readable and capped. The export applies it so a wire
    built before the ladder re-ran still reads clean; on a ladder title it
    changes nothing. "" for a title that was only a fixme placeholder: no
    name is honest, the placeholder is not."""
    rd = readable(title, country)
    base = rd
    if len(rd) > TITLE_MAX:
        # D7 (wave 3b, judge 2 fix 1): the lead code rides the chip, so it is
        # off before the cut: "10 - Rifugio Maria Luisa - Piano delle Creste"
        # is 40 characters without its code and must not lose a place.
        free = split_code(rd)[0]
        if free and not is_code(free):
            base = free
        # A network prefix ("WNW IJsseldelta -") is a code of the walk too.
        mp = re.match(r"^[A-Z]{2,5}\s+[^-–]{1,30}?\s+[-–]\s*(?=\S)", base)
        if mp and not is_code(base[mp.end():]) and len(base[mp.end():]) <= TITLE_MAX:
            base = base[mp.end():].strip()
    s = cap_title(base)
    if not s and _FIXME_RE.search(str(title or "")):
        return ""
    return never_worse(title, s or str(title or "").strip() or None, country)


_NOISE_WORDS = frozenset({"fixme"})
# D7 (wave 4 step 0, judge 3 fix 2): words that describe a walk without naming it. A
# name made only of these ("versantul drept", "paarse route", "Bewegung") has lost its
# place. The colours are the ones name_problems knows plus the way-marker colours and
# shapes the data carries in nl, de, fr, it, es, ro, hu, pl, cs and the Nordic languages;
# the rest is the generic noun of a route in the same languages.
_GENERIC_PART = frozenset({
    "p\u00e9destre", "pedestre", "boucle", "balade", "randonn\u00e9e",
    "route", "routes", "circuit", "circuito", "rundweg", "rundwanderweg", "wanderweg", "weg", "pfad",
    "variante", "variant", "alternative", "alternatief", "itinerario", "principale", "sentiero",
    "sentier", "trail", "loop", "walk", "path", "runde", "tour", "section", "connect", "connection",
    "versantul", "drept", "st\u00e2ng", "traseu", "traseul", "wandelroute", "wandeling", "lus", "pad",
    "streep", "ruit", "ronde", "grote", "kleine", "gro\u00dfer", "kleiner", "gro\u00dfe", "kleines",
    "bewegung", "motivation", "entspannung", "ern\u00e4hrung", "vitalwanderweg",
    "blue", "red", "green", "yellow", "black", "white", "orange", "purple", "brown", "grey", "gray",
    "blau", "rot", "gelb", "gr\u00fcn", "schwarz", "wei\u00df", "braun", "lila",
    "blauwe", "rode", "groene", "gele", "paarse", "zwarte", "witte", "oranje", "bruine", "blauw", "rood", "groen", "geel", "paars", "zwart",
    "bleu", "rouge", "vert", "jaune", "noir", "blanc", "violet", "rosso", "verde", "giallo", "nero", "blu", "azul", "rojo", "amarillo", "negro",
    "bl\u00e5", "r\u00f8d", "gr\u00f8n", "gul", "sort", "r\u00f6d", "bl\u00e5tt",
    "pi\u00f3rox", "piros", "k\u00e9k", "z\u00f6ld", "s\u00e1rga",
    "czerwony", "niebieski", "zielony", "\u017c\u00f3łty", "czarny",
    "albastru", "ro\u0219u", "verde"})
_UNIT_RE = re.compile(r"(?<![\w.])(\d+(?:[.,]\d+)?)\s*(km|h|mi|m)\b", re.IGNORECASE)
_QUOTE_CHARS = "\u201e\u201c\u201d\u00ab\u00bb\""


_SUFFIX_RE = re.compile(r", (?:[\d.]+ km|no\. \d+|#\d+|stage \d+\w*)$")


def _only_generic(text):
    """Every word of three letters or more (dedupe suffix aside) is a descriptor
    from _GENERIC_PART: the name says what kind of walk it is and not where."""
    words = [m.group(0).casefold() for m in _WORD_RE.finditer(_SUFFIX_RE.sub("", str(text or "")))]
    return bool(words) and all(w in _GENERIC_PART for w in words)


def _balanced(t):
    """Brackets and quotes pair up. A German or English double quote opens and
    closes with a mark from the same set, so those count as one run."""
    return (t.count("(") == t.count(")") and t.count("[") == t.count("]")
            and t.count('"') % 2 == 0 and t.count("\u00ab") == t.count("\u00bb")
            and (t.count("\u201e") + t.count("\u201c") + t.count("\u201d")) % 2 == 0)


def worse_reason(original, cleaned, country=None, content=True):
    """Why `cleaned` is worse than the wire's own readable name, or None (D7,
    wave 3b, judge 2). Worse is: empty; only a code; brackets or quotes
    unbalanced where the original's are balanced; a number that kept its unit
    in the original but lost it; with `content`, a word of three letters or
    more from the code-free original missing while the readable original fits
    in 42 characters. Codes, network prefixes, fixme, ALL CAPS and the dedupe
    suffix are not losses (readable has done the first four; a suffix only adds)."""
    rd = readable(original, country)
    if not rd.strip():
        return None             # a fixme-only name has no honest original
    c = str(cleaned or "").strip()
    if not c:
        return "empty"
    if is_code(c) and not is_code(rd):
        return "code_only"
    if not _balanced(c) and _balanced(rd):
        return "unbalanced"
    for num, unit in _UNIT_RE.findall(rd):
        has_num = re.search(r"(?<![\w.])" + re.escape(num) + r"(?![\w]|\.\d)", c)
        if has_num and not re.search(r"(?<![\w.])" + re.escape(num) + r"\s*" + unit + r"\b", c, re.IGNORECASE):
            return "unit_dropped"
    free = split_code(rd)[0]
    if _only_generic(c) and not _only_generic(free if free and not is_code(free) else rd):
        return "generic_only"       # no 42 character limit: a place was there and is gone
    if content and len(rd) <= TITLE_MAX:
        base = free if free and not is_code(free) else rd
        folded = squash(c)
        for m in _WORD_RE.finditer(base):
            if m.group(0).casefold() not in _NOISE_WORDS and squash(m.group(0)) not in folded:
                return "content_missing"
    return None


def _safe_name(rd):
    """The readable original as a name: itself when it fits and pairs up, else
    its quotes off, a lead code off, and the old plain word cut."""
    if len(rd) <= TITLE_MAX and _balanced(rd):
        return rd
    s = re.sub("[" + _QUOTE_CHARS + "]", "", rd)
    s = _close_brackets(re.sub(r"\s+", " ", s).strip().strip("'’ "))
    free = split_code(s)[0]
    if free and not is_code(free):
        s = free
    # A network prefix ("WNW IJsseldelta -") is a code of the walk, as in dedupe_names.
    mp = re.match(r"^[A-Z]{2,5}\s+[^-–]{1,30}?\s+[-–]\s*(?=\S)", s)
    if mp and not is_code(s[mp.end():]):
        s = s[mp.end():].strip()
        if len(s) <= TITLE_MAX:
            return s
    # Judge 3 fix 2: the first dash segment names the walk when it fits and is
    # not a code ("Le sentier de Ferrieres - Circuit pedestre n9"); when it is
    # only a descriptor, the last one ("rot - Bewegung Bad Wunnenberg").
    segs = [x.strip() for x in _DASH_SEP_RE.split(s)]
    if len(segs) > 1 and len(s) > TITLE_MAX:
        for cand in (segs[0], segs[-1]):
            if (cand and len(cand) <= TITLE_MAX and _balanced(cand) and not is_code(cand)
                    and not _only_generic(cand)):
                return cand
    bm = re.search(r"[(\[]([^()\[\]]+)[)\]]$", s)
    if bm and len(s) > TITLE_MAX and _only_generic(s[:bm.start()]):
        # "Wanderweg Nr. 12 (Schenefeld - Klovensteen - Wedel)": the bracket holds the places.
        inner = bm.group(1).strip()
        if len(inner) <= TITLE_MAX and not is_code(inner) and not _only_generic(inner):
            return inner
    toks = s.split(" ")
    while len(toks) > 1 and is_code(toks[0]) and not is_code(" ".join(toks[1:])):
        toks.pop(0)
    s = " ".join(toks)
    return s if len(s) <= TITLE_MAX else cap_title(s, safe=True)


def never_worse(original, cleaned, country=None, content=True):
    """`cleaned`, unless it is worse than the wire's own name (worse_reason):
    then the readable original, capped by the old plain rule when it does not
    fit. Pure; the last step of wire_name, of dedupe_names and of the export.
    The cleaner's own result stays when nothing better can be built."""
    if not worse_reason(original, cleaned, country, content):
        return cleaned
    safe = _safe_name(readable(original, country))
    if not safe or is_code(safe):
        return cleaned
    return safe


# ---------------------------------------------------------------------------
# D7 (wave 1, 0.4): what makes a shipped name unclean, and same-name rows
# ---------------------------------------------------------------------------

_STAGE_RE = re.compile(r"(?i)\b(etappe|stage|\u00e9tape|etapa|tappa|section|abschnitt|teil|deel|"
                       r"odcinek|\u00fasek|etap|sektion|secteur|tramo)\b")
_GENERIC_RE = re.compile(r"(?i)^(rundweg|wanderweg|rundwanderweg|wandelroute|circuit|sentier|"
                         r"sentiero|ruta|trail|route|weg|loop|walk|szlak|camino|percorso)\s*"
                         r"(nr\.?|no\.?|n\u00b0)?\s*[\w\-]{0,4}\d+\s*$")
_COLOUR_ONLY_RE = re.compile(r"(?i)^(blue|red|green|yellow|black|blau|rot|gelb|gr\u00fcn)\s*"
                             r"(bar|trail|route|weg)?\s*\d*$")
_NETWORK_CODE_RE = re.compile(r"(?i)\bE\s?\d{1,2}\b|^(GR|GRP|PR|HRP)\s?\d")
_CODE_FRAGMENT_RE = re.compile(r"[\(\[]\s*[A-Za-z]{0,4}[\s\-/.]?\d[\w\s\-/.]*[\)\]]|"
                               r"^\s*[A-Za-z]{0,4}[\s\-]?\d+[A-Za-z]?\s|"
                               r"\b[A-Z]{2,5}-[A-Z]\d{2,4}(?:_[A-Z]?\d+)?\b")


def name_problems(name):
    """The reasons a shipped trail name is unclean, [] when it is clean.

    The research classifier (2026-11-17, section 6.1), one definition for the
    replay (scripts/quality/trail_names_replay.py) and the launch gate's
    clean-name row."""
    n = str(name or "")
    if not n.strip():
        return ["empty"]
    hits = []
    if not is_latin(n) and any(c.isalpha() for c in n):
        hits.append("non_latin")
    if is_code(n):
        hits.append("code_only")
    if len(n) > TITLE_MAX:
        hits.append("too_long")
    if _GENERIC_RE.match(n):
        hits.append("generic_word_number")
    if _COLOUR_ONLY_RE.match(n):
        hits.append("colour_only")
    if _shouting(n):
        hits.append("all_caps")
    if "fixme" in n.lower():
        hits.append("fixme")
    if _NETWORK_CODE_RE.search(n):
        hits.append("network_code_in_name")
    if _STAGE_RE.search(n):
        hits.append("stage_word")
    if _CODE_FRAGMENT_RE.search(n):
        hits.append("code_fragment")
    return hits


def _sfx_code(row, original):
    return split_code(original)[1] or ""


_STAGE_CODE_RES = (re.compile(r"\b[A-Z]{2,5}-[A-Z]+0*(\d+)([A-Z]*)(?:_[A-Z]?\d+)?\b"),
                   re.compile(r"\b[A-Z]{1,4}-\d+-0*(\d+)()\b"))


def _sfx_stage(row, original):
    """A stage code read as a stage: "CSG-T002_V26" and "HW-37-02" are "stage
    2". The letters after the number are kept as a variant mark, so
    "CSG-T024VA_V24" (a variant of stage 24) is "stage 24A" and does not read
    as the same stage as "CSG-T024_V24". Rows that still share it tell apart
    on a later level."""
    for rx in _STAGE_CODE_RES:
        m = rx.search(original)
        if m:
            letters = m.group(2)
            if len(letters) > 1 and letters.startswith("V"):
                letters = letters[1:]          # "VA" is a variant, A
            return f"stage {int(m.group(1))}{letters}"
    return ""


_TO_RE = re.compile(r"\s+(?:to|nach|bis|naar|till|\u00e0)\s+", re.IGNORECASE)
_OF_RE = re.compile(r"\s+(?:di|de|del|della|von|van|du|des)\s+", re.IGNORECASE)


def _sfx_end(row, original):
    """The ways the end of the original can tell a row apart, best first; each
    is used only whole (a cut end reads as noise: "Richmond to Robin"). The
    caller takes the first that fits beside the name."""
    m = re.search(_STAGE_RE.pattern + r"\s*\.?\s*\d+[a-z]?", original, re.IGNORECASE)
    # "(Balloch to Strathblane part 1)": the stretch is the end, its part
    # number only a tail of it, so the stage shortcut does not take it.
    tb = re.search(r"\(([^()]{3,})\)\s*$", original)
    if m and not (tb and _TO_RE.search(tb.group(1))):
        return [m.group(0)]
    segs = _DASH_SEP_RE.split(original)
    end = segs[-1].strip() if len(segs) > 1 else ""
    if not end:
        # "John Muir Way (Balloch to Strathblane part 1)": the bracket is the end.
        bm = re.search(r"\(([^()]{3,})\)\s*$", original)
        if bm and not is_code(bm.group(1)):
            end = bm.group(1).strip()
    if not end and ": " in original:        # "England Coast Path: Portland to Lulworth"
        end = original.rsplit(": ", 1)[-1].strip()
    name = str(row.get("name") or "")
    if not end and name and not name.endswith("-") and original.strip().startswith(name)             and original.strip() != name:
        # What the cap cut off the name ("... Rundwanderweg Burgsinn"), only
        # when the name is a prefix at a word boundary: "Rad-, Lauf" is the
        # start of "Rad-, Lauf- und Wanderstrecke", not a name to finish.
        rest = original.strip()[len(name):]
        if rest[:1] in (" ", ",", ";", ":", "(", "["):
            end = rest.strip(" ,;:-()[]")
            end = "" if is_code(end) else end
    end = split_code(end)[0] if end else ""     # a code rides the chip, not the name
    if not end or squash(end) in squash(name):
        return []
    out = [end]
    if ", " in end:
        out.append(end.split(", ")[0])
    m = _TO_RE.search(end)
    if m and m.start() >= 3:
        x = end[:m.start()]
        pm = re.search(r"(?:part|teil|deel|partie|parte)\s*\d+[a-z]?\s*$", end, re.IGNORECASE)
        if pm:
            out.append(f"{x} {pm.group(0).strip()}")      # "Balloch part 1"
        out += [x, x.split(", ")[0]]            # "Kinlochleven to Fort William"
    parts = _OF_RE.split(end)
    if len(parts) > 1:                          # "Itinerario di Collegamento di Fiorano"
        out += [parts[-1], parts[-1].split(", ")[0]]
    seen = []
    for c in out:
        c = c.strip(" ,;:-()[]")
        if "(" in c and c.count("(") > c.count(")"):
            c = c[:c.rfind("(")].strip(" ,;:-")     # "Mechelen (variant": the closer was stripped
        if len(c) >= 3 and c not in seen and not is_code(c) and squash(c) not in squash(name):
            seen.append(c)
    return seen


def _sfx_km(row, original):
    d = row.get("distance_m")
    if not isinstance(d, (int, float)) or d <= 0:
        return ""
    km = round(d / 1000) if d >= 10000 else round(d / 1000, 1)
    return f"{km:g} km"


_BRACKET_RE = re.compile(r"[\(\[]([^()\[\]]{3,})[\)\]]\s*$|[\"\u201c\u201e\u00ab]([^\"\u201d\u201c\u00bb]{3,})[\"\u201d\u00bb]")


def _rep_tail(row, original):
    """A part of the original that can be the whole name, when the name plus
    a suffix cannot fit: the part after ": " ("Portland to Lulworth": the ref
    chip and the subtitle say it is on the England Coast Path), or a quoted or
    bracketed part ("Trilho da Alcaria", "Czarnocinskie buczyny"), which is
    the name the walk is known by."""
    if ": " in original:
        tail = original.rsplit(": ", 1)[-1].strip()
        if tail and not is_code(tail) and len(tail) <= TITLE_MAX:
            return tail
    m = _BRACKET_RE.search(original)
    if m:
        part = split_code(next(g for g in m.groups() if g).strip())[0] or ""
        if (part and not is_code(part) and 3 <= len(part) <= TITLE_MAX
                and squash(part) != squash(row.get("name"))):
            return part
    return ""


_SEG_RE = re.compile(r"\s[-–]\s|:\s")


def _fit_base(base, room, cut):
    """`base` shortened to `room`, or None. First the trailing comma parts go
    ("Roter Schmetterling, Rundwanderweg" gives way to "Burgsinn"); with `cut`,
    then trailing "A - B" and "A: B" segments (whole segments only), then
    words, but only to three or more words and 16 characters, never inside a
    hyphenated word: a start of two words or fewer is never cut."""
    if len(base) <= room:
        return base
    while len(base) > room and ", " in base:
        at = base.rfind(", ")
        if at > 0 and base[at - 1] == "-":     # "Rad-, Lauf-": one phrase, not two parts
            break
        base = base[:at]
    if len(base) <= room:
        return base
    if not cut:
        return None
    while len(base) > room:
        seps = list(_SEG_RE.finditer(base))
        if not seps:
            break
        base = base[:seps[-1].start()].rstrip(_TRAIL_PUNCT)
    if len(base) <= room:
        return base
    # D7 (wave 2, judge 2): no cut inside a phrase. A start is cut at a boundary
    # (a comma part, a bracket, a trailing "di Ivrea" phrase) or takes no suffix
    # at this level; the id level decides.
    return _boundary_head(base, room, True) or None


def _named_id(r):
    """The id as the last suffix: it is unique, so it always tells rows apart.
    "no. 123456" first, "#123456" when the name is short of two words' room."""
    base = r["name"]
    for x in (f"no. {r.get('id')}", f"#{r.get('id')}"):
        fit = _fit_base(base, TITLE_MAX - len(x) - 2, True)
        if fit:
            return fit + ", " + x
    x = f"#{r.get('id')}"
    return cap_title(base, TITLE_MAX - len(x) - 2) + ", " + x      # no word cut: a long start ships whole beside its id


def dedupe_names(rows, originals=None):
    """Make same-country rows that ship the same name tell apart.

    rows: dicts with id, country, name and distance_m (the export's wire
    items); originals: {id: the title before wire_name}. In each group of
    rows whose names fold the same (squash), every row gets a suffix from the
    first source that tells them all apart: the code split off the original
    ("Mount Korab, 9/1"), the stage or end segment of the original ("stage
    24A", used only whole), the distance ("12 km"), a quoted or bracketed
    part as the whole name, then the same levels again with the start allowed
    to lose trailing segments or words (_fit_base), the id last. A row a level
    has nothing for keeps its bare name when it is the only one in the group
    that has none ("West Highland Way" beside its stages); otherwise it takes
    its distance, then its id. Rows are taken in id order, so a re-run gives the same names; run
    on its own output it changes nothing. Mutates the rows; returns {id: new
    name}."""
    originals = originals or {}
    groups = {}
    for r in sorted(rows, key=lambda r: str(r.get("id"))):
        if r.get("name"):
            groups.setdefault((r.get("country"), squash(r["name"])), []).append(r)
    # A new name must not land on a name another row of the country has.
    taken = set(groups)
    changed = {}

    def named(r, xs, cut):
        for x in xs:
            fit = _fit_base(r["name"], TITLE_MAX - len(x) - 2, cut) if x else None
            if fit:
                return fit + ", " + x
        return None

    levels = ([(lv, False) for lv in (_sfx_code, _sfx_stage, _sfx_end)] + [("note", False)]
              + [(_sfx_km, False)]
              + [("tail", False)]
              + [(lv, True) for lv in (_sfx_code, _sfx_stage, _sfx_end, _sfx_km)]
              + [("whole", True)] + [("quoted", True)]
              + [(_named_id, True)])
    for (cc, own), rs in groups.items():
        if len(rs) < 2:
            continue
        origs = [readable(originals.get(r.get("id")) or r["name"], cc) for r in rs]
        others = taken - {(cc, own)}
        out = None
        for level, cut in levels:
            if level is _named_id:
                cand = [_named_id(r) for r in rs]
            elif level == "whole":
                # D7 (wave 4): the readable original, uncut, before an id: no word cut, so a
                # long name that told apart on its own words needs no number.
                cand = [(split_code(o)[0] or o) for o in origs]
            elif level == "note":
                # D7 (wave 3b): the cap drops a trailing "(variant)" from "A - B
                # (variant)", so it can meet its twin "A - B"; the note tells
                # them apart, as the cap kept it before. One bare row at most.
                cand = []
                for r, o in zip(rs, origs):
                    kept = ""
                    if o.endswith((")", "]")):
                        # The route's name before a comma goes whole, before a place does.
                        tail = o.split(", ", 1)[-1]
                        fits = ", " in o and len(tail) <= TITLE_MAX and not is_code(tail)
                        kept = tail if fits else cap_title(o, keep_note=True)
                    cand.append(kept if kept and squash(kept) != squash(r["name"]) else None)
                bare = [i for i, c in enumerate(cand) if not c]
                if len(bare) == 1 and len(rs) > 1:
                    cand[bare[0]] = rs[bare[0]]["name"]
            elif level == "tail":
                cand = [_rep_tail(r, o) for r, o in zip(rs, origs)]
            elif level == "quoted":
                # D7 (wave 2, judge 1 fix 2): a row with a quoted or bracketed
                # part is told apart by it, beside its generic base when that
                # fits, else as the whole name; the others take their id.
                cand = []
                for r, o in zip(rs, origs):
                    tail = _BRACKET_RE.search(o) and _rep_tail(r, o)
                    if tail:
                        cand.append(named(r, [tail], True) or tail)
                        continue
                    # Judge 3 fix 2: the readable original without its network or
                    # code prefix, when it fits, before an id ("WNW IJsseldelta -
                    # IJsselmuiden/Station Kampen - groene route").
                    up = split_code(o)[0]
                    mp = re.match(r"^[A-Z]{2,5}\s+[^-\u2013]{1,30}?\s+[-\u2013]\s*(?=\S)", o)
                    if mp:
                        up = o[mp.end():].strip()
                    cand.append(up if up and len(up) <= TITLE_MAX and not is_code(up)
                                and squash(up) != squash(r["name"]) else None)
                bare = [i for i, c in enumerate(cand) if not c]
                for i in bare:         # the only row with nothing keeps its name
                    cand[i] = rs[i]["name"] if len(bare) == 1 else _named_id(rs[i])
            else:
                sfx = [level(r, o) for r, o in zip(rs, origs)]
                cand = [named(r, x if isinstance(x, list) else [x], cut)
                        for r, x in zip(rs, sfx)]
                # The level is kept when at least half the group has
                # something real. A row it has nothing for keeps its bare name
                # when it is the only one; the others take their id.
                if sum(map(bool, cand)) * 2 >= len(rs):
                    bare = [i for i, c in enumerate(cand) if not c]
                    for i in bare:
                        # The distance beside the others' suffix is better
                        # than an id; a name that lands twice drops the level.
                        cand[i] = (rs[i]["name"] if len(bare) == 1
                                   else named(rs[i], [_sfx_km(rs[i], "")], cut)
                                   or _named_id(rs[i]))
            keys = {(cc, squash(c)) for c in cand if c}
            if all(cand) and len(keys) == len(rs) and not keys & others:
                out = cand
                break
        if out is None:         # the id is unique, so only a name another row took
            out = cand
        # D7 (wave 3b): the last step, never_worse, unless the safe name meets another
        # row's. The base cut that makes room for a suffix is the documented dedupe
        # trim, so the content test stays off here.
        final = []
        for r, new in zip(rs, out):
            safe = never_worse(originals.get(r.get("id")) or new, new, cc, content=False)
            key = (cc, squash(safe))
            if (safe != new and key != (cc, own) and key not in others
                    and key not in {(cc, squash(x)) for x in out if x != new}
                    and key not in {(cc, squash(x)) for x in final}):
                new = safe
            final.append(new)
        for r, new in zip(rs, final):
            r["name"] = new
            taken.add((cc, squash(new)))
            changed[r.get("id")] = new
    return changed


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
