"""run_pipeline.py - one orchestrator for the whole Carta data pipeline.

Wraps the existing harvest_* / enrich_* / apply_* scripts in a single safe,
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

  weekly    fares (live Ryanair re-fetch, rolling window) + ship
  monthly   fame (pageviews) -> beauty -> rating; flight times for covered origins
  quarterly open-data snapshots (crowding, bathing water, lodging) *
  backfill  static/heavy or null-risk jobs - MANUAL only, via --only (guarded)

  * several quarterly sources pin a YEAR / snapshot date in their own source and
    will re-emit identical data until you bump it; the task prints the reminder.

USAGE
-----
  python run_pipeline.py                     # run every task that is DUE
  python run_pipeline.py --dry-run           # show the plan, run nothing
  python run_pipeline.py --max-cadence weekly# only weekly-tier tasks (fast fares run)
  python run_pipeline.py --only fares         # force one/more tasks by key, ignore "due"
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
# Custom step: fares (resume-if-interrupted, else rolling refresh)
# --------------------------------------------------------------------------- #
def fares_step(ctx):
    """Live Ryanair fare refresh via harvest_all_origins.py (the system that
    actually ships as public/fares/). If a previous refresh was interrupted -
    window already rolled to today AND a partial fare cache exists - RESUME it
    (harvest+patch) instead of deleting the cache and restarting the ~hours-long
    fetch. Otherwise do a full rolling refresh."""
    fares_cache = CACHE / "fare_all_origins.json"
    today = date.today().isoformat()
    try:
        meta = json.loads(APP_DATA.read_text(encoding="utf-8"))["meta"]
        window_is_current = meta.get("start_date") == today
    except Exception:
        window_is_current = False

    graph = CACHE / "ryanair_route_graph.json"
    if not graph.exists():
        if run_cmd([PY, "harvest_all_origins.py", "graph"]) != 0:
            return False

    if window_is_current and fares_cache.exists():
        log("  window already rolled to today with a partial cache -> RESUME (harvest+patch)")
        if run_cmd([PY, "harvest_all_origins.py", "harvest"]) != 0:
            return False
        return run_cmd([PY, "harvest_all_origins.py", "patch"]) == 0

    log("  rolling fare window forward and re-fetching live (refresh)")
    return run_cmd([PY, "harvest_all_origins.py", "refresh"]) == 0


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
    if run_cmd([PY, "harvest_pageviews.py", "dests"]) != 0:
        return False
    if run_cmd([PY, "apply_beauty_layer.py"]) != 0:
        return False
    return run_cmd([PY, "apply_rating_layer.py"]) == 0


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
        "key": "fares",
        "title": "Live Ryanair fares (rolling window) -> public/fares",
        "cadence": "weekly",
        "writes_app_data": True,
        "run": fares_step,
        "note": "the LIVE fare system (harvest_all_origins); resumes an interrupted refresh.",
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
        "cmds": [[PY, "harvest_flight_times.py", "all", "CRL,BRU"]],
        "note": ("keeps times in sync with refreshed fares for CRL,BRU only. "
                 "A full all-origins sweep is ~16h - run manually if you want it."),
    },
    {
        "key": "crowding",
        "title": "Regional crowding (Eurostat tourism density)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "cmds": [[PY, "harvest_tourism_density.py"]],
        "note": "Eurostat updates ~annually; pass --refresh in the script to re-download.",
    },
    {
        "key": "bathing_water",
        "title": "Bathing-water quality (EEA WISE)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "cmds": [[PY, "harvest_bathing_water.py"]],
        "note": "YEAR is pinned in the script (2025). Bump it + --refresh for a new season.",
    },
    {
        "key": "lodging",
        "title": "Inside Airbnb lodging anchors -> premiums",
        "cadence": "quarterly",
        "writes_app_data": True,
        "cmds": [
            [PY, "harvest_accommodation.py"],
            [PY, "apply_accommodation_anchors.py"],
            [PY, "apply_longtail_granularity.py"],
            [PY, "apply_tourist_premium.py"],
        ],
        "note": ("snapshot dates are pinned in harvest_accommodation.py (2026-06). "
                 "Bump DATASETS + purge cache/iab to actually get newer prices."),
    },

    # ---- backfill / on catalogue growth: MANUAL (--only), coverage-guarded ---- #
    {
        "key": "geonames",
        "title": "GeoNames population/settlement (new dests)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "harvest_geonames.py"]],
        "note": "static gazetteer; only worth it after the catalogue grows.",
    },
    {
        "key": "nature",
        "title": "Protected areas / national parks (OSM)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "harvest_protected_areas_osm.py"]],
        "note": "static geography; heavy Overpass sweep on a cold cache.",
    },
    {
        "key": "climate",
        "title": "WorldClim climate normals (new dests)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "harvest_climate_worldclim.py"],
            [PY, "apply_climate.py"],
        ],
        "note": "needs cache/worldclim/*.tif + rasterio; fixed 1970-2000 normals (static).",
    },
    {
        "key": "guide",
        "title": "Wikivoyage 'why go here' blurbs",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "harvest_wikivoyage.py"],
            [PY, "apply_wikivoyage.py"],
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
            [PY, "harvest_images.py", "harvest"],
            [PY, "harvest_images.py", "patch"],
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
            [PY, "harvest_activities.py", "harvest"],
            [PY, "harvest_activities.py", "patch"],
        ],
        "guard": guard_cache_covers("cache/activities.json", 0.95),
        "note": "NULL-RISK: patch nulls activities for dests absent from the cache - guarded.",
    },
    {
        "key": "overture",
        "title": "Overture Maps sightseeing POIs -> items_full (additive)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "harvest_pois_overture.py", "assign"]],
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
        "cmds": [[PY, "enrich_must_descs.py"]],
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
        "cmds": [[PY, "harvest_pois_wikidata_images.py", "all"]],
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
            [PY, "enrich_images_commons.py"],
            [PY, "enrich_images_web.py"],
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
            [PY, "enrich_images_commons.py"],
            [PY, "enrich_images_web.py"],
            [PY, "enrich_must_descs.py"],
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
    ap.add_argument("--dry-run", action="store_true", help="print the plan, run nothing")
    ap.add_argument("--list", action="store_true", help="list tasks + last-run + due, then exit")
    ap.add_argument("--force", action="store_true", help="bypass the other-python concurrency guard")
    ap.add_argument("--no-backup", action="store_true", help="skip the pre-write master backup")
    ap.add_argument("--ship", choices=["build", "data", "none"], default="build",
                    help="after writers: full vite build (default), sync-only, or nothing")
    args = ap.parse_args()

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
    if args.dry_run:
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

    ctx = {"dest_count": dest_count()}
    backed_up = False
    ran, skipped, failed = [], [], []
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

    log("\n" + "=" * 70)
    log(f"done. ran={ran or '-'}  skipped={skipped or '-'}  failed={failed or '-'}")
    log("=" * 70)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
