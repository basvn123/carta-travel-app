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

ROOT = Path(__file__).resolve().parents[1]
ANCHORS = ROOT / "cache" / "accommodation_city_anchors.json"
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


def build_block(anchor, dist_km, level):
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
            d["accommodation"] = build_block(anchors[near[1]], near[0], "city")
            n += 1
    return n


def patch(path, anchors):
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    dests = data.get("destinations", {})
    n = assign(dests, anchors)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"  {path.name}: {n} destinations measured from Inside Airbnb (city-level)")


def main():
    anchors = json.loads(ANCHORS.read_text(encoding="utf-8"))
    if isinstance(anchors, dict):
        sys.exit("anchors file is the OLD dict format; re-run harvest_accommodation.py v2 first")
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    n_curve = sum(1 for a in anchors if a.get("seasonality"))
    print(f"Applying {len(anchors)} rich anchors ({n_curve} with a seasonality curve):")
    for t in targets:
        patch(t, anchors)


if __name__ == "__main__":
    main()
