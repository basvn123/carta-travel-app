"""H11 (T1162): every script the pipeline driver starts runs in Python's UTF-8
mode, so open() without an encoding writes UTF-8 and not cp1252 on Windows
(the "encoding" cluster of What broke entries, audit P-19)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import run_pipeline as rp  # noqa: E402


def test_child_scripts_run_in_utf8_mode(tmp_path):
    out = tmp_path / "child.txt"
    code = (
        "import sys, locale; "
        f"open({str(out)!r}, 'w').write(str(sys.flags.utf8_mode) + ' ' + locale.getpreferredencoding(False) + ' gem:hafnarfjorður')"
    )
    assert rp.run_cmd([sys.executable, "-c", code], cwd=tmp_path) == 0
    flag, enc, word = out.read_text(encoding="utf-8").split(" ")
    assert flag == "1"
    assert enc.lower().replace("-", "") == "utf8"
    assert word == "gem:hafnarfjorður"


def test_windows_launchers_set_utf8_mode():
    for bat in ("run_pipeline.bat", "scripts/stays_scrape.bat"):
        assert 'set "PYTHONUTF8=1"' in (ROOT / bat).read_text(encoding="utf-8"), bat
