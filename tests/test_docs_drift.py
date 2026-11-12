"""scripts/docs/drift.py fails on seeded drift and passes on the real tree (T1134, ROADMAP B7)."""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "docs" / "drift.py"

LOGIC = """# Test logic (TEST)

## Rules

### TEST-001 A code constant
- Constant: `NIGHTS` in `src/lib.js:3` = 7
- Constant: `SHARE`, `CAP` in `src/lib.js:4` to `:5` = 0.6, 20
- Test: `src/lib.test.mjs` :: "seven nights by default"

### TEST-002 A config key
- Constant: `request.default_nights` in `src/pricing.json:2` = 7
- Constant: `party.limits` / `max_babies` in `src/pricing.json:9` = {...} / 4
- Constant: `GATE` in `pipe/rate.py:2` = 5.4
- Test: no test
"""

FILES = {
    "docs/logic/test.md": LOGIC,
    "src/lib.js": "// lib\n\nexport const NIGHTS = 7;\nconst SHARE = 0.6;\nconst CAP = 20; // seats\n",
    "src/lib.test.mjs": "test('seven nights by default', () => {});\n",
    "src/pricing.json": json.dumps({"rules": {
        "request.default_nights": {"value": 7, "unit": "nights"},
        "party.limits": {"value": {"max_seats": 20, "max_babies": 4}}}}),
    "pipe/rate.py": "# rate\nGATE = 5.4\n",
}


def make_tree(tmp: Path, **override) -> Path:
    for rel, text in {**FILES, **override}.items():
        p = tmp / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    subprocess.run(["git", "init", "-q", str(tmp)], check=True)
    subprocess.run(["git", "-C", str(tmp), "add", "-A"], check=True)
    return tmp


def drift(root: Path, *args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ, CARTA_REPO_ROOT=str(root))
    return subprocess.run([sys.executable, "-I", str(SCRIPT), *args], capture_output=True, text=True, env=env, check=False)


def test_clean_tree_passes(tmp_path):
    r = drift(make_tree(tmp_path), "--only", "logic,tests")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "7/7 constants found" in r.stdout
    assert "6/7 values match" in r.stdout
    assert "1/1 found" in r.stdout


def test_changed_code_value_fails(tmp_path):
    lib = FILES["src/lib.js"].replace("NIGHTS = 7", "NIGHTS = 8")
    r = drift(make_tree(tmp_path, **{"src/lib.js": lib}), "--only", "logic")
    assert r.returncode == 1
    assert "TEST-001: NIGHTS is 8.0 in code, the doc says 7" in r.stdout


def test_positional_value_fails(tmp_path):
    lib = FILES["src/lib.js"].replace("CAP = 20", "CAP = 12")
    r = drift(make_tree(tmp_path, **{"src/lib.js": lib}), "--only", "logic")
    assert r.returncode == 1
    assert "CAP is 12.0 in code, the doc says 20" in r.stdout


def test_removed_constant_fails(tmp_path):
    lib = FILES["src/lib.js"].replace("const SHARE = 0.6;\n", "")
    r = drift(make_tree(tmp_path, **{"src/lib.js": lib}), "--only", "logic")
    assert r.returncode == 1
    assert "TEST-001: SHARE not found in src/lib.js" in r.stdout


def test_config_value_and_sibling_key_fail(tmp_path):
    cfg = json.dumps({"rules": {
        "request.default_nights": {"value": 5},
        "party.limits": {"value": {"max_seats": 20, "max_babies": 3}}}})
    r = drift(make_tree(tmp_path, **{"src/pricing.json": cfg}), "--only", "logic")
    assert r.returncode == 1
    assert "request.default_nights is 5 in code, the doc says 7" in r.stdout
    assert "party.max_babies is 3 in code, the doc says 4" in r.stdout


def test_python_constant_fails(tmp_path):
    r = drift(make_tree(tmp_path, **{"pipe/rate.py": "GATE = 5.0\n"}), "--only", "logic")
    assert r.returncode == 1
    assert "GATE is 5.0 in code, the doc says 5.4" in r.stdout


def test_missing_file_fails(tmp_path):
    root = make_tree(tmp_path)
    (root / "pipe" / "rate.py").unlink()
    r = drift(root, "--only", "logic")
    assert r.returncode == 1
    assert "file pipe/rate.py is gone" in r.stdout


def test_renamed_test_fails(tmp_path):
    r = drift(make_tree(tmp_path, **{"src/lib.test.mjs": "test('a week by default', () => {});\n"}),
              "--only", "tests")
    assert r.returncode == 1
    assert 'test "seven nights by default" is not in src/lib.test.mjs' in r.stdout


def test_baseline_lets_known_drift_pass_and_only_shrinks(tmp_path):
    lib = FILES["src/lib.js"].replace("NIGHTS = 7", "NIGHTS = 8")
    root = make_tree(tmp_path, **{"src/lib.js": lib})
    assert drift(root, "--only", "logic", "--update-baseline").returncode == 0
    assert drift(root, "--only", "logic").returncode == 0
    # The drift is fixed but still listed: the gate asks for the baseline to shrink.
    (root / "src" / "lib.js").write_text(FILES["src/lib.js"], encoding="utf-8")
    r = drift(root, "--only", "logic")
    assert r.returncode == 1 and "FIXED" in r.stdout


def test_entry_point_missing_path_fails(tmp_path):
    root = make_tree(tmp_path)
    (root / "scripts" / "docs").mkdir(parents=True)
    shutil.copy(ROOT / "scripts/docs/check_entry_points.py", root / "scripts/docs/check_entry_points.py")
    (root / "CLAUDE.md").write_text("Read `docs/project-map.md`.\n", encoding="utf-8")
    (root / "docs").mkdir(exist_ok=True)
    (root / "docs" / "project-map.md").write_text("Code in `pipeline/gone_module.py`.\n", encoding="utf-8")
    r = drift(root, "--only", "entry")
    assert r.returncode == 1
    assert "gone_module.py" in r.stdout


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_schema_table_out_of_step_fails(tmp_path):
    root = make_tree(tmp_path)
    (root / "docs").mkdir(exist_ok=True)
    shutil.copy(ROOT / "docs/wire.schema.json", root / "docs/wire.schema.json")
    md = (ROOT / "docs/SCHEMA.md").read_text(encoding="utf-8")
    (root / "docs/SCHEMA.md").write_text(md, encoding="utf-8")
    (root / "continent-app").mkdir()
    for sub in ("scripts", "src"):
        os.symlink(ROOT / "continent-app" / sub, root / "continent-app" / sub)
    assert drift(root, "--only", "schema").returncode == 0
    start = md.index("<!-- wire-table:start")
    row = md.index("\n|", md.index("\n|", start) + 1)  # first row under the header
    seeded = md[:row] + "\n| `seeded_key` | string | seeded by the drift test |" + md[row:]
    (root / "docs/SCHEMA.md").write_text(seeded, encoding="utf-8")
    r = drift(root, "--only", "schema")
    assert r.returncode == 1
    assert "[schema]" in r.stdout


def test_real_tree_has_no_new_drift():
    r = subprocess.run([sys.executable, "-I", str(SCRIPT)], capture_output=True, text=True, check=False)
    assert r.returncode == 0, r.stdout + r.stderr


def _load():
    spec = importlib.util.spec_from_file_location("drift", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["drift"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_literals():
    m = _load()
    assert m.parse_literal("120_000") == 120000
    assert m.parse_literal("7 x 24 x 3600") == 604800
    assert m.parse_literal("['en','nl']") == ["en", "nl"]
    assert m.parse_literal('"priority_10kg"') == "priority_10kg"
    assert m.parse_literal("[5, 6]") == [5, 6]
    with pytest.raises(ValueError):
        m.parse_literal("{ trail 30, water 40 }")
    assert m.same(1, 1.0) and not m.same(True, 1)
