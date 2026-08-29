"""The region layer's polite clients.

The region spine is different from the other layers' sources in one useful
way: almost everything here is a static file that changes once a year, not an
API that answers questions. GISCO publishes NUTS as plain files on a file
server, EarthEnv publishes GMBA as one zip, the EEA coastline is one zip
behind a share link. So the clients below are mostly "download this file once
into cache/regions/src and never again", with two exceptions:

  ONS ITL          the UK is not in NUTS 2024 (checked: GISCO 2024 carries no
                   UK geometry at any level), so the UK spine comes from the
                   ONS Open Geography Portal's ArcGIS feature services, paged.
  EEA services     the 11 biogeographical regions and the WISE river basin
                   districts are served from EEA ArcGIS endpoints, paged the
                   same way.

Ukraine is the other confirmed gap: NUTS 2024 ships a UA country outline and
nothing below it, so ADM1/ADM2 come from geoBoundaries (gbOpen). The download
URLs are pinned to the release commit the API answered with, so a warm rebuild
fetches the same bytes.

Everything shared (user agent, pacing, backoff, disk cache) is loaded from
pipeline/beaches/sources.py by path, exactly like the mountain and lake
layers do, so the lore lives in one file.

ASCII clean, no em dashes, per project convention.
"""

import importlib.util
import json
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_BEACH_SOURCES = ROOT / "pipeline" / "beaches" / "sources.py"

_spec = importlib.util.spec_from_file_location("carta_open_sources", _BEACH_SOURCES)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["carta_open_sources"] = _mod
_spec.loader.exec_module(_mod)

CONTACT = _mod.CONTACT
_mod.UA = f"CartaRegions/1.0 (https://carta-europetravel.com; {CONTACT})"
_mod.CACHE = ROOT / "cache" / "regions"

CACHE = _mod.CACHE
UA = _mod.UA
SRC = CACHE / "src"

# Re-exported by name rather than by star, so what this layer depends on from
# the shared module is a list somebody can read.
SourceError = _mod.SourceError
request = _mod.request
get_json = _mod.get_json
sparql = _mod.sparql
cell = _mod.cell
overpass = _mod.overpass
cache_path = _mod.cache_path
load_cache = _mod.load_cache
save_cache = _mod.save_cache
haversine_km = _mod.haversine_km

# ---------------------------------------------------------------------------
# Where each source lives. One place, so the licence ledger, the fetch code
# and REGIONS.md can never drift apart on what was actually downloaded.
# ---------------------------------------------------------------------------

GISCO_NUTS = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson"
NUTS_FILES = [
    "NUTS_RG_01M_2024_4326_LEVL_0.geojson",
    "NUTS_RG_01M_2024_4326_LEVL_1.geojson",
    "NUTS_RG_01M_2024_4326_LEVL_2.geojson",
    "NUTS_RG_01M_2024_4326_LEVL_3.geojson",
]

# The LAU grammar does NOT mirror the NUTS one (checked against the live
# directory listing): zipped bundles named ref-lau-<year>-<scale>.<fmt>.zip.
LAU_URL = ("https://gisco-services.ec.europa.eu/distribution/v2/lau/download/"
           "ref-lau-2024-01m.geojson.zip")

# BGC is the 20 m generalised, coastline clipped edition. Full resolution
# (BFC) is ten times the bytes for accuracy this layer never uses: region
# assignment tolerates 20 m, and a beach centroid in the sea snaps to the
# nearest land region anyway. The second element is the layer id: the ITL3
# service publishes its layer as 1 where the other two use 0, which is the
# kind of thing nobody documents and a 400 teaches.
ITL_SERVICES = {
    1: ("ITL1_JAN_2025_UK_BGC", 0),
    2: ("ITL2_JAN_2025_UK_BGC", 0),
    3: ("ITL3_JAN_2025_UK_BGC_V2", 1),
}
ONS_ARCGIS = ("https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/"
              "services")

# Pinned to the release commit the geoBoundaries API answered with on
# 2026-08-29, so a warm rebuild fetches the same bytes the cold one did.
# ADM1 is ODbL (OpenStreetMap derived), ADM2 is public domain; the licence
# ledger carries both.
GEOBOUNDARIES_UA = {
    "ADM1": ("https://github.com/wmgeolab/geoBoundaries/raw/9469f09/"
             "releaseData/gbOpen/UKR/ADM1/geoBoundaries-UKR-ADM1.geojson"),
    "ADM2": ("https://github.com/wmgeolab/geoBoundaries/raw/9469f09/"
             "releaseData/gbOpen/UKR/ADM2/geoBoundaries-UKR-ADM2.geojson"),
}

# The basic edition carries the id, name and hierarchy columns and skips the
# hundred environmental attributes of the 186 MB standard edition.
GMBA_URL = ("https://data.earthenv.org/mountains/standard/"
            "GMBA_Inventory_v2.0_standard_basic.zip")

# EEA coastline for analysis, polygon, v3.0 March 2017. The catalogue's
# "download" page is a Nextcloud share; this is the direct file behind it
# (record 9faa6ea1-372a-4826-a3c7-fb5b05e31c52). The polyline edition stopped
# at v2.0, so stretches are cut from the boundary of the current polygon.
EEA_COASTLINE_URL = "https://sdi.eea.europa.eu/datashare/s/gcJSme8gWebRHBa/download"

BIOGEO_LAYER = ("https://bio.discomap.eea.europa.eu/arcgis/rest/services/"
                "BioRegions/BiogeographicalRegions_WM/MapServer/0")
RBD_LAYER = ("https://marine.discomap.eea.europa.eu/arcgis/rest/services/"
             "WISE_WFD/WFD2022_RiverBasinDistrict_WM/MapServer/0")


# ---------------------------------------------------------------------------
# The two client shapes the shared module does not have
# ---------------------------------------------------------------------------

def download(url, dest, *, timeout=600):
    """Stream one large file to disk, cache first.

    The shared request() buffers the whole body in memory, which is fine for
    a SPARQL answer and silly for a 130 MB LAU bundle. Downloads land next to
    their final name as .part and are renamed only when complete, so a killed
    run can never leave a truncated file that a later run trusts."""
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    print(f"  fetching {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r, open(part, "wb") as f:
        shutil.copyfileobj(r, f, length=1 << 20)
    part.replace(dest)
    print(f"  wrote {dest.name} ({dest.stat().st_size:,} bytes)")
    return dest


def arcgis_geojson(layer_url, dest, *, page=200, precision=6,
                   max_offset=None, out_fields="*"):
    """Page one ArcGIS layer into a single GeoJSON FeatureCollection on disk.

    Paged with resultOffset because every one of these servers caps a query
    at 1000 to 2000 records, and orderly paging needs a stable sort, which
    objectIds gives for free. geometryPrecision keeps coordinate noise out of
    the file so a warm rebuild diffs clean; max_offset (in degrees, since we
    ask for 4326) lets the continental EEA polygons come back generalised
    instead of at cartographic full weight."""
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    features = []
    offset = 0
    while True:
        params = {
            "where": "1=1",
            "outFields": out_fields,
            "outSR": 4326,
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": page,
            "geometryPrecision": precision,
        }
        if max_offset:
            params["maxAllowableOffset"] = max_offset
        url = layer_url + "/query?" + urllib.parse.urlencode(params)
        batch = get_json(url, timeout=300)
        if "error" in batch:
            raise SourceError(f"{layer_url} -> {batch['error']}")
        got = batch.get("features", [])
        features.extend(got)
        print(f"    {dest.name}: {len(features)} features")
        if len(got) < page:
            break
        offset += len(got)
    payload = {"type": "FeatureCollection", "features": features}
    tmp = dest.with_name(dest.name + ".part")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp.replace(dest)
    return dest


# ---------------------------------------------------------------------------
# One fetch function per source. All cache first: a file already on disk is
# the answer, which is what makes the yearly refresh a delete-and-rerun.
# ---------------------------------------------------------------------------

def fetch_nuts():
    return [download(f"{GISCO_NUTS}/{name}", SRC / "nuts" / name)
            for name in NUTS_FILES]


def fetch_lau():
    return download(LAU_URL, SRC / "lau" / "ref-lau-2024-01m.geojson.zip")


def fetch_itl():
    out = []
    for level, (service, layer_id) in ITL_SERVICES.items():
        layer = f"{ONS_ARCGIS}/{service}/FeatureServer/{layer_id}"
        out.append(arcgis_geojson(layer, SRC / "itl" / f"ITL{level}_JAN_2025_BGC.geojson"))
    return out


def fetch_geoboundaries_ua():
    return [download(url, SRC / "geoboundaries" / f"geoBoundaries-UKR-{adm}.geojson")
            for adm, url in GEOBOUNDARIES_UA.items()]


def fetch_gmba():
    return download(GMBA_URL, SRC / "gmba" / "GMBA_Inventory_v2.0_standard_basic.zip")


def fetch_eea_coastline():
    return download(EEA_COASTLINE_URL, SRC / "eea" / "eea_coastline_polygon_v3.zip")


def fetch_biogeo():
    # Eleven regions, but drawn at coastline weight. 0.002 degrees is roughly
    # 200 m of generalisation, invisible at the "which of eleven regions am I
    # in" question this layer answers.
    return arcgis_geojson(BIOGEO_LAYER, SRC / "eea" / "biogeo_regions.geojson",
                          page=50, precision=4, max_offset=0.002)


def fetch_rbd():
    return arcgis_geojson(RBD_LAYER, SRC / "eea" / "wise_rbd_2022.geojson",
                          page=50, precision=4, max_offset=0.002)


def fetch_all():
    """Everything the build needs, in dependency-free order."""
    fetch_nuts()
    fetch_lau()
    fetch_itl()
    fetch_geoboundaries_ua()
    fetch_gmba()
    fetch_eea_coastline()
    fetch_biogeo()
    fetch_rbd()


if __name__ == "__main__":
    fetch_all()
