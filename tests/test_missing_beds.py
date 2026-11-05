"""T1075: the bed re-scrape target list (scripts/missing_beds.py).
Run: python -m pytest tests/test_missing_beds.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import missing_beds as M  # noqa: E402

DESTS = {i: {"city": i.title(), "country": c, "iso2": c} for i, c in
         [("a", "FR"), ("b", "FR"), ("c", "IT"), ("d", "IT"), ("e", "IT"), ("f", "GB"), ("g", "GB")]}
WIRE = {
    "a": {"beds": {"hotel3": 90}, "src": {"hotel3": {"n": 12}}},                       # fine
    "b": {"beds": {"hotel3": 90, "dorm": 20}, "src": {"hotel3": {"n": 1}, "dorm": {"n": 2}}},  # thin
    "c": {"beds": {}, "src": {}},                                                      # record, no beds
    # d, e: no record at all
    "f": {"beds": {"hotel3": 90, "dorm": 20}, "src": {"hotel3": {"n": 2}, "dorm": {"n": 9}}},  # one rich tier
    "g": {"beds": {"hotel3": 90}, "src": {}},                                          # n unknown: not thin
}


def test_missing_and_thin_are_told_apart():
    missing, thin = M.classify(DESTS, WIRE)
    assert sorted(r["id"] for r in missing) == ["c", "d", "e"]
    assert [r["id"] for r in thin] == ["b"]
    assert thin[0]["tiers"] == {"hotel3": 1, "dorm": 2}


def test_counts_group_by_country_largest_first():
    missing, _ = M.classify(DESTS, WIRE)
    groups = M.by_country(missing)
    assert list(groups) == ["IT"] and groups["IT"]["count"] == 3
    assert M.summary(M.by_country([{"id": "x", "iso2": "FR"}, {"id": "y", "iso2": "FR"},
                                   {"id": "z", "iso2": "IT"}])) == "FR 2, IT 1"


def test_build_reads_the_shipped_files(tmp_path):
    (tmp_path / "stays" / "v1").mkdir(parents=True)
    (tmp_path / "app_data.json").write_text(json.dumps({"destinations": DESTS}), encoding="utf-8")
    (tmp_path / "stays" / "v1" / "FR.json").write_text(
        json.dumps({"dests": {k: v for k, v in WIRE.items() if k in "ab"}}), encoding="utf-8")
    (tmp_path / "stays" / "v1" / "manifest.json").write_text(json.dumps({"n": 1}), encoding="utf-8")
    rep = M.build(tmp_path)
    assert rep["places"] == 7 and rep["missing"]["count"] == 5 and rep["with_beds"] == 2
    assert rep["missing"]["by_country"]["IT"]["count"] == 3
    out = tmp_path / "o.json"
    assert M.main(["--public", str(tmp_path), "--out", str(out)]) == 0
    assert json.loads(out.read_text(encoding="utf-8"))["thin"]["count"] == 1
