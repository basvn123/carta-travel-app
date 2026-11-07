"""What the task modules and the runner share: paths, the interpreter, the log,
run_cmd and the guards more than one domain uses (ROADMAP A2, T1207).

run_pipeline.py opens the log file and sets `_LOG_FH` here; every module
logs through `log` below, so the run still writes one log."""
import json
import os
import shutil
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# The repository root: this file is pipeline/tasks/_base.py.
ROOT = Path(__file__).parent.parent.parent
APP_DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache"
LOGS = ROOT / "logs"
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


if os.name == "nt":
    _NODE_DIRS = [r"C:\Program Files\nodejs", r"C:\Program Files (x86)\nodejs"]
    _NODE_BIN, _NPM_BIN = "node.exe", "npm.cmd"
else:
    # The Linux orchestrator (infra/hetzner/cax11, T048): carta-bootstrap
    # unpacks Node into /opt/node and links it into /usr/local/bin, which is on
    # systemd's default PATH. These are fallbacks for a PATH that lacks both.
    _NODE_DIRS = ["/usr/local/bin", "/opt/node/bin"]
    _NODE_BIN, _NPM_BIN = "node", "npm"


def node_exe():
    return _resolve(["node"], [Path(d) / _NODE_BIN for d in _NODE_DIRS])


def npm_exe():
    return _resolve(["npm", "npm.cmd"], [Path(d) / _NPM_BIN for d in _NODE_DIRS])

_LOG_FH = None


def log(msg=""):
    line = str(msg)
    print(line, flush=True)
    if _LOG_FH:
        _LOG_FH.write(line + "\n")
        _LOG_FH.flush()


def now_utc():
    return datetime.now(timezone.utc)

def run_cmd(argv, cwd=None):
    """Stream a subprocess, tee its output to the log, return the exit code.

    UTF-8 both ways, deliberately: the child's pipe is not a console, so a
    python step that does not reconfigure would default to cp1252 and a step
    that does (every pipeline/ script) would not, and one accented place name
    in a progress line would then kill the driver mid-task with a decode error
    rather than anything to do with the data. errors="replace" keeps a stray
    byte from a non-python child cosmetic.

    PYTHONUTF8=1 (H11, T1162) goes further than the pipe: UTF-8 mode makes a
    child's open() without an encoding read and write UTF-8 too, where Windows
    would pick cp1252 (the "encoding" cluster of What broke entries)."""
    pretty = " ".join(str(a) for a in argv)
    log(f"  $ {pretty}")
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    try:
        proc = subprocess.Popen(
            argv, cwd=str(cwd or ROOT), stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, bufsize=1,
            encoding="utf-8", errors="replace", env=env,
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


def trailslab_endpoint():
    """(host, port) of the local trails lab. Mirrors pipeline/trails/db.py:
    real environment first, then the repo-root .env, then the compose defaults."""
    if not os.environ.get("TRAILSLAB_HOST") or not os.environ.get("TRAILSLAB_PORT"):
        try:
            sys.path.insert(0, str(ROOT / "pipeline"))
            from env_local import load_env
            load_env()
        except Exception:
            pass
    host = os.environ.get("TRAILSLAB_HOST") or "localhost"
    try:
        port = int(os.environ.get("TRAILSLAB_PORT") or 5433)
    except ValueError:
        port = 5433
    return host, port


def trailslab_home():
    """T1182 (D24): where the trails lab lives. "box" when the box secrets
    file sets CARTA_TRAILSLAB_HOME=box (tools/trailslab/box/), else "laptop"."""
    return "box" if os.environ.get("CARTA_TRAILSLAB_HOME", "").strip().lower() == "box" else "laptop"


def guard_trailslab_up(ctx):
    """Trails tasks need the Docker lab on 5433. A lab that is down is a SKIP,
    never a failure: it is a local dev container, not part of the data ship."""
    host, port = trailslab_endpoint()
    try:
        with socket.create_connection((host, port), timeout=4):
            return True, f"trails lab reachable at {host}:{port}"
    except OSError as e:
        start = ("bash tools/trailslab/box/lab.sh up" if trailslab_home() == "box"
                 else "cd tools/trailslab && docker compose up -d")
        return False, (f"trails lab not reachable at {host}:{port} "
                       f"({type(e).__name__}) - start it with `{start}`")


def guard_brouter_up(ctx):
    """The gap bridge routes with BRouter on 127.0.0.1:17777, a local
    container like the lab. Not running is a SKIP: the tours that need a
    bridge simply stay unpublished until the next run finds it up."""
    lab_ok, lab_msg = guard_trailslab_up(ctx)
    if not lab_ok:
        return False, lab_msg
    try:
        with socket.create_connection(("127.0.0.1", 17777), timeout=4):
            return True, "brouter reachable at 127.0.0.1:17777"
    except OSError as e:
        return False, (f"brouter not reachable on 17777 ({type(e).__name__}) "
                       "- start it with `python tools/brouter/prepare.py "
                       "--country GB --up --wait`")


def guard_trails_route_bridge(ctx):
    """T1183 (D24): the routed continuity repair is off unless the owner sets
    CARTA_TRAILS_ROUTE_BRIDGE=1, and then needs the lab and BRouter (with
    the tiles of the countries it runs on). Off or down is a SKIP."""
    if os.environ.get("CARTA_TRAILS_ROUTE_BRIDGE", "").strip() != "1":
        return False, ("off: set CARTA_TRAILS_ROUTE_BRIDGE=1 to run the routed "
                       "continuity repair (T1183)")
    return guard_brouter_up(ctx)


def guard_reachable(label, *hosts):
    """A network source: due tasks SKIP, not fail, when none of `hosts` answers
    on 443 (an IPv6-only box, a DNS hiccup, the source down for the day)."""
    def _g(ctx=None):
        if ctx and ctx.get("dry_run"):
            return True, f"{label}: not probed under --dry-run (no network)"
        errs = []
        for h in hosts:
            try:
                with socket.create_connection((h, 443), timeout=6):
                    return True, f"{label} reachable ({h})"
            except OSError as e:
                errs.append(f"{h}: {type(e).__name__}")
        return False, f"{label} not reachable ({'; '.join(errs)}); the task waits for the next run"
    return _g


def guard_files(*specs):
    """specs: (glob relative to the repo, minimum matches, what to do)."""
    def _g(ctx=None):
        for pattern, need, fix in specs:
            n = len(list(ROOT.glob(pattern)))
            if n < need:
                return False, f"{pattern}: {n} found, {need} needed; {fix}"
        return True, "inputs present: " + ", ".join(p for p, _, _ in specs)
    return _g


def guard_all(*guards):
    """Every guard must pass; the first refusal is the reason."""
    def _g(ctx=None):
        reasons = []
        for g in guards:
            ok, why = g(ctx)
            if not ok:
                return False, why
            reasons.append(why)
        return True, "; ".join(reasons)
    return _g


OVERPASS = ("overpass-api.de", "overpass.kumi.systems")


def guard_trailslab_extracts(ctx=None):
    """way_tags.py re-reads the Geofabrik extracts the ingest downloaded."""
    ok, why = guard_trailslab_up(ctx)
    if not ok:
        return False, why + " (T640: this task runs through the trails lab worker, D5 / T647)"
    n = len(list((ROOT / "data" / "raw" / "geofabrik").glob("*/*.osm.pbf")))
    if n < 20:
        return False, (f"only {n} Geofabrik extracts under data/raw/geofabrik; "
                       "way_tags.py --refresh reads them")
    return True, f"{why}; {n} extracts"

PUBLISH = "pipeline/field_stubs/publish.py"
MASTER_KEEP = ["--keep", "continent-app/public/app_data.json"]
