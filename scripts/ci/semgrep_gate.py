#!/usr/bin/env python3
"""Semgrep baseline gate (T1119, ROADMAP C7).

Runs Semgrep with the committed rules in .semgrep/carta.yml and compares the
findings with .semgrep/baseline.json. Today's triaged findings pass; a finding
that is not in the baseline fails the run.

A finding is fingerprinted by (rule, path, sha1 of its normalised source text),
not by line number, so moving code around does not turn old findings into new
ones. The baseline stores a count per fingerprint: adding a second copy of an
already baselined line is still a new finding.

  python scripts/ci/semgrep_gate.py                    # gate (CI)
  python scripts/ci/semgrep_gate.py --update-baseline  # after triage only
  python scripts/ci/semgrep_gate.py --root DIR         # scan another tree (self-test)
"""
import argparse
import collections
import hashlib
import json
import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
RULES = REPO / ".semgrep" / "carta.yml"
BASELINE = REPO / ".semgrep" / "baseline.json"


def run_semgrep(root, rules):
    cmd = ["semgrep", "scan", "--config", str(rules), "--json", "--quiet",
           "--metrics=off", "--disable-version-check", "--no-git-ignore", str(root)]
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=root)
    if p.returncode not in (0, 1) or not p.stdout.strip():
        sys.exit("semgrep failed (%s):\n%s" % (p.returncode, p.stderr[-2000:]))
    data = json.loads(p.stdout)
    # A rule that cannot parse a file is a blind spot, but vendored or minified
    # files raise these; only a rule error (not a file error) is fatal.
    for e in data.get("errors", []):
        if e.get("type") in ("RuleParseError", "InvalidRuleSchemaError") or "Rule parse error" in e.get("message", ""):
            sys.exit("rule error: " + e.get("message", "")[:500])
    return data.get("results", [])


def fingerprints(results, root):
    root = pathlib.Path(root).resolve()
    counts = collections.Counter()
    where = {}
    cache = {}
    for r in results:
        path = pathlib.Path(r["path"])
        rel = path.relative_to(root).as_posix() if path.is_absolute() else path.as_posix()
        if rel not in cache:
            try:
                cache[rel] = (root / rel).read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                cache[rel] = []
        lines = cache[rel][r["start"]["line"] - 1:r["end"]["line"]]
        text = re.sub(r"\s+", " ", " ".join(lines)).strip()
        key = "%s|%s|%s" % (r["check_id"].split(".")[-1], rel,
                            hashlib.sha1(text.encode()).hexdigest()[:12])
        counts[key] += 1
        where.setdefault(key, "%s:%d" % (rel, r["start"]["line"]))
    return counts, where


def new_findings(counts, baseline):
    allowed = baseline.get("findings", {})
    return {k: n - allowed.get(k, {}).get("count", 0) for k, n in counts.items()
            if n > allowed.get(k, {}).get("count", 0)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(REPO))
    ap.add_argument("--rules", default=str(RULES))
    ap.add_argument("--baseline", default=str(BASELINE))
    ap.add_argument("--update-baseline", action="store_true")
    a = ap.parse_args()
    root = pathlib.Path(a.root).resolve()
    counts, where = fingerprints(run_semgrep(root, a.rules), root)
    bpath = pathlib.Path(a.baseline)
    base = json.loads(bpath.read_text()) if bpath.exists() else {"findings": {}, "triage": {}}

    if a.update_baseline:
        old = base.get("findings", {})
        base["findings"] = {k: {"count": n, "at": where[k]} for k, n in sorted(counts.items())}
        for k in base["findings"]:
            if k in old and "note" in old[k]:
                base["findings"][k]["note"] = old[k]["note"]
        bpath.write_text(json.dumps(base, indent=1, sort_keys=True) + "\n")
        print("baseline written: %d fingerprints, %d findings" % (len(counts), sum(counts.values())))
        return 0

    new = new_findings(counts, base)
    gone = sum(1 for k in base.get("findings", {}) if k not in counts)
    if gone:
        print("note: %d baselined finding(s) no longer occur; run --update-baseline to shrink the baseline" % gone)
    if new:
        for k, n in sorted(new.items()):
            print("::error::NEW semgrep finding %s (x%d) at %s" % (k.split("|")[0], n, where[k]))
        print("%d new finding(s). Fix them, or triage and add to the baseline (docs/security/static-analysis.md)." % len(new))
        return 1
    print("semgrep gate: %d findings, all in the baseline" % sum(counts.values()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
