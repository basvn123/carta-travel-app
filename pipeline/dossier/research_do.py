"""
S4, the "best things to do" research sweep: validator and coverage report.

The sweep itself is the 40-source web pass described in the dossier spec: for
each destination, fan out 8-10 searches, collect ~40 unique sources, extract
WHICH activities each source names (never its words), and ship an item only
when at least three distinct registrable domains corroborate it. Results live
one file per destination in cache/dossier/research/{base}.json and are folded
into the dossier by build_dossier.py.

Search execution is not in this file on purpose: the repo has no search API
credential, so sweeps run through the assistant's research agents (or by hand)
against the file contract below. What THIS stage owns is the part that must
never be skipped: validating that every cached file honours the contract, and
reporting which tier-1 destinations still lack research.

  python pipeline/dossier/research_do.py            validate + coverage report
  python pipeline/dossier/research_do.py --strict   exit 1 on any invalid file

Contract per file:
  { id, generated_at, method: "web_sweep_v1", n_usable_sources, of,
    do: [ { name, type: activity|trail|festival|experience|swim,
            detail?, season?: [1-12], link?,
            evidence: { n_sources >= 3, of, urls: [<=3] } } ],
    sources: [url, ...] }

Gates enforced here:
  - evidence.n_sources >= 3 for every item (the corroboration gate; it is the
    ranking, the spam filter and the copyright firewall in one number)
  - n_sources never exceeds the file's own pool of distinct REGISTRABLE
    domains, and every url an item cites appears in `sources`. A gate measured
    against a pool that does not contain the citations is not a gate.
  - n_usable_sources never exceeds the number of sources actually listed
  - no em or en dash in any string (project hard rule)
  - fewer than 8 usable sources -> the file is advisory: build_dossier still
    reads it, but the report flags it, per the small-destination failure mode
    in the spec

ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    DCACHE, PUB, REPORTS, atomic_write_json, dossier_file_base, load_json,
    publisher,
)

RESEARCH_DIR = os.path.join(DCACHE, "research")
TYPES = {"activity", "trail", "festival", "experience", "swim"}
DASH_RE = re.compile("[–—]")


def validate_file(path):
    problems = []
    d = load_json(path)
    if not isinstance(d, dict):
        return ["not valid JSON"], None
    for key in ("id", "method", "do", "sources"):
        if key not in d:
            problems.append(f"missing {key}")

    sources = d.get("sources") or []
    # common.publisher folds country editions and drops aggregators, so the
    # pool is publishers rather than pages.
    pool = len({p for p in (publisher(u) for u in sources) if p})
    # The pool is what the gate is measured against, so it has to contain
    # everything the items cite and it cannot be smaller than the file claims.
    if (d.get("n_usable_sources") or 0) > len(sources):
        problems.append(f"claims {d['n_usable_sources']} usable sources but "
                        f"lists {len(sources)}")

    for i, item in enumerate(d.get("do") or []):
        where = f"do[{i}] {item.get('name', '?')!r}"
        if not item.get("name"):
            problems.append(f"{where}: no name")
        if item.get("type") not in TYPES:
            problems.append(f"{where}: bad type {item.get('type')!r}")
        ev = item.get("evidence") or {}
        if not isinstance(ev.get("n_sources"), int) or ev["n_sources"] < 3:
            problems.append(f"{where}: fails the 3-domain corroboration gate")
        elif ev["n_sources"] > pool:
            problems.append(f"{where}: claims {ev['n_sources']} domains from a "
                            f"pool of {pool}")
        for u in ev.get("urls") or []:
            if u not in sources:
                problems.append(f"{where}: cites {u} which is not in sources")
        for m in item.get("season") or []:
            if not (isinstance(m, int) and 1 <= m <= 12):
                problems.append(f"{where}: bad month {m!r}")

    def walk(o):
        if isinstance(o, str) and DASH_RE.search(o):
            problems.append("em/en dash in a string")
            return True
        if isinstance(o, list):
            return any(walk(x) for x in o)
        if isinstance(o, dict):
            return any(walk(v) for v in o.values())
        return False
    walk(d)
    return problems, d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    os.makedirs(RESEARCH_DIR, exist_ok=True)
    files = [f for f in os.listdir(RESEARCH_DIR) if f.endswith(".json")]
    bad = {}
    thin = []
    ok = 0
    for fn in sorted(files):
        problems, d = validate_file(os.path.join(RESEARCH_DIR, fn))
        if problems:
            bad[fn] = problems
        else:
            ok += 1
            if (d.get("n_usable_sources") or 0) < 8:
                thin.append(fn)

    app = load_json(os.path.join(PUB, "app_data.json")) or {}
    tier1 = [d["id"] for d in (app.get("destinations") or {}).values()
             if (d.get("rating") or {}).get("tier", 0) >= 1]
    have = {fn[:-5] for fn in files}
    missing = [i for i in tier1 if dossier_file_base(i) not in have]

    report = {
        "researched": len(files), "valid": ok, "invalid": bad,
        "thin_sources": thin,
        "tier1_total": len(tier1), "tier1_missing": len(missing),
        "tier1_missing_sample": missing[:40],
    }
    os.makedirs(REPORTS, exist_ok=True)
    atomic_write_json(os.path.join(REPORTS, "dossier_research.json"), report, indent=1)
    print(f"{ok}/{len(files)} research files valid; "
          f"{len(missing)}/{len(tier1)} tier-1 destinations still unresearched")
    for fn, probs in bad.items():
        print(f"  INVALID {fn}: {'; '.join(probs[:4])}")
    if args.strict and bad:
        sys.exit(1)


if __name__ == "__main__":
    main()
