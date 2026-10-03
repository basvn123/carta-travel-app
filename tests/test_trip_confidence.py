"""T146: every numeric figure carries a confidence (spec K3).

Runs from the repo root:

    python -m pytest tests/test_trip_confidence.py -q

The stub answers come from generate_trip.fixture_bodies(); these tests change
pass three's evidence rows and read what the generator wrote.
"""

import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "Trips" / "carta-unified" / "carta-unified"
sys.path.insert(0, str(DATASET / "pipeline"))

import generate_trip as T  # noqa: E402
import generation_gate as G  # noqa: E402


@pytest.fixture(scope="module")
def example():
    with open(G.EXAMPLE_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def _frag(body):
    frag, err = T.parse_json(T.response_text(body))
    assert err is None
    return frag


def _with_text(body, frag):
    out = copy.deepcopy(body)
    out["candidates"][0]["content"]["parts"][0]["text"] = json.dumps(frag)
    return out


def _run(tmp_path, bodies, example):
    res = T.generate(T.FIXTURE_BRIEF, T.StubClient(bodies), str(tmp_path),
                     today=example["provenance"]["ingestedAt"])
    rec = json.loads(Path(res["path"]).read_text(encoding="utf-8")) if res["path"] else None
    return res, rec


def _estimate(bodies, *paths):
    """Pass three's answer with url null on the named evidence rows."""
    frag = _frag(bodies["pass3"])
    for row in frag["evidence"]:
        if row["path"] in paths:
            row["url"] = None
            row["basis"] = "general knowledge of what a week of meals costs here"
    bodies["pass3"] = _with_text(bodies["pass3"], frag)
    return bodies


def test_every_figure_has_exactly_one_row(tmp_path, example):
    res, rec = _run(tmp_path, T.fixture_bodies(example), example)
    assert res["ok"], res["errors"]
    paths = [f["path"] for f in rec["figures"]]
    assert len(paths) == len(set(paths)) == len(G.figure_paths(rec))
    assert set(paths) == set(G.figure_paths(rec))
    conf = {f["path"]: f["confidence"] for f in rec["figures"]}
    assert conf["budget.totalEur"] == conf["budget.perDayEur"] == "derived"
    assert conf["itinerary[4].dayStats.ascentM"] == "sourced"
    assert all(f["sourceUrl"] for f in rec["figures"] if f["confidence"] == "sourced")
    assert all(f["sourceUrl"] is None for f in rec["figures"] if f["confidence"] != "sourced")


def test_an_estimated_food_budget_is_kept_and_makes_the_total_an_estimate(tmp_path, example):
    res, rec = _run(tmp_path, _estimate(T.fixture_bodies(example), "budget.breakdown.food"), example)
    assert res["ok"], res["errors"]
    conf = {f["path"]: f["confidence"] for f in rec["figures"]}
    assert conf["budget.breakdown.food"] == "estimated"
    assert conf["budget.totalEur"] == conf["budget.perDayEur"] == "estimated"
    assert conf["budget.breakdown.transport"] == "sourced"
    assert rec["budget"]["breakdown"]["food"]["lowEur"] is not None
    assert not any("food" in f for f in rec["verifyFlags"])


def test_an_estimated_hotel_price_is_withheld_not_admitted_as_an_estimate(tmp_path, example):
    bodies = _estimate(T.fixture_bodies(example), "accommodationStrategy[1].priceEur")
    res, _ = _run(tmp_path, bodies, example)
    # The price is withheld (nulled and flagged), never kept as an estimate.
    # The trip is then rejected for a different, older reason: priceUnit stays
    # behind without its price (register row T146-b).
    assert not res["ok"]
    assert not any("estimated" in e for e in res["errors"])
    rejected = sorted((tmp_path / "rejected").glob("*.json"))
    rec = json.loads([p for p in rejected if not p.name.endswith((".evidence.json", ".critique.json"))][0].read_text(encoding="utf-8"))
    assert rec["accommodationStrategy"][1]["priceEur"] is None
    assert any("accommodationStrategy[1].priceEur: an estimate is not allowed" in f for f in rec["verifyFlags"])


def test_an_estimated_required_budget_row_that_is_not_food_fails_the_trip(tmp_path, example):
    res, _ = _run(tmp_path, _estimate(T.fixture_bodies(example), "budget.breakdown.activities"), example)
    assert not res["ok"]
    assert any("budget.breakdown.activities: an estimate is not allowed" in e for e in res["errors"])


def test_the_critic_never_sees_the_confidence_rows(example):
    assert "figures" in T.CRITIC_HIDDEN
    assert "figures" not in T.critic_view(example)


def test_the_gate_rejects_a_missing_or_wrong_row(example):
    bad = copy.deepcopy(example)
    bad["figures"] = [f for f in bad["figures"] if f["path"] != "eurRate"]
    assert not G.figure_errors(bad)          # eurRate is null in the example: no row is right
    bad["figures"].pop(0)
    assert any(e.startswith("figure-unlabelled") for e in G.figure_errors(bad))
