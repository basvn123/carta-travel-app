"""T740: a far anchor airport of an island place gets no invented road option.
Run: python -m pytest tests/test_airport_access_island.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import airport_access as aa  # noqa: E402

PDL = {"iata": "PDL", "lat": 37.7412, "lon": -25.6979, "ryanair": True}
FLORES = {"lat": 39.45, "lon": -31.13, "local_transport": {"road_connected": False}}
MAINLAND = {"lat": 41.15, "lon": -8.61}
OPO = {"iata": "OPO", "lat": 41.2481, "lon": -8.6814, "ryanair": True}


def test_island_far_anchor_has_no_road_option():
    out = aa.airports_for(FLORES, [PDL], anchor_iata="PDL")
    assert len(out) == 1 and out[0]["iata"] == "PDL"
    assert out[0]["straight_km"] > aa.MAX_STRAIGHT_KM
    assert out[0]["options"] == []
    assert out[0]["transfer_min"] is None and out[0]["transfer_mode"] is None


def test_connected_place_keeps_the_road_estimate():
    out = aa.airports_for(MAINLAND, [OPO], anchor_iata="OPO")
    assert out[0]["options"][0]["mode"] == "car"
    assert out[0]["transfer_min"] == out[0]["options"][0]["minutes"]
