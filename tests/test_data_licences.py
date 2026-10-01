"""The licence ledger rules (T078): a collector or harvester cannot exist
without its registry entries, and docs/tos/data_licenses.md cannot drift
from the registry that generates it.

    pytest tests/test_data_licences.py -q

The negative cases are the point. A test that only asserts the current
roster validates would pass forever; these register a collector without a
row, and invent a harvester file, and assert the rules refuse them.
"""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.ingestion.core import ledger, registry  # noqa: E402
from src.ingestion.core.collector import Collector  # noqa: E402

MIN_COLLECTORS = 29   # a floor, never an equality: the roster may only grow
MIN_HARVESTERS = 28
MIN_ROWS = 150


@pytest.fixture(scope="module")
def live_registry():
    return registry.load_all()


def test_live_registry_validates(live_registry):
    assert registry.validate(live_registry) == []


def test_roster_is_not_vacuous(live_registry):
    assert len(live_registry) >= MIN_COLLECTORS
    assert len(registry.harvester_scripts()) >= MIN_HARVESTERS
    assert len(registry.SOURCES) >= MIN_ROWS


def test_every_collector_carries_its_governance(live_registry):
    for name, cls in live_registry.items():
        assert cls.run is registry.RUNS[name]
        assert cls.sources, name
        assert all(name in s.collectors for s in cls.sources)


def test_register_refuses_a_collector_without_a_row():
    class Orphan(Collector):
        name = "orphan_source_t078"
        group = "test"
        description = "a collector nobody wrote a licence row for"

    with pytest.raises(registry.MissingLicenceRow) as exc:
        registry.register(Orphan)
    assert "orphan_source_t078" in str(exc.value)
    assert "orphan_source_t078" not in registry.REGISTRY


def test_validate_flags_a_collector_without_a_row(live_registry):
    class Orphan(Collector):
        name = "orphan_source_t078"
        group = "test"

    synthetic = dict(live_registry, orphan_source_t078=Orphan)
    problems = registry.validate(synthetic)
    assert any("orphan_source_t078" in p and "RUNS" in p for p in problems)
    assert any("orphan_source_t078" in p and "SOURCES" in p for p in problems)


def test_validate_flags_a_harvester_without_a_row(live_registry):
    scripts = registry.harvester_scripts() + ["pipeline/harvest_orphan_t078.py"]
    problems = registry.validate(live_registry, scripts)
    assert any("harvest_orphan_t078.py" in p and "RUNS" in p for p in problems)
    assert any("harvest_orphan_t078.py" in p and "SOURCES" in p for p in problems)


def test_ledger_file_is_current():
    assert ledger.check() == []


def test_ledger_is_rendered_from_the_registry(live_registry):
    text = ledger.render(live_registry)
    assert text.startswith("<!-- GENERATED FILE.")
    for s in registry.SOURCES:
        assert s.name in text, s.key
    for name in live_registry:
        assert f"`{name}`" in text
    for script in registry.harvester_scripts():
        assert f"`{script}`" in text
