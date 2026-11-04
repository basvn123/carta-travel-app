"""Print the mind-map prompt for one task, under its _ORDER.md number.

The master mind map (additional docs/Carta/Carta-Master-Plan.xmind) numbers
tasks differently from Execution/_ORDER.md. This script finds the task by
its _ORDER title, prints the map's note (WHAT, WHY, SOURCE, DONE WHEN, PROMPT)
and rewrites the map's task number and report path to the _ORDER ones.

    python Execution/_queue/xmind_prompt.py T078
    python Execution/_queue/xmind_prompt.py --check T078 T084 T195
"""
import difflib
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
XMIND = ROOT / "additional docs" / "Carta" / "Carta-Master-Plan.xmind"
ORDER = ROOT / "Execution" / "_ORDER.md"

ROW = re.compile(r"^\| (T\d{3}) \| (.+?) \| (P\d+) \| .*?\| `([^`]+)` \|$")
MAP_TITLE = re.compile(r"^([TM]\d{2,3}) · (.+)$")  # P12 tasks are M01..M26 in the map


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def order_rows():
    rows = {}
    for line in ORDER.read_text(encoding="utf-8").splitlines():
        m = ROW.match(line.strip())
        if m:
            rows[m.group(1)] = {"title": m.group(2), "phase": m.group(3), "report": m.group(4)}
    return rows


def map_topics():
    with zipfile.ZipFile(XMIND) as z:
        sheets = json.loads(z.read("content.json"))
    out = []

    def walk(t):
        title = (t.get("title") or "").replace("\n", " ")
        m = MAP_TITLE.match(title)
        if m:
            note = (t.get("notes", {}).get("plain", {}).get("content") or "")
            out.append({"id": m.group(1), "title": m.group(2), "note": note})
        for k in ("attached", "detached"):
            for c in t.get("children", {}).get(k, []):
                walk(c)

    walk(sheets[0]["rootTopic"])
    return out


def find(task_id, rows, topics):
    row = rows.get(task_id)
    if not row:
        raise SystemExit(f"{task_id} is not in _ORDER.md")
    want = norm(row["title"])
    best, score = None, 0.0
    for t in topics:
        s = difflib.SequenceMatcher(None, want, norm(t["title"])).ratio()
        if s > score:
            best, score = t, s
    return row, best, score


def render(task_id, row, topic):
    note = topic["note"]
    map_id = topic["id"]
    note = re.sub(r"Execution/P\d+/" + map_id + r"-[\w-]+\.md", row["report"], note)
    note = note.replace(f"Task {map_id}:", f"Task {task_id}:")
    note = re.sub(r"^REPORT .*$", f"REPORT  {row['report']}", note, flags=re.M)
    head = (f"# {task_id} · {row['title']}\n"
            f"(mind-map number {map_id}; use {task_id} everywhere: branch, report, register)\n\n")
    return head + note


def main(argv):
    check = "--check" in argv
    ids = [a.upper() for a in argv if a != "--check"]
    if not ids:
        raise SystemExit(__doc__)
    rows, topics = order_rows(), map_topics()
    for task_id in ids:
        row, topic, score = find(task_id, rows, topics)
        if check:
            flag = "OK " if score >= 0.85 else "LOW"
            print(f"{flag} {task_id} -> map {topic['id']} ({score:.2f})  {row['title'][:50]} | {topic['title'][:50]}")
            continue
        if score < 0.85:
            raise SystemExit(f"{task_id}: best map match '{topic['title']}' scores {score:.2f}; check by hand")
        sys.stdout.reconfigure(encoding="utf-8")
        print(render(task_id, row, topic))


if __name__ == "__main__":
    main(sys.argv[1:])
