"""Register-driven intake (B3, 2026-09): which members do we NOT have?

Sirmione is missing because nothing in the pipeline was responsible for
asking the question. This module is that responsibility: for every
place-level register in place_registries.PLACE_REGISTRIES that Wikidata
actually models, pull the full membership (label, coordinates, sitelinks,
population, image presence), fold the names, diff against the catalogue and
the B1 member lists, and emit the misses as reports/intake_candidates.csv.

NEVER auto-ingests. Candidates carry an `auto_admit` flag for the
unambiguous ones - a register member with coordinates, a Wikidata image and
10+ sitelinks - and everything else waits for review. `beauty_est` is a
FIRST-PASS orientation number only (the graded UNESCO credit at the
member's coordinates plus the register kind's own weight, scaled 0-10);
the real Beauty Index needs the full record and is computed at ingestion,
never here.

Unmodelled registers (es_pueblos_bonitos, cittaslow, the German and Swiss
village lists - real registers with zero P463 statements in Wikidata) are
REPORTED as unmodelled with their fallback pointer, so the gap stays
visible instead of silently missing; their members cannot be diffed until
someone models them or the fallback list is ingested under its own licence
row.

Matching mirrors apply_designations: a member is HELD when a catalogue
destination sits within 4 km, or within 12 km with agreeing folded names;
it is a MEMBER_OF when a B1 members[] entry matches the same way (findable
in search, not a full destination).

Usage:
    python pipeline/intake/register_intake.py            # full run
    python pipeline/intake/register_intake.py --limit 3  # first N registers
"""

import argparse
import csv
import json
import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

import place_registries                                    # noqa: E402
from harvest_place_signals import ask, parse_point, norm, haversine  # noqa: E402
import beauty_layer                                        # noqa: E402
from rating_layer import ACCLAIM_WEIGHT                    # noqa: E402

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

MASTER = ROOT / "app_data" / "app_data.json"
OUT = ROOT / "reports" / "intake_candidates.csv"

# Europe box, for the worldwide-typed registers (national parks, UNESCO):
# without it, P31 national-park membership marks Yellowstone as a miss.
EUROPE = (-25.0, 34.0, 45.0, 72.0)   # w, s, e, n

HELD_KM = 4.0          # a destination this close holds the membership
HELD_NAME_KM = 12.0    # ...or this close when the folded names agree
AUTO_ADMIT_SITELINKS = 10
DELAY_S = 1.0


def member_query(reg):
    prop, qid = reg["prop"], reg["qid"]
    return f"""SELECT ?p ?pLabel ?coord ?sl ?pop ?img WHERE {{
  ?p wdt:{prop} wd:{qid} ; wdt:P625 ?coord ; wikibase:sitelinks ?sl .
  OPTIONAL {{ ?p wdt:P1082 ?pop }}
  OPTIONAL {{ ?p wdt:P18 ?img }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language
    "en,fr,de,it,es,pt,nl,pl,cs,sv,da,no,fi,hu,ro,hr,el" }}
}}"""


def catalogue_index(dests):
    """Coarse grid of (lat, lon, folded names, id, is_member) points."""
    grid = {}

    def put(lat, lon, names, did, is_member):
        if lat is None or lon is None:
            return
        key = (int(lat / 0.25), int(lon / 0.25))
        grid.setdefault(key, []).append((lat, lon, names, did, is_member))

    for did, d in dests.items():
        city = d.get("city") or ""
        outer = city.split("(")[0].strip()
        inner = (city.split("(", 1)[1].rstrip(")").strip()
                 if "(" in city and city.endswith(")") else "")
        names = {norm(city), norm(outer)} | ({norm(inner)} if inner else set())
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        put(lat, lon, names, did, False)
        for m in d.get("members") or []:
            put(m.get("lat"), m.get("lon"), {norm(m.get("name"))}, did, True)
    return grid


def lookup(grid, lat, lon, name):
    """-> ('held'|'member_of'|'missing', matched id or '')."""
    key_i, key_j = int(lat / 0.25), int(lon / 0.25)
    n = norm(name)
    best = ("missing", "")
    for i in range(key_i - 1, key_i + 2):
        for j in range(key_j - 1, key_j + 2):
            for (la, lo, names, did, is_member) in grid.get((i, j), ()):
                km = haversine(lat, lon, la, lo)
                hit = km <= HELD_KM or (km <= HELD_NAME_KM and n in names)
                if not hit:
                    continue
                if not is_member:
                    return ("held", did)
                best = ("member_of", did)
    return best


def beauty_estimate(reg_kind, lat, lon):
    """First-pass 0-10: location heritage + what the register itself proves."""
    heritage = beauty_layer._saturate(beauty_layer.unesco_graded(lat, lon), 1.2)
    acclaim = ACCLAIM_WEIGHT.get(reg_kind, 0.4)
    return round(10 * min(1.0, 0.45 * heritage + 0.45 * acclaim + 0.06), 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--limit", type=int, default=None,
                    help="only the first N modelled registers (debugging)")
    args = ap.parse_args()

    data = json.loads(MASTER.read_text(encoding="utf-8"))
    grid = catalogue_index(data["destinations"])

    modelled = [r for r in place_registries.PLACE_REGISTRIES
                if r.get("modelled") and r.get("qid")]
    unmodelled = [r for r in place_registries.PLACE_REGISTRIES
                  if not (r.get("modelled") and r.get("qid"))]
    if args.limit:
        modelled = modelled[:args.limit]

    rows, coverage = [], {}
    for reg in modelled:
        rid, kind = reg["id"], reg["kind"]
        got = ask(member_query(reg), rid)
        time.sleep(DELAY_S)
        if got is None:
            coverage[rid] = {"total": None, "note": "query failed"}
            continue
        seen, total, held = set(), 0, 0
        for b in got:
            qid = b["p"].rsplit("/", 1)[-1]
            if qid in seen:
                continue
            seen.add(qid)
            pt = parse_point(b.get("coord"))
            if not pt:
                continue
            lat, lon = pt
            if not (EUROPE[0] <= lon <= EUROPE[2] and EUROPE[1] <= lat <= EUROPE[3]):
                continue
            label = b.get("pLabel") or qid
            if label == qid:
                continue
            total += 1
            status, match = lookup(grid, lat, lon, label)
            if status == "held":
                held += 1
                continue
            sl = int(float(b.get("sl") or 0))
            has_img = bool(b.get("img"))
            pop = b.get("pop") or ""
            rows.append({
                "register": rid, "kind": kind, "name": label, "qid": qid,
                "lat": round(lat, 5), "lon": round(lon, 5),
                "sitelinks": sl, "population": pop,
                "has_image": "yes" if has_img else "no",
                "status": status, "matched": match,
                "auto_admit": ("yes" if status == "missing" and has_img
                               and sl >= AUTO_ADMIT_SITELINKS else "no"),
                "beauty_est": beauty_estimate(kind, lat, lon),
                "queued": str(date.today()),
            })
        coverage[rid] = {"total": total, "held": held,
                         "coverage": round(held / total, 3) if total else None}
        print(f"  {rid:30s} members {total:5d}  held {held:5d}  "
              f"coverage {coverage[rid]['coverage']}")

    rows.sort(key=lambda r: (-int(r["auto_admit"] == "yes"), -r["sitelinks"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else
                           ["register"])
        w.writeheader()
        w.writerows(rows)

    print(f"\nwrote {OUT.name}: {len(rows)} candidates "
          f"({sum(1 for r in rows if r['auto_admit'] == 'yes')} auto_admit, "
          f"{sum(1 for r in rows if r['status'] == 'member_of')} already members)")
    print("unmodelled registers (visible gap, not diffable):")
    for reg in unmodelled:
        print(f"  {reg['id']:30s} fallback: {reg.get('fallback', 'none')}")
    for probe in ("Mougins", "Valbonne", "Vence", "Tourrettes-sur-Loup",
                  "Gourdon", "Frigiliana", "Sirmione"):
        hit = [r for r in rows if norm(r["name"]) == norm(probe)]
        print(f"  probe {probe}: "
              f"{'SURFACED via ' + hit[0]['register'] if hit else 'not surfaced'}")


if __name__ == "__main__":
    main()
