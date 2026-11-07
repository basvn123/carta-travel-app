"""Open dataset licence gate (T1176, ROADMAP K8)."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "open_data"))

import export_open_dataset as eod

SOURCES = eod.load_sources()


def test_every_exported_field_licence_is_open():
    assert eod.check_policy(SOURCES) == []


@pytest.mark.parametrize("name", list(eod.FIELDS))
def test_field_licence(name):
    src = eod.FIELDS[name][0]
    assert eod.effective_licences(src, SOURCES) <= eod.OPEN_LICENCES, name
    assert src in eod.ATTRIBUTION, f"{name}: no attribution text for {src}"


def test_non_open_field_is_rejected():
    bad = dict(eod.FIELDS)
    bad["x_wiki"] = ("wikipedia", "x", lambda r: 1)
    bad["x_osm"] = ("osm", "x", lambda r: 1)
    bad["x_derived"] = ("carta_rating", "x", lambda r: 1)  # inherits CC-BY-SA
    bad["x_unknown"] = ("no_such_source", "x", lambda r: 1)
    problems = eod.check_policy(SOURCES, bad)
    assert len(problems) == 4


def test_allowlist_excludes_share_alike_and_odbl():
    assert not {"ODbL-1.0", "CC-BY-SA-4.0", "LicenseRef-numbeo-terms", "LicenseRef-site-terms"} & eod.OPEN_LICENCES


def test_build_rows_and_outputs(tmp_path):
    wire = {"destinations": {"AAA": {
        "id": "AAA", "tier": "airport", "iso2": "BE", "city": "X", "lat": 50.1234, "lon": 4.9876,
        "geonames": {"population": 5, "settlement": "city"},
        "crowding": {"nights_per_km2": 9, "tier": 2, "nuts3": "BE1", "year": 2024},
        "climate": {"m": [[1.0, 0, 50, 10]] * 12},
        "rating": {"score": 9}, "costs": {"meal_mid_eur": 12}}}}
    rows = eod.build_rows(wire)
    assert rows[0]["lat"] == 50.12 and rows[0]["tmax_c_dec"] == 1.0 and rows[0]["rain_mm_jan"] == 50
    assert rows[0]["bathing_rating"] is None
    eod.write_outputs(rows, SOURCES, tmp_path)
    assert set(rows[0]) == set(eod.FIELDS)
    assert "rating" not in (tmp_path / "destinations.csv").read_text().splitlines()[0].split(",")
    assert "meal_mid_eur" not in (tmp_path / "destinations.json").read_text()
    assert sum(1 for ln in (tmp_path / "ATTRIBUTION.txt").read_text().splitlines() if ln.startswith("- ")) == len({v[0] for v in eod.FIELDS.values()})


def test_datasheet_is_current():
    assert eod.main(["--datasheet", "--check"]) == 0


def test_no_dashes_in_datasheet():
    t = eod.render_datasheet(SOURCES)
    assert chr(0x2014) not in t and chr(0x2013) not in t
