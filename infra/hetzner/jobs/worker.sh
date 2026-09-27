#!/usr/bin/env bash
# The worker side of an on-demand CAX41 run (T047). The worker's cloud-init
# (infra/hetzner/cax41/cloud-init.yaml) installs rclone, makes a sparse clone
# and then runs this script once. It never runs on the orchestrator.
# Task report: Execution/P3/T047-on-demand-cax41.md.
#
#   worker.sh <job> <run_id> [job args...]
#
# In order, each phase timed and each reported to R2 as it starts:
#   setup    the software the job's needs column asks for: docker.io, a Python
#            3.12 venv with requirements.txt + constraints.txt, the CPU torch
#            and OpenCLIP stack, libvips with the AV1 encoder and pyvips
#   inputs   rclone copy of the job's inputs prefix, filtered by its include
#            patterns, into /srv/carta/in (the local mirror the job reads)
#   job      infra/hetzner/jobs/<job>.sh under `timeout`, with every core
#   push     /srv/carta/out to archive/runs/<run_id>/out/ (a staging prefix;
#            the orchestrator promotes it to the job's outputs prefix, see
#            spawn.sh for why the worker never writes the live prefix)
# and finally writes status.json with state ok or failed, the exit code, the
# phase that failed and every duration. The status object is the whole
# interface between the two machines: spawn.sh polls it and nothing else.
#
# Environment (from /etc/carta/worker.conf, written by cloud-init):
#   RCLONE_CONFIG_R2_*   the R2 remote, as on the orchestrator
#   CARTA_R2_BUCKET      default carta
#   CARTA_JOB_DEADLINE   epoch seconds by which the job must have ended; the
#                        job gets whatever is left minus a push margin
#   CARTA_T0             epoch seconds when the box began booting
#   CARTA_DRY_RUN=1      print every command, run none (laptop checks)
#
# Exit code: the job's own, or 90 for a setup failure, 91 for an input pull
# failure, 92 for a push failure, 124 when `timeout` stopped the job.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/jobs_lib.sh"
CARTA_JOB_NAME=worker

JOB="${1:-}"; RUN_ID="${2:-}"
[ -n "$JOB" ] && [ -n "$RUN_ID" ] || { echo "usage: worker.sh <job> <run_id> [args...]" >&2; exit 2; }
shift 2
ARGS=("$@")
job_row "$JOB" || { echo "worker.sh: unknown job '$JOB' (not in $CARTA_JOBS_TSV)" >&2; exit 2; }

DRY="${CARTA_DRY_RUN:-0}"
BUCKET="${CARTA_R2_BUCKET:-carta}"
RUN_PREFIX="archive/runs/$RUN_ID"
ROOT="${CARTA_WORKER_ROOT:-/srv/carta}"
export CARTA_REPO="${CARTA_REPO:-$(cd "$HERE/../../.." && pwd)}"
export CARTA_IN="$ROOT/in" CARTA_OUT="$ROOT/out" CARTA_WORK="$ROOT/work"
export CARTA_THREADS="${CARTA_THREADS:-$(nproc 2>/dev/null || echo 1)}"
export CARTA_RUN_ID="$RUN_ID"
VENV="$ROOT/venv"
T0="${CARTA_T0:-$(date +%s)}"
NOW() { date +%s; }
DEADLINE="${CARTA_JOB_DEADLINE:-$(( T0 + $(hours_to_s "$JOB_CEILING_H") ))}"
# Time kept back from the job for the push and the final status. Generous,
# because a clip_sweep push is two tarballs of up to about 5 GB.
PUSH_MARGIN_S="${CARTA_PUSH_MARGIN_S:-1200}"

run() {
  printf '+'; printf ' %q' "$@"; printf '\n'
  if [ "$DRY" = "1" ]; then return 0; fi
  "$@"
}

PHASE=setup
declare -A DUR=()
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# One JSON object, written whole on every change. Values are numbers or plain
# words, so hand-built JSON is safe here; no field carries free text.
status() {  # state exit_code
  local state="$1" code="${2:-null}" durs="" k
  for k in boot clone setup inputs job push; do
    [ -n "${DUR[$k]:-}" ] && durs="$durs\"${k}_s\": ${DUR[$k]}, "
  done
  local body
  body="$(printf '{"run": "%s", "job": "%s", "state": "%s", "phase": "%s", "exit_code": %s, "started_at": "%s", "updated_at": "%s", "durations": {%s"total_s": %s}, "host": "%s", "commit": "%s", "threads": %s}' \
    "$RUN_ID" "$JOB" "$state" "$PHASE" "$code" "$STARTED_AT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$durs" "$(( $(NOW) - T0 ))" "$(hostname)" \
    "$(git -C "$CARTA_REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)" "$CARTA_THREADS")"
  echo "status: $body"
  if [ "$DRY" = "1" ]; then
    printf '+ rclone rcat r2:%s/%s/status.json  (the object above)\n' "$BUCKET" "$RUN_PREFIX"
    return 0
  fi
  printf '%s\n' "$body" | rclone rcat "r2:$BUCKET/$RUN_PREFIX/status.json" \
    || echo "worker.sh: could not write the status object (R2 unreachable?)" >&2
}

timed() {  # name cmd...
  local name="$1"; shift
  local t=$(NOW) rc
  "$@"; rc=$?
  DUR[$name]=$(( $(NOW) - t ))
  return $rc
}

finish() {  # exit_code
  local code="$1"
  if [ "$code" -eq 0 ]; then status ok 0; else status failed "$code"; fi
  exit "$code"
}

[ -n "${CARTA_BOOT_S:-}" ] && DUR[boot]="$CARTA_BOOT_S"
[ -n "${CARTA_CLONE_S:-}" ] && DUR[clone]="$CARTA_CLONE_S"
status started

# --- setup -------------------------------------------------------------------
setup() {
  run mkdir -p "$CARTA_IN" "$CARTA_OUT" "$CARTA_WORK" || return 1
  if job_needs docker; then
    if ! command -v docker >/dev/null || [ "$DRY" = "1" ]; then
      run env DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io || return 1
      run systemctl enable --now docker || return 1
    fi
  fi
  if job_needs python || job_needs photos; then
    run python3.12 -m venv "$VENV" || return 1
    run "$VENV/bin/python" -m pip install -q --upgrade pip || return 1
    # The orchestrator's pins (T048). Wheels only: every package has an
    # aarch64 cp312 wheel, so nothing compiles on a box billed by the hour.
    run "$VENV/bin/python" -m pip install -q --only-binary=:all: \
      -r "$CARTA_REPO/requirements.txt" -c "$CARTA_REPO/constraints.txt" || return 1
  fi
  if job_needs photos; then
    run "$VENV/bin/python" -m pip install -q --only-binary=:all: \
      -r "$HERE/requirements-torch-cpu.txt" || return 1
    run "$VENV/bin/python" -m pip install -q --only-binary=:all: \
      -r "$HERE/requirements-photos.txt" -c "$CARTA_REPO/constraints.txt" || return 1
  fi
  if job_needs vips; then
    # The image ladder (T049). pyvips ships only as an sdist that binds the
    # system libvips through cffi (T006), so libvips comes from apt first.
    # Ubuntu 24.04 packages libheif's AV1 encoder separately: without
    # libheif-plugin-aomenc, libvips 8.15 decodes AVIF but cannot write it.
    # derive.py selfcheck, the job's first step, proves both formats.
    run env DEBIAN_FRONTEND=noninteractive apt-get install -y -q \
      libvips-dev libheif-plugin-aomenc || return 1
    run "$VENV/bin/python" -m pip install -q "pyvips==3.2.0" || return 1
  fi
  return 0
}
PHASE=setup
timed setup setup || finish 90

# --- inputs ------------------------------------------------------------------
inputs() {
  [ -n "$JOB_INPUTS_PREFIX" ] || { echo "no inputs for $JOB"; return 0; }
  local inc=() p
  while IFS= read -r p; do [ -n "$p" ] && inc+=(--include "$p"); done < <(expand_includes ${ARGS[@]+"${ARGS[@]}"})
  run rclone copy "r2:$BUCKET/$JOB_INPUTS_PREFIX" "$CARTA_IN" ${inc[@]+"${inc[@]}"} \
    --transfers 16 --checkers 16 --fast-list --stats 60s --stats-one-line || return 1
  if [ "$DRY" != "1" ] && [ ${#inc[@]} -gt 0 ] && [ -z "$(find "$CARTA_IN" -type f -print -quit)" ]; then
    echo "worker.sh: the include patterns matched nothing under r2:$BUCKET/$JOB_INPUTS_PREFIX"
    return 1
  fi
  [ "$DRY" = "1" ] || du -sh "$CARTA_IN"
}
PHASE=inputs
status started
timed inputs inputs || finish 91

# --- job ---------------------------------------------------------------------
PHASE=job
status started
left=$(( DEADLINE - $(NOW) - PUSH_MARGIN_S ))
if [ "$left" -lt 60 ]; then
  echo "worker.sh: only ${left}s of the ceiling left for the job; not starting it"
  finish 124
fi
job_env=(CARTA_PY="$VENV/bin/python")
[ "$DRY" = "1" ] && job_env+=(CARTA_JOB_DRY_RUN=1)
t=$(NOW)
echo "+ timeout --signal=TERM --kill-after=300 ${left} env ${job_env[*]} bash $HERE/$JOB.sh ${ARGS[*]:-}"
timeout --signal=TERM --kill-after=300 "$left" env "${job_env[@]}" bash "$HERE/$JOB.sh" ${ARGS[@]+"${ARGS[@]}"}
JOB_RC=$?
DUR[job]=$(( $(NOW) - t ))
echo "worker.sh: $JOB exited $JOB_RC after ${DUR[job]}s"

# --- push --------------------------------------------------------------------
# Whatever the job left in out/ is pushed even when it failed: a partial
# output is evidence for the debugging, and it lands in the run's own staging
# prefix, which spawn.sh promotes only after an ok status.
push() {
  if [ "$DRY" = "1" ] || [ -n "$(find "$CARTA_OUT" -type f -print -quit 2>/dev/null)" ]; then
    run rclone copy "$CARTA_OUT" "r2:$BUCKET/$RUN_PREFIX/out" \
      --transfers 16 --checkers 16 --stats 60s --stats-one-line || return 1
  else
    echo "worker.sh: out/ is empty, nothing to push"
  fi
}
PHASE=push
status started
PUSH_OK=1
timed push push || PUSH_OK=0
# The phase in the final status names what failed: the job before the push.
if [ "$JOB_RC" -ne 0 ]; then
  PHASE=job
elif [ "$PUSH_OK" -eq 0 ]; then
  JOB_RC=92
else
  PHASE=done
fi
finish "$JOB_RC"
