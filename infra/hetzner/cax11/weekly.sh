#!/usr/bin/env bash
# The weekly job of the Carta orchestrator (T046 placeholder, made real by T048).
# Task reports: Execution/P3/T046-cax11-orchestrator.md and
# Execution/P3/T048-pipeline-cron-migration.md.
#
# Run by carta-weekly.service, which carta-weekly.timer starts every Monday at
# 09:00 Europe/Brussels, the slot of the laptop's Windows Scheduled Task
# TravelAppFareRefresh. It does two things:
#
#   1. appends one "cron fired" line to /home/carta/logs/weekly.log, with a
#      count of the secrets that are set and never their values. verify.sh
#      (T046) counts these lines to prove the timer fires, so the line stays;
#   2. runs the pipeline through run_pipeline.sh, but only when the service
#      that started it sets CARTA_PIPELINE_ENABLED=1.
#
# Why the gate in 2. The units cloud-init installs at first boot are T046's:
# they fire this script ten minutes after every boot and do not set the
# variable. A box provisioned from a branch that contains this file would
# otherwise start a 30-hour fare harvest ten minutes after its first boot,
# before its secrets file is filled and before any task has been verified on
# arm64. The real units in infra/hetzner/cron/ (installed by
# infra/hetzner/cron/install.sh, the last owner step) set the variable, drop
# the boot-time firing and add the timeout. Until then this script behaves
# exactly like T046's placeholder.
#
# By hand: CARTA_PIPELINE_ENABLED=1 bash infra/hetzner/cax11/weekly.sh
# (arguments are passed on to run_pipeline.sh, e.g. --dry-run).
set -uo pipefail

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

if [ "${CARTA_PIPELINE_ENABLED:-0}" != "1" ]; then
  printf '%s cron fired on %s (pipeline not enabled: infra/hetzner/cron/install.sh not run yet; %d of %d env variables set)\n' \
    "$(date -Is)" "$(hostname)" "$set_count" "$total" >> "$LOG_DIR/weekly.log"
  exit 0
fi

printf '%s cron fired on %s (pipeline run starting; %d of %d env variables set)\n' \
  "$(date -Is)" "$(hostname)" "$set_count" "$total" >> "$LOG_DIR/weekly.log"

bash "$HERE/run_pipeline.sh" "$@"
rc=$?
printf '%s pipeline run finished on %s with exit %d (0 ok, 1 task failed, 2 refused, 3 archive step failed, 75 already running)\n' \
  "$(date -Is)" "$(hostname)" "$rc" >> "$LOG_DIR/weekly.log"

# T218-c: run_pipeline.py pings the heartbeat itself (success or /fail) before
# run_pipeline.sh's archive and publish steps run, so an exit 3 (pipeline ok,
# R2 step failed) or any other non-zero exit after that point would leave the
# monitor green. Ping /fail here on every non-zero exit. A ping failure is
# logged and never changes the exit code. No CARTA_HEARTBEAT_URL, no ping.
if [ "$rc" -ne 0 ] && [ -n "${CARTA_HEARTBEAT_URL:-}" ]; then
  if command -v curl >/dev/null 2>&1 \
     && curl -fsS -m 10 --retry 2 -o /dev/null "${CARTA_HEARTBEAT_URL%/}/fail" 2>/dev/null; then
    printf '%s heartbeat /fail sent (exit %d)\n' "$(date -Is)" "$rc" >> "$LOG_DIR/weekly.log"
  else
    printf '%s heartbeat /fail could not be sent (exit %d; curl missing or the ping failed)\n' "$(date -Is)" "$rc" >> "$LOG_DIR/weekly.log"
  fi
fi
exit $rc
