"""Apply harvested Inside Airbnb city/island anchors to app_data.json.

Reads cache/accommodation_city_anchors.json (harvest_accommodation.py) and
replaces the matched destinations' accommodation block with a city-level
anchor, using the exact field convention the notebook's rec() helper
established (per-person = whole-home median / typical capacity; cleaning =
half a per-person night; runtime applies seasonality/discount/fees on top).

Destinations that previously carried a tourist-premium markup on a
country-scaled block lose it here (real local data supersedes the estimate);
run apply_tourist_premium.py afterwards to keep the remaining premiums
consistent.

Pipeline order:
    harvest_accommodation -> apply_accommodation_anchors -> apply_tourist_premium

Usage:
    python apply_accommodation_anchors.py            # default targets
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ANCHORS = ROOT / "cache" / "accommodation_city_anchors.json"
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]


def patch(path: Path, anchors: dict) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    dests = data.get("destinations", {})
    n = 0
    for did, rec in anchors.items():
        dest = dests.get(did)
        if not dest:
            continue
        night = rec["entire_home_night_eur"]
        cap = rec["typical_capacity"]
        ppn = round(night / cap, 2)
        dest["accommodation"] = {
            "per_person_night_eur": ppn,
            "cleaning_per_person_eur": round(0.5 * ppn, 2),
            "entire_home_night_eur": round(night),
            "typical_capacity": cap,
            "level": "city",
            "price_source": "inside_airbnb_city",
            "n_listings": rec.get("n_listings"),
            "captured": rec.get("captured"),
        }
        n += 1
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False),
                    encoding="utf-8")
    print(f"  {path.name}: {n} destinations re-anchored from Inside Airbnb")


def main() -> None:
    anchors = json.loads(ANCHORS.read_text(encoding="utf-8"))
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print(f"Applying {len(anchors)} Inside Airbnb city anchors:")
    for t in targets:
        patch(t, anchors)


if __name__ == "__main__":
    main()
