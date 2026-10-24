#!/usr/bin/env python3
"""The orchestrator side of the trailslab worker job (T647, owner decision D5).

The trails lab (PostGIS + pgRouting, tools/trailslab) lives on neither box,
so the weekly Monday run on the orchestrator cannot run the trails steps
itself: every trails_* task in run_pipeline.py skips there on
guard_trailslab_up. This script is what run_pipeline.py's `trailslab_worker`
task runs instead. It spawns an on-demand x86 worker
(infra/hetzner/jobs/trailslab.sh) that restores the newest trailslab dump from
R2, refreshes the way tags and transit stops country by country, re-exports
the trails and cycling wires behind their gates, and writes a fresh dump back;
then it installs the wires that passed into continent-app/public, so the same
Monday ship publishes them, and moves the fresh dump into the trailslab-dump
class (archive/db/trailslab/), which resets R2's 30-day expiry.

Cadence. The task is weekly in run_pipeline.py, but a worker is spawned only
when the last good run is CARTA_TRAILSLAB_EVERY_DAYS (default 28) old. Not
"monthly": that tier means 30 days, which on a Monday schedule is every fifth
Monday, 35 days, and archive/db/ objects expire after 30, so the lab would
spend five days with no dump at all. On the Mondays in between the task only
checks the newest dump's age, and when it is older than
CARTA_TRAILSLAB_KEEPALIVE_DAYS (default 21; a failed run is the case) it
copies it server side to a new dated key, which restarts the clock without a
worker.

Subcommands:
    check                 exit 0 when a run can go ahead, 3 (with the reason on
                          stdout) when it must skip: not enabled, no
                          HCLOUD_TOKEN, no R2, no worker key, no bash
    run [--dry-run] [--force] [--countries CC,CC] [--no-install]
                          the task: keepalive or spawn, pull, gate, install
    tree --repo DIR PATH...
                          print a git tree id holding the top-level *.json of
                          each PATH as they are on disk (the "previous wire"
                          the gates compare against; no index, no ref touched)
    pick-dumps --crypt worker-key|plain
                          read `rclone lsjson -R` of archive/db/ on stdin,
                          print the trailslab dump keys newest first

Environment (the orchestrator's secrets file, infra/hetzner/cax11/env.example):
    CARTA_TRAILSLAB_WORKER=1      the switch; anything else skips the task
    CARTA_TRAILSLAB_DUMP_CRYPT    worker-key (default) or plain
    CARTA_WORKER_GPG_KEY_FILE     the worker's secret key (spawn.sh reads it)
    CARTA_BACKUP_KEY              the owner's backup key, public half in the keyring
    HCLOUD_TOKEN, RCLONE_CONFIG_R2_*  as for every spawn.sh run
    CARTA_TRAILSLAB_EVERY_DAYS, CARTA_TRAILSLAB_KEEPALIVE_DAYS  see above

Standard library only. ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
LOGS = REPO / "logs"
STATE = LOGS / "trailslab_worker.json"
WORK = LOGS / "trailslab_worker"
BUCKET = os.environ.get("CARTA_R2_BUCKET", "carta")
SUPPORT = "archive/inputs/trailslab/support"
BUILT = "archive/built/trailslab"
DUMP_PREFIX = "archive/db/trailslab"
LAYERS = {
    # layer -> (wire dir, subdirectories the export rewrites whole)
    "trails": ("continent-app/public/trails", ("trip",)),
    "cycling": ("continent-app/public/cycling", ("route", "tour", "family")),
}
NUTS = "cache/nuts3_2021.geojson"
SKIP = 3


def say(msg):
    print(f"trailslab_worker: {msg}", flush=True)


def now():
    return dt.datetime.now(dt.timezone.utc)


def env_int(name, default):
    try:
        return int(os.environ.get(name) or default)
    except ValueError:
        return default


def crypt_mode():
    m = (os.environ.get("CARTA_TRAILSLAB_DUMP_CRYPT") or "worker-key").strip()
    return m if m in ("worker-key", "plain") else "worker-key"


def run(argv, dry, capture=False, check=False, **kw):
    print("+ " + " ".join(str(a) for a in argv), flush=True)
    if dry:
        return subprocess.CompletedProcess(argv, 0, "", "")
    r = subprocess.run([str(a) for a in argv], text=True,
                       capture_output=capture, **kw)
    if check and r.returncode != 0:
        raise SystemExit(f"command failed ({r.returncode}): {' '.join(map(str, argv))}"
                         + (f"\n{r.stderr}" if capture else ""))
    return r


def r2(key):
    return f"r2:{BUCKET}/{key}"


# --------------------------------------------------------------------------- #
# tree: the previous wire as a git tree, without touching an index or a ref
# --------------------------------------------------------------------------- #
def git(repo, *args, inp=None):
    # Bytes, not text: text mode on Windows would turn the \n of mktree's
    # input into \r\n, and the \r would end up inside the entry names.
    r = subprocess.run(["git", "-C", str(repo), *args],
                       input=inp.encode("utf-8") if inp is not None else None,
                       capture_output=True)
    if r.returncode != 0:
        raise SystemExit(f"git {' '.join(args)}: {r.stderr.decode('utf-8', 'replace').strip()}")
    return r.stdout.decode("utf-8")


def build_tree(repo, rel_dirs):
    """Tree id of {rel_dir/*.json} for each rel_dir, read from the working tree.

    hash-object -w writes the blobs, mktree the trees bottom up; nothing else
    in the repository changes, and git gc collects the objects later."""
    files = {}
    for rel in rel_dirs:
        d = Path(repo) / rel
        for p in sorted(d.glob("*.json")) if d.is_dir() else []:
            files[f"{rel.strip('/')}/{p.name}"] = p
    if not files:
        raise SystemExit(f"no *.json under {', '.join(rel_dirs)} in {repo}")
    paths = list(files)
    shas = git(repo, "hash-object", "-w", "--stdin-paths",
               inp="\n".join(str(files[k]) for k in paths) + "\n").split()
    root = {}
    for path, sha in zip(paths, shas):
        node = root
        parts = path.split("/")
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = sha

    def mk(node):
        lines = []
        for name in sorted(node):
            v = node[name]
            if isinstance(v, dict):
                lines.append(f"040000 tree {mk(v)}\t{name}")
            else:
                lines.append(f"100644 blob {v}\t{name}")
        return git(repo, "mktree", inp="\n".join(lines) + "\n").strip()

    return mk(root)


def cmd_tree(a):
    print(build_tree(a.repo, a.paths))
    return 0


# --------------------------------------------------------------------------- #
# pick-dumps
# --------------------------------------------------------------------------- #
def dump_entries(lsjson_text, crypt):
    """[(modtime, key under archive/db/)] newest first, for one crypt mode."""
    try:
        rows = json.loads(lsjson_text or "[]")
    except ValueError:
        return []
    out = []
    for r in rows:
        name = r.get("Name") or ""
        if r.get("IsDir") or not name.startswith("trailslab-"):
            continue
        if crypt == "plain" and not name.endswith(".dump"):
            continue
        if crypt != "plain" and not name.endswith(".dump.gpg"):
            continue
        out.append((r.get("ModTime") or "", r.get("Path") or name, r.get("Size") or 0))
    out.sort(reverse=True)
    return out


def cmd_pick(a):
    for mt, path, size in dump_entries(sys.stdin.read(), a.crypt):
        print(f"{path}\t{mt}\t{size}")
    return 0


# --------------------------------------------------------------------------- #
# check
# --------------------------------------------------------------------------- #
def why_not():
    """None when the task can run, else the reason it skips."""
    if os.environ.get("CARTA_TRAILSLAB_WORKER") != "1":
        return ("CARTA_TRAILSLAB_WORKER is not 1: the trailslab worker is off "
                "(owner steps: Execution/P15/_OPEN-explore-data-runs.md, T647)")
    if os.name == "nt":
        return "this is a Windows machine; the worker is spawned from the orchestrator"
    if not os.environ.get("HCLOUD_TOKEN"):
        return "HCLOUD_TOKEN is not set (T047-a); no worker can be created"
    missing = [v for v in ("RCLONE_CONFIG_R2_ENDPOINT", "RCLONE_CONFIG_R2_ACCESS_KEY_ID",
                           "RCLONE_CONFIG_R2_SECRET_ACCESS_KEY") if not os.environ.get(v)]
    if missing:
        return f"R2 is not configured ({', '.join(missing)} unset)"
    for tool in ("bash", "hcloud", "rclone"):
        if not shutil.which(tool):
            return f"{tool} is not on PATH"
    if crypt_mode() == "worker-key":
        key = os.environ.get("CARTA_WORKER_GPG_KEY_FILE") or \
            str(Path.home() / ".config" / "carta" / "trailslab-worker.sec.asc")
        if not os.access(key, os.R_OK):
            return (f"the worker key {key} is not readable (CARTA_WORKER_GPG_KEY_FILE); "
                    f"or set CARTA_TRAILSLAB_DUMP_CRYPT=plain after that owner decision")
        if not os.environ.get("CARTA_BACKUP_KEY") or not shutil.which("gpg"):
            return "CARTA_BACKUP_KEY is not set or gpg is missing; the dump could not be encrypted to the owner"
    nuts = REPO / NUTS
    if not nuts.exists() or nuts.read_bytes()[:40].startswith(b"version https://git-lfs"):
        return f"{NUTS} is missing or an LFS pointer (git lfs pull); the trails export files rows by it"
    return None


def cmd_check(_a):
    reason = why_not()
    if reason:
        print(f"SKIP: {reason}")
        return SKIP
    print("ready: " + plan_line(load_state()))
    return 0


# --------------------------------------------------------------------------- #
# state
# --------------------------------------------------------------------------- #
def load_state():
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_state(state, dry):
    if dry:
        say(f"state (dry run, not written): {json.dumps(state)}")
        return
    LOGS.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def age_days(iso):
    try:
        t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=dt.timezone.utc)
    return (now() - t).total_seconds() / 86400


def plan_line(state):
    every = env_int("CARTA_TRAILSLAB_EVERY_DAYS", 28)
    last = state.get("last_ok_at")
    a = age_days(last) if last else None
    if a is None or a >= every:
        return f"a worker run is due (last good run {last or 'never'}, every {every} days)"
    return f"no worker run before day {every} (last good run {last}, {a:.1f} days ago); keepalive check only"


# --------------------------------------------------------------------------- #
# run
# --------------------------------------------------------------------------- #
def newest_dump(dry):
    if dry:
        run(["rclone", "lsjson", "-R", "--files-only", r2("archive/db")], dry)
        return None
    r = subprocess.run(["rclone", "lsjson", "-R", "--files-only", r2("archive/db")],
                       capture_output=True, text=True)
    if r.returncode != 0:
        say(f"could not list {r2('archive/db')}: {r.stderr.strip()[:300]}")
        return None
    e = dump_entries(r.stdout, crypt_mode())
    return e[0] if e else None


def keepalive(dry):
    days = env_int("CARTA_TRAILSLAB_KEEPALIVE_DAYS", 21)
    d = newest_dump(dry)
    if dry:
        say(f"(dry run) when the newest dump is older than {days} days: rclone copyto "
            f"{r2('archive/db/<newest>')} {r2(DUMP_PREFIX + '/trailslab-<today>-keep.dump.gpg')}")
        return 0
    if d is None:
        say("WARNING: no trailslab dump in archive/db at all; a worker run cannot restore anything. "
            "The owner must upload one (README.md, \"The trailslab job\")")
        return 1
    mt, path, _ = d
    a = age_days(mt)
    if a is not None and a < days:
        say(f"newest dump archive/db/{path} is {a:.1f} days old; nothing to do")
        return 0
    suffix = ".dump" if crypt_mode() == "plain" else ".dump.gpg"
    dest = f"{DUMP_PREFIX}/trailslab-{now():%Y-%m-%d}-keep{suffix}"
    say(f"newest dump archive/db/{path} is {a:.1f} days old (expiry at 30): server-side copy to {dest}")
    r = run(["rclone", "copyto", r2(f"archive/db/{path}"), r2(dest)], dry)
    return 0 if r.returncode == 0 else 1


def upload_support(dry):
    """What the worker cannot get from its LFS-free clone, and the previous
    wire it must merge into and gate against (this box's, the live one)."""
    tgz = WORK / "wires-prev.tar.gz"
    if not dry:
        WORK.mkdir(parents=True, exist_ok=True)
        with tarfile.open(tgz, "w:gz") as tar:
            for rel, _subs in LAYERS.values():
                for p in sorted((REPO / rel).glob("*.json")):
                    tar.add(p, arcname=f"{rel}/{p.name}")
    else:
        say(f"(dry run) would tar the top-level *.json of {', '.join(r for r, _ in LAYERS.values())} to {tgz}")
    ok = run(["rclone", "copyto", REPO / NUTS, r2(f"{SUPPORT}/nuts3_2021.geojson")], dry).returncode == 0
    ok = ok and run(["rclone", "copyto", tgz, r2(f"{SUPPORT}/wires-prev.tar.gz")], dry).returncode == 0
    return ok


def read_manifest(path):
    out = {}
    try:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    except OSError:
        pass
    return out


def safe_extract(tgz, dest):
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tgz, "r:gz") as tar:
        tar.extractall(dest, filter="data")


def gate_layer(layer, staging, dry):
    """gate.py (and for trails the difficulty gate) on the staged files,
    against this box's working tree as it is now."""
    rel, _subs = LAYERS[layer]
    if dry:
        run([sys.executable, "pipeline/field_stubs/gate.py", "--layer", layer,
             "--base", staging, "--ref", "<tree of the live wire>"], dry)
        return True
    tree = build_tree(REPO, [rel])
    cmds = [[sys.executable, "pipeline/field_stubs/gate.py", "--layer", layer,
             "--base", str(staging), "--ref", tree, "--verbose"]]
    if layer == "trails":
        cmds.append([sys.executable, "pipeline/trails/difficulty_gate.py",
                     "--base", str(staging), "--ref", tree])
    for c in cmds:
        if run(c, dry, cwd=str(REPO)).returncode != 0:
            return False
    return True


def install_layer(layer, staging, backup_dir, dry):
    """Top-level files are overwritten (a file the export did not write, such
    as trails/top.json, stays). The subdirectories the export rewrites whole
    are mirrored, so a demoted trip's detail file goes, as prune_details
    would have done on the laptop. The old directory is tarred first."""
    rel, subs = LAYERS[layer]
    live, new = REPO / rel, Path(staging) / rel
    if dry:
        say(f"(dry run) would back up {rel} to {backup_dir}/prev-{layer}.tar.gz and install {new}")
        return True
    backup_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(backup_dir / f"prev-{layer}.tar.gz", "w:gz") as tar:
        tar.add(live, arcname=rel)
    n_top = n_sub = n_del = 0
    for p in new.glob("*.json"):
        shutil.copy2(p, live / p.name)
        n_top += 1
    for sub in subs:
        src, dst = new / sub, live / sub
        if not src.is_dir():
            continue
        dst.mkdir(parents=True, exist_ok=True)
        keep = {p.name for p in src.glob("*.json")}
        for p in dst.glob("*.json"):
            if p.name not in keep:
                p.unlink()
                n_del += 1
        for p in src.glob("*.json"):
            shutil.copy2(p, dst / p.name)
            n_sub += 1
    say(f"installed {layer}: {n_top} top-level file(s), {n_sub} detail file(s), "
        f"{n_del} stale detail file(s) removed; rollback: tar -xzf {backup_dir}/prev-{layer}.tar.gz -C {REPO} "
        f"after removing {rel}")
    return True


def move_dump(src_key, dest_key, dry):
    say(f"dump to the trailslab-dump class: {src_key} -> {dest_key}")
    return run(["rclone", "moveto", r2(src_key), r2(dest_key)], dry).returncode == 0


def cmd_run(a):
    dry = a.dry_run
    reason = why_not()
    if reason and not dry:
        print(f"SKIP: {reason}")
        return 0
    if reason:
        say(f"(dry run) a real run would skip: {reason}")
    state = load_state()

    # A dump move the last run could not finish comes first: it is the copy
    # that keeps the lab from expiring.
    pend = state.get("pending_dump")
    if pend:
        if move_dump(pend["from"], pend["to"], dry):
            state.pop("pending_dump", None)
            state["last_dump"] = pend["to"]
            # The run that made it was good otherwise: count it as the last one.
            state["last_ok_at"] = pend.get("run_at") or now().isoformat(timespec="seconds")
            save_state(state, dry)
        else:
            say("WARNING: the pending dump move failed again")

    say(plan_line(state))
    every = env_int("CARTA_TRAILSLAB_EVERY_DAYS", 28)
    last = state.get("last_ok_at")
    due = a.force or last is None or (age_days(last) or every) >= every
    if not due:
        return keepalive(dry)

    if not upload_support(dry):
        say("could not upload the support files to R2; not spawning")
        return 1
    if not dry:
        WORK.mkdir(parents=True, exist_ok=True)
    run_id_file = WORK / "last_run_id"
    # CARTA_BASH: on a Windows laptop "bash" can resolve to WSL's; a dry run
    # there points it at Git Bash. The box has one bash.
    spawn = [os.environ.get("CARTA_BASH") or "bash", str(REPO / "infra/hetzner/cax41/spawn.sh")]
    if dry:
        spawn.append("--dry-run")
    spawn += ["trailslab", crypt_mode()]
    if a.countries:
        spawn.append(a.countries)
    env = dict(os.environ)
    if not dry:
        env["CARTA_RUN_ID_FILE"] = str(run_id_file)
    say("spawning; spawn.sh prints the planned cost and every hcloud call")
    print("+ " + " ".join(spawn), flush=True)
    rc = subprocess.run(spawn, env=env).returncode
    if rc != 0:
        say(f"spawn.sh exited {rc}: nothing installed, the dump was not refreshed "
            f"(logs/cax41/<run id>/ has the worker's logs)")
        return 1
    run_id = run_id_file.read_text().strip() if (run_id_file.exists() and not dry) else ""
    if dry:
        run_id = run_id or "<run id>"
        say("(dry run) after an ok status:")
    elif not run_id:
        say("spawn.sh succeeded but left no run id; not installing")
        return 1

    local = WORK / run_id
    out_key = f"archive/runs/{run_id}/out"
    if run(["rclone", "copy", r2(out_key), local / "out", "--exclude", "db/**"], dry).returncode != 0:
        say(f"could not fetch {out_key}")
        return 1
    man = read_manifest(local / "out" / "MANIFEST.txt")
    if dry:
        man = {"trails": "passed", "cycling": "passed", "dump": "db/trailslab-<date>.dump.gpg"}
    if man.get("run") and man["run"] != run_id and not dry:
        say(f"MANIFEST names run {man['run']}, not {run_id}; not installing")
        return 1

    installed, problems = [], []
    for layer in LAYERS:
        status = man.get(layer, "missing")
        tgz = local / "out" / "wires" / f"{layer}.tar.gz"
        if status != "passed":
            problems.append(f"{layer}: worker says {status}")
            continue
        staging = local / "staging"
        if not dry:
            if not tgz.exists():
                problems.append(f"{layer}: passed but no {tgz.name}")
                continue
            safe_extract(tgz, staging)
        else:
            say(f"(dry run) would extract {tgz} into {staging}")
        if not gate_layer(layer, staging, dry):
            problems.append(f"{layer}: gate failed against this box's wire; previous wire kept")
            continue
        if a.no_install:
            say(f"{layer}: passed both gates; --no-install, so the live wire is unchanged")
            continue
        install_layer(layer, staging, local, dry)
        installed.append(layer)

    dump = man.get("dump", "")
    ok_dump = True
    if dump:
        name = Path(dump).name
        src, dst = f"{BUILT}/{dump}", f"{DUMP_PREFIX}/{name}"
        if move_dump(src, dst, dry):
            state["last_dump"] = dst
        else:
            ok_dump = False
            state["pending_dump"] = {"from": src, "to": dst,
                                     "run_at": now().isoformat(timespec="seconds")}
            problems.append(f"dump move {src} -> {dst} failed; retried next run")
    else:
        ok_dump = False
        problems.append("the worker reported no dump")

    # The extracted copy is not needed once installed; the prev-*.tar.gz
    # backups and the reports stay, for the last three runs.
    if not dry:
        shutil.rmtree(local / "staging", ignore_errors=True)
        runs = sorted((p for p in WORK.iterdir() if p.is_dir()), key=lambda p: p.name)
        for old in runs[:-3]:
            shutil.rmtree(old, ignore_errors=True)
    state["last_run"] = run_id
    state["last_installed"] = installed
    state["last_problems"] = problems
    if ok_dump:
        state["last_ok_at"] = now().isoformat(timespec="seconds")
    save_state(state, dry)
    say(f"run {run_id}: installed {', '.join(installed) or 'nothing'}"
        + (f"; problems: {'; '.join(problems)}" if problems else ""))
    if installed and not dry:
        say("the wires are in continent-app/public; this run's ship publishes them")
    return 0 if (ok_dump and not problems) else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.set_defaults(fn=cmd_check)
    r = sub.add_parser("run")
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--force", action="store_true", help="spawn even when not due")
    r.add_argument("--countries", help="CC,CC: refresh only these (default every country with trips)")
    r.add_argument("--no-install", action="store_true",
                   help="gate the wires here but install nothing (a first test); the dump still moves")
    r.set_defaults(fn=cmd_run)
    t = sub.add_parser("tree")
    t.add_argument("--repo", default=str(REPO))
    t.add_argument("paths", nargs="+")
    t.set_defaults(fn=cmd_tree)
    p = sub.add_parser("pick-dumps")
    p.add_argument("--crypt", choices=("worker-key", "plain"), default="worker-key")
    p.set_defaults(fn=cmd_pick)
    a = ap.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
