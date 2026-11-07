#!/usr/bin/env bash
# Keep the box trails lab's R2 dump fresh (T1201, register row T1182-e).
#
# In box mode (CARTA_TRAILSLAB_HOME=box, T1182) the lab on the build box is
# the only live copy, the trailslab_worker task stands down, and R2 expires
# archive/db/ after 30 days. carta-trailslab-push.timer runs this once a week;
# it runs `lab.sh push` when the last push in the lab's sync stamp is older
# than CARTA_TRAILSLAB_PUSH_DAYS (blank = 21), so the gap between two pushes
# is at most 28 days. Outside box mode it logs a skip and exits 0.
#
#   bash infra/hetzner/cax11/trailslab_push_due.sh            push when due
#   bash infra/hetzner/cax11/trailslab_push_due.sh --dry-run  say what it would do
#
# The stamp is lab.sh's: one line "push|restore <max review id> <UTC time>".
# A restore does not count as a push (it wrote nothing to R2), so after a
# restore the next run pushes. Exit codes: 0 done or skipped, else lab.sh's.
# ASCII clean, no em dashes, per project convention.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
LOADENV="$HERE/load-env.sh"
# shellcheck source=/dev/null
[ -r "$LOADENV" ] && [ "${CARTA_LAB_NO_ENV:-0}" != "1" ] && . "$LOADENV"

DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    *) echo "trailslab_push_due.sh: unknown argument $a" >&2; exit 2 ;;
  esac
done

say() { printf '%s trailslab-push: %s\n' "$(date -u +%FT%TZ)" "$*"; }

if [ "${CARTA_TRAILSLAB_HOME:-}" != "box" ]; then
  say "skip: CARTA_TRAILSLAB_HOME is not box (the worker keeps the dump fresh)"
  exit 0
fi

LAB_SH="${CARTA_LAB_SH:-$REPO/tools/trailslab/box/lab.sh}"
# Same default as lab.sh: beside the data directory, on the volume.
STAMP="${CARTA_TRAILSLAB_STAMP:-${TRAILSLAB_DATA_DIR:-$HOME/trailslab}/../trailslab-sync.txt}"
DAYS="${CARTA_TRAILSLAB_PUSH_DAYS:-21}"
NOW="${CARTA_NOW_EPOCH:-$(date -u +%s)}"

due=1
why="no sync stamp at $STAMP"
if [ -r "$STAMP" ]; then
  read -r kind _ when < "$STAMP" || true
  if [ "${kind:-}" = "push" ] && then_s="$(date -u -d "${when:-}" +%s 2>/dev/null)"; then
    age=$(( (NOW - then_s) / 86400 ))
    if [ "$age" -lt "$DAYS" ]; then
      due=0; why="last push $when, $age day(s) ago, under $DAYS"
    else
      why="last push $when, $age day(s) ago"
    fi
  else
    why="last sync is '${kind:-unknown}', not a push"
  fi
fi

if [ $due -eq 0 ]; then
  say "not due: $why"
  exit 0
fi
say "due: $why; running lab.sh push"
if [ $DRY -eq 1 ]; then
  exec bash "$LAB_SH" push --dry-run
fi
exec bash "$LAB_SH" push
