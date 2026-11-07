"""The taxonomy tagger (T1150, ROADMAP F1 part 2): passages, candidates, scores, verifier, thresholds.

Runs on a small fixture catalogue in tmp_path plus the 15 seed items of the
shipped data; no model is called (the verifier and the bi-encoder are fakes).
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "taxonomy"))
sys.path.insert(0, str(ROOT / "pipeline"))

import tagger as tg
import taxonomy as tax

import run_pipeline as rp


@pytest.fixture()
def corpus(tmp_path):
    pub = tmp_path / "public"
    (pub / "dossier").mkdir(parents=True)
    (pub / "trails").mkdir()
    for d in ("beaches", "lakes", "mountains"):
        (pub / d).mkdir()
    app = {"destinations": {
        "fx:lakeside": {"id": "fx:lakeside", "city": "Seedorf", "iso2": "AT",
                        "blurb": "A quiet lakeside village below a glacier.",
                        "guide": {"text": "Seedorf has a medieval castle. Boat trips cross the lake in summer."},
                        "activities": {"items": [{"name": "St. Anna", "kind": "Church"}]},
                        "place": {"class": "village"}},
    }}
    (pub / "app_data.json").write_text(json.dumps(app), encoding="utf-8")
    (pub / "dossier" / "gem-x.json").write_text("{}", encoding="utf-8")
    trails = {"trips": [{"id": 7, "name": "Waterfall loop", "category": "easy",
                         "summary": "A short walk through the forest to a waterfall.",
                         "f": {"hl": ["waterfall", "viewpoint"]}}]}
    (pub / "trails" / "AT.json").write_text(json.dumps(trails), encoding="utf-8")
    return tg.Corpus(pub)


def by_tag(tags):
    return {t["tag"]: t for t in tags}


def test_items_and_passages(corpus):
    items = list(corpus.items())
    assert [(i["layer"], i["item_id"]) for i in items] == [("place", "fx:lakeside"), ("trail", "7")]
    ps = corpus.passages(items[0])
    assert {p["field"] for p in ps} == {"lead", "body", "list"}
    assert ps[0] == {"field": "lead", "src": "blurb", "text": "A quiet lakeside village below a glacier."}
    tp = corpus.passages(items[1])
    assert [p["src"] for p in tp] == ["name", "summary", "highlights", "highlights"]


def test_tags_carry_evidence_and_uses(corpus):
    it = next(corpus.items(("place",)))
    tags = tg.tag_item(it, corpus.passages(it))
    t = by_tag(tags)
    assert "set.glacier" in t and "phrase" in t["set.glacier"]["by"]
    ev = t["set.glacier"]["evidence"][0]
    assert ev["src"] == "blurb" and "glacier" in ev["text"]
    assert t["set.glacier"]["score"] >= tg.USES["profile"]
    assert t["set.glacier"]["uses"] == [u for u, th in tg.USES.items() if t["set.glacier"]["score"] >= th]
    assert [x["score"] for x in tags] == sorted((x["score"] for x in tags), reverse=True)
    assert len([x for x in tags if "rule" not in x["by"]]) <= tg.CANDIDATES


def test_list_hits_stay_under_the_profile_threshold(corpus):
    """A church in the sight list is not enough to call the place a church town."""
    it = next(corpus.items(("place",)))
    t = by_tag(tg.tag_item(it, corpus.passages(it)))
    assert t["set.church"]["score"] < tg.USES["profile"]


def test_ambiguous_words_are_not_evidence():
    ps = [{"field": "lead", "src": "blurb", "text": "Come and see the bad weather at the top."}]
    hits = tg.phrase_hits(ps, set(tg.node_table()))
    assert not hits


def test_only_nodes_for_the_layer(corpus):
    it = next(corpus.items(("trail",)))
    allowed = set(tg.eligible("trail"))
    for t in tg.tag_item(it, corpus.passages(it)):
        assert t["tag"] in allowed


def test_ancestors_are_implied():
    tags = tg.finish([{"tag": "set.lakeside-town", "score": 0.9, "by": ["phrase"], "evidence": []},
                      {"tag": "set.lake", "score": 0.7, "by": ["phrase"], "evidence": []}])
    assert by_tag(tags)["set.lake"]["implied"] is True
    assert by_tag(tags)["set.lakeside-town"]["implied"] is False


class FakeGateway:
    provider = "fake"
    tokens_in = tokens_out = 0

    def __init__(self, answer):
        self.answer = answer
        self.calls = []

    def call(self, user, **kw):
        self.calls.append((user, kw))

        class R:
            text = json.dumps(self.answer)
            model = "fake-1"
        return R()


def test_verifier_needs_a_found_quote(corpus):
    it = next(corpus.items(("place",)))
    ps = corpus.passages(it)
    tags = [{"tag": "set.castle", "score": 0.5, "by": ["phrase"], "evidence": []},
            {"tag": "act.boat-trips", "score": 0.5, "by": ["bm25"], "evidence": []},
            {"tag": "set.church", "score": 0.4, "by": ["phrase"], "evidence": []},
            {"tag": "set.glacier", "score": 0.9, "by": ["phrase"], "evidence": []}]
    gw = FakeGateway({"tags": [
        {"id": "set.castle", "holds": True, "evidence": "a medieval castle"},
        {"id": "act.boat-trips", "holds": True, "evidence": "invented words"},
        {"id": "set.church", "holds": False, "evidence": ""},
    ]})
    v = tg.verify(it, ps, tags, gw)
    t = by_tag(tags)
    assert v["asked"] == 3, "the 0.9 tag is over the band and not asked"
    assert t["set.castle"]["score"] == tg.VERIFY_YES
    assert t["set.castle"]["evidence"][0] == {"src": "verifier", "text": "a medieval castle"}
    assert t["act.boat-trips"]["score"] == 0.5, "a quote not in the passages changes nothing"
    assert t["set.church"]["score"] == round(0.4 * tg.VERIFY_NO, 4)
    user, kw = gw.calls[0]
    assert kw["json"] is True and kw["screen"], "passages are screened by the gateway"
    assert "glacier" in user and "set.glacier" not in user


def test_dense_hook_with_a_fake_embedder(corpus):
    import numpy as np
    vocab = ["glacier", "castle", "lake", "waterfall"]

    def emb(texts):
        return [np.array([1.0 + (w in t.lower()) * 5 for w in vocab]) for t in texts]
    rank = tg.make_dense(embedder=emb)
    it = next(corpus.items(("place",)))
    got = rank(it, corpus.passages(it), set(tg.eligible("place")))
    assert got and len(got) <= tg.CANDIDATES
    assert all(g in tg.eligible("place") for g in got)


def test_eval_predictions_file(corpus):
    res = tg.run(list(corpus.items()), corpus, log=None)
    assert res["stats"]["items"] == 2 and res["method"]["verifier"] == "off"
    pred = tg.predictions(res, "t")
    assert pred["threshold"] == tg.USES[tg.EVAL_USE]
    assert set(pred["items"]) == {"fx:lakeside", "7"}
    assert all(set(x) == {"tag", "score"} for v in pred["items"].values() for x in v)


def test_mapped_tags_read_the_corpus_data_root(corpus, monkeypatch):
    """T1154-d: today's tags come from the same data root as the passages, not always the repo's."""
    pairs = tax.old_tags("trail", "7", "AT", corpus.public)
    assert ("trail.highlights", "waterfall") in pairs and ("trail.category", "easy") in pairs
    res = tg.run(list(corpus.items(("trail",))), corpus, log=None)
    t = by_tag(res["items"]["trail:7"]["tags"])
    assert "mapped" in t["set.waterfall"]["by"]
    monkeypatch.setenv("CARTA_PUBLIC", str(corpus.public))
    assert tax.default_public() == corpus.public
    assert tax.old_tags("trail", "7", "AT") == pairs, "no root given: CARTA_PUBLIC"
    monkeypatch.delenv("CARTA_PUBLIC")
    assert tax.default_public() == ROOT / "continent-app" / "public"


def test_seed_items_from_the_shipped_data():
    items = tg.eval_items("seed")
    assert len(items) == 15
    res = tg.run(items, tg.Corpus(), log=None)
    assert res["stats"]["no_passages"] == 0
    known = set(tax.nodes())
    for row in res["items"].values():
        assert all(t["tag"] in known for t in row["tags"])
        assert all(t["evidence"] for t in row["tags"] if t["score"] >= tg.USES["search"]), row["id"]


def test_batch_task_is_registered():
    t = next(x for x in rp.TASKS if x["key"] == "taxonomy_tags")
    assert t["writes_wire"] is False and t["writes_app_data"] is False
    assert t["cmds"][0][1] == "pipeline/taxonomy/tagger.py" and "--verify" not in t["cmds"][0]
