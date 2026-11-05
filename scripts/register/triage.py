"""Register triage helper (T1072, ROADMAP A3).

Parses Execution/_OPEN.md (and optionally _OPEN-CLOSED.md), groups rows by area
and age (task number) and prints counts. Also exposes parse/write helpers the
triage passes use.

Usage:
    python scripts/register/triage.py                 # counts for _OPEN.md
    python scripts/register/triage.py --list AREA     # list rows of one area
    python scripts/register/triage.py --owner         # owner rows by area

Files are CRLF; writers keep CRLF.
"""
import argparse
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OPEN = ROOT / "Execution" / "_OPEN.md"
CLOSED = ROOT / "Execution" / "_OPEN-CLOSED.md"

ROW_RE = re.compile(r"^\|\s*(T\d+[-\w.]*)\s*\|")

AREAS = [
    ("stripe", r"stripe|checkout|paywall|webhook|price id|STRIPE"),
    ("supabase", r"supabase|migration|RLS|edge function|postgres|\bdb\b|rpc"),
    ("cloudflare", r"cloudflare|\bR2\b|wrangler|pages|worker|DNS"),
    ("hetzner", r"hetzner|\bbox\b|cron|systemd|backup"),
    ("google", r"google|search console|GSC|gemini|maps api|places api"),
    ("legal", r"legal|GDPR|privacy|terms|licen[cs]e|ToS|Article 30|DPA|KvK|VAT|BTW|sole trader|accountant|lawyer"),
    ("flights", r"flight|amadeus|duffel|travelpayouts|skyscanner|kiwi|carrier"),
    ("stays", r"hostel|booking|stay|hotel|xotelo|accommodation"),
    ("trails", r"trail|hike|brouter|route|gpx"),
    ("images", r"image|photo|wikimedia|unsplash"),
    ("explore", r"explore|place page|card|filter|map"),
    ("plan", r"\bplan\b|trip page|itinerary|finder|help me choose"),
    ("pipeline", r"pipeline|scrape|ingest|layer|catalogue|rating|schema|csv"),
    ("design", r"design|token|css|contrast|a11y|accessib|copy|i18n|translation"),
    ("ci", r"\bCI\b|workflow|lint|test|vitest|pytest|playwright"),
]


def read_lines(path):
    return path.read_bytes().decode("utf-8").split("\r\n")


def split_row(line):
    parts = [p.strip() for p in line.strip().strip("|").split(" | ")]
    return parts


def parse(path=OPEN):
    """Return (lines, rows) where rows = list of dict with idx, cells."""
    lines = read_lines(path)
    rows = []
    for i, ln in enumerate(lines):
        if ROW_RE.match(ln):
            cells = split_row(ln)
            while len(cells) < 6:
                cells.append("")
            rows.append({"idx": i, "id": cells[0], "raised": cells[1], "item": cells[2],
                         "owner": cells[3], "status": cells[4], "order": cells[5], "line": ln})
    return lines, rows


def fmt_row(cells):
    """Format a row the way the register does: an empty Order cell ends '| |'."""
    order = cells[5] if len(cells) > 5 else ""
    return "| " + " | ".join(cells[:5]) + " | " + (order + " |" if order else "|")


def task_num(rid):
    m = re.match(r"T(\d+)", rid)
    return int(m.group(1)) if m else 0


def area_of(row):
    text = row["item"]
    for name, pat in AREAS:
        if re.search(pat, text, re.I):
            return name
    return "other"


def age_bucket(n):
    lo = (n // 100) * 100
    return f"T{lo:04d}-T{lo + 99:04d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list")
    ap.add_argument("--owner", action="store_true")
    ap.add_argument("--file", default=str(OPEN))
    a = ap.parse_args()
    _, rows = parse(Path(a.file))
    print(f"rows: {len(rows)}")
    print("by owner:", dict(Counter(r["owner"] for r in rows)))
    print("by status:", dict(Counter(r["status"].split(" ")[0] for r in rows)))
    sel = [r for r in rows if (r["owner"] == "user") or not a.owner]
    print("by area:")
    for k, v in Counter(area_of(r) for r in sel).most_common():
        print(f"  {k:12s}{v}")
    print("by age:")
    for k, v in sorted(Counter(age_bucket(task_num(r["id"])) for r in sel).items()):
        print(f"  {k}  {v}")
    if a.list:
        for r in rows:
            if area_of(r) == a.list and (r["owner"] == "user" or not a.owner):
                print(r["id"], "|", r["owner"], "|", r["item"][:200])


if __name__ == "__main__":
    sys.exit(main())
