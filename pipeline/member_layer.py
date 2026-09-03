"""Cluster members (B1, 2026-09): the villages inside the area entries.

Amalfi Coast, Cinque Terre, Lake Como and the other `area` destinations are
containers, and they swallow their members: searching Positano, Vernazza or
Bellagio returned nothing, because those places live INSIDE an entry and
nothing named them. This layer gives every area destination a `members[]`
of real named settlements, each with coordinates, a one-line description
where Wikidata has one, and a parent_id back-pointer - searchable and
linkable (B2, D7), but never wearing a tier badge of their own unless some
day promoted to full destinations.

Sources, in order - measured data only, nothing invented:
  1. cache/wikidata_landmarks.json - the WDQS box harvest already run for
     every destination holds the settlement entities near each area centre
     (comune / commune / frazione / hamlet types), with coordinates,
     sitelinks, the English article and a short description.
  2. cache/geonames_cities500.txt - name + coordinates fallback for a
     seeded village the sitelink floor kept out of the box harvest; such a
     member ships without a description rather than with a made-up one.

The obvious sets PLAN.md names (Positano...Lourmarin) are SEEDS: required
members looked up in the same sources, so a famous village cannot be missed
just because a box was dense. visit_h uses the place layer's village prior
(3.0 h) - the member has no measured depth yet, and the number says what a
village of unknown depth is worth planning for.

Usage:
    python member_layer.py           # patch master + served copy
    python member_layer.py --report  # measure only, write nothing
"""

import csv
import json
import sys
import unicodedata
from pathlib import Path

from pipeline_io import atomic_write_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
LM_CACHE = ROOT / "cache" / "wikidata_landmarks.json"
GEONAMES = ROOT / "cache" / "geonames_cities500.txt"
TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

# Wikidata P31 types that mean "a settlement you could walk around in".
SETTLEMENT_TYPES = {
    "Q515", "Q3957", "Q532", "Q486972", "Q1549591", "Q5119", "Q15284",
    "Q747074",              # comune of Italy
    "Q484170",              # commune of France
    "Q262166", "Q2074737", "Q2039348", "Q493522",   # DE/ES/AT/BE municipalities
    "Q123705", "Q2983893", "Q252916",               # quarters / boroughs
    "Q1134686",             # frazione
    "Q5084",                # hamlet
    "Q3257686",             # locality
}

MAX_MEMBERS = 8
MIN_MEMBERS = 3
VILLAGE_VISIT_H = 3.0      # place_layer.BASE_VISIT_H["village"]: the prior
MEMBER_MODEL = {
    "version": "members_v1",
    "source": "wikidata_landmarks box harvest (settlement types) + geonames "
              "fallback for seeded names",
    "fields": {"name": "settlement name", "lat": "...", "lon": "...",
               "desc": "Wikidata short description, absent when unknown",
               "wiki": "English article, absent when unknown",
               "sitelinks": "language-neutral notability",
               "visit_h": "village prior, 3.0",
               "parent_id": "the area destination this member lives in"},
    "no_tier": "members never carry a tier badge unless promoted",
}

# The obvious sets (PLAN.md B1) - required members per parent.
SEEDS = {
    "gem:amalfi-coast": ["Positano", "Amalfi", "Ravello", "Praiano"],
    "gem:cinque-terre": ["Vernazza", "Manarola", "Riomaggiore",
                         "Monterosso", "Corniglia"],
    "gem:como": ["Bellagio", "Varenna", "Menaggio", "Tremezzo"],
    "gem:provence-luberon": ["Gordes", "Roussillon", "Ménerbes",
                             "Bonnieux", "Lourmarin"],
}


def fold(s):
    s = (s or "").translate(str.maketrans({"ł": "l", "Ł": "l",
                                           "ø": "o", "ß": "ss"}))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return s.lower().strip()


def base_name(city):
    """'Luberon (Gordes)' -> ('luberon', 'Gordes')."""
    city = city or ""
    if "(" in city and city.endswith(")"):
        outer, inner = city.split("(", 1)
        return outer.strip(), inner[:-1].strip()
    return city.strip(), None


def load_geonames_index():
    """(by_name, grid): folded name -> row, plus 0.2-degree buckets.

    One pass over cities500; each row is (name, lat, lon, population). The
    grid serves the distance top-up: an island area whose Wikidata box held
    no typed settlements still has real villages with coordinates here.
    """
    by_name, grid = {}, {}
    if not GEONAMES.exists():
        return by_name, grid
    with GEONAMES.open(encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t"):
            if len(row) < 15:
                continue
            try:
                rec = (row[1], float(row[4]), float(row[5]), int(row[14] or 0))
            except ValueError:
                continue
            by_name.setdefault(fold(rec[0]), rec)
            grid.setdefault((int(rec[1] / 0.2), int(rec[2] / 0.2)), []).append(rec)
    return by_name, grid


def geonames_near(grid, lat, lon, km=15.0):
    """cities500 rows within km of a point, largest population first."""
    import math
    out = []
    bi, bj = int(lat / 0.2), int(lon / 0.2)
    # +-2 buckets: at northern latitudes a 0.2-degree lon bucket is ~11 km,
    # and a 30 km radius must not lose its corners to the grid
    for i in range(bi - 2, bi + 3):
        for j in range(bj - 3, bj + 4):
            for name, la, lo, pop in grid.get((i, j), ()):
                dp = math.radians(la - lat)
                dl = math.radians(lo - lon)
                a = (math.sin(dp / 2) ** 2 + math.cos(math.radians(lat))
                     * math.cos(math.radians(la)) * math.sin(dl / 2) ** 2)
                d = 2 * 6371 * math.asin(min(1.0, math.sqrt(a)))
                if d <= km:
                    out.append((pop, name, la, lo))
    out.sort(reverse=True)
    return out


def candidates_for(did, lm, taken_names):
    """Settlement rows near one area, deduped, most notable first."""
    seen, out = set(), []
    for row in lm.get(did) or []:
        try:
            qid, lat, lon, sl, _img, art, label, sdesc, types = row
        except (TypeError, ValueError):
            continue
        if not label or qid in seen:
            continue
        if not any(t in SETTLEMENT_TYPES for t in types or ()):
            continue
        if fold(label) in taken_names:
            continue
        seen.add(qid)
        out.append({"name": label, "lat": round(lat, 5), "lon": round(lon, 5),
                    "sitelinks": sl,
                    **({"desc": sdesc} if sdesc else {}),
                    **({"wiki": art} if art else {})})
    out.sort(key=lambda m: -m["sitelinks"])
    return out


def build_members(dests):
    lm = json.loads(LM_CACHE.read_text(encoding="utf-8"))
    geo, geo_grid = load_geonames_index()

    # a member may not shadow a real destination of the same country
    dest_names = {}
    for d in dests.values():
        dest_names.setdefault(d.get("iso2"), set()).add(
            fold(base_name(d.get("city"))[0]))

    out = {}
    for did, d in dests.items():
        # PLAN.md's list includes Luberon, which the place layer classes as
        # a village: seeded parents are containers whatever their class says.
        if (d.get("place") or {}).get("class") != "area" and did not in SEEDS:
            continue
        outer, inner = base_name(d.get("city"))
        taken = set(dest_names.get(d.get("iso2"), set())) | {fold(outer)}
        cands = candidates_for(did, lm, taken)
        by_fold = {fold(c["name"]): c for c in cands}

        members, used = [], set()

        def duplicate_of_existing(m):
            key = fold(m["name"])
            for prev in members:
                pkey = fold(prev["name"])
                # 'Monterosso' / 'Monterosso al Mare' are one village: one
                # folded name containing the other means a spelling, not a
                # second place...
                if key.startswith(pkey) or pkey.startswith(key):
                    return True
                # ...and so does a second point within ~500 m (Cinque Terre's
                # villages sit 1.5 km apart; the radius must stay under that)
                if (abs(prev["lat"] - m["lat"]) < 0.005
                        and abs(prev["lon"] - m["lon"]) < 0.008):
                    return True
            return False

        def add(m):
            key = fold(m["name"])
            if key in used or duplicate_of_existing(m):
                return
            used.add(key)
            members.append({**m, "visit_h": VILLAGE_VISIT_H, "parent_id": did})

        # required first: the parenthesised name, then the seeded set
        for req in ([inner] if inner else []) + SEEDS.get(did, []):
            hit = by_fold.get(fold(req))
            if hit:
                add(hit)
            elif fold(req) in geo:
                name, lat, lon, _pop = geo[fold(req)]
                add({"name": req, "lat": round(lat, 5), "lon": round(lon, 5),
                     "sitelinks": 0})
        for c in cands:
            if len(members) >= MAX_MEMBERS:
                break
            add(c)
        # Thin container: top up from cities500 by distance, most people
        # first - a real settlement with coordinates, shipped without a
        # description rather than with an invented one.
        if len(members) < MIN_MEMBERS:
            lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
            lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
            if lat is not None and lon is not None:
                # 30 km for the top-up: a rift valley or a cape has no village
                # at 15, and a member half an hour away still orients the
                # page. If even that leaves NOTHING (Luskentyre: the nearest
                # cities500 entry in the Outer Hebrides is 39 km away), one
                # rescue pass at 60 km - only then, so an island area never
                # pulls the mainland across the water just to look fuller.
                for radius in (30.0, 60.0):
                    for _pop, name, la, lo in geonames_near(geo_grid, lat, lon,
                                                            km=radius):
                        if len(members) >= MAX_MEMBERS:
                            break
                        if fold(name) in taken:
                            continue
                        add({"name": name, "lat": round(la, 5),
                             "lon": round(lo, 5), "sitelinks": 0})
                    if members:
                        break
        if members:
            out[did] = members
    return out


def main():
    report_only = "--report" in sys.argv
    master = TARGETS[0]
    data = json.loads(master.read_text(encoding="utf-8"))
    dests = data["destinations"]

    members = build_members(dests)

    # the done-when population: parenthesised areas and the seeded ones
    must = [did for did, d in dests.items()
            if (d.get("place") or {}).get("class") == "area"
            and ("(" in (d.get("city") or "") or did in SEEDS)]
    thin = {did: len(members.get(did, []))
            for did in must if len(members.get(did, [])) < MIN_MEMBERS}
    total = sum(len(v) for v in members.values())
    print(f"{len(members)} area destinations get members ({total} members); "
          f"{len(must)} must-have areas, {len(thin)} below {MIN_MEMBERS}")
    if thin:
        names = {did: dests[did].get("city") for did in list(thin)[:10]}
        print("  thin:", {names[k]: v for k, v in list(thin.items())[:10]})
    for did in SEEDS:
        got = [m["name"] for m in members.get(did, [])]
        print(f"  {dests[did]['city']}: {got}")

    if report_only:
        return
    # The floor is min(MIN_MEMBERS, what the sources can reach): around
    # Thingvellir or Nordkapp there are no three settlements of 500+ people
    # within 30 km, because there are barely three settlements at all. A
    # member cannot be invented, so an empty-land area ships the members
    # that exist - every one of them still real, located and named.
    hard = {did: n for did, n in thin.items() if n == 0}
    if hard:
        raise SystemExit(f"areas with NO members at all: {hard} - the "
                         "sources are broken, not the land")

    for did, d in dests.items():
        if did in members:
            d["members"] = members[did]
        elif "members" in d:
            del d["members"]
    data["meta"]["member_model"] = MEMBER_MODEL
    atomic_write_json(master, data)
    print(f"{master.name}: members written")

    served_path = TARGETS[1]
    served = json.loads(served_path.read_text(encoding="utf-8"))
    n = 0
    for did, d in served.get("destinations", {}).items():
        if did in members:
            d["members"] = members[did]
            n += 1
        elif "members" in d:
            del d["members"]
    served["meta"]["member_model"] = MEMBER_MODEL
    atomic_write_json(served_path, served, indent=None, separators=(",", ":"))
    print(f"{served_path.name}: members mirrored onto {n} areas")


if __name__ == "__main__":
    main()
