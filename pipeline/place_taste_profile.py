"""The place taste profile (Carta rating v5, batch R3, T762).

Every destination gets one value from 0 to 1 for each of the twelve "what do
you like" keys of the planner (planner/flow/tripSettings.js LIKES): beach,
hiking, lakes, culture, city, food, nightlife, hidden, cycling, ski,
wellness, islands. The match (R4, lib/match.js) reorders places by them and
shows why; it never changes a place's own score.

Each value starts from the vibe scores already in public/search/guided.json
and is checked against facts the catalogue has:

    beach      sea beaches within 20 km and their v5 band
    hiking     walks within 30 minutes (25 km) and their v5 band
    lakes      lakes within 30 minutes and their v5 band
    culture    UNESCO and heritage-town designations, heritage POIs, museums
    city       the place class
    food       food and drink POIs and markets (no shipped POI kind is either
               yet, so this is the food vibe alone until a source exists)
    nightlife  nightlife POIs and the place class
    hidden     hidden_gem, or low fame for the place
    cycling    cycle routes within 30 minutes and their v5 band
    ski        ski POIs, and peaks within 30 minutes with a lift to the top
    wellness   spa-town designation, sauna and thermal-bath POIs
    islands    island status (category island)

A fact under WEAK_FACT is no evidence (only Good or better nature counts,
a city's saunas count a little), and a vibe with no fact behind it counts
for nothing (a beach vibe 40 km from the sea is not a beach holiday). The checked raw value is then read as a
percentile against the frozen reference set (the reference's `taste` part),
so 0.9 means the same in Bochum and in Bergen and adding places moves nobody.

Each value keeps its fact: the short data the app's bar line shows, so the
bar and its sentence come from the same numbers, e.g.
    {"n": 14, "best": "Lago di Sorapis", "band": "excellent", "minutes": 25}
Minutes are the plan's 30-minute rule read back: straight km x 1.3 detour at
65 km/h, the same rule depth uses.

Carried along as they are: size (place.class), crowd_by_month
(crowding.monthly.tier, Eurostat), car_need (local_transport.car_needed) and
cost_level (costs.meal_mid_eur, the place's mid-range meal price; no price
tier exists in the catalogue).

Writes dest.taste into app_data/app_data.json:
    {"likes": {key: [value 0..1, fact]}, "size", "crowd_by_month",
     "car_need", "cost_level"}

Usage, from the repo root (after nature_tiers.py and poi_labels.py):
    python pipeline/place_taste_profile.py --recalibrate --version v5.0-r3
    python pipeline/place_taste_profile.py
    python pipeline/place_taste_profile.py --check   # recompute, compare

ASCII only, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import bisect
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import beauty_layer  # noqa: E402
import nature_tiers  # noqa: E402
import rating_config  # noqa: E402
from pipeline_io import atomic_write_json, load_json  # noqa: E402
from rating_config import cfg  # noqa: E402

DATA = ROOT / "app_data" / "app_data.json"
GUIDED = ROOT / "continent-app" / "public" / "search" / "guided.json"
APP_SETTINGS = ROOT / "continent-app" / "src" / "planner" / "flow" / "tripSettings.js"

LIKES = ("beach", "hiking", "lakes", "culture", "city", "food", "nightlife",
         "hidden", "cycling", "ski", "wellness", "islands")
# The vibes of guided.json each like starts from (max of them, 0 to 100).
VIBES = {"beach": ("beach",), "hiking": ("hiking", "mountain"), "lakes": ("lake",),
         "culture": ("oldtown", "art", "unesco", "castles"), "city": ("city",),
         "food": ("food",), "nightlife": ("nightlife",), "hidden": ("quiet",),
         "cycling": (), "ski": (), "wellness": ("spa",), "islands": ("island",)}
BEACH_KM = 20.0
REACH_KM = 25.0                 # 30 minutes: 25 km x 1.3 at 65 km/h
WEAK_FACT = 0.25                # under this a fact is not evidence
KNOTS = 201
# What the best nearby item says on its v5 band: only Good or better is a
# reason to come for it (a Pleasant reservoir does not make Lisbon a lake town).
BAND_Q = {"exceptional": 1.0, "excellent": 0.85, "very_good": 0.7,
          "good": 0.5, "pleasant": 0.0, None: 0.0}
GOOD_PLUS = ("exceptional", "excellent", "very_good")
# Likes whose fact source is empty catalogue-wide: the vibe is not capped,
# because the absence is ours, not the place's.
NO_FACT_SOURCE = {"food"}
# T786: a like with no vibe and no venue behind it is not measured, so it
# ships as null and the match leaves it out (lib/match.js) instead of reading
# a 0 as "nothing here". Food had only the guided vibe (Rome, Bruges and
# Salzburg read 0); nightlife had only the size class (any city read high).
UNMEASURED_WITHOUT = {"food": ("food", "markets"), "nightlife": ("venues",)}


def minutes(km):
    return int(round(km * 1.3 / 65.0 * 60.0))


def likes_in_app():
    """The LIKES array of the planner, read from the app so the two cannot
    drift: tests/test_place_taste_profile.py compares it with LIKES."""
    src = APP_SETTINGS.read_text(encoding="utf-8")
    line = next(l for l in src.splitlines() if l.startswith("export const LIKES"))
    return tuple(json.loads(line.split("=", 1)[1].strip().rstrip(";").replace("'", '"')))


# ---------------------------------------------------------------------------
# Nature items near a place
# ---------------------------------------------------------------------------

class Grid:
    """Items on a 0.25 degree grid, for "within N km" lookups."""

    def __init__(self, items):
        self.cells = defaultdict(list)
        for it in items:
            self.cells[(int(it["lat"] * 4), int(it["lon"] * 4))].append(it)

    def near(self, lat, lon, km):
        span = int(km / 25) + 1
        ci, cj = int(lat * 4), int(lon * 4)
        out = []
        for i in range(ci - span, ci + span + 1):
            for j in range(cj - span, cj + span + 1):
                for it in self.cells.get((i, j), ()):
                    d = beauty_layer._haversine_km(lat, lon, it["lat"], it["lon"])
                    if d <= km:
                        out.append((d, it))
        return out


def nature_items(kind):
    """[{lat, lon, name, band, score, lift}] for the scored rows of a kind.
    Beaches: sea beaches only; an inland bathing site is a lake or a river."""
    out = []
    for row in nature_tiers.wire_rows(kind):
        v5 = row.get("v5") or {}
        if v5.get("score") is None or (kind == "beaches" and row.get("inland")):
            continue
        if "lat" in row and "lon" in row:
            lat, lon = row["lat"], row["lon"]
        elif row.get("bbox"):
            b = row["bbox"]
            lat, lon = (b[1] + b[3]) / 2, (b[0] + b[2]) / 2
        else:
            continue
        out.append({"lat": lat, "lon": lon, "name": row.get("name") or row.get("ref"),
                    "band": v5.get("band"), "score": v5["score"],
                    "lift": (v5.get("facts") or {}).get("way_up") == "lift"})
    return out


def sea_lakes(lakes, beaches, km=0.5):
    """Lake rows that are a sea beach of the beach layer (within km): coastal
    EEA bathing sites the lake layer filed as lakes (Praia da Aguda near
    Porto, Alimos Marina in Athens). They are left out of the lakes like."""
    grid = Grid(beaches)
    return {id(it) for it in lakes if grid.near(it["lat"], it["lon"], km)}


def nature_fact(grid, lat, lon, km):
    """(0..1, fact) from the items of a kind within km: the best band counts
    most, the number of Very good or better ones the rest."""
    near = grid.near(lat, lon, km) if lat is not None else []
    if not near:
        return 0.0, {"n": 0}
    d, best = max(near, key=lambda p: (p[1]["score"], -p[0]))
    fine = sum(1 for _d, it in near if it["band"] in GOOD_PLUS)
    q = BAND_Q[best["band"]]
    value = 0.0 if q == 0 else 0.7 * q + 0.3 * min(fine, 5) / 5
    return value, {"n": len(near), "best": best["name"], "band": best["band"],
                   "minutes": minutes(d)}


# ---------------------------------------------------------------------------
# The twelve raw values
# ---------------------------------------------------------------------------

CLASS_CITY = {"metro": 1.0, "city": 0.7, "town": 0.3, "village": 0.0, "area": 0.0}


def pois_inside(dest):
    """Live POIs within the place (the radius the POI labels use)."""
    import poi_labels
    items = (dest.get("activities") or {}).get("items_full") or []
    return [items[i] for i in poi_labels.inside(dest, items)]


def category_counts(pois):
    import poi_labels
    out = defaultdict(int)
    for it in pois:
        out[it.get("category") or poi_labels.category_of(it)] += 1
    return out


def raw_values(did, dest, vibes, grids, fame_knots):
    """{like: (raw 0..1 or None, fact)} for one destination."""
    lat, lon = beauty_layer.centre(dest)
    v = (vibes.get(did) or {}).get("v") or {}
    pois = pois_inside(dest)
    cats = category_counts(pois)
    kinds = defaultdict(int)
    for it in pois:
        kinds[it.get("kind")] += 1
    designations = {d.get("kind") for d in dest.get("designations") or []
                    if isinstance(d, dict)}
    cls = (dest.get("place") or {}).get("class")
    facts = {}

    facts["beach"] = nature_fact(grids["beaches"], lat, lon, BEACH_KM)
    facts["hiking"] = nature_fact(grids["trails"], lat, lon, REACH_KM)
    facts["lakes"] = nature_fact(grids["lakes"], lat, lon, REACH_KM)
    facts["cycling"] = nature_fact(grids["cycling"], lat, lon, REACH_KM)

    heritage = sum(1 for it in pois if it.get("heritage"))
    desig = (1.0 if "unesco_whc" in designations
             else 0.7 if "heritage_town" in designations
             else 0.5 if designations & {"capital_of_culture", "unesco_tentative"} else 0.0)
    facts["culture"] = (max(desig, 0.5 * min(heritage, 20) / 20
                            + 0.5 * min(cats["museums"], 10) / 10),
                        {"unesco": "unesco_whc" in designations,
                         "heritage": heritage, "museums": cats["museums"]})
    facts["city"] = (CLASS_CITY.get(cls, 0.0), {"size": cls})
    facts["food"] = (0.5 * min(cats["food_drink"], 5) / 5 + 0.5 * min(cats["markets"], 3) / 3,
                     {"food": cats["food_drink"], "markets": cats["markets"]})
    # A night out needs a town big enough to have one; a village theatre is
    # not nightlife.
    # Venues count on their own too: Ibiza is filed as an area.
    facts["nightlife"] = (max(0.6 * CLASS_CITY.get(cls, 0.0), 0.6 * min(cats["nightlife"], 3) / 3)
                          + 0.4 * min(cats["nightlife"], 5) / 5,
                          {"venues": cats["nightlife"], "size": cls})
    rating = dest.get("rating") or {}
    fame = rating.get("fame")
    fame_pct = (None if fame is None else
                bisect.bisect_left(fame_knots, math.log1p(fame)) / (len(fame_knots) - 1))
    hidden = (1.0 if rating.get("hidden_gem")
              else 0.0 if fame_pct is None else max(0.0, 0.5 - fame_pct))
    facts["hidden"] = (hidden, {"hidden_gem": bool(rating.get("hidden_gem")),
                                "fame_pct": None if fame_pct is None else round(fame_pct, 2)})
    lifts = grids["mountains"].near(lat, lon, REACH_KM) if lat is not None else []
    lifts = [(d, it) for d, it in lifts if it["lift"]]
    ski = kinds["Skiing"]
    facts["ski"] = (0.6 * min(ski, 3) / 3 + 0.4 * min(len(lifts), 3) / 3,
                    {"ski": ski, "lifts": len(lifts),
                     "best": min(lifts, key=lambda p: p[0])[1]["name"] if lifts else None})
    spa = kinds["Sauna & baths"]
    # A spa town, or thermal baths and saunas that are a reason to come; a
    # big city's handful of saunas is not (scaled down for city and metro).
    baths = min(spa, 3) / 3 * (0.2 if cls in ("metro", "city") else 1.0)
    facts["wellness"] = (max(1.0 if "spa_town" in designations else 0.0, baths),
                         {"spa_town": "spa_town" in designations, "baths": spa})
    island = "island" in (dest.get("categories") or [])
    facts["islands"] = (1.0 if island else 0.0, {"island": island})

    out = {}
    for like in LIKES:
        fact_value, fact = facts[like]
        names = VIBES[like]
        vibe = max((v.get(n, 0) for n in names), default=None) if names else None
        vibe = None if vibe is None else vibe / 100.0
        counts = UNMEASURED_WITHOUT.get(like)
        if counts and not any(n in v for n in names) and not any(fact.get(k) for k in counts):
            out[like] = (None, fact)           # not measured (T786)
            continue
        if (like not in NO_FACT_SOURCE and fact_value < WEAK_FACT
                and (vibe is None or vibe < 0.5)):
            fact_value = 0.0                   # too thin to be evidence
        if vibe is None:
            raw = fact_value
        elif fact_value == 0 and like not in NO_FACT_SOURCE:
            raw = 0.0                          # a vibe with no fact behind it
        else:
            raw = 0.5 * vibe + 0.5 * fact_value
        out[like] = (round(raw, 6), fact)
    return out


# ---------------------------------------------------------------------------
# Frozen percentiles
# ---------------------------------------------------------------------------

def pct(x, knots):
    """Share of the reference set strictly below x (ties at the bottom stay at
    0: a place with no beach is not at the 30th beach percentile)."""
    k = len(knots) - 1
    lo = bisect.bisect_left(knots, x)
    if lo == 0:
        return 0.0
    if lo > k:
        return 1.0
    a, b = knots[lo - 1], knots[lo]
    return min(1.0, (lo - 1 + (x - a) / (b - a)) / k) if b > a else lo / k


def carried(dest):
    monthly = (dest.get("crowding") or {}).get("monthly") or {}
    months = (dest.get("climate") or {}).get("months") or []
    highs = [m.get("t_high") for m in months] if len(months) == 12 else []
    return {
        "size": (dest.get("place") or {}).get("class"),
        "crowd_by_month": monthly.get("tier"),
        "car_need": (dest.get("local_transport") or {}).get("car_needed"),
        "cost_level": (dest.get("costs") or {}).get("meal_mid_eur"),
        # T787: the mean day high per month, for the heat conflict.
        "tmax_by_month": ([None if h is None else round(h) for h in highs]
                          if highs and any(h is not None for h in highs) else None),
    }


def compute(data, frozen=None):
    """{did: taste} for every rated destination; frozen=None measures knots."""
    dests = data["destinations"]
    vibes = load_json(GUIDED).get("d") or {}
    items = {k: nature_items(k) for k in cfg("nature.kinds")}
    coastal = sea_lakes(items["lakes"], items["beaches"])
    items["lakes"] = [it for it in items["lakes"] if id(it) not in coastal]
    grids = {k: Grid(v) for k, v in items.items()}
    rated = {did: d for did, d in dests.items() if d.get("rating")}
    fame_knots = (frozen["fame_knots"] if frozen else
                  nature_tiers.knots_of([math.log1p(d["rating"]["fame"]) for d in rated.values()
                                         if d["rating"].get("fame") is not None], KNOTS))
    raw = {did: raw_values(did, d, vibes, grids, fame_knots) for did, d in rated.items()}
    knots = (frozen["knots"] if frozen else
             {like: nature_tiers.knots_of([r[like][0] for r in raw.values()
                                           if r[like][0] is not None], KNOTS)
              for like in LIKES})
    out = {}
    for did, r in raw.items():
        likes = {like: [None if r[like][0] is None else round(pct(r[like][0], knots[like]), 3),
                        r[like][1]] for like in LIKES}
        out[did] = dict({"likes": likes}, **carried(rated[did]))
    return out, {"knots": knots, "fame_knots": fame_knots}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--recalibrate", action="store_true")
    ap.add_argument("--version")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    data = load_json(DATA)
    if args.recalibrate:
        if not args.version:
            raise SystemExit("--recalibrate needs --version")
        _, measured = compute(data)
        measured["_about"] = ("Taste profile percentiles (T762): per like, the "
                              "knots of the checked raw value over the reference "
                              "set; fame_knots read the hidden like.")
        print(rating_config.write_part("taste", measured, args.version))
        return
    taste, _ = compute(data, rating_config.reference("taste"))
    if args.check:
        diffs = sum(1 for did, t in taste.items()
                    if data["destinations"][did].get("taste") != t)
        print(f"taste matches the master on {len(taste) - diffs} of {len(taste)}")
        raise SystemExit(1 if diffs else 0)
    for did, t in taste.items():
        data["destinations"][did]["taste"] = t
    print(f"taste profile for {len(taste):,} destinations")
    if not args.dry_run:
        atomic_write_json(DATA, data, indent=None, ensure_ascii=False)
        print(f"  wrote {DATA}")


if __name__ == "__main__":
    main()
