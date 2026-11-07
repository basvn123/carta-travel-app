"""The judge's command line (T1188), run through scripts/validation/judge.py:

    python -I scripts/validation/judge.py prompts --items evals/truth/judge/text-sample.json --out <dir>
        session backend: one prompt file per text and manifest.json; a Claude
        Code session reads them and writes a verdicts file by hand
    python -I scripts/validation/judge.py check-session <verdicts.json> --manifest <dir>/manifest.json
    python -I scripts/validation/judge.py gemini --items <items.json> --out <verdicts.json> [--model <id>]
        Gemini through the pipeline gateway (needs GEMINI_API_KEY)
    python -I scripts/validation/judge.py fixtures
        the Gemini path on pipeline/judge/fixtures with recorded answers, no network
    python -I scripts/validation/judge.py seed-labels
        the seeded labels (not a human's) from T1144's blind session verdicts and the planted key
    python -I scripts/validation/judge.py calibrate [--verdicts <file>] [--write]
        kappa, its bootstrap lower bound, AC1 and planted recall against the
        D4 labels, and whether the verdicts count under config.json
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys

from . import backends
from . import calibrate as cal
from .core import (
    CALIBRATION_DIR,
    HERE,
    JUDGMENTS_DIR,
    config,
    load_items,
    load_json,
    now_iso,
    read_verdicts,
    rel,
    write_json,
)

FIXTURES = os.path.join(HERE, "fixtures")
SEEDED_FROM = "evals/truth/judge/judgments/session-2026-11-06-rubric1.json"


class _Reply:
    def __init__(self, obj):
        self._b = json.dumps(obj).encode("utf-8")

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fixture_opener(answers):
    """A urllib stand-in that answers each Gemini request with the recorded answer
    for the fixture whose subject is in the prompt."""
    def opener(req, timeout=None):
        prompt = json.loads(req.data.decode("utf-8"))["contents"][0]["parts"][0]["text"]
        subj = next((s for s in answers if f'"subject": {json.dumps(s)}' in prompt), None)
        if subj is None:
            raise AssertionError("fixture: no answer for this prompt")
        return _Reply({"candidates": [{"content": {"parts": [{"text": json.dumps(answers[subj])}]}}],
                       "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1}})
    return opener


def run_fixtures(cfg=None):
    items = load_items(os.path.join(FIXTURES, "fixture-items.json"))
    ans = load_json(os.path.join(FIXTURES, "fixture-answers.json"))
    j = backends.GeminiJudge(cfg, env={"GEMINI_API_KEY": "fixture-not-a-key"}, opener=fixture_opener(ans["answers"]),
                             sleep=lambda s: None, models=["fixture-model"])
    j.gw.min_interval_s = 0
    return j.run(items, "pipeline/judge/fixtures/fixture-items.json"), ans["expected"]


def seed_labels(cfg=None):
    """Seeded labels for the calibration path until the owner labels (T1144-b):
    T1144's blind session verdicts (rubric 1, made without the key), set to
    'unsupported' on every planted text the key names. Not a human's labels:
    calibrate() never lets them count unless config accept_seeded is true."""
    cfg = cfg or config()
    src = load_json(SEEDED_FROM, {}) or {}
    key = load_json(cfg["labels"]["key"], {}) or {}
    labels = {}
    for tid, v in sorted((src.get("verdicts") or {}).items()):
        verdict = (v or {}).get("verdict")
        if (key.get("planted") or {}).get(tid) and verdict == "supported":
            verdict = "unsupported"
        labels[tid] = verdict
    return {"seeded": True,
            "note": ("SEEDED, NOT A HUMAN'S LABELS (T1188). T1144's blind session judge verdicts on rubric 1, "
                     "corrected to unsupported where the planted key names a fault. They exercise the calibration "
                     "path only; the owner's labels in evals/truth/judge/labels.json replace them (T1144-b)."),
            "from": [SEEDED_FROM, cfg["labels"]["key"]], "at": now_iso(), "labels": labels}


def _print_cal(c):
    k = c["kappa"]
    print(f"judge {c['backend']} ({c['model']}), prompt {c['prompt_sha']}, labels {c['labels']} "
          f"({c['labelled']} labelled, {c['not_supported']} not supported)")
    print(f"  kappa {k['kappa']} ({k['band']}), 95% {k['ci95']}, bootstrap low {c['kappa_low95']}, AC1 {c['ac1']}, "
          f"n {k['n']}, table {k['table']}")
    print(f"  planted caught: judge {c['planted']['judge']}, human {c['planted']['human']}")
    print(f"  verdicts {'COUNT' if c['counts'] else 'do not count'}" + ("" if c["counts"] else ": " + "; ".join(c["reasons"])))


def main(argv=None):
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(prog="judge.py", description="The D23 text judge (T1188)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prompts")
    p.add_argument("--items", required=True)
    p.add_argument("--out", required=True)
    p = sub.add_parser("check-session")
    p.add_argument("verdicts")
    p.add_argument("--manifest")
    p = sub.add_parser("gemini")
    p.add_argument("--items", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--model")
    sub.add_parser("fixtures")
    p = sub.add_parser("seed-labels")
    p.add_argument("--out", default=config()["labels"]["seeded"])
    p = sub.add_parser("calibrate")
    p.add_argument("--verdicts", help="a verdicts file on the D4 sample (default: the newest current one)")
    p.add_argument("--write", action="store_true", help="write pipeline/judge/calibration/calibration-<backend>.json")
    a = ap.parse_args(argv)

    if a.cmd == "prompts":
        man = backends.write_prompts(load_items(a.items), a.out, a.items)
        print(f"{len(man['ids'])} prompts written to {a.out} (prompt {man['prompt']} v{man['prompt_version']}, "
              f"{man['prompt_sha']})")
        return 0
    if a.cmd == "check-session":
        _, problems = backends.read_session(a.verdicts, a.manifest)
        for pr in problems:
            print(f"  {pr}")
        print(f"session verdicts: {'OK' if not problems else f'{len(problems)} problems'}")
        return 1 if problems else 0
    if a.cmd == "gemini":
        if not os.environ.get("GEMINI_API_KEY"):
            print("GEMINI_API_KEY is not set: the Gemini judge is off here", file=sys.stderr)
            return 2
        j = backends.GeminiJudge(models=[a.model] if a.model else None)
        out = j.run(load_items(a.items), a.items)
        print(f"{len(out['verdicts'])} verdicts by {out['model']} written to {backends.save(out, a.out)}")
        return 0
    if a.cmd == "fixtures":
        out, expected = run_fixtures()
        ok = 0
        for tid, want in expected.items():
            got = (out["verdicts"].get(tid) or {}).get("verdict")
            ok += got == want
            print(f"{tid} {got} (expected {want})")
        print(f"fixtures: {ok} of {len(expected)} as expected")
        return 0 if ok == len(expected) else 1
    if a.cmd == "seed-labels":
        blob = seed_labels()
        print(f"{sum(1 for v in blob['labels'].values() if v)} seeded labels written to {rel(write_json(a.out, blob))}")
        return 0
    if a.cmd == "calibrate":
        from .core import newest_verdicts
        v = read_verdicts(a.verdicts) if a.verdicts else newest_verdicts(JUDGMENTS_DIR)
        c = cal.calibration_for(v)
        _print_cal(c)
        if a.write and v:
            path = os.path.join(CALIBRATION_DIR, f"calibration-{v['backend']}.json")
            print(f"wrote {rel(write_json(path, {**c, 'at': now_iso()}))}")
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
