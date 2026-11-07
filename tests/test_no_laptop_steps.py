"""T1161 (ROADMAP H10): the laptop-only steps have a box or worker path.

  * the trailslab dump round trip (infra/hetzner/cax41/trailslab_dump.sh):
    push from a lab, encrypted to two keys, into an R2 stand-in, then restore
    into an empty lab with the OTHER key, on a throwaway PostgreSQL cluster
    (skipped where initdb, pg_ctl or gpg are missing)
  * the promotion row rule of the trailslab worker (trailslab_worker.py
    rows-check): no live row may go, new rows must be approved ids
  * guided_search and ask_index are box tasks with guards, and the box's ML
    install keeps model2vec and sentence-transformers apart
  * the box stays scrape (stays_scrape.sh) only works in its months and
    refuses Booking without an egress
"""
from __future__ import annotations

import ast
import glob
import json
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "infra" / "hetzner" / "cax41" / "trailslab_worker.py"
DUMP_SH = ROOT / "infra" / "hetzner" / "cax41" / "trailslab_dump.sh"
STAYS_SH = ROOT / "infra" / "hetzner" / "cax11" / "stays_scrape.sh"
BASH = shutil.which("bash")


def _load_task_source():
    import importlib.util
    spec = importlib.util.spec_from_file_location("carta_task_source_t1161",
                                                  ROOT / "pipeline" / "tasks" / "source.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


TASK_SOURCE = _load_task_source()


def _load_worker():
    import importlib.util
    spec = importlib.util.spec_from_file_location("trailslab_worker_t1161", WORKER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# --------------------------------------------------------------------------- #
# promotion row rule
# --------------------------------------------------------------------------- #
def test_rows_rule_allows_only_approved_additions():
    w = _load_worker()
    prev = {"1", "2", "3"}
    f, _ = w.judge_rows(prev, prev | {"7"}, approved={"7", "8"})
    assert not f
    f, _ = w.judge_rows(prev, prev | {"9"}, approved={"7"})
    assert any("not approved" in x for x in f)
    f, _ = w.judge_rows(prev, {"1", "2"}, approved=set())
    assert any("gone" in x for x in f)


def _git(repo, *a, inp=None):
    return subprocess.run(["git", "-C", str(repo), *a], input=inp, capture_output=True,
                          text=True, check=True).stdout.strip()


@pytest.mark.skipif(not shutil.which("git"), reason="git missing")
def test_rows_check_cli_against_a_tree(tmp_path):
    """rows-check reads the previous wire from a git tree of this repo's
    object store (hash-object, mktree; no ref is touched)."""
    def country(ids):
        return json.dumps({"trips": [{"id": i, "difficulty": "easy", "f": {}} for i in ids]})
    blob = _git(ROOT, "hash-object", "-w", "--stdin", inp=country([1, 2]))
    t_country = _git(ROOT, "mktree", inp=f"100644 blob {blob}\tCH.json\n")
    t_trails = _git(ROOT, "mktree", inp=f"040000 tree {t_country}\ttrails\n")
    t_public = _git(ROOT, "mktree", inp=f"040000 tree {t_trails}\tpublic\n")
    tree = _git(ROOT, "mktree", inp=f"040000 tree {t_public}\tcontinent-app\n")
    new = tmp_path / "continent-app" / "public" / "trails"
    new.mkdir(parents=True)
    (new / "CH.json").write_text(country([1, 2, 5]), encoding="utf-8")
    approved = tmp_path / "approved_before.txt"
    approved.write_text("5\n6\n", encoding="utf-8")
    cmd = [sys.executable, str(WORKER), "rows-check", "--ref", tree, "--base", str(tmp_path),
           "--promoted", str(approved)]
    assert subprocess.run(cmd, capture_output=True).returncode == 0
    approved.write_text("6\n", encoding="utf-8")
    r = subprocess.run(cmd, capture_output=True, text=True)
    assert r.returncode == 1 and "not approved" in r.stdout


def test_worker_job_passes_promote_only_when_switched_on():
    job = (ROOT / "infra" / "hetzner" / "jobs" / "trailslab.sh").read_text(encoding="utf-8")
    assert "promote) PROMOTE=1" in job
    assert "export_wire.py --no-promote" in job          # the default stays
    assert "rows-check" in job and "approved_before.txt" in job
    src = WORKER.read_text(encoding="utf-8")
    assert 'CARTA_TRAILSLAB_PROMOTE' in src and 'spawn.append("promote")' in src


# --------------------------------------------------------------------------- #
# guided search and the Ask index on the box
# --------------------------------------------------------------------------- #
def _tasks():
    tree = TASK_SOURCE.task_tree(ROOT)  # the table is pipeline/tasks/*.py (T1207)
    out = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            keys = [k.value for k in node.keys if isinstance(k, ast.Constant)]
            if "key" in keys and "cadence" in keys:
                d = dict(zip(keys, node.values))
                out[d["key"].value] = d
    return out


def test_guided_search_and_ask_index_are_box_tasks():
    t = _tasks()
    for key in ("guided_search", "ask_index"):
        assert key in t, key
        assert t[key]["cadence"].value == "after"
        assert "guard" in t[key] and t[key]["soft"].value is True
    src = TASK_SOURCE.task_text(ROOT)
    assert '"guard": guard_guided_search' in src
    assert "GUIDED_PY = os.environ.get(\"CARTA_GUIDED_PY\") or PY" in src


def test_box_ml_install_keeps_the_two_hubs_apart():
    sh = (ROOT / "infra" / "hetzner" / "cax11" / "run_pipeline.sh").read_text(encoding="utf-8")
    assert 'BOX_ML="${CARTA_BOX_ML:-ask}"' in sh
    # ask: model2vec alone into the main venv (no hub pin: model2vec 0.10 needs hub 2.x)
    assert "grep -E '^model2vec==' \"$ML_REQ\"" in sh
    # all: the rest (sentence-transformers and the hub below 1.0) into its own venv
    assert "^model2vec' \"$ML_REQ\"" in sh and "$GVENV/bin/python\" -m pip install" in sh
    assert 'export CARTA_GUIDED_PY="$GVENV/bin/python"' in sh
    req = (ROOT / "requirements-ml.txt").read_text(encoding="utf-8")
    assert "model2vec==" in req and "sentence-transformers==" in req


# --------------------------------------------------------------------------- #
# the box stays scrape
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(not BASH, reason="bash missing")
def test_stays_scrape_idles_outside_its_months(tmp_path):
    env = dict(os.environ, CARTA_STAYS_MONTH="06", CARTA_LOG_DIR=str(tmp_path))
    r = subprocess.run([BASH, str(STAYS_SH), "--dry-run"], env=env, capture_output=True, text=True)
    assert r.returncode == 0 and "not a scrape month" in r.stdout


@pytest.mark.skipif(not BASH, reason="bash missing")
def test_stays_scrape_needs_an_egress_for_booking(tmp_path):
    env = dict(os.environ, CARTA_STAYS_MONTH="03", CARTA_LOG_DIR=str(tmp_path),
               CARTA_STAYS_SITES="booking")
    env.pop("CARTA_STAYS_BOOKING_EGRESS", None)
    r = subprocess.run([BASH, str(STAYS_SH), "--dry-run"], env=env, capture_output=True, text=True)
    assert r.returncode == 3 and "egress" in r.stdout
    env["CARTA_STAYS_SITES"] = "hostelworld"
    r = subprocess.run([BASH, str(STAYS_SH), "--dry-run"], env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "scrape_hostelworld.py --run" in r.stdout and "journal_scrape.sqlite" in r.stdout


# --------------------------------------------------------------------------- #
# the dump round trip, on a real throwaway cluster
# --------------------------------------------------------------------------- #
def _pg_bin(name):
    hits = sorted(glob.glob(f"/usr/lib/postgresql/*/bin/{name}"))
    return hits[-1] if hits else shutil.which(name)


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


NEED = [_pg_bin("initdb"), _pg_bin("pg_ctl"), shutil.which("pg_dump"), shutil.which("gpg"), BASH]


def _gen_key(home, name):
    subprocess.run(["gpg", "--homedir", str(home), "--batch", "--passphrase", "",
                    "--quick-gen-key", name, "default", "default", "never"],
                   check=True, capture_output=True)
    out = subprocess.run(["gpg", "--homedir", str(home), "--batch", "--with-colons", "--list-keys", name],
                         check=True, capture_output=True, text=True).stdout
    return next(ln.split(":")[9] for ln in out.splitlines() if ln.startswith("fpr"))


@pytest.mark.skipif(not all(NEED) or os.name == "nt", reason="needs initdb, pg_ctl, pg_dump, gpg, bash")
def test_dump_push_and_restore_round_trip(tmp_path):
    initdb, pg_ctl = _pg_bin("initdb"), _pg_bin("pg_ctl")
    data, port = tmp_path / "pg", _free_port()
    if os.geteuid() == 0:   # initdb refuses root
        pytest.skip("initdb cannot run as root")
    subprocess.run([initdb, "-D", str(data), "-U", "trailslab", "--auth=trust"], check=True, capture_output=True)
    subprocess.run([pg_ctl, "-D", str(data), "-o", f"-p {port} -k {tmp_path} -c listen_addresses=127.0.0.1",
                    "-w", "start", "-l", str(tmp_path / "pg.log")], check=True, capture_output=True)
    try:
        def psql(db, sql):
            return subprocess.run(["psql", "-h", "127.0.0.1", "-p", str(port), "-U", "trailslab", "-d", db,
                                   "-tAc", sql], check=True, capture_output=True, text=True).stdout.strip()
        psql("postgres", "create database trailslab")
        psql("postgres", "create database empty")
        psql("trailslab", "create table trips (id bigint primary key, status text); "
                          "insert into trips values (1, 'published'), (2, 'approved')")

        r2 = tmp_path / "r2"
        stub = tmp_path / "rclone"
        stub.write_text(f"""#!/usr/bin/env bash
# rclone stand-in: r2:<path> is {r2}/<path>
m() {{ case "$1" in r2:*) echo "{r2}/${{1#r2:}}" ;; *) echo "$1" ;; esac; }}
cmd="$1"; shift
case "$cmd" in
  copyto) mkdir -p "$(dirname "$(m "$2")")"; cp "$(m "$1")" "$(m "$2")" ;;
  lsf) [ -e "$(m "$1")" ] && basename "$(m "$1")"; exit 0 ;;
  lsjson) while [ "${{1#--}}" != "$1" ] || [ "$1" = "-R" ]; do shift; done
          d="$(m "$1")"; python3 -c '
import json, os, sys
d = sys.argv[1]; out = []
for root, _, files in os.walk(d):
    for f in files:
        p = os.path.join(root, f)
        out.append({{"Path": os.path.relpath(p, d), "Name": f, "Size": os.path.getsize(p),
                     "ModTime": "2026-11-07T00:00:00Z", "IsDir": False}})
print(json.dumps(out))' "$d" ;;
  *) echo "stub rclone: $cmd" >&2; exit 1 ;;
esac
""", encoding="utf-8")
        stub.chmod(0o755)

        owner_home, worker_home = tmp_path / "gpg-owner", tmp_path / "gpg-worker"
        for h in (owner_home, worker_home):
            h.mkdir(mode=0o700)
        owner = _gen_key(owner_home, "carta owner test")
        worker = _gen_key(worker_home, "carta worker test")
        wpub = tmp_path / "worker.pub.asc"
        wpub.write_bytes(subprocess.run(["gpg", "--homedir", str(worker_home), "--armor", "--export", worker],
                                        check=True, capture_output=True).stdout)

        base = dict(os.environ, CARTA_RCLONE=str(stub), TRAILSLAB_HOST="127.0.0.1", TRAILSLAB_PORT=str(port),
                    TRAILSLAB_DB="trailslab", CARTA_TRAILSLAB_DUMP_DIR=str(tmp_path / "work"),
                    CARTA_PY=sys.executable)
        push = dict(base, GNUPGHOME=str(owner_home), CARTA_BACKUP_KEY=owner,
                    CARTA_WORKER_GPG_PUBLIC_FILE=str(wpub))
        r = subprocess.run([BASH, str(DUMP_SH), "push"], env=push, capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr
        dumps = list((r2 / "carta" / "archive" / "db" / "trailslab").glob("trailslab-*.dump.gpg"))
        assert len(dumps) == 1
        # A second push the same day refuses to overwrite.
        r = subprocess.run([BASH, str(DUMP_SH), "push"], env=push, capture_output=True, text=True)
        assert r.returncode == 3 and "exists already" in r.stdout

        # The worker key alone opens it, as the worker job would.
        restore = dict(base, GNUPGHOME=str(worker_home), TRAILSLAB_DB="empty")
        r = subprocess.run([BASH, str(DUMP_SH), "restore"], env=restore, capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr
        assert psql("empty", "select count(*) from trips") == "2"
        # A lab with trips is not overwritten without --force.
        r = subprocess.run([BASH, str(DUMP_SH), "restore"], env=restore, capture_output=True, text=True)
        assert r.returncode == 3 and "--force" in r.stdout
    finally:
        subprocess.run([pg_ctl, "-D", str(data), "-m", "fast", "stop"], capture_output=True)
