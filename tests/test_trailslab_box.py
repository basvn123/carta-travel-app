"""T1182 (ROADMAP D24, register row T784-a): the trails lab on the build box.

Covers tools/trailslab/box/: the compose override (validated by
`docker compose config`, which needs no daemon), lab.sh's refusals and env
block, the review units (loopback only), run_pipeline.py's box mode (the
guard names lab.sh, the worker stands down), and a real round trip on a
throwaway PostgreSQL cluster with PostGIS and pgRouting: init-schema from
tools/trailslab/initdb, push to a stub R2, restore into an empty database,
and the refusal of a restore over reviews that were never pushed.
(The round trip skips where initdb, PostGIS, pgRouting or bash are missing,
and as root, which initdb refuses.)
"""

import glob
import importlib.util
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BOX = ROOT / "tools" / "trailslab" / "box"
LAB = BOX / "lab.sh"
BASH = shutil.which("bash")


def _lab(*args, env=None, **kw):
    e = dict(os.environ, CARTA_LAB_NO_ENV="1")
    for k in ("CARTA_TRAILSLAB_HOME", "TRAILSLAB_PASSWORD", "TRAILSLAB_DATA_DIR", "CARTA_TRAILSLAB_WORKER"):
        e.pop(k, None)
    e.update(env or {})
    return subprocess.run([BASH, str(LAB), *args], env=e, capture_output=True, text=True, **kw)


def _compose_ok():
    if not shutil.which("docker"):
        return False
    r = subprocess.run(["docker", "compose", "version"], capture_output=True)
    return r.returncode == 0


@pytest.mark.skipif(not BASH or not _compose_ok(), reason="needs bash and docker compose")
def test_compose_override_validates_and_keeps_the_lab_on_loopback():
    r = _lab("config", env={"TRAILSLAB_DATA_DIR": "/mnt/trailslab/pgdata", "TRAILSLAB_PASSWORD": "x"})
    assert r.returncode == 0, r.stderr
    out = r.stdout
    assert "restart: unless-stopped" in out
    assert "source: /mnt/trailslab/pgdata" in out and "target: /var/lib/postgresql/data" in out
    assert "box/initdb-empty" in out
    assert "host_ip: 127.0.0.1" in out and "0.0.0.0" not in out
    assert "shared_buffers=384MB" in out and "mem_limit" in out
    # The data must not land in the named volume on the root disk.
    assert "source: trailslab_pgdata" not in out


def test_compose_override_needs_a_password_and_a_data_dir():
    text = (BOX / "docker-compose.box.yml").read_text(encoding="utf-8")
    assert "${TRAILSLAB_PASSWORD:?" in text and "${TRAILSLAB_DATA_DIR:?" in text
    assert "—" not in text and "–" not in text


@pytest.mark.skipif(not BASH, reason="bash missing")
def test_check_refuses_with_each_fix(tmp_path):
    r = _lab("check", env={"TRAILSLAB_PASSWORD": "trailslab", "TRAILSLAB_DATA_DIR": str(tmp_path / "nope" / "pgdata")})
    assert r.returncode == 3
    assert "MISSING CARTA_TRAILSLAB_HOME" in r.stdout
    assert "laptop default is refused" in r.stdout
    assert "attach and mount the volume" in r.stdout
    # A data directory on the root disk is refused unless overridden.
    (tmp_path / "vol").mkdir()
    r = _lab("check", env={"CARTA_TRAILSLAB_HOME": "box", "TRAILSLAB_PASSWORD": "s3cret",
                           "TRAILSLAB_DATA_DIR": str(tmp_path / "vol" / "pgdata")})
    mp = subprocess.run(["df", "-P", str(tmp_path)], capture_output=True, text=True).stdout.splitlines()[1].split()[5]
    if mp == "/":
        assert "is on the root disk" in r.stdout


@pytest.mark.skipif(not BASH, reason="bash missing")
def test_env_block_switches_the_box_on_with_a_fresh_password():
    r = _lab("env")
    assert r.returncode == 0, r.stderr
    lines = dict(ln.split("=", 1) for ln in r.stdout.splitlines())
    assert lines["CARTA_TRAILSLAB_HOME"] == "box"
    assert lines["TRAILSLAB_HOST"] == "127.0.0.1" and lines["TRAILSLAB_PORT"] == "5433"
    assert len(lines["TRAILSLAB_PASSWORD"]) >= 20 and lines["TRAILSLAB_PASSWORD"] != "trailslab"
    assert _lab("env").stdout != r.stdout


@pytest.mark.skipif(not BASH, reason="bash missing")
def test_dry_runs_print_and_change_nothing(tmp_path):
    env = {"TRAILSLAB_DATA_DIR": str(tmp_path / "pgdata"), "TRAILSLAB_PASSWORD": "s3cret",
           "CARTA_TRAILSLAB_HOME": "box"}
    r = _lab("up", "--dry-run", env=env)
    assert "+ docker compose" in r.stdout and "up -d trailslab-db" in r.stdout
    r = _lab("down", "--dry-run", env=env)
    assert r.returncode == 0 and "stop trailslab-db" in r.stdout and "down -v" not in r.stdout
    r = _lab("review", "on", "--dry-run", env=env)
    assert r.returncode == 0 and "carta-trailslab-review-api.service" in r.stdout
    r = _lab("tunnel")
    assert "-L 4174:127.0.0.1:4174" in r.stdout and "-L 8011:127.0.0.1:8011" in r.stdout
    assert not (tmp_path / "pgdata").exists()


def test_review_units_bind_loopback_and_are_not_on_at_boot():
    for name in ("carta-trailslab-review-api.service", "carta-trailslab-review-ui.service"):
        text = (BOX / name).read_text(encoding="utf-8")
        assert "--host 127.0.0.1" in text and "0.0.0.0" not in text
        assert "User=carta" in text and "MemoryMax=" in text
    # lab.sh never enables them: they run while a curator reviews.
    assert "enable" not in LAB.read_text(encoding="utf-8").split("review)")[1].split(";;")[0]
    # vite preview proxies /api to the API (server.proxy is preview.proxy's default),
    # and the API accepts writes from the preview origin.
    vite = (ROOT / "tools/trailslab/review/vite.config.js").read_text(encoding="utf-8")
    assert "port: 4174" in vite and "'/api'" in vite
    api = (ROOT / "tools/trailslab/review/api/server.py").read_text(encoding="utf-8")
    assert "http://127.0.0.1:4174" in api


def _run_pipeline():
    spec = importlib.util.spec_from_file_location("run_pipeline_t1182", ROOT / "run_pipeline.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_box_mode_names_lab_sh_and_stands_the_worker_down(monkeypatch):
    rp = _run_pipeline()
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()   # nothing listens there now
    monkeypatch.setenv("TRAILSLAB_HOST", "127.0.0.1")
    monkeypatch.setenv("TRAILSLAB_PORT", str(port))
    monkeypatch.delenv("CARTA_TRAILSLAB_HOME", raising=False)
    assert rp.trailslab_home() == "laptop"
    ok, why = rp.guard_trailslab_up({})
    assert not ok and "docker compose up -d" in why
    monkeypatch.setenv("CARTA_TRAILSLAB_HOME", "box")
    assert rp.trailslab_home() == "box"
    ok, why = rp.guard_trailslab_up({})
    assert not ok and "tools/trailslab/box/lab.sh up" in why
    ok, why = rp._trailslab_worker_guard({})
    assert not ok and "stands down" in why


# --------------------------------------------------------------------------- #
# the round trip, on a real throwaway cluster with PostGIS and pgRouting
# --------------------------------------------------------------------------- #
def _pg_bin(name):
    hits = sorted(glob.glob(f"/usr/lib/postgresql/*/bin/{name}"))
    return hits[-1] if hits else shutil.which(name)


def _has_ext(name):
    return bool(glob.glob(f"/usr/share/postgresql/*/extension/{name}.control"))


NEED = [_pg_bin("initdb"), _pg_bin("pg_ctl"), shutil.which("pg_dump"), shutil.which("psql"), BASH]


@pytest.mark.skipif(not all(NEED) or os.name == "nt" or not (_has_ext("postgis") and _has_ext("pgrouting")),
                    reason="needs initdb, pg_ctl, pg_dump, psql, bash, PostGIS and pgRouting")
def test_init_schema_push_and_restore_round_trip(tmp_path):
    if os.geteuid() == 0:   # initdb refuses root
        pytest.skip("initdb cannot run as root")
    initdb, pg_ctl = _pg_bin("initdb"), _pg_bin("pg_ctl")
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    data = tmp_path / "pg"
    subprocess.run([initdb, "-D", str(data), "-U", "trailslab", "--auth=trust"], check=True, capture_output=True)
    subprocess.run([pg_ctl, "-D", str(data), "-o", f"-p {port} -k {tmp_path} -c listen_addresses=127.0.0.1",
                    "-w", "start", "-l", str(tmp_path / "pg.log")], check=True, capture_output=True)
    try:
        def psql(db, sql):
            return subprocess.run(["psql", "-X", "-h", "127.0.0.1", "-p", str(port), "-U", "trailslab", "-d", db,
                                   "-tAc", sql], check=True, capture_output=True, text=True).stdout.strip()
        psql("postgres", "create database trailslab")
        psql("postgres", "create database restored")

        r2 = tmp_path / "r2"
        stub = tmp_path / "rclone"
        stub.write_text(f"""#!/usr/bin/env bash
m() {{ case "$1" in r2:*) echo "{r2}/${{1#r2:}}" ;; *) echo "$1" ;; esac; }}
cmd="$1"; shift
case "$cmd" in
  copyto) mkdir -p "$(dirname "$(m "$2")")"; cp "$(m "$1")" "$(m "$2")" ;;
  lsf) [ -e "$(m "$1")" ] && basename "$(m "$1")"; exit 0 ;;
  lsjson) while [ "${{1#--}}" != "$1" ] || [ "$1" = "-R" ]; do shift; done
          "{sys.executable}" -c '
import json, os, sys
d = sys.argv[1]; out = []
for root, _, files in os.walk(d):
    for f in files:
        p = os.path.join(root, f)
        out.append({{"Path": os.path.relpath(p, d), "Name": f, "Size": os.path.getsize(p),
                     "ModTime": "2026-11-07T00:00:00Z", "IsDir": False}})
print(json.dumps(out))' "$(m "$1")" ;;
  *) echo "stub rclone: $cmd" >&2; exit 1 ;;
esac
""", encoding="utf-8")
        stub.chmod(0o755)
        base = {"CARTA_RCLONE": str(stub), "CARTA_PY": sys.executable, "TRAILSLAB_HOST": "127.0.0.1",
                "TRAILSLAB_PORT": str(port), "TRAILSLAB_DB": "trailslab",
                "CARTA_TRAILSLAB_DUMP_DIR": str(tmp_path / "work"),
                "CARTA_TRAILSLAB_STAMP": str(tmp_path / "sync.txt"), "CARTA_THREADS": "2"}

        r = _lab("init-schema", env=base)
        assert r.returncode == 0, r.stdout + r.stderr
        assert int(psql("trailslab", "select count(*) from pg_tables where schemaname = 'public'")) >= 20
        # A second init-schema refuses: the lab has a schema.
        assert _lab("init-schema", env=base).returncode == 3

        psql("trailslab", "insert into trips (id, country, category, title, geom, source, license, status) "
                          "overriding system value values "
                          "(1, 'BE', 'hike', 'Lus', ST_GeomFromText('MULTILINESTRING Z((4 50 0, 4.01 50.01 0))', 4326),"
                          " 'test', 'ODbL', 'approved'),"
                          "(2, 'BE', 'hike', 'Tour', ST_GeomFromText('MULTILINESTRING Z((5 50 0, 5.01 50.01 0))', 4326),"
                          " 'test', 'ODbL', 'needs_review')")
        psql("trailslab", "insert into trip_reviews (trip_id, action, reviewer, new_status) "
                          "values (1, 'approve', 'owner', 'approved')")

        # The lab has a review it never pushed: a restore over it refuses.
        r = _lab("restore", env=base)
        assert r.returncode == 3 and "push them first" in r.stdout

        # Without keys the dual-key push refuses: the worker could not read it.
        r = _lab("push", env=dict(base, CARTA_BACKUP_KEY=""))
        assert r.returncode == 3 and "CARTA_BACKUP_KEY" in r.stdout
        r = _lab("push", "--crypt", "plain", env=base)
        assert r.returncode == 0, r.stdout + r.stderr
        assert (tmp_path / "sync.txt").read_text(encoding="utf-8").startswith("push 1 ")
        assert len(list((r2 / "carta" / "archive" / "db" / "trailslab").glob("trailslab-*.dump"))) == 1

        restore = dict(base, TRAILSLAB_DB="restored", CARTA_TRAILSLAB_STAMP=str(tmp_path / "sync-restored.txt"))
        r = _lab("restore", "--crypt", "plain", env=restore)
        assert r.returncode == 0, r.stdout + r.stderr
        assert (tmp_path / "sync-restored.txt").read_text(encoding="utf-8").startswith("restore 1 ")
        assert psql("restored", "select count(*) from trips") == "2"
        assert psql("restored", "select count(*) from trip_reviews") == "1"
        assert psql("restored", "select extname from pg_extension where extname = 'pgrouting'") == "pgrouting"
        # The pushed lab's stamp matches its reviews: the review check passes, and the
        # dump script then refuses a lab that has trips without --force.
        r = _lab("restore", "--crypt", "plain", env=base)
        assert r.returncode == 3 and "push them first" not in r.stdout and "--force" in r.stdout
    finally:
        subprocess.run([pg_ctl, "-D", str(data), "-m", "fast", "stop"], capture_output=True)
