"""Accuracy check against Google Hotels through SerpApi's FREE tier (250/month).

Not a price source: it samples destinations from the last built stays files,
asks Google Hotels for the same bed type and month, and records how far our
figure is from Google's median. build_stays gates the publish on this
(median absolute error above 25% blocks it).

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
from common import OUT, STATE, load_destinations, median, now_iso, read_json, today, write_json  # noqa: E402
from price_xotelo import probe_day  # noqa: E402

API = "https://serpapi.com/search.json"
RESULT = STATE / "calibration.json"
CHECKS = [("hotel3", {"hotel_class": "3", "adults": 2}),
          ("hotel4", {"hotel_class": "4", "adults": 2}),
          ("dorm", {"property_types": "14", "adults": 1}),
          ("bnb_home", {"vacation_rentals": "true", "adults": 4})]


def ours(rec, bed, month):
    m = (rec.get("month") or {}).get(bed)
    if m and m[month - 1]:
        return m[month - 1]
    v = (rec.get("beds") or {}).get(bed)
    return v.get("4") if isinstance(v, dict) else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=60)
    a = ap.parse_args()
    key = os.environ.get("SERPAPI_KEY")
    if not key:
        print("SERPAPI_KEY not set: calibration skipped (free key, see owner steps)")
        return
    recs = {}
    for f in (OUT / "v1").glob("*.json"):
        if f.name != "manifest.json":
            recs.update(read_json(f, {}).get("dests", {}))
    dests = {d["id"]: d for d in load_destinations()}
    ids = [i for i in recs if i in dests and recs[i].get("q") != "modelled"]
    random.shuffle(ids)
    day = probe_day(today(), 1)
    errs = {b: [] for b, _ in CHECKS}
    used = 0
    client = httpx.Client(timeout=60)
    for i in ids:
        if used >= a.n:
            break
        d = dests[i]
        bed, params = CHECKS[used % len(CHECKS)]
        mine = ours(recs[i], bed, day.month)
        if not mine:
            continue
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
            errs[bed].append(abs(mine - g) / g)
    summary = {b: {"n": len(v), "mape": round(median(v), 3) if v else None}
               for b, v in errs.items()}
    allv = [x for v in errs.values() for x in v]
    write_json(RESULT, {"captured": now_iso(), "searches": used, "by_bed": summary,
                        "mape": round(median(allv), 3) if allv else None})
    print("calibration:", summary)


if __name__ == "__main__":
    main()
