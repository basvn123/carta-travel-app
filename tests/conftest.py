"""Shared pytest setup (T1061).

Tests that judge the master dataset. Some tests check app_data/app_data.json,
the 140 MB master the pipeline writes. It is kept out of git (.gitignore), so a
fresh checkout (CI) has only the wire copy, continent-app/public/app_data.json.
sync-data.mjs reshapes that copy on purpose: a taste like ships as [value]
without its fact, and items_full and hires images are dropped. A master-only
test run on the wire fails for that reason alone, which says nothing about the
data.

So the test IDs in tests/needs_master.txt are skipped, with that reason, when
the master is absent. Where the master exists (the laptop, the build box) they
run as before. The list is explicit on purpose: nothing else is ever skipped
this way, and a new master-only test has to be added to the list by name.
"""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
LIST = Path(__file__).with_name("needs_master.txt")


def _needs_master():
    if not LIST.exists():
        return set()
    return {
        line.strip() for line in LIST.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    }


def pytest_collection_modifyitems(config, items):
    if MASTER.exists():
        return
    wanted = _needs_master()
    skip = pytest.mark.skip(
        reason="needs app_data/app_data.json, the master kept outside git; "
               "the wire copy is reshaped (tests/needs_master.txt, T1061)")
    for item in items:
        if item.nodeid in wanted:
            item.add_marker(skip)
