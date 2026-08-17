"""Attach dest.designations to app_data.json: who has already judged this place.

The coverage engine uses the place registers to find what is missing. The same
registers are worth just as much pointed at what is already in the catalogue,
because they answer the question the rating could not: is this small place
beautiful, or does it only look beautiful to the person who added it?

A jury said. Les Plus Beaux Villages de France has been picking villages since
1982 against published criteria. I Borghi piu belli d'Italia has picked ~390.
UNESCO has picked its sites. Those judgements are citable, size-independent,
and completely absent from Carta until now - which is precisely why a stunning
village could not out-score a mediocre city: the only quality signals in the
rating were a curator's guess and a POI count that scaled with population.

Adds:
  - dest.designations   [{kind, registry, name, qid, match_km}]
  - meta.designation_model

Read by rating_layer.py (the `acclaim` component of rating_v3) and by the
detail panel, which can now say WHY a place is worth the trip in someone
else's words rather than Carta's.

Matching is by coordinate, with the name as a widener: a designation lands on
a destination within 4 km, or within 12 km when the names also agree (so
"Gordes" matches the catalogue's "Luberon (Gordes)"). A UNESCO site in open
country attaches to the nearest destination, which is the honest reading -
Carta sells the trip to the place you sleep, not to the ruin.

Usage:
    python apply_designations.py            # patches master + served copy
    python apply_designations.py --dry-run  # report only, write nothing
"""
import argparse
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import place_registries
from harvest_place_signals import (MATCH_KM, MATCH_KM_NAMED, ask, haversine,
                                   member_query, norm, parse_point)
from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

DESIGNATION_MODEL = {
    "version": "designations_v1",
    "source": "Wikidata place registers (place_registries.py)",
    "match": f"<= {MATCH_KM} km, or <= {MATCH_KM_NAMED} km when names agree",
    "note": "membership of an authoritative register, not a Carta judgement",
}


def dest_rows(dests):
    out = []
    for did, d in dests.items():
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        if lat is None or lon is None:
            continue
        out.append((did, float(lat), float(lon), norm(d.get("city"))))
    return out


def match(lat, lon, label, rows):
    want = norm(label)
    best, best_d = None, 1e9
    for did, dlat, dlon, dname in rows:
        d = haversine(lat, lon, dlat, dlon)
        if d > MATCH_KM_NAMED:
            continue
        named = want and (dname == want or want in dname or dname in want)
        limit = MATCH_KM_NAMED if named else MATCH_KM
        if d <= limit and d < best_d:
            best, best_d = did, d
    return best, best_d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("targets", nargs="*")
    args = ap.parse_args()
    targets = [Path(t) for t in args.targets] or DEFAULT_TARGETS

    master_path = targets[0]
    data = load_json(master_path)
    if not data:
        raise SystemExit(f"cannot read {master_path}")
    dests = data.get("destinations") or {}
    rows = dest_rows(dests)
    print(f"matching registers against {len(rows)} shipped destinations")

    found = defaultdict(list)
    for reg in place_registries.modelled_registries():
        res = ask(member_query(reg), reg["id"])
        time.sleep(1.0)
        if res is None:
            continue
        hit = 0
        for row in res:
            pt = parse_point(row.get("coord"))
            if not pt:
                continue
            did, km = match(pt[0], pt[1], row.get("pLabel"), rows)
            if not did:
                continue
            found[did].append({
                "kind": reg["kind"], "registry": reg["id"], "name": reg["name"],
                "qid": row.get("p", "").rsplit("/", 1)[-1],
                "match_km": round(km, 2),
            })
            hit += 1
        print(f"  {reg['id']:28s} {len(res):>5} members -> {hit:>4} on catalogue")

    # One row per (destination, register): a town in two registers keeps both,
    # the same register matching twice does not double-count.
    for did, items in found.items():
        seen, keep = set(), []
        for it in sorted(items, key=lambda x: x["match_km"]):
            if it["registry"] in seen:
                continue
            seen.add(it["registry"])
            keep.append(it)
        found[did] = keep

    kinds = Counter(it["kind"] for items in found.values() for it in items)
    print(f"\n{len(found)} of {len(dests)} destinations carry a designation")
    for k, n in kinds.most_common():
        print(f"  {k:22s} {n}")

    if args.dry_run:
        print("\n--dry-run: nothing written")
        return

    for d in dests.values():
        d.pop("designations", None)
    for did, items in found.items():
        dests[did]["designations"] = items
    data["meta"]["designation_model"] = DESIGNATION_MODEL
    atomic_write_json(master_path, data)
    print(f"\n  {master_path.name}: wrote designations onto {len(found)} dests")

    for path in targets[1:]:
        if not path.exists():
            print(f"  skip (missing): {path}")
            continue
        served = load_json(path)
        n = 0
        for did, d in (served.get("destinations") or {}).items():
            d.pop("designations", None)
            if did in found:
                d["designations"] = found[did]
                n += 1
        served["meta"]["designation_model"] = DESIGNATION_MODEL
        path.write_text(json.dumps(served, ensure_ascii=False), encoding="utf-8")
        print(f"  {path.name}: mirrored designations onto {n} dests")


if __name__ == "__main__":
    main()
