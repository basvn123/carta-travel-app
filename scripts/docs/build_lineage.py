"""Build and check the data lineage doc (ROADMAP B5, T1166).

    python -I scripts/docs/build_lineage.py            # write docs/architecture/lineage.md
    python -I scripts/docs/build_lineage.py --check    # verify only, write nothing
    python -I scripts/docs/build_lineage.py --check --strict   # also fail when lineage.md is stale

Inputs, all read, none changed:
- docs/wire.schema.json            every wire field (T1133): 33 meta keys, 43 destination keys
- docs/architecture/lineage-fields.json   the hand-curated half: source, task, artifact, writer
- run_pipeline.py TASKS            task keys, cadence, commands (read with ast, never imported)
- continent-app/src/lib/bootIndex.js      BOOT_COLS and RANK_FIELDS: which wire file holds a field
- continent-app/src/lib/dataHost.js       R2_TIER: which folders the data host serves
- continent-app/src                        app readers, found by a pattern search (see READERS)

The check fails (exit 1) when:
- a wire field in the schema has no lineage row, or a row names a field the schema lacks
- a row names a task that is neither a run_pipeline.py key nor legacy, manual or sync
- a writer path does not exist, or does not mention the field's name
- a row has no writer and is not marked legacy
- a wire file row names a missing writer or reader, a task with writes_wire is in no
  wire file row, or an R2_TIER entry has no wire file row
- a request path in REQUEST_PATHS has no section or no Mermaid diagram in
  docs/architecture/request-paths.md, or that doc names a repo file that does not exist
With --strict it also fails when lineage.md differs from what this script would write.
The app readers are found by a pattern search, so lineage.md moves when app code
does; that is why freshness is --strict only. Exit 0 otherwise.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "continent-app"
SCHEMA = ROOT / "docs" / "wire.schema.json"
CURATED = ROOT / "docs" / "architecture" / "lineage-fields.json"
OUT = ROOT / "docs" / "architecture" / "lineage.md"
PATHS_DOC = ROOT / "docs" / "architecture" / "request-paths.md"
REQUEST_PATHS = ["First load", "Explore", "Place page", "Plan", "Ask", "plan-day", "Account sync"]
PIPELINE = ROOT / "run_pipeline.py"
BOOT_INDEX = APP / "src" / "lib" / "bootIndex.js"
DATA_HOST = APP / "src" / "lib" / "dataHost.js"
TOKENS = {"legacy", "manual", "sync"}

# How the app names a record or the meta block when it reads a field. A file
# counts as a reader when it has `<prefix>.field` or `<prefix>?.field`.
READERS = {
    "meta": ["meta", "m", r"data\.meta", "appMeta", r"catalogue\.meta"],
    "destinations": ["dest", "d", "rec", "record", "place", "p", "row", "destination", "target",
                     "town", "x", "a", "b", "c", "r", "o", "city", "v"],
}
# The boot row's columns and the fields each is taken from (bootIndex.js
# splitCatalogue, flagsOf, bandOf).
BOOT_SOURCES = {
    "id": "id", "lat": "lat", "lon": "lon", "iso2": "cc",
    "tier": "f (flag AIRPORT)", "categories": "f (flag UNESCO)",
    "gateway_of": "f (flag GATEWAY)", "rating": "f (flag HIDDEN_GEM), r (band)",
}


def schema_fields() -> list[str]:
    s = json.loads(SCHEMA.read_text(encoding="utf-8"))
    meta = [f"meta.{k}" for k in s["properties"]["meta"]["properties"]]
    dest = [f"destinations.*.{k}" for k in s["$defs"]["destination"]["properties"]]
    return meta + dest


def pipeline_tasks() -> dict[str, dict]:
    tree = ast.parse(PIPELINE.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "TASKS" for t in node.targets):
            break
    else:
        raise SystemExit("run_pipeline.py: no TASKS list")
    out = {}
    for el in node.value.elts:
        task = {"cmds": [], "run": None}
        for k, v in zip(el.keys, el.values):
            key = k.value if isinstance(k, ast.Constant) else None
            if key in ("key", "cadence", "writes_app_data", "writes_wire", "title"):
                try:
                    task[key] = ast.literal_eval(v)
                except ValueError:
                    task[key] = None
            elif key == "cmds":
                for cmd in v.elts:
                    for arg in getattr(cmd, "elts", []):
                        if isinstance(arg, ast.Constant) and isinstance(arg.value, str) and "/" in arg.value:
                            if arg.value not in task["cmds"]:
                                task["cmds"].append(arg.value)
                            break
            elif key == "run":
                task["run"] = getattr(v, "id", None)
        out[task["key"]] = task
    return out


def js_block(text: str, name: str) -> str:
    m = re.search(rf"export const {name} = Object\.freeze\(([\[{{].*?[\]}}])\);", text, re.DOTALL)
    if not m:
        raise SystemExit(f"{name} not found")
    return m.group(1)


def rank_fields() -> list[str]:
    block = js_block(BOOT_INDEX.read_text(encoding="utf-8"), "RANK_FIELDS")
    block = re.sub(r"//[^\n]*", "", block)
    return re.findall(r"^\s*([a-z_]+):", block, re.MULTILINE)


def r2_tier() -> list[str]:
    block = js_block(DATA_HOST.read_text(encoding="utf-8"), "R2_TIER")
    block = re.sub(r"//[^\n]*", "", block)
    return re.findall(r"'([^']+)'", block)


def app_sources() -> dict[str, str]:
    out = {}
    for p in sorted((APP / "src").rglob("*")):
        if p.suffix in (".js", ".jsx") and p.is_file():
            out[p.relative_to(ROOT).as_posix()] = p.read_text(encoding="utf-8", errors="replace")
    return out


def reader_index(sources: dict[str, str]) -> dict[str, dict[str, Counter]]:
    """One scan per file: for each group, leaf name -> Counter of reading files."""
    out: dict[str, dict[str, Counter]] = {}
    for group, prefixes in READERS.items():
        names = "|".join(prefixes)
        rx = re.compile(rf"\b(?:{names})\??\.([A-Za-z_][A-Za-z0-9_]*)\b")
        idx: dict[str, Counter] = {}
        for f, t in sources.items():
            for leaf in rx.findall(t):
                idx.setdefault(leaf, Counter())[f] += 1
        out[group] = idx
    return out


def readers(field: str, index: dict[str, dict[str, Counter]]) -> tuple[list[str], int]:
    group, leaf = field.split(".")[0], field.split(".")[-1]
    c = index[group].get(leaf, Counter())
    hits = [f for f, _ in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))]
    return hits[:3], len(hits)


# Plumbing that names every field (the split, the contract) is not a reader.
PLUMBING = {"continent-app/src/lib/bootIndex.js", "continent-app/src/lib/wireSchema.js",
            "continent-app/src/lib/dataHost.js"}


GENERIC = {"currency", "categories", "defaults", "start_date", "end_date"}


def specific(field: str) -> bool:
    """A name with an underscore, or a long uncommon one, is specific enough
    for a plain word search; `currency` or `home` would match unrelated code."""
    leaf = field.split(".")[-1]
    return "_" in leaf or (len(leaf) >= 8 and leaf not in GENERIC)


def name_only(field: str, sources: dict[str, str]) -> list[str]:
    """Files that name the field without a `rec.field` read (destructuring, a
    string key). Shown only when the pattern search found no reader."""
    leaf = field.split(".")[-1]
    rx = re.compile(rf"\b{re.escape(leaf)}\b")
    return [f for f, t in sources.items() if f not in PLUMBING and leaf in t and rx.search(t)]


def wire_files(field: str, rank: list[str]) -> str:
    if field.startswith("meta."):
        return "boot.json (meta)"
    leaf = field.split(".")[-1]
    parts = []
    if leaf in BOOT_SOURCES:
        parts.append(f"boot.json ({BOOT_SOURCES[leaf]})")
    if leaf in rank:
        parts.append("dest/_rank.json")
    if leaf not in ("id", "lat", "lon", "iso2"):
        parts.append("dest/{cc}.json")
    if leaf == "activities":
        parts.append("poi/{shard}.json (items_full)")
    return ", ".join(parts)


def mentions(path: Path, leaf: str) -> bool:
    return re.search(rf"\b{re.escape(leaf)}\b", path.read_text(encoding="utf-8", errors="replace")) is not None


def check(fields, curated, tasks, r2) -> list[str]:
    errs = []
    rows = curated["fields"]
    for f in fields:
        if f not in rows:
            errs.append(f"{f}: wire field with no lineage row")
    for f, row in rows.items():
        if f not in fields:
            errs.append(f"{f}: lineage row for a field the schema does not have")
        leaf = f.split(".")[-1]
        for t in row.get("tasks", []):
            if t not in tasks and t not in TOKENS:
                errs.append(f"{f}: task {t!r} is not in run_pipeline.py TASKS")
        if not row.get("tasks"):
            errs.append(f"{f}: no task")
        if not row.get("source"):
            errs.append(f"{f}: no source")
        if not row.get("writers") and "legacy" not in row.get("tasks", []):
            errs.append(f"{f}: no writer and not marked legacy")
        for w in row.get("writers", []):
            p = ROOT / w
            if not p.is_file():
                errs.append(f"{f}: writer {w} does not exist")
            elif not mentions(p, leaf):
                errs.append(f"{f}: writer {w} does not mention {leaf!r}")
    covered_tasks = set()
    covered_paths = []
    for wf in curated["wire_files"]:
        covered_paths.append(wf["path"])
        covered_tasks.update(wf["tasks"])
        for t in wf["tasks"]:
            if t not in tasks and t not in TOKENS:
                errs.append(f"wire file {wf['path']}: task {t!r} is not in run_pipeline.py TASKS")
        if not (ROOT / wf["writer"]).is_file():
            errs.append(f"wire file {wf['path']}: writer {wf['writer']} does not exist")
        for r in wf["readers"]:
            if not (ROOT / r).is_file():
                errs.append(f"wire file {wf['path']}: reader {r} does not exist")
    for key, t in tasks.items():
        if t.get("writes_wire") and key not in covered_tasks:
            errs.append(f"task {key}: writes_wire but is in no wire file row")
    for entry in r2:
        if not any(p.rstrip("/").split("/")[0] == entry for p in covered_paths):
            errs.append(f"R2_TIER entry {entry!r} has no wire file row")
    return errs


def check_request_paths() -> list[str]:
    """Each request path is an H2 in request-paths.md with a Mermaid diagram,
    and every repo file named in backticks exists."""
    errs = []
    if not PATHS_DOC.is_file():
        return [f"{PATHS_DOC.relative_to(ROOT).as_posix()} is missing"]
    text = PATHS_DOC.read_text(encoding="utf-8")
    sections = dict(re.findall(r"^## (.+?)\n(.*?)(?=^## |\Z)", text, re.MULTILINE | re.DOTALL))
    for name in REQUEST_PATHS:
        if name not in sections:
            errs.append(f"request path {name!r}: no section in request-paths.md")
        elif "```mermaid" not in sections[name]:
            errs.append(f"request path {name!r}: no Mermaid diagram")
    for ref in sorted(set(re.findall(r"`((?:continent-app|supabase|scripts|docs|pipeline)/[^`*{} ]+)`", text))):
        if not (ROOT / ref).exists():
            errs.append(f"request-paths.md names {ref}, which does not exist")
    return errs


def mid(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "_", s)


def cell(s: str) -> str:
    return s.replace("|", "\\|")


def render(fields, curated, tasks, rank, sources) -> str:
    rows = curated["fields"]
    lines = []
    w = lines.append
    w("# Data lineage")
    w("")
    w("Generated by `python -I scripts/docs/build_lineage.py` (T1166, ROADMAP B5). Do not edit by hand:")
    w("change `docs/architecture/lineage-fields.json` (source, task, artifact, writer) and rerun.")
    w("Wire files come from `continent-app/src/lib/bootIndex.js`; app readers are found by a pattern")
    w("search of `continent-app/src` for `dest.field`, `d?.field`, `meta.field` and similar, so a reader")
    w("that destructures a record is missed. Request paths are in [request-paths.md](request-paths.md).")
    w("")
    index = reader_index(sources)
    found = {f: readers(f, index) for f in fields}
    names = {f: name_only(f, sources) for f in fields if not found[f][1] and specific(f)}
    seen = [f for f in fields if found[f][1]]
    named = [f for f in fields if names.get(f)]
    unseen = [f for f in fields if f not in seen and f not in named]
    legacy = [f for f in fields if "legacy" in rows[f]["tasks"]]
    manual = [f for f in fields if "manual" in rows[f]["tasks"]]
    nowriter = [f for f in fields if not rows[f].get("writers")]
    w("## Counts")
    w("")
    w("| What | Count |")
    w("|---|---|")
    w(f"| Wire fields in `docs/wire.schema.json` | {len(fields)} |")
    w(f"| ...with a lineage row | {sum(f in rows for f in fields)} |")
    w(f"| ...read by the app (pattern search found a reader) | {len(seen)} |")
    w(f"| ...named in app code but no `rec.field` read (destructured or a string key) | {len(named)} |")
    w(f"| ...no reader found (shipped, not shown) | {len(unseen)} |")
    w(f"| ...written only or partly by a legacy step | {len(legacy)} |")
    w(f"| ...written only or partly by a script no task schedules | {len(manual)} |")
    w(f"| ...with no writer left in the repo | {len(nowriter)} |")
    w(f"| run_pipeline.py tasks | {len(tasks)} |")
    w(f"| ...that write a wire field or a wire file | {len(tasks_writing(curated, tasks))} |")
    w(f"| Wire files and folders | {len(curated['wire_files'])} |")
    w("")
    w("## The trunk")
    w("")
    w("Every wire field takes this road. The task writes the master; `sync-data.mjs` splits it.")
    w("")
    w("```mermaid")
    w("flowchart LR")
    w('  SRC["Open sources: Wikipedia, Wikidata, OSM, Eurostat, GeoNames, EEA, NASA POWER, Open Prices, scrapes"]')
    w('  CACHE["cache/ and data/ (harvest caches)"]')
    w('  TASK["run_pipeline.py task (pipeline/*.py writer)"]')
    w('  MASTER["app_data/app_data.json (master)"]')
    w('  SYNC["continent-app/scripts/sync-data.mjs + assertWire"]')
    w('  CORE["public/app_data.json (contract check only)"]')
    w('  BOOT["public/boot.json (Pages)"]')
    w('  RANK["public/dest/_rank.json (R2)"]')
    w('  SHARD["public/dest/{cc}.json (R2)"]')
    w('  POI["public/poi/{shard}.json (R2)"]')
    w('  APP["appData.js, bootIndex.js, then screens"]')
    w("  SRC --> CACHE --> TASK --> MASTER --> SYNC")
    w("  SYNC --> CORE")
    w("  SYNC --> BOOT --> APP")
    w("  SYNC --> RANK --> APP")
    w("  SYNC --> SHARD --> APP")
    w("  SYNC --> POI --> APP")
    w("```")
    w("")
    w("## Per wire field")
    w("")
    w("Task tokens: `legacy` is a retired notebook or one-off, carried forward in the master (new places get it")
    w("from the manual inserter); `manual` is a script no `run_pipeline.py` task runs; `sync` is the wire build.")
    w("Readers: the three files with the most reads, then the total count of reading files. Where no read is")
    w("found and the name is specific (an underscore, or eight letters and not a common word), files that only name it are listed as \"name only\".")
    w("")
    w("| Field | Source | Task | Artifact | Writer | Wire file | App readers |")
    w("|---|---|---|---|---|---|---|")
    for f in fields:
        r = rows[f]
        top, n = found[f]
        rd = ", ".join(f"`{p.removeprefix('continent-app/')}`" for p in top) + (f" ({n} files)" if n else "")
        if not rd and specific(f):
            no = names[f]
            rd = ("name only: " + ", ".join(f"`{p.removeprefix('continent-app/')}`" for p in no[:3])) if no else ""
        rd = rd or "none found"
        wr = ", ".join(f"`{p}`" for p in r.get("writers", [])) or "none in the repo"
        tk = ", ".join(f"`{t}`" for t in r["tasks"])
        w(f"| `{f}` | {cell(r['source'])} | {tk} | {cell(r['artifact'])} | {wr} | {wire_files(f, rank)} | {rd} |")
    notes = [(f, rows[f]["note"]) for f in fields if rows[f].get("note")]
    if notes:
        w("")
        w("Notes:")
        w("")
        for f, n in notes:
            w(f"- `{f}`: {n}")
    w("")
    w("## Per pipeline task")
    w("")
    w("One diagram per task that writes a wire field or a wire file: commands, then what reaches the wire.")
    w("")
    by_task = tasks_writing(curated, tasks)
    for key, t in tasks.items():
        if key not in by_task:
            continue
        flds, wfs = by_task[key]
        w(f"### `{key}` ({t.get('cadence')})")
        w("")
        w("```mermaid")
        w("flowchart LR")
        tid = "T_" + mid(key)
        w(f'  {tid}["{key}"]')
        prev = tid
        for i, c in enumerate(t["cmds"] or ([f"run_pipeline.py {t['run']}"] if t["run"] else [])):
            cid = f"C{i}"
            w(f'  {cid}["{c}"]')
            w(f"  {prev} --> {cid}")
            prev = cid
        if flds:
            w('  M["app_data/app_data.json"]')
            w(f"  {prev} --> M")
            w('  S["sync-data.mjs"]')
            w("  M --> S")
            for i, f in enumerate(flds):
                w(f'  F{i}["{f.replace("destinations.*.", "dest.")}"]')
                w(f"  S --> F{i}")
        for i, wf in enumerate(wfs):
            w(f'  W{i}["{wf["path"]} ({wf["host"]})"]')
            w(f"  {prev} --> W{i}")
        w("```")
        w("")
    rest = [k for k in tasks if k not in by_task]
    w("### Tasks that write no wire field or wire file")
    w("")
    w("These feed caches, reports or other tasks (their output reaches the wire through a task above, or not at all).")
    w("")
    w(", ".join(f"`{k}`" for k in rest))
    w("")
    w("## Wire files beside the contract")
    w("")
    w("The contract covers `app_data.json`. The other folders the app fetches, with the task and writer behind each.")
    w("")
    w("| Wire path (under `public/`) | Task | Writer | Host | App reader | What |")
    w("|---|---|---|---|---|---|")
    for wf in curated["wire_files"]:
        tk = ", ".join(f"`{t}`" for t in wf["tasks"])
        rd = ", ".join(f"`{p.removeprefix('continent-app/')}`" for p in wf["readers"])
        w(f"| `{wf['path']}` | {tk} | `{wf['writer']}` | {wf['host']} | {rd} | {wf['what']} |")
    w("")
    w("## Gaps this lineage shows")
    w("")
    w(f"- Shipped but no app reader found ({len(unseen)}): " + ", ".join(f"`{f}`" for f in unseen) + ".")
    w(f"- Written by a script no task schedules ({len(manual)}): " + ", ".join(f"`{f}`" for f in manual) + ".")
    w(f"- No writer left in the repo ({len(nowriter)}): " + (", ".join(f"`{f}`" for f in nowriter) or "none") + ".")
    w("")
    return "\n".join(lines)


def tasks_writing(curated, tasks) -> dict[str, tuple[list[str], list[dict]]]:
    out: dict[str, tuple[list[str], list[dict]]] = {}
    for f, r in curated["fields"].items():
        for t in r["tasks"]:
            if t in tasks:
                out.setdefault(t, ([], []))[0].append(f)
    for wf in curated["wire_files"]:
        for t in wf["tasks"]:
            if t in tasks:
                out.setdefault(t, ([], []))[1].append(wf)
    return out


def main(argv: list[str]) -> int:
    fields = schema_fields()
    curated = json.loads(CURATED.read_text(encoding="utf-8"))
    tasks = pipeline_tasks()
    errs = check(fields, curated, tasks, r2_tier()) + check_request_paths()
    for e in errs:
        print(f"FAIL {e}")
    if errs:
        print(f"lineage: {len(errs)} problem(s)")
        return 1
    text = render(fields, curated, tasks, rank_fields(), app_sources())
    if "--check" in argv:
        stale = not OUT.is_file() or OUT.read_text(encoding="utf-8") != text
        if stale:
            print(f"{'FAIL' if '--strict' in argv else 'note'}: {OUT.relative_to(ROOT).as_posix()} is stale; "
                  "run python -I scripts/docs/build_lineage.py")
            if "--strict" in argv:
                return 1
        print(f"lineage: ok, {len(fields)} wire fields with a row, {len(curated['wire_files'])} wire files, "
              f"{len(REQUEST_PATHS)} request paths with a diagram")
        return 0
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"lineage: wrote {OUT.relative_to(ROOT).as_posix()} ({len(fields)} fields)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
