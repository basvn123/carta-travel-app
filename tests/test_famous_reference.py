"""D23/D24 famous coverage: the committed famous references.

Every kind has a reference with sources on every row, and every canary
(data/famous/canaries.json) is in it unless it is a known miss with a
reason. A new miss means a class, a cut or a source broke."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "famous"))

import build_reference as br  # noqa: E402

KINDS = ["trails", "cycling", "beaches", "lakes", "mountains"]
CANARIES = json.loads((ROOT / "data" / "famous" / "canaries.json")
                      .read_text(encoding="utf-8"))


def load(kind):
    return json.loads((ROOT / "data" / "famous" / f"{kind}.json")
                      .read_text(encoding="utf-8"))


@pytest.mark.parametrize("kind", KINDS)
def test_reference_shape(kind):
    doc = load(kind)
    assert doc["schema"] == "carta-famous/1"
    assert doc["counts"]["A"] > 0
    for r in doc["rows"]:
        assert r["tier"] in ("A", "B")
        assert r["sources"], r["id"]
        assert set(r["sources"]) <= set(doc["sources"]), r["id"]
        assert r["id"].startswith(("wd:", "ref:"))


@pytest.mark.parametrize("kind", KINDS)
def test_canaries(kind):
    miss = br.canary_misses(kind, load(kind)["rows"], CANARIES)
    known = CANARIES["known_misses"].get(kind, {})
    assert sorted(set(miss) - set(known)) == []


def test_known_misses_still_missing():
    # A known miss that is now found should leave the list.
    for kind, known in CANARIES["known_misses"].items():
        miss = set(br.canary_misses(kind, load(kind)["rows"], CANARIES))
        assert set(known) <= miss, (kind, set(known) - miss)
