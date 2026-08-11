#!/usr/bin/env python3
"""Reachability precompute, Phase A: public Transitous instance (api.transitous.org).

Builds contract D artifacts: continent-app/public/reach/<ORIGIN>.json
  { "origin": IATA, "computed_at": iso, "minutes": { "<destId>": int } }

Semantics: door to door minutes from the origin city centre to each dest's
city_lat/city_lon (fallback lat/lon), best public-transport itinerary found
for a fixed weekday morning departure. Includes urban access legs on both
ends, so values run 20 to 45 minutes above station-to-station benchmarks.

Polite by design: one request per second, on-disk cache per (origin, depart
date), resumable, custom User-Agent with a contact address. Run from repo
root or anywhere: paths resolve relative to this file.

Usage:
  python tools/reachability/build_reach.py                 all configured origins
  python tools/reachability/build_reach.py --origin BRU    one origin
  python tools/reachability/build_reach.py --limit 20      smoke run
  python tools/reachability/build_reach.py --dry-run       counts only, no requests
"""
import argparse
import http.client
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
OUT_DIR = ROOT / "continent-app" / "public" / "reach"
CACHE_DIR = HERE / "cache"

_last_request = [0.0]


def load_config():
    return json.loads((HERE / "config.json").read_text(encoding="utf-8"))


def haversine_km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (0.5 - math.cos((lat2 - lat1) * p) / 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2)
    return 12742 * math.asin(math.sqrt(a))


def next_tuesday_5utc(now=None):
    """Next Tuesday 05:00Z (07:00 CEST), always at least 3 days out so the
    timetable window is fully published."""
    now = now or datetime.now(timezone.utc)
    d = now + timedelta(days=3)
    while d.weekday() != 1:
        d += timedelta(days=1)
    return d.replace(hour=5, minute=0, second=0, microsecond=0)


def dest_coord(dest):
    for la, lo in (("city_lat", "city_lon"), ("lat", "lon")):
        lat, lon = dest.get(la), dest.get(lo)
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)) \
                and math.isfinite(lat) and math.isfinite(lon):
            return float(lat), float(lon)
    return None


def candidate_groups(dests, origin, radius_km):
    """Dests within radius of the origin, grouped by shared city coordinate
    (multi-airport cities like Paris CDG/ORY/BVA collapse to one query)."""
    groups = {}
    for did, dest in dests.items():
        if did == origin["iata"]:
            continue
        c = dest_coord(dest)
        if c is None:
            continue
        if haversine_km(origin["lat"], origin["lon"], c[0], c[1]) > radius_km:
            continue
        key = f"{round(c[0], 5)},{round(c[1], 5)}"
        groups.setdefault(key, []).append(did)
    return groups


def paced_fetch(url, cfg):
    wait = cfg["min_request_interval_s"] - (time.time() - _last_request[0])
    if wait > 0:
        time.sleep(wait)
    _last_request[0] = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": cfg["user_agent"]})
    with urllib.request.urlopen(req, timeout=cfg["timeout_s"]) as resp:
        return json.load(resp)


def plan_minutes(from_place, to_place, depart_iso, cfg):
    url = cfg["api"] + "?" + urllib.parse.urlencode({
        "fromPlace": from_place,
        "toPlace": to_place,
        "time": depart_iso,
        "numItineraries": cfg["num_itineraries"],
        "searchWindow": cfg["search_window_s"],
        "maxPostTransitTime": cfg.get("max_post_transit_s", 3600),
    })
    last_err = None
    for attempt in range(len(cfg["backoff_s"]) + 1):
        try:
            r = paced_fetch(url, cfg)
            durations = []
            for it in r.get("itineraries", []):
                if any(leg.get("mode") == "AIRPLANE" for leg in it.get("legs", [])):
                    continue
                dur = it.get("duration")
                if isinstance(dur, (int, float)) and dur > 0:
                    durations.append(dur)
            for direct in r.get("direct", []):
                dur = direct.get("duration")
                if isinstance(dur, (int, float)) and dur > 0:
                    durations.append(dur)
            if not durations:
                return {"m": None, "n": 0}
            return {"m": int(round(min(durations) / 60)), "n": len(durations)}
        except urllib.error.HTTPError as e:
            last_err = f"http {e.code}"
            if e.code not in (429, 500, 502, 503, 504):
                break
        except (urllib.error.URLError, http.client.HTTPException, TimeoutError,
                json.JSONDecodeError, OSError) as e:
            last_err = type(e).__name__
        if attempt < len(cfg["backoff_s"]):
            time.sleep(cfg["backoff_s"][attempt])
    return {"err": last_err or "unknown"}


def load_cache(path):
    cache = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                cache[rec["to"]] = rec
            except (json.JSONDecodeError, KeyError):
                continue
    return cache


def build_origin(origin, dests, cfg, depart, limit=None, dry_run=False,
                 retry_errors=False, retry_missing=False):
    iata = origin["iata"]
    from_place = f"{origin['lat']},{origin['lon']}"
    groups = candidate_groups(dests, origin, cfg["radius_km"])
    n_dests = sum(len(v) for v in groups.values())
    print(f"[{iata}] {n_dests} candidate dests in {len(groups)} coordinate groups "
          f"within {cfg['radius_km']} km, depart {depart}")
    if dry_run:
        return

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{iata}_{depart[:10]}.jsonl"
    cache = load_cache(cache_path)
    todo = [k for k in groups
            if k not in cache
            or (retry_errors and "err" in cache[k])
            or (retry_missing and "err" not in cache[k] and cache[k].get("m") is None)]
    if limit is not None:
        todo = todo[:limit]
    print(f"[{iata}] {len(cache)} cached, {len(todo)} to query")

    t0 = time.time()
    with cache_path.open("a", encoding="utf-8") as fh:
        for i, key in enumerate(todo):
            rec = plan_minutes(from_place, key, depart, cfg)
            rec["to"] = key
            cache[key] = rec
            fh.write(json.dumps(rec, separators=(",", ":")) + "\n")
            if (i + 1) % 25 == 0 or i + 1 == len(todo):
                el = time.time() - t0
                eta = el / (i + 1) * (len(todo) - i - 1)
                print(f"[{iata}] {i + 1}/{len(todo)} queried, "
                      f"{el / 60:.1f} min elapsed, eta {eta / 60:.1f} min", flush=True)

    minutes = {}
    if iata in dests:
        minutes[iata] = 0
    errors = unreachable = over_cap = 0
    for key, ids in groups.items():
        rec = cache.get(key)
        if rec is None:
            continue
        if "err" in rec:
            errors += len(ids)
            continue
        m = rec.get("m")
        if m is None:
            unreachable += len(ids)
            continue
        if m > cfg["max_minutes"]:
            over_cap += len(ids)
            continue
        for did in ids:
            minutes[did] = m

    if limit is None:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        artifact = {
            "origin": iata,
            "computed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "minutes": {k: minutes[k] for k in sorted(minutes)},
        }
        out = OUT_DIR / f"{iata}.json"
        out.write_text(json.dumps(artifact, separators=(",", ":")), encoding="utf-8")
        print(f"[{iata}] wrote {out} ({out.stat().st_size / 1024:.0f} KB)")
    print(f"[{iata}] coverage: {len(minutes)}/{n_dests + 1} dests with a duration, "
          f"{over_cap} over the {cfg['max_minutes']} min cap, "
          f"{unreachable} no itinerary, {errors} request errors")


def main():
    ap = argparse.ArgumentParser(description="Build contract D reachability artifacts")
    ap.add_argument("--origin", action="append", help="origin IATA, repeatable, default all")
    ap.add_argument("--limit", type=int, help="max live queries per origin (smoke run, no artifact)")
    ap.add_argument("--dry-run", action="store_true", help="print candidate counts only")
    ap.add_argument("--depart", help="departure ISO UTC, default next Tuesday 05:00Z")
    ap.add_argument("--retry-errors", action="store_true", help="requery cached error entries")
    ap.add_argument("--retry-missing", action="store_true",
                    help="requery cached no-itinerary entries (after a param change)")
    args = ap.parse_args()

    cfg = load_config()
    dests = json.loads(MASTER.read_text(encoding="utf-8"))["destinations"]
    depart = args.depart or next_tuesday_5utc().strftime("%Y-%m-%dT%H:%M:%SZ")
    origins = cfg["origins"]
    if args.origin:
        wanted = {o.upper() for o in args.origin}
        origins = [o for o in origins if o["iata"] in wanted]
        if not origins:
            sys.exit(f"no configured origin matches {sorted(wanted)}")
    for origin in origins:
        build_origin(origin, dests, cfg, depart,
                     limit=args.limit, dry_run=args.dry_run,
                     retry_errors=args.retry_errors, retry_missing=args.retry_missing)


if __name__ == "__main__":
    main()
