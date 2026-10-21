"""Price anchor properties per destination through Xotelo (dated OTA rates).

The brief's "anchor property" method: instead of every hotel in Europe, each
destination keeps a small fixed set of anchors chosen once from the discovered
pool (discover_xotelo.py), and only those are priced:

  hostel      up to 2 (most reviewed)      priced for 1 adult (bed) and 2 adults
  guesthouse  up to 2                      2 adults
  apartment   1                            2 adults
  hotel       up to 4, one per price quartile (pmin), so budget to luxury
              all show up                  2 adults; airport hubs also 1 adult

Dates. Every run probes one month per anchor, rotating so the anchors of one
destination cover different months:
    month = (run_month + anchor_index * 5) % 12, the Tuesday nearest the 15th.
After three monthly runs every destination has all 12 months. The first hotel
anchor also gets the Friday of that week (weekend factor). --bootstrap probes
all 12 months plus the peak nights (14 Aug, 28 Dec, Easter Saturday) for every
anchor: run it once, on the laptop or over several Actions runs.

Resumable: each (anchor, date, adults) is one task in the journal; a re-run
skips what is done. --max-hours / --max-calls cut a run to fit an Actions job.

Usage:
  python pipeline/stays/price_xotelo.py                  # monthly rotation
  python pipeline/stays/price_xotelo.py --bootstrap --only FLR,PMI
  python pipeline/stays/price_xotelo.py --max-hours 5.5
"""

import argparse
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (STATE, footprint_km, haversine_km, journal, load_destinations,  # noqa: E402
                    now_iso, priority, read_json, write_json)
from xotelo import Blocked, Client, rate_median  # noqa: E402

PROPS = STATE / "xotelo_props.json"
ANCHORS = STATE / "xotelo_anchors.json"
SUPPLY_RAW = STATE / "osm_stays.json"


def easter(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return date(y, month, day)


def probe_day(today, month_ahead):
    """Tuesday nearest the 15th of the month `month_ahead` months from today."""
    y, m = today.year, today.month + month_ahead
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    d = date(y, m, 15)
    return d + timedelta(days=(1 - d.weekday() + 3) % 7 - 3)


def peak_days(today):
    out = []
    for y in (today.year, today.year + 1):
        for d in (date(y, 8, 14), date(y, 12, 28), easter(y) - timedelta(days=1)):
            if timedelta(days=7) < d - today <= timedelta(days=365):
                out.append(d)
    return out


def norm(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if c.isalnum()).lower()


def osm_stars(prop, osm_rows):
    """Star class of the OSM hotel with the same name within 150 m."""
    n = norm(prop.get("name"))
    for lat, lon, kind, st, name in osm_rows:
        if st and kind == "hotel" and abs(lat - prop["lat"]) < 0.002 and \
                abs(lon - prop["lon"]) < 0.003:
            km = haversine_km(lat, lon, prop["lat"], prop["lon"])
            # Same name within 150 m, or (pool rows without a name) within 40 m.
            if (n and name and norm(name)[:8] == n[:8] and km < 0.15) or \
                    (not n and km < 0.04):
                return st
    return None


def choose_anchors(dest, pool, osm_rows):
    fp = footprint_km(dest)
    near = [p for p in pool
            if abs(p["lat"] - dest["lat"]) < 0.12 and abs(p["lon"] - dest["lon"]) < 0.18
            and haversine_km(dest["lat"], dest["lon"], p["lat"], p["lon"]) <= fp]
    by = lambda k: sorted((p for p in near if p["kind"] == k),  # noqa: E731
                          key=lambda p: -(p.get("reviews") or 0))
    picks = by("hostel")[:2] + by("guesthouse")[:2] + by("apartment")[:1]
    hotels = [p for p in by("hotel") if p.get("pmin")]
    if hotels:
        hotels.sort(key=lambda p: p["pmin"])
        q = len(hotels)
        for lo, hi in ((0, .25), (.25, .5), (.5, .75), (.75, 1.0)):
            band = hotels[int(lo * q):max(int(hi * q), int(lo * q) + 1)]
            if band:
                picks.append(max(band, key=lambda p: p.get("reviews") or 0))
    seen, out = set(), []
    for p in picks:
        if p["key"] in seen:
            continue
        seen.add(p["key"])
        out.append({"key": p["key"], "kind": p["kind"],
                    "stars": osm_stars(p, osm_rows) if p["kind"] == "hotel" else None})
    return out


def tasks_for(dest, anchors, today, bootstrap):
    run_m = today.month
    for i, a in enumerate(anchors):
        if bootstrap:
            days = [probe_day(today, k) for k in range(1, 13)] + peak_days(today)
        else:
            days = [probe_day(today, ((run_m + i * 5) % 12) + 1)]
        for j, d in enumerate(days):
            adults = [2]
            if a["kind"] == "hostel" or (a["kind"] == "hotel" and dest.get("tier") == "airport"):
                adults = [1, 2]
            for ad in adults:
                yield a, d, ad
            if a["kind"] == "hotel" and i == next(
                    (k for k, x in enumerate(anchors) if x["kind"] == "hotel"), -1) \
                    and j == 0:
                yield a, d + timedelta(days=3), 2      # the Friday of that week


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bootstrap", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--reselect", action="store_true",
                    help="choose anchors again (normally kept for comparability)")
    ap.add_argument("--max-hours", type=float, default=0)
    ap.add_argument("--max-calls", type=int, default=0)
    a = ap.parse_args()
    t0 = time.monotonic()
    pool = list((read_json(PROPS, {}) or {}).values())
    if not pool:
        sys.exit("no Xotelo pool: run discover_xotelo.py first")
    osm = read_json(SUPPLY_RAW, {}) or {}
    anchors = read_json(ANCHORS, {}) or {}
    dests = sorted(load_destinations(), key=priority)
    only = {s for s in a.only.split(",") if s}
    if only:
        dests = [d for d in dests if d["id"] in only]
    for d in dests:
        if a.reselect or d["id"] not in anchors:
            anchors[d["id"]] = choose_anchors(d, pool, osm.get(d["iso2"], []))
    write_json(ANCHORS, anchors)
    con = journal()
    client = Client()
    today = date.today()
    tag = "boot" if a.bootstrap else today.strftime("%Y-%m")
    done = priced = 0
    try:
        for d in dests:
            for anc, day, adults in tasks_for(d, anchors.get(d["id"], []), today,
                                              a.bootstrap):
                task = f"{tag}|{d['id']}|{anc['key']}|{day}|{adults}"
                if con.execute("select 1 from done where source='xotelo' and task=?",
                               (task,)).fetchone():
                    continue
                if (a.max_hours and time.monotonic() - t0 > a.max_hours * 3600) or \
                        (a.max_calls and client.calls >= a.max_calls):
                    raise TimeoutError
                res = client.rates(anc["key"], day.isoformat(),
                                   (day + timedelta(days=1)).isoformat(), adults=adults)
                price, ota = rate_median(res)
                if price:
                    bed = ("dorm" if adults == 1 else "private") \
                        if anc["kind"] == "hostel" else \
                        ("home" if anc["kind"] == "apartment" else "room")
                    con.execute(
                        "insert or ignore into obs values (?,?,?,?,?,?,?,?,?,?,?,?)",
                        ("xotelo", d["id"], anc["key"], anc["kind"], anc["stars"],
                         bed, adults, day.isoformat(), 1, price, ota, now_iso()))
                    priced += 1
                con.execute("insert or replace into done values ('xotelo',?,?)",
                            (task, now_iso()))
                done += 1
                if done % 200 == 0:
                    con.commit()
                    print(f"{done} tasks, {priced} prices, {client.calls} calls, "
                          f"at {d['id']}", flush=True)
    except TimeoutError:
        print("time or call budget reached; the next run resumes here")
    except Blocked as e:
        print("Xotelo refused:", e, "- the next run resumes here")
    con.commit()
    print(f"run done: {done} tasks, {priced} prices, {client.calls} calls, "
          f"{sum(1 for v in anchors.values() if v)} destinations with anchors")


if __name__ == "__main__":
    main()
