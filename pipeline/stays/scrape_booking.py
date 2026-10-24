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
star class that OSM says the town has but the first page did not show.

Lean by default (T539): 6 probe dates (January, March, May, August and October
Tuesdays, one May Friday), towns with nothing to book on OSM skipped, the hostel
search only where OSM or the Xotelo pool shows a hostel. About 28,000 pages,
some 55 hours nonstop. build_stays fills the other months from the curve the
measured ones give, shaped by Eurostat's nights. --full keeps the 19 dates.

Usage:
  python pipeline/stays/scrape_booking.py --run 2027-03 --max-hours 6
  python pipeline/stays/scrape_booking.py --run 2027-03            (no cap)
  python pipeline/stays/scrape_booking.py --run 2027-03 --only FLR,PMI --headed
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
from common import (JOURNAL_SCRAPE, OutOfTime, Trouble, blocked_until, browser_gone,  # noqa: E402
                    insert_obs, journal, load_destinations, migrate_scrape, now_iso,
                    priority, read_json, set_block, STATE)
from booking.page import (card_price, classify, close_overlays, decline_cookies,  # noqa: E402
                          looks_blocked, per_ok, prop_key, read_cards, search_dropped)
from booking.urls import search_url  # noqa: E402
from price_xotelo import peak_days, probe_day  # noqa: E402

SOURCE = "booking"
DEST_MAP = STATE / "booking_dest.json"   # optional {dest_id: "search text"} overrides


LEAN_MONTHS = (1, 3, 5, 8, 10)     # low, shoulder, spring, high summer, autumn
LEAN_WEEKEND = 5                  # one Friday, for the weekend factor


def probe_dates(start, full=False):
    """full: 19 probes, 12 monthly Tuesdays, 4 weekend Fridays (Feb, May, Aug,
    Nov) and the peak nights (14 Aug, 28 Dec, Easter Saturday).
    lean (default): 6 probes, the LEAN_MONTHS Tuesdays and one May Friday."""
    months = range(1, 13)
    out = [("month", probe_day(start, k)) for k in months]
    if not full:
        out = [p for p in out if p[1].month in LEAN_MONTHS]
    for k in months:
        d = probe_day(start, k)
        if d.month in ((2, 5, 8, 11) if full else (LEAN_WEEKEND,)):
            out.append(("weekend", d + timedelta(days=3)))
    if full:
        out += [("peak", d) for d in peak_days(start)]
    return out


def bookable(d, supply):
    """(anything to book, hostels) from the OSM supply counts. A town missing
    from the supply file is searched in full: unknown is not empty."""
    s = supply.get(d["id"])
    if s is None:
        return True, True
    return any(v for k, v in s.items()), bool(s.get("hostel"))


def stars_seen(con, dest_id, day):
    return {r[0] for r in con.execute(
        "select distinct stars from obs where source=? and dest_id=? and chk_in=? and stars is not null",
        (SOURCE, dest_id, day))}


def search_text(d, overrides):
    return overrides.get(d["id"]) or f"{d['city']}, {d['country']}"


async def visit(page, url):
    """(cards, retried): cards None when Booking blocked the page."""
    for attempt in range(2):
        resp = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1500)
        if not await looks_blocked(page, resp.status if resp else None):
            break
        # Booking now and then drops the search on a page it serves a minute
        # later (T633): one plain retry before the night's run stops.
        if attempt or not search_dropped(page.url):
            return None, attempt > 0
        await page.wait_for_timeout(60000)
    await decline_cookies(page)
    await close_overlays(page)
    return await read_cards(page), attempt > 0


def store(con, dest_id, cards, chk_in, adults, forced_kind=None, rejects=None):
    """Store the cards that meet the contract (T643); count the rest by reason
    in `rejects`. Only EUR, only the searched '1 night, N adults', price with
    taxes (B3): a card without a tax line is kept with tax_included 0."""
    n = 0
    rejects = rejects if rejects is not None else Counter()
    for c in cards:
        key = prop_key(c.get("href"))
        cp = card_price(c)
        if not key or not cp:
            rejects["no price or link"] += 1
            continue
        if cp["currency"] != "EUR":
            rejects[f"currency {cp['currency']}"] += 1
            continue
        if not per_ok(cp["per_text"], adults):
            rejects["not 1 night for the searched adults"] += 1
            continue
        if not 5 <= cp["price"] <= 5000:
            rejects["price outside 5 to 5000"] += 1
            continue
        kind, bed, stars = classify(c, forced_kind)
        if forced_kind == "hostel":
            # A hostel card's unit names the bed ("Bed in 6-Bed Mixed Dormitory")
            # or a room ("Double Room with Private Bathroom").
            bed = "dorm" if bed == "dorm" else "private"
        insert_obs(con, source=SOURCE, dest_id=dest_id, prop_key=key, kind=kind,
                   stars=stars, bed=bed, adults=adults, chk_in=chk_in, nights=1,
                   price_eur=cp["price"], ota=None, captured=now_iso(),
                   currency=cp["currency"], unit="bed" if bed == "dorm" else "room",
                   tax_included=cp["tax_included"],
                   from_or_discount=cp["from_or_discount"],
                   price_text=cp["price_text"], per_text=cp["per_text"])
        n += 1
    return n


def hostelworld_covers(con, d, supply, anchors):
    """Hostelworld prices this town's hostels (its own plan: OSM hostels or a
    Xotelo hostel anchor), unless its city page already came back empty.
    Booking's hostel search is then skipped (T643): Hostelworld reads dorms
    and privates in a fraction of the time."""
    planned = (supply.get(d["id"]) or {}).get("hostel", 0) > 0 or \
        any(x.get("kind") == "hostel" for x in anchors.get(d["id"], []))
    if not planned:
        return False
    tried = con.execute("select count(*) from done where source='hostelworld' and task like ?",
                        (f"%|{d['id']}|%",)).fetchone()[0]
    found = con.execute("select count(*) from obs where source='hostelworld' and dest_id=?",
                        (d["id"],)).fetchone()[0]
    return not (tried and not found)


async def run(a):
    from playwright.async_api import async_playwright
    con = journal(JOURNAL_SCRAPE)
    migrate_scrape(con)
    until = blocked_until(con, SOURCE)
    if until:
        print(f"Booking blocked us earlier; resuming after {until}")
        return
    dests = sorted(load_destinations(), key=priority)
    only = {s for s in a.only.split(",") if s}
    if only:
        dests = [d for d in dests if d["id"] in only]
    overrides = read_json(DEST_MAP, {}) or {}
    supply = (read_json(STATE / "supply.json", {}) or {}).get("dests", {})
    anchors = read_json(STATE / "xotelo_anchors.json", {}) or {}
    if not a.full:
        dests = [d for d in dests if bookable(d, supply)[0] or d["id"] in overrides]
    start = date.fromisoformat(a.run + "-01")
    probes = probe_dates(start, full=a.full)
    months = {int(m) for m in a.months.split(",") if m}
    if months:
        probes = [(w, d) for w, d in probes if w == "month" and d.month in months]
    t0 = time.monotonic()
    pages = stored = retries = 0
    page_s = 0.0                      # seconds spent loading and reading pages
    rejects = Counter()
    trouble = Trouble(SOURCE)
    async with async_playwright() as p:
        browser = page = None

        async def fresh_page():
            # A headed window is placed off-screen (T634): Booking serves it like any
            # browser, and the owner's screen stays free. --show puts it on screen.
            nonlocal browser, page
            with contextlib.suppress(Exception):
                if browser:
                    await browser.close()
            browser = await p.chromium.launch(
                headless=not a.headed,
                args=[] if a.show or not a.headed else ["--window-position=-32000,-32000"])
            ctx = await browser.new_context(locale="en-GB", viewport={"width": 1366, "height": 900})
            page = await ctx.new_page()

        await fresh_page()
        try:
            for d in dests:
                ss = search_text(d, overrides)
                _, hostels = bookable(d, supply)
                sup = supply.get(d["id"])
                for i, (what, day) in enumerate(probes):
                    out = (day + timedelta(days=1)).isoformat()
                    jobs = [("all", None, 2, None)]
                    if what == "month" and (hostels or a.full) and (
                            a.full or not hostelworld_covers(con, d, supply, anchors)):
                        jobs.append(("hostel", "hostel", 1, None))
                    if i == 0:
                        jobs += [(f"class{s}", "hotel", 2, s) for s in (2, 3, 4, 5)]
                    for name, kind, adults, stars in jobs:
                        # A star search only when the town has that class (OSM)
                        # and the popularity page did not already show one.
                        if stars and not a.full and (
                                (sup is not None and not sup.get(f"hotel{stars}"))
                                or stars in stars_seen(con, d["id"], day.isoformat())):
                            continue
                        task = f"{a.run}|{d['id']}|{day}|{name}"
                        if con.execute("select 1 from done where source=? and task=?",
                                       (SOURCE, task)).fetchone():
                            continue
                        if a.max_hours and time.monotonic() - t0 > a.max_hours * 3600:
                            raise OutOfTime
                        url = search_url(ss, day.isoformat(), out, adults=adults,
                                         kind=kind, stars=stars)
                        # T679: one bad page (a timeout, a dropped network, a dead
                        # browser) is skipped, not marked done, and retried later.
                        try:
                            tp = time.monotonic()
                            cards, retried = await visit(page, url)
                            page_s += time.monotonic() - tp
                            pages += 1
                            retries += retried
                        except Exception as e:
                            if not await trouble.failed(e, f"{d['id']} {day} {name}"):
                                return
                            if browser_gone(page):
                                try:
                                    await fresh_page()
                                except Exception as e2:
                                    if not await trouble.failed(e2, "browser restart"):
                                        return
                            continue
                        trouble.ok()
                        if cards is None:
                            set_block(con, SOURCE, 20, f"challenge at {d['id']} {day}")
                            print(f"blocked at {d['id']} {day}: stopping, "
                                  f"resume tomorrow"
                                  + ("" if a.headed else
                                     " (Booking refuses headless Chrome: run with --headed)"))
                            return
                        try:
                            stored += store(con, d["id"], cards, day.isoformat(), adults,
                                            forced_kind=kind if kind == "hostel" else None,
                                            rejects=rejects)
                            con.execute("insert or replace into done values (?,?,?)",
                                        (SOURCE, task, now_iso()))
                            con.commit()
                        except Exception as e:
                            con.rollback()
                            if not await trouble.failed(e, f"{d['id']} {day} {name} (journal)"):
                                return
                            continue
                        await page.wait_for_timeout(int(random.uniform(3000, 6000)))
                print(f"{d['id']}: {pages} pages, {stored} prices, "
                      f"{(time.monotonic() - t0) / 3600:.1f} h, "
                      f"{page_s / max(pages, 1):.1f} s per page read, "
                      f"{(time.monotonic() - t0) / max(pages, 1):.1f} s per page in all, "
                      f"{retries} retried, rejected {dict(rejects)}", flush=True)
        except OutOfTime:
            print("max hours reached; the next run resumes here")
        finally:
            with contextlib.suppress(Exception):
                await browser.close()
    left = sum(1 for d in dests for _ in probes) * 2
    print(f"session: {pages} pages, {stored} prices, {trouble.total} pages failed; "
          f"at most {left} page slots in "
          f"this plan ({len(dests)} towns, {len(probes)} dates)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, help="run tag YYYY-MM, e.g. 2027-03")
    ap.add_argument("--only", default="")
    ap.add_argument("--full", action="store_true",
                    help="19 dates and every town (the pre-T539 plan)")
    ap.add_argument("--max-hours", type=float, default=6)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--show", action="store_true", help="with --headed: window on screen")
    ap.add_argument("--months", default="", help="spike: only these monthly probes, e.g. 2,8")
    a = ap.parse_args()
    try:
        asyncio.run(run(a))
    except Exception:
        # T679: never a bare crash; the next start resumes from the journal.
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
