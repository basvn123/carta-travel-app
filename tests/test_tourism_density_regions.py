"""pipeline/harvest_tourism_density.py: which NUTS 3 region a place gets (T1214, register row T1145-h).

A place takes a region of its own country when one contains it or lies within
NEAR_DEG; only a country with no NUTS region of its own (Andorra, Monaco, San
Marino) borrows its neighbour's, and that crowding block says it is a proxy.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

pytest.importorskip("shapely")
import harvest_tourism_density as h
from shapely.geometry import box


def region(code, x0, y0, x1, y1, tier=1):
    return {"code": code, "name": code, "geom": box(x0, y0, x1, y1), "density": 100.0,
            "tier": tier, "year": 2024}


# ES511 covers x 0..1; its generalised shape also swallows the enclave AD at x 0.4..0.5.
# FRJ21 covers x 1..2; DE111 lies far to the east.
REGIONS = [region("ES511", 0, 0, 1, 1, tier=1), region("FRJ21", 1, 0, 2, 1, tier=3),
           region("DE111", 10, 0, 11, 1)]


def run(dests):
    h.match_destinations(dests, REGIONS)
    return dests


def test_a_microstate_borrows_the_neighbour_and_says_so():
    d = run({"ad": {"iso2": "AD", "lat": 0.5, "lon": 0.45}})["ad"]["crowding"]
    assert d["nuts3"] == "ES511" and d["proxy"] is True and d["proxy_country"] == "ES"


def test_a_border_place_takes_its_own_country_within_reach():
    # A French place just over the generalised line inside ES511 takes FRJ21.
    d = run({"fr": {"iso2": "FR", "lat": 0.5, "lon": 0.97}})["fr"]["crowding"]
    assert d["nuts3"] == "FRJ21" and "proxy" not in d


def test_a_place_far_from_its_own_regions_gets_no_crowding():
    # A German place inside ES511 and far from any DE region: no borrowed value.
    assert "crowding" not in run({"de": {"iso2": "DE", "lat": 0.5, "lon": 0.5}})["de"]


def test_an_own_region_that_contains_the_point_is_not_a_proxy():
    d = run({"es": {"iso2": "ES", "lat": 0.5, "lon": 0.2}})["es"]["crowding"]
    assert d["nuts3"] == "ES511" and "proxy" not in d


def test_greece_and_the_uk_use_their_nuts_prefixes():
    assert h.nuts_prefix("GR") == "EL" and h.nuts_prefix("gb") == "UK" and h.nuts_prefix("ES") == "ES"
