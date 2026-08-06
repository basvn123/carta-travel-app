"""harvest_vueling.py - harvest REAL Vueling per-day fares from every Vueling
origin to every catalogue anchor and MERGE them (cheapest-wins) into the shared
top-level `fares` table, tagging the days Vueling wins as "VY".

How Vueling is reachable (found via a headless-browser network capture, but the
harvest itself needs NO browser - these are plain public JSON endpoints):
  - Route discovery:  GET apiw.vueling.com/api/v1/bestPrices?originCode=O&
        destinationCodes=A,B,C&months=12&startDate=YYYY-MM-DD&currencyCode=EUR
    Returns, for the destinations that Vueling actually serves from O, the
    cheapest fare in the window. Batches many destinations per call, so ONE call
    per origin discovers its whole served-anchor set.
  - Per-date calendar:  GET apiw.vueling.com/api/v1/availability?originCode=O&
        destinationCode=D&providerName=DmpsRetrieveAvailabilityProvider&
        currencyCode=EUR&lowPriceClassificationPercentage=25
    Returns the ENTIRE forward calendar (~11 months, one cheapest fare per day)
    in a single call, already in EUR. So one call per direction = a full leg.

Why only Vueling (of easyJet / Brussels / Vueling):
  easyJet's Akamai edge 403s even a real headless browser; Brussels Airlines
  (Lufthansa Group) only prices through a session-gated booking flow. Vueling's
  apiw endpoints answer anonymous plain HTTP, so it harvests like Ryanair/Wizz.

Merge model (shared `fares` table, same as harvest_wizzair.py):
  Reads whatever is already in data["fares"] (the fresh Ryanair+Wizz table) and
  keeps the cheaper price per (anchor, origin, day). Days Vueling wins (or
  Vueling-only routes) are tagged "VY" in a sparse out_c/ret_c map. So this MUST
  run AFTER the Ryanair and Wizz patches - run_pipeline sequences it last.

Caches (idempotent / resumable):
  cache/vueling_route_graph.json  {origin: [served anchor codes]}  (+ _done list)
  cache/vueling_airports.json     {iata: {name, city, country, lat, lon}}
  cache/vueling_fare_cache.json   {"frm|to": {day: eur}, _window}

Run:
  python harvest_vueling.py graph [N]      # discover served routes (resume; optional N-origin cap)
  python harvest_vueling.py harvest [N]    # harvest availability calendars (resume; optional N-pair cap)
  python harvest_vueling.py patch [--dry-run]  # merge EUR fares into data["fares"]
  python harvest_vueling.py all            # graph (if missing) + harvest + patch
  python harvest_vueling.py stats          # print scope

Tuning via env:
  HARVEST_DELAY    base delay between calls, seconds (default 1.2)
  HARVEST_WORKERS  parallel fetchers (default 1)
"""
import json, os, sys, time, threading, urllib.request, urllib.error, ssl, gzip
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "cache"
GRAPH_CACHE = CACHE_DIR / "vueling_route_graph.json"
AIRPORTS_CACHE = CACHE_DIR / "vueling_airports.json"
FARE_CACHE = CACHE_DIR / "vueling_fare_cache.json"
APP_DATA = ROOT / "app_data" / "app_data.json"

CURRENCY = "EUR"
CARRIER = "VY"                       # Vueling IATA code (tag for days it wins)
FARE_MODEL = "vueling_availability_all_origins"
APIW = "https://apiw.vueling.com/api/v1"
BEST_URL = (APIW + "/bestPrices?originCode={o}&destinationCodes={dests}"
            "&months=12&startDate={start}&currencyCode=EUR")
AVAIL_URL = (APIW + "/availability?originCode={o}&destinationCode={d}"
             "&providerName=DmpsRetrieveAvailabilityProvider&currencyCode=EUR"
             "&lowPriceClassificationPercentage=25")
DEST_CHUNK = 60                      # destinationCodes per bestPrices call (URL length)

DELAY_S = float(os.environ.get("HARVEST_DELAY", "1.2"))
WORKERS = int(os.environ.get("HARVEST_WORKERS", "1"))
BACKOFFS = [30, 60, 120]

_CTX = ssl.create_default_context()
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-GB,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Origin": "https://www.vueling.com",
    "Referer": "https://www.vueling.com/",
}


def _get(url, timeout=45):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return json.loads(raw)


def _get_backoff(url):
    attempt = 0
    while True:
        try:
            return _get(url)
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                return None
            if e.code in (429, 503) and attempt < len(BACKOFFS):
                time.sleep(BACKOFFS[attempt]); attempt += 1; continue
            return None
        except Exception:
            if attempt < len(BACKOFFS):
                time.sleep(BACKOFFS[attempt]); attempt += 1; continue
            return None


def load_app_data():
    return json.loads(APP_DATA.read_text(encoding="utf-8"))


def anchor_set(data):
    anchors = set()
    for x in data["destinations"].values():
        a = x.get("anchor_airport")
        if a:
            anchors.add(a)
        if x.get("tier") == "airport" and x.get("iata"):
            anchors.add(x["iata"])
    anchors.discard(None)
    return anchors


def _airport_meta(data, anchors):
    """Best-effort name/coords for anchor IATA codes, from airport-tier dests, so
    Vueling-only origins show a name in the picker (merged by sync-data)."""
    meta = {}
    for x in data["destinations"].values():
        if x.get("tier") == "airport" and x.get("iata") in anchors:
            c = x["iata"]
            meta[c] = {"name": x.get("name"), "city": x.get("city") or x.get("name"),
                       "country": x.get("country"),
                       "lat": x.get("lat"), "lon": x.get("lon")}
    return meta


def _chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


# --------------------------------------------------------------------------- #
#  Phase 1: route discovery via bestPrices (one+ call per origin)
# --------------------------------------------------------------------------- #
def build_graph(limit=None):
    data = load_app_data()
    anchors = sorted(anchor_set(data))
    AIRPORTS_CACHE.write_text(
        json.dumps(_airport_meta(data, set(anchors)), ensure_ascii=False, indent=0),
        encoding="utf-8")

    graph = json.loads(GRAPH_CACHE.read_text(encoding="utf-8")) if GRAPH_CACHE.exists() else {}
    done = set(graph.pop("_done", []))
    origins = [o for o in anchors if o not in done]
    if limit:
        origins = origins[:limit]
        print(f"  (limited to {limit} origins this run)")
    start = date.today().isoformat()
    print(f"discovering Vueling routes from {len(origins)} origins "
          f"({len(done)} already done) over {len(anchors)} candidate anchors ...")

    for i, o in enumerate(origins, 1):
        served = set()
        for chunk in _chunks([a for a in anchors if a != o], DEST_CHUNK):
            payload = _get_backoff(BEST_URL.format(o=o, dests=",".join(chunk), start=start))
            if payload:
                for v in payload.get("bestPrices", {}).get("value", []):
                    d = v.get("destinationCode")
                    if d and d != o:
                        served.add(d)
            time.sleep(DELAY_S)
        if served:
            graph[o] = sorted(served)
        done.add(o)
        if i % 20 == 0 or i == len(origins):
            out = dict(graph); out["_done"] = sorted(done)
            GRAPH_CACHE.write_text(json.dumps(out, indent=0), encoding="utf-8")
            print(f"  ...{i}/{len(origins)} origins probed, "
                  f"{len(graph)} with routes, flushed")

    out = dict(graph); out["_done"] = sorted(done)
    GRAPH_CACHE.write_text(json.dumps(out, indent=0), encoding="utf-8")
    edges = sum(len(v) for v in graph.values())
    print(f"route discovery complete: {len(graph)} Vueling origins, {edges} directed edges")


def load_graph():
    if not GRAPH_CACHE.exists():
        sys.exit("no route graph; run `python harvest_vueling.py graph` first")
    g = json.loads(GRAPH_CACHE.read_text(encoding="utf-8"))
    g.pop("_done", None)
    return g


def origin_anchor_pairs(data, graph):
    """(origin, anchor) where Vueling flies it AND anchor is a catalogue anchor."""
    anchors = anchor_set(data)
    pairs = set()
    for origin, dests in graph.items():
        for a in dests:
            if a in anchors:
                pairs.add((origin, a))
    return sorted(pairs)


def _distinct_legs(pairs):
    """Each ordered (o,a) needs leg o->a (out) and a->o (ret). Vueling routes are
    bidirectional, so collect the unique directional legs to fetch once each."""
    legs = set()
    for o, a in pairs:
        legs.add((o, a)); legs.add((a, o))
    return sorted(legs)


# --------------------------------------------------------------------------- #
#  Phase 2: availability harvest (one call = full calendar for a leg)
# --------------------------------------------------------------------------- #
def _parse_availability(payload, start, end):
    """{day: eur} cheapest direct bookable fare per day, clipped to the window."""
    out = {}
    for v in ((payload or {}).get("availability") or {}).get("value", []):
        if v.get("isInvalidPrice") or v.get("connectionFlight") or v.get("isConnectionFlight"):
            continue
        p = v.get("price")
        if p is None or p <= 0:
            continue
        day = (v.get("departureDate") or "")[:10]
        if not day or day < start or day > end:
            continue
        pr = round(float(p), 2)
        prev = out.get(day)
        if prev is None or pr < prev:
            out[day] = pr
    return dict(sorted(out.items()))


def harvest(limit=None):
    data = load_app_data()
    graph = load_graph()
    meta = data["meta"]
    start, end = meta["start_date"], meta["end_date"]
    window = f"{start}..{end}"
    pairs = origin_anchor_pairs(data, graph)
    legs = _distinct_legs(pairs)
    if limit:
        legs = legs[:limit]
        print(f"  (limited to first {limit} legs this run)")

    cache = json.loads(FARE_CACHE.read_text(encoding="utf-8")) if FARE_CACHE.exists() else {}
    if cache.get("_window") != window:
        cache = {"_window": window}
        print(f"  window changed -> {window}; starting a fresh fare cache")

    todo = [(f"{o}|{d}", o, d) for (o, d) in legs if f"{o}|{d}" not in cache]
    print(f"{len(pairs)} route-pairs -> {len(legs)} distinct legs; "
          f"{len(cache) - 1} cached, {len(todo)} to fetch (workers={WORKERS}, delay={DELAY_S}s)")

    lock = threading.Lock()
    done = [0]

    def run(job):
        key, o, d = job
        payload = _get_backoff(AVAIL_URL.format(o=o, d=d))
        result = _parse_availability(payload, start, end)
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
            for _ in as_completed([ex.submit(run, job) for job in todo]):
                pass

    FARE_CACHE.write_text(json.dumps(cache, indent=0), encoding="utf-8")
    print(f"harvest complete: {len(cache) - 1} legs in cache")


# --------------------------------------------------------------------------- #
#  Phase 3: merge (cheapest-wins) into data["fares"]
# --------------------------------------------------------------------------- #
def _merge_leg(rec, side, src_eur):
    """Cheapest-wins per day. A day held by the Travelpayouts cache ("TP") is
    also reclaimed at EQUAL price: a cached quote must never beat a direct one
    it does not undercut."""
    dst = rec.setdefault(side, {})
    tag = rec.get(side + "_c") or {}
    added = undercut = kept = 0
    for day, eur in src_eur.items():
        cur = dst.get(day)
        if cur is None:
            dst[day] = eur; tag[day] = CARRIER; added += 1
        elif eur < cur - 0.005 or (tag.get(day) == "TP" and eur <= cur + 0.005):
            dst[day] = eur; tag[day] = CARRIER; undercut += 1
            for suf in ("_o", "_x"):
                m = rec.get(side + suf)
                if m and m.pop(day, None) is not None and not m:
                    del rec[side + suf]
        else:
            kept += 1
    if tag:
        rec[side + "_c"] = tag
    return added, undercut, kept


def patch(dry_run=False):
    if not FARE_CACHE.exists():
        sys.exit("no fare cache; run harvest first")
    cache = json.loads(FARE_CACHE.read_text(encoding="utf-8"))
    data = load_app_data()
    graph = load_graph()
    meta = data["meta"]
    pairs = origin_anchor_pairs(data, graph)

    fares = data.get("fares") or {}
    had_prior = bool(fares)
    new_routes = 0
    tot_added = tot_undercut = tot_kept = 0

    obs = int(time.time() // 86400)   # contract A `o`, unix epoch days
    for origin, anchor in pairs:
        out_eur = cache.get(f"{origin}|{anchor}") or {}
        ret_eur = cache.get(f"{anchor}|{origin}") or {}
        if not out_eur and not ret_eur:
            continue
        anchor_col = fares.setdefault(anchor, {})
        existed = origin in anchor_col
        # Contract A: created routes get this harvester's source code; records
        # merged into keep their base source and only get `o` bumped on touch.
        rec = anchor_col.setdefault(origin, {"out": {}, "ret": {},
                                             "s": CARRIER, "o": obs})
        a1, u1, k1 = _merge_leg(rec, "out", out_eur)
        a2, u2, k2 = _merge_leg(rec, "ret", ret_eur)
        if a1 + a2 + u1 + u2:
            rec["o"] = obs
        if not existed and (rec.get("out") or rec.get("ret")):
            new_routes += 1
        tot_added += a1 + a2; tot_undercut += u1 + u2; tot_kept += k1 + k2

    all_origins = sorted({o for a in fares.values() for o in a})
    if dry_run:
        print("\n--- DRY RUN (nothing written) ---")
        print(f"existing table had prior fares: {had_prior}")
        print(f"Vueling would ADD {new_routes} brand-new (anchor,origin) routes")
        print(f"day-prices: {tot_added} added, {tot_undercut} undercut existing, "
              f"{tot_kept} kept (existing already cheaper/equal)")
        print(f"distinct origins after merge: {len(all_origins)} "
              f"(was {len(meta.get('all_origins') or [])})")
        return

    data["fares"] = dict(sorted((k, dict(sorted(v.items()))) for k, v in fares.items()))
    meta["all_origins"] = all_origins
    meta["fares_model_vueling"] = {
        "method": ("real per-day Vueling fares (apiw availability, native EUR) from "
                   "every Vueling origin to every catalogue anchor, merged "
                   "cheapest-wins into `fares`; days Vueling wins tagged VY in "
                   "out_c/ret_c. Runs AFTER the Ryanair and Wizz patches."),
        "fare_model": FARE_MODEL,
        "currency": CURRENCY,
        "window": f"{meta['start_date']}..{meta['end_date']}",
        "new_routes_added": new_routes,
        "days_added": tot_added,
        "days_undercut": tot_undercut,
        "harvested_from": date.today().isoformat(),
    }
    APP_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    size_mb = APP_DATA.stat().st_size / 1e6
    print(f"patched Vueling fares: +{new_routes} new routes, {tot_added} day-prices added, "
          f"{tot_undercut} undercut existing, {tot_kept} kept")
    print(f"distinct origins now {len(all_origins)}; app_data.json is {size_mb:.1f} MB")


def stats():
    data = load_app_data()
    graph = load_graph() if GRAPH_CACHE.exists() else None
    anchors = anchor_set(data)
    print(f"catalogue anchors: {len(anchors)}")
    if graph is None:
        print("(no route graph cached yet - run `graph` first)")
        return
    pairs = origin_anchor_pairs(data, graph)
    legs = _distinct_legs(pairs)
    origins = sorted({o for o, _ in pairs})
    reach = sorted({a for _, a in pairs})
    print(f"Vueling origins that reach an anchor: {len(origins)}")
    print(f"catalogue anchors Vueling serves:     {len(reach)}/{len(anchors)}")
    print(f"ordered (origin,anchor) pairs:        {len(pairs)}")
    print(f"distinct availability calls (legs):   {len(legs)}")
    print(f"est. wall-clock @ {DELAY_S}s/{WORKERS}w: {len(legs) * DELAY_S / max(1, WORKERS) / 3600:.1f} h")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    arg2 = sys.argv[2] if len(sys.argv) > 2 else None
    lim = int(arg2) if arg2 and arg2.isdigit() else None
    if cmd == "graph":
        build_graph(limit=lim)
    elif cmd == "harvest":
        harvest(limit=lim)
    elif cmd == "patch":
        patch(dry_run="--dry-run" in sys.argv)
    elif cmd == "stats":
        stats()
    elif cmd == "all":
        if not GRAPH_CACHE.exists():
            build_graph()
        harvest()
        patch()
    else:
        sys.exit(f"unknown command: {cmd}\n" + __doc__)
