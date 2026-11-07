"""T1133 (ROADMAP D1): one machine-readable data contract.

docs/wire.schema.json is read by the pipeline writers (pipeline/wire_contract.py,
called from pipeline_io.atomic_write_json) and by the app sync and CI gate
(continent-app/src/lib/wireSchema.js, scripts/ci/contract.mjs). The cases in
tests/fixtures/wire_contract_cases.json are shared with
continent-app/tests/wire-contract.test.mjs: the same seeded bad value must fail
both, with the same message, field path first.
"""
import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import wire_contract as wc
from pipeline_io import atomic_write_json

CASES = json.loads((ROOT / "tests" / "fixtures" / "wire_contract_cases.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((ROOT / CASES["fixture"]).read_text(encoding="utf-8"))
WIRE = ROOT / "continent-app" / "public" / "app_data.json"


def seeded(case):
    data = copy.deepcopy(FIXTURE)
    *parents, last = case["path"]
    node = data
    for k in parents:
        node = node[k]
    if case.get("delete"):
        del node[last]
    else:
        node[last] = copy.deepcopy(case["value"])
    return data


def wire_path(tmp_path):
    p = tmp_path / "continent-app" / "public" / "app_data.json"
    p.parent.mkdir(parents=True)
    return p


def test_fixture_satisfies_the_schema():
    assert wc.validate(FIXTURE) == []


def test_there_are_enough_cases():
    # A vacuous pass on an emptied case list is the failure to rule out.
    assert len(CASES["cases"]) >= 15


@pytest.mark.parametrize("case", CASES["cases"], ids=[c["name"] for c in CASES["cases"]])
def test_seeded_bad_value_is_rejected_with_its_field_path(case):
    assert wc.validate(seeded(case)) == [case["expect"]]


REFUSED = [c for c in CASES["cases"] if not c.get("pipeline_fills")]


@pytest.mark.parametrize("case", REFUSED, ids=[c["name"] for c in REFUSED])
def test_pipeline_write_refuses_a_seeded_bad_value(case, tmp_path):
    """The hook in atomic_write_json: the write raises, names the field path,
    and the wire already on disk is left as it was."""
    out = wire_path(tmp_path)
    atomic_write_json(out, FIXTURE)
    before = out.read_bytes()
    with pytest.raises(wc.WireContractError) as err:
        atomic_write_json(out, seeded(case), indent=None, separators=(",", ":"))
    assert case["expect"] in str(err.value)
    assert err.value.problems == [case["expect"]]
    assert out.read_bytes() == before
    assert not Path(str(out) + ".tmp").exists()


def test_other_paths_are_not_checked(tmp_path):
    """The master and every other JSON the pipeline writes pass untouched."""
    bad = seeded(CASES["cases"][0])
    for p in (tmp_path / "app_data" / "app_data.json", tmp_path / "cache" / "x.json"):
        p.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_json(p, bad)
        assert json.loads(p.read_text(encoding="utf-8")) == bad


def test_is_wire_path():
    assert wc.is_wire_path(WIRE)
    assert wc.is_wire_path("x/continent-app/public/app_data.json")
    assert not wc.is_wire_path(ROOT / "app_data" / "app_data.json")
    assert not wc.is_wire_path("x/continent-app/public/boot.json")


def test_schema_version_is_20_and_agrees_with_itself():
    s = wc.load_schema()
    assert s["x-schema-version"] == 20
    assert s["properties"]["meta"]["properties"]["schema_version"]["const"] == 20


def test_bool_is_not_a_number_or_an_integer():
    s = {"type": "object", "properties": {"n": {"type": "integer"}, "x": {"type": "number"}}}
    assert wc.validate({"n": True, "x": False}, s) == [
        "n is true, expected integer", "x is false, expected number"]
    assert wc.validate({"n": 3.0, "x": 1}, s) == []


def test_catalogue_mode_checks_presence():
    s = {"type": "object", "properties": {
        "m": {"type": "object", "properties": {"a": {"x-presence": "required"}}},
        "d": {"type": "object", "additionalProperties": {"type": "object", "properties": {
            "e": {"x-presence": "every"}, "s": {"x-presence": "some"}}}}}}
    data = {"m": {}, "d": {"A": {"e": 1}, "B": {}}}
    assert wc.validate(data, s) == []
    assert wc.validate(data, s, catalogue=True) == [
        "m.a is missing",
        'd.*.e is "every" in docs/wire.schema.json but 1 of 2 records lack it',
        "d.*.s is listed in docs/wire.schema.json but no record carries it (renamed or dropped?)",
    ]


@pytest.mark.skipif(not WIRE.exists(), reason="the shipped wire is not in this checkout")
def test_the_shipped_wire_satisfies_the_schema_in_full():
    data = json.loads(WIRE.read_text(encoding="utf-8"))
    assert wc.validate(data, catalogue=True) == []
