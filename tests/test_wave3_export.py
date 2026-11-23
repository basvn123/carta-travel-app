"""Wave 3 export gates (2.2a, 2.3): photo-audit drops and the takedown ledger
inside credited(), the narrow lead filter, the difficulty == f.g check."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import export_wire  # noqa: E402


def photo(name, lic="CC0 1.0"):
    return {"u": f"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/{name}/500px-{name}",
            "license": lic, "author": "A. Person"}


def test_credited_drops_audit_rejects_and_takedowns(monkeypatch):
    rows = [photo("Good.jpg"), photo("Signpost.jpg"), photo("Taken.jpg")]
    monkeypatch.setattr(export_wire, "REJECTED_PHOTOS", {"Signpost.jpg"})
    monkeypatch.setattr(export_wire, "is_taken_down",
                        lambda text, ledger=None: "Taken.jpg" in (text or ""))
    got = export_wire.credited(rows)
    assert [export_wire._file_of(r["u"]) for r in got] == ["Good.jpg"]


def test_credited_still_gates_the_licence():
    assert export_wire.credited([photo("Nope.jpg", lic="All rights reserved")]) == []


def test_lead_filter_is_narrow(monkeypatch):
    monkeypatch.setattr(export_wire, "t1179_summaries", lambda: {})
    hard = {"id": 1, "grade": "hard", "category": "hike", "distance_m": 9000,
            "ascent_m": 200, "description": "A gentle riverside stroll, nothing steep."}
    assert export_wire.wire_summary(hard) is None
    moderate_on_hard = {**hard, "id": 2,
                        "description": "A moderate climb through beech woods."}
    assert export_wire.wire_summary(moderate_on_hard) == \
        "A moderate climb through beech woods."
    easy_row = {**hard, "id": 3, "grade": "easy"}
    assert export_wire.wire_summary(easy_row) == hard["description"]


def test_difficulty_check_skips_rows_without_f():
    items = [{"id": 1, "difficulty": "easy", "f": {"g": "very_hard"}},
             {"id": 2, "difficulty": "hard", "f": {"g": "hard"}},
             {"id": 3, "difficulty": "easy"}]
    assert export_wire.difficulty_mismatches(items) == [1]
