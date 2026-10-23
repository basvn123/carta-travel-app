"""Food and flight route gates (T645).

Run:  python -m pytest tests/test_price_gates.py -q
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "flights"))

import apply_food_prices as F  # noqa: E402
import build_routes as R  # noqa: E402


def block(meal):
    return {i: meal for i in F.ITEMS}


def test_food_basket_jump_is_blocked_unless_explained():
    dests = {f"P{i}": {"iso2": "PT", "costs": block(10)} for i in range(3)}
    same = {k: block(11) for k in dests}
    triple = {k: block(30) for k in dests}
    assert F.food_gate(dests, same) == []
    assert F.food_gate(dests, triple)[0].startswith("food PT")
    explain = [{"key": "food:PT", "new": 30 * len(F.ITEMS), "reason": "test"}]
    assert F.food_gate(dests, triple, explain) == []


def test_route_list_that_loses_routes_is_blocked():
    prev = {"BRU": {f"X{i}": 1 for i in range(20)}, "CRL": {"BCN": 1}}
    assert R.route_gate(prev, prev) == []
    assert R.route_gate(None, {}) == []
    lost_hub = {"CRL": {"BCN": 1}}
    fails = R.route_gate(prev, lost_hub)
    assert any("fell" in f for f in fails) and any(f.startswith("BRU") for f in fails)
