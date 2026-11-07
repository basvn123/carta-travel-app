"""The prompt registry, pipeline side (T1140, ROADMAP E5).

1. Byte-identical: the pipeline jobs, now reading the registry, give exactly
   the prompts their code gave before (prompts/_golden/py.json, written from
   commit 55a09c9c01 by scripts/prompts/capture_golden.py).
2. Parity: pipeline/prompt_registry.py parses every registry file to the
   hash that the JS side (scripts/prompts/lib.mjs) wrote into registry.json.
"""
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRIPS = os.path.join(ROOT, "Trips", "carta-unified", "carta-unified", "pipeline")
for p in (os.path.join(ROOT, "pipeline"), TRIPS):
    if p not in sys.path:
        sys.path.insert(0, p)

import prompt_registry as R

with open(os.path.join(ROOT, "prompts", "_golden", "py.json"), encoding="utf-8") as fh:
    GOLDEN = json.load(fh)
with open(R.REGISTRY, encoding="utf-8") as fh:
    REG = json.load(fh)


def test_every_registry_file_hashes_as_the_js_side_wrote():
    for pid, entry in REG["prompts"].items():
        with open(os.path.join(ROOT, entry["file"]), encoding="utf-8", newline="") as fh:
            meta, frags = R.parse_by_format(fh.read(), entry.get("format"), entry["file"])
        assert meta["version"] == entry["version"], pid
        assert R.fragments_sha(frags) == entry["sha256"], pid
        assert R.prompt(pid).sha256 == entry["sha256"], pid


def test_crlf_and_prose_do_not_change_the_hash():
    a = R.parse_prompt_file("---\nid: x\nversion: 1\n---\nAbout.\n### a\n~~~\nT\n~~~\n")[1]
    b = R.parse_prompt_file("---\r\nid: x\r\nversion: 1\r\n---\r\nOther.\r\n### a\r\n~~~\r\nT\r\n~~~\r\n")[1]
    assert R.fragments_sha(a) == R.fragments_sha(b)


def test_fill_is_one_pass_and_strict():
    p = R.Prompt("x", 1, {"a": "{{one}} and {{two}}"})
    assert p.text("a", one="{{two}}", two="2") == "{{two}} and 2"
    with pytest.raises(KeyError):
        p.text("a", one="1")
    with pytest.raises(KeyError):
        p.text("b")


def _dests():
    dest = {"id": "LIS", "city": "Lisbon (Humberto Delgado)", "country": "Portugal", "lat": 38.7742, "lon": -9.1342,
            "city_lat": 38.7223, "city_lon": -9.1393, "nature": {"nearest": {"name": "Sintra-Cascais", "dist_km": 18}}}
    dest2 = {"id": "BLED", "city": "Bled", "country": "Slovenia", "lat": 46.3683, "lon": 14.1146}
    dossier = {
        "place": {"name": "Lisbon (Humberto Delgado)", "country": "Portugal", "class": "city", "categories": ["culture", "food"],
                  "designations": [{"name": "Belem Tower"}, {"kind": "unesco"}], "visit_h": 14.6},
        "intro": {"facts": {"population": 545000}},
        "highlights": [{"name": "Alfama", "rank_score": 0.9}, {"name": "Belem Tower", "rank_score": 0.95}],
        "when": {"best": [4, 5, 9, 10, 13]},
        "verdict": {"score": 8.6, "label": "Excellent"},
        "nearby": {"beaches": [{"name": "Carcavelos"}, {"name": "Costa"}, {"name": "Third"}], "lakes": []},
        "practical": {"getting_there": {"transit": "Metro red line"}},
    }
    return dest, dest2, dossier


def _dossier_module(name):
    """A pipeline/dossier job, with its own common.py (the Trips folder has another one)."""
    import importlib.util
    saved = sys.modules.pop("common", None)
    sys.path.insert(0, os.path.join(ROOT, "pipeline", "dossier"))
    try:
        spec = importlib.util.spec_from_file_location(f"t1140_{name}", os.path.join(ROOT, "pipeline", "dossier", f"{name}.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    finally:
        sys.path.pop(0)
        sys.modules.pop("common", None)
        if saved is not None:
            sys.modules["common"] = saved


def test_intros_and_parking_prompts_are_byte_identical():
    parking_check = _dossier_module("parking_check")
    rewrite_intros = _dossier_module("rewrite_intros")
    dest, dest2, dossier = _dests()
    items = [(dest, dossier, "Lisbon is the capital of Portugal. " * 40), (dest2, {"place": {"name": "Bled"}}, "")]
    assert rewrite_intros.SYSTEM == GOLDEN["intros.system"]
    assert rewrite_intros.user_block(items) == GOLDEN["intros.user"][0]["output"]
    assert rewrite_intros.user_block(items[1:]) == GOLDEN["intros.user"][1]["output"]
    assert parking_check.SYSTEM == GOLDEN["parking.system"]
    for d, g in zip((dest, dest2), GOLDEN["parking.user"]):
        assert parking_check.prompt_for(d) == g["output"]


def test_lexicon_prompt_is_byte_identical():
    import ask_lexicon
    for g in GOLDEN["lexicon"]:
        assert ask_lexicon.ollama_prompt(*g["input"]) == g["output"]


def test_trips_lines_are_byte_identical():
    import backfill_modules
    import generate_trip
    errs = ["days[2].places: too few", "summary: too long"]
    assert generate_trip.retry_prompt("THE USER PROMPT", errs) == GOLDEN["trips.retry"]
    assert generate_trip.retry_prompt("THE USER PROMPT", errs) == GOLDEN["trips.retry.backfill"]
    recs = [{"packingNotes": ["Bring **sun cream**", 3], "whatCouldGoWrong": ["Ferries strike in _August_"]},
            {"packingNotes": [], "whatCouldGoWrong": []}]
    assert [backfill_modules.previous_block(r) for r in recs] == GOLDEN["trips.previous"]


# The response schemas the Trips generator sends, hashed with sorted keys before
# their five field descriptions moved to trips-shared v2 (T1206, register row
# T1140-c; computed from the code at the commit before the move). The model gets
# the same schemas, so the golden set needed no rebaseline. Sorted keys: the
# Gemini dialect's key order varies between runs (string hashing), its content
# does not.
TRIPS_SCHEMA_SHA = {
    1: ("4b0b7ab3a2bd5a86a4226c871a9f224a64da4ac46cb1fa35c6c2b59fee11bc01",
        "777fc05e93697ff7bc0028a9116ad7a2c152c1fe2e739c175c78a58934a6c84c"),
    2: ("4f6da2cae63065afde2e0b260b61f95ae22a0cedb99c4302143754b76761b633",
        "dc0357f8e0a48c364d9d721c720c4b70b7cbe25d81d1b144a2ae4f25ef8167ac"),
    3: ("5df0d36e50a4c19bde7416cfc52a9a9b725f94887e9f1ffaef9358d81b3e05e8",
        "9a6f851e6d519e2ba324c6ba473da1c04c07dd91bc5d2cd8b5fb6c93d12378a1"),
    4: ("fad8f15e65f89aae0a6c5887f55d7bb0b98e9c66c1ac70efffc42405dd49b705",
        "d46abede8c247c41ba974e7306580fd2908bc5e75075c9793186055aef7ab509"),
}


def test_trips_schemas_are_byte_identical():
    import hashlib

    import generate_trip
    sha = lambda o: hashlib.sha256(json.dumps(o, sort_keys=True).encode()).hexdigest()  # noqa: E731
    for n, (plain, gemini) in TRIPS_SCHEMA_SHA.items():
        assert sha(generate_trip.pass_schema(n)) == plain, f"pass {n} schema"
        assert sha(generate_trip.pass_gemini_schema(n)) == gemini, f"pass {n} Gemini schema"


def test_trips_schema_descriptions_come_from_the_registry():
    import generate_trip
    shared = R.prompt("trips-shared")
    assert generate_trip.pass_schema(1)["properties"]["nameSlug"]["description"] == shared.text("schema.nameSlug")
    assert generate_trip.pass_schema(4)["properties"]["checks"]["description"] == shared.text("schema.critic.checks")
