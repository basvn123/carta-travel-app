"""run_pipeline.py - one orchestrator for the whole Carta data pipeline.

Wraps the pipeline/harvest_* / enrich_* / apply_* scripts in a single safe,
resumable, cadence-aware driver so the data can be refreshed on a schedule
(e.g. a weekly Windows Scheduled Task) without hand-running a dozen commands
and without the known footguns firing.

WHY A DRIVER (not just a .bat chain)
------------------------------------
Almost every harvester does a full read-modify-write of the ~50 MB
app_data/app_data.json master. That creates three hazards this driver guards:
  1. Concurrency: two writers at once clobber each other (the repo's
     "concurrent-session gotcha"). We refuse to start a writer step while any
     OTHER python is running, and hold a lockfile so two pipeline runs can't
     overlap.
  2. patch()-nulls-coverage: harvest_activities/harvest_images `patch`, and
     apply_wikivoyage, WIPE the field for every destination absent from their
     cache. Those steps are NOT in any automatic tier; when run manually they
     are coverage-guarded (skipped unless the cache covers ~all dests).
  3. Interrupted fare refresh: a killed `refresh` leaves a rolled window with
     partial fares (this is what froze the window at 2026-07-06). The fares
     step here RESUMES a partial-but-current cache instead of blowing it away.

Every writer step is preceded by a timestamped backup of the master.

CADENCE MODEL
-------------
Each task declares its own refresh interval; the driver runs a task only when
that interval has elapsed since its last success (state in logs/pipeline_state.json).
So you schedule ONE weekly job and each layer self-selects how often it fires:

  weekly    Travelpayouts cache staging (cheap API cache reads, feeds the merge)
  weekly    fares (live Ryanair re-fetch, rolling window) + ship
  weekly    fare snapshot archive -> drift check -> model retrain -> estimates
  weekly    raw open-data mirror (src/ingestion: schedules, realtime, ADS-B)
  monthly   fame (pageviews) -> beauty -> rating; flight times for covered origins
  monthly   holiday calendars (demand catalysts for the estimation model)
  quarterly open-data snapshots (crowding, bathing water, lodging) *
  backfill  static/heavy or null-risk jobs - MANUAL only, via --only (guarded)

Tasks marked `soft` (the estimation/ingestion layer) log failures loudly but
never block the core fare refresh + ship; they retry on the next run.

  * several quarterly sources pin a YEAR / snapshot date in their own source and
    will re-emit identical data until you bump it; the task prints the reminder.

FRESHNESS + STALENESS-TIERED REFRESH
------------------------------------
Every run (and every --dry-run) writes data/derived/freshness_report.json: per
shipped fare slice (continent-app/public/fares/<ORIGIN>.json) the newest/oldest
observed_at (`o`, contract A epoch days; file mtime when a slice predates
provenance), day-price counts by source (FR/W6/VY/V7/TP/EST/legacy), and a
staleness priority = age_days x popularity (static origin tier list below).
Because `patch` restamps every record's `o` on each full rebuild, the report
also folds in this driver's own refresh ledger (logs/pipeline_state.json,
fares_freshness) so targeted refreshes stay visible between full runs.

`--max-origins N` turns the fares task into a targeted refresh: the N
stalest-highest-priority origins (Ryanair-served only; the other carriers have
their own weekly tasks) get their legs invalidated in cache/fare_all_origins.json,
then the normal resume harvest re-fetches just those legs and `patch` rebuilds
the table. Without the flag nothing changes: the weekly full refresh still
re-fetches everything, which is what keeps the long tail from starving.

USAGE
-----
  python run_pipeline.py                     # run every task that is DUE
  python run_pipeline.py --dry-run           # show the plan + freshness summary,
                                             #   run nothing (report file still written)
  python run_pipeline.py --max-cadence weekly# only weekly-tier tasks (fast fares run)
  python run_pipeline.py --only fares         # force one/more tasks by key, ignore "due"
  python run_pipeline.py --only fares --max-origins 5
                                             # targeted: re-fetch only the 5 stalest
                                             #   high-priority origins, then patch
  python run_pipeline.py --list              # list tasks, cadences, last-run, due?
  python run_pipeline.py --force             # bypass the other-python concurrency guard
  python run_pipeline.py --ship none         # skip the npm build at the end
  python run_pipeline.py --no-backup         # skip the pre-write master backup (not advised)

Keys: see TASKS below or `--list`. Safe to re-run; interrupted runs resume.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parent
APP_DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache"
LOGS = ROOT / "logs"
BACKUPS = ROOT / "app_data" / "backups"
STATE = LOGS / "pipeline_state.json"
LOCK = LOGS / "pipeline.lock"
CONTINENT = ROOT / "continent-app"
PY = sys.executable or "python"


def _resolve(names, common):
    """Find an executable by trying PATH (shutil.which) then well-known install
    dirs. Task Scheduler has node on PATH, but a stripped-down shell may not."""
    for n in names:
        p = shutil.which(n)
        if p:
            return p
    for c in common:
        if Path(c).exists():
            return str(c)
    return names[0]


_NODE_DIRS = [r"C:\Program Files\nodejs", r"C:\Program Files (x86)\nodejs"]


def node_exe():
    return _resolve(["node"], [Path(d) / "node.exe" for d in _NODE_DIRS])


def npm_exe():
    return _resolve(["npm", "npm.cmd"], [Path(d) / "npm.cmd" for d in _NODE_DIRS])

CADENCE_DAYS = {"weekly": 7, "monthly": 30, "quarterly": 90}
CADENCE_RANK = {"weekly": 1, "monthly": 2, "quarterly": 3, "backfill": 9, "manual": 9}
KEEP_BACKUPS = 6

FARES_DIR = CONTINENT / "public" / "fares"
DERIVED = ROOT / "data" / "derived"
FRESHNESS_REPORT = DERIVED / "freshness_report.json"
FARE_CACHE = CACHE / "fare_all_origins.json"
RYANAIR_GRAPH = CACHE / "ryanair_route_graph.json"

# Static popularity tiers for the staleness priority (age_days x weight).
# "Popular pairs refresh often, the long tail rarely": the weekly full refresh
# covers everything, a targeted --max-origins run picks from the top of this
# ranking. Curated list of the biggest low-cost origins plus the app's home
# market (BE/NL); everything absent weighs 1.0.
ORIGIN_POPULARITY = {
    3.0: [  # major
        "STN", "LTN", "LGW", "MAN", "DUB", "CRL", "BRU", "AMS", "EIN", "BGY",
        "MXP", "FCO", "CIA", "NAP", "MAD", "BCN", "PMI", "AGP", "ALC", "VLC",
        "LIS", "OPO", "BER", "DUS", "CGN", "VIE", "WAW", "WMI", "KRK", "BUD",
        "PRG", "ATH", "CPH",
    ],
    2.0: [  # secondary
        "EDI", "GLA", "BRS", "LPL", "BHX", "ORK", "SNN", "BVA", "MRS", "NCE",
        "TLS", "BOD", "NTE", "LYS", "BLQ", "VCE", "TSF", "PSA", "CTA", "PMO",
        "BRI", "SVQ", "IBZ", "FAO", "SKG", "GDN", "POZ", "WRO", "OTP", "SOF",
        "BEG", "ZAG", "SPU", "DBV", "RIX", "VNO", "KUN", "TLL", "HEL", "ARN",
        "NYO", "GOT", "OSL", "TRF", "HAM", "STR", "HHN", "BSL", "GVA", "MLA",
    ],
}
_ORIGIN_WEIGHT = {o: w for w, lst in ORIGIN_POPULARITY.items() for o in lst}

# Mirror of continent-app/src/lib/fareFile.js: fare slices for IATA codes that
# collide with DOS device names ship with a trailing underscore (PRN_.json).
_RESERVED_FARE_NAMES = ({"CON", "PRN", "AUX", "NUL"}
                        | {f"COM{i}" for i in range(10)}
                        | {f"LPT{i}" for i in range(10)})

_LOG_FH = None


def log(msg=""):
    line = str(msg)
    print(line, flush=True)
    if _LOG_FH:
        _LOG_FH.write(line + "\n")
        _LOG_FH.flush()


def now_utc():
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
# Safety helpers
# --------------------------------------------------------------------------- #
def other_python_running():
    """Best-effort: is another python.exe alive besides us? (concurrent-writer guard)"""
    me = os.getpid()
    try:
        if os.name == "nt":
            out = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq python.exe", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=20,
            ).stdout
            pids = []
            for row in out.splitlines():
                parts = [c.strip('"') for c in row.split('","')]
                if len(parts) >= 2 and parts[1].isdigit():
                    pids.append(int(parts[1]))
            return [p for p in pids if p != me]
        else:
            out = subprocess.run(["pgrep", "-f", "python"], capture_output=True, text=True).stdout
            return [int(p) for p in out.split() if p.isdigit() and int(p) != me]
    except Exception as e:
        log(f"  (could not check for other python processes: {e})")
        return []


def dest_count():
    try:
        d = json.loads(APP_DATA.read_text(encoding="utf-8"))
        return len(d.get("destinations") or {})
    except Exception:
        return 0


def backup_master():
    if not APP_DATA.exists():
        return None
    BACKUPS.mkdir(parents=True, exist_ok=True)
    stamp = now_utc().strftime("%Y%m%d_%H%M%S")
    dst = BACKUPS / f"app_data.{stamp}.json"
    shutil.copy2(APP_DATA, dst)
    # prune to the newest KEEP_BACKUPS
    old = sorted(BACKUPS.glob("app_data.*.json"))
    for p in old[:-KEEP_BACKUPS]:
        try:
            p.unlink()
        except OSError:
            pass
    log(f"  backup -> {dst.relative_to(ROOT)} ({dst.stat().st_size // (1024*1024)} MB)")
    return dst


def load_state():
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_state(state):
    LOGS.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def run_cmd(argv, cwd=None):
    """Stream a subprocess, tee its output to the log, return the exit code."""
    pretty = " ".join(str(a) for a in argv)
    log(f"  $ {pretty}")
    try:
        proc = subprocess.Popen(
            argv, cwd=str(cwd or ROOT), stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, bufsize=1,
        )
    except FileNotFoundError as e:
        log(f"  ! command not found: {e}")
        return 127
    for line in proc.stdout:
        log("    " + line.rstrip())
    proc.wait()
    return proc.returncode


# --------------------------------------------------------------------------- #
# Guards (return (ok, reason); ok=False -> task is SKIPPED, not failed)
# --------------------------------------------------------------------------- #
def guard_cache_covers(cache_rel, min_ratio=0.95):
    """For null-risk patch steps: only proceed if the id-keyed cache covers ~all
    current dests, so patch() won't null the ones it's missing."""
    def _g(ctx):
        p = ROOT / cache_rel
        if not p.exists():
            return False, f"cache {cache_rel} absent - run its harvest first"
        try:
            n_cache = len(json.loads(p.read_text(encoding="utf-8")))
        except Exception as e:
            return False, f"cache {cache_rel} unreadable ({e})"
        n_dest = ctx["dest_count"]
        if n_dest and n_cache / n_dest < min_ratio:
            return False, (f"cache {cache_rel} covers {n_cache}/{n_dest} dests "
                           f"(<{int(min_ratio*100)}%); patch would NULL the rest - skipping")
        return True, f"cache covers {n_cache}/{n_dest} dests"
    return _g


# --------------------------------------------------------------------------- #
# Freshness report + staleness-targeted fare refresh
# --------------------------------------------------------------------------- #
def fare_file_origin(path):
    """Origin IATA for a fare slice filename, undoing the fareFile.js escape."""
    stem = path.stem
    if stem.endswith("_") and stem[:-1] in _RESERVED_FARE_NAMES:
        return stem[:-1]
    return stem


def _day_iso(epoch_days):
    return (date(1970, 1, 1) + timedelta(days=int(epoch_days))).isoformat()


def _months_between(start_iso, end_iso):
    """First-of-month keys covering [start_iso, end_iso], the fare cache's
    month unit (mirrors harvest_all_origins.months_in_window)."""
    sy, sm = int(start_iso[:4]), int(start_iso[5:7])
    ey, em = int(end_iso[:4]), int(end_iso[5:7])
    out, y, m = [], sy, sm
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}-01")
        m += 1
        if m == 13:
            m = 1; y += 1
    return out


def _load_master():
    return json.loads(APP_DATA.read_text(encoding="utf-8"))


def _anchor_set(master):
    anchors = set()
    for d in (master.get("destinations") or {}).values():
        if d.get("anchor_airport"):
            anchors.add(d["anchor_airport"])
        if d.get("tier") == "airport" and d.get("iata"):
            anchors.add(d["iata"])
    return anchors


def _ledger(state):
    """Per-origin refresh ledger. Needed because `patch` restamps every
    record's `o` with the patch day on each full rebuild, so the wire alone
    cannot tell a targeted-refreshed origin from an untouched one."""
    led = state.setdefault("fares_freshness", {})
    led.setdefault("origins", {})
    return led


def build_freshness_report(state):
    """Scan the shipped fare slices and write data/derived/freshness_report.json:
    per origin the newest/oldest observation (contract A `o` + sparse
    out_o/ret_o, file mtime as fallback), day-price counts by source, and a
    staleness priority (age_days x popularity). Returns the report dict."""
    now = now_utc()
    led = _ledger(state)
    origins, totals = {}, {}
    for p in sorted(FARES_DIR.glob("*.json")) if FARES_DIR.exists() else []:
        origin = fare_file_origin(p)
        mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)
        entry = {"file": p.name}
        obs, sources, n_days, n_anchors = [], {}, 0, 0
        try:
            slice_obj = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(slice_obj, dict):
                raise ValueError("not an object")
        except Exception as e:
            slice_obj = {}
            entry["error"] = f"unreadable ({type(e).__name__})"
        for rec in slice_obj.values():
            if not isinstance(rec, dict):
                continue
            n_anchors += 1
            if isinstance(rec.get("o"), (int, float)):
                obs.append(int(rec["o"]))
            for side in ("out_o", "ret_o"):
                for v in (rec.get(side) or {}).values():
                    if isinstance(v, (int, float)):
                        obs.append(int(v))
            base = rec.get("s") or "legacy"
            for side in ("out", "ret"):
                days = rec.get(side) or {}
                tags = rec.get(side + "_c") or {}
                n_days += len(days)
                for day in days:
                    src = tags.get(day) or base
                    sources[src] = sources.get(src, 0) + 1
        for s, c in sources.items():
            totals[s] = totals.get(s, 0) + c
        entry["n_anchors"] = n_anchors
        entry["day_prices"] = n_days
        entry["sources"] = dict(sorted(sources.items()))
        if obs:
            entry["newest_o"] = _day_iso(max(obs))
            entry["oldest_o"] = _day_iso(min(obs))
            entry["basis"] = "o"
            freshest = datetime.fromtimestamp(max(obs) * 86400, tz=timezone.utc)
        else:
            entry["mtime"] = mtime.isoformat(timespec="seconds")
            entry["basis"] = "mtime"
            freshest = mtime
        led_iso = led["origins"].get(origin) or ""
        if led.get("full") and led["full"] > led_iso:
            led_iso = led["full"]
        if led_iso:
            entry["last_pipeline_refresh"] = led_iso
            try:
                led_dt = datetime.fromisoformat(led_iso)
                if led_dt > freshest:
                    freshest = led_dt
                    entry["basis"] = "ledger"
            except ValueError:
                pass
        entry["age_days"] = round(max(0.0, (now - freshest).total_seconds() / 86400), 1)
        entry["popularity"] = _ORIGIN_WEIGHT.get(origin, 1.0)
        entry["priority"] = round(entry["age_days"] * entry["popularity"], 1)
        origins[origin] = entry
    report = {
        "meta": {
            "generated_at": now.isoformat(timespec="seconds"),
            "fares_dir": "continent-app/public/fares",
            "n_origins": len(origins),
            "day_prices_by_source": dict(sorted(totals.items())),
            "popularity_weights": {"major": 3.0, "secondary": 2.0, "default": 1.0},
            "priority": "age_days x popularity; --max-origins N refreshes the highest first",
        },
        "origins": origins,
    }
    DERIVED.mkdir(parents=True, exist_ok=True)
    FRESHNESS_REPORT.write_text(json.dumps(report, indent=1), encoding="utf-8")
    return report


def print_freshness_summary(report):
    origins = report.get("origins") or {}
    if not origins:
        log(f"freshness: no fare slices under {FARES_DIR.relative_to(ROOT)}")
        return
    ages = [i["age_days"] for i in origins.values()]
    stale = sum(1 for a in ages if a >= 14)
    log(f"freshness: {len(origins)} origins in public/fares/; age "
        f"{min(ages)}..{max(ages)} days; {stale} older than 14 days")
    by_src = report["meta"]["day_prices_by_source"]
    log("  day-prices by source: " + (", ".join(
        f"{s} {c:,}" for s, c in sorted(by_src.items(), key=lambda kv: -kv[1])) or "-"))
    top = sorted(origins.items(), key=lambda kv: (-kv[1]["priority"], kv[0]))[:8]
    log("  stalest first (age x popularity): " + ", ".join(
        f"{o} {i['priority']}" for o, i in top))
    log(f"  report -> {FRESHNESS_REPORT.relative_to(ROOT)}")


def pick_stalest_origins(report, n, eligible=None):
    """Top-n origins by staleness priority, optionally filtered to an eligible
    set (targeted refresh can only re-fetch Ryanair-served origins)."""
    rows = [(o, i) for o, i in (report.get("origins") or {}).items()
            if eligible is None or o in eligible]
    rows.sort(key=lambda kv: (-kv[1]["priority"], kv[0]))
    return [o for o, _ in rows[:n]]


def targeted_leg_keys(targets, graph, anchors, months):
    """Fare-cache keys (frm|to|month) a targeted refresh must invalidate:
    both legs of every (target origin, catalogue anchor) route pair."""
    keys = set()
    for t in targets:
        for a in graph.get(t) or []:
            if a not in anchors:
                continue
            for m in months:
                keys.add(f"{t}|{a}|{m}")
                keys.add(f"{a}|{t}|{m}")
    return keys


def fares_targeted_step(ctx):
    """--max-origins N: refresh only the N stalest-highest-priority origins.
    Works entirely through the harvester's own resume semantics: drop the
    targets' legs from cache/fare_all_origins.json, let `harvest` re-fetch
    exactly the missing legs, then `patch` rebuilds the table as usual (which
    also re-merges the TP staging). The window is NOT rolled; only the weekly
    full refresh does that."""
    n = ctx["max_origins"]
    state = ctx["state"]
    if not FARE_CACHE.exists():
        log("  no cache/fare_all_origins.json: a targeted run can only invalidate")
        log("  slices of an existing harvest. Run the full `fares` task first.")
        return False
    if not RYANAIR_GRAPH.exists():
        if run_cmd([PY, "pipeline/harvest_all_origins.py", "graph"]) != 0:
            return False
    graph = json.loads(RYANAIR_GRAPH.read_text(encoding="utf-8"))
    eligible = {o for o, dests in graph.items() if dests}

    report = build_freshness_report(state)
    targets = pick_stalest_origins(report, n, eligible=eligible)
    if not targets:
        log("  freshness report lists no Ryanair-served origins; nothing to refresh")
        return False
    log("  targeted refresh, stalest first (age x popularity): " + ", ".join(
        f"{o} (age {report['origins'][o]['age_days']}d, prio "
        f"{report['origins'][o]['priority']})" for o in targets))

    master = _load_master()
    meta = master.get("meta") or {}
    start_iso, end_iso = meta.get("start_date"), meta.get("end_date")
    if not start_iso or not end_iso:
        log("  master has no fare window (meta.start_date/end_date); run the full task")
        return False
    if start_iso == date.today().isoformat():
        log("  note: window rolled today, an interrupted full refresh may be pending;")
        log("  its missing legs will be resumed too (extra calls beyond the targets).")

    months = _months_between(start_iso, end_iso)
    cache = json.loads(FARE_CACHE.read_text(encoding="utf-8"))
    keys = targeted_leg_keys(targets, graph, _anchor_set(master), months)
    dropped = 0
    for k in keys:
        if k in cache:
            del cache[k]
            dropped += 1
    if dropped:
        FARE_CACHE.write_text(json.dumps(cache, indent=0), encoding="utf-8")
    log(f"  invalidated {dropped} of {len(keys)} target legs in the fare cache; re-fetching")

    if run_cmd([PY, "pipeline/harvest_all_origins.py", "harvest"]) != 0:
        return False
    if run_cmd([PY, "pipeline/harvest_all_origins.py", "patch"]) != 0:
        return False
    stamp = now_utc().isoformat()
    for t in targets:
        _ledger(state)["origins"][t] = stamp
    return True


# --------------------------------------------------------------------------- #
# Custom step: fares (resume-if-interrupted, else rolling refresh)
# --------------------------------------------------------------------------- #
def fares_step(ctx):
    """Live Ryanair fare refresh via harvest_all_origins.py (the system that
    actually ships as public/fares/). If a previous refresh was interrupted -
    window already rolled to today AND a partial fare cache exists - RESUME it
    (harvest+patch) instead of deleting the cache and restarting the ~hours-long
    fetch. Otherwise do a full rolling refresh. With --max-origins N the step
    becomes a staleness-targeted partial refresh instead (fares_targeted_step)."""
    if ctx.get("max_origins"):
        return fares_targeted_step(ctx)
    today = date.today().isoformat()
    try:
        meta = json.loads(APP_DATA.read_text(encoding="utf-8"))["meta"]
        window_is_current = meta.get("start_date") == today
    except Exception:
        window_is_current = False

    if not RYANAIR_GRAPH.exists():
        if run_cmd([PY, "pipeline/harvest_all_origins.py", "graph"]) != 0:
            return False

    if window_is_current and FARE_CACHE.exists():
        log("  window already rolled to today with a partial cache -> RESUME (harvest+patch)")
        if run_cmd([PY, "pipeline/harvest_all_origins.py", "harvest"]) != 0:
            return False
        ok = run_cmd([PY, "pipeline/harvest_all_origins.py", "patch"]) == 0
    else:
        log("  rolling fare window forward and re-fetching live (refresh)")
        ok = run_cmd([PY, "pipeline/harvest_all_origins.py", "refresh"]) == 0
    if ok:
        # A full refresh re-fetched every origin; the per-origin ledger
        # entries are superseded by this stamp.
        _ledger(ctx["state"])["full"] = now_utc().isoformat()
    return ok


def wizz_step(ctx):
    """Merge live Wizz Air fares into the shared `fares` table. Runs AFTER the
    Ryanair patch (fares_step) so it merges onto a fresh table, keeping the
    cheaper price per (anchor, origin, day) and adding Wizz-only routes. The
    harvester auto-resets its own fare cache when the window has rolled, so this
    is just graph (if missing) -> harvest (resume) -> patch (cheapest-wins)."""
    graph = CACHE / "wizzair_route_graph.json"
    if not graph.exists():
        if run_cmd([PY, "pipeline/harvest_wizzair.py", "graph"]) != 0:
            return False
    if run_cmd([PY, "pipeline/harvest_wizzair.py", "harvest"]) != 0:
        return False
    return run_cmd([PY, "pipeline/harvest_wizzair.py", "patch"]) == 0


def vueling_step(ctx):
    """Merge live Vueling fares into the shared `fares` table. Runs AFTER the
    Ryanair (fares_step) and Wizz (wizz_step) patches so it merges last, keeping
    the cheapest price per (anchor, origin, day) and adding Vueling-only routes.
    Native EUR; the harvester auto-resets its fare cache when the window rolls.
    graph (if missing) -> harvest (resume) -> patch (cheapest-wins)."""
    graph = CACHE / "vueling_route_graph.json"
    if not graph.exists():
        if run_cmd([PY, "pipeline/harvest_vueling.py", "graph"]) != 0:
            return False
    if run_cmd([PY, "pipeline/harvest_vueling.py", "harvest"]) != 0:
        return False
    return run_cmd([PY, "pipeline/harvest_vueling.py", "patch"]) == 0


def volotea_step(ctx):
    """Merge live Volotea fares into the shared `fares` table. Runs AFTER the
    Ryanair, Wizz and Vueling patches (merges last). Native EUR; coarser than the
    daily calendars (getminprice = cheapest per date window). The harvester
    auto-resets its fare cache when the window rolls.
    graph (if missing) -> harvest (resume) -> patch (cheapest-wins)."""
    graph = CACHE / "volotea_route_graph.json"
    if not graph.exists():
        if run_cmd([PY, "pipeline/harvest_volotea.py", "graph"]) != 0:
            return False
    if run_cmd([PY, "pipeline/harvest_volotea.py", "harvest"]) != 0:
        return False
    return run_cmd([PY, "pipeline/harvest_volotea.py", "patch"]) == 0


def fare_history_step(ctx):
    """Schema-gate the shipped fare wire files (dead-letter quarantine) and
    archive today's snapshot to data/history/fares - the (lead time, price)
    escalation history the estimation model trains on. Runs after the carrier
    merges so it archives the fully merged table."""
    return run_cmd([PY, "-m", "src.estimation.snapshot"]) == 0


def model_is_stale(days=30):
    """Retrain cadence guard: even without drift, refit on the trailing
    window once the artifact is older than `days`."""
    try:
        meta = json.loads((ROOT / "data" / "models" / "fare_model_metrics.json")
                          .read_text(encoding="utf-8"))
        trained = datetime.fromisoformat(meta["trained_at"])
        return (now_utc() - trained) >= timedelta(days=days)
    except Exception:
        return True


def fare_model_step(ctx):
    """Drift-gated retrain + estimate export. drift.py exit codes: 0 = no/minor
    drift, 2 = no model or history yet, 3 = major data drift or concept drift
    (MAPE) -> retrain. A drift-free model still retrains after 30 days."""
    rc = run_cmd([PY, "-m", "src.estimation.drift"])
    if rc not in (0, 2, 3):
        return False
    if rc in (2, 3) or model_is_stale():
        reason = {2: "no model yet", 3: "drift detected"}.get(rc, "model >30 days old")
        log(f"  retraining ({reason})")
        if run_cmd([PY, "-m", "src.estimation.model", "train"]) != 0:
            return False
    return run_cmd([PY, "-m", "src.estimation.model", "estimate"]) == 0


def ingestion_step(ctx):
    """Raw open-data mirror: NAP schedule feeds (GTFS/NeTEx), GTFS-RT + SIRI
    realtime, OpenSky ADS-B, ferries, historical pricing -> data/raw with
    per-day manifests. Collectors missing credentials SKIP cleanly."""
    return run_cmd([PY, "-m", "src.ingestion.run_all"]) == 0


def demand_events_step(ctx):
    """Public + school holiday calendars (Nager.Date / OpenHolidays), the
    exogenous demand catalysts behind the model's holiday features."""
    return run_cmd([PY, "-m", "src.ingestion.run_all",
                    "--only", "holidays,school_holidays"]) == 0


def fame_step(ctx):
    """Refresh destination fame. The dest pageviews cache is never invalidated
    by the harvester (it only fills missing ids), so to pick up drifted fame we
    drop it first, then re-harvest, then re-derive beauty + rating."""
    pv = CACHE / "dest_pageviews.json"
    if pv.exists():
        try:
            pv.unlink()
            log("  cleared cache/dest_pageviews.json to force fresh fame")
        except OSError as e:
            log(f"  (could not clear pageviews cache: {e})")
    if run_cmd([PY, "pipeline/harvest_pageviews.py", "dests"]) != 0:
        return False
    if run_cmd([PY, "pipeline/apply_beauty_layer.py"]) != 0:
        return False
    return run_cmd([PY, "pipeline/apply_rating_layer.py"]) == 0


# --------------------------------------------------------------------------- #
# Task registry
# --------------------------------------------------------------------------- #
# Each task: key, title, cadence, writes_app_data, and either cmds or run.
#   cadence         weekly | monthly | quarterly | backfill  (backfill = --only)
#   writes_app_data -> pre-write backup + concurrency guard
#   run(ctx)->bool  custom step (preferred where logic is needed)
#   cmds            list of argv lists, run in order; any non-zero fails the task
#   guard(ctx)      optional; (ok, reason). ok=False SKIPS (not a failure)
#   note            printed reminder (e.g. "bump the YEAR first")
TASKS = [
    {
        "key": "tp_stage",
        "title": "Travelpayouts cache staging -> data/derived/tp_fares.json",
        "cadence": "weekly",
        "writes_app_data": False,
        "soft": True,
        "cmds": [[PY, "-m", "src.ingestion.run_all", "--only", "travelpayouts"]],
        "note": ("cheap (provider-encouraged API cache reads, no scraping), so it can "
                 "run as often as the pipeline itself. Ordered BEFORE `fares` so the "
                 "patch merges fresh staging. Missing TRAVELPAYOUTS_TOKEN -> the "
                 "collector SKIPs cleanly. Also part of the weekly `ingestion` sweep; "
                 "the duplicate run is harmless."),
    },
    {
        "key": "fares",
        "title": "Live Ryanair fares (rolling window) -> public/fares",
        "cadence": "weekly",
        "writes_app_data": True,
        "run": fares_step,
        "note": "the LIVE fare system (harvest_all_origins); resumes an interrupted refresh.",
    },
    {
        "key": "wizz_fares",
        "title": "Live Wizz Air fares -> merged cheapest-wins into public/fares",
        "cadence": "weekly",
        "writes_app_data": True,
        "run": wizz_step,
        "note": ("adds Wizz-only routes + undercuts Ryanair on shared ones; MUST run "
                 "after `fares` (merges onto the fresh Ryanair table). Full harvest "
                 "~3h, resumable; tags days Wizz wins as W6 in out_c/ret_c."),
    },
    {
        "key": "vueling_fares",
        "title": "Live Vueling fares -> merged cheapest-wins into public/fares",
        "cadence": "weekly",
        "writes_app_data": True,
        "run": vueling_step,
        "note": ("adds Vueling-only routes + undercuts Ryanair/Wizz; native EUR, a "
                 "full ~11-mo calendar per call. MUST run after `fares` and "
                 "`wizz_fares`. Discovery ~260 calls then ~1/leg; resumable; tags VY."),
    },
    {
        "key": "volotea_fares",
        "title": "Live Volotea fares -> merged cheapest-wins into public/fares",
        "cadence": "weekly",
        "writes_app_data": True,
        "run": volotea_step,
        "note": ("adds Volotea-only regional routes; native EUR via getminprice. "
                 "COARSER than the others (cheapest per date window, not daily). MUST "
                 "run after fares/wizz_fares/vueling_fares. ~260 discovery + 1/origin; "
                 "resumable; tags V7."),
    },
    # ---- estimation + raw ingestion layer: soft (never blocks the ship) ---- #
    {
        "key": "fare_history",
        "title": "Schema-gate + archive fare snapshot -> data/history",
        "cadence": "weekly",
        "writes_app_data": False,
        "soft": True,
        "run": fare_history_step,
        "note": ("builds the (lead time, price) training history for the fare "
                 "estimation model; anomalous fare files are dead-lettered to "
                 "data/deadletter. Runs after the carrier merges."),
    },
    {
        "key": "fare_model",
        "title": "Fare estimation model: drift check -> retrain -> estimates",
        "cadence": "weekly",
        "writes_app_data": False,
        "soft": True,
        "run": fare_model_step,
        "note": ("PSI/KS + MAPE drift gates decide the retrain "
                 "(logs/drift_report.json); quantile GBDT exports route-month "
                 "price bands to data/models/fare_estimates.json.gz."),
    },
    {
        "key": "ingestion",
        "title": "Raw open-data mirror (schedules, realtime, ADS-B, ferries)",
        "cadence": "weekly",
        "writes_app_data": False,
        "soft": True,
        "run": ingestion_step,
        "note": ("src/ingestion collectors -> data/raw; keyless sources SKIP with "
                 "instructions. `python -m src.ingestion.run_all --list` for the "
                 "roster, --check to probe endpoints."),
    },
    {
        "key": "demand_events",
        "title": "Demand catalysts: public + school holiday calendars",
        "cadence": "monthly",
        "writes_app_data": False,
        "soft": True,
        "run": demand_events_step,
        "note": ("Nager.Date + OpenHolidays -> data/raw/holidays + "
                 "data/raw/school_holidays; feeds the model's holiday features."),
    },
    {
        "key": "fame",
        "title": "Wikipedia fame -> beauty -> traveller rating",
        "cadence": "monthly",
        "writes_app_data": True,
        "run": fame_step,
        "note": "fame is a rolling 12-mo average; monthly is plenty. Cheap, additive.",
    },
    {
        "key": "flight_times",
        "title": "Departure/arrival times for already-covered origins",
        "cadence": "monthly",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/harvest_flight_times.py", "all", "CRL,BRU"]],
        "note": ("keeps times in sync with refreshed fares for CRL,BRU only. "
                 "A full all-origins sweep is ~16h - run manually if you want it."),
    },
    {
        "key": "crowding",
        "title": "Regional crowding (Eurostat tourism density)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/harvest_tourism_density.py"]],
        "note": "Eurostat updates ~annually; pass --refresh in the script to re-download.",
    },
    {
        "key": "bathing_water",
        "title": "Bathing-water quality (EEA WISE)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/harvest_bathing_water.py"]],
        "note": "YEAR is pinned in the script (2025). Bump it + --refresh for a new season.",
    },
    {
        "key": "lodging",
        "title": "Inside Airbnb lodging anchors -> premiums",
        "cadence": "quarterly",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_accommodation.py"],
            [PY, "pipeline/apply_accommodation_anchors.py"],
            [PY, "pipeline/apply_longtail_granularity.py"],
            [PY, "pipeline/apply_tourist_premium.py"],
        ],
        "note": ("snapshot dates are pinned in harvest_accommodation.py (2026-06). "
                 "Bump DATASETS + purge cache/iab to actually get newer prices."),
    },
    {
        "key": "staytiers",
        "title": "Hostel + hotel stay tiers (Hostelworld / LiteAPI)",
        "cadence": "monthly",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_hostelworld.py"],
            [PY, "pipeline/harvest_hotels_liteapi.py"],
            [PY, "pipeline/apply_stay_tiers.py"],
        ],
        "note": ("needs HW_CONSUMER_KEY/HW_CONSUMER_SECRET + LITEAPI_KEY in the env; "
                 "without them the harvesters no-op cleanly (no cache written). Apply "
                 "REFUSES fixture anchors (dev --fixtures runs) loudly: re-harvest with "
                 "real keys before this task can ship tiers."),
    },

    # ---- backfill / on catalogue growth: MANUAL (--only), coverage-guarded ---- #
    {
        "key": "geonames",
        "title": "GeoNames population/settlement (new dests)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/harvest_geonames.py"]],
        "note": "static gazetteer; only worth it after the catalogue grows.",
    },
    {
        "key": "nature",
        "title": "Protected areas / national parks (OSM)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/harvest_protected_areas_osm.py"]],
        "note": "static geography; heavy Overpass sweep on a cold cache.",
    },
    {
        "key": "climate",
        "title": "WorldClim climate normals (new dests)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_climate_worldclim.py"],
            [PY, "pipeline/apply_climate.py"],
        ],
        "note": "needs cache/worldclim/*.tif + rasterio; fixed 1970-2000 normals (static).",
    },
    {
        "key": "guide",
        "title": "Wikivoyage 'why go here' blurbs",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_wikivoyage.py"],
            [PY, "pipeline/apply_wikivoyage.py"],
        ],
        # apply_wikivoyage pops guide for dests missing from the cache:
        "guard": guard_cache_covers("cache/wikivoyage.json", 0.90),
        "note": "harvest is additive; apply is coverage-guarded (won't strip on a thin cache).",
    },
    {
        "key": "images",
        "title": "Destination lead images (Wikipedia)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_images.py", "harvest"],
            [PY, "pipeline/harvest_images.py", "patch"],
        ],
        "guard": guard_cache_covers("cache/wiki_images.json", 0.95),
        "note": "NULL-RISK: patch nulls images for dests absent from the cache - guarded.",
    },
    {
        "key": "activities",
        "title": "POIs / attractions (OpenTripMap+Wikivoyage+Wikipedia)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_activities.py", "harvest"],
            [PY, "pipeline/harvest_activities.py", "patch"],
        ],
        "guard": guard_cache_covers("cache/activities.json", 0.95),
        "note": "NULL-RISK: patch nulls activities for dests absent from the cache - guarded.",
    },
    {
        "key": "overture",
        "title": "Overture Maps sightseeing POIs -> items_full (additive)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/harvest_pois_overture.py", "assign"]],
        "note": ("merges the cached Overture parquet (cache/overture_pois_eu.parquet) "
                 "into items_full, cap 150/dest, rate<=2; additive (never nulls). "
                 "Re-run `harvest_pois_overture.py extract` first only to pull a "
                 "newer Overture release (edit RELEASE). Run BEFORE poi_enrich."),
    },
    {
        "key": "must_descs",
        "title": "Must-see POI images + descriptions (high-value subset only)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/enrich_must_descs.py"]],
        "note": ("enriches ONLY the day-planner-surfaced must-see + worth-the-detour "
                 "POIs (a few thousand), not the 87k long tail; cheap, additive, "
                 "resumable. Prefer this over poi_enrich when you only want the "
                 "high-value image/description gap filled."),
    },
    {
        "key": "poi_images_wikidata",
        "title": "Bulk POI images via Wikidata P18 (fast)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/harvest_pois_wikidata_images.py", "all"]],
        "note": ("one WDQS box query per dest (~1,500) then match image-less POIs "
                 "to nearby imaged Wikidata entities by distance + Commons filename. "
                 "FAR faster than the per-POI Commons sweep - run this FIRST, then "
                 "poi_images mops up the remainder. Additive (never nulls)."),
    },
    {
        "key": "poi_images",
        "title": "All-POI image sweep (Commons + Wikipedia, best-effort)",
        "cadence": "backfill",
        "writes_app_data": True,
        "retries": 12,
        "cmds": [
            [PY, "pipeline/enrich_images_commons.py"],
            [PY, "pipeline/enrich_images_web.py"],
        ],
        "note": ("gathers images for the FULL image-less POI set (long tail incl.), "
                 "not just must-see. Resumable + atomic writes + auto-retry, but "
                 "multi-hour and Wikimedia-rate-limited - run when no other session "
                 "hits Wikipedia/Commons. Additive (never nulls)."),
    },
    {
        "key": "poi_enrich",
        "title": "POI images + rich descriptions (additive)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/enrich_images_commons.py"],
            [PY, "pipeline/enrich_images_web.py"],
            [PY, "pipeline/enrich_must_descs.py"],
        ],
        "note": "all additive (never null); heavy Wikipedia sweeps - run after activities.",
    },
]
TASK_BY_KEY = {t["key"]: t for t in TASKS}


# --------------------------------------------------------------------------- #
# Planner + runner
# --------------------------------------------------------------------------- #
def is_due(task, state):
    days = CADENCE_DAYS.get(task["cadence"])
    if days is None:            # backfill/manual: never auto-due
        return False
    last = state.get(task["key"], {}).get("last_success")
    if not last:
        return True
    try:
        elapsed = now_utc() - datetime.fromisoformat(last)
    except Exception:
        return True
    return elapsed >= timedelta(days=days)


def select_tasks(args, state):
    if args.only:
        keys = [k.strip() for k in args.only.split(",") if k.strip()]
        unknown = [k for k in keys if k not in TASK_BY_KEY]
        if unknown:
            sys.exit(f"unknown task key(s): {', '.join(unknown)}\n"
                     f"known: {', '.join(TASK_BY_KEY)}")
        return [TASK_BY_KEY[k] for k in keys]
    ceiling = CADENCE_RANK.get(args.max_cadence, 3) if args.max_cadence else 3
    return [t for t in TASKS
            if CADENCE_RANK[t["cadence"]] <= ceiling and is_due(t, state)]


def cmd_list(args):
    state = load_state()
    log(f"{'KEY':<14} {'CADENCE':<10} {'LAST SUCCESS':<22} DUE  TITLE")
    for t in TASKS:
        last = state.get(t["key"], {}).get("last_success", "-")
        due = "yes" if is_due(t, state) else ("--" if t["cadence"] in ("backfill", "manual") else "no")
        log(f"{t['key']:<14} {t['cadence']:<10} {last:<22} {due:<4} {t['title']}")


def main():
    ap = argparse.ArgumentParser(description="Carta data pipeline orchestrator")
    ap.add_argument("--only", help="comma-list of task keys to force-run (ignores 'due')")
    ap.add_argument("--max-cadence", choices=["weekly", "monthly", "quarterly"],
                    help="only run tasks at or faster than this tier")
    ap.add_argument("--max-origins", type=int, metavar="N",
                    help="fares task only: targeted refresh of the N stalest-highest-"
                         "priority origins (age x popularity, data/derived/"
                         "freshness_report.json) instead of the full re-fetch; "
                         "pairs well with --only fares")
    ap.add_argument("--dry-run", action="store_true", help="print the plan, run nothing")
    ap.add_argument("--list", action="store_true", help="list tasks + last-run + due, then exit")
    ap.add_argument("--force", action="store_true", help="bypass the other-python concurrency guard")
    ap.add_argument("--no-backup", action="store_true", help="skip the pre-write master backup")
    ap.add_argument("--ship", choices=["build", "data", "none"], default="build",
                    help="after writers: full vite build (default), sync-only, or nothing")
    args = ap.parse_args()
    if args.max_origins is not None and args.max_origins < 1:
        ap.error("--max-origins must be >= 1")

    LOGS.mkdir(parents=True, exist_ok=True)
    global _LOG_FH
    _LOG_FH = open(LOGS / f"pipeline_{date.today().isoformat()}.log", "a", encoding="utf-8")

    if args.list:
        cmd_list(args)
        return 0

    state = load_state()
    plan = select_tasks(args, state)

    log("=" * 70)
    log(f"Carta pipeline  {now_utc().isoformat(timespec='seconds')}  "
        f"({dest_count()} dests)")
    log("=" * 70)
    if not plan:
        log("nothing due. (`--list` to see cadences, `--only <key>` to force one.)")
        return 0
    log("plan:")
    for t in plan:
        log(f"  - {t['key']:<14} [{t['cadence']}]  {t['title']}")
        if t.get("note"):
            log(f"      note: {t['note']}")
    if args.max_origins and not any(t["key"] == "fares" for t in plan):
        log(f"\n(--max-origins {args.max_origins} set but `fares` is not in this "
            "plan; use --only fares to force it)")
    if args.dry_run:
        log("")
        try:
            report = build_freshness_report(state)
            print_freshness_summary(report)
            if args.max_origins:
                eligible = None
                if RYANAIR_GRAPH.exists():
                    graph = json.loads(RYANAIR_GRAPH.read_text(encoding="utf-8"))
                    eligible = {o for o, dests in graph.items() if dests}
                targets = pick_stalest_origins(report, args.max_origins, eligible)
                log(f"  --max-origins {args.max_origins}: the fares task would "
                    "re-fetch only: " + (", ".join(targets) or "-"))
        except Exception as e:
            log(f"(freshness report failed: {type(e).__name__}: {e})")
        log("\n--dry-run: nothing executed.")
        return 0

    writers = [t for t in plan if t.get("writes_app_data")]

    # Concurrency guard (only matters if we'll write the master).
    if writers:
        others = other_python_running()
        if others and not args.force:
            log(f"\nABORT: another python is running (PIDs {others}). A second writer would")
            log("clobber app_data.json. Wait for it to finish, or re-run with --force if")
            log("you are certain it is not writing the master.")
            return 2
        if LOCK.exists() and not args.force:
            log(f"\nABORT: {LOCK.relative_to(ROOT)} exists - another pipeline run may be active.")
            log("Delete it if that run is dead, or use --force.")
            return 2
        LOCK.write_text(f"{os.getpid()} {now_utc().isoformat()}\n", encoding="utf-8")

    ctx = {"dest_count": dest_count(), "state": state,
           "max_origins": args.max_origins}
    backed_up = False
    ran, skipped, failed, soft_failed = [], [], [], []
    try:
        for t in plan:
            log("\n" + "-" * 70)
            log(f"TASK {t['key']}  ({t['cadence']})  {t['title']}")

            guard = t.get("guard")
            if guard:
                ok, reason = guard(ctx)
                log(f"  guard: {reason}")
                if not ok:
                    skipped.append(t["key"])
                    continue

            if t.get("writes_app_data") and not args.no_backup and not backed_up:
                backup_master()
                backed_up = True

            t0 = time.time()
            if t.get("run"):
                ok = bool(t["run"](ctx))
            else:
                # Each cmd may retry: resumable harvesters pick up from their cache,
                # so a transient failure (rate-limit, a flaky file write) just resumes.
                retries = t.get("retries", 0)
                ok = True
                for c in t["cmds"]:
                    attempt = 0
                    while (rc := run_cmd(c)) != 0:
                        attempt += 1
                        if attempt > retries:
                            ok = False
                            break
                        log(f"  cmd failed (rc={rc}); retry {attempt}/{retries} "
                            f"in 30s (resumes from cache)")
                        time.sleep(30)
                    if not ok:
                        break
            dt = int(time.time() - t0)

            if ok:
                log(f"  OK ({dt}s)")
                ran.append(t["key"])
                state.setdefault(t["key"], {})["last_success"] = now_utc().isoformat()
                save_state(state)
                ctx["dest_count"] = dest_count()
            elif t.get("soft"):
                log(f"  SOFT-FAIL ({dt}s) - estimation/ingestion layer; does not "
                    "block the data ship and retries next run.")
                soft_failed.append(t["key"])
            else:
                log(f"  FAILED ({dt}s) - stopping before ship to avoid shipping half data.")
                failed.append(t["key"])
                break
    finally:
        if LOCK.exists():
            try:
                LOCK.unlink()
            except OSError:
                pass

    # Ship, only if a writer ran and none failed.
    if ran and not failed and any(TASK_BY_KEY[k].get("writes_app_data") for k in ran):
        if args.ship == "none":
            log("\n--ship none: skipping build. Run `npm run build` in continent-app to ship.")
        elif args.ship == "data":
            # `npm run data` == node scripts/sync-data.mjs; call node directly so
            # a missing npm shim on PATH can't block the ship.
            log("\nshipping: node scripts/sync-data.mjs")
            rc = run_cmd([node_exe(), "scripts/sync-data.mjs"], cwd=CONTINENT)
            if rc != 0:
                log("  ! sync FAILED - data written to app_data.json but not shipped to public/.")
                failed.append("ship")
        else:  # build
            log("\nshipping: npm run build")
            rc = run_cmd([npm_exe(), "run", "build"], cwd=CONTINENT)
            if rc != 0:
                log("  ! build FAILED - data written to app_data.json but not shipped.")
                failed.append("ship")

    # Freshness report, regenerated AFTER the ship because public/fares/ is only
    # rewritten by the build/sync: this is the age of what the app now serves.
    log("")
    try:
        print_freshness_summary(build_freshness_report(state))
    except Exception as e:
        log(f"(freshness report failed: {type(e).__name__}: {e})")

    log("\n" + "=" * 70)
    log(f"done. ran={ran or '-'}  skipped={skipped or '-'}  failed={failed or '-'}"
        f"  soft-failed={soft_failed or '-'}")
    log("=" * 70)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
