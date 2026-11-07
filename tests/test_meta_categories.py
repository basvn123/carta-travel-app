"""T1215 (row T1149-i): app_data meta.categories lists exactly the categories in the data.

pipeline_io.atomic_write_json sets it on every write of the master and the
served wire (pipeline_io.sync_meta_categories), so a category no place holds
drops out and one a later step adds gets in. The shipped wire changes on the
next pipeline write; until then the live check below reports, not fails.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from pipeline_io import atomic_write_json, sync_meta_categories

FIXTURE = json.loads((ROOT / "continent-app" / "scripts" / "ci" / "fixtures" / "contract-min.json")
                     .read_text(encoding="utf-8"))


def payload(meta_categories):
    d = json.loads(json.dumps(FIXTURE))
    d["meta"]["categories"] = meta_categories
    return d


def used(d):
    return sorted({c for x in d["destinations"].values() for c in x.get("categories") or []})


def test_sync_drops_stale_and_adds_missing():
    d = payload(["palace", "city"])
    assert sync_meta_categories(d) is True
    assert d["meta"]["categories"] == used(d)
    assert "palace" not in d["meta"]["categories"] and "medieval" in d["meta"]["categories"]
    assert sync_meta_categories(d) is False, "idempotent"


def test_no_meta_categories_is_left_alone():
    d = json.loads(json.dumps(FIXTURE))
    d["meta"].pop("categories", None)
    assert sync_meta_categories(d) is False
    assert "categories" not in d["meta"]


@pytest.mark.parametrize("parts", [("app_data", "app_data.json"),
                                   ("continent-app", "public", "app_data.json")])
def test_atomic_write_syncs_the_master_and_the_served_wire(tmp_path, parts):
    out = tmp_path.joinpath(*parts)
    out.parent.mkdir(parents=True)
    atomic_write_json(out, payload(["palace"]))
    got = json.loads(out.read_text(encoding="utf-8"))
    assert got["meta"]["categories"] == used(got)


def test_other_files_keep_their_meta(tmp_path):
    out = tmp_path / "cache" / "x.json"
    out.parent.mkdir()
    atomic_write_json(out, payload(["palace"]))
    assert json.loads(out.read_text(encoding="utf-8"))["meta"]["categories"] == ["palace"]
