"""B4: does Hostelworld show a private room's price per person or per room? (T643)

Runs on its own, no Claude needed: 10 cities in 10 countries, each city list
page loaded for 1 guest and for 2 guests (20 pages, one headless tab, 3 to 6 s
apart, euros forced in the URL). Two signals per hostel that shows a private:

  r1  "Privates From" for 2 guests / for 1 guest. A per-person price falls
      toward half when two share; a per-room price stays or rises (a twin
      instead of a single).
  r2  "Privates From" / "Dorms From", both for 2 guests. Per person in a
      private is about 1.2 to 2 dorm beds; a whole room for two is 2.5 or more.

Verdict: person when r1 <= 0.8, or r1 is about 1 and r2 < 2; room when r1 >=
0.95 and r2 >= 2; otherwise unclear (an owner row, never a guess). Writes
cache/stays/hw_unit_sample.json and .md. With --apply and a clear verdict it
sets hw_private_unit and hw_private_per_person in cache/stays/spike.json.

Usage:  python scripts/hw_unit_sample.py [--apply]
"""

import argparse
import asyncio
import json
import random
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "stays"))
from common import STATE, now_iso, read_json, write_json  # noqa: E402
from booking.page import decline_cookies  # noqa: E402
from hostelworld.page import CARDS_JS, city_url, parse_card  # noqa: E402

CITIES = [("Lisbon", "Portugal"), ("Barcelona", "Spain"), ("Paris", "France"),
          ("Berlin", "Germany"), ("Amsterdam", "Netherlands"), ("Prague", "Czechia"),
          ("Budapest", "Hungary"), ("Rome", "Italy"), ("Athens", "Greece"),
          ("Edinburgh", "United Kingdom")]
OUT = STATE / "hw_unit_sample"


def verdict(r1, r2):
    if r1 is None:
        return "unclear"
    if r1 <= 0.8 or (r1 < 0.95 and r2 is not None and r2 < 2):
        return "person"
    if r1 >= 0.95 and r2 is not None and r2 >= 2:
        return "room"
    if r1 >= 0.95 and r2 is not None and r2 < 2:
        return "person"           # same price for 2 and well under two dorm beds
    return "unclear"


async def sample():
    from playwright.async_api import async_playwright
    day = date.today() + timedelta(days=60)
    rows, currencies = [], set()
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        page = await (await b.new_context(locale="en-GB")).new_page()
        for city, country in CITIES:
            seen = {}
            for g in (1, 2):
                await page.goto(city_url(city, country, day.isoformat(),
                                         (day + timedelta(days=1)).isoformat(), guests=g),
                                wait_until="domcontentloaded", timeout=60000)
                await page.wait_for_timeout(3000)
                await decline_cookies(page)
                for c in (parse_card(x) for x in await page.evaluate(CARDS_JS)):
                    currencies.update(x for x in (c["dorm_currency"], c["private_currency"]) if x)
                    seen.setdefault(c["key"], {})[g] = c
                await page.wait_for_timeout(int(random.uniform(3000, 6000)))
            for key, by_g in seen.items():
                a, z = by_g.get(1), by_g.get(2)
                if a and z and a["private"] and z["private"]:
                    rows.append({"city": city, "key": key, "p1": a["private"], "p2": z["private"],
                                 "d2": z["dorm"], "text1": a["private_text"],
                                 "text2": z["private_text"]})
            print(f"{city}: {sum(1 for r in rows if r['city'] == city)} hostels with a private "
                  f"for 1 and 2 guests", flush=True)
        await b.close()
    return rows, sorted(currencies)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    rows, currencies = asyncio.run(sample())
    r1s = [r["p2"] / r["p1"] for r in rows]
    r2s = [r["p2"] / r["d2"] for r in rows if r["d2"]]
    r1 = round(statistics.median(r1s), 3) if r1s else None
    r2 = round(statistics.median(r2s), 3) if r2s else None
    v = verdict(r1, r2)
    res = {"captured": now_iso(), "pages": 2 * len(CITIES), "cities": [c for c, _ in CITIES],
           "hostels": len(rows), "currencies": currencies, "r1_median": r1, "r2_median": r2,
           "verdict": v, "rows": rows}
    write_json(OUT.with_suffix(".json"), res)
    OUT.with_suffix(".md").write_text(
        f"# Hostelworld private price unit (B4), {res['captured']}\n\n"
        f"- {res['pages']} pages, {len(rows)} hostels with a private for 1 and 2 guests\n"
        f"- currencies seen: {', '.join(currencies) or 'none'}\n"
        f"- r1 (2 guests / 1 guest) median {r1}; r2 (private / dorm, 2 guests) median {r2}\n"
        f"- verdict: **{v}**\n", encoding="utf-8")
    if a.apply and v in ("person", "room"):
        spike = read_json(STATE / "spike.json", {}) or {}
        spike.update(hw_private_unit=v, hw_private_per_person=(v == "person"),
                     hw_unit_sample=res["captured"])
        write_json(STATE / "spike.json", spike)
    print(f"VERDICT {v} (r1 {r1}, r2 {r2}, {len(rows)} hostels, currencies {currencies})"
          + (" -> spike.json" if a.apply and v != "unclear" else ""))


if __name__ == "__main__":
    main()
