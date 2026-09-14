"""harvest_wizzair.py - harvest REAL Wizz Air per-day fares from every Wizz
origin to every catalogue anchor, convert them to EUR, and MERGE them into the
same top-level `fares` table Ryanair fills (cheapest-wins), tagging the days
Wizz actually won so the app can later show the operating carrier.

Why this exists (and why Wizz specifically):
  Of the big European low-cost carriers, only Ryanair (harvest_all_origins.py)
  and Wizz Air expose an unauthenticated public fare endpoint that a plain HTTP
  client can read. easyJet / Norwegian / Brussels Airlines sit behind Akamai /
  bot walls, and Vueling behind a Navitaire session-token backend, so they are
  not harvestable this way (use the Apify aggregator for those). Wizz's route
  network is heavily Central/Eastern Europe + the Balkans, so it both undercuts
  Ryanair on shared routes and adds origins Ryanair never flies.

How it stays cheap:
  Wizz's `search/timetable` returns a whole date RANGE for BOTH directions in a
  single call, so one request covers ~a month of out+ret fares for a city pair.
  We fetch the real route map first and only price (origin -> anchor) pairs that
  actually fly AND land at a catalogue anchor, exactly like the Ryanair graph.

Merge model (shared `fares` table):
  data["fares"] = { "<anchor>": { "<origin>": {"out": {...}, "ret": {...},
                                                "out_c": {day: "W6"}, ... } } }
  This script reads whatever is already in data["fares"] (normally the fresh
  Ryanair table) and, per (anchor, origin, day), keeps the cheaper price. Days
  Wizz wins (or Wizz-only routes) are tagged "W6" in a sparse out_c/ret_c map;
  Ryanair-won days stay untagged (the app's existing default). So this MUST run
  AFTER the Ryanair fares patch - run_pipeline sequences it that way.

Schedule capture (out_f / ret_f):
  The timetable endpoint returns one row per DAY: one price (that day's
  cheapest) plus `departureDates`, the local departure time of EVERY flight
  Wizz operates that day. The price is therefore day-level and there is no
  per-flight price here; the times, however, are per-flight, and they are the
  free schedule signal. Days Wizz wins carry them as
  out_f/ret_f = {day: "HH:MM,HH:MM"}, always describing the carrier named in
  out_c/ret_c for that day, so the field stays correct once other carriers
  fill their own days. Days with times but no bookable price are still
  dropped: the fare table never gains a day you cannot buy.

Caches (idempotent / resumable):
  cache/wizzair_meta.json         {version, date}   current API version
  cache/wizzair_airports.json     {iata: {name, city, country, lat, lon, currency}}
  cache/wizzair_route_graph.json  {origin: [reachable dest codes]}
  cache/wizz_fare_cache.json      {"lo|hi|chunkStart": {"o": {...}, "r": {...},
                                   "v": 2}, _window}; a leg map is
                                   {day: [amount, currency, "HH:MM,HH:MM"]},
                                   the third field being every departure time
                                   Wizz operates that day (absent in v1 blocks)
  cache/fx_rates_eur.json         {date, rates}      EUR -> currency table

Run:
  python harvest_wizzair.py graph          # (re)fetch route map + airports
  python harvest_wizzair.py harvest [N]    # harvest fares (resume; optional N-pair cap)
  python harvest_wizzair.py harvest --refresh-times   # also re-fetch pre-schedule
                                           #   (v1) blocks, which a plain resume skips
  python harvest_wizzair.py patch [--dry-run]  # merge EUR fares into data["fares"]
  python harvest_wizzair.py all            # graph (if missing) + harvest + patch
  python harvest_wizzair.py stats          # print scope without harvesting

Tuning via env:
  HARVEST_DELAY    base delay between calls, seconds (default 1.5)
  HARVEST_WORKERS  parallel fetchers (default 1; Wizz 429s more readily than Ryanair)
"""
import json, os, re, sys, time, threading, urllib.request, urllib.error, ssl, gzip
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from pathlib import Path
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "cache"
META_CACHE = CACHE_DIR / "wizzair_meta.json"
AIRPORTS_CACHE = CACHE_DIR / "wizzair_airports.json"
GRAPH_CACHE = CACHE_DIR / "wizzair_route_graph.json"
FARE_CACHE = CACHE_DIR / "wizz_fare_cache.json"
FX_CACHE = CACHE_DIR / "fx_rates_eur.json"
APP_DATA = ROOT / "app_data" / "app_data.json"

CURRENCY = "EUR"
CARRIER = "W6"                       # Wizz Air IATA code (tag for days it wins)
FARE_MODEL = "wizzair_timetable_all_origins"
CHUNK_DAYS = 28                      # timetable caps the from..to span; 28 is safe
CACHE_V = 2                          # fare-cache block schema (2 = carries departure times)
WIZZ_HOST = "https://be.wizzair.com"
WIZZ_SITE = "https://wizzair.com"
FX_URL = "https://open.er-api.com/v6/latest/EUR"

DELAY_S = float(os.environ.get("HARVEST_DELAY", "1.5"))
WORKERS = int(os.environ.get("HARVEST_WORKERS", "1"))
BACKOFFS = [30, 60, 120]

_CTX = ssl.create_default_context()
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-GB,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Origin": WIZZ_SITE,
    "Referer": WIZZ_SITE + "/en-gb/flights/timetable",
    "sec-ch-ua": '"Chromium";v="125", "Not.A/Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
}


# --------------------------------------------------------------------------- #
#  HTTP
# --------------------------------------------------------------------------- #
def _read(resp):
    raw = resp.read()
    if resp.headers.get("Content-Encoding") == "gzip":
        raw = gzip.decompress(raw)
    return raw


def _get(url, timeout=40):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as r:
        return _read(r)


def _get_json(url, timeout=40):
    return json.loads(_get(url, timeout))


def _post_json(url, body, timeout=40):
    data = json.dumps(body).encode()
    h = dict(HEADERS); h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as r:
        return json.loads(_read(r))


def load_app_data():
    return json.loads(APP_DATA.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- #
#  API version discovery (Wizz bumps the /{version}/Api path continuously)
# --------------------------------------------------------------------------- #
def get_version(force=False):
    today = date.today().isoformat()
    if not force and META_CACHE.exists():
        try:
            m = json.loads(META_CACHE.read_text(encoding="utf-8"))
            if m.get("date") == today and m.get("version"):
                return m["version"]
        except Exception:
            pass
    html = _get(WIZZ_SITE + "/en-gb").decode("utf-8", "replace")
    found = sorted(set(re.findall(r"be\.wizzair\.com/(\d+\.\d+\.\d+)/Api", html)))
    if not found:
        raise RuntimeError("could not discover Wizz API version from the site")
    version = found[-1]
    atomic_write_json(META_CACHE, {"version": version, "date": today}, indent=None, ensure_ascii=True)
    print(f"  Wizz API version {version}")
    return version


def api_base():
    return f"{WIZZ_HOST}/{get_version()}/Api"


# --------------------------------------------------------------------------- #
#  FX: Wizz prices come in the departure market's currency; normalise to EUR
# --------------------------------------------------------------------------- #
def load_fx():
    today = date.today().isoformat()
    if FX_CACHE.exists():
        try:
            c = json.loads(FX_CACHE.read_text(encoding="utf-8"))
            if c.get("date") == today and c.get("rates"):
                return c["rates"]
        except Exception:
            pass
    payload = _get_json(FX_URL)
    rates = payload.get("rates") or {}
    if "EUR" not in rates:
        raise RuntimeError("FX feed missing EUR base")
    atomic_write_json(FX_CACHE, {"date": today, "rates": rates}, indent=None, ensure_ascii=True)
    print(f"  FX rates refreshed ({len(rates)} currencies)")
    return rates


def to_eur(amount, cur, rates):
    if amount is None or amount <= 0:
        return None
    r = rates.get(cur)
    if not r:
        return None
    return round(float(amount) / float(r), 2)


# --------------------------------------------------------------------------- #
#  Catalogue anchors (shared definition with the Ryanair harvester)
# --------------------------------------------------------------------------- #
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


# --------------------------------------------------------------------------- #
#  Phase 1: route map -> airports + graph
# --------------------------------------------------------------------------- #
def build_graph():
    print("fetching Wizz route map ...")
    mp = _get_json(api_base() + "/asset/map?languageCode=en-gb")
    cities = mp.get("cities") or []
    airports, graph = {}, {}
    for c in cities:
        code = c.get("iata")
        if not code or c.get("isFakeStation"):
            continue
        airports[code] = {
            "name": c.get("shortName"),
            "city": c.get("shortName"),
            "country": c.get("countryName"),
            "lat": c.get("latitude"),
            "lon": c.get("longitude"),
            "currency": c.get("currencyCode"),
        }
        graph[code] = sorted({x.get("iata") for x in (c.get("connections") or [])
                              if x.get("iata")})
    # keep only edges to real (non-fake) stations we know
    known = set(airports)
    graph = {o: [d for d in dests if d in known] for o, dests in graph.items()}
    atomic_write_json(AIRPORTS_CACHE, airports, indent=0, ensure_ascii=False)
    atomic_write_json(GRAPH_CACHE, graph, indent=0, ensure_ascii=True)
    edges = sum(len(v) for v in graph.values())
    print(f"  {len(airports)} airports, {edges} directed edges "
          f"-> {GRAPH_CACHE.name}")


def load_graph():
    if not GRAPH_CACHE.exists():
        sys.exit("no route graph; run `python harvest_wizzair.py graph` first")
    return json.loads(GRAPH_CACHE.read_text(encoding="utf-8"))


def origin_anchor_pairs(data, graph):
    """Real (origin, anchor) pairs: Wizz flies origin -> anchor AND anchor is a
    catalogue destination anchor."""
    anchors = anchor_set(data)
    pairs = set()
    for origin, dests in graph.items():
        for a in dests:
            if a in anchors:
                pairs.add((origin, a))
    return sorted(pairs)


def unordered_pairs(pairs):
    """One timetable call per physical city pair covers both directions, so
    collapse (o,a)/(a,o) to a single {lo,hi} fetch."""
    s = set()
    for o, a in pairs:
        s.add((o, a) if o < a else (a, o))
    return sorted(s)


def date_chunks(start_iso, end_iso, n=CHUNK_DAYS):
    s, e = date.fromisoformat(start_iso), date.fromisoformat(end_iso)
    out, cur = [], s
    while cur <= e:
        ce = min(cur + timedelta(days=n - 1), e)
        out.append((cur.isoformat(), ce.isoformat()))
        cur = ce + timedelta(days=1)
    return out


# --------------------------------------------------------------------------- #
#  Phase 2: fare harvest (timetable = date range, both directions, one call)
# --------------------------------------------------------------------------- #
def _parse_timetable(flights):
    """[{departureDate, departureDates, price:{amount,currencyCode}, priceType}]
    -> {day: [amt, cur, "HH:MM,HH:MM"]}, real bookable fares only.

    The endpoint returns ONE row per day, not per flight: `price` is that day's
    cheapest across every departure, while `departureDates` lists the local
    departure time of each flight Wizz actually operates that day. So the price
    here is unavoidably day-level (there is no per-flight price on the timetable
    endpoint), but the TIMES are per-flight, and they are the free schedule
    signal this parser exists to keep. Times are unioned across a day's rows,
    because they describe the day's service rather than whichever row happened
    to carry the cheapest fare.

    A day with times but no bookable price is still dropped, exactly as before:
    the fare table must never gain a day you cannot buy.
    """
    prices, times = {}, {}
    for f in flights or []:
        pt = f.get("priceType")
        if pt not in (None, "price"):
            continue
        day = (f.get("departureDate") or "")[:10]
        if not day:
            continue
        for stamp in f.get("departureDates") or []:
            hhmm = str(stamp)[11:16]
            if len(hhmm) == 5 and hhmm[2] == ":":
                times.setdefault(day, set()).add(hhmm)
        p = f.get("price") or {}
        amt = p.get("amount")
        if amt is None or amt <= 0:
            continue
        cur = p.get("currencyCode")
        prev = prices.get(day)
        if prev is None or amt < prev[0]:
            prices[day] = [round(float(amt), 2), cur]
    for day, row in prices.items():
        t = times.get(day)
        if t:
            row.append(",".join(sorted(t)))
    return prices


def fetch_chunk(base, lo, hi, cs, ce):
    """{'o': {day:[amt,cur]}, 'r': {day:[amt,cur]}} for lo->hi (o) and hi->lo (r)."""
    body = {
        "flightList": [
            {"departureStation": lo, "arrivalStation": hi, "from": cs, "to": ce},
            {"departureStation": hi, "arrivalStation": lo, "from": cs, "to": ce},
        ],
        "priceType": "regular", "adultCount": 1, "childCount": 0, "infantCount": 0,
    }
    payload = _post_json(base + "/search/timetable", body)
    return {"o": _parse_timetable(payload.get("outboundFlights")),
            "r": _parse_timetable(payload.get("returnFlights")),
            "v": CACHE_V}


def _fetch_with_backoff(base, lo, hi, cs, ce):
    attempt = 0
    while True:
        try:
            return fetch_chunk(base, lo, hi, cs, ce)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"o": {}, "r": {}, "v": CACHE_V}
            if e.code in (429, 503) and attempt < len(BACKOFFS):
                time.sleep(BACKOFFS[attempt]); attempt += 1; continue
            return {"o": {}, "r": {}, "v": CACHE_V}
        except Exception:
            if attempt < len(BACKOFFS):
                time.sleep(BACKOFFS[attempt]); attempt += 1; continue
            return {"o": {}, "r": {}, "v": CACHE_V}


def harvest(limit=None, refresh_times=False):
    data = load_app_data()
    graph = load_graph()
    meta = data["meta"]
    start, end = meta["start_date"], meta["end_date"]
    window = f"{start}..{end}"
    chunks = date_chunks(start, end)
    upairs = unordered_pairs(origin_anchor_pairs(data, graph))
    if limit:
        upairs = upairs[:limit]
        print(f"  (limited to first {limit} city pairs for this run)")

    cache = json.loads(FARE_CACHE.read_text(encoding="utf-8")) if FARE_CACHE.exists() else {}
    if cache.get("_window") != window:
        # window rolled (fares refresh) -> the old cache is for stale dates
        cache = {"_window": window}
        print(f"  window changed -> {window}; starting a fresh fare cache")

    base = api_base()
    jobs = [(f"{lo}|{hi}|{cs}", lo, hi, cs, ce)
            for (lo, hi) in upairs for (cs, ce) in chunks]
    if refresh_times:
        # A v1 block holds the same prices but no departure times, so a plain
        # resume would skip it forever. Re-fetch those too; the request body is
        # unchanged, this only costs calls, never a different query.
        todo = [j for j in jobs
                if j[0] not in cache or (cache.get(j[0]) or {}).get("v", 1) < CACHE_V]
        stale = sum(1 for j in jobs
                    if j[0] in cache and (cache.get(j[0]) or {}).get("v", 1) < CACHE_V)
        print(f"  --refresh-times: {stale} cached blocks predate the schedule capture "
              f"and will be re-fetched")
    else:
        todo = [j for j in jobs if j[0] not in cache]
    print(f"{len(upairs)} city pairs x {len(chunks)} chunks -> {len(jobs)} calls; "
          f"{len(cache) - 1} cached, {len(todo)} to fetch (workers={WORKERS}, delay={DELAY_S}s)")

    lock = threading.Lock()
    done = [0]

    def run(job):
        key, lo, hi, cs, ce = job
        result = _fetch_with_backoff(base, lo, hi, cs, ce)
        with lock:
            cache[key] = result
            done[0] += 1
            if done[0] % 50 == 0:
                atomic_write_json(FARE_CACHE, cache, indent=0, ensure_ascii=True)
                print(f"  ...{done[0]}/{len(todo)} fetched, flushed")
        time.sleep(DELAY_S)

    if WORKERS <= 1:
        for job in todo:
            run(job)
    else:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            for _ in as_completed([ex.submit(run, job) for job in todo]):
                pass

    atomic_write_json(FARE_CACHE, cache, indent=0, ensure_ascii=True)
    print(f"harvest complete: {len(cache) - 1} chunk-legs in cache")


# --------------------------------------------------------------------------- #
#  Phase 3: convert to EUR + merge (cheapest-wins) into data["fares"]
# --------------------------------------------------------------------------- #
def _leg_eur(cache, chunks, frm, to, rates, start, end):
    """EUR {day: price} for frm->to, pulled from the shared unordered cache."""
    lo, hi = (frm, to) if frm < to else (to, frm)
    dirn = "o" if frm < to else "r"
    out = {}
    for cs, _ce in chunks:
        blk = cache.get(f"{lo}|{hi}|{cs}")
        if not blk:
            continue
        for day, row in (blk.get(dirn) or {}).items():
            # v1 blocks are [amt, cur]; v2 appends the day's departure times
            if start <= day <= end:
                eur = to_eur(row[0], row[1], rates)
                if eur is not None:
                    out[day] = eur
    return dict(sorted(out.items()))


def _leg_times(cache, chunks, frm, to, start, end):
    """{day: "HH:MM,HH:MM"} departure times for frm->to. Blocks harvested before
    CACHE_V 2 carry no times and simply contribute nothing, so a partially
    refreshed cache degrades to today's behaviour instead of erroring."""
    lo, hi = (frm, to) if frm < to else (to, frm)
    dirn = "o" if frm < to else "r"
    out = {}
    for cs, _ce in chunks:
        blk = cache.get(f"{lo}|{hi}|{cs}")
        if not blk:
            continue
        for day, row in (blk.get(dirn) or {}).items():
            if len(row) > 2 and row[2] and start <= day <= end:
                out[day] = row[2]
    return dict(sorted(out.items()))


def _merge_leg(rec, side, src_eur, src_times=None):
    """Keep the cheaper price per day; tag days Wizz wins in {side}_c. A day
    held by the Travelpayouts cache ("TP") is also reclaimed at EQUAL price,
    since a cached quote must never beat a direct one it does not undercut.

    Days Wizz wins also get its departure times in {side}_f ("HH:MM,HH:MM",
    every flight it operates that day). The invariant is that {side}_f[day]
    always describes the carrier named in {side}_c[day], so the app can never
    print one airline's departure times beside another airline's price. Each
    carrier enforces it over ITS OWN days only (clear-then-fill), which is what
    lets this patch and harvest_ryanair_schedules.py run in either order.

    Returns (added, undercut, kept) day counts for reporting."""
    dst = rec.setdefault(side, {})
    tag = rec.get(side + "_c") or {}
    freq = rec.get(side + "_f") or {}
    src_times = src_times or {}
    added = undercut = kept = 0

    def won(day):
        t = src_times.get(day)
        if t:
            freq[day] = t
        else:
            freq.pop(day, None)

    for day, eur in src_eur.items():
        cur = dst.get(day)
        if cur is None:
            dst[day] = eur; tag[day] = CARRIER; won(day); added += 1
        elif eur < cur - 0.005 or (tag.get(day) == "TP" and eur <= cur + 0.005):
            dst[day] = eur; tag[day] = CARRIER; won(day); undercut += 1
            # the day is direct-harvested again: its cached-quote provenance
            # (per-day observed/expires) no longer applies
            for suf in ("_o", "_x"):
                m = rec.get(side + suf)
                if m and m.pop(day, None) is not None and not m:
                    del rec[side + suf]
        else:
            kept += 1
    if tag:
        rec[side + "_c"] = tag
    # Clear-then-fill scoped to the days this carrier OWNS. A day another
    # carrier holds belongs to that carrier's own schedule patch (see
    # harvest_ryanair_schedules.apply_schedule), so deleting it here would
    # destroy that patch's work depending on which of the two ran last, and
    # the two are meant to be order independent. A day we still own but no
    # longer have a schedule for drops out, which is how a route Wizz stopped
    # flying loses its stale times.
    for day in [d for d in freq if tag.get(d) == CARRIER and d not in src_times]:
        del freq[day]
    if freq:
        rec[side + "_f"] = freq
    elif side + "_f" in rec:
        del rec[side + "_f"]
    return added, undercut, kept


def patch(dry_run=False):
    if not FARE_CACHE.exists():
        sys.exit("no fare cache; run harvest first")
    cache = json.loads(FARE_CACHE.read_text(encoding="utf-8"))
    data = load_app_data()
    graph = load_graph()
    rates = load_fx()
    meta = data["meta"]
    start, end = meta["start_date"], meta["end_date"]
    chunks = date_chunks(start, end)
    pairs = origin_anchor_pairs(data, graph)

    fares = data.get("fares") or {}
    had_ryanair = bool(fares)
    new_routes = 0
    tot_added = tot_undercut = tot_kept = 0
    save_examples = []

    tot_sched = 0                     # days that gained a Wizz schedule
    obs = int(time.time() // 86400)   # contract A `o`, unix epoch days
    for origin, anchor in pairs:
        out_eur = _leg_eur(cache, chunks, origin, anchor, rates, start, end)
        ret_eur = _leg_eur(cache, chunks, anchor, origin, rates, start, end)
        out_tim = _leg_times(cache, chunks, origin, anchor, start, end)
        ret_tim = _leg_times(cache, chunks, anchor, origin, start, end)
        if not out_eur and not ret_eur:
            continue
        anchor_col = fares.setdefault(anchor, {})
        existed = origin in anchor_col
        # Contract A: routes this harvester CREATES are stamped with its own
        # source code; merged-into records keep their base source (per-day
        # winners live in out_c/ret_c) and only get `o` bumped when touched.
        rec = anchor_col.setdefault(origin, {"out": {}, "ret": {},
                                             "s": CARRIER, "o": obs})
        a1, u1, k1 = _merge_leg(rec, "out", out_eur, out_tim)
        a2, u2, k2 = _merge_leg(rec, "ret", ret_eur, ret_tim)
        if a1 + a2 + u1 + u2:
            rec["o"] = obs
        if not existed and (rec.get("out") or rec.get("ret")):
            new_routes += 1
        tot_added += a1 + a2; tot_undercut += u1 + u2; tot_kept += k1 + k2
        tot_sched += len(rec.get("out_f") or {}) + len(rec.get("ret_f") or {})
        if u1 and len(save_examples) < 8:
            # find one representative undercut day for the report
            for day, eur in out_eur.items():
                save_examples.append((origin, anchor, day, eur))
                break

    all_origins = sorted({o for a in fares.values() for o in a})
    if dry_run:
        print("\n--- DRY RUN (nothing written) ---")
        print(f"existing table had Ryanair fares: {had_ryanair}")
        print(f"Wizz would ADD {new_routes} brand-new (anchor,origin) routes")
        print(f"day-prices: {tot_added} added, {tot_undercut} undercut Ryanair, "
              f"{tot_kept} kept (Ryanair already cheaper/equal)")
        print(f"day-schedules (out_f/ret_f) on Wizz-held days: {tot_sched}")
        print(f"distinct origins after merge: {len(all_origins)} "
              f"(was {len(meta.get('all_origins') or [])})")
        for o, a, day, eur in save_examples:
            print(f"  e.g. {o}->{a} {day}: Wizz EUR {eur}")
        return

    data["fares"] = dict(sorted((k, dict(sorted(v.items()))) for k, v in fares.items()))
    meta["all_origins"] = all_origins
    meta["fares_model_wizz"] = {
        "method": ("real per-day Wizz Air fares (search/timetable) from every Wizz "
                   "origin to every catalogue anchor, converted to EUR (open.er-api.com), "
                   "merged cheapest-wins into `fares`; days Wizz wins tagged W6 in "
                   "out_c/ret_c, and their departure times in out_f/ret_f "
                   "(\"HH:MM,HH:MM\", every flight Wizz operates that day). "
                   "Runs AFTER the Ryanair patch."),
        "fare_model": FARE_MODEL,
        "currency": CURRENCY,
        "window": f"{start}..{end}",
        "new_routes_added": new_routes,
        "days_added": tot_added,
        "days_undercut_ryanair": tot_undercut,
        "days_with_schedule": tot_sched,
        "harvested_from": date.today().isoformat(),
    }
    atomic_write_json(APP_DATA, data, indent=2, ensure_ascii=False)
    size_mb = APP_DATA.stat().st_size / 1e6
    print(f"patched Wizz fares: +{new_routes} new routes, {tot_added} day-prices added, "
          f"{tot_undercut} undercut Ryanair, {tot_kept} kept, "
          f"{tot_sched} days carry a Wizz schedule")
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
    upairs = unordered_pairs(pairs)
    chunks = date_chunks(data["meta"]["start_date"], data["meta"]["end_date"])
    origins = sorted({o for o, _ in pairs})
    reach_anchors = sorted({a for _, a in pairs})
    calls = len(upairs) * len(chunks)
    print(f"Wizz origins that reach an anchor: {len(origins)}")
    print(f"catalogue anchors Wizz serves:     {len(reach_anchors)}/{len(anchors)}")
    print(f"ordered (origin,anchor) pairs:     {len(pairs)}")
    print(f"unordered city pairs (1 call each): {len(upairs)}")
    print(f"date chunks ({CHUNK_DAYS}d):         {len(chunks)}")
    print(f"est. harvest calls:                {calls}")
    print(f"est. wall-clock @ {DELAY_S}s/{WORKERS}w: {calls * DELAY_S / max(1, WORKERS) / 3600:.1f} h")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "graph":
        build_graph()
    elif cmd == "harvest":
        lim = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
        harvest(limit=lim, refresh_times="--refresh-times" in sys.argv)
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
