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
import importlib.util
import sys
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


# Two modules are called validate: the trips dataset's
# (Trips/carta-unified/carta-unified/pipeline/validate.py) and the trails
# one (pipeline/trails/validate.py). A trail test imports the second at
# collection, so the trips gate's own lazy `import validate` would get it from
# the cache and fail with "no attribute validate" whenever the whole suite
# runs (T1068). The trips test files are listed by what they import: for each
# of their tests the trips validate is the one in sys.modules.
TRIPS_PIPELINE = ROOT / "Trips" / "carta-unified" / "carta-unified" / "pipeline"
_trips_validate = None


def trips_validate():
    """The trips dataset's validate module, loaded from its path once, without
    leaving anything in sys.modules."""
    global _trips_validate
    if _trips_validate is None:
        spec = importlib.util.spec_from_file_location("validate", TRIPS_PIPELINE / "validate.py")
        _trips_validate = importlib.util.module_from_spec(spec)
        saved = sys.modules.get("validate")
        sys.modules["validate"] = _trips_validate
        try:
            spec.loader.exec_module(_trips_validate)
        finally:
            if saved is None:
                sys.modules.pop("validate", None)
            else:
                sys.modules["validate"] = saved
    return _trips_validate


@pytest.fixture(autouse=True)
def _own_validate_module(request):
    path = str(getattr(request.node, "fspath", "") or "")
    if not _uses_trips(path):
        yield
        return
    saved = sys.modules.get("validate")
    sys.modules["validate"] = trips_validate()
    try:
        yield
    finally:
        if saved is None:
            sys.modules.pop("validate", None)
        else:
            sys.modules["validate"] = saved


def _uses_trips(path):
    return Path(path).name in TRIPS_TESTS


TRIPS_TESTS = {
    "test_backfill_modules.py", "test_expand_catalogue.py", "test_fill_type_specific.py",
    "test_generate_trip.py", "test_golden_set.py", "test_review_queue.py", "test_trip_accuracy.py",
    "test_trip_confidence.py", "test_trip_critic.py", "test_word_caps.py",
}
