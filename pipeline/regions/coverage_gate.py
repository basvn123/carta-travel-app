"""The coverage gate: fail the build when the country contract is broken.

Spec 0.4 promises that for every country and every section Carta either
publishes the floor or prints a reason code. coverage.py builds that contract
(reports/coverage_contract.json). This file judges it. It is standard library
only, so CI can run it without the geo stack or any data.

Three rules fail the gate:
  1. A cell is missing, blank, or has a status other than ok, fail or na.
  2. A cell that is not passing has no reason code from the contract's own
     list, or has a code and no detail sentence.
  3. A cell that is marked ok publishes fewer rows than its floor, which
     would be a pass the numbers do not support.
With --baseline there is a fourth: a cell that was ok in the baseline may not
stop being ok. That ratchet is what blocks a regression in a country that is
already covered, with no decision needed about which countries matter.

Usage:
  python pipeline/regions/coverage_gate.py --check reports/coverage_contract.json
  python pipeline/regions/coverage_gate.py --check C --baseline B
  python pipeline/regions/coverage_gate.py --check C --write-baseline B
  python pipeline/regions/coverage_gate.py --self-test

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
from pathlib import Path

FALLBACK_CODES = ("no_open_data", "way_only_not_derived", "failed_continuity",
                  "below_quota", "not_applicable", "licence_blocked",
                  "pending_partnership")
STATUSES = ("ok", "fail", "na")


def violations(contract, baseline=None):
    """Every way the contract breaks the rules, one sentence each."""
    out = []
    codes = tuple(contract.get("reason_codes") or FALLBACK_CODES)
    countries = contract.get("countries") or {}
    layers = list((contract.get("floors") or {}).keys())
    if not countries:
        return ["the contract has no countries"]
    if not layers:
        return ["the contract names no sections"]
    for cc, by_layer in countries.items():
        for layer in layers:
            cell = by_layer.get(layer)
            where = f"{cc}/{layer}"
            if not cell:
                out.append(f"{where}: no cell")
                continue
            status = cell.get("status")
            if status not in STATUSES:
                out.append(f"{where}: status {status!r} is not ok, fail or na")
                continue
            if status == "ok":
                if cell.get("published", 0) < cell.get("floor", 0):
                    out.append(f"{where}: marked ok with {cell.get('published')}"
                               f" published against a floor of {cell.get('floor')}")
                continue
            if cell.get("code") not in codes:
                out.append(f"{where}: {status} with no reason code "
                           f"({cell.get('published')} of {cell.get('floor')})")
            elif not (cell.get("detail") or "").strip():
                out.append(f"{where}: code {cell['code']} has no detail")
    if baseline:
        for key in baseline.get("ok", []):
            cc, layer = key.split("/")
            cell = (countries.get(cc) or {}).get(layer)
            if not cell or cell.get("status") != "ok":
                now = cell.get("status") if cell else "missing"
                out.append(f"{key}: was ok in the baseline, now {now}")
    return out


def baseline_of(contract):
    ok = sorted(f"{cc}/{layer}" for cc, bl in contract["countries"].items()
                for layer, cell in bl.items() if cell.get("status") == "ok")
    return {"version": "coverage_gate_baseline_v1", "ok": ok}


def _seeded():
    cell = {"status": "ok", "published": 12, "floor": 12}
    return {"floors": {"trail": 12, "lake": 15}, "reason_codes": list(FALLBACK_CODES),
            "countries": {"AA": {"trail": dict(cell),
                                 "lake": {"status": "fail", "published": 3,
                                          "floor": 15, "code": "below_quota",
                                          "detail": "harvest bounded"}}}}


def self_test():
    """Every rule must fire on a seeded fault, and a clean contract must pass."""
    good = _seeded()
    assert not violations(good), "clean contract should pass"
    base = baseline_of(good)
    assert base["ok"] == ["AA/trail"], base
    cases = {}
    c = _seeded(); c["countries"]["AA"]["lake"].pop("code"); cases["no code"] = c
    c = _seeded(); c["countries"]["AA"]["lake"]["code"] = "because"; cases["bad code"] = c
    c = _seeded(); c["countries"]["AA"]["lake"]["detail"] = ""; cases["no detail"] = c
    c = _seeded(); del c["countries"]["AA"]["lake"]; cases["missing cell"] = c
    c = _seeded(); c["countries"]["AA"]["trail"]["status"] = "maybe"; cases["bad status"] = c
    c = _seeded(); c["countries"]["AA"]["trail"]["published"] = 2; cases["ok under floor"] = c
    c = _seeded(); c["countries"] = {}; cases["empty"] = c
    for name, bad in cases.items():
        assert violations(bad), f"rule did not fire: {name}"
    reg = _seeded()
    reg["countries"]["AA"]["trail"] = {"status": "fail", "published": 2, "floor": 12,
                                       "code": "below_quota", "detail": "x"}
    assert violations(reg, base), "ratchet did not fire"
    assert not violations(good, base), "ratchet fired on an unchanged contract"
    print(f"coverage_gate self-test: clean passes, {len(cases) + 1} seeded faults caught")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", metavar="CONTRACT")
    ap.add_argument("--baseline", metavar="FILE")
    ap.add_argument("--write-baseline", metavar="FILE")
    ap.add_argument("--require", action="store_true",
                    help="a missing contract fails instead of warning")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.check:
        ap.error("give --check or --self-test")
    path = Path(args.check)
    if not path.exists():
        msg = f"{path} is not committed, so the contract is NOT being enforced"
        if args.require:
            print(f"FAIL: {msg}")
            return 1
        print(f"WARNING: {msg}")
        return 0
    contract = json.loads(path.read_text(encoding="utf-8"))
    if args.write_baseline:
        Path(args.write_baseline).write_text(
            json.dumps(baseline_of(contract), indent=1) + "\n", encoding="utf-8")
        print(f"baseline written to {args.write_baseline}")
    baseline = None
    if args.baseline and Path(args.baseline).exists():
        baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    elif args.baseline:
        print(f"WARNING: baseline {args.baseline} not found, ratchet skipped")
    bad = violations(contract, baseline)
    for line in bad[:100]:
        print(f"  {line}")
    if bad:
        print(f"FAIL: {len(bad)} coverage contract violations")
        return 1
    print("coverage contract holds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
