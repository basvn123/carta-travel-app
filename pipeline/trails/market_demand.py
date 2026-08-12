"""Market demand harvester: official visitor-night statistics per city.

City selection for the citytrip composer must rest on actual market demand,
so this script fills the market_demand staging table with nights spent in
tourist accommodation per city, from official statistics only:

  primary   Eurostat urban audit, dataset urb_ctour, indicator CR2001V
            "Total nights spent in tourist accommodation establishments"
            (reuse under CC BY 4.0). One figure per city per year; the
            latest non-null year per city is kept.
  context   Eurostat tour_occ_ninat country totals, stored as rows with
            city NULL so the city figures can be read against the size of
            each national market.
  fallback  where Eurostat city coverage is thin or stale (probed 2026-08-11:
            NO stops at 2011, AT at 2014, while CH has 2024 and FR 2022):
      NO    Statistics Norway StatBank table 12898, guest nights per
            municipality, annual (NLOD 2.0)
      AT    Statistik Austria OGD dataset OGD_touextsai_Tour_UA_1, monthly
            nights per Bundesland summed to calendar years (CC BY 4.0).
            Only Wien is stored as a city row: it is the one Bundesland
            that IS a city, the other Austrian cities keep their older
            Eurostat figures with the year on record.
      CH/FR BFS HESTA and INSEE remain named reserves; they are not
            implemented because Eurostat coverage for both is fresh, and
            dead fallback code would rot unexercised. If a future harvest
            logs CH or FR as stale, add them here.

Commercial rankings (Tripadvisor, GetYourGuide, ...) are ToS-closed and are
deliberately NOT touched, the same stance the trails vertical takes on
AllTrails.

Raw responses are cached under data/raw/market_demand/ with a manifest, in
the spirit of the src/ingestion collectors. Rows upsert on
(source, country, city_code), so a re-harvest refreshes figures in place.
Every source used here must keep a row in docs/tos/data_licenses.md.

The Statistik Austria portal's TLS chain is incomplete for certifi-style CA
bundles (curl fails on it); everything here therefore uses urllib with the
default ssl context, which on Windows also trusts the system store.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/market_demand.py               # harvest + report
    python pipeline/trails/market_demand.py --dry-run     # no DB writes
    python pipeline/trails/market_demand.py --report      # report from DB only
"""

import argparse
import csv
import io
import json
import re
import ssl
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import certifi

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402  (also puts pipeline/ on sys.path)

RAW_DIR = ROOT / "data" / "raw" / "market_demand"
DDL_FILE = ROOT / "tools" / "trailslab" / "initdb" / "05_citytrips.sql"

PILOTS = ["CH", "FR", "NO", "AT"]

# A country's Eurostat city coverage counts as usable without fallback when
# its freshest city figure is at most this many years old and at least this
# many cities carry one. Probed 2026-08-11: CH (2024, 10 cities) and FR
# (2022, 77) pass, NO (2011) and AT (2014) fail into their national offices.
FRESH_MAX_AGE_Y = 4
MIN_CITIES = 3

UA = ("carta-travel-app market-demand harvester "
      "(contact: data@carta-europetravel.com)")

EUROSTAT_BASE = ("https://ec.europa.eu/eurostat/api/dissemination/"
                 "statistics/1.0/data/")
EUROSTAT_CITY_QS = "urb_ctour?format=JSON&lang=EN&indic_ur=CR2001V"
EUROSTAT_COUNTRY_QS = ("tour_occ_ninat?format=JSON&lang=EN&c_resid=TOTAL"
                       "&unit=NR&nace_r2=I551-I553&sinceTimePeriod=2018"
                       + "".join(f"&geo={c}" for c in PILOTS))
SSB_TABLE_URL = "https://data.ssb.no/api/v0/en/table/12898"
AT_DATA_BASE = "https://data.statistik.gv.at/data/"
AT_DATASET = "OGD_touextsai_Tour_UA_1"
AT_WIEN_CODE = "W96-9"

LIC_EUROSTAT = "CC BY 4.0 (Eurostat)"
LIC_SSB = "NLOD 2.0 (Statistics Norway)"
LIC_AT = "CC BY 4.0 (Statistik Austria)"

SRC_EUROSTAT_CITY = "eurostat_urb_ctour"
SRC_EUROSTAT_COUNTRY = "eurostat_tour_occ_ninat"
SRC_SSB = "ssb_12898"
SRC_AT = "statat_tour_ua"

# Accent folding for city-name merges, same explicit table as popularity.py
# and compose_daytrips.py: NFKD alone misses o-slash and l-stroke.
_FOLD_MAP = str.maketrans({
    "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae",
    "ß": "ss", "ł": "l", "Ł": "l", "đ": "d",
    "Đ": "d", "œ": "oe", "Œ": "oe", "þ": "th",
    "Þ": "th", "ð": "d", "Ð": "d",
})


def fold(text):
    text = (text or "").translate(_FOLD_MAP)
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c)).lower().strip()


# Cross-source spellings of one city, folded. Eurostat labels Wien in
# German while Statistik Austria rows are stored as Vienna (the catalogue's
# name); keep this to the pilot cities that actually collide.
CITY_ALIASES = {"wien": "vienna", "geneve": "geneva", "zuerich": "zurich"}


def city_key(name):
    """Merge key for one city across sources.

    SSB ships bilingual municipality names ("Oslo - Oslove",
    "Trondheim - Traante") with spaced hyphens; the first part is the
    common name. Unspaced hyphens (Cannes-Antibes) are real and kept.
    """
    base = fold((name or "").split(" - ")[0])
    return CITY_ALIASES.get(base, base)


def clean_city(label):
    """Eurostat and portal labels -> a plain city name.

    Strips the '(greater city)' qualifier and any trailing '<AT13>'-style
    code; keeps the qualifier as a note flag for the caller.
    """
    greater = "greater city" in (label or "").lower()
    name = re.sub(r"\s*\((?:greater city|le grand \w+)\)\s*", " ", label or "",
                  flags=re.I)
    name = re.sub(r"\s*<[^>]+>\s*", " ", name).strip()
    return name, greater


# ---------------------------------------------------------------------------
# Fetch plumbing: urllib with a polite UA, retries, raw-file cache + manifest
# ---------------------------------------------------------------------------

def _ssl_context():
    """Windows system store PLUS the certifi bundle.

    Neither alone verifies every portal here: Eurostat's chain needs the
    certifi roots, while data.statistik.gv.at only verifies through the
    system store. The union covers both (probed 2026-08-11).
    """
    ctx = ssl.create_default_context()
    ctx.load_verify_locations(certifi.where())
    return ctx


_SSL_CTX = _ssl_context()


def fetch(url, data=None, timeout=90, retries=3):
    req = urllib.request.Request(
        url, data=data,
        headers={"User-Agent": UA,
                 **({"Content-Type": "application/json"} if data else {})})
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout,
                                        context=_SSL_CTX) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
            if attempt < retries - 1:
                time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"fetch failed after {retries} tries: {url} ({last})")


def save_raw(name, payload_bytes, url):
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / name).write_bytes(payload_bytes)
    manifest_path = RAW_DIR / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    manifest[name] = {
        "url": url,
        "bytes": len(payload_bytes),
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# JSON-stat 2.0 decoding (Eurostat dissemination API, SSB StatBank)
# ---------------------------------------------------------------------------

def jsonstat_cells(doc):
    """Yield (coords dict, value) per non-null cell of a JSON-stat 2.0 doc."""
    ids, size = doc["id"], doc["size"]
    divisors = []
    n = 1
    for s in reversed(size):
        divisors.append(n)
        n *= s
    divisors = list(reversed(divisors))
    inverse = []
    for dim_id in ids:
        idx = doc["dimension"][dim_id]["category"]["index"]
        if isinstance(idx, list):
            inverse.append({i: c for i, c in enumerate(idx)})
        else:
            inverse.append({i: c for c, i in idx.items()})
    values = doc["value"]
    items = (values.items() if isinstance(values, dict)
             else enumerate(values))
    for key, val in items:
        if val is None:
            continue
        k = int(key)
        coords = {}
        for pos, dim_id in enumerate(ids):
            coords[dim_id] = inverse[pos][(k // divisors[pos]) % size[pos]]
        yield coords, val


def dim_labels(doc, dim_id):
    return doc["dimension"][dim_id]["category"]["label"]


# ---------------------------------------------------------------------------
# Harvest: Eurostat cities (primary) and country context
# ---------------------------------------------------------------------------

def harvest_eurostat_cities(countries):
    """Latest visitor-night figure per urban audit city -> row dicts."""
    url = EUROSTAT_BASE + EUROSTAT_CITY_QS
    raw = fetch(url)
    save_raw("urb_ctour_CR2001V.json", raw, url)
    doc = json.loads(raw)
    labels = dim_labels(doc, "cities")

    latest = {}     # city code -> (year, nights)
    for coords, val in jsonstat_cells(doc):
        code = coords["cities"]
        country = code[:2]
        # The cities dimension ships country aggregates as bare ISO codes;
        # only real urban audit city codes (FR001C style) are cities.
        if country not in countries or len(code) == 2:
            continue
        year = int(coords["time"])
        if code not in latest or year > latest[code][0]:
            latest[code] = (year, int(val))

    rows = []
    for code, (year, nights) in latest.items():
        name, greater = clean_city(labels.get(code, code))
        rows.append({
            "country": code[:2], "city": name, "city_code": code,
            "nights": nights, "year": year,
            "source": SRC_EUROSTAT_CITY, "license": LIC_EUROSTAT,
            "note": ("urban audit greater city" if greater
                     else "urban audit city"),
        })
    return rows


def harvest_eurostat_country(countries):
    url = EUROSTAT_BASE + EUROSTAT_COUNTRY_QS
    raw = fetch(url)
    save_raw("tour_occ_ninat.json", raw, url)
    doc = json.loads(raw)
    latest = {}
    for coords, val in jsonstat_cells(doc):
        geo, year = coords["geo"], int(coords["time"])
        if geo not in countries:
            continue
        if geo not in latest or year > latest[geo][0]:
            latest[geo] = (year, int(val))
    return [{
        "country": geo, "city": None, "city_code": geo,
        "nights": nights, "year": year,
        "source": SRC_EUROSTAT_COUNTRY, "license": LIC_EUROSTAT,
        "note": "country total, tourist accommodation (NACE I55.1-55.3)",
    } for geo, (year, nights) in latest.items()]


# ---------------------------------------------------------------------------
# Fallback: Statistics Norway, guest nights per municipality (annual)
# ---------------------------------------------------------------------------

def harvest_ssb_norway():
    meta = json.loads(fetch(SSB_TABLE_URL, timeout=60))

    def total_code(var_code):
        for var in meta["variables"]:
            if var["code"] != var_code:
                continue
            for value, text in zip(var["values"], var["valueTexts"]):
                if text.strip().lower() in ("total", "totalt", "alle"):
                    return value
        raise RuntimeError(f"SSB table 12898: no Total value for {var_code}")

    # The accommodation dimension carries no Total value (only "hotels" and
    # "camping, holiday dwellings, youth hostels"), so both are requested
    # and summed per municipality below.
    query = json.dumps({
        "query": [
            {"code": "Region",
             "selection": {"filter": "all", "values": ["*"]}},
            {"code": "InnKvartering1",
             "selection": {"filter": "all", "values": ["*"]}},
            {"code": "Landkoder2",
             "selection": {"filter": "item", "values": [total_code("Landkoder2")]}},
            {"code": "Tid",
             "selection": {"filter": "top", "values": ["1"]}},
        ],
        "response": {"format": "json-stat2"},
    }).encode("utf-8")
    raw = fetch(SSB_TABLE_URL, data=query, timeout=120)
    save_raw("ssb_12898.json", raw, SSB_TABLE_URL)
    doc = json.loads(raw)
    labels = dim_labels(doc, "Region")

    summed = {}     # municipality code -> [nights, year]
    for coords, val in jsonstat_cells(doc):
        code = coords["Region"]
        # Municipality numbers are 4 digits; everything else in the Region
        # dimension (whole country 0N, counties, unknowns) is not a city.
        if not re.fullmatch(r"\d{4}", code) or int(val) <= 0:
            continue
        cell = summed.setdefault(code, [0, int(coords["Tid"])])
        cell[0] += int(val)

    rows = []
    for code, (nights, year) in summed.items():
        name = re.sub(r"\s*\([^)]*\)\s*$", "", labels.get(code, code)).strip()
        if not name:
            continue
        rows.append({
            "country": "NO", "city": name, "city_code": code,
            "nights": nights, "year": year,
            "source": SRC_SSB, "license": LIC_SSB,
            "note": ("guest nights per municipality, hotel plus camping, "
                     "holiday dwelling and hostel categories summed"),
        })
    return rows


# ---------------------------------------------------------------------------
# Fallback: Statistik Austria, monthly Bundesland nights -> calendar year.
# Only Wien is a city; the other Bundeslaender are stored nowhere because a
# state figure filed under a city name would be a lie.
# ---------------------------------------------------------------------------

def harvest_statistik_austria():
    url = AT_DATA_BASE + AT_DATASET + ".csv"
    raw = fetch(url, timeout=120)
    save_raw(f"{AT_DATASET}.csv", raw, url)

    per_year = {}       # (bundesland code, year) -> [nights, months seen]
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";")
    for rec in reader:
        month_code = rec.get("C-SDB_TIT-0") or ""
        land = rec.get("C-W96-0") or ""
        if len(month_code) != 6 or land != AT_WIEN_CODE:
            continue
        year = int(month_code[:4])
        nights = rec.get("F-UEB") or "0"
        cell = per_year.setdefault(year, [0, set()])
        cell[0] += int(float(nights))
        cell[1].add(month_code[4:])

    complete = {y: v[0] for y, v in per_year.items() if len(v[1]) == 12}
    if not complete:
        raise RuntimeError("Statistik Austria: no complete calendar year for Wien")
    year = max(complete)
    return [{
        "country": "AT", "city": "Vienna", "city_code": AT_WIEN_CODE,
        "nights": complete[year], "year": year,
        "source": SRC_AT, "license": LIC_AT,
        "note": ("Bundesland Wien equals the city; monthly nights summed "
                 "across all establishment types"),
    }]


# ---------------------------------------------------------------------------
# Storage and report
# ---------------------------------------------------------------------------

UPSERT_SQL = """
    INSERT INTO market_demand
        (country, city, city_code, nights, year, source, license, note)
    VALUES (%(country)s, %(city)s, %(city_code)s, %(nights)s, %(year)s,
            %(source)s, %(license)s, %(note)s)
    ON CONFLICT (source, country, city_code) DO UPDATE SET
        city = EXCLUDED.city, nights = EXCLUDED.nights,
        year = EXCLUDED.year, license = EXCLUDED.license,
        note = EXCLUDED.note, harvested_at = now()
"""


def ensure_schema(conn):
    with conn.cursor() as cur:
        cur.execute(DDL_FILE.read_text(encoding="utf-8"))
    conn.commit()    # the citytrip enum value only exists once this commits


def store(conn, rows):
    with conn.cursor() as cur:
        cur.executemany(UPSERT_SQL, rows)
    conn.commit()


def demand_ranking(conn, countries):
    """Freshest city figure per (country, folded city name), ranked.

    Sources overlap on purpose (Eurostat keeps an old Oslo figure next to
    SSB's current one); the newest year wins per city, larger nights break
    a same-year tie (city vs greater city).
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT country, city, city_code, nights, year, source, license, note
            FROM market_demand
            WHERE city IS NOT NULL AND country = ANY(%s)""", (countries,))
        rows = cur.fetchall()
    best = {}
    for country, city, code, nights, year, source, license_, note in rows:
        key = (country, city_key(city))
        row = {"country": country, "city": city, "city_code": code,
               "nights": int(nights), "year": year, "source": source,
               "license": license_, "note": note}
        cur_best = best.get(key)
        if (cur_best is None or (year, int(nights)) >
                (cur_best["year"], cur_best["nights"])):
            best[key] = row
    ranking = {}
    for country in countries:
        rows = [r for (c, _), r in best.items() if c == country]
        rows.sort(key=lambda r: -r["nights"])
        ranking[country] = rows
    return ranking


def print_report(conn, countries, this_year):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT country, nights, year, source
            FROM market_demand
            WHERE city IS NULL AND country = ANY(%s)
            ORDER BY country""", (countries,))
        context = cur.fetchall()
    if context:
        print("\ncountry context (Eurostat tour_occ_ninat, nights in tourist "
              "accommodation):")
        for country, nights, year, _ in context:
            print(f"  {country}  {int(nights):>13,}  ({year})")

    ranking = demand_ranking(conn, countries)
    for country in countries:
        rows = ranking.get(country) or []
        print(f"\n[{country}] {len(rows)} cities with official figures, top 8:")
        for i, r in enumerate(rows[:8], start=1):
            stale = "  STALE" if r["year"] < this_year - FRESH_MAX_AGE_Y else ""
            print(f"  {i}. {r['city']:<22} {r['nights']:>12,} nights "
                  f"({r['year']}, {r['source']}){stale}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(
        description="Harvest official visitor-night statistics per city "
                    "into the market_demand table.")
    ap.add_argument("--countries", default=",".join(PILOTS),
                    help=f"comma-separated ISO codes (default {','.join(PILOTS)})")
    ap.add_argument("--dry-run", action="store_true",
                    help="harvest and print only, no DB writes")
    ap.add_argument("--report", action="store_true",
                    help="print the ranking from the DB, no harvesting")
    args = ap.parse_args()
    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    this_year = datetime.now(timezone.utc).year

    conn = connect()
    try:
        ensure_schema(conn)
        if args.report:
            print_report(conn, countries, this_year)
            return

        rows = harvest_eurostat_cities(countries)
        by_country = {}
        for r in rows:
            by_country.setdefault(r["country"], []).append(r)
        for country in countries:
            got = by_country.get(country, [])
            freshest = max((r["year"] for r in got), default=None)
            print(f"{country}: Eurostat urb_ctour has {len(got)} cities, "
                  f"freshest {freshest}")

        rows += harvest_eurostat_country(countries)

        # National fallbacks, only where the primary is thin or stale.
        for country, harvest in (("NO", harvest_ssb_norway),
                                 ("AT", harvest_statistik_austria)):
            if country not in countries:
                continue
            got = by_country.get(country, [])
            freshest = max((r["year"] for r in got), default=0)
            if len(got) >= MIN_CITIES and freshest >= this_year - FRESH_MAX_AGE_Y:
                print(f"{country}: Eurostat coverage is fresh, "
                      f"skipping the national fallback")
                continue
            extra = harvest()
            print(f"{country}: national fallback added {len(extra)} rows "
                  f"({extra[0]['source']}, {extra[0]['year']})")
            rows += extra

        if args.dry_run:
            print(f"\ndry run: {len(rows)} rows harvested, nothing written")
        else:
            store(conn, rows)
            print(f"\nstored {len(rows)} rows into market_demand")
        print_report(conn, countries, this_year)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
