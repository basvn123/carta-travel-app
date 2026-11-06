"""T1097: the sea_temp chain end to end on a recorded ERDDAP response.
Run: python -m pytest tests/test_sea_temp_fixture.py

tests/fixtures/erddap/<lat>_<lon>.csv hold ERDDAP griddap .csv bodies (name
row, unit row, time,latitude,longitude,sst) for two 1 degree tiles. The test
harvests three beach points and one destination from them, then follows the
rows through the beach export (v2_fields) and apply_climate.extras.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))
import harvest_sea_temp as hs  # noqa: E402
import explore_overlay as ov  # noqa: E402

FX = ROOT / "tests" / "fixtures" / "erddap"
POINTS = [("b-naples", 40.63, 14.48), ("b-ancona", 43.60, 13.56), ("b-inland", 48.0, 2.0)]


def _serve(calls):
    def get(url):
        calls.append(url)
        m = re.search(r"\(([-\d.]+)\):3:\([-\d.]+\)%5D%5B\(([-\d.]+)\):3:", url)
        f = FX / f"{int(float(m.group(1)))}_{int(float(m.group(2)))}.csv"
        return f.read_text(encoding="utf-8") if f.exists() else ""
    return get


def _reset():
    hs.FAILED_TILES.clear()
    hs.SKIPPED_BY_DEADLINE.clear()
    hs.DEADLINE = None


def test_harvest_from_recorded_response_is_resumable(tmp_path, monkeypatch):
    _reset()
    calls = []
    monkeypatch.setattr(hs, "http_get", _serve(calls))
    rows = hs.run(POINTS, tmp_path, hs.BEACH_MAX_KM, "beaches")
    assert set(rows) == {"b-naples", "b-ancona"}      # the inland point has no water cell
    c = rows["b-naples"]["c"]
    assert len(c) == 12 and all(0 < v < 32 for v in c)
    assert c.index(max(c)) == 7 and c.index(min(c)) == 1   # August warmest, February coldest
    assert rows["b-naples"]["km"] < 3 and rows["b-ancona"]["c"][7] < c[7]
    first = len(calls)
    assert first > 0 and (tmp_path / "sea_temp" / "40_14.json").exists()
    # a second run reads the tile cache only: no network call at all
    again = hs.run(POINTS, tmp_path, hs.BEACH_MAX_KM, "beaches")
    assert again == rows and len(calls) == first


def test_polite_pace_between_calls(monkeypatch):
    sleeps = []
    monkeypatch.setattr(hs.time, "sleep", lambda s: sleeps.append(s))
    monkeypatch.setattr(hs, "DELAY_S", 2.0)
    hs._LAST_CALL[0] = hs.time.monotonic()
    monkeypatch.setattr(hs.urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(OSError("x")))
    try:
        hs.http_get("https://example.invalid/")
    except OSError:
        pass
    assert sleeps and 0 < sleeps[0] <= 2.0


def test_rows_reach_the_beach_wire_and_the_climate_fold(tmp_path, monkeypatch):
    _reset()
    monkeypatch.setattr(hs, "http_get", _serve([]))
    meta = {"source": hs.SOURCE}
    ov.save("sea_temp_beaches", hs.run(POINTS, tmp_path, hs.BEACH_MAX_KM, "beaches"), meta, tmp_path)
    ov.save("sea_temp_dest", hs.run([("naples", 40.84, 14.25), ("n2", 40.63, 14.48)],
                                    tmp_path, hs.DEST_MAX_KM, "dest"), meta, tmp_path)
    import export_beaches as eb
    import apply_climate as ac
    beach = {"iso2": "IT", "name": "Test Bay", "wd": "Q1", "lat": 40.63, "lon": 14.48}
    key = eb.bi.unique_beach_id(beach)
    rows = json.loads((tmp_path / "sea_temp_beaches.json").read_text())["rows"]
    monkeypatch.setitem(eb.xov._MEMO, "sea_temp_beaches", {key: rows["b-naples"]})
    out = eb.v2_fields(beach)
    assert out["sea_temp"] == rows["b-naples"]["c"] and "sst" not in out
    # apply_climate reads the wrapped overlay file
    monkeypatch.setattr(ac, "SEA", tmp_path / "sea_temp_dest.json")
    monkeypatch.setattr(ac, "RAW", tmp_path / "none.json")
    monkeypatch.setattr(ac, "_RAW", None)
    monkeypatch.setattr(ac, "_SEA", None)
    got = ac.extras({"lat": 40.6}, "n2", {})
    assert got["water_c"] == rows["b-naples"]["c"]
