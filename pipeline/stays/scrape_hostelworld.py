"""Hostelworld dorm and private-room prices, twice a year, run on the laptop.

Same rules as scrape_booking.py: one plain browser tab, 3 to 6 s between
pages, stop and resume tomorrow on a block, only medians are published.

Per destination that has hostels (OSM supply or Xotelo pool) and per probe
date (lean by default, T539: the January, March, May, August and October
Tuesdays, about 6,000 pages; --full for all 12 months): the city list page for 1 guest. Each card gives "Dorms from" (per
bed) and "Privates from" (the cheapest private for 1 guest; T530 checks
whether Hostelworld shows it per person or per room, build_stays reads
STATE/spike.json "hw_private_per_person").

Usage:
  python pipeline/stays/scrape_hostelworld.py --run 2027-03 --max-hours 3
  python pipeline/stays/scrape_hostelworld.py --run 2027-03 --only FLR --headed
"""

import argparse
import asyncio
import contextlib
import random
import sys
import time
import traceback
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (JOURNAL_SCRAPE, STATE, OutOfTime, Trouble, blocked_until,  # noqa: E402
                    browser_gone, insert_obs, journal, load_destinations, migrate_scrape,
                    now_iso, priority, read_json, set_block)
from booking.page import close_overlays, decline_cookies  # noqa: E402
from hostelworld.page import CARDS_JS, city_url, parse_card  # noqa: E402
from price_xotelo import probe_day  # noqa: E402
from scrape_booking import LEAN_MONTHS  # noqa: E402

SOURCE = "hostelworld"
CITY_MAP = STATE / "hostelworld_city.json"   # optional {dest_id: [city, country]}


def hw_private_unit():
    """'person' or 'room' from the B4 sample (scripts/hw_unit_sample.py writes
    it into STATE/spike.json), else None."""
    spike = read_json(STATE / "spike.json", {}) or {}
    if spike.get("hw_private_unit") in ("person", "room"):
        return spike["hw_private_unit"]
    pp = spike.get("hw_private_per_person")
    return None if pp is None else ("person" if pp else "room")


def has_hostels(d, supply, anchors):
    s = (supply.get(d["id"]) or {}).get("hostel", 0)
    a = any(x["kind"] == "hostel" for x in anchors.get(d["id"], []))
    return s > 0 or a


async def run(a):
    from playwright.async_api import async_playwright
    con = journal(JOURNAL_SCRAPE)
    migrate_scrape(con)
    private_unit = hw_private_unit()
    rejects = Counter()
    if blocked_until(con, SOURCE):
        print("Hostelworld blocked us earlier; try again tomorrow")
        return
    supply = (read_json(STATE / "supply.json", {}) or {}).get("dests", {})
    anchors = read_json(STATE / "xotelo_anchors.json", {}) or {}
    overrides = read_json(CITY_MAP, {}) or {}
    dests = [d for d in sorted(load_destinations(), key=priority)
             if has_hostels(d, supply, anchors) or d["id"] in overrides]
    only = {s for s in a.only.split(",") if s}
    if only:
        dests = [d for d in dests if d["id"] in only]
    start = date.fromisoformat(a.run + "-01")
    t0 = time.monotonic()
    pages = stored = 0
    trouble = Trouble(SOURCE)
    async with async_playwright() as p:
        browser = page = None

        async def fresh_page():
            nonlocal browser, page
            with contextlib.suppress(Exception):
                if browser:
                    await browser.close()
            browser = await p.chromium.launch(headless=not a.headed)
            page = await (await browser.new_context(locale="en-GB")).new_page()

        await fresh_page()
        try:
            for d in dests:
                city, country = overrides.get(d["id"]) or (d["city"], d["country"])
                months = {int(m) for m in a.months.split(",") if m}
                town_pages = 0
                for k in range(1, 13):
                    day = probe_day(start, k)
                    if months and day.month not in months:
                        continue
                    # Lean (T539): the same five months as the Booking run.
                    if not months and not a.full and day.month not in LEAN_MONTHS:
                        continue
                    task = f"{a.run}|{d['id']}|{day}"
                    if con.execute("select 1 from done where source=? and task=?",
                                   (SOURCE, task)).fetchone():
                        continue
                    if a.max_hours and time.monotonic() - t0 > a.max_hours * 3600:
                        raise OutOfTime
                    url = city_url(city, country, day.isoformat(),
                                   (day + timedelta(days=1)).isoformat())
                    # T679: one bad page (a timeout, a dropped network, a dead
                    # browser) is skipped, not marked done, and retried later.
                    try:
                        resp = await page.goto(url, wait_until="domcontentloaded",
                                               timeout=60000)
                        pages += 1
                        town_pages += 1
                        if resp and resp.status in (403, 429):
                            set_block(con, SOURCE, 20, f"{resp.status} at {d['id']}")
                            print("blocked: stopping, resume tomorrow")
                            return
                        await page.wait_for_timeout(2500)
                        await decline_cookies(page)
                        await close_overlays(page)
                        cards = [parse_card(c) for c in await page.evaluate(CARDS_JS)]
                        for c in cards:
                            for bed in ("dorm", "private"):
                                price, cur = c[bed], c[f"{bed}_currency"]
                                if not price or not 3 <= price <= 1500:
                                    continue
                                if cur != "EUR":
                                    rejects[f"currency {cur}"] += 1
                                    continue
                                # T643 contract. "From" prices; a list page does not
                                # say whether city tax is in (tax_included NULL). The
                                # private unit is the B4 sample's verdict, NULL until
                                # there is one (build_stays then fills or rejects it).
                                insert_obs(con, source=SOURCE, dest_id=d["id"], prop_key=c["key"],
                                           kind="hostel", stars=None, bed=bed, adults=1,
                                           chk_in=day.isoformat(), nights=1, price_eur=price,
                                           ota=None, captured=now_iso(), currency=cur,
                                           unit="bed" if bed == "dorm" else private_unit,
                                           tax_included=None, from_or_discount=1,
                                           price_text=c[f"{bed}_text"], per_text=None)
                                stored += 1
                        con.execute("insert or replace into done values (?,?,?)",
                                    (SOURCE, task, now_iso()))
                        con.commit()
                    except Exception as e:
                        con.rollback()
                        if not await trouble.failed(e, f"{d['id']} {day}"):
                            return
                        if browser_gone(page):
                            try:
                                await fresh_page()
                            except Exception as e2:
                                if not await trouble.failed(e2, "browser restart"):
                                    return
                        continue
                    trouble.ok()
                    if not cards and town_pages == 1:
                        print(f"{d['id']}: no cards at {url} (add hostelworld_city.json "
                              f"override?)")
                        break
                    await page.wait_for_timeout(int(random.uniform(3000, 6000)))
        except OutOfTime:
            print("max hours reached; the next run resumes here")
        finally:
            with contextlib.suppress(Exception):
                await browser.close()
    print(f"session: {pages} pages, {stored} prices, {trouble.total} pages failed, "
          f"rejected {dict(rejects)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--full", action="store_true", help="all 12 months (the pre-T539 plan)")
    ap.add_argument("--max-hours", type=float, default=3)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--months", default="")
    a = ap.parse_args()
    try:
        asyncio.run(run(a))
    except Exception:
        # T679: never a bare crash; the next start resumes from the journal.
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
