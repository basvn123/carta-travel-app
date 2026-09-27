#!/usr/bin/env bash
# Install the real weekly schedule on the Carta orchestrator (T048). The last
# owner step of the port: run it only after every step in
# infra/hetzner/cax11/weekly_tasks.txt has passed verify_tasks.sh and the wire
# comparison has passed (Execution/P3/_OPEN-hetzner.md).
#
#   sudo bash /home/carta/carta/infra/hetzner/cron/install.sh             install and enable
#   sudo bash /home/carta/carta/infra/hetzner/cron/install.sh --dry-run   print, change nothing
#   sudo bash /home/carta/carta/infra/hetzner/cron/install.sh --disable   stop both timers (pause switch)
#
# What it does:
#   carta-weekly.service and .timer overwrite the T046 placeholder units that
#     cloud-init wrote: the service sets CARTA_PIPELINE_ENABLED=1 (without it
#     weekly.sh only logs "cron fired") and a 48 h start timeout, the timer
#     drops the ten-minutes-after-boot firing;
#   carta-reboot.service and .timer add the Sunday 04:00 reboot window, and
#     reboot-if-needed.sh is copied to /usr/local/sbin, owned by root, because
#     a root unit must not execute a file the carta user can edit;
#   carta-logrotate goes to /etc/logrotate.d/carta;
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
    -h|--help) sed -n '2,24p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "install.sh: unknown argument $a" >&2; exit 2 ;;
  esac
done

run() { echo "+ $*"; [ $DRY -eq 1 ] || "$@"; }

if [ $DRY -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
  echo "install.sh: run with sudo" >&2; exit 1
fi

if [ "$MODE" = disable ]; then
  run systemctl disable --now carta-weekly.timer carta-reboot.timer
  echo "Both timers stopped. A run already in progress continues; stop it with: sudo systemctl stop carta-weekly.service"
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

for u in carta-weekly.service carta-weekly.timer carta-reboot.service carta-reboot.timer; do
  [ -f "$HERE/$u" ] || { echo "install.sh: $HERE/$u missing" >&2; exit 1; }
done
[ -f "$HERE/../cax11/weekly.sh" ] || { echo "install.sh: weekly.sh missing next to this directory" >&2; exit 1; }

put "$HERE/reboot-if-needed.sh" /usr/local/sbin/carta-reboot-if-needed 0755
for u in carta-weekly.service carta-weekly.timer carta-reboot.service carta-reboot.timer; do
  put "$HERE/$u" "$UNIT_DIR/$u" 0644
done
put "$HERE/carta-logrotate" /etc/logrotate.d/carta 0644

if [ $DRY -eq 0 ]; then
  echo "+ systemd-analyze verify"
  systemd-analyze verify "$UNIT_DIR/carta-weekly.service" "$UNIT_DIR/carta-weekly.timer" \
    "$UNIT_DIR/carta-reboot.service" "$UNIT_DIR/carta-reboot.timer"
  echo "+ logrotate --debug /etc/logrotate.d/carta"
  logrotate --debug /etc/logrotate.d/carta >/dev/null
fi

run systemctl daemon-reload
run systemctl enable --now carta-weekly.timer carta-reboot.timer
[ $DRY -eq 1 ] || systemctl list-timers 'carta-*' --no-pager
echo
echo "Installed. The next Monday 09:00 (Europe/Brussels) runs the weekly cadence."
echo "To run now instead of waiting: sudo systemctl start --no-block carta-weekly.service"
echo "Follow it with: journalctl -fu carta-weekly.service"
