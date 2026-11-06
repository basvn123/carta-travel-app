"""T1143 (ROADMAP D3): `_src` and `_asof` on every key block of the wire.

pipeline/provenance.py stamps the blocks inside pipeline_io.atomic_write_json;
pipeline/config/sources.yaml is the registry; pipeline/provenance_sources.py
generates docs/data/sources.md and the schema's source-id enum, and its
--check runs here so CI fails on a stale doc or a registry that disagrees with
the code.
"""
import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import provenance as pv
import wire_contract as wc
from pipeline_io import atomic_write_json

FIXTURE = json.loads((ROOT / "continent-app" / "scripts" / "ci" / "fixtures" / "contract-min.json")
                     .read_text(encoding="utf-8"))
WIRE = ROOT / "continent-app" / "public" / "app_data.json"
TODAY = pv.today_iso()


def payload(version=19, **blocks):
    """The contract fixture, at a schema version, with blocks on BRU."""
    d = copy.deepcopy(FIXTURE)
    d["meta"]["schema_version"] = version
    d["destinations"]["BRU"].update(copy.deepcopy(blocks))
    return d


def test_schema_version_agrees_with_the_contract():
    assert pv.SCHEMA_VERSION == wc.load_schema()["x-schema-version"] == 20


def test_every_object_block_of_the_contract_has_a_source():
    import provenance_sources as ps
    assert sorted(ps.object_blocks(wc.load_schema())) == sorted(pv.key_blocks())


def test_registry_doc_and_enum_are_current():
    """The CI hook: --check fails on a stale doc, a stale enum or a registry
    that disagrees with the ledger, run_pipeline.py or the writers on disk."""
    r = subprocess.run([sys.executable, "-I", str(ROOT / "pipeline" / "provenance_sources.py"), "--check"],
                       capture_output=True, text=True, check=False)
    assert r.returncode == 0, r.stdout + r.stderr


def test_check_catches_a_registry_error():
    import provenance_sources as ps
    reg = copy.deepcopy(pv.load_registry())
    reg["blocks"]["rating"]["src"] = "nowhere"
    reg["sources"]["climate"]["cadence"] = "WEEKLY"
    del reg["blocks"]["crowding"]
    bad = ps.problems(reg, wc.load_schema())
    assert "blocks.rating.src is 'nowhere', not a source" in bad
    assert any(p.startswith("sources.climate.cadence is WEEKLY") for p in bad)
    assert any("destinations.*.crowding is an object block" in p for p in bad)


def test_stamp_payload_stamps_unstamped_blocks_and_lifts_the_version():
    d = payload(rating={"band": "good"}, climate={"m": [], "best": []})
    n = pv.stamp_payload(d, asof="2026-11-06")
    assert n == 2
    assert d["destinations"]["BRU"]["rating"]["_src"] == "carta_rating"
    assert d["destinations"]["BRU"]["climate"] == {"m": [], "best": [], "_src": "climate", "_asof": "2026-11-06"}
    assert d["meta"]["schema_version"] == 20


def test_a_stamped_block_keeps_its_date():
    d = payload(rating={"band": "good", "_src": "carta_rating", "_asof": "2026-06-07"})
    assert pv.stamp_payload(d, asof="2026-11-06") == 0
    assert d["destinations"]["BRU"]["rating"]["_asof"] == "2026-06-07"


def test_touch_makes_the_next_write_date_the_block_today():
    d = payload(costs={"meal_mid_eur": 20, "_src": "carta_food", "_asof": "2026-06-07"})
    pv.touch(d["destinations"]["BRU"]["costs"])
    pv.stamp_payload(d, asof="2026-11-06")
    assert d["destinations"]["BRU"]["costs"]["_asof"] == "2026-11-06"


def test_null_blocks_and_lists_are_not_stamped():
    d = payload(transfer=None, designations=["unesco"])
    assert pv.stamp_payload(d) == 0
    assert d["destinations"]["BRU"]["transfer"] is None


def test_a_newer_schema_is_never_lowered():
    d = payload(version=21)
    pv.stamp_payload(d)
    assert d["meta"]["schema_version"] == 21


@pytest.mark.parametrize("parts", [("app_data", "app_data.json"),
                                   ("continent-app", "public", "app_data.json")])
def test_atomic_write_stamps_the_master_and_the_served_wire(tmp_path, parts):
    out = tmp_path.joinpath(*parts)
    out.parent.mkdir(parents=True)
    atomic_write_json(out, payload(rating={"band": "good", "confidence": "rubric"}))
    got = json.loads(out.read_text(encoding="utf-8"))
    assert got["meta"]["schema_version"] == 20
    assert got["destinations"]["BRU"]["rating"]["_src"] == "carta_rating"
    assert got["destinations"]["BRU"]["rating"]["_asof"] == TODAY
    assert pv.problems(got) == []


def test_other_files_are_not_stamped(tmp_path):
    out = tmp_path / "cache" / "x.json"
    out.parent.mkdir()
    d = payload(rating={"band": "good"})
    atomic_write_json(out, d)
    assert "_src" not in json.loads(out.read_text(encoding="utf-8"))["destinations"]["BRU"]["rating"]


def test_backfill_dates_old_blocks_by_the_wire_stamp(tmp_path):
    out = tmp_path / "app_data" / "app_data.json"
    out.parent.mkdir()
    d = payload(rating={"band": "good"}, costs={"meal_mid_eur": 20})
    out.write_text(json.dumps(d), encoding="utf-8")
    assert pv.main(["--backfill", str(out)]) == 0
    got = json.loads(out.read_text(encoding="utf-8"))
    want = d["meta"]["generated_at"][:10]
    assert {got["destinations"]["BRU"][b]["_asof"] for b in ("rating", "costs")} == {want}
    assert got["meta"]["generated_at"] == d["meta"]["generated_at"], "backfill never restamps the wire"
    assert got["meta"]["schema_version"] == 20


def test_problems_names_each_field_path():
    d = payload(rating={"band": "good", "_src": "nowhere"}, climate={"_src": "climate", "_asof": "June"})
    assert pv.problems(d) == [
        'destinations.BRU.rating._src is "nowhere", not a source in sources.yaml',
        "destinations.BRU.rating._asof is missing",
        'destinations.BRU.climate._asof is "June", expected YYYY-MM-DD',
    ]


def test_in_place_writers_touch_their_block():
    """The two layers that edit a block in place (rather than assign a fresh
    one) must call touch(), or their edits keep the old date."""
    for f, needle in (("pipeline/apply_tourist_premium.py", "touch(costs)"),
                      ("pipeline/apply_airport_anchors.py", "touch(tr)")):
        assert needle in (ROOT / f).read_text(encoding="utf-8"), f


@pytest.mark.skipif(not WIRE.exists(), reason="the shipped wire is not in this checkout")
def test_every_key_block_of_the_shipped_wire_is_stamped():
    data = json.loads(WIRE.read_text(encoding="utf-8"))
    assert data["meta"]["schema_version"] == 20
    assert pv.problems(data) == []
    c = pv.count(data)
    assert all(v["stamped"] == v["total"] for v in c.values()), c
    assert sum(v["total"] for v in c.values()) > 40000
