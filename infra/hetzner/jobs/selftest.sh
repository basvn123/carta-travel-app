#!/usr/bin/env bash
# Job selftest (T047): the cheapest thing a CAX41 can do. It proves the whole
# spawn path (create, cloud-init, clone, status in R2, push, promote, delete)
# for about EUR 0.06, before a real job risks an hour of a 16-core box. Writes
# one small report of what the box is to out/selftest.txt.
#
# Contract shared by every job script, set by worker.sh:
#   CARTA_REPO     the sparse clone      CARTA_IN    the R2 input mirror
#   CARTA_OUT      pushed to R2 after    CARTA_WORK  scratch, never pushed
#   CARTA_THREADS  nproc (16 on a CAX41) CARTA_JOB_DRY_RUN=1 prints, runs nothing
# Exit codes: 0 ok, 1 failed, 2 bad arguments, 3 not implemented (stub),
# 4 an input is missing, 5 refused by a correctness guard (the rescore hold).
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jobs_lib.sh"
CARTA_JOB_NAME=selftest
job_env_defaults

x mkdir -p "$CARTA_OUT"
report="$CARTA_OUT/selftest.txt"
if [ "$CARTA_JOB_DRY_RUN" = "1" ]; then
  echo "+ write $report (uname, nproc, memory, disk, repo commit)"
  exit 0
fi
{
  echo "selftest $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "uname: $(uname -a)"
  echo "nproc: $(nproc)"
  echo "threads given to jobs: $CARTA_THREADS"
  echo "memory:"; free -m 2>/dev/null || true
  echo "disk:"; df -h / "$CARTA_WORK" 2>/dev/null || df -h /
  echo "repo: $(git -C "$CARTA_REPO" rev-parse --abbrev-ref HEAD 2>/dev/null) $(git -C "$CARTA_REPO" rev-parse --short HEAD 2>/dev/null)"
  echo "sparse paths: $(git -C "$CARTA_REPO" sparse-checkout list 2>/dev/null | tr '\n' ' ')"
  echo "lfs pointers in the checkout: $(git -C "$CARTA_REPO" lfs ls-files 2>/dev/null | wc -l | tr -d ' ') (expected 0: LFS is skipped on workers)"
} > "$report"
jlog "wrote $report"
cat "$report"
