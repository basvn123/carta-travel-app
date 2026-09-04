"""What the ground itself says: prominence, isolation, the elevation check,
the view, and the easiest way up, all measured against Copernicus GLO-30.

Everything in here is computed rather than read off a source, and that is the
point of the module. Wikidata tags prominence on a small minority of European
summits and OSM on fewer; `stature` is 0.16 of the index and its first input
was missing for most of the layer. The view was not measured at all: v1 paid
for a `tourism=viewpoint` node within 500 m, which is a proxy for somebody
having mapped a bench.

    ele        the summit elevation the DEM actually holds, used to VERIFY the
               source value: a gap over 30 m is recorded, and the DEM only
               overrules where the source is IMPOSSIBLE (higher than anything
               within 12 km). See summit_elevation for why the brief's plain
               "DEM wins" rule is not the one implemented.
    prom       prominence: the summit, minus the highest col that connects it
               to any higher ground. Computed by flooding, see below.
    iso_km     isolation: the distance to the nearest ground that is higher.
    views      the viewshed: how much land is visible within 30 km, how many
               other named summits, and whether big water is in the frame.
    slope      the gentlest radial ascent line's steepest stretch, which is
               the DEM fallback behind the difficulty facet where OSM has no
               sac_scale on any route to the top.

## Why not akirmse/mountains

The brief asks for `akirmse/mountains` over GLO-30 tiles, and its warning is
worth repeating: the CODE is MIT, the precomputed CSVs on that page carry no
stated licence and must not be redistributed. The warning is respected here in
the strongest form available, which is to compute the numbers ourselves.

What is not respected is the toolchain. akirmse is a C++ build over whole
downloaded tiles; Europe's GLO-30 coverage for this layer's summits is 769
tiles and 32 GB, on a box with 48 GB free and no compiler. The definition it
implements is one paragraph long and is implemented here directly, over
windows read from the same COGs through `/vsicurl/`, which pulls the few
hundred kilobytes each summit actually needs instead of the whole tile:

    prominence = summit elevation - the highest saddle from which one can
    reach higher ground without descending below that saddle

which is exactly a flood level. Raise the water until the summit's island
first touches ground higher than the summit; the water line is the key col.
Binary search over the level, `scipy.ndimage.label` for the island, twenty
iterations for metre precision. The one honest difference from a continental
pass is that a search window has an edge. Where the window holds nothing
higher, the flood is run again for the level at which the island reaches the
EDGE, which is an upper bound on a col that must lie outside: the prominence
built on it is then a true lower bound, `prom_capped` says so, and the export
prefers a published value for exactly those rows.

## Cost, and why the reads are windowed

A tile is 42 MB, a summit needs about 0.3 MB of it. Every read here is a
window, and the viewshed's window is read decimated (the COG carries 2/4/8
overviews, so GDAL fetches an overview's blocks rather than the full grid):
90 m sampling over a 30 km radius, which is 333 samples along a ray. At 30 km
the difference between 30 m and 90 m sampling is invisible in a visible-area
fraction and it is a factor of nine in bytes and time.

Missing tile means ocean. Copernicus publishes no tile for open sea, so a
404 is data rather than an error: those cells enter the mosaic as nodata and
the water test reads them as sea.

## The cache is the snapshot

`cache/mountains/terrain.json`, keyed by COORDINATE rather than by Wikidata
id, because the terrain around a point is a property of the point: a row that
changes its Q number, or arrives from the OSM spine instead, gets the same
answer without paying for it again. Nothing here is ever re-measured unless
--refresh says so. The DEM itself is not cached to disk: it is 32 GB of
somebody else's bytes to hold a few hundred numbers.

Usage, from the repo root:
    python pipeline/mountains/terrain.py                 # every enriched row
    python pipeline/mountains/terrain.py --countries CH,AT
    python pipeline/mountains/terrain.py --published     # the wire's rows only
    python pipeline/mountains/terrain.py --refresh --countries LI

Attribution, prescribed by the programme and carried into the wire:
    (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018,
    provided under COPERNICUS by the European Union and ESA

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import math
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# GDAL's HTTP reader, configured before rasterio is imported so the settings
# reach the C library. Without DISABLE_READDIR_ON_OPEN every open costs a
# directory listing of an S3 prefix that holds one file.
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
os.environ.setdefault("GDAL_HTTP_MULTIPLEX", "YES")
os.environ.setdefault("GDAL_HTTP_VERSION", "2")
os.environ.setdefault("VSI_CACHE", "TRUE")
os.environ.setdefault("VSI_CACHE_SIZE", "268435456")
os.environ.setdefault("CPL_VSIL_CURL_CHUNK_SIZE", "1048576")
os.environ.setdefault("GDAL_CACHEMAX", "512")

# Timeouts, because without them a stalled read never returns.
#
# GDAL's curl reader has NO read timeout by default. A run measuring the
# Netherlands stopped at coordinate 175 of 310 and sat there for five hours
# with the process alive, the thread pool full and not one further line
# logged: one socket had gone quiet and nothing was ever going to time it
# out. Every other network client in this layer already had this and the one
# reading 30 metre elevation from an S3 bucket did not.
#
# 60 seconds is generous for a windowed read of a few hundred kilobytes, and
# the retry budget covers the transient 500s the bucket serves under load.
# A coordinate that still fails after that is caught per row and skipped,
# which costs one summit its terrain rather than costing the run.
os.environ.setdefault("GDAL_HTTP_TIMEOUT", "60")
os.environ.setdefault("GDAL_HTTP_CONNECTTIMEOUT", "20")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "3")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

if sys.platform == "win32":
    # A Bosnian summit name stops an export dead on a cp1252
    # console otherwise, which is a silly way to lose a build.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = HERE.parents[1]
CACHE = ROOT / "cache" / "mountains"
TERRAIN = CACHE / "terrain.json"

DEM_URL = ("https://copernicus-dem-30m.s3.amazonaws.com/"
           "{name}/{name}.tif")
DEM_ATTRIBUTION = ("(c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space "
                   "GmbH 2014-2018, provided under COPERNICUS by the European "
                   "Union and ESA")
MODEL_VERSION = "terrain_v1"

EARTH_R = 6371000.0
# Standard atmospheric refraction coefficient. Light bends towards the earth,
# so the horizon is further away than geometry alone says; 0.13 is the value
# every surveying text and gdal_viewshed itself uses.
REFRACTION = 0.13
EYE_M = 1.7

# The three search windows prominence and isolation walk outward through.
# (radius km, sample metres). Nearly every summit answers in the first one;
# the third exists for the handful that are the highest thing for 100 km.
PROM_WINDOWS = ((12.0, 30.0), (40.0, 60.0), (120.0, 180.0))
VIEW_RADIUS_KM = 30.0
VIEW_STEP_M = 90.0
VIEW_AZIMUTHS = 720
# A summit is a local maximum, and a coordinate is not always exactly on it.
SNAP_M = 150.0
# Water: cells at or below this, in a connected patch at least this big. One
# rule for "the sea or a major lake", which is the question the views
# component asks, and it needs no second source to answer it.
WATER_ELE_M = 1.0
WATER_MIN_KM2 = 4.0

_lock = threading.Lock()
_missing = set()          # tiles S3 has no file for: ocean, cached per run


def tile_name(lat, lon):
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return (f"Copernicus_DSM_COG_10_{ns}{abs(int(math.floor(lat))):02d}_00_"
            f"{ew}{abs(int(math.floor(lon))):03d}_00_DEM")


def _open(name):
    """One GLO-30 tile as a rasterio dataset, or None when S3 has no file for
    it, which means open sea."""
    import rasterio
    if name in _missing:
        return None
    try:
        return rasterio.open("/vsicurl/" + DEM_URL.format(name=name))
    except Exception:                                 # noqa: BLE001
        with _lock:
            _missing.add(name)
        return None


def _grid(lat, lon, radius_km, step_m):
    """A local equirectangular grid centred on the summit, in degrees, whose
    cells are square in METRES. Ray casting and area sums then work in plain
    pixel arithmetic without a projection step."""
    dlat = step_m / 111320.0
    dlon = step_m / (111320.0 * max(0.15, math.cos(math.radians(lat))))
    n = int(radius_km * 1000.0 / step_m)
    return dlat, dlon, n


def read_window(lat, lon, radius_km, step_m, how="bilinear"):
    """(array, dlat, dlon, n) for a square window around a summit, mosaicked
    across every GLO-30 tile it touches. Cells with no tile come back as NaN,
    which is the sea.

    `how` decides what decimation does to a ridge, and it is not cosmetic.
    Averaging a 60 m cell out of four 30 m ones LOWERS every crest, and a
    lowered crest lets the prominence flood escape at a level the real ridge
    would have held: bilinear put the Zugspitze's key col 340 m below its
    surveyed one. So the prominence windows decimate with max, which keeps
    the barriers that decide the answer, and the viewshed keeps bilinear,
    because a surface you look ACROSS should be smooth rather than raised."""
    import numpy as np
    import rasterio
    from rasterio.warp import Resampling, reproject
    from rasterio.transform import Affine
    from rasterio.windows import from_bounds

    dlat, dlon, n = _grid(lat, lon, radius_km, step_m)
    size = 2 * n + 1
    west, east = lon - n * dlon, lon + n * dlon
    south, north = lat - n * dlat, lat + n * dlat
    dst = np.full((size, size), np.nan, dtype="float32")
    dst_t = Affine(dlon, 0.0, west, 0.0, -dlat, north)

    lat0, lat1 = int(math.floor(south)), int(math.floor(north))
    lon0, lon1 = int(math.floor(west)), int(math.floor(east))
    for ty in range(lat0, lat1 + 1):
        for tx in range(lon0, lon1 + 1):
            ds = _open(tile_name(ty + 0.5, tx + 0.5))
            if ds is None:
                continue
            with ds:
                b = ds.bounds
                w = max(west, b.left)
                e = min(east, b.right)
                s = max(south, b.bottom)
                nn = min(north, b.top)
                if e <= w or nn <= s:
                    continue
                win = from_bounds(w, s, e, nn, ds.transform)
                # Read no finer than the target grid: this is what makes a
                # 30 km viewshed read an overview instead of 4 million cells.
                out_h = max(4, int(abs(nn - s) / dlat) + 2)
                out_w = max(4, int(abs(e - w) / dlon) + 2)
                out_h = min(out_h, int(win.height) or out_h)
                out_w = min(out_w, int(win.width) or out_w)
                src = ds.read(1, window=win, out_shape=(out_h, out_w),
                              masked=True, boundless=False)
                src_t = ds.window_transform(win) * Affine.scale(
                    (win.width / out_w), (win.height / out_h))
                patch = np.full((size, size), np.nan, dtype="float32")
                reproject(source=np.asarray(src.filled(np.nan), dtype="float32"),
                          destination=patch,
                          src_transform=src_t, src_crs=ds.crs,
                          dst_transform=dst_t, dst_crs=rasterio.crs.CRS.from_epsg(4326),
                          src_nodata=np.nan, dst_nodata=np.nan,
                          resampling=getattr(Resampling, how))
                fill = np.isnan(dst) & ~np.isnan(patch)
                dst[fill] = patch[fill]
    return dst, dlat, dlon, n


def _snap(dem, n, step_m):
    """The summit cell: the highest cell within SNAP_M of the coordinate.

    A Wikidata coordinate is often the label's position rather than the top,
    and a prominence measured from a cell 60 m down the ridge is wrong by
    exactly that much."""
    import numpy as np
    r = max(1, int(SNAP_M / step_m))
    sub = dem[n - r:n + r + 1, n - r:n + r + 1]
    if np.all(np.isnan(sub)):
        return n, n, None
    idx = int(np.nanargmax(sub))
    dy, dx = divmod(idx, sub.shape[1])
    return n - r + dy, n - r + dx, float(np.nanmax(sub))


def key_col(dem, py, px, ele, step_m):
    """(key col elevation, capped) by flooding.

    Prominence is the summit minus this, and the subtraction is the caller's
    because the col is a fact about the ground while the summit elevation is
    a choice between two sources (see summit_elevation).

    Capped means the window held nothing higher than this summit, so the col
    returned is the window's floor and the prominence built on it is a LOWER
    BOUND: the true col is somewhere outside the window."""
    import numpy as np
    from scipy import ndimage

    filled_all = np.where(np.isnan(dem), -32768.0, dem)
    structure = np.ones((3, 3), dtype=bool)
    higher = dem > (ele + 1.0)
    if not np.any(higher):
        # Nothing higher inside the window, so the key col is outside it and
        # the path to it leaves through an edge. The highest level at which
        # this summit's island still REACHES an edge is therefore an upper
        # bound on that col, and the prominence built on it is a true lower
        # bound. (Taking the window's floor instead, which is what the first
        # version did, is an upper bound wearing a lower bound's label: it
        # gave Snowdon 1,086 m against a surveyed 1,039.)
        lo, hi = float(np.nanmin(dem)), ele
        edge = None
        for _ in range(20):
            mid = (lo + hi) / 2.0
            labels, _n = ndimage.label(filled_all >= mid, structure=structure)
            own = labels[py, px]
            if own == 0:
                hi = mid
                continue
            touch = (np.any(labels[0, :] == own) or np.any(labels[-1, :] == own)
                     or np.any(labels[:, 0] == own) or np.any(labels[:, -1] == own))
            if touch:
                lo, edge = mid, mid
            else:
                hi = mid
            if hi - lo < 0.5:
                break
        return (edge if edge is not None else float(np.nanmin(dem))), True

    lo = float(np.nanmin(dem))           # key col is at least this low
    hi = ele                             # and at most the summit
    filled = filled_all
    for _ in range(22):
        mid = (lo + hi) / 2.0
        labels, _n = ndimage.label(filled >= mid, structure=structure)
        own = labels[py, px]
        if own == 0:
            hi = mid
            continue
        if np.any(higher & (labels == own)):
            lo = mid                     # still connected to higher ground
        else:
            hi = mid                     # the island is alone at this level
        if hi - lo < 0.5:
            break
    return lo, False


def isolation_km(dem, py, px, ele, dlat, dlon, step_m):
    """(km to the nearest higher ground, capped). The definition every
    mountain database uses, and the second input to `stature`."""
    import numpy as np
    higher = np.argwhere(dem > (ele + 1.0))
    if higher.size == 0:
        return None, True
    dy = (higher[:, 0] - py) * step_m
    dx = (higher[:, 1] - px) * step_m
    d = np.sqrt(dy * dy + dx * dx).min() / 1000.0
    return round(float(d), 2), False


def easiest_slope(dem, py, px, ele, step_m):
    """The steepest stretch of the GENTLEST radial line off the summit, in
    degrees, over the first 300 m of descent.

    This is the DEM fallback behind the difficulty facet, and it is a proxy
    rather than a route: it says how steep the mountain is on its friendliest
    side, which is what separates a walk-up from a scramble when no route to
    the top carries a sac_scale. It never upgrades a tagged difficulty and it
    is marked derived wherever it is used."""
    import numpy as np
    from scipy.ndimage import map_coordinates
    n = dem.shape[0]
    best = None
    steps = np.arange(1, int(3000.0 / step_m) + 1)
    for az in range(0, 360, 10):
        rad = math.radians(az)
        ys = py - steps * math.cos(rad)
        xs = px + steps * math.sin(rad)
        keep = (ys >= 0) & (ys < n) & (xs >= 0) & (xs < n)
        if not np.any(keep):
            continue
        prof = map_coordinates(np.nan_to_num(dem, nan=-32768.0),
                               [ys[keep], xs[keep]], order=1, mode="nearest")
        drop = ele - prof
        below = np.argmax(drop >= 300.0) if np.any(drop >= 300.0) else len(prof) - 1
        seg = prof[:below + 1]
        if len(seg) < 2:
            continue
        grade = np.abs(np.diff(seg)) / step_m
        # The steepest 90 m of the line, not the steepest single cell: one
        # cell of DEM noise is not a cliff.
        k = max(1, int(90.0 / step_m))
        if len(grade) >= k:
            sustained = np.convolve(grade, np.ones(k) / k, mode="valid").max()
        else:
            sustained = grade.max()
        angle = math.degrees(math.atan(float(sustained)))
        if best is None or angle < best:
            best = angle
    return round(best, 1) if best is not None else None


def _water_mask(dem, cell_km2):
    """Cells that are sea or a major lake: at or below WATER_ELE_M, or
    outside every tile (open sea), in a connected patch of at least
    WATER_MIN_KM2. One rule for both, because the question the views
    component asks is "is there big water in the frame"."""
    import numpy as np
    from scipy import ndimage
    flat = np.isnan(dem) | (dem <= WATER_ELE_M)
    if not np.any(flat):
        return np.zeros_like(flat)
    labels, n = ndimage.label(flat)
    if n == 0:
        return np.zeros_like(flat)
    sizes = ndimage.sum(flat, labels, index=np.arange(1, n + 1))
    big = {i + 1 for i, s in enumerate(sizes) if s * cell_km2 >= WATER_MIN_KM2}
    if not big:
        return np.zeros_like(flat)
    return np.isin(labels, list(big))


def viewshed(dem, py, px, ele, step_m, neighbours=None):
    """What can be seen from the summit, within VIEW_RADIUS_KM.

    A ray per half degree of azimuth, sampled every VIEW_STEP_M, with the
    running maximum elevation angle deciding visibility. Earth curvature and
    standard refraction are subtracted, which at 30 km is 61 m and is the
    difference between "the sea is visible" and "the sea is over the horizon".

    Returns visible land area in km2, whether big water is in view, and how
    many of the named summits handed in are visible."""
    import numpy as np
    from scipy.ndimage import map_coordinates

    n = dem.shape[0]
    grid = np.nan_to_num(dem, nan=-32768.0)
    cell_km2 = (step_m / 1000.0) ** 2
    water = _water_mask(dem, cell_km2)
    steps = np.arange(1, int(VIEW_RADIUS_KM * 1000.0 / step_m) + 1)
    dist = steps * step_m
    drop = (dist ** 2) / (2.0 * EARTH_R) * (1.0 - REFRACTION)
    eye = ele + EYE_M
    az = np.radians(np.arange(VIEW_AZIMUTHS) * (360.0 / VIEW_AZIMUTHS))
    # (azimuth, step) sample coordinates in one array: one map_coordinates
    # call rather than 720 of them.
    ys = py - np.outer(np.cos(az), steps)
    xs = px + np.outer(np.sin(az), steps)
    inside = (ys >= 0) & (ys < n) & (xs >= 0) & (xs < n)
    prof = map_coordinates(grid, [np.clip(ys, 0, n - 1), np.clip(xs, 0, n - 1)],
                           order=1, mode="nearest").reshape(ys.shape)
    wet = map_coordinates(water.astype("float32"),
                          [np.clip(ys, 0, n - 1), np.clip(xs, 0, n - 1)],
                          order=0, mode="nearest").reshape(ys.shape) > 0.5

    angle = (prof - drop - eye) / dist
    angle = np.where(inside & (prof > -30000.0), angle, -9e9)
    running = np.maximum.accumulate(angle, axis=1)
    # Visible where this sample is the highest angle seen so far along its ray.
    seen = (angle >= running) & (angle > -9e8)

    # Each sample stands for an annulus segment: r * dr * dtheta.
    dtheta = 2.0 * math.pi / VIEW_AZIMUTHS
    weight = (dist / 1000.0) * (step_m / 1000.0) * dtheta
    land = seen & ~wet
    area = float((land * weight).sum())
    water_seen = bool((seen & wet).any())

    peaks_seen = 0
    if neighbours:
        for nb in neighbours:
            if _line_of_sight(grid, py, px, eye, nb, step_m):
                peaks_seen += 1
    return {
        "area_km2": round(area, 1),
        "water": water_seen,
        "peaks": peaks_seen,
    }


def _line_of_sight(grid, py, px, eye, target, step_m):
    """Whether the summit of `target` (dy, dx, elevation) is visible."""
    import numpy as np
    from scipy.ndimage import map_coordinates
    ty, tx, tele = target
    dy, dx = ty - py, tx - px
    dist_px = math.hypot(dy, dx)
    if dist_px < 1.0:
        return False
    n_s = int(dist_px)
    if n_s < 2:
        return True
    frac = np.arange(1, n_s + 1) / float(n_s)
    ys = py + dy * frac
    xs = px + dx * frac
    h = grid.shape[0]
    if np.any((ys < 0) | (ys >= h) | (xs < 0) | (xs >= h)):
        return False
    prof = map_coordinates(grid, [ys, xs], order=1, mode="nearest")
    dist = frac * dist_px * step_m
    drop = (dist ** 2) / (2.0 * EARTH_R) * (1.0 - REFRACTION)
    angle = (prof - drop - eye) / np.maximum(dist, 1.0)
    if tele is not None:
        target_angle = (tele - drop[-1] - eye) / max(dist[-1], 1.0)
    else:
        target_angle = angle[-1]
    return bool(target_angle >= angle[:-1].max() if len(angle) > 1 else True)


# ---------------------------------------------------------------------------
# One summit, end to end
# ---------------------------------------------------------------------------

def summit_elevation(source_ele, snap_ele, window_max):
    """(the elevation to measure from, where it came from).

    The brief says to take the DEM value wherever it disagrees with the
    source by more than 30 m. Run literally that puts 4,330 m on the
    Matterhorn's card: GLO-30 is a 30 m posting and the Matterhorn's top
    200 m is a spire narrower than one, so the DEM smooths every sharp
    summit downward, by 148 m there and by nothing at all on Mont Blanc's
    broad dome (4,810.7 against a surveyed 4,808). A surface model also
    reads the canopy rather than the ground on a wooded hill. The
    disagreement is real and its SIGN is not evidence of a wrong source.

    What the DEM can prove is the impossible: a source elevation higher than
    anything within 12 km did not come from this mountain. That is the hand
    typed error the check was asked for (a foot value read as metres, a
    digit added), and it is the only case where the DEM overrules.

    Everything else keeps the source value and ships the gap as `ele_gap`,
    so the audit the brief wanted exists and no reader is told the
    Matterhorn is 4,330 m high."""
    if source_ele is None:
        return (snap_ele, "dem")
    # Both conditions, because either alone is wrong. The Matterhorn's
    # source elevation is 148 m above anything GLO-30 holds within 12 km,
    # which a +100 m rule calls impossible and which is simply what a 30 m
    # posting does to a spire. A foot value read as metres clears both.
    if (window_max is not None and float(source_ele) > window_max + 400.0
            and float(source_ele) > window_max * 1.15):
        return (snap_ele, "dem_fixed")
    return (float(source_ele), "source")


def measure(lat, lon, ele=None, neighbours=()):
    """Every terrain number for one coordinate. `neighbours` is a list of
    (lat, lon, elevation) for other NAMED summits within the view radius."""
    import numpy as np
    out = {"v": MODEL_VERSION}

    # 1. The close window: elevation check, prominence, isolation, slope.
    dem = None
    for radius_km, step_m in PROM_WINDOWS:
        dem, dlat, dlon, n = read_window(lat, lon, radius_km, step_m,
                                         how="max" if step_m > 30.0 else "bilinear")
        if np.all(np.isnan(dem)):
            break
        py, px, snap_ele = _snap(dem, n, step_m)
        if snap_ele is None:
            break
        window_max = float(np.nanmax(dem))
        summit, ele_src = summit_elevation(ele, snap_ele, window_max)
        # Two elevations, and which one answers which question is the whole
        # accuracy of this module.
        #
        # `ref` decides what counts as HIGHER GROUND, and it is the DEM's own
        # summit cell, never the source. A 30 m posting under-reads every
        # sharp summit, the neighbours included: measured against a surveyed
        # 4,478 the Matterhorn has no higher neighbour until Monte Rosa, so
        # the flood escapes over the Theodul Pass and the answer is 200 m
        # wrong. Measured DEM against DEM, the Weisshorn is higher exactly as
        # it is on the ground, the col comes out at Col Durand, and the
        # prominence lands within 1 per cent of the published figure.
        # Mont Blanc is the same rule from the other side: with a source
        # reference of 4,808 its own 4,810.5 snow cap becomes higher ground,
        # which is a col at the summit and a prominence of 0.3 m.
        #
        # `summit` is what the number is REPORTED against, which is the
        # published elevation, because that is the height on the card.
        summit = max(summit, snap_ele)
        # Half the gap, and both halves are earned.
        #
        # Pure DEM (ref = snap_ele) is right for Mont Blanc and wrong for the
        # Grossglockner: GLO-30 reads its summit 144 m low and its own
        # subsidiary Kleinglockner 400 m away comes out HIGHER, so the flood
        # stops at the notch between them and the answer is 75 m of
        # prominence against a surveyed 2,423.
        # Pure source (ref = the published elevation) is right for the
        # Grossglockner and wrong for the Matterhorn: measured against 4,478
        # the Weisshorn is not higher either, so the flood runs on to Monte
        # Rosa over the Theodul Pass and the col is 200 m too low.
        # The gap between the two readings is this DEM's under-read AT THIS
        # SUMMIT, and a neighbouring spire is under-read by something like
        # the same amount, so half of it is the threshold a neighbour has to
        # clear before it is believed to be higher.
        ref = float(snap_ele) + 0.5 * max(0.0, summit - snap_ele)
        if "ele_dem" not in out:
            out["ele_dem"] = round(float(snap_ele), 1)
            out["ele_src"] = ele_src
            if ele is not None and abs(float(ele) - snap_ele) > 30.0:
                out["ele_gap"] = round(float(ele) - snap_ele, 1)
            # Measured from the DEM's own summit, never from the source: on a
            # summit whose coordinate is 300 m off, a source elevation makes
            # every radial line start 400 m in the air and the whole mountain
            # reads as a cliff.
            slope = easiest_slope(dem, py, px, float(snap_ele), step_m)
            if slope is not None:
                out["slope_deg"] = slope
        col, capped = key_col(dem, py, px, ref, step_m)
        iso, iso_capped = isolation_km(dem, py, px, ref, dlat, dlon, step_m)
        # Reported against the PUBLISHED summit: the col is a fact about the
        # ground and the height on the card is the height on the card.
        out["prom_dem"] = round(max(0.0, summit - col), 1)
        out["col_dem"] = round(col, 1)
        out["prom_capped"] = capped
        out["prom_radius_km"] = radius_km
        if iso is not None:
            out["iso_dem_km"] = iso
        out["iso_capped"] = iso_capped
        if not capped and not iso_capped:
            break
    if "ele_dem" not in out:
        return out                       # no tile at all: an island the DEM
                                         # does not cover, or open sea

    # 2. The wide, coarse window: the viewshed.
    view_dem, dlat, dlon, n = read_window(lat, lon, VIEW_RADIUS_KM, VIEW_STEP_M)
    if not np.all(np.isnan(view_dem)):
        py, px, snap_ele = _snap(view_dem, n, VIEW_STEP_M)
        if snap_ele is not None:
            targets = []
            for nlat, nlon, nele in neighbours or ():
                ty = py - (nlat - lat) / dlat
                tx = px + (nlon - lon) / dlon
                if 0 <= ty < view_dem.shape[0] and 0 <= tx < view_dem.shape[1]:
                    targets.append((ty, tx, nele))
            view = viewshed(view_dem, py, px, float(snap_ele), VIEW_STEP_M,
                            targets)
            out["view_km2"] = view["area_km2"]
            out["view_water"] = view["water"]
            out["view_peaks"] = view["peaks"]
    return out


# ---------------------------------------------------------------------------
# The cache, and the sweep over a country
# ---------------------------------------------------------------------------

def key_for(lat, lon):
    """Terrain is a property of a place, not of an item: the key is the
    coordinate, so a row that changes its Q number keeps its measurements."""
    return f"{lat:.5f},{lon:.5f}"


def load_terrain():
    if not TERRAIN.exists():
        return {}
    try:
        return json.loads(TERRAIN.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


def save_terrain(data):
    TERRAIN.parent.mkdir(parents=True, exist_ok=True)
    tmp = TERRAIN.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    os.replace(tmp, TERRAIN)


def neighbours_for(row, pool, radius_km=VIEW_RADIUS_KM):
    """Other NAMED summits within the view radius, which is what makes
    "twelve other peaks are visible from here" a measurement rather than a
    guess. Capped at 40: the count saturates long before that and every one
    of them costs a line of sight walk."""
    from peak_sources import haversine_km
    out = []
    for other in pool:
        if other is row or other.get("ele") is None:
            continue
        km = haversine_km(row["lat"], row["lon"], other["lat"], other["lon"])
        if 0.4 < km <= radius_km:
            out.append((km, other["lat"], other["lon"], other["ele"]))
    out.sort()
    return [(lat, lon, ele) for _km, lat, lon, ele in out[:40]]


def sweep(rows, data, workers=4, refresh=False, label=""):
    """Measure every row that has no measurement yet. Network bound, so the
    workers are threads and GDAL opens its own dataset per thread."""
    todo = [r for r in rows
            if refresh or key_for(r["lat"], r["lon"]) not in data]
    if not todo:
        print(f"  {label}: cached")
        return 0
    done = [0]
    started = time.time()

    def one(row):
        key = key_for(row["lat"], row["lon"])
        try:
            out = measure(row["lat"], row["lon"], row.get("ele"),
                          row.get("_near") or ())
        except Exception as exc:                      # noqa: BLE001
            print(f"    {row.get('name', key)}: {type(exc).__name__} "
                  f"{str(exc)[:80]}")
            return
        with _lock:
            data[key] = out
            done[0] += 1
            if done[0] % 25 == 0:
                save_terrain(data)
                rate = done[0] / max(1e-6, time.time() - started)
                left = (len(todo) - done[0]) / max(rate, 1e-6) / 60.0
                print(f"    {label} {done[0]}/{len(todo)} "
                      f"({rate * 60:.0f}/min, {left:.0f} min left)")

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(one, todo))
    save_terrain(data)
    print(f"  {label}: measured {done[0]}/{len(todo)} in "
          f"{(time.time() - started) / 60:.1f} min")
    return done[0]


def rows_for_country(cc, published_only=False):
    from peak_sources import load_cache
    if published_only:
        path = ROOT / "continent-app" / "public" / "mountains" / f"{cc}.json"
        if not path.exists():
            return []
        wire = json.loads(path.read_text(encoding="utf-8"))
        return (wire.get("mountains") or []) + (wire.get("listed") or [])
    rich = load_cache("rich", cc)
    return (rich or {}).get("peaks") or []


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--published", action="store_true",
                        help="only the rows already in the wire")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int, default=0,
                        help="stop after this many new measurements")
    args = parser.parse_args()

    from harvest_peaks import COUNTRIES
    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or COUNTRIES
    data = load_terrain()
    before = len(data)
    total = 0
    for cc in countries:
        rows = [r for r in rows_for_country(cc, args.published)
                if r.get("lat") is not None and r.get("lon") is not None]
        if not rows:
            continue
        for row in rows:
            row["_near"] = neighbours_for(row, rows)
        total += sweep(rows, data, workers=args.workers, refresh=args.refresh,
                       label=cc)
        if args.limit and len(data) - before >= args.limit:
            print(f"[terrain] limit {args.limit} reached")
            break
    print(f"[terrain] {len(data)} coordinates measured ({total} new this run)")


if __name__ == "__main__":
    main()
