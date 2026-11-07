"""T1201 (row T1182-e): the box lab is pushed to R2 when its last push is due.

    python -m pytest tests/test_trailslab_push_due.py -q
"""
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "infra" / "hetzner" / "cax11" / "trailslab_push_due.sh"
CRON = ROOT / "infra" / "hetzner" / "cron"
NOW = 1_794_000_000          # 2026-11-07, fixed so the test does not age
DAY = 86_400

pytestmark = pytest.mark.skipif(shutil.which("bash") is None
                                or shutil.which("date") is None,
                                reason="needs bash and GNU date")


def run(tmp_path, stamp=None, home="box"):
    lab = tmp_path / "lab.sh"
    lab.write_text('echo "FAKELAB $*"\n')
    st = tmp_path / "sync.txt"
    if stamp is not None:
        st.write_text(stamp + "\n")
    env = {**os.environ, "CARTA_LAB_NO_ENV": "1", "CARTA_LAB_SH": str(lab),
           "CARTA_TRAILSLAB_STAMP": str(st), "CARTA_NOW_EPOCH": str(NOW),
           "CARTA_TRAILSLAB_HOME": home}
    env.pop("CARTA_TRAILSLAB_PUSH_DAYS", None)
    out = subprocess.run(["bash", str(SCRIPT)], env=env, capture_output=True,
                         text=True, check=True)
    return out.stdout


def iso(epoch):
    out = subprocess.run(["date", "-u", "-d", f"@{epoch}", "+%FT%TZ"],
                         capture_output=True, text=True, check=True)
    return out.stdout.strip()


def test_skips_outside_box_mode(tmp_path):
    out = run(tmp_path, home="")
    assert "skip" in out and "FAKELAB" not in out


def test_recent_push_is_not_due(tmp_path):
    out = run(tmp_path, f"push 42 {iso(NOW - 10 * DAY)}")
    assert "not due" in out and "FAKELAB" not in out


def test_old_push_is_due(tmp_path):
    out = run(tmp_path, f"push 42 {iso(NOW - 21 * DAY)}")
    assert "FAKELAB push" in out


def test_restore_or_no_stamp_pushes(tmp_path):
    assert "FAKELAB push" in run(tmp_path, f"restore 42 {iso(NOW - DAY)}")
    assert "FAKELAB push" in run(tmp_path, None)


def test_timer_and_install_agree():
    timer = (CRON / "carta-trailslab-push.timer").read_text()
    assert "Unit=carta-trailslab-push.service" in timer
    assert "Persistent=true" in timer
    service = (CRON / "carta-trailslab-push.service").read_text()
    assert "trailslab_push_due.sh" in service
    install = (CRON / "install.sh").read_text()
    assert install.count("carta-trailslab-push.timer") >= 4
