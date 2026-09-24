"""One definition of what two trail names being "the same name" means.

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
