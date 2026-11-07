"""run_pipeline.py - one orchestrator for the whole Carta data pipeline.

Wraps the pipeline/harvest_* / enrich_* / apply_* scripts in a single safe,
resumable, cadence-aware driver so the data can be refreshed on a schedule
(a weekly Windows Scheduled Task via run_pipeline.bat, or on the Linux
orchestrator the systemd timer that runs infra/hetzner/cax11/run_pipeline.sh,
T048) without hand-running a dozen commands and without the known footguns
firing.

WHY A DRIVER (not just a .bat chain)
------------------------------------
Almost every harvester does a full read-modify-write of the ~50 MB
app_data/app_data.json master. That creates three hazards this driver guards:
  1. Concurrency: two writers at once clobber each other (the repo's
     "concurrent-session gotcha"). We refuse to start a writer step while any
     OTHER python is running (on Linux: any other python running one of this
     repo's pipeline scripts), and hold a lockfile so two pipeline runs can't
     overlap.
  2. patch()-nulls-coverage: harvest_activities/harvest_images `patch`, and
     apply_wikivoyage, WIPE the field for every destination absent from their
     cache. Those steps are NOT in any automatic tier; when run manually they
     are coverage-guarded (skipped unless the cache covers ~all dests).

Every writer step is preceded by a timestamped backup of the master.

CADENCE MODEL
-------------
Each task declares its own refresh interval; the driver runs a task only when
that interval has elapsed since its last success (state in logs/pipeline_state.json).
So you schedule ONE weekly job and each layer self-selects how often it fires:

  weekly    raw open-data mirror (src/ingestion: schedules, realtime, ADS-B) + ship
  monthly   fame (pageviews) -> designations -> beauty -> place -> rating
  monthly   holiday calendars (demand catalysts for the estimation model)
  monthly   trails popularity (curation shortlists for the review queue)
  monthly   natural features: the beach and summit wire, rebuilt behind its gate
  quarterly beaches: the named coves of Europe, scored and photographed
  quarterly lakes: the best water bodies, scored, with a swimming verdict
  quarterly mountains: the summits worth travelling for, and how you get up
  quarterly open-data snapshots (crowding, bathing water, lodging) *
  quarterly trails ingest (Geofabrik hiking relations -> the trailslab lab)
  quarterly coverage gaps (what Europe has that the catalogue does not)
  after     trails elevation + validation: no interval of their own; they are
            due when the task they depend on last succeeded more recently than
            they did (trails_ingest -> trails_elevation -> trails_validate).
            A chain that starts in one run finishes in the same run.
  backfill  static/heavy or null-risk jobs - MANUAL only, via --only (guarded)

Tasks marked `soft` (the estimation/ingestion layer) log failures loudly but
never block the core refresh + ship; they retry on the next run.

  * several quarterly sources pin a YEAR / snapshot date in their own source and
    will re-emit identical data until you bump it; the task prints the reminder.

FRESHNESS REPORT
----------------
Every run (and every --dry-run) writes data/derived/freshness_report.json. It
holds the trails section (see below). The per-origin fare slice section and
the --max-origins targeted refresh went with the old fare logic (T511).

TRAILS CONTENT LAB
------------------
The trails tasks drive the LOCAL PostGIS staging lab (tools/trailslab, port
5433), never app_data.json, so they take no master lock, never gate the ship,
and a lab that is down SKIPS them (guard) instead of failing the run. The chain
is ingest -> elevation -> validate, plus popularity on its own monthly clock.

REGRESSION PATH: validate.py routes DRAFTS only, which is what keeps `approved`
human-only, so published content had nothing watching it. trails_validate now
runs pipeline/trails/regression.py straight after the validation pass: a
published trip whose refreshed quality_score fell below the review threshold is
demoted to needs_review and reopened in the review queue with its failing
checks attached (a row in validation_runs AND one in trip_reviews). It is never
unpublished, rejected or deleted. The result lands in
data/derived/trails_freshness.json, folded into freshness_report.json under
"trails" so one report still answers "how old and how healthy is what we
serve".

`--dry-run` executes the read-only half of trails_validate against the staging
DB (a sampled validation pass plus the full regression detection), so you can
see what a real run would move before it moves anything.

NATURAL FEATURES: RETIRED
-------------------------
The `features` task (pipeline/features -> public/features) was retired
2026-09-02 per brief 08. Its wire predated the beaches and mountains layers
that replaced it and no app surface ever read it. Code lives under
archive/pipeline_features; the beaches/lakes/mountains tasks are the layer now.

USAGE
-----
  python run_pipeline.py                     # run every task that is DUE
  python run_pipeline.py --dry-run           # show the plan + freshness summary,
                                             #   run nothing (report file still written)
  python run_pipeline.py --max-cadence weekly# only weekly-tier tasks
  python run_pipeline.py --only crowding      # force one/more tasks by key, ignore "due"
  python run_pipeline.py --only trails_validate --dry-run
                                             # score the staging lab and list the
                                             #   published trips that regressed,
                                             #   without moving any of them
  python run_pipeline.py --list              # list tasks, cadences, last-run, due?
  python run_pipeline.py --force             # bypass the other-python concurrency guard
  python run_pipeline.py --ship none         # skip the npm build at the end
  python run_pipeline.py --no-backup         # skip the pre-write master backup (not advised)
  python run_pipeline.py --max-cadence weekly --also climate_daily,dossier
                                             # the weekly tier PLUS these tasks when due
                                             #   (and the `after` tasks that follow them)
  python run_pipeline.py --also ... --max-hours 16
                                             # start no --also task after 16 h; the rest
                                             #   stay due and run next time

--also (T640) is how the Hetzner box (weekly ceiling, register row T048-h) runs
the explore data fill without lifting the ceiling for everything else: the
stays, food and flight tasks of price batch F0 stay held back. run_pipeline.sh
passes CARTA_EXTRA_TASKS as --also. A task may carry a "rev": a task whose
recorded rev differs from its own is due whatever its clock says, so a task
whose commands changed runs on the next scheduled run, and one never run is
due anyway.

Keys: see pipeline/tasks/ (one module per domain) or `--list`. Safe to re-run; interrupted runs resume.
"""
import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

if sys.platform == "win32":
    # Task Scheduler, a piped console and cmd.exe all hand this process cp1252,
    # and the tasks it drives print real place names (Puy de Dome,
    # Eyjafjallajokull). Every pipeline script already reconfigures; the driver
    # that tees their output has to as well, or it dies on their success.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).parent
# The task table lives in pipeline/tasks/ (ROADMAP A2, T1207): one module per
# domain, run in pipeline/tasks/__init__.py DOMAINS order. Loaded by path from
# tests and infra/hetzner/cron/schedule.py, so the root goes on sys.path first.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from pipeline.tasks import _base, registry  # noqa: E402
from pipeline.tasks._base import (  # noqa: E402,F401  (re-exported: tests and schedule.py read them here)
    APP_DATA, CACHE, CONTINENT, LOGS, PY, guard_trailslab_up, log, node_exe, now_utc,
    npm_exe, run_cmd, trailslab_endpoint, trailslab_home)
from pipeline.tasks.last import _trailslab_worker_guard  # noqa: E402,F401

BACKUPS = ROOT / "app_data" / "backups"
STATE = LOGS / "pipeline_state.json"
LOCK = LOGS / "pipeline.lock"


CADENCE_DAYS = {"weekly": 7, "monthly": 30, "quarterly": 90}
# T1107 (H9): the box fires each tier on a calendar (infra/hetzner/cron/
# schedule.py), and a task's last_success is stamped when it FINISHES. Without
# slack a weekly task that ended at 11:00 is 2 hours short of due at next
# Monday's 09:00 and runs every other week; the first Saturday of a month is
# 28 days after the last one in February, and the third Saturday of a quarter
# can be 84 days after the previous one. A task is due once its interval less
# this slack has passed.
CADENCE_SLACK_DAYS = {"weekly": 1.5, "monthly": 4, "quarterly": 10}
# "after" has no interval: the task is due when a task it declares in `after`
# succeeded more recently than it did. Ranked with the monthly tier so a
# monthly-tier run still finishes a chain a quarterly ingest started; it cannot
# fire on its own, since the trigger has to have run first.
CADENCE_RANK = {"weekly": 1, "monthly": 2, "after": 2, "quarterly": 3,
                "backfill": 9, "manual": 9}
KEEP_BACKUPS = 6

DERIVED = ROOT / "data" / "derived"
FRESHNESS_REPORT = DERIVED / "freshness_report.json"

# Trails content lab (tools/trailslab): written by pipeline/trails/regression.py,
# folded into the freshness report under "trails".
TRAILS_FRESHNESS = DERIVED / "trails_freshness.json"

def heartbeat(suffix=""):
    """Ping the external dead-man's-switch (Healthchecks.io style: base URL =
    success, /start and /fail variants). The Scheduled Task and pg-style
    schedulers fail SILENTLY (machine asleep, task disabled, lock stuck), so
    an external monitor that expects a ping per cadence window is the only
    thing that notices a run that never happened. No env var = no-op; a ping
    failure is logged and never breaks the run."""
    base = os.environ.get("CARTA_HEARTBEAT_URL", "").rstrip("/")
    if not base:
        return
    import urllib.request
    url = base + suffix
    try:
        urllib.request.urlopen(url, timeout=10).read()
    except Exception as e:
        log(f"(heartbeat {suffix or '/'} failed: {type(e).__name__})")


# Layer key -> where its published row count lives. Most layers write an
# index.json with a count field already in it (the wire build step computes
# that count anyway, so this reads it rather than re-deriving it). regions
# has no index.json, so its count is the number of published region files.
_LAYER_INDEX_FIELDS = {
    "beaches": ("beaches/index.json", "n_beaches"),
    "lakes": ("lakes/index.json", "n_lakes"),
    "mountains": ("mountains/index.json", "n_mountains"),
    "trails": ("trails/index.json", "n_trips"),
    "cycling": ("cycling/index.json", "n_routes"),
}


def layer_row_counts():
    """Row counts per published layer, read from continent-app/public. Never
    raises: a layer whose wire is missing or malformed is left out rather than
    aborting the whole report, because the count is diagnostic, not a gate."""
    out = {}
    public = CONTINENT / "public"
    for layer, (rel, field) in _LAYER_INDEX_FIELDS.items():
        try:
            idx = json.loads((public / rel).read_text(encoding="utf-8"))
            n = idx.get(field)
            if isinstance(n, int):
                out[layer] = n
        except Exception:
            pass
    try:
        region_dir = public / "region"
        if region_dir.is_dir():
            out["regions"] = sum(1 for _ in region_dir.glob("*.json"))
    except Exception:
        pass
    return out


def report_pipeline_run(ran, skipped, failed, soft_failed, dests):
    """Write one row to public.pipeline_runs so the admin panel can show when
    the catalogue was last built, how big each layer is, and from wherever this run happened to execute
    (a laptop today, a Hetzner box once P3 finishes moving it there: see
    Execution/P3, T046 to T048, which shipped the infra code but did not move
    the run itself). Same shape as heartbeat(): no env vars, no-op; a failure
    to reach Supabase is logged and never breaks or fails the pipeline run,
    because telemetry about a run must never be the reason the run reports
    itself as failed.

    CARTA_SUPABASE_URL and CARTA_SUPABASE_SERVICE_KEY are deliberately not
    the app's VITE_SUPABASE_* pair: the service role key bypasses RLS and
    must never sit in continent-app/.env, which ships to the browser. It is
    set only in the environment that runs the pipeline."""
    url = os.environ.get("CARTA_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("CARTA_SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        log("(pipeline_runs: CARTA_SUPABASE_URL / CARTA_SUPABASE_SERVICE_KEY not set, skipping)")
        return
    import urllib.error
    import urllib.request
    body = json.dumps({
        "ran": ran, "skipped": skipped, "failed": failed, "soft_failed": soft_failed,
        "layer_counts": layer_row_counts(),
        "drift_gate": None,   # the fare model is gone (T511)
        "dest_count": dests,
    }).encode("utf-8")
    req = urllib.request.Request(
        url + "/rest/v1/pipeline_runs",
        data=body, method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=20).read()
        log("  pipeline_runs: reported this run to admin_health")
    except urllib.error.HTTPError as e:
        log(f"(pipeline_runs: HTTP {e.code} - {e.read()[:300]})")
    except Exception as e:
        log(f"(pipeline_runs: failed to report - {type(e).__name__}: {e})")


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
            return _posix_repo_python_pids(me)
    except Exception as e:
        log(f"  (could not check for other python processes: {e})")
        return []


# A python process counts as a possible master writer on POSIX only when it is
# running one of this repo's pipeline entry points. The script argument, or the
# module after -m, has to match one of these, relative to ROOT.
_REPO_SCRIPT_PREFIXES = ("pipeline/", "src/", "src.", "run_pipeline.py")


def _posix_repo_python_pids(me):
    """POSIX half of the concurrency guard (T048, the Linux orchestrator).

    The old branch was `pgrep -f python`, which matches every process with
    "python" anywhere in its command line. On the CAX11 that would abort every
    writer run whenever anything else in Python is alive, including the
    on-demand box driver (T047) and unattended-upgrades. So this only counts a
    python process that runs a repo pipeline script: its script (or -m module)
    is under pipeline/ or src/, or is run_pipeline.py, given either relative
    to the process's working directory or as an absolute path inside ROOT.
    `ps` gives the command lines; the working directory comes from /proc when
    there is one (Linux), and without /proc only absolute paths are
    recognised."""
    root = str(ROOT.resolve())
    out = subprocess.run(["ps", "-eo", "pid=,args="], capture_output=True,
                         text=True, timeout=20).stdout
    pids = []
    for row in out.splitlines():
        parts = row.strip().split(None, 1)
        if len(parts) < 2 or not parts[0].isdigit():
            continue
        pid, argv = int(parts[0]), parts[1].split()
        if pid == me or not argv:
            continue
        exe = os.path.basename(argv[0])
        if not (exe == "python" or exe.startswith("python3")):
            continue
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
        except OSError:
            cwd = None
        in_repo_cwd = bool(cwd) and (cwd == root or cwd.startswith(root + os.sep))
        rest = argv[1:]
        # The first non-option argument is the script; after -m it is a module.
        target, module = None, False
        for i, a in enumerate(rest):
            if a == "-m" and i + 1 < len(rest):
                target, module = rest[i + 1], True
                break
            if a == "-c":
                break
            if not a.startswith("-"):
                target = a
                break
        if not target:
            continue
        if module:
            # `python -m src.ingestion.run_all` resolves against its cwd.
            if not in_repo_cwd:
                continue
            rel = target
        else:
            full = target if target.startswith("/") else (
                os.path.normpath(os.path.join(cwd, target)) if cwd else None)
            if not full or not full.startswith(root + os.sep):
                continue
            rel = full[len(root) + 1:]
        if rel.startswith(_REPO_SCRIPT_PREFIXES):
            pids.append(pid)
    return pids


def _clear_stale_lock_posix():
    """Unattended Linux runs only (T048). A run killed hard (SIGKILL after the
    systemd timeout, an OOM kill, a power cut) never reaches the `finally` that
    deletes logs/pipeline.lock, and on a box nobody logs into, a stale lock
    would silently abort every Monday after it. The lock records its PID, so
    it is removed when that PID is gone or is no longer a run_pipeline.py.
    Windows keeps the old behaviour: a human deletes it."""
    try:
        pid = int(LOCK.read_text(encoding="utf-8").split()[0])
    except (OSError, ValueError, IndexError):
        return
    try:
        cmd = Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ")
        alive = b"run_pipeline.py" in cmd
    except OSError:
        alive = False
    if not alive:
        log(f"  removing stale {LOCK.relative_to(ROOT)}: PID {pid} is not a running "
            "run_pipeline.py")
        try:
            LOCK.unlink()
        except OSError:
            pass


def _exit_on_sigterm():
    """POSIX only (T048): turn SIGTERM into SystemExit so the `finally` in
    main() releases the lock when systemd stops the service or its timeout
    fires. Windows never receives SIGTERM from Task Scheduler, so it is left
    alone there."""
    import signal

    def _handler(signum, frame):
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, _handler)


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
    # prune to the newest KEEP_BACKUPS timestamped copies only: hand-named
    # snapshots (app_data.pre_expansion_*.json, premop) sort after the
    # timestamps, so a plain name sort pruned the copy just made (T536).
    old = sorted(BACKUPS.glob("app_data.[0-9]*.json"))
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



# --------------------------------------------------------------------------- #
# Freshness report
# --------------------------------------------------------------------------- #
def build_freshness_report(state):
    """Write data/derived/freshness_report.json: today only the trails
    section (how old and how healthy the published trail content is). The
    per-origin fare slice section went with the old fare logic (T511).
    Returns the report dict."""
    report = {"meta": {"generated_at": now_utc().isoformat(timespec="seconds")}}
    trails = trails_freshness_section()
    if trails:
        report["trails"] = trails
    DERIVED.mkdir(parents=True, exist_ok=True)
    FRESHNESS_REPORT.write_text(json.dumps(report, indent=1), encoding="utf-8")
    return report


def trails_freshness_section():
    """Fold the trails lab's own report (written by pipeline/trails/regression.py)
    into the freshness report, so the published-content regressions sit next to
    the other freshness numbers instead of in a file nobody opens. Read, never computed
    here: this driver must keep working without psycopg or a running lab."""
    if not TRAILS_FRESHNESS.exists():
        return None
    try:
        src = json.loads(TRAILS_FRESHNESS.read_text(encoding="utf-8"))
        meta = dict(src.get("meta") or {})
    except Exception as e:
        # Same shape as a good section, so every consumer can read it blind.
        return {"meta": {"error": f"{TRAILS_FRESHNESS.name} unreadable "
                                  f"({type(e).__name__})"},
                "countries": {}, "regressions": [], "watch": []}
    meta["source"] = "data/derived/trails_freshness.json"
    meta["age_days"] = round(max(0.0, (
        now_utc() - datetime.fromtimestamp(TRAILS_FRESHNESS.stat().st_mtime,
                                           tz=timezone.utc)
    ).total_seconds() / 86400), 1)
    return {"meta": meta,
            "countries": src.get("countries") or {},
            "regressions": src.get("regressions") or [],
            "watch": src.get("watch") or []}


def print_trails_freshness(report):
    """The trails half of the freshness summary: how much published content
    regressed, and how stale the staging lab's validation is."""
    trails = report.get("trails")
    if not trails:
        return
    meta = trails.get("meta") or {}
    if meta.get("error"):
        log(f"trails freshness: {meta['error']}")
        return
    n_reg, n_watch = len(trails["regressions"]), len(trails["watch"])
    log(f"trails: {meta.get('n_trips', 0)} trips in "
        f"{', '.join(meta.get('statuses') or ['-'])}, "
        f"{meta.get('n_judged', 0)} freshly validated; {n_reg} regressed below "
        f"{meta.get('floor', '?')} ({meta.get('n_demoted', 0)} demoted to "
        f"needs_review), {n_watch} on watch "
        f"(report {meta.get('age_days', '?')} days old)")
    verb = "would demote" if meta.get("dry_run") else "demoted"
    for r in trails["regressions"][:5]:
        log(f"    {verb} {r['id']} [{r['country']}] {r['title'][:44]}: "
            f"{r['quality_score']} < {r['floor']:g}"
            + (" (" + ", ".join(r["failing_checks"]) + ")"
               if r["failing_checks"] else ""))
    if n_reg > 5:
        log(f"    ... {n_reg - 5} more in {TRAILS_FRESHNESS.relative_to(ROOT)}")


def print_freshness_summary(report):
    print_trails_freshness(report)
    log(f"  report -> {FRESHNESS_REPORT.relative_to(ROOT)}")



# --------------------------------------------------------------------------- #
# Task registry
# --------------------------------------------------------------------------- #


# --- The photo engine's rescore hold, both directions (docs/PHOTOS.md, T047) --
# "Rescore runs AFTER a layer rebuild, never beside one." A rebuild regenerates
# the rows a rescore annotates, and both write cache/<layer>/rich_*.json, so
# whichever writes a country last silently drops the other's fields. Two files
# carry the rule, one per direction:
#   cache/<layer>/.rescore_hold     a rebuild is running. rescore.py refuses the
#                                   layer, and so does infra/hetzner/cax41/
#                                   spawn.sh before it creates a CAX41.
#   cache/<layer>/.rescore_running  a rescore is running: rescore.py on this
#                                   machine, or a clip_sweep on a CAX41 that
#                                   spawn.sh is driving. The layer task refuses.
# Before T047 the hold was only ever written by hand, so a scheduled rebuild
# ran unguarded, and nothing at all stopped a rebuild starting beside a sweep.
# The hold is a correctness guard only; memory is not what it arbitrates.
# Tasks that build an output from the master: the dest hand corrections are
# applied before each, so they carry a correction made since the last run
# (T1214, from T1173-c). apply_overrides.py does nothing when dest has no entry.
OVERRIDES_BEFORE = ("dossier", "guided_search", "ask_index")

RESCORE_LAYERS = {"beaches": "beaches", "lakes": "lakes", "mountains": "mountains",
                  # T640: the explore data fill re-enriches the same caches.
                  "beach_context": "beaches", "lake_detail": "lakes",
                  "peak_context": "mountains"}
# A marker written on another machine cannot be checked by PID. Older than
# this, it is taken as the leftover of a run that died there, and reported.
RESCORE_MARKER_MAX_AGE_S = 48 * 3600


def _pid_alive(pid):
    """True when a process with this PID exists on this machine."""
    if os.name == "nt":
        # os.kill(pid, 0) is not a probe on Windows: it terminates the target.
        try:
            out = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=30).stdout
        except (OSError, subprocess.SubprocessError):
            return True   # cannot tell: assume alive, the safe side
        return f'"{pid}"' in out
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def rescore_running(cache_dir):
    """Why a rescore of this layer blocks a rebuild right now, or None.

    The marker is `key: value` lines (host, pid, started as epoch seconds)
    after a first line saying who. Written on this machine, it counts while
    its PID lives. Written elsewhere (a tarball pulled from R2 can carry
    one), it counts for RESCORE_MARKER_MAX_AGE_S after it started."""
    path = CACHE / cache_dir / ".rescore_running"
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError:
        return f"{path.relative_to(ROOT)} exists and cannot be read"
    fields = {}
    for line in text.splitlines()[1:]:
        k, sep, v = line.partition(":")
        if sep:
            fields[k.strip().lower()] = v.strip()
    who = text.splitlines()[0] if text else "no reason given"
    host = fields.get("host", "")
    try:
        pid = int(fields.get("pid", ""))
    except ValueError:
        pid = None
    try:
        started = int(fields.get("started", ""))
    except ValueError:
        started = None
    if host == socket.gethostname() and pid:
        if _pid_alive(pid):
            return f"{who} (pid {pid})"
        log(f"  note: stale {path.relative_to(ROOT)} (pid {pid} is gone); ignored")
        return None
    if started and time.time() - started > RESCORE_MARKER_MAX_AGE_S:
        log(f"  note: {path.relative_to(ROOT)} from {host or 'another host'} is "
            f"older than {RESCORE_MARKER_MAX_AGE_S // 3600} h; ignored")
        return None
    return f"{who} (host {host or 'unknown'})"


def take_rescore_hold(task_key):
    """Write the layer's hold for the length of its task; the path, or None
    when a hold already exists (a rebuild someone started by hand owns it,
    and its `released:` handover must survive untouched)."""
    path = CACHE / RESCORE_LAYERS[task_key] / ".rescore_hold"
    if path.exists():
        log(f"  {path.relative_to(ROOT)} already exists; left as it is")
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"run_pipeline.py task {task_key} is rebuilding this cache; written "
        f"for the length of the task and removed when it ends (T047)\n"
        f"host: {socket.gethostname()}\npid: {os.getpid()}\n"
        f"started: {int(time.time())}\n", encoding="utf-8")
    return path


def release_rescore_hold(path):
    if path is None:
        return
    try:
        path.unlink()
    except OSError:
        pass



# Each task: key, title, cadence, writes_app_data, and either cmds or run.
#   cadence         weekly | monthly | quarterly | after | backfill
#                   (after = event-driven, see `after`; backfill = --only only)
#   after           task keys this one follows; due when one of them succeeded
#                   more recently than this task did
#   writes_app_data -> pre-write backup + concurrency guard
#   writes_wire     -> writes continent-app/public/ directly, never the master:
#                      no backup and no lock, but the ship still has to run or
#                      the new files never reach dist
#   run(ctx)->bool  custom step (preferred where logic is needed)
#   cmds            list of argv lists, run in order; any non-zero fails the task
#   guard(ctx)      optional; (ok, reason). ok=False SKIPS (not a failure).
#                   It is CALLED with ctx, so declare ctx even when unused
#                   (`def guard_x(ctx=None)`): the call is not wrapped, so a
#                   zero-arg guard raises TypeError and takes down the run.
#   dry_run(ctx)    optional read-only probe executed under --dry-run
#   soft            failures are logged and retried next run, never block the ship
#   note            printed reminder (e.g. "bump the YEAR first")
#   rev             optional string; when the state records another rev for
#                   this task (or none), the task is due now (T640). Bump it
#                   when the commands change in a way the next run must apply.
#   est_h           optional expected hours of a warm run, printed in the plan
#                   (T640, so a long first run is visible before it starts)
#
# The table itself is pipeline/tasks/<domain>.py, concatenated in DOMAINS order
# by pipeline/tasks/registry.py (T1207). Add a task to its domain module; the
# `last` module (photo_sources, trailslab_worker) always runs last.
TASKS = registry.TASKS
TASK_BY_KEY = {t["key"]: t for t in TASKS}

# Names --only accepts that expand to several tasks, in this order. Not tasks:
# they have no cadence, no state entry and no line in --list.
TASK_ALIASES = {
    # POI images + rich descriptions, all additive; run after activities.
    "poi_enrich": ["poi_images", "must_descs"],
}


# --------------------------------------------------------------------------- #
# Planner + runner
# --------------------------------------------------------------------------- #
def _last_success(task_key, state):
    raw = state.get(task_key, {}).get("last_success")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except Exception:
        return None


def rev_changed(task, state):
    """T640: a task whose commands changed since it last ran (its "rev")."""
    rev = task.get("rev")
    return bool(rev) and state.get(task["key"], {}).get("rev") != rev


def also_keys(args):
    """The --also task keys, validated."""
    keys = [k.strip() for k in (getattr(args, "also", None) or "").split(",") if k.strip()]
    unknown = [k for k in keys if k not in TASK_BY_KEY]
    if unknown:
        sys.exit(f"unknown --also task key(s): {', '.join(unknown)}")
    bad = [k for k in keys if TASK_BY_KEY[k]["cadence"] in ("backfill", "manual")]
    if bad:
        sys.exit(f"--also refuses backfill/manual task(s) {', '.join(bad)}: use --only by hand")
    return keys


def also_closure(args):
    """--also keys plus every `after` task that follows one of them, transitively,
    so a chain an --also task starts finishes in the same run."""
    keys = set(also_keys(args))
    grew = True
    while grew:
        grew = False
        for t in TASKS:
            if t["cadence"] == "after" and t["key"] not in keys \
                    and keys.intersection(t.get("after") or []):
                keys.add(t["key"])
                grew = True
    return keys


def admitted(t, args, ceiling, extra):
    """Under the ceiling, or named by --also (or following one)."""
    return CADENCE_RANK[t["cadence"]] <= ceiling or t["key"] in extra


def is_due(task, state):
    if task["cadence"] not in ("after", "backfill", "manual") and rev_changed(task, state):
        return True
    if task["cadence"] == "after":
        # Event-driven: due when something it follows has moved since. Never
        # due on a lab where the trigger has not run at all, so a fresh clone
        # does not try to validate an empty staging DB.
        mine = _last_success(task["key"], state)
        for dep in task.get("after") or []:
            theirs = _last_success(dep, state)
            if theirs and (mine is None or theirs > mine):
                return True
        return False
    days = CADENCE_DAYS.get(task["cadence"])
    if days is None:            # backfill/manual: never auto-due
        return False
    last = _last_success(task["key"], state)
    if last is None:
        return True
    slack = CADENCE_SLACK_DAYS.get(task["cadence"], 0)
    return (now_utc() - last) >= timedelta(days=days - slack)


def chain_followups(plan, state, args, done_keys):
    """Tasks that became due because something they follow just succeeded.

    Without this a chain would take one scheduled run per link (ingest this
    week, elevation next week, validation the week after). Skipped with --only:
    there the operator named exactly what should run."""
    if args.only:
        return []
    ceiling = CADENCE_RANK.get(args.max_cadence, 3) if args.max_cadence else 3
    extra = also_closure(args)
    added = []
    for t in TASKS:
        if t["cadence"] != "after" or t in plan or t["key"] in done_keys:
            continue
        if admitted(t, args, ceiling, extra) and is_due(t, state):
            plan.append(t)
            added.append(t["key"])
    return added


def stdin_is_terminal():
    """True when a person could be typing into this process. On Windows
    isatty() is also true for NUL, which is what a scheduled task's stdin
    usually is, so there the console itself is asked."""
    try:
        if not sys.stdin or not sys.stdin.isatty():
            return False
        if os.name != "nt":
            return True
        import ctypes
        import msvcrt
        mode = ctypes.c_ulong()
        handle = msvcrt.get_osfhandle(sys.stdin.fileno())
        return bool(ctypes.windll.kernel32.GetConsoleMode(handle, ctypes.byref(mode)))
    except Exception:
        return False


def select_tasks(args, state):
    if args.only:
        keys = []
        for k in (k.strip() for k in args.only.split(",")):
            for key in TASK_ALIASES.get(k, [k] if k else []):
                if key not in keys:
                    keys.append(key)
        unknown = [k for k in keys if k not in TASK_BY_KEY]
        if unknown:
            sys.exit(f"unknown task key(s): {', '.join(unknown)}\n"
                     f"known: {', '.join([*TASK_BY_KEY, *TASK_ALIASES])}")
        # Backfill tasks exist to need a human (several are null-risk patch
        # writers), so they never come due; this keeps a timer or a script
        # from reaching them through --only either (T261). A terminal counts
        # as the human; anything else must say --allow-backfill.
        backfill = [k for k in keys if TASK_BY_KEY[k]["cadence"] == "backfill"]
        if (backfill and not args.dry_run and not args.allow_backfill
                and not stdin_is_terminal()):
            sys.exit(f"refusing backfill task(s) {', '.join(backfill)} without a "
                     "terminal: they are manual by design. Run them by hand, or "
                     "pass --allow-backfill if a person really started this.")
        return [TASK_BY_KEY[k] for k in keys]
    ceiling = CADENCE_RANK.get(args.max_cadence, 3) if args.max_cadence else 3
    extra = also_closure(args)
    return [t for t in TASKS
            if CADENCE_RANK[t["cadence"]] <= 3 and admitted(t, args, ceiling, extra)
            and is_due(t, state)]


def held_back(args, state):
    """Due tasks a --max-cadence ceiling keeps out of this run. The CAX11 runs
    the weekly tier only (T048-h), so without this line every monthly and
    quarterly task would quietly run nowhere once the laptop stops."""
    if args.only or not args.max_cadence:
        return []
    ceiling = CADENCE_RANK[args.max_cadence]
    extra = also_closure(args)
    return [t["key"] for t in TASKS
            if ceiling < CADENCE_RANK[t["cadence"]] <= 3 and t["key"] not in extra
            and is_due(t, state)]


def cmd_list(args):
    state = load_state()
    log(f"{'KEY':<18} {'CADENCE':<10} {'LAST SUCCESS':<22} DUE  TITLE")
    for t in TASKS:
        last = state.get(t["key"], {}).get("last_success", "-")
        due = "yes" if is_due(t, state) else ("--" if t["cadence"] in ("backfill", "manual") else "no")
        if due == "yes" and rev_changed(t, state) and t["cadence"] != "after":
            due = "rev"
        title = t["title"]
        if t["cadence"] == "after":     # say what triggers it, the column can't
            title += "  (follows " + ", ".join(t["after"]) + ")"
        log(f"{t['key']:<18} {t['cadence']:<10} {last:<22} {due:<4} {title}")


def run_dry_probes(plan):
    """Under --dry-run, execute the read-only probe of every planned task that
    has one. Everything else still runs nothing: a probe may only read, and it
    exists so a plan can show what a real run WOULD change (which published
    trails would be demoted, say) rather than only naming the task."""
    probed = []
    # T640: what each planned guard would say on this machine, so a dry run on
    # the box shows which tasks will skip (network guards are not probed).
    log("\nguards on this machine (a skip is not a failure):")
    for t in plan:
        guard = t.get("guard")
        if not guard or t.get("dry_run"):
            continue
        try:
            ok, reason = guard({"dry_run": True})
        except Exception as e:
            ok, reason = False, f"guard raised {type(e).__name__}: {e}"
        log(f"  {t['key']:<18} {'runs ' if ok else 'SKIPS'}  {reason}")
    for t in plan:
        probe = t.get("dry_run")
        if not probe:
            continue
        log("\n" + "-" * 70)
        log(f"DRY-RUN PROBE {t['key']}  (read-only)  {t['title']}")
        guard = t.get("guard")
        if guard:
            ok, reason = guard({"dry_run": True})
            log(f"  guard: {reason}")
            if not ok:
                continue
        try:
            ok = bool(probe({"dry_run": True}))
        except Exception as e:
            log(f"  probe raised {type(e).__name__}: {e}")
            ok = False
        log("  probe OK" if ok else "  probe FAILED (a real run may still work)")
        probed.append(t["key"])
    return probed


def main():
    ap = argparse.ArgumentParser(description="Carta data pipeline orchestrator")
    ap.add_argument("--only", help="comma-list of task keys to force-run (ignores 'due')")
    ap.add_argument("--max-cadence", choices=["weekly", "monthly", "quarterly"],
                    help="only run tasks at or faster than this tier")
    ap.add_argument("--dry-run", action="store_true", help="print the plan, run nothing")
    ap.add_argument("--list", action="store_true", help="list tasks + last-run + due, then exit")
    ap.add_argument("--force", action="store_true", help="bypass the other-python concurrency guard")
    ap.add_argument("--no-backup", action="store_true", help="skip the pre-write master backup")
    ap.add_argument("--allow-backfill", action="store_true",
                    help="let --only run backfill tasks without a terminal (a person "
                         "started this from a script)")
    ap.add_argument("--ship", choices=["build", "data", "none"], default="build",
                    help="after writers: full vite build (default), sync-only, or nothing")
    ap.add_argument("--also", default="",
                    help="comma-list of task keys to add to the plan when due, above the "
                         "--max-cadence ceiling (their `after` followers come too). T640")
    ap.add_argument("--max-hours", type=float, default=None,
                    help="start no --also task once the run is this many hours old; "
                         "the rest stay due for the next run. T640")
    args = ap.parse_args()
    if args.only and args.also:
        log("(--also is ignored with --only: --only names exactly what runs)")
        args.also = ""
    also_keys(args)
    if os.name != "nt":
        _exit_on_sigterm()

    LOGS.mkdir(parents=True, exist_ok=True)
    _base._LOG_FH = open(LOGS / f"pipeline_{date.today().isoformat()}.log", "a", encoding="utf-8")

    if args.list:
        cmd_list(args)
        return 0

    state = load_state()
    plan = select_tasks(args, state)

    log("=" * 70)
    log(f"Carta pipeline  {now_utc().isoformat(timespec='seconds')}  "
        f"({dest_count()} dests)")
    log("=" * 70)
    held = held_back(args, state)
    if held:
        log(f"HELD BACK by --max-cadence {args.max_cadence}: {len(held)} due task(s) "
            f"will not run here: {', '.join(held)}")
    extra = also_closure(args)
    if extra:
        added_by_also = [t["key"] for t in plan if t["key"] in extra
                         and CADENCE_RANK[t["cadence"]] > CADENCE_RANK.get(args.max_cadence or "quarterly", 3)]
        log(f"ADDED by --also: {', '.join(added_by_also) or 'nothing due'}"
            f" (followers that may join: "
            f"{', '.join(k for k in sorted(extra) if TASK_BY_KEY[k]['cadence'] == 'after') or '-'})")
    if not plan:
        log("nothing due. (`--list` to see cadences, `--only <key>` to force one.)")
        return 0
    log("plan:")
    est_total = 0.0
    for t in plan:
        est = t.get("est_h")
        est_total += est or 0
        why = " rev " + t["rev"] if rev_changed(t, state) else ""
        log(f"  - {t['key']:<18} [{t['cadence']}{why}]"
            + (f" ~{est:g} h" if est else "") + f"  {t['title']}")
        if t.get("note"):
            log(f"      note: {t['note']}")
    if est_total:
        log(f"expected hours of the tasks that state one: about {est_total:.1f}"
            + (f" (--max-hours {args.max_hours:g}: --also tasks not started after that)"
               if args.max_hours else ""))
    if args.dry_run:
        probed = run_dry_probes(plan)
        log("")
        try:
            report = build_freshness_report(state)
            print_freshness_summary(report)
        except Exception as e:
            log(f"(freshness report failed: {type(e).__name__}: {e})")
        log("\n--dry-run: nothing written"
            + (f" (read-only probes executed: {', '.join(probed)})"
               if probed else "; no task in this plan has a read-only probe")
            + ".")
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
        if os.name != "nt" and LOCK.exists() and not args.force:
            _clear_stale_lock_posix()
        if LOCK.exists() and not args.force:
            log(f"\nABORT: {LOCK.relative_to(ROOT)} exists - another pipeline run may be active.")
            log("Delete it if that run is dead, or use --force.")
            return 2
        LOCK.write_text(f"{os.getpid()} {now_utc().isoformat()}\n", encoding="utf-8")

    ctx = {"dest_count": dest_count(), "state": state}
    backed_up = False
    ran, skipped, failed, soft_failed = [], [], [], []
    run_t0 = time.time()
    deferred = []
    held_by_run = []   # rescore holds this run wrote; released however it ends
    heartbeat("/start")
    try:
        for t in plan:
            log("\n" + "-" * 70)
            log(f"TASK {t['key']}  ({t['cadence']})  {t['title']}")

            # A task that raises is a task that failed (T261). Before, an
            # exception from a guard, a run() or the backup escaped this loop:
            # no state write, no ship decision, no freshness report and no
            # heartbeat /fail, on exactly the runs nobody is watching.
            hold = None
            t0 = time.time()
            if (args.max_hours and t["key"] in extra
                    and (t0 - run_t0) / 3600 >= args.max_hours):
                log(f"  DEFERRED: the run is {(t0 - run_t0) / 3600:.1f} h old (--max-hours "
                    f"{args.max_hours:g}); still due, it runs next time")
                deferred.append(t["key"])
                continue
            try:
                guard = t.get("guard")
                if guard:
                    ok, reason = guard(ctx)
                    log(f"  guard: {reason}")
                    if not ok:
                        skipped.append(t["key"])
                        continue

                if t["key"] in RESCORE_LAYERS:
                    busy = rescore_running(RESCORE_LAYERS[t["key"]])
                    if busy:
                        log(f"  refused: a rescore of this layer is running: {busy}")
                        skipped.append(t["key"])
                        continue
                    hold = take_rescore_hold(t["key"])
                    if hold:
                        held_by_run.append(hold)

                if t.get("writes_app_data") and not args.no_backup and not backed_up:
                    backup_master()
                    backed_up = True

                # Hand corrections to places reach the tasks that build from
                # the master in this same run, not the next one (T1214, from
                # T1173-c). The full step after the loop applies them again.
                if t["key"] in OVERRIDES_BEFORE and run_cmd(
                        [sys.executable, str(ROOT / "pipeline" / "apply_overrides.py"), "--layers", "dest"]) != 0:
                    log("  overrides: the dest file is invalid; the task reads the master as it is "
                        "and the overrides step after the loop fails the run")

                t0 = time.time()
                partial = False
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
                            # T1032: a task may name the exit code that means
                            # "saved what it did, ran out of time". The cmds
                            # after it still run (the export ships this week's
                            # part) and the task stays due instead of OK.
                            if t.get("partial_rc") is not None and rc == t["partial_rc"]:
                                partial = True
                                log(f"  cmd stopped incomplete (rc={rc}); the rest of "
                                    "the task runs, and the task stays due")
                                break
                            attempt += 1
                            if attempt > retries:
                                ok = False
                                break
                            log(f"  cmd failed (rc={rc}); retry {attempt}/{retries} "
                                f"in 30s (resumes from cache)")
                            time.sleep(30)
                        if not ok:
                            break
            except Exception as e:
                ok = False
                log(f"  RAISED {type(e).__name__}: {e}")
                for line in traceback.format_exc().rstrip().splitlines():
                    log(f"    {line}")
            finally:
                release_rescore_hold(hold)
            dt = int(time.time() - t0)

            if ok and partial:
                log(f"  INCOMPLETE ({dt}s) - its outputs hold what was done; "
                    "the task stays due and resumes next run.")
                soft_failed.append(t["key"])
            elif ok:
                log(f"  OK ({dt}s)")
                ran.append(t["key"])
                state.setdefault(t["key"], {})["last_success"] = now_utc().isoformat()
                if t.get("rev"):
                    state[t["key"]]["rev"] = t["rev"]
                save_state(state)
                ctx["dest_count"] = dest_count()
                # Whatever this unblocked joins the plan now, so a chain
                # (ingest -> elevation -> validate) completes in one run.
                added = chain_followups(plan, state, args, set(ran))
                for key in added:
                    log(f"  -> queued {key} (follows {t['key']})")
            elif t.get("soft"):
                log(f"  SOFT-FAIL ({dt}s) - estimation/ingestion layer; does not "
                    "block the data ship and retries next run.")
                soft_failed.append(t["key"])
            else:
                log(f"  FAILED ({dt}s) - stopping before ship to avoid shipping half data.")
                failed.append(t["key"])
                break
    except BaseException as e:
        # Stopped from outside: SIGTERM from systemd's stop or its 48 h timeout
        # (SystemExit, _exit_on_sigterm) or Ctrl-C. Nothing ships, but the run
        # is still reported as failed before the process goes.
        log(f"\nINTERRUPTED ({type(e).__name__}) during the task loop; not shipping.")
        try:
            report_pipeline_run(ran, skipped, failed + ["interrupted"], soft_failed,
                                ctx.get("dest_count"))
        finally:
            heartbeat("/fail")
        raise
    finally:
        for h in held_by_run:
            release_rescore_hold(h)
        if LOCK.exists():
            try:
                LOCK.unlink()
            except OSError:
                pass

    # Hand corrections (I13, T1173): data/overrides/{layer}.json, written over
    # whatever the tasks above just rewrote, so a correction survives every
    # rerun. An invalid overrides file fails the run before the ship.
    if ran and not failed and run_cmd(
            [sys.executable, str(ROOT / "pipeline" / "apply_overrides.py"), "--snapshot"]) != 0:
        failed.append("overrides")

    # Ship, only if a writer ran and none failed. A wire writer counts: it puts
    # new files in public/ that only the build copies into dist.
    if ran and not failed and any(TASK_BY_KEY[k].get("writes_app_data")
                                  or TASK_BY_KEY[k].get("writes_wire")
                                  for k in ran):
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

    # Freshness report, regenerated AFTER the ship.
    log("")
    try:
        print_freshness_summary(build_freshness_report(state))
    except Exception as e:
        log(f"(freshness report failed: {type(e).__name__}: {e})")

    # Quality gate (D2, T1142): scorecard against scripts/quality/rules.yaml,
    # history line, 90-day trend and the admin Data health snapshot.
    if run_cmd([sys.executable, "-I", str(ROOT / "scripts" / "quality" / "engine.py"), "--write"]) != 0:
        failed.append("quality")

    # Evals (F6, T1201 from row T1181-j): every offline eval through the one
    # runner, results to data/reports/evals/ (or CARTA_EVAL_OUT) and the
    # dashboard docs/reference/evals.md. A gated eval that fails is a soft
    # failure: it is reported with the run but never holds the ship back,
    # since the evals read what this run already shipped.
    # The Python evals run on this interpreter (the box venv), not on PATH's.
    os.environ.setdefault("CARTA_PYTHON", sys.executable)
    if run_cmd([node_exe(), "scripts/eval/run.mjs", "--check", "--write", "--dashboard"],
               cwd=CONTINENT) != 0:
        soft_failed.append("evals")

    # Report the run to admin_health, whether it succeeded or not: a run that
    # failed is exactly the case the admin panel most needs to show as stale,
    # not a run to hide because it went badly. Only a plan with nothing due
    # (handled earlier, before `ran`/`skipped` exist) reports nothing.
    report_pipeline_run(ran, skipped, failed, soft_failed, ctx.get("dest_count"))

    log("\n" + "=" * 70)
    log(f"done. ran={ran or '-'}  skipped={skipped or '-'}  failed={failed or '-'}"
        f"  soft-failed={soft_failed or '-'}"
        + (f"  deferred={deferred}" if deferred else ""))
    log("=" * 70)
    heartbeat("/fail" if failed else "")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
