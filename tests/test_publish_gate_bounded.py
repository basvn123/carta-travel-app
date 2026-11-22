"""The publish gate's bounded row loss and its rating step (D25, 2026-11-22).

gate.run(max_row_loss=PCT) judges lost rows once over the whole layer instead
of failing each one; publish.py runs nature_tiers.py before the gate for a
layer that carries v5, so an export that writes rows without v5 is compared
like for like with a wire the weekly rating filled."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "field_stubs"))

import gate  # noqa: E402
import publish  # noqa: E402

REL = gate.LAYERS["beaches"][0]


def _write(base, cc, ids):
    p = Path(base) / REL / f"{cc}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    rows = [{"id": i, "name": i} for i in ids]
    p.write_text(json.dumps({"country": cc, "beaches": rows, "listed": []}), encoding="utf-8")


def _layer(tmp_path, prev, new):
    """prev and new: {cc: [ids]}; returns (base, prev_dir)."""
    base, snap = tmp_path / "new", tmp_path / "prev"
    for cc, ids in prev.items():
        _write(snap, cc, ids)
    for cc, ids in new.items():
        _write(base, cc, ids)
    return base, snap


def _run(base, snap, **kw):
    return gate.run("beaches", "HEAD", None, False, False, base=str(base),
                    prev_dir=str(snap), **kw)


def test_strict_gate_fails_on_one_lost_row(tmp_path):
    ids = [f"b{i}" for i in range(100)]
    base, snap = _layer(tmp_path, {"AA": ids}, {"AA": ids[:-1]})
    assert _run(base, snap) == 1


def test_bounded_gate_passes_a_small_loss_over_the_layer(tmp_path, capsys):
    a = [f"a{i}" for i in range(100)]
    b = [f"b{i}" for i in range(100)]
    # 1 of 5 rows lost in a small file is 20% of that file but 1 of 200 rows
    # (0.5%) over the layer: the layer is what is judged.
    base, snap = _layer(tmp_path, {"AA": a, "BB": b}, {"AA": a[:-1], "BB": b})
    assert _run(base, snap, max_row_loss=2) == 0
    assert "rows lost over the layer: 1 of 200" in capsys.readouterr().out


def test_bounded_gate_fails_a_thin_rebuild(tmp_path, capsys):
    ids = [f"b{i}" for i in range(100)]
    base, snap = _layer(tmp_path, {"AA": ids}, {"AA": ids[:50]})
    assert _run(base, snap, max_row_loss=2) == 1
    out = capsys.readouterr().out
    assert "rows lost over the layer: 50 of 100 (50.0%, the bound is 2%)" in out


def test_bounded_gate_still_judges_coverage(tmp_path):
    base, snap = tmp_path / "new", tmp_path / "prev"
    p = snap / REL / "AA.json"
    p.parent.mkdir(parents=True)
    p.write_text(json.dumps({"beaches": [{"id": "x", "v5": {"score": 8}}], "listed": []}),
                 encoding="utf-8")
    q = base / REL / "AA.json"
    q.parent.mkdir(parents=True)
    q.write_text(json.dumps({"beaches": [{"id": "x"}], "listed": []}), encoding="utf-8")
    assert _run(base, snap, max_row_loss=2) == 1


def _fake_publish(tmp_path, monkeypatch, argv):
    """Run publish.main with the commands recorded instead of run, and the
    gate passing; returns the commands in the order they would run."""
    ran = []

    class Done:
        returncode = 0

    monkeypatch.setattr(publish, "ROOT", tmp_path)
    monkeypatch.setattr(publish, "SNAP_ROOT", tmp_path / "snap")
    monkeypatch.setattr(publish.subprocess, "run", lambda c, cwd=None: ran.append(c) or Done())
    monkeypatch.setattr(publish.gate, "run", lambda *a, **k: 0)
    assert publish.main(argv) == 0
    return ran


def test_publish_rates_a_rated_layer_before_the_gate(tmp_path, monkeypatch):
    ran = _fake_publish(tmp_path, monkeypatch,
                        ["--layer", "beaches", "--", "py", "export_beaches.py"])
    assert ran == [["py", "export_beaches.py"], publish.RATE_CMD]


def test_publish_does_not_rate_twice_or_when_told_not_to(tmp_path, monkeypatch):
    ran = _fake_publish(tmp_path, monkeypatch,
                        ["--layer", "lakes", "--", "py", "export_lakes.py",
                         "::", "py", "pipeline/nature_tiers.py"])
    assert ran == [["py", "export_lakes.py"], ["py", "pipeline/nature_tiers.py"]]
    ran = _fake_publish(tmp_path, monkeypatch,
                        ["--layer", "peaks", "--no-rate", "--", "py", "export_peaks.py"])
    assert ran == [["py", "export_peaks.py"]]


def test_publish_leaves_unrated_layers_alone(tmp_path, monkeypatch):
    ran = _fake_publish(tmp_path, monkeypatch,
                        ["--layer", "climate", "--", "py", "apply_climate.py"])
    assert ran == [["py", "apply_climate.py"]]


def test_the_outdoor_rebuilds_and_cycling_publish_through_the_gate():
    sys.path.insert(0, str(ROOT))
    from pipeline.tasks import cycling, outdoor
    tasks = {t["key"]: t for t in outdoor.TASKS + cycling.TASKS}
    for key, layer in (("beaches", "beaches"), ("lakes", "lakes"),
                       ("mountains", "peaks"), ("cycling_publish", "cycling")):
        last = tasks[key]["cmds"][-1]
        assert publish.__file__.replace("\\", "/").endswith(last[1]), (key, last)
        assert last[2:4] == ["--layer", layer], (key, last)
        assert "--max-row-loss" in last, (key, last)
