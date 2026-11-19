"""Publish guard: the contract and D2 checks on what is about to go live (D1, D2, D10; wave 1 item 0.3).

The box's step 9 (infra/hetzner/cax11/run_pipeline.sh) calls this before
`push-data.mjs --live`, also in a dry run. `scripts/ship.mjs` should call it
too (a request to the orchestrator: ship.mjs is not data-owned). It runs:

1. the wire contract: `node continent-app/scripts/ci/contract.mjs --check
   <public>/app_data.json`, the assertWire the build's sync-data step runs;
2. the D2 engine (scripts/quality/engine.py run(), check only, nothing
   written), with the history in --out as the baseline for the drop gate;
3. the bed checks, on the served wire and on the staged tree push-data
   uploads (dist-data/dest/*.json, which carry `accommodation`): the
   measured share against rules.yaml `prices.accommodation_measured` and the
   rules.yaml `invariants` (dorm above hotel3 hard, generated_at age soft).

The staged tree has no app_data.json (stage-data.mjs cuts it into dest/
shards), so steps 1 and 2 read public/, the tree this run's build staged
from, and step 3 reads both.

    python -I scripts/quality/publish_guard.py [--public DIR] [--staged DIR]
    python -I scripts/quality/publish_guard.py --override "stopgap 0.2"
    CARTA_PUBLISH_SEED_BREAK=beds python -I scripts/quality/publish_guard.py   # must FAIL

Exit 0 pass (or failed with --override, which prints every failure and the
reason), 1 refused, 2 configuration error. CARTA_PUBLISH_SEED_BREAK=beds|dorm
breaks the loaded wire in memory (beds: 5 points of measured places lose
`captured`; dorm: one place gets a dorm at twice its hotel3), as
CARTA_CI_SEED_BREAK does for the contract, so a dry run can show the guard
refusing without anyone editing a data file.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
APP = ROOT / "continent-app"
PUBLIC = APP / "public"
STAGED = APP / "dist-data"           # what scripts/r2/push-data.mjs uploads
CONTRACT = APP / "scripts" / "ci" / "contract.mjs"
MEASURED_RULE = "prices.accommodation_measured"
SEEDS = ("beds", "dorm")


def _engine():
    if "quality_engine" in sys.modules:
        return sys.modules["quality_engine"]
    spec = importlib.util.spec_from_file_location("quality_engine", HERE / "engine.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["quality_engine"] = mod
    spec.loader.exec_module(mod)
    return mod


def run_contract(app_data: Path) -> tuple[bool, str]:
    node = os.environ.get("CARTA_NODE") or shutil.which("node")
    if not node:
        return False, "node not found, so the contract could not run"
    p = subprocess.run([node, str(CONTRACT), "--check", str(app_data)], cwd=APP,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = (p.stdout + p.stderr).strip()
    return p.returncode == 0, out.splitlines()[0] if out else f"exit {p.returncode}"


def load_staged(staged: Path) -> dict | None:
    """{id: record} from the staged dest shards, or None when there is no staged tree."""
    if not (staged / "_stage.json").is_file() or not (staged / "dest").is_dir():
        return None
    rows = {}
    for f in sorted((staged / "dest").glob("*.json")):
        if f.name.startswith("_"):
            continue
        blob = json.loads(f.read_text(encoding="utf-8"))
        rows.update({k: v for k, v in blob.items() if isinstance(v, dict)})
    return rows


def seed_break(dests: dict, seed: str, br) -> str:
    """Break the loaded wire in memory. Returns what was done."""
    ids = sorted(k for k, d in dests.items() if not d.get("gateway_of"))
    if seed == "beds":
        measured = [k for k in ids if br.is_measured(dests[k].get("accommodation"))]
        n = math.ceil(0.05 * len(ids))
        for k in measured[:n]:
            dests[k]["accommodation"] = {**dests[k]["accommodation"], "captured": None}
        return f"{min(n, len(measured))} measured places lost captured"
    for k in ids:
        acc = dests[k].get("accommodation") or {}
        h3 = (acc.get("beds") or {}).get("hotel3")
        if isinstance(h3, (int, float)):
            dests[k]["accommodation"] = {**acc, "beds": {**acc["beds"], "dorm": 2 * h3}}
            return f"{k} got a dorm at twice its hotel3"
    return "no place with a hotel3 price to break"


def bed_checks(label: str, data: dict, floor: float, invariants: list, now: datetime) -> tuple[list, list]:
    eng = _engine()
    br = eng._scorecard()._bed_rules()
    stats = br.bed_stats(data.get("destinations") or {})
    print(f"  {label}: {stats['measured']} of {stats['places']} places measured "
          f"({stats['measured_share']:.1%}, floor {floor:.0%}), dorm above hotel3 {stats['dorm_above_hotel3']}")
    failures = []
    # A tree with no places has nothing measured: a pass there would be vacuous.
    if not stats["places"] or stats["measured_share"] < floor:
        failures.append({"id": f"{label}.{MEASURED_RULE}", "kind": "hard",
                         "why": f"measured beds {stats['measured_share']:.1%} of {stats['places']} places, "
                                f"under the floor {floor:.0%}"})
    ifail, iwarn = eng.invariants_gate(invariants, data, now)
    failures += [{**f, "id": f"{label}.{f['id']}"} for f in ifail]
    return failures, [{**w, "id": f"{label}.{w['id']}"} for w in iwarn]


def main(argv=None) -> int:
    eng = _engine()
    ap = argparse.ArgumentParser(description="Publish guard: contract + D2 + bed checks before a data publish")
    ap.add_argument("--public", default=str(PUBLIC), help="the served tree this run built from")
    ap.add_argument("--staged", default=str(STAGED), help="the tree push-data.mjs uploads (skipped when absent)")
    ap.add_argument("--rules", default=str(eng.RULES))
    ap.add_argument("--out", default=os.environ.get("CARTA_QUALITY_OUT") or str(eng._scorecard().OUT),
                    help="the engine's history folder (baseline for the drop gate); nothing is written")
    ap.add_argument("--no-validation", action="store_true", help="leave the D23 validation gate out")
    ap.add_argument("--no-contract", action="store_true", help="skip the node contract step (tests)")
    ap.add_argument("--override", default="", help="publish anyway; give the reason (it is printed in the run log)")
    a = ap.parse_args(argv)
    public, staged = Path(a.public).resolve(), Path(a.staged).resolve()
    seed = os.environ.get("CARTA_PUBLISH_SEED_BREAK", "")
    if seed and seed not in SEEDS:
        print(f"publish guard: CARTA_PUBLISH_SEED_BREAK must be one of {', '.join(SEEDS)}", file=sys.stderr)
        return 2
    try:
        cfg = eng.load_rules(Path(a.rules))
    except ValueError as e:
        print(f"publish guard: {e}", file=sys.stderr)
        return 2
    rule = next((r for r in cfg["rules"] if r["id"] == MEASURED_RULE), None)
    if rule is None:
        print(f"publish guard: rules.yaml has no {MEASURED_RULE} rule", file=sys.stderr)
        return 2
    now = datetime.now(timezone.utc)
    failures, warnings = [], []
    app_data = public / "app_data.json"
    if not app_data.is_file():
        print(f"publish guard: REFUSED, {app_data} does not exist")
        return 1

    print(f"publish guard: {public}")
    if not a.no_contract:
        ok, line = run_contract(app_data)
        print(f"  contract: {'pass' if ok else 'FAIL'} ({line})")
        if not ok:
            failures.append({"id": "contract", "kind": "hard", "why": line})

    rc, data = eng.run(public, None, Path(a.out), Path(a.rules), write=False, snapshot=None,
                       validation=None if a.no_validation else eng.VALIDATION)
    if rc == 2:
        for p in data["config_errors"]:
            print(f"publish guard: {p}", file=sys.stderr)
        return 2
    g = data["gate"]
    print(f"  D2 engine: {'pass' if g['ok'] else 'FAIL'}, {g['rules']} rules, {len(g['failures'])} failed")
    failures += [{**f, "id": f"D2.{f['id']}"} for f in g["failures"]]
    warnings += [{**w, "id": f"D2.{w['id']}"} for w in g["warnings"]]

    br = eng._scorecard()._bed_rules()
    wire = json.loads(app_data.read_text(encoding="utf-8"))
    trees = [("wire", wire)]
    rows = load_staged(staged)
    if rows is None:
        print(f"  staged: no staged tree in {staged}, bed checks on the served wire only")
    else:
        trees.append(("staged", {"meta": wire.get("meta") or {}, "destinations": rows}))
    for label, tree in trees:
        if seed:
            print(f"  SEED BREAK {seed} on {label}: {seed_break(tree['destinations'], seed, br)}")
        f, w = bed_checks(label, tree, rule["min"], cfg.get("invariants") or [], now)
        failures += f
        warnings += w

    for w in warnings:
        print(f"  warn {w['id']}: {w['why']}")
    for f in failures:
        print(f"  FAIL {f['id']}: {f['why']}")
    if not failures:
        print("publish guard: PASS")
        return 0
    if a.override:
        print(f"publish guard: OVERRIDE of {len(failures)} failures, reason: {a.override}")
        return 0
    print(f"publish guard: REFUSED, {len(failures)} failures (--override \"reason\" publishes anyway)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
