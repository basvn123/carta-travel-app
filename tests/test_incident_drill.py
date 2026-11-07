"""T1160 (H8): the incident drill runs end to end on the local stack and writes up."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("drill", ROOT / "ops" / "drill" / "drill.py")
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)


def test_drill_walks_all_six_steps():
    steps = drill.run_drill()
    assert [s["step"] for s in steps] == ["baseline", "break", "detect", "page", "roll back", "verify"]
    assert all(s["ok"] for s in steps), steps


def test_write_up_lists_every_step(tmp_path):
    out = tmp_path / "log.md"
    assert drill.main(["--out", str(out)]) == 0
    text = out.read_text(encoding="utf-8")
    for name in ("baseline", "break", "detect", "page", "roll back", "verify"):
        assert f"| {name} |" in text
    assert "—" not in text and "–" not in text


def test_slo_config_ids_unique_and_sourced():
    cfg = json.loads((ROOT / "continent-app" / "config" / "slo.json").read_text(encoding="utf-8"))
    ids = [s["id"] for s in cfg["slos"]]
    assert len(ids) == len(set(ids))
    for s in cfg["slos"]:
        assert s["source"] in cfg["sources"]
        assert s["kind"] in ("ratio", "latency")
