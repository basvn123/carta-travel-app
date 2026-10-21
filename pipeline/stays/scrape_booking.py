"""Booking.com list prices, twice a year, run by the owner on the laptop.

Owner decision 2026-10-21: scraped twice a year (March and September), for
star class, dorm beds and the towns Xotelo does not reach. Xotelo is the
primary dated source; this run fixes star class and fills gaps.

How it behaves (and what it will not do):
  * one plain Playwright Chromium, one tab, 3 to 6 s between pages
  * the owner's own connection; no proxies, no stealth or fingerprint patches,
    no CAPTCHA solving
  * a 403/429 or a challenge page stops the source and records a block for 20
    hours; the next night resumes from the journal
  * cookie banner declined
  * only medians per destination are published (build_stays); property names
    and links stay in the local journal

Per destination and probe date (see probe_dates): one popularity-ordered search
(2 adults, 25 to 50 cards with price, star class and unit name) plus one hostel
search for 1 adult (dorm bed price). On the first probe date only, a search per
missing star class.

Usage:
  python pipeline/stays/scrape_booking.py --run 2027-03 --max-hours 6
  python pipeline/stays/scrape_booking.py --run 2027-03 --only FLR,PMI --headed
"""

import argparse
import asyncio
import random
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (JOURNAL_SCRAPE, blocked_until, journal, load_destinations, now_iso,  # noqa: E402
                    priority, read_json, set_block, STATE)
from booking.page import (classify, close_overlays, decline_cookies,  # noqa: E402
                          looks_blocked, parse_money, prop_key, read_cards)
from booking.urls import search_url  # noqa: E402
from price_xotelo import peak_days, probe_day  # noqa: E402

SOURCE = "booking"
DEST_MAP = STATE / "booking_dest.json"   # optional {dest_id: "search text"} overrides


def probe_dates(start):
    """19 probes: 12 monthly Tuesdays, 4 weekend Fridays (Feb, May, Aug, Nov),
    the peak nights (14 Aug, 28 Dec, Easter Saturday)."""
    out = [("month", probe_day(start, k)) for k in range(1, 13)]
    for k in range(1, 13):
        d = probe_day(start, k)
        if d.month in (2, 5, 8, 11):
            out.append(("weekend", d + timedelta(days=3)))
    out += [("peak", d) for d in peak_days(start)]
    return out


def search_text(d, overrides):
    return overrides.get(d["id"]) or f"{d['city']}, {d['country']}"


async def visit(page, url):
    resp = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(1500)
    if await looks_blocked(page, resp.status if resp else None):
        return None
    await decline_cookies(page)
    await close_overlays(page)
    return await read_cards(page)


def store(con, dest_id, cards, chk_in, adults, forced_kind=None):
    n = 0
    for c in cards:
        price = parse_money(c.get("price"))
        key = prop_key(c.get("href"))
        if not price or not key or not 5 <= price <= 5000:
            continue
        kind, bed, stars = classify(c, forced_kind)
        if forced_kind == "hostel":
            # A hostel card's unit names the bed ("Bed in 6-Bed Mixed Dormitory")
            # or a room ("Double Room with Private Bathroom").
            bed = "dorm" if bed == "dorm" else "private"
        con.execute("insert or ignore into obs values (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (SOURCE, dest_id, key, kind, stars, bed, adults, chk_in, 1,
                     price, None, now_iso()))
        n += 1
    return n


async def run(a):
    from playwright.async_api import async_playwright
    con = journal(JOURNAL_SCRAPE)
    until = blocked_until(con, SOURCE)
    if until:
        print(f"Booking blocked us earlier; resuming after {until}")
        return
    dests = sorted(load_destinations(), key=priority)
    only = {s for s in a.only.split(",") if s}
    if only:
        dests = [d for d in dests if d["id"] in only]
    overrides = read_json(DEST_MAP, {}) or {}
    start = date.fromisoformat(a.run + "-01")
    probes = probe_dates(start)
    months = {int(m) for m in a.months.split(",") if m}
    if months:
        probes = [(w, d) for w, d in probes if w == "month" and d.month in months]
    t0 = time.monotonic()
    pages = stored = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not a.headed)
        ctx = await browser.new_context(locale="en-GB", viewport={"width": 1366, "height": 900})
        page = await ctx.new_page()
        try:
            for d in dests:
                ss = search_text(d, overrides)
                for i, (what, day) in enumerate(probes):
                    out = (day + timedelta(days=1)).isoformat()
                    jobs = [("all", None, 2, None)]
                    if what == "month":
                        jobs.append(("hostel", "hostel", 1, None))
                    if i == 0:
                        jobs += [(f"class{s}", "hotel", 2, s) for s in (2, 3, 4, 5)]
                    for name, kind, adults, stars in jobs:
                        task = f"{a.run}|{d['id']}|{day}|{name}"
                        if con.execute("select 1 from done where source=? and task=?",
                                       (SOURCE, task)).fetchone():
                            continue
                        if a.max_hours and time.monotonic() - t0 > a.max_hours * 3600:
                            raise TimeoutError
                        url = search_url(ss, day.isoformat(), out, adults=adults,
                                         kind=kind, stars=stars)
                        cards = await visit(page, url)
                        pages += 1
                        if cards is None:
                            set_block(con, SOURCE, 20, f"challenge at {d['id']} {day}")
                            print(f"blocked at {d['id']} {day}: stopping, "
                                  f"resume tomorrow")
                            return
                        stored += store(con, d["id"], cards, day.isoformat(), adults,
                                        forced_kind=kind if kind == "hostel" else None)
                        con.execute("insert or replace into done values (?,?,?)",
                                    (SOURCE, task, now_iso()))
                        con.commit()
                        await page.wait_for_timeout(int(random.uniform(3000, 6000)))
                print(f"{d['id']}: {pages} pages, {stored} prices, "
                      f"{(time.monotonic() - t0) / 3600:.1f} h", flush=True)
        except TimeoutError:
            print("max hours reached; tomorrow's run resumes here")
        finally:
            await browser.close()
    left = sum(1 for d in dests for _ in probes) * 2
    print(f"session: {pages} pages, {stored} prices; about {left} page slots in "
          f"the full plan")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, help="run tag YYYY-MM, e.g. 2027-03")
    ap.add_argument("--only", default="")
    ap.add_argument("--max-hours", type=float, default=6)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--months", default="", help="spike: only these monthly probes, e.g. 2,8")
    asyncio.run(run(ap.parse_args()))


if __name__ == "__main__":
    main()
