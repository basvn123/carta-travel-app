"""The stays manifest names the contract it was built under (owner sweep round 2,
2026-11-12): it said 18 through v19 and v20 because the number was typed in.
Run: python -m pytest tests/test_stays_manifest_schema.py"""
import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from provenance import SCHEMA_VERSION  # noqa: E402


def test_manifest_schema_reads_the_contract_constant():
    tree = ast.parse((ROOT / "pipeline" / "stays" / "build_stays.py").read_text(encoding="utf-8"))
    values = [v for d in ast.walk(tree) if isinstance(d, ast.Dict)
              for k, v in zip(d.keys, d.values)
              if isinstance(k, ast.Constant) and k.value == "schema"]
    assert values, "build_stays.py writes no manifest 'schema' key"
    assert all(isinstance(v, ast.Name) and v.id == "SCHEMA_VERSION" for v in values)
    assert SCHEMA_VERSION >= 20
