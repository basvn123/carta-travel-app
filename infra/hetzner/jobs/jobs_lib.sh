#!/usr/bin/env bash
# Shared helpers for the on-demand CAX41 jobs (T047). Source this, do not run
# it. Used by infra/hetzner/cax41/spawn.sh on the orchestrator, by worker.sh on
# the worker and by every job script, so the jobs table is parsed in one place.
# Task report: Execution/P3/T047-on-demand-cax41.md.

CARTA_JOBS_DIR="${CARTA_JOBS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
CARTA_JOBS_TSV="${CARTA_JOBS_TSV:-$CARTA_JOBS_DIR/jobs.tsv}"

# Print the job names, one per line.
job_names() {
  tr -d '\r' < "$CARTA_JOBS_TSV" | awk -F'\t' '!/^#/ && NF >= 8 && $1 != "job" {print $1}'
}

# job_row <job>: set JOB_INPUTS_PREFIX, JOB_INPUTS_INCLUDE, JOB_OUTPUTS_PREFIX,
# JOB_CEILING_H, JOB_EXPECTED_H, JOB_NEEDS, JOB_SERVER_TYPE and JOB_WRAPS from
# the table. A dash in the table becomes an empty value (for JOB_SERVER_TYPE:
# use the default type). Returns 1 for an unknown job.
job_row() {
  local want="$1" line
  line="$(tr -d '\r' < "$CARTA_JOBS_TSV" | awk -F'\t' -v j="$want" '!/^#/ && $1 == j {print; exit}')"
  [ -n "$line" ] || return 1
  local _job
  IFS=$'\t' read -r _job JOB_INPUTS_PREFIX JOB_INPUTS_INCLUDE JOB_OUTPUTS_PREFIX \
    JOB_CEILING_H JOB_EXPECTED_H JOB_NEEDS JOB_SERVER_TYPE JOB_WRAPS <<< "$line"
  local v
  for v in JOB_INPUTS_PREFIX JOB_INPUTS_INCLUDE JOB_OUTPUTS_PREFIX JOB_NEEDS JOB_SERVER_TYPE; do
    if [ "${!v}" = "-" ]; then printf -v "$v" '%s' ""; fi
  done
  return 0
}

# server_arch <hetzner type>: amd64 or arm64, the names rclone and Docker use.
# cax* is Ampere arm64; cx*, cpx* and ccx* are x86 (T299 maps them the same way
# in cax11/provision.sh). Returns 1 for a type it does not know.
server_arch() {
  case "$1" in
    cax[0-9]*) echo arm64 ;;
    cx[0-9]*|cpx[0-9]*|ccx[0-9]*) echo amd64 ;;
    *) return 1 ;;
  esac
}

# hours_to_s <hours, may be fractional>: whole seconds.
hours_to_s() { awk -v h="$1" 'BEGIN { printf "%d\n", h * 3600 + 0.5 }'; }

# job_needs <word>: true when the current row's needs list contains it.
job_needs() { case ",$JOB_NEEDS," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

# expand_includes <args...>: one rclone --include pattern per line, with {arg}
# patterns repeated once per job argument and plain patterns printed once.
expand_includes() {
  local pat a
  local IFS=','
  for pat in $JOB_INPUTS_INCLUDE; do
    case "$pat" in
      *"{arg}"*) for a in "$@"; do printf '%s\n' "${pat//\{arg\}/$a}"; done ;;
      "") ;;
      *) printf '%s\n' "$pat" ;;
    esac
  done
}

# Job arguments travel through cloud-init user data and into shell variables,
# so only a conservative character set is accepted: country slugs, layer names,
# comma lists.
valid_job_arg() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9_.,-]{0,62}$ ]]; }

# For the job scripts: the environment worker.sh hands them, with defaults that
# let a job be dry-run on a laptop.
job_env_defaults() {
  CARTA_REPO="${CARTA_REPO:-$(cd "$CARTA_JOBS_DIR/../../.." && pwd)}"
  CARTA_IN="${CARTA_IN:-/srv/carta/in}"
  CARTA_OUT="${CARTA_OUT:-/srv/carta/out}"
  CARTA_WORK="${CARTA_WORK:-/srv/carta/work}"
  CARTA_THREADS="${CARTA_THREADS:-$(nproc 2>/dev/null || echo 1)}"
  CARTA_JOB_DRY_RUN="${CARTA_JOB_DRY_RUN:-0}"
  CARTA_PY="${CARTA_PY:-python3}"
  # Every threaded library the jobs touch reads one of these. A CAX41 has 16
  # cores and nothing else runs on it, so the job gets all of them.
  export OMP_NUM_THREADS="$CARTA_THREADS" MKL_NUM_THREADS="$CARTA_THREADS" \
         OPENBLAS_NUM_THREADS="$CARTA_THREADS" VIPS_CONCURRENCY="$CARTA_THREADS"
}

# x <cmd...>: print the command; run it unless CARTA_JOB_DRY_RUN=1.
x() {
  printf '+'; printf ' %q' "$@"; printf '\n'
  if [ "${CARTA_JOB_DRY_RUN:-0}" = "1" ]; then return 0; fi
  "$@"
}

jlog() { printf '%s %s: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${CARTA_JOB_NAME:-job}" "$*"; }
