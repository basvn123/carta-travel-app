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

Provenance (contract A, see SCHEMA.md "Fare provenance"):
  Every record written by `patch` carries `s` (source code, "FR" here) and `o`
  (unix epoch DAYS the prices were harvested). The Wizz/Vueling/Volotea merges
  stamp their own codes on routes they create and tag the days they win in
  out_c/ret_c; `patch` also folds in the Travelpayouts staging file
  data/derived/tp_fares.json (contract B) when it exists, tagging won days
  "TP" with per-day out_o/out_x (observed/expires, epoch days). A TP quote
  only ever wins a day it is strictly cheaper on (and the direct-carrier
  merges reclaim ties from TP), so cached third-party quotes can never
  displace an equal-or-cheaper direct fare. No staging file = no TP step.

Estimate fallback bands (the flight half of the "always an estimate" rule):
  `patch` also attaches e_out/e_ret to each route record: {YYYY-MM: eur}
  month-median (p50) one-way estimates from the estimation layer's export
  (data/models/fare_estimates.json.gz, src/estimation.model). These are
  route-LEVEL bands, deliberately not per-day fares: real bookable days stay
  the only entries in out/ret (so fare calendars never show invented
  flights), and the app reads a band ONLY when no stored day matches the
  traveller's dates, rendering it as "~EUR X est." (source "EST"). A few
  ints per route keep the wire slim. No export = no est step.

Run:
  python harvest_all_origins.py graph      # (re)fetch airports + route graph
  python harvest_all_origins.py harvest     # harvest fares (resumes cache)
  python harvest_all_origins.py patch       # write data["fares"] from cache
  python harvest_all_origins.py all         # graph (if missing) + harvest + patch
  python harvest_all_origins.py refresh     # roll window to [today..+HORIZON],
                                            #   drop fare cache, re-harvest + patch
  python harvest_all_origins.py stats       # print scope without harvesting
  python harvest_all_origins.py tp          # re-merge the Travelpayouts staging
                                            #   into the existing table (offline;
                                            #   run after a staging refresh)
  python harvest_all_origins.py est         # re-attach estimate fallback bands
                                            #   from the estimation export
                                            #   (offline; run after a retrain)

Tuning via env:
  HARVEST_DELAY   base delay between calls, seconds (default 1.2)
  HARVEST_WORKERS parallel fetchers (default 1; try 3-4 to cut wall-clock,
                  at higher risk of 429s - backoff self-heals either way)
"""
import gzip, json, os, sys, time, threading, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "cache"
AIRPORTS_CACHE = CACHE_DIR / "ryanair_airports.json"
GRAPH_CACHE = CACHE_DIR / "ryanair_route_graph.json"
FARE_CACHE = CACHE_DIR / "fare_all_origins.json"
APP_DATA = ROOT / "app_data" / "app_data.json"

TP_STAGING = ROOT / "data" / "derived" / "tp_fares.json"
EST_EXPORT = ROOT / "data" / "models" / "fare_estimates.json.gz"
EST_EVIDENCE = ROOT / "data" / "derived" / "tp_service_evidence.json"

# Same family set as src/ingestion/pricing/travelpayouts.py: airlines whose
# service calendars the direct harvest already holds COMPLETELY. Only a quote
# from an airline outside this set proves a route-month flies beyond what the
# stored days show, which is what licenses an estimate band there.
HARVESTED_FAMILY = {"FR", "RK", "RR", "W6", "W4", "W9", "VY", "V7"}

CURRENCY = "EUR"
SOURCE = "FR"                        # contract A source code for this harvester
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


def epoch_day():
    """Unix epoch DAYS (UTC): the slim observed_at/expires_at unit of the fare
    provenance fields (contract A)."""
    return int(time.time() // 86400)


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
    atomic_write_json(AIRPORTS_CACHE, airports, indent=0, ensure_ascii=False)
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
            atomic_write_json(GRAPH_CACHE, graph, indent=0, ensure_ascii=True)
            print(f"  ...{i}/{len(todo)}")
        time.sleep(0.15)
    atomic_write_json(GRAPH_CACHE, graph, indent=0, ensure_ascii=True)
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
                atomic_write_json(FARE_CACHE, cache, indent=0, ensure_ascii=True)
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

    atomic_write_json(FARE_CACHE, cache, indent=0, ensure_ascii=True)
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


def merge_tp_staging(data, fares):
    """Fold the Travelpayouts staging file (contract B) into `fares`,
    cheapest-wins. Coverage backfill for carriers we cannot scrape directly
    (easyJet, Brussels Airlines, Norwegian, Pegasus, Transavia, legacy).

    Rules:
      - absent/unreadable staging file: return None, table untouched (the
        weekly chain then behaves exactly as before this step existed)
      - expired quotes (exp < today) and days outside the fare window are
        dropped at merge time
      - a TP quote wins a day only when NO direct quote exists for it or when
        it is STRICTLY cheaper; the carrier merges additionally reclaim ties,
        so a cached quote never displaces an equal-or-cheaper direct fare
      - won days are tagged "TP" in out_c/ret_c (the same per-day source map
        the carrier merges use; the app builds its Aviasales deeplink from
        route + date at click time, so no link is stored in the wire)
      - per-day observed/expires land in sparse out_o/out_x (ret_o/ret_x)
        epoch-day maps; record-level `o` is not bumped by TP (it dates the
        direct harvest that built the record)
      - org -> dst is merged as the OUT leg of (origin=org, anchor=dst) when
        dst is a catalogue anchor and org is an origin we already serve, and
        as the RET leg of (origin=dst, anchor=org) when that record already
        exists (a ret-only column can never render, so none is created)

    Mutates `fares` in place; returns a stats dict for meta.fares_model_tp.
    """
    if not TP_STAGING.exists():
        return None
    try:
        staging = json.loads(TP_STAGING.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  TP staging unreadable ({type(e).__name__}): skipping the TP step")
        return None
    quotes = staging.get("fares") or []
    meta = data["meta"]
    start_iso, end_iso = meta["start_date"], meta["end_date"]
    anchors = anchor_set(data)
    known_origins = set(meta.get("all_origins") or [])
    for col in fares.values():
        known_origins.update(col)
    today_d = epoch_day()
    stats = {"added": 0, "undercut": 0, "kept": 0,
             "expired": 0, "skipped": 0, "new_routes": 0}

    def merge_day(rec, side, day, eur, obs_d, exp_d):
        prices = rec.setdefault(side, {})
        cur = prices.get(day)
        if cur is None:
            stats["added"] += 1
        elif eur < cur - 0.005:
            stats["undercut"] += 1
        else:
            stats["kept"] += 1
            return
        prices[day] = eur
        tags = rec.get(side + "_c") or {}
        tags[day] = "TP"
        rec[side + "_c"] = tags
        if obs_d is not None and obs_d != rec.get("o"):
            seen = rec.get(side + "_o") or {}
            seen[day] = obs_d
            rec[side + "_o"] = seen
        if exp_d is not None:
            xp = rec.get(side + "_x") or {}
            xp[day] = exp_d
            rec[side + "_x"] = xp

    for q in quotes:
        org, dst, day, cents = q.get("org"), q.get("dst"), q.get("d"), q.get("eur")
        if not org or not dst or not day or not isinstance(cents, (int, float)):
            stats["skipped"] += 1
            continue
        exp_d = q.get("exp")
        if exp_d is not None and exp_d < today_d:
            stats["expired"] += 1
            continue
        if not (start_iso <= day <= end_iso):
            stats["skipped"] += 1
            continue
        eur = round(cents / 100.0, 2)
        if eur <= 0:
            stats["skipped"] += 1
            continue
        obs_d = q.get("obs")
        merged = False
        if dst in anchors and org in known_origins:
            col = fares.setdefault(dst, {})
            rec = col.get(org)
            if rec is None:
                rec = col[org] = {"out": {}, "ret": {},
                                  "s": "TP", "o": obs_d if obs_d is not None else today_d}
                stats["new_routes"] += 1
            merge_day(rec, "out", day, eur, obs_d, exp_d)
            merged = True
        if org in anchors:
            rec = (fares.get(org) or {}).get(dst)
            if rec is not None:
                merge_day(rec, "ret", day, eur, obs_d, exp_d)
                merged = True
        if not merged:
            stats["skipped"] += 1

    stats["staging_generated_at"] = (staging.get("meta") or {}).get("generated_at")
    stats["merged_from"] = date.today().isoformat()
    print(f"  TP staging merged: {stats['added']} day-prices added, "
          f"{stats['undercut']} undercut direct, {stats['kept']} kept "
          f"(direct cheaper/equal), {stats['new_routes']} new routes, "
          f"{stats['expired']} expired, {stats['skipped']} out of scope")
    return stats


def merge_tp():
    """Standalone TP re-merge into the EXISTING table (offline, no harvest):
    for when the staging file refreshes between weekly fare runs. The weekly
    `patch` already folds staging in by itself."""
    data = load_app_data()
    fares = data.get("fares") or {}
    if not fares:
        sys.exit("no fares table in the master; run patch first")
    stats = merge_tp_staging(data, fares)
    if stats is None:
        print(f"no TP staging at {TP_STAGING}; nothing to merge")
        return
    data["fares"] = dict(sorted(fares.items()))
    data["meta"]["all_origins"] = sorted({o for a in fares.values() for o in a})
    data["meta"]["fares_model_tp"] = stats
    atomic_write_json(APP_DATA, data, indent=2, ensure_ascii=False)
    print(f"TP merge written; app_data.json is {APP_DATA.stat().st_size / 1e6:.1f} MB")


def merge_est_bands(data, fares):
    """Attach route-level estimate fallback bands from the estimation layer's
    export: rec["e_out"] / rec["e_ret"] = {YYYY-MM: eur}, the model's p50
    month-median one-way price for the route, window months only.

    Deliberately NOT per-day fares: out/ret keep holding real bookable days
    only (fare calendars and best-fare windows never show invented flights).
    The app consults a band ONLY when no stored day matches the traveller's
    dates, and renders it estimated (source "EST", tilde + est. chip), which
    is the flight half of the fallback-chain rule: real quote, then cached
    quote, then model estimate, never a blank.

    SERVICE GATE: the harvested carriers' calendars are complete, so a
    stored-day gap on a single-carrier route is a day nothing flies, and an
    estimate there would invent a flight. A band month is therefore attached
    ONLY when the Travelpayouts service evidence (contract in
    src/ingestion/pricing/travelpayouts.build_service_evidence, file
    data/derived/tp_service_evidence.json) shows an airline OUTSIDE the
    harvested families flying that direction that month. No evidence
    artifact = NO bands (fail-honest), and stale bands are still cleared.

    Bands from a previous merge are cleared first, so a route the model no
    longer covers loses its stale band on re-merge. Mutates `fares` in place;
    returns a stats dict for meta.fares_model_est, or None when the export is
    absent or unreadable (the chain then behaves exactly as before).
    """
    if not EST_EXPORT.exists():
        return None
    try:
        with gzip.open(EST_EXPORT, "rt", encoding="utf-8") as fh:
            export = json.load(fh)
    except (OSError, ValueError) as e:
        print(f"  estimate export unreadable ({type(e).__name__}): skipping the est step")
        return None
    est = export.get("estimates") or {}

    evidence = None
    if EST_EVIDENCE.exists():
        try:
            evidence = json.loads(EST_EVIDENCE.read_text(encoding="utf-8")).get("routes")
        except (OSError, ValueError) as e:
            print(f"  service evidence unreadable ({type(e).__name__})")
    if evidence is None:
        print("  NO service evidence (data/derived/tp_service_evidence.json): "
              "estimate bands are not attached and stale ones are cleared. "
              "Run the travelpayouts collector to license bands again.")

    def allowed_months(org, dst):
        """Window months a non-harvested airline verifiably flies org->dst."""
        if evidence is None:
            return set()
        return {m for m, airlines in (evidence.get(f"{org}-{dst}") or {}).items()
                if any(a not in HARVESTED_FAMILY for a in airlines)}

    meta = data["meta"]
    start_m, end_m = meta["start_date"][:7], meta["end_date"][:7]
    stats = {"routes": 0, "route_months": 0, "cleared": 0, "months_gated": 0,
             "service_gate": "tp_service_evidence" if evidence is not None else "NO EVIDENCE, all bands dropped",
             "export_generated_at": export.get("generated_at"),
             "merged_from": date.today().isoformat()}

    for anchor, col in fares.items():
        est_anchor = est.get(anchor) or {}
        for origin, rec in col.items():
            had = ("e_out" in rec) or ("e_ret" in rec)
            rec.pop("e_out", None)
            rec.pop("e_ret", None)
            bands = est_anchor.get(origin)
            if not bands:
                if had:
                    stats["cleared"] += 1
                continue
            # out leg flies origin -> anchor, ret leg anchor -> origin.
            allowed = {"out": allowed_months(origin, anchor),
                       "ret": allowed_months(anchor, origin)}
            added = False
            for side, key in (("out", "e_out"), ("ret", "e_ret")):
                keep = {}
                for month, row in (bands.get(side) or {}).items():
                    if not (start_m <= month <= end_m):
                        continue
                    if month not in allowed[side]:
                        stats["months_gated"] += 1
                        continue
                    # export row: [p10, p50, p90, cheapest_p50, cheapest_day]
                    p50 = row[1] if isinstance(row, (list, tuple)) and len(row) >= 2 else None
                    if isinstance(p50, (int, float)) and p50 > 0:
                        keep[month] = int(round(p50))
                if keep:
                    rec[key] = dict(sorted(keep.items()))
                    stats["route_months"] += len(keep)
                    added = True
            if added:
                stats["routes"] += 1
            elif had:
                stats["cleared"] += 1

    print(f"  estimate bands merged: {stats['routes']} routes carry e_out/e_ret "
          f"({stats['route_months']} route-months kept, {stats['months_gated']} "
          f"gated off for lack of service evidence, window {start_m}..{end_m}, "
          f"{stats['cleared']} stale bands cleared)")
    return stats


def merge_est():
    """Standalone est re-merge into the EXISTING table (offline, no harvest):
    for when the estimation layer retrains between weekly fare runs. The
    weekly `patch` already attaches the bands by itself."""
    data = load_app_data()
    fares = data.get("fares") or {}
    if not fares:
        sys.exit("no fares table in the master; run patch first")
    stats = merge_est_bands(data, fares)
    if stats is None:
        print(f"no estimate export at {EST_EXPORT}; nothing to merge")
        return
    data["fares"] = dict(sorted(fares.items()))
    data["meta"]["fares_model_est"] = stats
    atomic_write_json(APP_DATA, data, indent=2, ensure_ascii=False)
    print(f"est merge written; app_data.json is {APP_DATA.stat().st_size / 1e6:.1f} MB")


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

    obs = epoch_day()
    fares = {}
    n_legs = n_anchors = 0
    for origin, anchor in pairs:
        out = _merge_months(cache, origin, anchor, months, start_iso, end_iso)
        ret = _merge_months(cache, anchor, origin, months, start_iso, end_iso)
        if not out and not ret:
            continue
        # Contract A provenance: source code + the epoch day these prices were
        # harvested. The carrier merges refine per-day winners in out_c/ret_c.
        fares.setdefault(anchor, {})[origin] = {"out": out, "ret": ret,
                                                "s": SOURCE, "o": obs}
        n_legs += 1
    n_anchors = len(fares)

    tp_stats = merge_tp_staging(data, fares)
    est_stats = merge_est_bands(data, fares)

    data["fares"] = dict(sorted(fares.items()))
    all_origins = sorted({o for a in fares.values() for o in a})
    meta["fares_model"] = {
        "method": ("real per-day Ryanair fares (farefinder cheapestPerDay) from "
                   "every European Ryanair origin to every catalogue anchor; only "
                   "bookable days kept. Deduped by (anchor, origin) in top-level "
                   "`fares`; ground transport joined per-destination at read time. "
                   "Records carry contract A provenance (s, o)."),
        "fare_model": FARE_MODEL,
        "currency": CURRENCY,
        "window": f"{start_iso}..{end_iso}",
        "n_origins": len(all_origins),
        "n_anchors": n_anchors,
        "n_priced_pairs": n_legs,
        "harvested_from": date.today().isoformat(),
    }
    meta["all_origins"] = all_origins
    if tp_stats is not None:
        meta["fares_model_tp"] = tp_stats
    else:
        meta.pop("fares_model_tp", None)
    if est_stats is not None:
        meta["fares_model_est"] = est_stats
    else:
        meta.pop("fares_model_est", None)

    atomic_write_json(APP_DATA, data, indent=2, ensure_ascii=False)
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
    atomic_write_json(APP_DATA, data, indent=2, ensure_ascii=False)
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
    elif cmd == "tp":
        merge_tp()
    elif cmd == "est":
        merge_est()
    elif cmd == "refresh":
        refresh()
    elif cmd == "all":
        if not GRAPH_CACHE.exists():
            build_graph()
        harvest()
        patch()
    else:
        sys.exit(f"unknown command: {cmd}\n" + __doc__)
