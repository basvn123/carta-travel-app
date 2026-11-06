"""Self-test of the Semgrep baseline gate (T1119): green on the repo baseline,
red on a seeded new finding. Skips when semgrep is not installed."""
import pathlib
import shutil
import subprocess
import sys

import pytest

REPO = pathlib.Path(__file__).resolve().parents[1]
GATE = REPO / "scripts" / "ci" / "semgrep_gate.py"
needs = pytest.mark.skipif(shutil.which("semgrep") is None, reason="semgrep not installed")


def gate(*args):
    return subprocess.run([sys.executable, str(GATE), *args], capture_output=True, text=True)


def seed(tmp_path, body):
    (tmp_path / "continent-app" / "src").mkdir(parents=True)
    (tmp_path / "continent-app" / "src" / "x.js").write_text(body)
    (tmp_path / "base.json").write_text('{"findings": {}, "triage": {}}')
    return ["--root", str(tmp_path), "--baseline", str(tmp_path / "base.json")]


@needs
def test_repo_is_green_with_baseline():
    r = gate()
    assert r.returncode == 0, r.stdout + r.stderr


@needs
def test_seeded_finding_fails_then_passes_once_baselined(tmp_path):
    args = seed(tmp_path, "const k = 'service_role';\neval(window.name);\n")
    r = gate(*args)
    assert r.returncode == 1 and "NEW semgrep finding" in r.stdout
    assert gate(*args, "--update-baseline").returncode == 0
    assert gate(*args).returncode == 0
    # A second copy of a baselined line is still new.
    (tmp_path / "continent-app" / "src" / "x.js").write_text(
        "const k = 'service_role';\neval(window.name);\neval(window.name);\n")
    assert gate(*args).returncode == 1


@needs
def test_clean_tree_is_green(tmp_path):
    args = seed(tmp_path, "export const a = 1;\n")
    assert gate(*args).returncode == 0
