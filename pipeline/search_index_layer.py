"""Fold-and-alias search index (B2, 2026-09): typed names must find places.

454 destination names carry diacritics or hyphens, and the search box did a
plain substring match over them: "cesky krumlov" found nothing, "eze" found
nothing, Positano lived invisibly inside Amalfi Coast. This layer emits
continent-app/public/search_index.json, one folded key per way a person
might type a place:

  folded form        NFKD + an explicit fold table for the letters NFKD
                     leaves alone (o-slash, ae, l-stroke, thorn, eszett -
                     the lesson of the l-stroke bug is in the memory of this
                     repo), hyphens and apostrophes to spaces
  parenthetical      "Luberon (Gordes)" indexes under luberon AND gordes
  endonym/exonym     firenze finds Florence, wien Vienna, muenchen Munich -
                     a curated table, each entry asserted against the
                     catalogue at build time so it can never dangle
  member names       resolving to the parent (B1's members[]), so positano
                     lists Amalfi Coast, labelled with the member's name
  region terms       provence, tuscany, cyclades... resolve to a bounding
                     box that FILTERS rather than to one destination

The app-side matcher (src/lib/searchIndex.js) runs prefix first, then
folded substring, then edit distance 1 for queries of 5+ characters, and
offers the nearest three keys instead of an empty box.

Usage:
    python search_index_layer.py
"""

import json
import sys
import unicodedata
from pathlib import Path

from pipeline_io import atomic_write_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
OUT = ROOT / "continent-app" / "public" / "search_index.json"

# The letters NFKD does not decompose (see nfkd-undecomposed-letters).
FOLD_TABLE = str.maketrans({
    "ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae",
    "œ": "oe", "Œ": "oe", "ß": "ss", "đ": "d", "Đ": "d",
    "þ": "th", "Þ": "th", "ð": "d", "Ð": "d",
})


def fold(s):
    s = (s or "").translate(FOLD_TABLE)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace("-", " ").replace("'", " ").replace("’", " ") \
        .lower().strip()


# exonym / endonym -> the catalogue's English data-form city name.
# Asserted against the catalogue at build; a miss is skipped with a warning,
# never emitted as a dangling key.
EXONYMS = {
    "firenze": "Florence", "wien": "Vienna", "muenchen": "Munich",
    "munchen": "Munich", "praha": "Prague", "lisboa": "Lisbon",
    "roma": "Rome", "napoli": "Naples", "venezia": "Venice",
    "milano": "Milan", "torino": "Turin", "genova": "Genoa",
    "koeln": "Köln", "warszawa": "Warsaw", "kobenhavn": "Copenhagen",
    "koebenhavn": "Copenhagen", "athina": "Athens", "sevilla": "Seville",
    "bruxelles": "Brussels", "brussel": "Brussels", "antwerpen": "Antwerp",
    "gent": "Ghent", "den haag": "The Hague", "moskva": None,  # not held
    "nuernberg": "Nuremberg", "nurnberg": "Nuremberg", "zuerich": "Zurich",
    "geneve": "Geneva", "basel": "Basel", "kerkyra": "Corfu",
    "thessaloniki": "Thessaloniki", "dubrovnik": "Dubrovnik",
}

# Region and island query terms -> a filtering bounding box [w, s, e, n].
# Hand-set approximations: a region term narrows the grid to its area, it
# does not resolve to any single destination.
REGIONS = {
    "provence": [4.2, 43.1, 7.1, 44.5],
    "tuscany": [9.7, 42.4, 12.4, 44.5],
    "toscana": [9.7, 42.4, 12.4, 44.5],
    "andalusia": [-7.6, 36.0, -1.6, 38.7],
    "andalucia": [-7.6, 36.0, -1.6, 38.7],
    "algarve": [-9.0, 36.9, -7.3, 37.5],
    "cyclades": [24.2, 36.3, 26.2, 37.9],
    "bavaria": [9.0, 47.2, 13.9, 50.6],
    "bayern": [9.0, 47.2, 13.9, 50.6],
    "alsace": [6.8, 47.4, 8.3, 49.1],
    "tyrol": [10.1, 46.6, 12.9, 47.8],
    "tirol": [10.1, 46.6, 12.9, 47.8],
    "cornwall": [-5.8, 49.9, -4.1, 50.9],
    "dalmatia": [15.0, 42.4, 18.5, 44.9],
    "peloponnese": [21.1, 36.3, 23.5, 38.4],
    "sicily": [12.3, 36.6, 15.7, 38.3],
    "sicilia": [12.3, 36.6, 15.7, 38.3],
    "sardinia": [8.0, 38.8, 9.9, 41.3],
    "sardegna": [8.0, 38.8, 9.9, 41.3],
    "corsica": [8.5, 41.3, 9.6, 43.1],
    "corse": [8.5, 41.3, 9.6, 43.1],
    "catalonia": [0.1, 40.5, 3.4, 42.9],
    "normandy": [-1.9, 48.2, 1.8, 49.8],
    "brittany": [-5.2, 47.2, -1.0, 48.9],
    "bretagne": [-5.2, 47.2, -1.0, 48.9],
    "lapland": [20.0, 66.0, 30.0, 70.1],
    "dolomites": [10.8, 46.2, 12.5, 46.8],
}


def base_split(city):
    city = city or ""
    if "(" in city and city.endswith(")"):
        outer, inner = city.split("(", 1)
        return outer.strip(), inner[:-1].strip()
    return city.strip(), None


def main():
    data = json.loads(MASTER.read_text(encoding="utf-8"))
    dests = data["destinations"]

    entries = {}

    def put(key, kind, did, display=None):
        key = fold(key)
        if len(key) < 3:
            return
        row = [kind, did] + ([display] if display else [])
        entries.setdefault(key, [])
        if row not in entries[key]:
            entries[key].append(row)

    city_to_id = {}
    for did, d in dests.items():
        city = d.get("city") or ""
        outer, inner = base_split(city)
        city_to_id.setdefault(fold(outer), did)
        city_to_id.setdefault(fold(city), did)
        put(city, "d", did)
        put(outer, "d", did)
        if inner:
            put(inner, "d", did)
        for m in d.get("members") or []:
            put(m["name"], "m", did, m["name"])

    skipped = []
    for exo, target in EXONYMS.items():
        if target is None:
            continue
        did = city_to_id.get(fold(target))
        if not did:
            skipped.append((exo, target))
            continue
        put(exo, "d", did)
    if skipped:
        print(f"  exonyms skipped (target not held): {skipped}")

    out = {
        "version": 1,
        "fold": "NFKD + explicit table (o-slash, ae, oe, l-stroke, eszett, "
                "thorn, eth); hyphens and apostrophes to spaces",
        "entries": entries,
        "regions": {fold(k): {"bbox": v, "label": k.title()}
                    for k, v in REGIONS.items()},
    }
    atomic_write_json(OUT, out, indent=None, separators=(",", ":"))
    print(f"wrote {OUT.name}: {len(entries)} keys "
          f"({sum(len(v) for v in entries.values())} rows), "
          f"{len(REGIONS)} region terms, "
          f"{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
