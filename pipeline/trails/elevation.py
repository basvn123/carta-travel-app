"""Elevation layer: Copernicus GLO-30 sampling for staged trailslab trips.

Samples the Copernicus GLO-30 DSM (30 m, global, free with credit) along
every staged trip geometry and fills distance_m, ascent_m, descent_m and
duration_min, writes per-vertex Z back into the 3D geometry, and stores a
downsampled elevation profile plus sampling metadata in the jsonb elevation
column (added idempotently here and in tools/trailslab/initdb/01_schema.sql
for fresh labs). SRTM is deliberately not used: it stops at 60N and would
lose most of Norway.

Tiles come from the public AWS bucket (copernicus-dem-30m, eu-central-1),
fetched on demand into the data/raw/dem/ raw store with a manifest, one
1x1 degree COG per cell, and only for cells a processed trip actually
touches. Cells without a tile in the bucket are open water; a .absent
marker caches that answer so reruns stay offline. Decoded tiles live in a
small LRU (about 50 MB each) and trips are processed in geohash order so
neighbouring routes reuse them.

Method, per geometry part: resample the line every 30 m (the DEM grid
spacing) and bilinear-sample the tile. Then clean: short exact-zero runs
flanked by land are DEM water pixels at coastlines and get interpolated
away, nodata gaps fill by linear interpolation, and trips missing more
than 20 percent of their samples keep NULL metrics (status low_coverage).
A 3-sample moving average smooths DSM noise and canopy speckle, and ascent
and descent accumulate over local extrema with a 5 m hysteresis threshold,
because summing raw 30 m differences badly overstates climb on noisy
terrain. Both constants were calibrated against the OSM ascent tags on
Swiss routes (mostly official Schweiz Mobil figures): this pair puts the
computed/tag median at 0.94, deliberately still on the conservative side;
heavier smoothing or a 10 m gate drops it to 0.83-0.86.

Duration rule: DIN 33466 (the DAV/SAC signpost standard). 4 km/h on the
flat, 300 m/h up, 500 m/h down; the slower of the horizontal and vertical
times counts in full, the faster one counts half.

Heights are EGM2008 geoid metres, which is what Copernicus DEM ships.
Re-running the OSM ingest zeroes Z but keeps the 2D coordinates, so stored
metrics stay valid; run with --refresh to rebuild Z after a re-ingest.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/elevation.py --countries CH
    python pipeline/trails/elevation.py                     # all pilot countries
    python pipeline/trails/elevation.py --refresh --ids 7077
"""

import argparse
import re
import struct
import sys
import time
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path
from statistics import median

import numpy as np
import rasterio
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))                              # src.ingestion imports
sys.path.insert(0, str(Path(__file__).resolve().parent))   # db.py

from db import connect  # noqa: E402
from src.ingestion.core import config as ingest_config  # noqa: E402
from src.ingestion.core.http import PoliteSession  # noqa: E402
from src.ingestion.core.storage import RawStore, utcnow  # noqa: E402

BUCKET_DEFAULT = "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com"
ATTRIBUTION = "Elevation data: Copernicus GLO-30 (c) ESA and Airbus"
EARTH_RADIUS_M = 6371008.8

SAMPLE_STEP_M = 30.0      # matches the DEM grid spacing
SMOOTH_WINDOW = 3         # samples in the moving average, keep odd
CLIMB_THRESHOLD_M = 5.0   # hysteresis gate before ascent/descent commits
GRADE_SPAN_STEPS = 3      # max grade over ~90 m, single steps are pure noise
COAST_RUN_MAX = 3         # zero-runs up to this many samples can be water
COAST_LAND_M = 5.0        # flanks at least this high mark the run as water
MAX_NODATA_FRAC = 0.2     # above this the trip keeps NULL metrics
PROFILE_POINTS = 200      # stored profile resolution
MAX_OPEN_TILES = 8        # decoded float32 tiles are ~50 MB each


# ---------------------------------------------------------------------------
# DEM tile store: download on demand, decode into an LRU, bilinear sample
# ---------------------------------------------------------------------------

def tile_name(lon, lat):
    """Bucket key stem for the 1x1 degree cell with this SW corner."""
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return (f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_"
            f"{ew}{abs(lon):03d}_00_DEM")


def _bilinear(band, transform, lons, lats):
    """Sample a decoded tile at lon/lat arrays, bilinear between cell centres.

    The inverse transform yields corner-based fractional pixel indices;
    shifting by half a pixel makes them centre-based. Corners poisoned by
    nodata NaNs fall back to the nearest single pixel.
    """
    cols, rows = ~transform * (lons, lats)
    fc, fr = np.asarray(cols) - 0.5, np.asarray(rows) - 0.5
    h, w = band.shape
    c0 = np.clip(np.floor(fc).astype(np.int64), 0, w - 2)
    r0 = np.clip(np.floor(fr).astype(np.int64), 0, h - 2)
    wx = np.clip(fc - c0, 0.0, 1.0)
    wy = np.clip(fr - r0, 0.0, 1.0)
    top = band[r0, c0] * (1 - wx) + band[r0, c0 + 1] * wx
    bot = band[r0 + 1, c0] * (1 - wx) + band[r0 + 1, c0 + 1] * wx
    out = top * (1 - wy) + bot * wy
    bad = np.isnan(out)
    if bad.any():
        rn = np.clip(np.round(fr[bad]).astype(np.int64), 0, h - 1)
        cn = np.clip(np.round(fc[bad]).astype(np.int64), 0, w - 1)
        out[bad] = band[rn, cn]
    return out


class DemTiles:
    """GLO-30 cells fetched into data/raw/dem/ with an in-memory LRU.

    evict_gb bounds what this run leaves on disk. Europe-wide sampling wants
    more 1x1 degree tiles than a laptop with 20 GB free can hold (the four
    pilot countries alone already occupy 15.6 GB), and a full raw store is
    only worth keeping when it will be re-read. Trips are processed in geohash
    order, so a tile is used by a run of neighbouring routes and then never
    again: once this run's downloads pass the budget, the least recently used
    of them is deleted. Tiles that were already on disk before the run are
    never touched, and a deleted tile simply re-downloads if something needs
    it again."""

    def __init__(self, evict_gb=None):
        self.base = ingest_config.env("DEM_BUCKET_URL", BUCKET_DEFAULT)
        self.session = PoliteSession(min_interval=0.25)
        self.store = None                      # RawStore made on first download
        self.cache = OrderedDict()             # (lon, lat) -> (band, transform)
        self.downloaded, self.cached, self.absent = set(), set(), set()
        self.bytes = 0
        self.budget = int(evict_gb * 1e9) if evict_gb else None
        self.on_disk = OrderedDict()           # name -> (path, size), this run
        self.on_disk_bytes = 0
        self.evicted = 0

    def _cached_path(self, name):
        root = ingest_config.DATA_DIR / "dem"
        hits = list(root.glob(f"*/{name}.tif"))
        if hits:
            return max(hits, key=lambda p: p.stat().st_mtime)
        if list(root.glob(f"*/{name}.absent")):
            return "absent"
        return None

    def _fetch(self, key):
        name = tile_name(*key)
        hit = self._cached_path(name)
        if hit == "absent":
            self.absent.add(name)
            return None
        if hit is not None:
            self.cached.add(name)
            return hit
        if self.store is None:
            self.store = RawStore("dem")
        url = f"{self.base}/{name}/{name}.tif"
        resp = self.session.get(url, stream=True, allow_error=(403, 404))
        if resp.status_code in (403, 404):
            resp.close()
            self.store.save_text(f"{name}.absent", "", url,
                                 note="no GLO-30 tile for this cell: open water")
            self.absent.add(name)
            return None
        path = self.store.save_response(f"{name}.tif", resp, url, note=ATTRIBUTION)
        self.downloaded.add(name)
        size = path.stat().st_size
        self.bytes += size
        print(f"  tile {name}: {size / 1e6:.0f} MB")
        if self.budget is not None:
            self.on_disk[name] = (path, size)
            self.on_disk_bytes += size
            self._evict()
        return path

    def _evict(self):
        """Drop this run's least recently used tiles until the budget holds.

        A tile still decoded in the in-memory LRU is skipped: deleting the file
        under it would not free the memory, and the next neighbouring route
        would only pull it back down."""
        live = {tile_name(*key) for key in self.cache}
        while self.on_disk_bytes > self.budget and self.on_disk:
            for name in list(self.on_disk):
                if name in live:
                    continue
                path, size = self.on_disk.pop(name)
                self.on_disk_bytes -= size
                try:
                    path.unlink()
                    self.evicted += 1
                except OSError:
                    pass                            # already gone
                break
            else:
                return                              # everything left is in use

    def _load(self, key):
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        if self.budget is not None:
            hot = tile_name(*key)
            if hot in self.on_disk:
                self.on_disk.move_to_end(hot)
        path = self._fetch(key)
        tile = None
        if path is not None:
            with rasterio.open(path) as ds:
                band = ds.read(1).astype(np.float32)
                if ds.nodata is not None:
                    band[band == ds.nodata] = np.nan
                tile = (band, ds.transform)
        self.cache[key] = tile
        if len(self.cache) > MAX_OPEN_TILES:
            self.cache.popitem(last=False)
        return tile

    def sample(self, lons, lats):
        """Elevations for lon/lat arrays; NaN where no tile or nodata."""
        out = np.full(len(lons), np.nan)
        pairs = np.stack([np.floor(lons), np.floor(lats)], axis=1).astype(np.int64)
        uniq, inv = np.unique(pairs, axis=0, return_inverse=True)
        for u, (lo, la) in enumerate(uniq):
            mask = inv == u
            tile = self._load((int(lo), int(la)))
            if tile is None:
                continue
            band, transform = tile
            out[mask] = _bilinear(band, transform, lons[mask], lats[mask])
        return out


# ---------------------------------------------------------------------------
# WKB in, EWKB out: exact coordinate round-trip, no text formatting drift
# ---------------------------------------------------------------------------

def _read_geom(buf, off):
    """One WKB geometry at off -> (list of (n, dims) arrays, new offset).

    Handles LineString and MultiLineString in both encodings PostGIS may
    emit: ISO type codes (1000 Z, 2000 M, 3000 ZM) and EWKB dimension
    flags, with or without an embedded SRID.
    """
    bo = "<" if buf[off] == 1 else ">"
    (raw,) = struct.unpack_from(bo + "I", buf, off + 1)
    off += 5
    if raw & 0x20000000:
        off += 4                                   # embedded SRID
    zflag = bool(raw & 0x80000000)
    mflag = bool(raw & 0x40000000)
    base = raw & 0x0FFFFFFF
    if base >= 3000:
        base, zflag, mflag = base - 3000, True, True
    elif base >= 2000:
        base, mflag = base - 2000, True
    elif base >= 1000:
        base, zflag = base - 1000, True
    dims = 2 + zflag + mflag
    if base == 2:                                  # LineString
        (n,) = struct.unpack_from(bo + "I", buf, off)
        off += 4
        arr = np.frombuffer(buf, dtype=bo + "f8", count=n * dims, offset=off)
        return [arr.reshape(n, dims)], off + n * dims * 8
    if base == 5:                                  # MultiLineString
        (n,) = struct.unpack_from(bo + "I", buf, off)
        off += 4
        parts = []
        for _ in range(n):
            sub, off = _read_geom(buf, off)
            parts.extend(sub)
        return parts, off
    raise ValueError(f"unsupported wkb geometry type {raw}")


def parse_wkb_lines(wkb):
    parts, _ = _read_geom(bytes(wkb), 0)
    return parts


def build_wkb_mls_z(parts_xyz):
    """(n, 3) float64 arrays -> little-endian EWKB MultiLineString Z."""
    out = bytearray(b"\x01" + struct.pack("<II", 0x80000005, len(parts_xyz)))
    for arr in parts_xyz:
        out += b"\x01" + struct.pack("<II", 0x80000002, len(arr))
        out += np.ascontiguousarray(arr, dtype="<f8").tobytes()
    return bytes(out)


# ---------------------------------------------------------------------------
# Profile building: densify, clean, smooth, accumulate
# ---------------------------------------------------------------------------

def cumdist_m(lons, lats):
    """Cumulative haversine distance along a vertex sequence, metres."""
    lam, phi = np.radians(lons), np.radians(lats)
    h = (np.sin(np.diff(phi) / 2) ** 2
         + np.cos(phi[:-1]) * np.cos(phi[1:]) * np.sin(np.diff(lam) / 2) ** 2)
    steps = 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(h))
    return np.concatenate(([0.0], np.cumsum(steps)))


def sample_positions(total):
    """Distances to sample at: every step plus the exact endpoint."""
    pos = np.arange(0.0, total, SAMPLE_STEP_M)
    return np.append(pos, total) if total - pos[-1] >= 1.0 else pos


def fix_coast_zeros(ele):
    """Interpolate away isolated exact-zero runs beside land.

    Copernicus DEM edits water surfaces to exactly 0, so a coastal trail
    whose samples clip a water pixel picks up fake sea-level spikes. Runs
    longer than COAST_RUN_MAX stay: those are genuine beach walks.
    """
    zero_idx = np.flatnonzero(ele == 0.0)
    if not len(zero_idx):
        return ele, 0
    fixes = 0
    n = len(ele)
    for run in np.split(zero_idx, np.flatnonzero(np.diff(zero_idx) > 1) + 1):
        if len(run) > COAST_RUN_MAX:
            continue
        flanks = []
        if run[0] > 0:
            flanks.append(ele[run[0] - 1])
        if run[-1] + 1 < n:
            flanks.append(ele[run[-1] + 1])
        flanks = [f for f in flanks if np.isfinite(f)]
        if flanks and min(flanks) >= COAST_LAND_M:
            ele[run] = np.nan
            fixes += len(run)
    return ele, fixes


def fill_gaps(ele):
    """Linear interpolation over NaN gaps; edge gaps take the nearest value."""
    bad = np.isnan(ele)
    if not bad.any():
        return ele
    if bad.all():
        return None
    idx = np.arange(len(ele))
    ele[bad] = np.interp(idx[bad], idx[~bad], ele[~bad])
    return ele


def smooth(ele):
    if len(ele) < SMOOTH_WINDOW:
        return ele
    pad = SMOOTH_WINDOW // 2
    padded = np.pad(ele, pad, mode="edge")
    return np.convolve(padded, np.ones(SMOOTH_WINDOW) / SMOOTH_WINDOW,
                       mode="valid")


def climb_stats(ele):
    """Gross ascent and descent with a hysteresis threshold.

    The profile collapses to its local extrema, then a moving reference
    only commits swings of at least CLIMB_THRESHOLD_M, so oscillations
    below the threshold (DEM noise, canopy) never accumulate.
    """
    if len(ele) < 2:
        return 0.0, 0.0
    comp = ele[np.concatenate(([True], np.diff(ele) != 0))]
    if len(comp) < 2:
        return 0.0, 0.0
    s = np.sign(np.diff(comp))
    turns = np.flatnonzero(s[1:] != s[:-1]) + 1
    series = np.concatenate(([comp[0]], comp[turns], [comp[-1]]))
    ascent = descent = 0.0
    ref = series[0]
    for e in series[1:]:
        d = e - ref
        if d >= CLIMB_THRESHOLD_M:
            ascent += d
            ref = e
        elif d <= -CLIMB_THRESHOLD_M:
            descent -= d
            ref = e
    return ascent, descent


def max_grade_pct(pos, ele):
    span = min(GRADE_SPAN_STEPS, len(ele) - 1)
    if span < 1:
        return None
    dd = pos[span:] - pos[:-span]
    dz = ele[span:] - ele[:-span]
    ok = dd >= 1.0
    if not ok.any():
        return None
    return float(np.max(np.abs(dz[ok] / dd[ok])) * 100.0)


def duration_min_din33466(dist_km, ascent_m, descent_m):
    """DIN 33466: 4 km/h flat, 300 m/h up, 500 m/h down; slower component
    counts in full, the faster one half."""
    horiz = dist_km / 4.0
    vert = ascent_m / 300.0 + descent_m / 500.0
    return int(round((max(horiz, vert) + min(horiz, vert) / 2.0) * 60))


def parse_tag_number(text):
    """First number in an OSM tag value, tolerant of units and commas."""
    if not text:
        return None
    m = re.search(r"\d+(?:[.,]\d+)?", text)
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "."))
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Per-trip processing
# ---------------------------------------------------------------------------

def process_trip(row, tiles):
    tid, title, country, dist_tag, asc_tag, wkb, gmd5 = row
    parts = parse_wkb_lines(wkb)

    usable = {}
    for i, arr in enumerate(parts):
        if len(arr) < 2:
            continue
        lons = np.ascontiguousarray(arr[:, 0], dtype=np.float64)
        lats = np.ascontiguousarray(arr[:, 1], dtype=np.float64)
        cum = cumdist_m(lons, lats)
        if cum[-1] <= 0:
            continue
        pos = sample_positions(cum[-1])
        usable[i] = {"cum": cum, "pos": pos,
                     "slons": np.interp(pos, cum, lons),
                     "slats": np.interp(pos, cum, lats)}

    elevation = {
        "source": "copernicus_glo30",
        "sampled_at": utcnow(),
        "geom_md5": gmd5,
        "step_m": SAMPLE_STEP_M,
        "smooth_window": SMOOTH_WINDOW,
        "climb_threshold_m": CLIMB_THRESHOLD_M,
        "duration_rule": "DIN 33466",
    }
    report = {"title": title, "country": country}
    if not usable:
        elevation["status"] = report["status"] = "empty"
        return {"status": "empty", "report": report,
                "params": {"id": tid, "distance_m": None,
                           "elevation": Jsonb(elevation)}}

    order = sorted(usable)
    ele_all = tiles.sample(
        np.concatenate([usable[i]["slons"] for i in order]),
        np.concatenate([usable[i]["slats"] for i in order]))
    chunks = np.split(
        ele_all, np.cumsum([len(usable[i]["pos"]) for i in order])[:-1])

    total_dist = ascent = descent = 0.0
    grade = None
    ele_min, ele_max = np.inf, -np.inf
    bad_samples = zero_fixes = n_samples = 0
    prof_pos, prof_ele, breaks = [], [], []
    for i, ele_raw in zip(order, chunks):
        p = usable[i]
        n_samples += len(ele_raw)
        bad_samples += int(np.isnan(ele_raw).sum())
        ele_fx, fixes = fix_coast_zeros(ele_raw)
        zero_fixes += fixes
        filled = fill_gaps(ele_fx)
        offset = total_dist
        total_dist += float(p["cum"][-1])
        if filled is None:
            continue
        sm = smooth(filled)
        a, d = climb_stats(sm)
        ascent += a
        descent += d
        g = max_grade_pct(p["pos"], sm)
        if g is not None:
            grade = max(grade or 0.0, g)
        ele_min = min(ele_min, float(np.min(filled)))
        ele_max = max(ele_max, float(np.max(filled)))
        if offset > 0:
            breaks.append(int(round(offset)))
        prof_pos.append(p["pos"] + offset)
        prof_ele.append(sm)
        p["z"] = np.interp(p["cum"], p["pos"], filled)

    nodata_frac = bad_samples / n_samples if n_samples else 1.0
    status = "ok" if nodata_frac <= MAX_NODATA_FRAC and prof_pos else \
             ("no_data" if not prof_pos else "low_coverage")
    elevation.update({"status": status,
                      "nodata_frac": round(nodata_frac, 4),
                      "coast_zero_fixes": zero_fixes})
    dist_int = int(round(total_dist))
    report.update({"status": status, "distance_m": dist_int})

    if status != "ok":
        return {"status": status, "report": report,
                "params": {"id": tid, "distance_m": dist_int or None,
                           "elevation": Jsonb(elevation)}}

    # Downsampled profile over the concatenated parts (gap distances skipped).
    P = np.concatenate(prof_pos)
    E = np.concatenate(prof_ele)
    stride = max(1, -(-len(P) // PROFILE_POINTS))
    idx = np.arange(0, len(P), stride)
    if idx[-1] != len(P) - 1:
        idx = np.append(idx, len(P) - 1)
    elevation.update({
        "max_grade_pct": round(grade, 1) if grade is not None else None,
        "ele_min_m": round(ele_min, 1),
        "ele_max_m": round(ele_max, 1),
        "profile": [[int(round(p)), round(float(e), 1)]
                    for p, e in zip(P[idx], E[idx])],
    })
    if breaks:
        elevation["breaks_m"] = breaks

    xyz = []
    for i, arr in enumerate(parts):
        z = np.round(usable[i]["z"], 1) if i in usable and "z" in usable[i] \
            else np.zeros(len(arr))
        xyz.append(np.column_stack([arr[:, 0], arr[:, 1], z]))

    asc_int, desc_int = int(round(ascent)), int(round(descent))
    duration = duration_min_din33466(total_dist / 1000, ascent, descent)
    report.update({"ascent_m": asc_int, "descent_m": desc_int,
                   "duration_min": duration,
                   "dist_tag_km": parse_tag_number(dist_tag),
                   "asc_tag_m": parse_tag_number(asc_tag)})
    # A tag over 2000 "km" is metres wearing the wrong unit.
    if report["dist_tag_km"] and report["dist_tag_km"] > 2000:
        report["dist_tag_km"] /= 1000.0
    return {"status": "ok", "report": report,
            "params": {"id": tid, "distance_m": dist_int, "ascent_m": asc_int,
                       "descent_m": desc_int, "duration_min": duration,
                       "wkb": build_wkb_mls_z(xyz),
                       "elevation": Jsonb(elevation)}}


# ---------------------------------------------------------------------------
# DB plumbing
# ---------------------------------------------------------------------------

FETCH_SQL = """
    SELECT id, title, country, raw_tags->>'distance', raw_tags->>'ascent',
           ST_AsBinary(geom), md5(ST_AsBinary(ST_Force2D(geom)))
    FROM trips WHERE id = ANY(%s)
"""

UPDATE_FULL = """
    UPDATE trips
    SET distance_m = %(distance_m)s, ascent_m = %(ascent_m)s,
        descent_m = %(descent_m)s, duration_min = %(duration_min)s,
        geom = ST_GeomFromWKB(%(wkb)s, 4326), elevation = %(elevation)s
    WHERE id = %(id)s
"""

UPDATE_MARKER = """
    UPDATE trips
    SET distance_m = COALESCE(%(distance_m)s, distance_m),
        elevation = %(elevation)s
    WHERE id = %(id)s
"""


def ensure_elevation_column(conn):
    with conn.cursor() as cur:
        cur.execute("ALTER TABLE trips ADD COLUMN IF NOT EXISTS elevation jsonb")
    conn.commit()


def select_ids(conn, countries, refresh, limit, ids, curated=False):
    """Stale trips (no elevation yet, or 2D geometry changed since), in
    geohash order so neighbouring trips hit the same DEM tiles.

    curated restricts the run to what curate.py picked. Sampling all 236,000
    staged relations would download most of Europe's DEM and spend days on
    routes nobody will ever open; the ~4,900 approved ones are the set the app
    actually ships."""
    if ids:
        return ids
    where_curated = ("AND status IN ('approved', 'published')" if curated else "")
    sql = f"""
        SELECT id FROM trips
        WHERE source = 'osm' AND country = ANY(%s)
          AND (%s OR elevation IS NULL
               OR elevation->>'geom_md5'
                  IS DISTINCT FROM md5(ST_AsBinary(ST_Force2D(geom))))
          {where_curated}
        ORDER BY ST_GeoHash(ST_Centroid(geom), 5)
    """
    params = [countries, refresh]
    if limit:
        sql += " LIMIT %s"
        params.append(limit)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [r[0] for r in cur.fetchall()]


def via_alpina_sanity(conn):
    """Acceptance probe: the national Via Alpina against known figures."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT title, source_ref, distance_m, ascent_m, descent_m,
                   duration_min, raw_tags->>'distance', raw_tags->>'ascent'
            FROM trips
            WHERE source = 'osm' AND country = 'CH'
              AND title ILIKE %s AND ascent_m IS NOT NULL
            ORDER BY distance_m DESC NULLS LAST LIMIT 1""", ("%via alpina%",))
        row = cur.fetchone()
    if not row:
        print("sanity: no elevated Via Alpina row found")
        return
    title, ref, dist, asc, desc, dur, dtag, atag = row
    print(f"\nsanity {title} (relation {ref}): "
          f"computed {dist / 1000:.0f} km, +{asc} m, -{desc} m, "
          f"{dur / 60:.0f} h walking time")
    print(f"  OSM tags say {dtag} km and {atag} m ascent; Schweiz Mobil "
          f"publishes 390 km and about 23000 m for Via Alpina route 1")


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def report_countries(records, top):
    by_country = defaultdict(list)
    for r in records:
        if r.get("status") == "ok":
            by_country[r["country"]].append(r)
    for country in sorted(by_country):
        rows = sorted(by_country[country], key=lambda r: -r["distance_m"])
        print(f"\n[{country}] longest elevated routes:")
        for r in rows[:top]:
            print(f"  {r['title'][:46]:<46} {r['distance_m'] / 1000:7.1f} km  "
                  f"+{r['ascent_m']:>5} m  -{r['descent_m']:>5} m  "
                  f"{r['duration_min'] / 60:5.1f} h")
        dr = [r["distance_m"] / 1000 / r["dist_tag_km"]
              for r in rows if r.get("dist_tag_km")]
        ar = [r["ascent_m"] / r["asc_tag_m"]
              for r in rows if r.get("asc_tag_m")]
        if dr:
            print(f"  tag check distance: computed/tag median {median(dr):.2f} "
                  f"over {len(dr)} tagged routes")
        if ar:
            print(f"  tag check ascent:   computed/tag median {median(ar):.2f} "
                  f"over {len(ar)} tagged routes")


def main():
    sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(
        description="Sample Copernicus GLO-30 along staged trips and fill "
                    "ascent, descent, duration and an elevation profile.")
    parser.add_argument("--countries", default="CH,FR,NO,AT",
                        help="comma-separated ISO codes (default: CH,FR,NO,AT)")
    parser.add_argument("--refresh", action="store_true",
                        help="recompute even when the stored profile is fresh")
    parser.add_argument("--limit", type=int, default=0,
                        help="cap the number of trips (testing)")
    parser.add_argument("--ids", default="",
                        help="comma-separated trip ids to process (debugging)")
    parser.add_argument("--top", type=int, default=12,
                        help="longest routes to print per country")
    parser.add_argument("--curated", action="store_true",
                        help="only trips curate.py approved, which is the set "
                             "the app ships")
    parser.add_argument("--evict-gb", type=float, default=0,
                        help="cap what this run leaves in data/raw/dem, in GB. "
                             "0 keeps every tile (the old behaviour)")
    args = parser.parse_args()

    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    ids_arg = [int(i) for i in args.ids.split(",") if i.strip()]

    conn = connect()
    ensure_elevation_column(conn)
    ids = select_ids(conn, countries, args.refresh, args.limit, ids_arg,
                     curated=args.curated)
    if not ids:
        print("nothing to do: every selected trip already has a fresh profile "
              "(use --refresh to recompute)")
        via_alpina_sanity(conn)
        conn.close()
        return
    print(f"{len(ids)} trips to sample ({', '.join(countries)})")

    tiles = DemTiles(evict_gb=args.evict_gb or None)
    counts = Counter()
    records = []
    t0 = time.time()
    for start in range(0, len(ids), 50):
        batch = ids[start:start + 50]
        with conn.cursor() as cur:
            cur.execute(FETCH_SQL, (batch,))
            rows = cur.fetchall()
            for row in rows:
                rec = process_trip(row, tiles)
                counts[rec["status"]] += 1
                cur.execute(UPDATE_FULL if rec["status"] == "ok"
                            else UPDATE_MARKER, rec["params"])
                records.append(rec["report"])
        conn.commit()
        done = start + len(batch)
        if done // 1000 > start // 1000 or done == len(ids):
            rate = done / max(time.time() - t0, 1e-9)
            print(f"  {done}/{len(ids)} trips ({rate:.1f}/s), tiles: "
                  f"{len(tiles.downloaded)} downloaded, "
                  f"{len(tiles.cached)} cached, {len(tiles.absent)} open water")

    with conn.cursor() as cur:
        cur.execute("UPDATE data_sources SET last_refreshed_at = now() "
                    "WHERE name = 'copernicus_glo30'")
    conn.commit()

    print(f"\ndone in {time.time() - t0:.0f}s: {counts['ok']} elevated, "
          f"{counts['low_coverage']} low coverage, {counts['no_data']} no "
          f"data, {counts['empty']} empty; tiles: {len(tiles.downloaded)} "
          f"downloaded ({tiles.bytes / 1e9:.1f} GB), {len(tiles.cached)} from "
          f"cache, {len(tiles.absent)} open water")
    report_countries(records, args.top)
    if "CH" in countries or any(r["country"] == "CH" for r in records):
        via_alpina_sanity(conn)
    conn.close()


if __name__ == "__main__":
    main()
