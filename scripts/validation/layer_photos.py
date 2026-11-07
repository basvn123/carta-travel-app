"""Hero photo correctness on the D23 validation runner (T1198, ROADMAP D17 and D2).

References are the heroes the latest photo check sampled
(pipeline/photos/correctness.py, data/reports/photo_check/<date>.json); the
stratum is the row's country. Carta's side is that report's verdicts. The
check itself runs in the pipeline task photo_check; this layer only turns its
verdicts into the runner's shares, so the flag rate gets a baseline, a
95% interval and a place in the D2 quality gate (scripts/quality/engine.py
reads every layer's latest result through gate_from_disk).

  flags   matched    the hero has a verdict (coverage);
          flagged    the hero was flagged: a strong cheap signal (a map, an
                     emblem, a portrait, a wrong-place coordinate) or the
                     vision check said it does not show the place. THE D2
                     rule: hard, lower is better, 2 points of tolerance;
          unsure     neither tier could decide (soft: a rising share means
                     the vision tier is off or the cheap signals got weaker);
          replaced   on a flagged hero only: the ladder held an ok candidate.

Inputs: CARTA_PHOTO_CHECK (a report file; default the newest report in
data/reports/photo_check/). No network, no model.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "data" / "reports" / "photo_check"

NAME = "photos"
SHARE = 1.0
MIN_PER_COUNTRY = 5
GAPS = 40

CHECKS = [
    {"metric": "flagged", "kind": "hard", "direction": "lower", "tolerance_points": 2, "min_n": 100},
    {"metric": "unsure", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 100},
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 100},
]


def _report_path(ctx):
    p = ctx.get("report") or os.environ.get("CARTA_PHOTO_CHECK")
    if p:
        return Path(p)
    files = sorted(REPORTS.glob("????-??-??.json")) if REPORTS.is_dir() else []
    return files[-1] if files else None


def _report(ctx):
    if "_report" not in ctx:
        path = _report_path(ctx)
        try:
            ctx["_report"] = json.loads(path.read_text(encoding="utf-8")) if path else {}
        except (OSError, ValueError):
            ctx["_report"] = {}
        ctx["_path"] = path
    return ctx["_report"]


def references(ctx):
    return [{"id": f"{r['layer']}:{r['id']}", "countries": [r.get("cc") or "??"], "row": r}
            for r in _report(ctx).get("results") or []]


def load(ctx):
    rep = _report(ctx)
    return {"verdicts": {f"{r['layer']}:{r['id']}": r for r in rep.get("results") or []}}


def match(refs, carta):
    v = carta.get("verdicts") or {}
    out = []
    for ref in refs:
        r = v.get(ref["id"]) or {}
        got = (r.get("hero") or {}).get("verdict")
        known = got in ("ok", "flag", "unsure")
        out.append({
            "id": ref["id"], "country": ref["countries"][0],
            "flags": {"matched": known,
                      "flagged": (got == "flag") if known else None,
                      "unsure": (got == "unsure") if known else None,
                      "replaced": (r.get("action") == "replace") if got == "flag" else None},
            "note": got,
            "_name": r.get("name"), "_url": (r.get("hero") or {}).get("url"),
            "_reasons": ((r.get("hero") or {}).get("cheap") or {}).get("reasons"),
            "_action": r.get("action"),
        })
    return out


def gaps(results):
    """The heroes to look at: flagged and left in place first, then flagged and replaced."""
    order = {"review": 0, "replace": 1}
    bad = sorted((r for r in results if r["note"] == "flag"), key=lambda r: (order.get(r["_action"], 2), r["id"]))
    return [{"id": r["id"], "country": r["country"], "name": r["_name"], "url": r["_url"],
             "reasons": r["_reasons"], "action": r["_action"]} for r in bad[:GAPS]]


def describe(ctx, carta):
    rep = _report(ctx)
    return {"reference": {"path": str(ctx.get("_path")) if ctx.get("_path") else None,
                          "salt": rep.get("salt"), "sample": rep.get("sample")},
            "carta": {"check": rep.get("generated_at"), "vision": rep.get("vision"),
                      "metadata": rep.get("metadata"), "totals": rep.get("totals")}}
