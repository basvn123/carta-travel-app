"""Trips read the bed prices the master actually carries (T1099-a, D12).

On 2026-11-13 the box composed 0 trips: the trip model still read the v17
`accommodation.per_person_night_eur`, which apply_stays.py removed in favour of
`accommodation.beds`, so no place could be a base and the export emptied the
wire. These tests hold the beds reading and the export's shrink guard.

    python -m pytest tests/test_trip_beds.py -q
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trips"))

import trip_model as M  # noqa: E402
import export_trips as E  # noqa: E402

BEDS = {"dorm": 34, "private": 127, "hotel2": 149, "hotel3": 216, "hotel4": 233,
        "hotel5": 433, "bnb_home": {"2": 114, "4": 149}, "bnb_room": 93}


def dest(acc, cls="city", pop=150000):
    return {"accommodation": acc, "place_class": cls, "pop": pop}


def test_half_a_three_star_room():
    assert M.per_person_night(dest({"beds": BEDS, "q": "measured"})) == 108.0


def test_falls_back_through_the_room_tiers_then_a_dorm_bed():
    assert M.per_person_night(dest({"beds": {"private": 80, "dorm": 20}})) == 40.0
    assert M.per_person_night(dest({"beds": {"bnb_home": {"2": 90}}})) == 45.0
    assert M.per_person_night(dest({"beds": {"dorm": 22}})) == 22.0


def test_no_beds_is_no_price():
    assert M.per_person_night(dest({"beds": {}})) is None
    assert M.per_person_night(dest(None)) is None
    assert M.per_person_night(dest({"beds": {"hotel3": 0}})) is None


def test_the_old_field_still_wins_where_a_record_has_it():
    assert M.per_person_night(dest({"per_person_night_eur": 55, "beds": BEDS})) == 55.0


def test_a_place_with_only_beds_can_be_a_base():
    assert M.can_be_base(dest({"beds": BEDS, "q": "modelled"}))
    assert not M.can_be_base(dest({"beds": {}}))


def test_nightly_for_the_group():
    assert M.nightly_eur(dest({"beds": BEDS}), group=2) == 216.0
    assert M.nightly_eur(dest({"beds": {}})) is None


def test_export_refuses_to_empty_the_wire(tmp_path):
    (tmp_path / "index.json").write_text(json.dumps({"n_trips": 3984}), encoding="utf-8")
    assert E.shrink_refusal(0, tmp_path)
    assert E.shrink_refusal(1900, tmp_path)
    assert E.shrink_refusal(2000, tmp_path) is None
    assert E.shrink_refusal(4100, tmp_path) is None


def test_export_with_no_wire_yet_is_not_refused(tmp_path):
    assert E.shrink_refusal(0, tmp_path) is None
