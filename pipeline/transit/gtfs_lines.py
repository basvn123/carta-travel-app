"""Train, bus and ferry lines between destinations, from open GTFS feeds.

Tier: On demand (T641; feeds `practical.transit.*` through
pipeline/dossier/derive_practical.py)

A feed is used only when pipeline/transit/feeds.json lists it with a licence
that allows commercial use and `licence_verified: true`. The registry holds
the feed id, URL, licence name and URL, the attribution line and the date the
licence was read. A feed without a verified licence is skipped (use
--allow-unverified only to test code).

Method (measured from the timetable, nothing modelled):
  1. A stop belongs to the nearest node within STOP_KM (1.5 km): a destination
     centre or one of its member towns (Bellagio, Varenna under Lake Como). Stops far from every destination are ignored.
  2. stop_times.txt is streamed once; only rows at those stops are kept.
  3. A trip that visits a stop of destination A and later a stop of
     destination B is one connection A to B. Minutes = scheduled arrival at B
     minus departure at A. Connections are folded by (mode, route name, A, B)
     into a leg: the shortest minutes, and the trips per day on the reference
     day (the first Wednesday of the feed period, at least 7 days after its
     start, using calendar.txt and calendar_dates.txt).
  4. Mode from route_type: 2 and 100-117 train; 3, 11, 200-209 and 700-716
     bus; 4 and 1000-1200 ferry. Trams, metros and lifts are ignored.

Output cache/dest_transit.json rows[destination id] =
    {"train": [leg], "bus": [leg], "ferry": [leg]}      (a mode is omitted when empty)
    leg = {"name", "from", "to", "minutes", "operator"?, "freq_per_day",
           "source", "date", "method": "measured"}
where from is a node of the destination (its centre or a member town) and to is
the other node, so a leg appears under both ends. At most LEGS_PER_MODE legs per mode, most frequent
first. Feeds are cached under cache/gtfs/<feed id>/feed.zip (nothing over 500 MB
is downloaded; a larger Content-Length stops the run).

Usage, from the repo root:
    python pipeline/transit/gtfs_lines.py --feeds trenord-lombardia          # sample
    python pipeline/transit/gtfs_lines.py                                    # every verified feed
    --out-dir DIR  write the output under DIR; --cache-dir DIR for the zips

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import sys
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
INPUT = Path(os.environ.get("CARTA_INPUT_ROOT", ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))
import explore_overlay as ov  # noqa: E402

UA = {"User-Agent": "CartaGTFS/1.0 (https://carta-europetravel.com; bas.vannieuwenhuyse123@gmail.com)"}
STOP_KM = 1.5
MAX_PAIR_KM = 120.0
LEGS_PER_MODE = 6
MAX_DOWNLOAD = 500 * 1024 * 1024


def mode_of(route_type: int):
    if route_type == 2 or 100 <= route_type <= 117:
        return "train"
    if route_type in (3, 11) or 200 <= route_type <= 209 or 700 <= route_type <= 716:
        return "bus"
    if route_type == 4 or 1000 <= route_type <= 1200:
        return "ferry"
    return None


def hav(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def secs(t: str):
    try:
        h, m, s = t.strip().split(":")
        return int(h) * 3600 + int(m) * 60 + int(s)
    except ValueError:
        return None


def download(feed: dict, cache_dir: Path) -> Path:
    path = cache_dir / feed["id"] / "feed.zip"
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(feed["url"], headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        size = int(r.headers.get("Content-Length") or 0)
        if size > MAX_DOWNLOAD:
            raise RuntimeError(f"{feed['id']}: {size / 1e6:.0f} MB is over the 500 MB rule, stop and report")
        tmp = path.with_suffix(".part")
        got = 0
        with open(tmp, "wb") as fh:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                got += len(chunk)
                if got > MAX_DOWNLOAD:
                    raise RuntimeError(f"{feed['id']}: over the 500 MB rule while downloading")
                fh.write(chunk)
    tmp.replace(path)
    return path


def table(z: zipfile.ZipFile, name: str):
    """Rows of a GTFS table as dicts; an absent table yields nothing."""
    try:
        fh = z.open(name)
    except KeyError:
        return
    with io.TextIOWrapper(fh, encoding="utf-8-sig", newline="") as t:
        yield from csv.DictReader(t)


def reference_day(z: zipfile.ZipFile) -> date:
    lo = hi = None
    for r in table(z, "calendar.txt"):
        try:
            a = datetime.strptime(r["start_date"], "%Y%m%d").date()
            b = datetime.strptime(r["end_date"], "%Y%m%d").date()
        except (KeyError, ValueError):
            continue
        lo = a if lo is None or a < lo else lo
        hi = b if hi is None or b > hi else hi
    if lo is None:
        for r in table(z, "calendar_dates.txt"):
            try:
                d = datetime.strptime(r["date"], "%Y%m%d").date()
            except (KeyError, ValueError):
                continue
            lo = d if lo is None or d < lo else lo
            hi = d if hi is None or d > hi else hi
    if lo is None:
        raise RuntimeError("feed has no service calendar")
    start = max(lo + timedelta(days=7), date.today()) if hi >= date.today() + timedelta(days=7) else lo + timedelta(days=7)
    start = min(start, hi)
    while start.weekday() != 2 and start < hi:
        start += timedelta(days=1)
    return start


def active_services(z: zipfile.ZipFile, day: date) -> set:
    ds = day.strftime("%Y%m%d")
    wd = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][day.weekday()]
    on = set()
    for r in table(z, "calendar.txt"):
        if r.get(wd) == "1" and r["start_date"] <= ds <= r["end_date"]:
            on.add(r["service_id"])
    for r in table(z, "calendar_dates.txt"):
        if r.get("date") == ds:
            (on.add if r.get("exception_type") == "1" else on.discard)(r["service_id"])
    return on


def run_feed(feed: dict, zip_path: Path, dests: dict, today: str) -> dict:
    """{dest id: {mode: {(name, to id): leg}}} for one feed."""
    z = zipfile.ZipFile(zip_path)
    day = reference_day(z)
    services = active_services(z, day)
    # stops near a destination
    stop_dest: dict = {}
    ids = list(dests)
    cells = defaultdict(list)
    for did in ids:
        cells[(int(dests[did]["lat"] * 10), int(dests[did]["lon"] * 10))].append(did)
    for r in table(z, "stops.txt"):
        try:
            la, lo = float(r["stop_lat"]), float(r["stop_lon"])
        except (KeyError, ValueError):
            continue
        best = None
        ci, cj = int(la * 10), int(lo * 10)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for did in cells.get((ci + di, cj + dj), ()):
                    k = hav(la, lo, dests[did]["lat"], dests[did]["lon"])
                    if k <= STOP_KM and (best is None or k < best[0]):
                        best = (k, did)
        if best:
            stop_dest[r["stop_id"]] = best[1]
    if not stop_dest:
        return {}
    agencies = {r.get("agency_id", ""): r.get("agency_name", "") for r in table(z, "agency.txt")}
    routes = {}
    for r in table(z, "routes.txt"):
        try:
            mode = mode_of(int(r.get("route_type") or -1))
        except ValueError:
            mode = None
        if mode:
            name = (r.get("route_short_name") or r.get("route_long_name") or "").strip()
            routes[r["route_id"]] = (mode, name[:40], agencies.get(r.get("agency_id", ""), "") or feed.get("operator", ""))
    trips = {}
    for r in table(z, "trips.txt"):
        if r["route_id"] in routes and r["service_id"] in services:
            trips[r["trip_id"]] = r["route_id"]
    visits = defaultdict(list)
    for r in table(z, "stop_times.txt"):
        did = stop_dest.get(r["stop_id"])
        if did and r["trip_id"] in trips:
            try:
                visits[r["trip_id"]].append((int(r["stop_sequence"]), did, secs(r["arrival_time"]), secs(r["departure_time"])))
            except ValueError:
                continue
    legs: dict = defaultdict(lambda: defaultdict(dict))
    for tid, vs in visits.items():
        vs.sort()
        mode, name, op = routes[trips[tid]]
        for i, (_, a, _, dep) in enumerate(vs):
            for _, b, arr, _ in vs[i + 1:]:
                if a == b or dep is None or arr is None or arr < dep:
                    continue
                if hav(dests[a]["lat"], dests[a]["lon"], dests[b]["lat"], dests[b]["lon"]) > MAX_PAIR_KM:
                    continue
                key = (name, b)
                cur = legs[a][mode].get(key)
                mins = max(1, round((arr - dep) / 60))
                if cur is None:
                    legs[a][mode][key] = {"name": name, "from": dests[a]["city"], "to": dests[b]["city"],
                                          "minutes": mins, "operator": op, "freq_per_day": 1}
                else:
                    cur["minutes"] = min(cur["minutes"], mins)
                    cur["freq_per_day"] += 1
                break   # first later stop of another destination per start stop is enough for this pair
    out = {}
    for a, by_mode in legs.items():
        row = {}
        owner = dests[a]["owner"]
        for mode, d in by_mode.items():
            ls = sorted(d.values(), key=lambda x: (-x["freq_per_day"], x["minutes"]))[:LEGS_PER_MODE]
            for leg in ls:
                if not leg["operator"]:
                    leg.pop("operator")
                leg.update({"source": f"{feed['name']} ({feed['licence']})", "date": today, "method": "measured",
                            "ref_day": day.isoformat()})
            row.setdefault(mode, []).extend(ls)
        tgt = out.setdefault(owner, {})
        for mode, ls in row.items():
            tgt.setdefault(mode, []).extend(ls)
    return out


def load_dests() -> dict:
    """Nodes: every destination centre, and every member town of a destination
    (Bellagio and Varenna under Lake Como). A node carries its owner, the
    destination whose sheet the leg is written to."""
    doc = json.loads((INPUT / "continent-app" / "public" / "app_data.json").read_text(encoding="utf-8"))
    out = {}
    for did, d in doc["destinations"].items():
        la, lo = d.get("city_lat", d.get("lat")), d.get("city_lon", d.get("lon"))
        if la is not None and lo is not None:
            out[did] = {"lat": la, "lon": lo, "city": d.get("city") or did, "owner": did}
        for i, m in enumerate(d.get("members") or []):
            if m.get("name") and m.get("lat") is not None and m.get("lon") is not None:
                out[f"{did}#{i}"] = {"lat": m["lat"], "lon": m["lon"], "city": m["name"], "owner": did}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--feeds")
    ap.add_argument("--allow-unverified", action="store_true")
    ap.add_argument("--out-dir")
    ap.add_argument("--cache-dir")
    a = ap.parse_args()
    reg = json.loads((HERE / "feeds.json").read_text(encoding="utf-8"))["feeds"]
    want = set(a.feeds.split(",")) if a.feeds else None
    cache_dir = Path(a.cache_dir) if a.cache_dir else ROOT / "cache" / "gtfs"
    dests = load_dests()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows: dict = {}
    for feed in reg:
        if want and feed["id"] not in want:
            continue
        if not (feed.get("commercial_ok") and feed.get("licence_verified")) and not a.allow_unverified:
            print(f"{feed['id']}: skipped, licence not verified for commercial use")
            continue
        sub = {d: v for d, v in dests.items()
               if feed["bbox"][0] <= v["lat"] <= feed["bbox"][2] and feed["bbox"][1] <= v["lon"] <= feed["bbox"][3]}
        path = download(feed, cache_dir)
        got = run_feed(feed, path, sub, today)
        n = sum(len(v) for r in got.values() for v in r.values())
        print(f"{feed['id']}: {len(sub)} destinations in range, {len(got)} with lines, {n} legs", flush=True)
        for did, r in got.items():
            tgt = rows.setdefault(did, {})
            for mode, ls in r.items():
                tgt[mode] = (tgt.get(mode, []) + ls)
    for r in rows.values():
        for mode in r:
            r[mode] = sorted(r[mode], key=lambda x: (-x["freq_per_day"], x["minutes"]))[:LEGS_PER_MODE]
    meta = {"source": "open GTFS feeds listed in pipeline/transit/feeds.json", "method": "measured",
            "date": today, "unit": "minutes, trips per reference weekday"}
    ov.save("dest_transit", rows, meta, Path(a.out_dir) if a.out_dir else None)
    print("wrote dest_transit", len(rows))


if __name__ == "__main__":
    main()
