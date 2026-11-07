#!/usr/bin/env bash
# Install the real weekly schedule on the Carta orchestrator (T048). The last
# owner step of the port: run it only after every step in
# infra/hetzner/cax11/weekly_tasks.txt has passed verify_tasks.sh and the wire
# comparison has passed (Execution/P3/_OPEN-hetzner.md).
#
#   sudo bash /home/carta/carta/infra/hetzner/cron/install.sh             install and enable
#   sudo bash /home/carta/carta/infra/hetzner/cron/install.sh --dry-run   print, change nothing
#   sudo bash /home/carta/carta/infra/hetzner/cron/install.sh --disable   stop every timer (pause switch)
#
# What it does:
#   carta-weekly.service and .timer overwrite the T046 placeholder units that
#     cloud-init wrote: the service sets CARTA_PIPELINE_ENABLED=1 (without it
#     weekly.sh only logs "cron fired") and a 48 h start timeout, the timer
#     drops the ten-minutes-after-boot firing;
#   carta-monthly and carta-quarterly .service and .timer (T1107, ROADMAP H9)
#     run the same weekly.sh at the monthly and quarterly ceilings: first
#     Saturday of the month, and third Saturday of January, April, July and
#     October, 03:00 Brussels. schedule.py --check runs first and refuses the
#     install when a task is in no tier or a unit disagrees with its table;
#   carta-backup.service and .timer (T1159, ROADMAP H5) run ops/backup_nightly.sh
#     every night at 01:30 Brussels: encrypted pg_dump to R2, 30-day retention;
#   carta-stays-scrape.service and .timer (T1161, ROADMAP H10) run
#     infra/hetzner/cax11/stays_scrape.sh nightly at 00:05; it idles unless
#     CARTA_STAYS_SCRAPE=1 and outside March and September;
#   carta-reboot.service and .timer add the Sunday 04:00 reboot window, and
#     reboot-if-needed.sh is copied to /usr/local/sbin, owned by root, because
#     a root unit must not execute a file the carta user can edit;
#   carta-logrotate goes to /etc/logrotate.d/carta;
#   carta-late-sweep.service (T798) is the flight sweep's late tier, always
#     on; --disable stops it with the timers;
#   carta-late-fill.service (T819) runs the box's one-time fills (T915 gap
#     search, T917 January and February, T819 late tier); it exits when done
#     and a later start only logs that; restarted like the sweep (T915);
#   every unit is checked with systemd-analyze verify before it is enabled.
# Carriage returns are stripped on the way in, in case the files were copied
# from a Windows checkout.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR=/etc/systemd/system
DRY=0
MODE=install
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --disable) MODE=disable ;;
    -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "install.sh: unknown argument $a" >&2; exit 2 ;;
  esac
done

run() { echo "+ $*"; [ $DRY -eq 1 ] || "$@"; }

if [ $DRY -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
  echo "install.sh: run with sudo" >&2; exit 1
fi

if [ "$MODE" = disable ]; then
  run systemctl disable --now carta-weekly.timer carta-monthly.timer carta-quarterly.timer carta-backup.timer carta-reboot.timer carta-stays-scrape.timer carta-late-sweep.service carta-late-fill.service
  echo "Every timer and the late sweep stopped. A run already in progress continues; stop it with: sudo systemctl stop carta-weekly.service carta-monthly.service carta-quarterly.service"
  exit 0
fi

put() {  # source, destination, mode
  echo "+ install -m $3 $1 -> $2 (CR stripped)"
  [ $DRY -eq 1 ] && return 0
  local tmp; tmp="$(mktemp)"
  tr -d '\r' < "$1" > "$tmp"
  install -o root -g root -m "$3" "$tmp" "$2"
  rm -f "$tmp"
}

for u in carta-weekly.service carta-weekly.timer carta-monthly.service carta-monthly.timer carta-quarterly.service carta-quarterly.timer carta-backup.service carta-backup.timer carta-stays-scrape.service carta-stays-scrape.timer carta-reboot.service carta-reboot.timer carta-late-sweep.service carta-late-fill.service; do
  [ -f "$HERE/$u" ] || { echo "install.sh: $HERE/$u missing" >&2; exit 1; }
done
[ -f "$HERE/../cax11/weekly.sh" ] || { echo "install.sh: weekly.sh missing next to this directory" >&2; exit 1; }

# T1107: every task in a tier and the units in step with the table, or no install.
echo "+ python3 $HERE/schedule.py --check --no-state"
python3 "$HERE/schedule.py" --check --no-state \
  || { echo "install.sh: schedule.py --check failed (a task in no tier, or a unit out of step); nothing installed" >&2; exit 1; }

put "$HERE/reboot-if-needed.sh" /usr/local/sbin/carta-reboot-if-needed 0755
for u in carta-weekly.service carta-weekly.timer carta-monthly.service carta-monthly.timer carta-quarterly.service carta-quarterly.timer carta-backup.service carta-backup.timer carta-stays-scrape.service carta-stays-scrape.timer carta-reboot.service carta-reboot.timer carta-late-sweep.service carta-late-fill.service; do
  put "$HERE/$u" "$UNIT_DIR/$u" 0644
done
put "$HERE/carta-logrotate" /etc/logrotate.d/carta 0644

if [ $DRY -eq 0 ]; then
  echo "+ systemd-analyze verify"
  systemd-analyze verify "$UNIT_DIR/carta-weekly.service" "$UNIT_DIR/carta-weekly.timer" \
    "$UNIT_DIR/carta-monthly.service" "$UNIT_DIR/carta-monthly.timer" \
    "$UNIT_DIR/carta-quarterly.service" "$UNIT_DIR/carta-quarterly.timer" \
    "$UNIT_DIR/carta-backup.service" "$UNIT_DIR/carta-backup.timer" \
    "$UNIT_DIR/carta-stays-scrape.service" "$UNIT_DIR/carta-stays-scrape.timer" \
    "$UNIT_DIR/carta-reboot.service" "$UNIT_DIR/carta-reboot.timer" "$UNIT_DIR/carta-late-sweep.service" \
    "$UNIT_DIR/carta-late-fill.service"
  echo "+ logrotate --debug /etc/logrotate.d/carta"
  logrotate --debug /etc/logrotate.d/carta >/dev/null
fi

run systemctl daemon-reload
run systemctl enable --now carta-weekly.timer carta-monthly.timer carta-quarterly.timer carta-backup.timer carta-reboot.timer carta-stays-scrape.timer
# T798: restart, not just start, so a new run.mjs is picked up after a code move.
run systemctl enable carta-late-sweep.service
run systemctl restart carta-late-sweep.service
run systemctl enable carta-late-fill.service
# T915: restart, so a running fill picks up new code; it resumes where it was.
run systemctl restart carta-late-fill.service
[ $DRY -eq 1 ] || systemctl list-timers 'carta-*' --no-pager
echo
echo "Installed. Monday 09:00 runs the weekly tier, the first Saturday of the month 03:00 the monthly"
echo "tier, the third Saturday of Jan, Apr, Jul and Oct 03:00 the quarterly tier (Europe/Brussels)."
echo "carta-stays-scrape.timer: every night 00:05; works only with CARTA_STAYS_SCRAPE=1, in March and September (T1161)"
echo "carta-backup.timer: every night 01:30 Brussels (nightly Supabase dump to R2); run now: sudo systemctl start --no-block carta-backup.service"
echo "To run a tier now: sudo systemctl start --no-block carta-<weekly|monthly|quarterly>.service"
echo "Follow it with: journalctl -fu carta-<tier>.service"
