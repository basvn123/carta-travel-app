"""Pull one photograph out of everything we publish, in minutes, forever.

A CC licence does not oblige a photographer to like where their picture
ended up, and an attribution complaint answered in minutes is a non-event
while one answered next quarter is a reputation. Two halves:

  the scrub    walks every wire file under continent-app/public, removes
               every image record that matches the needle (a Commons file
               title, a URL fragment, a Geograph id), reseats galleries,
               and reports what it touched. No full rebuild needed, so it
               runs in well under five minutes.
  the ledger   cache/photos/takedowns.json. The scrub alone would last
               until the next export re-admitted the file, so the ledger
               is consulted by the layers' image passes (is_taken_down)
               and a takedown survives every rebuild after it.

    python pipeline/photos/takedown.py add "PLAYA DE LAS CATEDRALES.jpg" \
        --reason "author request 2026-08-29"
    python pipeline/photos/takedown.py scrub          # apply ledger to wire
    python pipeline/photos/takedown.py list

`add` records and scrubs in one step. A needle matches case-insensitively
against every string field of an image record, so a file title, a thumb
URL or an author name all work; prefer the file title, it is the stable
one.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "cache" / "photos" / "takedowns.json"
PUBLIC = ROOT / "continent-app" / "public"

# The wire dirs that carry image records. Scoped so the scrub does not
# parse megabytes of fares and reach files for nothing.
WIRE_DIRS = ("beaches", "lakes", "mountains", "trails", "trips",
             "features", "dossier")

# A dict is an image record when it carries any of these keys.
IMAGE_KEYS = ("u", "url", "thumb", "big", "full", "img")


_ledger_cache = {"mtime": None, "rows": []}


def load_ledger():
    """Cached by mtime: is_taken_down runs once per candidate in every
    layer's image pass, and the ledger changes a few times a year."""
    try:
        mtime = LEDGER.stat().st_mtime
    except OSError:
        return []
    if _ledger_cache["mtime"] != mtime:
        try:
            _ledger_cache["rows"] = json.loads(
                LEDGER.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            _ledger_cache["rows"] = []
        _ledger_cache["mtime"] = mtime
    return _ledger_cache["rows"]


def save_ledger(rows):
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    tmp = LEDGER.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(rows, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    tmp.replace(LEDGER)


def is_taken_down(text, ledger=None):
    """For the layers' image passes: does any ledger needle match this
    candidate's title or URL? Cheap, case-insensitive substring."""
    lowered = str(text or "").lower()
    if not lowered:
        return False
    for row in (ledger if ledger is not None else load_ledger()):
        if row["needle"].lower() in lowered:
            return True
    return False


def _matches(record, needles):
    for value in record.values():
        if isinstance(value, str):
            lowered = value.lower()
            if any(n in lowered for n in needles):
                return True
    return False


def _scrub_node(node, needles, hits):
    """Recursively remove matching image records from every list. A list
    that held a row's images simply gets shorter; a hero removed promotes
    images[1], which is the strongest remaining claim by construction
    because the lists ship ordered."""
    if isinstance(node, list):
        kept = []
        for item in node:
            if (isinstance(item, dict)
                    and any(k in item for k in IMAGE_KEYS)
                    and _matches(item, needles)):
                hits.append(item)
                continue
            _scrub_node(item, needles, hits)
            kept.append(item)
        node[:] = kept
    elif isinstance(node, dict):
        for value in node.values():
            _scrub_node(value, needles, hits)


def scrub(needles=None):
    """Apply the ledger (or an explicit needle list) to every wire file.
    Returns {path: n_removed}; files without a hit are not rewritten."""
    needles = [n.lower() for n in
               (needles or [r["needle"] for r in load_ledger()])]
    if not needles:
        print("ledger empty, nothing to scrub")
        return {}
    touched = {}
    for dirname in WIRE_DIRS:
        base = PUBLIC / dirname
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.json")):
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            lowered = text.lower()
            if not any(n in lowered for n in needles):
                continue
            data = json.loads(text)
            hits = []
            _scrub_node(data, needles, hits)
            if hits:
                tmp = path.with_suffix(".json.tmp")
                tmp.write_text(json.dumps(data, ensure_ascii=False,
                                          separators=(",", ":")),
                               encoding="utf-8")
                tmp.replace(path)
                touched[str(path.relative_to(ROOT))] = len(hits)
    for rel, n in touched.items():
        print(f"  {rel}: removed {n}")
    if not touched:
        print("no wire file carried a match")
    return touched


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add", help="record a takedown and scrub now")
    add.add_argument("needle")
    add.add_argument("--reason", default="")
    sub.add_parser("scrub", help="re-apply the whole ledger to the wire")
    sub.add_parser("list")
    args = ap.parse_args()

    if args.cmd == "add":
        rows = load_ledger()
        if any(r["needle"] == args.needle for r in rows):
            print("already in the ledger, scrubbing again")
        else:
            rows.append({
                "needle": args.needle,
                "reason": args.reason,
                "at": datetime.now(timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"),
            })
            save_ledger(rows)
        scrub([args.needle])
    elif args.cmd == "scrub":
        scrub()
    elif args.cmd == "list":
        for row in load_ledger():
            print(f"  {row['at']}  {row['needle']}  ({row['reason']})")


if __name__ == "__main__":
    main()
