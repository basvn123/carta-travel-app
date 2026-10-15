"""What a cycling card may claim, as plain functions (T455).

The T451 fact check found four ways the cycling wire said more than it knew:

  - raw OSM refs as titles: "Elberadweg rechtselbisch [Abschnitt E]",
    "Unterwegs in Mützenich [66]", "D1: Koper -> Sečovlje", a tour named "75";
  - a stretch of a long route shown as if it were the route: "Aare-Route,
    43 km" (the route runs about 300 km), two Elberadweg sections in one rail;
  - a EuroVelo shown as the sum of the sections we hold: "EV2, 2,147 km,
    3 countries" for a route of about 5,500 km through seven;
  - a tour's pace label that its own ride contradicts ("Strong, 95 to 130 km
    a day" over 91 km a day), and the same tour twice at two paces.

export_cycling.py and stage_planner.py call these when they build the wire;
repair_cycling_wire.py applies them to the wire already published, because
the rebuild needs the trailslab database and the harvest caches. One set of
rules, so the next rebuild and today's repair cannot disagree.
"""
from __future__ import annotations

import re
import unicodedata

# A name that is only a ref ("75", "(45)", "19a"); the app then composes
# "Regional route 45" in the reader's language (cycleStory.js routeTitle).
REF_ONLY_RE = re.compile(r"^\(?[A-Za-z]{0,3}[-. ]?\d{1,4}[A-Za-z]?\)?$")

# The marks of a section in a name, in the languages the wire carries.
SECTION_RE = re.compile(
    r"\[[^\]]*\]|\b(abschnitt|teil|etappe|part|stage|section|leg|"
    r"tron[cç]on|tramo|tappa|odcinek|[uú]sek|deel|del)\b\s*[\w.]*",
    re.IGNORECASE,
)

# The official EuroVelo route names (eurovelo.com). Names only: the network's
# own lengths and country counts change as routes are re-signed, and a figure
# we cannot stand behind is worse than none.
EV_NAMES = {
    "EV1": "Atlantic Coast Route",
    "EV2": "Capitals Route",
    "EV3": "Pilgrims Route",
    "EV4": "Central Europe Route",
    "EV5": "Via Romea Francigena",
    "EV6": "Atlantic to Black Sea",
    "EV7": "Sun Route",
    "EV8": "Mediterranean Route",
    "EV9": "Baltic to Adriatic",
    "EV10": "Baltic Sea Cycle Route",
    "EV11": "East Europe Route",
    "EV12": "North Sea Cycle Route",
    "EV13": "Iron Curtain Trail",
    "EV14": "Waters of Central Europe",
    "EV15": "Rhine Cycle Route",
    "EV17": "Rhone Cycle Route",
    "EV19": "Meuse Cycle Route",
}

# stage_planner.PACES, the bands the app prints with each label.
PACE_BANDS = (("relaxed", 65), ("balanced", 95), ("strong", float("inf")))


def clean_route_name(raw: str | None) -> str | None:
    """The name a reader sees, or None when what is left is only a ref.

    Bracketed refs go wherever they stand ("[Abschnitt E]", "[66]",
    "[AT|SK]"); an arrow or a spaced dash between places becomes a comma,
    the house way (no dashes in copy)."""
    s = (raw or "").strip()
    s = re.sub(r"\s*\[[^\]]*\]\s*", " ", s)
    s = re.sub(r"\s*(?:->|=>|→|›|>)\s*", ", ", s)
    s = re.sub(r"\s+[-–—]\s+", ", ", s)
    s = re.sub(r"\s*,\s*(,\s*)+", ", ", s)
    s = re.sub(r"\s{2,}", " ", s).strip(" ,-:;")
    if not s or REF_ONLY_RE.match(s) or not re.search(r"[^\W\d_]{2}", s):
        return None
    return s


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip()


def section_stem(raw: str | None) -> str:
    """The route a section belongs to: its name without the section marks."""
    return fold(SECTION_RE.sub(" ", raw or ""))


def mark_sections(rows: list[dict]) -> int:
    """Set `sec` on every row that is one stretch of a longer route.

    A stretch says so in its name ("Teil 7", "part Austria leg 1",
    "[Abschnitt E]"), or shares its country and its national or
    international ref with another row, or its name stem with another row.
    Rows are the country file's route cards (routes and listed together).
    Returns how many were marked."""
    by_ref: dict = {}
    by_stem: dict = {}
    for r in rows:
        ref = (r.get("ref") or "").strip()
        if ref and r.get("net") in ("icn", "ncn"):
            by_ref.setdefault((r.get("cc"), ref.lower()), []).append(r)
        stem = section_stem(r.get("raw_name") or r.get("name"))
        if stem:
            by_stem.setdefault((r.get("cc"), stem), []).append(r)
    n = 0
    for r in rows:
        raw = r.get("raw_name") or r.get("name") or ""
        ref = (r.get("ref") or "").strip()
        sec = bool(SECTION_RE.search(raw))
        if not sec and ref and r.get("net") in ("icn", "ncn"):
            sec = len(by_ref.get((r.get("cc"), ref.lower()), [])) > 1
        if not sec:
            stem = section_stem(raw)
            sec = bool(stem) and len(by_stem.get((r.get("cc"), stem), [])) > 1
        # A mark once set stays: the repair cleans the very words that gave
        # a stretch away ("[Abschnitt E]"), so a second run must not unmark it.
        if sec or r.get("sec"):
            r["sec"] = 1
            n += 1
    return n


def pace_for(km: float, days: int) -> str:
    """The pace band a tour actually rides, from its distance a day."""
    per_day = (km or 0) / max(days or 1, 1)
    for name, hi in PACE_BANDS:
        if per_day < hi:
            return name
    return "strong"


def tour_key(tour: dict) -> tuple:
    """Two tours are the same tour when they ride the same routes in the
    same number of days."""
    return (tuple(sorted(tour.get("routes") or [])), tour.get("days"))


def dedupe_tours(tours: list[dict]) -> list[dict]:
    """One tour per route and length, keeping the one whose pace label its
    own ride matches (the first otherwise)."""
    keep: dict = {}
    for t in tours:
        k = tour_key(t)
        if k not in keep:
            keep[k] = t
            continue
        if keep[k].get("pace") != pace_for(keep[k].get("km"), keep[k].get("days")) \
                and t.get("pace") == pace_for(t.get("km"), t.get("days")):
            keep[k] = t
    seen = set()
    out = []
    for t in tours:
        k = tour_key(t)
        if keep[k] is t and k not in seen:
            seen.add(k)
            out.append(t)
    return out
