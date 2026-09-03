"""OSM settlement scan (B4's grid variant, 2026-09): misses beyond the boxes.

The WDQS landmark boxes only see ~9 km around existing destinations, so
Sirmione - 20 km across Lake Garda from its box's centre - stays invisible
to gap_scan.py. This pass walks the Geofabrik country extracts (the same
30 GB store the fabric and lakes layers read) with pyosmium and collects
every place=town / place=village node that carries a wikidata tag, joins
the sitelink count from cache/wikidata_sitelinks.json (149k QIDs, offline),
and emits everything notable within REACH_KM of any catalogue destination
that the catalogue does not hold.

The wikidata tag is the notability screen: an OSM village whose mappers
linked it to a Wikidata item with 25+ sitelinks is documented in 25+
languages - a far stricter signal than raw tourism tags, and joinable
without any network. Ranking mirrors gap_scan: sitelinks x nearest-anchor
score x proximity.

Writes cache/osm_settlements.json (the raw scan, resumable per country)
and merges into the intake review flow via gap_scan --with-osm.

Usage:
    python pipeline/intake/osm_settlement_scan.py            # all countries
    python pipeline/intake/osm_settlement_scan.py IT FR      # some
"""

import json
import sys
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "lakes"))

from pipeline_io import atomic_write_json, load_json     # noqa: E402
from osm_water import SLUG_TO_CC, newest_pbf             # noqa: E402

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

OUT = ROOT / "cache" / "osm_settlements.json"
PLACE_KINDS = {"town", "village"}


def scan_country(pbf):
    """[(name, lat, lon, place, qid, population?)] for one extract."""
    rows = []
    fp = (osmium.FileProcessor(str(pbf), osmium.osm.NODE)
          .with_filter(osmium.filter.EmptyTagFilter())
          .with_filter(osmium.filter.KeyFilter("place")))
    for n in fp:
        tags = dict((t.k, t.v) for t in n.tags)
        if tags.get("place") not in PLACE_KINDS:
            continue
        qid = tags.get("wikidata")
        name = tags.get("name")
        if not qid or not name:
            continue
        try:
            pop = int(tags.get("population", "") or 0)
        except ValueError:
            pop = 0
        rows.append((name, round(n.location.lat, 5),
                     round(n.location.lon, 5), tags["place"], qid, pop))
    return rows


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    cache = load_json(OUT) if OUT.exists() else {}
    done = set(cache.get("_countries", []))

    todo = []
    for slug, cc in SLUG_TO_CC.items():
        if args and cc not in args:
            continue
        if not args and cc in done:
            continue
        _day, pbf = newest_pbf(slug)
        if pbf:
            todo.append((cc, pbf))
    print(f"{len(todo)} countries to scan")
    for cc, pbf in todo:
        print(f"{cc}: {pbf.name}...", flush=True)
        rows = scan_country(pbf)
        cache[cc] = rows
        done.add(cc)
        cache["_countries"] = sorted(done)
        atomic_write_json(OUT, cache, indent=None, separators=(",", ":"))
        print(f"  {cc}: {len(rows)} wikidata-tagged towns and villages",
              flush=True)
    total = sum(len(v) for k, v in cache.items() if k != "_countries")
    print(f"scan complete: {total} settlements cached -> {OUT.name}")


if __name__ == "__main__":
    main()
