"""Apply hostel + hotel city anchors as stay tiers on app_data.json.

Reads cache/hostel_city_anchors.json (harvest_hostelworld.py) and
cache/hotel_city_anchors.json (harvest_hotels_liteapi.py) and writes an
`accommodation.tiers` block onto every destination that sits ON a measured city
(<= NEAR_KM of its centre, city_lat/city_lon first), the same city-only rule as
apply_accommodation_anchors.py: real local data or nothing, no neighbour's
number borrowed onto a town it wasn't measured in.

  "tiers": {
    "dorm_pp_night_eur": 18.4,       # cheapest-dorm median, PER PERSON
    "private_room_night_eur": 55.0,  # hostel/guesthouse private double, PER ROOM
    "hotel_night_eur": 78.0,         # unstarred hotel double, PER ROOM (Hostelworld)
    "hotel3_night_eur": 92.0,        # 3-star double, PER ROOM
    "hotel4_night_eur": 128.0,       # 4-star double, PER ROOM
    "hotel5_night_eur": 210.0,       # 5-star double, PER ROOM
    "n_hostels": 14, "n_hotels": 52,
    "src": "hostelworld+liteapi",    # or "fixture" during dev
    "captured": "2026-07-28"
  }

All figures are ANNUAL medians; the runtime seasons them with the same curve it
already uses for the Airbnb anchor (runtime_pricing.js accommodationPerPerson).
The tiers block rides ON the accommodation block: a destination with no
accommodation anchor at all keeps none (nothing to fall back to in the UI).

Idempotent: every existing tiers block is stripped first, then re-assigned, so
a re-run after a re-harvest never leaves stale tiers behind.

Not-real-price guard: anchors marked src="fixture" (dev data from --fixtures
harvests) or src="liteapi_sandbox" (LiteAPI test rates, served to sand_* keys)
are REFUSED unless --allow-fixtures is passed, so a scheduled pipeline run can
never ship invented or test prices as if they were measured.

Usage:
    python pipeline/apply_stay_tiers.py                  # real anchors only
    python pipeline/apply_stay_tiers.py --allow-fixtures # dev: fixture anchors ok
    python pipeline/apply_stay_tiers.py --strip          # remove ALL tiers blocks
    python pipeline/apply_stay_tiers.py path/to.json     # explicit target(s)
"""

import argparse
import json
import math
from pathlib import Path
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
HOSTELS = ROOT / "cache" / "hostel_city_anchors.json"
HOTELS = ROOT / "cache" / "hotel_city_anchors.json"
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

NEAR_KM = 20.0


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


# Anchor sources that are NOT the real market: dev fixtures and API sandbox
# (test) rates. Both are refused unless the run explicitly opts in.
UNSHIPPABLE = {"fixture": "FIXTURE (hand-typed dev data)",
               "liteapi_sandbox": "SANDBOX (LiteAPI test rates, not the market)"}


def load_anchors(path, allow_fixtures):
    if not path.exists():
        print(f"  no anchors at {path.name} (run its harvester first); skipping that source")
        return []
    anchors = json.loads(path.read_text(encoding="utf-8"))
    bad = [a for a in anchors if a.get("src") in UNSHIPPABLE]
    if bad and not allow_fixtures:
        kinds = sorted({UNSHIPPABLE[a["src"]] for a in bad})
        raise SystemExit(
            f"{path.name} holds {len(bad)} anchors that are not real prices: {'; '.join(kinds)}. "
            "Re-harvest with production credentials, or pass --allow-fixtures for a dev run.")
    return anchors


def nearest(anchors, lat, lon):
    best = (None, None)
    for a in anchors:
        km = haversine_km(lat, lon, a["lat"], a["lon"])
        if km is not None and (best[0] is None or km < best[0]):
            best = (km, a)
    return best


def build_tiers(hostel, hotel):
    tiers, srcs = {}, []
    if hostel:
        if hostel.get("dorm_pp_night_eur"):
            tiers["dorm_pp_night_eur"] = hostel["dorm_pp_night_eur"]
        if hostel.get("private_room_night_eur"):
            tiers["private_room_night_eur"] = hostel["private_room_night_eur"]
        if hostel.get("hotel_night_eur"):
            tiers["hotel_night_eur"] = hostel["hotel_night_eur"]
        if hostel.get("n_hostels"):
            tiers["n_hostels"] = hostel["n_hostels"]
        srcs.append(hostel.get("src") or "hostelworld")
    if hotel:
        for star in (3, 4, 5):
            v = hotel.get(f"hotel{star}_night_eur")
            if v:
                tiers[f"hotel{star}_night_eur"] = v
        if hotel.get("n_hotels"):
            tiers["n_hotels"] = hotel["n_hotels"]
        srcs.append(hotel.get("src") or "liteapi")
    if not any(k.endswith("_eur") for k in tiers):
        return None
    # Any unshippable ingredient taints the block: label it by that, so a
    # tiers block never reads as measured when part of it is test data.
    tainted = next((s for s in srcs if s in UNSHIPPABLE), None)
    tiers["src"] = tainted or "+".join(srcs)
    tiers["captured"] = (hostel or hotel).get("captured")
    return tiers


def assign(dests, hostel_anchors, hotel_anchors):
    n_added = n_cleared = 0
    for d in dests.values():
        acc = d.get("accommodation")
        if isinstance(acc, dict) and "tiers" in acc:
            del acc["tiers"]
            n_cleared += 1
        if not isinstance(acc, dict):
            continue           # tiers ride on the accommodation block
        clat, clon = city_coords(d)
        if clat is None:
            continue
        h_km, h_a = nearest(hostel_anchors, clat, clon)
        o_km, o_a = nearest(hotel_anchors, clat, clon)
        hostel = h_a if h_km is not None and h_km <= NEAR_KM else None
        hotel = o_a if o_km is not None and o_km <= NEAR_KM else None
        tiers = build_tiers(hostel, hotel)
        if tiers:
            acc["tiers"] = tiers
            n_added += 1
    return n_added, n_cleared


TIER_KEYS = [("dorm", "dorm_pp_night_eur"), ("private", "private_room_night_eur"),
             ("hotel", "hotel_night_eur"), ("hotel3", "hotel3_night_eur"),
             ("hotel4", "hotel4_night_eur"), ("hotel5", "hotel5_night_eur")]


def available_tiers(dests):
    """Which tiers are measured ANYWHERE in the catalogue. The UI reads this so
    it only ever offers a choice some destination can actually price: with only
    Hostelworld credentials there are no star tiers to show, and an empty
    picker entry is worse than a shorter picker."""
    found = []
    for slug, key in TIER_KEYS:
        if any((d.get("accommodation") or {}).get("tiers", {}).get(key)
               for d in dests.values()):
            found.append(slug)
    return found


def patch(path, hostel_anchors, hotel_anchors):
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    dests = data.get("destinations", {})
    n_added, n_cleared = assign(dests, hostel_anchors, hotel_anchors)
    tiers = available_tiers(dests)
    data.setdefault("meta", {})["stay_tiers_available"] = tiers
    atomic_write_json(path, data, indent=1, ensure_ascii=False)
    print(f"  {path.name}: stay tiers on {n_added} destinations "
          f"({n_cleared} prior blocks reset); measured tiers: {tiers or 'none'}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-fixtures", action="store_true",
                    help="accept src=fixture anchors (dev only, never scheduled)")
    ap.add_argument("--strip", action="store_true",
                    help="remove every tiers block (undo a dev fixture apply)")
    ap.add_argument("targets", nargs="*", help="explicit target json files")
    args = ap.parse_args()

    if args.strip:
        for t in [Path(x) for x in args.targets] or DEFAULT_TARGETS:
            if not t.exists():
                continue
            data = json.loads(t.read_text(encoding="utf-8"))
            _, n_cleared = assign(data.get("destinations", {}), [], [])
            atomic_write_json(t, data, indent=1, ensure_ascii=False)
            print(f"  {t.name}: stripped {n_cleared} tiers blocks")
        return

    hostel_anchors = load_anchors(HOSTELS, args.allow_fixtures)
    hotel_anchors = load_anchors(HOTELS, args.allow_fixtures)
    if not hostel_anchors and not hotel_anchors:
        print("no anchors from either source; nothing to apply.")
        return
    targets = [Path(t) for t in args.targets] or DEFAULT_TARGETS
    print(f"Applying {len(hostel_anchors)} hostel + {len(hotel_anchors)} hotel city anchors:")
    for t in targets:
        patch(t, hostel_anchors, hotel_anchors)


if __name__ == "__main__":
    main()
