"""Tourist-hotspot price premium layer (schema v14).

Problem: 476 of 524 destinations carry their COUNTRY's average basket, so
Santorini was priced like mainland Greece, the Amalfi Coast like average
Italy, and Zermatt like average Switzerland. On-the-ground research puts the
honeypots well above their national average:

  Amalfi Coast   restaurant prices ~2x the Italian norm for the same quality
  Santorini      cliff-view dining ~+30-50% vs mainland Greece (Naxos is
                 40-50% cheaper for the same standard)
  Venice         +20-30% vs other Italian cities in the tourist zones
  Ibiza          +20-30% vs mainland Spain
  (sources: gotripzi/machupicchu budget guides, Numbeo island pages,
   CNBC 2022 Ibiza price report - captured July 2026)

Fix: a hand-curated three-tier premium, applied ONLY where the destination
still carries country-level data (city-anchored records like Dubrovnik's
dining already reflect local prices, and are left alone - the check is per
block, so Dubrovnik's country-scaled ACCOMMODATION still gets the bump while
its city-anchored dining does not).

  tier      dining/drinks  groceries  club   accommodation
  extreme   +40%           +15%       +35%   +45%
  high      +25%           +10%       +20%   +25%
  mild      +12%           +5%        +10%   +10%

Groceries move less than restaurants (supermarkets price island-wide, not
per postcard view); accommodation moves most (the Eurostat-PLI scaling that
built the country anchors is documented to UNDER-predict exactly these
markets by 20-35%, see 03b_accommodation validation).

Idempotent: original values are stashed under `premium_base` on first run
and every rerun recomputes from those, so tweaking a tier and rerunning is
safe.

Usage:
    python apply_tourist_premium.py                  # default targets
    python apply_tourist_premium.py path/to.json     # explicit
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

# Destination id -> tier. Curated against the shipped catalogue (July 2026).
PREMIUM_TIERS = {
    # ---- extreme: world-famous honeypots priced far above their country ----
    "JTR": "extreme",                 # Santorini
    "JMK": "extreme",                 # Mykonos
    "gem:capri": "extreme",
    "gem:amalfi-coast": "extreme",
    "gem:portofino": "extreme",
    "VCE": "extreme", "TSF": "extreme",   # Venice (both airports)
    "gem:zermatt": "extreme",
    "gem:st-moritz": "extreme",
    "gem:monaco-mc": "extreme",
    # ---- high: renowned resorts, clearly above national average ----
    "IBZ": "high",                    # Ibiza
    "gem:interlaken": "high",
    "gem:grindelwald": "high",
    "gem:lauterbrunnen": "high",
    "gem:hallstatt": "high",
    "gem:cinque-terre": "high",
    "NCE": "high",                    # Nice / Riviera
    "gem:como": "high",               # Lake Como
    "gem:hvar": "high",
    "gem:taormina": "high",
    "gem:bled": "high",               # Lake Bled
    "gem:chamonix": "high",
    "gem:dolomites": "high",          # Cortina
    "gem:geiranger": "high",          # cruise honeypot
    "gem:kotor": "high",
    "gem:sveti-stefan": "high",
    "gem:rovinj": "high",
    "DBV": "high",                    # Dubrovnik (accommodation only - dining is city-anchored)
    "gem:lofoten": "high",
    # ---- mild: popular tourist towns, noticeably but modestly above average ----
    "SZG": "mild",                    # Salzburg
    "gem:bruges": "mild",
    "gem:giethoorn": "mild",
    "gem:rothenburg": "mild",
    "gem:colmar": "mild",
    "gem:annecy": "mild",
    "gem:piran": "mild",
    "gem:budva": "mild",
    "gem:mostar-ba": "mild",
    "gem:makarska": "mild",
    "gem:trogir": "mild",
    "gem:plitvice": "mild",
    "gem:sintra": "mild",
    "BIQ": "mild",                    # Biarritz
    "gem:menton": "mild",
    "gem:lagos-pt": "mild",           # Algarve
    "PMI": "mild",                    # Palma de Mallorca
    "MAH": "mild",                    # Menorca
    "CFU": "mild",                    # Corfu
    "RHO": "mild",                    # Rhodes
    "ZTH": "mild",                    # Zakynthos
    "EFL": "mild",                    # Kefalonia
    "gem:paros": "mild",
    "CHQ": "mild",                    # Chania old town
    "gem:garda": "mild",              # Lake Garda
    "gem:lago-maggiore": "mild",
    "VRN": "mild",                    # Verona
    "gem:tuscany-siena": "mild",
    "gem:ayia-napa": "mild",
}

MULTIPLIERS = {
    #            dining  grocery  club   accom
    "extreme": (1.40, 1.15, 1.35, 1.45),
    "high":    (1.25, 1.10, 1.20, 1.25),
    "mild":    (1.12, 1.05, 1.10, 1.10),
}

DINING_KEYS = ("meal_mid_eur", "meal_cheap_eur", "fastfood_eur",
               "drink_out_eur", "cocktail_eur", "coffee_eur")
GROCERY_KEYS = ("grocery_day_eur",)
CLUB_KEYS = ("club_entry_eur",)
ACCOM_KEYS = ("per_person_night_eur", "cleaning_per_person_eur",
              "entire_home_night_eur")

PREMIUM_MODEL = {
    "version": "tourist_premium_v1",
    "multipliers": {k: {"dining": v[0], "grocery": v[1], "club": v[2],
                        "accommodation": v[3]} for k, v in MULTIPLIERS.items()},
    "applied_when": "block still carries country-level data (level == 'country')",
    "n_destinations": len(set(PREMIUM_TIERS)),
    "sources": ["gotripzi/machupicchu 2026 budget guides", "Numbeo island pages",
                "CNBC Ibiza price report", "Inside Airbnb PLI validation (03b)"],
}


def _apply_block(block, keys_mults, tier):
    """Scale `block`'s fields from premium_base (stashing it on first run)."""
    base = block.get("premium_base")
    if base is None:
        base = {k: block[k] for ks, _ in keys_mults for k in ks
                if isinstance(block.get(k), (int, float))}
        block["premium_base"] = base
    for keys, mult in keys_mults:
        for k in keys:
            if k in base:
                block[k] = round(base[k] * mult, 2)
    block["tourist_premium"] = tier


def _strip_block(block):
    base = block.pop("premium_base", None)
    if base:
        block.update(base)
    block.pop("tourist_premium", None)


def patch(path: Path) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    dests = data.get("destinations", {})
    n_cost = n_accom = 0
    for did, dest in dests.items():
        tier = PREMIUM_TIERS.get(did)
        costs = dest.get("costs")
        accom = dest.get("accommodation")
        if not tier:
            # A rerun after removing a place from the list must undo it.
            if costs and costs.get("tourist_premium"):
                _strip_block(costs)
            if accom and accom.get("tourist_premium"):
                _strip_block(accom)
            continue
        dining, grocery, club, accom_m = MULTIPLIERS[tier]
        if costs and costs.get("level") == "country":
            _apply_block(costs, [(DINING_KEYS, dining), (GROCERY_KEYS, grocery),
                                 (CLUB_KEYS, club)], tier)
            n_cost += 1
        elif costs and costs.get("tourist_premium"):
            _strip_block(costs)   # gained real city data since - undo the bump
        if accom and accom.get("level") == "country":
            _apply_block(accom, [(ACCOM_KEYS, accom_m)], tier)
            n_accom += 1
        elif accom and accom.get("tourist_premium"):
            _strip_block(accom)
    data["meta"]["tourist_premium_model"] = PREMIUM_MODEL
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False),
                    encoding="utf-8")
    unmatched = [d for d in PREMIUM_TIERS if d not in dests]
    print(f"  {path.name}: dining premium on {n_cost}, accommodation premium "
          f"on {n_accom} destinations"
          + (f" | UNMATCHED ids: {unmatched}" if unmatched else ""))


def main() -> None:
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print("Applying tourist premium layer (tourist_premium_v1):")
    for t in targets:
        patch(t)


if __name__ == "__main__":
    main()
