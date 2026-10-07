"""Keep one row per register id: the 'closed by' version when one exists, else the first."""
import re
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "_OPEN.md"
raw = p.read_bytes().decode("utf-8")
nl = "\r\n" if "\r\n" in raw else "\n"
lines = raw.split(nl)
row = re.compile(r"^\| ([A-Za-z0-9]+-[a-z0-9]+) \|")

groups = {}
for i, line in enumerate(lines):
    m = row.match(line)
    if m:
        groups.setdefault(m.group(1), []).append(i)

drop, keep_text = set(), {}
for rid, idx in groups.items():
    if len(idx) < 2:
        continue
    closed = [i for i in idx if "| closed by " in lines[i]]
    if len({lines[i] for i in closed}) > 1:
        raise SystemExit(f"{rid}: two different closed versions, resolve by hand")
    best = closed[0] if closed else idx[0]
    keep_text[idx[0]] = lines[best]
    drop.update(idx[1:])
    print(f"{rid}: kept {'closed' if closed else 'first'} version, dropped {len(idx) - 1}")

out = [keep_text.get(i, l) for i, l in enumerate(lines) if i not in drop]
p.write_bytes(nl.join(out).encode("utf-8"))
