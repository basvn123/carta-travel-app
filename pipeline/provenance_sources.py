"""Generate docs/data/sources.md from pipeline/config/sources.yaml (T1143, D3).

Tier: Tool

    python -I pipeline/provenance_sources.py           # write the doc and the schema enum
    python -I pipeline/provenance_sources.py --check   # CI: fail when either is stale or
                                                       # the registry disagrees with the code

Two outputs come from the registry:
  - docs/data/sources.md, the human view (sources, then which block each stamps);
  - the `enum` of `$defs.src` in docs/wire.schema.json, so the three contract
    readers (pipeline, app sync, CI gate) reject a `_src` the registry does not
    know without reading YAML themselves.

--check also holds the registry to the code:
  - every key block is an object-valued destination key of the schema, and every
    object-valued destination key is a key block (no block without a source);
  - every block names a known source, and its writers exist on disk;
  - every `inputs` id is a source, every `ledger` key is a row of
    src/ingestion/core/registry.py SOURCES, every task is a run_pipeline.py task;
  - a source rebuilt by tasks has the cadence of its most frequent task.
tests/test_provenance.py runs --check, so CI (pytest) fails on any of it.
"""
from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT))

import provenance

DOC = ROOT / "docs" / "data" / "sources.md"
SCHEMA = ROOT / "docs" / "wire.schema.json"
CADENCES = ("WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "IRREG")
# run_pipeline.py's vocabulary to the EU frequency code; backfill, after and
# manual tasks have no fixed rhythm.
TASK_CADENCE = {"weekly": "WEEKLY", "monthly": "MONTHLY", "quarterly": "QUARTERLY",
                "backfill": "IRREG", "after": "IRREG", "manual": "IRREG"}
KINDS = ("primary", "derived")
OWNERS = ("box", "owner")


def _cell(v) -> str:
    if isinstance(v, (list, tuple)):
        return ", ".join(f"`{x}`" for x in v) if v else ""
    return str(v).replace("|", "\\|")


def render(reg: dict) -> str:
    src = reg["sources"]
    lines = [
        "<!-- GENERATED FILE. Do not edit: the source is pipeline/config/sources.yaml.",
        "     Regenerate with  python -I pipeline/provenance_sources.py",
        "     CI runs           python -I pipeline/provenance_sources.py --check  (tests/test_provenance.py) -->",
        "",
        "# Data sources and field provenance",
        "",
        "Every key block on the wire (an object-valued destination key of",
        "`docs/wire.schema.json`, schema 20 and later) carries two keys:",
        "",
        "- `_src`: the id of one source below, where the block's values come from;",
        "- `_asof`: the date (`YYYY-MM-DD`) the block's pipeline layer last built it.",
        "",
        "`pipeline/provenance.py` stamps them on every write of the master and the",
        "served wire; the app lifts them off the blocks as the country files load",
        "(`continent-app/src/lib/provenance.js`, `provenanceOf(record, block)`).",
        "Licence ids are SPDX; `LicenseRef-carta-derived` means Carta computes the",
        "block from the listed inputs, whose licences bind. The full licence text and",
        "attribution rules are in the licence ledger, `docs/tos/data_licenses.md`",
        "(rows named in the Ledger column). Cadence codes are the EU Publications",
        "Office frequency table (`IRREG`: backfill or by hand). Owner `box` runs on",
        "the build box schedule, `owner` by hand.",
        "",
        "## Sources",
        "",
        "| Id | Source | Kind | Licence | Cadence | Owner | Tasks | Inputs | Ledger |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for sid in sorted(src):
        s = src[sid]
        lines.append(
            f"| `{sid}` | {_cell(s['title'])} | {s['kind']} | {s['licence']} | {s['cadence']} "
            f"| {s['owner']} | {_cell(s['tasks'])} | {_cell(s.get('inputs', []))} | {_cell(s['ledger'])} |")
    lines += [
        "",
        "## Key blocks",
        "",
        "| Block | `_src` | Licence | Cadence | Layer writers |",
        "|---|---|---|---|---|",
    ]
    for b, v in reg["blocks"].items():
        s = src.get(v["src"], {})
        lines.append(f"| `{b}` | `{v['src']}` | {s.get('licence', '?')} | {s.get('cadence', '?')} "
                     f"| {_cell(v['writers'])} |")
    lines += [
        "",
        f"{len(src)} sources, {len(reg['blocks'])} key blocks.",
        "",
    ]
    return "\n".join(lines)


def schema_with_enum(schema_text: str, reg: dict) -> str:
    s = json.loads(schema_text)
    s["$defs"]["src"]["enum"] = sorted(reg["sources"])
    return json.dumps(s, indent=2, ensure_ascii=False) + "\n"


def object_blocks(schema: dict) -> list[str]:
    """Destination keys whose type admits an object (directly or by $ref)."""
    out = []
    for k, ps in schema["$defs"]["destination"]["properties"].items():
        t = ps.get("type")
        if "$ref" in ps:
            t = schema["$defs"][ps["$ref"].split("/")[-1]].get("type")
        types = t if isinstance(t, list) else [t]
        if "object" in types:
            out.append(k)
    return out


def problems(reg: dict, schema: dict) -> list[str]:
    out = []
    src = reg.get("sources") or {}
    blocks = reg.get("blocks") or {}
    try:
        from src.ingestion.core import registry as ledger
        ledger_keys = {s.key for s in ledger.SOURCES}
        tasks = ledger.pipeline_tasks()
    except (ImportError, OSError) as e:         # pragma: no cover - environment
        return [f"cannot read the licence ledger or run_pipeline.py: {e}"]
    for sid, s in src.items():
        if not provenance.ID_RE.match(sid):
            out.append(f"sources.{sid}: id is not lower-case letters, digits and _")
        for f in ("title", "kind", "licence", "cadence", "owner", "tasks", "ledger"):
            if f not in s:
                out.append(f"sources.{sid}.{f} is missing")
        if s.get("kind") not in KINDS:
            out.append(f"sources.{sid}.kind is {s.get('kind')!r}, expected one of {KINDS}")
        if s.get("cadence") not in CADENCES:
            out.append(f"sources.{sid}.cadence is {s.get('cadence')!r}, expected one of {CADENCES}")
        if s.get("owner") not in OWNERS:
            out.append(f"sources.{sid}.owner is {s.get('owner')!r}, expected one of {OWNERS}")
        if s.get("kind") == "derived" and s.get("licence") != "LicenseRef-carta-derived":
            out.append(f"sources.{sid}: a derived source takes licence LicenseRef-carta-derived")
        for i in s.get("inputs") or []:
            if i not in src:
                out.append(f"sources.{sid}.inputs names {i!r}, not a source")
        for k in s.get("ledger") or []:
            if k not in ledger_keys:
                out.append(f"sources.{sid}.ledger names {k!r}, not a row of src/ingestion/core/registry.py")
        task_cads = []
        for t in s.get("tasks") or []:
            if t not in tasks:
                out.append(f"sources.{sid}.tasks names {t!r}, not a run_pipeline.py task")
            else:
                task_cads.append(TASK_CADENCE.get(tasks[t].get("cadence"), "IRREG"))
        if task_cads:
            want = min(task_cads, key=CADENCES.index)
            if s.get("cadence") != want:
                out.append(f"sources.{sid}.cadence is {s.get('cadence')}, but its most frequent "
                           f"task runs {want} (run_pipeline.py)")
    want_blocks = object_blocks(schema)
    for b in want_blocks:
        if b not in blocks:
            out.append(f"destinations.*.{b} is an object block in {SCHEMA.name} with no entry under blocks")
    for b, v in blocks.items():
        if b not in want_blocks:
            out.append(f"blocks.{b} is not an object block of {SCHEMA.name}")
        if v.get("src") not in src:
            out.append(f"blocks.{b}.src is {v.get('src')!r}, not a source")
        for w in v.get("writers") or []:
            if not (ROOT / w).exists():
                out.append(f"blocks.{b}.writers names {w}, which does not exist")
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="sources.yaml -> docs/data/sources.md")
    ap.add_argument("--check", action="store_true", help="fail when an output is stale or the registry is wrong")
    args = ap.parse_args(argv)
    reg = provenance.load_registry()
    schema_text = SCHEMA.read_text(encoding="utf-8")
    doc = render(reg)
    new_schema = schema_with_enum(schema_text, reg)
    bad = problems(reg, json.loads(new_schema))
    if args.check:
        old_doc = DOC.read_text(encoding="utf-8") if DOC.exists() else ""
        if old_doc != doc:
            bad.append(f"{DOC.relative_to(ROOT)} is stale; run python -I pipeline/provenance_sources.py")
            bad += list(difflib.unified_diff(old_doc.splitlines(), doc.splitlines(), "on disk", "generated",
                                             lineterm="", n=0))[:20]
        if schema_text != new_schema:
            bad.append(f"{SCHEMA.relative_to(ROOT)} $defs.src.enum is not the registry's source ids; "
                       "run python -I pipeline/provenance_sources.py")
        for p in bad:
            print(f"FAIL {p}")
        if not bad:
            print(f"ok   {DOC.relative_to(ROOT)} and the schema enum match {len(reg['sources'])} sources, "
                  f"{len(reg['blocks'])} key blocks")
        return 1 if bad else 0
    if bad:
        for p in bad:
            print(f"FAIL {p}")
        return 1
    DOC.write_text(doc, encoding="utf-8", newline="\n")
    if schema_text != new_schema:
        SCHEMA.write_text(new_schema, encoding="utf-8", newline="\n")
    print(f"wrote {DOC.relative_to(ROOT)} ({len(reg['sources'])} sources, {len(reg['blocks'])} blocks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
