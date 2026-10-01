#!/usr/bin/env bash
# Reboot the Carta orchestrator if a security update asked for it and no
# pipeline run is active (T048, register row T046-k). Installed by install.sh
# as /usr/local/sbin/carta-reboot-if-needed, owned by root, and run by
# carta-reboot.service from carta-reboot.timer (Sunday 04:00). Every decision
# goes to the journal: journalctl -u carta-reboot.service
#
# A run is active when any of these holds, and each is checked because each
# catches a case the others miss:
#   carta-weekly.service is active            the scheduled run
#   logs/carta-run.lock is held (flock)       run_pipeline.sh or verify_tasks.sh by hand
#   a run_pipeline.py process exists          a bare python run_pipeline.py by hand
#   a CAX41 spawn is live                     spawn.sh drives a worker for hours;
#                                             a reboot TERMs it, its trap deletes
#                                             the worker and the run is lost (T047-l)
set -uo pipefail

REPO="${CARTA_REPO:-/home/carta/carta}"
say() { echo "carta-reboot: $*"; }

if [ ! -f /var/run/reboot-required ]; then
  say "no reboot required"
  exit 0
fi
pkgs="$(tr '\n' ' ' < /var/run/reboot-required.pkgs 2>/dev/null || true)"

if systemctl is-active --quiet carta-weekly.service; then
  say "reboot required (${pkgs:-packages unknown}) but carta-weekly.service is running; skipped until next week"
  exit 0
fi
if [ -e "$REPO/logs/carta-run.lock" ] && ! flock -n "$REPO/logs/carta-run.lock" true; then
  say "reboot required but $REPO/logs/carta-run.lock is held (a hand run or verify_tasks.sh); skipped"
  exit 0
fi
if pgrep -f 'run_pipeline\.py' >/dev/null 2>&1; then
  say "reboot required but a run_pipeline.py process is alive; skipped"
  exit 0
fi
# spawn.sh writes "<pid> <run id>" to logs/cax41-<job>.lock.d/owner for the
# length of a spawn (CARTA_STATE_DIR moves it; the process check below still
# catches that case). The pid must be alive AND be a spawn.sh, so a stale lock
# whose pid was reused cannot hold the window shut. --sweep runs take no lock
# and last seconds, so they do not count.
for owner in "$REPO"/logs/cax41-*.lock.d/owner; do
  [ -f "$owner" ] || continue
  read -r opid orun < "$owner" || true
  if [ -n "${opid:-}" ] && kill -0 "$opid" 2>/dev/null \
     && tr '\0' ' ' < "/proc/$opid/cmdline" 2>/dev/null | grep -q 'spawn\.sh'; then
    say "reboot required but a CAX41 spawn is live (pid $opid, run ${orun:-?}, $owner); skipped"
    exit 0
  fi
done
if pgrep -af 'cax41/spawn\.sh' 2>/dev/null | grep -qv -- '--sweep'; then
  say "reboot required but a cax41/spawn.sh process is alive; skipped"
  exit 0
fi

say "reboot required (${pkgs:-packages unknown}); no run active; rebooting now"
systemctl reboot
