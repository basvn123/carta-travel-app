"""Stage the BRouter segment tiles one country needs, then start the server.

BRouter routes on .rd5 segment files: 5 by 5 degree tiles, republished
weekly at brouter.de/brouter/segments4/. A whole-Europe set is tens of
gigabytes and pointless for a per-country pass, so this downloads only the
tiles a country's bounding box touches, into tools/brouter/segments/, and
skips anything already there.

Same conventions as tools/trailslab/valhalla/prepare.py: cache first, one
country at a time, loopback only, and the compose stack started for you when
you ask for it.

    python tools/brouter/prepare.py --country GB --up --wait
    python tools/brouter/prepare.py --country CH --list
    python tools/brouter/prepare.py --bbox -6,54,0,59

The three house profiles in tools/brouter/profiles are mounted read only and
are part of the model, so they ship with the repo rather than living in a
container layer. After the server is up:

    curl "http://127.0.0.1:17777/brouter?lonlats=-5.06,56.82|-5.11,56.71\
          &profile=carta-touring&alternativeidx=0&format=geojson"

ASCII clean, no em dashes, per project convention.
"""

import argparse
import math
import subprocess
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SEGMENTS = HERE / "segments"
BASE = "https://brouter.de/brouter/segments4"
UA = "CartaCycling/1.0 (https://carta-europetravel.com)"

# Generous country boxes, the same shape validate.py uses for its bbox
# sanity check. Only what the cycling layer covers; a country missing from
# here can still be staged with --bbox.
BOXES = {
    "AD": (1.4, 42.4, 1.8, 42.7), "AL": (19.2, 39.6, 21.1, 42.7),
    "AT": (9.5, 46.3, 17.2, 49.1), "BA": (15.7, 42.5, 19.7, 45.3),
    "BE": (2.5, 49.4, 6.4, 51.6), "BG": (22.3, 41.2, 28.7, 44.3),
    "CH": (5.9, 45.8, 10.5, 47.9), "CY": (32.2, 34.5, 34.6, 35.8),
    "CZ": (12.0, 48.5, 18.9, 51.1), "DE": (5.8, 47.2, 15.1, 55.1),
    "DK": (8.0, 54.5, 15.3, 57.8), "EE": (21.7, 57.5, 28.3, 59.7),
    "ES": (-9.4, 35.9, 4.4, 43.9), "FI": (19.0, 59.7, 31.6, 70.1),
    "FO": (-7.7, 61.3, -6.2, 62.4), "FR": (-5.2, 41.3, 9.6, 51.1),
    "GB": (-8.7, 49.8, 1.8, 61.0), "GR": (19.3, 34.8, 28.3, 41.8),
    "HR": (13.4, 42.3, 19.5, 46.6), "HU": (16.1, 45.7, 22.9, 48.6),
    "IE": (-10.6, 51.4, -5.3, 55.4), "IS": (-24.6, 63.3, -13.5, 66.6),
    "IT": (6.6, 36.6, 18.6, 47.1), "LI": (9.4, 47.0, 9.7, 47.3),
    "LT": (20.9, 53.9, 26.9, 56.5), "LU": (5.7, 49.4, 6.6, 50.2),
    "LV": (20.9, 55.6, 28.3, 58.1), "MD": (26.6, 45.4, 30.2, 48.5),
    "ME": (18.4, 41.8, 20.4, 43.6), "MK": (20.4, 40.8, 23.1, 42.4),
    "MT": (14.1, 35.7, 14.6, 36.1), "NL": (3.3, 50.7, 7.3, 53.6),
    "NO": (4.6, 57.9, 31.3, 71.2), "PL": (14.1, 49.0, 24.2, 54.9),
    "PT": (-9.6, 36.9, -6.1, 42.2), "RO": (20.2, 43.6, 30.0, 48.3),
    "RS": (18.8, 42.2, 23.1, 46.2), "SE": (11.0, 55.3, 24.2, 69.1),
    "SI": (13.3, 45.4, 16.7, 46.9), "SK": (16.8, 47.7, 22.6, 49.7),
    "TR": (25.6, 35.8, 44.9, 42.2), "UA": (22.1, 44.3, 40.3, 52.4),
    "XK": (20.0, 41.8, 21.8, 43.3),
}


def tile_name(lon, lat):
    """The .rd5 stem for the 5 by 5 degree cell with this SW corner."""
    ew = "E" if lon >= 0 else "W"
    ns = "N" if lat >= 0 else "S"
    return f"{ew}{abs(int(lon)):03d}_{ns}{abs(int(lat)):02d}"


def tiles_for(bbox):
    west, south, east, north = bbox
    out = []
    lon = math.floor(west / 5) * 5
    while lon <= east:
        lat = math.floor(south / 5) * 5
        while lat <= north:
            out.append(tile_name(lon, lat))
            lat += 5
        lon += 5
    return sorted(set(out))


def fetch(stem, session, refresh=False):
    SEGMENTS.mkdir(parents=True, exist_ok=True)
    dest = SEGMENTS / f"{stem}.rd5"
    if dest.exists() and not refresh:
        print(f"  {stem}.rd5 cached ({dest.stat().st_size / 1e6:.0f} MB)")
        return dest, False
    url = f"{BASE}/{stem}.rd5"
    tmp = dest.with_suffix(".rd5.part")
    print(f"  downloading {url}")
    with session.get(url, stream=True, timeout=300) as resp:
        if resp.status_code == 404:
            # Ocean cells simply have no segment file, which is not an error.
            print(f"  {stem}.rd5 does not exist upstream (open water)")
            return None, False
        resp.raise_for_status()
        with open(tmp, "wb") as fh:
            for chunk in resp.iter_content(1 << 20):
                if chunk:
                    fh.write(chunk)
    tmp.replace(dest)
    print(f"  {stem}.rd5 {dest.stat().st_size / 1e6:.0f} MB")
    return dest, True


def compose(*args):
    return subprocess.run(["docker", "compose", *args], cwd=str(HERE)).returncode


def wait_for_server(timeout=240):
    started = time.time()
    while time.time() - started < timeout:
        try:
            resp = requests.get("http://127.0.0.1:17777/brouter", timeout=5)
            if resp.status_code < 500:
                print(f"brouter is up after {time.time() - started:.0f}s")
                return True
        except requests.RequestException:
            pass
        time.sleep(5)
    print("brouter did not answer in time; check: docker compose logs")
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--country", help="ISO2 whose tiles to stage")
    ap.add_argument("--bbox", help="west,south,east,north instead of a country")
    ap.add_argument("--list", action="store_true",
                    help="print the tiles and exit, download nothing")
    ap.add_argument("--refresh", action="store_true",
                    help="re-download tiles even when cached")
    ap.add_argument("--up", action="store_true", help="docker compose up -d")
    ap.add_argument("--wait", action="store_true",
                    help="block until the server answers")
    args = ap.parse_args()

    if args.bbox:
        bbox = tuple(float(v) for v in args.bbox.split(","))
    elif args.country:
        cc = args.country.upper()
        if cc not in BOXES:
            ap.error(f"no box for {cc}; pass --bbox west,south,east,north")
        bbox = BOXES[cc]
    else:
        ap.error("pass --country or --bbox")

    stems = tiles_for(bbox)
    print(f"{len(stems)} segment tile(s) cover {args.country or args.bbox}: "
          + ", ".join(stems))
    if args.list:
        return

    session = requests.Session()
    session.headers.update({"User-Agent": UA})
    got = 0
    for stem in stems:
        path, fresh = fetch(stem, session, args.refresh)
        if path:
            got += 1
    print(f"{got} tile(s) staged in {SEGMENTS}")

    if args.up:
        if compose("up", "-d") != 0:
            raise SystemExit("docker compose up failed")
        if args.wait:
            wait_for_server()


if __name__ == "__main__":
    main()
