"""Agreement between two labellers of the taxonomy gold set (T1215, row T1149-f; ROADMAP F1).

    python -I pipeline/taxonomy/agreement.py first.csv second.csv [--rows 60] [--json]

Both files have the gold.csv shape (continent-app/scripts/eval/taxonomy/gold.csv):
one row per item, `labels` holding taxonomy ids separated by `;`. The overlap is
the first `--rows` rows of the first file (60 by default, the overlap the
labelling guide asks both labellers to do first; 0 takes every shared row)
whose item both files labelled. `unsure` is not scored.

It prints:
  - Krippendorff's alpha over the item label sets, with MASI distance
    (Passonneau 2006): 1 - Jaccard * M, where M is 1 for identical sets, 2/3
    when one set holds the other, 1/3 when they overlap otherwise, 0 when
    they are disjoint. 0.67 is the usual floor, 0.8 the aim.
  - Cohen's kappa per node: presence or absence of the node on each item,
    worst first, so the definitions to sharpen come out on top.

Standard library only; no model is called.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from fractions import Fraction
from pathlib import Path


def parse_labels(cell: str | None) -> frozenset[str]:
    return frozenset(x.strip() for x in (cell or "").split(";") if x.strip())


def read(path: Path) -> list[tuple[str, frozenset[str]]]:
    with open(path, encoding="utf-8", newline="") as f:
        return [(row["item_id"], parse_labels(row.get("labels"))) for row in csv.DictReader(f)]


def masi(a: frozenset, b: frozenset) -> float:
    """MASI distance between two label sets, 0 (identical) to 1 (disjoint)."""
    if a == b:
        return 0.0
    inter, union = len(a & b), len(a | b)
    if not inter:
        return 1.0
    m = Fraction(2, 3) if (a <= b or b <= a) else Fraction(1, 3)
    return float(1 - Fraction(inter, union) * m)


def krippendorff_alpha(units: list[list[frozenset]], distance=masi) -> float | None:
    """Alpha for units each holding the values two or more coders gave (no missing values inside a unit).

    alpha = 1 - Do / De, with Do the mean within-unit pair distance weighted by 1 / (m_u - 1)
    and De the mean distance over every pair of pairable values (Krippendorff 2011).
    """
    units = [u for u in units if len(u) >= 2]
    values = [v for u in units for v in u]
    n = len(values)
    if n < 2:
        return None
    do = sum(sum(distance(u[i], u[j]) for i in range(len(u)) for j in range(len(u)) if i != j) / (len(u) - 1)
             for u in units) / n
    de = sum(distance(values[i], values[j]) for i in range(n) for j in range(n) if i != j) / (n * (n - 1))
    if de == 0:
        return 1.0 if do == 0 else None
    return 1 - do / de


def cohen_kappa(a: list[bool], b: list[bool]) -> float | None:
    """Cohen's kappa for two binary codings of the same items; None when chance agreement is 1."""
    n = len(a)
    if not n:
        return None
    po = sum(x == y for x, y in zip(a, b)) / n
    pa, pb = sum(a) / n, sum(b) / n
    pe = pa * pb + (1 - pa) * (1 - pb)
    if pe == 1:
        return None
    return (po - pe) / (1 - pe)


def overlap(first, second, rows: int = 60):
    """(item_id, labels_first, labels_second) for the shared, labelled rows; and the count skipped."""
    other = dict(second)
    head = first[:rows] if rows else first
    pairs, skipped = [], 0
    for item, la in head:
        lb = other.get(item)
        if la and lb:
            pairs.append((item, la, lb))
        else:
            skipped += 1
    return pairs, skipped


def agreement(pairs) -> dict:
    alpha = krippendorff_alpha([[a, b] for _, a, b in pairs])
    nodes = sorted({x for _, a, b in pairs for x in a | b})
    per_node = []
    for node in nodes:
        ca = [node in a for _, a, _ in pairs]
        cb = [node in b for _, _, b in pairs]
        per_node.append({"node": node, "first": sum(ca), "second": sum(cb),
                         "both": sum(x and y for x, y in zip(ca, cb)), "kappa": cohen_kappa(ca, cb)})
    per_node.sort(key=lambda r: (r["kappa"] if r["kappa"] is not None else 2, -(r["first"] + r["second"]), r["node"]))
    return {
        "items": len(pairs),
        "alpha_masi": alpha,
        "mean_masi_agreement": (sum(1 - masi(a, b) for _, a, b in pairs) / len(pairs)) if pairs else None,
        "identical_sets": sum(a == b for _, a, b in pairs),
        "per_node": per_node,
    }


def _fmt(x) -> str:
    return "n/a" if x is None else f"{x:.3f}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("first", type=Path)
    ap.add_argument("second", type=Path)
    ap.add_argument("--rows", type=int, default=60, help="overlap rows from the top of the first file (0: all)")
    ap.add_argument("--json", action="store_true", help="print JSON instead of a table")
    args = ap.parse_args(argv)
    pairs, skipped = overlap(read(args.first), read(args.second), args.rows)
    res = agreement(pairs)
    res["skipped_rows"] = skipped
    if args.json:
        print(json.dumps(res, indent=1))
        return 0
    print(f"items scored {res['items']} (skipped {skipped}: unlabelled in one file or missing from the second)")
    print(f"Krippendorff alpha (MASI) {_fmt(res['alpha_masi'])}   mean MASI agreement {_fmt(res['mean_masi_agreement'])}"
          f"   identical sets {res['identical_sets']}")
    print(f"\n{'node':<32}{'first':>6}{'second':>7}{'both':>6}{'kappa':>8}")
    for r in res["per_node"]:
        print(f"{r['node']:<32}{r['first']:>6}{r['second']:>7}{r['both']:>6}{_fmt(r['kappa']):>8}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
