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
