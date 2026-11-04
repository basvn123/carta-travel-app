"""Fail when CLAUDE.md or MAP.md names a path that does not exist (ROADMAP A4, T1051).

Every Claude session reads these two files first and follows their pointers,
so a dead pointer costs every session. Run from anywhere:

    python -I scripts/docs/check_entry_points.py

Rules:
- In MAP.md, every repo path in the "Product areas" table and in backticks is
  checked. `app/` means `continent-app/`.
- In CLAUDE.md, every path in backticks is checked.
- A path may resolve from the repo root or from `continent-app/` (CLAUDE.md
  gives deploy commands from inside the app).
- Placeholders (`{n}`, `*`, `<...>`), absolute paths, URLs and throwaway build
  output are skipped. A path written to say it does not exist is listed in
  INTENTIONALLY_ABSENT.
Exit 0 when all paths exist, 1 otherwise (each missing path is printed).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "continent-app"

PREFIXES = ("app/", "continent-app/", "pipeline/", "supabase/", "infra/", "scripts/",
            "tools/", "reports/", "src/", "docs/", "Execution/", "tests/", ".github/",
            "archive/", "cache/", "public/", "logs/", "data/", "config/", "functions/",
            "workers/")
ROOT_FILES = {"CLAUDE.md", "MAP.md", "ROADMAP.md", "PRODUCT.md", "DESIGN.md", "README.md",
              "run_pipeline.py", "run_pipeline.bat", "requirements.txt", "requirements-ml.txt"}
# Throwaway build output and per-session folders: allowed to be missing.
MAY_BE_ABSENT = {"dist/", "dist-data/", ".fastbuild/", "../.fastbuild", "node_modules/"}
# Named on purpose to say they do not exist, or names that are git tags, not paths.
INTENTIONALLY_ABSENT = {"pipeline/schema.py", "archive/execution-full-2026-11-03"}

PATH_RE = re.compile(r"(?<![\w./-])((?:%s)[A-Za-z0-9_./{}*<>-]*|[A-Za-z0-9_.-]+\.(?:md|py|bat|txt))"
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


def map_text() -> str:
    text = (ROOT / "MAP.md").read_text(encoding="utf-8")
    rows = [l for l in text.splitlines() if l.startswith("|")]
    ticks = re.findall(r"`([^`]+)`", text)
    return "\n".join(rows + ticks)


def claude_text() -> str:
    text = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    return "\n".join(re.findall(r"`([^`]+)`", text))


def main() -> int:
    missing = []
    checked = 0
    for name, text in (("MAP.md", map_text()), ("CLAUDE.md", claude_text())):
        for p in sorted(candidates(text)):
            checked += 1
            if not exists(p):
                missing.append(f"{name}: {p}")
    if missing:
        print("Entry points name paths that do not exist:")
        for m in missing:
            print("  " + m)
        print(f"{len(missing)} missing of {checked} checked.")
        return 1
    print(f"Entry points OK: {checked} paths checked in MAP.md and CLAUDE.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
