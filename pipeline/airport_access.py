"""Airport access (T642, closes T632-j): which airports serve a place, and how long
the transfer takes by each mode.

Tier: Library

Used by apply_airport_anchors.py. Writes, per destination, an additive
`airports[]` list next to the existing `anchor_airport` / `transfer` keys:

    {"iata": "MXP", "straight_km": 58.1, "road_km": 75.5,
     "options": [
        {"mode": "train", "minutes": 105, "source": "gtfs"},
        {"mode": "car",   "minutes": 70,  "source": "road_estimate"}],
     "transfer_min": 70, "transfer_mode": "car", "transfer_source": "road_estimate"}

Rules
  - Candidate airports: every airport-tier row with an iata within MAX_STRAIGHT_KM
    of the place, nearest first, at most MAX_AIRPORTS. The current anchor airport is
    always kept. Fare coverage (Ryanair) no longer decides what is within reach.
  - Road option: haversine x 1.3 detour at 65 km/h, labelled `road_estimate`, mode
    `car` (the same estimate apply_airport_anchors always used; now it says what it is).
  - Public transport option: only where a GTFS feed under cache/gtfs/<feed_id>/ covers
    both ends. Earliest-arrival scan (connection scan) over a typical weekday,
    departures every 30 min from 07:00 to 21:00, median door-to-door time. The legs
    between airport and first station, and between last station and the place, are
    road estimates (bus 25 km/h plus an 8 min wait, walking 4.5 km/h under 1.2 km).
    Source string: `gtfs:<feed_id>` (the access legs are still estimates, so the
    string says `gtfs:trenord+access_estimate`).
  - transfer_mode / transfer_source always written: the fastest option, public
    transport only if it is within PT_SLACK of the road time or the road is not
    available; otherwise the road estimate. No mode is ever invented: no data, no
    options, and the app shows the placeholder.

Feeds: Trenord (Regione Lombardia open data, dataset 3z4k-mxz9, IODL 2.0, commercial
reuse allowed with attribution). More feeds drop in as cache/gtfs/<id>/ with the
standard stops.txt / stop_times.txt / trips.txt / calendar_dates.txt (or calendar.txt).
"""

import csv
import datetime as dt
import math
import os
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
GTFS_DIR = Path(os.environ.get("CARTA_GTFS_DIR") or ROOT / "cache" / "gtfs")

MAX_STRAIGHT_KM = 110.0
MAX_AIRPORTS = 4
DETOUR = 1.3
ROAD_KMH = 65.0
BUS_KMH = 25.0
BUS_WAIT_MIN = 8
WALK_KMH = 4.5
WALK_MAX_KM = 1.2
ACCESS_RADIUS_KM = 15.0
DEST_RADIUS_EXTRA_KM = 8.0
DEST_RADIUS_MIN_KM = 5.0
PT_MAX_MIN = 240
PT_SLACK = 1.25  # public transport is the headline mode when within 25% of the road time
SAMPLE_DEPARTURES = [7 * 60 + 30 * i for i in range(29)]  # 07:00 .. 21:00
MIN_TRANSFER_MIN = 3

_NO_FEEDS = object()
_feeds_cache = _NO_FEEDS


def haversine(a_lat, a_lon, b_lat, b_lon):
    p = math.radians
    dlat = p(b_lat - a_lat)
    dlon = p(b_lon - a_lon)
    x = math.sin(dlat / 2) ** 2 + math.cos(p(a_lat)) * math.cos(p(b_lat)) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(x))


def road_minutes(straight_km):
    return round(straight_km * DETOUR / ROAD_KMH * 60)


def leg_minutes(straight_km):
    """Estimated minutes for a short access leg: walk if close, else bus + wait."""
    km = straight_km * DETOUR
    if straight_km <= WALK_MAX_KM:
        return km / WALK_KMH * 60
    return km / BUS_KMH * 60 + BUS_WAIT_MIN


def _hms(s):
    h, m, *_ = s.strip().split(":")
    return int(h) * 60 + int(m)


class Feed:
    def __init__(self, feed_id, folder):
        self.id = feed_id
        self.stops = {}
        with open(folder / "stops.txt", encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                try:
                    self.stops[r["stop_id"]] = (r["stop_name"], float(r["stop_lat"]), float(r["stop_lon"]))
                except (ValueError, KeyError):
                    continue
        service_days = {}
        cal = folder / "calendar.txt"
        if cal.exists():
            with open(cal, encoding="utf-8-sig", newline="") as f:
                for r in csv.DictReader(f):
                    service_days[r["service_id"]] = r
        self.cal = service_days
        self.dates = {}
        cd = folder / "calendar_dates.txt"
        if cd.exists():
            with open(cd, encoding="utf-8-sig", newline="") as f:
                for r in csv.DictReader(f):
                    self.dates.setdefault(r["date"], {})[r["service_id"]] = r["exception_type"]
        self.trip_service = {}
        with open(folder / "trips.txt", encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                self.trip_service[r["trip_id"]] = r["service_id"]
        self.trip_stops = {}
        with open(folder / "stop_times.txt", encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                if not r["arrival_time"] or not r["departure_time"]:
                    continue
                self.trip_stops.setdefault(r["trip_id"], []).append(
                    (int(r["stop_sequence"]), r["stop_id"], _hms(r["arrival_time"]), _hms(r["departure_time"])))
        for v in self.trip_stops.values():
            v.sort()
        self._conns = None
        self._date = None

    def active_services(self, date):
        ds = date.strftime("%Y%m%d")
        out = set()
        for sid, r in self.cal.items():
            if r["start_date"] <= ds <= r["end_date"] and r[date.strftime("%A").lower()] == "1":
                out.add(sid)
        for sid, ex in self.dates.get(ds, {}).items():
            if ex == "1":
                out.add(sid)
            elif ex == "2":
                out.discard(sid)
        return out

    def pick_date(self):
        """A typical weekday: the Wednesday on or after today with the most service."""
        today = dt.date.today()
        best = None
        for i in range(0, 120):
            d = today + dt.timedelta(days=i)
            if d.weekday() != 2:
                continue
            n = len(self.active_services(d))
            if n and (best is None or n > best[0]):
                best = (n, d)
        return best[1] if best else None

    def connections(self):
        if self._conns is not None:
            return self._conns
        self._date = self.pick_date()
        active = self.active_services(self._date) if self._date else set()
        conns = []
        for tid, seq in self.trip_stops.items():
            if self.trip_service.get(tid) not in active:
                continue
            for a, b in zip(seq, seq[1:]):
                conns.append((a[3], b[2], a[1], b[1], tid))
        conns.sort()
        self._conns = conns
        return conns

    def earliest_arrival(self, init, dep):
        """Connection scan. init: {stop_id: minutes at which we stand there}."""
        arr = dict(init)
        trip_on = set()
        for d, a, s, t, tid in self.connections():
            if d < dep:
                continue
            if tid in trip_on or (s in arr and arr[s] + MIN_TRANSFER_MIN <= d):
                trip_on.add(tid)
                if a < arr.get(t, 1e9):
                    arr[t] = a
        return arr

    def near(self, lat, lon, radius_km):
        out = []
        for sid, (name, la, lo) in self.stops.items():
            if abs(la - lat) > 0.5 or abs(lo - lon) > 0.7:
                continue
            km = haversine(lat, lon, la, lo)
            if km <= radius_km:
                out.append((km, sid))
        out.sort()
        return out


def load_feeds():
    global _feeds_cache
    if _feeds_cache is not _NO_FEEDS:
        return _feeds_cache
    feeds = []
    if GTFS_DIR.exists():
        for folder in sorted(GTFS_DIR.iterdir()):
            if (folder / "stops.txt").exists() and (folder / "stop_times.txt").exists() and (folder / "trips.txt").exists():
                try:
                    feeds.append(Feed(folder.name, folder))
                except (OSError, KeyError, ValueError):
                    continue
    _feeds_cache = feeds
    return feeds


_airport_profiles = {}


def _airport_profile(feed, iata, lat, lon):
    """{stop_id: median minutes airport -> stop} over the sampled departures, or None."""
    key = (feed.id, iata)
    if key in _airport_profiles:
        return _airport_profiles[key]
    access = {}
    for km, sid in feed.near(lat, lon, ACCESS_RADIUS_KM):
        access[sid] = leg_minutes(km)
    if not access:
        _airport_profiles[key] = None
        return None
    samples = {}
    for dep in SAMPLE_DEPARTURES:
        init = {sid: dep + m for sid, m in access.items()}
        for sid, a in feed.earliest_arrival(init, dep).items():
            samples.setdefault(sid, []).append(a - dep)
    prof = {sid: median(v) for sid, v in samples.items() if len(v) >= len(SAMPLE_DEPARTURES) // 2}
    _airport_profiles[key] = prof
    return prof


def public_transport_minutes(airport, lat, lon):
    """(minutes, source) for the best covered feed, or None."""
    for feed in load_feeds():
        prof = _airport_profile(feed, airport["iata"], airport["lat"], airport["lon"])
        if not prof:
            continue
        near = feed.near(lat, lon, 60)
        if not near:
            continue
        radius = max(DEST_RADIUS_MIN_KM, near[0][0] + DEST_RADIUS_EXTRA_KM)
        best = None
        for km, sid in near:
            if km > radius:
                break
            if sid not in prof:
                continue
            total = prof[sid] + leg_minutes(km)
            if best is None or total < best:
                best = total
        if best is not None and best <= PT_MAX_MIN:
            return round(best), f"gtfs:{feed.id}+access_estimate"
    return None


def airports_for(dest, airports, anchor_iata=None):
    """Build dest["airports"]. `airports`: list of {iata, lat, lon, ryanair}."""
    lat = dest.get("city_lat") or dest.get("lat")
    lon = dest.get("city_lon") or dest.get("lon")
    if lat is None or lon is None:
        return []
    cand = []
    for a in airports:
        km = haversine(lat, lon, a["lat"], a["lon"])
        if km <= MAX_STRAIGHT_KM or a["iata"] == anchor_iata:
            cand.append((km, a))
    cand.sort(key=lambda x: x[0])
    keep = cand[:MAX_AIRPORTS]
    if anchor_iata and anchor_iata not in [a["iata"] for _, a in keep]:
        keep = keep[:MAX_AIRPORTS - 1] + [c for c in cand if c[1]["iata"] == anchor_iata]
    out = []
    for km, a in keep:
        options = [{"mode": "car", "minutes": road_minutes(km), "source": "road_estimate"}]
        pt = public_transport_minutes(a, lat, lon)
        if pt:
            options.insert(0, {"mode": "train", "minutes": pt[0], "source": pt[1]})
        road = options[-1]
        head = options[0]
        if head["mode"] == "train" and head["minutes"] > road["minutes"] * PT_SLACK:
            head = road
        out.append({
            "iata": a["iata"], "straight_km": round(km, 1), "road_km": round(km * DETOUR, 1),
            "ryanair": bool(a.get("ryanair")), "options": options,
            "transfer_min": head["minutes"], "transfer_mode": head["mode"],
            "transfer_source": head["source"],
        })
    return out
