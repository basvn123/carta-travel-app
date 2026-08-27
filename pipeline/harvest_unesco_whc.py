"""Harvest cache/unesco_whc.json from the UNESCO World Heritage Centre list.

Provenance repair. The licence ledger (docs/tos/data_licenses.md, follow-up
item 6) flags that no script in the tree writes cache/unesco_whc.json: its
1,247 rows were asserted by field shape only, while the dossier and the
features wire print "unesco" designations from them. This script IS the
harvester: it pulls the official syndication XML from
https://whc.unesco.org/en/list/xml/ and writes the exact same row shape the
consumers already read:

    [ { "name", "lat", "lon", "category", "iso", "region" }, ... ]

one row per (site, country): a transboundary site (the beech forests span 18
states) becomes one row per ISO code, carrying that country's own coordinate
from the <geolocations> block when the XML has one, else the site-level
coordinate. That per-country expansion is what the old file's 1,247 rows were.

The run reports how the fresh harvest compares with the previous file before
replacing it (previous copy kept at cache/unesco_whc_prev.json), so the diff
is reviewable and the provenance question is closed rather than papered over.

Consumers (unchanged): rating_layer, beauty_layer, place_registries,
features/rank_features, trips/trip_model and friends - they match rows by
name/coordinate and never by index, so row order does not matter.

Usage:  python pipeline/harvest_unesco_whc.py [--offline]  (--offline reuses
        cache/unesco_whc_raw.xml from a previous run)
ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "cache" / "unesco_whc_raw.xml"
OUT = ROOT / "cache" / "unesco_whc.json"
PREV = ROOT / "cache" / "unesco_whc_prev.json"
URL = "https://whc.unesco.org/en/list/xml/"
UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio; bas.vannieuwenhuyse123@gmail.com)"}


def fetch():
    req = urllib.request.Request(URL, headers=UA)
    data = urllib.request.urlopen(req, timeout=120).read()
    RAW.write_bytes(data)
    return data


def text(el, tag):
    node = el.find(tag)
    return (node.text or "").strip() if node is not None and node.text else ""


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if c.isalnum())


def parse(data):
    root = ET.fromstring(data)
    rows = []
    n_sites = 0
    for row in root.iter("row"):
        name = text(row, "site")
        if not name:
            continue
        n_sites += 1
        category = text(row, "category") or None
        region = text(row, "region") or None
        try:
            site_lat = float(text(row, "latitude"))
            site_lon = float(text(row, "longitude"))
        except ValueError:
            site_lat = site_lon = None
        isos = [c.strip().upper() for c in text(row, "iso_code").split(",") if c.strip()]

        # Per-country points: a transboundary site gets each state's own
        # coordinate where the XML carries one.
        by_iso = {}
        geo = row.find("geolocations")
        if geo is not None:
            for poi in geo.iter("poi"):
                iso2 = text(poi, "iso2").upper()
                try:
                    la = float(text(poi, "latitude"))
                    lo = float(text(poi, "longitude"))
                except ValueError:
                    continue
                by_iso.setdefault(iso2, (la, lo))

        for iso in (isos or [""]):
            la, lo = by_iso.get(iso, (site_lat, site_lon))
            if la is None or not iso:
                continue
            rows.append({
                "name": name, "lat": la, "lon": lo,
                "category": category, "iso": iso, "region": region,
            })
    return rows, n_sites


def compare(new_rows):
    old = []
    try:
        old = json.loads(OUT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    old_keys = {(norm(r["name"]), r.get("iso")) for r in old}
    new_keys = {(norm(r["name"]), r.get("iso")) for r in new_rows}
    matched = len(old_keys & new_keys)
    print(f"[whc] previous file: {len(old)} rows; fresh harvest: {len(new_rows)} rows")
    if old:
        print(f"[whc] {matched}/{len(old_keys)} previous (site, country) keys "
              f"reproduced by the official list "
              f"({matched * 100 // max(len(old_keys), 1)}%)")
        gone = sorted(old_keys - new_keys)[:6]
        added = sorted(new_keys - old_keys)[:6]
        if gone:
            print("  no longer present (sample):", [g[0][:34] for g in gone])
        if added:
            print("  newly present (sample):", [a[0][:34] for a in added])
    return old


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true",
                    help="reuse cache/unesco_whc_raw.xml")
    args = ap.parse_args()

    data = RAW.read_bytes() if args.offline and RAW.exists() else fetch()
    rows, n_sites = parse(data)
    print(f"[whc] parsed {n_sites} inscribed properties -> {len(rows)} "
          f"(site, country) rows")
    old = compare(rows)
    if old:
        PREV.write_text(json.dumps(old, ensure_ascii=False), encoding="utf-8")
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    tmp.replace(OUT)
    print(f"[whc] wrote {OUT} ({len(rows)} rows); previous kept at {PREV.name}")


if __name__ == "__main__":
    main()
