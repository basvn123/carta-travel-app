"""Apply rich Inside Airbnb anchors to app_data.json - measured cities only.

Reads cache/accommodation_city_anchors.json (harvest_accommodation.py v2, a list
of rich per-city/island anchor records) and overwrites the accommodation block of
every destination that sits ON a covered city (within NEAR_KM of its centre,
measured from city_lat/city_lon) with that city's real listing-level data:

  <= NEAR_KM of an anchor -> "inside_airbnb_city" (level "city")
  otherwise               -> left untouched (keeps the country / PLI block the
                             notebook assigned; the long-tail + premium layers
                             refine those).

Deliberately does NOT borrow a nearby city's rate for towns that merely sit near
one: a 48 km "regional" inheritance made cheap Charleroi read as expensive
Brussels, the same fake-specificity as silently copying one city's median onto
its neighbours. Real local data or the honest modelled estimate - nothing
borrowed.

Each assigned block also carries the specificity fields the runtime reads:
  - seasonality       this city's 12-month curve (from its reviews history)
  - capacity_buckets  observed whole-home nightly per group size (2..8)
  - neighbourhoods    per-neighbourhood medians

Pipeline order:
    (notebook 03b country/PLI) -> apply_accommodation_anchors
        -> apply_longtail_granularity -> apply_tourist_premium
The later layers only touch level=="country" blocks, so measured city data is
left alone (it already reflects the local market).

Usage:
    python apply_accommodation_anchors.py             # default targets
    python apply_accommodation_anchors.py path/to.json
"""

import json
import math
import sys
from pathlib import Path
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
ANCHORS = ROOT / "cache" / "accommodation_city_anchors.json"
COUNTRY_CACHE = ROOT / "cache" / "accommodation.json"
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

NEAR_KM = 20.0      # on the city -> measured (real local data)


def haversine_km(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2):
        return None
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def city_coords(d):
    return (d.get("city_lat", d.get("lat")), d.get("city_lon", d.get("lon")))


# Keys inside `accommodation` that belong to a LATER layer, not to this one.
# build_block writes a whole new block, so without this list a re-run silently
# deletes them: re-running the step once wiped `tiers` (apply_stay_tiers.py's
# hostel and hotel prices) on 22 cities including Brussels, Barcelona, Lisbon,
# Berlin and Amsterdam. A city's dorm price is not the anchor layer's to throw
# away just because its Airbnb median was refreshed.
CARRY_OVER = ("tiers",)


def build_block(anchor, dist_km, level, prev=None):
    night = anchor["entire_home_night_eur"]
    cap = anchor["typical_capacity"]
    ppn = round(night / cap, 2)
    block = {
        "per_person_night_eur": ppn,
        "cleaning_per_person_eur": round(0.5 * ppn, 2),
        "entire_home_night_eur": round(night),
        "typical_capacity": cap,
        "level": level,
        "price_source": "inside_airbnb_city" if level == "city" else "inside_airbnb_regional",
        "n_listings": anchor.get("n_listings"),
        "captured": anchor.get("captured"),
        "source_place": anchor.get("name"),
        "source_km": round(dist_km, 1),
    }
    if anchor.get("capacity_buckets"):
        block["capacity_buckets"] = anchor["capacity_buckets"]
    if anchor.get("seasonality"):
        block["seasonality"] = anchor["seasonality"]
    # Neighbourhood detail only for a genuine on-the-city match (not a distant town).
    if level == "city" and anchor.get("neighbourhoods"):
        block["neighbourhoods"] = anchor["neighbourhoods"]
    for key in CARRY_OVER:
        if prev and prev.get(key) is not None:
            block[key] = prev[key]
    return block


def assign(dests, anchors):
    n = 0
    for d in dests.values():
        clat, clon = city_coords(d)
        if clat is None:
            continue
        near = (None, None)          # (dist, idx) of the nearest anchor
        for i, a in enumerate(anchors):
            km = haversine_km(clat, clon, a["lat"], a["lon"])
            if km is None:
                continue
            if near[0] is None or km < near[0]:
                near = (km, i)
        if near[0] is not None and near[0] <= NEAR_KM:
            d["accommodation"] = build_block(anchors[near[1]], near[0], "city",
                                             prev=d.get("accommodation"))
            n += 1
    return n


def usable_block(a):
    """False for an accommodation block whose nightly rate cannot be real."""
    if not a:
        return False
    night = a.get("entire_home_night_eur")
    if isinstance(night, (int, float)) and MIN_NIGHT_EUR <= night <= MAX_NIGHT_EUR:
        return True
    ppn = a.get("per_person_night_eur")
    return isinstance(ppn, (int, float)) and ppn > 0


def repair(dests, countries):
    """Put any unusable block back onto its country baseline.

    Dropping a bad anchor is not enough on its own: assign() only ever writes
    a block, so a destination that was poisoned on an earlier run keeps its
    zero for ever. The country baseline is the same measured Inside Airbnb
    median every destination without a city anchor already gets, and the block
    is written at level "country" so the long-tail and premium layers pick it
    up on their next pass exactly as they would any other.
    """
    repaired = []
    for did, d in dests.items():
        a = d.get("accommodation")
        if usable_block(a):
            continue
        base = countries.get(d.get("iso2"))
        if not base:
            continue
        block = {
            "per_person_night_eur": base["per_person_night_eur"],
            "cleaning_per_person_eur": base["cleaning_per_person_eur"],
            "entire_home_night_eur": base["entire_home_night_eur"],
            "typical_capacity": base["typical_capacity"],
            "level": "country",
            "price_source": base.get("source", "inside_airbnb_country"),
        }
        for key in CARRY_OVER:
            if a and a.get(key) is not None:
                block[key] = a[key]
        d["accommodation"] = block
        repaired.append((did, d.get("city"), d.get("iso2")))
    return repaired


def patch(path, anchors, countries, repair_only=False):
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    dests = data.get("destinations", {})
    n = 0 if repair_only else assign(dests, anchors)
    repaired = repair(dests, countries)
    if repair_only and not repaired:
        print(f"  {path.name}: nothing to repair")
        return
    atomic_write_json(path, data, indent=1, ensure_ascii=False)
    if not repair_only:
        print(f"  {path.name}: {n} destinations measured from Inside Airbnb (city-level)")
    if repaired:
        print(f"    repaired {len(repaired)} unusable block(s) onto the country baseline:")
        for did, city, cc in repaired:
            print(f"      {did} ({city}, {cc})")


# A nightly rate has to be a positive number to mean anything. The shipped
# catalogue is carrying proof of why this guard is needed: Geneva's anchor came
# through the harvest as 0 EUR off 991 listings, and because Geneva is the
# nearest anchor to a stretch of the Jura, that single zero was applied to
# seven destinations (Geneva, Vevey, Besancon, Ornans, Salins-les-Bains,
# Voiteur, Vuillafans). Downstream, anything that ranks on price read a zero as
# the cheapest number there is, so Geneva scored as the cheapest place in
# Europe to sleep. One bad row, seven wrong destinations, and a headline claim
# that was visibly absurd.
#
# The ceiling is deliberately loose: it is there to catch a decimal-point or
# currency error, not to second-guess Zermatt.
MIN_NIGHT_EUR = 12
MAX_NIGHT_EUR = 2000


def usable(anchor):
    """False for an anchor whose nightly rate cannot be a real price."""
    night = anchor.get("entire_home_night_eur")
    cap = anchor.get("typical_capacity")
    if not isinstance(night, (int, float)) or not (MIN_NIGHT_EUR <= night <= MAX_NIGHT_EUR):
        return False
    return isinstance(cap, (int, float)) and cap >= 1


def main():
    # A full run re-assigns every anchor AND lets the later layers re-tier off
    # the result, which moves prices on destinations that had nothing wrong
    # with them. --repair-only is the surgical door: it fixes blocks that
    # cannot be a real price and leaves every other destination untouched.
    repair_only = "--repair-only" in sys.argv
    anchors = json.loads(ANCHORS.read_text(encoding="utf-8"))
    if isinstance(anchors, dict):
        sys.exit("anchors file is the OLD dict format; re-run harvest_accommodation.py v2 first")
    # Drop the unusable anchors BEFORE the nearest-anchor search, so a broken
    # one cannot win a destination and then poison it. Its neighbours fall
    # through to the next nearest real anchor, or to the country basket.
    dropped = [a for a in anchors if not usable(a)]
    anchors = [a for a in anchors if usable(a)]
    if dropped:
        print(f"Dropped {len(dropped)} anchors with an unusable nightly rate:")
        for a in dropped:
            print(f"  {a.get('name')}: {a.get('entire_home_night_eur')} EUR "
                  f"cap {a.get('typical_capacity')} ({a.get('n_listings')} listings)")
    countries = {}
    if COUNTRY_CACHE.exists():
        countries = json.loads(COUNTRY_CACHE.read_text(encoding="utf-8")).get("countries", {})
    else:
        print("  warning: no cache/accommodation.json, unusable blocks cannot be repaired")
    targets = [Path(a) for a in sys.argv[1:] if not a.startswith("-")] or DEFAULT_TARGETS
    if repair_only:
        print("Repair only: no anchors are re-assigned.")
    else:
        n_curve = sum(1 for a in anchors if a.get("seasonality"))
        print(f"Applying {len(anchors)} rich anchors ({n_curve} with a seasonality curve):")
    for t in targets:
        patch(t, anchors, countries, repair_only=repair_only)


if __name__ == "__main__":
    main()
