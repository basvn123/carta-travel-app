"""pipeline/promote_place_candidates.py: the "district of a shipped city" gate (T1214, register row T1146-b).

norm_city(None) is "" and a shipped city with no Latin form also folds to "",
so the old test skipped every candidate without a parent city.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import promote_place_candidates as promote

# Two shipped cities with no Latin form fold to "", as on the 2026-11-06 master.
SHIPPED = {promote.norm_city(c) for c in ("Lyon", "Gent", "Αργος", "Πλακα")}


def test_empty_key_is_in_the_shipped_set():
    assert "" in SHIPPED


def test_a_parentless_candidate_is_not_a_district():
    assert promote.shipped_parent({"name": "Saint-Cirq", "parent_city": None}, SHIPPED) is None
    assert promote.shipped_parent({"name": "Saint-Cirq"}, SHIPPED) is None
    assert promote.shipped_parent({"name": "Saint-Cirq", "parent_city": ""}, SHIPPED) is None


def test_a_district_of_a_shipped_city_is_still_caught():
    assert promote.shipped_parent({"name": "Croix-Rousse", "parent_city": "Lyon"}, SHIPPED) == "Lyon"
    assert promote.shipped_parent({"name": "Ledeberg", "parent_city": "Gent"}, SHIPPED) == "Gent"


def test_a_parent_that_is_not_shipped_passes():
    assert promote.shipped_parent({"name": "Vieux", "parent_city": "Caen"}, SHIPPED) is None
