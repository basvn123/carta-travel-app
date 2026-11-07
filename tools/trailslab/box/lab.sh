#!/usr/bin/env bash
# The trails lab on the build box (T1182, ROADMAP D24, register row T784-a).
#
# Runs the PostGIS lab (tools/trailslab/docker-compose.yml plus
# box/docker-compose.box.yml) and its curator review app on the box, filled
# from the R2 dump that infra/hetzner/cax41/trailslab_dump.sh writes (T1161).
# From the repo root, as the carta user:
#
#   lab.sh check                 prerequisites, each with its fix; exit 3 if one is missing
#   lab.sh config                docker compose config (validates both files, no daemon needed)
#   lab.sh env                   the lines for ~/.config/carta/env, with a fresh password
#   lab.sh up | down | status    start (and wait), stop (never removes data), report
#   lab.sh restore [--force]     newest dump in R2 into this lab (trailslab_dump.sh restore);
#                                refuses when the lab has reviews newer than its last sync
#   lab.sh push                  dump this lab to R2 (trailslab_dump.sh push) and stamp the sync
#   lab.sh init-schema           tools/trailslab/initdb/*.sql into an empty lab (no dump at all)
#   lab.sh review-build          npm ci and vite build of tools/trailslab/review
#   lab.sh install               the two review units into /etc/systemd/system (sudo)
#   lab.sh review on|off         start or stop the review API and UI (127.0.0.1 only)
#   lab.sh tunnel                the ssh -L command to run on the owner's machine
#
# push and restore pass --crypt worker-key|plain to trailslab_dump.sh
# (worker-key, the default, is what the worker and the box share).
# Every command takes --dry-run (print, change nothing). Settings come from
# the box secrets file through infra/hetzner/cax11/load-env.sh; the names are
# in box/lab.env.example. Exit codes: 0 done, 1 a step failed, 2 bad
# arguments, 3 refused (a prerequisite missing, unsynced reviews).
# ASCII clean, no em dashes, per project convention.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
LOADENV="$REPO/infra/hetzner/cax11/load-env.sh"
# shellcheck source=/dev/null
[ -r "$LOADENV" ] && [ "${CARTA_LAB_NO_ENV:-0}" != "1" ] && . "$LOADENV"

MODE="${1:-}"; [ $# -gt 0 ] && shift
DRY=0; FORCE=0; ARG=""; CRYPT=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --crypt) CRYPT=(--crypt "${2:-}"); shift ;;
    --force) FORCE=1 ;;
    on|off) ARG="$1" ;;
    *) echo "lab.sh: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done

export TRAILSLAB_HOST="${TRAILSLAB_HOST:-127.0.0.1}" TRAILSLAB_PORT="${TRAILSLAB_PORT:-5433}"
export TRAILSLAB_DB="${TRAILSLAB_DB:-trailslab}" TRAILSLAB_USER="${TRAILSLAB_USER:-trailslab}"
export PGHOST="$TRAILSLAB_HOST" PGPORT="$TRAILSLAB_PORT" PGDATABASE="$TRAILSLAB_DB" PGUSER="$TRAILSLAB_USER"
[ -n "${TRAILSLAB_PASSWORD:-}" ] && export PGPASSWORD="$TRAILSLAB_PASSWORD"
DOCKER="${CARTA_DOCKER:-docker}"
SYSTEMCTL="${CARTA_SYSTEMCTL:-systemctl}"
DUMP_SH="$REPO/infra/hetzner/cax41/trailslab_dump.sh"
COMPOSE=("$DOCKER" compose -f "$REPO/tools/trailslab/docker-compose.yml" -f "$HERE/docker-compose.box.yml")
UNITS=(carta-trailslab-review-api.service carta-trailslab-review-ui.service)
MIN_FREE_GB="${CARTA_TRAILSLAB_MIN_FREE_GB:-40}"
# The sync stamp: the newest trip_reviews id this lab had when it last went to
# or came from R2. Kept beside the data directory, on the volume.
STAMP="${CARTA_TRAILSLAB_STAMP:-${TRAILSLAB_DATA_DIR:-$HOME/trailslab}/../trailslab-sync.txt}"

say() { printf '%s lab: %s\n' "$(date -u +%H:%M:%S)" "$*"; }
x() { echo "+ $*"; [ $DRY -eq 1 ] && return 0; "$@"; }
q() { psql -X -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }
review_max() { q "select coalesce(max(id),0) from trip_reviews"; }

check() {
  local bad=0
  miss() { echo "MISSING $1: $2"; bad=1; }
  ok() { echo "ok      $1"; }
  if [ "${CARTA_TRAILSLAB_HOME:-}" = "box" ]; then ok "CARTA_TRAILSLAB_HOME=box"
  else miss "CARTA_TRAILSLAB_HOME" "set CARTA_TRAILSLAB_HOME=box in ~/.config/carta/env (lab.sh env)"; fi
  command -v "$DOCKER" >/dev/null && ok "docker" || miss "docker" "sudo apt-get install -y docker.io docker-compose-v2; sudo usermod -aG docker carta"
  "$DOCKER" compose version >/dev/null 2>&1 && ok "docker compose" || miss "docker compose" "sudo apt-get install -y docker-compose-v2"
  if [ -z "${TRAILSLAB_PASSWORD:-}" ]; then miss "TRAILSLAB_PASSWORD" "lab.sh env prints a random one"
  elif [ "$TRAILSLAB_PASSWORD" = "trailslab" ]; then miss "TRAILSLAB_PASSWORD" "the laptop default is refused on the box"
  else ok "TRAILSLAB_PASSWORD"; fi
  case "$TRAILSLAB_HOST" in 127.0.0.1|localhost|::1) ok "TRAILSLAB_HOST $TRAILSLAB_HOST" ;;
    *) miss "TRAILSLAB_HOST" "the box lab is loopback only: 127.0.0.1" ;; esac
  if [ -z "${TRAILSLAB_DATA_DIR:-}" ]; then miss "TRAILSLAB_DATA_DIR" "a directory on the lab volume, e.g. /mnt/trailslab/pgdata"
  else
    local parent; parent="$(dirname "$TRAILSLAB_DATA_DIR")"
    if [ ! -d "$parent" ]; then miss "TRAILSLAB_DATA_DIR" "$parent does not exist: attach and mount the volume first"
    else
      local mp; mp="$(df -P "$parent" | awk 'NR==2{print $6}')"
      if [ "$mp" = "/" ] && [ "${CARTA_TRAILSLAB_ALLOW_ROOT_DISK:-0}" != "1" ]; then
        miss "TRAILSLAB_DATA_DIR" "$parent is on the root disk; the lab needs the volume (CARTA_TRAILSLAB_ALLOW_ROOT_DISK=1 to override)"
      else
        local free; free="$(df -P -BG "$parent" | awk 'NR==2{gsub("G","",$4); print $4}')"
        if [ -d "$TRAILSLAB_DATA_DIR/base" ]; then ok "TRAILSLAB_DATA_DIR $TRAILSLAB_DATA_DIR (a lab is there; ${free} GB free on $mp)"
        elif [ "${free:-0}" -ge "$MIN_FREE_GB" ]; then ok "TRAILSLAB_DATA_DIR $TRAILSLAB_DATA_DIR (${free} GB free on $mp)"
        else miss "TRAILSLAB_DATA_DIR" "${free} GB free on $mp, $MIN_FREE_GB needed for a restore"; fi
      fi
    fi
  fi
  local mem; mem="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null)"
  local swap; swap="$(awk '/SwapTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null)"
  if [ "${mem:-0}" -lt 6000 ] && [ "${swap:-0}" -lt 1024 ]; then
    miss "swap" "${mem} MB RAM and no swap: add a 2 GB swapfile before the lab shares the box with the pipeline"
  else ok "memory ${mem} MB, swap ${swap} MB"; fi
  for t in psql pg_isready pg_restore pg_dump gpg rclone; do
    command -v "$t" >/dev/null && ok "$t" || miss "$t" "PGDG postgresql-client-18, gpg, rclone (the box has gpg and rclone already)"
  done
  if command -v pg_restore >/dev/null; then
    local v; v="$(pg_restore --version | awk '{print int($3)}')"
    [ "${v:-0}" -ge 18 ] && ok "pg_restore $v" || miss "pg_restore $v" "the dumps come from pg_dump 18: install postgresql-client-18 from PGDG"
  fi
  if [ "${CARTA_TRAILSLAB_WORKER:-0}" = "1" ] && [ "${CARTA_TRAILSLAB_HOME:-}" = "box" ]; then
    echo "note    CARTA_TRAILSLAB_WORKER=1 is ignored while CARTA_TRAILSLAB_HOME=box (run_pipeline.py stands the worker down)"
  fi
  return $bad
}

case "$MODE" in
  check)
    check; rc=$?; [ $rc -eq 0 ] && say "all prerequisites in place" || say "missing prerequisites above"
    [ $rc -eq 0 ] || exit 3 ;;
  config)
    # Placeholders only when unset, so the files validate on a laptop or in CI.
    TRAILSLAB_PASSWORD="${TRAILSLAB_PASSWORD:-check-only}" TRAILSLAB_DATA_DIR="${TRAILSLAB_DATA_DIR:-/mnt/trailslab/pgdata}" \
      "${COMPOSE[@]}" config || exit 1 ;;
  env)
    pw="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 28)"
    grep -E '^[A-Z_]+=' "$HERE/lab.env.example" \
      | sed -e "s/^CARTA_TRAILSLAB_HOME=$/CARTA_TRAILSLAB_HOME=box/" -e "s/^TRAILSLAB_PASSWORD=$/TRAILSLAB_PASSWORD=$pw/" ;;
  up)
    check >/dev/null || { check; say "fix the prerequisites first"; [ $DRY -eq 1 ] || exit 3; }
    x mkdir -p "${TRAILSLAB_DATA_DIR:-/mnt/trailslab/pgdata}" || exit 1
    x "${COMPOSE[@]}" up -d trailslab-db || { say "compose up failed"; exit 1; }
    if [ $DRY -eq 0 ]; then
      for _ in $(seq 1 90); do pg_isready -q && break; sleep 2; done
      pg_isready || { "${COMPOSE[@]}" logs --tail 30 trailslab-db; exit 1; }
      say "lab up on $PGHOST:$PGPORT ($(q "select count(*) from pg_tables where tablename='trips'") trips table, $(q "select count(*) from trips" || echo 0) trips)"
    fi ;;
  down)
    # stop, not down -v: the data directory is the lab.
    x "${COMPOSE[@]}" stop trailslab-db ;;
  status)
    x "${COMPOSE[@]}" ps
    if [ $DRY -eq 0 ]; then
      if pg_isready -q; then
        say "answers on $PGHOST:$PGPORT: $(q "select count(*) from trips") trips, $(q "select count(*) from trips where status='approved'") approved, reviews up to id $(review_max)"
        say "size $(psql -X -tAc "select pg_size_pretty(pg_database_size(current_database()))" | xargs)"
      else say "no lab answers on $PGHOST:$PGPORT"; fi
      [ -n "${TRAILSLAB_DATA_DIR:-}" ] && df -h "$(dirname "$TRAILSLAB_DATA_DIR")" | tail -n 1
      [ -r "$STAMP" ] && say "last sync: $(cat "$STAMP")"
    fi ;;
  restore)
    if [ $DRY -eq 0 ] && pg_isready -q; then
      now="$(review_max)"; last="$(awk '{print $2}' "$STAMP" 2>/dev/null)"
      if [ -n "$now" ] && [ "${now:-0}" -gt "${last:-0}" ] && [ $FORCE -eq 0 ]; then
        say "this lab has reviews up to id $now, newer than its last sync (${last:-none}): push them first (lab.sh push), or --force to drop them"; exit 3
      fi
    fi
    FARGS=("${CRYPT[@]}"); [ $FORCE -eq 1 ] && FARGS+=(--force); [ $DRY -eq 1 ] && FARGS+=(--dry-run)
    x bash "$DUMP_SH" restore "${FARGS[@]}" || exit $?
    [ $DRY -eq 1 ] || { echo "restore $(review_max) $(date -u +%FT%TZ)" > "$STAMP"; say "sync stamp: reviews up to id $(review_max)"; } ;;
  push)
    FARGS=("${CRYPT[@]}"); [ $DRY -eq 1 ] && FARGS+=(--dry-run)
    x bash "$DUMP_SH" push "${FARGS[@]}" || exit $?
    [ $DRY -eq 1 ] || { echo "push $(review_max) $(date -u +%FT%TZ)" > "$STAMP"; say "sync stamp: reviews up to id $(review_max)"; } ;;
  init-schema)
    if [ $DRY -eq 0 ]; then
      pg_isready -q || { say "no lab answers (lab.sh up)"; exit 3; }
      [ "$(q "select count(*) from pg_tables where tablename='trips'")" = "0" ] || { say "the lab has a schema already; init-schema is for an empty lab"; exit 3; }
    fi
    for f in "$REPO"/tools/trailslab/initdb/*.sql; do
      x psql -X -q -v ON_ERROR_STOP=1 -f "$f" || { say "failed in $(basename "$f")"; exit 1; }
    done ;;
  review-build)
    cd "$REPO/tools/trailslab/review" || exit 1
    x npm ci --no-audit --no-fund || exit 1
    x node node_modules/vite/bin/vite.js build || exit 1 ;;
  install)
    for u in "${UNITS[@]}"; do x sudo install -m 644 "$HERE/$u" "/etc/systemd/system/$u" || exit 1; done
    x sudo "$SYSTEMCTL" daemon-reload ;;
  review)
    case "$ARG" in
      on) [ $DRY -eq 1 ] || [ -f "$REPO/tools/trailslab/review/dist/index.html" ] || { say "build the UI first (lab.sh review-build)"; exit 3; }
          x sudo "$SYSTEMCTL" start "${UNITS[@]}" || exit 1
          say "review on: run lab.sh tunnel on your machine, then open http://127.0.0.1:4174/" ;;
      off) x sudo "$SYSTEMCTL" stop "${UNITS[@]}" ;;
      *) echo "usage: lab.sh review on|off" >&2; exit 2 ;;
    esac ;;
  tunnel)
    echo "ssh -N -L 4174:127.0.0.1:4174 -L 8011:127.0.0.1:8011 carta@<box address>"
    echo "then open http://127.0.0.1:4174/ (the UI proxies /api to 8011 on the box)" ;;
  *)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
exit 0
