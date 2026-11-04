#!/usr/bin/env bash
# merge_branch.sh <repo-dir> <branch> <message>
# Merges <branch> --no-ff into the current branch of <repo-dir>. Conflicts in
# Execution/_OPEN.md are resolved by a union of both sides (keep every row);
# any other conflict aborts the merge and exits 2.
set -u
repo="$1"; branch="$2"; msg="$3"
cd "$repo" || exit 9
if git merge --no-ff -q -m "$msg" "$branch" >/tmp/merge_out.txt 2>&1; then
  echo "merged $branch cleanly"; exit 0
fi
conflicts=$(git diff --name-only --diff-filter=U)
for f in $conflicts; do
  if [ "$f" = "Execution/_OPEN.md" ]; then
    git show ":1:$f" > /tmp/_open_base 2>/dev/null || : > /tmp/_open_base
    git show ":2:$f" > /tmp/_open_ours
    git show ":3:$f" > /tmp/_open_theirs
    git merge-file --union -p /tmp/_open_ours /tmp/_open_base /tmp/_open_theirs > "$f"
    git add "$f"
  else
    echo "REAL CONFLICT in $f while merging $branch"; git merge --abort; exit 2
  fi
done
git commit -q --no-edit -m "$msg" && echo "merged $branch (union-resolved _OPEN.md)"
