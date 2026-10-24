"""Shared helpers for the stay-price layer (schema v18, T530-T536).

Every script in pipeline/stays/ is run by path (``python pipeline/stays/x.py``)
and imports this module through the sys.path line at its top, the same way the
rest of pipeline/ imports pipeline_io.

The layer prices one bed for every destination, every bed type and every month:

  BED_TYPES   dorm (per bed), private (hostel or guesthouse room), hotel2..hotel5
              (per room), bnb_room (Airbnb private room), bnb_home (whole place,
              per capacity bucket).

Sources (all free; see Execution/P11/T530-T536-stay-prices.md):
  Xotelo (dated OTA prices, primary), Inside Airbnb (CC BY 4.0), Booking.com and
  Hostelworld (owner-run scrape twice a year: star class, dorm beds, gaps),
  OpenStreetMap + Wikidata (supply), Eurostat (HICP drift, regional nights).

Only medians per destination are ever published: no property names, photos,
links or single-hotel prices leave the state directory.
"""

import asyncio
import json
import math
import os
import sqlite3
import statistics
import sys
import time
import traceback
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
from pipeline_io import atomic_write_json  # noqa: E402

# State lives outside git. Locally: cache/stays. On GitHub Actions the workflow
# pulls it from R2 into the same folder and pushes it back after the run.
STATE = Path(os.environ.get("STAYS_STATE", ROOT / "cache" / "stays"))
OUT = Path(os.environ.get("STAYS_OUT", ROOT / "cache" / "stays" / "out"))
JOURNAL = STATE / "journal.sqlite"
# The owner's laptop scrape writes its own file, so it never races the Monday
# Actions run that writes journal.sqlite; build_stays reads both.
JOURNAL_SCRAPE = STATE / "journal_scrape.sqlite"

# The master is gitignored; the committed served copy carries the same ids and
# coordinates, so CI reads that one.
MASTER = ROOT / "app_data" / "app_data.json"
SERVED = ROOT / "continent-app" / "public" / "app_data.json"

BED_TYPES = ["dorm", "private", "hotel2", "hotel3", "hotel4", "hotel5",
             "bnb_room", "bnb_home"]
HOME_CAPS = [2, 4, 6, 8]

USER_AGENT = ("CartaStayPrices/1.0 (+https://carta-europetravel.com; "
              "hello@carta-europetravel.com)")


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today():
    return date.today()


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def median(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None


def load_destinations():
    """[{id, city, country, iso2, lat, lon, pop, settlement, cls}] with town coords.

    Airport-tier rows carry the airport in lat/lon and the town in
    city_lat/city_lon; beds sit in the town, so the town wins.
    """
    src = MASTER if MASTER.exists() else SERVED
    with open(src, encoding="utf-8") as f:
        data = json.load(f)
    out = []
    for d in data["destinations"].values():
        lat = d.get("city_lat") or d.get("lat")
        lon = d.get("city_lon") or d.get("lon")
        if lat is None or lon is None:
            continue
        g = d.get("geonames") or {}
        out.append({
            "id": d["id"], "city": d.get("city"), "country": d.get("country"),
            "iso2": d.get("iso2"), "lat": float(lat), "lon": float(lon),
            "pop": g.get("population") or 0, "settlement": g.get("settlement"),
            "cls": (d.get("place") or {}).get("class"), "tier": d.get("tier"),
        })
    return out


def footprint_km(dest):
    """Radius that still counts as 'in this town' for listings and hotels."""
    pop = dest.get("pop") or 0
    return max(2.0, min(12.0, 1.5 + math.sqrt(pop) / 90.0))


def priority(dest):
    """Crawl order: big and airport places first, so a partial run covers what
    most travellers look at."""
    return (0 if dest.get("tier") == "airport" else 1, -(dest.get("pop") or 0))


# ---------------------------------------------------------------- journal --- #

SCHEMA_SQL = """
create table if not exists obs (
  source text not null,          -- xotelo | booking | hostelworld
  dest_id text not null,
  prop_key text not null,        -- source-local id, never published
  kind text,                     -- hotel | hostel | guesthouse | apartment | other
  stars integer,                 -- 1..5 when known
  bed text,                      -- dorm | private | room (hotel room) | home
  adults integer not null,
  chk_in text not null,          -- YYYY-MM-DD
  nights integer not null,
  price_eur real not null,       -- per night, per room (dorm: per bed)
  ota text,                      -- xotelo: which OTA gave the median
  captured text not null         -- ISO timestamp of the observation
);
create index if not exists obs_dest on obs(dest_id, source);
create unique index if not exists obs_uniq
  on obs(source, dest_id, prop_key, bed, adults, chk_in, captured);
create table if not exists done (
  source text not null, task text not null, finished text not null,
  primary key (source, task)
);
create table if not exists blocks (
  source text primary key, until text not null, reason text
);
"""


def journal(path=None):
    path = Path(path or JOURNAL)
    path.parent.mkdir(parents=True, exist_ok=True)
    # WAL and a busy timeout: a build reading the journal while a harvest
    # writes it must wait, not fail (T536 hit "database is locked").
    con = sqlite3.connect(path, timeout=60)
    con.execute("pragma journal_mode=wal")
    con.executescript(SCHEMA_SQL)
    return con


# ------------------------------------------------- observation contract --- #
# Every stays source stores the same facts about a price (T643). The columns
# below were added after the first scrape; a row without them is "legacy" and
# build_stays fills them from the source's known behaviour (LEGACY in there).
#   currency          ISO code the page showed (EUR is the only one priced)
#   unit              bed | person | room | place: what one price buys
#   tax_included      1 the price includes taxes and charges, 0 it does not,
#                     NULL the source does not say (Xotelo, Hostelworld lists)
#   from_or_discount  1 a "from" or discounted price, 0 a plain price
#   price_text        the price as the page printed it (never published)
#   per_text          the page's "1 night, 2 adults" line (Booking)
CONTRACT_COLUMNS = [("currency", "text"), ("unit", "text"), ("tax_included", "integer"),
                    ("from_or_discount", "integer"), ("price_text", "text"),
                    ("per_text", "text")]
OBS_FIELDS = ["source", "dest_id", "prop_key", "kind", "stars", "bed", "adults", "chk_in",
              "nights", "price_eur", "ota", "captured"] + [c for c, _ in CONTRACT_COLUMNS]
UNITS = ("bed", "person", "room", "place")


def migrate_scrape(con):
    """Add the contract columns to an existing journal (additive only). Only
    the scrapers call this, when they start: a journal another process still
    writes with the old 12-column inserts must not change under it."""
    have = {r[1] for r in con.execute("pragma table_info(obs)")}
    for col, typ in CONTRACT_COLUMNS:
        if col not in have:
            try:
                con.execute(f"alter table obs add column {col} {typ}")
            except sqlite3.OperationalError as e:
                # Booking and Hostelworld start together (T646): the other
                # scraper may have added the column a moment ago.
                if "duplicate column" not in str(e):
                    raise
    con.commit()


def insert_obs(con, **row):
    """Insert one observation by column name (never by position)."""
    cols = [c for c in OBS_FIELDS if c in row]
    con.execute(f"insert or ignore into obs ({','.join(cols)}) values "
                f"({','.join('?' * len(cols))})", [row[c] for c in cols])


# ------------------------------------------------------------ robustness --- #
# T679: a scrape session never ends on one bad page. A page that fails (a
# timeout, a dropped or sleeping network, a crashed browser, an error nobody
# foresaw) is skipped without being marked done, so a later run retries it;
# each failure in a row waits longer; only a long outage ends the session, and
# the next hourly start picks it up. A block from the site is not a failure
# here: the scrapers stop on it on purpose.
WAITS = (30, 60, 120, 300, 600)        # seconds after the 1st, 2nd, ... failure in a row
GIVE_UP = 40                           # failures in a row (about 5 hours) end the session


class OutOfTime(Exception):
    """--max-hours reached (never Playwright's TimeoutError, which is a page's)."""


class Trouble:
    def __init__(self, source, waits=WAITS, give_up=GIVE_UP):
        self.source, self.waits, self.give_up = source, waits, give_up
        self.row = self.total = 0

    def ok(self):
        self.row = 0

    async def failed(self, err, where):
        """Log one failed page and wait; False when the session should end."""
        self.row += 1
        self.total += 1
        first = (str(err).strip().splitlines() or [type(err).__name__])[0][:160]
        print(f"{self.source}: page failed at {where} ({type(err).__name__}: {first}); "
              f"{self.row} in a row", flush=True)
        if self.row == 1 and not isinstance(err, (asyncio.TimeoutError, TimeoutError)):
            traceback.print_exc(limit=3)
        if self.row >= self.give_up:
            print(f"{self.source}: {self.row} failures in a row, ending this session; "
                  "the next start resumes", flush=True)
            return False
        await asyncio.sleep(self.waits[min(self.row - 1, len(self.waits) - 1)])
        return True


def browser_gone(page):
    """True when the page or its browser can no longer be used."""
    try:
        return page.is_closed() or not page.context.browser.is_connected()
    except Exception:
        return True


def mark_done(con, source, task):
    con.execute("insert or replace into done values (?,?,?)",
                (source, task, now_iso()))
    con.commit()


def is_done(con, source, task):
    return con.execute("select 1 from done where source=? and task=?",
                       (source, task)).fetchone() is not None


def blocked_until(con, source):
    row = con.execute("select until from blocks where source=?",
                      (source,)).fetchone()
    if row and row[0] > now_iso():
        return row[0]
    return None


def set_block(con, source, hours, reason):
    until = datetime.fromtimestamp(time.time() + hours * 3600, timezone.utc)
    con.execute("insert or replace into blocks values (?,?,?)",
                (source, until.strftime("%Y-%m-%dT%H:%M:%SZ"), reason))
    con.commit()


def read_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, data, compact=False):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    if compact:
        atomic_write_json(path, data, indent=None, separators=(",", ":"))
    else:
        atomic_write_json(path, data)
