"""Which flight routes exist between Carta's airports (T512).

Tier: Monthly

Builds data/flights/_routes.json, the route list the flight sweep Worker
(continent-app/workers/flight-sweep) searches. Source: Eurostat's airport-pair
tables avia_par_{cc} (monthly commercial passenger departures per airport
pair, CC BY 4.0), with OurAirports (public domain) to turn ICAO codes into
IATA codes.

Rules
  - A month counts for a pair when it had at least MIN_FLIGHTS departures.
  - A pair is kept when it counts in at least MIN_MONTHS of the latest twelve
    months a country reported, so one-off charters drop out but a summer-only
    route stays, with its months.
  - The return direction is filled in: the UK stopped reporting after 2019
    and some files fail to download, but a route almost always runs both ways.
  - Only pairs with both ends among Carta's airports (home airports plus
    destination anchors) are written.
  - A country file whose latest month is more than a year behind the others
    is ignored as a reporter (it still appears as a partner).

Output
  {"built": ISO, "through": "YYYY-MM", "reporters": [...], "airports": {IATA: [lat, lon]},
   "routes": {"BRU": {"BCN": 4095, ...}, ...}}
  The number per route is a bitmask of active calendar months (bit 0 =
  January), which the sweep uses to skip a route in its off season.

Usage
  python -I pipeline/flights/build_routes.py              download and build
  python -I pipeline/flights/build_routes.py --offline    reuse downloads
  python -I pipeline/flights/build_routes.py --upload     also put it on R2
"""
import csv
import gzip
import io
import json
import re
import subprocess
import sys
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "eurostat_routes"
OUT = ROOT / "data" / "flights" / "_routes.json"
APP_PUBLIC = ROOT / "continent-app" / "public" / "app_data.json"
MASTER = ROOT / "app_data" / "app_data.json"

EUROSTAT = ("https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/"
            "avia_par_{cc}?format=TSV&compressed=true")
OURAIRPORTS = "https://davidmegginson.github.io/ourairports-data/airports.csv"
REPORTERS = ("at be bg ch cy de dk ee el es fi fr hr hu ie is it lt lu lv me mk "
             "mt nl no pl pt ro rs se si sk tr uk ba").split()
MIN_FLIGHTS = 4
MIN_MONTHS = 2
R2_KEY = "carta/data/flights/_routes.json"

NUM = re.compile(r"^\s*([0-9.]+)")
MONTH = re.compile(r"^\d{4}-\d{2}$")


def log(msg):
    print(f"[routes] {msg}", flush=True)


def fetch(url, dest, offline):
    if offline and dest.exists():
        return dest.read_bytes()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                body = r.read()
            dest.write_bytes(body)
            return body
        except OSError as e:
            log(f"retry {attempt + 1} for {url}: {e}")
            time.sleep(5 * (attempt + 1))
    return dest.read_bytes() if dest.exists() else b""


def icao_to_iata(offline):
    """ICAO -> IATA, and IATA -> [lat, lon] for the discovery pass's distance rule."""
    body = fetch(OURAIRPORTS, RAW / "ourairports.csv", offline)
    out, where = {}, {}
    for r in csv.DictReader(io.StringIO(body.decode("utf-8"))):
        code = r["icao_code"] or r["gps_code"] or r["ident"]
        if r["iata_code"] and code:
            out[code] = r["iata_code"]
            try:
                where.setdefault(r["iata_code"], [round(float(r["latitude_deg"]), 3),
                                                  round(float(r["longitude_deg"]), 3)])
            except ValueError:
                pass
    return out, where


def read_reporter(body):
    """Yield (from_icao, to_icao, {YYYY-MM: flights}) and the latest month."""
    rows, latest = [], None
    with gzip.open(io.BytesIO(body), "rt", encoding="utf-8") as f:
        head = f.readline().rstrip("\n").split("\t")
        cols = [(i, h.strip()) for i, h in enumerate(head) if MONTH.match(h.strip())]
        if not cols:
            return rows, None
        latest = max(h for _, h in cols)
        for line in f:
            parts = line.rstrip("\n").split("\t")
            key = parts[0].split(",")
            if key[:3] != ["M", "FLIGHT", "CAF_PAS_DEP"]:
                continue
            pair = key[3].split("_")
            if len(pair) != 4 or pair[1] == pair[3]:
                continue
            months = {}
            for i, h in cols:
                m = NUM.match(parts[i]) if i < len(parts) else None
                if m and float(m.group(1)) >= MIN_FLIGHTS:
                    months[h] = float(m.group(1))
            if months:
                rows.append((pair[1], pair[3], months))
    return rows, latest


def last_twelve(end):
    y, m = map(int, end.split("-"))
    out = []
    for _ in range(12):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return set(out)


def carta_airports():
    codes = set()
    if APP_PUBLIC.exists():
        codes |= set(json.loads(APP_PUBLIC.read_text(encoding="utf-8"))["meta"].get("origins", {}))
    if MASTER.exists():
        dests = json.loads(MASTER.read_text(encoding="utf-8"))["destinations"]
        for d in (dests.values() if isinstance(dests, dict) else dests):
            code = d.get("anchor_airport") or d.get("iata")
            if code:
                codes.add(code)
    return codes


def main(argv):
    offline = "--offline" in argv
    RAW.mkdir(parents=True, exist_ok=True)
    iata, where = icao_to_iata(offline)
    carta = carta_airports()
    log(f"{len(iata)} ICAO codes with IATA, {len(carta)} Carta airports")

    per_reporter, latest = {}, {}
    for cc in REPORTERS:
        body = fetch(EUROSTAT.format(cc=cc), RAW / f"{cc}.tsv.gz", offline)
        try:
            rows, end = read_reporter(body)
        except (OSError, EOFError):
            log(f"{cc}: unreadable, skipped")
            continue
        if end:
            per_reporter[cc], latest[cc] = rows, end
    through = sorted(latest.values())[len(latest) // 2]
    floor = f"{int(through[:4]) - 1}{through[4:]}"
    stale = sorted(cc for cc, end in latest.items() if end < floor)
    log(f"data through {through}; reporters ignored as stale: {stale}")

    months = defaultdict(int)  # (from_iata, to_iata) -> bitmask
    for cc, rows in per_reporter.items():
        if cc in stale:
            continue
        window = last_twelve(latest[cc])
        for a, b, flown in rows:
            fa, fb = iata.get(a), iata.get(b)
            if not fa or not fb or fa == fb:
                continue
            mask = 0
            for ym in flown:
                if ym in window:
                    mask |= 1 << (int(ym[5:]) - 1)
            if bin(mask).count("1") >= MIN_MONTHS:
                months[(fa, fb)] |= mask
    for (a, b), mask in list(months.items()):
        months[(b, a)] |= mask  # the way back

    routes = defaultdict(dict)
    for (a, b), mask in sorted(months.items()):
        if a in carta and b in carta:
            routes[a][b] = mask
    n = sum(len(v) for v in routes.values())
    out = {
        "built": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "through": through,
        "reporters": sorted(c for c in per_reporter if c not in stale),
        "source": "Eurostat avia_par (CC BY 4.0), OurAirports (public domain)",
        "routes": dict(sorted(routes.items())),
        # Every Carta airport with a position, served or not, so the discovery
        # pass can look for routes Eurostat does not know yet.
        "airports": {c: where[c] for c in sorted(carta) if c in where},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    log(f"{n} routes from {len(routes)} airports -> {OUT.relative_to(ROOT)}")

    if "--upload" in argv:
        subprocess.run(["npx", "wrangler", "r2", "object", "put", R2_KEY, "--file", str(OUT),
                        "--content-type", "application/json", "--remote"],
                       cwd=ROOT / "continent-app", check=True, shell=sys.platform == "win32")
        log(f"uploaded to r2://{R2_KEY}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
