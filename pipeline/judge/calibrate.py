"""The judge's calibration against human labels (T1188, ROADMAP D4 and D23).

Raters: the judge's verdicts on the D4 text sample (evals/truth/judge/
text-sample.json, 50 texts) and the owner's labels (evals/truth/judge/
labels.json). Both are folded to two classes, supported or not, and

  kappa       Cohen's kappa, (p_o - p_e) / (1 - p_e), with its large-sample
              95% interval (as continent-app/scripts/eval/lib/kappa.mjs);
  kappa_low95 the 2.5th percentile of a seeded bootstrap over the items, the
              honest lower bound at 50 items;
  ac1         Gwet's AC1, steadier than kappa when one class is rare
              (reported, not gated);
  planted     the share of the planted faults (text-sample-key.json) each
              rater calls not supported: a recall floor kappa cannot see.

The threshold rule (config.json `threshold`, research in the T1188 report):
the verdicts count only when kappa >= kappa_min AND kappa_low95 >=
kappa_low95_min AND planted recall >= planted_recall_min AND there are at
least min_labels labelled items of which min_not_supported are not supported
AND the labels are a human's (seeded labels never count unless
accept_seeded). Each failed rule is named in `reasons`.
"""
from __future__ import annotations

import math
import random

from .core import binary, config, load_items, load_json

BANDS = ((0.81, "almost perfect"), (0.61, "substantial"), (0.41, "moderate"), (0.21, "fair"),
         (0.0, "slight"), (-math.inf, "poor"))


def _r4(x):
    return None if x is None or not math.isfinite(x) else round(x, 4)


def band(k):
    if k is None:
        return None
    return next(name for floor, name in BANDS if k >= floor)


def cohen_kappa(pairs):
    """{n, missing, po, pe, kappa, se, ci95, band, table} over (a, b) pairs; a pair
    with a None is left out. Same numbers as kappa.mjs cohenKappa."""
    kept = [(a, b) for a, b in pairs if a is not None and b is not None]
    n = len(kept)
    out = {"n": n, "missing": len(pairs) - n, "po": None, "pe": None, "kappa": None, "se": None,
           "ci95": None, "band": None, "table": {}}
    if not n:
        return out
    classes = sorted({str(x) for p in kept for x in p})
    ca = dict.fromkeys(classes, 0)
    cb = dict.fromkeys(classes, 0)
    agree = 0
    for a, b in kept:
        ca[str(a)] += 1
        cb[str(b)] += 1
        agree += str(a) == str(b)
        key = f"{a}|{b}"
        out["table"][key] = out["table"].get(key, 0) + 1
    po = agree / n
    pe = sum((ca[c] / n) * (cb[c] / n) for c in classes)
    out["po"], out["pe"] = _r4(po), _r4(pe)
    if pe == 1:
        out["note"] = "both raters used a single class; kappa undefined"
        return out
    k = (po - pe) / (1 - pe)
    se = math.sqrt(po * (1 - po) / (n * (1 - pe) ** 2))
    out.update(kappa=_r4(k), se=_r4(se), ci95=[_r4(max(-1, k - 1.96 * se)), _r4(min(1, k + 1.96 * se))],
               band=band(k))
    return out


def gwet_ac1(pairs):
    """Gwet's AC1 for two raters: (p_o - p_e) / (1 - p_e), p_e = sum pi_k (1 - pi_k) / (q - 1)."""
    kept = [(a, b) for a, b in pairs if a is not None and b is not None]
    n = len(kept)
    if not n:
        return None
    classes = sorted({str(x) for p in kept for x in p})
    q = max(2, len(classes))
    po = sum(str(a) == str(b) for a, b in kept) / n
    pi = {c: (sum(str(a) == c for a, _ in kept) + sum(str(b) == c for _, b in kept)) / (2 * n) for c in classes}
    pe = sum(p * (1 - p) for p in pi.values()) / (q - 1)
    return _r4((po - pe) / (1 - pe)) if pe != 1 else None


def bootstrap_low(pairs, resamples=2000, seed=1188, q=0.025):
    """The q-quantile of kappa over resamples of the labelled items (seeded, so
    the same labels give the same bound). Resamples where kappa is undefined are
    skipped; None when fewer than half are usable."""
    kept = [(a, b) for a, b in pairs if a is not None and b is not None]
    if len(kept) < 2:
        return None
    rng = random.Random(seed)
    ks = []
    for _ in range(resamples):
        k = cohen_kappa([kept[rng.randrange(len(kept))] for _ in kept])["kappa"]
        if k is not None:
            ks.append(k)
    if len(ks) < resamples / 2:
        return None
    ks.sort()
    return _r4(ks[min(len(ks) - 1, max(0, math.floor(q * len(ks))))])


def calibrate(sample_items, key, labels, verdicts, cfg=None, seeded=False):
    """The calibration of one verdicts file against one set of labels.

    sample_items  the D4 text sample's items
    key           {"planted": {id: fault or None}} (text-sample-key.json)
    labels        {id: "supported" | "unsupported" | "contradicted" | None}
    verdicts      a read_verdicts() result (or None)
    """
    cfg = cfg or config()
    th = cfg.get("threshold") or {}
    bs = cfg.get("bootstrap") or {}
    vs = (verdicts or {}).get("verdicts") or {}
    stale = bool((verdicts or {}).get("stale"))
    rows = []
    for it in sample_items:
        tid = str(it.get("text_id"))
        v = vs.get(tid)
        rows.append({"text_id": tid, "kind": it.get("kind"),
                     "planted": bool(((key or {}).get("planted") or {}).get(tid)),
                     "human": binary((labels or {}).get(tid)),
                     "judge": None if stale else binary(v["verdict"] if v else None)})
    pairs = [(r["judge"], r["human"]) for r in rows]
    k = cohen_kappa(pairs)
    low = bootstrap_low(pairs, int(bs.get("resamples", 2000)), int(bs.get("seed", 1188)))

    def recall(who):
        p = [r for r in rows if r["planted"] and r[who] is not None]
        caught = sum(r[who] == "not" for r in p)
        return {"n": len(p), "caught": caught, "share": _r4(caught / len(p)) if p else None}

    labelled = [r for r in rows if r["human"] is not None]
    not_sup = sum(r["human"] == "not" for r in labelled)
    planted = {"judge": recall("judge"), "human": recall("human")}
    reasons = []
    if not verdicts:
        reasons.append("no judge verdicts on the calibration sample")
    elif stale:
        reasons.append(f"verdicts made on prompt {verdicts.get('prompt_sha')}, current is {verdicts.get('current_sha')}")
    if seeded and not th.get("accept_seeded"):
        reasons.append("labels are seeded, not a human's (T1144-b)")
    if len(labelled) < int(th.get("min_labels", 40)):
        reasons.append(f"{len(labelled)} labelled texts, needs {th.get('min_labels', 40)}")
    if not_sup < int(th.get("min_not_supported", 15)):
        reasons.append(f"{not_sup} labelled not supported, needs {th.get('min_not_supported', 15)}")
    if k["kappa"] is None or k["kappa"] < float(th.get("kappa_min", 0.7)):
        reasons.append(f"kappa {k['kappa']} under {th.get('kappa_min', 0.7)}")
    if low is None or low < float(th.get("kappa_low95_min", 0.5)):
        reasons.append(f"kappa lower 95% bound {low} under {th.get('kappa_low95_min', 0.5)}")
    pr = planted["judge"]["share"]
    if pr is None or pr < float(th.get("planted_recall_min", 0.9)):
        reasons.append(f"planted fault recall {pr} under {th.get('planted_recall_min', 0.9)}")
    return {
        "backend": (verdicts or {}).get("backend"), "model": (verdicts or {}).get("model"),
        "prompt_sha": (verdicts or {}).get("prompt_sha"), "verdicts_file": (verdicts or {}).get("file"),
        "labels": "seeded" if seeded else "human", "labelled": len(labelled), "not_supported": not_sup,
        "kappa": k, "kappa_low95": low, "ac1": gwet_ac1(pairs), "planted": planted,
        "threshold": th, "counts": not reasons, "reasons": reasons, "rows": rows,
    }


def load_labels(cfg=None):
    """(labels, seeded, file): the owner's labels when any are filled, else the seeded ones."""
    cfg = cfg or config()
    paths = cfg.get("labels") or {}
    human = load_json(paths.get("human", ""), {}) or {}
    hl = {k: v for k, v in (human.get("labels") or {}).items() if v}
    if hl:
        return hl, False, paths.get("human")
    seeded = load_json(paths.get("seeded", ""), {}) or {}
    return {k: v for k, v in (seeded.get("labels") or {}).items() if v}, True, paths.get("seeded")


def calibration_for(verdicts, cfg=None):
    """The calibration of a verdicts file on the D4 sample with the labels on disk."""
    cfg = cfg or config()
    paths = cfg.get("labels") or {}
    labels, seeded, lfile = load_labels(cfg)
    cal = calibrate(load_items(paths["sample"]), load_json(paths.get("key", ""), {}), labels, verdicts, cfg, seeded)
    cal["labels_file"] = lfile
    return cal
