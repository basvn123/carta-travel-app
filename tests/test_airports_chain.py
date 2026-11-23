"""Airports end to end on temp copies (ROADMAP D1, D3; wave 2 step 1.1).

The chain, link by link, on a committed fixture (never the untracked box
record, never a real master):

  1. pipeline: `apply_airport_anchors.patch(master, airports_only=True)` (the
     `airports` task) writes `airports[]` on a temp copy of
     continent-app/scripts/ci/fixtures/contract-min.json;
  2. the committed tests/fixtures/airports_chain_wire.json is that output, so
     the node test (continent-app/tests/airportsFlip.test.mjs) can read it
     without running Python. Refresh with
     `python tests/test_airports_chain.py --write`;
  3. contract: `node scripts/ci/contract.mjs --check` on the output passes
     with the schema's `x-presence: pending` for airports (the 2026-11-12
     refusal was a key the schema did not list);
  4. flip: with a schema clone that sets airports to `some`, the same check
     still passes on the output, and fails on the input (no airports).

Not run here: sync-data.mjs (its paths are fixed to the repo's app_data/ and
public/, and a --src/--out flag was left out of this wave) and the box.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
MASTER = ROOT / "continent-app" / "scripts" / "ci" / "fixtures" / "contract-min.json"
WIRE_FIXTURE = ROOT / "tests" / "fixtures" / "airports_chain_wire.json"
SCHEMA = ROOT / "docs" / "wire.schema.json"
CONTRACT = ROOT / "continent-app" / "scripts" / "ci" / "contract.mjs"
NODE = os.environ.get("CARTA_NODE") or shutil.which("node")


def run_airports_task(tmp: Path) -> dict:
    import airport_access
    import apply_airport_anchors as aaa
    # No GTFS feed on the temp run: the options are the road estimate only.
    airport_access.GTFS_DIR = tmp / "no-gtfs"
    airport_access._feeds_cache = airport_access._NO_FEEDS
    master = tmp / "master.json"
    shutil.copyfile(MASTER, master)
    aaa.patch(master, airports_only=True)
    return json.loads(master.read_text(encoding="utf-8"))


def contract(file: Path, schema: Path | None = None):
    env = {**os.environ, **({"CARTA_WIRE_SCHEMA": str(schema)} if schema else {})}
    p = subprocess.run([NODE, str(CONTRACT), "--check", str(file)], cwd=ROOT / "continent-app",
                       capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    return p.returncode, (p.stdout + p.stderr).strip()


def test_the_airports_task_writes_the_committed_wire_fixture(tmp_path):
    out = run_airports_task(tmp_path)
    places = {k: v for k, v in out["destinations"].items() if v.get("tier") != "airport"}
    assert places and all(v.get("airports") for v in places.values())
    first = places["gem:bruges"]["airports"][0]
    assert first["iata"] == "BRU" and first["options"][0]["source"] == "road_estimate"
    assert json.loads(WIRE_FIXTURE.read_text(encoding="utf-8")) == out, \
        "airports_chain_wire.json is stale: python tests/test_airports_chain.py --write"


@pytest.mark.skipif(not NODE, reason="node not installed")
def test_the_contract_passes_with_pending_and_with_the_flip(tmp_path):
    out = run_airports_task(tmp_path)
    wire = tmp_path / "wire.json"
    wire.write_text(json.dumps(out), encoding="utf-8")
    rc, line = contract(wire)
    assert rc == 0, line
    flipped = json.loads(SCHEMA.read_text(encoding="utf-8"))
    flipped["$defs"]["destination"]["properties"]["airports"]["x-presence"] = "some"
    schema = tmp_path / "schema-some.json"
    schema.write_text(json.dumps(flipped), encoding="utf-8")
    rc, line = contract(wire, schema)
    assert rc == 0, line
    # The write guard is shape only; the shape of an airports item is still enforced.
    out["destinations"]["gem:bruges"]["airports"][0]["surprise"] = 1
    wire.write_text(json.dumps(out), encoding="utf-8")
    rc, line = contract(wire)
    assert rc == 1 and "airports" in line


if __name__ == "__main__" and "--write" in sys.argv:
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        data = run_airports_task(Path(d))
    WIRE_FIXTURE.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {WIRE_FIXTURE}")
