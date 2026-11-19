"""One publish path (T646): apply_stays publishes only a stamped, passed build.

Run:  python -m pytest pipeline/stays/tests -q
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import apply_stays as A  # noqa: E402
import build_stays as B  # noqa: E402


def build(tmp_path, passed=True):
    (tmp_path / "PT.json").write_text('{"v":1,"cc":"PT","dests":{}}', encoding="utf-8")
    m = {"gate": {"passed": passed, "hash": B.files_hash(tmp_path)}}
    (tmp_path / "manifest.json").write_text(json.dumps(m), encoding="utf-8")
    return m


def test_a_passed_stamped_build_may_be_published(tmp_path):
    assert A.stamp_problem(build(tmp_path), tmp_path) is None


def test_a_failed_gate_is_refused(tmp_path):
    assert "did not pass" in A.stamp_problem(build(tmp_path, passed=False), tmp_path)


def test_a_build_without_a_stamp_is_refused(tmp_path):
    assert "no gate stamp" in A.stamp_problem({"gate": {"passed": True}}, tmp_path)


def test_files_changed_after_the_stamp_are_refused(tmp_path):
    m = build(tmp_path)
    (tmp_path / "PT.json").write_text('{"v":1,"cc":"PT","dests":{"X":{}}}', encoding="utf-8")
    assert "changed" in A.stamp_problem(m, tmp_path)


# D10 (wave 1, 0.1): the box applies its build to its own master, and an
# apply that would lose measured beds is refused.

def _master(n_measured=4, legacy=0):
    dests = {}
    for i in range(n_measured):
        dests[f"m{i}"] = {"accommodation": {"q": "measured", "captured": "2026-11-01",
                                            "beds": {"hotel3": 100}, "supply": {}}}
    for i in range(legacy):
        dests[f"l{i}"] = {"accommodation": {"q": "modelled", "captured": None,
                                            "beds": {"dorm": 34, "hotel3": 216}}}
    return {"meta": {"schema_version": 20}, "destinations": dests}


def _rec(**beds):
    return {"beds": beds or {"hotel3": 90}, "q": "measured", "captured": "2026-11-03", "supply": {}}


def test_apply_build_replaces_legacy_blocks_and_cleans_dorm():
    data = _master(n_measured=0, legacy=3)
    records = {"l0": _rec(), "l1": _rec(dorm=200, hotel3=100), "l2": _rec()}
    n, before, after = A.apply_build(data, records, {"built": "x"})
    assert n == 3 and before["measured"] == 0 and after["measured"] == 3
    assert after["dorm_above_hotel3"] == 0
    assert "dorm" not in data["destinations"]["l1"]["accommodation"]["beds"]
    assert A.loss_problem(before, after) is None


def test_a_partial_build_is_refused(tmp_path, monkeypatch):
    path = tmp_path / "app_data.json"
    path.write_text(json.dumps(_master(n_measured=4)), encoding="utf-8")
    monkeypatch.setattr(A, "OVERRIDE", "")
    records = {"m0": _rec(), "m1": _rec()}          # half the places: 100% -> 50%
    try:
        A.patch(path, records, {"built": "x"})
        raise AssertionError("a partial build must be refused")
    except SystemExit as e:
        assert "measured beds would fall" in str(e)
    assert json.loads(path.read_text(encoding="utf-8")) == _master(n_measured=4)   # untouched
    monkeypatch.setattr(A, "OVERRIDE", "test")
    assert A.patch(path, records, {"built": "x"}) == 2


def test_stays_task_writes_the_master():
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from tasks.prices import TASKS
    stays = next(t for t in TASKS if t["key"] == "stays")
    assert stays["writes_app_data"] is True


def test_box_stays_applies_to_the_master(tmp_path, monkeypatch):
    import box_stays
    v = tmp_path / "v1"
    v.mkdir()
    (v / "BE.json").write_text(json.dumps({"v": 1, "cc": "BE", "dests": {"l0": _rec()}}), encoding="utf-8")
    m = {"built": "x", "gate": {"passed": True, "hash": B.files_hash(v)}}
    (v / "manifest.json").write_text(json.dumps(m), encoding="utf-8")
    master = tmp_path / "app_data.json"
    master.write_text(json.dumps(_master(n_measured=0, legacy=1)), encoding="utf-8")
    monkeypatch.setattr(box_stays, "V", v)
    monkeypatch.setattr(box_stays, "PREV", tmp_path / "prev")
    monkeypatch.setattr(box_stays, "STATE", tmp_path)
    monkeypatch.setattr(box_stays, "run", lambda cmd, dry=False: 0)
    monkeypatch.setattr(box_stays.subprocess, "run", lambda *a, **k: type("R", (), {"returncode": 0})())
    monkeypatch.setattr(A, "V", v)
    monkeypatch.setattr(A, "MASTER", master)
    monkeypatch.setattr(A, "SERVED", tmp_path / "absent.json")
    monkeypatch.setattr(A, "PUBLIC", tmp_path / "public_stays")
    monkeypatch.setattr(A, "ROOT", tmp_path)
    monkeypatch.setattr(sys, "argv", ["box_stays.py"])
    box_stays.main()
    acc = json.loads(master.read_text(encoding="utf-8"))["destinations"]["l0"]["accommodation"]
    assert acc["q"] == "measured" and acc["captured"] == "2026-11-03"
