"""National portal cross-check: official trail geometries vs staged OSM trips.

Loads three official datasets into the portal_trails staging table of the
trailslab PostGIS DB (tools/trailslab, port 5433), then scores every staged
OSM trip against the official geometry and writes a portal_agreement check
into validation_runs.

Sources (raw downloads land in data/raw/<source>/ with a manifest, same
conventions as the src/ingestion collectors):

  CH  swisstopo swissTLM3D-Wanderwege. GeoPackage (EPSG:2056) resolved live
      from the data.geo.admin.ch STAC API and read with plain sqlite3: a
      GeoPackage geometry blob is a small GP header in front of standard WKB,
      so no GDAL/fiona dependency is needed.
  FR  IGN BD TOPO, layer itineraire_autre via the Geoplateforme WFS
      (paged GeoJSON). This is BD TOPO's route-itinerary slice (toponyme
      carries names like "GR 5"); the raw troncon path network is millions of
      unnamed segments and would confirm nothing about a route, so the
      itinerary layer is the cross-checkable "path network" here.
  NO  Kartverket Turrutebasen (Tur- og friluftsruter), nationwide Fotrute
      GML (EPSG:25833) ordered anonymously through the Geonorge download API
      (the WFS advertises no result paging, so bulk goes through the file
      channel). rutenavn inside FotruteInfo carries route names.
  DE  Bayerische Vermessungsverwaltung "Wanderwege" GPX bundle (CC BY 4.0,
      updated monthly): the named signposted long-distance routes of
      Bavaria as one GPX per route. Trail geometry in Germany is held at
      Laender level; Bavaria is the one Land with a clean, verified open
      download, so the DE check covers Bavaria only and the match is
      restricted to trips inside its bbox (the `coverage` key) so trips in
      other Laender do not collect meaningless failed checks. AT was
      surveyed too (2026-08): the Tirol/tiris hub publishes bike routes but
      no hiking-trail vector layer, the OeAV Wegenetz is not open, and no
      other Land ships trail geometry under an open licence, so there is
      deliberately no AT loader yet.

Matching, per staged OSM trip of the country:
  geometry: sample points every --step metres along the trip (capped at
  --max-pts), take the distance from each point to the nearest official
  geometry (geography, metres, capped at 250). Coverage at 60 m is the core
  signal; median and p90 distances and 150 m coverage are recorded too.
  names: accent-folded similarity (SequenceMatcher plus containment, spaces
  stripped for ref-style names such as "GR 5") between the trip's
  title/name/ref and official names within 120 m. The fold maps l-with-stroke,
  o-slash, eszett, ae/oe ligatures before NFKD, the same approach as the POI
  dedupe in continent-app (see src/lib/textSearch.js).

  agreement: coverage60 >= 0.60, or coverage60 >= 0.40 with a name match.
  score: 100 * coverage60, +10 when a nearby name matches (capped at 100).
  flags in details: length_mismatch when the name-matched official route's
  total length differs from the trip by more than 2x either way;
  location_mismatch when a strong country-wide name match exists but the
  official geometry lies over 5 km from the trip.

quality_score: agreement adds +10 (capped at 100) to trips that already have
a score; trips with a NULL score (validate.py has not run yet) keep NULL and
the boost is deferred: the validation_runs row is the durable record, and a
rerun after validate.py applies the boost. Reruns never double-boost: trips
with a prior passed portal_agreement row are skipped.

validation_runs is append-only by design; consumers should take the newest
row per (subject, check).

Known limits: trips clipped at the extract border or crossing into a
neighbouring country lose coverage on the foreign part; CH official segments
carry no route names, so Switzerland matches on geometry alone.

Usage, from the repo root (DB must be up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/crosscheck_portals.py
    python pipeline/trails/crosscheck_portals.py --countries CH --limit 200
    python pipeline/trails/crosscheck_portals.py --load-only --refresh
    python pipeline/trails/crosscheck_portals.py --match-only --sample 12
"""

import argparse
import json
import re
import sqlite3
import sys
import time
import unicodedata
import zipfile
from collections import Counter
from difflib import SequenceMatcher
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import shapely
from lxml import etree
from shapely.geometry import MultiLineString, shape

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))                              # src.ingestion imports
sys.path.insert(0, str(Path(__file__).resolve().parent))   # db.py

from db import connect  # noqa: E402
from src.ingestion.core import config as ingest_config  # noqa: E402
from src.ingestion.core.http import PoliteSession  # noqa: E402
from src.ingestion.core.storage import RawStore  # noqa: E402

STAC_ITEMS = ("https://data.geo.admin.ch/api/stac/v0.9/collections/"
              "ch.swisstopo.swisstlm3d-wanderwege/items")
IGN_WFS = "https://data.geopf.fr/wfs/ows"
IGN_LAYER = "BDTOPO_V3:itineraire_autre"
IGN_PAGE = 1000
GEONORGE_API = "https://nedlasting.geonorge.no/api"
TURRUTE_UUID = "d1422d17-6d95-4ef1-96ab-8af31744dd63"
BVV_GPX_URL = ("https://geodaten.bayern.de/odd/m/2/freizeitwege/wanderwege/"
               "gpx/wanderwege_gpx.zip")
BAVARIA_BBOX = (8.95, 47.25, 13.90, 50.60)   # lon/lat envelope, DE coverage

NEAR_M = 60          # a sampled point this close to official geometry counts as covered
LOOSE_M = 150        # secondary coverage band, recorded in details
FAR_M = 250          # distance cap; beyond this a point just counts as uncovered
NAME_RADIUS_M = 120  # official names this close to the trip are name candidates
NAME_SIM = 0.85      # nearby name similarity that counts as a match
STRONG_SIM = 0.90    # country-wide similarity that can raise location_mismatch
BOOST = 10

EARTH_RADIUS_M = 6371008.8


# ---------------------------------------------------------------------------
# Name folding and similarity
# ---------------------------------------------------------------------------

# Same approach as the POI dedupe fold (continent-app src/lib/textSearch.js):
# map the letters NFKD leaves intact before stripping combining marks.
FOLD_MAP = str.maketrans({
    "ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "ß": "ss",
    "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "đ": "d", "Đ": "d",
})


def fold(s):
    s = (s or "").translate(FOLD_MAP)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


def name_similarity(a, b):
    """Similarity of two folded names in [0, 1]."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    sim = SequenceMatcher(None, a, b).ratio()
    # Refs like "gr 5" vs "gr5": compare with spaces stripped as well.
    sim = max(sim, SequenceMatcher(None, a.replace(" ", ""),
                                   b.replace(" ", "")).ratio())
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) >= 5 and shorter in longer:
        sim = max(sim, 0.92)
    return sim


def best_name_match(trip_names, portal_names):
    """(best portal name, similarity) across folded candidate pairs."""
    best, best_sim = None, 0.0
    for pname in portal_names:
        for variant in [v.strip() for v in pname.split(";")] or [pname]:
            fv = fold(variant)
            if not fv:
                continue
            for tname in trip_names:
                sim = name_similarity(tname, fv)
                if sim > best_sim:
                    best, best_sim = variant, sim
    return best, best_sim


def haversine_m(lon1, lat1, lon2, lat2):
    lam1, phi1, lam2, phi2 = map(radians, (lon1, lat1, lon2, lat2))
    h = sin((phi2 - phi1) / 2) ** 2 + cos(phi1) * cos(phi2) * sin((lam2 - lam1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(h))


# ---------------------------------------------------------------------------
# Loader: Switzerland, swissTLM3D-Wanderwege GeoPackage
# ---------------------------------------------------------------------------

def gpkg_wkb_hex(blob):
    """Strip the GeoPackage binary header, return the WKB as hex (or None)."""
    if blob is None or len(blob) < 8 or blob[:2] != b"GP":
        return None
    flags = blob[3]
    if (flags >> 4) & 1:                      # empty-geometry flag
        return None
    env_len = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get((flags >> 1) & 0x07)
    if env_len is None:
        return None
    return blob[8 + env_len:].hex()


def cached_download(source, pattern):
    hits = [p for p in (ingest_config.DATA_DIR / source).glob(f"*/{pattern}")
            if not p.name.endswith(".part")]
    return max(hits, key=lambda p: p.stat().st_mtime) if hits else None


def fetch_swisstopo_gpkg(session, refresh):
    cached = None if refresh else cached_download("swisstopo", "*wanderwege*.gpkg.zip")
    if cached:
        print(f"  [CH] archive: {cached.name} (cached)")
        zip_path = cached
    else:
        items = session.get(STAC_ITEMS).json().get("features", [])
        href = next(a["href"] for it in items
                    for a in it.get("assets", {}).values()
                    if a.get("href", "").endswith(".gpkg.zip"))
        print(f"  [CH] downloading {href}")
        resp = session.get(href, stream=True)
        zip_path = RawStore("swisstopo").save_response(
            href.rsplit("/", 1)[-1], resp, href,
            note="swissTLM3D-Wanderwege GeoPackage, EPSG:2056; "
                 "source: Federal Office of Topography swisstopo")
        print(f"  [CH] archive: {zip_path.name} "
              f"({zip_path.stat().st_size / 1e6:.0f} MB)")
    with zipfile.ZipFile(zip_path) as zf:
        member = next(n for n in zf.namelist() if n.lower().endswith(".gpkg"))
        target = zip_path.parent / Path(member).name
        if not target.exists():
            zf.extract(member, zip_path.parent)
            extracted = zip_path.parent / member
            if extracted != target:
                extracted.replace(target)
    return target


def load_swisstopo(session, refresh):
    """Yield (name, srid, wkb_hex) from the swissTLM3D-Wanderwege GeoPackage."""
    gpkg = fetch_swisstopo_gpkg(session, refresh)
    con = sqlite3.connect(str(gpkg))
    try:
        tables = con.execute(
            """SELECT c.table_name, g.column_name, g.srs_id, g.geometry_type_name
               FROM gpkg_contents c
               JOIN gpkg_geometry_columns g ON g.table_name = c.table_name
               WHERE c.data_type = 'features'""").fetchall()
        ident = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
        for table, geom_col, srs_id, gtype in tables:
            if not any(k in (gtype or "").upper() for k in ("LINE", "CURVE", "GEOMETRY")):
                continue
            # Identifiers come out of a downloaded file's own metadata tables;
            # only plain names may reach the interpolated SQL below.
            if not ident.match(table or "") or not ident.match(geom_col or ""):
                print(f"  [CH] skipping table with non-identifier name: "
                      f"{table!r} / {geom_col!r}")
                continue
            cols = [r[1] for r in con.execute(f"PRAGMA table_info('{table}')")]
            name_col = next(
                (c for c in cols if c.lower() == "name"),
                next((c for c in cols if "name" in c.lower()
                      and not c.lower().endswith("_uuid")), None))
            if name_col and not ident.match(name_col):
                name_col = None
            sel_name = f'"{name_col}"' if name_col else "NULL"
            print(f"  [CH] table {table}: geometry {geom_col} ({gtype}, "
                  f"srs {srs_id}), name column: {name_col or 'none'}")
            for name, blob in con.execute(
                    f'SELECT {sel_name}, "{geom_col}" FROM "{table}"'):
                wkb = gpkg_wkb_hex(blob)
                if wkb:
                    yield (name, int(srs_id), wkb)
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Loader: France, BD TOPO itineraire_autre via the Geoplateforme WFS
# ---------------------------------------------------------------------------

def load_ign_bdtopo(session, refresh):
    """Yield (name, srid, wkb_hex) from the paged WFS GeoJSON. Always fetched
    live: the full layer is ~26 pages, cheaper to refetch than to version."""
    store = RawStore("ign_bdtopo")
    start, total, page = 0, None, 0
    while total is None or start < total:
        params = {
            "SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature",
            "TYPENAMES": IGN_LAYER, "OUTPUTFORMAT": "application/json",
            "SRSNAME": "CRS:84", "COUNT": IGN_PAGE, "STARTINDEX": start,
            "SORTBY": "cleabs",
        }
        resp = session.get(IGN_WFS, params=params)
        data = resp.json()
        feats = data.get("features", [])
        if total is None:
            total = int(data.get("numberMatched") or 0)
            print(f"  [FR] {IGN_LAYER}: {total} itineraries via WFS")
        store.save_bytes(f"itineraire_autre_p{page:03d}.json", resp.content,
                         url=resp.url, content_type="application/json",
                         note="BD TOPO itineraire_autre page; "
                              "IGN, Etalab Licence Ouverte 2.0")
        for f in feats:
            geom = f.get("geometry")
            if not geom:
                continue
            name = (f.get("properties") or {}).get("toponyme")
            yield (name, 4326, shapely.to_wkb(shape(geom), hex=True))
        if not feats:
            break
        start += len(feats)
        page += 1


# ---------------------------------------------------------------------------
# Loader: Norway, Turrutebasen Fotrute GML via the Geonorge download API
# ---------------------------------------------------------------------------

def fetch_turrutebasen_zip(session, refresh):
    cached = None if refresh else cached_download(
        "turrutebasen", "*TurOgFriluftsruter_GML.zip")
    if cached:
        print(f"  [NO] archive: {cached.name} (cached)")
        return cached
    order = {
        "email": "",
        "usageGroup": "",
        "softwareClient": "CartaIngest",
        "softwareClientVersion": "1.0",
        "orderLines": [{
            "metadataUuid": TURRUTE_UUID,
            "areas": [{"code": "0000", "name": "Hele landet",
                       "type": "landsdekkende"}],
            "projections": [{"code": "25833"}],
            "formats": [{"name": "GML"}],
        }],
    }
    resp = session.post(f"{GEONORGE_API}/order", json=order,
                        headers={"Content-Type": "application/json"})
    files = resp.json().get("files", [])
    if not files:
        raise RuntimeError(f"Geonorge order returned no files: {resp.text[:300]}")
    url, fname = files[0]["downloadUrl"], files[0]["name"]
    print(f"  [NO] downloading {fname}")
    dl = session.get(url, stream=True)
    path = RawStore("turrutebasen").save_response(
        fname, dl, url,
        note="Kartverket Turrutebasen nationwide GML, EPSG:25833; CC BY 4.0")
    print(f"  [NO] archive: {path.name} ({path.stat().st_size / 1e6:.0f} MB)")
    return path


def poslist_coords(elem):
    """One gml:posList -> [(x, y), ...] with the axis order normalised."""
    values = [float(v) for v in (elem.text or "").split()]
    dim = int(elem.get("srsDimension") or 2)
    pts = [tuple(values[i:i + 2]) for i in range(0, len(values) - dim + 1, dim)]
    if not pts:
        return []
    a, b = pts[0]
    # EPSG:25833 posLists are (E, N) with N in the millions; geographic CRS
    # posLists arrive lat-first per the urn axis order. Norway's lat range
    # (57..81) and lon range (4..31) are disjoint, so both cases detect safely.
    if a > 3e6 or (50 <= a <= 82 and not 50 <= b <= 82):
        pts = [(y, x) for x, y in pts]
    return pts


def poslist_srid(elem):
    node = elem
    while node is not None:
        srs = node.get("srsName")
        if srs:
            m = re.search(r"(\d+)$", srs)
            if m:
                return int(m.group(1))
        node = node.getparent()
    return 25833


def load_turrutebasen(session, refresh):
    """Yield (name, srid, wkb_hex) per Fotrute feature in the nationwide GML."""
    zip_path = fetch_turrutebasen_zip(session, refresh)
    with zipfile.ZipFile(zip_path) as zf:
        members = [n for n in zf.namelist() if n.lower().endswith(".gml")]
        for member in members:
            with zf.open(member) as fh:
                for _, feat in etree.iterparse(fh, events=("end",),
                                               tag="{*}Fotrute"):
                    names, srid, lines = [], None, []
                    for el in feat.findall(".//{*}rutenavn"):
                        text = (el.text or "").strip()
                        if text and text not in names:
                            names.append(text)
                    for pl in feat.findall(".//{*}posList"):
                        pts = poslist_coords(pl)
                        if len(pts) >= 2:
                            lines.append(pts)
                            if srid is None:
                                srid = poslist_srid(pl)
                    if lines:
                        name = "; ".join(names)[:500] or None
                        wkb = shapely.to_wkb(MultiLineString(lines), hex=True)
                        yield (name, srid or 25833, wkb)
                    feat.clear()
                    while feat.getprevious() is not None:
                        del feat.getparent()[0]


# ---------------------------------------------------------------------------
# Loader: Germany (Bavaria), BVV Wanderwege GPX bundle
# ---------------------------------------------------------------------------

def fetch_bvv_gpx_zip(session, refresh):
    cached = None if refresh else cached_download(
        "bvv_wanderwege", "wanderwege_gpx*.zip")
    if cached:
        print(f"  [DE] archive: {cached.name} (cached)")
        return cached
    print(f"  [DE] downloading {BVV_GPX_URL}")
    resp = session.get(BVV_GPX_URL, stream=True)
    path = RawStore("bvv_wanderwege").save_response(
        "wanderwege_gpx.zip", resp, BVV_GPX_URL,
        note="BVV Wanderwege named-route GPX bundle, Bavaria; CC BY 4.0, "
             "credit Bayerische Vermessungsverwaltung")
    print(f"  [DE] archive: {path.name} ({path.stat().st_size / 1e6:.0f} MB)")
    return path


def load_bvv_wanderwege(session, refresh):
    """Yield (name, srid, wkb_hex) per named GPX route in the BVV bundle."""
    zip_path = fetch_bvv_gpx_zip(session, refresh)
    routes = 0
    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.namelist():
            if not member.lower().endswith(".gpx"):
                continue
            try:
                root = etree.fromstring(zf.read(member))
            except etree.XMLSyntaxError:
                continue
            for trk in root.findall(".//{*}trk"):
                name = None
                nm = trk.find("{*}name")
                if nm is not None and (nm.text or "").strip():
                    name = nm.text.strip()
                if not name:
                    name = Path(member).stem.replace("_", " ")
                parts = []
                for seg in trk.findall(".//{*}trkseg"):
                    pts = [(float(p.get("lon")), float(p.get("lat")))
                           for p in seg.findall("{*}trkpt")
                           if p.get("lon") and p.get("lat")]
                    if len(pts) >= 2:
                        parts.append(pts)
                if parts:
                    routes += 1
                    yield (name, 4326,
                           shapely.to_wkb(MultiLineString(parts), hex=True))
    print(f"  [DE] {routes} named GPX routes parsed")


# ---------------------------------------------------------------------------
# Staging into portal_trails
# ---------------------------------------------------------------------------

SOURCES = {
    "CH": {"source": "swisstopo", "loader": load_swisstopo,
           "license": "swisstopo open government data (free use with source)"},
    "FR": {"source": "ign_bdtopo", "loader": load_ign_bdtopo,
           "license": "Etalab Licence Ouverte 2.0"},
    "NO": {"source": "turrutebasen", "loader": load_turrutebasen,
           "license": "CC BY 4.0"},
    "DE": {"source": "bvv_wanderwege", "loader": load_bvv_wanderwege,
           "license": "CC BY 4.0 (Bayerische Vermessungsverwaltung)",
           "coverage": BAVARIA_BBOX, "reference": "routes"},
}


def stage_portal(conn, country, cfg, session, refresh):
    t0 = time.time()
    rows = named = 0
    with conn.cursor() as cur:
        cur.execute("CREATE TEMP TABLE portal_stage "
                    "(name text, srid int, geom geometry) ON COMMIT DROP")
        with cur.copy("COPY portal_stage (name, srid, geom) FROM STDIN") as copy:
            for name, srid, wkb in cfg["loader"](session, refresh):
                copy.write_row((name, srid, wkb))
                rows += 1
                named += 1 if name else 0
        cur.execute("DELETE FROM portal_trails WHERE source = %s",
                    (cfg["source"],))
        # Subdivide while staging: a nationwide GR arrives as one giant
        # multiline whose bbox covers half the country, which turns every
        # nearby index probe into an exact distance check against 50k
        # vertices. Small pieces keep the GiST index selective.
        cur.execute(
            """INSERT INTO portal_trails (country, name, geom, source, license)
               SELECT %s, NULLIF(trim(s.name), ''), part.geom, %s, %s
               FROM portal_stage s,
                    LATERAL ST_Subdivide(
                        ST_Force2D(ST_Transform(ST_SetSRID(s.geom, s.srid),
                                                4326)), 128) AS part(geom)
               WHERE s.geom IS NOT NULL AND NOT ST_IsEmpty(s.geom)""",
            (country, cfg["source"], cfg["license"]))
        inserted = cur.rowcount
        cur.execute("UPDATE data_sources SET last_refreshed_at = now() "
                    "WHERE name = %s", (cfg["source"],))
    conn.commit()
    print(f"  [{country}] staged {inserted} official geometries "
          f"({named} named of {rows} read, {time.time() - t0:.0f}s)")
    return inserted


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

COVERAGE_SQL = """
WITH pts AS (
    SELECT (d.dp).geom AS pt, row_number() OVER () AS rn
    FROM (SELECT ST_DumpPoints(
                     ST_Segmentize(geom::geography, %(step)s)::geometry) AS dp
          FROM trips WHERE id = %(tid)s) d
), stats AS (SELECT count(*) AS n FROM pts),
sampled AS (
    SELECT pt FROM pts, stats
    WHERE (rn - 1) %% GREATEST(1, CEIL(n::numeric / %(maxpts)s))::int = 0
),
dists AS (
    SELECT COALESCE((
        SELECT ST_Distance(p.geom::geography, s.pt::geography)
        FROM portal_trails p
        WHERE p.country = %(country)s
          AND ST_DWithin(p.geom::geography, s.pt::geography, %(far)s)
        ORDER BY p.geom::geography <-> s.pt::geography
        LIMIT 1), %(far)s) AS d
    FROM sampled s
),
names AS (
    SELECT DISTINCT n.name
    FROM sampled s
    CROSS JOIN LATERAL (
        SELECT p.name
        FROM portal_trails p
        WHERE p.country = %(country)s AND p.name IS NOT NULL
          AND ST_DWithin(p.geom::geography, s.pt::geography, %(name_radius)s)
        ORDER BY p.geom::geography <-> s.pt::geography
        LIMIT 2) n
)
SELECT count(*),
       count(*) FILTER (WHERE d <= %(near)s),
       count(*) FILTER (WHERE d <= %(loose)s),
       percentile_cont(0.5) WITHIN GROUP (ORDER BY d),
       percentile_cont(0.9) WITHIN GROUP (ORDER BY d),
       (SELECT array_agg(name) FROM (SELECT name FROM names LIMIT 40) capped)
FROM dists
"""

NAME_INDEX_SQL = """
SELECT name, SUM(ST_Length(geom::geography))::float,
       AVG(ST_X(ST_Centroid(geom))), AVG(ST_Y(ST_Centroid(geom)))
FROM portal_trails
WHERE country = %s AND name IS NOT NULL
GROUP BY name
"""

TRIPS_SQL = """
SELECT id, title, COALESCE(ST_Length(geom::geography), 0),
       ST_X(ST_Centroid(geom)), ST_Y(ST_Centroid(geom)),
       raw_tags->>'name', raw_tags->>'ref', raw_tags->>'name:en'
FROM trips
WHERE source = 'osm' AND country = %s AND status <> 'rejected'
ORDER BY id
"""

# Variant for sources whose official data covers only part of the country
# (DE = Bavaria): trips outside the coverage envelope are skipped entirely
# instead of collecting meaningless failed portal checks.
TRIPS_SQL_COVERAGE = """
SELECT id, title, COALESCE(ST_Length(geom::geography), 0),
       ST_X(ST_Centroid(geom)), ST_Y(ST_Centroid(geom)),
       raw_tags->>'name', raw_tags->>'ref', raw_tags->>'name:en'
FROM trips
WHERE source = 'osm' AND country = %s AND status <> 'rejected'
  AND ST_Intersects(geom, ST_MakeEnvelope(%s, %s, %s, %s, 4326))
ORDER BY id
"""


def build_name_index(conn, country):
    """Folded official name -> (display name, total length m, lon, lat),
    plus a token inverted index so country-wide lookups stay cheap."""
    index, tokens = {}, {}
    with conn.cursor() as cur:
        cur.execute(NAME_INDEX_SQL, (country,))
        for name, length_m, cx, cy in cur.fetchall():
            for variant in [v.strip() for v in name.split(";")]:
                fv = fold(variant)
                if not fv:
                    continue
                prior = index.get(fv)
                if prior:  # same route split over rows: pool the length
                    index[fv] = (prior[0], prior[1] + length_m, prior[2], prior[3])
                else:
                    index[fv] = (variant, length_m, cx, cy)
                    for tok in fv.split():
                        if len(tok) >= 3:
                            tokens.setdefault(tok, set()).add(fv)
    return index, tokens


def countrywide_match(trip_names, name_index, name_tokens):
    """Best (entry, sim) over official names sharing a token with the trip.

    The token prefilter keeps this out of O(trips x names) SequenceMatcher
    territory; pure refs without a 3+ letter token simply never flag."""
    candidates = set()
    for tname in trip_names:
        for tok in tname.split():
            if len(tok) >= 3:
                candidates |= name_tokens.get(tok, set())
        if len(candidates) > 1500:
            break
    best, best_sim = None, 0.0
    for fv in candidates:
        for tname in trip_names:
            sim = name_similarity(tname, fv)
            if sim > best_sim:
                best, best_sim = name_index[fv], sim
    return best, best_sim


def check_trip(cur, trip, country, name_index, name_tokens, args):
    tid, title, trip_len, cx, cy, tag_name, tag_ref, tag_name_en = trip
    cur.execute(COVERAGE_SQL, {
        "tid": tid, "country": country, "step": args.step,
        "maxpts": args.max_pts, "far": FAR_M, "near": NEAR_M, "loose": LOOSE_M,
        "name_radius": NAME_RADIUS_M})
    n_pts, covered, loose, med, p90, nearby = cur.fetchone()
    if not n_pts:
        return None
    coverage = covered / n_pts
    coverage_loose = loose / n_pts

    trip_names = [f for f in {fold(v) for v in
                              (title, tag_name, tag_ref, tag_name_en)} if f]
    nearby = nearby or []
    name_best, name_sim = best_name_match(trip_names, nearby)
    name_matched = name_sim >= NAME_SIM

    passed = coverage >= 0.60 or (coverage >= 0.40 and name_matched)
    score = min(100, round(100 * coverage) + (BOOST if name_matched else 0))

    flags = []
    length_ratio = None
    if name_matched:
        entry = name_index.get(fold(name_best))
        if entry and entry[1] > 0 and trip_len > 0:
            length_ratio = round(trip_len / entry[1], 3)
            if not 0.5 <= length_ratio <= 2.0:
                flags.append("length_mismatch")
    if not passed and name_index:
        entry, wide_sim = countrywide_match(trip_names, name_index, name_tokens)
        if wide_sim >= STRONG_SIM and entry:
            dist_km = haversine_m(cx, cy, entry[2], entry[3]) / 1000
            if dist_km > 5:
                flags.append("location_mismatch")
                name_best, name_sim = name_best or entry[0], max(name_sim, wide_sim)

    details = {
        "source": SOURCES[country]["source"],
        "n_pts": n_pts,
        "coverage_60m": round(coverage, 3),
        "coverage_150m": round(coverage_loose, 3),
        "median_dist_m": round(med, 1),
        "p90_dist_m": round(p90, 1),
        "trip_len_m": int(trip_len),
        "name_best": name_best,
        "name_sim": round(name_sim, 3),
        "length_ratio": length_ratio,
        "flags": flags,
    }
    # Reference-scope guard: swissTLM3D and Turrutebasen are COMPLETE path
    # networks, so low coverage there is evidence of a bad trip. A source
    # tagged reference="routes" (the BVV bundle: only Bavaria's ~330 named
    # long-distance routes) proves nothing about the local trail it simply
    # does not contain - record failure ONLY when a strong name match says
    # the official route exists and the geometry still disagrees; otherwise
    # stay silent so 13k unnamed local trails don't collect fake mismatches.
    if (not passed and SOURCES[country].get("reference") == "routes"
            and not name_matched and "location_mismatch" not in flags):
        return None
    return {"tid": tid, "title": title, "passed": passed, "score": score,
            "details": details}


def match_country(conn, country, name_index, name_tokens, prior_passed, args):
    from psycopg.types.json import Jsonb
    coverage = SOURCES[country].get("coverage")
    with conn.cursor() as cur:
        if coverage:
            cur.execute(TRIPS_SQL_COVERAGE, (country, *coverage))
        else:
            cur.execute(TRIPS_SQL, (country,))
        trips = cur.fetchall()
    if args.limit:
        trips = trips[:args.limit]
    if not trips:
        print(f"  [{country}] no staged OSM trips yet, skipping the match")
        return []

    results, t0, last = [], time.time(), time.time()
    with conn.cursor() as cur:
        for i, trip in enumerate(trips):
            res = check_trip(cur, trip, country, name_index, name_tokens, args)
            if res:
                results.append(res)
            if time.time() - last > 20:
                rate = (i + 1) / (time.time() - t0)
                print(f"  [{country}] {i + 1}/{len(trips)} trips checked "
                      f"({rate:.1f}/s)")
                last = time.time()

        for res in results:
            cur.execute(
                """INSERT INTO validation_runs
                   (subject_type, subject_id, check_name, passed, score, details)
                   VALUES ('trip', %s, 'portal_agreement', %s, %s, %s)""",
                (res["tid"], res["passed"], res["score"], Jsonb(res["details"])))
        checked_ids = [r["tid"] for r in results]
        agreed_ids = [r["tid"] for r in results
                      if r["passed"] and r["tid"] not in prior_passed]
        cur.execute("UPDATE trips SET last_validated_at = now() "
                    "WHERE id = ANY(%s)", (checked_ids,))
        boosted = 0
        if agreed_ids:
            cur.execute(
                """UPDATE trips
                   SET quality_score = LEAST(100, quality_score + %s)
                   WHERE id = ANY(%s) AND quality_score IS NOT NULL""",
                (BOOST, agreed_ids))
            boosted = cur.rowcount
    conn.commit()

    agreed = [r for r in results if r["passed"]]
    deferred = len(agreed_ids) - boosted
    flag_counts = Counter(f for r in results for f in r["details"]["flags"])
    print(f"  [{country}] agreement: {len(agreed)}/{len(results)} trips "
          f"({100 * len(agreed) / len(results):.1f}%), "
          f"median coverage {100 * _median([r['details']['coverage_60m'] for r in results]):.0f}%")
    print(f"  [{country}] quality_score: {boosted} boosted, {deferred} boosts "
          f"deferred (score still NULL, run validate.py then rerun), "
          f"{len(agreed) - len(agreed_ids)} already boosted earlier")
    if flag_counts:
        print(f"  [{country}] flags: "
              + ", ".join(f"{k}={v}" for k, v in flag_counts.most_common()))

    sample = sorted(agreed, key=lambda r: -r["details"]["coverage_60m"])
    named_first = ([r for r in sample if r["details"]["name_best"]]
                   + [r for r in sample if not r["details"]["name_best"]])
    print(f"  [{country}] confirmed matches:")
    for res in named_first[:args.sample]:
        d = res["details"]
        official = (f"official '{d['name_best']}' (sim {d['name_sim']:.2f})"
                    if d["name_best"] and d["name_sim"] >= NAME_SIM
                    else "official geometry (no name)")
        print(f"    #{res['tid']} '{res['title']}' ({d['trip_len_m'] / 1000:.1f} km) "
              f"~ {official}: coverage {100 * d['coverage_60m']:.0f}%, "
              f"median {d['median_dist_m']:.0f} m")
    return results


def _median(values):
    vals = sorted(values)
    return vals[len(vals) // 2] if vals else 0.0


# ---------------------------------------------------------------------------
# Drive
# ---------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(
        description="Load official trail portals into portal_trails and "
                    "cross-check staged OSM trips.")
    parser.add_argument("--countries", default="CH,FR,NO",
                        help="comma-separated ISO codes (default: CH,FR,NO)")
    parser.add_argument("--load-only", action="store_true",
                        help="stage the portal datasets, skip the match")
    parser.add_argument("--match-only", action="store_true",
                        help="match against existing portal_trails rows")
    parser.add_argument("--refresh", action="store_true",
                        help="re-download portal archives even when cached")
    parser.add_argument("--limit", type=int, default=0,
                        help="cap trips per country (testing)")
    parser.add_argument("--sample", type=int, default=8,
                        help="confirmed matches to print per country")
    parser.add_argument("--step", type=int, default=300,
                        help="sampling step along the trip in metres")
    parser.add_argument("--max-pts", type=int, default=200,
                        help="max sampled points per trip")
    args = parser.parse_args()

    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    unknown = [c for c in countries if c not in SOURCES]
    if unknown:
        parser.error(f"unknown countries: {', '.join(unknown)} "
                     f"(known: {', '.join(SOURCES)})")

    conn = connect()
    session = PoliteSession()
    failures = []

    if not args.match_only:
        print("loading official portal datasets into portal_trails:")
        for country in countries:
            try:
                stage_portal(conn, country, SOURCES[country], session, args.refresh)
            except Exception as exc:
                conn.rollback()
                failures.append(f"{country} load: {type(exc).__name__}: {exc}")
                print(f"  [{country}] LOAD FAILED: {type(exc).__name__}: {exc}")

    if not args.load_only:
        with conn.cursor() as cur:
            cur.execute("CREATE INDEX IF NOT EXISTS portal_trails_geog_gist "
                        "ON portal_trails USING gist ((geom::geography))")
            cur.execute("ANALYZE portal_trails")
            cur.execute("""SELECT DISTINCT subject_id FROM validation_runs
                           WHERE subject_type = 'trip'
                             AND check_name = 'portal_agreement' AND passed""")
            prior_passed = {r[0] for r in cur.fetchall()}
        conn.commit()

        print("\ncross-checking staged OSM trips:")
        for country in countries:
            try:
                t0 = time.time()
                name_index, name_tokens = build_name_index(conn, country)
                print(f"  [{country}] official name index: {len(name_index)} "
                      f"names ({time.time() - t0:.0f}s)")
                match_country(conn, country, name_index, name_tokens,
                              prior_passed, args)
            except Exception as exc:
                conn.rollback()
                failures.append(f"{country} match: {type(exc).__name__}: {exc}")
                print(f"  [{country}] MATCH FAILED: {type(exc).__name__}: {exc}")

    conn.close()
    if failures:
        print("failures: " + " | ".join(failures))
        sys.exit(1)


if __name__ == "__main__":
    main()
