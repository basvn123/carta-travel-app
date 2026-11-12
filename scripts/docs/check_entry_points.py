"""Fail when an entry-point doc names a path that does not exist (ROADMAP A4).

Every Claude session starts at CLAUDE.md and docs/project-map.md and follows
their pointers, so a dead pointer costs every session. Run from anywhere:

    python -I scripts/docs/check_entry_points.py

Rules:
- In docs/project-map.md, every repo path in a table row or in backticks is
  checked. `app/` means `continent-app/`.
- In CLAUDE.md and docs/lessons.md, every path in backticks is checked.
- A path may resolve from the repo root or from `continent-app/` (deploy
  commands are given from inside the app).
- Placeholders (`{n}`, `*`, `<...>`), absolute paths, URLs and throwaway build
  output are skipped. A path written to say it does not exist, or a git tag
  name, is listed in INTENTIONALLY_ABSENT.
- An entry file that is missing is skipped, but at least one path must be
  checked, so an empty run cannot pass.
Exit 0 when all paths exist, 1 otherwise (each missing path is printed).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "continent-app"

# (file, also check table rows): the docs every session is pointed at first.
ENTRY_FILES = (("CLAUDE.md", False), ("docs/project-map.md", True), ("docs/lessons.md", False))

PREFIXES = ("app/", "continent-app/", "pipeline/", "supabase/", "infra/", "scripts/",
            "tools/", "reports/", "src/", "docs/", "tests/", ".github/", ".claude/", ".work/",
            "cache/", "public/", "logs/", "data/", "config/", "functions/", "workers/",
            "services/", "prompts/", "evals/", "ops/", "content/", "app_data/", "Trips/")
ROOT_FILES = {"CLAUDE.md", "ROADMAP.md", "PRODUCT.md", "DESIGN.md", "README.md",
              "run_pipeline.py", "run_pipeline.bat", "requirements.txt", "requirements-ml.txt",
              "requirements-docs.txt", "constraints.txt", "mkdocs.yml"}
# Throwaway build output and per-session folders: allowed to be missing.
# Also paths that live only on the owner's laptop, never in git, so a fresh
# checkout (CI) lacks them: the stale nested repo and the scheduler's logs
# folder (T1061), and run folders, which are local.
MAY_BE_ABSENT = {"dist/", "dist-data/", ".fastbuild/", "../.fastbuild", "node_modules/",
                 "continent-app/.git", "logs/", "logs/pipeline_state.json", ".work/.active", "data/raw",
                 "cache/", "tools/trailslab/", "tools/brouter/"}
# Named on purpose to say they do not exist, or names that are git tags, not paths.
INTENTIONALLY_ABSENT = {"pipeline/schema.py", "archive/execution-full-2026-11-03",
                        "archive/execution-2026-11-11"}

PATH_RE = re.compile(r"(?<![\w./-])((?:%s)[A-Za-z0-9_./{}*<>-]*|[A-Za-z0-9_.-]+\.(?:md|py|bat|txt|yml))"
                     % "|".join(re.escape(p) for p in PREFIXES))


def candidates(text: str) -> set[str]:
    out = set()
    for m in PATH_RE.finditer(text):
        p = m.group(1).rstrip(".,;:)")
        if not p or any(c in p for c in "{}*<>"):
            continue
        if p.startswith(("http", "C:", "/")):
            continue
        if "/" not in p and p not in ROOT_FILES:
            continue
        out.add(p)
    return out


def exists(p: str) -> bool:
    if p in MAY_BE_ABSENT or p in INTENTIONALLY_ABSENT:
        return True
    rel = p[len("app/"):] if p.startswith("app/") else p
    if p.startswith("app/"):
        return (APP / rel).exists()
    return (ROOT / rel).exists() or (APP / rel).exists()


def entry_text(path: Path, rows: bool) -> str:
    text = path.read_text(encoding="utf-8")
    ticks = re.findall(r"`([^`]+)`", text)
    table = [line for line in text.splitlines() if line.startswith("|")] if rows else []
    return "\n".join(table + ticks)


def main() -> int:
    missing = []
    checked = 0
    names = []
    for name, rows in ENTRY_FILES:
        path = ROOT / name
        if not path.exists():
            continue
        names.append(name)
        for p in sorted(candidates(entry_text(path, rows))):
            checked += 1
            if not exists(p):
                missing.append(f"{name}: {p}")
    if checked == 0:
        print("Entry points: no path checked; is CLAUDE.md or docs/project-map.md missing?")
        return 1
    if missing:
        print("Entry points name paths that do not exist:")
        for m in missing:
            print("  " + m)
        print(f"{len(missing)} missing of {checked} checked.")
        return 1
    print(f"Entry points OK: {checked} paths checked in {', '.join(names)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
