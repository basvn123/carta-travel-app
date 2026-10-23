"""Small keyed JSON files the T641 harvests write and the exports read.

Tier: Library

Each harvest in the T641 batch writes `cache/<name>.json` shaped
{"_meta": {...source, date, licence...}, "rows": {<id>: {...}}}. An export
merges the row for the id it is writing and leaves the key out when there is
no row, so a missing file or a missing id never nulls anything.

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
_MEMO: dict = {}


def path_of(name: str) -> Path:
    return CACHE / f"{name}.json"


def load_rows(name: str) -> dict:
    """{id: row} for one overlay, {} when the file is absent or unreadable."""
    if name not in _MEMO:
        try:
            doc = json.loads(path_of(name).read_text(encoding="utf-8"))
            _MEMO[name] = doc.get("rows") or {}
        except (OSError, ValueError):
            _MEMO[name] = {}
    return _MEMO[name]


def save(name: str, rows: dict, meta: dict, base: Path | None = None) -> Path:
    folder = base or CACHE
    folder.mkdir(parents=True, exist_ok=True)
    p = folder / f"{name}.json"
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps({"_meta": meta, "rows": rows}, ensure_ascii=False,
                              separators=(",", ":")), encoding="utf-8")
    tmp.replace(p)
    return p
