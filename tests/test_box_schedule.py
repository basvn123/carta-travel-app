"""The box schedule (T1107, ROADMAP H9): every run_pipeline.py task in a tier,
the units in step with the table, the cadence slack, and the status push."""
import importlib.util
import json
import re
from datetime import timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CRON = ROOT / "infra" / "hetzner" / "cron"
CAX11 = ROOT / "infra" / "hetzner" / "cax11"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def sched():
    return _load("box_schedule", CRON / "schedule.py")


@pytest.fixture(scope="module")
def rp(sched):
    return sched.load_pipeline()


def test_no_task_is_unscheduled(sched, rp):
    out, unscheduled = sched.assign(rp.TASKS)
    assert unscheduled == [], f"tasks in no tier: {unscheduled}"
    placed = sum(len(v) for v in out.values())
    assert placed == len(rp.TASKS)


def test_every_backfill_task_has_a_written_reason(sched, rp):
    backfill = {t["key"] for t in rp.TASKS if t["cadence"] in ("backfill", "manual")}
    assert backfill == set(sched.MANUAL), (
        f"missing reason: {sorted(backfill - set(sched.MANUAL))}; "
        f"stale reason: {sorted(set(sched.MANUAL) - backfill)}")


def test_after_tasks_never_land_in_the_weekly_tier(sched, rp):
    out, _ = sched.assign(rp.TASKS)
    assert not [t["key"] for t in out["weekly"] if t["cadence"] != "weekly"]


def test_tier_of_follows_the_fastest_upstream(sched):
    tasks = [
        {"key": "q", "cadence": "quarterly"},
        {"key": "m", "cadence": "monthly"},
        {"key": "w", "cadence": "weekly"},
        {"key": "a_q", "cadence": "after", "after": ["q"]},
        {"key": "a_qm", "cadence": "after", "after": ["q", "m"]},
        {"key": "a_w", "cadence": "after", "after": ["w"]},
        {"key": "a_chain", "cadence": "after", "after": ["a_q"]},
        {"key": "a_orphan", "cadence": "after", "after": ["gone"]},
        {"key": "b", "cadence": "backfill"},
    ]
    by = {t["key"]: t for t in tasks}
    got = {t["key"]: sched.tier_of(t, by) for t in tasks}
    assert got["a_q"] == "quarterly"
    assert got["a_qm"] == "monthly"
    assert got["a_w"] == "monthly"          # after ranks with monthly
    assert got["a_chain"] == "quarterly"
    assert got["a_orphan"] is None          # unscheduled: the test above would fail
    assert got["b"] is None                 # backfill without a MANUAL reason


def test_tonights_tasks_are_scheduled_before_the_dossier(sched, rp):
    out, _ = sched.assign(rp.TASKS)
    quarterly = {t["key"] for t in out["quarterly"]}
    for key in ("place_intros", "place_gallery", "poi_descriptions", "crowding_uk", "sea_temp"):
        assert key in quarterly, key
    order = [t["key"] for t in rp.TASKS]
    for key in ("place_intros", "place_gallery", "poi_descriptions"):
        assert order.index(key) < order.index("dossier"), key


def test_units_match_the_table(sched):
    assert sched.check_units() == []


def test_unit_check_catches_drift(sched, tmp_path):
    for f in CRON.glob("carta-*.*"):
        (tmp_path / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    t = tmp_path / "carta-monthly.timer"
    t.write_text(t.read_text(encoding="utf-8").replace("01..07", "08..14"), encoding="utf-8")
    problems = sched.check_units(tmp_path)
    assert any("carta-monthly.timer OnCalendar" in p for p in problems)


def test_install_enables_every_tier_timer(sched):
    text = (CRON / "install.sh").read_text(encoding="utf-8")
    enable = next(line for line in text.splitlines() if "enable --now" in line and "reboot" in line)
    disable = next(line for line in text.splitlines() if "disable --now" in line)
    for t in sched.TIERS:
        assert f"{t['unit']}.timer" in enable
        assert f"{t['unit']}.timer" in disable
        assert f"{t['unit']}.service" in text
    assert "schedule.py\" --check" in text


def test_reboot_window_waits_for_every_tier(sched):
    text = (CRON / "reboot-if-needed.sh").read_text(encoding="utf-8")
    for t in sched.TIERS:
        assert f"{t['unit']}.service" in text


def test_lock_is_taken_before_the_code_update():
    text = (CAX11 / "weekly.sh").read_text(encoding="utf-8")
    assert text.index('flock -w "$lock_wait" 9') < text.index("reset -q --hard")
    assert "export CARTA_RUN_LOCKED=1" in text
    rps = (CAX11 / "run_pipeline.sh").read_text(encoding="utf-8")
    assert 'CARTA_RUN_LOCKED:-0}" = "1"' in rps
    assert 'CADENCE="${TIER:-${CARTA_MAX_CADENCE:-weekly}}"' in rps
    assert "push_status.py" in rps


@pytest.mark.parametrize("cadence,elapsed_days,due", [
    ("weekly", 7 - 2 / 24, True),      # finished 11:00, next Monday 09:00
    ("weekly", 5, False),
    ("monthly", 28, True),             # first Saturday to first Saturday
    ("monthly", 20, False),
    ("quarterly", 84, True),           # third Saturday to third Saturday, shortest
    ("quarterly", 60, False),
])
def test_cadence_slack_matches_the_calendar(rp, monkeypatch, cadence, elapsed_days, due):
    now = rp.now_utc()
    monkeypatch.setattr(rp, "now_utc", lambda: now)
    last = (now - timedelta(days=elapsed_days)).isoformat()
    task = {"key": "x", "cadence": cadence}
    assert rp.is_due(task, {"x": {"last_success": last}}) is due


def test_dry_run_prints_every_task(sched, rp, capsys):
    assert sched.main(["--dry-run", "--check", "--no-state"]) == 0
    out = capsys.readouterr().out
    assert "unscheduled: none" in out
    for t in rp.TASKS:
        assert re.search(rf"^\s+{re.escape(t['key'])}\s", out, re.MULTILINE), t["key"]


def test_status_push_plan_and_record(tmp_path, monkeypatch):
    ps = _load("push_status", CAX11 / "push_status.py")
    state = tmp_path / "pipeline_state.json"
    state.write_text("{}", encoding="utf-8")
    last = tmp_path / "last_run.json"
    monkeypatch.setattr(ps, "LAST_RUN", last)
    monkeypatch.setattr(ps, "FILES", [(state, "pipeline_state.json"),
                                      (tmp_path / "absent.json", "freshness_report.json"),
                                      (last, "last_run.json")])
    rec = ps.build_record("monthly", 1, 1762419600, now=1762423200, wires_meta={"n_over_cadence": 2})
    assert rec["tier"] == "monthly" and rec["exit"] == 1 and rec["ok"] is False
    assert rec["started_at"] == "2025-11-06T09:00:00Z"
    assert rec["files"] == {"pipeline_state.json": True, "freshness_report.json": False}
    last.write_text(json.dumps(rec), encoding="utf-8")
    base = ps.remote_base()
    assert base == "r2:carta/status/"
    cmds = ps.plan(base, rec)
    dests = [c[3] for c in cmds]
    assert dests[0] == "r2:carta/status/pipeline_state.json"
    assert "r2:carta/status/freshness_report.json" not in dests   # absent file skipped
    assert dests[-1] == "r2:carta/status/last_run.json"            # the record goes last
    assert dests[-2].startswith("r2:carta/status/runs/") and dests[-2].endswith("-monthly.json")
    assert all(c[:2] == ["rclone", "copyto"] for c in cmds)
