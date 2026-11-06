"""Field provenance on the wire: `_src` and `_asof` on every key block (T1143, D3).

Tier: Library

A key block is an object-valued destination key the contract lists
(`costs`, `rating`, `climate`, ...). Each one carries:

    _src   the id of its source in pipeline/config/sources.yaml
    _asof  the ISO 8601 date (YYYY-MM-DD) its layer last built it

How the stamps get there:

- ``stamp_payload`` runs inside ``pipeline_io.atomic_write_json`` before every
  write of the master (``app_data/app_data.json``) and the served wire
  (``continent-app/public/app_data.json``). A block that has no stamp is one a
  layer built in this run (layer writers assign a fresh dict), so it gets the
  registry's source and today's date. A block that kept its stamp is left as
  it is: its date only moves when a layer rebuilds it.
- A writer that edits a block in place calls ``touch(block)`` so the next
  write dates it today.
- ``python pipeline/provenance.py --backfill PATH`` migrates a wire written
  before schema 20: every block without a stamp gets the date of the wire's
  own ``meta.generated_at``, the latest date its values are known to hold, so
  no block ever claims to be fresher than it is.
- ``python pipeline/provenance.py --count PATH`` prints stamped and total
  blocks per key block (the before and after numbers of the report).

The date is a calendar date, not a timestamp: no block here changes within a
day, and ten bytes instead of twenty across about 60,000 blocks is 0.6 MB.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "pipeline" / "config" / "sources.yaml"
SRC, ASOF = "_src", "_asof"
PROV_KEYS = (SRC, ASOF)
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ID_RE = re.compile(r"^[a-z0-9_]+$")
# The schema version that carries the stamps; docs/wire.schema.json holds it
# too (x-schema-version) and the tests hold the two together.
SCHEMA_VERSION = 20

_cache: dict = {}


def load_registry(path=REGISTRY_PATH) -> dict:
    """The parsed sources.yaml, cached per path."""
    key = os.fspath(path)
    if key not in _cache:
        with open(key, encoding="utf-8") as f:
            _cache[key] = yaml.safe_load(f)
    return _cache[key]


def key_blocks(registry=None) -> dict[str, str]:
    """{block name: source id} in the registry's order."""
    reg = registry or load_registry()
    return {b: v["src"] for b, v in reg["blocks"].items()}


def today_iso(now=None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.astimezone(timezone.utc).date().isoformat()


def asof_of(meta: dict) -> str | None:
    """The calendar date of a wire's ``meta.generated_at``, or None."""
    g = (meta or {}).get("generated_at")
    if isinstance(g, str) and len(g) >= 10 and DATE_RE.match(g[:10]):
        return g[:10]
    return None


def is_stamped(block) -> bool:
    return (isinstance(block, dict) and isinstance(block.get(SRC), str)
            and isinstance(block.get(ASOF), str))


def touch(block) -> None:
    """Mark a block edited in place, so the next wire write dates it today."""
    if isinstance(block, dict):
        block.pop(SRC, None)
        block.pop(ASOF, None)


def stamp(block: dict, src: str, asof: str) -> bool:
    """Stamp one block if it has no stamp yet. True when it was stamped."""
    if not isinstance(block, dict) or is_stamped(block):
        return False
    block[SRC] = src
    block[ASOF] = asof
    return True


def stamp_payload(data: dict, *, asof: str | None = None, registry=None,
                  bump_version: bool = True) -> int:
    """Stamp every unstamped key block on every destination of ``data``.

    ``asof`` defaults to today (UTC). Also lifts ``meta.schema_version`` to
    SCHEMA_VERSION. Returns the number of blocks stamped.
    """
    if not isinstance(data, dict) or not isinstance(data.get("destinations"), dict):
        return 0
    blocks = key_blocks(registry)
    when = asof or today_iso()
    n = 0
    for d in data["destinations"].values():
        if not isinstance(d, dict):
            continue
        for b, src in blocks.items():
            if stamp(d.get(b), src, when):
                n += 1
    meta = data.get("meta")
    if bump_version and isinstance(meta, dict):
        v = meta.get("schema_version")
        if not isinstance(v, int) or v < SCHEMA_VERSION:
            meta["schema_version"] = SCHEMA_VERSION
    return n


def count(data: dict, registry=None) -> dict[str, dict]:
    """{block: {"total": blocks present, "stamped": with _src and _asof}}."""
    out = {b: {"total": 0, "stamped": 0} for b in key_blocks(registry)}
    for d in (data.get("destinations") or {}).values():
        for b, tally in out.items():
            v = d.get(b) if isinstance(d, dict) else None
            if isinstance(v, dict):
                tally["total"] += 1
                tally["stamped"] += is_stamped(v)
    return out


def problems(data: dict, registry=None) -> list[str]:
    """Every key block without a valid stamp, or with an unknown source."""
    reg = registry or load_registry()
    known = set(reg["sources"])
    blocks = key_blocks(reg)
    out = []
    for did, d in (data.get("destinations") or {}).items():
        if not isinstance(d, dict):
            continue
        for b in blocks:
            v = d.get(b)
            if not isinstance(v, dict):
                continue
            path = f"destinations.{did}.{b}"
            if SRC not in v:
                out.append(f"{path}._src is missing")
            elif v[SRC] not in known:
                out.append(f"{path}._src is {json.dumps(v[SRC])}, not a source in sources.yaml")
            if ASOF not in v:
                out.append(f"{path}._asof is missing")
            elif not (isinstance(v[ASOF], str) and DATE_RE.match(v[ASOF])):
                out.append(f"{path}._asof is {json.dumps(v[ASOF])}, expected YYYY-MM-DD")
    return out


def is_stamped_path(path) -> bool:
    """The master and the served wire: the two files the stamps live on."""
    p = Path(os.fspath(path))
    if p.name != "app_data.json":
        return False
    if p.parent.name == "public" and p.parent.parent.name == "continent-app":
        return True
    return p.parent.name == "app_data"


def _print_counts(c: dict) -> None:
    tot = sum(v["total"] for v in c.values())
    st = sum(v["stamped"] for v in c.values())
    width = max(len(b) for b in c)
    for b, v in c.items():
        print(f"  {b:<{width}}  {v['stamped']:>5} / {v['total']:>5}")
    print(f"  {'all':<{width}}  {st:>5} / {tot:>5}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--count", metavar="PATH", help="print stamped / total per key block")
    g.add_argument("--backfill", metavar="PATH",
                   help="stamp every unstamped block of a pre-v20 wire and write it back")
    ap.add_argument("--asof", help="date for --backfill (default: the wire's meta.generated_at)")
    ap.add_argument("--compact", action="store_true",
                    help="write --backfill output compact, as the served wire is")
    args = ap.parse_args(argv)
    path = Path(args.count or args.backfill)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if args.count:
        print(f"{path}: schema_version {data.get('meta', {}).get('schema_version')}")
        _print_counts(count(data))
        return 0
    when = args.asof or asof_of(data.get("meta")) or today_iso()
    if not DATE_RE.match(when):
        ap.error(f"--asof {when!r} is not YYYY-MM-DD")
    n = stamp_payload(data, asof=when)
    try:
        from pipeline_io import atomic_write_json
    except ImportError:
        from pipeline.pipeline_io import atomic_write_json
    kw = {"indent": None, "separators": (",", ":")} if args.compact else {}
    atomic_write_json(path, data, **kw)
    print(f"{path}: stamped {n} blocks as of {when}; schema_version "
          f"{data['meta']['schema_version']}")
    _print_counts(count(data))
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
