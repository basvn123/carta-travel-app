"""Wave 3 minors (D7, D23, D-5, D-10, D-15, D-16): the day-out numbers in one
place, lake water never below 0 C, a 0.0 low is data, allYear beside winter."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))
sys.path.insert(0, str(ROOT / "pipeline" / "lakes"))
sys.path.insert(0, str(ROOT / "pipeline" / "cycling"))

import not_for  # noqa: E402
import rate  # noqa: E402
import attributes  # noqa: E402
import lake_index  # noqa: E402
import stage_planner  # noqa: E402


def row(**kw):
    base = {"distance_m": 12000, "ascent_m": 300, "descent_m": 300,
            "duration_min": 200, "grade": "moderate"}
    return {**base, **kw}


def test_day_out_edges_match_not_for():
    assert not_for.is_comfortable_day(799, 360, "hard")
    assert not not_for.is_comfortable_day(800, 200, "easy")       # 800 is "not for"
    assert not not_for.is_comfortable_day(300, 361, "easy")
    assert not not_for.is_comfortable_day(300, 200, "very_hard")  # grade over hard
    assert not_for.is_comfortable_day(300, None, None)            # unknown does not fail
    assert (rate.COMFORT_MAX_CLIMB_M, rate.COMFORT_MAX_MIN) == (
        not_for.CLIMB_M, not_for.MINUTES)


def test_day_out_reason_follows_the_band_and_the_grade():
    def codes(r):
        return {x["code"] for x in rate.reasons_for(r, {})}
    assert "dayOut" in codes(row())
    assert "dayOut" not in codes(row(distance_m=20000))           # long starts at 20 km
    assert "dayOut" not in codes(row(grade="very_hard"))
    assert "dayOut" not in codes(row(ascent_m=800, descent_m=800))


def test_lake_water_is_never_below_zero():
    lake = {"elev_m": 2000, "depth_m": 40,
            "climate": {"t_mean": [-12, -11, -8, -3, 1, 5, 8, 8, 4, -1, -7, -11]}}
    temps = lake_index.water_temp_estimate(lake)
    assert temps and min(temps) >= 0.0


def test_a_zero_low_is_data_not_missing(monkeypatch):
    months = [{"t_high": 15.0, "t_low": 0.0, "precip_mm": 40, "comfort": 6}
              for _ in range(12)]
    months[0] = {"t_high": 15.0, "t_low": None, "precip_mm": 40, "comfort": 6}
    monkeypatch.setattr(stage_planner, "RIDEABLE_T_LOW", 0.0)
    monkeypatch.setattr(stage_planner, "_climate_table",
                        lambda: [(50.0, 5.0, {"months": months})])
    got = stage_planner.season_for(50.0, 5.0)
    # January has no low (missing, not rideable); the eleven 0.0 lows are.
    assert got["months"] == list(range(2, 13))


def test_all_year_ships_beside_winter():
    wt = {"cover": {}}
    season = {"n": 12}
    sd = attributes.suitability_of({"way_tags": wt, "network": ""}, "easy", season)["derived"]
    assert "winter" in sd and "allYear" in sd
    none = attributes.suitability_of({"way_tags": wt}, "hard", season)["derived"]
    assert "winter" not in none and "allYear" not in none
    short = attributes.suitability_of({"way_tags": wt}, "easy", {"n": 6})["derived"]
    assert "allYear" not in short
