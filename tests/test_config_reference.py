"""scripts/docs/config_reference.py (T1165, T1217): the reference finds readers
through an argument, keeps notes and test-only keys out of the dead list, and
its --check enforces the BOUNDS."""
import copy
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("config_reference", ROOT / "scripts" / "docs" / "config_reference.py")
cr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cr)


def test_bounds_hold_on_the_real_config():
    assert cr.bound_failures() == []


def test_a_lambda_outside_its_range_fails(monkeypatch):
    real = cr.load

    def fake(rel):
        data = copy.deepcopy(real(rel))
        if rel.endswith("rating.json"):
            data["match"]["lambda"] = 3
            data["match"]["conflicts"]["busy"] = 0.4
        if rel.endswith("rating_anchors.json"):
            data["bands"][0]["min"] = 9.1
        return data

    monkeypatch.setattr(cr, "load", fake)
    fails = cr.bound_failures()
    assert any("match.lambda 3" in f for f in fails)
    assert any("match.conflicts.busy" in f for f in fails)
    assert any("rating_anchors.json bands" in f for f in fails)


def test_argument_alias_makes_the_parameter_a_root():
    files = {
        "a/hook.js": ["import config from '../config/x.json';",
                      "import { evaluateAll } from './lib.js';",
                      "export function useX(snap, cfg = config) {",
                      "  return [evaluateAll(cfg, snap), cfg.window_days];",
                      "}"],
        "a/lib.js": ["export function evaluateAll(conf, snapshot) {",
                     "  const warn = conf.burn?.warn_below;",
                     "  return conf.slos.map((s) => s.id);",
                     "}"],
    }
    cr._DEFS.clear()
    cr._CL.clear()
    try:
        roots = cr.roots_map(["a/hook.js"], files, "x.json")
        assert "cfg" in roots["a/hook.js"][0]
        assert "conf" in roots["a/lib.js"][0]
        hits = cr.find_readers(("burn", "warn_below"), files, ["a/hook.js"], base="x.json", roots_of=roots)
        assert ("a/lib.js", 2, "key") in hits
        rows = cr.find_readers(("slos", "[uptime]"), files, ["a/hook.js"], base="x.json", roots_of=roots)
        assert ("a/lib.js", 3, "rows") in rows
    finally:
        cr._DEFS.clear()
        cr._CL.clear()


def test_notes_and_wildcards():
    assert cr.note_of("continent-app/config/slo.json", "sources.uptime")
    assert cr.note_of("continent-app/config/slo.json", "window_days") is None
    assert cr.note_of("continent-app/config/pricing.json", "version")
