"""T151: the numeric typeSpecific slots are derived from the master and nothing else.

Runs from the repo root:

    python -m pytest tests/test_fill_type_specific.py -q
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "Trips" / "carta-unified" / "carta-unified"
sys.path.insert(0, str(DATASET / "pipeline"))

import fill_type_specific as F  # noqa: E402


def test_self_test_passes():
    assert F.cmd_self_test() == 0


def test_files_agree_with_a_fresh_derivation():
    """The master, the 253 single files and the basis file are what the rules give today."""
    assert F.cmd_check() == 0


def test_every_style_has_a_numeric():
    master = F._read(F.MASTER)
    seen = {}
    for t in master["trips"]:
        got = any(t["typeSpecific"].get(s) is not None for s in F.SLOTS)
        seen[t["tripTypeSlug"]] = seen.get(t["tripTypeSlug"], 0) + got
    assert len(seen) == 10
    assert min(seen.values()) >= 1, seen
