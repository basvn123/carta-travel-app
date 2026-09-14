"""Cross-layer neighbours: one spatial pass that lets six wires speak.

Brief 08's lead 01. BeachPage, LakePage, MountainPage, TrailPage, CyclePage
and TripPage each read their own wire and no other layer's: a mountain does
not list the trails that climb it, a beach does not mention the published
coastal walk beside it. This module runs AFTER every layer has exported and
writes neighbour ids into each published row, so five catalogues become one
place for the cost of a build-time pass.

Wire contract
-------------
Each row (rated and listed) gains an `nb` object of neighbour id lists:

    "nb": {"trail": ["65085", "21526"], "lake": ["si-lake-bled-Q648902"]}

Keys are the layer short names (beach, lake, peak, trail, cycle). Ids are the
neighbour's own wire id in the SAME country file, which the page has already
loaded - the app resolves ids locally and never makes a geo query. Empty
lists are omitted; a row with no neighbours carries no `nb` at all.

Trips are the exception in two ways: their neighbours are computed per STOP
(a trip through Austria should link the lakes near each base, not near the
route centroid), and a stop may sit in another country, so each stop's `nb`
is resolved against the STOP's own iso2 and written into the trip DETAIL
file (public/trips/trip/<id>.json), next to the stop's coordinates.

Cycling tours get an `nb` over the whole tour line (the per-stage split can
come later); it lands on the tour row in the country file.

Deliberate deviations from the brief, recorded here because they are design:
  * The key is `nb`, not `near`. Mountain rated rows already ship `near` as
    the nearest trip-priceable hub ({city, dest_id, km}) and MountainPage
    reads it; reusing the name would clobber a live feature.
  * Point-layer joins are same-country only. A Belgian beach will not list a
    Dutch trail 2 km over the border; fixing that needs cross-file id
    resolution in the app first. Trips already cross borders per stop.
  * Neighbour ranking is rated-first (score desc), then distance, then id -
    so listed rows only surface where nothing rated is close, and a warm
    rebuild is byte-identical (invariant 1).

Radii and limits ship with the data (invariant 2): every full run writes
`continent-app/public/joins.json` with the rule table, the model version and
per-layer stamp counts, so the wire says what produced its `nb` fields.

Usage, from the repo root:
    python pipeline/joins/neighbours.py                 # every country
    python pipeline/joins/neighbours.py --countries SI,AT --verbose
    python pipeline/joins/neighbours.py --dry-run       # count, write nothing
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import transform as shp_transform
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "continent-app" / "public"

if sys.platform == "win32":  # place names in progress lines (cp1252 consoles)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Layer -> (wire dir, rated array, listed array). Trips are handled apart.
LAYERS = {
    "beach": ("beaches", "beaches", "listed"),
    "lake": ("lakes", "lakes", "listed"),
    "peak": ("mountains", "mountains", "listed"),
    "trail": ("trails", "trips", "listed"),
    "cycle": ("cycling", "routes", "listed"),
}

# (src layer, dst layer) -> (radius km, max ids). '*' = every other layer.
# Straight from brief 08 SS1.1, with the brief's 'mountain' spelled 'peak'
# (the master spec's own key set) and 'cycling' spelled 'cycle'.
RULES = {
    ("beach", "trail"): (5, 4),
    ("beach", "beach"): (15, 4),
    ("beach", "cycle"): (3, 3),
    ("lake", "trail"): (4, 4),
    ("lake", "peak"): (15, 4),
    ("peak", "trail"): (6, 6),
    ("peak", "peak"): (20, 5),
    ("trail", "beach"): (3, 3),
    ("trail", "lake"): (2, 4),
    ("trail", "peak"): (3, 4),
    ("cycle", "*"): (5, 6),
}
TRIP_RULE = (25, 8)  # per stop, per destination layer
MODEL_VERSION = "joins_v1"

_TX = Transformer.from_crs(4326, 3035, always_xy=True).transform


def _proj(geom):
    return shp_transform(_TX, geom)


def _row_geom(layer, row):
    if layer in ("trail", "cycle"):
        g = row.get("geometry")
        if isinstance(g, dict) and g.get("coordinates"):
            try:
                if g.get("type") == "MultiLineString":
                    return _proj(MultiLineString(
                        [c for c in g["coordinates"] if len(c) >= 2]))
                if g.get("type") == "LineString":
                    return _proj(LineString(g["coordinates"]))
            except (ValueError, TypeError):
                pass
        bb = row.get("bbox")
        if isinstance(bb, list) and len(bb) == 4:
            return _proj(Point((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2))
        return None
    lat, lon = row.get("lat"), row.get("lon")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        return _proj(Point(lon, lat))
    return None


class Entry:
    __slots__ = ("layer", "id", "rated", "score", "geom")

    def __init__(self, layer, row, tier_rated):
        self.layer = layer
        self.id = str(row.get("id"))
        self.rated = tier_rated
        s = row.get("score")
        self.score = float(s) if isinstance(s, (int, float)) else 0.0
        self.geom = None


def load_country(cc, verbose=False):
    """-> (docs, entries): parsed wire docs by layer + flat entry list.

    Every row keeps a reference back to its dict so `nb` can be stamped in
    place and the doc re-serialised without touching anything else."""
    docs, entries, rowref = {}, [], []
    for layer, (dirname, rated_key, listed_key) in LAYERS.items():
        p = PUBLIC / dirname / f"{cc}.json"
        if not p.exists():
            continue
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            print(f"  ! {p.name} [{layer}] unreadable: {e}")
            continue
        docs[layer] = (p, doc)
        for key, rated in ((rated_key, True), (listed_key, False)):
            for row in doc.get(key) or []:
                e = Entry(layer, row, rated)
                e.geom = _row_geom(layer, row)
                if e.geom is None:
                    continue
                entries.append(e)
                rowref.append(row)
        if verbose:
            print(f"  {cc} {layer}: {len(doc.get(rated_key) or [])} rated, "
                  f"{len(doc.get(listed_key) or [])} listed")
    return docs, entries, rowref


def rank_hits(src_entry, hits, radius_m, limit):
    scored = []
    for e, dist in hits:
        if e.layer == src_entry.layer and e.id == src_entry.id:
            continue
        if dist > radius_m:
            continue
        scored.append(((0 if e.rated else 1), -e.score, dist, e.id))
    scored.sort()
    out, seen = [], set()
    for _, _, _, eid in scored:
        if eid in seen:
            continue
        seen.add(eid)
        out.append(eid)
        if len(out) >= limit:
            break
    return out


class CountryIndex:
    """STRtree per destination layer for one country."""

    def __init__(self, entries):
        self.by_layer = defaultdict(list)
        for e in entries:
            self.by_layer[e.layer].append(e)
        self.trees = {}
        for layer, es in self.by_layer.items():
            self.trees[layer] = STRtree([e.geom for e in es])

    def near(self, geom, layer, radius_m):
        tree = self.trees.get(layer)
        if tree is None:
            return []
        idx = tree.query(geom.buffer(radius_m))
        es = self.by_layer[layer]
        return [(es[i], geom.distance(es[i].geom)) for i in idx]


def expand_rules(layer):
    out = {}
    for (src, dst), rl in RULES.items():
        if src != layer:
            continue
        if dst == "*":
            for other in LAYERS:
                if other != layer:
                    out[other] = rl
        else:
            out[dst] = rl
    return out


def stamp_country(cc, dry_run=False, verbose=False, indexes=None):
    docs, entries, rowref = load_country(cc, verbose=verbose)
    if not entries:
        if indexes is not None:
            indexes[cc] = None
        return 0, 0
    index = CountryIndex(entries)
    if indexes is not None:
        indexes[cc] = index
    stamped = 0
    for e, row in zip(entries, rowref):
        rules = expand_rules(e.layer)
        nb = {}
        for dst, (radius_km, limit) in sorted(rules.items()):
            hits = index.near(e.geom, dst, radius_km * 1000.0)
            ids = rank_hits(e, hits, radius_km * 1000.0, limit)
            if ids:
                nb[dst] = ids
        row.pop("nb", None)
        if nb:
            row["nb"] = nb
            stamped += 1

    # Cycling tours: the whole-line join (per-stage split is a later pass).
    if "cycle" in docs:
        _, doc = docs["cycle"]
        for tour in doc.get("tours") or []:
            geom = _row_geom("cycle", tour)
            if geom is None:
                continue
            fake = Entry("cycle", {"id": tour.get("slug", "")}, True)
            nb = {}
            for dst, (radius_km, limit) in sorted(expand_rules("cycle").items()):
                hits = index.near(geom, dst, radius_km * 1000.0)
                ids = rank_hits(fake, hits, radius_km * 1000.0, limit)
                if ids:
                    nb[dst] = ids
            tour.pop("nb", None)
            if nb:
                tour["nb"] = nb

    written = 0
    if not dry_run:
        for layer, (p, doc) in docs.items():
            p.write_text(json.dumps(doc, ensure_ascii=False,
                                    separators=(",", ":")),
                         encoding="utf-8")
            written += 1
    return stamped, written


def stamp_trips(countries, indexes, dry_run=False, verbose=False):
    """Per-stop neighbours into the trip detail files.

    `indexes` caches CountryIndex per iso2 so a 12-country pass does not
    rebuild Austria's tree for every trip that passes through it."""
    trip_dir = PUBLIC / "trips" / "trip"
    if not trip_dir.exists():
        return 0
    radius_km, limit = TRIP_RULE
    n = 0
    for p in sorted(trip_dir.glob("*.json")):
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        cc = (doc.get("cc") or "").upper()
        if countries and cc not in countries:
            continue
        changed = False
        for stop in doc.get("stops") or []:
            iso2 = (stop.get("iso2") or "").upper()
            lat, lon = stop.get("lat"), stop.get("lon")
            stop.pop("nb", None)
            if not iso2 or not isinstance(lat, (int, float)):
                changed = True
                continue
            if iso2 not in indexes:
                _, entries2, _ = load_country(iso2)
                indexes[iso2] = CountryIndex(entries2) if entries2 else None
            index = indexes[iso2]
            changed = True
            if index is None:
                continue
            geom = _proj(Point(lon, lat))
            fake = Entry("trip", {"id": doc.get("id", "")}, True)
            nb = {}
            for dst in sorted(LAYERS):
                hits = index.near(geom, dst, radius_km * 1000.0)
                ids = rank_hits(fake, hits, radius_km * 1000.0, limit)
                if ids:
                    nb[dst] = ids
            if nb:
                stop["nb"] = nb
        if changed and not dry_run:
            p.write_text(json.dumps(doc, ensure_ascii=False,
                                    separators=(",", ":")),
                         encoding="utf-8")
            n += 1
        if verbose and changed:
            print(f"  trip {doc.get('id')}: stops stamped")
    return n


def all_countries():
    ccs = set()
    for dirname, _, _ in LAYERS.values():
        d = PUBLIC / dirname
        if not d.exists():
            continue
        for p in d.glob("??.json"):
            ccs.add(p.stem)
    return sorted(ccs)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="",
                    help="comma separated ISO2; default every published one")
    ap.add_argument("--skip-trips", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    ccs = wanted or all_countries()
    t0 = time.time()
    total_rows = total_files = 0
    per_country = {}
    indexes = {}
    for cc in ccs:
        stamped, written = stamp_country(cc, dry_run=args.dry_run,
                                         verbose=args.verbose,
                                         indexes=indexes)
        total_rows += stamped
        total_files += written
        per_country[cc] = stamped
        if stamped:
            print(f"{cc}: {stamped} rows carry nb"
                  + (" (dry-run)" if args.dry_run else ""))
    n_trips = 0
    if not args.skip_trips:
        n_trips = stamp_trips(set(ccs), indexes, dry_run=args.dry_run,
                              verbose=args.verbose)
        print(f"trips: {n_trips} detail files stamped")
    # The model ships with the data (invariant 2). Only a FULL run writes it:
    # a targeted --countries pass must not restamp the whole-run counts.
    if not args.dry_run and not wanted:
        model = {
            "generated_at": datetime.now(timezone.utc)
                            .isoformat(timespec="seconds"),
            "version": MODEL_VERSION,
            "key": "nb",
            "rules_km_limit": {f"{s}->{d}": [km, lim]
                               for (s, d), (km, lim) in sorted(RULES.items())},
            "trip_rule_km_limit": list(TRIP_RULE),
            "rows_stamped": total_rows,
            "trip_details_stamped": n_trips,
            "countries": {cc: n for cc, n in sorted(per_country.items()) if n},
        }
        (PUBLIC / "joins.json").write_text(
            json.dumps(model, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
        print("model -> public/joins.json")
    print(f"done: {total_rows} rows, {total_files} wire files rewritten, "
          f"{time.time() - t0:.0f}s [{MODEL_VERSION}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
