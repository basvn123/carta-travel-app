"""POST /similar: TF-IDF cosine over the F1 tagger's tags.

Contract on the taxonomy eval's seed set (seed-gold.csv, 15 items with
labels): for each seed item, the API's nearest other seed item must share
more gold labels (Jaccard) than a random other seed item does on average.
The seed labels were written by a session (T1149), so this pins that the
similarity follows the labels; it does not measure quality (T1154-c).
"""
from __future__ import annotations

import csv
import itertools

from conftest import APP_EVAL, H

SEED = APP_EVAL / "taxonomy" / "seed-gold.csv"


def gold():
    with SEED.open(encoding="utf-8") as f:
        return {f"{r['layer']}:{r['item_id']}": set(filter(None, r["labels"].split(";"))) for r in csv.DictReader(f)}


def jac(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0


def similar_eval(client):
    g = gold()
    keys = sorted(g)
    top1 = []
    for k in keys:
        layer, iid = k.split(":", 1)
        r = client.post("/similar", json={"item": {"layer": layer, "id": iid}, "k": 1, "among": keys}, headers=H)
        assert r.status_code == 200, r.text
        nb = r.json()["neighbours"]
        top1.append(jac(g[k], g[nb[0]["key"]]) if nb else 0.0)
    rand = [jac(g[a], g[b]) for a, b in itertools.permutations(keys, 2)]
    return sum(top1) / len(top1), sum(rand) / len(rand)


def test_similar_follows_the_gold_labels(client):
    nearest, random_pair = similar_eval(client)
    assert nearest > random_pair, (nearest, random_pair)


def test_shape_and_filters(client):
    r = client.post("/similar", json={"item": {"layer": "place", "id": "FLR"}, "k": 5}, headers=H).json()
    assert r["found"] and r["index_items"] > 200
    nb = r["neighbours"]
    assert 0 < len(nb) <= 5 and all(n["key"] != "place:FLR" for n in nb)
    assert [n["score"] for n in nb] == sorted((n["score"] for n in nb), reverse=True)
    assert all(0 < n["score"] <= 1.0001 and 1 <= len(n["shared"]) <= 3 for n in nb)
    beaches = client.post("/similar", json={"tags": ["set.beach"], "k": 5, "layers": ["beach"]}, headers=H).json()
    assert beaches["neighbours"] and all(n["layer"] == "beach" for n in beaches["neighbours"])
    assert all("set.beach" in n["shared"] for n in beaches["neighbours"])


def test_item_outside_the_index_is_tagged_on_the_fly(client):
    r = client.post("/similar", json={"item": {"layer": "place", "id": "VIE"}, "k": 3}, headers=H).json()
    assert r["found"] and r["neighbours"]


def test_unknowns(client):
    r = client.post("/similar", json={"item": {"layer": "place", "id": "nowhere"}}, headers=H).json()
    assert r["found"] is False and r["neighbours"] == []
    assert client.post("/similar", json={"tags": ["not.a.node"]}, headers=H).status_code == 422
    assert client.post("/similar", json={}, headers=H).status_code == 422
    assert client.post("/similar", json={"tags": ["set.beach"], "item": {"layer": "place", "id": "FLR"}}, headers=H).status_code == 422
    assert client.post("/similar", json={"tags": ["set.beach"], "k": 51}, headers=H).status_code == 422
