"""T911: the place page redesign's new dossier keys.

Tier: Library (called by build_dossier.py; kept out of that file so the two
stay mergeable, the same way derive_practical.py is)

Answers, per destination, the keys the redesigned destination page reads.
Every one is optional and ABSENT when there is no data ("Sections are
independently absent"):

    essentials(dest, emergency)  -> {languages, currency, tipping, plugs, volts,
                                     tap_water, emergency, source: "country"}
    eat(dest)                    -> {dishes: [{name, kind, wiki?}], source}
    walk(dest, highlights)       -> {stops: [{id, name, lat, lon, min}], km,
                                     walk_min, visit_h}
    Similar(dests).of(dest)      -> [{id, name, country, iso2, score, dist_km,
                                      why: [...]}]
    access(did)                  -> {steep, note?}
    neighbourhood_suits(did, rows) -> rows with suits: [...] merged in

Sources:
    essentials   COUNTRY_ESSENTIALS below, stable public facts per country; the
                 harvested emergency number (derive_practical, T641) wins.
    eat          cache/dossier/eat_place.json (per place, a later harvest),
                 else pipeline/dossier/eat_country.json (curated per country).
    walk         derived from the dossier's own highlights.
    similar      derived from app_data destinations.
    access       cache/dossier/access.json (placeholder, a later harvest).
    suits        cache/dossier/neighbourhood_suits.json (placeholder).

Each placeholder file is {"_about": "...", "dests": {id: ...}}, so filling one
later needs no code change.

ASCII clean, no em dashes, per project convention. Names with accents live in
the JSON data files, not here.
"""
from __future__ import annotations

import bisect
import itertools
import math
import os

from common import DCACHE, haversine_km, load_json, norm_name

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- essentials

# Per country, by ISO 3166-1 alpha-2. Languages are the national official
# languages as ISO 639-1 codes (regional co-official languages are left out:
# Basque is not what a visitor to Seville hears). Currency is ISO 4217. Plug
# types are IEC letters. Tipping is the usual custom at a sit-down meal:
#   round     round up or leave small change
#   5-10      about 5 to 10 percent for good service
#   10-15     about 10 to 15 percent is expected
#   included  service is included in the bill by law or custom
#   none      tipping is not part of the culture
# tap_water: safe (drink it), bottled (locals and guides say bottled),
# varies (safe in most cities, not everywhere, e.g. islands).
# Emergency is the number a visitor should dial; 112 works across the EU.
# A field that is genuinely uncertain is left out rather than guessed.
COUNTRY_ESSENTIALS = {
    "AD": {"languages": ["ca"], "currency": "EUR", "tipping": "round", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "AL": {"languages": ["sq"], "currency": "ALL", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "bottled"},
    "AT": {"languages": ["de"], "currency": "EUR", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "BA": {"languages": ["bs", "hr", "sr"], "currency": "BAM", "tipping": "round", "plugs": ["C", "F"], "volts": 230, "tap_water": "varies"},
    "BE": {"languages": ["nl", "fr", "de"], "currency": "EUR", "tipping": "included", "plugs": ["C", "E"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "BG": {"languages": ["bg"], "currency": "EUR", "tipping": "10-15", "plugs": ["C", "F"], "volts": 230, "tap_water": "varies", "emergency": "112"},
    "CH": {"languages": ["de", "fr", "it", "rm"], "currency": "CHF", "tipping": "included", "plugs": ["C", "J"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "CY": {"languages": ["el", "tr"], "currency": "EUR", "tipping": "5-10", "plugs": ["G"], "volts": 230, "tap_water": "varies", "emergency": "112"},
    "CZ": {"languages": ["cs"], "currency": "CZK", "tipping": "5-10", "plugs": ["C", "E"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "DE": {"languages": ["de"], "currency": "EUR", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "DK": {"languages": ["da"], "currency": "DKK", "tipping": "included", "plugs": ["C", "E", "F", "K"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "EE": {"languages": ["et"], "currency": "EUR", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "ES": {"languages": ["es"], "currency": "EUR", "tipping": "round", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "FI": {"languages": ["fi", "sv"], "currency": "EUR", "tipping": "none", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "FO": {"languages": ["fo", "da"], "currency": "DKK", "tipping": "none", "plugs": ["C", "E", "F", "K"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "FR": {"languages": ["fr"], "currency": "EUR", "tipping": "included", "plugs": ["C", "E"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "GB": {"languages": ["en"], "currency": "GBP", "tipping": "10-15", "plugs": ["G"], "volts": 230, "tap_water": "safe", "emergency": "999"},
    "GR": {"languages": ["el"], "currency": "EUR", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "varies", "emergency": "112"},
    "HR": {"languages": ["hr"], "currency": "EUR", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "HU": {"languages": ["hu"], "currency": "HUF", "tipping": "10-15", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "IE": {"languages": ["en", "ga"], "currency": "EUR", "tipping": "10-15", "plugs": ["G"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "IS": {"languages": ["is"], "currency": "ISK", "tipping": "none", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "IT": {"languages": ["it"], "currency": "EUR", "tipping": "round", "plugs": ["C", "F", "L"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "LI": {"languages": ["de"], "currency": "CHF", "tipping": "included", "plugs": ["C", "J"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "LT": {"languages": ["lt"], "currency": "EUR", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "LU": {"languages": ["lb", "fr", "de"], "currency": "EUR", "tipping": "round", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "LV": {"languages": ["lv"], "currency": "EUR", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "MC": {"languages": ["fr"], "currency": "EUR", "tipping": "included", "plugs": ["C", "E", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "MD": {"languages": ["ro"], "currency": "MDL", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "bottled", "emergency": "112"},
    # Montenegrin has no ISO 639-1 code (only cnr), so languages is left out.
    "ME": {"currency": "EUR", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "varies", "emergency": "112"},
    "MK": {"languages": ["mk", "sq"], "currency": "MKD", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "varies", "emergency": "112"},
    "MT": {"languages": ["mt", "en"], "currency": "EUR", "tipping": "5-10", "plugs": ["G"], "volts": 230, "tap_water": "varies", "emergency": "112"},
    "NL": {"languages": ["nl"], "currency": "EUR", "tipping": "round", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "NO": {"languages": ["no"], "currency": "NOK", "tipping": "round", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "PL": {"languages": ["pl"], "currency": "PLN", "tipping": "10-15", "plugs": ["C", "E"], "volts": 230, "emergency": "112"},
    "PT": {"languages": ["pt"], "currency": "EUR", "tipping": "round", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "RO": {"languages": ["ro"], "currency": "RON", "tipping": "10-15", "plugs": ["C", "F"], "volts": 230, "tap_water": "varies", "emergency": "112"},
    # Serbia's single emergency number is not settled enough to state here;
    # the T641 harvest fills it when Wikidata has it.
    "RS": {"languages": ["sr"], "currency": "RSD", "tipping": "10-15", "plugs": ["C", "F"], "volts": 230, "tap_water": "varies"},
    "SE": {"languages": ["sv"], "currency": "SEK", "tipping": "round", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "SI": {"languages": ["sl"], "currency": "EUR", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "SK": {"languages": ["sk"], "currency": "EUR", "tipping": "5-10", "plugs": ["C", "E"], "volts": 230, "tap_water": "safe", "emergency": "112"},
    "SM": {"languages": ["it"], "currency": "EUR", "tipping": "round", "plugs": ["C", "F", "L"], "volts": 230, "tap_water": "safe"},
    "XK": {"languages": ["sq", "sr"], "currency": "EUR", "tipping": "5-10", "plugs": ["C", "F"], "volts": 230, "tap_water": "bottled"},
}


def essentials(dest, emergency=None):
    """The country table, with the harvested general number preferred."""
    row = COUNTRY_ESSENTIALS.get(dest.get("iso2"))
    if not row:
        return None
    out = {k: (list(v) if isinstance(v, list) else v) for k, v in row.items()}
    em = emergency or {}
    harvested = em.get("general") or (em.get("numbers") or [None])[0]
    if harvested:
        out["emergency"] = str(harvested)
    out["source"] = "country"
    return out


# ---------------------------------------------------------------- eat

EAT_MAX = 8
EAT_KINDS = {"dish", "drink", "sweet"}
_EAT_PLACE = None
_EAT_COUNTRY = None


def _clean_dishes(rows):
    out = []
    for r in rows or []:
        if not isinstance(r, dict) or not r.get("name") or r.get("kind") not in EAT_KINDS:
            continue
        d = {"name": r["name"], "kind": r["kind"]}
        if isinstance(r.get("wiki"), str) and r["wiki"].startswith("https://"):
            d["wiki"] = r["wiki"]
        out.append(d)
    return out[:EAT_MAX]


def eat(dest):
    """Per-place dishes when the later harvest wrote them, else the country's."""
    global _EAT_PLACE, _EAT_COUNTRY
    if _EAT_PLACE is None:
        _EAT_PLACE = (load_json(os.path.join(DCACHE, "eat_place.json"), {}) or {}).get("dests") or {}
    if _EAT_COUNTRY is None:
        _EAT_COUNTRY = (load_json(os.path.join(HERE, "eat_country.json"), {}) or {}).get("countries") or {}
    rec = _EAT_PLACE.get(dest.get("id"))
    rows = _clean_dishes((rec or {}).get("dishes") if isinstance(rec, dict) else rec)
    if rows:
        return {"dishes": rows, "source": "place"}
    rows = _clean_dishes(_EAT_COUNTRY.get(dest.get("iso2")))
    if rows:
        return {"dishes": rows, "source": "country"}
    return None


# ---------------------------------------------------------------- walk

WALK_RADIUS_KM = 2.5
WALK_MAX_STOPS = 7
WALK_MIN_STOPS = 3
DETOUR = 1.3        # straight line to street distance, as beaches walkFrom
WALK_KMH = 4.5
WALK_GAP_KM = 1.5   # straight line to the nearest other stop
SIGHT_H = 0.5       # a visit per stop, used only when the place has no visit_h


def _leg_km(a, b):
    return haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) * DETOUR


def _order(stops):
    """Shortest open path through the stops, from any start (Held-Karp; at
    most 7 stops, so 2^7 x 7 x 7 steps). Ties keep the input order, which is
    best ranked first, so the build is deterministic."""
    n = len(stops)
    dist = [[_leg_km(a, b) for b in stops] for a in stops]
    best = {(1 << i, i): (0.0, None) for i in range(n)}
    for size in range(2, n + 1):
        for subset in itertools.combinations(range(n), size):
            mask = sum(1 << i for i in subset)
            for j in subset:
                prev_mask = mask ^ (1 << j)
                cand = None
                for k in subset:
                    if k == j or (prev_mask, k) not in best:
                        continue
                    c = best[(prev_mask, k)][0] + dist[k][j]
                    if cand is None or c < cand[0] - 1e-9:
                        cand = (c, k)
                best[(mask, j)] = cand
    full = (1 << n) - 1
    end = min(range(n), key=lambda j: (best[(full, j)][0], j))
    path, mask = [], full
    while end is not None:
        path.append(end)
        _, prev = best[(mask, end)]
        mask ^= 1 << end
        end = prev
    path.reverse()
    # Walk it from the end nearer the best-ranked stop's side of the list.
    if path[-1] < path[0]:
        path.reverse()
    return [stops[i] for i in path]


def _drop_outliers(stops):
    """A stop whose nearest other stop is more than WALK_GAP_KM away is a
    detour, not part of the walk; drop the worst one at a time."""
    stops = list(stops)
    while len(stops) > WALK_MIN_STOPS:
        gaps = [min(haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
                    for b in stops if b is not a) for a in stops]
        worst = max(range(len(stops)), key=lambda i: (gaps[i], i))
        if gaps[worst] <= WALK_GAP_KM:
            break
        stops.pop(worst)
    return stops


def walk(dest, highlights):
    """A day on foot: the best-ranked sights near the centre, in walking order."""
    place = dest.get("place") or {}
    if place.get("class") == "area":
        return None
    pool = [h for h in highlights or []
            if isinstance(h.get("lat"), (int, float)) and isinstance(h.get("lon"), (int, float))
            and h.get("dist_km") is not None and h["dist_km"] <= WALK_RADIUS_KM]
    pool.sort(key=lambda h: (-(h.get("rank_score") or 0), h.get("id") or ""))
    pool = _drop_outliers(pool[:WALK_MAX_STOPS])
    if len(pool) < WALK_MIN_STOPS:
        return None
    path = _order(pool)
    stops, total_km, total_min = [], 0.0, 0
    for i, h in enumerate(path):
        km = _leg_km(path[i - 1], h) if i else 0.0
        mins = round(km / WALK_KMH * 60)
        total_km += km
        total_min += mins
        stops.append({"id": h.get("id"), "name": h.get("name"),
                      "lat": h["lat"], "lon": h["lon"], "min": mins})
    walk_h = total_min / 60.0
    if place.get("visit_h"):
        visit_h = max(float(place["visit_h"]), walk_h)
    else:
        visit_h = walk_h + SIGHT_H * len(stops)
    return {"stops": stops, "km": round(total_km, 1), "walk_min": total_min,
            "visit_h": round(visit_h * 2) / 2}


# ---------------------------------------------------------------- similar

SIM_MAX = 6
SIM_MIN_KM = 100          # closer than this is a day trip, not an alternative
SIM_SCORE_BELOW = 1.5     # a candidate may score at most this much lower
SIM_PER_COUNTRY = 3
SIM_KM_PULL = 0.08        # rank lost per 1,000 km: nearer alternatives first
CHEAPER = 0.85            # day cost at most 85 percent of this one's
CLASS_ORDER = ["village", "town", "city", "metro"]
# Words that restate the class rather than the character of a place.
CLASS_WORDS = {"village", "town", "city"}


def _class_of(d):
    return (d.get("place") or {}).get("class")


def _adjacent(cls):
    if cls == "area" or cls not in CLASS_ORDER:
        return {cls}
    i = CLASS_ORDER.index(cls)
    return set(CLASS_ORDER[max(0, i - 1): i + 2])


def day_cost(d):
    """A plain day's spend for comparison only: a three star room, one mid and
    one cheap meal, two coffees. Never shown; the app prices at runtime."""
    beds = (d.get("accommodation") or {}).get("beds") or {}
    c = d.get("costs") or {}
    bed = beds.get("hotel3") or beds.get("private")
    if not bed or c.get("meal_mid_eur") is None or c.get("meal_cheap_eur") is None:
        return None
    return bed + c["meal_mid_eur"] + c["meal_cheap_eur"] + 2 * (c.get("coffee_eur") or 0)


def _cats(d):
    return frozenset(c for c in d.get("categories") or [] if c not in CLASS_WORDS)


def _likes(d):
    likes = (d.get("taste") or {}).get("likes") or {}
    out = {}
    for k, v in likes.items():
        val = v[0] if isinstance(v, list) and v else v
        if isinstance(val, (int, float)):
            out[k] = float(val)
    return out


def _cosine(a, b):
    keys = set(a) & set(b)
    if not keys:
        return 0.0
    dot = sum(a[k] * b[k] for k in keys)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0


class Similar:
    """Per-class buckets sorted by score, built once per run; a lookup scans
    only the same and adjacent classes inside the score window."""

    def __init__(self, dests):
        self.rows = {}
        buckets = {}
        for d in dests.values():
            score = (d.get("rating") or {}).get("score")
            lat = d.get("city_lat", d.get("lat"))
            lon = d.get("city_lon", d.get("lon"))
            cls = _class_of(d)
            if score is None or cls is None or not isinstance(lat, (int, float)) \
                    or not isinstance(lon, (int, float)):
                continue
            row = {"d": d, "id": d["id"], "score": float(score), "lat": lat, "lon": lon,
                   "cls": cls, "cats": _cats(d), "likes": _likes(d), "cost": day_cost(d),
                   "crowd": (d.get("crowding") or {}).get("tier")}
            self.rows[d["id"]] = row
            buckets.setdefault(cls, []).append(row)
        self.buckets = {}
        for cls, rows in buckets.items():
            rows.sort(key=lambda r: (r["score"], r["id"]))
            self.buckets[cls] = (rows, [r["score"] for r in rows])

    def of(self, dest):
        me = self.rows.get(dest.get("id"))
        if not me:
            return None
        cands = []
        for cls in _adjacent(me["cls"]):
            if cls not in self.buckets:
                continue
            rows, keys = self.buckets[cls]
            lo = bisect.bisect_left(keys, me["score"] - SIM_SCORE_BELOW)
            for r in rows[lo:]:
                if r["id"] == me["id"]:
                    continue
                inter = len(me["cats"] & r["cats"])
                union = len(me["cats"] | r["cats"])
                jac = inter / union if union else 0.0
                cos = _cosine(me["likes"], r["likes"])
                if jac < 0.34 and cos < 0.9:
                    continue
                km = haversine_km(me["lat"], me["lon"], r["lat"], r["lon"])
                if km < SIM_MIN_KM:
                    continue
                sim = 0.6 * jac + 0.4 * cos
                # A small pull towards places that score at least as well.
                rank = sim + 0.03 * (r["score"] - me["score"]) - SIM_KM_PULL * km / 1000
                cands.append((rank, r, km, jac, cos))
        cands.sort(key=lambda c: (-c[0], c[1]["id"]))
        out, per_cc = [], {}
        for rank, r, km, jac, cos in cands:
            cc = r["d"].get("iso2")
            if per_cc.get(cc, 0) >= SIM_PER_COUNTRY:
                continue
            why = []
            if me["cost"] and r["cost"] and r["cost"] <= CHEAPER * me["cost"]:
                why.append("cheaper")
            if me["crowd"] is not None and r["crowd"] is not None and r["crowd"] < me["crowd"]:
                why.append("quieter")
            if r["cls"] == me["cls"]:
                why.append("same_class")
            if jac >= 0.4 or cos >= 0.9:
                why.append("same_style")
            out.append({"id": r["id"], "name": r["d"].get("city"),
                        "country": r["d"].get("country"), "iso2": cc,
                        "score": r["score"], "dist_km": round(km), "why": why})
            per_cc[cc] = per_cc.get(cc, 0) + 1
            if len(out) >= SIM_MAX:
                break
        return out or None


# ---------------------------------------------------------------- placeholders

_ACCESS = None
_SUITS = None
SUIT_CODES = {"central", "nightlife", "quiet", "families", "food", "budget"}


def access(did):
    """Steep streets and the help on them; a later harvest fills the file."""
    global _ACCESS
    if _ACCESS is None:
        _ACCESS = (load_json(os.path.join(DCACHE, "access.json"), {}) or {}).get("dests") or {}
    rec = _ACCESS.get(did)
    if not isinstance(rec, dict) or not isinstance(rec.get("steep"), bool):
        return None
    out = {"steep": rec["steep"]}
    if rec.get("note"):
        out["note"] = str(rec["note"])
    return out


def neighbourhood_suits(did, rows):
    """Merge suits: [codes] into sleep.neighbourhoods by folded name."""
    global _SUITS
    if _SUITS is None:
        _SUITS = (load_json(os.path.join(DCACHE, "neighbourhood_suits.json"), {}) or {}).get("dests") or {}
    by_name = {norm_name(k): v for k, v in (_SUITS.get(did) or {}).items()}
    if not by_name:
        return rows
    out = []
    for n in rows:
        codes = [c for c in by_name.get(norm_name(n.get("name") or "")) or [] if c in SUIT_CODES]
        out.append({**n, "suits": codes} if codes else n)
    return out
