#!/bin/bash
# usage: status.sh "branch:T1140" ...
cd /home/user/carta-travel-app
git fetch -q origin 2>/dev/null
for p in "$@"; do b=${p%%:*}; t=${p##*:}
  if git rev-parse -q --verify origin/$b >/dev/null; then
    last=$(git log -1 --format='%cr %s' origin/$b | cut -c1-80)
    rep=$(git ls-tree -r --name-only origin/$b Execution/P15/ | grep "$t" | head -1)
    echo "$b | last: $last | report: ${rep:-none}"
  else
    alt=$(git log --all --oneline --grep="$t" | head -2 | tr '\n' ' ')
    echo "$b | no branch | grep: $alt"
  fi
done
