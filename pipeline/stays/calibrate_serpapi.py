"""Accuracy check against Google Hotels through SerpApi's FREE tier (250/month).

Not a price source: it samples destinations that have observations in the
journals, asks Google Hotels for one bed type and month each, and stores
Google's median as a reference (STATE/calibration.json "refs"). build_stays
compares the build it is about to publish against these references and blocks
the publish on a median error above 25% (T645). Before T645 this script read
the last built files, but the monthly workflow runs it before the build, when
STAYS_OUT/v1 is still empty, so the check never had anything to compare.

  hotel3/hotel4   hotel_class=3 / 4, 2 adults
  dorm            property_types=14 (hostels), 1 adult
  bnb_home        vacation_rentals=true, 4 adults

Needs SERPAPI_KEY (free account). Without it the script says so and exits 0,
so a missing key never fails the monthly refresh.

Usage:  python pipeline/stays/calibrate_serpapi.py [--n 60]
"""

import argparse
import os
import random
import sys
from datetime import timedelta
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (JOURNAL, JOURNAL_SCRAPE, STATE, journal, load_destinations,  # noqa: E402
                    median, now_iso, today, write_json)
from price_xotelo import probe_day  # noqa: E402

API = "https://serpapi.com/search.json"
RESULT = STATE / "calibration.json"
CHECKS = [("hotel3", {"hotel_class": "3", "adults": 2}),
          ("hotel4", {"hotel_class": "4", "adults": 2}),
          ("dorm", {"property_types": "14", "adults": 1}),
          ("bnb_home", {"vacation_rentals": "true", "adults": 4})]


def sample_ids(n):
    """Destinations with observations in either journal, shuffled."""
    ids = set()
    for path in (JOURNAL, JOURNAL_SCRAPE):
        if path.exists():
            ids |= {r[0] for r in journal(path).execute("select distinct dest_id from obs")}
    ids = sorted(ids)
    random.shuffle(ids)
    return ids


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=60)
    a = ap.parse_args()
    key = os.environ.get("SERPAPI_KEY")
    if not key:
        print("SERPAPI_KEY not set: calibration skipped (free key, see owner steps)")
        return
    dests = {d["id"]: d for d in load_destinations()}
    day = probe_day(today(), 1)
    refs, used = [], 0
    client = httpx.Client(timeout=60)
    for i in sample_ids(a.n):
        if used >= a.n:
            break
        if i not in dests:
            continue
        d = dests[i]
        bed, params = CHECKS[used % len(CHECKS)]
        r = client.get(API, params={
            "engine": "google_hotels", "q": f"{d['city']}, {d['country']}",
            "check_in_date": day.isoformat(),
            "check_out_date": (day + timedelta(days=1)).isoformat(),
            "currency": "EUR", "hl": "en", "api_key": key, **params})
        used += 1
        if r.status_code != 200:
            print("SerpApi", r.status_code, r.text[:200])
            break
        prices = [p.get("rate_per_night", {}).get("extracted_lowest")
                  for p in r.json().get("properties", [])]
        g = median([p for p in prices if p])
        if g:
            refs.append({"dest": i, "bed": bed, "month": day.month, "google": round(g, 1)})
    write_json(RESULT, {"captured": now_iso(), "searches": used, "refs": refs})
    print(f"calibration: {len(refs)} Google references from {used} searches")


if __name__ == "__main__":
    main()
