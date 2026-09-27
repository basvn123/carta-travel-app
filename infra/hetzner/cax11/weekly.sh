#!/usr/bin/env bash
# Placeholder weekly job for the Carta orchestrator (T046).
#
# Run by carta-weekly.service, which carta-weekly.timer starts every Monday
# at 09:00 Europe/Brussels and ten minutes after each boot (both defined in
# cloud-init.yaml). All it does is prove the schedule works: it loads the
# secrets file the real job will need and appends one line to the log.
# verify.sh counts those lines.
#
# T048 replaces the body with the ported run_pipeline.bat: activate
# /home/carta/venv, run run_pipeline.py from /home/carta/carta, log to
# /home/carta/logs. Keep the load-env.sh line when it does.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${CARTA_LOG_DIR:-$HOME/logs}"
mkdir -p "$LOG_DIR"

# shellcheck source=load-env.sh
. "$HERE/load-env.sh"

# Count configured secrets without ever printing a value.
set_count=0
total=0
if [ -r "${CARTA_ENV_FILE}" ]; then
  for k in $(grep -oE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=' "$CARTA_ENV_FILE" | tr -d ' =' ); do
    total=$((total + 1))
    if [ -n "${!k:-}" ]; then set_count=$((set_count + 1)); fi
  done
fi

printf '%s cron fired on %s (placeholder until T048; %d of %d env variables set)\n' \
  "$(date -Is)" "$(hostname)" "$set_count" "$total" >> "$LOG_DIR/weekly.log"
