"""harvest_pois_overture.py - maximal sightseeing POIs from Overture Maps.

For "all POIs possible" across the WHOLE catalogue (now ~24k destinations),
per-destination Overpass queries do not scale - that is 24k+ requests and a
ban from the public endpoints. Overture Maps Places (75M+ POIs, GERS-stable,
free, no key) is the right tool: query the cloud GeoParquet ONCE per continent
with DuckDB, filter to sightseeing categories locally, then assign POIs to
destinations by proximity with a KD-tree. No rate limits, no ban risk.

Two phases:

  extract  One bulk DuckDB query over the Overture places theme for the Europe
           bbox, filtered to sightseeing categories + named + confidence, written
           to cache/overture_pois_eu.parquet. LOCAL output - safe to run while
           another process is editing app_data.json. ~1M rows, a few minutes.

  assign   Load the local parquet, KD-tree match every destination to the POIs
           within RADIUS_KM of its centre, dedupe vs existing items_full, rank
           (category importance, confidence, proximity), cap at CAP_MERGED, and
           merge into activities.items_full. Writes app_data.json master, so run
           it only when no other process is writing it. `--dry-run` reports the
           numbers without writing.

Sightseeing taxonomy only (museums, monuments, landmarks, historic sites,
castles, churches, parks/gardens, beaches, viewpoints, galleries, theatres) -
Overture is ~95% commercial (bars, shops, salons) and those would be map noise.
POI rate is capped at 2 so Overture POIs never enter the rate-3 must-see tier,
matching harvest_osm_wikidata / harvest_pois_osm.

Usage:
    python harvest_pois_overture.py extract
    python harvest_pois_overture.py assign --dry-run
    python harvest_pois_overture.py assign
"""
import json
import sys
import unicodedata
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
PARQUET = ROOT / "cache" / "overture_pois_eu.parquet"

RELEASE = "2026-06-17.0"
S3 = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*.parquet"
EU_BBOX = (-25.0, 45.0, 34.0, 72.0)      # lon_min, lon_max, lat_min, lat_max
MIN_CONF = 0.5
RADIUS_KM = 5.0
CAP_MERGED = 150

# Overture primary-category -> (display kind, base rate 0..2, is "get active").
# Matched by exact value first, then by substring group in classify().
CAT_EXACT = {
    "park": ("Park", 1, True), "garden": ("Garden", 1, True),
    "botanical_garden": ("Garden", 1, True), "national_park": ("National park", 1, True),
    "nature_preserve": ("Nature reserve", 1, True), "beach": ("Beach", 1, True),
    "castle": ("Castle", 2, False), "palace": ("Palace", 2, False),
    "fortress": ("Fortress", 2, False), "cathedral": ("Cathedral", 2, False),
    "church_cathedral": ("Church", 1, False), "monument": ("Monument", 1, False),
    "national_monument": ("Monument", 2, False), "ruins": ("Ruins", 1, False),
    "archaeological_site": ("Archaeological site", 2, False),
    "scenic_lookout": ("Viewpoint", 1, True), "viewpoint": ("Viewpoint", 1, True),
    "zoo": ("Zoo", 1, True), "aquarium": ("Aquarium", 1, True),
    "theatre": ("Theatre", 1, False), "opera_house": ("Opera house", 1, False),
    "performing_arts": ("Performing arts", 1, False),
}
# substring -> (kind, rate, active); checked in order for anything not exact
CAT_SUB = [
    ("art_museum", ("Museum", 1, False)), ("history_museum", ("Museum", 1, False)),
    ("science_museum", ("Museum", 1, False)), ("museum", ("Museum", 1, False)),
    ("landmark", ("Landmark", 2, False)), ("historic", ("Historic site", 2, False)),
    ("monument", ("Monument", 1, False)), ("attraction", ("Attraction", 2, False)),
    ("tourist", ("Attraction", 2, False)), ("art_galler", ("Gallery", 1, False)),
    ("castle", ("Castle", 2, False)), ("palace", ("Palace", 2, False)),
]

SIGHT_SQL = (
    "cat LIKE '%museum%' OR cat LIKE '%monument%' OR cat LIKE '%landmark%' "
    "OR cat LIKE '%historic%' OR cat LIKE '%tourist%' OR cat LIKE '%attraction%' "
    "OR cat LIKE '%art_galler%' OR cat IN ('park','castle','palace','cathedral',"
    "'church_cathedral','ruins','archaeological_site','scenic_lookout','viewpoint',"
    "'fortress','beach','botanical_garden','garden','zoo','aquarium','opera_house',"
    "'theatre','performing_arts','national_park','nature_preserve','national_monument')"
)


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def fold(name):
    s = (name or "").translate(str.maketrans({"ł": "l", "Ł": "l", "ø": "o", "ß": "ss"}))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


def classify(cat):
    if not cat:
        return None
    if cat in CAT_EXACT:
        return CAT_EXACT[cat]
    for sub, meta in CAT_SUB:
        if sub in cat:
            return meta
    return ("Attraction", 1, False)      # sightseeing-filtered, so a safe default


# --------------------------------------------------------------------------- #
def extract():
    import duckdb
    lon0, lon1, lat0, lat1 = EU_BBOX
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.execute("SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key='';")
    PARQUET.parent.mkdir(exist_ok=True)
    print(f"Extracting Overture {RELEASE} sightseeing POIs for Europe -> {PARQUET.name}")
    con.execute(f"""
        COPY (
          SELECT name, cat, lon, lat, confidence FROM (
            SELECT names.primary AS name, categories.primary AS cat,
                   bbox.xmin AS lon, bbox.ymin AS lat, confidence
            FROM read_parquet('{S3}')
            WHERE bbox.xmin BETWEEN {lon0} AND {lon1}
              AND bbox.ymin BETWEEN {lat0} AND {lat1}
              AND names.primary IS NOT NULL AND confidence >= {MIN_CONF}
          ) WHERE {SIGHT_SQL}
        ) TO '{PARQUET.as_posix()}' (FORMAT parquet);
    """)
    n = con.execute(f"SELECT count(*) FROM read_parquet('{PARQUET.as_posix()}')").fetchone()[0]
    mb = PARQUET.stat().st_size / 1e6
    print(f"  wrote {n} POIs ({mb:.0f} MB) to cache/{PARQUET.name}")


# --------------------------------------------------------------------------- #
def assign(dry_run):
    import duckdb
    con = duckdb.connect()
    rows = con.execute(
        f"SELECT name, cat, lon, lat, confidence FROM read_parquet('{PARQUET.as_posix()}')"
    ).fetchall()
    print(f"Loaded {len(rows)} Overture POIs from cache/{PARQUET.name}")

    names = [r[0] for r in rows]
    cats = [r[1] for r in rows]
    lon = np.array([r[2] for r in rows])
    lat = np.array([r[3] for r in rows])
    conf = np.array([r[4] for r in rows])

    # KD-tree in an equirectangular projection scaled to km (good enough at
    # continental scale for a few-km radius match).
    from scipy.spatial import cKDTree
    lat0 = np.radians(np.median(lat))
    x = np.radians(lon) * np.cos(lat0) * 6371.0
    y = np.radians(lat) * 6371.0
    tree = cKDTree(np.column_stack([x, y]))

    data = load(MASTER)
    dests = data["destinations"]
    grown = added_total = 0
    for d in dests.values():
        dlat = d.get("city_lat") or d.get("lat")
        dlon = d.get("city_lon") or d.get("lon")
        if dlat is None or dlon is None:
            continue
        dx = np.radians(dlon) * np.cos(lat0) * 6371.0
        dy = np.radians(dlat) * 6371.0
        idx = tree.query_ball_point([dx, dy], RADIUS_KM)
        if not idx:
            continue
        a = d.setdefault("activities", {}) or {}
        if a is None:
            a = {}
            d["activities"] = a
        existing = a.get("items_full") or []
        have = {fold(it.get("name")) for it in existing}

        cand = []
        for i in idx:
            f = fold(names[i])
            if not f or f in have:
                continue
            meta = classify(cats[i])
            if not meta:
                continue
            kind, rate, active = meta
            dist = ((x[i] - dx) ** 2 + (y[i] - dy) ** 2) ** 0.5
            cand.append((f, names[i], kind, rate, active, float(lat[i]), float(lon[i]),
                         float(conf[i]), dist))
        # rank: rate desc, confidence desc, distance asc
        cand.sort(key=lambda c: (-c[3], -c[7], c[8]))
        add, seen = [], set()
        room = CAP_MERGED - len(existing)
        for f, nm, kind, rate, active, plat, plon, cf, dist in cand:
            if room <= 0:
                break
            if f in seen:
                continue
            seen.add(f)
            row = {"name": nm, "kind": kind, "lat": round(plat, 5), "lon": round(plon, 5),
                   "rate": min(2, rate), "src": "overture"}
            if active:
                row["active"] = True
            add.append(row)
            room -= 1
        if not add:
            continue
        a["items_full"] = existing + add
        a["overture_added"] = len(add)
        a["source"] = a.get("source") or "overture"
        # top up the name-only fallback list too
        items = a.get("items") or []
        inames = {fold(it.get("name")) for it in items}
        for r in add:
            if len(items) >= 12:
                break
            if fold(r["name"]) not in inames:
                items.append({"name": r["name"], "kind": r["kind"]})
                inames.add(fold(r["name"]))
        a["items"] = items
        grown += 1
        added_total += len(add)

    tot = sum(len((d.get("activities") or {}).get("items_full") or [])
              for d in dests.values())
    print(f"Assign: grew {grown} destinations by {added_total} POIs; "
          f"items_full total would be {tot}")
    if dry_run:
        print("  --dry-run: NOT writing app_data.json")
        return
    data["meta"].setdefault("data_sources", {})["overture_places"] = {
        "provider": f"Overture Maps Foundation - places theme (release {RELEASE})",
        "license": "CDLA Permissive 2.0 / ODbL (per source); (c) Overture Maps contributors",
        "used_for": "maximal items_full sightseeing coverage across the full catalogue",
        "cap_per_dest": CAP_MERGED,
    }
    MASTER.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {MASTER}. Run `npm run data` to ship it.")


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "extract"
    if what == "extract":
        extract()
    elif what == "assign":
        assign("--dry-run" in sys.argv)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
