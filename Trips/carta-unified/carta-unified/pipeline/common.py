"""Shared normalization helpers for the Carta unification pipeline."""
from __future__ import annotations

import re
import unicodedata

# ---------------------------------------------------------------- trip types

TRIP_TYPES = [
    (1, "Cycling Trips", "cycling"),
    (2, "Trail Running", "trail-running"),
    (3, "City Trips", "city"),
    (4, "Cozy Towns Trips", "cozy-towns"),
    (5, "Road Trips & Scenic Drives", "road-trip"),
    (6, "Hiking & Alpine Trekking", "hiking"),
    (7, "Culinary & Wine Tours", "culinary"),
    (8, "Winter Sports & Skiing", "winter-sports"),
    (9, "Nature Escapes & Cabin Stays", "nature-escape"),
    (10, "Water Sports & Coastal Trips", "water-sports"),
]

_TYPE_BY_ID = {i: (name, slug) for i, name, slug in TRIP_TYPES}

# every spelling seen across the four source batches -> canonical id
_TYPE_ALIASES = {
    "cycling trips": 1, "cycling": 1,
    "trail running": 2, "trail_running": 2, "trail-running": 2,
    "city trips": 3, "city": 3,
    "cozy towns trips": 4, "cozy towns": 4, "cozy_towns": 4, "cosy towns trips": 4,
    "road trips & scenic drives": 5, "road trips and scenic drives": 5,
    "road_trip": 5, "road trip": 5, "road trips": 5,
    "hiking & alpine trekking": 6, "hiking and alpine trekking": 6,
    "hiking_trekking": 6, "hiking": 6, "alpine trekking": 6,
    "culinary & wine tours": 7, "culinary and wine tours": 7,
    "culinary_wine": 7, "culinary": 7, "wine": 7,
    "winter sports & skiing": 8, "winter sports and skiing": 8,
    "winter_sports": 8, "winter sports": 8, "skiing": 8,
    "nature escapes & cabin stays": 9, "nature escapes and cabin stays": 9,
    "nature_cabin": 9, "nature escapes": 9, "nature escape": 9,
    "water sports & coastal trips": 10, "water sports and coastal trips": 10,
    "water_sports": 10, "water sports": 10, "coastal": 10,
}


def canonical_trip_type(raw: str):
    """-> (trip_type_id, canonical name, slug). Raises on an unknown spelling."""
    key = (raw or "").strip().lower().replace("—", "-")
    key = key.replace("&amp;", "&")
    if key in _TYPE_ALIASES:
        tid = _TYPE_ALIASES[key]
    else:
        tid = None
        for alias, candidate in _TYPE_ALIASES.items():
            if alias in key:
                tid = candidate
                break
    if tid is None:
        raise ValueError(f"unmapped trip type: {raw!r}")
    name, slug = _TYPE_BY_ID[tid]
    return tid, name, slug


# ------------------------------------------------------------------ regions

REGIONS = {
    "western-central": "Western & Central Europe",
    "southern-mediterranean": "Southern & Mediterranean Europe",
    "eastern-southeastern": "Eastern & Southeastern Europe",
    "northern-baltics": "Northern Europe & Baltics",
}

# ---------------------------------------------------------------- countries

COUNTRY_CODES = {
    "Albania": "AL", "Andorra": "AD", "Austria": "AT", "Belgium": "BE",
    "Bosnia and Herzegovina": "BA", "Bulgaria": "BG", "Croatia": "HR",
    "Czechia": "CZ", "Denmark": "DK", "Estonia": "EE", "Faroe Islands": "FO",
    "Finland": "FI", "France": "FR", "Germany": "DE", "Greece": "GR",
    "Hungary": "HU", "Ireland": "IE", "Italy": "IT", "Kosovo": "XK",
    "Latvia": "LV", "Liechtenstein": "LI", "Lithuania": "LT",
    "Luxembourg": "LU", "Moldova": "MD", "Monaco": "MC", "Montenegro": "ME",
    "Netherlands": "NL", "North Macedonia": "MK", "Norway": "NO",
    "Poland": "PL", "Portugal": "PT", "Romania": "RO", "San Marino": "SM",
    "Serbia": "RS", "Slovakia": "SK", "Slovenia": "SI", "Spain": "ES",
    "Sweden": "SE", "Switzerland": "CH",
}

_COUNTRY_ALIASES = {
    "bosnia & herzegovina": "Bosnia and Herzegovina",
    "bosnia": "Bosnia and Herzegovina",
    "czech republic": "Czechia",
    "the netherlands": "Netherlands",
    "macedonia": "North Macedonia",
}

COUNTRY_REGION = {
    # Western & Central
    "AT": "western-central", "BE": "western-central", "CH": "western-central",
    "CZ": "western-central", "DE": "western-central", "FR": "western-central",
    "LI": "western-central", "LU": "western-central", "MC": "western-central",
    "NL": "western-central",
    # Southern & Mediterranean
    "AD": "southern-mediterranean", "AL": "southern-mediterranean",
    "BA": "southern-mediterranean", "ES": "southern-mediterranean",
    "GR": "southern-mediterranean", "HR": "southern-mediterranean",
    "IT": "southern-mediterranean", "ME": "southern-mediterranean",
    "MK": "southern-mediterranean", "PT": "southern-mediterranean",
    "RS": "southern-mediterranean", "SI": "southern-mediterranean",
    "SM": "southern-mediterranean", "XK": "southern-mediterranean",
    # Eastern & Southeastern
    "BG": "eastern-southeastern", "HU": "eastern-southeastern",
    "MD": "eastern-southeastern", "PL": "eastern-southeastern",
    "RO": "eastern-southeastern", "SK": "eastern-southeastern",
    # Northern & Baltics
    "DK": "northern-baltics", "EE": "northern-baltics", "FI": "northern-baltics",
    "FO": "northern-baltics", "IE": "northern-baltics", "LT": "northern-baltics",
    "LV": "northern-baltics", "NO": "northern-baltics", "SE": "northern-baltics",
}


def split_countries(raw: str):
    """'Montenegro & Bosnia and Herzegovina' -> ['Montenegro', 'Bosnia and Herzegovina']."""
    raw = (raw or "").strip()
    if not raw:
        return []
    parts = [raw]
    # only split on ' & ' / ' and ' when both halves resolve to known countries
    for sep in (" & ", " and ", " / ", ", "):
        if sep in raw:
            candidate = [p.strip() for p in raw.split(sep)]
            if all(normalize_country(p) for p in candidate):
                parts = candidate
                break
    return [normalize_country(p) for p in parts if normalize_country(p)]


def normalize_country(raw: str):
    if not raw:
        return None
    name = raw.strip()
    if name in COUNTRY_CODES:
        return name
    low = name.lower()
    if low in _COUNTRY_ALIASES:
        return _COUNTRY_ALIASES[low]
    for known in COUNTRY_CODES:
        if known.lower() == low:
            return known
    return None


# -------------------------------------------------------------------- money

_NUM = r"[\d][\d.,]*"


def _to_int(token: str):
    token = token.replace(",", "").replace(".", "").strip()
    if not token:
        return None
    try:
        return int(token)
    except ValueError:
        return None


def parse_eur_range(text: str):
    """Pull the first euro range out of free text.

    '€280–€520 (€40–€75/night)' -> (280, 520)
    '€935' -> (935, 935)
    Returns (low, high) or (None, None).
    """
    if not text:
        return (None, None)
    t = str(text).replace("–", "-").replace("—", "-").replace("−", "-")
    m = re.search(rf"€\s*({_NUM})\s*-\s*€?\s*({_NUM})", t)
    if m:
        return (_to_int(m.group(1)), _to_int(m.group(2)))
    m = re.search(rf"({_NUM})\s*-\s*({_NUM})\s*€", t)
    if m:
        return (_to_int(m.group(1)), _to_int(m.group(2)))
    m = re.search(rf"€\s*({_NUM})", t)
    if m:
        v = _to_int(m.group(1))
        return (v, v)
    return (None, None)


TIER_ORDER = {"€": 1, "€€": 2, "€€€": 3}
TIER_BY_RANK = {1: "€", 2: "€€", 3: "€€€"}


def parse_budget_tier(raw: str):
    """'€–€€' -> ('€', 1, 2, '€–€€'). Returns (tier, rank_low, rank_high, raw)."""
    if not raw:
        return (None, None, None, None)
    original = str(raw).strip().strip('"')
    tokens = re.findall(r"€+", original)
    ranks = [TIER_ORDER.get(t) for t in tokens if TIER_ORDER.get(t)]
    if not ranks:
        return (None, None, None, original)
    lo, hi = min(ranks), max(ranks)
    return (TIER_BY_RANK[lo], lo, hi, original)


# ------------------------------------------------------------------- months

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
_MONTH_INDEX = {m.lower(): i + 1 for i, m in enumerate(MONTHS)}
_MONTH_INDEX.update({m.lower()[:3]: i + 1 for i, m in enumerate(MONTHS)})


def months_from_text(text: str):
    """Extract calendar months mentioned in free text, expanding 'March–June' ranges."""
    if not text:
        return []
    t = str(text).replace("–", "-").replace("—", "-")
    found = []
    # expand explicit ranges first
    for a, b in re.findall(r"([A-Z][a-z]+)\s*-\s*(?:early |mid[- ]|late )?([A-Z][a-z]+)", t):
        ai, bi = _MONTH_INDEX.get(a.lower()), _MONTH_INDEX.get(b.lower())
        if ai and bi:
            i = ai
            while True:
                found.append(i)
                if i == bi:
                    break
                i = i % 12 + 1
                if len(found) > 24:
                    break
    for token in re.findall(r"[A-Za-z]+", t):
        idx = _MONTH_INDEX.get(token.lower())
        if idx:
            found.append(idx)
    seen, out = set(), []
    for i in sorted(set(found)):
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def month_names(nums):
    return [MONTHS[n - 1] for n in nums if 1 <= n <= 12]


# --------------------------------------------------------------- difficulty

FITNESS_LEVELS = ["Easy", "Moderate", "Active", "Demanding", "Expert"]
_SCORE_TO_LEVEL = {1: "Easy", 2: "Moderate", 3: "Active", 4: "Demanding", 5: "Expert"}
_WORD_TO_SCORE = {
    "easy": 1, "very easy": 1,
    "easy-moderate": 2, "easy to moderate": 2, "moderate-easy": 2,
    "moderate": 3, "active": 3,
    "moderate-hard": 4, "hard": 4, "demanding": 4, "challenging": 4,
    "hard-expert": 5, "expert": 5, "extreme": 5, "very hard": 5,
}


def parse_difficulty(raw):
    """Accepts 4, '4/5', '2 - text', 'Moderate-Hard', 'Easy-moderate. 105 km...'.

    Returns (score int|None, label str|None, note str|None).
    """
    if raw is None:
        return (None, None, None)
    if isinstance(raw, int):
        return (raw, _SCORE_TO_LEVEL.get(raw), None)
    text = str(raw).strip()
    note = text
    t = text.replace("–", "-").replace("—", "-")
    m = re.match(r"\s*(\d)\s*(?:/\s*5)?", t)
    if m:
        score = int(m.group(1))
        if 1 <= score <= 5:
            return (score, _SCORE_TO_LEVEL.get(score), note)
    head = re.split(r"[.,;(]", t)[0].strip().lower()
    head = head.replace(" – ", "-").replace(" - ", "-").replace("–", "-")
    if head in _WORD_TO_SCORE:
        score = _WORD_TO_SCORE[head]
        return (score, _SCORE_TO_LEVEL[score], note)
    for word, score in sorted(_WORD_TO_SCORE.items(), key=lambda kv: -len(kv[0])):
        if word in t.lower():
            return (score, _SCORE_TO_LEVEL[score], note)
    return (None, None, note)


# ------------------------------------------------------------------- slugs

def slugify(text: str, maxlen: int = 60):
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    if len(text) > maxlen:
        text = text[:maxlen].rstrip("-")
    return text


# ------------------------------------------------------------ misc helpers

VERIFY_RE = re.compile(r"\[VERIFY:\s*([^\]]+)\]")


def extract_verify_flags(text: str):
    return [m.strip() for m in VERIFY_RE.findall(text or "")]


def clean(text):
    if text is None:
        return None
    if not isinstance(text, str):
        return text
    return re.sub(r"[ \t]+", " ", text).strip()


LOGISTICS_KEYS = {
    "connectivity": "connectivity",
    "phone signal": "connectivity",
    "signal": "connectivity",
    "emergency": "emergency",
    "emergency & rescue": "emergency",
    "emergency and rescue": "emergency",
    "rescue": "emergency",
    "safety": "health",
    "health": "health",
    "health & safety specifics": "health",
    "health and safety": "health",
    "weather volatility": "weather",
    "weather": "weather",
    "booking windows": "bookingWindows",
    "booking window": "bookingWindows",
    "booking": "bookingWindows",
    "money & payments": "money",
    "money and payments": "money",
    "money": "money",
    "payments": "money",
    "transport rules": "transportRules",
    "rules of the road": "transportRules",
    "transport": "transportRules",
    "getting there": "gettingThere",
    "permits & regulations": "permits",
    "permits, fees & regulations": "permits",
    "permits and regulations": "permits",
    "permits": "permits",
    "regulations": "permits",
}


def bucket_logistics(label: str):
    key = (label or "").strip().rstrip(":.").lower()
    if key in LOGISTICS_KEYS:
        return LOGISTICS_KEYS[key]
    for alias, canon in LOGISTICS_KEYS.items():
        if alias in key:
            return canon
    return None
