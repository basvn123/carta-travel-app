#!/usr/bin/env bash
# Spawn an on-demand CAX41 for one heavy job, wait for it, and delete it.
# CARTA_CLOUD_ARCHITECTURE.md section 6.2: "create -> cloud-init pulls the repo
# and the inputs from R2 -> run -> push artifacts to R2 -> delete".
# Task report: Execution/P3/T047-on-demand-cax41.md. Owner procedure:
# Execution/P3/_OPEN-hetzner.md, steps 17 onward.
#
# Runs on the CAX11 orchestrator, which has hcloud, rclone, python3 and the
# secrets file (HCLOUD_TOKEN, RCLONE_CONFIG_R2_*). Runs on the laptop too with
# those exported. Jobs and their ceilings are in infra/hetzner/jobs/jobs.tsv.
#
# Usage:
#   spawn.sh [options] <job> [job args...]
#   spawn.sh --dry-run clip_sweep lakes      print every hcloud and rclone command, run none
#   spawn.sh selftest                        the cheapest real run (about EUR 0.06)
#   spawn.sh valhalla_tiles switzerland
#   spawn.sh --sweep                         delete stray workers only (the hourly timer)
#   spawn.sh --cost                          month-to-date spend from the ledger
#   spawn.sh --list                          the jobs table
#   spawn.sh --render FILE <job> [args]      write the user data (secrets redacted) and stop
#
# Options:
#   --dry-run   print every command, create nothing, need no token
#   --keep      do NOT delete the worker at the end (debugging). Loud. The
#               worker is labelled keep=1 and the sweep still deletes it
#               CARTA_KEEP_HOURS (default 4) after its ceiling.
#   --no-ipv4   create the worker without a public IPv4. Default is WITH one:
#               github.com and its release downloads have no IPv6 address
#               (T046 finding, checked 2026-09-27), so an IPv6-only worker
#               cannot clone the repo. The IPv4 costs about EUR 0.0008 an hour.
#
# Environment (all optional except the credentials for a real run):
#   HCLOUD_TOKEN            Read & Write token of the project
#   RCLONE_CONFIG_R2_*      the R2 remote (endpoint, key id, secret); passed on
#                           to the worker unless CARTA_WORKER_R2_ACCESS_KEY_ID and
#                           CARTA_WORKER_R2_SECRET_ACCESS_KEY name a separate token
#   CARTA_LOCATION          default: the orchestrator's own location
#   CARTA_SERVER_NAME       the orchestrator, default carta-orchestrator
#   CARTA_SSH_KEY_NAME      default carta-orchestrator (the key T046 uploaded)
#   CARTA_FIREWALL_NAME     default carta-orchestrator-ssh (T046's, SSH only)
#   CARTA_REPO_URL          default https://github.com/basvn123/carta-travel-app.git
#   CARTA_REPO_BRANCH       default: CARTA_REPO_BRANCH from /etc/carta/bootstrap.conf
#                           (the orchestrator's own), else this checkout's branch.
#                           The branch must be pushed: the worker clones it.
#   CARTA_R2_BUCKET         default carta
#   CARTA_CEILING_S         override the table's ceiling (seconds), e.g. for a test
#   CARTA_POLL_S            status poll interval, default 60
#   CARTA_BOOT_WINDOW_S     no "started" status by then = failed boot, default 1800
#   CARTA_WORKER_SELF_DELETE=1  also give the worker HCLOUD_TOKEN so it deletes
#                           itself as a second net. Off by default; README.md
#                           explains why.
#   CARTA_STATE_DIR         ledger, locks and fetched logs, default <repo>/logs
#   CARTA_CACHE_DIR         where the rescore holds live, default <repo>/cache
#   CARTA_PYTHON            default python3
#
# Exit codes: 0 the job succeeded and its outputs were promoted; 1 the job
# failed, timed out or the infrastructure failed; 2 usage; 4 another spawn of
# this job is running; 5 refused by the rescore hold; 6 the job succeeded but
# a hold appeared, so nothing was promoted; 7 the worker could NOT be
# confirmed deleted (it may still be billing; act on the message).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
. "$REPO/infra/hetzner/jobs/jobs_lib.sh"
CLOUD_INIT="$HERE/cloud-init.yaml"

# The orchestrator's secrets file, when there is one (T046 load-env.sh).
if [ -r "$REPO/infra/hetzner/cax11/load-env.sh" ]; then
  # shellcheck source=../cax11/load-env.sh
  . "$REPO/infra/hetzner/cax11/load-env.sh"
fi

DRY_RUN=0
KEEP=0
MODE=run
IPV4="${IPV4:-1}"
RENDER_TO=""
JOB=""
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --keep) KEEP=1 ;;
    --no-ipv4) IPV4=0 ;;
    --sweep) MODE=sweep ;;
    --cost) MODE=cost ;;
    --list) MODE=list ;;
    --render) MODE=render; RENDER_TO="${2:-}"; shift ;;
    -h|--help) sed -n '2,64p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --) shift; ARGS+=("$@"); break ;;
    -*) if [ -n "$JOB" ]; then ARGS+=("$1"); else echo "unknown option $1 (try --help)" >&2; exit 2; fi ;;
    *) if [ -z "$JOB" ]; then JOB="$1"; else ARGS+=("$1"); fi ;;
  esac
  shift
done

SERVER_TYPE="${CARTA_WORKER_TYPE:-cax41}"
IMAGE="ubuntu-24.04"
ORCH="${CARTA_SERVER_NAME:-carta-orchestrator}"
KEY_NAME="${CARTA_SSH_KEY_NAME:-carta-orchestrator}"
FW_NAME="${CARTA_FIREWALL_NAME:-carta-orchestrator-ssh}"
REPO_URL="${CARTA_REPO_URL:-https://github.com/basvn123/carta-travel-app.git}"
BUCKET="${CARTA_R2_BUCKET:-carta}"
POLL_S="${CARTA_POLL_S:-60}"
BOOT_WINDOW_S="${CARTA_BOOT_WINDOW_S:-1800}"
KEEP_HOURS="${CARTA_KEEP_HOURS:-4}"
STATE_DIR="${CARTA_STATE_DIR:-$REPO/logs}"
CACHE_DIR="${CARTA_CACHE_DIR:-$REPO/cache}"
LEDGER="$STATE_DIR/cax41_runs.tsv"
LEDGER_KEY="archive/logs/cax41_runs.tsv"
PY="${CARTA_PYTHON:-python3}"
SELF_DELETE="${CARTA_WORKER_SELF_DELETE:-0}"
# Grace the sweep gives a live spawn.sh past its deadline before acting itself.
SWEEP_GRACE_S=900

if [ -n "${CARTA_REPO_BRANCH:-}" ]; then
  REPO_BRANCH="$CARTA_REPO_BRANCH"
elif [ -r /etc/carta/bootstrap.conf ] && grep -q '^CARTA_REPO_BRANCH=' /etc/carta/bootstrap.conf; then
  REPO_BRANCH="$(sed -n 's/^CARTA_REPO_BRANCH="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' /etc/carta/bootstrap.conf | head -n 1)"
else
  REPO_BRANCH="$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
fi

say()  { printf '%s spawn: %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
warn() { printf '%s spawn: WARNING: %s\n' "$(date -u +%H:%M:%SZ)" "$*" >&2; }
die()  { local code="$1"; shift; printf 'spawn: %s\n' "$*" >&2; exit "$code"; }

# Print a command in copy-pasteable form; run it unless --dry-run.
run() {
  printf '+'; printf ' %q' "$@"; printf '\n'
  if [ "$DRY_RUN" -eq 1 ]; then return 0; fi
  "$@"
}

iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ; }

# The longest ceiling in the table: the sweep's fallback for a worker whose
# deadline label is missing.
max_ceiling_s() {
  local m=0 j s
  for j in $(job_names); do
    job_row "$j" || continue
    s=$(hours_to_s "$JOB_CEILING_H"); [ "$s" -gt "$m" ] && m=$s
  done
  echo "$m"
}

# --- the ledger ----------------------------------------------------------------
# One row per worker: logs/cax41_runs.tsv, pushed to R2 after every change.
LEDGER_HEADER="run_id	job	args	created_at	deleted_at	wall_hours	started_hours	ipv4	eur	eur_started_h	outcome	exit_code"
ledger_append() {  # run_id job args created_epoch deleted_epoch|"" ipv4 outcome exit_code
  local run_id="$1" job="$2" args="$3" c="$4" d="$5" v4="$6" outcome="$7" code="$8"
  local deleted_at wall="" started="" eur="" eur_s="" price
  if [ -n "$d" ]; then
    deleted_at="$(iso "$d")"
    if price="$("$PY" "$HERE/cost.py" price --seconds $(( d - c )) --ipv4 "$v4" 2>/dev/null)"; then
      IFS=$'\t' read -r wall started eur eur_s <<< "$price"
    else
      warn "cost.py did not run ($PY); the row has no cost, fill it from the wall time"
    fi
  else
    deleted_at="NOT-DELETED"
  fi
  local row
  row="$(printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s' \
    "$run_id" "$job" "${args:--}" "$(iso "$c")" "$deleted_at" "$wall" "$started" "$v4" "$eur" "$eur_s" "$outcome" "$code")"
  if [ "$DRY_RUN" -eq 1 ]; then
    say "ledger row (dry run, not written): $row"
    return 0
  fi
  mkdir -p "$STATE_DIR"
  [ -s "$LEDGER" ] || printf '%s\n' "$LEDGER_HEADER" > "$LEDGER"
  printf '%s\n' "$row" >> "$LEDGER"
  say "ledger: $row"
}
ledger_push() {
  if [ "$DRY_RUN" -eq 1 ] || [ -s "$LEDGER" ]; then
    run rclone copyto "$LEDGER" "r2:$BUCKET/$LEDGER_KEY" || warn "the ledger did not reach R2; it is still in $LEDGER"
  fi
}

# --- delete, and the sweep -----------------------------------------------------
# delete_worker NAME: delete and confirm it is gone. Retries, because this is
# the one call that must not be lost to a transient API error.
delete_worker() {
  local name="$1" i
  local out rc
  for i in 1 2 3; do
    run hcloud server delete "$name"
    if [ "$DRY_RUN" -eq 1 ]; then return 0; fi
    # Gone only when the API says "not found". Any other failure of describe
    # (network, rate limit, a bad token) proves nothing, so it counts as a
    # failed attempt rather than a delete.
    out="$(hcloud server describe "$name" -o 'format={{.Status}}' 2>&1)"; rc=$?
    if [ "$rc" -ne 0 ] && grep -qi 'not found' <<< "$out"; then return 0; fi
    if [ "$rc" -eq 0 ]; then
      warn "server $name still exists ($out) after delete attempt $i"
    else
      warn "cannot confirm the delete of $name (attempt $i): $out"
    fi
    [ "$i" -lt 3 ] && sleep "${CARTA_DELETE_RETRY_S:-10}"
  done
  return 1
}

# sweep: delete every role=worker server that is past its deadline, or powered
# off with no live spawn.sh owning it. A worker powers itself off only when its
# run is over, so "off" means finished. Workers labelled keep=1 are left until
# their (extended) deadline. Returns 1 if any delete failed.
sweep() {
  local now names n info run job created deadline keep status owner_pid failed=0 max
  now=$(date +%s)
  say "sweep: role=worker servers past their deadline or finished"
  if [ "$DRY_RUN" -eq 1 ]; then
    run hcloud server list --selector role=worker -o noheader -o columns=name
    run hcloud server describe '<each worker>' -o 'format={{index .Labels "run"}}|{{index .Labels "job"}}|{{index .Labels "created"}}|{{index .Labels "deadline"}}|{{index .Labels "keep"}}|{{.Status}}|{{.Created.Unix}}'
    say "sweep: (dry run) a worker past its deadline would get: hcloud server delete <name>"
    return 0
  fi
  if ! names="$(hcloud server list --selector role=worker -o noheader -o columns=name 2>&1)"; then
    warn "sweep: could not list workers: $names"
    return 1
  fi
  max=$(max_ceiling_s)
  for n in $names; do
    [ "$n" = "${KEPT_NAME:-}" ] && continue
    info="$(hcloud server describe "$n" -o 'format={{index .Labels "run"}}|{{index .Labels "job"}}|{{index .Labels "created"}}|{{index .Labels "deadline"}}|{{index .Labels "keep"}}|{{.Status}}|{{.Created.Unix}}' 2>/dev/null)" || { warn "sweep: cannot describe $n"; failed=1; continue; }
    local created_api owner_run
    # A | separator, because IFS whitespace would collapse an empty label.
    IFS='|' read -r run job created deadline keep status created_api <<< "$info"
    [[ "$created" =~ ^[0-9]+$ ]] || created="${created_api:-0}"
    [[ "$deadline" =~ ^[0-9]+$ ]] || deadline=$(( created + max ))
    owner_pid=""
    if [ -f "$STATE_DIR/cax41-$job.lock.d/owner" ]; then
      read -r owner_pid owner_run < "$STATE_DIR/cax41-$job.lock.d/owner" || true
      if [ "${owner_run:-}" != "$run" ] || ! kill -0 "$owner_pid" 2>/dev/null; then owner_pid=""; fi
    fi
    local why=""
    if [ -n "$owner_pid" ]; then
      [ "$now" -gt $(( deadline + SWEEP_GRACE_S )) ] && why="past its deadline by more than ${SWEEP_GRACE_S}s while spawn.sh (pid $owner_pid) still runs"
    elif [ "$now" -gt "$deadline" ]; then
      why="past its deadline $(iso "$deadline")"
    elif [ "$status" = "off" ] && [ "$keep" != "1" ]; then
      why="powered off (run over) and no spawn.sh owns it"
    fi
    if [ -z "$why" ]; then
      say "sweep: $n ($job, $status) left alone, deadline $(iso "$deadline")"
      continue
    fi
    say "sweep: deleting $n: $why"
    if delete_worker "$n"; then
      ledger_append "${run:-unknown}" "${job:-unknown}" "-" "$created" "$(date +%s)" "$IPV4" "swept" "-"
    else
      warn "sweep: $n could NOT be deleted; delete it in the Hetzner console"
      failed=1
    fi
  done
  return $failed
}

# --- modes that do not spawn ---------------------------------------------------
case "$MODE" in
  list)
    printf '%-16s %-9s %-10s %s\n' job ceiling_h expected_h needs
    for j in $(job_names); do
      job_row "$j"; printf '%-16s %-9s %-10s %s\n' "$j" "$JOB_CEILING_H" "$JOB_EXPECTED_H" "${JOB_NEEDS:--}"
    done
    exit 0 ;;
  cost)
    exec "$PY" "$HERE/cost.py" mtd --ledger "$LEDGER" ;;
  sweep)
    if [ "$DRY_RUN" -eq 0 ] && [ -z "${HCLOUD_TOKEN:-}" ]; then die 1 "HCLOUD_TOKEN is not set"; fi
    sweep; rc=$?
    ledger_push
    exit $rc ;;
esac

# --- validate the job ----------------------------------------------------------
[ -n "$JOB" ] || die 2 "usage: spawn.sh [--dry-run] [--keep] [--no-ipv4] <job> [args...]; jobs: $(job_names | tr '\n' ' ')"
job_row "$JOB" || die 2 "unknown job '$JOB'; jobs: $(job_names | tr '\n' ' ')"
[ -f "$REPO/infra/hetzner/jobs/$JOB.sh" ] || die 2 "no infra/hetzner/jobs/$JOB.sh"
for a in ${ARGS[@]+"${ARGS[@]}"}; do
  valid_job_arg "$a" || die 2 "job argument '$a' has characters the user data cannot carry safely"
done
case "$IPV4" in 0|1) ;; *) die 2 "IPV4 must be 0 or 1" ;; esac
CEILING_S="${CARTA_CEILING_S:-$(hours_to_s "$JOB_CEILING_H")}"
ARGS_STR="${ARGS[*]:-}"

# --- render the user data ------------------------------------------------------
# render FILE REDACT: the cloud-init template with every placeholder filled.
# The secrets are written only into a mode-600 file that is deleted as soon
# as the server is created.
render() {
  local out="$1" redact="$2" content ep ak sk tok
  ep="${RCLONE_CONFIG_R2_ENDPOINT:-}"
  ak="${CARTA_WORKER_R2_ACCESS_KEY_ID:-${RCLONE_CONFIG_R2_ACCESS_KEY_ID:-}}"
  sk="${CARTA_WORKER_R2_SECRET_ACCESS_KEY:-${RCLONE_CONFIG_R2_SECRET_ACCESS_KEY:-}}"
  tok=""; [ "$SELF_DELETE" = "1" ] && tok="${HCLOUD_TOKEN:-}"
  if [ "$redact" = "1" ]; then
    ep="https://REDACTED.r2.cloudflarestorage.com"; ak="REDACTED"; sk="REDACTED"
    [ "$SELF_DELETE" = "1" ] && tok="REDACTED"
  fi
  local v
  for v in "$ep" "$ak" "$sk" "$tok" "$REPO_URL" "$REPO_BRANCH"; do
    case "$v" in *"'"*|*$'\n'*|*'@@'*) die 1 "a value for the user data contains a quote, a newline or @@; refusing to render" ;; esac
  done
  # tr strips CR: a Windows checkout with core.autocrlf would otherwise hand
  # the worker a CRLF boot script, which bash rejects (T046).
  content="$(tr -d '\r' < "$CLOUD_INIT")"
  content="${content//@@CARTA_RUN_ID@@/"$RUN_ID"}"
  content="${content//@@CARTA_JOB@@/"$JOB"}"
  content="${content//@@CARTA_JOB_ARGS@@/"$ARGS_STR"}"
  content="${content//@@CARTA_REPO_URL@@/"$REPO_URL"}"
  content="${content//@@CARTA_REPO_BRANCH@@/"$REPO_BRANCH"}"
  content="${content//@@CARTA_JOB_DEADLINE@@/"$JOB_DEADLINE"}"
  content="${content//@@CARTA_R2_BUCKET@@/"$BUCKET"}"
  content="${content//@@R2_ENDPOINT@@/"$ep"}"
  content="${content//@@R2_ACCESS_KEY_ID@@/"$ak"}"
  content="${content//@@R2_SECRET_ACCESS_KEY@@/"$sk"}"
  content="${content//@@CARTA_WORKER_HCLOUD_TOKEN@@/"$tok"}"
  ( umask 077; printf '%s\n' "$content" > "$out" )
  if grep -q '@@[A-Z0-9_]*@@' "$out"; then die 1 "a placeholder was left unrendered in $out"; fi
  local size; size=$(wc -c < "$out" | tr -d ' ')
  [ "$size" -le 32768 ] || die 1 "user data is $size bytes; Hetzner accepts at most 32768"
  USER_DATA_BYTES="$size"
}

RUN_ID="$(date -u +%Y%m%dt%H%M%Sz)-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
NAME="carta-worker-${JOB//_/-}-$RUN_ID"
RUN_PREFIX="archive/runs/$RUN_ID"

if [ "$MODE" = "render" ]; then
  [ -n "$RENDER_TO" ] || die 2 "--render needs a file"
  JOB_DEADLINE=$(( $(date +%s) + CEILING_S - 300 ))
  render "$RENDER_TO" 1
  say "rendered $RENDER_TO ($USER_DATA_BYTES bytes, secrets redacted) for $JOB ${ARGS_STR}"
  exit 0
fi

# --- preflight -----------------------------------------------------------------
if [ "$DRY_RUN" -eq 0 ]; then
  [ -n "${HCLOUD_TOKEN:-}" ] || die 1 "HCLOUD_TOKEN is not set (the orchestrator's secrets file, T046-e). Use --dry-run to see the commands."
  command -v hcloud >/dev/null || die 1 "hcloud is not on PATH"
  command -v rclone >/dev/null || die 1 "rclone is not on PATH"
  for v in RCLONE_CONFIG_R2_ENDPOINT RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY; do
    [ -n "${!v:-}" ] || die 1 "$v is not set; the worker could not pull inputs or report"
  done
  "$PY" -c 'import sys' 2>/dev/null || warn "$PY does not run; ledger rows will carry no cost"
else
  say "DRY RUN: nothing is created, no token is needed. Every command below is what a real run executes."
fi
if [ "$KEEP" -eq 1 ]; then
  printf '\n%s\n' "#################################################################"
  printf '%s\n'   "# --keep IS ON. This run will NOT delete its CAX41 at the end."
  printf '%s\n'   "# It bills about EUR 0.056 an hour until you delete it:"
  printf '%s\n'   "#   hcloud server delete $NAME"
  printf '%s\n'   "# The sweep deletes it ${KEEP_HOURS} h after its ceiling if you forget."
  printf '%s\n\n' "#################################################################"
fi
if [ "$IPV4" -eq 0 ]; then
  warn "--no-ipv4: github.com has no IPv6 address, so the worker's clone will fail unless that changed (T046)"
fi

# --- one spawn per job at a time -------------------------------------------------
LOCK_DIR="$STATE_DIR/cax41-$JOB.lock.d"
if [ "$DRY_RUN" -eq 0 ]; then
  mkdir -p "$STATE_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    read -r opid orun < "$LOCK_DIR/owner" 2>/dev/null || true
    if [ -n "${opid:-}" ] && kill -0 "$opid" 2>/dev/null; then
      die 4 "another spawn of $JOB is running (pid $opid, run ${orun:-?}); not starting"
    fi
    warn "removing a stale lock left by pid ${opid:-?} (run ${orun:-?})"
    rm -rf "$LOCK_DIR"; mkdir "$LOCK_DIR" || die 4 "cannot take $LOCK_DIR"
  fi
  echo "$$ $RUN_ID" > "$LOCK_DIR/owner"
fi

# --- the rescore hold (clip_sweep) -----------------------------------------------
# docs/PHOTOS.md: rescore runs after a layer rebuild, never beside one. On the
# CAX41 the hold is a correctness guard only; memory is not a constraint on a
# 31 GB box that runs one job. Two directions:
#   - a layer carrying cache/<layer>/.rescore_hold here is being rebuilt: no
#     spawn (exit 5). run_pipeline.py writes that hold for the length of a
#     beaches, lakes or mountains task (T047).
#   - while the sweep runs, cache/<layer>/.rescore_running says so, and
#     run_pipeline.py's layer tasks refuse to start (T047). Removed on exit.
MARKERS=()
if [ "$JOB" = "clip_sweep" ]; then
  for a in ${ARGS[@]+"${ARGS[@]}"}; do
    case "$a" in beaches|lakes|mountains) ;; *) continue ;; esac
    hold="$CACHE_DIR/$a/.rescore_hold"
    if [ -f "$hold" ]; then
      say "REFUSED: $a is held by $hold:"
      sed 's/^/    /' "$hold"
      [ "$DRY_RUN" -eq 0 ] && rm -rf "$LOCK_DIR"
      exit 5
    fi
    marker="$CACHE_DIR/$a/.rescore_running"
    if [ "$DRY_RUN" -eq 1 ]; then
      say "would write $marker for the length of the run"
    else
      mkdir -p "$CACHE_DIR/$a"
      printf 'rescore running: clip_sweep on a CAX41 worker, spawned by spawn.sh\nhost: %s\npid: %s\nstarted: %s\nrun: %s\n' \
        "$(hostname)" "$$" "$(date +%s)" "$RUN_ID" > "$marker"
      MARKERS+=("$marker")
    fi
  done
fi

# --- cleanup: runs on every exit ---------------------------------------------------
CREATE_ATTEMPTED=0
CREATED_EPOCH=""
OUTCOME="not-started"
WORKER_EXIT="-"
USER_DATA=""
KEPT_NAME=""
FINAL_RC=0
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  [ "$FINAL_RC" -ne 0 ] && rc=$FINAL_RC
  [ -n "$USER_DATA" ] && [ "$DRY_RUN" -eq 0 ] && rm -f "$USER_DATA"
  if [ "$CREATE_ATTEMPTED" -eq 1 ]; then
    local deleted=""
    if [ "$KEEP" -eq 1 ]; then
      KEPT_NAME="$NAME"
      printf '\n%s\n' "#################################################################"
      printf '%s\n'   "# --keep: $NAME was NOT deleted and is still billing."
      printf '%s\n'   "#   hcloud server delete $NAME"
      printf '%s\n\n' "#################################################################"
      OUTCOME="$OUTCOME,kept"
    else
      say "deleting $NAME ($OUTCOME)"
      if delete_worker "$NAME"; then
        deleted=$(date +%s)
        say "deleted $NAME"
      else
        warn "$NAME could NOT be confirmed deleted. It may still be billing."
        warn "delete it now: hcloud server delete $NAME (or the Hetzner console)"
        rc=7
      fi
    fi
    if [ "$KEEP" -eq 0 ]; then
      ledger_append "$RUN_ID" "$JOB" "$(IFS=,; echo "${ARGS[*]:-}")" "$CREATED_EPOCH" "$deleted" "$IPV4" "$OUTCOME" "$WORKER_EXIT"
    fi
  fi
  local m
  for m in ${MARKERS[@]+"${MARKERS[@]}"}; do rm -f "$m"; done
  # The unconditional net: anything past its deadline goes, whatever this run did.
  sweep || { warn "the sweep could not finish; run spawn.sh --sweep"; [ "$rc" -eq 0 ] && rc=7; }
  ledger_push
  [ "$DRY_RUN" -eq 0 ] && rm -rf "$LOCK_DIR"
  if [ "$CREATE_ATTEMPTED" -eq 1 ] && [ "$DRY_RUN" -eq 0 ]; then
    "$PY" "$HERE/cost.py" mtd --ledger "$LEDGER" 2>/dev/null | head -n 2 || true
  fi
  say "done: run $RUN_ID, outcome $OUTCOME, exit $rc"
  exit "$rc"
}
trap cleanup EXIT
trap 'OUTCOME="interrupted"; exit 130' INT
trap 'OUTCOME="terminated"; exit 143' TERM

# --- location: the orchestrator's own ------------------------------------------------
LOCATION="${CARTA_LOCATION:-}"
if [ -z "$LOCATION" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    run hcloud server describe "$ORCH" -o 'format={{.Location.Name}}'
    LOCATION=fsn1
  else
    LOCATION="$(hcloud server describe "$ORCH" -o 'format={{.Location.Name}}' 2>/dev/null || true)"
    if [ -z "$LOCATION" ]; then warn "could not read $ORCH's location; using fsn1"; LOCATION=fsn1; fi
  fi
fi

# --- create ---------------------------------------------------------------------------
CREATED_EPOCH=$(date +%s)
DEADLINE=$(( CREATED_EPOCH + CEILING_S ))
# The worker's own deadline leaves five minutes before ours for its last status.
JOB_DEADLINE=$(( DEADLINE - 300 ))
LABEL_DEADLINE=$DEADLINE
[ "$KEEP" -eq 1 ] && LABEL_DEADLINE=$(( DEADLINE + $(hours_to_s "$KEEP_HOURS") ))
if [ "$DRY_RUN" -eq 1 ]; then
  USER_DATA="$(mktemp "${TMPDIR:-/tmp}/carta-worker-user-data.XXXXXX")"
  render "$USER_DATA" 1
  say "user data rendered to $USER_DATA ($USER_DATA_BYTES bytes, secrets redacted; kept after a dry run)"
else
  USER_DATA="$(mktemp "${TMPDIR:-/tmp}/carta-worker-user-data.XXXXXX")"
  render "$USER_DATA" 0
fi
say "run $RUN_ID: $JOB ${ARGS_STR} on $SERVER_TYPE in $LOCATION, repo $REPO_URL@$REPO_BRANCH"
say "ceiling $(( CEILING_S / 60 )) min, deadline $(iso "$DEADLINE"); planned ${JOB_EXPECTED_H} h"

ip_args=()
[ "$IPV4" -eq 0 ] && ip_args+=(--without-ipv4)
# Set before the call: a create that times out on our side may still have
# made the server, and the delete by name must then still be attempted.
CREATE_ATTEMPTED=1
OUTCOME="creating"
if ! run hcloud server create \
    --name "$NAME" \
    --type "$SERVER_TYPE" \
    --image "$IMAGE" \
    --location "$LOCATION" \
    --ssh-key "$KEY_NAME" \
    --firewall "$FW_NAME" \
    --label role=worker \
    --label "job=$JOB" \
    --label "run=$RUN_ID" \
    --label "created=$CREATED_EPOCH" \
    --label "deadline=$LABEL_DEADLINE" \
    --label "keep=$KEEP" \
    --user-data-from-file "$USER_DATA" \
    ${ip_args[@]+"${ip_args[@]}"}; then
  OUTCOME="create-failed"
  exit 1
fi
[ "$DRY_RUN" -eq 0 ] && rm -f "$USER_DATA" && USER_DATA=""
OUTCOME="waiting"

# --- wait -----------------------------------------------------------------------------
# The worker's status object in R2 is the signal. The server's own state is the
# cross-check: "off" without a final status means the run died.
json_str() { sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" <<< "$2" | head -n 1; }
json_num() { sed -n "s/.*\"$1\": *\(-\{0,1\}[0-9][0-9]*\).*/\1/p" <<< "$2" | head -n 1; }
wait_for_job() {
  local boot_by=$(( CREATED_EPOCH + BOOT_WINDOW_S )) seen_started=0 off_polls=0 api_fail=0 polls=0
  local st state phase last="" srv now
  if [ "$DRY_RUN" -eq 1 ]; then
    run rclone cat "r2:$BUCKET/$RUN_PREFIX/status.json"
    run hcloud server describe "$NAME" -o 'format={{.Status}}'
    say "(dry run) every ${POLL_S}s until state ok or failed, the server is off, or $(iso "$DEADLINE"); simulating ok"
    OUTCOME=ok; WORKER_EXIT=0
    return 0
  fi
  while :; do
    now=$(date +%s)
    st="$(rclone cat "r2:$BUCKET/$RUN_PREFIX/status.json" 2>/dev/null || true)"
    state="$(json_str state "$st")"; phase="$(json_str phase "$st")"
    if [ -n "$state" ] && [ "$state/$phase" != "$last" ]; then
      say "worker: $state, phase $phase"; last="$state/$phase"
    fi
    case "$state" in
      ok) OUTCOME=ok; WORKER_EXIT="$(json_num exit_code "$st")"; return 0 ;;
      failed) OUTCOME="failed-$phase"; WORKER_EXIT="$(json_num exit_code "$st")"; return 1 ;;
      started) seen_started=1 ;;
    esac
    if srv="$(hcloud server describe "$NAME" -o 'format={{.Status}}' 2>&1)"; then
      api_fail=0
      if [ "$srv" = "off" ]; then
        off_polls=$(( off_polls + 1 ))
        # One more poll first: the worker writes its status before powering off.
        [ "$off_polls" -ge 2 ] && { OUTCOME="off-without-status"; return 1; }
      fi
    else
      api_fail=$(( api_fail + 1 ))
      warn "hcloud server describe $NAME failed ($api_fail): $srv"
      [ "$api_fail" -ge 3 ] && { OUTCOME="api-error"; return 1; }
    fi
    if [ "$now" -ge "$DEADLINE" ]; then OUTCOME="timeout"; return 1; fi
    if [ "$seen_started" -eq 0 ] && [ "$now" -ge "$boot_by" ]; then OUTCOME="boot-timeout"; return 1; fi
    polls=$(( polls + 1 ))
    [ $(( polls % 10 )) -eq 0 ] && say "still waiting: ${state:-no status yet}, $(( (now - CREATED_EPOCH) / 60 )) min in"
    # Backgrounded so a TERM or INT is handled at once, not after the sleep.
    sleep "$POLL_S" & wait $! 2>/dev/null
  done
}
wait_for_job
JOB_OK=$?

# --- fetch the run's logs and status -------------------------------------------------
run rclone copy "r2:$BUCKET/$RUN_PREFIX" "$STATE_DIR/cax41/$RUN_ID" --exclude "out/**" \
  || warn "could not fetch the run's logs from r2:$BUCKET/$RUN_PREFIX"

if [ "$JOB_OK" -ne 0 ]; then
  say "the job did not succeed: $OUTCOME (worker exit ${WORKER_EXIT:-?}); logs in $STATE_DIR/cax41/$RUN_ID"
  [ "${WORKER_EXIT:-}" = "3" ] && say "exit 3 means the job is a stub: read the header of infra/hetzner/jobs/$JOB.sh"
  [ "${WORKER_EXIT:-}" = "5" ] && say "exit 5 means the rescore hold refused it: the layer in R2 was packed mid-rebuild"
  FINAL_RC=1
  exit 1
fi

# --- promote ----------------------------------------------------------------------------
# The worker pushed to archive/runs/<run>/out/, never to the live prefix. Only
# here, after an ok status, does anything the job made replace what is in R2,
# so a failed or half-finished run can never overwrite a good artifact. For the
# sweep the hold is checked once more: a rebuild that started by hand while the
# worker ran means the rescored copy is already stale.
if [ "$JOB" = "clip_sweep" ]; then
  for a in ${ARGS[@]+"${ARGS[@]}"}; do
    case "$a" in beaches|lakes|mountains) ;; *) continue ;; esac
    if [ -f "$CACHE_DIR/$a/.rescore_hold" ]; then
      warn "$a gained a rescore hold while the worker ran; NOT promoting. The outputs stay in r2:$BUCKET/$RUN_PREFIX/out"
      OUTCOME="ok-held-not-promoted"
      FINAL_RC=6
      exit 6
    fi
  done
fi
if [ -n "$JOB_OUTPUTS_PREFIX" ]; then
  OUTCOME="ok-promoting"
  if ! run rclone copy "r2:$BUCKET/$RUN_PREFIX/out" "r2:$BUCKET/$JOB_OUTPUTS_PREFIX" --stats-one-line; then
    OUTCOME="ok-promote-failed"
    FINAL_RC=1
    exit 1
  fi
fi
OUTCOME=ok
if [ "$JOB" = "clip_sweep" ]; then
  say "promoted. The machine that owns each layer's cache must pull before its next rebuild:"
  for a in ${ARGS[@]+"${ARGS[@]}"}; do
    case "$a" in beaches|lakes|mountains) say "  python pipeline/archive/push.py --pull --only $a-cache" ;; esac
  done
  say "  python pipeline/archive/push.py --pull --only photo-embeddings"
fi
exit 0
