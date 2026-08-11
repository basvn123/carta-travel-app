"""harvest_volotea.py - harvest REAL Volotea cheapest fares from every Volotea
origin to every catalogue anchor and MERGE them (cheapest-wins) into the shared
top-level `fares` table, tagging the days Volotea wins as "V7".

How Volotea is reachable (endpoint found via a headless-browser capture, but the
harvest itself needs NO browser - it is a plain public JSON POST with a STATIC
api key baked into the site's JS):
  POST https://api.volotea.com/voe/price/v1/Cache/getminprice
    header  x-api-key: <static key, see KEY below>
    body    {"AppId":..,"AppKey":KEY,"RestRequest":{"Url":"markets","Content":[
              {"MarketValue":"BCN-*","MarketType":"SSS-*","FareType":"R",
               "StartDate":"YYYY-MM-DD","EndDate":"YYYY-MM-DD","AnyPeriod":true,
               "PriceWithFee":true,"MaxResults":"400"}, ...]}}
  One spec with MarketValue "ORIGIN-*" returns the cheapest fare to EVERY
  destination Volotea flies from ORIGIN within [StartDate,EndDate]; several specs
  can be batched in one POST (Content is a parallel array). Prices are EUR.

IMPORTANT granularity note (differs from Ryanair/Wizz/Vueling):
  getminprice is a MIN-PRICE-PER-WINDOW endpoint, not a full per-day calendar,
  and only prices FareType "R" (one-way "OW" returns nothing). So we sample the
  fare window in chunks (WINDOW_DAYS each) and keep the cheapest fare + its real
  DepartureFlightDate per chunk. That yields several priced days per route (one
  per chunk), not all ~150 - enough to place Volotea on the map and undercut, but
  coarser than the daily calendars. Volotea's per-day availability endpoint is
  session-gated behind the booking flow; getminprice is the clean public one.

Why only Volotea (among easyJet / Brussels / Volotea after Vueling):
  easyJet = Akamai 403 even headless; Brussels = Lufthansa session-gated. Volotea
  runs a Navitaire backend whose min-price cache answers anonymous plain HTTP.

Merge model (shared `fares` table, same as harvest_wizzair/vueling):
  Reads whatever is already in data["fares"] (Ryanair+Wizz+Vueling) and keeps the
  cheaper price per (anchor, origin, day). Days Volotea wins (or Volotea-only
  routes) are tagged "V7" in a sparse out_c/ret_c map. MUST run AFTER those
  patches - run_pipeline sequences it last.

Caches (idempotent / resumable):
  cache/volotea_route_graph.json  {origin: [served anchor codes]}  (+ _done)
  cache/volotea_airports.json     {iata: {name, city, country, lat, lon}}
  cache/volotea_fare_cache.json   {_window, _calls:{...}, legs:{"frm|to":{day:eur}}}

Run:
  python harvest_volotea.py graph [N]      # discover served routes (resume; N-origin cap)
  python harvest_volotea.py harvest [N]    # harvest windowed cheapest fares (resume; N-origin cap)
  python harvest_volotea.py patch [--dry-run]  # merge EUR fares into data["fares"]
  python harvest_volotea.py all
  python harvest_volotea.py stats

Tuning via env:
  HARVEST_DELAY (default 1.2)   VOLOTEA_WINDOW_DAYS (default 14)
"""
import json, os, sys, time, urllib.request, urllib.error, ssl, gzip
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "cache"
GRAPH_CACHE = CACHE_DIR / "volotea_route_graph.json"
AIRPORTS_CACHE = CACHE_DIR / "volotea_airports.json"
FARE_CACHE = CACHE_DIR / "volotea_fare_cache.json"
APP_DATA = ROOT / "app_data" / "app_data.json"

CURRENCY = "EUR"
CARRIER = "V7"                       # Volotea IATA code
FARE_MODEL = "volotea_getminprice_all_origins"
URL = "https://api.volotea.com/voe/price/v1/Cache/getminprice"
KEY = "d0b1a5564d0f7d37baee678ea5-vocms"   # static, baked into volotea.com JS
APP_ID = "09c45c37"
WINDOW_DAYS = int(os.environ.get("VOLOTEA_WINDOW_DAYS", "14"))
DISCOVERY_BATCH = 12                 # specs (origins) per discovery POST
DELAY_S = float(os.environ.get("HARVEST_DELAY", "1.2"))
BACKOFFS = [30, 60, 120]

_CTX = ssl.create_default_context()
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"),
    "Accept": "application/json", "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate", "x-api-key": KEY,
    "Origin": "https://www.volotea.com", "Referer": "https://www.volotea.com/",
}


def _spec(market, sd, ed):
    return {"AnyPeriod": True, "MarketType": "SSS-*", "MarketValue": market,
            "PriceWithFee": True, "RepeatMarkets": False, "IsWeekend": False,
            "EndDate": ed, "FareType": "R", "MaxResults": "400", "StartDate": sd}


def _post(specs):
    """Returns the Content array (one element per spec) or None on failure."""
    body = json.dumps({"AppId": APP_ID, "AppKey": KEY,
                       "RestRequest": {"Url": "markets", "Content": specs}}).encode()
    attempt = 0
    while True:
        try:
            req = urllib.request.Request(URL, data=body, headers=HEADERS, method="POST")
            with urllib.request.urlopen(req, timeout=45, context=_CTX) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return json.loads(raw).get("Content") or []
        except urllib.error.HTTPError as e:
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
    meta = {}
    for x in data["destinations"].values():
        if x.get("tier") == "airport" and x.get("iata") in anchors:
            c = x["iata"]
            meta[c] = {"name": x.get("name"), "city": x.get("city") or x.get("name"),
                       "country": x.get("country"), "lat": x.get("lat"), "lon": x.get("lon")}
    return meta


def _entry_price(v):
    for k in ("PriceWithoutFee", "Price", "PriceWithFee"):
        p = v.get(k)
        if p:
            return round(float(p), 2)
    return None


def date_chunks(start_iso, end_iso, n):
    from datetime import date as _d, timedelta
    s, e = _d.fromisoformat(start_iso), _d.fromisoformat(end_iso)
    out, cur = [], s
    while cur <= e:
        ce = min(cur + timedelta(days=n - 1), e)
        out.append((cur.isoformat(), ce.isoformat()))
        cur = ce + timedelta(days=1)
    return out


# --------------------------------------------------------------------------- #
#  Phase 1: route discovery (one wide-window spec per origin, batched)
# --------------------------------------------------------------------------- #
def build_graph(limit=None):
    data = load_app_data()
    anchors = sorted(anchor_set(data))
    AIRPORTS_CACHE.write_text(
        json.dumps(_airport_meta(data, set(anchors)), ensure_ascii=False, indent=0),
        encoding="utf-8")
    meta = data["meta"]
    start, end = meta["start_date"], meta["end_date"]
    anchor_ok = set(anchors)

    graph = json.loads(GRAPH_CACHE.read_text(encoding="utf-8")) if GRAPH_CACHE.exists() else {}
    done = set(graph.pop("_done", []))
    todo = [a for a in anchors if a not in done]
    if limit:
        todo = todo[:limit]
    print(f"discovering Volotea routes from {len(todo)} origins "
          f"({len(done)} done) over {len(anchors)} candidate anchors ...")

    for i in range(0, len(todo), DISCOVERY_BATCH):
        batch = todo[i:i + DISCOVERY_BATCH]
        content = _post([_spec(f"{o}-*", start, end) for o in batch])
        if content is not None:
            for o, block in zip(batch, content):
                served = set()
                for v in (block.get("Value") or []):
                    parts = (v.get("Market") or "").split("-")
                    if len(parts) == 2 and parts[1] in anchor_ok and parts[1] != o:
                        served.add(parts[1])
                if served:
                    graph[o] = sorted(served)
                done.add(o)
        out = dict(graph); out["_done"] = sorted(done)
        GRAPH_CACHE.write_text(json.dumps(out, indent=0), encoding="utf-8")
        print(f"  ...{min(i + DISCOVERY_BATCH, len(todo))}/{len(todo)} probed, "
              f"{len(graph)} origins with routes")
        time.sleep(DELAY_S)

    edges = sum(len(v) for v in graph.values())
    print(f"route discovery complete: {len(graph)} Volotea origins, {edges} directed edges")


def load_graph():
    if not GRAPH_CACHE.exists():
        sys.exit("no route graph; run `python harvest_volotea.py graph` first")
    g = json.loads(GRAPH_CACHE.read_text(encoding="utf-8"))
    g.pop("_done", None)
    return g


def origin_anchor_pairs(data, graph):
    anchors = anchor_set(data)
    pairs = set()
    for origin, dests in graph.items():
        for a in dests:
            if a in anchors:
                pairs.add((origin, a))
    return sorted(pairs)


# --------------------------------------------------------------------------- #
#  Phase 2: windowed cheapest harvest (all windows for an origin in one POST)
# --------------------------------------------------------------------------- #
def harvest(limit=None):
    data = load_app_data()
    graph = load_graph()
    meta = data["meta"]
    start, end = meta["start_date"], meta["end_date"]
    window = f"{start}..{end}"
    anchor_ok = anchor_set(data)
    windows = date_chunks(start, end, WINDOW_DAYS)

    cache = json.loads(FARE_CACHE.read_text(encoding="utf-8")) if FARE_CACHE.exists() else {}
    if cache.get("_window") != window:
        cache = {"_window": window, "_calls": {}, "legs": {}}
        print(f"  window changed -> {window}; fresh fare cache")
    legs = cache.setdefault("legs", {})
    calls = cache.setdefault("_calls", {})

    origins = sorted(graph)
    if limit:
        origins = origins[:limit]
    todo = [o for o in origins if o not in calls]
    print(f"{len(origins)} Volotea origins x {len(windows)} windows ({WINDOW_DAYS}d); "
          f"{len(calls)} origins cached, {len(todo)} to fetch")

    for n, o in enumerate(todo, 1):
        content = _post([_spec(f"{o}-*", cs, ce) for (cs, ce) in windows])
        if content is not None:
            for block in content:
                for v in (block.get("Value") or []):
                    parts = (v.get("Market") or "").split("-")
                    if len(parts) != 2 or parts[0] != o or parts[1] not in anchor_ok:
                        continue
                    d = parts[1]
                    day = (v.get("DepartureFlightDate") or "")[:10]
                    price = _entry_price(v)
                    if not day or price is None or day < start or day > end:
                        continue
                    leg = legs.setdefault(f"{o}|{d}", {})
                    if day not in leg or price < leg[day]:
                        leg[day] = price
            calls[o] = True
        if n % 10 == 0 or n == len(todo):
            FARE_CACHE.write_text(json.dumps(cache, indent=0), encoding="utf-8")
            print(f"  ...{n}/{len(todo)} origins fetched, {len(legs)} legs, flushed")
        time.sleep(DELAY_S)

    FARE_CACHE.write_text(json.dumps(cache, indent=0), encoding="utf-8")
    print(f"harvest complete: {len(legs)} priced legs in cache")


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
    legs = (json.loads(FARE_CACHE.read_text(encoding="utf-8")) or {}).get("legs") or {}
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
        out_eur = legs.get(f"{origin}|{anchor}") or {}
        ret_eur = legs.get(f"{anchor}|{origin}") or {}
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
        print(f"Volotea would ADD {new_routes} brand-new (anchor,origin) routes")
        print(f"day-prices: {tot_added} added, {tot_undercut} undercut existing, "
              f"{tot_kept} kept (existing already cheaper/equal)")
        print(f"distinct origins after merge: {len(all_origins)} "
              f"(was {len(meta.get('all_origins') or [])})")
        return

    data["fares"] = dict(sorted((k, dict(sorted(v.items()))) for k, v in fares.items()))
    meta["all_origins"] = all_origins
    meta["fares_model_volotea"] = {
        "method": ("Volotea cheapest fares (apiw getminprice, native EUR, FareType R) "
                   "sampled per date window and merged cheapest-wins into `fares`; days "
                   "Volotea wins tagged V7 in out_c/ret_c. Coarser than the daily "
                   "calendars (one cheapest day per window). Runs after Ryanair/Wizz/Vueling."),
        "fare_model": FARE_MODEL,
        "currency": CURRENCY,
        "window_days": WINDOW_DAYS,
        "window": f"{meta['start_date']}..{meta['end_date']}",
        "new_routes_added": new_routes,
        "days_added": tot_added,
        "days_undercut": tot_undercut,
        "harvested_from": date.today().isoformat(),
    }
    APP_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    size_mb = APP_DATA.stat().st_size / 1e6
    print(f"patched Volotea fares: +{new_routes} new routes, {tot_added} day-prices added, "
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
    windows = date_chunks(data["meta"]["start_date"], data["meta"]["end_date"], WINDOW_DAYS)
    origins = sorted(graph)
    reach = sorted({a for _, a in pairs})
    print(f"Volotea origins with routes:       {len(origins)}")
    print(f"catalogue anchors Volotea serves:  {len(reach)}/{len(anchors)}")
    print(f"ordered (origin,anchor) pairs:     {len(pairs)}")
    print(f"harvest calls (1/origin, {len(windows)} windows batched): {len(origins)}")


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
