"""Nightly backup and restore drill round trip (T1159, ROADMAP H5).

Starts a throwaway Postgres cluster, applies supabase/migrations, seeds rows,
runs ops/backup_nightly.sh (gpg public-key encryption, a local stand-in for
rclone and R2), then ops/restore_drill.sh --latest into a scratch database and
checks counts and timings. Skipped when Postgres server binaries, gpg or
runuser (when root) are missing. Not a test of Supabase itself.
"""
import glob
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PGBIN = next(iter(sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True)), None)
RUNUSER = shutil.which("runuser")
IS_ROOT = hasattr(os, "geteuid") and os.geteuid() == 0

CRON = ROOT / "infra" / "hetzner" / "cron"


def test_backup_units_are_nightly_and_installed():
    """Static checks, no database: these run everywhere."""
    timer = (CRON / "carta-backup.timer").read_text()
    svc = (CRON / "carta-backup.service").read_text()
    assert "OnCalendar=*-*-* 01:30:00 Europe/Brussels" in timer
    assert "Persistent=true" in timer and "Unit=carta-backup.service" in timer
    assert "ExecStart=/bin/bash /home/carta/carta/ops/backup_nightly.sh" in svc
    assert "Type=oneshot" in svc
    install = (CRON / "install.sh").read_text()
    for unit in ("carta-backup.service", "carta-backup.timer"):
        assert install.count(unit) >= 3, unit
    assert "--disable" in install and "carta-backup.timer carta-reboot.timer" in install


_needs_pg = pytest.mark.skipif(
    PGBIN is None or not (Path(PGBIN) / "initdb").exists() or shutil.which("gpg") is None
    or (IS_ROOT and RUNUSER is None) or sys.platform == "win32",
    reason="needs Postgres server binaries, gpg, and a non-root user to run them",
)
pytestmark = []

RCLONE_SHIM = textwrap.dedent('''\
    #!/usr/bin/env python3
    """Stand-in for rclone: remote 'r2:<path>' is the directory $FAKE_R2/<path>."""
    import os, sys, shutil, time, fnmatch
    root = os.environ["FAKE_R2"]
    def p(x): return os.path.join(root, x.split(":", 1)[1]) if x.startswith("r2:") else x
    a = sys.argv[1:]
    cmd = a[0]
    if cmd == "copyto":
        os.makedirs(os.path.dirname(p(a[2])), exist_ok=True); shutil.copyfile(p(a[1]), p(a[2]))
    elif cmd == "lsf":
        pos = [x for i, x in enumerate(a[1:], 1) if not x.startswith("--") and a[i - 1] not in ("--format", "--include")]
        d = p(pos[0]); fmt = a[a.index("--format") + 1] if "--format" in a else "p"
        inc = a[a.index("--include") + 1] if "--include" in a else "*"
        if os.path.isfile(d):
            print(os.path.getsize(d) if fmt == "s" else os.path.basename(d))
        else:
            for n in sorted(os.listdir(d)):
                if fnmatch.fnmatch(n, inc): print(n)
    elif cmd == "delete":
        d = p(a[1]); age = int(a[a.index("--min-age") + 1].rstrip("d")) * 86400
        inc = a[a.index("--include") + 1]
        for n in os.listdir(d):
            f = os.path.join(d, n)
            if fnmatch.fnmatch(n, inc) and time.time() - os.path.getmtime(f) > age: os.remove(f)
    else:
        sys.exit("shim: unsupported " + cmd)
''')


@pytest.fixture(scope="module")
def box():
    # pytest's own tmp dirs are 0700 and the postgres user (when we are root) must get in.
    base = Path(tempfile.mkdtemp(prefix="carta-bk-", dir="/tmp"))
    base.chmod(0o755)
    repo = base / "repo"
    shutil.copytree(ROOT / "ops", repo / "ops")
    shutil.copytree(ROOT / "supabase" / "migrations", repo / "supabase" / "migrations")
    shutil.copy(ROOT / "supabase" / "schema.sql", repo / "supabase" / "schema.sql")
    (repo / "infra" / "hetzner" / "cax11").mkdir(parents=True)
    shutil.copy(ROOT / "infra/hetzner/cax11/load-env.sh", repo / "infra/hetzner/cax11/")
    shim = base / "bin" / "rclone"
    shim.parent.mkdir()
    shim.write_text(RCLONE_SHIM)
    shim.chmod(0o755)
    for d in ("r2", "out", "gnupg", "pgdata", "sock", "home"):
        (base / d).mkdir()
    if IS_ROOT:
        subprocess.run(["chown", "-R", "postgres", str(base)], check=True)
    for p in [base, *base.rglob("*")]:
        if not p.is_symlink():
            p.chmod(p.stat().st_mode | stat.S_IRGRP | stat.S_IROTH | stat.S_IXGRP | stat.S_IXOTH)
    (base / "gnupg").chmod(0o700)
    port = "54329"
    env = {
        "PATH": f"{base / 'bin'}:{PGBIN}:/usr/local/bin:/usr/bin:/bin", "HOME": str(base / "home"),
        "GNUPGHOME": str(base / "gnupg"), "FAKE_R2": str(base / "r2"),
        "PGHOST": str(base / "sock"), "PGPORT": port, "PGUSER": "postgres",
        "CARTA_ENV_FILE": str(base / "none.env"), "CARTA_BACKUP_OUT": str(base / "out"),
        "CARTA_BACKUP_REMOTE": "r2:carta/archive/db/supabase-nightly",
        "SUPABASE_DB_URL": f"postgresql://postgres@/src?host={base / 'sock'}&port={port}",
        "CARTA_BACKUP_KEY": "drill@carta.test", "LANG": "C.UTF-8",
    }

    def run(args, check=True, **kw):
        cmd = [RUNUSER, "-u", "postgres", "--"] + args if IS_ROOT else args
        r = subprocess.run(cmd, env=env, cwd=repo, capture_output=True, text=True, check=False, **kw)
        if check and r.returncode:
            raise AssertionError(f"{args} rc={r.returncode}\n{r.stdout}\n{r.stderr}")
        return r

    run(["initdb", "-D", str(base / "pgdata"), "-A", "trust", "-U", "postgres"])
    run(["pg_ctl", "-D", str(base / "pgdata"), "-o", f"-p {port} -k {base / 'sock'} -c listen_addresses=",
         "-l", str(base / "pg.log"), "-w", "start"])
    run(["createdb", "src"])
    run(["psql", "-X", "-q", "-d", "src", "-f", "ops/supabase_local_stub.sql"])
    # supabase/schema.sql is the base the migrations build on (saved_trips,
    # user_settings); with it every migration and its self-test passes (T1211, T1159-d).
    run(["psql", "-X", "-q", "-d", "src", "-v", "ON_ERROR_STOP=1", "-f", "supabase/schema.sql"])
    for f in sorted(glob.glob(str(repo / "supabase/migrations/*.sql"))):
        if not f.endswith("_down.sql"):
            run(["psql", "-X", "-q", "-d", "src", "-v", "ON_ERROR_STOP=1", "-f", f])
    run(["psql", "-X", "-q", "-d", "src", "-c", """
        insert into auth.users (id, email) select gen_random_uuid(), 'u'||g||'@x.test' from generate_series(1,5) g;
        insert into public.trip_plans (user_id, label) select id, 'trip '||email from auth.users;
        insert into public.trip_plans (user_id, label) select id, 'second '||email from auth.users;"""])
    run(["gpg", "--batch", "--passphrase", "", "--quick-generate-key", "drill@carta.test", "default", "default", "never"])
    yield run, base, repo
    run(["pg_ctl", "-D", str(base / "pgdata"), "-m", "immediate", "stop"], check=False)
    shutil.rmtree(base, ignore_errors=True)


@_needs_pg
def test_round_trip_is_encrypted_restorable_and_timed(box):
    run, base, _repo = box
    r = run(["bash", "ops/backup_nightly.sh"])
    assert "uploaded to" in r.stdout
    dumps = sorted((base / "out").glob("supabase-nightly-*.dump.gpg"))
    assert len(dumps) == 1
    head = dumps[0].read_bytes()[:64]
    assert b"PGDMP" not in head                         # ciphertext, not a pg dump
    assert json.loads((base / "out" / "last_backup.json").read_text())["status"] == "ok"
    remote = base / "r2/carta/archive/db/supabase-nightly"
    assert {p.suffix for p in remote.iterdir()} >= {".gpg", ".sha256", ".json"}

    rep = base / "drill.json"
    r = run(["bash", "ops/restore_drill.sh", "--latest", "--report", str(rep)])
    out = json.loads(rep.read_text())
    assert out["problems"] == 0 and out["tables"] >= 60
    assert out["rows"] >= 10                            # 5 users' trips x2 at least
    assert out["seconds"]["total"] > 0 and out["seconds"]["restore"] > 0
    n = run(["psql", "-X", "-A", "-t", "-d", "carta_restore_drill", "-c", "select count(*) from public.trip_plans"])
    assert n.stdout.strip() == "10"
    print("DRILL", json.dumps(out))


@_needs_pg
def test_backup_prunes_only_after_upload_and_only_old_dumps(box):
    run, base, _repo = box
    remote = base / "r2/carta/archive/db/supabase-nightly"
    old = remote / "supabase-nightly-20200101T000000Z.dump.gpg"
    old.write_bytes(b"x" * 3000)
    os.utime(old, (1_577_836_800, 1_577_836_800))
    keep = remote / "other-file.txt"
    keep.write_text("unrelated")
    os.utime(keep, (1_577_836_800, 1_577_836_800))
    run(["bash", "ops/backup_nightly.sh"])
    assert not old.exists()
    assert keep.exists()
    assert len(list(remote.glob("supabase-nightly-*.dump.gpg"))) >= 1


@_needs_pg
def test_backup_fails_loudly_and_records_it(box):
    run, base, _repo = box
    r = run(["env", "CARTA_BACKUP_KEY=nobody@nowhere.test", "bash", "ops/backup_nightly.sh"], check=False)
    assert r.returncode == 1
    assert json.loads((base / "out" / "last_backup.json").read_text())["status"] == "failed"
    r = run(["env", f"SUPABASE_DB_URL=postgresql://postgres@/nodb?host={base / 'sock'}&port=54329",
             "bash", "ops/backup_nightly.sh"], check=False)
    assert r.returncode == 1
    assert not list((base / "out").glob("*.partial"))


@_needs_pg
def test_restore_drill_refuses_the_live_host(box):
    run, base, _repo = box
    r = run(["env", "PGHOST=db.ntssxktaduxzpsmejwyv.supabase.co", "bash", "ops/restore_drill.sh",
             "--file", str(next((base / "out").glob("*.dump.gpg")))], check=False)
    assert r.returncode == 1 and "refusing" in r.stderr
