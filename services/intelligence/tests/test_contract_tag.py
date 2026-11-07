"""POST /tag: the F1 tagger behind the API, with the taxonomy eval as its contract.

1. Parity: the API's tags for the seed eval items equal tagger.tag_item's (called, not copied).
2. The eval: the API's predictions, scored by the one eval runner
   (continent-app/scripts/eval/run.mjs taxonomy), must pass and keep
   R-precision at 5 within TOLERANCE of T1150's 0.477 on the seed set.
"""
from __future__ import annotations

import json
import shutil
import subprocess

import pytest
from conftest import APP_EVAL, ROOT, H
from intelligence import engines as E

T1150_RP5 = 0.4767   # tagger on the seed set, T1150 report
TOLERANCE = 0.02


def api_tags(client, items, use="all"):
    body = {"items": [{"layer": i["layer"], "id": i["item_id"]} for i in items], "use": use}
    r = client.post("/tag", json=body, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def test_parity_with_the_tagger(client, seed_items):
    res = api_tags(client, seed_items)
    corpus = E.tagger.Corpus(ROOT / "continent-app" / "public")
    for it, got in zip(seed_items, res["results"]):
        want = E.tagger.tag_item(it, corpus.passages(it))
        assert got["found"] is True
        assert [(t["tag"], t["score"], t["uses"], t["implied"]) for t in got["tags"]] == \
               [(t["tag"], t["score"], t["uses"], t["implied"]) for t in want], it["item_id"]
    assert res["thresholds"] == E.USES
    assert res["taxonomy_version"] == E.tx.load()["version"]


@pytest.mark.skipif(not shutil.which("node"), reason="node runs the eval runner")
def test_taxonomy_eval_through_the_api(client, seed_items, tmp_path):
    res = api_tags(client, seed_items)
    preds = {"name": "T1154 intelligence API /tag", "threshold": E.USES[E.tagger.EVAL_USE], "cost_eur_per_1000": 0.0,
             "items": {it["item_id"]: [{"tag": t["tag"], "score": t["score"]} for t in r["tags"] if not t["implied"]]
                       for it, r in zip(seed_items, res["results"])}}
    f = tmp_path / "pred.json"
    f.write_text(json.dumps(preds), encoding="utf-8")
    out = subprocess.run(["node", str(APP_EVAL / "run.mjs"), "taxonomy", "--predictions", str(f), "--json"],
                         cwd=ROOT / "continent-app", capture_output=True, text=True, timeout=180, check=False)
    assert out.returncode == 0, out.stderr[-2000:]
    result = json.loads(out.stdout)[0]
    assert result["status"] == "pass"
    assert result["metrics"]["rp_at_5"] >= T1150_RP5 - TOLERANCE, result["metrics"]


def test_thresholds_select_by_use(client):
    r = client.post("/tag", json={"items": [{"layer": "place", "id": "FLR"}], "use": "filter"}, headers=H).json()
    tags = r["results"][0]["tags"]
    assert tags and all(t["score"] >= E.USES["filter"] for t in tags)
    assert all(t["evidence"] for t in tags if "rule" not in t["by"]), "every selected text tag carries evidence"
    r2 = client.post("/tag", json={"items": [{"layer": "place", "id": "FLR"}], "use": "search", "evidence": False},
                     headers=H).json()
    assert len(r2["results"][0]["tags"]) >= len(tags)
    assert all(t["evidence"] == [] for t in r2["results"][0]["tags"])


def test_free_text_and_unknown_ids(client):
    body = {"items": [
        {"layer": "place", "name": "Lakeside village", "text": "A quiet lakeside village under the Alps. Swimming in the lake in summer."},
        {"layer": "place", "id": "no-such-place"},
        {"layer": "trail", "id": "no-such-trail"},
    ], "use": "search"}
    r = client.post("/tag", json=body, headers=H).json()["results"]
    assert r[0]["found"] and any(t["tag"] == "set.lake" or t["tag"].startswith("set.lake") for t in r[0]["tags"]), r[0]
    assert r[1] == {"layer": "place", "id": "no-such-place", "name": None, "found": False, "n_passages": 0, "tags": []}
    assert r[2]["found"] is False


@pytest.mark.parametrize("body", [
    {"items": []},
    {"items": [{"layer": "place"}]},
    {"items": [{"layer": "place", "id": "FLR", "text": "both"}]},
    {"items": [{"layer": "city", "id": "FLR"}]},
    {"items": [{"layer": "place", "id": "FLR"}] * 101},
    {"items": [{"layer": "place", "id": "FLR"}], "use": "everything"},
    {"items": [{"layer": "place", "id": "FLR", "extra": 1}]},
    {"items": [{"layer": "place", "name": "x", "text": "y" * 20001}]},
])
def test_bad_requests_are_422(client, body):
    assert client.post("/tag", json=body, headers=H).status_code == 422
