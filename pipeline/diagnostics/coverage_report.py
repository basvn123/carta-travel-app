"""Coverage report - where the catalogue is thin, stated before a user finds it.

Per country: destinations held, density per 10,000 km2 and per million
residents, appeal (curation) coverage, held register members per register
kind, and coverage of the partial layers (designations, nature, crowding,
bathing water, written guide). Output: reports/coverage_report.json.

The ratchet (--check): the previous committed report is the floor. If any
country now holds fewer members of any register than it did last run, the
script exits 1 - a lost designation or a dropped destination is a regression,
not a rounding difference, and the build should say so. Register MEMBERSHIP
totals (how many members each register has in the world, so coverage can be
a true percentage) arrive with the B3 intake layer; until then the ratchet
locks the held counts, which is the half of the comparison we can already
measure honestly.

Usage:
    python pipeline/diagnostics/coverage_report.py           # write the report
    python pipeline/diagnostics/coverage_report.py --check   # CI: ratchet only
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_MASTER = ROOT / "app_data" / "app_data.json"
_WIRE = ROOT / "continent-app" / "public" / "app_data.json"
INPUT = _MASTER if _MASTER.exists() else _WIRE
OUTPUT = ROOT / "reports" / "coverage_report.json"

# The partial layers, named the way the destination records carry them.
# A layer counts as present when the field is non-empty.
PARTIAL_LAYERS = ("designations", "nature", "crowding", "bathing_water", "guide")

# Country land area (km2) and population (millions). Reference constants for
# density only - approximate figures (metropolitan France, mainland Norway,
# Serbia excluding Kosovo), World Bank / national statistics, mid-2020s.
# One table, used nowhere else; do not copy these numbers into other modules.
COUNTRY_AREA_POP = {
    "Italy": (302073, 58.9), "France": (543940, 66.1),
    "United Kingdom": (243610, 68.3), "Spain": (505990, 48.6),
    "Germany": (357596, 84.5), "Greece": (131957, 10.4),
    "Netherlands": (41543, 17.9), "Portugal": (92212, 10.6),
    "Sweden": (450295, 10.6), "Poland": (312696, 36.6),
    "Czechia": (78871, 10.9), "Denmark": (42933, 5.96),
    "Romania": (238398, 19.0), "Croatia": (56594, 3.85),
    "Bulgaria": (110994, 6.4), "Norway": (323808, 5.55),
    "Hungary": (93028, 9.6), "Austria": (83879, 9.1),
    "Switzerland": (41285, 8.85), "Belgium": (30528, 11.8),
    "Ireland": (70273, 5.3), "Slovenia": (20273, 2.12),
    "Slovakia": (49035, 5.4), "Serbia": (77474, 6.6),
    "Finland": (338440, 5.6), "Latvia": (64589, 1.88),
    "Iceland": (103000, 0.39), "Montenegro": (13812, 0.62),
    "Albania": (28748, 2.75), "Cyprus": (9251, 0.93),
    "Estonia": (45227, 1.37), "Bosnia and Herzegovina": (51209, 3.2),
    "North Macedonia": (25713, 1.83), "Lithuania": (65300, 2.87),
    "Faroe Islands": (1393, 0.054), "Malta": (316, 0.55),
    "Kosovo": (10887, 1.76), "Moldova": (33846, 2.42),
    "Luxembourg": (2586, 0.67), "Andorra": (468, 0.081),
    "Liechtenstein": (160, 0.040), "San Marino": (61, 0.034),
    "Monaco": (2.02, 0.038),
}


def build_report(data):
    dests = data["destinations"]
    by_country = {}
    for d in dests.values():
        by_country.setdefault(d.get("country") or "?", []).append(d)

    countries = {}
    for name, rows in sorted(by_country.items(), key=lambda kv: -len(kv[1])):
        n = len(rows)
        curated = sum(1 for r in rows
                      if "appeal" in ((r.get("rating") or {}).get("components") or {}))
        registers = {}
        for r in rows:
            for des in (r.get("designations") or []):
                kind = des.get("kind") or "?"
                registers[kind] = registers.get(kind, 0) + 1
        layers = {
            layer: round(sum(1 for r in rows if r.get(layer)) / n, 4)
            for layer in PARTIAL_LAYERS
        }
        area, pop_m = COUNTRY_AREA_POP.get(name, (None, None))
        countries[name] = {
            "destinations": n,
            "per_10000_km2": round(n / area * 10000, 2) if area else None,
            "per_million_residents": round(n / pop_m, 2) if pop_m else None,
            "appeal_coverage": round(curated / n, 4),
            "registers_held": dict(sorted(registers.items())),
            "layer_coverage": layers,
        }

    totals = {
        layer: round(sum(1 for d in dests.values() if d.get(layer))
                     / len(dests), 4)
        for layer in PARTIAL_LAYERS
    }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "n_destinations": len(dests),
        "n_countries": len(countries),
        "layer_coverage_total": totals,
        "register_membership_totals": (
            "pending B3 register_intake - held counts only until then"),
        "countries": countries,
    }


def ratchet(previous, current):
    """Register coverage may only rise. Returns the list of violations."""
    drops = []
    for name, prev in previous.get("countries", {}).items():
        cur = current["countries"].get(name)
        if cur is None:
            drops.append(f"{name}: country vanished from the catalogue")
            continue
        for kind, count in prev.get("registers_held", {}).items():
            now = cur["registers_held"].get(kind, 0)
            if now < count:
                drops.append(f"{name}: {kind} held {count} -> {now}")
    return drops


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", type=Path, default=INPUT)
    ap.add_argument("--check", action="store_true",
                    help="compare against the committed report and exit 1 on "
                         "any register drop; writes nothing")
    args = ap.parse_args()

    data = json.loads(args.input.read_text(encoding="utf-8"))
    current = build_report(data)

    if OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
        drops = ratchet(previous, current)
        if drops:
            print("register coverage dropped below the previous run:")
            for d in drops:
                print("  " + d)
            raise SystemExit(1)
        print(f"ratchet clean against {previous['generated_at']}")

    if args.check:
        print("check passed; report not rewritten")
        return

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(current, indent=1, ensure_ascii=False),
                      encoding="utf-8")
    print(f"wrote {OUTPUT}: {current['n_destinations']} destinations, "
          f"{current['n_countries']} countries")
    worst = sorted(current["countries"].items(),
                   key=lambda kv: kv[1]["appeal_coverage"])[:8]
    print("thinnest appeal coverage:")
    for name, c in worst:
        print(f"  {name:24s} {c['appeal_coverage']:.0%} of {c['destinations']}")


if __name__ == "__main__":
    main()
