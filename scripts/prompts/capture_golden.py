#!/usr/bin/env python3
"""The byte-identical proof for the prompt registry, Python side (T1140, ROADMAP E5).

    python -I scripts/prompts/capture_golden.py --rev 55a09c9c01

Reads the pipeline jobs' prompt code as it was in commit --rev (git show),
runs it over fixed inputs and writes inputs and exact outputs to
prompts/_golden/py.json. tests/test_prompt_registry.py runs today's code,
which reads the registry, over the same inputs and wants the same text.
The JS twin is scripts/prompts/capture-golden.mjs. Nothing here calls a model.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TRIPS = os.path.join(ROOT, "Trips", "carta-unified", "carta-unified", "pipeline")
OUT = os.path.join(ROOT, "prompts", "_golden", "py.json")


def show(rev, path):
    return subprocess.run(["git", "show", f"{rev}:{path}"], cwd=ROOT, check=True,
                          capture_output=True, text=True, encoding="utf-8").stdout


def load_old(rev, path, name, extra_paths):
    """Import the file as it was at rev, its imports resolved from today's tree."""
    tmp = tempfile.mkdtemp(prefix="carta-golden-")
    to = os.path.join(tmp, os.path.basename(path))
    with open(to, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(show(rev, path))
    for p in extra_paths:
        if p not in sys.path:
            sys.path.append(p)
    spec = importlib.util.spec_from_file_location(name, to)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def retry_expr(src):
    """The retry prompt expression of a run loop, as written at rev."""
    m = re.search(r"prompt = \((user \+ \"\\n\\nYour previous answer.*?)\)\n", src, re.DOTALL)
    if not m:
        raise SystemExit("retry expression not found")
    return "(" + m.group(1) + ")"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rev", required=True)
    rev = ap.parse_args().rev
    dossier = os.path.join(ROOT, "pipeline", "dossier")
    pipe = os.path.join(ROOT, "pipeline")

    intros = load_old(rev, "pipeline/dossier/rewrite_intros.py", "old_intros", [dossier, pipe])
    parking = load_old(rev, "pipeline/dossier/parking_check.py", "old_parking", [dossier, pipe])
    lexicon = load_old(rev, "pipeline/ask_lexicon.py", "old_lexicon", [pipe])
    backfill = load_old(rev, "Trips/carta-unified/carta-unified/pipeline/backfill_modules.py", "old_backfill", [TRIPS])

    dest = {"id": "LIS", "city": "Lisbon (Humberto Delgado)", "country": "Portugal", "lat": 38.7742, "lon": -9.1342,
            "city_lat": 38.7223, "city_lon": -9.1393, "nature": {"nearest": {"name": "Sintra-Cascais", "dist_km": 18}}}
    dest2 = {"id": "BLED", "city": "Bled", "country": "Slovenia", "lat": 46.3683, "lon": 14.1146}
    dossier_full = {
        "place": {"name": "Lisbon (Humberto Delgado)", "country": "Portugal", "class": "city", "categories": ["culture", "food"],
                  "designations": [{"name": "Belem Tower"}, {"kind": "unesco"}], "visit_h": 14.6},
        "intro": {"facts": {"population": 545000}},
        "highlights": [{"name": "Alfama", "rank_score": 0.9}, {"name": "Belem Tower", "rank_score": 0.95}],
        "when": {"best": [4, 5, 9, 10, 13]},
        "verdict": {"score": 8.6, "label": "Excellent"},
        "nearby": {"beaches": [{"name": "Carcavelos"}, {"name": "Costa"}, {"name": "Third"}], "lakes": []},
        "practical": {"getting_there": {"transit": "Metro red line"}},
    }
    items = [(dest, dossier_full, "Lisbon is the capital of Portugal. " * 40), (dest2, {"place": {"name": "Bled"}}, "")]

    errs = ["days[2].places: too few", "summary: too long"]
    user = "THE USER PROMPT"
    trips_src = show(rev, "Trips/carta-unified/carta-unified/pipeline/generate_trip.py")
    back_src = show(rev, "Trips/carta-unified/carta-unified/pipeline/backfill_modules.py")
    env = {"user": user, "errs": errs}

    recs = [{"packingNotes": ["Bring **sun cream**", 3], "whatCouldGoWrong": ["Ferries strike in _August_"]},
            {"packingNotes": [], "whatCouldGoWrong": []}]

    out = {
        "rev": rev,
        "note": "Inputs and exact outputs of the pipeline prompt code at commit rev, before the prompt registry "
                "(T1140). Written by scripts/prompts/capture_golden.py; read by tests/test_prompt_registry.py.",
        "intros.system": intros.SYSTEM,
        "intros.user": [{"input": "items", "output": intros.user_block(items)},
                        {"input": "items[1:]", "output": intros.user_block(items[1:])}],
        "parking.system": parking.SYSTEM,
        "parking.user": [{"input": d["id"], "output": parking.prompt_for(d)} for d in (dest, dest2)],
        "lexicon": [{"input": [lang, label], "output": lexicon.OLLAMA_PROMPT.format(lang=lang, label=label)}
                    for lang, label in (("Dutch", "beach"), ("Polish", "old town"))],
        "trips.retry": eval(retry_expr(trips_src), {}, env),
        "trips.retry.backfill": eval(retry_expr(back_src), {}, env),
        "trips.previous": [backfill.previous_block(r) for r in recs],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"pipeline prompts from {rev} written to {OUT}")


if __name__ == "__main__":
    main()
