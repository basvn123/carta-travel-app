"""One climb and one difficulty, from source to screen (T286; rows T108-e, T108-f).

rate.py chose bigClimb and dayOut from the stored ascent and from distance
alone, and export_wire.py shipped validate.py's three-value `difficulty`
beside the published grade. The rows are the two Mount Korab routes as the
published wire carried them (continent-app/public/trails/AL.json, ids 63428
and 63433), the same fixtures tests/test_trail_data_bugs.py uses. Pure
functions only: no lab, no network.

Runs under pytest from the repo root:
    python -m pytest tests/test_trail_climb_consistency.py -q
"""

import os
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import export_wire  # noqa: E402
import rate  # noqa: E402

KORAB_9 = {
    "id": 63428, "country": "AL", "network": "lwn",
    "distance_m": 7941, "ascent_m": 7, "descent_m": 1423, "duration_min": 232,
    "elevation": {"ele_max_m": 2679.3},
}
KORAB_9_1 = {
    "id": 63433, "country": "AL", "network": "lwn",
    "distance_m": 12143, "ascent_m": 1568, "descent_m": 116,
    "duration_min": 419, "elevation": {"ele_max_m": 2728.8},
}


def codes(row):
    return {r["code"]: r for r in rate.reasons_for(row, {})}


def test_big_climb_reads_the_climb_uphill():
    why = codes(KORAB_9)
    assert why["bigClimb"]["m"] == 1423
    assert "steady" not in why
    assert codes(KORAB_9_1)["bigClimb"]["m"] == 1568


def test_steady_reads_the_climb_uphill():
    # 600 m over 8 km drawn downhill: 75 m per km, steady, not flat.
    row = {"distance_m": 8000, "ascent_m": 20, "descent_m": 600}
    assert codes(row)["steady"]["perKm"] == 75


def test_day_out_needs_a_comfortable_climb_and_time():
    assert "dayOut" not in codes(KORAB_9)      # 1,423 m read uphill
    assert "dayOut" not in codes(KORAB_9_1)    # 1,568 m and 7 h
    easy = {"distance_m": 9000, "ascent_m": 300, "descent_m": 300,
            "duration_min": 200}
    assert codes(easy)["dayOut"]["km"] == 9.0
    long_flat = {**easy, "distance_m": 21000, "duration_min": 380}
    assert "dayOut" not in codes(long_flat)
    unknown_time = {**easy, "duration_min": None}
    assert "dayOut" in codes(unknown_time)
    # Over the band is still a trek, untouched by the gate.
    assert codes({"distance_m": 60000, "ascent_m": 2000})["trek"]["km"] == 60


def test_comfort_numbers_match_the_app():
    # CARTA_APP_DIR points at an app worktree when the root checkout is a
    # sparse one without continent-app/. Skipped, never passed, without it.
    base = Path(os.environ.get("CARTA_APP_DIR") or ROOT / "continent-app")
    app = base / "src" / "lib" / "trailStory.js"
    if not app.exists():
        pytest.skip(f"no app tree at {base}")
    src = app.read_text(encoding="utf-8")
    climb = int(re.search(r"COMFORT_MAX_CLIMB_M = (\d+)", src).group(1))
    mins = int(re.search(r"COMFORT_MAX_MIN = (\d+)", src).group(1))
    assert (climb, mins) == (rate.COMFORT_MAX_CLIMB_M, rate.COMFORT_MAX_MIN)


def test_the_wire_ships_one_difficulty():
    assert export_wire.wire_difficulty(
        {"grade": "very_hard", "difficulty": "moderate"}) == "very_hard"
    # attributes.py has not reached the row: validate.py's class stands.
    assert export_wire.wire_difficulty(
        {"grade": None, "difficulty": "easy"}) == "easy"
    assert export_wire.wire_difficulty({}) is None
