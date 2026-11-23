"""Agreement between the drafted labels and the owner's verified rows (G2, D4).

    python evals/truth/agreement.py [--draft evals/truth/draft.csv] [--sheet evals/truth/sheet.csv] [--json]

`draft.csv` holds rows drafted by a Claude Code session from real sources
(status `drafted`, by `claude-draft`). The owner verifies the same rows
independently in `sheet.csv` (status `verified`, without reading the draft).
This script matches rows on (item_id, field) and reports:

- raw agreement: the share of matched rows where the draft's value is right
  under the field's own rule and tolerance (`fields.json`, `run_truth.compare`),
  the same rule the scorer uses against the shipped data;
- Cohen's kappa over the rows whose field is a category (country, loop,
  difficulty, ...), where both raters give a label. Kappa is not defined for
  numbers and coordinates, which are only compared within a tolerance.

While the owner has verified none of the drafted rows it prints "no owner rows
yet" and exits 0. It never writes a file.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def _truth():
    spec = importlib.util.spec_from_file_location("agreement_run_truth", ROOT / "evals" / "run_truth.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def read(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def cohen_kappa(a: list, b: list):
    """Cohen's kappa of two equally long label lists; None when it is undefined
    (no rows, or both raters used one single label, so chance agreement is 1)."""
    n = len(a)
    if n == 0 or n != len(b):
        return None
    po = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] * cb.get(k, 0) for k in ca) / (n * n)
    if pe >= 1:
        return None
    return (po - pe) / (1 - pe)


def compare_sheets(draft: list[dict], sheet: list[dict], fields: dict, truth) -> dict:
    owner = {(r["item_id"], r["field"]): r for r in sheet if r.get("status") == "verified"}
    matched = agree = 0
    labels_d, labels_o, by_field = [], [], {}
    for d in draft:
        if d.get("status") != "drafted":
            continue
        o = owner.get((d["item_id"], d["field"]))
        if o is None:
            continue
        spec = (fields.get(d["kind"]) or {}).get(d["field"])
        if spec is None:
            continue
        outcome, _ = truth.compare(spec, d["verified_value"], o["verified_value"])
        matched += 1
        agree += outcome == "right"
        bf = by_field.setdefault(f"{d['kind']}.{d['field']}", [0, 0])
        bf[0] += outcome == "right"
        bf[1] += 1
        if spec["compare"] in ("exact", "category", "bool"):
            labels_d.append(truth.fold(d["verified_value"]))
            labels_o.append(truth.fold(o["verified_value"]))
    k = cohen_kappa(labels_d, labels_o)
    return {"drafted_rows": sum(r.get("status") == "drafted" for r in draft), "owner_rows": len(owner),
            "matched": matched, "agree": agree,
            "raw_agreement": round(agree / matched, 4) if matched else None,
            "kappa": round(k, 4) if k is not None else None, "kappa_rows": len(labels_d),
            "by_field": {f: {"agree": a, "rows": n} for f, (a, n) in sorted(by_field.items())}}


def render(res: dict) -> str:
    if not res["matched"]:
        return (f"no owner rows yet: {res['drafted_rows']} drafted rows, none verified in sheet.csv "
                f"({res['owner_rows']} verified rows in the sheet in all)")
    lines = [f"matched {res['matched']} of {res['drafted_rows']} drafted rows; raw agreement "
             f"{res['agree']}/{res['matched']} = {res['raw_agreement']:.1%}"]
    lines.append("Cohen's kappa " + (f"{res['kappa']:.2f} over {res['kappa_rows']} category rows"
                                     if res["kappa"] is not None else "not defined (too few rows or one label)"))
    lines += [f"  {f}: {v['agree']}/{v['rows']}" for f, v in res["by_field"].items()]
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Drafted labels against the owner's verified rows (G2)")
    ap.add_argument("--draft", default=str(HERE / "draft.csv"))
    ap.add_argument("--sheet", default=str(HERE / "sheet.csv"))
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    for p in (a.draft, a.sheet):
        if not Path(p).is_file():
            print(f"agreement: {p} not found", file=sys.stderr)
            return 2
    fields = json.loads((HERE / "fields.json").read_text(encoding="utf-8"))["fields"]
    res = compare_sheets(read(Path(a.draft)), read(Path(a.sheet)), fields, _truth())
    print(json.dumps(res, ensure_ascii=False) if a.json else render(res))
    return 0


if __name__ == "__main__":
    sys.exit(main())
