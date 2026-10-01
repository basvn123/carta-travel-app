"""Render docs/tos/data_licenses.md from the registry, or check it (T078).

    python -m src.ingestion.core.ledger --write    regenerate the ledger
    python -m src.ingestion.core.ledger --check    exit 1 if stale or invalid
    python -m src.ingestion.core.ledger            print the ledger to stdout

The ledger's prose and rows live in registry.py (HEADER, SECTIONS, SOURCES,
WIRE_REVIEW); the execution roster is rendered live from RUNS and the
registered collector classes, so a cadence change in the registry and a
description change in a collector both show up in the document on the next
--write, and --check fails until someone runs it. CI runs --check.
"""
import argparse
import sys
from pathlib import Path

from .registry import (HEADER, ROOT, RUNS, SECTIONS, SOURCES, WIRE_REVIEW,
                       harvester_scripts, load_all, sources_for, validate)

LEDGER = ROOT / "docs" / "tos" / "data_licenses.md"
GENERATED_BANNER = """\
<!-- GENERATED FILE. Do not edit: the source is src/ingestion/core/registry.py.
     Regenerate with  python -m src.ingestion.core.ledger --write
     CI runs           python -m src.ingestion.core.ledger --check  -->
"""
GENERATED_NOTE = """\
This file is generated from `src/ingestion/core/registry.py` (T078). The
registry is the single source of truth for both what runs (cadence, task,
failure mode) and what each source is licensed for; edit the row there and
run `python -m src.ingestion.core.ledger --write`. The CI check fails when a
collector or a `pipeline/harvest_*.py` script exists without its row, when
this file is stale, or when a cadence here disagrees with `run_pipeline.py`.
"""


def _table(columns, rows) -> str:
    """Cells are written verbatim: a pipe inside backticks (an OSM tag
    value) is how the hand-written ledger always carried them."""
    out = ["| " + " | ".join(columns) + " |", "|" + "---|" * len(columns)]
    for cells in rows:
        out.append("| " + " | ".join(cells) + " |")
    return "\n".join(out)


def _roster(registry) -> str:
    """Section 0: the execution roster, from RUNS and the live collector classes."""
    keys = {}
    for s in SOURCES:
        for name in s.collectors:
            keys.setdefault(name, []).append(s.key)
        for path in s.scripts:
            keys.setdefault(path, []).append(s.key)
    collectors = []
    for name, cls in registry.items():
        run = RUNS[name]
        collectors.append((f"`{name}`", cls.group, cls.description, run.cadence,
                           f"`{run.task}`" if run.task else "none", run.failure,
                           ", ".join(f"`{k}`" for k in keys.get(name, [])),
                           run.note or ""))
    harvesters = []
    for path in sorted(k for k in RUNS if k.startswith("pipeline/")):
        run = RUNS[path]
        harvesters.append((f"`{path}`", run.cadence,
                           f"`{run.task}`" if run.task else "none", run.failure,
                           ", ".join(f"`{k}`" for k in keys.get(path, [])),
                           run.note or ""))
    intro = (
        "Every collector in `src/ingestion` and every `pipeline/harvest_*.py`\n"
        "script, with how it runs and which ledger rows below govern it. The\n"
        "cadence vocabulary is `run_pipeline.py`'s (weekly, monthly, quarterly,\n"
        "backfill, after, manual); the task is the `run_pipeline.py` key; the\n"
        "failure mode is soft (the task logs and the run carries on), hard (the\n"
        "task fails and its chain stops) or manual (never scheduled, the operator\n"
        "sees it). A row key links to the source tables that follow.\n"
    )
    return (
        "## 0. Execution roster\n\n" + intro + "\n"
        + f"### Collectors ({len(collectors)})\n\n"
        + _table(("Collector", "Group", "Description", "Cadence", "Task", "Failure",
                  "Ledger rows", "Note"), collectors)
        + f"\n\n### Harvesters ({len(harvesters)})\n\n"
        + _table(("Script", "Cadence", "Task", "Failure", "Ledger rows", "Note"), harvesters)
    )


def render(registry=None) -> str:
    registry = load_all() if registry is None else registry
    parts = [GENERATED_BANNER, HEADER.rstrip("\n"), "", GENERATED_NOTE.rstrip("\n"), "",
             _roster(registry)]
    for section in SECTIONS:
        parts.append("")
        parts.append(f"{section.level} {section.title}")
        if section.intro:
            parts.append("")
            parts.append(section.intro.rstrip("\n"))
        if section.columns:
            parts.append("")
            if section.id == "share_alike":
                rows = [(w.wire, w.ships, w.verdict, w.travels) for w in WIRE_REVIEW]
            else:
                rows = [(s.name, s.takes, s.licence, s.attribution, s.share_alike, s.attributed)
                        for s in SOURCES if s.section == section.id]
            parts.append(_table(section.columns, rows))
        if section.outro:
            parts.append("")
            parts.append(section.outro.rstrip("\n"))
    return "\n".join(parts).rstrip("\n") + "\n"


def check(path: Path = LEDGER) -> list[str]:
    """Validation problems plus a staleness problem when the file on disk
    is not what render() produces. Empty list means CI passes."""
    problems = validate()
    if problems:
        return problems
    current = path.read_text(encoding="utf-8").replace("\r\n", "\n") if path.exists() else ""
    if current != render():
        problems.append(f"{path.relative_to(ROOT).as_posix()} is stale: "
                        "run `python -m src.ingestion.core.ledger --write` and commit it")
    return problems


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m src.ingestion.core.ledger",
                                     description="Generate or check docs/tos/data_licenses.md")
    parser.add_argument("--write", action="store_true", help="write the ledger file")
    parser.add_argument("--check", action="store_true",
                        help="validate the registry and fail if the ledger is stale")
    args = parser.parse_args(argv)
    if args.check:
        problems = check()
        for p in problems:
            print(f"ERROR: {p}")
        if problems:
            return 1
        print(f"ledger ok: {len(load_all())} collectors, {len(harvester_scripts())} harvesters, "
              f"{len(SOURCES)} rows, {LEDGER.relative_to(ROOT).as_posix()} is current")
        return 0
    problems = validate()
    if problems:
        for p in problems:
            print(f"ERROR: {p}", file=sys.stderr)
        return 1
    text = render()
    if args.write:
        LEDGER.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {LEDGER.relative_to(ROOT).as_posix()}: {len(SOURCES)} rows, "
              f"{len(text.splitlines())} lines")
        return 0
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
