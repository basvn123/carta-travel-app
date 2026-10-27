"""Gate 5 of rating v5 (T755): one ranked row per city.

Multi-airport cities used to rank once per airport (Rome as FCO and CIA,
Paris three times, London four times in one top 15). Since T755 the city's
primary airport row carries the rating and every other airport of the city
is a gateway: `gateway_of` names the city row and the gateway has no rating,
so it cannot enter a ranking. Flight search keeps reading the airport rows.

Runs under pytest, or standalone: python tests/test_one_row_per_city.py
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import beauty_layer  # noqa: E402

_MASTER = ROOT / "app_data" / "app_data.json"
_WIRE = ROOT / "continent-app" / "public" / "app_data.json"
INPUT = _MASTER if _MASTER.exists() else _WIRE


def _dests():
    return json.loads(INPUT.read_text(encoding="utf-8"))["destinations"]


def test_no_two_ranked_airport_rows_share_a_city():
    by_city = defaultdict(list)
    for did, d in _dests().items():
        if d.get("tier") == "airport" and d.get("rating"):
            by_city[(d.get("iso2"),
                     beauty_layer._base_city(d.get("city")))].append(did)
    shared = {k: v for k, v in by_city.items() if len(v) > 1}
    assert not shared, f"cities ranked more than once: {shared}"


def test_every_gateway_points_at_a_rated_city_row():
    dests = _dests()
    bad = []
    for did, d in dests.items():
        target = d.get("gateway_of")
        if not target:
            continue
        city = dests.get(target) or {}
        if d.get("rating") or not city.get("rating") or city.get("gateway_of"):
            bad.append(did)
        elif (beauty_layer._base_city(city.get("city"))
              != beauty_layer._base_city(d.get("city"))):
            bad.append(did)
    assert not bad, f"gateways with a rating or a bad city row: {bad}"


def test_every_destination_is_rated_or_a_gateway():
    missing = [did for did, d in _dests().items()
               if not d.get("rating") and not d.get("gateway_of")]
    assert not missing, f"neither rated nor a gateway: {missing[:10]}"


if __name__ == "__main__":
    test_no_two_ranked_airport_rows_share_a_city()
    test_every_gateway_points_at_a_rated_city_row()
    test_every_destination_is_rated_or_a_gateway()
    print("one row per city holds")
