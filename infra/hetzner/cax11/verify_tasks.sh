#!/usr/bin/env bash
# Verify the weekly cadence on the CAX11 one task at a time (T048).
# Task report: Execution/P3/T048-pipeline-cron-migration.md. The steps and the
# reason for their order are in weekly_tasks.txt next to this file.
#
# For one step it runs, from the repo root and inside the venv:
#   1. run_pipeline.py --only <key> --ship none <args> --dry-run
#   2. run_pipeline.py --only <key> --ship none <args>        (only if 1 passed)
# each under /usr/bin/time -v, and writes logs/arm64_verify/<step>.json with
# the exit code, wall time and peak resident memory of each phase, the change
# in logs/pipeline_state.json, and the verdict. The `ship` step runs
# `npm run build` in continent-app instead and then writes the wire shape
# summary (compare_wire.py summarize) that is compared with the laptop's.
#
# A step passes only when both phases exit 0 AND the task's last_success in
# the state file moved. The exit code alone is not enough: a soft task that
# fails, or a task whose guard skips it, still leaves run_pipeline.py at 0.
#
# It refuses to start a step while another is unfinished (a marker file holds
# the running step and its PID; a dead PID means an interrupted step, cleared
# only by --abandon), and refuses a step whose predecessor in weekly_tasks.txt
# has not passed, unless --out-of-order is given (recorded in the JSON).
#
# Usage, on the box as carta, from anywhere:
#   bash ~/carta/infra/hetzner/cax11/verify_tasks.sh --next
#   bash ~/carta/infra/hetzner/cax11/verify_tasks.sh <step> [--dry-only] [--out-of-order]
#   bash ~/carta/infra/hetzner/cax11/verify_tasks.sh --status
#   bash ~/carta/infra/hetzner/cax11/verify_tasks.sh --abandon
# Long steps (fares is a day) belong in tmux or behind nohup:
#   nohup bash ~/carta/infra/hetzner/cax11/verify_tasks.sh fares > ~/verify_fares.out 2>&1 &
#
# Exit codes: 0 passed, 1 failed or skipped, 2 usage, 3 refused (order,
# unfinished step, lock held), 5 environment (no venv, no /usr/bin/time).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${CARTA_REPO:-$(cd "$HERE/../../.." && pwd)}"
VENV="${CARTA_VENV:-$HOME/venv}"
STEPS_FILE="$HERE/weekly_tasks.txt"
OUT_DIR="$REPO/logs/arm64_verify"
MARKER="$OUT_DIR/.inprogress"
STATE="$REPO/logs/pipeline_state.json"
TIME_BIN="${CARTA_TIME_BIN:-/usr/bin/time}"

usage() { sed -n '2,36p' "${BASH_SOURCE[0]}"; }

# --- the step list ---------------------------------------------------------------
# tr: a Windows checkout gives the list CRLF, and a step name with a trailing
# carriage return matches nothing.
steps() { tr -d '\r' < "$STEPS_FILE" | grep -vE '^[[:space:]]*(#|$)' | awk '{print $1}'; }
step_line() { tr -d '\r' < "$STEPS_FILE" | grep -vE '^[[:space:]]*(#|$)' | awk -v s="$1" '$1 == s'; }
record_status() {  # step -> passed|dry-passed|failed|skipped|interrupted|running|none
  local f="$OUT_DIR/$1.json"
  [ -f "$f" ] || { echo none; return; }
  grep -oE '"status": *"[a-z-]+"' "$f" | head -1 | sed -E 's/.*"([a-z-]+)"$/\1/'
}

cmd_status() {
  printf '%-16s %-12s %s\n' STEP STATUS "RECORD"
  while read -r s; do
    printf '%-16s %-12s %s\n' "$s" "$(record_status "$s")" \
      "$( [ -f "$OUT_DIR/$s.json" ] && echo "logs/arm64_verify/$s.json" || echo -)"
  done < <(steps)
  [ -f "$MARKER" ] && echo "in progress: $(cat "$MARKER")"
  return 0
}

cmd_next() {
  while read -r s; do
    if [ "$(record_status "$s")" != "passed" ]; then echo "$s"; return 0; fi
  done < <(steps)
  echo "all steps passed; next is the first full run (Execution/P3/_OPEN-hetzner.md)"
}

marker_check() {
  [ -f "$MARKER" ] || return 0
  local step pid
  read -r step pid _ < "$MARKER"
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    echo "verify_tasks: step $step is still running (PID $pid); not starting another" >&2
  else
    echo "verify_tasks: step $step was interrupted (PID ${pid:-?} is gone). Read its log in $OUT_DIR," >&2
    echo "then run: bash $0 --abandon   (records it as interrupted and clears the marker)" >&2
  fi
  return 1
}

cmd_abandon() {
  [ -f "$MARKER" ] || { echo "nothing in progress"; return 0; }
  local step pid
  read -r step pid _ < "$MARKER"
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    echo "step $step is still running (PID $pid); stop it first" >&2; return 3
  fi
  local f="$OUT_DIR/$step.json"
  if [ -f "$f" ]; then
    sed -i -E 's/"status": *"running"/"status": "interrupted"/' "$f"
  fi
  rm -f "$MARKER"
  echo "step $step recorded as interrupted; marker cleared"
}

# --- main ------------------------------------------------------------------------
STEP=""
DRY_ONLY=0
OUT_OF_ORDER=0
case "${1:-}" in
  ""|-h|--help) usage; exit 2 ;;
  --status) mkdir -p "$OUT_DIR"; cmd_status; exit 0 ;;
  --next) mkdir -p "$OUT_DIR"; cmd_next; exit 0 ;;
  --abandon) cmd_abandon; exit $? ;;
esac
STEP="$1"; shift
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-only) DRY_ONLY=1 ;;
    --out-of-order) OUT_OF_ORDER=1 ;;
    *) echo "verify_tasks: unknown option $1" >&2; exit 2 ;;
  esac
  shift
done

LINE="$(step_line "$STEP")"
[ -n "$LINE" ] || { echo "verify_tasks: no step '$STEP' in $STEPS_FILE (try --status)" >&2; exit 2; }
read -r _ KEY EXTRA_STR <<< "$LINE"
read -r -a EXTRA <<< "${EXTRA_STR:-}"

if [ "$KEY" = "ship" ] && [ $DRY_ONLY -eq 1 ]; then
  echo "verify_tasks: ship has no dry run (npm run build rewrites public/); run it without --dry-only" >&2
  exit 2
fi

mkdir -p "$OUT_DIR"
marker_check || exit 3

if [ $OUT_OF_ORDER -eq 0 ]; then
  prev=""
  while read -r s; do
    [ "$s" = "$STEP" ] && break
    prev="$s"
  done < <(steps)
  if [ -n "$prev" ] && [ "$(record_status "$prev")" != "passed" ]; then
    echo "verify_tasks: $STEP comes after $prev, which has not passed ($(record_status "$prev"))." >&2
    echo "Verify $prev first, or pass --out-of-order (it is recorded)." >&2
    exit 3
  fi
fi

[ -x "$TIME_BIN" ] || { echo "verify_tasks: $TIME_BIN missing (sudo apt-get install -y time)" >&2; exit 5; }
[ -x "$VENV/bin/python" ] || { echo "verify_tasks: no venv at $VENV" >&2; exit 5; }
cd "$REPO" || exit 5
# Verifying on unpinned versions would verify the wrong thing: carta-bootstrap
# installs the newest releases, run_pipeline.sh re-syncs to constraints.txt
# and stamps the venv. Same stamp formula as run_pipeline.sh.
want="$(cat requirements.txt constraints.txt 2>/dev/null | sha256sum | cut -c1-16)"
if [ "$want" != "$(cat "$VENV/.carta-requirements" 2>/dev/null || true)" ]; then
  echo "verify_tasks: the venv is not synced to constraints.txt; run first:" >&2
  echo "  bash $HERE/run_pipeline.sh --pull-only" >&2
  exit 5
fi

exec 9>"$REPO/logs/carta-run.lock"
if ! flock -n 9; then
  echo "verify_tasks: another run holds logs/carta-run.lock (the weekly timer or run_pipeline.sh)" >&2
  exit 3
fi

# shellcheck source=load-env.sh
. "$HERE/load-env.sh"
# shellcheck disable=SC1091
. "$VENV/bin/activate"
PY="$VENV/bin/python"
export LANG="${LANG:-C.UTF-8}" PYTHONUTF8=1 PYTHONIOENCODING=utf-8

echo "$STEP $$ $(date -Is)" > "$MARKER"
trap 'rm -f "$MARKER"' EXIT
trap 'write_record interrupted "stopped by a signal"; exit 130' INT TERM HUP

RUN_LOG="$OUT_DIR/$STEP.log"
: > "$RUN_LOG"
BEFORE="$OUT_DIR/.$STEP.state_before.json"
if [ -f "$STATE" ]; then cp "$STATE" "$BEFORE"; else echo '{}' > "$BEFORE"; fi
STARTED="$(date -Is)"

# Writes the record. Called once with status running and again at the end.
write_record() {
  STEP="$STEP" KEY="$KEY" EXTRA="${EXTRA_STR:-}" STATUS="$1" REASON="${2:-}" \
  STARTED="$STARTED" OUT_OF_ORDER="$OUT_OF_ORDER" DRY_ONLY="$DRY_ONLY" \
  BEFORE="$BEFORE" STATE="$STATE" OUT_DIR="$OUT_DIR" \
  COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo '?')" \
  "$PY" - <<'PY'
import json, os, platform, socket
from datetime import datetime, timezone
from pathlib import Path

env = os.environ
out = Path(env["OUT_DIR"])

def phase(name):
    p = out / f".{env['STEP']}.{name}.json"
    return json.loads(p.read_text()) if p.exists() else None

def load(p):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return {}

before, after = load(env["BEFORE"]), load(env["STATE"])
delta = {}
for k in sorted(set(before) | set(after)):
    b = (before.get(k) or {}).get("last_success") if isinstance(before.get(k), dict) else None
    a = (after.get(k) or {}).get("last_success") if isinstance(after.get(k), dict) else None
    if a != b:
        delta[k] = {"before": b, "after": a}
if json.dumps(before.get("fares_freshness"), sort_keys=True) != json.dumps(after.get("fares_freshness"), sort_keys=True):
    delta["fares_freshness"] = {"changed": True}

rec = {
    "step": env["STEP"],
    "task_key": env["KEY"],
    "extra_args": env["EXTRA"].split(),
    "status": env["STATUS"],
    "reason": env["REASON"],
    "host": socket.gethostname(),
    "arch": platform.machine(),
    "python": platform.python_version(),
    "git_commit": env["COMMIT"],
    "out_of_order": env["OUT_OF_ORDER"] == "1",
    "dry_only": env["DRY_ONLY"] == "1",
    "started_at": env["STARTED"],
    "finished_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
                   if env["STATUS"] != "running" else None,
    "phases": {"dry_run": phase("dry"), "real": phase("real")},
    "state_delta": delta,
    "log": f"logs/arm64_verify/{env['STEP']}.log",
}
(out / f"{env['STEP']}.json").write_text(json.dumps(rec, indent=2), encoding="utf-8")
PY
}

# Runs one phase under /usr/bin/time -v and leaves .<step>.<phase>.json.
run_phase() {  # phase name, then the command
  local name="$1"; shift
  local tfile="$OUT_DIR/.$STEP.$name.time"
  local t0 rc secs rss
  echo "=== $name: $*" | tee -a "$RUN_LOG"
  t0=$(date +%s)
  "$TIME_BIN" -v -o "$tfile" "$@" 2>&1 | tee -a "$RUN_LOG"
  rc=${PIPESTATUS[0]}
  secs=$(( $(date +%s) - t0 ))
  rss="$(awk -F': ' '/Maximum resident set size/ {print $2}' "$tfile" 2>/dev/null)"
  printf '{"command": "%s", "exit_code": %d, "seconds": %d, "max_rss_kb": %s}\n' \
    "$(printf '%s' "$*" | sed 's/"/\\"/g')" "$rc" "$secs" "${rss:-null}" > "$OUT_DIR/.$STEP.$name.json"
  echo "=== $name: exit $rc, ${secs} s, peak RSS ${rss:-?} kB" | tee -a "$RUN_LOG"
  return "$rc"
}

rm -f "$OUT_DIR/.$STEP.dry.json" "$OUT_DIR/.$STEP.real.json"
write_record running

if [ "$KEY" = "ship" ]; then
  # The wire build has no read-only half: its prebuild hook (sync-data.mjs)
  # rewrites public/ from the master. So there is no dry phase here.
  [ -d continent-app/node_modules ] || (cd continent-app && npm ci --no-audit --no-fund) >> "$RUN_LOG" 2>&1
  if ! run_phase real bash -c 'cd continent-app && npm run build'; then
    write_record failed "npm run build failed"; exit 1
  fi
  summary="$OUT_DIR/wire_summary_$(hostname).json"
  "$PY" "$HERE/compare_wire.py" summarize continent-app/dist -o "$summary" | tee -a "$RUN_LOG"
  write_record passed "built; wire shape summary in logs/arm64_verify/$(basename "$summary")"
  exit 0
fi

ARGS=(run_pipeline.py --only "$KEY" --ship none "${EXTRA[@]}")
if ! run_phase dry "$PY" "${ARGS[@]}" --dry-run; then
  write_record failed "the dry run exited non-zero"; exit 1
fi
if [ $DRY_ONLY -eq 1 ]; then write_record dry-passed "dry run only (--dry-only); the real run is still to do"; exit 0; fi

cp "$STATE" "$BEFORE" 2>/dev/null || true
if ! run_phase real "$PY" "${ARGS[@]}"; then
  write_record failed "the real run exited non-zero"; exit 1
fi

# Exit 0 is not proof: a soft failure or a guard skip also exits 0.
moved="$(KEY="$KEY" BEFORE="$BEFORE" STATE="$STATE" "$PY" -c '
import json, os
def ls(p):
    try:
        return (json.load(open(p, encoding="utf-8")).get(os.environ["KEY"]) or {}).get("last_success")
    except Exception:
        return None
print("yes" if ls(os.environ["STATE"]) and ls(os.environ["STATE"]) != ls(os.environ["BEFORE"]) else "no")')"
if [ "$moved" != "yes" ]; then
  if grep -q "guard:" "$RUN_LOG" && grep -q "skipped=\['$KEY'\]" "$RUN_LOG"; then
    write_record skipped "the task's guard skipped it; read the guard line in the log"
  else
    write_record failed "exit 0 but last_success for $KEY did not move (a soft failure; read the log)"
  fi
  exit 1
fi
write_record passed "both phases exit 0 and last_success moved"
echo "step $STEP passed; next: $(cmd_next)"
exit 0
