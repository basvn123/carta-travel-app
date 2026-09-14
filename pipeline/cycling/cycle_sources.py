"""Every upstream the cycling layer reads, cache first, network second.

The cache is the snapshot (invariant 1): a warm rebuild never touches the
network and produces byte-identical wire apart from generated_at. So every
function here answers from cache/cycling/ or data/raw/ when it can, and only
falls through to HTTP when a stage explicitly asks for a refresh.

Four channels, in the order they matter:

  Geofabrik extracts   the pan-European spine. route=bicycle relations, read
                       with pyosmium out of the same per-country .osm.pbf
                       files the trails layer already downloaded, so cycling
                       costs nothing extra to harvest. Never Overpass for
                       bulk: extracts are the bulk channel.
  EuroVelo GPX         17 routes, about 90,000 km, ODbL since October 2024.
                       No bulk API; one GPX per route from the route page,
                       and only the DEVELOPED sections are published, which
                       is itself the useful signal (the FR/ES/PT gaps).
                       Ground truth for validating the OSM geometry, the
                       same role swisstopo plays for trails, never the
                       primary.
  National portals     per-country cross-checks. Each one measures an
                       agreement percentage against the OSM line and that
                       percentage ships as a trust signal.
  Overpass             small, targeted queries only: services along a route
                       corridor and node-network junctions. Rate limited and
                       cached per cell, exactly as the trails scenic sweep
                       does it.

On the portals that are NOT available: Spatial Hub Scotland publishes its
Cycling Network under OGL v3 and serves it only through a GeoServer WFS that
answers an anonymous GetFeature with 403 Forbidden. That is recorded here as
a status rather than worked around, and Scotland's ground truth comes from
the Sustrans National Cycle Network instead, which now carries the Scottish
NCN itself (the Spatial Hub dataset says so in its own description). Austria
GIP is registration gated and is treated as unavailable per the brief.

ASCII clean, no em dashes, per project convention.

Usage:
    python pipeline/cycling/cycle_sources.py --status
    python pipeline/cycling/cycle_sources.py --eurovelo 6 --refresh
    python pipeline/cycling/cycle_sources.py --portal sustrans_ncn
"""

import argparse
import importlib.util
import json
import re
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))

from src.ingestion.core import config as ingest_config  # noqa: E402
from src.ingestion.core.storage import RawStore  # noqa: E402

# The Overpass client with the timed-out-means-empty trap already closed:
# a query Overpass could not finish comes back 200 with an empty element list
# and a remark, which reads exactly like "this cell has nothing". This raises
# on the remark instead, which is why every layer imports it rather than
# calling the endpoint directly.
from beaches.sources import (  # noqa: E402,F401
    SourceError, haversine_km, overpass, request)

CACHE = ROOT / "cache" / "cycling"
CONTACT = "bas.vannieuwenhuyse123@gmail.com"
UA = f"CartaCycling/1.0 (https://carta-europetravel.com; {CONTACT})"

LICENSE_OSM = "ODbL 1.0"
ATTRIBUTION_OSM = "Cycle route data (c) OpenStreetMap contributors, ODbL"


def log(msg):
    print(f"[cycling] {msg}", flush=True)


def _session():
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    return s


# ---------------------------------------------------------------------------
# The lab, patiently
# ---------------------------------------------------------------------------

# pipeline/trails/db.py opens with connect_timeout=10, which is right for a
# script that should fail fast when the container is down. It is wrong for
# this layer: a cycling harvest runs for hours next to whatever else is using
# the machine, and a ten second timeout during a checkpoint or an autovacuum
# turns a busy moment into a dead run. Worse, the trails ingest pattern holds
# ONE connection for a whole multi-country pass, so a single refused connect
# loses every country after it.
#
# Learned the hard way twice in one afternoon: once when two concurrent
# harvests put Postgres into crash recovery and the surviving process then
# reported progress while failing every remaining country with "the connection
# is closed", and once when a services sweep could not open a connection at
# all and wrote an empty log.
LAB_CONNECT_TIMEOUT = 45
# Twenty attempts with the backoff capped at half a minute is about ten
# minutes of patience. That sounds excessive until you watch another session
# take the machine to 271 MB free of 16 GB with sixteen concurrent extract
# passes: Postgres stops accepting connections for minutes at a stretch and
# comes back on its own. Ten minutes of waiting is cheaper than losing a
# country pass that took forty.
LAB_RETRIES = 20
LAB_BACKOFF_S = 5
LAB_BACKOFF_MAX_S = 30


def lab_connect(**overrides):
    """A trailslab connection that waits for a busy or recovering server.

    Same signature and defaults as pipeline/trails/db.connect, plus patience.
    Raises the last error once the retries are spent, so a genuinely absent
    container still fails rather than hanging forever.
    """
    sys.path.insert(0, str(ROOT / "pipeline" / "trails"))
    from db import connect as _connect  # noqa: E402  (path-dependent import)

    overrides.setdefault("connect_timeout", LAB_CONNECT_TIMEOUT)
    last = None
    for attempt in range(LAB_RETRIES):
        try:
            return _connect(**overrides)
        except Exception as exc:                       # noqa: BLE001
            last = exc
            wait = min(LAB_BACKOFF_MAX_S, LAB_BACKOFF_S * (attempt + 1))
            log(f"lab not answering ({type(exc).__name__}), retry "
                f"{attempt + 1}/{LAB_RETRIES} in {wait}s")
            time.sleep(wait)
    raise last


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def cache_path(stage, key=""):
    CACHE.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(key)) if key else ""
    return CACHE / (f"{stage}_{safe}.json" if safe else f"{stage}.json")


def load_cache(stage, key="", default=None):
    path = cache_path(stage, key)
    if not path.exists():
        return default
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return default


def save_cache(stage, key, payload):
    path = cache_path(stage, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    tmp.replace(path)
    return path


# ---------------------------------------------------------------------------
# Geofabrik: reuse the trails downloader rather than growing a second one
# ---------------------------------------------------------------------------

_ingest = None


def _trails_ingest():
    """pipeline/trails/ingest_osm_routes.py, loaded by path.

    Imported for its extract cache and its resumable multi-GB downloader,
    which already survives a dropped connection on the 4 GB France file.
    Loading it by path (the pattern the beach, lake and trip layers use for
    each other's helpers) keeps its sibling `db` import resolving to its own
    folder.
    """
    global _ingest
    if _ingest is None:
        path = ROOT / "pipeline" / "trails" / "ingest_osm_routes.py"
        spec = importlib.util.spec_from_file_location("carta_trails_ingest", path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["carta_trails_ingest"] = mod
        old = list(sys.path)
        sys.path.insert(0, str(path.parent))
        try:
            spec.loader.exec_module(mod)
        finally:
            sys.path[:] = old
        _ingest = mod
    return _ingest


def countries():
    """Geofabrik europe slug -> ISO2, the trails map verbatim."""
    return dict(_trails_ingest().COUNTRIES)


def slug_for_iso2():
    """ISO2 -> Geofabrik slug, the inverse of countries().

    Every module here takes ISO2 on the command line and every extract is
    named by slug, so the inversion happens somewhere in each of them. Once,
    here, instead.
    """
    return {iso: slug for slug, iso in countries().items()}


def extract_for(slug, refresh=False):
    """The .osm.pbf for one country, from the raw store or the network."""
    return _trails_ingest().fetch_extract(slug, refresh)


def cached_extract(slug):
    """The newest already-downloaded extract, or None. Never fetches."""
    return _trails_ingest().cached_extract(slug)


# ---------------------------------------------------------------------------
# EuroVelo
# ---------------------------------------------------------------------------

EUROVELO_HOME = "https://en.eurovelo.com"

# The 17 routes that exist. EV16 and EV18 were never assigned; the numbering
# is the ECF's and it has gaps, so this is a list and not a range.
EUROVELO_NUMBERS = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19)

# The prescribed attribution, shipped verbatim. The ECF asks for this exact
# sentence with the download date substituted, and a paraphrase is not a
# licence compliance.
EUROVELO_ATTRIBUTION = (
    "Contains information from EuroVelo GPX tracks downloaded from "
    "www.EuroVelo.com on {date}, which is made available here under the "
    "Open Database License (ODbL).")


def eurovelo_gpx_id(number, session=None, refresh=False):
    """The site's internal route id for EV<number>.

    The download link is /route/get-gpx/<internal id>, and the internal id is
    not the EuroVelo number (EV1 is 2, EV6 is 29, EV19 is 135). Scraped once
    per route from its own page and cached, because a hard-coded table would
    rot the first time the ECF renumbers anything.
    """
    table = load_cache("eurovelo_ids", default={}) or {}
    key = str(number)
    if not refresh and key in table:
        return table[key]
    s = session or _session()
    resp = s.get(f"{EUROVELO_HOME}/ev{number}", timeout=60)
    resp.raise_for_status()
    ids = re.findall(r"/route/get-gpx/(\d+)", resp.text)
    if not ids:
        raise SourceError(f"no GPX link on the EV{number} page")
    table[key] = int(ids[0])
    save_cache("eurovelo_ids", "", table)
    return table[key]


def eurovelo_gpx(number, refresh=False, developed_only=True):
    """The GPX for one EuroVelo route, in the raw store with a manifest row.

    developed_only keeps the ECF's own published scope: only sections that
    exist on the ground are in the file, so the missing stretches in France,
    Spain and Portugal stay missing rather than being drawn as if they were
    rideable. Returns (path, downloaded_on) where downloaded_on is the date
    the prescribed attribution has to name.
    """
    store = RawStore("eurovelo")
    suffix = "developed" if developed_only else "full"
    name = f"EV{number:02d}-{suffix}.gpx"
    if not refresh:
        hits = [p for p in (ingest_config.DATA_DIR / "eurovelo").glob(f"*/{name}")
                if p.stat().st_size > 0]
        if hits:
            newest = max(hits, key=lambda p: p.stat().st_mtime)
            return newest, newest.parent.name
    s = _session()
    rid = eurovelo_gpx_id(number, session=s, refresh=refresh)
    url = f"{EUROVELO_HOME}/route/get-gpx/{rid}"
    if developed_only:
        url += "?developed=1"
    log(f"EV{number}: downloading {url}")
    resp = s.get(url, timeout=300)
    resp.raise_for_status()
    if b"<gpx" not in resp.content[:400]:
        raise SourceError(f"EV{number}: response is not GPX")
    # RawStore.save_response takes (name, resp, url, note), in that order.
    path = store.save_response(
        name, resp, url,
        note="EuroVelo GPX tracks, ODbL since 2024-10-09; "
             "attribution string is prescribed, see EUROVELO_ATTRIBUTION")
    return Path(path), Path(path).parent.name


def eurovelo_credit(download_date):
    """The prescribed sentence with the date filled in."""
    return EUROVELO_ATTRIBUTION.format(date=download_date)


# ---------------------------------------------------------------------------
# National portals
# ---------------------------------------------------------------------------

# One row per national cross-check dataset. `status` is the honest state of
# the channel, not an aspiration:
#
#   open        fetched and used
#   gated       published under an open licence but not actually servable to
#               an anonymous client; the reason is recorded and the layer
#               falls back to whatever else covers that country
#   unresolved  the licence is fine and the data exists, but the download URL
#               here was written from the brief rather than from a response
#               and does not work. Recorded with the landing page so the next
#               person resolves it instead of rediscovering that it is dead
#
# `agreement_cc` is which ISO2 the dataset is the ground truth for. A country
# with no open portal simply has no agreement percentage, which is a missing
# reading and not a bad one (invariant 6).
PORTALS = {
    "sustrans_ncn": {
        "title": "Sustrans National Cycle Network (Public)",
        "kind": "arcgis",
        "url": "https://services5.arcgis.com/1ZHcUS1lwPTg4ms0/arcgis/rest/"
               "services/National_Cycle_Network_Public/FeatureServer/0",
        "license": "Open Government Licence v3.0",
        "attribution": "National Cycle Network data (c) Walk Wheel Cycle "
                       "Trust (Sustrans), Open Government Licence v3.0; "
                       "contains Ordnance Survey data (c) Crown copyright "
                       "and database right",
        "agreement_cc": ["GB", "IE"],
        "status": "open",
        "cadence": "weekly",
    },
    "spatialhub_cycling": {
        "title": "Spatial Hub Scotland, Cycling Network",
        "kind": "wfs",
        "url": "https://geo.spatialhub.scot/geoserver/sh_cycnt/wfs",
        "layer": "sh_cycnt:pub_cycnt",
        "license": "Open Government Licence v3.0",
        "attribution": "Cycling Network Scotland, (c) the Scottish local "
                       "authorities via the Improvement Service, Open "
                       "Government Licence v3.0",
        "agreement_cc": ["GB"],
        "status": "gated",
        "why": "anonymous WFS GetFeature answers 403 Forbidden; the "
               "Improvement Service asks for a request to "
               "spatialhub@improvementservice.org.uk. Scotland's ground "
               "truth comes from sustrans_ncn instead, which carries the "
               "Scottish NCN.",
        "cadence": "quarterly",
    },
    "bnac_france": {
        "title": "Base Nationale des Amenagements Cyclables",
        "kind": "file",
        # Resolved live, never pinned: data.gouv.fr mints a NEW resource id
        # and a new dated path on every monthly republish, which is why the
        # id hard-coded here first simply 404ed. resolve_datagouv() asks the
        # dataset API for the newest GeoJSON.
        "url": None,
        "resolver": "datagouv",
        "dataset": "amenagements-cyclables-france-metropolitaine",
        "page": "https://transport.data.gouv.fr/datasets/"
                "amenagements-cyclables-france-metropolitaine",
        "license": "Licence Ouverte 2.0 (Etalab)",
        "attribution": "Base Nationale des Amenagements Cyclables, "
                       "Licence Ouverte 2.0",
        "agreement_cc": ["FR"],
        # NOT independent ground truth, and this is the important part. The
        # dataset's own description says it is "all digitized bicycle
        # facilities in metropolitan France processed through OpenStreetMap",
        # so it is an OSM export in a standard schema. Measuring our OSM lines
        # against it would report a high agreement that means nothing except
        # that both sides read the same database. The brief says as much in
        # passing. It is fetched and recorded as a SCHEMA reference, and it is
        # excluded from the agreement measurement.
        "status": "open",
        "derived_from_osm": True,
        "agreement": False,
        "why": "an OSM export in a national schema, so agreement against it "
               "measures nothing independent; kept as a schema reference",
        "cadence": "monthly",
    },
    "toerisme_vlaanderen": {
        "title": "Fietsknooppunten node network v2",
        "kind": "file",
        "url": None,
        "page": "https://data.toerismevlaanderen.be/",
        "license": "Flemish open data licence",
        "attribution": "Cycling node network from Toerisme Vlaanderen",
        "agreement_cc": ["BE"],
        "status": "unresolved",
        "why": "the host refuses the connection outright; the node network is "
               "in OSM anyway and cycle_nodes already carries 11,058 Belgian "
               "junctions, so this is a cross-check we do not currently need",
        "cadence": "quarterly",
    },
    "opendata_swiss_veloland": {
        "title": "Veloland / SchweizMobil national cycle routes",
        "kind": "file",
        # opendata.swiss answers an automated GET with 403, so discovery goes
        # through the federal STAC API instead, which is the machine-readable
        # route and is what the trails layer already uses for swisstopo. The
        # asset is a zipped SHAPEFILE in EPSG:2056; the .gpkg.zip path guessed
        # here first does not exist.
        "url": None,
        "resolver": "swiss_stac",
        "collection": "ch.astra.veloland",
        "asset": "veloland_2056.shp.zip",
        # The archive holds three shapefiles (Etappe, Route, VeloWeg) in a
        # dated folder, so GDAL cannot pick one and refuses the zip outright.
        # Route is the signed national and regional routes, which is what this
        # layer harvests and therefore what an agreement figure should compare
        # against; VeloWeg is the physical carriageway network underneath it.
        "member": "Route.shp",
        "page": "https://opendata.swiss/en/dataset/langsamverkehr-veloland-schweiz",
        "license": "opendata.swiss terms (free reuse with source named)",
        "attribution": "Veloland route network, SchweizMobil / "
                       "Federal Roads Office ASTRA, opendata.swiss",
        "agreement_cc": ["CH"],
        "kind": "shapefile_zip",
        "status": "open",
        "cadence": "quarterly",
    },
    "gip_austria": {
        "title": "GIP.at Austrian transport graph",
        "kind": "none",
        "url": "https://www.gip.gv.at/",
        "license": "unconfirmed, registration gated",
        "attribution": None,
        "agreement_cc": ["AT"],
        "status": "gated",
        "why": "historically registration gated; the brief says treat as "
               "unavailable and use OSM.",
        "cadence": None,
    },
}


def portal_status():
    """Which cross-checks are live, for the run summary and the doc."""
    return {name: {"status": spec["status"], "license": spec["license"],
                   "countries": spec["agreement_cc"],
                   "why": spec.get("why")}
            for name, spec in sorted(PORTALS.items())}


def arcgis_features(url, where="1=1", out_fields="*", page=1000,
                    max_records=0, session=None):
    """Every feature of an ArcGIS FeatureServer layer, paged.

    resultOffset paging rather than one unbounded query: the service caps a
    response at maxRecordCount regardless of what is asked for, and a caller
    that does not page silently gets the first two thousand features and
    calls that the National Cycle Network.
    """
    s = session or _session()
    offset, out = 0, []
    while True:
        params = {"where": where, "outFields": out_fields, "f": "geojson",
                  "outSR": 4326, "resultOffset": offset,
                  "resultRecordCount": page, "returnGeometry": "true"}
        resp = s.get(url.rstrip("/") + "/query", params=params, timeout=180)
        resp.raise_for_status()
        payload = resp.json()
        if "error" in payload:
            raise SourceError(f"arcgis: {payload['error']}")
        feats = payload.get("features") or []
        out.extend(feats)
        if len(feats) < page or (max_records and len(out) >= max_records):
            break
        offset += len(feats)
        time.sleep(0.3)
    return out[:max_records] if max_records else out


def wfs_features(url, layer, count=0, session=None):
    """A WFS 2.0 GetFeature as GeoJSON. Raises SourceError on a gated server."""
    s = session or _session()
    params = {"service": "WFS", "version": "2.0.0", "request": "GetFeature",
              "typeNames": layer, "outputFormat": "application/json",
              "srsName": "EPSG:4326"}
    if count:
        params["count"] = count
    resp = s.get(url, params=params, timeout=300)
    if resp.status_code == 403:
        raise SourceError(f"wfs {layer}: 403 Forbidden (server is gated)")
    resp.raise_for_status()
    ctype = (resp.headers.get("content-type") or "").lower()
    if "json" not in ctype:
        raise SourceError(f"wfs {layer}: served {ctype or 'nothing'}, not JSON")
    return (resp.json().get("features") or [])


def portal_geojson(name, refresh=False, max_records=0):
    """One national cross-check dataset as GeoJSON features, cache first.

    Returns (features, meta). A gated or failing portal returns ([], meta)
    with the reason in meta rather than raising: a missing cross-check makes
    an agreement percentage absent, which is a missing reading, not a reason
    to fail the build.
    """
    spec = PORTALS[name]
    meta = {"source": name, "license": spec["license"],
            "attribution": spec["attribution"], "status": spec["status"],
            "countries": spec["agreement_cc"]}
    if spec["status"] != "open":
        meta["why"] = spec.get("why")
        return [], meta

    cached = load_cache("portal", name)
    if cached and not refresh:
        meta.update(cached.get("meta") or {})
        meta["from_cache"] = True
        return cached.get("features") or [], meta

    try:
        if spec["kind"] == "arcgis":
            feats = arcgis_features(spec["url"], max_records=max_records)
        elif spec["kind"] == "wfs":
            feats = wfs_features(spec["url"], spec["layer"], count=max_records)
        elif spec["kind"] == "shapefile_zip":
            feats = _shapefile_zip_features(_resolve_url(spec),
                                            spec.get("member"))
        else:
            feats = _download_features(_resolve_url(spec))
    except (requests.RequestException, SourceError, ValueError) as exc:
        meta.update({"status": "failed", "why": f"{type(exc).__name__}: {exc}"})
        log(f"portal {name}: unavailable ({meta['why']})")
        return [], meta

    meta["fetched_on"] = datetime.now(timezone.utc).date().isoformat()
    meta["n_features"] = len(feats)
    save_cache("portal", name, {"meta": meta, "features": feats})
    return feats, meta


def resolve_datagouv(dataset):
    """Newest GeoJSON resource on a data.gouv.fr dataset, by asking it."""
    s = _session()
    url = f"https://www.data.gouv.fr/api/1/datasets/{dataset}/"
    resp = s.get(url, timeout=90)
    resp.raise_for_status()
    best = None
    for res in (resp.json() or {}).get("resources") or []:
        if (res.get("format") or "").lower() != "geojson":
            continue
        when = res.get("last_modified") or res.get("created_at") or ""
        if best is None or when > best[0]:
            best = (when, res.get("url"))
    if not best or not best[1]:
        raise SourceError(f"{dataset}: no geojson resource listed")
    return best[1]


def resolve_swiss_stac(collection, asset):
    """One asset href from the geo.admin STAC API.

    opendata.swiss refuses automated requests with 403, and pinning a
    data.geo.admin.ch path guesses at a filename that changes. The STAC
    collection is the published machine-readable index and answers plainly.
    """
    s = _session()
    url = ("https://data.geo.admin.ch/api/stac/v0.9/collections/"
           f"{collection}/items")
    resp = s.get(url, timeout=90)
    resp.raise_for_status()
    for feat in (resp.json() or {}).get("features") or []:
        assets = feat.get("assets") or {}
        if asset in assets:
            return assets[asset].get("href")
        for key, val in assets.items():
            if key.endswith(".shp.zip"):
                return val.get("href")
    raise SourceError(f"{collection}: no {asset} in the STAC items")


def _resolve_url(spec):
    """The live download URL for a portal that publishes a moving one."""
    which = spec.get("resolver")
    if which == "datagouv":
        return resolve_datagouv(spec["dataset"])
    if which == "swiss_stac":
        return resolve_swiss_stac(spec["collection"], spec["asset"])
    return spec.get("url")


def _download_features(url):
    """A plain GeoJSON/JSON endpoint. Anything else is refused loudly."""
    s = _session()
    resp = s.get(url, timeout=300)
    resp.raise_for_status()
    ctype = (resp.headers.get("content-type") or "").lower()
    if "json" not in ctype:
        raise SourceError(f"served {ctype or 'nothing'}, not JSON")
    payload = resp.json()
    if isinstance(payload, dict) and payload.get("features") is not None:
        return payload["features"]
    raise SourceError("no feature collection in the response")


def _shapefile_zip_features(url, member=None):
    """A zipped shapefile as GeoJSON features, reprojected to WGS84.

    geopandas reads straight out of the archive, so nothing is unpacked to
    disk. The Swiss file is EPSG:2056 and everything downstream in this layer
    is 4326, so the reprojection happens here rather than being a surprise in
    PostGIS.
    """
    import geopandas as gpd

    # Downloaded to the raw store first, then read locally. GDAL's
    # /vsizip/vsicurl/ chain refuses this particular archive, and more to the
    # point the cache is the snapshot (invariant 1): a warm rebuild must not
    # depend on a federal server being up.
    store = RawStore("cycling_portals")
    name = url.rsplit("/", 1)[-1]
    local = store.path_for(name)
    # Any earlier day's copy will do: a national network is a quarterly
    # publication and this is a cross-check, not the spine.
    if not local.exists():
        for older in sorted((store.dir.parent).glob(f"*/{name}"), reverse=True):
            local = older
            break
    if not local.exists():
        sess = _session()
        resp = sess.get(url, stream=True, timeout=600)
        resp.raise_for_status()
        store.save_response(name, resp, url,
                            note="national cycling network, cross-check only")
    target = f"zip://{local}"
    if member:
        import zipfile
        with zipfile.ZipFile(local) as zf:
            inner = next((n for n in zf.namelist() if n.endswith(member)), None)
        if not inner:
            raise SourceError(f"{local.name}: no {member} inside")
        target = f"zip://{local}!{inner}"
    gdf = gpd.read_file(target)
    if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(4326)
    return json.loads(gdf.to_json()).get("features") or []


# ---------------------------------------------------------------------------
# Reference geodata mirrored into the lab
# ---------------------------------------------------------------------------
#
# Two polygon layers the scenic score needs and no cycling stage can compute:
# protection status, and where the sea is. Both are loaded once into the
# trailslab DB and then measured in SQL, because measuring a route against a
# remote service one route at a time would be tens of thousands of requests
# for an answer PostGIS gives in milliseconds.
#
# Natura 2000 alone would score the Cairngorms, the Norwegian fjords and every
# Swiss pass at zero, because those are not in the EU designation. Emerald is
# the Bern Convention twin that covers exactly those countries, which is why
# the master spec pairs them and rejects WDPA outright: the UNEP-WCMC licence
# is non-commercial and it is the single biggest legal trap in this space.

EEA_BIO = "https://bio.discomap.eea.europa.eu/arcgis/rest/services"
PROTECTED_LAYERS = [
    {"name": "natura2000",
     "url": f"{EEA_BIO}/N2K_Backbone/N2KBackbone/MapServer/1",
     "fields": "SiteCode,SiteName",
     "license": "EEA standard re-use policy (CC BY 4.0)",
     "credit": "Natura 2000 site boundaries, European Environment Agency"},
    {"name": "emerald",
     "url": f"{EEA_BIO}/ProtectedSites/EmeraldSites/MapServer/3",
     "fields": "*",
     "license": "EEA standard re-use policy (CC BY 4.0)",
     "credit": "Emerald Network sites (Bern Convention), European "
               "Environment Agency"},
]

PROTECTED_DDL = """
CREATE TABLE IF NOT EXISTS cycle_protected (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source     text NOT NULL,
    site_code  text,
    name       text,
    geom       geometry(Geometry, 4326) NOT NULL,
    license    text NOT NULL,
    UNIQUE (source, site_code)
);
CREATE INDEX IF NOT EXISTS cycle_protected_geom_gist
    ON cycle_protected USING gist (geom);

CREATE TABLE IF NOT EXISTS region_coast (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coast_id text,
    name    text,
    cc      text,
    geom    geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS region_coast_geom_gist
    ON region_coast USING gist (geom);
"""

# Europe, generously. The EEA services are global-capable and a bbox keeps a
# paged download to the sites that could ever touch a European cycle route.
EUROPE_BBOX = (-32.0, 33.0, 45.0, 72.0)


# Geometry simplification asked of the server, in degrees, so the polygons
# arrive at a size a laptop can hold. 0.001 degrees is about 100 m, which is
# far below the question being asked ("does this route run inside a protected
# site") and cuts a Natura 2000 download from gigabytes to tens of megabytes.
PROTECTED_OFFSET_DEG = 0.001
# Polygons per request. The service caps a response at 2,000 records, but a
# response of 2,000 protected-site polygons is a timeout; 40 is what actually
# comes back.
PROTECTED_BATCH = 40


def _arcgis_paged(url, session, page=PROTECTED_BATCH, bbox=None,
                  envelope_sr=4326, out_fields="*", simplify=None):
    """Every feature of an ArcGIS MapServer layer, by object id.

    Not resultOffset paging. These EEA MapServer layers advertise pagination
    and then answer an offset query with HTTP 400 or 500 somewhere past the
    two thousandth record, which is a failure that looks like the end of the
    data. Asking for the object ids first and then fetching them in explicit
    batches cannot silently truncate: the id list is the ground truth for how
    many there are, and a batch that fails is a batch that is retried rather
    than a country quietly missing.
    """
    query = url.rstrip("/") + "/query"
    id_params = {"where": "1=1", "returnIdsOnly": "true", "f": "json"}
    if bbox:
        id_params.update({
            "geometry": ",".join(str(v) for v in bbox),
            "geometryType": "esriGeometryEnvelope",
            "inSR": envelope_sr, "spatialRel": "esriSpatialRelIntersects"})
    resp = session.get(query, params=id_params, timeout=300)
    resp.raise_for_status()
    payload = resp.json()
    if "error" in payload:
        raise SourceError(f"arcgis ids: {payload['error']}")
    ids = payload.get("objectIds") or []
    if not ids:
        return []
    log(f"  {len(ids)} object ids to fetch in batches of {page}")

    out, failed = [], 0
    for start in range(0, len(ids), page):
        batch = ids[start:start + page]
        params = {"objectIds": ",".join(str(i) for i in batch),
                  "outFields": out_fields, "f": "geojson", "outSR": 4326,
                  "returnGeometry": "true", "geometryPrecision": 5}
        if simplify:
            params["maxAllowableOffset"] = simplify
        try:
            resp = session.get(query, params=params, timeout=300)
            resp.raise_for_status()
            got = resp.json()
            if "error" in got:
                raise SourceError(str(got["error"]))
            out.extend(got.get("features") or [])
        except (requests.RequestException, SourceError, ValueError) as exc:
            failed += len(batch)
            log(f"  batch at {start} failed ({type(exc).__name__}), skipped")
        if (start // page) % 25 == 0:
            log(f"  {len(out)}/{len(ids)} features ...")
        time.sleep(0.2)
    if failed:
        log(f"  {failed} of {len(ids)} features could not be fetched")
    return out


def load_protected(conn, refresh=False):
    """Mirror Natura 2000 and Emerald polygons into cycle_protected.

    Absence is handled by the caller, not faked here: if the EEA service is
    down the table simply has no rows for that source and the scenic score
    drops the protected component and renormalises.
    """
    with conn.cursor() as cur:
        cur.execute(PROTECTED_DDL)
    conn.commit()
    session = _session()
    total = 0
    for spec in PROTECTED_LAYERS:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM cycle_protected WHERE source = %s",
                        (spec["name"],))
            have = cur.fetchone()[0]
        if have and not refresh:
            log(f"protected {spec['name']}: {have} already loaded")
            total += have
            continue
        cached = load_cache("protected", spec["name"])
        if cached and not refresh:
            feats = cached.get("features") or []
        else:
            log(f"protected {spec['name']}: downloading from the EEA")
            try:
                feats = _arcgis_paged(spec["url"], session, bbox=EUROPE_BBOX,
                                      out_fields=spec["fields"],
                                      simplify=PROTECTED_OFFSET_DEG)
            except (requests.RequestException, SourceError, ValueError) as exc:
                log(f"protected {spec['name']}: unavailable "
                    f"({type(exc).__name__}: {exc})")
                continue
            save_cache("protected", spec["name"],
                       {"fetched_on": datetime.now(timezone.utc)
                        .date().isoformat(), "features": feats})
        written = _store_protected(conn, spec, feats)
        log(f"protected {spec['name']}: {written} polygon(s) stored")
        total += written
    return total


def _prop(props, *names):
    """First matching property, matched without regard to case."""
    lowered = {str(k).lower(): v for k, v in (props or {}).items()}
    for name in names:
        got = lowered.get(name)
        if got not in (None, ""):
            return str(got)
    return None


def _store_protected(conn, spec, feats):
    written = 0
    with conn.cursor() as cur:
        for feat in feats:
            geom = feat.get("geometry")
            if not geom or geom.get("type") not in ("Polygon", "MultiPolygon"):
                continue
            props = feat.get("properties") or {}
            # Case-insensitive, because the two EEA services do not agree
            # with each other: Natura 2000 ships SiteCode and SiteName,
            # Emerald ships different spellings again. A case-sensitive
            # lookup here silently gave every Natura 2000 polygon the same
            # empty site code, ON CONFLICT collapsed 26,987 sites into one
            # row, and the protected component then read as "almost nothing
            # in Europe is protected" rather than as an error.
            code = _prop(props, "sitecode", "site_code", "code", "sitecode_1")
            name = _prop(props, "sitename", "site_name", "name")
            if not code:
                code = str(feat.get("id") or props.get("OBJECTID") or "")
            if not code:
                continue
            # ST_MakeValid: EEA site rings self-intersect often enough that a
            # raw insert loses whole countries to one bad polygon.
            cur.execute(
                """INSERT INTO cycle_protected (source, site_code, name, geom,
                                                license)
                   VALUES (%s, %s, %s,
                           ST_MakeValid(ST_SetSRID(
                               ST_GeomFromGeoJSON(%s), 4326)), %s)
                   ON CONFLICT (source, site_code) DO UPDATE SET
                       name = EXCLUDED.name, geom = EXCLUDED.geom""",
                (spec["name"], str(code)[:60], name, json.dumps(geom),
                 spec["license"]))
            written += 1
    conn.commit()
    return written


def load_coastline(conn, refresh=False):
    """Mirror the region spine's EEA coastline into the lab.

    The coast layer already exists in cache/regions/regions.gpkg, cut from
    the EEA coastline for analysis by brief 01. Copying it into PostGIS is
    what lets the scenic score ask "how far from the sea is this route" in
    one query instead of loading a shapely tree per process.
    """
    with conn.cursor() as cur:
        cur.execute(PROTECTED_DDL)
        cur.execute("SELECT count(*) FROM region_coast")
        have = cur.fetchone()[0]
    conn.commit()
    if have and not refresh:
        log(f"coastline: {have} stretch(es) already in the lab")
        return have

    gpkg = ROOT / "cache" / "regions" / "regions.gpkg"
    if not gpkg.exists():
        log("coastline: no regions.gpkg, the coast component stays absent")
        return 0
    import geopandas as gpd
    coast = gpd.read_file(gpkg, layer="coast").to_crs("EPSG:4326")
    with conn.cursor() as cur:
        cur.execute("TRUNCATE region_coast")
        for _, row in coast.iterrows():
            cur.execute(
                """INSERT INTO region_coast (coast_id, name, cc, geom)
                   VALUES (%s, %s, %s,
                           ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))""",
                (str(row.get("id") or ""), row.get("name"), row.get("cc"),
                 json.dumps(row.geometry.__geo_interface__)))
    conn.commit()
    log(f"coastline: {len(coast)} stretch(es) mirrored into the lab")
    return len(coast)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--status", action="store_true",
                    help="print which channels are live")
    ap.add_argument("--eurovelo", type=int, help="download one EV route's GPX")
    ap.add_argument("--portal", help="fetch one national cross-check")
    ap.add_argument("--reference", action="store_true",
                    help="mirror protected sites and the coastline into "
                         "the lab (the scenic score reads them there)")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    sys.stdout.reconfigure(errors="replace")

    if args.reference:
        sys.path.insert(0, str(ROOT / "pipeline" / "trails"))
        from db import connect  # noqa: E402  (only this branch needs the lab)
        with connect() as conn:
            load_coastline(conn, refresh=args.refresh)
            load_protected(conn, refresh=args.refresh)
        return

    if args.status or not (args.eurovelo or args.portal):
        cc = countries()
        have = sum(1 for slug in cc if cached_extract(slug))
        print(f"geofabrik extracts: {have}/{len(cc)} cached")
        print(f"eurovelo routes:    {len(EUROVELO_NUMBERS)} "
              f"({', '.join('EV%d' % n for n in EUROVELO_NUMBERS)})")
        for name, row in portal_status().items():
            line = f"  {name:26s} {row['status']:7s} {row['license']}"
            print(line)
            if row.get("why"):
                print(f"    {row['why']}")

    if args.eurovelo:
        path, on = eurovelo_gpx(args.eurovelo, refresh=args.refresh)
        print(f"EV{args.eurovelo}: {path} ({path.stat().st_size / 1e6:.1f} MB, "
              f"downloaded {on})")
        print(eurovelo_credit(on))

    if args.portal:
        feats, meta = portal_geojson(args.portal, refresh=args.refresh)
        print(f"{args.portal}: {len(feats)} features, {json.dumps(meta)[:300]}")


if __name__ == "__main__":
    main()
