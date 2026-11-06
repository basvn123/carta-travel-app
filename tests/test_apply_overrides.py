"""pipeline/apply_overrides.py: hand corrections applied last (T1173, ROADMAP I13).

An override wins over the pipeline's output, survives a rerun of the layer
task (which rewrites the output without it), and every override carries who,
when, why and source.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import apply_overrides as ao


def entry(item_id, patch, **extra):
    base = {"id": item_id, "patch": patch, "who": "bas", "when": "2026-11-06",
            "why": "The pipeline intro named the wrong lake.",
            "source": "https://en.wikipedia.org/wiki/Hallstatt"}
    return {**base, **extra}


def write_overrides(root, layer, entries):
    d = root / "data" / "overrides"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{layer}.json").write_text(json.dumps(
        {"layer": layer, "version": 1, "overrides": entries}), encoding="utf-8")


def pipeline_writes_master(root, blurb="Pipeline blurb."):
    """Stand-in for a layer task: rewrites the master from its sources."""
    (root / "app_data").mkdir(exist_ok=True)
    data = {"meta": {}, "destinations": {
        "hallstatt": {"id": "hallstatt", "city": "Hallstatt", "blurb": blurb,
                      "place": {"population": 700}},
        "graz": {"id": "graz", "city": "Graz", "blurb": "Graz."},
    }}
    (root / "app_data" / "app_data.json").write_text(json.dumps(data), encoding="utf-8")


def pipeline_writes_lakes(root):
    d = root / "continent-app" / "public" / "lakes"
    d.mkdir(parents=True, exist_ok=True)
    lake = {"id": "hallstaetter-see", "name": "Hallstatt Lake", "cc": "AT", "score": 8}
    (d / "AT.json").write_text(json.dumps({"country": "AT", "n": 1, "lakes": [lake]}), encoding="utf-8")
    (d / "top.json").write_text(json.dumps({"n": 1, "lakes": [{"id": "hallstaetter-see", "name": "Hallstatt Lake"}]}),
                                encoding="utf-8")


def master(root):
    return json.loads((root / "app_data" / "app_data.json").read_text(encoding="utf-8"))["destinations"]


def test_override_wins_and_survives_a_rerun(tmp_path):
    write_overrides(tmp_path, "dest", [entry("hallstatt", {"blurb": "Corrected blurb.", "place.population": 750})])
    pipeline_writes_master(tmp_path)

    res = ao.apply_all(tmp_path)
    assert res["dest"][0]["status"] == "applied"
    assert master(tmp_path)["hallstatt"]["blurb"] == "Corrected blurb."
    assert master(tmp_path)["hallstatt"]["place"]["population"] == 750
    assert master(tmp_path)["graz"]["blurb"] == "Graz."          # untouched

    # The layer task runs again and writes its own value back.
    pipeline_writes_master(tmp_path, blurb="Pipeline blurb, run two.")
    assert master(tmp_path)["hallstatt"]["blurb"] == "Pipeline blurb, run two."
    ao.apply_all(tmp_path)
    assert master(tmp_path)["hallstatt"]["blurb"] == "Corrected blurb."

    # Applying twice with no rerun between changes nothing.
    again = ao.apply_all(tmp_path)
    assert again["dest"][0]["status"] == "unchanged"


def test_layer_files_and_their_summary_copies(tmp_path):
    write_overrides(tmp_path, "lake", [entry("hallstaetter-see", {"name": "Hallstaetter See", "blurb": "Clear."})])
    pipeline_writes_lakes(tmp_path)
    res = ao.apply_all(tmp_path)["lake"][0]
    assert res["status"] == "applied" and res["copies"] == 1
    d = tmp_path / "continent-app" / "public" / "lakes"
    full = json.loads((d / "AT.json").read_text(encoding="utf-8"))["lakes"][0]
    top = json.loads((d / "top.json").read_text(encoding="utf-8"))["lakes"][0]
    assert full["name"] == "Hallstaetter See" and full["blurb"] == "Clear."
    # A summary copy gets only the fields it already carries.
    assert top["name"] == "Hallstaetter See" and "blurb" not in top
    # Served files stay compact, as the exporters write them.
    assert "\n" not in (d / "AT.json").read_text(encoding="utf-8")

    pipeline_writes_lakes(tmp_path)                                  # rerun
    ao.apply_all(tmp_path)
    full = json.loads((d / "AT.json").read_text(encoding="utf-8"))["lakes"][0]
    assert full["name"] == "Hallstaetter See"


@pytest.mark.parametrize("missing", ["who", "when", "why", "source"])
def test_every_override_names_who_when_why_and_source(tmp_path, missing):
    bad = entry("hallstatt", {"blurb": "x"})
    del bad[missing]
    write_overrides(tmp_path, "dest", [bad])
    pipeline_writes_master(tmp_path)
    with pytest.raises(ao.OverrideError, match=f"has no {missing}"):
        ao.apply_all(tmp_path)
    # Refused whole: nothing was written.
    assert master(tmp_path)["hallstatt"]["blurb"] == "Pipeline blurb."


@pytest.mark.parametrize("change, rule", [
    ({"why": "short"}, "why must be"),
    ({"when": "6 Nov 2026"}, "when must be a date"),
    ({"patch": {}}, "patch must be a non-empty object"),
    ({"patch": {"id": "x"}}, "may not change the id"),
    ({"patch": {"a b": 1}}, "not a dotted field name"),
    ({"patch": {"costs.daily": 40}}, "computed field"),
    ({"patch": {"score": 9}}, "computed field"),
    ({"why": "Range 3\u20135 km was wrong here."}, "en or em dash"),
    ({"extra": 1}, "unknown keys"),
])
def test_rules_refuse_a_bad_entry(tmp_path, change, rule):
    write_overrides(tmp_path, "dest", [{**entry("hallstatt", {"blurb": "x"}), **change}])
    with pytest.raises(ao.OverrideError, match=rule):
        ao.load_all(tmp_path)


def test_two_entries_may_not_set_the_same_field(tmp_path):
    write_overrides(tmp_path, "dest", [entry("graz", {"blurb": "a"}), entry("graz", {"blurb": "b"})])
    with pytest.raises(ao.OverrideError, match="also set by entry 0"):
        ao.load_all(tmp_path)


def test_orphans_and_bad_paths_are_reported_not_fatal(tmp_path):
    write_overrides(tmp_path, "dest", [entry("gone", {"blurb": "x"}),
                                       entry("graz", {"nope.deep": 1})])
    pipeline_writes_master(tmp_path)
    res = {r["id"]: r["status"] for r in ao.apply_all(tmp_path)["dest"]}
    assert res == {"gone": "orphan", "graz": "bad_path"}
    assert ao.main(["--root", str(tmp_path)]) == 0


def test_cli_exit_codes_and_snapshot(tmp_path):
    write_overrides(tmp_path, "dest", [entry("hallstatt", {"blurb": "Corrected blurb."})])
    pipeline_writes_master(tmp_path)
    assert ao.main(["--root", str(tmp_path), "--snapshot"]) == 0
    snap = json.loads((tmp_path / ao.SNAPSHOT).read_text(encoding="utf-8"))
    assert snap["counts"]["dest"] == 1
    row = snap["overrides"][0]
    assert row["status"] == "applied" and row["who"] == "bas" and row["source"].startswith("https://")
    write_overrides(tmp_path, "dest", [{"id": "hallstatt"}])
    assert ao.main(["--root", str(tmp_path)]) == 2


def test_the_committed_files_are_valid_and_the_snapshot_lists_them():
    entries = ao.load_all(ROOT)
    snap = json.loads((ROOT / ao.SNAPSHOT).read_text(encoding="utf-8"))
    assert {(r["layer"], r["id"]) for r in snap["overrides"]} == {
        (layer, e["id"]) for layer, rows in entries.items() for e in rows}
