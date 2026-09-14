"""Build the region spine: fetch, normalise, index -> cache/regions/regions.gpkg.

Usage, from the repo root:

    python pipeline/regions/build_regions.py                 # everything
    python pipeline/regions/build_regions.py --skip-fetch    # sources on disk
    python pipeline/regions/build_regions.py --skip-lau      # no municipalities
    python pipeline/regions/build_regions.py --skip-coasts   # no stretch cut

The catalogue's oldest structural bug is that it has no unit between "beach"
and "country": a country level publish cap decided Belgium gets 2 beaches and
Spain gets 120 no matter where in Spain they are. This module builds the unit
that fixes it, one GeoPackage with six layers:

    admin    NUTS 0..3 (2024) for 39 countries, ONS ITL 1..3 for the UK
             (the UK is not in NUTS 2024, checked against the live files),
             geoBoundaries for Ukraine, Moldova and the microstates GISCO
             does not carry. One table, one id scheme, a `system` column.
    lau      GISCO Local Administrative Units 2024, the municipality floor.
    coast    ~600 named coastal stretches cut from the EEA coastline, the
             unit "best beaches on the Costa de la Luz" needs. Built by
             coasts.py, hand named by seed_coasts.py.
    range    GMBA Mountain Inventory v2 ranges that touch Europe, with the
             hierarchy kept, the unit "the Dolomites" needs.
    basin    WISE WFD river basin districts (2022 reporting), for lakes.
    biogeo   the EEA's eleven biogeographical regions, a free "if you liked
             Boreal lakes" axis.

Everything is stored in EPSG:4326. Lengths and areas are measured in
EPSG:3035 (the equal area projection the EEA sources arrive in) before
reprojection, and stored as attributes, so no consumer ever measures a
degree.

Country codes: the app speaks GR and GB; Eurostat speaks EL and has no UK.
Region ids stay exactly as their source minted them (EL30 stays EL30, so a
row can always be traced back), but every row's `country` column carries the
app's ISO2.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import struct
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline"))

import region_sources as rs  # noqa: E402
from pipeline_io import atomic_write_json  # noqa: E402

CACHE = rs.CACHE
SRC = rs.SRC
GPKG = CACHE / "regions.gpkg"

# Eurostat to app ISO2. Region ids keep their source spelling; only the
# `country` column is translated, because the layer caches and wires are
# keyed GR and GB and a join that needs a translation table at read time
# will eventually be done without one.
CC_APP = {"EL": "GR", "UK": "GB"}

# The countries the catalogue publishes that NUTS 2024 does not carry below
# country level, and where geoBoundaries fills the gap. The level says where
# each admin tier slots into the shared 0..3 ladder: Ukrainian oblasts are
# NUTS2 sized, raions NUTS3 sized; Moldovan districts, Andorran parishes,
# San Marinese castelli and Faroese regions are all NUTS3 sized.
GB_FILL = {
    "UKR": ("UA", {"ADM1": 2, "ADM2": 3}),
    "MDA": ("MD", {"ADM1": 3}),
    "AND": ("AD", {"ADM1": 3}),
    "SMR": ("SM", {"ADM1": 3}),
    # gbOpen carries no ADM1 for the Faroes; one region for the whole
    # archipelago beats a hole, and matches how the catalogue browses it.
    "FRO": ("FO", {"ADM0": 3}),
    "MCO": ("MC", {"ADM0": 3}),
}

BIOGEO_CODES = {
    "alpine": "ALP", "anatolian": "ANA", "arctic": "ARC", "atlantic": "ATL",
    "blacksea": "BLS", "black sea": "BLS", "boreal": "BOR",
    "continental": "CON", "macaronesia": "MAC", "macaronesian": "MAC",
    "mediterranean": "MED", "pannonian": "PAN", "steppic": "STE",
    "outside": "OUT",
}

# Europe for the GMBA cut: generous, so the Caucasus edge and the Anatolian
# ranges the trails layer already publishes stay in.
EUROPE_BBOX = (-32.0, 27.0, 45.5, 72.0)  # lon_min, lat_min, lon_max, lat_max


def log(msg):
    print(f"[regions] {msg}")


# ---------------------------------------------------------------------------
# Normalisers, one per source family
# ---------------------------------------------------------------------------

def load_admin():
    """NUTS + ITL + geoBoundaries into one GeoDataFrame."""
    import geopandas as gpd
    import pandas as pd

    frames = []

    for level in range(4):
        path = SRC / "nuts" / f"NUTS_RG_01M_2024_4326_LEVL_{level}.geojson"
        gdf = gpd.read_file(path)
        out = gpd.GeoDataFrame({
            "id": gdf["NUTS_ID"],
            "name": gdf["NAME_LATN"],
            "level": level,
            "system": "nuts",
            "country": [CC_APP.get(c, c) for c in gdf["CNTR_CODE"]],
            "parent": ["" if level == 0 else nid[:-1] for nid in gdf["NUTS_ID"]],
            "geometry": gdf.geometry,
        }, crs="EPSG:4326")
        frames.append(out)
        log(f"admin: NUTS level {level}: {len(out)} regions")

    for level in (1, 2, 3):
        path = SRC / "itl" / f"ITL{level}_JAN_2025_BGC.geojson"
        gdf = gpd.read_file(path)
        code_col = f"ITL{level}25CD"
        name_col = f"ITL{level}25NM"
        out = gpd.GeoDataFrame({
            "id": gdf[code_col],
            "name": gdf[name_col],
            "level": level,
            "system": "itl",
            # ITL codes nest by prefix exactly like NUTS: TLC, TLC3, TLC31.
            "parent": ["GB" if level == 1 else code[:-1] for code in gdf[code_col]],
            "country": "GB",
            "geometry": gdf.geometry,
        }, crs="EPSG:4326")
        frames.append(out)
        log(f"admin: ITL level {level}: {len(out)} regions")

    for iso3, (cc, levels) in GB_FILL.items():
        for adm, level in levels.items():
            path = SRC / "geoboundaries" / f"geoBoundaries-{iso3}-{adm}.geojson"
            if not path.exists():
                log(f"admin: WARNING {path.name} missing, {cc} {adm} skipped")
                continue
            gdf = gpd.read_file(path)
            ids = []
            for _, row in gdf.iterrows():
                sid = str(row.get("shapeISO") or "").strip()
                if not sid or sid.lower() == "none":
                    sid = str(row.get("shapeID") or "").strip()
                ids.append(f"{cc}-{sid.replace(' ', '_')}")
            out = gpd.GeoDataFrame({
                "id": ids,
                "name": gdf["shapeName"],
                "level": level,
                "system": "gb",
                "parent": "",
                "country": cc,
                "geometry": gdf.geometry,
            }, crs="EPSG:4326")
            frames.append(out)
            log(f"admin: geoBoundaries {cc} {adm} -> level {level}: {len(out)}")

    admin = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs="EPSG:4326")

    # geoBoundaries tiers do not nest by code, so parent is resolved
    # spatially: an ADM2 row's parent is the same country ADM-above row that
    # contains its representative point.
    fill = admin[admin["system"] == "gb"]
    for cc in {v[0] for v in GB_FILL.values()}:
        rows = fill[fill["country"] == cc]
        levels = sorted(rows["level"].unique())
        for lo, hi in zip(levels, levels[1:]):
            parents = rows[rows["level"] == lo]
            kids = rows[rows["level"] == hi]
            psindex = parents.sindex
            for idx, kid in kids.iterrows():
                pt = kid.geometry.representative_point()
                hits = parents.iloc[list(psindex.query(pt, predicate="within"))]
                if len(hits):
                    admin.at[idx, "parent"] = hits.iloc[0]["id"]
    return admin


def load_lau():
    import geopandas as gpd
    zip_path = SRC / "lau" / "ref-lau-2024-01m.geojson.zip"
    inner = None
    with zipfile.ZipFile(zip_path) as z:
        for n in z.namelist():
            if n.lower().endswith(".geojson") and "LAU_RG" in n:
                inner = n
                break
        if inner is None:
            for n in z.namelist():
                if n.lower().endswith(".geojson"):
                    inner = n
                    break
    log(f"lau: reading {inner} (this is the slow one)")
    gdf = gpd.read_file(f"zip://{zip_path}!{inner}")
    cols = {c.upper(): c for c in gdf.columns}
    gid = cols.get("GISCO_ID") or cols.get("LAU_ID")
    name = cols.get("LAU_NAME") or cols.get("NAME_LATN") or cols.get("LAU_LABEL")
    cntr = cols.get("CNTR_CODE") or cols.get("CNTR_ID")
    out = gpd.GeoDataFrame({
        "id": gdf[gid],
        "name": gdf[name],
        "country": [CC_APP.get(c, c) for c in gdf[cntr]],
        "geometry": gdf.geometry,
    }, crs=gdf.crs or "EPSG:4326").to_crs("EPSG:4326")
    log(f"lau: {len(out)} municipalities")
    return out


def load_gmba():
    import geopandas as gpd
    zip_path = SRC / "gmba" / "GMBA_Inventory_v2.0_standard_basic.zip"
    gdf = gpd.read_file(f"zip://{zip_path}!GMBA_Inventory_v2.0_standard_basic.shp")
    lon_min, lat_min, lon_max, lat_max = EUROPE_BBOX
    boxes = gdf.geometry.bounds
    keep = ~((boxes["maxx"] < lon_min) | (boxes["minx"] > lon_max)
             | (boxes["maxy"] < lat_min) | (boxes["miny"] > lat_max))
    gdf = gdf[keep]
    out = gpd.GeoDataFrame({
        "id": [f"GMBA:{int(v)}" for v in gdf["GMBA_V2_ID"]],
        "name": gdf["MapName"].fillna(gdf["DBaseName"]),
        "level": gdf["Hier_Lvl"].astype(int),
        "path": gdf["Path"].fillna(""),
        "parent": ["" if not p or ":" not in str(p)
                   else f"GMBA:{str(p).rsplit(':', 1)[0].rsplit(':', 1)[-1]}"
                   for p in gdf["Path_ID"].fillna("")],
        "countries": gdf["CountryISO"].fillna(""),
        "elev_high": gdf["Elev_High"].fillna(0.0),
        "elev_low": gdf["Elev_Low"].fillna(0.0),
        "geometry": gdf.geometry,
    }, crs=gdf.crs or "EPSG:4326").to_crs("EPSG:4326")
    log(f"range: GMBA ranges touching Europe: {len(out)}")
    return out


def load_basins():
    import geopandas as gpd
    gdf = gpd.read_file(SRC / "eea" / "wise_rbd_2022.geojson")
    ident = gdf["thematicIdIdentifier"].fillna(gdf["inspireIdLocalId"])
    out = gpd.GeoDataFrame({
        "id": [f"RBD:{v}" for v in ident],
        "name": gdf["nameTextInternational"].fillna(gdf["nameText"]).fillna(""),
        "country": [CC_APP.get(c, c) for c in gdf["countryCode"].fillna("")],
        "geometry": gdf.geometry,
    }, crs="EPSG:4326")
    out = out[~out.geometry.isna()]
    log(f"basin: WISE river basin districts: {len(out)}")
    return out


def load_biogeo():
    import geopandas as gpd
    gdf = gpd.read_file(SRC / "eea" / "biogeo_regions.geojson")
    codes = []
    for _, row in gdf.iterrows():
        raw = str(row.get("code") or row.get("short_name") or row.get("name") or "")
        key = raw.strip().lower().replace("region", "").strip()
        code = BIOGEO_CODES.get(key)
        if code is None:
            for k, v in BIOGEO_CODES.items():
                if k in key:
                    code = v
                    break
        codes.append(code or "OUT")
    import shapely
    from shapely.geometry import MultiPolygon
    out = gpd.GeoDataFrame({
        "code": codes,
        "name": gdf.get("name", codes),
        "geometry": [shapely.make_valid(g) for g in gdf.geometry],
    }, crs="EPSG:4326")
    out = out[out["code"] != "OUT"]
    # One row per code. Parts are concatenated, not unioned: the service's
    # generalised polygons are not clean enough for a union (a side location
    # conflict off Kerry taught this), and a containment query does not care
    # whether two parts of the Atlantic region overlap by a metre.
    def polys(geom):
        # Recursive on purpose: make_valid hands the Atlantic back as a
        # collection whose members are themselves MultiPolygons, and a one
        # level walk silently drops the whole region (it did: Knokke came
        # back Alpine because Atlantic had no geometry left to be nearest).
        if geom is None or geom.is_empty:
            return []
        if geom.geom_type == "Polygon":
            return [geom]
        if hasattr(geom, "geoms"):
            found = []
            for g in geom.geoms:
                found.extend(polys(g))
            return found
        return []

    merged = []
    for code, group in out.groupby("code"):
        parts = []
        for geom in group.geometry:
            parts.extend(polys(geom))
        merged.append({"code": code, "name": str(group.iloc[0]["name"]),
                       "geometry": MultiPolygon(parts)})
    out = gpd.GeoDataFrame(merged, crs="EPSG:4326")
    log(f"biogeo: {len(out)} biogeographical regions "
        f"({', '.join(sorted(out['code']))})")
    return out


# ---------------------------------------------------------------------------
# The index
# ---------------------------------------------------------------------------

def source_manifest():
    """What was on disk when this build ran: name, bytes. The freshness
    answer for a spine that changes once a year."""
    manifest = {}
    for path in sorted(SRC.rglob("*")):
        if path.is_file() and not path.name.startswith("_"):
            manifest[str(path.relative_to(SRC)).replace("\\", "/")] = path.stat().st_size
    return manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--skip-fetch", action="store_true",
                    help="trust cache/regions/src as it stands")
    ap.add_argument("--skip-lau", action="store_true",
                    help="skip the municipality layer (the slow read)")
    ap.add_argument("--skip-coasts", action="store_true",
                    help="skip cutting coastal stretches")
    ap.add_argument("--skip-opportunity", action="store_true",
                    help="skip the per region opportunity measures")
    args = ap.parse_args()

    if not args.skip_fetch:
        log("fetch")
        rs.fetch_all()
        # The microstate gap fillers are not part of fetch_all's confirmed
        # set; missing ones are warned about at normalise time instead of
        # failing the build.
        fetch_gb_fill()

    import pandas as pd  # noqa: F401  (geopandas needs it; fail early if absent)

    log("normalise: admin")
    admin = load_admin()
    write_layer(admin, "admin")

    log("normalise: ranges")
    write_layer(load_gmba(), "range")

    log("normalise: basins")
    write_layer(load_basins(), "basin")

    log("normalise: biogeo")
    write_layer(load_biogeo(), "biogeo")

    if not args.skip_lau:
        log("normalise: lau")
        write_layer(load_lau(), "lau")

    if not args.skip_coasts:
        log("coasts: cutting stretches from the EEA coastline")
        import coasts
        coast_gdf, coast_km_by_n3 = coasts.build_stretches(admin)
        write_layer(coast_gdf, "coast")
        atomic_write_json(CACHE / "coast_km_by_n3.json", coast_km_by_n3)

    log("index")
    index = build_index(args)
    atomic_write_json(CACHE / "regions_index.json", index)

    if not args.skip_opportunity:
        log("opportunity measures")
        import opportunity
        opportunity.build()

    log(f"done: {GPKG}")


def fetch_gb_fill():
    """geoBoundaries for the countries NUTS leaves at country level.
    UKR is pinned in region_sources; the rest are resolved through the
    geoBoundaries API at fetch time and recorded in the manifest."""
    for iso3, (cc, levels) in GB_FILL.items():
        for adm in levels:
            dest = SRC / "geoboundaries" / f"geoBoundaries-{iso3}-{adm}.geojson"
            if dest.exists() and dest.stat().st_size > 0:
                continue
            try:
                meta = rs.get_json(
                    f"https://www.geoboundaries.org/api/current/gbOpen/{iso3}/{adm}/")
                url = meta.get("gjDownloadURL")
                if url:
                    rs.download(url, dest)
            except rs.SourceError as exc:
                log(f"WARNING: geoBoundaries {iso3} {adm} unavailable ({exc})")


def write_layer(gdf, layer):
    GPKG.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(GPKG, layer=layer, driver="GPKG")
    log(f"wrote layer {layer}: {len(gdf)} rows")


def build_index(args):
    import pyogrio
    counts = {}
    for layer in ("admin", "lau", "coast", "range", "basin", "biogeo"):
        try:
            info = pyogrio.read_info(GPKG, layer=layer)
            counts[layer] = int(info["features"])
        except Exception:
            counts[layer] = 0
    from datetime import datetime, timezone
    return {
        "version": "regions_v1",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "layers": counts,
        "systems": {"nuts": "2024", "itl": "2025-01", "gb": "gbOpen current",
                    "lau": "2024", "gmba": "v2.0 standard basic",
                    "coastline": "EEA v3.0 2017", "rbd": "WFD 2022",
                    "biogeo": "EEA 11 regions"},
        "sources": source_manifest(),
    }


if __name__ == "__main__":
    main()
