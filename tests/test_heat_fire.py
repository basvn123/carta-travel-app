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
