#!/usr/bin/env bash
# The Linux successor of run_pipeline.bat (T048). One scheduled pipeline run on
# the Carta orchestrator, the Hetzner CAX11 of infra/hetzner/cax11.
# Task report: Execution/P3/T048-pipeline-cron-migration.md.
#
# weekly.sh calls this from the systemd timer; the owner can run it by hand.
# What it does, in order, and why each step sits here rather than in
# run_pipeline.py:
#
#   1. takes logs/carta-run.lock with flock, so a timer run, a hand run and a
#      verify_tasks.sh run never overlap (run_pipeline.py's own lock only
#      covers master writers, and nothing covers the archive steps);
#   2. loads the secrets file through load-env.sh and activates the venv;
#   3. re-syncs the venv when requirements.txt or constraints.txt changed, so
#      the box keeps resolving the laptop's pinned versions (T046-h);
#   4. installs continent-app's node_modules if they are missing, because the
#      ship step runs `npm run build` and cloud-init never ran `npm ci`;
#   5. pulls from R2 whatever the weekly cadence needs and the box does not
#      have yet: the master (app_data/app_data.json, gitignored), the fare
#      history and model (data/history, data/models) and the orchestrator's
#      state (logs/pipeline_state.json, T048-k: without it a rebuilt box runs
#      every task as if it had never run). Only when missing: once the box is
#      running, its copy is the newest one, and a pull would overwrite it with
#      last week's if a push had failed;
#   6. runs run_pipeline.py with the cadence ceiling in CARTA_MAX_CADENCE;
#   7. makes the weekly database dumps (Supabase; trailslab only when the lab
#      is reachable, which on this box it is not);
#   8. packs and pushes what the run changed: the fare history layer, the
#      master and the state file (together, and only after a good run), the
#      master's pre-write snapshots and the new raw ingestion files;
#   9. publishes the app data (T054-e): after a good run whose build was split
#      for the data host (VITE_DATA_BASE set), uploads the staged tree with
#      `push-data.mjs --live`, phase 1, which adds and replaces and deletes
#      nothing. That is how the box's output reaches production without a
#      deploy key (T048-j). The boot index and the app shell stay as the last
#      app deploy left them, and phase 2 (--prune) waits for that deploy, so
#      neither runs here.
#
# Steps 5, 7 and 8 are the archive wiring of register row T045-g. They live
# here and not as run_pipeline.py tasks because they are not data tasks: they
# must run on every scheduled run whatever is due, the pull must happen before
# run_pipeline.py reads the master, the push must happen after the ship and
# after run_pipeline.py has released its lock, a snapshot push must still
# happen when the pipeline failed, and none of it should appear in `--list` or
# the state file. The pull and push are skipped with a message when the R2
# credentials are absent, the same way `--if-configured` works for web_sweep.
#
# Usage:
#   bash infra/hetzner/cax11/run_pipeline.sh                 the scheduled run
#   bash infra/hetzner/cax11/run_pipeline.sh --dry-run       plan only; archive commands printed
#   bash infra/hetzner/cax11/run_pipeline.sh --pull-only     steps 1 to 5, then stop
#   bash infra/hetzner/cax11/run_pipeline.sh --no-archive    skip steps 5, 7, 8 and 9
#   bash infra/hetzner/cax11/run_pipeline.sh -- --only fares --max-origins 5
#                                                            anything after -- goes to run_pipeline.py
#
# Environment (all optional; the secrets file may set them):
#   CARTA_MAX_CADENCE  weekly (default), monthly, quarterly, or all. The box runs
#                      the weekly tier only until the monthly and quarterly
#                      tasks are verified on arm64 (register row T048-h).
#   CARTA_VENV         default /home/carta/venv ($HOME/venv)
#   CARTA_ARCHIVE_OUT  pack.py's tarball and dump directory, default $HOME/archive-out
#   CARTA_SHIP         build (default), data or none; passed as --ship
#   VITE_DATA_BASE     the data host, https://data.carta-europetravel.com/data.
#                      Unset (the default), the build is same-origin and stays
#                      on the box. Set it only after the production cutover
#                      (T054-c): the split build refuses to run until the data
#                      host is in the CSP (T053-b), which fails the ship.
#
# Exit codes: the pipeline's own (0 ok, 1 a task failed, 2 refused to start),
# 3 the pipeline succeeded but an archive or publish step failed, 4 the venv could not be
# synced, 5 the environment is broken (no venv, no repo), 75 another run holds
# the lock.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${CARTA_REPO:-$(cd "$HERE/../../.." && pwd)}"
VENV="${CARTA_VENV:-$HOME/venv}"
LOG_DIR="$REPO/logs"
RUN_LOG="$LOG_DIR/pipeline_run.log"

# Classes of pipeline/archive/manifest.yml the weekly cadence reads (pulled
# when missing) and writes (pushed after the run). Deliberately a short list:
# pack.py would otherwise tar whatever part of another layer happens to exist
# on this box, and push.py would overwrite the laptop's full tarball with it.
PULL_CLASSES=(master-current pipeline-state fare-estimation-history)
PACK_CLASSES=(fare-estimation-history)
PUSH_CLASSES=(master-snapshots master-current pipeline-state fare-estimation-history raw-mirrors)

DRY_RUN=0
PULL_ONLY=0
ARCHIVE=1
PASS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --pull-only) PULL_ONLY=1 ;;
    --no-archive) ARCHIVE=0 ;;
    --) shift; PASS=("$@"); break ;;
    -h|--help) sed -n '2,60p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "run_pipeline.sh: unknown argument $1 (arguments for run_pipeline.py go after --)" >&2; exit 2 ;;
  esac
  shift
done

[ -f "$REPO/run_pipeline.py" ] || { echo "run_pipeline.sh: no run_pipeline.py under $REPO" >&2; exit 5; }
cd "$REPO" || exit 5
mkdir -p "$LOG_DIR"

exec 9>"$LOG_DIR/carta-run.lock"
if ! flock -n 9; then
  echo "run_pipeline.sh: another run holds $LOG_DIR/carta-run.lock (timer, hand run or verify_tasks.sh); not starting" >&2
  exit 75
fi

# Everything below goes to the journal (stdout) and to logs/pipeline_run.log,
# the file run_pipeline.bat appends to on the laptop.
exec > >(tee -a "$RUN_LOG") 2>&1

say() { printf '%s run_pipeline.sh: %s\n' "$(date -Is)" "$*"; }
ARCHIVE_FAILED=0
archive_fail() { say "ARCHIVE STEP FAILED: $*"; ARCHIVE_FAILED=1; }

echo
echo "============================================================"
say "started on $(hostname) ($(uname -m)), repo $REPO at $(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo '?')"
echo "============================================================"

# shellcheck source=load-env.sh
. "$HERE/load-env.sh"
# Defaults after load-env.sh, never before: env.example ships these names blank,
# and load-env.sh unsets every blank, which would erase a default set earlier.
export CARTA_ARCHIVE_OUT="${CARTA_ARCHIVE_OUT:-$HOME/archive-out}"
DUMP_DIR="$CARTA_ARCHIVE_OUT/dumps"

# Python children print place names; the systemd environment has no locale.
export LANG="${LANG:-C.UTF-8}" PYTHONUTF8=1 PYTHONIOENCODING=utf-8

# --- housekeeping: dated logs ------------------------------------------------
# run_pipeline.py writes logs/pipeline_<date>.log per day; logrotate handles
# the two fixed-name logs (infra/hetzner/cron/carta-logrotate), these are dated
# so a find is simpler than a rotation rule.
if [ $DRY_RUN -eq 0 ]; then
  find "$LOG_DIR" -maxdepth 1 -name 'pipeline_20*.log' -mtime +7 -exec gzip -q {} \; 2>/dev/null
  find "$LOG_DIR" -maxdepth 1 -name 'pipeline_20*.log.gz' -mtime +90 -delete 2>/dev/null
fi

# --- venv ---------------------------------------------------------------------
if [ ! -x "$VENV/bin/python" ]; then
  say "no venv at $VENV (run: sudo carta-bootstrap)"; exit 5
fi
# shellcheck disable=SC1091
. "$VENV/bin/activate"
PY="$VENV/bin/python"

want="$(cat requirements.txt constraints.txt 2>/dev/null | sha256sum | cut -c1-16)"
have="$(cat "$VENV/.carta-requirements" 2>/dev/null || true)"
if [ "$want" != "$have" ]; then
  if [ $DRY_RUN -eq 1 ]; then
    say "venv would be re-synced to requirements.txt + constraints.txt (stamp ${have:-none} -> $want)"
  else
    say "re-syncing the venv to requirements.txt + constraints.txt (stamp ${have:-none} -> $want)"
    if "$PY" -m pip install --quiet --only-binary=:all: -r requirements.txt -c constraints.txt; then
      echo "$want" > "$VENV/.carta-requirements"
    else
      say "pip could not sync the venv; not running the pipeline on unpinned versions"; exit 4
    fi
  fi
fi
if "$PY" -c "import anthropic" 2>/dev/null; then
  say "WARNING: the anthropic SDK is in the venv; CLAUDE.md forbids it (pip uninstall anthropic)"
fi

# --- node_modules for the ship step --------------------------------------------
SHIP="${CARTA_SHIP:-build}"
if [ "$SHIP" != "none" ] && [ ! -d continent-app/node_modules ]; then
  if [ $DRY_RUN -eq 1 ]; then
    say "continent-app/node_modules missing; a real run would run npm ci first"
  else
    say "continent-app/node_modules missing; running npm ci"
    (cd continent-app && npm ci --no-audit --no-fund) || { say "npm ci failed; the ship step would fail too"; exit 5; }
  fi
fi

# --- R2 ------------------------------------------------------------------------
r2_configured() {
  command -v rclone >/dev/null 2>&1 \
    && [ -n "${RCLONE_CONFIG_R2_ENDPOINT:-}" ] \
    && [ -n "${RCLONE_CONFIG_R2_ACCESS_KEY_ID:-}" ] \
    && [ -n "${RCLONE_CONFIG_R2_SECRET_ACCESS_KEY:-}" ]
}
ARCHIVE_DRY=()
[ $DRY_RUN -eq 1 ] && ARCHIVE_DRY=(--dry-run)

local_present() {  # class -> 0 when the box already holds it
  case "$1" in
    master-current) [ -f app_data/app_data.json ] ;;
    pipeline-state) [ -f logs/pipeline_state.json ] ;;
    fare-estimation-history) [ -d data/history ] || [ -d data/models ] ;;
    *) return 1 ;;
  esac
}

if [ $ARCHIVE -eq 1 ]; then
  if r2_configured || [ $DRY_RUN -eq 1 ]; then
    r2_configured || say "R2 not configured; printing the pull commands anyway (dry run)"
    for c in "${PULL_CLASSES[@]}"; do
      if local_present "$c"; then
        say "pull $c: present on this box, not pulled (the box's copy is the newest)"
      else
        say "pull $c: missing locally, pulling from R2"
        "$PY" pipeline/archive/push.py --pull --only "$c" "${ARCHIVE_DRY[@]}" || archive_fail "pull $c"
      fi
    done
  else
    say "R2 not configured (rclone or RCLONE_CONFIG_R2_* missing): pull skipped"
  fi
fi
[ -f app_data/app_data.json ] || say "WARNING: no app_data/app_data.json. It is gitignored, so a fresh box has none until the R2 pull (or an scp from the laptop) provides it; every fare task will fail without it"

if [ $PULL_ONLY -eq 1 ]; then
  say "--pull-only: stopping before the pipeline"
  [ $ARCHIVE_FAILED -eq 0 ] && exit 0 || exit 3
fi

# --- the pipeline ----------------------------------------------------------------
CADENCE="${CARTA_MAX_CADENCE:-weekly}"
ARGS=(--ship "$SHIP")
case "$CADENCE" in
  weekly|monthly|quarterly) ARGS+=(--max-cadence "$CADENCE") ;;
  all) ;;
  *) say "CARTA_MAX_CADENCE=$CADENCE is not weekly, monthly, quarterly or all"; exit 2 ;;
esac
[ $DRY_RUN -eq 1 ] && ARGS+=(--dry-run)
ARGS+=("${PASS[@]}")

say "python run_pipeline.py ${ARGS[*]}"
RUN_MARK="$LOG_DIR/.carta-run-start"
touch "$RUN_MARK"
t0=$(date +%s)
"$PY" run_pipeline.py "${ARGS[@]}"
rc=$?
say "run_pipeline.py exited $rc after $(( $(date +%s) - t0 )) s"

if [ $ARCHIVE -eq 0 ]; then
  say "--no-archive: dumps, pack, push and publish skipped"
  exit $rc
fi

# --- weekly database dumps (T045, section "Database dump commands") --------------
# Both dumps are encrypted to a public key; the box never holds the secret
# half. pg_dump must be 17 or newer for Supabase's Postgres 17, and Ubuntu
# 24.04's own client is 16, which refuses a newer server, so the PGDG client
# has to be installed (register row T048-g).
DUMPS_MADE=()
pg_dump_ok() {
  command -v pg_dump >/dev/null 2>&1 || { say "dump $1 skipped: no pg_dump on PATH"; return 1; }
  local major
  major="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
  [ "${major:-0}" -ge 17 ] || { say "dump $1 skipped: pg_dump $major is older than the server (needs 17 or newer)"; return 1; }
  command -v gpg >/dev/null 2>&1 || { say "dump $1 skipped: no gpg"; return 1; }
  [ -n "${CARTA_BACKUP_KEY:-}" ] || { say "dump $1 skipped: CARTA_BACKUP_KEY not set"; return 1; }
  gpg --batch --list-keys "$CARTA_BACKUP_KEY" >/dev/null 2>&1 || { say "dump $1 skipped: public key '$CARTA_BACKUP_KEY' not in this keyring (gpg --import carta-backups.pub.asc)"; return 1; }
}
dump_to() {  # name, then the pg_dump arguments
  local name="$1"; shift
  local out
  out="$DUMP_DIR/$name-$(date +%F).dump.gpg"
  if [ $DRY_RUN -eq 1 ]; then
    say "dump $name: would run pg_dump ... | gpg --encrypt -> $out"; return 0
  fi
  mkdir -p "$DUMP_DIR"
  if pg_dump "$@" -Fc -Z 6 \
      | gpg --batch --yes --trust-model always --encrypt --recipient "$CARTA_BACKUP_KEY" -o "$out.partial" \
      && mv "$out.partial" "$out"; then
    say "dump $name -> $out ($(du -h "$out" | cut -f1))"
    DUMPS_MADE+=("$name")
  else
    rm -f "$out.partial"; archive_fail "dump $name"
  fi
}

if [ -n "${SUPABASE_DB_URL:-}" ]; then
  if pg_dump_ok supabase; then
    dump_to supabase "$SUPABASE_DB_URL" --no-owner --no-privileges
  fi
else
  say "dump supabase skipped: SUPABASE_DB_URL not set"
fi

# The trailslab lab lives on the laptop, not on this box. Its dump runs here
# only when TRAILSLAB_HOST is set, resolves, and answers on the port.
if [ -n "${TRAILSLAB_HOST:-}" ] && getent hosts "$TRAILSLAB_HOST" >/dev/null 2>&1 \
   && timeout 4 bash -c "exec 3<>/dev/tcp/$TRAILSLAB_HOST/${TRAILSLAB_PORT:-5433}" 2>/dev/null; then
  if pg_dump_ok trailslab; then
    PGPASSWORD="${TRAILSLAB_PASSWORD:-trailslab}" dump_to trailslab \
      -h "$TRAILSLAB_HOST" -p "${TRAILSLAB_PORT:-5433}" -U "${TRAILSLAB_USER:-trailslab}" -d "${TRAILSLAB_DB:-trailslab}"
  fi
else
  say "dump trailslab skipped: the lab is not reachable from this box (TRAILSLAB_HOST ${TRAILSLAB_HOST:-unset})"
fi

# --- pack and push ------------------------------------------------------------------
if r2_configured || [ $DRY_RUN -eq 1 ]; then
  r2_configured || say "R2 not configured; printing the pack and push commands anyway (dry run)"
  if [ $rc -eq 0 ]; then
    for c in "${PACK_CLASSES[@]}"; do
      "$PY" pipeline/archive/pack.py --only "$c" "${ARCHIVE_DRY[@]}" || archive_fail "pack $c"
    done
    classes=("${PUSH_CLASSES[@]}")
  else
    # A failed run may have left the master half-refreshed. Push only the
    # snapshots (the pre-write backups run_pipeline.py took) so the last good
    # state is off the box, and keep R2's master at the last good run. The
    # state file stays with it: pushing it alone would tell a rebuilt box that
    # tasks ran whose output the R2 master does not hold.
    say "pipeline failed (exit $rc): pushing master-snapshots only, not the master, the state file or the fare history"
    classes=(master-snapshots)
  fi
  for c in "${classes[@]}"; do
    "$PY" pipeline/archive/push.py --only "$c" "${ARCHIVE_DRY[@]}" || archive_fail "push $c"
  done
  for d in "${DUMPS_MADE[@]}"; do
    if "$PY" pipeline/archive/push.py --only "$d-dump" --dump-dir "$DUMP_DIR" "${ARCHIVE_DRY[@]}"; then
      find "$DUMP_DIR" -name "$d-*.dump.gpg" -mtime +8 -delete 2>/dev/null
    else
      archive_fail "push $d-dump"
    fi
  done
else
  say "R2 not configured: pack and push skipped; nothing this run produced has left the box"
  [ ${#DUMPS_MADE[@]} -gt 0 ] && say "the dumps stay in $DUMP_DIR until R2 is configured"
fi

# --- publish the app data (T054-e) ----------------------------------------------------
# After the archive, so the master is safe in R2 before anything goes live.
# Only a split build made by THIS run is uploaded: dist-data/ survives between
# runs, and a week in which nothing was due ships nothing, so an older staged
# tree must never be sent again as if it were new.
STAGE="continent-app/dist-data/_stage.json"
PUBLISH_FAILED=0
if [ -z "${VITE_DATA_BASE:-}" ]; then
  say "publish skipped: VITE_DATA_BASE not set, so the build is same-origin and reaches production only through an app deploy"
elif [ "$SHIP" != "build" ]; then
  say "publish skipped: CARTA_SHIP=$SHIP makes no split build"
elif [ $rc -ne 0 ]; then
  say "publish skipped: the pipeline failed, production keeps last week's data"
elif [ $DRY_RUN -eq 1 ]; then
  say "publish: a real run would upload a new $STAGE tree with: (cd continent-app && node scripts/r2/push-data.mjs --live)"
elif [ ! -f "$STAGE" ] || [ ! "$STAGE" -nt "$RUN_MARK" ]; then
  say "publish skipped: this run made no new split build (nothing shipped, or the build was not split)"
elif ! r2_configured; then
  say "publish skipped: R2 not configured; the staged tree stays in continent-app/dist-data"
else
  staged_base="$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1]))["data_base"])' "$STAGE" 2>/dev/null || true)"
  if [ "$staged_base" != "$VITE_DATA_BASE" ]; then
    say "PUBLISH FAILED: $STAGE was staged for '${staged_base:-?}', not VITE_DATA_BASE '$VITE_DATA_BASE'; not uploading"
    PUBLISH_FAILED=1
  else
    say "publish: phase 1 upload of the staged data to R2 (adds and replaces, deletes nothing)"
    if (cd continent-app && node scripts/r2/push-data.mjs --live); then
      say "publish: done. The boot index and app shell change with the next app deploy; run push-data.mjs --live --prune after it"
    else
      say "PUBLISH FAILED: push-data.mjs exited non-zero; production may hold part of this week's data"
      PUBLISH_FAILED=1
    fi
  fi
fi

if [ $rc -ne 0 ]; then
  say "pipeline FAILED (exit $rc); see the log above"
  exit $rc
fi
if [ $ARCHIVE_FAILED -ne 0 ] || [ $PUBLISH_FAILED -ne 0 ]; then
  say "pipeline ok, but an archive or publish step failed (exit 3)"
  exit 3
fi
say "done"
exit 0
