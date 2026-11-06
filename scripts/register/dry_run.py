"""Dry runs of the four register options (T1116, ROADMAP A3, owner decision 8).

Reads Execution/_OPEN.md and prints what the register would look like under
each option. It never writes a file: there is no write call in this module and
the test checks the register is byte-identical afterwards.

Options (owner checklist, decision 8):
  a  one register row per owner procedure file; owner rows collapse
  b  new ROADMAP text re-plans the UI follow-ups into items; those rows fold
  c  both a and b
  d  keep the rule "one row per open item" and accept a longer register

Usage:
    python -I scripts/register/dry_run.py --measure           # the numbers as they are
    python -I scripts/register/dry_run.py --option a [--first 15]
    python -I scripts/register/dry_run.py --option all        # a, b, c, d side by side
    python -I scripts/register/dry_run.py --baseline 1c6967d91 --measure   # tonight's additions

Assumptions the owner can change (constants below): which rows count as UI
follow-ups (UI_BANDS, UI_RE) and which ROADMAP item each area folds into
(FOLD_TARGETS). The folding is a proposal, not a decision.
"""
import argparse
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OPEN = ROOT / "Execution" / "_OPEN.md"
ROW_RE = re.compile(r"^\|\s*(T\d+[-\w.]*)\s*\|")
PROC_RE = re.compile(r"procedure: (Execution/[\w/.-]+?\.md)")
ITEM_RE = re.compile(r"\b([A-K]\d{1,2})\b")
REPORT_ITEM_RE = re.compile(r"(?:ROADMAP\s+(?:item\s+)?|\()([A-K]\d{1,2})\b")

# Task bands of the UI waves T1083 named: V3-V6 design waves and plan-flow waves.
UI_BANDS = [(372, 466), (574, 600), (807, 874)]
UI_RE = re.compile(
    r"\b(css|screen|card|chip|sheet|button|layout|copy|string|motion|animation|tab|"
    r"explore|place page|plan flow|trip page|my trips|saved trips|phone|mobile|"
    r"selector|focus|hover|photo|carousel|map thumb)\b", re.IGNORECASE)

# Proposed ROADMAP items per UI area (first match wins). Placeholders until the owner writes the text.
FOLD_TARGETS = [
    ("G10", r"accessib|a11y|contrast|screen reader|focus ring|aria"),
    ("G5", r"motion|animation|spring|reduced motion|transition"),
    ("G8", r"photo|image|carousel|map thumb|gallery"),
    ("G6", r"font size|radius|type scale|token"),
    ("G12", r"plan flow|plan tab|trip page|onboarding|finder|help me choose"),
    ("G4", r"explore|place page|my trips|saved trips|card|filter"),
]
FOLD_DEFAULT = "G4"

# Mirrors owner_procedures.SYSTEMS slugs so rows with no pointer land in a file.
UNFILED = "owner-checks"


def split_row(line):
    parts = [p.strip() for p in line.strip().strip("|").split(" | ")]
    while len(parts) < 6:
        parts.append("")
    return parts


def parse_text(text):
    rows = []
    for ln in text.replace("\r\n", "\n").split("\n"):
        if ROW_RE.match(ln):
            c = split_row(ln)
            rows.append({"id": c[0], "raised": c[1], "item": c[2], "owner": c[3],
                         "status": c[4], "order": c[5]})
    return rows


def load(path=OPEN):
    return parse_text(Path(path).read_bytes().decode("utf-8"))


def load_at(ref):
    out = subprocess.run(["git", "show", f"{ref}:Execution/_OPEN.md"], cwd=ROOT,
                         capture_output=True, check=True).stdout.decode("utf-8")
    return parse_text(out)


def task_num(rid):
    m = re.match(r"T(\d+)", rid)
    return int(m.group(1)) if m else 0


def band(n):
    lo = (n // 100) * 100
    return f"T{lo:04d}-T{lo + 99:04d}"


_report_cache = {}


def report_item(task, root=ROOT):
    """First ROADMAP item a task's report names (header 3 KB), or ''."""
    if task in _report_cache:
        return _report_cache[task]
    found = ""
    for p in sorted((root / "Execution").glob(f"P*/{task}-*.md")):
        m = REPORT_ITEM_RE.search(p.read_text(encoding="utf-8", errors="replace")[:3000])
        if m:
            found = m.group(1)
            break
    _report_cache[task] = found
    return found


def roadmap_item(row, root=ROOT):
    text = PROC_RE.sub("", row["item"])
    m = ITEM_RE.search(text)
    if m:
        return m.group(1), "row"
    it = report_item(row["raised"] or row["id"].split("-")[0], root)
    return (it, "report") if it else ("none", "none")


def procedure_file(row):
    m = PROC_RE.search(row["item"])
    if m:
        return m.group(1)
    m = re.search(r"(Execution/P\d+/_OPEN-[\w-]+\.md)", row["item"])
    return m.group(1) if m else None


def is_ui_followup(row):
    if row["owner"] == "user":
        return False
    n = task_num(row["id"])
    in_band = any(lo <= n <= hi for lo, hi in UI_BANDS)
    return in_band or bool(UI_RE.search(PROC_RE.sub("", row["item"])) and
                           roadmap_item(row)[0][:1] == "G")


def fold_target(row):
    it, _ = roadmap_item(row)
    if it[:1] == "G":
        return it
    for tgt, pat in FOLD_TARGETS:
        if re.search(pat, row["item"], re.IGNORECASE):
            return tgt
    return FOLD_DEFAULT


# ---- measurement ---------------------------------------------------------

def measure(rows, baseline_ids=None):
    m = {"total": len(rows), "by_owner": Counter(r["owner"] for r in rows)}
    m["by_item"] = Counter(roadmap_item(r)[0] for r in rows)
    m["by_raiser"] = Counter(r["raised"] or r["id"].split("-")[0] for r in rows)
    m["by_age"] = Counter(band(task_num(r["id"])) for r in rows)
    m["owner_with_pointer"] = sum(1 for r in rows if r["owner"] == "user" and procedure_file(r))
    m["owner_total"] = m["by_owner"].get("user", 0)
    m["procedure_files"] = Counter(procedure_file(r) for r in rows
                                   if r["owner"] == "user" and procedure_file(r))
    m["ui_followups"] = sum(1 for r in rows if is_ui_followup(r))
    if baseline_ids is not None:
        added = [r for r in rows if r["id"] not in baseline_ids]
        m["added"] = len(added)
        m["added_by_owner"] = Counter(r["owner"] for r in added)
        m["added_by_raiser"] = Counter(r["raised"] or r["id"].split("-")[0] for r in added)
    return m


# ---- the four options ----------------------------------------------------

def collapse_owner(rows):
    """Option a: owner rows with a procedure file become one row per file;
    owner rows with no pointer become one row in the catch-all file."""
    out, groups = [], {}
    for r in rows:
        if r["owner"] != "user":
            out.append(r)
            continue
        f = procedure_file(r) or f"Execution/P15/_OPEN-{UNFILED}.md"
        groups.setdefault(f, []).append(r)
    for f, rs in sorted(groups.items()):
        out.append({"id": f"PROC-{Path(f).stem[6:]}", "raised": "A3",
                    "item": f"Owner procedure {f}: {len(rs)} steps, lowest order "
                            f"{min([int(x['order']) for x in rs if x['order'].isdigit()] or [0]) or 'none'}",
                    "owner": "user", "status": "open", "order": "", "_n": len(rs)})
    return out


def fold_ui(rows):
    """Option b: UI follow-ups leave the register, folded into ROADMAP items.
    Returns (remaining rows, Counter of folded rows per target item)."""
    keep, folded = [], Counter()
    for r in rows:
        if is_ui_followup(r):
            folded[fold_target(r)] += 1
        else:
            keep.append(r)
    return keep, folded


def run_option(opt, rows):
    folded = Counter()
    if opt == "d":
        out = list(rows)
    elif opt == "a":
        out = collapse_owner(rows)
    elif opt == "b":
        out, folded = fold_ui(rows)
    elif opt == "c":
        out, folded = fold_ui(rows)
        out = collapse_owner(out)
    else:
        raise ValueError(opt)
    return out, folded


def summary(opt, rows):
    out, folded = run_option(opt, rows)
    return {"option": opt, "rows": len(out),
            "by_owner": Counter(r["owner"] for r in out),
            "by_item": Counter(roadmap_item(r)[0] for r in out if "_n" not in r),
            "folded": folded, "out": out}


def show(opt, rows, first):
    s = summary(opt, rows)
    print(f"=== option {opt}: {s['rows']} open rows (was {len(rows)}) ===")
    print("by owner:", dict(s["by_owner"]))
    print("by item (top 10):", dict(s["by_item"].most_common(10)))
    if s["folded"]:
        print(f"folded into ROADMAP items: {sum(s['folded'].values())}", dict(s["folded"].most_common()))
    print(f"first {first} rows:")
    for r in s["out"][:first]:
        print("  |", r["id"], "|", r["owner"], "|", r["item"][:110])
    return s


def show_measure(rows, base_ids, first):
    m = measure(rows, base_ids)
    print(f"open rows: {m['total']}")
    print("by owner:", dict(m["by_owner"]))
    print(f"owner rows with a procedure pointer: {m['owner_with_pointer']} of {m['owner_total']}")
    print("procedure files:", len(m["procedure_files"]), dict(m["procedure_files"].most_common()))
    print("UI follow-ups (next task):", m["ui_followups"])
    print("by roadmap item (top 20):", dict(m["by_item"].most_common(20)))
    print("by raising task (top 15):", dict(m["by_raiser"].most_common(15)))
    print("by age:", dict(sorted(m["by_age"].items())))
    if "added" in m:
        print(f"added since baseline: {m['added']}", dict(m["added_by_owner"]))
        print("added by raising task:", dict(m["added_by_raiser"].most_common(15)))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--option", choices=["a", "b", "c", "d", "all"])
    ap.add_argument("--measure", action="store_true")
    ap.add_argument("--first", type=int, default=8)
    ap.add_argument("--file", default=str(OPEN))
    ap.add_argument("--baseline", help="git ref to count rows added since")
    a = ap.parse_args(argv)
    rows = load(a.file)
    if a.measure:
        base = {r["id"] for r in load_at(a.baseline)} if a.baseline else None
        show_measure(rows, base, a.first)
    if a.option:
        for opt in (["a", "b", "c", "d"] if a.option == "all" else [a.option]):
            show(opt, rows, a.first)
    if not a.measure and not a.option:
        ap.error("give --measure or --option")


if __name__ == "__main__":
    sys.exit(main())
