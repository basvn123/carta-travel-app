import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import harvest_uk_crowds as h

FIX = Path(__file__).parent / "fixtures"
CUTS = [100.0, 400.0, 1500.0]


def _load():
    nights = h.read_nights(FIX / "uk_crowds_nights.csv")
    geo = json.loads((FIX / "uk_itl1_boundaries.geojson").read_text())
    regions, countries = h.build_regions(nights, geo)
    return nights, regions, countries


def test_only_complete_years_count():
    nights, _, _ = _load()
    assert nights["TLK"]["years"] == [2022, 2023]          # 2024 has 6 months
    assert abs(sum(nights["TLK"]["share"]) - 1) < 1e-3


def test_places_get_region_and_monthly_shape():
    _, regions, countries = _load()
    dests = {
        "bath": {"iso2": "GB", "lat": 51.38, "lon": -2.36 - 1},   # inside TLK box
        "durham": {"iso2": "GB", "lat": 55.0, "lon": -1.5},
        "sea": {"iso2": "GB", "lat": 60, "lon": 0},
        "sarajevo": {"iso2": "BA", "lat": 43.85, "lon": 18.4},
        "has": {"iso2": "GB", "lat": 51.0, "lon": -3, "crowding": {"tier": 9}},
        "paris": {"iso2": "FR", "lat": 48.8, "lon": 2.3},
    }
    filled = h.apply(dests, regions, countries, CUTS)
    assert filled == {"TLK": 1, "TLC": 1, "BA": 1}
    c = dests["bath"]["crowding"]
    assert set(c) >= {"nights_per_km2", "tier", "label", "nuts3", "region", "year", "source", "monthly"}
    assert len(c["monthly"]["tier"]) == 12 and c["year"] == 2023
    assert c["monthly"]["tier"][6] > c["monthly"]["tier"][0]    # July above January
    assert len(set(dests["durham"]["crowding"]["monthly"]["tier"])) == 1   # flat place stays flat
    assert dests["has"]["crowding"] == {"tier": 9}              # Eurostat block kept
    assert "crowding" not in dests["sea"] and "crowding" not in dests["paris"]
    assert dests["sarajevo"]["crowding"]["source"] == h.SOURCE_NATIONAL
