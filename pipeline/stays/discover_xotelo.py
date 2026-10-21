"""Discover Xotelo/TripAdvisor properties near every Carta destination.

Pass 1 (country): list every country by three sort orders (popularity,
best_value, distance), up to Xotelo's 3,000 cap each. Each property URL carries
its own town geo id, so this also finds the town ids that /api/search would
need a RapidAPI key for.

Pass 2 (towns): every town geo id that sits on a destination is listed in full
(up to --town-cap properties), which reaches the guesthouses and hostels the
country lists rank too low.

Writes (state, never published):
  xotelo_props.json   {key: property}            the candidate pool
  xotelo_towns.json   {geo: {slug, lat, lon, n}} town centroids
  dest_xotelo.json    {dest_id: {geo, km}}       destination -> town geo id

Usage:
  python pipeline/stays/discover_xotelo.py --verify          # check COUNTRY_GEO
  python pipeline/stays/discover_xotelo.py --countries IT,MT # pass 1 + 2
  python pipeline/stays/discover_xotelo.py                   # every country
"""

import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (STATE, haversine_km, footprint_km, load_destinations,  # noqa: E402
                    median, now_iso, read_json, write_json)
from xotelo import COUNTRY_GEO, Blocked, Client, parse_property  # noqa: E402

PROPS = STATE / "xotelo_props.json"
TOWNS = STATE / "xotelo_towns.json"
DEST_GEO = STATE / "dest_xotelo.json"
SORTS = ("popularity", "best_value", "distance")


def verify(client):
    bad = []
    for cc in COUNTRY_GEO:
        for geo in country_geos(cc):
            res = client.list(geo, limit=5)
            lst = (res or {}).get("list") or []
            tails = [(p.get("url") or "").rsplit("-", 1)[-1] for p in lst]
            print(f"{cc} {geo} total={res and res.get('total_count')} "
                  f"tail={tails[:2]}")
            if not lst:
                bad.append(cc)
    print("no results:", bad or "none")
    return bad


def country_geos(cc):
    g = COUNTRY_GEO.get(cc) or []
    return [g] if isinstance(g, str) else list(g)


def list_all(client, geo, cap, props, sorts=SORTS):
    seen = 0
    for sort in sorts:
        offset = 0
        while offset < cap:
            res = client.list(geo, offset=offset, sort=sort)
            lst = (res or {}).get("list") or []
            for p in lst:
                q = parse_property(p)
                if q["key"] and q["lat"] is not None:
                    q["seen"] = now_iso()[:10]
                    props[q["key"]] = q
                    seen += 1
            total = (res or {}).get("total_count") or 0
            offset += 100
            if len(lst) < 100 or offset >= total:
                break
    return seen


def towns_from(props):
    acc = defaultdict(lambda: {"lat": [], "lon": [], "slug": None})
    for p in props.values():
        g = p.get("town_geo")
        if not g:
            continue
        a = acc[g]
        a["lat"].append(p["lat"])
        a["lon"].append(p["lon"])
        a["slug"] = a["slug"] or p.get("town_slug")
    return {g: {"slug": a["slug"], "lat": median(a["lat"]),
                "lon": median(a["lon"]), "n": len(a["lat"])}
            for g, a in acc.items()}


def norm(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if c.isalnum()).lower()


def match_dests(dests, towns):
    """Nearest town centroid inside the footprint (+3 km), a name match wins."""
    out = {}
    tl = list(towns.items())
    for d in dests:
        fp = footprint_km(d) + 3.0
        best = None
        for g, t in tl:
            if abs(t["lat"] - d["lat"]) > 0.2 or abs(t["lon"] - d["lon"]) > 0.3:
                continue
            km = haversine_km(d["lat"], d["lon"], t["lat"], t["lon"])
            if km > fp:
                continue
            named = norm(d["city"]) and norm(d["city"]) in norm(t["slug"])
            score = (0 if named else 1, km)
            if best is None or score < best[0]:
                best = (score, g, km)
        if best:
            out[d["id"]] = {"geo": best[1], "km": round(best[2], 1)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--countries", default="")
    ap.add_argument("--country-cap", type=int, default=3000)
    ap.add_argument("--town-cap", type=int, default=400)
    ap.add_argument("--skip-countries", action="store_true",
                    help="reuse the saved pool, only run pass 2")
    a = ap.parse_args()
    client = Client()
    if a.verify:
        verify(client)
        return
    want = [c for c in a.countries.split(",") if c] or list(COUNTRY_GEO)
    dests = [d for d in load_destinations() if d["iso2"] in want]
    props = read_json(PROPS, {}) or {}
    try:
        if not a.skip_countries:
            for cc in want:
                n = sum(list_all(client, g, a.country_cap, props)
                        for g in country_geos(cc))
                print(f"[country] {cc}: {n} rows, pool {len(props)}, "
                      f"calls {client.calls}", flush=True)
                write_json(PROPS, props, compact=True)
        towns = towns_from(props)
        dest_geo = match_dests(dests, towns)
        for i, geo in enumerate(sorted({v["geo"] for v in dest_geo.values()})):
            list_all(client, geo, a.town_cap, props, sorts=("popularity",))
            if i % 25 == 0:
                print(f"[town] {i} pool {len(props)} calls {client.calls}",
                      flush=True)
                write_json(PROPS, props, compact=True)
    except Blocked as e:
        print("Xotelo refused:", e, "- saving what we have")
    write_json(PROPS, props, compact=True)
    towns = towns_from(props)
    write_json(TOWNS, towns, compact=True)
    old = read_json(DEST_GEO, {}) or {}
    old.update(match_dests(load_destinations(), towns))
    write_json(DEST_GEO, old)
    near = sum(1 for d in dests if any(
        haversine_km(d["lat"], d["lon"], p["lat"], p["lon"]) <= footprint_km(d)
        for p in props.values()
        if abs(p["lat"] - d["lat"]) < 0.15 and abs(p["lon"] - d["lon"]) < 0.2))
    print(f"done: pool {len(props)} properties, {len(towns)} towns, "
          f"{len(old)} destinations with a town id, {near}/{len(dests)} "
          f"destinations with properties in their footprint, "
          f"{client.calls} calls")


if __name__ == "__main__":
    main()
