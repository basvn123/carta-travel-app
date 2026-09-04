"""Drive the v2 rebuild: wait for each country's OSM sweep, fold it, enrich it.

The v2 chain has one slow offline stage (osm_water.py filtering 30 GB of
Geofabrik extracts) and one slow network stage (Commons photographs, about
fifteen paced requests a lake). Running them strictly in series wastes the
network while the CPU works and the CPU while the network waits, and running
them by hand means somebody has to sit and watch which countries have landed.

So this driver polls cache/lakes/osm_CC.json, and the moment a country's sweep
appears it folds the sweep into the harvest and enriches the country. Both
steps are per country idempotent, so a driver that is killed and restarted
picks up exactly where it stopped.

Order is deliberate and it is REVERSE alphabetical by default. The photo
engine's rescore pass (pipeline/photos/rescore.py) walks the same rich caches
forwards, so the two processes start at opposite ends of the alphabet and
spend most of the run far apart. Where they do meet, the loser is one
country's beauty scores, which the next rescore run recomputes.

Usage, from the repo root:
    python pipeline/lakes/rebuild_v2.py                    # everything
    python pipeline/lakes/rebuild_v2.py --countries GB,IE
    python pipeline/lakes/rebuild_v2.py --no-wait          # only what is ready
    python pipeline/lakes/rebuild_v2.py --skip AT,DE       # leave these alone
    python pipeline/lakes/rebuild_v2.py --no-images        # structure only
    python pipeline/lakes/rebuild_v2.py --settled          # who is finished
    python pipeline/lakes/rebuild_v2.py --release          # tell the photo pass
    python pipeline/lakes/rebuild_v2.py --watch-release    # keep telling it

ASCII clean, no em dashes, per project convention.
"""

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

# Windows consoles and redirected pipes default to cp1252, which cannot encode
# a Latvian, Icelandic or Polish lake name. A print of one then raises
# UnicodeEncodeError and takes the stage down; the lake export died on
# "Lielais Baltezers" halfway through a logged run. The data was never the
# problem, the terminal was, so say so once here.
if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

CACHE = ROOT / "cache" / "lakes"
PY = sys.executable

sys.path.insert(0, str(HERE))
from harvest_lakes import COUNTRIES  # noqa: E402

POLL_S = 120


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def swept(cc):
    return (CACHE / f"osm_{cc}.json").exists()


def folded(cc):
    import json
    path = CACHE / f"raw_{cc}.json"
    if not path.exists():
        return False
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("n_osm") is not None
    except (OSError, ValueError):
        return False


def settled(cc):
    """True when this country's rich cache is finished with, for now.

    Three conditions, and the third is the one that is easy to get wrong:

      the sweep folded          raw_CC.json carries n_osm, so the pool it was
                                enriched from includes the OSM spine
      the enrich ran after it   rich_CC.json is NEWER than raw_CC.json. This
                                is what catches a country whose harvest moved
                                under a running enrich: Great Britain's
                                enrich started four minutes before
                                --fix-seeds landed thirty new seed entries,
                                so its rich cache predates its own pool and
                                has to be re-run.
      nothing is working on it  no enrich process holds it right now.

    Written as a flag rather than left in one session's head because the
    photo engine's rescore pass wants to work country by country as each
    one lands, and it must be able to ask that question itself:

        python pipeline/lakes/rebuild_v2.py --settled
    """
    raw = CACHE / f"raw_{cc}.json"
    rich = CACHE / f"rich_{cc}.json"
    if not folded(cc) or not rich.exists():
        return False
    if rich.stat().st_mtime <= raw.stat().st_mtime:
        return False
    return cc not in _enriching()


def _enriching():
    """The countries an enrich_lakes process is holding open right now.

    A rich cache is written atomically at the END of the stage, so a country
    being enriched still shows its PREVIOUS answer on disk and would
    otherwise read as settled."""
    out = set()
    try:
        proc = subprocess.run(
            ["wmic", "process", "where", "name='python.exe'", "get",
             "commandline"], capture_output=True, text=True, timeout=30,
            encoding="utf-8", errors="replace")
        text = proc.stdout or ""
    except (OSError, subprocess.SubprocessError):
        return out
    for line in text.splitlines():
        if "enrich_lakes.py" not in line or "--countries" not in line:
            continue
        parts = line.split("--countries", 1)[1].split()
        if parts:
            out.update(c.strip().upper() for c in parts[0].split(",")
                       if c.strip())
    return out


HOLD = CACHE / ".rescore_hold"
RELEASED_RE = re.compile(r"^released:.*$", re.M)


def release_settled():
    """Name the settled countries on the photo engine's hold file.

    cache/lakes/.rescore_hold belongs to the photo engine (brief 02). It
    holds its beauty pass back while this rebuild is running, because CLIP
    wants 2.5 GB and because rescoring a layer mid-rebuild scores rows that
    are about to be replaced. It reads one optional line:

        released: FO,SM,XK

    and then rescores exactly those countries and refuses the rest. No line
    means the whole layer is still held.

    So the two stages need no messages between them: this driver appends a
    country the moment it settles, and the photo pass takes it whenever it
    next runs. Re-running is cheap on its side (it stamps rank_v per image
    and skips what is stamped), so handing countries over in small batches
    costs nothing, and the stamps survive a re-enrich here because enrich
    carries `images` across from the previous rich cache.

    Read, modify, write, so the file's own prose survives and a line the
    photo engine adds is never clobbered. The file is never CREATED here: if
    the hold is gone the pass is no longer waiting on us and writing one
    would re-hold it."""
    if not HOLD.exists():
        return []
    ready = [cc for cc in COUNTRIES if settled(cc)]
    try:
        text = HOLD.read_text(encoding="utf-8")
    except OSError:
        return []
    had = set()
    match = RELEASED_RE.search(text)
    if match:
        had = {c.strip().upper()
               for c in match.group(0).split(":", 1)[1].split(",") if c.strip()}
    merged = sorted(had | set(ready))
    if merged == sorted(had):
        return merged
    line = "released: " + ",".join(merged)
    text = (RELEASED_RE.sub(line, text, count=1) if match
            else text.rstrip("\n") + "\n" + line + "\n")
    tmp = HOLD.with_suffix(".hold.tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(HOLD)
    except OSError as exc:
        log(f"  could not update the rescore hold ({exc})")
        return merged
    log(f"  released to the photo pass: {','.join(sorted(set(merged) - had))}")
    return merged


def run(cmd):
    log("  " + " ".join(cmd[1:]))
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    tail = [ln for ln in (proc.stdout or "").splitlines() if ln.strip()][-4:]
    for line in tail:
        log("    " + line)
    if proc.returncode != 0:
        err = [ln for ln in (proc.stderr or "").splitlines() if ln.strip()][-3:]
        for line in err:
            log("    ERR " + line)
    return proc.returncode == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="")
    ap.add_argument("--skip", default="")
    ap.add_argument("--no-wait", action="store_true",
                    help="do the countries already swept and stop")
    ap.add_argument("--no-images", action="store_true")
    ap.add_argument("--no-context", action="store_true", default=True)
    ap.add_argument("--forward", action="store_true",
                    help="alphabetical, for a run with no rescore alongside")
    ap.add_argument("--max-wait-min", type=int, default=600)
    ap.add_argument("--watch-release", action="store_true",
                    help="loop, releasing each country as it settles, until "
                         "the photo engine removes its hold file")
    ap.add_argument("--watch-every", type=int, default=180,
                    help="seconds between release checks (default 180)")
    ap.add_argument("--release", action="store_true",
                    help="name the settled countries on the photo engine's "
                         "hold file and stop")
    ap.add_argument("--settled", action="store_true",
                    help="print the countries whose rich cache is finished "
                         "with and stop. What a per country photo pass reads "
                         "so it does not have to wait for the whole layer.")
    args = ap.parse_args()

    if args.release:
        print("released: " + (",".join(release_settled()) or "none"))
        return

    if args.watch_release:
        # A driver that was already running when release_settled() was added
        # cannot call it, and restarting one costs the photographs its
        # current country has fetched but not yet written. So the release can
        # also run as its own small loop beside them. It exits on its own when
        # the photo engine deletes the hold, which is that session's signal
        # that it no longer needs releasing.
        log("watching for settled countries to release")
        while HOLD.exists():
            release_settled()
            time.sleep(args.watch_every)
        log("the rescore hold is gone, nothing left to release")
        return

    if args.settled:
        ready, waiting, busy = [], [], sorted(_enriching())
        for cc in COUNTRIES:
            (ready if settled(cc) else waiting).append(cc)
        print("settled: " + (",".join(ready) or "none"))
        print("enriching now: " + (",".join(busy) or "none"))
        print("outstanding: " + (",".join(c for c in waiting if c not in busy)
                                 or "none"))
        return

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    skip = {c.strip().upper() for c in args.skip.split(",") if c.strip()}
    todo = [c for c in (wanted or COUNTRIES) if c not in skip]
    if not args.forward:
        todo = list(reversed(todo))

    log(f"rebuild_v2: {len(todo)} countries, "
        f"{'alphabetical' if args.forward else 'reverse alphabetical'}")
    deadline = time.time() + args.max_wait_min * 60
    left = list(todo)
    done, failed = [], []
    while left:
        ready = [cc for cc in left if swept(cc)]
        if not ready:
            if args.no_wait or time.time() > deadline:
                break
            log(f"waiting for a sweep, {len(left)} countries outstanding")
            time.sleep(POLL_S)
            continue
        cc = ready[0]
        left.remove(cc)
        log(f"{cc}: sweep is in, folding and enriching")
        if not folded(cc):
            run([PY, "pipeline/lakes/harvest_lakes.py", "--countries", cc,
                 "--fold-osm"])
        cmd = [PY, "pipeline/lakes/enrich_lakes.py", "--countries", cc]
        if args.no_images:
            cmd.append("--no-images")
        if args.no_context:
            cmd.append("--no-context")
        (done if run(cmd) else failed).append(cc)
        release_settled()
        log(f"{cc}: done ({len(done)} enriched, {len(failed)} failed, "
            f"{len(left)} left)")

    release_settled()
    log(f"rebuild_v2 finished: {len(done)} enriched, {len(failed)} failed, "
        f"{len(left)} never swept")
    if failed:
        log("failed: " + ", ".join(failed))
    if left:
        log("not swept: " + ", ".join(left))


if __name__ == "__main__":
    main()
