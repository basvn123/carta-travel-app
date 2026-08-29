"""Geograph Britain and Ireland: the single biggest win available.

A twenty-year project to photograph every OS grid square of GB and
Ireland, CC BY-SA, storable, which is exactly invariant 8's bar. This is
the corpus that fixes lakes GB 8 / IE 9, mountains GB 21, and the thin
gallery problem across the British Isles: systematic coverage of places
Commons never visits.

Two ways in, used together:

  bulk dumps (data.geograph.org.uk/dumps/)   the candidate SET. No API
      cap, no key, millions of rows. Ingested once into a local sqlite
      with a lat/lon index; the harvests then ask "what did Geograph
      shoot within r km of here" for free. The dumps carry the metadata
      and the WGS84 coordinate but not a direct image URL.
  syndicator API                              the pixels. Resolves the
      shortlisted ids (and only those) to thumbnail URLs. Keyed
      (CARTA_GEOGRAPH_KEY), capped at 100 per page and 1,000 results per
      query, which is why it is never used for discovery.

Licence duties, same as Commons: CC BY-SA means per-image author and
licence ship in the wire, and attribution.js carries a Geograph row.

Evidence mapping (relevance.geograph_tier): `name` when the title or
description names the subject, else `geo`. Geograph's subject-naming
discipline is good, so expect a high `name` rate; the `geo` remainder can
fill a gallery and never lead it.

    python pipeline/photos/geograph.py ingest <gridimage_base.tsv.gz> \
        [gridimage_geo.tsv.gz]        build/refresh the sqlite
    python pipeline/photos/geograph.py near 57.71 -5.48 5

ASCII clean, no em dashes, per project convention.
"""

import csv
import gzip
import io
import json
import math
import os
import sqlite3
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "cache" / "photos" / "geograph.sqlite"
DUMPS_URL = "https://data.geograph.org.uk/dumps/"
SYNDICATOR = "https://api.geograph.org.uk/syndicator.php"

KEY_ENV = "CARTA_GEOGRAPH_KEY"
MAX_DISTANCE_KM = 20      # the syndicator's own cap
PER_PAGE = 100            # likewise
UA = ("CartaPhotos/1.0 (https://carta-europetravel.com; "
      "bas.vannieuwenhuyse123@gmail.com)")


# ---------------------------------------------------------------------------
# The dump ingest: metadata and coordinates, no pixels
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY,
    title TEXT, realname TEXT, imagetaken TEXT,
    grid_reference TEXT, lat REAL, lon REAL
);
CREATE INDEX IF NOT EXISTS idx_latlon ON images (lat, lon);
"""


def _open_rows(path):
    raw = gzip.open(path, "rt", encoding="utf-8", errors="replace") \
        if str(path).endswith(".gz") \
        else open(path, "rt", encoding="utf-8", errors="replace")
    return csv.DictReader(raw, delimiter="\t")


def ingest(base_path, geo_path=None):
    """Build the sqlite from the published TSV dumps.

    gridimage_base carries id, title, realname, grid_reference and the
    capture date; gridimage_geo carries the WGS84 coordinate per id. When
    only the base dump is given, rows without a coordinate are kept but
    unfindable by `near`, so pass both."""
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    coords = {}
    if geo_path:
        for row in _open_rows(geo_path):
            try:
                coords[int(row["gridimage_id"])] = (
                    float(row["wgs84_lat"]), float(row["wgs84_long"]))
            except (KeyError, ValueError):
                continue
    n = 0
    batch = []
    for row in _open_rows(base_path):
        try:
            gid = int(row["gridimage_id"])
        except (KeyError, ValueError):
            continue
        # Only moderated, publicly visible images. The dump ships the
        # moderation state precisely so consumers can honour it.
        status = (row.get("moderation_status") or "").lower()
        if status and status not in ("accepted", "geograph"):
            continue
        lat, lon = coords.get(gid, (None, None))
        batch.append((gid, row.get("title") or "",
                      row.get("realname") or "",
                      row.get("imagetaken") or "",
                      row.get("grid_reference") or "", lat, lon))
        if len(batch) >= 5000:
            con.executemany("INSERT OR REPLACE INTO images VALUES "
                            "(?,?,?,?,?,?,?)", batch)
            n += len(batch)
            batch = []
    if batch:
        con.executemany("INSERT OR REPLACE INTO images VALUES "
                        "(?,?,?,?,?,?,?)", batch)
        n += len(batch)
    con.commit()
    con.close()
    print(f"ingested {n} rows -> {DB}")


def near(lat, lon, km):
    """[{id, title, realname, imagetaken, lat, lon, km}] within `km`,
    nearest first, from the local sqlite. Empty when the dumps have not
    been ingested yet, which callers treat as "Geograph knows nothing",
    never as an error."""
    if not DB.exists():
        return []
    dlat = km / 111.0
    dlon = km / (111.0 * max(0.2, math.cos(math.radians(lat))))
    con = sqlite3.connect(DB)
    rows = con.execute(
        "SELECT id, title, realname, imagetaken, lat, lon FROM images "
        "WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
        (lat - dlat, lat + dlat, lon - dlon, lon + dlon)).fetchall()
    con.close()
    out = []
    for gid, title, realname, taken, ilat, ilon in rows:
        dist = haversine_km(lat, lon, ilat, ilon)
        if dist <= km:
            out.append({"id": gid, "title": title, "realname": realname,
                        "imagetaken": taken, "lat": ilat, "lon": ilon,
                        "km": round(dist, 2)})
    out.sort(key=lambda r: r["km"])
    return out


def haversine_km(lat1, lon1, lat2, lon2):
    rad = math.radians
    a = (math.sin(rad(lat2 - lat1) / 2) ** 2
         + math.cos(rad(lat1)) * math.cos(rad(lat2))
         * math.sin(rad(lon2 - lon1) / 2) ** 2)
    return 6371.0 * 2 * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# The syndicator: pixels for the shortlist
# ---------------------------------------------------------------------------

def syndicate(lat, lon, km=5, key=None):
    """Live candidates near a point, with thumbnail URLs and licences.

    [{id, title, thumb, author, licence, link}]. Requires the API key;
    without one this returns [] and the caller falls back to the dump
    metadata (which cannot ship pixels, only the work list). Capped by
    the service at 1,000 results per query; discovery belongs to the
    dumps, not to this."""
    key = key or os.environ.get(KEY_ENV, "").strip()
    if not key:
        return []
    params = urllib.parse.urlencode({
        "key": key, "q": f"{lat},{lon}",
        "distance": min(km, MAX_DISTANCE_KM),
        "format": "JSON", "perpage": PER_PAGE,
    })
    req = urllib.request.Request(f"{SYNDICATOR}?{params}",
                                 headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.load(io.TextIOWrapper(resp, encoding="utf-8"))
    except Exception:
        return []
    out = []
    for item in data.get("items") or []:
        out.append({
            "id": item.get("guid") or item.get("link", ""),
            "title": item.get("title") or "",
            "thumb": item.get("thumbnail") or "",
            "author": item.get("author") or "",
            "licence": "CC BY-SA 2.0",
            "licence_url":
                "https://creativecommons.org/licenses/by-sa/2.0/",
            "link": item.get("link") or "",
        })
    return out


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "ingest":
        ingest(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif len(sys.argv) >= 5 and sys.argv[1] == "near":
        rows = near(float(sys.argv[2]), float(sys.argv[3]),
                    float(sys.argv[4]))
        for row in rows[:20]:
            print(f"  {row['km']:5.1f} km  {row['title']}  "
                  f"({row['realname']})")
        print(f"{len(rows)} within range")
    else:
        print(__doc__.split("ASCII")[0])


if __name__ == "__main__":
    main()
