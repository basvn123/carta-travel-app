"""Open dataset export (T1176, ROADMAP K8).

Builds a CC-BY subset of Carta's destination catalogue: only fields whose
source licence (pipeline/config/sources.yaml) is on OPEN_LICENCES. The export
refuses to run if any field points at a source outside the allowlist, a
source that is missing from the registry, or a derived source (those inherit
the licence of their inputs, so a derived field is only open when every input
is, checked recursively).

Usage:
    python scripts/open_data/export_open_dataset.py [--wire PATH] [--out DIR]

Outputs (default scripts/open_data/out/, gitignored except DATASHEET.md and
README.md): destinations.csv, destinations.json, ATTRIBUTION.txt. Publishing
is the owner's step; this script never uploads anything.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
SOURCES_YAML = ROOT / "pipeline" / "config" / "sources.yaml"
DEFAULT_WIRE = ROOT / "continent-app" / "public" / "app_data.json"
DEFAULT_OUT = Path(__file__).resolve().parent / "out"

# Licences that let Carta redistribute a field under CC BY 4.0 (attribution
# only, no share-alike, no non-commercial limit). ODbL, CC-BY-SA, per-file,
# site-terms and vendor terms are NOT here and never will be without the owner.
OPEN_LICENCES = {"CC-BY-4.0", "CC0-1.0", "LicenseRef-public-domain", "LicenseRef-us-gov-public-domain"}

# Attribution text per source id (shown in ATTRIBUTION.txt and the datasheet).
ATTRIBUTION = {
    "geonames": "GeoNames (geonames.org), cities500 dump, CC BY 4.0.",
    "eurostat_nights": "Eurostat tour_occ_nin3 (nights spent), CC BY 4.0; NUTS 3 regions from GISCO (c) EuroGeographics.",
    "eea_bathing": "European Environment Agency, WISE bathing water quality, CC BY 4.0.",
    "climate": "NASA POWER (MERRA-2) 2001-2020 climatology, US Government work, lapse-corrected by Carta.",
    "ourairports": "OurAirports, public domain.",
}


def _get(d, path):
    for k in path.split("."):
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d


def _month(path, i):
    def f(r):
        m = _get(r, path)
        if not isinstance(m, list) or len(m) < 12 or not isinstance(m[i[0]], (list, tuple)):
            return None
        return m[i[0]][i[1]]
    return f


# column name -> (source id, description, getter).
FIELDS: dict[str, tuple[str, str, object]] = {}


def _add(name, src, desc, getter):
    FIELDS[name] = (src, desc, getter)


_add("id", "ourairports", "Carta id: airport IATA code, or a gem slug", lambda r: r.get("id"))
_add("tier", "ourairports", "airport or gem", lambda r: r.get("tier"))
_add("iso2", "geonames", "ISO 3166-1 alpha-2 country code", lambda r: r.get("iso2"))
_add("name", "geonames", "Place name", lambda r: r.get("city"))
_add("lat", "geonames", "Latitude rounded to 2 decimals (about 1 km)",
     lambda r: None if r.get("lat") is None else round(r["lat"], 2))
_add("lon", "geonames", "Longitude rounded to 2 decimals (about 1 km)",
     lambda r: None if r.get("lon") is None else round(r["lon"], 2))
_add("population", "geonames", "Population (GeoNames)", lambda r: _get(r, "geonames.population"))
_add("settlement", "geonames", "Settlement class (GeoNames)", lambda r: _get(r, "geonames.settlement"))
_add("nights_per_km2", "eurostat_nights", "Tourist nights per km2 in the NUTS 3 region", lambda r: _get(r, "crowding.nights_per_km2"))
_add("crowding_tier", "eurostat_nights", "Crowding tier 1 to 4 derived from nights per km2", lambda r: _get(r, "crowding.tier"))
_add("nuts3", "eurostat_nights", "NUTS 3 region code", lambda r: _get(r, "crowding.nuts3"))
_add("crowding_year", "eurostat_nights", "Reference year of the Eurostat figure", lambda r: _get(r, "crowding.year"))
_add("bathing_rating", "eea_bathing", "Worst-of EEA classification of bathing sites within 15 km", lambda r: _get(r, "bathing_water.rating"))
_add("bathing_sites", "eea_bathing", "Number of EEA bathing sites within 15 km", lambda r: _get(r, "bathing_water.n_sites"))
_add("bathing_year", "eea_bathing", "Season of the EEA classification", lambda r: _get(r, "bathing_water.year"))
for _mi, _mn in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]):
    _add(f"tmax_c_{_mn}", "climate", f"Mean daytime high in {_mn}, deg C", _month("climate.m", (_mi, 0)))
    _add(f"rain_mm_{_mn}", "climate", f"Mean rainfall in {_mn}, mm", _month("climate.m", (_mi, 2)))

# Everything the wire carries that is NOT exported, and why (datasheet "Left out").
EXCLUDED = {
    "rating, beauty, place, taste, activities (derived)": "derived from Wikipedia (CC BY-SA), OpenStreetMap (ODbL) and the POI mix",
    "costs (food prices)": "Open Prices and OpenStreetMap inputs (ODbL), Numbeo terms",
    "accommodation": "scraped under site terms",
    "local_transport, driving_toll, transfer, nature": "OpenStreetMap (ODbL)",
    "image": "Wikimedia Commons, licence per file",
    "guide": "Wikivoyage (CC BY-SA)",
    "designations": "UNESCO terms and Wikidata mix",
}


def load_sources(path: Path = SOURCES_YAML) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))["sources"]


def effective_licences(src_id: str, sources: dict, _seen=None) -> set[str]:
    """Licences that bind a source: its own, or for a derived one its inputs' (recursive)."""
    s = sources.get(src_id)
    if s is None:
        raise KeyError(f"source {src_id!r} is not in sources.yaml")
    if s.get("kind") == "derived":
        out: set[str] = set()
        for i in s.get("inputs") or []:
            out |= effective_licences(i, sources)
        return out
    return {s["licence"]}


def check_policy(sources: dict, fields=None) -> list[str]:
    """Return a list of problems; empty means every field's licence is open."""
    problems = []
    for name, (src, _d, _g) in (fields or FIELDS).items():
        try:
            lic = effective_licences(src, sources)
        except KeyError as e:
            problems.append(f"{name}: {e}")
            continue
        bad = lic - OPEN_LICENCES
        if bad:
            problems.append(f"{name}: source {src} binds non-open licence(s) {sorted(bad)}")
    return problems


def build_rows(wire: dict) -> list[dict]:
    rows = []
    for key in sorted(wire["destinations"]):
        r = wire["destinations"][key]
        rows.append({n: g(r) for n, (_s, _d, g) in FIELDS.items()})
    return rows


def write_outputs(rows, sources, out: Path, generated_from: str = "") -> None:
    out.mkdir(parents=True, exist_ok=True)
    cols = list(FIELDS)
    with open(out / "destinations.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    meta = {
        "licence": "CC-BY-4.0",
        "fields": {n: {"source": s, "source_licence": sorted(effective_licences(s, sources)), "description": d}
                   for n, (s, d, _g) in FIELDS.items()},
        "attribution": [ATTRIBUTION[s] for s in sorted({v[0] for v in FIELDS.values()})],
        "rows": len(rows),
    }
    (out / "destinations.json").write_text(
        json.dumps({"meta": meta, "destinations": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "ATTRIBUTION.txt").write_text(
        "Carta open dataset, CC BY 4.0. Credit Carta and these sources:\n\n"
        + "\n".join(f"- {a}" for a in meta["attribution"]) + "\n", encoding="utf-8")


def render_datasheet(sources: dict, rows: int | None = None) -> str:
    L = ["# Carta open dataset: datasheet", "",
         "Generated by `python scripts/open_data/export_open_dataset.py --datasheet`. Do not edit by hand; CI checks it is current.", "",
         "Licence of the export: CC BY 4.0. Every column below comes from a source whose own licence allows redistribution under CC BY 4.0 with attribution only.", "",
         "## Fields", "", "| Column | Source | Source licence | Meaning |", "|---|---|---|---|"]
    for n, (s, d, _g) in FIELDS.items():
        L.append(f"| `{n}` | {s} | {', '.join(sorted(effective_licences(s, sources)))} | {d} |")
    L += ["", "## Attribution text", ""]
    L += [f"- {ATTRIBUTION[s]}" for s in sorted({v[0] for v in FIELDS.values()})]
    L += ["", "## Left out, and why", "", "| Wire block | Reason |", "|---|---|"]
    L += [f"| {k} | {v} |" for k, v in EXCLUDED.items()]
    L += ["", "## Known gaps", "",
          "- Only destinations with the source block present get a value; a missing value is an empty cell, never a guess.",
          "- `crowding_*` is empty for places outside the Eurostat NUTS 3 coverage and for UK places until the ONS run lands.",
          "- `bathing_*` is empty away from EEA-monitored coasts, lakes and rivers.",
          "- Climate is a 2001-2020 normal lapse-corrected to the place's elevation, not a forecast.",
          "- Coordinates are rounded to about 1 km on purpose.",
          "- `id` and `name` are Carta's own catalogue keys and labels. Gem names and coordinates were matched to GeoNames; the owner must confirm no ODbL-only value is among them before publishing (register row T1176-a).",
          "- Carta's own ratings, prices and rankings are not in this dataset: they are built from inputs under share-alike or non-open terms.", ""]
    return "\n".join(L)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--wire", type=Path, default=DEFAULT_WIRE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--check", action="store_true", help="only verify the licence policy")
    ap.add_argument("--datasheet", action="store_true", help="write (or with --check, verify) DATASHEET.md")
    a = ap.parse_args(argv)
    sources = load_sources()
    problems = check_policy(sources)
    if problems:
        print("open dataset: licence check FAILED", *problems, sep="\n  ", file=sys.stderr)
        return 1
    if a.datasheet:
        target = Path(__file__).resolve().parent / "DATASHEET.md"
        text = render_datasheet(sources)
        if a.check:
            if not target.exists() or target.read_text(encoding="utf-8") != text:
                print("open dataset: DATASHEET.md is stale, run with --datasheet", file=sys.stderr)
                return 1
        else:
            target.write_text(text, encoding="utf-8")
        print("open dataset: datasheet ok")
        return 0
    if a.check:
        print(f"open dataset: {len(FIELDS)} fields, all licences open")
        return 0
    wire = json.loads(a.wire.read_text(encoding="utf-8"))
    rows = build_rows(wire)
    write_outputs(rows, sources, a.out)
    print(f"open dataset: {len(rows)} rows, {len(FIELDS)} columns -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
