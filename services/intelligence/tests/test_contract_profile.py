"""POST /profile: the F3 taste profile behind the API, with evals/profile.json
(the F3 rules as cases on the real catalogue) as its contract."""
from __future__ import annotations

import json

import pytest
from conftest import EVALS, H

SET = json.loads((EVALS / "profile.json").read_text(encoding="utf-8"))
CASES = {c["id"]: c for c in SET["cases"]}


def ask(client, request):
    r = client.post("/profile", json={"now": SET["now"], **request}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize("case", SET["cases"], ids=[c["id"] for c in SET["cases"]])
def test_profile_case(client, case):
    got = ask(client, case["request"])
    x = case["expect"]
    shown = [c["node"] for c in got["shown"]]
    hidden = [c["node"] for c in got["hidden"]]
    for n in x.get("shown_has", []):
        assert n in shown, (case["rule"], shown)
    for n in x.get("shown_lacks", []):
        assert n not in shown, (case["rule"], shown)
    for n in x.get("hidden_has", []):
        assert n in hidden, (case["rule"], hidden)
    if "shown_count" in x:
        assert len(shown) == x["shown_count"], (case["rule"], shown)
    if "shown_max" in x:
        assert len(shown) <= x["shown_max"]
        if x["shown_max"] == 6:
            per = {}
            for c in got["shown"]:
                per[c["facet"]] = per.get(c["facet"], 0) + 1
            assert len(shown) == 6 or max(per.values()) <= 2, per
    if "shown_min_more_than" in x:
        other = ask(client, CASES[x["shown_min_more_than"]]["request"])
        assert len(shown) > len(other["shown"])
    if "item_count" in x:
        assert got["item_count"] == x["item_count"]
    for n, ev in x.get("evidence", {}).items():
        chip = next(c for c in got["shown"] if c["node"] == n)
        for k, v in ev.items():
            assert chip["evidence"][k] == v, (n, chip["evidence"])
    for n, name in x.get("first_name", {}).items():
        chip = next(c for c in got["shown"] if c["node"] == n)
        assert chip["evidence"]["names"][0] == name
    if "first" in x:
        assert shown[0] == x["first"] and got["shown"][0]["verdict"] == x["first_verdict"]
    for n, w in x.get("weights", {}).items():
        assert got["weights"].get(n) == w
    if x.get("snapshot_no_names"):
        s = json.dumps(got["snapshot"])
        assert "Nice" not in s and "Faro" not in s and got["snapshot"]["chips"]


def test_profile_rejects_bad_input(client):
    for body in ({"saves": [{"key": "k", "kind": "hotel", "id": "X"}]},
                 {"verdicts": {"set.beach": {"v": "maybe"}}},
                 {"saves": [{"key": "k", "kind": "dest", "id": "X"}] * 501},
                 {"secret": 1}):
        assert client.post("/profile", json=body, headers=H).status_code == 422
