"""build_place_candidates.py - the candidate universe for catalogue coverage.

Carta's catalogue grew by hand: agents proposed gems, a human waved them
through. That works until it doesn't, and it didn't: Mougins (19,782 people,
a perched village above Cannes with 58 Wikipedia languages and a Picasso
museum) was simply never proposed, so it was never in. There was no way to
KNOW it was missing, because nothing ever enumerated what "everything" is.

This script enumerates it. Offline, from data already on disk, it builds one
row per plausible European destination and measures how well the existing
catalogue covers it. No network, no judgement calls - just the universe, its
sightseeing weight, and the distance to the nearest thing we already ship.

Three discovery tracks, unioned:

  settlements  cache/geonames_cities500.txt - every European populated place
               GeoNames knows (>= 500 people, or the seat of an admin unit).
               ~89k rows. This is the backbone: named, populated, coordinates.

  clusters     cache/overture_pois_eu.parquet - 807k sightseeing POIs across
               Europe, grid-clustered. A dense cluster with no settlement on
               top of it is a natural or monumental destination in its own
               right (a national park, an abbey, a beach, a ruin), which the
               settlement track can never see.

  designated   data/derived/place_registry.json, when present - places carrying
               an authoritative designation (most-beautiful-village
               associations, UNESCO, heritage towns, spa towns). Written by
               harvest_place_signals.py; absent on a first run, and the script
               says so rather than failing.

For every candidate it computes, from the Overture corpus:

  own          category-weighted mass of the POIs this place WINS, assigned
               nearest-candidate-first (a Voronoi split, capped at 5 km).
               This is the number that matters, and the split is the whole
               trick: measuring POIs in a plain radius made every Paris
               suburb outrank every village in Provence, because a radius
               around Levallois-Perret is mostly Paris. Under the split,
               Paris keeps the Louvre and Levallois keeps what is actually
               in Levallois, which is not much.
  ring         mass within 8 km that this place did NOT win - the context, so
               a village beside an abbey still reads as worth the trip
  top_cats     which categories carry that weight, so the report can say WHY
  n_own        raw count of POIs won, the honest denominator

and against the shipped catalogue (app_data/app_data.json):

  near_id      the closest existing destination
  near_km      how far away it is

A candidate is only interesting if it is BOTH worth going to and not already
covered by something we ship, and those are different questions, so both
numbers travel forward untouched. The gating happens in
score_place_candidates.py, which can be re-tuned without re-running this.

Output: data/derived/place_candidates.json
    {"meta": {...}, "candidates": [ {...}, ... ]}

Usage:
    python pipeline/build_place_candidates.py
    python pipeline/build_place_candidates.py --min-pop 200 --countries FR,IT
"""
import argparse
import io
import json
import math
import sys
import time
from collections import defaultdict
from pathlib import Path

from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
GEONAMES = ROOT / "cache" / "geonames_cities500.txt"
OVERTURE = ROOT / "cache" / "overture_pois_eu.parquet"
REGISTRY = ROOT / "data" / "derived" / "place_registry.json"
OUT = ROOT / "data" / "derived" / "place_candidates.json"

# The 43 countries Carta prices, by ISO2. A candidate outside them cannot be
# promoted, so it is not worth carrying through the pipeline.
COUNTRIES = {
    "AD", "AL", "AT", "BA", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE",
    "ES", "FI", "FO", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI",
    "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT",
    "RO", "RS", "SE", "SI", "SK", "SM", "XK",
}

# GeoNames feature codes worth keeping: populated places and their seats.
# PPLX (section of a city) and PPLL (populated locality) stay in - plenty of
# real destinations are administratively a district of somewhere bigger.
KEEP_FCODES = {
    "PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5", "PPLC", "PPLG",
    "PPLL", "PPLS", "PPLX",
}

# What a sightseeing POI is worth. Overture's taxonomy is uneven - it has one
# bucket for every historical building and a separate one for castles - so the
# weights encode "how much does the presence of this pull a traveller here".
# A castle is a reason to come; a park is somewhere to sit once you have.
CAT_WEIGHT = {
    "castle": 3.0,
    "palace": 3.0,
    "national_park": 2.5,
    "monument": 2.0,
    "landmark_and_historical_building": 1.5,
    "museum": 1.5,
    "history_museum": 1.5,
    "art_museum": 1.5,
    "beach": 1.5,
    "science_museum": 1.0,
    "aquarium": 1.0,
    "zoo": 1.0,
    "botanical_garden": 0.8,
    "church_cathedral": 0.8,
    "attractions_and_activities": 0.8,
    "theatre": 0.6,
    "art_gallery": 0.6,
    "performing_arts": 0.5,
    "park": 0.5,
    "community_museum": 0.5,
}
CAT_WEIGHT_DEFAULT = 0.5

OWN_KM = 5.0           # furthest a POI can be and still belong to a place
RING_KM = 8.0          # what a stay there puts within reach
RING_WEIGHT = 0.35     # a POI you must drive to counts, but counts less

# Urban footprint of a settlement, from its population: roughly how far its
# own built-up area reaches. Used to tell "a village near a city" from "a
# district of that city". Paris (2.1M) -> 25 km, Cannes (74k) -> 7.3 km,
# a 2k village -> 2 km. Districts are not excluded outright - Mougins sits
# 5.7 km from Cannes and is emphatically its own place - only flagged, so
# the scorer can demand independent evidence (a designation, its own
# Wikipedia article) before ranking one as a destination.
URBAN_A = 1.2
URBAN_B = 0.42
URBAN_MIN_KM = 1.5
URBAN_MAX_KM = 25.0
DISTRICT_POP_RATIO = 5.0    # neighbour must be this much bigger to absorb you

# Grid cell for the POI spatial index, in degrees. 0.1 deg of latitude is
# ~11 km, comfortably wider than RING_KM at every European latitude once the
# longitude scan widens with the cosine.
CELL = 0.1

# Cluster track: POIs are binned to this grid and a bin heavy enough to matter
# with no settlement candidate near it becomes a candidate of its own.
CLUSTER_CELL = 0.05    # ~5.5 km lat
CLUSTER_MIN_WEIGHT = 8.0
CLUSTER_MIN_SETTLEMENT_KM = 6.0
# ...but not SO far from one that it is outside the covered countries. The
# Overture extract reaches to lon 45 / lat 71, so it carries Moscow, Istanbul
# and Murmansk POIs that have no settlement of ours anywhere near them. Without
# this bound they cluster happily and get filed under Finland.
CLUSTER_MAX_SETTLEMENT_KM = 35.0


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def load_pois():
    """Overture sightseeing POIs -> (lats, lons, cats, names, weights)."""
    try:
        import pyarrow.parquet as pq
    except ImportError:
        raise SystemExit("pyarrow is required: pip install pyarrow")
    if not OVERTURE.exists():
        raise SystemExit(f"missing POI corpus: {OVERTURE}")
    t = pq.read_table(OVERTURE)
    lats = t.column("lat").to_pylist()
    lons = t.column("lon").to_pylist()
    cats = t.column("cat").to_pylist()
    names = t.column("name").to_pylist()
    weights = [CAT_WEIGHT.get(c, CAT_WEIGHT_DEFAULT) for c in cats]
    return lats, lons, cats, names, weights


def build_index(lats, lons):
    """(cell_lat, cell_lon) -> [poi index]."""
    idx = defaultdict(list)
    for i in range(len(lats)):
        idx[(int(math.floor(lats[i] / CELL)), int(math.floor(lons[i] / CELL)))].append(i)
    return idx


def cells_within(lat, lon, km):
    """Every grid cell that can hold a point within ``km`` of (lat, lon)."""
    dlat = km / 111.0
    dlon = km / max(1e-6, 111.0 * math.cos(math.radians(lat)))
    lo_a = int(math.floor((lat - dlat) / CELL))
    hi_a = int(math.floor((lat + dlat) / CELL))
    lo_o = int(math.floor((lon - dlon) / CELL))
    hi_o = int(math.floor((lon + dlon) / CELL))
    for a in range(lo_a, hi_a + 1):
        for o in range(lo_o, hi_o + 1):
            yield (a, o)


def urban_radius_km(pop):
    """How far a settlement of ``pop`` people sprawls, roughly."""
    if not pop or pop <= 0:
        return URBAN_MIN_KM
    r = URBAN_A * (pop / 1000.0) ** URBAN_B
    return max(URBAN_MIN_KM, min(URBAN_MAX_KM, r))


def assign_pois(cands, lats, lons, cats, weights):
    """Give every POI to its nearest candidate, within OWN_KM.

    A plain radius double-counts: one POI feeds every candidate around it, so
    a place surrounded by a big city inherits that city's whole skyline. The
    nearest-wins split makes the mass conserved instead - each POI is somebody's
    and only somebody's - which is what turns "POIs near here" into "sights
    this place actually has".
    """
    cand_idx = defaultdict(list)
    for j, c in enumerate(cands):
        cand_idx[(int(math.floor(c["lat"] / CELL)),
                  int(math.floor(c["lon"] / CELL)))].append(j)

    own_w = [0.0] * len(cands)
    own_n = [0] * len(cands)
    by_cat = [defaultdict(float) for _ in cands]
    owner = [-1] * len(lats)

    for i in range(len(lats)):
        best_j, best_d = -1, OWN_KM
        for cell in cells_within(lats[i], lons[i], OWN_KM):
            for j in cand_idx.get(cell, ()):
                c = cands[j]
                d = haversine(lats[i], lons[i], c["lat"], c["lon"])
                if d < best_d:
                    best_j, best_d = j, d
        if best_j >= 0:
            owner[i] = best_j
            own_w[best_j] += weights[i]
            own_n[best_j] += 1
            by_cat[best_j][cats[i]] += weights[i]
    return own_w, own_n, by_cat, owner


def ring_mass(lat, lon, j, idx, lats, lons, weights, owner):
    """Weighted mass within RING_KM that this candidate did NOT win."""
    total = 0.0
    n = 0
    for cell in cells_within(lat, lon, RING_KM):
        for i in idx.get(cell, ()):
            if owner[i] == j:
                continue
            if haversine(lat, lon, lats[i], lons[i]) <= RING_KM:
                total += weights[i]
                n += 1
    return round(total * RING_WEIGHT, 2), n


def load_catalogue():
    """Shipped destinations as (id, city, iso2, lat, lon), city-centre first."""
    data = load_json(MASTER)
    out = []
    for did, d in (data.get("destinations") or {}).items():
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        if lat is None or lon is None:
            continue
        out.append((did, d.get("city"), d.get("iso2"), float(lat), float(lon)))
    return out


def nearest_dest(lat, lon, cat_idx, cat_rows):
    """Closest shipped destination to a point, searched outward by ring."""
    best = (None, None, 1e9)
    for km in (10.0, 30.0, 120.0, 600.0):
        for cell in cells_within(lat, lon, km):
            for j in cat_idx.get(cell, ()):
                did, city, iso2, dlat, dlon = cat_rows[j]
                d = haversine(lat, lon, dlat, dlon)
                if d < best[2]:
                    best = (did, city, d)
        if best[0] is not None and best[2] <= km:
            break
    return best


def read_geonames(min_pop, countries):
    """Yield settlement candidates from the GeoNames cities500 extract."""
    if not GEONAMES.exists():
        raise SystemExit(f"missing gazetteer: {GEONAMES}")
    with io.open(GEONAMES, encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) < 15 or p[8] not in countries or p[7] not in KEEP_FCODES:
                continue
            try:
                pop = int(p[14] or 0)
                lat, lon = float(p[4]), float(p[5])
            except ValueError:
                continue
            if pop < min_pop:
                continue
            yield {
                "key": f"gn:{p[0]}",
                "track": "settlement",
                "name": p[1],
                "ascii": p[2],
                "alt": [a for a in (p[3] or "").split(",") if a][:12],
                "iso2": p[8],
                "admin1": p[10] or None,
                "lat": lat,
                "lon": lon,
                "pop": pop,
                "fcode": p[7],
                "geonameid": int(p[0]),
            }


def cluster_candidates(lats, lons, weights, names, cands, cat_rows):
    """POI clusters with no settlement candidate on them.

    A heavy grid bin far from every settlement candidate AND every shipped
    destination is a destination the settlement track structurally cannot
    see: a national park, a cliff coast, an abbey in a field.

    It must also be near ENOUGH to a settlement of ours to be in a country we
    price. The POI extract runs to lon 45 / lat 71, so it carries Moscow,
    Istanbul and Murmansk; without the upper bound those cluster cleanly and
    get filed under whichever of our countries happens to be least far away.
    """
    bins = defaultdict(lambda: {"w": 0.0, "n": 0, "lat": 0.0, "lon": 0.0, "names": []})
    for i in range(len(lats)):
        k = (int(math.floor(lats[i] / CLUSTER_CELL)),
             int(math.floor(lons[i] / CLUSTER_CELL)))
        b = bins[k]
        b["w"] += weights[i]
        b["n"] += 1
        b["lat"] += lats[i]
        b["lon"] += lons[i]
        if len(b["names"]) < 6:
            b["names"].append(names[i])

    # One index over everything that already speaks for a place: our settlement
    # candidates (which carry the ISO code) and the shipped destinations.
    anchors = defaultdict(list)
    for c in cands:
        anchors[(int(math.floor(c["lat"] / CELL)),
                 int(math.floor(c["lon"] / CELL)))].append((c["lat"], c["lon"], c["iso2"]))
    for _did, _city, iso2, dlat, dlon in cat_rows:
        anchors[(int(math.floor(dlat / CELL)),
                 int(math.floor(dlon / CELL)))].append((dlat, dlon, iso2))

    out = []
    for (a, o), b in bins.items():
        if b["w"] < CLUSTER_MIN_WEIGHT:
            continue
        lat = b["lat"] / b["n"]
        lon = b["lon"] / b["n"]
        iso2, near = None, 1e9
        for cell in cells_within(lat, lon, CLUSTER_MAX_SETTLEMENT_KM):
            for slat, slon, siso in anchors.get(cell, ()):
                dd = haversine(lat, lon, slat, slon)
                if dd < near:
                    iso2, near = siso, dd
        if not (CLUSTER_MIN_SETTLEMENT_KM < near <= CLUSTER_MAX_SETTLEMENT_KM):
            continue
        out.append({
            "key": f"cl:{a}_{o}",
            "track": "cluster",
            "name": b["names"][0] if b["names"] else f"cluster {a}/{o}",
            "ascii": None,
            "alt": b["names"][1:5],
            "iso2": iso2,
            "admin1": None,
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "pop": 0,
            "fcode": None,
            "geonameid": None,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-pop", type=int, default=0,
                    help="drop settlements below this population (0 = keep all)")
    ap.add_argument("--countries", default="",
                    help="comma-separated ISO2 subset, for a fast partial run")
    ap.add_argument("--no-clusters", action="store_true",
                    help="skip the POI-cluster track")
    args = ap.parse_args()

    countries = ({c.strip().upper() for c in args.countries.split(",") if c.strip()}
                 or COUNTRIES)

    t0 = time.time()
    print(f"loading POI corpus {OVERTURE.name} ...")
    lats, lons, cats, names, weights = load_pois()
    print(f"  {len(lats):,} POIs, {time.time() - t0:.1f}s")

    idx = build_index(lats, lons)
    print(f"  spatial index: {len(idx):,} cells")

    cat_rows = load_catalogue()
    cat_idx = defaultdict(list)
    for j, (_did, _city, _iso2, dlat, dlon) in enumerate(cat_rows):
        cat_idx[(int(math.floor(dlat / CELL)), int(math.floor(dlon / CELL)))].append(j)
    print(f"  catalogue: {len(cat_rows):,} shipped destinations")

    cands = list(read_geonames(args.min_pop, countries))
    print(f"  settlements: {len(cands):,} from GeoNames")

    if not args.no_clusters:
        clusters = cluster_candidates(lats, lons, weights, names, cands, cat_rows)
        print(f"  clusters:    {len(clusters):,} unsettled POI clusters")
        cands.extend(clusters)

    registry = load_json(REGISTRY)
    reg_by_key = {}
    if registry:
        for r in registry.get("places") or []:
            reg_by_key[r.get("key")] = r
        print(f"  registry:    {len(reg_by_key):,} designated places")
    else:
        print("  registry:    (none yet - run harvest_place_signals.py)")

    print("splitting POIs nearest-candidate-wins ...")
    t1 = time.time()
    own_w, own_n, by_cat, owner = assign_pois(cands, lats, lons, cats, weights)
    assigned = sum(1 for o in owner if o >= 0)
    print(f"  {assigned:,}/{len(owner):,} POIs assigned  {time.time() - t1:.0f}s")

    print("measuring ring context, parent city + catalogue distance ...")
    t1 = time.time()
    pop_idx = defaultdict(list)
    for j, c in enumerate(cands):
        if c["pop"] > 0:
            pop_idx[(int(math.floor(c["lat"] / CELL)),
                     int(math.floor(c["lon"] / CELL)))].append(j)

    for n, c in enumerate(cands, 1):
        j = n - 1
        c["own"] = round(own_w[j], 2)
        c["n_own"] = own_n[j]
        c["ring"], c["n_ring"] = ring_mass(
            c["lat"], c["lon"], j, idx, lats, lons, weights, owner)
        top = sorted(by_cat[j].items(), key=lambda kv: -kv[1])[:5]
        c["top_cats"] = [{"cat": k, "w": round(w, 2)} for k, w in top]
        # Concentration: what share of this place's sightseeing weight sits in
        # its single biggest category. A resort strip is 90% "beach"; a real
        # town spreads across churches, museums, a castle and a park. The
        # scorer uses this to stop 40 mapped beach segments outranking a
        # cathedral city.
        tot = sum(by_cat[j].values())
        c["cat_top_share"] = round(max(by_cat[j].values()) / tot, 3) if tot > 0 else 0.0
        c["n_cats"] = len(by_cat[j])
        # Coastal places carry ~3x the mapped sightseeing weight of inland
        # places the same size, because every beach is a separate POI. The
        # scorer needs to know, or every seaside town reads as a phenomenon.
        beach = by_cat[j].get("beach", 0.0)
        c["coastal"] = beach > 0
        c["beach_share"] = round(beach / tot, 3) if tot > 0 else 0.0

        # Parent city: the nearest settlement big enough to absorb this one,
        # close enough to be the same built-up area.
        parent = None
        for cell in cells_within(c["lat"], c["lon"], URBAN_MAX_KM):
            for k in pop_idx.get(cell, ()):
                if k == j:
                    continue
                o = cands[k]
                if o["pop"] < max(5000, c["pop"] * DISTRICT_POP_RATIO):
                    continue
                d = haversine(c["lat"], c["lon"], o["lat"], o["lon"])
                if d <= urban_radius_km(o["pop"]) and (parent is None or d < parent[2]):
                    parent = (o["name"], o["pop"], d)
        if parent:
            c["parent_city"] = parent[0]
            c["parent_km"] = round(parent[2], 2)
        c["is_section"] = c.get("fcode") in ("PPLX", "PPLL", "PPLS")

        did, city, km = nearest_dest(c["lat"], c["lon"], cat_idx, cat_rows)
        c["near_id"] = did
        c["near_city"] = city
        c["near_km"] = round(km, 2) if did else None
        reg = reg_by_key.get(c["key"])
        if reg:
            c["designations"] = reg.get("designations") or []
            c["qid"] = reg.get("qid")
        if n % 20000 == 0:
            print(f"  {n:,}/{len(cands):,}  {time.time() - t1:.0f}s")

    payload = {
        "meta": {
            "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "n_candidates": len(cands),
            "n_pois": len(lats),
            "n_catalogue": len(cat_rows),
            "countries": sorted(countries),
            "params": {
                "own_km": OWN_KM, "ring_km": RING_KM,
                "ring_weight": RING_WEIGHT, "min_pop": args.min_pop,
                "cluster_min_weight": CLUSTER_MIN_WEIGHT,
                "district_pop_ratio": DISTRICT_POP_RATIO,
                "urban_radius": [URBAN_A, URBAN_B, URBAN_MIN_KM, URBAN_MAX_KM],
            },
            "cat_weight": CAT_WEIGHT,
        },
        "candidates": cands,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(OUT, payload)
    print(f"wrote {OUT.relative_to(ROOT)}  "
          f"({len(cands):,} candidates, {OUT.stat().st_size / 1e6:.1f} MB, "
          f"{time.time() - t0:.0f}s total)")


if __name__ == "__main__":
    main()
