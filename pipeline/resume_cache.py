"""Resumable anchor cache for the long stay-tier harvests.

A full sweep is ~665 cities and roughly 15 hours of API calls. Building the
whole list in memory and writing once at the end meant a drop at hour 14 lost
everything, so both harvesters now checkpoint through here: each city is
appended as it completes, and a re-run skips what is already done.

One safety rule: an anchor file must never MIX real and unshippable (fixture /
sandbox) prices, because apply_stay_tiers judges the file as a whole. When the
run's source kind differs from what is already cached, the cache is dropped
rather than merged, and the harvest starts clean.

Usage:
    cache = ResumeCache(OUT, kind="liteapi")
    for c in cities:
        if cache.has(c): continue
        ...
        cache.add({**c, **agg, "src": kind, ...})
    cache.flush()
"""

import json
from pipeline_io import atomic_write_json


def _kind_of(src):
    """Group sources into shippable vs not, so a resumed run can tell whether
    the cached file belongs to the same harvest as this one."""
    if not src:
        return "unknown"
    if src in ("fixture",) or src.endswith("_sandbox"):
        return "unshippable"
    return "real"


class ResumeCache:
    def __init__(self, path, kind, flush_every=10):
        self.path = path
        self.kind = _kind_of(kind)
        self.flush_every = flush_every
        self._pending = 0
        self.rows = []
        self._keys = set()
        self._load()

    def _key(self, row):
        return ((row.get("city") or "").lower(), (row.get("country") or "").lower())

    def _load(self):
        if not self.path.exists():
            return
        try:
            rows = json.loads(self.path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return
        if not isinstance(rows, list) or not rows:
            return
        cached_kind = _kind_of(rows[0].get("src"))
        if cached_kind != self.kind:
            print(f"  {self.path.name} holds {cached_kind} prices, this run produces "
                  f"{self.kind}; starting clean rather than mixing the two.")
            return
        self.rows = rows
        self._keys = {self._key(r) for r in rows}
        print(f"  resuming: {len(rows)} cities already in {self.path.name}")

    def has(self, city_row):
        return self._key(city_row) in self._keys

    def add(self, row):
        self.rows.append(row)
        self._keys.add(self._key(row))
        self._pending += 1
        if self._pending >= self.flush_every:
            self.flush()

    def flush(self):
        if not self.rows:
            return
        atomic_write_json(self.path, self.rows, indent=1, ensure_ascii=False)
        self._pending = 0
