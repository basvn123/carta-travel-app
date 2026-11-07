"""Price alerts: price every open alert after a data refresh and report the totals (T1205, I17).

Tier: Weekly

The box runs this after the stays refresh (monthly) and every week for the
flight fares the sweep keeps current. It never sends an email and never holds
the Supabase service role key: it asks the price-alerts Edge Function for the
open alerts (only confirmed, subscribed accounts; no address, no account id),
prices each one with alert_total() and posts the totals back. The function
records each total (migration 073, price_alert_record): the first check sets
the baseline, a total at or below the baseline less the chosen share fires
the one email, through Resend (the I6 route).

One formula for the baseline and every later check, so the email compares
like with like. It is Carta's estimate, not a booking quote:

  stay    for each stop and night, the stays wire's month rate for the bed
          tier (`month[key][m-1]`, EUR a unit), times the units the party
          needs (a dorm bed each; a room for every stay.people_per_room
          adults; a home for every four; one adult in a hotel at the
          measured single-room ratio), times the Friday and Saturday factor
          on a dated weekend night (stay.weekend_nights)
  flights when the alert carries `fly`: the cheapest fare out on the day and
          the cheapest back on the day from the home airport's sweep file,
          times the adults
  total   rounded to whole euros; None when any part is missing (a tier the
          wire does not carry, a day the sweep has not priced), and then the
          alert is skipped, never fired

Inputs: the stays wire as the box just built it (cache/stays/out/v1/{cc}.json,
STAYS_OUT), else the published copy on the data host; the flight files on the
data host (flights/{IATA}.json). Config: config/pricing.json via
pipeline/pricing_config.py.

Environment (owner step): PRICE_ALERTS_URL (https://<ref>.supabase.co/
functions/v1/price-alerts) and PRICE_ALERTS_BOX_SECRET. Without both the task
says so and exits 0: nothing is checked.

Usage:
  python pipeline/price_alerts.py             price and report
  python pipeline/price_alerts.py --dry-run   price and print, report nothing
"""

import argparse
import json
import math
import os
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from pricing_config import rule  # noqa: E402

DATA_BASE = os.environ.get("CARTA_DATA_BASE", "https://data.carta-europetravel.com/data").rstrip("/")
STAYS_OUT = Path(os.environ.get("STAYS_OUT", ROOT / "cache" / "stays" / "out")) / "v1"
WIRE = {"dorm": "dorm", "private": "private", "room": "bnb_room", "home": "bnb_home",
        "hotel2": "hotel2", "hotel3": "hotel3", "hotel4": "hotel4", "hotel5": "hotel5"}
HOME_SLEEPS = 4
TIMEOUT = 30
UA = "carta-price-alerts/1 (+https://www.carta-europetravel.com)"


def _rules():
    return {"per_room": int(rule("stay.people_per_room")),
            # JavaScript's getUTCDay numbering: 0 is Sunday, 5 Friday, 6 Saturday.
            "weekend": set(int(x) for x in rule("stay.weekend_nights"))}


def _js_weekday(d):
    return (d.weekday() + 1) % 7


def _units(bed, adults, per_room):
    if bed == "dorm":
        return adults
    if bed == "home":
        return max(1, math.ceil(adults / HOME_SLEEPS))
    return max(1, math.ceil(adults / per_room))


def stay_total(stop, bed, adults, rec, start=None, month=None, rules=None):
    """The stay at one stop in EUR, or None when the wire cannot price it."""
    rules = rules or _rules()
    if not rec or not isinstance(rec.get("month"), dict):
        return None
    curve = rec["month"].get(WIRE.get(bed, ""))
    nights = int(stop.get("nights") or 0)
    if not isinstance(curve, list) or len(curve) != 12 or nights < 1:
        return None
    units = _units(bed, adults, rules["per_room"])
    single = 1.0
    if adults == 1 and bed.startswith("hotel"):
        s = (rec.get("single") or {}).get("hotel")
        if isinstance(s, (int, float)) and s > 0:
            single = min(1.0, float(s))
    weekend = rec.get("weekend")
    weekend = float(weekend) if isinstance(weekend, (int, float)) and weekend > 1 else 1.0
    total = 0.0
    for i in range(nights):
        day = start + timedelta(days=i) if start else None
        m = day.month if day else month
        if not m:
            return None
        rate = curve[m - 1]
        if not isinstance(rate, (int, float)) or rate <= 0:
            return None
        rate *= single
        if day and _js_weekday(day) in rules["weekend"]:
            rate *= weekend
        total += rate * units
    return total


def fare(file, way, airport, day):
    """The cheapest one-way fare (EUR, one adult) on a day, or None."""
    row = ((file or {}).get(way) or {}).get(airport, {}).get(day)
    if isinstance(row, list) and row and isinstance(row[0], (int, float)) and row[0] > 0:
        return float(row[0])
    return None


def alert_total(spec, stays_of, flights_of, rules=None):
    """Carta's estimate for one alert in whole EUR, or None.

    stays_of(cc) gives a country's wire ({"dests": {id: rec}}) or None;
    flights_of(iata) gives a home airport's sweep file or None.
    """
    rules = rules or _rules()
    try:
        stops = spec["stops"]
        adults = int(spec.get("adults") or 0)
        bed = spec.get("bed") or "home"
    except (KeyError, TypeError):
        return None
    if not isinstance(stops, list) or not stops or not 1 <= adults <= 12 or bed not in WIRE:
        return None
    start = None
    if spec.get("start"):
        try:
            start = date.fromisoformat(str(spec["start"]))
        except ValueError:
            return None
    month = spec.get("month") if isinstance(spec.get("month"), int) and 1 <= spec["month"] <= 12 else None
    if not start and not month:
        return None
    total = 0.0
    day = start
    for stop in stops:
        wire = stays_of(str(stop.get("cc") or "")) or {}
        rec = (wire.get("dests") or {}).get(str(stop.get("id") or ""))
        part = stay_total(stop, bed, adults, rec, start=day, month=month, rules=rules)
        if part is None:
            return None
        total += part
        if day:
            day = day + timedelta(days=int(stop["nights"]))
    fly = spec.get("fly")
    if fly:
        f = flights_of(str(fly.get("from") or ""))
        out = fare(f, "to", fly.get("to"), fly.get("out"))
        back = fare(f, "back", fly.get("to"), fly.get("back"))
        if out is None or back is None:
            return None
        total += (out + back) * adults
    return int(round(total)) if total > 0 else None


# ----------------------------------------------------------------- network

def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def _post(url, secret, body):
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "x-alerts-secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT * 4) as r:
        return json.loads(r.read().decode("utf-8"))


def cached(loader):
    memo = {}

    def get(key):
        if key not in memo:
            try:
                memo[key] = loader(key)
            except Exception as e:  # a missing file is a skipped alert, not a failed run
                print(f"price_alerts: {key}: {type(e).__name__}", flush=True)
                memo[key] = None
        return memo[key]
    return get


def load_stays(cc):
    if not cc or not cc.isalpha() or len(cc) != 2:
        return None
    local = STAYS_OUT / f"{cc}.json"
    if local.exists():
        return json.loads(local.read_text(encoding="utf-8"))
    return _get_json(f"{DATA_BASE}/stays-live/v1/{cc}.json")


def load_flights(iata):
    if not iata or not iata.isalpha() or len(iata) != 3:
        return None
    return _get_json(f"{DATA_BASE}/flights/{iata}.json")


def price_all(alerts, stays_of, flights_of, rules=None):
    """[{id, eur}] for every alert that can be priced, and the count skipped."""
    rules = rules or _rules()
    items, skipped = [], 0
    for a in alerts or []:
        eur = alert_total(a.get("spec") or {}, stays_of, flights_of, rules)
        if eur is None or not a.get("id"):
            skipped += 1
            continue
        items.append({"id": a["id"], "eur": eur})
    return items, skipped


def run(url, secret, post=_post, stays_of=None, flights_of=None, dry_run=False):
    stays_of = stays_of or cached(load_stays)
    flights_of = flights_of or cached(load_flights)
    opened = post(url, secret, {"job": "open"})
    if opened.get("code") == "off":
        print("price_alerts: the function is off (PRICE_ALERTS_ENABLED); nothing checked", flush=True)
        return {"open": 0, "priced": 0, "skipped": 0}
    alerts = opened.get("alerts") or []
    items, skipped = price_all(alerts, stays_of, flights_of)
    summary = {"open": len(alerts), "priced": len(items), "skipped": skipped}
    if dry_run:
        for it in items:
            print(f"  {it['id']}  {it['eur']} EUR", flush=True)
        return summary
    for i in range(0, len(items), 500):
        res = post(url, secret, {"job": "check", "items": items[i:i + 500]})
        for k in ("armed", "held", "fired", "sent", "failed", "gone"):
            summary[k] = summary.get(k, 0) + int(res.get(k) or 0)
    purged = post(url, secret, {"job": "purge"})
    summary["purged"] = int(purged.get("purged") or 0)
    return summary


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dry-run", action="store_true", help="price and print, report nothing")
    a = ap.parse_args(argv)
    url = os.environ.get("PRICE_ALERTS_URL", "").strip()
    secret = os.environ.get("PRICE_ALERTS_BOX_SECRET", "").strip()
    if not url or not secret:
        print("price_alerts: PRICE_ALERTS_URL or PRICE_ALERTS_BOX_SECRET is not set; nothing checked", flush=True)
        return 0
    summary = run(url, secret, dry_run=a.dry_run)
    print("price_alerts: " + ", ".join(f"{k} {v}" for k, v in summary.items()), flush=True)
    return 1 if summary.get("failed") else 0


if __name__ == "__main__":
    sys.exit(main())
