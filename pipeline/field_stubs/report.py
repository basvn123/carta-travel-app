"""Field stubs: every sheet field that has a slot in the app but no source yet.

Tier: On demand (python pipeline/field_stubs/report.py)

T630 to T632 (explore completeness) gave every field a traveller needs a slot
on the Explore detail sheets. A field whose source is not wired yet keeps a
placeholder in the app ("Not available yet") and a stub here: a clearly named
function that writes nothing, so the next scrape knows exactly what to fill.

Each task keeps its own module next to this file (t630_routes.py,
t631_water.py, t632_practical.py), so tasks never edit the same lines. A
module declares:

    STUBS = [
        {
            "field":    "lido_price",            # the field, as the sheet names it
            "layer":    "beaches",               # trails / cycling / mountains / lakes / beaches / destinations
            "wire_key": "lido.price",            # the key the app reads (absent today)
            "source":   "none known (open data)",# where a later scrape would get it
            "stub":     "harvest_lido_prices",   # the function in the module
            "task":     "T631",
        },
    ]

and one function per row named by "stub" that returns None and writes
nothing. This report lists them all, writing data/reports/field_stubs.md and
data/reports/field_stubs.json, and checks every named stub exists. The list
is the to-do list for the next data update; the coverage percentages per
field live in the batch report (Execution/P15/T630-T632-explore-completeness.md).
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT_MD = ROOT / "data" / "reports" / "field_stubs.md"
OUT_JSON = ROOT / "data" / "reports" / "field_stubs.json"
FIELDS = ("field", "layer", "wire_key", "source", "stub", "task")


def _load(path: Path):
    spec = importlib.util.spec_from_file_location(f"field_stubs_{path.stem}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def collect() -> list[dict]:
    rows: list[dict] = []
    for path in sorted(HERE.glob("t*.py")):
        mod = _load(path)
        for row in getattr(mod, "STUBS", []):
            missing = [k for k in FIELDS if not row.get(k)]
            if missing:
                raise ValueError(f"{path.name}: stub row {row!r} lacks {missing}")
            fn = getattr(mod, row["stub"], None)
            if not callable(fn):
                raise ValueError(f"{path.name}: stub function {row['stub']} is missing")
            if fn() is not None:
                raise ValueError(f"{path.name}: stub {row['stub']} must write nothing and return None")
            rows.append({**{k: row[k] for k in FIELDS}, "module": path.name})
    return rows


def main() -> int:
    rows = collect()
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    lines = [
        "# Field stubs",
        "",
        "Fields the Explore sheets show as \"Not available yet\" because no source is wired.",
        "Written by pipeline/field_stubs/report.py.",
        "",
        "| Layer | Field | Wire key | Source to wire | Stub | Task |",
        "|---|---|---|---|---|---|",
    ]
    for r in sorted(rows, key=lambda r: (r["layer"], r["field"])):
        lines.append(f"| {r['layer']} | {r['field']} | `{r['wire_key']}` | {r['source']} "
                     f"| `{r['module']}:{r['stub']}` | {r['task']} |")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(rows)} stubbed fields -> {OUT_MD.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
