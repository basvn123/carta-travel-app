"""Plan the remaining S4 research sweep: who still needs it, batched to hand out.

The sweep itself (see research_do.py) is a web pass with no API credential in
this repo, so it runs through research agents a batch at a time. This script
is the bookkeeping around that: it reads the catalogue, subtracts what
cache/dossier/research/ already holds, groups the rest by PLACE rather than by
destination id, and prints ready-to-paste batch assignments.

Grouping by place matters twice over. Rome ships as FCO and CIA, London as
four airports: researching each id separately would spend four sweeps on one
city and then disagree with itself. One sweep per place, written to every
sibling file with only "id" changed, keeps them identical by construction.

  python pipeline/dossier/plan_research.py                  status only
  python pipeline/dossier/plan_research.py --tier 2         plan tier 2+
  python pipeline/dossier/plan_research.py --tier 1 --batches 0 8
  python pipeline/dossier/plan_research.py --copy-siblings  fill sibling files

--copy-siblings is the repair for a half-finished group: where one id of a
place has a research file and its siblings do not, it copies the content
across with the id rewritten. Run it after every wave.

ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import PUB, DCACHE, dossier_file_base, load_json  # noqa: E402

RESEARCH_DIR = os.path.join(DCACHE, "research")
PER_BATCH = 6
# "Rome (Fiumicino)" and "Rome (Ciampino)" are one place with two airports.
PAREN_RE = re.compile(r"\s*\([^)]*\)\s*$")


def place_key(dest):
    return (PAREN_RE.sub("", dest.get("city") or "").strip(), dest.get("iso2"))


def groups_needing_research(min_tier):
    dests = (load_json(os.path.join(PUB, "app_data.json")) or {}).get("destinations", {})
    os.makedirs(RESEARCH_DIR, exist_ok=True)
    have = {f[:-5] for f in os.listdir(RESEARCH_DIR) if f.endswith(".json")}

    groups = {}
    for did, d in dests.items():
        if (d.get("rating") or {}).get("tier", 0) < min_tier:
            continue
        key = place_key(d)
        g = groups.setdefault(key, {
            "city": key[0], "country": d.get("country"), "score": 0, "ids": [],
        })
        g["ids"].append({"id": did, "file": dossier_file_base(did)})
        g["score"] = max(g["score"], (d.get("rating") or {}).get("score") or 0)

    todo, partial, done = [], [], 0
    for g in groups.values():
        missing = [x for x in g["ids"] if x["file"] not in have]
        if not missing:
            done += 1
        elif len(missing) < len(g["ids"]):
            partial.append({"from": next(x for x in g["ids"] if x["file"] in have),
                            "need": missing, "city": g["city"]})
        else:
            todo.append(g)
    todo.sort(key=lambda g: -g["score"])   # famous places first: most read, most gain
    return todo, partial, done, len(groups)


def copy_siblings(partial):
    for p in partial:
        src = load_json(os.path.join(RESEARCH_DIR, p["from"]["file"] + ".json"))
        if not src:
            continue
        for x in p["need"]:
            rec = dict(src, id=x["id"])
            with open(os.path.join(RESEARCH_DIR, x["file"] + ".json"), "w",
                      encoding="utf-8") as f:
                json.dump(rec, f, ensure_ascii=False)
            print(f"  copied {p['city']}: {p['from']['file']} -> {x['file']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", type=int, default=2,
                    help="minimum rating tier to plan for (default 2)")
    ap.add_argument("--batches", nargs=2, type=int, metavar=("FROM", "TO"),
                    help="print assignment text for these batch numbers")
    ap.add_argument("--copy-siblings", action="store_true")
    args = ap.parse_args()

    todo, partial, done, total = groups_needing_research(args.tier)
    print(f"tier {args.tier}+: {done}/{total} places researched, "
          f"{len(todo)} to go, {len(partial)} with sibling files to fill")

    if args.copy_siblings and partial:
        copy_siblings(partial)
        return

    batches = [todo[i:i + PER_BATCH] for i in range(0, len(todo), PER_BATCH)]
    print(f"{len(batches)} batches of {PER_BATCH}")
    if not args.batches:
        return
    lo, hi = args.batches
    for i in range(lo, min(hi, len(batches))):
        print(f"\n=== BATCH {i} ===")
        for g in batches[i]:
            files = " AND ".join(
                f"cache\\dossier\\research\\{x['file']}.json (\"id\": \"{x['id']}\")"
                for x in g["ids"])
            print(f"- {g['city']}, {g['country']} -> {files}")


if __name__ == "__main__":
    main()
