"""One outdoor row (D7, D24, wave 3): outdoor_row(), the inline `o` stamp and a
dossier build on a small fixture where every Around row carries `o`."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "dossier"))

import nature_tiers as nt  # noqa: E402
import outdoor_row as orow  # noqa: E402
import build_dossier as bd  # noqa: E402

V5 = {"score": 8.4, "band": "excellent",
      "rank": {"scope": "region", "rank": 2, "of": 9, "unit": "walks"},
      "facts": {"difficulty": "hard"}, "confidence": "measured"}


def trail(i, lat=47.0, lon=8.0, v5=True, g="hard", gs="tagged"):
    row = {"id": i, "name": f"Trail number {i}", "distance_m": 12400,
           "ascent_m": 640, "duration_min": 270, "difficulty": "easy",
           "bbox": [lon - .01, lat - .01, lon + .01, lat + .01], "score": 8.4,
           "is_loop": True, "f": {"g": g, "gs": gs, "rt": "loop", "d": 2}}
    if v5:
        row["v5"] = dict(V5)
    return row


def test_trail_block_has_every_fact_and_no_nulls():
    o = orow.outdoor_row("trails", trail(1))
    assert o == {"v5": {"score": 8.4, "band": "excellent",
                        "rank": V5["rank"]},
                 "g": "hard", "d": 2, "up_m": 640, "km": 12.4, "min": 270,
                 "rt": "loop"}
    assert list(o) == [k for k in orow.KEYS if k in o]


def test_keys_are_absent_not_zero_when_a_kind_has_no_fact():
    lake = orow.outdoor_row("lakes", {"id": 1, "v5": dict(V5), "ele": 0})
    assert set(lake) == {"v5"}
    row = trail(2)
    row["ascent_m"] = None
    row["f"] = {}
    o = orow.outdoor_row("trails", row)
    assert "up_m" not in o and "g" not in o and "d" not in o
    assert orow.outdoor_row("beaches", {"id": 3}) == {}


def test_cycling_and_mountains():
    c = orow.outdoor_row("cycling", {"km": 23.9, "asc": 6, "dur": {"min": 80},
                                      "rt": "point", "v5": dict(V5)})
    assert (c["km"], c["up_m"], c["min"], c["rt"]) == (23.9, 6, 80, "point")
    assert "g" not in c
    est = {"diff": {"k": "alpine", "est": True}}
    assert "g" not in orow.outdoor_row("mountains", est)
    assert orow.outdoor_row("mountains", {"diff": {"k": "scramble"}})["g"] == "hard"


def test_stamp_refreshes_o_when_v5_is_unchanged(tmp_path, monkeypatch):
    (tmp_path / "trails").mkdir()
    row = trail(7)
    row["f"]["g"] = "easy"
    row["o"] = orow.outdoor_row("trails", row)
    path = tmp_path / "trails" / "XX.json"
    path.write_text(json.dumps({"trips": [row]}), encoding="utf-8")
    (tmp_path / "trails" / "top.json").write_text('{"trips":[]}', encoding="utf-8")
    monkeypatch.setattr(nt, "PUBLIC", tmp_path)
    # The score and the stamped v5 stay the same; only f.g moved.
    row["f"]["g"] = "very_hard"
    path.write_text(json.dumps({"trips": [row]}), encoding="utf-8")
    nt.write_kind("trails", {7: {**V5, "rank": V5["rank"]}})
    out = json.loads(path.read_text(encoding="utf-8"))["trips"][0]
    assert out["o"]["g"] == "very_hard"
    # A row nobody scored still gets its block, without v5.
    path.write_text(json.dumps({"trips": [trail(8, v5=False)]}), encoding="utf-8")
    nt.write_kind("trails", {})
    unrated = json.loads(path.read_text(encoding="utf-8"))["trips"][0]
    assert "v5" not in unrated and unrated["o"]["g"] == "hard"


def test_dossier_fixture_every_around_row_carries_o(tmp_path, monkeypatch, capsys):
    for layer, key, rows in (
            ("trails", "trips", [{**trail(i, 47.0 + i * .01), "o": orow.outdoor_row(
                "trails", trail(i, 47.0 + i * .01))} for i in range(1, 4)]),
            ("lakes", "lakes", [{"id": 9, "name": "Lake Nine", "lat": 47.02,
                                 "lon": 8.0, "score": 7.0, "v5": dict(V5)}])):
        (tmp_path / layer).mkdir()
        (tmp_path / layer / "XX.json").write_text(
            json.dumps({key: rows}), encoding="utf-8")
    # One old-file trail: no `o` on the row, so the build makes it and says so.
    old = trail(5, 47.03)
    data = json.loads((tmp_path / "trails" / "XX.json").read_text(encoding="utf-8"))
    data["trips"].append(old)
    (tmp_path / "trails" / "XX.json").write_text(json.dumps(data), encoding="utf-8")
    monkeypatch.setattr(bd, "PUB", str(tmp_path))
    idx = bd.load_layer_index()
    assert "WARNING: 2 wire rows carry no `o`" in capsys.readouterr().out
    around = bd.compose_around({"lat": 47.0, "lon": 8.0}, idx)
    rows = around["trails"] + around["lakes"]
    assert len(rows) == 5 and all("o" in r for r in rows)
    assert all(r["o"]["v5"]["score"] for r in around["trails"])
    # The legacy difficulty ("easy" on the old row) follows the grade the score used.
    assert {r["difficulty"] for r in around["trails"]} == {"hard"}
