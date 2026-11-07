"""The monthly blog routine: put this month's drafts on a branch (ROADMAP K14, T1174).

Tier: Scheduled

Runs on the box after `blog_drafts` (pipeline task `blog_pr`, monthly tier). It
never publishes and never touches main:

  1. `check_draft.py` over every changed post; any refusal stops the routine.
  2. A branch `blog-drafts-YYYY-MM` is made from the checkout, `content/blog/`
     (and nothing else) is committed to it, and the branch is pushed.
  3. The checkout goes back to where it was. The owner opens the pull request
     from the pushed branch, reads and edits the drafts, sets `status: published`
     on the ones to publish, and merges. Publishing is theirs.

Without `CARTA_BLOG_PR=1` (or `--push`) it is a dry run: it prints what it would
commit and push, and changes nothing. A branch name that is main, master or
p15-round2 is refused.

Usage, from the repo root:
    python scripts/blog/monthly_pr.py               # dry run
    CARTA_BLOG_PR=1 python scripts/blog/monthly_pr.py
    python scripts/blog/monthly_pr.py --month 2026-12 --repo-dir /path --remote origin
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import check_draft  # noqa: E402

PROTECTED = {"main", "master", "p15-round2"}
PATHS = "content/blog"


def git(repo, *args, check=True):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    if check and r.returncode:
        raise SystemExit(f"monthly_pr: git {' '.join(args)} failed: {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout.strip()


def changed_posts(repo):
    """Paths under content/blog that are new or modified in the working tree."""
    out = git(repo, "status", "--porcelain", "--untracked-files=all", "--", PATHS)
    files = []
    for ln in out.splitlines():
        path = ln[3:].strip().strip('"')
        if " -> " in path:
            path = path.split(" -> ")[1]
        files.append(path)
    return files


def run(repo, month, remote="origin", push=False, log=print):
    branch = f"blog-drafts-{month}"
    if branch in PROTECTED:
        raise SystemExit(f"monthly_pr: refusing to use branch {branch}")
    files = changed_posts(repo)
    posts = [f for f in files if f.endswith(".md") and f.startswith(PATHS + "/") and f.count("/") == 2
             and not os.path.basename(f).startswith(("README", "_"))]
    if not files:
        log("monthly_pr: nothing changed under content/blog; nothing to do")
        return 0
    bad = 0
    for p in posts:
        problems = check_draft.check_file(os.path.join(repo, p))
        for pr in problems:
            log(f"monthly_pr: CHECK FAILED: {p}: {pr}")
        bad += bool(problems)
    if bad:
        log("monthly_pr: stopped, nothing committed")
        return 1
    log(f"monthly_pr: {len(files)} files, {len(posts)} posts, branch {branch}")
    for f in files:
        log(f"  {f}")
    if not push:
        log("monthly_pr: dry run (set CARTA_BLOG_PR=1 to commit and push); nothing changed")
        return 0
    start = git(repo, "rev-parse", "--abbrev-ref", "HEAD")
    start = start if start != "HEAD" else git(repo, "rev-parse", "HEAD")
    git(repo, "checkout", "-B", branch)
    try:
        git(repo, "add", "--", PATHS)
        git(repo, "commit", "-q", "-m", f"Blog drafts for {month}\n\nWritten by pipeline/blog/blog_drafts.py, checked by scripts/blog/check_draft.py. All drafts: status draft; publishing is the owner's.")
        git(repo, "push", "-u", remote, branch)
    finally:
        git(repo, "checkout", "-q", start, check=False)
    log(f"monthly_pr: pushed {remote}/{branch}; open a pull request from it and read the drafts before merging")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--month", default=dt.date.today().strftime("%Y-%m"))
    ap.add_argument("--repo-dir", default=ROOT)
    ap.add_argument("--remote", default="origin")
    ap.add_argument("--push", action="store_true")
    a = ap.parse_args(argv)
    return run(a.repo_dir, a.month, a.remote, a.push or os.environ.get("CARTA_BLOG_PR") == "1")


if __name__ == "__main__":
    sys.exit(main())
