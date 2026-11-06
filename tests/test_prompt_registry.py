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
