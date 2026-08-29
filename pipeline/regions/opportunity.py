"""Per region opportunity measures: how much of each thing is actually there.

The quota model (quotas.py) sizes each region's publication target from an
opportunity measure rather than a flat number, so 120 beaches stop being
Spain's share and Belgium's share alike. This module computes those inputs
once per build, from data the pipeline already holds, and writes them to
cache/regions/opportunity.json keyed by region id.

Every input records its basis in the artifact, because three of them are
proxies this programme will upgrade later and an unlabelled proxy would
quietly become a fact:

  coast_km          EEA coastline v3, measured during the stretch cut.
                    Solid.
  lakes_over_5ha    the lake harvest pool (Wikidata + OSM named lakes),
                    counted per region; a named lake with no recorded area
                    counts for the 5 ha rung (a named lake that small is
                    rare) and never for the 20 ha rung. Upgraded by the
                    full OSM sweep in the lakes brief.
  peaks_over_p100   the mountain harvest pool, prominence >= 100 m.
  relief_m          p98 of GeoNames settlement DEM elevations minus p02,
                    raised by the region's highest known peak. A DEM sweep
                    (GLO-30) replaces this in the trails brief; until then
                    the basis string says exactly what the number is.
  protected_share   protected site density from the OSM protected areas
                    cache (sites per 100 km2, capped at 1). A density, not
                    an area share; Natura 2000 + Emerald polygons replace
                    it in the trails brief.
  route_km          published trail km per region, from the trails wire.

Usage, from the repo root:

    python pipeline/regions/opportunity.py

ASCII clean, no em dashes, per project convention.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline"))

from pipeline_io import atomic_write_json, load_json  # noqa: E402

CACHE = ROOT / "cache"
GPKG = CACHE / "regions" / "regions.gpkg"
OUT = CACHE / "regions" / "opportunity.json"
TRAILS_WIRE = ROOT / "continent-app" / "public" / "trails"

RELIEF_NORM_M = 2000.0  # relief_norm = min(1, relief_m / this)


def log(msg):
    print(f"[regions] {msg}")


def _points_to_n3(admin3, lats, lons):
    """Bulk point to level 3 region id, with the 5 km sea snap."""
    import geopandas as gpd
    pts = gpd.GeoDataFrame(geometry=gpd.points_from_xy(lons, lats),
                           crs="EPSG:4326")
    hit = gpd.sjoin(pts, admin3[["id", "geometry"]], how="left",
                    predicate="within")
    out = list(hit["id"])
    missing = [i for i, v in enumerate(out) if not isinstance(v, str)]
    if missing:
        rest = pts.iloc[missing]
        near = gpd.sjoin_nearest(rest, admin3[["id", "geometry"]], how="left",
                                 max_distance=5.0 / 111.32)
        near = near[~near.index.duplicated(keep="first")]
        for i in missing:
            got = near.loc[i, "id_right"] if "id_right" in near.columns else near.loc[i, "id"]
            out[i] = got if isinstance(got, str) else None
    return out


def _iter_layer_cache(folder, key):
    for path in sorted((CACHE / folder).glob("raw_??.json")):
        data = load_json(path)
        if data:
            cc = path.stem.split("_")[1]
            rich = load_json(path.with_name(f"rich_{cc}.json"))
            rows = (rich or data).get(key) or []
            for row in rows:
                yield cc, row


def build():
    import geopandas as gpd
    import numpy as np

    admin3 = gpd.read_file(GPKG, layer="admin")
    admin3 = admin3[admin3["level"] == 3].reset_index(drop=True)
    area_km2 = dict(zip(admin3["id"],
                        (admin3.to_crs("EPSG:3035").area / 1e6).round(1)))

    n3 = defaultdict(lambda: defaultdict(float))
    for rid, area in area_km2.items():
        n3[rid]["area_km2"] = area

    coast_km = load_json(CACHE / "regions" / "coast_km_by_n3.json", {}) or {}
    for rid, km in coast_km.items():
        n3[rid]["coast_km"] = km

    # Lakes: pool counts at the 5 ha and 20 ha rungs.
    lat_l, lon_l, area_l = [], [], []
    for cc, row in _iter_layer_cache("lakes", "lakes"):
        if row.get("lat") is None or row.get("lon") is None:
            continue
        lat_l.append(row["lat"])
        lon_l.append(row["lon"])
        area_l.append(row.get("area_km2"))
    if lat_l:
        ids = _points_to_n3(admin3, lat_l, lon_l)
        for rid, a in zip(ids, area_l):
            if rid is None:
                continue
            if a is None or a >= 0.05:
                n3[rid]["lakes_over_5ha"] += 1
            if a is not None and a >= 0.2:
                n3[rid]["lakes_over_20ha"] += 1
    log(f"opportunity: {len(lat_l)} pool lakes placed")

    # Peaks: pool counts at prominence >= 100 m, plus the relief ceiling,
    # counted per NUTS3 and per GMBA range (every level that contains it,
    # so the Dolomites and the Alps both know their own depth).
    lat_p, lon_p, prom_p, ele_p = [], [], [], []
    for cc, row in _iter_layer_cache("mountains", "peaks"):
        if row.get("lat") is None or row.get("lon") is None:
            continue
        lat_p.append(row["lat"])
        lon_p.append(row["lon"])
        prom_p.append(row.get("prom"))
        ele_p.append(row.get("ele"))
    max_ele = defaultdict(float)
    if lat_p:
        ids = _points_to_n3(admin3, lat_p, lon_p)
        for rid, prom, ele in zip(ids, prom_p, ele_p):
            if rid is None:
                continue
            if prom is not None and prom >= 100:
                n3[rid]["peaks_over_p100"] += 1
            if ele:
                max_ele[rid] = max(max_ele[rid], float(ele))
    log(f"opportunity: {len(lat_p)} pool peaks placed")

    ranges = {}
    try:
        range_gdf = gpd.read_file(GPKG, layer="range")
    except Exception:
        range_gdf = None
    if range_gdf is not None and lat_p:
        pts = gpd.GeoDataFrame({"prom": prom_p},
                               geometry=gpd.points_from_xy(lon_p, lat_p),
                               crs="EPSG:4326")
        joined = gpd.sjoin(pts, range_gdf[["id", "geometry"]], how="inner",
                           predicate="within")
        for rid, group in joined.groupby("id"):
            proms = group["prom"]
            ranges[rid] = {
                "peaks_over_p100": int(((proms.notna()) & (proms >= 100)).sum()),
            }

    # Relief: settlement DEM spread from GeoNames, raised by the highest
    # known peak. cities500 is tab separated; column 16 is the DEM sample.
    gn = CACHE / "geonames_cities500.txt"
    if gn.exists():
        lat_g, lon_g, dem_g = [], [], []
        with open(gn, encoding="utf-8") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 17:
                    continue
                try:
                    dem = float(parts[16])
                    lat_g.append(float(parts[4]))
                    lon_g.append(float(parts[5]))
                    dem_g.append(dem)
                except ValueError:
                    continue
        ids = _points_to_n3(admin3, lat_g, lon_g)
        by_region = defaultdict(list)
        for rid, dem in zip(ids, dem_g):
            if rid is not None and dem > -500:
                by_region[rid].append(dem)
        for rid, dems in by_region.items():
            lo = float(np.percentile(dems, 2))
            hi = float(np.percentile(dems, 98))
            hi = max(hi, max_ele.get(rid, 0.0))
            n3[rid]["relief_m"] = round(max(0.0, hi - lo), 0)
        log(f"opportunity: relief from {len(lat_g)} settlements")
    else:
        log("opportunity: WARNING geonames_cities500.txt missing, relief unset")

    # Protected sites: a density proxy until the Natura 2000 polygons land.
    prot = load_json(CACHE / "osm_protected_areas.json", {}) or {}
    entries = (prot.get("by_key") or {}).values()
    lat_pr = [e["lat"] for e in entries if e.get("lat") is not None]
    lon_pr = [e["lon"] for e in entries if e.get("lon") is not None]
    if lat_pr:
        ids = _points_to_n3(admin3, lat_pr, lon_pr)
        counts = defaultdict(int)
        for rid in ids:
            if rid is not None:
                counts[rid] += 1
        for rid, count in counts.items():
            area = max(100.0, n3[rid].get("area_km2") or 100.0)
            n3[rid]["protected_share"] = round(min(1.0, count / (area / 100.0)), 3)
    log(f"opportunity: {len(lat_pr)} protected sites placed")

    # Published trail km per region, from the wire.
    lat_t, lon_t, km_t = [], [], []
    for path in sorted(TRAILS_WIRE.glob("[A-Z][A-Z].json")):
        data = load_json(path)
        for tr in (data or {}).get("trips") or []:
            bbox = tr.get("bbox")
            if not bbox or len(bbox) != 4:
                continue
            lat_t.append((bbox[1] + bbox[3]) / 2.0)
            lon_t.append((bbox[0] + bbox[2]) / 2.0)
            km_t.append((tr.get("distance_m") or 0) / 1000.0)
    if lat_t:
        ids = _points_to_n3(admin3, lat_t, lon_t)
        for rid, km in zip(ids, km_t):
            if rid is not None:
                n3[rid]["route_km"] += km
    log(f"opportunity: {len(lat_t)} published trails placed")

    for rid in n3:
        n3[rid]["relief_norm"] = round(
            min(1.0, (n3[rid].get("relief_m") or 0.0) / RELIEF_NORM_M), 3)
        n3[rid]["route_km"] = round(n3[rid]["route_km"], 1)

    coasts = {}
    try:
        coast_gdf = gpd.read_file(GPKG, layer="coast")
        for _, row in coast_gdf.iterrows():
            coasts[row["id"]] = {"coast_km": float(row["length_km"])}
    except Exception:
        pass

    from datetime import datetime, timezone
    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "version": "opportunity_v1",
        "basis": {
            "coast_km": "EEA coastline v3 arc length per region",
            "lakes_over_5ha": "lake harvest pool; unknown area counts at 5 ha, never at 20 ha",
            "lakes_over_20ha": "lake harvest pool, recorded area >= 0.2 km2",
            "peaks_over_p100": "mountain harvest pool, prominence >= 100 m",
            "relief_m": "GeoNames settlement DEM p98 - p02, raised by highest pool peak; GLO-30 sweep pending",
            "protected_share": "OSM protected site density per 100 km2 capped at 1; Natura 2000 + Emerald polygons pending",
            "route_km": "published trail km, bbox centre assignment",
        },
        "n3": {rid: {k: (int(v) if k in ("lakes_over_5ha", "lakes_over_20ha",
                                         "peaks_over_p100") else v)
                     for k, v in sorted(vals.items())}
               for rid, vals in sorted(n3.items())},
        "coast": dict(sorted(coasts.items())),
        "range": dict(sorted(ranges.items())),
    }
    atomic_write_json(OUT, payload)
    log(f"opportunity: wrote {OUT.name} for {len(n3)} regions, "
        f"{len(coasts)} stretches, {len(ranges)} ranges")


if __name__ == "__main__":
    build()
