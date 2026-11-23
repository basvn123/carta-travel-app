"""scripts/quality/drift.py: the drift gate between two wires (D2, wave 2 step 8, G3)."""
from __future__ import annotations

import copy
import importlib.util
import json
import random
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def drift():
    spec = importlib.util.spec_from_file_location("quality_drift_t", ROOT / "scripts/quality/drift.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["quality_drift_t"] = mod
    spec.loader.exec_module(mod)
    return mod


def make_wire(n=400, seed=1, price_shift=0, measured=0.87):
    rnd = random.Random(seed)
    dests = {}
    for i in range(n):
        beds = {t: round(base + price_shift + rnd.uniform(-10, 10)) for t, base in
                (("dorm", 30), ("private", 60), ("hotel2", 90), ("hotel3", 120), ("hotel4", 170), ("hotel5", 260))}
        dests[f"p{i}"] = {
            "iso2": "BE" if i % 2 else "NL",
            "accommodation": {"q": "measured" if rnd.random() < measured else "modelled",
                              "captured": "2026-11-01", "beds": beds, "_asof": "2026-11-01"},
            "rating": {"score": round(rnd.uniform(3, 9), 1), "_asof": "2026-11-01"},
            "climate": {"best": sorted(rnd.sample(range(1, 13), 3)), "_asof": "2026-10-01"},
            "image": {"url": "https://x/a.jpg", "_asof": "2026-11-01"},
        }
    return {"meta": {"generated_at": "2026-11-18T00:00:00+00:00"}, "destinations": dests}


def test_a_wire_against_itself_passes(drift):
    w = make_wire()
    res = drift.compare(w, copy.deepcopy(w))
    assert res["ok"] and not res["failures"]
    assert all(r["psi"] == 0 for r in res["psi"])


def test_a_new_sample_of_the_same_data_passes(drift):
    assert drift.compare(make_wire(seed=1), make_wire(seed=2))["ok"]


def test_the_bed_incident_fails_on_the_measured_share(drift):
    """2026-11-13: the wire kept its records and lost nearly every measured block."""
    old, new = make_wire(), make_wire()
    for i, d in enumerate(new["destinations"].values()):
        if i >= 6:
            d["accommodation"].update(q="modelled", captured=None)
    res = drift.compare(old, new)
    assert not res["ok"]
    assert any(f["field"] == "measured_bed_share" for f in res["failures"])
    assert res["worst_country"][0]["delta_points"] < -40


def test_a_two_point_drop_passes_and_a_three_point_drop_fails(drift):
    old = make_wire(n=1000, measured=1.0)
    for drop, ok in ((20, True), (30, False)):
        new = copy.deepcopy(old)
        for d in list(new["destinations"].values())[:drop]:
            d["accommodation"].update(q="modelled")
        assert drift.compare(old, new)["ok"] is ok


def test_a_shifted_price_distribution_fails_on_psi(drift):
    res = drift.compare(make_wire(), make_wire(seed=3, price_shift=40))
    assert not res["ok"]
    assert {"bed.dorm", "bed.hotel3"} <= {f["field"] for f in res["failures"]}
    assert all(f["why"].startswith("PSI") for f in res["failures"] if f["field"].startswith("bed."))


def test_an_empty_field_is_never_a_pass(drift):
    old, new = make_wire(), make_wire()
    for d in new["destinations"].values():
        d["climate"].pop("best")
    res = drift.compare(old, new)
    assert not res["ok"] and any(f["field"] == "best_months" for f in res["failures"])
    both = make_wire()
    for d in both["destinations"].values():
        d.pop("rating")
    res = drift.compare(both, copy.deepcopy(both))
    assert not res["ok"] and any("empty in both" in f["why"] for f in res["failures"])
    assert not drift.compare({"destinations": {}}, {"destinations": {}})["ok"]


def test_psi_is_defined_when_the_old_values_are_constant(drift):
    assert drift.psi([5] * 50, [5] * 50) == 0
    assert drift.psi([5] * 50, [9] * 50) > 0.25


def test_the_cli_exit_codes_and_json(drift, tmp_path, capsys):
    a, b = tmp_path / "old", tmp_path / "new"
    a.mkdir(), b.mkdir()
    (a / "app_data.json").write_text(json.dumps(make_wire()), encoding="utf-8")
    (b / "app_data.json").write_text(json.dumps(make_wire()), encoding="utf-8")
    assert drift.main(["--old", str(a), "--new", str(b), "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["ok"] is True
    assert drift.main(["--old", str(a), "--new", str(tmp_path / "missing")]) == 2


def test_shipped_limits_are_the_agreed_ones(drift):
    cfg = drift.load_config()
    assert cfg["psi_max"] == 0.25 and cfg["share_drop_points"] == 2


def test_the_publish_guard_refuses_a_drifted_build(tmp_path, capsys):
    import test_publish_guard as tg
    spec = importlib.util.spec_from_file_location("publish_guard_t", ROOT / "scripts/quality/publish_guard.py")
    guard = importlib.util.module_from_spec(spec)
    sys.modules["publish_guard_t"] = guard
    spec.loader.exec_module(guard)
    good = tg.make_public(tmp_path / "good")
    bad = tg.make_public(tmp_path / "bad", measured=60)
    # the same tree against itself passes; 87 measured places against 60 refuses on drift
    assert tg.call(guard, tmp_path, good, None, "--previous", str(good)) == 0
    assert tg.call(guard, tmp_path, bad, None, "--previous", str(good)) == 1
    assert "FAIL drift.measured_bed_share" in capsys.readouterr().out


def test_zero_hits_in_both_wires_is_never_a_pass(drift):
    w = make_wire()
    for d in w["destinations"].values():
        d["image"] = {}
        d["accommodation"].update(q="modelled", captured=None)
    res = drift.compare(w, copy.deepcopy(w))
    fields = {f["field"] for f in res["failures"]}
    assert not res["ok"] and {"photo_share", "measured_bed_share"} <= fields
