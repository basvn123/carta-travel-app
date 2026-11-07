"""T1202 (D18): seasons and closures from OSM opening_hours and seasonal tags.

The month reader is cross-checked against opening-hours-py (MIT/Apache, the
research pick) when that library is installed; the CI image does not carry
it, so that one test skips there.
"""
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
import harvest_seasons as hs  # noqa: E402

FIX = ROOT / "tests" / "fixtures" / "seasons" / "facilities.json"
TODAY = date(2026, 11, 7)

CASES = [
    ("May-Oct 09:00-18:00", [5, 6, 7, 8, 9, 10]),
    ("Jun 15-Sep 30 08:00-18:00", [6, 7, 8, 9]),
    ("Dec-Apr; May-Nov off", [1, 2, 3, 4, 12]),
    ("Mo-Su 08:00-18:00; Nov-Mar off", [4, 5, 6, 7, 8, 9, 10]),
    ("Dec-Feb 09:00-16:00", [1, 2, 12]),
    ("Jun-Aug Mo-Su 10:00-18:00, Sep Sa,Su 10:00-16:00", [6, 7, 8, 9]),
    ("2026 May-Oct", [5, 6, 7, 8, 9, 10]),
    ('May-Oct 10:00-17:00 "staffed"', [5, 6, 7, 8, 9, 10]),
    ("Sep-Mar: 09:00-17:00; Apr-Aug: 08:00-20:00", list(range(1, 13))),
    ("24/7", list(range(1, 13))),
    ("Sa 09:00-10:00", list(range(1, 13))),
]


@pytest.mark.parametrize("oh,want", CASES)
def test_month_reader(oh, want):
    assert hs.months_open(oh) == want


@pytest.mark.parametrize("oh", ["week 1-10 Mo-Fr", "easter off", "Jan Su[1] 10:00-12:00", "PH off", "", None, "Jun,Jul off"])
def test_unreadable_or_never_open_gives_none(oh):
    assert hs.months_open(oh) is None


def test_cross_check_with_opening_hours_py():
    oh_lib = pytest.importorskip("opening_hours")
    for text, want in CASES:
        oh = oh_lib.OpeningHours(text)
        got = []
        for m in range(1, 13):
            start = datetime(2026, m, 1)
            end = datetime(2026 + (m == 12), m % 12 + 1, 1)
            # open when any interval of the month is open
            if any(str(iv[2]).lower().endswith("open") for iv in oh.intervals(start, end)):
                got.append(m)
        assert got == want, text


def test_confidence_from_tags():
    fresh = hs.season_of({"opening_hours": "Jun-Sep", "check_date": "2025-07-01"}, TODAY)
    old = hs.season_of({"opening_hours": "Jun-Sep", "check_date": "2019-07-01"}, TODAY)
    word = hs.season_of({"seasonal": "summer"}, TODAY)
    assert fresh == {"open": [6, 7, 8, 9], "conf": "high", "checked": "2025-07-01"}
    assert old["conf"] == "medium"
    assert word == {"open": [6, 7, 8], "conf": "low", "checked": None}
    assert hs.season_of({"opening_hours": "Mo-Su 08:00-18:00"}, TODAY) is None
    assert hs.season_of({"seasonal": "yes"}, TODAY) is None


def test_kinds_and_year_round_ferry_kept():
    assert hs.facility({"tourism": "alpine_hut", "name": "H", "opening_hours": "Jun-Sep"}, 47, 11, TODAY)["kind"] == "hut"
    assert hs.facility({"aerialway": "gondola", "name": "G", "opening_hours": "Dec-Apr"}, 47, 11, TODAY)["kind"] == "lift"
    ferry = hs.facility({"route": "ferry", "name": "F"}, 43, 16, TODAY)
    assert ferry == {"kind": "ferry", "name": "F", "lat": 43, "lon": 16, "seasonal": False}
    assert hs.facility({"tourism": "alpine_hut", "name": "H"}, 47, 11, TODAY) is None


def _dests():
    return {
        "gem:village": {"id": "gem:village", "city": "Ehrwald", "lat": 47.40, "lon": 11.00, "categories": ["alps"]},
        "gem:isola": {"id": "gem:isola", "city": "Isola", "lat": 40.06, "lon": 15.03, "categories": ["island"]},
        "gem:mixed": {"id": "gem:mixed", "city": "Mixed", "lat": 43.01, "lon": 16.01, "categories": ["island"]},
        "gem:rifugio": {"id": "gem:rifugio", "city": "Rifugio Alto", "lat": 46.501, "lon": 11.801, "categories": ["mountains"]},
        "gem:far": {"id": "gem:far", "city": "Far", "lat": 50.0, "lon": 5.0, "categories": ["town"]},
        "BRU": {"id": "BRU", "tier": "airport", "lat": 47.41, "lon": 11.03},
    }


def test_join_on_fixtures():
    rows = hs.join(_dests(), json.loads(FIX.read_text(encoding="utf-8")))
    # A hut and a lift near a village are listed, the village stays open.
    v = rows["gem:village"]
    assert "open" not in v
    assert [i["k"] for i in v["items"]] == ["lift", "hut"]
    # An island whose only ferry is seasonal closes with it.
    assert rows["gem:isola"]["open"] == [5, 6, 7, 8, 9]
    assert rows["gem:isola"]["why"] == "ferry" and rows["gem:isola"]["conf"] == "medium"
    # One year-round ferry keeps the island open.
    assert "open" not in rows["gem:mixed"]
    # The place that is the hut takes its months, at its (low) confidence.
    assert rows["gem:rifugio"]["open"] == [6, 7, 8, 9] and rows["gem:rifugio"]["why"] == "own"
    assert rows["gem:rifugio"]["conf"] == "low"
    assert "gem:far" not in rows and "BRU" not in rows


def test_apply_stamps_and_clears():
    dests = _dests()
    dests["gem:far"]["season"] = {"open": [7], "_src": "osm_seasons", "_asof": "2026-01-01"}
    rows = hs.join(dests, json.loads(FIX.read_text(encoding="utf-8")))
    n = hs.apply(dests, rows, "2026-11-07")
    assert n == 4
    assert dests["gem:isola"]["season"]["_src"] == "osm_seasons"
    assert dests["gem:isola"]["season"]["_asof"] == "2026-11-07"
    assert "season" not in dests["gem:far"]


def test_cli_dry_run(tmp_path, capsys):
    wire = tmp_path / "w.json"
    wire.write_text(json.dumps({"meta": {}, "destinations": _dests()}), encoding="utf-8")
    assert hs.main(["--facilities", str(FIX), "--master", str(wire), "--dry-run"]) == 0
    out = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert out["with_open"] == 2 and out["by_why"] == {"ferry": 1, "own": 1}
