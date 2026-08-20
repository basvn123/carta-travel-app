"""harvest_ryanair_schedules.py - attach Ryanair's published TIMETABLE to the
fares table: which flights actually depart on each day, and at what time.

Why this exists:
  The fare harvesters call farefinder `cheapestPerDay`, which answers "what does
  the cheapest seat cost on day D" and nothing about how many flights ran that
  day. Ryanair separately publishes its schedule, unauthenticated and keyless:

    services-api.ryanair.com/timtbl/3/schedules/{frm}/{to}/years/{Y}/months/{M}
    -> {"month": 9, "days": [{"day": 1, "flights": [
          {"carrierCode": "FR", "number": "1916",
           "departureTime": "14:10", "arrivalTime": "17:00"}, ...]}, ...]}

  One call returns a whole month of daily flight lists for one directed leg, so
  the schedule for the entire catalogue is a few hours of free requests. This is
  the Ryanair half of the schedule layer; harvest_wizzair.py fills the W6 half
  from its timetable endpoint (which carries departure times but no numbers).

What lands in the wire (out_f / ret_f):
    data["fares"][anchor][origin]["out_f"] = {day: "14:10,17:20"}
  Departure times only, comma separated, local time, sorted. Flight NUMBERS are
  kept in the cache but deliberately not published: they roughly double the
  field for a detail the price surfaces do not need yet, and the cache can
  backfill them later without a re-harvest.

Ownership invariant (the part that matters when carriers share a record):
  A merged record's days are split between carriers by out_c/ret_c: a tagged day
  belongs to that carrier, an UNTAGGED day is Ryanair's (the app's long-standing
  default). {side}_f[day] must always describe the carrier that holds
  {side}_c[day], otherwise the app would print one airline's departure times
  beside another airline's price.

  So every schedule patch is clear-then-fill over the days IT owns, and never
  touches a day another carrier holds. That makes the patches order independent:
  when a day moves from Wizz to Ryanair, this patch clears and refills it; when
  it moves the other way, the Wizz patch does. Days held by a carrier with no
  schedule source at all (VY, V7, TP) are swept clean here, since nothing can
  ever vouch for their times.

Caches (idempotent / resumable):
  cache/ryanair_schedules.json  {"FRM|TO|YYYY-MM": {"1": [[num, dep, arr], ...]}}
                                 day-of-month keys; an empty map means the leg
                                 does not fly that month (a cached 404)

Run:
  python harvest_ryanair_schedules.py stats                 # scope, no requests
  python harvest_ryanair_schedules.py harvest               # every window month
  python harvest_ryanair_schedules.py harvest --months 2026-09,2026-11
  python harvest_ryanair_schedules.py harvest --limit 200   # first N legs, a probe
  python harvest_ryanair_schedules.py patch [--dry-run]     # write out_f/ret_f
  python harvest_ryanair_schedules.py all

Tuning via env (same knobs as the fare harvesters):
  HARVEST_DELAY    base delay between calls, seconds (default 1.2)
  HARVEST_WORKERS  parallel fetchers (default 1)
"""
import json, os, sys, time, threading, urllib.request, urllib.error, gzip, ssl
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "cache"
SCHED_CACHE = CACHE_DIR / "ryanair_schedules.json"
APP_DATA = ROOT / "app_data" / "app_data.json"

CARRIER = "FR"
ENDPOINT = ("https://services-api.ryanair.com/timtbl/3/schedules/"
            "{frm}/{to}/years/{y}/months/{m}")

# Carriers whose days a schedule harvester can vouch for. A day held by anyone
# else (VY, V7, TP) must not carry departure times, because no source we have
# describes its flights. `None` is the untagged default, meaning Ryanair.
SCHEDULE_CARRIERS = {None, "FR", "W6"}

DELAY_S = float(os.environ.get("HARVEST_DELAY", "1.2"))
WORKERS = int(os.environ.get("HARVEST_WORKERS", "1"))
BACKOFFS = [20, 45, 90]

_CTX = ssl.create_default_context()
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-GB,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
}


# --------------------------------------------------------------------------- #
#  HTTP
# --------------------------------------------------------------------------- #
def _get_json(url, timeout=40):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
    return json.loads(raw)


def load_app_data():
    return json.loads(APP_DATA.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- #
#  Scope: the legs worth asking about
# --------------------------------------------------------------------------- #
def window_months(meta):
    """['2026-07', ...] across the catalogue's fare window, inclusive."""
    start, end = meta["start_date"][:7], meta["end_date"][:7]
    out, y, m = [], int(start[:4]), int(start[5:7])
    while f"{y:04d}-{m:02d}" <= end:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def fr_legs(fares):
    """Directed (frm, to) legs that hold at least one Ryanair day.

    A day is Ryanair's when it is absent from {side}_c (the merges tag only the
    days another carrier won). Legs with no Ryanair day at all are skipped: we
    would fetch a schedule we are not allowed to publish against anyone's price.
    """
    legs = set()
    for anchor, col in (fares or {}).items():
        for origin, rec in col.items():
            oc = rec.get("out_c") or {}
            rc = rec.get("ret_c") or {}
            if any(d not in oc for d in (rec.get("out") or {})):
                legs.add((origin, anchor))     # out leg flies origin -> anchor
            if any(d not in rc for d in (rec.get("ret") or {})):
                legs.add((anchor, origin))     # ret leg flies anchor -> origin
    return sorted(legs)


# --------------------------------------------------------------------------- #
#  Phase 1: harvest
# --------------------------------------------------------------------------- #
def _parse_month(payload):
    """{"1": [[number, dep, arr], ...]} for the days that actually fly.

    Days with an empty flight list are dropped rather than stored as empty, so
    the cache says "flies" or says nothing, and a day nothing flies can never be
    mistaken for a day with an unknown schedule.
    """
    out = {}
    for entry in (payload or {}).get("days") or []:
        day = entry.get("day")
        rows = []
        for f in entry.get("flights") or []:
            dep = f.get("departureTime")
            if not dep:
                continue
            rows.append([str(f.get("number") or ""), dep, f.get("arrivalTime") or ""])
        if day is not None and rows:
            rows.sort(key=lambda r: r[1])
            out[str(int(day))] = rows
    return out


def _fetch_leg_month(frm, to, month):
    """Cached-shaped result for one leg-month; {} when the leg does not fly."""
    y, m = month[:4], int(month[5:7])
    url = ENDPOINT.format(frm=frm, to=to, y=y, m=m)
    attempt = 0
    while True:
        try:
            return _parse_month(_get_json(url))
        except urllib.error.HTTPError as e:
            # 404 is the normal answer for a pair Ryanair does not fly that
            # month; cache it as empty so a resume never asks again.
            if e.code in (404, 400):
                return {}
            if e.code in (429, 503) and attempt < len(BACKOFFS):
                time.sleep(BACKOFFS[attempt]); attempt += 1; continue
            return {}
        except Exception:
            if attempt < len(BACKOFFS):
                time.sleep(BACKOFFS[attempt]); attempt += 1; continue
            return {}


def harvest(months=None, limit=None):
    data = load_app_data()
    fares = data.get("fares") or {}
    if not fares:
        sys.exit("no fares table in the master; run the fare harvesters first")
    months = months or window_months(data["meta"])
    legs = fr_legs(fares)
    if limit:
        legs = legs[:limit]
        print(f"  (limited to the first {limit} legs for this run)")

    cache = json.loads(SCHED_CACHE.read_text(encoding="utf-8")) if SCHED_CACHE.exists() else {}
    jobs = [(f"{frm}|{to}|{month}", frm, to, month)
            for (frm, to) in legs for month in months]
    todo = [j for j in jobs if j[0] not in cache]
    print(f"{len(legs)} Ryanair legs x {len(months)} months -> {len(jobs)} calls; "
          f"{len(cache)} cached, {len(todo)} to fetch "
          f"(workers={WORKERS}, delay={DELAY_S}s, "
          f"~{len(todo) * DELAY_S / max(1, WORKERS) / 3600:.1f} h)")
    if not todo:
        return

    lock = threading.Lock()
    done = [0]

    def run(job):
        key, frm, to, month = job
        result = _fetch_leg_month(frm, to, month)
        with lock:
            cache[key] = result
            done[0] += 1
            if done[0] % 100 == 0:
                atomic_write_json(SCHED_CACHE, cache, indent=0, ensure_ascii=True)
                print(f"  ...{done[0]}/{len(todo)} fetched, flushed", flush=True)
        time.sleep(DELAY_S)

    if WORKERS <= 1:
        for job in todo:
            run(job)
    else:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            for _ in as_completed([ex.submit(run, job) for job in todo]):
                pass

    atomic_write_json(SCHED_CACHE, cache, indent=0, ensure_ascii=True)
    flying = sum(1 for v in cache.values() if v)
    print(f"harvest complete: {len(cache)} leg-months cached, {flying} of them fly")


# --------------------------------------------------------------------------- #
#  Phase 2: patch out_f / ret_f into the fares table
# --------------------------------------------------------------------------- #
def leg_times(cache, frm, to, months):
    """{'YYYY-MM-DD': '14:10,17:20'} departure times for one directed leg."""
    out = {}
    for month in months:
        block = cache.get(f"{frm}|{to}|{month}")
        if not block:
            continue
        for dom, rows in block.items():
            day = f"{month}-{int(dom):02d}"
            times = sorted({r[1] for r in rows if r[1]})
            if times:
                out[day] = ",".join(times)
    return out


def apply_schedule(rec, side, src_times):
    """Clear-then-fill {side}_f over the days THIS carrier owns, plus sweep days
    held by a carrier no schedule can vouch for. Days owned by another
    schedule-carrying carrier are left exactly as found, which is what makes the
    per-carrier patches order independent.

    Returns (set, cleared, swept) day counts.
    """
    tag = rec.get(side + "_c") or {}
    freq = dict(rec.get(side + "_f") or {})
    priced = rec.get(side) or {}
    set_n = cleared = swept = 0

    # 1. days no schedule source covers must never carry times
    for day in [d for d in freq if tag.get(d) not in SCHEDULE_CARRIERS]:
        del freq[day]; swept += 1

    # 2. clear-then-fill our own days
    for day in [d for d in freq if tag.get(d) is None]:
        del freq[day]; cleared += 1
    for day, times in src_times.items():
        # only days we actually priced AND still own
        if day in priced and tag.get(day) is None:
            freq[day] = times; set_n += 1

    if freq:
        rec[side + "_f"] = dict(sorted(freq.items()))
    elif side + "_f" in rec:
        del rec[side + "_f"]
    return set_n, cleared, swept


def patch(dry_run=False):
    if not SCHED_CACHE.exists():
        sys.exit("no schedule cache; run harvest first")
    cache = json.loads(SCHED_CACHE.read_text(encoding="utf-8"))
    data = load_app_data()
    fares = data.get("fares") or {}
    if not fares:
        sys.exit("no fares table in the master")
    months = window_months(data["meta"])

    tot_set = tot_cleared = tot_swept = 0
    recs_touched = 0
    examples = []
    for anchor, col in fares.items():
        for origin, rec in col.items():
            o_set, o_cl, o_sw = apply_schedule(
                rec, "out", leg_times(cache, origin, anchor, months))
            r_set, r_cl, r_sw = apply_schedule(
                rec, "ret", leg_times(cache, anchor, origin, months))
            if o_set or r_set:
                recs_touched += 1
                if len(examples) < 6:
                    day = next(iter(rec.get("out_f") or {}), None)
                    if day:
                        examples.append((origin, anchor, day,
                                         rec["out_f"][day], (rec.get("out") or {}).get(day)))
            tot_set += o_set + r_set
            tot_cleared += o_cl + r_cl
            tot_swept += o_sw + r_sw

    print(f"records gaining a Ryanair schedule: {recs_touched}")
    print(f"day-schedules set: {tot_set} (cleared {tot_cleared} of our own before "
          f"refilling, swept {tot_swept} held by a carrier with no schedule source)")
    for o, a, day, times, eur in examples:
        n = len(times.split(","))
        print(f"  e.g. {o}->{a} {day}: {n} flight(s) at {times}"
              + (f", from EUR {eur}" if eur is not None else ""))
    if dry_run:
        print("\n--- DRY RUN (nothing written) ---")
        return

    data["fares"] = fares
    data["meta"]["fares_model_fr_schedule"] = {
        "method": ("Ryanair published timetable (services-api timtbl/3/schedules) "
                   "for every directed leg holding a Ryanair day; departure times "
                   "written to out_f/ret_f on the days Ryanair owns. Flight numbers "
                   "are cached but not published."),
        "window": f"{data['meta']['start_date']}..{data['meta']['end_date']}",
        "day_schedules": tot_set,
        "records": recs_touched,
        "harvested_from": date.today().isoformat(),
    }
    atomic_write_json(APP_DATA, data, indent=2, ensure_ascii=False)
    print(f"patched; app_data.json is {APP_DATA.stat().st_size / 1e6:.1f} MB")


def stats():
    data = load_app_data()
    fares = data.get("fares") or {}
    months = window_months(data["meta"])
    legs = fr_legs(fares)
    calls = len(legs) * len(months)
    cached = len(json.loads(SCHED_CACHE.read_text(encoding="utf-8"))) if SCHED_CACHE.exists() else 0
    print(f"route records:                 {sum(len(c) for c in fares.values())}")
    print(f"directed legs with a FR day:   {len(legs)}")
    print(f"window months:                 {len(months)} ({months[0]}..{months[-1]})")
    print(f"leg-months to fetch:           {calls} ({cached} already cached)")
    print(f"est. wall-clock @ {DELAY_S}s/{WORKERS}w: "
          f"{max(0, calls - cached) * DELAY_S / max(1, WORKERS) / 3600:.1f} h")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    mon = None
    if "--months" in sys.argv:
        mon = sys.argv[sys.argv.index("--months") + 1].split(",")
    lim = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    if cmd == "harvest":
        harvest(months=mon, limit=lim)
    elif cmd == "patch":
        patch(dry_run="--dry-run" in sys.argv)
    elif cmd == "stats":
        stats()
    elif cmd == "all":
        harvest(months=mon, limit=lim)
        patch()
    else:
        sys.exit(f"unknown command: {cmd}\n" + __doc__)
