"""Timetable references for the trips validation layer (ROADMAP D23, T1195).

Three jobs, all writing under data/reports/validation/trips/:

  legs        every leg Carta's trip library shows (the hop between two
              stops and the way out to a day trip), deduplicated by
              (from, to, mode), with both ends' coordinates and Carta's
              minutes: legs.csv. Offline, reads continent-app/public/trips.
  gtfs        the fastest scheduled time for each train and bus leg on one
              service day, from GTFS zips whose licence allows it (open
              national feeds first, see the T1195 report "Research"):
              station to station, direct or with one change at the same
              station. Writes timetable_reference.csv. Offline once the
              owner has downloaded the zips (owner step T1195-a).
  osrm        the routed drive time for each car leg from a SELF-HOSTED
              OSRM (the public demo server's policy does not allow bulk
              use). Network to localhost only (owner step T1195-b).

Method (station to station):
  * a leg end's stops are the GTFS stops (parent station when given) within
    RADIUS_KM of the place's coordinates, served on the day by a route of
    the leg's mode (train: route_type 2 and 100 to 117; bus: 3, 200 to 209
    and 700 to 716);
  * direct: the smallest arrival at a `to` stop minus departure from a
    `from` stop on one trip;
  * one change: a first ride from a `from` stop to any stop K, then the
    earliest-arriving ride from K to a `to` stop leaving at least
    MIN_TRANSFER_MIN after the first one arrives; the journey time is the
    second arrival minus the first departure, wait included;
  * the reference minutes are the smaller of the two, with `changes` 0 or 1;
  * a feed only judges a leg when both ends' countries are in the feed's
    declared country list; no stop near an end gives status `no_station`,
    stops at both ends but no journey that day gives `no_service`.

Rows already in the reference file whose leg the run did not answer (the
seed, hand rows) are kept; a row the run answers replaces them.

    python -I scripts/validation/trips_timetables.py legs
    python -I scripts/validation/trips_timetables.py gtfs --date 2026-11-17 \
        --feed cache/gtfs/de_fv.zip:DE --feed cache/gtfs/ch.zip:CH,DE,AT,IT,FR
    python -I scripts/validation/trips_timetables.py osrm --url http://127.0.0.1:5000
"""
from __future__ import annotations

import argparse
import bisect
import csv
import io
import json
import math
import sys
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRIPS_DIR = ROOT / "continent-app" / "public" / "trips" / "trip"
OUT_DIR = ROOT / "data" / "reports" / "validation" / "trips"
LEGS = OUT_DIR / "legs.csv"
REFERENCE = OUT_DIR / "timetable_reference.csv"

RADIUS_KM = 4.0
MIN_TRANSFER_MIN = 5
DEP_WINDOW = (6 * 3600, 20 * 3600)   # first departures a traveller would take
TRAIN_TYPES = {2} | set(range(100, 118))
BUS_TYPES = {3} | set(range(200, 210)) | set(range(700, 717))
MODE_TYPES = {"train": TRAIN_TYPES, "bus": BUS_TYPES}

LEG_FIELDS = ["id", "kind", "from", "to", "mode", "from_cc", "to_cc", "from_city", "to_city",
              "from_lat", "from_lon", "to_lat", "to_lon", "km", "minutes", "trips"]
REF_FIELDS = ["id", "from", "to", "mode", "ref_minutes", "changes", "direct_departures", "status",
              "source", "feed", "service_date", "read_on", "note"]


def leg_id(a, b, mode):
    return f"{a}>{b}>{mode}"


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------------------
# legs: Carta's side
# ---------------------------------------------------------------------------

def collect_legs(trips_dir: Path = TRIPS_DIR):
    """{id: leg row}. A day trip's way out is a leg from its base stop."""
    legs = {}
    for f in sorted(Path(trips_dir).glob("*.json")):
        try:
            t = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        stops = {s["dest"]: s for s in t.get("stops") or [] if s.get("dest")}
        order = [s.get("dest") for s in t.get("stops") or []]
        found = []
        for lg in t.get("legs") or []:
            a, b = stops.get(lg.get("from")), stops.get(lg.get("to"))
            if a and b and lg.get("mode") and lg.get("minutes") is not None:
                found.append(("leg", a, b, lg["mode"], lg.get("km"), lg["minutes"]))
        dts = {d["dest"]: d for d in t.get("daytrips") or [] if d.get("dest")}
        for p in t.get("plan") or []:
            dt = dts.get(p.get("daytrip"))
            si = p.get("stop")
            if (dt and isinstance(si, int) and 0 <= si < len(order) and stops.get(order[si])
                    and dt.get("mode") and dt.get("minutes") is not None):
                found.append(("daytrip", stops[order[si]], dt, dt["mode"], dt.get("km"), dt["minutes"]))
        for kind, a, b, mode, km, minutes in found:
            i = leg_id(a["dest"], b["dest"], mode)
            row = legs.get(i)
            if row is None:
                legs[i] = {"id": i, "kind": kind, "from": a["dest"], "to": b["dest"], "mode": mode,
                           "from_cc": a.get("iso2") or "", "to_cc": b.get("iso2") or "",
                           "from_city": a.get("city") or "", "to_city": b.get("city") or "",
                           "from_lat": a.get("lat"), "from_lon": a.get("lon"),
                           "to_lat": b.get("lat"), "to_lon": b.get("lon"),
                           "km": km, "minutes": int(minutes), "trips": 1}
            else:
                row["trips"] += 1
                if kind == "leg":
                    row["kind"] = "leg"
    return legs


def write_legs(legs, path: Path = LEGS):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=LEG_FIELDS)
        w.writeheader()
        for i in sorted(legs):
            w.writerow(legs[i])
    return path


def read_legs(path: Path = LEGS):
    out = {}
    if not Path(path).exists():
        return out
    with Path(path).open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            for k in ("from_lat", "from_lon", "to_lat", "to_lon"):
                r[k] = float(r[k]) if r.get(k) not in (None, "") else None
            r["minutes"] = int(r["minutes"])
            r["trips"] = int(r.get("trips") or 1)
            out[r["id"]] = r
    return out


def read_reference(path: Path = REFERENCE):
    out = {}
    if not Path(path).exists():
        return out
    with Path(path).open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            if r.get("id"):
                out[r["id"]] = r
    return out


def write_reference(rows, path: Path = REFERENCE):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=REF_FIELDS, extrasaction="ignore")
        w.writeheader()
        for i in sorted(rows):
            w.writerow({k: rows[i].get(k, "") for k in REF_FIELDS})
    return path


# ---------------------------------------------------------------------------
# GTFS
# ---------------------------------------------------------------------------

def _csv(z, name):
    try:
        raw = z.open(name)
    except KeyError:
        return iter(())
    return csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))


def _secs(t):
    if not t:
        return None
    h, m, s = (t.strip().split(":") + ["0", "0"])[:3]
    return int(h) * 3600 + int(m) * 60 + int(s)


def active_services(z, day: date):
    ymd, wd = day.strftime("%Y%m%d"), ["monday", "tuesday", "wednesday", "thursday", "friday",
                                         "saturday", "sunday"][day.weekday()]
    on = set()
    for r in _csv(z, "calendar.txt"):
        if r.get("start_date", "") <= ymd <= r.get("end_date", "") and r.get(wd) == "1":
            on.add(r["service_id"])
    for r in _csv(z, "calendar_dates.txt"):
        if r.get("date") == ymd:
            (on.add if r.get("exception_type") == "1" else on.discard)(r["service_id"])
    return on


def feed_timetable(zpath, day: date, mode):
    """(stops {stop_key: (lat, lon)}, trips [[(stop_key, arr_s, dep_s), ...]])
    for the trips of `mode` running on `day`. stop_key is the parent station
    when the feed gives one."""
    types = MODE_TYPES[mode]
    with zipfile.ZipFile(zpath) as z:
        routes = set()
        for r in _csv(z, "routes.txt"):
            try:
                if int(r.get("route_type") or -1) in types:
                    routes.add(r["route_id"])
            except ValueError:
                continue
        services = active_services(z, day)
        trips = {r["trip_id"] for r in _csv(z, "trips.txt")
                 if r.get("route_id") in routes and r.get("service_id") in services}
        raw_stops, parent = {}, {}
        for r in _csv(z, "stops.txt"):
            try:
                raw_stops[r["stop_id"]] = (float(r["stop_lat"]), float(r["stop_lon"]))
            except (KeyError, TypeError, ValueError):
                continue
            if r.get("parent_station"):
                parent[r["stop_id"]] = r["parent_station"]
        seq = {}
        for r in _csv(z, "stop_times.txt"):
            if r.get("trip_id") not in trips:
                continue
            arr, dep = _secs(r.get("arrival_time")), _secs(r.get("departure_time"))
            if arr is None and dep is None:
                continue
            sid = r.get("stop_id")
            key = parent.get(sid, sid)
            seq.setdefault(r["trip_id"], []).append((int(r.get("stop_sequence") or 0), key,
                                                      arr if arr is not None else dep,
                                                      dep if dep is not None else arr))
    stops = {}
    for sid, ll in raw_stops.items():
        stops.setdefault(parent.get(sid, sid), raw_stops.get(parent.get(sid, sid), ll))
    out = []
    for rows in seq.values():
        rows.sort()
        out.append([(k, a, d) for _, k, a, d in rows])
    return stops, out


def stops_near(stops, lat, lon, radius_km=RADIUS_KM):
    if lat is None or lon is None:
        return set()
    dlat = radius_km / 111.0
    return {k for k, (a, b) in stops.items()
            if abs(a - lat) <= dlat and haversine_km(lat, lon, a, b) <= radius_km}


def fastest(trips, from_stops, to_stops, transfer_s=MIN_TRANSFER_MIN * 60, window=DEP_WINDOW):
    """(direct seconds or None, one-change seconds or None, direct departures).
    Only journeys leaving the origin inside `window` (06:00 to 20:00) count."""
    lo, hi = window
    direct, n_direct = None, 0
    first = []                     # (dep at origin, stop K, arr at K)
    second = {}                    # stop K -> [(dep at K, arr at a `to` stop)]
    for t in trips:
        best_here = None
        for i, (k, _a, d) in enumerate(t):
            if k in from_stops:
                if not lo <= d <= hi:
                    continue
                for k2, a2, _d2 in t[i + 1:]:
                    if k2 in to_stops:
                        dur = a2 - d
                        if best_here is None or dur < best_here:
                            best_here = dur
                    elif k2 not in from_stops:
                        first.append((d, k2, a2))
            elif k not in to_stops:
                arr_to = None
                for k2, a2, _d2 in t[i + 1:]:
                    if k2 in to_stops:
                        arr_to = a2 if arr_to is None else min(arr_to, a2)
                if arr_to is not None:
                    second.setdefault(k, []).append((d, arr_to))
        if best_here is not None:
            n_direct += 1
            direct = best_here if direct is None else min(direct, best_here)
    index = {}
    for k, rides in second.items():
        rides.sort()
        suf, cur = [0] * len(rides), None
        for j in range(len(rides) - 1, -1, -1):
            cur = rides[j][1] if cur is None else min(cur, rides[j][1])
            suf[j] = cur
        index[k] = ([r[0] for r in rides], suf)
    change = None
    for d0, k, a1 in first:
        if k not in index:
            continue
        deps, suf = index[k]
        j = bisect.bisect_left(deps, a1 + transfer_s)
        if j < len(deps):
            dur = suf[j] - d0
            change = dur if change is None else min(change, dur)
    return direct, change, n_direct


def parse_feed(spec):
    path, _, ccs = spec.partition(":")
    return Path(path), {c.strip().upper() for c in ccs.split(",") if c.strip()}


def gtfs_reference(legs, feeds, day: date, radius_km=RADIUS_KM, transfer_min=MIN_TRANSFER_MIN, read_on=None):
    """{id: reference row} for the train and bus legs the feeds can judge."""
    read_on = read_on or datetime.now(timezone.utc).date().isoformat()
    out = {}
    for zpath, ccs in feeds:
        for mode in ("train", "bus"):
            mine = [lg for lg in legs.values() if lg["mode"] == mode
                    and lg["from_cc"] in ccs and lg["to_cc"] in ccs]
            if not mine:
                continue
            stops, trips = feed_timetable(zpath, day, mode)
            for lg in mine:
                fs = stops_near(stops, lg["from_lat"], lg["from_lon"], radius_km)
                ts = stops_near(stops, lg["to_lat"], lg["to_lon"], radius_km)
                row = {"id": lg["id"], "from": lg["from"], "to": lg["to"], "mode": mode,
                       "source": "gtfs", "feed": Path(zpath).name, "service_date": day.isoformat(),
                       "read_on": read_on, "ref_minutes": "", "changes": "", "direct_departures": 0}
                if not fs or not ts:
                    row["status"] = "no_station"
                    row["note"] = f"no stop within {radius_km:g} km of {'the start' if not fs else 'the end'}"
                else:
                    d, c, n = fastest(trips, fs, ts, transfer_min * 60)
                    best = min(x for x in (d, c) if x is not None) if (d is not None or c is not None) else None
                    row["direct_departures"] = n
                    if best is None:
                        row["status"] = "no_service"
                        row["note"] = "stops at both ends, no journey with at most one change that day"
                    else:
                        row["status"] = "ok"
                        row["ref_minutes"] = round(best / 60)
                        row["changes"] = 0 if d is not None and d <= best else 1
                prev = out.get(lg["id"])
                # Several feeds can judge a leg: an answer beats a refusal,
                # and the faster answer wins.
                if prev is None or _better(row, prev):
                    out[lg["id"]] = row
    return out


def _better(a, b):
    if a["status"] == "ok" and b["status"] != "ok":
        return True
    if a["status"] == "ok" and b["status"] == "ok":
        return int(a["ref_minutes"]) < int(b["ref_minutes"])
    return a["status"] == "no_service" and b["status"] == "no_station"


def merge(existing, fresh):
    rows = dict(existing)
    rows.update(fresh)
    return rows


# ---------------------------------------------------------------------------
# OSRM (self-hosted) for car legs
# ---------------------------------------------------------------------------

def osrm_reference(legs, url, read_on=None, fetch=None):
    """{id: row} for car legs, routed by a self-hosted OSRM at `url`."""
    import urllib.request
    read_on = read_on or datetime.now(timezone.utc).date().isoformat()

    def _get(u):
        with urllib.request.urlopen(u, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))

    fetch = fetch or _get
    out = {}
    for lg in legs.values():
        if lg["mode"] != "car" or lg["from_lat"] is None or lg["to_lat"] is None:
            continue
        u = (f"{url.rstrip('/')}/route/v1/driving/{lg['from_lon']},{lg['from_lat']};"
             f"{lg['to_lon']},{lg['to_lat']}?overview=false")
        try:
            js = fetch(u)
        except Exception as e:  # noqa: BLE001 - one bad leg must not stop the run
            out[lg["id"]] = {"id": lg["id"], "from": lg["from"], "to": lg["to"], "mode": "car",
                             "status": "error", "source": "osrm", "read_on": read_on, "note": str(e)[:120]}
            continue
        routes = js.get("routes") or []
        row = {"id": lg["id"], "from": lg["from"], "to": lg["to"], "mode": "car", "source": "osrm",
               "feed": "osrm-self-hosted", "read_on": read_on, "changes": "", "direct_departures": ""}
        if js.get("code") == "Ok" and routes:
            row["status"] = "ok"
            row["ref_minutes"] = round(routes[0]["duration"] / 60)
        else:
            row["status"] = "no_route"
            row["note"] = js.get("code") or "no route"
        out[lg["id"]] = row
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Timetable references for the trips validation layer (T1195)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("legs")
    p.add_argument("--trips", default=str(TRIPS_DIR))
    p.add_argument("--out", default=str(LEGS))
    g = sub.add_parser("gtfs")
    g.add_argument("--date", required=True, help="service day, a normal weekday (YYYY-MM-DD)")
    g.add_argument("--feed", action="append", required=True, help="path.zip:CC,CC (countries it covers)")
    g.add_argument("--radius-km", type=float, default=RADIUS_KM)
    g.add_argument("--transfer-min", type=int, default=MIN_TRANSFER_MIN)
    g.add_argument("--legs", default=str(LEGS))
    g.add_argument("--out", default=str(REFERENCE))
    o = sub.add_parser("osrm")
    o.add_argument("--url", required=True)
    o.add_argument("--legs", default=str(LEGS))
    o.add_argument("--out", default=str(REFERENCE))
    a = ap.parse_args(argv)
    if a.cmd == "legs":
        legs = collect_legs(Path(a.trips))
        write_legs(legs, Path(a.out))
        print(f"{len(legs)} legs -> {a.out}")
        return 0
    legs = read_legs(Path(a.legs))
    if not legs:
        raise SystemExit("no legs: run `legs` first")
    if a.cmd == "gtfs":
        fresh = gtfs_reference(legs, [parse_feed(s) for s in a.feed], date.fromisoformat(a.date),
                               a.radius_km, a.transfer_min)
    else:
        fresh = osrm_reference(legs, a.url)
    rows = merge(read_reference(Path(a.out)), fresh)
    write_reference(rows, Path(a.out))
    ok = sum(1 for r in fresh.values() if r.get("status") == "ok")
    print(f"{len(fresh)} legs answered ({ok} with a time) -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
