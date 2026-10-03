"""T152: the prose caps from spec D4 are enforced by the gate and the validator."""
import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.join(os.path.dirname(HERE), "Trips", "carta-unified", "carta-unified", "pipeline")
sys.path.insert(0, PIPE)

import generation_gate as G  # noqa: E402
import validate as V  # noqa: E402


def _example():
    with open(G.EXAMPLE_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def test_example_is_within_the_caps():
    assert G.word_cap_errors(_example()) == []
    assert G.check(_example()) == []


def test_gate_rejects_each_cap():
    for path, words in ((("summary",), G.SUMMARY_WORDS), (("itinerary", 2, "morning"), G.DAY_WORDS),
                        (("proTips", 1), G.TIP_WORDS)):
        rec = _example()
        node = rec
        for k in path[:-1]:
            node = node[k]
        node[path[-1]] = "word " * words          # exactly at the cap: admitted
        assert not any(e.startswith("word-cap") for e in G.check(rec))
        node[path[-1]] = "word " * (words + 1)    # one over: rejected
        assert any(e.startswith("word-cap") for e in G.check(rec)), path


def test_validator_severity_follows_provenance():
    rec = _example()
    rec["summary"] = "word " * (G.SUMMARY_WORDS + 1)
    legacy = copy.deepcopy(rec)
    legacy["provenance"]["sourceFormat"] = "md+yaml-frontmatter (one file per trip)"
    for trip, level in ((rec, "ERROR"), (legacy, "WARNING")):
        issues = V.validate({"trips": [trip]})
        assert [i.level for i in issues if i.code == "word-cap"] == [level]
