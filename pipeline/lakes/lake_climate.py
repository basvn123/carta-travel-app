"""Monthly air temperature normals for the lake season model, from CHELSA.

This file exists to close a licence risk, and the risk was real. The swimming
season on every lake page was modelled from WorldClim 2.1, and WorldClim 2.1
is licensed for NON-COMMERCIAL use only. Carta carries affiliate links and
ships a redistributable PDF that prints monthly figures, so a non-commercial
raster underneath a published number was the single clearest legal hole in the
layer. The catalogue's own climate strip had already moved off WorldClim for
exactly this reason; the lake season had not.

The brief offered two replacements and either closes the risk.

  ERA5-Land monthly climatology from the Copernicus Climate Data Store. Free,
        commercial use permitted, attribution required, 0.1 degree. It needs a
        CDS account, an API key on the machine that builds, and a queue: a
        request is submitted, waits, and is collected. That is a build that
        cannot run from a fresh clone.
  CHELSA V2.1.  CC BY 4.0, commercial use permitted with attribution, 30 arc
        seconds, and served as plain GeoTIFFs over HTTPS with no account at
        all. It is also THREE TIMES finer than the WorldClim 5 arc minute grid
        it replaces, which matters for exactly the lakes this layer is worst
        at: a tarn at 1,900 m in a cell whose average elevation is a valley.

CHELSA is taken. The whole of Europe is cropped once into
cache/lakes/chelsa/, twelve rasters of monthly mean 2 m air temperature, and
every stage after that reads a local file. No account, no queue, no runtime
API, and the cache is the snapshot exactly as the other stages have it.

What ships in the wire is twelve numbers per lake and the model string that
made them. The season itself is still a MODEL and still says so: see
lake_index.water_temp_estimate, which takes these air normals and applies the
thermal lag, solar gain, shallow water and depth corrections that turn air
into a surface temperature estimate.

Attribution, which data_licenses.md and attribution.js both carry:
    Karger, D.N. et al. (2017) Climatologies at high resolution for the
    earth's land surface areas. Scientific Data 4, 170122. CHELSA V2.1,
    CC BY 4.0.

Usage, from the repo root:
    python pipeline/lakes/lake_climate.py --fetch          # crop Europe once
    python pipeline/lakes/lake_climate.py --fetch --refresh
    python pipeline/lakes/lake_climate.py --sample 46.37 10.17

ASCII clean, no em dashes, per project convention.
"""

import argparse
import math
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

# Windows consoles and redirected pipes default to cp1252, which cannot encode
# a Latvian, Icelandic or Polish lake name. A print of one then raises
# UnicodeEncodeError and takes the stage down; the lake export died on
# "Lielais Baltezers" halfway through a logged run. The data was never the
# problem, the terminal was, so say so once here.
if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

CACHE = ROOT / "cache" / "lakes" / "chelsa"

# The switch.ch object store CHELSA publishes from. Pinned to V.2.1 and to the
# 1981-2010 reference period, so a rebuild two years from now reads the same
# climate as the wire it is reproducing.
CHELSA_URL = ("https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/"
              "1981-2010/tas/CHELSA_tas_{mm:02d}_1981-2010_V.2.1.tif")

# W, S, E, N. The same window the catalogue's climate harvest uses, which is
# every country in scope plus enough margin for an island off the edge of one.
WIN = (-32.0, 26.0, 46.0, 72.0)

# CHELSA ships tas as uint16 kelvin at a scale of 0.1. The crop is stored as
# int16 DECIDEGREES CELSIUS, which is the same precision in half the dynamic
# range and needs no offset to read.
NODATA = -32768

MODEL_SOURCE = ("CHELSA V2.1 monthly mean 2 m air temperature, 1981-2010 "
                "normals at 30 arc seconds")
ATTRIBUTION = ("Climate normals from CHELSA V2.1 (Karger et al. 2017), "
               "CC BY 4.0")

_stack = {}


def month_path(month):
    return CACHE / f"tas_{month:02d}_europe.tif"


def fetch(refresh=False, quiet=False):
    """Crop the twelve global rasters to Europe, once.

    GDAL reads only the byte ranges the window needs, so this costs a few
    minutes and a few hundred megabytes rather than the fifteen gigabytes the
    twelve global files weigh. Each month is written as it completes, so an
    interrupted fetch resumes where it stopped."""
    import numpy as np
    import rasterio
    from rasterio.windows import from_bounds

    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
    os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
    os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "5")

    CACHE.mkdir(parents=True, exist_ok=True)
    for month in range(1, 13):
        out = month_path(month)
        if out.exists() and not refresh:
            if not quiet:
                print(f"  tas {month:02d}: cached "
                      f"({out.stat().st_size // 1048576} MB)")
            continue
        url = "/vsicurl/" + CHELSA_URL.format(mm=month)
        t0 = time.time()
        with rasterio.open(url) as ds:
            win = from_bounds(WIN[0], WIN[1], WIN[2], WIN[3], ds.transform)
            raw = ds.read(1, window=win, masked=True)
            transform = ds.window_transform(win)
            # Kelvin at 0.1 scale -> decidegrees Celsius, integer throughout.
            deci = (raw.astype("int32") - 2731).astype("int16")
            data = np.where(raw.mask, NODATA, deci).astype("int16")
        profile = {
            "driver": "GTiff", "height": data.shape[0], "width": data.shape[1],
            "count": 1, "dtype": "int16", "crs": "EPSG:4326",
            "transform": transform, "nodata": NODATA,
            "compress": "deflate", "predictor": 2, "tiled": True,
            "blockxsize": 512, "blockysize": 512,
        }
        tmp = out.with_suffix(".part")
        with rasterio.open(tmp, "w", **profile) as dst:
            dst.write(data, 1)
        tmp.replace(out)
        if not quiet:
            print(f"  tas {month:02d}: {data.shape[1]}x{data.shape[0]} "
                  f"-> {out.stat().st_size // 1048576} MB "
                  f"in {time.time() - t0:.0f}s")
    return True


def have_data():
    return all(month_path(m).exists() for m in range(1, 13))


# The whole Europe crop is 9,360 x 5,520 pixels a month, so holding all
# twelve in memory is 1.2 GB. That is more than the enrich stage should ask
# of a laptop that is also filtering an OpenStreetMap extract, and it is
# wasted: lakes arrive country by country, so a sample is nearly always in
# the same corner of Europe as the one before it. So the reader keeps the
# twelve files open and pulls 5 degree tiles on demand, holding a handful.
TILE_DEG = 5.0
TILE_KEEP = 12                 # about 100 MB, and a country fits in two or three


def _datasets():
    if "ds" in _stack:
        return _stack["ds"]
    try:
        import rasterio
    except ImportError:
        print("  note: rasterio not installed, the swimming season is skipped")
        _stack["ds"] = (None, None)
        return _stack["ds"]
    if not have_data():
        print("  note: no CHELSA crop on disk, the swimming season is skipped "
              "(python pipeline/lakes/lake_climate.py --fetch)")
        _stack["ds"] = (None, None)
        return _stack["ds"]
    handles = [rasterio.open(month_path(m)) for m in range(1, 13)]
    _stack["ds"] = (handles, handles[0].transform)
    _stack["tiles"] = {}
    _stack["order"] = []
    print("  CHELSA normals opened")
    return _stack["ds"]


def _tile(lat, lon):
    """((12, h, w) int16, row0, col0) for the 5 degree tile holding a point."""
    import numpy as np
    from rasterio.windows import Window

    handles, transform = _datasets()
    if handles is None:
        return None
    key = (int(math.floor(lat / TILE_DEG)), int(math.floor(lon / TILE_DEG)))
    got = _stack["tiles"].get(key)
    if got is not None:
        return got
    south, west = key[0] * TILE_DEG, key[1] * TILE_DEG
    deg = abs(transform.a)
    row0 = int(round((transform.f - (south + TILE_DEG)) / deg))
    col0 = int(round((west - transform.c) / transform.a))
    span = int(round(TILE_DEG / deg))
    height, width = handles[0].height, handles[0].width
    row0, col0 = max(0, row0), max(0, col0)
    rows = min(span, height - row0)
    cols = min(span, width - col0)
    if rows <= 0 or cols <= 0:
        return None
    win = Window(col0, row0, cols, rows)
    band = np.stack([h.read(1, window=win) for h in handles])
    got = (band, row0, col0)
    _stack["tiles"][key] = got
    _stack["order"].append(key)
    while len(_stack["order"]) > TILE_KEEP:
        _stack["tiles"].pop(_stack["order"].pop(0), None)
    return got


def sample(lat, lon, maxr=8):
    """[12] monthly mean air temperature in C at the nearest valid pixel.

    The ring search is not decoration. A lake IS a water pixel, and CHELSA
    masks large water bodies out, so the middle of Vattern and the middle of
    Balaton both read nodata. Without the fallback the biggest lakes in the
    layer would be the ones with no season at all. Eight pixels at 30 arc
    seconds is four kilometres, which reaches the shore of everything short
    of Ladoga and never crosses a climate boundary that matters."""
    handles, transform = _datasets()
    if handles is None:
        return None
    col = int((lon - transform.c) / transform.a)
    row = int((lat - transform.f) / transform.e)
    for rad in range(0, maxr + 1):
        for d_row in range(-rad, rad + 1):
            for d_col in range(-rad, rad + 1):
                if max(abs(d_row), abs(d_col)) != rad:
                    continue
                r, c = row + d_row, col + d_col
                if not (0 <= r < handles[0].height
                        and 0 <= c < handles[0].width):
                    continue
                got = _tile(transform.f + (r + 0.5) * transform.e,
                            transform.c + (c + 0.5) * transform.a)
                if got is None:
                    continue
                band, row0, col0 = got
                tr, tc = r - row0, c - col0
                if not (0 <= tr < band.shape[1] and 0 <= tc < band.shape[2]):
                    continue
                if band[0, tr, tc] == NODATA:
                    continue
                return [round(float(band[i, tr, tc]) / 10.0, 1)
                        for i in range(12)]
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--fetch", action="store_true",
                        help="crop the twelve global rasters to Europe")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--sample", nargs=2, type=float, metavar=("LAT", "LON"))
    args = parser.parse_args()
    if args.fetch:
        fetch(refresh=args.refresh)
    if args.sample:
        got = sample(args.sample[0], args.sample[1])
        print(got if got else "no reading")
    if not args.fetch and not args.sample:
        parser.print_help()


if __name__ == "__main__":
    main()
