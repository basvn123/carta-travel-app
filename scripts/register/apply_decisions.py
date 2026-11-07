"""Apply triage decisions (T1072, ROADMAP A3).

Reads Execution/P15/T1072-triage.csv (id, decision, evidence, close_text) and
moves every row whose decision closes it from Execution/_OPEN.md to
Execution/_OPEN-CLOSED.md, with Status "closed by T1072 (<close_text>)".
Rows are moved, never deleted. Decisions that keep a row open ("keep") are
recorded in the CSV and left alone. Files are CRLF; CRLF is kept.

Usage: python scripts/register/apply_decisions.py [--task T1083] [--family NAME] [--dry-run]
The default task is T1072. --family keeps only CSV rows whose evidence starts "NAME:" (T1083 style).
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import triage  # noqa: E402

TASK = sys.argv[sys.argv.index("--task") + 1] if "--task" in sys.argv else "T1072"
FAMILY = sys.argv[sys.argv.index("--family") + 1] if "--family" in sys.argv else None
CSV_PATH = triage.ROOT / "Execution" / "P15" / f"{TASK}-triage.csv"
CLOSING = {"done", "wontdo", "folded"}


def main():
    dry = "--dry-run" in sys.argv
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        dec = {r["id"]: r for r in csv.DictReader(f) if r["decision"] in CLOSING and (FAMILY is None or r["evidence"].startswith(FAMILY + ":"))}
    lines, rows = triage.parse(triage.OPEN)
    by_id = {r["id"]: r for r in rows}
    moved = []
    for rid, d in dec.items():
        r = by_id.get(rid)
        if not r:
            continue
        cells = [r["id"], r["raised"], r["item"], r["owner"],
                 "closed by " + TASK + " (" + d["close_text"] + ")", r["order"]]
        moved.append((r["idx"], triage.fmt_row(cells)))
    print(f"closing {len(moved)} rows (decisions: {len(dec)})")
    if dry or not moved:
        return
    drop = {i for i, _ in moved}
    new_open = [ln for i, ln in enumerate(lines) if i not in drop]
    clines = triage.read_lines(triage.CLOSED)
    while clines and clines[-1] == "":
        clines.pop()
    clines.extend(t for _, t in sorted(moved))
    triage.OPEN.write_bytes("\r\n".join(new_open).encode("utf-8"))
    triage.CLOSED.write_bytes(("\r\n".join(clines) + "\r\n").encode("utf-8"))


if __name__ == "__main__":
    main()
