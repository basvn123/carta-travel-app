"""Validate rating v5 rubric scores, and merge the passing shards (T758).

Tier: Manual (after each rubric scoring shard)

Checks one shard's data/rating/rubric_scores/shard_XX.json against its fact
cards and docs/RATING_RUBRIC.md:
  - the schema and the ranges (appeal 0-10 with one decimal, five criteria
    0-10, confidence high|medium|low, known flags, sources as URLs)
  - the band matches the appeal
  - six languages present, each reason at most 25 words, no em dash anywhere
  - every card id covered exactly once, no other id
  - at most 10 web sources per shard; a thin_card flag with no source is low
    confidence, and a low-confidence score stays at 7.5 or below unless a
    source backs it
  - the five hidden controls do not lean one way: their signed mean gap to
    the hand scores stays within 0.5 (owner decision 2026-10-27); the mean
    absolute gap of 0.5 is held on all controls pooled, in the --all run
    (skipped with --schema-only, which is what a scorer runs: it never reads
    data/rating/hidden/)

Usage:
    python validate_rubric_scores.py 03                 # full check of shard 03
    python validate_rubric_scores.py 03 --schema-only   # the scorer's own check
    python validate_rubric_scores.py 03 --merge         # join parts/ first
    python validate_rubric_scores.py --all --write      # check every shard and
                                                        # write app_data/rubric_appeal.json
    python validate_rubric_scores.py handcheck --merge   # the blind hand-score
                                                        # check (no controls, never merged)
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CARDS = ROOT / "data" / "rating" / "fact_cards"
SCORES = ROOT / "data" / "rating" / "rubric_scores"
HIDDEN = ROOT / "data" / "rating" / "hidden" / "scorer_hidden.jsonl"
MERGED = ROOT / "app_data" / "rubric_appeal.json"

N_SHARDS = 15
LANGS = ("en", "nl", "de", "fr", "es", "it")
CRITERIA = ("setting", "character", "sights", "atmosphere", "uniqueness")
CONFIDENCE = ("high", "medium", "low")
FLAGS = {"thin_card", "class_mismatch", "name_ambiguous", "data_conflict",
         "duplicate_suspect", "airport_named", "beyond_class"}
BANDS = (("exceptional", 9.0), ("excellent", 8.3), ("very_good", 7.6),
         ("good", 6.9), ("pleasant", 6.0), ("none", -1.0))
MAX_WORDS = 25
MAX_SOURCES = 10
LOW_CAP = 7.5
CONTROL_MAX_GAP = 0.5      # mean absolute gap, all controls pooled
CONTROL_MAX_BIAS = 0.5     # signed mean gap, per shard
# Shards the owner accepted despite a lean, with the reason. They still count
# in the pooled mean gap.
ACCEPTED_LEAN = {
    6: ("owner 2026-10-27: two attempts leaned +1.24 and +0.78, driven by the two "
        "lowest hand scores in the batch (Tuzla 3.0, Burgas 4.5); the shard is the "
        "strictest (58% under 6.0), a third redo would only push it lower"),
}
EM_DASH = "—"


def band_of(appeal):
    return next(name for name, lo in BANDS if appeal >= lo - 1e-9)


def name(shard):
    """shard_03, or handcheck for the blind hand-score sample."""
    return shard if isinstance(shard, str) else f"shard_{shard:02d}"


def card_ids(shard):
    path = CARDS / f"{name(shard)}.jsonl"
    return [json.loads(line)["id"] for line in path.read_text(encoding="utf-8").splitlines() if line]


def merge_parts(shard):
    """Join data/rating/rubric_scores/shard_XX/part_*.json into shard_XX.json
    in card order. A scorer writes its shard in parts of about 40."""
    rows = []
    for p in sorted((SCORES / name(shard)).glob("part_*.json")):
        rows += json.loads(p.read_text(encoding="utf-8"))
    order = {did: k for k, did in enumerate(card_ids(shard))}
    rows.sort(key=lambda r: order.get(r.get("id"), len(order)))
    out = SCORES / f"{name(shard)}.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return out


def check_row(r):
    """Problems with one score row, as strings."""
    p = []
    did = r.get("id")
    a = r.get("appeal")
    if not isinstance(a, (int, float)) or not 0 <= a <= 10 or round(a, 1) != a:
        p.append(f"{did}: appeal {a!r} is not 0-10 with one decimal")
        return p
    if r.get("band") != band_of(a):
        p.append(f"{did}: band {r.get('band')!r} does not match appeal {a} ({band_of(a)})")
    crit = r.get("criteria") or {}
    for c in CRITERIA:
        v = crit.get(c)
        if not isinstance(v, (int, float)) or not 0 <= v <= 10:
            p.append(f"{did}: criterion {c} {v!r} is not 0-10")
    extra = set(crit) - set(CRITERIA)
    if extra:
        p.append(f"{did}: unknown criteria {sorted(extra)}")
    why = r.get("why") or {}
    for lang in LANGS:
        text = why.get(lang)
        if not isinstance(text, str) or not text.strip():
            p.append(f"{did}: why.{lang} missing")
        elif len(text.split()) > MAX_WORDS:
            p.append(f"{did}: why.{lang} has {len(text.split())} words (max {MAX_WORDS})")
    conf = r.get("confidence")
    if conf not in CONFIDENCE:
        p.append(f"{did}: confidence {conf!r}")
    flags = r.get("flags")
    if not isinstance(flags, list) or set(flags) - FLAGS:
        p.append(f"{did}: flags {flags!r} (known: {sorted(FLAGS)})")
        flags = []
    sources = r.get("sources")
    if not isinstance(sources, list) or any(
            not isinstance(s, str) or not re.match(r"https?://", s) for s in sources):
        p.append(f"{did}: sources must be a list of URLs")
        sources = []
    if "thin_card" in flags and not sources and conf != "low":
        p.append(f"{did}: thin_card with no source must be low confidence")
    if conf == "low" and not sources and a > LOW_CAP:
        p.append(f"{did}: low confidence with no source above {LOW_CAP}")
    if EM_DASH in json.dumps(r, ensure_ascii=False):
        p.append(f"{did}: em dash")
    return p


def check_shard(shard, schema_only):
    """(problems, rows, control summary or None)."""
    path = SCORES / f"{name(shard)}.json"
    if not path.exists():
        return [f"{name(shard)}: {path.relative_to(ROOT)} missing"], [], None
    rows = json.loads(path.read_text(encoding="utf-8"))
    problems = []
    want = card_ids(shard)
    got = [r.get("id") for r in rows]
    dup = sorted({i for i in got if got.count(i) > 1})
    missing = sorted(set(want) - set(got))
    extra = sorted(set(got) - set(want))
    if dup:
        problems.append(f"ids scored more than once: {dup[:10]}")
    if missing:
        problems.append(f"{len(missing)} card ids not scored: {missing[:10]}")
    if extra:
        problems.append(f"ids not in the shard: {extra[:10]}")
    for r in rows:
        problems += check_row(r)
    urls = {s for r in rows for s in (r.get("sources") or []) if isinstance(s, str)}
    if len(urls) > MAX_SOURCES:
        problems.append(f"{len(urls)} web sources (max {MAX_SOURCES} per shard)")

    controls = None
    if not schema_only and isinstance(shard, int):
        hidden = [json.loads(line) for line in HIDDEN.read_text(encoding="utf-8").splitlines() if line]
        ctl = {h["id"]: h["hand_appeal"] for h in hidden
               if h["role"] == "control" and h["shard"] == shard}
        by_id = {r.get("id"): r for r in rows}
        gaps = {i: round(by_id[i]["appeal"] - hand, 1) for i, hand in ctl.items()
                if i in by_id and isinstance(by_id[i].get("appeal"), (int, float))}
        mean = sum(abs(g) for g in gaps.values()) / len(gaps) if gaps else None
        bias = sum(gaps.values()) / len(gaps) if gaps else None
        controls = {"gaps": gaps,
                    "mean_abs_gap": None if mean is None else round(mean, 2),
                    "bias": None if bias is None else round(bias, 2)}
        # Owner decision 2026-10-27: five controls are too few for a mean
        # absolute gap per shard (two scorers both put Roskilde a point above
        # its hand score), so a shard fails on a one-way lean only; the 0.5
        # mean gap is held on all controls pooled (--all).
        if bias is not None and abs(bias) > CONTROL_MAX_BIAS and shard in ACCEPTED_LEAN:
            controls["accepted"] = ACCEPTED_LEAN[shard]
        elif bias is None or abs(bias) > CONTROL_MAX_BIAS:
            problems.append(f"hidden controls lean {bias:+.2f} beyond "
                            f"+-{CONTROL_MAX_BIAS}: redo the shard")
    return problems, rows, controls


def summary(rows):
    bands = {}
    for r in rows:
        bands[r.get("band")] = bands.get(r.get("band"), 0) + 1
    conf = {}
    for r in rows:
        conf[r.get("confidence")] = conf.get(r.get("confidence"), 0) + 1
    return f"bands {bands}  confidence {conf}"


def write_merged(all_rows):
    """Every rubric score except the hidden controls (hand scores win, and
    the controls are hand-scored) into app_data/rubric_appeal.json."""
    hidden = {json.loads(line)["id"]: json.loads(line)
              for line in HIDDEN.read_text(encoding="utf-8").splitlines() if line}
    out = {}
    for shard, rows in all_rows:
        for r in rows:
            if (hidden.get(r["id"]) or {}).get("role") == "control":
                continue
            out[r["id"]] = {k: r[k] for k in ("appeal", "band", "criteria", "why",
                                               "confidence", "flags", "sources")}
            out[r["id"]]["shard"] = shard
    MERGED.write_text(json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                      encoding="utf-8")
    return len(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("shard", nargs="?",
                    type=lambda v: v if v == "handcheck" else int(v))
    ap.add_argument("--schema-only", action="store_true")
    ap.add_argument("--merge", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    shards = range(1, N_SHARDS + 1) if args.all else [args.shard]
    failed = 0
    passing = []
    pooled = []
    for s in shards:
        if args.merge:
            merge_parts(s)
        problems, rows, controls = check_shard(s, args.schema_only)
        status = "FAIL" if problems else "pass"
        line = f"{name(s)}: {status}  {len(rows)} rows  {summary(rows)}"
        if controls:
            line += (f"  controls lean {controls['bias']:+.2f} mean gap "
                     f"{controls['mean_abs_gap']} {controls['gaps']}")
            pooled += list(controls["gaps"].values())
            if controls.get("accepted"):
                line += f"  (lean accepted: {controls['accepted']})"
        print(line)
        for p in problems[:40]:
            print("   ", p)
        if problems:
            failed += 1
        else:
            passing.append((s, rows))
    if args.all and pooled:
        mean = sum(abs(g) for g in pooled) / len(pooled)
        bias = sum(pooled) / len(pooled)
        ok = mean <= CONTROL_MAX_GAP
        print(f"all controls pooled ({len(pooled)}): mean gap {mean:.2f}, lean {bias:+.2f}: "
              f"{'pass' if ok else 'FAIL'} (max {CONTROL_MAX_GAP})")
        if not ok:
            failed += 1
    if args.write:
        if failed:
            print(f"{failed} shard(s) fail: not writing {MERGED.name}")
        else:
            print(f"{write_merged(passing)} rubric scores -> {MERGED.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
