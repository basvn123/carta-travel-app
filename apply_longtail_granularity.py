"""Long-tail within-country granularity for accommodation (schema v16).

The problem this addresses: ~1,250 destinations still carry their COUNTRY's
single accommodation rate (either a real Inside Airbnb country median or, for
markets with no Inside Airbnb coverage at all - Poland, Croatia, the Nordics,
the Baltics, the Balkans - a Eurostat-PLI estimate). So today every Polish town
prices at exactly EUR 15.19 pp/night, Warsaw (1.7M people) the same as a village.

There is NO open, sub-national lodging-price dataset to fix this with real data
(Eurostat PLI is country-level; Booking.com forbids scraping). The one honest
signal already in the catalogue is SETTLEMENT SIZE (dest.geonames.population):
Airbnb rates track city size within a country. So this applies a gentle,
capped, clearly-labelled population tier to the country/PLI base - a MODELLED
refinement, not measured data, and marked as such (price_source gains "+pop",
level stays "country", a settlement_tier + pop_factor are recorded).

Scope guard: only touches level=="country" blocks whose source is a country
median or PLI estimate. Measured/regional Inside Airbnb blocks (real local data)
are never touched.

Idempotent: the pre-tier values are stashed under `longtail_base` on first run
and every rerun recomputes from those.

Pipeline order:
    (notebook country/PLI) -> apply_accommodation_anchors
        -> apply_longtail_granularity -> apply_tourist_premium

Usage:
    python apply_longtail_granularity.py                 # default targets
    python apply_longtail_granularity.py --dry           # report only, no write
    python apply_longtail_granularity.py path/to.json
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

TOUCHES = {"inside_airbnb_country", "airbnb_pli_scaled"}

# (min_population_inclusive, factor, tier label). First match wins, descending.
# Gentle and capped at +-15% so the country median stays the anchor and no
# single town swings wildly on a modelled signal.
TIERS = [
    (1_000_000, 1.15, "metro"),      # major capital / metropolis
    (  500_000, 1.09, "large_city"),
    (  200_000, 1.04, "city"),
    (   50_000, 1.00, "town"),       # baseline: the country median's home turf
    (   10_000, 0.94, "small_town"),
    (        0, 0.88, "village"),    # rural / very small
]


def tier_for(pop):
    if pop is None:
        return (1.00, "unknown")
    for lo, factor, label in TIERS:
        if pop >= lo:
            return (factor, label)
    return (1.00, "unknown")


def process(dests):
    from collections import Counter
    tiers = Counter()
    n = 0
    for v in dests.values():
        a = v.get("accommodation")
        if not a or a.get("level") != "country":
            continue
        src = a.get("price_source", "")
        base_src = src.split("+")[0]
        if base_src not in TOUCHES:
            continue

        # Idempotent base: stash the pre-tier values once, recompute from them.
        base = a.get("longtail_base")
        if base is None:
            base = {
                "per_person_night_eur": a.get("per_person_night_eur"),
                "cleaning_per_person_eur": a.get("cleaning_per_person_eur"),
                "entire_home_night_eur": a.get("entire_home_night_eur"),
            }
            a["longtail_base"] = base

        pop = (v.get("geonames") or {}).get("population")
        factor, label = tier_for(pop)

        if base.get("per_person_night_eur") is not None:
            a["per_person_night_eur"] = round(base["per_person_night_eur"] * factor, 2)
        if base.get("cleaning_per_person_eur") is not None:
            a["cleaning_per_person_eur"] = round(base["cleaning_per_person_eur"] * factor, 2)
        if base.get("entire_home_night_eur") is not None:
            a["entire_home_night_eur"] = round(base["entire_home_night_eur"] * factor)

        a["price_source"] = f"{base_src}+pop"
        a["settlement_tier"] = label
        a["pop_factor"] = factor
        tiers[label] += 1
        n += 1
    return n, tiers


def main():
    dry = "--dry" in sys.argv
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    targets = [Path(a) for a in args] or DEFAULT_TARGETS
    for path in targets:
        if not path.exists():
            print(f"  skip (missing): {path}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        n, tiers = process(data.get("destinations", {}))
        if not dry:
            path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"  {path.name}: {n} long-tail dests tiered  {dict(tiers)}"
              + ("  [DRY]" if dry else ""))


if __name__ == "__main__":
    main()
