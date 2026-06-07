"""
beauty_layer.py - the "Beauty Index" data layer (schema v9).

Mirrors car_layer.py: a self-contained module that, given a destination record,
returns a `beauty` block. A composite 0-10 beauty score (rendered 1-5 gems in the
app) built from REAL, citable, free, Europe-wide signals - matching the rest of
the app's ethos (Numbeo / Inside Airbnb / Ryanair / Eurostat):

  heritage  - UNESCO World Heritage Sites within ~60 km of the destination.
              Official UNESCO DataHub list (whc001), cached coords. 1247 sites.
              https://data.unesco.org/explore/dataset/whc001/
  beach     - Blue Flag awarded-beach density of the destination's country
              (FEE programme, 2024/25 counts) gated by the destination's own
              coast/beach/island tags. https://www.blueflag.global/
  nature    - weighted scenic tags already carried in each destination's
              `categories` (fjord / alps / national-park / lake / island ...).
  iconic    - fame / curated-beauty boost: the existing `iconic` tag, a curated
              set of famously stunning European spots, and membership of the
              "Most Beautiful Villages" federations (https://lpbvt.org/).

The four components (each 0..1) are blended with documented weights plus a
"standout" bonus so a one-dimension stunner (a pure beach island, a lone fjord)
still scores high. The composite is mapped to 1-5 gems by dataset quantiles whose
cutoffs are stored in meta so the mapping is reproducible.

Everything here is ASCII-clean (no emoji/dingbats) per project convention.
"""

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
UNESCO_CACHE = os.path.join(HERE, "cache", "unesco_whc.json")

# ---------------------------------------------------------------------------
# Blue Flag awarded BEACHES per country (FEE, 2024/25 cycle). Country-level
# density proxy; gated per-destination by that place's own coast/beach/island
# tags. Source: blueflag.global + en.wikipedia.org/wiki/Blue_Flag_beach.
# ---------------------------------------------------------------------------
BLUE_FLAG_BEACHES = {
    "ES": 642, "GR": 623, "TR": 567, "IT": 525, "PT": 404, "FR": 398,
    "DK": 142, "GB": 103, "IE": 85,
    "HR": 66, "CY": 58, "NL": 57, "PL": 31, "MT": 13, "BE": 12,
    "LT": 12, "LV": 12, "SI": 11, "BG": 11, "ME": 18, "NO": 18,
    "DE": 35, "SE": 8, "RO": 5, "IS": 2, "EE": 2, "AL": 1, "FI": 1, "RS": 1,
}
# Highest national count, used to normalise the density to 0..1.
BF_MAX = 642.0

# ---------------------------------------------------------------------------
# Scenic-nature tag weights (0..1 each), summed then saturated. These tags
# already exist in each destination's `categories` (see meta.categories).
# ---------------------------------------------------------------------------
NATURE_TAG_WEIGHTS = {
    "fjord": 1.0, "northern-lights": 0.85, "arctic": 0.7, "volcanic": 0.85,
    "alps": 0.9, "mountains": 0.7, "skiing": 0.5, "national-park": 0.9,
    "lake": 0.7, "island": 0.6, "nature": 0.6, "wilderness": 0.85,
    "remote": 0.5, "valley": 0.6, "countryside": 0.4, "coast": 0.4,
    "thermal": 0.4, "fairytale": 0.5,
}

# Tag-driven part of the "iconic" component (0..1 each, summed then capped).
ICONIC_TAG_WEIGHTS = {
    "iconic": 0.8, "romantic": 0.4, "luxury": 0.3, "fairytale": 0.45,
    "medieval": 0.3, "renaissance": 0.3, "baroque": 0.25, "castle": 0.3,
    "historic": 0.2, "fortress": 0.25, "andalusia": 0.2, "basque": 0.15,
}

# ---------------------------------------------------------------------------
# Curated "famously stunning" spots (matched case-insensitively by city name)
# and Most-Beautiful-Villages federation members that appear in the catalogue.
# A hand-tuned boost so the index matches gut feeling for the postcard places.
# ---------------------------------------------------------------------------
ICONIC_CURATED = {
    # postcard-stunning, near-universally agreed
    "santorini": 1.0, "dubrovnik": 1.0, "hallstatt": 1.0, "cinque terre": 1.0,
    "bled": 0.95, "kotor": 0.95, "positano": 0.95, "amalfi": 0.9, "capri": 0.95,
    "venice": 1.0, "florence": 0.95, "rome": 0.9, "prague": 0.95, "bruges": 0.95,
    "interlaken": 0.9, "lucerne": 0.9, "zermatt": 0.95, "lauterbrunnen": 1.0,
    "bergen": 0.9, "lofoten": 1.0, "tromso": 0.8, "reykjavik": 0.8,
    "rovinj": 0.9, "split": 0.85, "hvar": 0.9, "mostar": 0.95, "sintra": 0.95,
    "porto": 0.9, "lisbon": 0.85, "seville": 0.9, "granada": 0.95, "ronda": 0.95,
    "san sebastian": 0.9, "barcelona": 0.85, "cordoba": 0.85, "toledo": 0.9,
    "nice": 0.85, "annecy": 0.95, "colmar": 0.95, "chamonix": 0.9, "carcassonne": 0.95,
    "mont saint-michel": 1.0, "giethoorn": 0.95, "salzburg": 0.9, "innsbruck": 0.85,
    "cesky krumlov": 1.0, "sibiu": 0.85, "brasov": 0.85, "sighisoara": 0.9,
    "tallinn": 0.9, "riga": 0.85, "vilnius": 0.8, "gdansk": 0.85, "krakow": 0.9,
    "bordeaux": 0.8, "edinburgh": 0.9, "oxford": 0.85, "bath": 0.9,
    "naples": 0.8, "verona": 0.85, "siena": 0.9, "matera": 0.95, "taormina": 0.95,
    "palermo": 0.8, "syracuse": 0.85, "lake como": 1.0, "como": 0.95, "bellagio": 1.0,
    "garda": 0.85, "sorrento": 0.9, "menorca": 0.85, "ibiza": 0.85, "mallorca": 0.85,
    "madeira": 0.95, "funchal": 0.9, "tenerife": 0.85, "faro": 0.8, "lagos": 0.9,
    "corfu": 0.85, "rhodes": 0.85, "crete": 0.85, "heraklion": 0.8, "chania": 0.95,
    "mykonos": 0.9, "naxos": 0.85, "zakynthos": 0.95, "kefalonia": 0.9,
    "valletta": 0.85, "budva": 0.85, "ljubljana": 0.85, "zadar": 0.85, "zagreb": 0.75,
}


# ---------------------------------------------------------------------------
# Multi-airport cities: a single city served by several Ryanair airports keeps
# one catalogue record PER airport (Paris CDG/Orly/Beauvais, London x4, ...).
# Beauty is a property of the CITY, not the airstrip, so all of a city's airport
# records must share one beauty block - otherwise the same place appears in the
# ranking several times with conflicting gem ratings (e.g. Treviso out-scoring
# Venice-Marco Polo). `dedupe_multi_airport_cities` copies the PRIMARY airport's
# beauty onto its siblings. Primary = the city's main international airport
# (curated below); the fallback heuristic is only a safety net for future cities.
# ---------------------------------------------------------------------------
CITY_PRIMARY_IATA = {
    "london": "LHR", "paris": "CDG", "rome": "FCO", "milan": "MXP",
    "venice": "VCE", "stockholm": "ARN", "oslo": "OSL", "warsaw": "WAW",
}

import re as _re


def _base_city(city):
    """Strip an airport qualifier: 'Paris (CDG)' -> 'paris'."""
    return _re.sub(r"\s*\(.*?\)\s*", "", city or "").strip().lower()


def _pick_primary(recs):
    """Choose the record that best represents the city among same-city airports."""
    base = _base_city(recs[0].get("city"))
    want = CITY_PRIMARY_IATA.get(base)
    if want:
        for r in recs:
            if r.get("iata") == want or r.get("id") == want:
                return r
    # Fallback (no curated primary): a non-anchored airport, richest data first.
    return sorted(
        recs,
        key=lambda r: (
            r.get("anchor_estimated") is True,        # real airports before anchored ones
            -len(r.get("routes") or {}),              # more routes = busier/main
            -len(r.get("categories") or []),          # richer description
            r.get("iata") or r.get("id") or "",       # deterministic tie-break
        ),
    )[0]


def dedupe_multi_airport_cities(dests):
    """Unify the beauty block across every airport record of the same city.

    Groups airport-tier records by (country, base city name); for each group of
    more than one, copies the primary airport's beauty onto the others so the
    city ranks once, consistently. Returns the list of (city, primary_iata,
    [sibling_iatas]) it unified. Call AFTER compute_beauty, BEFORE assign_gems.
    """
    import collections
    import copy

    groups = collections.defaultdict(list)
    for d in dests.values():
        if d.get("tier") != "airport":
            continue
        groups[(d.get("iso2"), _base_city(d.get("city")))].append(d)

    unified = []
    for (_iso, base), recs in groups.items():
        if len(recs) < 2:
            continue
        primary = _pick_primary(recs)
        for r in recs:
            if r is not primary:
                r["beauty"] = copy.deepcopy(primary["beauty"])
        sibs = [r.get("iata") or r.get("id") for r in recs if r is not primary]
        unified.append((base, primary.get("iata") or primary.get("id"), sibs))
    return unified


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


_UNESCO = None


def load_unesco(path=UNESCO_CACHE):
    """Lazy-load the cached UNESCO list (list of {name,lat,lon,category,iso,region})."""
    global _UNESCO
    if _UNESCO is None:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                _UNESCO = [s for s in json.load(f) if s.get("lat") is not None]
        else:
            _UNESCO = []
    return _UNESCO


def _saturate(x, k):
    """Diminishing-returns map (0..inf) -> (0..1); k = value giving ~0.63."""
    return 1.0 - math.exp(-x / k) if x > 0 else 0.0


def unesco_near(lat, lon, near_km=60.0, mid_km=120.0):
    """(full_count<=60km, weighted_raw) for sites near a point. Mid ring counts half."""
    full = 0
    raw = 0.0
    for s in load_unesco():
        d = _haversine_km(lat, lon, s["lat"], s["lon"])
        if d <= near_km:
            full += 1
            raw += 1.0
        elif d <= mid_km:
            raw += 0.4
    return full, raw


def _heritage_component(lat, lon, categories):
    full, raw = unesco_near(lat, lon)
    # A destination explicitly tagged `unesco` but with no nearby plotted site
    # (boundary/coordinate gaps) still gets credit.
    if full == 0 and "unesco" in categories:
        full, raw = 1, max(raw, 1.0)
    comp = _saturate(raw, 3.0)  # raw 3 -> .63, 6 -> .86, 10 -> .96
    has = full >= 1 or "unesco" in categories
    return comp, full, has


def _beach_component(iso2, categories):
    coastal = 1.0 if "beach" in categories else (
        0.7 if "island" in categories else (0.45 if "coast" in categories else 0.0))
    if coastal == 0.0:
        return 0.0, 0, False
    count = BLUE_FLAG_BEACHES.get(iso2, 0)
    bf_norm = min(1.0, count / 300.0)  # ~300 flags saturates the country density
    comp = coastal * (0.45 + 0.55 * bf_norm)
    top = comp >= 0.6  # strong, well-flagged beach destination
    return comp, count, top


def _nature_component(categories):
    raw = sum(NATURE_TAG_WEIGHTS.get(c, 0.0) for c in categories)
    return min(1.0, raw / 2.0)  # ~two strong scenic tags saturates


def _iconic_component(city, categories):
    base = sum(ICONIC_TAG_WEIGHTS.get(c, 0.0) for c in categories)
    key = (city or "").strip().lower()
    curated = 0.0
    for name, w in ICONIC_CURATED.items():
        if name in key or key in name and len(key) >= 4:
            curated = max(curated, w)
    return min(1.0, base * 0.6 + curated)


# Composite weights (sum to 1.0) + a standout bonus rewarding one big dimension.
WEIGHTS = {"heritage": 0.30, "nature": 0.27, "iconic": 0.28, "beach": 0.15}
STANDOUT_BONUS = 0.20


def compute_beauty(dest):
    """Return the `beauty` block for one destination record (no gems yet -
    gems are assigned dataset-wide by assign_gems once all scores are known)."""
    lat, lon = dest.get("lat"), dest.get("lon")
    cats = dest.get("categories") or []
    iso2 = dest.get("iso2")
    city = dest.get("city")

    heritage, unesco_count, has_unesco = _heritage_component(lat, lon, cats)
    beach, bf_count, top_beach = _beach_component(iso2, cats)
    nature = _nature_component(cats)
    iconic = _iconic_component(city, cats)

    comps = {"heritage": heritage, "nature": nature, "iconic": iconic, "beach": beach}
    base = sum(WEIGHTS[k] * comps[k] for k in WEIGHTS)
    # Floor: every real European city has *some* appeal; a stark 0.0 reads like
    # missing data in the UI rather than "ordinary".
    score01 = min(1.0, max(0.06, base + STANDOUT_BONUS * max(comps.values())))
    score10 = round(10.0 * score01, 1)

    return {
        "score": score10,                       # 0-10 composite (display)
        "score01": round(score01, 4),           # internal, for gem quantiles
        "gems": None,                           # filled by assign_gems()
        "unesco_count": unesco_count,           # WHS within ~60 km
        "unesco": bool(has_unesco),             # powers the UNESCO filter button
        "blue_flag_country": bf_count,          # national Blue Flag beach count
        "top_beach": bool(top_beach),           # powers the Top-beaches button
        "components": {k: round(v, 3) for k, v in comps.items()},
        "source": "composite_v1",
    }


def assign_gems(beauty_blocks):
    """Map score01 -> 1..5 gems by quantile so the catalogue spreads well.
    Mutates each block's `gems`, returns the cutoff list (stored in meta).

    The cutoffs are dataset quantiles (reproducible, evidence-based on the score
    distribution) tuned for a balanced, *usable* spread rather than a steep
    pyramid - so the rating filter returns a meaningful number of places at every
    tier instead of a near-empty top end:

        1 gem  : bottom 20%      2 gems : 20-45% (25%)    3 gems : 45-72% (27%)
        4 gems : 72-90% (18%)    5 gems : top 10%
    """
    scores = sorted(b["score01"] for b in beauty_blocks)
    n = len(scores)
    if n == 0:
        return []
    # cutoffs: indices into the sorted distribution
    cut = {
        "g2": scores[int(0.20 * (n - 1))],
        "g3": scores[int(0.45 * (n - 1))],
        "g4": scores[int(0.72 * (n - 1))],
        "g5": scores[int(0.90 * (n - 1))],
    }
    for b in beauty_blocks:
        s = b["score01"]
        if s >= cut["g5"]:
            b["gems"] = 5
        elif s >= cut["g4"]:
            b["gems"] = 4
        elif s >= cut["g3"]:
            b["gems"] = 3
        elif s >= cut["g2"]:
            b["gems"] = 2
        else:
            b["gems"] = 1
    return cut


BEAUTY_MODEL = {
    "weights": WEIGHTS,
    "standout_bonus": STANDOUT_BONUS,
    "components": {
        "heritage": "UNESCO World Heritage Sites within ~60 km (mid ring 60-120 km at 0.4); saturating",
        "beach": "Blue Flag national beach density gated by the destination's coast/beach/island tags",
        "nature": "weighted scenic categories (fjord/alps/national-park/lake/island/...)",
        "iconic": "iconic tag + curated famously-stunning spots + Most Beautiful Villages members",
    },
    "scale": "score 0-10; gems 1-5 by dataset quantiles (cutoffs in gem_cutoffs)",
    "sources": {
        "unesco": "https://data.unesco.org/explore/dataset/whc001/ (1247 sites, cached)",
        "blue_flag": "https://www.blueflag.global/ + en.wikipedia.org/wiki/Blue_Flag_beach (2024/25)",
        "most_beautiful_villages": "https://lpbvt.org/",
    },
}
