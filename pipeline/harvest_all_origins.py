"""
harvest_all_origins.py - harvest REAL Ryanair per-day fares from EVERY European
Ryanair origin airport to every anchor airport in the catalogue, and write them
into a deduplicated top-level `fares` table.

Why a new script (vs reharvest_flights.py, which is BRU+CRL only):
  - Extending origins to all of Europe is NOT a cartesian product. Ryanair is
    point-to-point, so we first fetch Ryanair's real route graph and only harvest
    (origin -> anchor) pairs that actually fly. That collapses ~590k naive calls
    to ~48k real ones (~16h at 1.2s/call; resumable, so run it overnight).
  - Fares depend ONLY on the airport pair, not on which gem-town uses that anchor.
    So we store each fare ONCE per (anchor, origin) in data["fares"], instead of
    duplicating it across the 447 destinations (that would blow app_data.json to
    ~30-40 MB; the deduped table stays ~4-6 MB).

    data["fares"] = {
        "<anchor_iata>": {
            "<origin_iata>": {"out": {day: eur, ...}, "ret": {day: eur, ...}},
            ...
        }, ...
    }

  Ground transport is NOT touched here - it is origin-independent and already
  lives per-destination (routes[*].ground_transport_* for airport-tier,
  transfer.* for gems). The frontend joins flight fare + ground at read time.

Caches (all idempotent / resumable):
  cache/ryanair_airports.json     {code: {name, city, lat, lon, base}}
  cache/ryanair_route_graph.json  {origin_code: [reachable dest codes]}
  cache/fare_all_origins.json     {"frm|to|month": {day_iso: price}}

Run:
  python harvest_all_origins.py graph      # (re)fetch airports + route graph
  python harvest_all_origins.py harvest     # harvest fares (resumes cache)
  python harvest_all_origins.py patch       # write data["fares"] from cache
  python harvest_all_origins.py all         # graph (if missing) + harvest + patch
  python harvest_all_origins.py refresh     # roll window to [today..+HORIZON],
                                            #   drop fare cache, re-harvest + patch
  python harvest_all_origins.py stats       # print scope without harvesting

Tuning via env:
  HARVEST_DELAY   base delay between calls, seconds (default 1.2)
  HARVEST_WORKERS parallel fetchers (default 1; try 3-4 to cut wall-clock,
                  at higher risk of 429s - backoff self-heals either way)
"""
import json, os, sys, time, threading, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "cache"
AIRPORTS_CACHE = CACHE_DIR / "ryanair_airports.json"
GRAPH_CACHE = CACHE_DIR / "ryanair_route_graph.json"
FARE_CACHE = CACHE_DIR / "fare_all_origins.json"
APP_DATA = ROOT / "app_data" / "app_data.json"

CURRENCY = "EUR"
FARE_ENDPOINT = ("https://www.ryanair.com/api/farfnd/v4/oneWayFares/"
                 "{frm}/{to}/cheapestPerDay?outboundMonthOfDate={month}&currency=" + CURRENCY)
AIRPORTS_ENDPOINT = "https://www.ryanair.com/api/views/locate/5/airports/en/active"
ROUTES_ENDPOINT = "https://www.ryanair.com/api/views/locate/searchWidget/routes/en/airport/{code}"

DELAY_S = float(os.environ.get("HARVEST_DELAY", "1.2"))
WORKERS = int(os.environ.get("HARVEST_WORKERS", "1"))
BACKOFFS = [30, 60, 120]
FARE_MODEL = "ryanair_cheapestPerDay_all_origins"
HORIZON_DAYS = 150

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-GB,en;q=0.9",
}


def _get_json(url, timeout=40):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def load_app_data():
    return json.loads(APP_DATA.read_text(encoding="utf-8"))


def months_in_window(start_iso, end_iso):
    sy, sm = int(start_iso[:4]), int(start_iso[5:7])
    ey, em = int(end_iso[:4]), int(end_iso[5:7])
    out, y, m = [], sy, sm
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}-01")
        m += 1
        if m == 13:
            m = 1; y += 1
    return out


def anchor_set(data):
    """Every airport used as a destination anchor in the catalogue."""
    anchors = set()
    for x in data["destinations"].values():
        a = x.get("anchor_airport")
        if a:
            anchors.add(a)
        if x.get("tier") == "airport" and x.get("iata"):
            anchors.add(x["iata"])
    anchors.discard(None)
    return anchors


# --------------------------------------------------------------------------- #
#  Phase 1: route graph
# --------------------------------------------------------------------------- #
def build_graph():
    """Fetch Ryanair's active airports and the destinations reachable from each,
    caching both. This is the network map that keeps the harvest bounded."""
    print("fetching active airports ...")
    airports_raw = _get_json(AIRPORTS_ENDPOINT)
    airports = {}
    for a in airports_raw:
        c = a.get("code")
        if not c:
            continue
        coord = a.get("coordinates") or {}
        airports[c] = {
            "name": a.get("name"),
            "city": (a.get("city") or {}).get("name"),
            "country": (a.get("country") or {}).get("name"),
            "lat": coord.get("latitude"),
            "lon": coord.get("longitude"),
            "base": bool(a.get("base")),
        }
    AIRPORTS_CACHE.write_text(json.dumps(airports, ensure_ascii=False, indent=0),
                              encoding="utf-8")
    print(f"  {len(airports)} active airports -> {AIRPORTS_CACHE.name}")

    graph = json.loads(GRAPH_CACHE.read_text(encoding="utf-8")) if GRAPH_CACHE.exists() else {}
    todo = [c for c in airports if c not in graph]
    print(f"fetching routes for {len(todo)} airports ({len(graph)} cached) ...")
    for i, c in enumerate(todo, 1):
        try:
            rts = _get_json(ROUTES_ENDPOINT.format(code=c))
            graph[c] = sorted({r["arrivalAirport"]["code"] for r in rts
                               if r.get("arrivalAirport", {}).get("code")})
        except Exception as e:
            print(f"  {type(e).__name__} on routes/{c}; empty")
            graph[c] = []
        if i % 25 == 0:
            GRAPH_CACHE.write_text(json.dumps(graph, indent=0), encoding="utf-8")
            print(f"  ...{i}/{len(todo)}")
        time.sleep(0.15)
    GRAPH_CACHE.write_text(json.dumps(graph, indent=0), encoding="utf-8")
    total_edges = sum(len(v) for v in graph.values())
    print(f"graph complete: {len(graph)} origins, {total_edges} directed edges")


def load_graph():
    if not GRAPH_CACHE.exists():
        sys.exit("no route graph; run `python harvest_all_origins.py graph` first")
    return json.loads(GRAPH_CACHE.read_text(encoding="utf-8"))


def origin_anchor_pairs(data, graph):
    """Real (origin, anchor) pairs: origin flies to anchor AND anchor is used
    as a destination in the catalogue."""
    anchors = anchor_set(data)
    pairs = set()
    for origin, dests in graph.items():
        for a in dests:
            if a in anchors:
                pairs.add((origin, a))
    return sorted(pairs)


# --------------------------------------------------------------------------- #
#  Phase 2: fare harvest
# --------------------------------------------------------------------------- #
def fetch_month(frm, to, month):
    """{day_iso: price} for bookable days only. Raises on transport error."""
    payload = _get_json(FARE_ENDPOINT.format(frm=frm, to=to, month=month))
    fares = (payload.get("outbound") or {}).get("fares") or []
    out = {}
    for f in fares:
        if f.get("unavailable") or f.get("soldOut"):
            continue
        price = f.get("price")
        if not price or price.get("value") is None:
            continue
        out[f["day"]] = round(float(price["value"]), 2)
    return out


def _fetch_with_backoff(frm, to, month):
    attempt = 0
    while True:
        try:
            return fetch_month(frm, to, month)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {}
            if e.code in (429, 503) and attempt < len(BACKOFFS):
                time.sleep(BACKOFFS[attempt]); attempt += 1; continue
            return {}
        except Exception:
            if attempt < len(BACKOFFS):
                time.sleep(BACKOFFS[attempt]); attempt += 1; continue
            return {}


def harvest():
    data = load_app_data()
    graph = load_graph()
    meta = data["meta"]
    months = months_in_window(meta["start_date"], meta["end_date"])
    pairs = origin_anchor_pairs(data, graph)

    cache = json.loads(FARE_CACHE.read_text(encoding="utf-8")) if FARE_CACHE.exists() else {}
    lock = threading.Lock()

    # One leg = one API call, keyed frm|to|month. OUT is origin->anchor, RET is
    # anchor->origin. Keying by airport pair auto-dedupes shared anchors.
    jobs = []
    for origin, anchor in pairs:
        for month in months:
            jobs.append((f"{origin}|{anchor}|{month}", origin, anchor, month))   # out
            jobs.append((f"{anchor}|{origin}|{month}", anchor, origin, month))    # ret
    # A leg may recur across pairs (shared anchors); fetch each distinct key once.
    seen, uniq = set(), []
    for key, frm, to, month in jobs:
        if key not in seen:
            seen.add(key); uniq.append((key, frm, to, month))
    todo = [j for j in uniq if j[0] not in cache]
    print(f"{len(pairs)} route-pairs x {len(months)} months -> {len(uniq)} distinct legs; "
          f"{len(cache)} cached, {len(todo)} to fetch (workers={WORKERS}, delay={DELAY_S}s)")

    done = [0]

    def run(job):
        key, frm, to, month = job
        result = _fetch_with_backoff(frm, to, month)
        with lock:
            cache[key] = result
            done[0] += 1
            if done[0] % 50 == 0:
                FARE_CACHE.write_text(json.dumps(cache, indent=0), encoding="utf-8")
                print(f"  ...{done[0]}/{len(todo)} fetched, flushed")
        time.sleep(DELAY_S)

    if WORKERS <= 1:
        for job in todo:
            run(job)
    else:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = [ex.submit(run, job) for job in todo]
            for _ in as_completed(futs):
                pass

    FARE_CACHE.write_text(json.dumps(cache, indent=0), encoding="utf-8")
    print(f"harvest complete: {len(cache)} legs in cache")


# --------------------------------------------------------------------------- #
#  Phase 3: patch into deduplicated fares table
# --------------------------------------------------------------------------- #
def _merge_months(cache, frm, to, months, start_iso, end_iso):
    fares = {}
    for month in months:
        for day, price in (cache.get(f"{frm}|{to}|{month}") or {}).items():
            if start_iso <= day <= end_iso:
                fares[day] = price
    return dict(sorted(fares.items()))


def patch():
    if not FARE_CACHE.exists():
        sys.exit("no fare cache; run harvest first")
    cache = json.loads(FARE_CACHE.read_text(encoding="utf-8"))
    data = load_app_data()
    graph = load_graph()
    meta = data["meta"]
    start_iso, end_iso = meta["start_date"], meta["end_date"]
    months = months_in_window(start_iso, end_iso)
    pairs = origin_anchor_pairs(data, graph)

    fares = {}
    n_legs = n_anchors = 0
    for origin, anchor in pairs:
        out = _merge_months(cache, origin, anchor, months, start_iso, end_iso)
        ret = _merge_months(cache, anchor, origin, months, start_iso, end_iso)
        if not out and not ret:
            continue
        fares.setdefault(anchor, {})[origin] = {"out": out, "ret": ret}
        n_legs += 1
    n_anchors = len(fares)

    data["fares"] = dict(sorted(fares.items()))
    all_origins = sorted({o for a in fares.values() for o in a})
    meta["fares_model"] = {
        "method": ("real per-day Ryanair fares (farefinder cheapestPerDay) from "
                   "every European Ryanair origin to every catalogue anchor; only "
                   "bookable days kept. Deduped by (anchor, origin) in top-level "
                   "`fares`; ground transport joined per-destination at read time."),
        "fare_model": FARE_MODEL,
        "currency": CURRENCY,
        "window": f"{start_iso}..{end_iso}",
        "n_origins": len(all_origins),
        "n_anchors": n_anchors,
        "n_priced_pairs": n_legs,
        "harvested_from": date.today().isoformat(),
    }
    meta["all_origins"] = all_origins

    APP_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    size_mb = APP_DATA.stat().st_size / 1e6
    print(f"patched fares: {n_anchors} anchors, {len(all_origins)} distinct origins, "
          f"{n_legs} priced (anchor,origin) pairs")
    print(f"app_data.json is now {size_mb:.1f} MB")


def stats():
    data = load_app_data()
    graph = load_graph() if GRAPH_CACHE.exists() else None
    anchors = anchor_set(data)
    months = months_in_window(data["meta"]["start_date"], data["meta"]["end_date"])
    print(f"catalogue anchors: {len(anchors)}")
    print(f"window months: {months}")
    if graph is None:
        print("(no route graph cached yet - run `graph` for pair/call counts)")
        return
    pairs = origin_anchor_pairs(data, graph)
    from collections import Counter
    per = Counter(a for _, a in pairs)
    origins = sorted({o for o, _ in pairs})
    print(f"reachable anchors: {len(per)}/{len(anchors)}")
    print(f"distinct origins:  {len(origins)}")
    print(f"real (origin,anchor) pairs: {len(pairs)}")
    print(f"est. distinct legs (<= pairs*2): up to {len(pairs) * 2}")
    print(f"est. harvest calls: {len(pairs) * 2 * len(months)}")
    print(f"est. wall-clock @ {DELAY_S}s/{WORKERS}w: "
          f"{len(pairs) * 2 * len(months) * DELAY_S / max(1, WORKERS) / 3600:.1f} h")


def refresh():
    today = date.today()
    start = today.isoformat()
    end = (today + timedelta(days=HORIZON_DAYS)).isoformat()
    data = load_app_data()
    data["meta"]["start_date"] = start
    data["meta"]["end_date"] = end
    APP_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"refresh: window rolled to {start} .. {end}")
    if FARE_CACHE.exists():
        FARE_CACHE.unlink()
        print("refresh: cleared stale fare cache (route graph kept)")
    harvest()
    patch()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "graph":
        build_graph()
    elif cmd == "harvest":
        harvest()
    elif cmd == "patch":
        patch()
    elif cmd == "stats":
        stats()
    elif cmd == "refresh":
        refresh()
    elif cmd == "all":
        if not GRAPH_CACHE.exists():
            build_graph()
        harvest()
        patch()
    else:
        sys.exit(f"unknown command: {cmd}\n" + __doc__)
