"""scripts/quality/launch_gate.py: the ROADMAP section 4 table never passes on nothing (D2, D9; wave 1 item 0.7)."""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def gate():
    spec = importlib.util.spec_from_file_location("launch_gate", ROOT / "scripts/quality/launch_gate.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["launch_gate"] = mod
    spec.loader.exec_module(mod)
    return mod


def dossier(pid, score, words=130):
    return {"id": pid, "place": {"name": pid, "class": "city"}, "verdict": {"score": score},
            "gallery": [{}] * 5, "intro": {"body": " ".join(["word"] * words)}}


def write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


def test_top_places_sorts_by_score_then_id(gate):
    ds = [dossier("c", 8.3), dossier("a", 8.3), dossier("b", 9.0), dossier("d", None),
          {"id": "x", "verdict": {"score": 10}}]          # no place: not a place page
    assert [d["id"] for d in gate.top_places(ds, n=3)] == ["b", "a", "c"]
    assert [d["id"] for d in gate.top_places(ds)] == ["b", "a", "c", "d"]


def test_passes_needs_rows(gate):
    assert not gate.passes(gate.Row("x", 0, 0, 1.0))      # nothing measured is no pass
    assert not gate.passes(gate.Row("x", 0, 0, 0.0))
    assert gate.passes(gate.Row("x", 3, 3, 1.0))
    assert not gate.passes(gate.Row("x", 2, 3, 0.95))


def test_every_row_on_an_empty_surface_is_n_zero(gate):
    rows = gate.place_gate([], {}, {}, lambda pid: []) + gate.trail_gate([], gate.template_marks())
    assert rows and all(r.n == 0 and not gate.passes(r) for r in rows)


def test_a_fixture_wire_three_of_three(gate, tmp_path):
    acc = {"q": "measured", "captured": "2026-11-03", "beds": {"hotel3": 90}}
    app = {}
    for pid in ("p1", "p2", "p3"):
        write(tmp_path / "dossier" / f"{pid}.json", dossier(pid, 9.0))
        app[pid] = {"image": {"url": "u"}, "accommodation": acc, "place": {"class": "city"},
                    "local_transport": {"fare_single": 2},
                    "crowding": {"monthly": {"share": [1] * 12}}}
    write(tmp_path / "dossier" / "index.json", [])
    write(tmp_path / "app_data.json", {"destinations": app})
    hike = {"id": 1, "country": "AT", "category": "hike", "name": "Vienna - Bratislava",
            "v5": {"band": "excellent"}, "img": {"u": "x"}, "summary": "A ridge walk above the lake.",
            "distance_m": 9000, "ascent_m": 300, "duration_min": 180}
    write(tmp_path / "trails" / "AT.json", {"trips": [hike, dict(hike, id=2, v5={"band": "good"})]})
    res = gate.measure(tmp_path)
    by = {r.name: r for r in res["places"] + res["trails"]}
    for name in ("Hero and 5+ photos", "Measured bed price", "Local fare (metro and city)",
                 "Crowds by month"):
        assert (by[name].have, by[name].n) == (3, 3) and gate.passes(by[name]), name
    assert by["Photo"].n == 1 and gate.passes(by["Photo"])     # only the top band counts
    assert by["Clean display name"].have == 1
    assert by["Must-see POIs described"].n == 0 and not gate.passes(by["Must-see POIs described"])
    assert "| Measured bed price | 100.0% (3 of 3) | 95% | yes |" in gate.markdown(res)
    assert gate.main(["--public", str(tmp_path), "--strict"]) == 1
    assert gate.main(["--public", str(tmp_path)]) == 0


def test_legacy_bed_block_is_not_measured(gate):
    app = {"p": {"accommodation": {"q": "measured", "beds": {"hotel3": 90}, "captured": None}}}
    row = gate.row_bed([{"id": "p"}], app)
    assert (row.have, row.n) == (0, 1)
