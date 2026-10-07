"""T093: the three accuracy signals follow from the figures ledger (spec J4, J5, K3).

Runs from the repo root:

    python -m pytest tests/test_trip_accuracy.py -q

verifyFlagCount, volatilePricing and sources.verified are derived by
pipeline/accuracy.py from the record's `figures` (or, on a v2.0 record with no
ledger, from its own verify flags). The gate and validate.py reject a record
whose fields say otherwise.
"""

import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "Trips" / "carta-unified" / "carta-unified"
sys.path.insert(0, str(DATASET / "pipeline"))

import accuracy as A  # noqa: E402
import generation_gate as G  # noqa: E402
import validate as V  # noqa: E402

TODAY = "2026-10-07"


def row(path, conf, url=None, flag=None):
    r = {"path": path, "confidence": conf, "sourceUrl": url, "checkedAt": TODAY}
    if flag:
        r["flag"] = flag
    return r


@pytest.fixture(scope="module")
def example():
    with open(G.EXAMPLE_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def test_self_test_passes():
    assert A.self_test() == 0


def test_signals_count_estimates_and_flags_and_price_decides_volatility():
    rows = [row("budget.breakdown.food", "estimated"),
            row("budget.breakdown.accommodation", "sourced", "https://beds.example.net/a"),
            row("itinerary[2].dayStats.timeMin", "estimated"),
            row("itinerary[2].dayStats.ascentM", "sourced", "https://maps.example.org/d3",
                flag="Disputed itinerary[2].dayStats.ascentM, high terrain: the pass is higher")]
    s = A.signals(rows)
    assert s["verifyFlagCount"] == 3
    assert s["volatilePricing"] is True          # the food row is a price
    assert s["verified"] == ("2 of 4 figures confirmed against 2 pages read on 2026-10-07: "
                             "beds.example.net and maps.example.org.")
    no_price = [r for r in rows if r["path"] != "budget.breakdown.food"]
    assert A.signals(no_price)["volatilePricing"] is False
    assert A.signals([])["verified"] is None


def test_the_example_record_is_consistent_and_each_field_is_enforced(example):
    assert not A.inconsistencies(example)
    assert not G.check(example)
    for key, value, code in (("verifyFlagCount", 9, "accuracy-count"),
                             ("volatilePricing", True, "accuracy-volatile")):
        bad = copy.deepcopy(example)
        bad[key] = value
        assert any(e.startswith(code) for e in A.inconsistencies(bad))
        assert any(e.startswith(code) for e in G.check(bad))
    bad = copy.deepcopy(example)
    bad["sources"]["verified"] = "Everything was checked by hand."
    assert any(e.startswith("accuracy-verified") for e in G.check(bad))


def test_a_disputed_price_makes_the_pricing_volatile(example):
    rec = copy.deepcopy(example)
    for f in rec["figures"]:
        if f["path"] == "accommodationStrategy[0].priceEur":
            f["flag"] = "Disputed accommodationStrategy[0].priceEur, medium stale: the 2024 rate is quoted"
    A.apply(rec)
    assert rec["verifyFlagCount"] == 1 and rec["volatilePricing"] is True
    assert not G.check(rec)


def test_the_writer_is_not_asked_for_sources_verified():
    assert ("sources", "verified") in G.DERIVED
    assert "verified" not in G.model_schema()["properties"]["sources"].get("properties", {})


def test_a_v2_record_follows_its_own_flags_and_keeps_the_writers_account():
    old = {"verifyFlags": [], "verifyFlagCount": 0, "volatilePricing": True,
           "sources": {"verified": "Ferry fares checked on the operator's site.", "confidenceNotes": None}}
    assert [e.split(":")[0] for e in A.inconsistencies(old)] == ["accuracy-volatile"]
    A.apply(old)
    assert old["volatilePricing"] is False
    assert old["sources"]["verified"] == "Ferry fares checked on the operator's site."
    flagged = {"verifyFlags": ["Lift pass price"], "verifyFlagCount": 1, "volatilePricing": True,
               "sources": {"verified": None, "confidenceNotes": None}}
    assert not A.inconsistencies(flagged)


def test_the_published_catalogue_agrees_with_itself():
    with open(DATASET / "data" / "trips.master.json", encoding="utf-8") as fh:
        master = json.load(fh)
    bad = {t["id"]: A.inconsistencies(t) for t in master["trips"] if A.inconsistencies(t)}
    assert bad == {}
    assert len(master["trips"]) == 253


def test_validate_reports_the_contradiction_as_an_error(example):
    trip = copy.deepcopy(example)
    trip["volatilePricing"] = True
    codes = {(i.code, i.level) for i in V.validate({"trips": [trip]})}
    assert ("accuracy-signals", "ERROR") in codes
    trip["figures"] = [r for r in trip["figures"] if r["path"] != "budget.breakdown.food"]
    codes = {i.code for i in V.validate({"trips": [trip]})}
    assert "figure-ledger" in codes
