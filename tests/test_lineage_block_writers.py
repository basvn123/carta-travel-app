"""T1214 (register row T1143-h): the block writers in docs/architecture/lineage-fields.json
and in pipeline/config/sources.yaml `blocks` cannot drift apart.

scripts/docs/build_lineage.py check_block_writers() compares them; this test runs
it on the repo (so CI's pytest catches a drift) and on a seeded drift both ways.
"""
from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def _lineage():
    spec = importlib.util.spec_from_file_location("build_lineage", ROOT / "scripts" / "docs" / "build_lineage.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _curated():
    return json.loads((ROOT / "docs" / "architecture" / "lineage-fields.json").read_text(encoding="utf-8"))


def test_repo_block_writers_agree():
    assert _lineage().check_block_writers(_curated()) == []


def test_a_writer_in_one_list_only_fails(tmp_path):
    bl = _lineage()
    reg = yaml.safe_load((ROOT / "pipeline" / "config" / "sources.yaml").read_text(encoding="utf-8"))
    reg["blocks"]["climate"]["writers"].append("pipeline/apply_place_layer.py")
    p = tmp_path / "sources.yaml"
    p.write_text(yaml.safe_dump(reg), encoding="utf-8")
    errs = bl.check_block_writers(_curated(), p)
    assert errs == ["block climate: writer pipeline/apply_place_layer.py is in sources.yaml but not in lineage-fields.json"]

    cur = copy.deepcopy(_curated())
    cur["fields"]["destinations.*.climate"]["writers"].append("pipeline/apply_beauty_layer.py")
    errs = bl.check_block_writers(cur)
    assert errs == ["block climate: writer pipeline/apply_beauty_layer.py is in lineage-fields.json but not in sources.yaml"]


def test_oneoff_scripts_are_not_block_writers():
    cur = copy.deepcopy(_curated())
    cur["fields"]["destinations.*.climate"]["writers"].append("pipeline/oneoff/add_famous_small_gems.py")
    assert _lineage().check_block_writers(cur) == []
