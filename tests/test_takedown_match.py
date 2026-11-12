"""takedown.py matches a typed Commons title against the percent-encoded
URLs the wires carry (T449-a: the moth on trail 86628 was missed because
"(2)" ships as "%282%29")."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline" / "photos"))

import takedown  # noqa: E402

URL = ("https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/"
       "2018-11-04_Colotois_pennaria_%282%29.jpg/1280px-2018-11-04_Colotois_pennaria_%282%29.jpg")


def test_typed_title_matches_encoded_url():
    ledger = [{"needle": "2018-11-04 Colotois pennaria (2).jpg"}]
    assert takedown.is_taken_down(URL, ledger)
    ledger = [{"needle": "2018-11-04_Colotois_pennaria_(2).jpg"}]
    assert takedown.is_taken_down(URL, ledger)


def test_other_titles_do_not_match():
    ledger = [{"needle": "Colotois pennaria (3).jpg"}]
    assert not takedown.is_taken_down(URL, ledger)


def test_scrub_removes_encoded_record(tmp_path, monkeypatch):
    trails = tmp_path / "trails"
    trails.mkdir()
    keep = {"u": "https://upload.wikimedia.org/x/Other_walk.jpg"}
    wire = {"id": 86628, "images": [{"u": URL, "w": 1280}, keep]}
    (trails / "BE.json").write_text(json.dumps(wire), encoding="utf-8")
    monkeypatch.setattr(takedown, "PUBLIC", tmp_path)
    touched = takedown.scrub(["2018-11-04_Colotois_pennaria_(2).jpg"])
    assert sum(touched.values()) == 1
    out = json.loads((trails / "BE.json").read_text(encoding="utf-8"))
    assert out["images"] == [keep]
