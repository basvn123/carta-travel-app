"""Write a contact sheet's verdicts into the evaluation set.

The sheet is read by eye; this is how the reading gets recorded. It
takes the numbers off the sheet and writes them into
evalset/manifest.json, carrying three things the sweep needs:

  label      good or bad
  why        a reason code, so a rejection can be counted by KIND later
  by         who judged it. Human labels and model-made labels are both
             legitimate and they are not the same evidence, so the
             manifest says which, and a later human pass can overrule.

It also records `emb` (the Commons file title where one is known), so
evalset.py can reuse the embedding rescore already cached rather than
recomputing it under a URL key.

    python pipeline/photos/label_sheet.py lake_veto \
        --bad 1,2,3,4 --why board-or-sign --by claude-vision
    python pipeline/photos/label_sheet.py lake_worst --good 5,9

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MANIFEST = HERE / "evalset" / "manifest.json"
SHEETS = ROOT / "cache" / "photos" / "sheets"


def numbers(text):
    return {int(n) for n in str(text or "").replace(" ", "").split(",")
            if n}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("sheet")
    ap.add_argument("--good", default="")
    ap.add_argument("--bad", default="")
    ap.add_argument("--why", default="")
    ap.add_argument("--by", default="claude-vision")
    args = ap.parse_args()

    index = json.loads((SHEETS / f"{args.sheet}.json")
                       .read_text(encoding="utf-8"))
    by_n = {row["n"]: row for row in index}
    rows = json.loads(MANIFEST.read_text(encoding="utf-8")) \
        if MANIFEST.exists() else []
    by_img = {r["img"]: r for r in rows}

    written = 0
    for label, picked in (("good", numbers(args.good)),
                          ("bad", numbers(args.bad))):
        for n in sorted(picked):
            src = by_n.get(n)
            if src is None:
                print(f"  no {n} on this sheet, skipped")
                continue
            row = by_img.get(src["img"])
            if row is None:
                row = {"category": src["category"], "row": src.get("row", ""),
                       "name": src.get("name", ""), "img": src["img"]}
                rows.append(row)
                by_img[src["img"]] = row
            row["label"] = label
            row["why"] = args.why if label == "bad" else ""
            row["by"] = args.by
            row["sheet"] = args.sheet
            if src.get("file"):
                row["emb"] = src["file"]
            written += 1

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(rows, ensure_ascii=False, indent=1),
                        encoding="utf-8")
    labelled = sum(1 for r in rows if r.get("label"))
    print(f"{written} labels written, {labelled} of {len(rows)} rows "
          f"now labelled")


if __name__ == "__main__":
    main()
