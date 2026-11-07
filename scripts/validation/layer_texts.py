"""Texts on the D23 validation runner (T1188): the calibrated LLM judge as the text check.

References are the texts to check, each with the source it cites (the item
shape of pipeline/judge/core.py). The stratum is the text kind (place_blurb,
trail_summary, trip_text, ask_answer, translation), not a country: the
runner's per-country table reads per kind for this layer. Carta's side is the
judge's verdicts on those texts: one verdicts file of either backend (session
or gemini) made on the current `judge-text` prompt.

  flags   matched       the text has a usable verdict on the current prompt
                        (coverage: how much of the set was judged);
          judged_supported  the raw verdict is supported (always reported,
                        never gated: an uncalibrated judge's share);
          supported     the same, but only when the judge's calibration
                        counts (pipeline/judge/config.json `threshold`):
                        otherwise None, so the gate's check warns
                        "insufficient" instead of passing or failing on a
                        judge nobody trusts yet;
          contradicted  as supported, for the contradicted share.

The calibration is the same backend's verdicts on the D4 sample (newest
current file in pipeline/judge/calibration/judgments/) against the D4
labels: the human's when filled, else the seeded ones, which never count.

Inputs (environment, so the runner's CLI stays the same for every layer):
  CARTA_JUDGE_ITEMS     the texts (default: the D4 text sample, until T1196
                        collects the shipped texts per release)
  CARTA_JUDGE_VERDICTS  the verdicts on them (default: the newest current
                        file in pipeline/judge/calibration/judgments/)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.judge import calibrate as cal
from pipeline.judge import core

NAME = "texts"
SHARE = 1.0
MIN_PER_COUNTRY = 5
GAPS = 30

CHECKS = [
    {"metric": "supported", "kind": "hard", "direction": "higher", "tolerance_points": 2, "min_n": 30},
    {"metric": "contradicted", "kind": "soft", "direction": "lower", "tolerance_points": 2, "min_n": 30},
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
]


def _items_path(ctx):
    return ctx.get("items") or os.environ.get("CARTA_JUDGE_ITEMS") or core.config()["labels"]["sample"]


def references(ctx):
    items = core.load_items(_items_path(ctx))
    ctx["_items"] = {core.item_id(it): it for it in items}
    return [{"id": core.item_id(it), "countries": [core.kind_of(it)], "item": it} for it in items]


def load(ctx):
    path = ctx.get("verdicts") or os.environ.get("CARTA_JUDGE_VERDICTS")
    verdicts = core.read_verdicts(path) if path else core.newest_verdicts(core.JUDGMENTS_DIR)
    calib = None
    if verdicts:
        cv = core.newest_verdicts(core.JUDGMENTS_DIR, backend=verdicts.get("backend"))
        calib = cal.calibration_for(cv)
        calib.pop("rows", None)
    ctx["_verdicts"], ctx["_cal"] = verdicts, calib
    return {"verdicts": verdicts, "calibration": calib}


def match(refs, carta):
    v = carta.get("verdicts") or {}
    counts = bool((carta.get("calibration") or {}).get("counts"))
    usable = v and not v.get("stale")
    out = []
    for ref in refs:
        verdict = ((v.get("verdicts") or {}).get(ref["id"]) or {}) if usable else {}
        got = verdict.get("verdict")
        judged = got in core.VERDICTS
        raw_sup = (got == "supported") if judged else None
        out.append({
            "id": ref["id"], "country": ref["countries"][0],
            "flags": {"matched": judged, "judged_supported": raw_sup,
                      "supported": raw_sup if counts else None,
                      "contradicted": (got == "contradicted") if (judged and counts) else None},
            "note": got,
            "_reason": verdict.get("reason"),
            "_claims": [c for c in verdict.get("claims") or [] if c.get("verdict") != "supported"][:5],
            "_subject": ref["item"].get("subject"),
        })
    return out


def gaps(results):
    """The texts to review by hand: contradicted first, then unsupported, up to 30."""
    order = {"contradicted": 0, "unsupported": 1}
    bad = sorted((r for r in results if r["note"] in order), key=lambda r: (order[r["note"]], r["id"]))
    return [{"id": r["id"], "kind": r["country"], "subject": r["_subject"], "verdict": r["note"],
             "reason": r["_reason"], "claims": r["_claims"]} for r in bad[:GAPS]]


def describe(ctx, carta):
    v = carta.get("verdicts") or {}
    c = carta.get("calibration") or {}
    return {
        "reference": {"path": str(_items_path(ctx)), "kinds": sorted({core.kind_of(it) for it in ctx["_items"].values()})},
        "carta": {
            "judge": {"backend": v.get("backend"), "model": v.get("model"), "prompt": v.get("prompt"),
                      "prompt_sha": v.get("prompt_sha"), "stale": v.get("stale"), "file": v.get("file")},
            "calibration": {"counts": c.get("counts", False), "reasons": c.get("reasons") or ["no verdicts"],
                            "labels": c.get("labels"), "kappa": (c.get("kappa") or {}).get("kappa"),
                            "kappa_low95": c.get("kappa_low95"), "ac1": c.get("ac1"),
                            "planted_recall": ((c.get("planted") or {}).get("judge") or {}).get("share")},
        },
    }
