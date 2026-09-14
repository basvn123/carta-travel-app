"""Protected status, with the polygons rather than the centroids, and
including the countries outside the EU.

Two things were wrong with the protection signal before this.

The first is recorded in BEACHES.md as a claim the data cannot make: the
protected-area cache holds CENTROIDS, so "this beach is inside the national
park" could never be proved from it, and the layer bought honesty with a pair
of distance gates (3 km for a park, 1.5 km for a reserve) that are true on
average and wrong in both directions for any particular beach. A polygon
answers the actual question. `inside` becomes a fact rather than an inference.

The second is that Natura 2000 stops at the EU border, so the Protected chip
worked in Spain and not in Norway. The Emerald Network is the Bern Convention's
non-EU twin, run by the Council of Europe, published by the EEA in the same
schema on the same server: it covers the United Kingdom, Norway, Switzerland,
the Western Balkans, Ukraine and Turkey. One extra service and the chip works
everywhere.

Sources, both CC BY 4.0 on the EEA's biodiversity ArcGIS:
    Natura2000Sites layer 2   Habitats and Birds Directive sites,  27,173
    EmeraldSites layers 0,1,2 candidate, adopted and proposed,      2,576

Queried rather than bulk downloaded. The published shapefile is about a
gigabyte; the same polygons come back from the REST service in pages, and
asking for a coarse geometry (maxAllowableOffset) makes the cache a fraction
of that without moving any boundary far enough to change whether a beach is
inside a site.

WDPA / Protected Planet is the obvious alternative and is BANNED here: its
UNEP-WCMC licence is non-commercial. It is the single biggest legal trap in
this space and it is recorded in 00-MASTER-SPEC.md as rejected.

Usage, from the repo root:
    python pipeline/beaches/protection.py --fetch
    python pipeline/beaches/protection.py --lat 43.4 --lon 4.5
"""

import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Windows consoles default to cp1252, and this layer prints beach names:
# "Ir-Ramla tal-Mixquqa" and "Plaza Zlatni Rat" both raise UnicodeEncodeError
# on the way to a terminal that cannot spell them. Replacing the character is
# right for a progress line and wrong for a data file, which is why this
# touches stdout only; every cache and wire write goes through an explicit
# encoding="utf-8".
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = HERE.parents[1]
CACHE_DIR = ROOT / "cache" / "beaches"
CACHE = CACHE_DIR / "protected_sites.geojson"

CONTACT = "bas.vannieuwenhuyse123@gmail.com"
UA = f"CartaBeaches/1.0 (https://carta-europetravel.com; {CONTACT})"

ARCGIS = "https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites"
SOURCES = (
    # (network, service, layer, what it is)
    ("natura2000", "Natura2000Sites", 2, "Habitats and Birds Directive sites"),
    ("emerald", "EmeraldSites", 1, "Emerald Network, adopted"),
    ("emerald", "EmeraldSites", 0, "Emerald Network, candidate"),
    ("emerald", "EmeraldSites", 2, "Emerald Network, proposed"),
)
PAGE = 400
# Roughly 50 m of generalisation, in the service's own web mercator metres.
# A Natura 2000 boundary moved 50 m does not change whether a beach is in the
# site; the full resolution boundary is 20 times the bytes to say so.
SIMPLIFY_M = 50
PACE_S = 0.5
# How far outside a site boundary still counts as belonging to it. A beach is
# the shoreline and a coastal site's boundary IS the shoreline, so the two are
# always within metres of each other and which side the sand lands on is an
# artefact of digitising rather than a fact about the beach.
EDGE_M = 150

_sites = None
_tree = None
_geoms = None


def _get(url, params, timeout=180, tries=4):
    query = urllib.parse.urlencode(params)
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(f"{url}?{query}",
                                         headers={"User-Agent": UA,
                                                  "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            time.sleep(4 * (2 ** attempt))
    raise RuntimeError(f"{url}: {last}")


def fetch(verbose=True):
    """Page every site polygon into one GeoJSON cache."""
    features = []
    for network, service, layer, label in SOURCES:
        base = f"{ARCGIS}/{service}/MapServer/{layer}/query"
        offset, seen = 0, 0
        while True:
            payload = _get(base, {
                "where": "1=1",
                "outFields": "SITECODE,SITENAME,MS",
                "returnGeometry": "true",
                "outSR": 4326,
                "maxAllowableOffset": SIMPLIFY_M,
                "geometryPrecision": 5,
                "orderByFields": "OBJECTID",
                "resultOffset": offset,
                "resultRecordCount": PAGE,
                "f": "geojson",
            })
            got = payload.get("features") or []
            if not got:
                break
            for feature in got:
                props = feature.get("properties") or {}
                feature["properties"] = {
                    "network": network,
                    "code": props.get("SITECODE") or "",
                    "name": (props.get("SITENAME") or "").strip(),
                    "ms": props.get("MS") or "",
                }
                if feature.get("geometry"):
                    features.append(feature)
            seen += len(got)
            offset += len(got)
            if verbose:
                print(f"  {label}: {seen} sites")
            if len(got) < PAGE:
                break
            time.sleep(PACE_S)
    if not features:
        print("  nothing returned, cache left as it was")
        return 0
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps({
        "type": "FeatureCollection",
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "EEA biodiversity ArcGIS: Natura 2000 and Emerald Network, "
                  "CC BY 4.0",
        "simplify_m": SIMPLIFY_M,
        "features": features,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"  {len(features)} protected sites -> {CACHE} "
          f"({CACHE.stat().st_size // (1024 * 1024)} MB)")
    return len(features)


def _load():
    """The polygons and their spatial index, once per process."""
    global _sites, _tree, _geoms
    if _sites is not None:
        return
    _sites, _geoms = [], []
    if not CACHE.exists():
        return
    try:
        from shapely import STRtree
        from shapely.geometry import shape
    except ImportError:
        return
    raw = json.loads(CACHE.read_text(encoding="utf-8"))
    for feature in raw.get("features") or []:
        try:
            geom = shape(feature["geometry"])
        except Exception:
            continue
        if geom.is_empty:
            continue
        _geoms.append(geom)
        _sites.append(feature.get("properties") or {})
    if _geoms:
        _tree = STRtree(_geoms)


class ProtectionReader:
    """Answers "is this beach inside a protected site" from polygons."""

    def __init__(self):
        _load()

    @property
    def ready(self):
        return bool(_geoms) and _tree is not None

    def at(self, lat, lon):
        """The site this beach belongs to, or {}.

        `intersects` rather than `contains`, for the reason recorded in
        coastline.py: STRtree runs its predicate against prepared geometry,
        and prepared contains answers False for a point that the polygon's
        own contains() answers True for.

        And a tolerance, because of what a beach IS. A coastal Natura 2000
        boundary is drawn along the shoreline, and a beach is the shoreline,
        so the sand sits within metres of the edge of the site it belongs to
        and lands on either side of it depending on whose coastline was
        digitised and how far the 50 m generalisation moved it. Es Trenc is
        inside ES0000037 in every sense that matters and fell outside the
        polygon by a few metres.

        So two answers, kept apart in the row rather than blurred: `inside`
        is containment and is the claim the card makes, `edge` is within
        EDGE_M of the boundary and earns the softer wording. Both are still
        vastly stronger than the centroid-and-3-km rule they replace."""
        if not self.ready:
            return {}
        from shapely.geometry import Point
        probe = Point(lon, lat)
        hits = _tree.query(probe, predicate="intersects")
        inside = len(hits) > 0
        if not inside:
            # A degree of latitude is 111.32 km anywhere; a degree of
            # longitude shrinks with the cosine, so the box is drawn in both.
            d_lat = EDGE_M / 111320.0
            d_lon = d_lat / max(0.2, math.cos(math.radians(lat)))
            near = Point(lon, lat).buffer(0)  # placeholder, replaced below
            from shapely.geometry import box
            near = box(lon - d_lon, lat - d_lat, lon + d_lon, lat + d_lat)
            hits = _tree.query(near, predicate="intersects")
            if len(hits) == 0:
                return {}
        # A beach can sit inside a Habitats site and a Birds site at once.
        # The smallest wins: it is the most specific thing true of this sand.
        best = min(hits, key=lambda i: _geoms[i].area)
        site = dict(_sites[best])
        site["inside"] = bool(inside)
        site["edge"] = not inside
        return site

    def stamp(self, beaches):
        """Write `protection` onto each row. Idempotent per row."""
        if not self.ready:
            return 0
        done = 0
        for beach in beaches:
            if beach.get("protection") is not None:
                continue
            try:
                site = self.at(beach["lat"], beach["lon"])
            except Exception:
                continue
            # {} is a real answer and is stored as one: "we looked and this
            # beach is not in a protected site" must not read the same as
            # "nobody looked", or a later run re-asks every beach in Europe.
            beach["protection"] = {
                "natura2000": site.get("network") == "natura2000",
                "emerald": site.get("network") == "emerald",
                "name": site.get("name") or "",
                "code": site.get("code") or "",
                "inside": bool(site.get("inside")),
                "edge": bool(site.get("edge")),
            } if site else {"inside": False, "edge": False}
            done += 1
        return done


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    args = ap.parse_args()
    if args.fetch:
        fetch()
        return
    reader = ProtectionReader()
    if not reader.ready:
        print(f"no protected site cache at {CACHE}; run with --fetch")
        return
    print(f"{len(_geoms)} protected site polygons cached")
    if args.lat is not None:
        print(reader.at(args.lat, args.lon) or "not inside any site")


if __name__ == "__main__":
    main()
