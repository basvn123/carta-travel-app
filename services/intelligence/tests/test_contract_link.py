"""POST /link: the F4 linker behind the API, with the linking eval's 300
messy mentions (continent-app/scripts/eval/linking/set.json) as its contract.
MRR and accuracy@1 must stay within the eval's own tolerance of its blessed
baseline (baseline.json, "after")."""
from __future__ import annotations

import json

import pytest
from conftest import APP_EVAL, H

TOLERANCE = 0.02   # eval.mjs TOLERANCE


def rank_of(candidates, gold):
    g = set(gold)
    for i, c in enumerate(candidates):
        if g & set(c["members"]):
            return i + 1
    return None


def test_linking_eval_through_the_api(client):
    cases = json.loads((APP_EVAL / "linking" / "set.json").read_text(encoding="utf-8"))["cases"]
    base = json.loads((APP_EVAL / "linking" / "baseline.json").read_text(encoding="utf-8"))["after"]
    ranks = []
    for k in range(0, len(cases), 100):
        chunk = cases[k:k + 100]
        body = {"limit": 10, "mentions": [{"text": c["mention"], **({"ctx": c["ctx"]} if c.get("ctx") else {})} for c in chunk]}
        r = client.post("/link", json=body, headers=H)
        assert r.status_code == 200, r.text
        for c, res in zip(chunk, r.json()["results"]):
            assert res["text"] == c["mention"]
            ranks.append(rank_of(res["candidates"], c["gold"]))
    n = len(ranks)
    mrr = sum(1 / x for x in ranks if x) / n
    acc1 = sum(1 for x in ranks if x == 1) / n
    assert n == 300
    assert mrr >= base["mrr"] - TOLERANCE, mrr
    assert acc1 >= base["acc1"] - TOLERANCE, acc1


def test_confident_and_did_you_mean(client):
    r = client.post("/link", json={"mentions": [{"text": "Dubrovnk"}, {"text": "zzqx"}], "limit": 3}, headers=H).json()["results"]
    assert r[0]["confident"] and r[0]["linked"]["id"] == "DBV" and r[0]["did_you_mean"] == []
    assert len(r[0]["candidates"]) <= 3
    assert r[1]["confident"] is False and r[1]["linked"] is None


def test_context_moves_the_answer(client):
    r = client.post("/link", json={"mentions": [{"text": "Hotel Ibis Lisboa Centro", "ctx": {"country": "PT"}}]}, headers=H)
    assert r.json()["results"][0]["linked"]["id"] == "LIS"


@pytest.mark.parametrize("body", [
    {"mentions": []},
    {"mentions": [{"text": ""}]},
    {"mentions": [{"text": "x" * 301}]},
    {"mentions": [{"text": "porto", "ctx": {"country": "PRT"}}]},
    {"mentions": [{"text": "porto", "ctx": {"lat": 100}}]},
    {"mentions": [{"text": "porto"}], "limit": 11},
    {"mentions": [{"text": "porto"}] * 101},
])
def test_bad_requests_are_422(client, body):
    assert client.post("/link", json=body, headers=H).status_code == 422
