"""scripts/quality/publish_guard.py: a seeded bed regression fails the box publish (D10, D2; wave 1 item 0.3)."""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def guard():
    spec = importlib.util.spec_from_file_location("publish_guard", ROOT / "scripts/quality/publish_guard.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["publish_guard"] = mod
    spec.loader.exec_module(mod)
    return mod


def acc(i, dorm=None):
    beds = {"hotel3": 100, "hotel4": 140}
    if dorm is not None:
        beds["dorm"] = dorm
    return {"q": "measured", "captured": "2026-11-03", "beds": beds, "supply": {}}


def make_public(tmp: Path, n=100, measured=87, dorm_bad=0) -> Path:
    # 87%: the local wire's 86.6%, so the beds seed (5 points) lands under the floor as it would there.
    tmp.mkdir(parents=True, exist_ok=True)
    dests = {}
    for i in range(n):
        d = {"id": f"p{i:03d}", "tier": "gem", "city": f"P{i}", "country": "Belgium", "iso2": "BE",
             "lat": 50.8, "lon": 4.4, "categories": ["city"], "blurb": "A town."}
        if i < measured:
            d["accommodation"] = acc(i, dorm=200 if i < dorm_bad else 30)
        dests[d["id"]] = d
    meta = {"generated_at": "2026-11-18T00:00:00+00:00"}
    (tmp / "app_data.json").write_text(json.dumps({"meta": meta, "destinations": dests}), encoding="utf-8")
    return tmp


def make_staged(tmp: Path, public: Path, dorm_bad=0) -> Path:
    tmp.mkdir(parents=True, exist_ok=True)
    (tmp / "dest").mkdir()
    (tmp / "_stage.json").write_text("{}", encoding="utf-8")
    dests = json.loads((public / "app_data.json").read_text(encoding="utf-8"))["destinations"]
    for k in list(dests)[:dorm_bad]:
        dests[k]["accommodation"]["beds"]["dorm"] = 500
    (tmp / "dest" / "BE.json").write_text(json.dumps(dests), encoding="utf-8")
    (tmp / "dest" / "_rank.json").write_text("[]", encoding="utf-8")
    return tmp


def rules(guard, tmp: Path) -> Path:
    """Every measured field soft at 0, the measured-beds rule hard at 0.84,
    and the shipped invariants."""
    eng = guard._engine()
    rs = [{"id": f"{lay}.{f}", "layer": lay, "field": f, "level": "must_have", "kind": "soft", "min": 0.0}
          for lay, f in sorted(eng.measured_fields())]
    for r in rs:
        if r["id"] == "prices.accommodation_measured":
            r.update(level="must_see", kind="hard", min=0.84)
    shipped = eng.load_rules()
    p = tmp / "rules.yaml"
    p.write_text(yaml.safe_dump({"version": 1, "gate": {"must_see_drop_points": 2, "trend_days": 90},
                                 "rules": rs, "invariants": shipped["invariants"]}), encoding="utf-8")
    return p


def call(guard, tmp, public, staged=None, *extra):
    args = ["--public", str(public), "--staged", str(staged or tmp / "no-stage"), "--rules", str(rules(guard, tmp)),
            "--out", str(tmp / "out"), "--no-validation", "--no-contract", *extra]
    return guard.main(args)


def test_shipped_rules_carry_the_bed_rule_and_invariants(guard):
    cfg = guard._engine().load_rules()
    r = next(r for r in cfg["rules"] if r["id"] == "prices.accommodation_measured")
    assert r["kind"] == "hard" and r["level"] == "must_see" and 0.8 <= r["min"] < 0.87
    inv = {c["id"]: c for c in cfg["invariants"]}
    assert inv["beds.dorm_above_hotel3"]["kind"] == "hard" and inv["beds.dorm_above_hotel3"]["max"] == 0
    assert inv["wire.generated_at_age_days"]["kind"] == "soft"


def test_a_clean_tree_passes(guard, tmp_path, capsys):
    pub = make_public(tmp_path / "pub")
    assert call(guard, tmp_path, pub, make_staged(tmp_path / "stage", pub)) == 0
    assert "publish guard: PASS" in capsys.readouterr().out


def test_a_measured_beds_drop_fails(guard, tmp_path, capsys):
    pub = make_public(tmp_path / "pub", measured=80)          # 80% under the 84% floor
    assert call(guard, tmp_path, pub) == 1
    assert "wire.prices.accommodation_measured" in capsys.readouterr().out


def test_a_dorm_above_hotel3_fails(guard, tmp_path, capsys):
    pub = make_public(tmp_path / "pub", dorm_bad=1)
    assert call(guard, tmp_path, pub) == 1
    assert "wire.beds.dorm_above_hotel3" in capsys.readouterr().out


def test_the_staged_tree_is_checked_too(guard, tmp_path, capsys):
    pub = make_public(tmp_path / "pub")
    assert call(guard, tmp_path, pub, make_staged(tmp_path / "stage", pub, dorm_bad=2)) == 1
    out = capsys.readouterr().out
    assert "staged.beds.dorm_above_hotel3" in out and "wire.beds" not in out


@pytest.mark.parametrize("seed", ["beds", "dorm"])
def test_a_seeded_break_fails_a_clean_tree(guard, tmp_path, monkeypatch, capsys, seed):
    pub = make_public(tmp_path / "pub")
    monkeypatch.setenv("CARTA_PUBLISH_SEED_BREAK", seed)
    assert call(guard, tmp_path, pub) == 1
    out = capsys.readouterr().out
    assert f"SEED BREAK {seed}" in out and "REFUSED" in out
    # Nothing is written: the file on disk still passes.
    monkeypatch.delenv("CARTA_PUBLISH_SEED_BREAK")
    assert call(guard, tmp_path, pub) == 0


def test_override_publishes_and_says_why(guard, tmp_path, capsys):
    pub = make_public(tmp_path / "pub", dorm_bad=3)
    assert call(guard, tmp_path, pub, None, "--override", "stopgap 0.2") == 0
    assert "OVERRIDE of 1 failures, reason: stopgap 0.2" in capsys.readouterr().out


def test_an_empty_wire_never_passes(guard, tmp_path):
    pub = make_public(tmp_path / "pub", n=0, measured=0)
    assert call(guard, tmp_path, pub) == 1


def test_a_contract_break_fails(guard, tmp_path, monkeypatch):
    pub = make_public(tmp_path / "pub")
    monkeypatch.setattr(guard, "run_contract", lambda p: (False, "meta.schema_version is missing"))
    args = ["--public", str(pub), "--staged", str(tmp_path / "x"), "--rules", str(rules(guard, tmp_path)),
            "--out", str(tmp_path / "out"), "--no-validation"]
    assert guard.main(args) == 1


def test_an_unknown_invariant_is_a_config_error(guard, tmp_path):
    p = rules(guard, tmp_path)
    d = yaml.safe_load(p.read_text(encoding="utf-8"))
    d["invariants"].append({"id": "x", "check": "nope", "max": 0, "kind": "hard"})
    p.write_text(yaml.safe_dump(d), encoding="utf-8")
    with pytest.raises(ValueError, match="check must be one of"):
        guard._engine().load_rules(p)
