"""GET /taxonomy: the F1 taxonomy as served equals the YAML."""
from __future__ import annotations

from conftest import H
from intelligence import engines as E


def test_whole_taxonomy(client):
    r = client.get("/taxonomy", headers=H).json()
    assert r["version"] == E.tx.load()["version"]
    assert r["count"] == len(E.tx.nodes()) == len(r["nodes"])
    assert set(r["facets"]) == {"activity", "setting", "vibe", "traveller", "practical"}
    ids = {n["id"] for n in r["nodes"]}
    assert all(n["parent"] in ids for n in r["nodes"] if n["parent"])


def test_facet_and_node(client):
    vibe = client.get("/taxonomy", params={"facet": "vibe"}, headers=H).json()
    assert vibe["count"] > 0 and all(n["facet"] == "vibe" for n in vibe["nodes"])
    n = client.get("/taxonomy/set.beach", headers=H).json()
    assert n["label"]["en"] and n["facet"] == "setting"
    assert client.get("/taxonomy/nope", headers=H).status_code == 404
