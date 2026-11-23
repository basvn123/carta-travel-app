"""F-21 (D18): the sea-temperature method text says what the harvest really reads."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))

import apply_climate  # noqa: E402
import harvest_sea_temp  # noqa: E402


def test_water_method_text_follows_the_harvest_constants():
    text = apply_climate.CLIMATE_MODEL["water_c_method"]
    assert f"{harvest_sea_temp.YEAR_FROM}-{harvest_sea_temp.YEAR_TO}" in text
    assert f"within {harvest_sea_temp.DEST_MAX_KM:g} km" in text
    assert "2003" not in text and "2017-2022" in text and "20 km" in text   # the values on 2026-11-23
