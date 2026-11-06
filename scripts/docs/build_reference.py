"""Build and check docs/reference/ (ROADMAP B6, T1167).

    python -I scripts/docs/build_reference.py            # write the generated files
    python -I scripts/docs/build_reference.py --check    # exit 1 when tasks.md or supabase.md is stale
    python -I scripts/docs/build_reference.py --check --strict   # also python.md and app-lib.md

The two API files move with every code edit, so they fail the check only with --strict
(otherwise a note); the task catalogue and the Supabase schema change rarely and fail it.
Writes docs/reference/{python,app-lib,tasks,supabase}.md. config.md (config_reference.py,
B4) and evals.md (eval/run.mjs, F6) have their own generators and are only listed here.
Pure text in, text out: no network, no imports of repo code. CARTA_REPO_ROOT points at
another tree.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
ROOT = Path(os.environ.get("CARTA_REPO_ROOT") or HERE.parents[1]).resolve()

import reference_api as api  # noqa: E402
import reference_sql_tasks as st  # noqa: E402


def outputs(root: Path) -> dict[str, str]:
    return {
        "docs/reference/python.md": api.render_python(root),
        "docs/reference/app-lib.md": api.render_app_lib(root),
        "docs/reference/tasks.md": st.render_tasks(root, st.load_lineage(root)),
        "docs/reference/supabase.md": st.render_supabase(root),
    }


def main(argv: list[str]) -> int:
    out = outputs(ROOT)
    if "--check" in argv:
        stale = [p for p, t in out.items() if not (ROOT / p).is_file() or (ROOT / p).read_text(encoding="utf-8") != t]
        hard = [p for p in stale if "--strict" in argv or p.rsplit("/", 1)[1] in ("tasks.md", "supabase.md")]
        for p in stale:
            print(f"{'FAIL' if p in hard else 'note'} {p} is stale; run python -I scripts/docs/build_reference.py")
        if hard:
            return 1
        print(f"reference: ok, {len(out)} generated files match the source")
        return 0
    for p, t in out.items():
        (ROOT / p).write_text(t, encoding="utf-8", newline="\n")
        print(f"reference: wrote {p} ({len(t.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
