"""D20 (T1200): pipeline/heat_fire.py on fixtures."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import heat_fire as h

# Seville-like [high, low, rain, comfort]
ROWS = [[16, 6, 60, 50], [18, 7, 55, 55], [21, 9, 50, 70], [23, 11, 50, 78], [27, 14, 30, 84],
        [32, 18, 10, 70], [36, 20, 2, 40], [36, 20, 5, 40], [31, 17, 25, 65], [26, 13, 70, 75],
        [20, 9, 80, 55], [17, 7, 70, 50]]


def test_heat_months():
    assert h.heat_months(ROWS) == [7, 8]
    assert h.heat_months(ROWS, 40) == []


def test_fire_proxy_and_fwi():
    assert h.fire_months(ROWS) == ([6, 7, 8, 9], "dryheat")
    fwi = [1, 1, 2, 5, 12, 22, 30, 28, 14, 6, 2, 1]
    assert h.fire_months(ROWS, fwi) == ([6, 7, 8], "fwi")


def test_annotate_keeps_best_and_src():
    c = {"m": ROWS, "best": [3, 4, 5], "_src": "climate", "_asof": "2026-06-07"}
    assert h.annotate(c, asof="2026-11-07")
    assert c["best"] == [3, 4, 5] and c["_src"] == "climate" and c["_asof"] == "2026-06-07"
    assert c["risk"] == {"src": "climate", "fire_basis": "dryheat", "asof": "2026-11-07"}
    assert not h.annotate({"m": []})


def master_block():
    """The master's shape (app_data.box-2026-11-10): climate.months dicts, no `m`."""
    return {"source": "NASA POWER (MERRA-2), 2001-2020 climatology, lapse-corrected",
            "period": "2001-2020",
            "months": [{"t_high": hi, "t_low": lo, "t_mean": (hi + lo) / 2, "precip_mm": mm, "comfort": c}
                       for hi, lo, mm, c in ROWS],
            "summary": {"best_months": [3, 4, 5], "peak_comfort": 84}, "sun_h": [100] * 12,
            "_src": "climate", "_asof": "2026-11-08"}


def test_annotate_reads_the_master_shape():
    # D20 (wave 1, V-8): the box runs this task on the master, which has no
    # `m`; the months must still come out.
    c = master_block()
    assert h._rows(c) == ROWS
    assert h.annotate(c, asof="2026-11-19")
    assert c["heat"] == [7, 8] and c["fire"] == [6, 7, 8, 9]
    assert c["months"][0]["t_high"] == 16 and "m" not in c       # master shape untouched
    assert not h.annotate({"months": [{"t_high": 1}] * 11})


def test_patch_on_a_master_file(tmp_path):
    p = tmp_path / "app_data.json"
    import json
    p.write_text(json.dumps({"destinations": {"SVQ": {"climate": master_block()}, "X": {}}}), encoding="utf-8")
    h.patch(p)
    c = json.loads(p.read_text(encoding="utf-8"))["destinations"]["SVQ"]["climate"]
    assert c["heat"] == [7, 8] and c["risk"]["fire_basis"] == "dryheat"
