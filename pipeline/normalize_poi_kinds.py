"""Normalize POI kinds and demote commercial noise, in place.

The three POI sources speak three taxonomies: OpenTripMap says "Ancient site"
and "Opera", Overture/Wikidata say "Archaeological site" and "Opera house",
and Overture's broad `landmark`/`attraction` categories drag in outright
commercial noise (apartment blocks called "Condo Gardens Brussels", lounge
bars named after the beach, ice-cream shops filed as kind "Glacier", the
Romance-language false friend). The 2026-07-22 classification audit measured
29,531 `Landmark` items (the single biggest kind) and 27% of the catalogue
falling through every dwell/interest map.

This pass:
  1. rewrites the Overture/Wikidata kind spellings onto the OTM ones the
     frontend taxonomies are keyed by;
  2. finds commercial-noise items by name (same regex as the frontend's
     isCommercialNoisePoi in dayDraft.js) inside the loose kinds and demotes
     them: rate -> 0 and a `noise: 1` marker, so no ranking ever surfaces
     them again.

Items are NEVER removed and never reordered: saved day plans reference
items_full by index, so this pass only mutates in place. Idempotent.

IMPORTANT: do not run while a harvest is writing the same files
(Get-Process python first, see the pipeline README/conventions).

Usage:
    python normalize_poi_kinds.py                      # default targets
    python normalize_poi_kinds.py path/to/app_data.json [...]
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",                        # master (items_full)
    ROOT / "continent-app" / "public" / "activities_full.json", # served full POI lists
]

# Overture / Wikidata spelling -> the OTM spelling the frontend keys on.
KIND_MAP = {
    "Opera house": "Opera",
    "Archaeological site": "Ancient site",
    "Fortification": "Fortress",
    "City gate": "Gate",
}

# Mirror of COMMERCIAL_RE in continent-app/src/planner/dayDraft.js. Keep the
# two in sync when extending either.
COMMERCIAL_RE = re.compile(
    r"\b(apartments?|aparthotel|hostels?|hotels?|b&b|guesthouse|guest house|residence"
    r"|suites?|rooms|store|shops?|boutique|bar|pub|lounge|restaurants?|ristorante"
    r"|pizzeria|trattoria|osteria|bistro|brasserie|tavern|taverna|cafe|caff[eè]"
    r"|coffee|helader[ií]a|gelateria|ice cream|takeaway|kebab|camping|campsite"
    r"|parking|garage|car park|offices?|agency|rentals?|hire|barber|hairdresser"
    r"|nightclub|casino|supermarket|shopping cent(?:er|re)|mall)\b",
    re.IGNORECASE,
)
LOOSE_KINDS = {"Landmark", "Attraction", "Glacier", "Theme park", ""}


def normalize_items(items):
    """Mutate a list of POI items; return (n_kind, n_noise)."""
    n_kind = n_noise = 0
    for it in items or []:
        if not isinstance(it, dict):
            continue
        kind = it.get("kind") or ""
        if kind in KIND_MAP:
            it["kind"] = KIND_MAP[kind]
            n_kind += 1
            kind = it["kind"]
        if kind in LOOSE_KINDS and COMMERCIAL_RE.search(it.get("name") or ""):
            if it.get("rate") or not it.get("noise"):
                n_noise += 1
            it["rate"] = 0
            it["noise"] = 1
    return n_kind, n_noise


def patch(path: Path) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))

    n_kind = n_noise = 0
    if "destinations" in data:  # app_data.json shape
        for dest in data["destinations"].values():
            items = (dest.get("activities") or {}).get("items_full")
            k, n = normalize_items(items)
            n_kind += k
            n_noise += n
    else:  # activities_full.json shape: { destId: [items] }
        for items in data.values():
            k, n = normalize_items(items)
            n_kind += k
            n_noise += n

    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  {path.name}: {n_kind} kinds normalized, {n_noise} commercial-noise items demoted")


def main() -> None:
    targets = [Path(p) for p in sys.argv[1:]] or DEFAULT_TARGETS
    for t in targets:
        patch(t)


if __name__ == "__main__":
    main()
