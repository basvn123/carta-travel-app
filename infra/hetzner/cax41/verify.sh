#!/usr/bin/env bash
# Offline checks for the on-demand CAX41 flow (T047). Runs on the laptop in Git
# Bash or on any Linux shell; needs no token, no Hetzner account and no R2.
# Task report: Execution/P3/T047-on-demand-cax41.md.
#
#   bash infra/hetzner/cax41/verify.sh
#
# What it proves:
#   1. every script parses (bash -n), cost.py compiles and its arithmetic holds
#   2. the jobs table is complete and every job has a script
#   3. the user data renders for every job, stays under Hetzner's 32 KiB, keeps
#      no placeholder, validates against the cloud-init schema, and its boot
#      script parses
#   4. spawn.sh --dry-run prints create, wait, promote, delete and the sweep,
#      in that order, for every job
#   5. every job script's dry run, and worker.sh's, exits as designed (the two
#      stubs exit 3)
#   6. the delete happens on every failure path, with fake hcloud and rclone
#      binaries first in PATH: a wait whose API calls fail, SIGTERM mid-wait,
#      the ceiling, a failed create, a delete that is never confirmed, the
#      rescore hold, the ok path with its promotion, and the sweep
#   7. optionally, every hcloud command spawn.sh prints is parsed by a real
#      hcloud binary pointed at a dead endpoint (flag errors versus
#      connection errors)
#
# Optional environment:
#   CARTA_VERIFY_PYTHON  python with PyYAML and jsonschema (default: python3,
#                        then python)
#   CARTA_CI_SCHEMA      path to cloudinit/config/schemas/schema-cloud-config-v1.json
#                        from the cloud-init 25.2 source tarball; without it
#                        the schema check is SKIPPED, not passed
#   CARTA_HCLOUD_BIN     a real hcloud binary for check 7; SKIPPED without it
#
# Exit 0 when nothing failed. Skips are printed and do not fail the run.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
JOBS="$REPO/infra/hetzner/jobs"
. "$JOBS/jobs_lib.sh"

fails=0; passes=0; skips=0
pass() { printf 'PASS  %s\n' "$*"; passes=$((passes + 1)); }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails + 1)); }
skip() { printf 'SKIP  %s\n' "$*"; skips=$((skips + 1)); }

T="$(mktemp -d "${TMPDIR:-/tmp}/carta-cax41-verify.XXXXXX")"
trap 'rm -rf "$T"' EXIT

PY="${CARTA_VERIFY_PYTHON:-}"
if [ -z "$PY" ]; then
  for c in python3 python; do
    if "$c" -c 'import sys' >/dev/null 2>&1; then PY="$c"; break; fi
  done
fi
[ -n "$PY" ] || { echo "no working python3 or python on PATH"; exit 1; }
export CARTA_PYTHON="$PY"
# Never read a real secrets file during the checks.
export CARTA_ENV_FILE="$T/no-env"
unset HCLOUD_TOKEN RCLONE_CONFIG_R2_ENDPOINT RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY 2>/dev/null || true

echo "== 1. syntax and arithmetic"
for f in "$HERE"/*.sh "$JOBS"/*.sh; do
  if bash -n "$f" 2>"$T/err"; then pass "bash -n ${f#"$REPO"/}"; else fail "bash -n ${f#"$REPO"/}: $(cat "$T/err")"; fi
done
if "$PY" -m py_compile "$HERE/cost.py" 2>"$T/err"; then pass "cost.py compiles"; else fail "cost.py: $(cat "$T/err")"; fi
if "$PY" "$HERE/cost.py" check > "$T/cost.txt" 2>&1; then
  pass "cost.py check: $(grep -c '^PASS' "$T/cost.txt") figures ($(grep -m1 '6 h without' "$T/cost.txt" | sed 's/^PASS  //'); $(grep -m1 '8 h' "$T/cost.txt" | sed 's/^PASS  //'))"
else
  fail "cost.py check:"; sed 's/^/      /' "$T/cost.txt"
fi

echo "== 2. the jobs table"
njobs=0
for j in $(job_names); do
  njobs=$((njobs + 1))
  job_row "$j"
  [ -f "$JOBS/$j.sh" ] && pass "job $j has jobs/$j.sh" || fail "job $j has no jobs/$j.sh"
  if awk -v c="$JOB_CEILING_H" -v e="$JOB_EXPECTED_H" 'BEGIN { exit !(c > 0 && e > 0 && e <= c) }'; then
    pass "job $j: expected ${JOB_EXPECTED_H} h within ceiling ${JOB_CEILING_H} h"
  else
    fail "job $j: ceiling '$JOB_CEILING_H' or expected '$JOB_EXPECTED_H' is not a sane pair"
  fi
done
[ "$njobs" -ge 5 ] && pass "$njobs jobs in the table" || fail "only $njobs jobs in the table"
grep -q $'\r' "$JOBS/jobs.tsv" && fail "jobs.tsv has CR bytes" || pass "jobs.tsv is LF"

# Arguments each job gets in the checks below.
args_for() {
  case "$1" in
    valhalla_tiles|planetiler) echo switzerland ;;
    clip_sweep) echo beaches ;;
    *) echo "" ;;
  esac
}

echo "== 3. user data"
cat > "$T/ci_check.py" <<'PYEOF'
import json, sys
import yaml
path, schema_path, boot_out = sys.argv[1], sys.argv[2], sys.argv[3]
raw = open(path, encoding="utf-8").read()
if not raw.startswith("#cloud-config\n"):
    print("missing #cloud-config header"); sys.exit(1)
cfg = yaml.safe_load(raw)
boot = [w["content"] for w in cfg.get("write_files", []) if w["path"] == "/usr/local/sbin/carta-worker-boot"]
if boot:
    open(boot_out, "w", newline="\n").write(boot[0])
if schema_path == "-":
    print("yaml ok; schema not checked"); sys.exit(0)
import jsonschema
schema = json.load(open(schema_path, encoding="utf-8"))
errs = sorted(jsonschema.Draft4Validator(schema).iter_errors(cfg), key=lambda e: list(e.path))
for e in errs:
    print("SCHEMA ERROR", "/".join(map(str, e.path)), e.message[:200])
print(f"{len(errs)} schema errors")
sys.exit(1 if errs else 0)
PYEOF
SCHEMA="${CARTA_CI_SCHEMA:--}"
if [ "$SCHEMA" = "-" ]; then
  skip "cloud-init schema: set CARTA_CI_SCHEMA to cloud-init 25.2's schema-cloud-config-v1.json (YAML is still parsed)"
elif [ ! -f "$SCHEMA" ]; then
  fail "CARTA_CI_SCHEMA=$SCHEMA does not exist"; SCHEMA="-"
fi
if "$PY" -c 'import yaml' 2>/dev/null; then
  if "$PY" "$T/ci_check.py" "$HERE/cloud-init.yaml" "$SCHEMA" "$T/raw.boot.sh" > "$T/ci.txt" 2>&1; then
    pass "raw cloud-init.yaml: $(tail -n 1 "$T/ci.txt")"
  else
    fail "raw cloud-init.yaml:"; sed 's/^/      /' "$T/ci.txt"
  fi
  for j in $(job_names); do
    out="$T/ud-$j.yaml"
    # shellcheck disable=SC2046
    if bash "$HERE/spawn.sh" --render "$out" "$j" $(args_for "$j") > "$T/r.txt" 2>&1; then
      size=$(wc -c < "$out" | tr -d ' ')
      if "$PY" "$T/ci_check.py" "$out" "$SCHEMA" "$out.boot.sh" > "$T/ci.txt" 2>&1; then
        pass "user data for $j: $size bytes (limit 32768), $(tail -n 1 "$T/ci.txt")"
      else
        fail "user data for $j:"; sed 's/^/      /' "$T/ci.txt"
      fi
      grep -q '@@[A-Z0-9_]*@@' "$out" && fail "user data for $j keeps a placeholder" || true
      grep -q $'\r' "$out" && fail "user data for $j has CR bytes" || true
      if [ -f "$out.boot.sh" ]; then
        if bash -n "$out.boot.sh" 2>"$T/err"; then pass "carta-worker-boot for $j parses"; else fail "carta-worker-boot for $j: $(cat "$T/err")"; fi
      else
        fail "no carta-worker-boot in the user data for $j"
      fi
      grep -q "CARTA_JOB='$j'" "$out" && pass "user data for $j names the job" || fail "user data for $j does not name the job"
      grep -q "REDACTED" "$out" && pass "user data for $j carries no real secret (redacted render)" || fail "render for $j was not redacted"
    else
      fail "spawn.sh --render $j:"; sed 's/^/      /' "$T/r.txt"
    fi
  done
else
  fail "$PY has no PyYAML (set CARTA_VERIFY_PYTHON)"
fi
# The CRLF trap T046 found: a CRLF template must still render LF.
tr -d '\r' < "$HERE/cloud-init.yaml" | sed 's/$/\r/' > "$T/crlf.yaml"
cp "$HERE/spawn.sh" "$T/spawn-crlf.sh"
sed -i "s#^CLOUD_INIT=.*#CLOUD_INIT=\"$T/crlf.yaml\"#; s#^HERE=.*#HERE=\"$HERE\"#; s#^REPO=.*#REPO=\"$REPO\"#" "$T/spawn-crlf.sh"
if bash "$T/spawn-crlf.sh" --render "$T/ud-crlf.yaml" selftest >/dev/null 2>&1 && ! grep -q $'\r' "$T/ud-crlf.yaml"; then
  pass "a CRLF template renders to LF user data"
else
  fail "a CRLF template leaks CR into the user data"
fi

echo "== 4. spawn.sh --dry-run, per job"
export CARTA_STATE_DIR="$T/state" CARTA_CACHE_DIR="$T/cache" TMPDIR="$T"
mkdir -p "$T/state" "$T/cache"
# line number of the first line matching a pattern, or 0
at() { grep -n -m1 -- "$1" "$2" | cut -d: -f1 || true; }
for j in $(job_names); do
  log="$T/dry-$j.txt"
  # shellcheck disable=SC2046
  bash "$HERE/spawn.sh" --dry-run "$j" $(args_for "$j") > "$log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "dry run $j exited $rc"; sed 's/^/      /' "$log" | tail -n 5; continue; }
  c=$(at '^+ hcloud server create' "$log"); w=$(at '^+ rclone cat r2:carta/archive/runs/' "$log")
  p=$(at '/out r2:carta/' "$log"); d=$(at '^+ hcloud server delete carta-worker-' "$log")
  s=$(at '^+ hcloud server list --selector role=worker' "$log")
  if [ -n "$c" ] && [ -n "$w" ] && [ -n "$p" ] && [ -n "$d" ] && [ -n "$s" ] && [ "$c" -lt "$w" ] && [ "$w" -lt "$p" ] && [ "$p" -lt "$d" ] && [ "$d" -lt "$s" ]; then
    pass "dry run $j: create (line $c) < wait ($w) < promote ($p) < delete ($d) < sweep ($s)"
  else
    fail "dry run $j: order create=$c wait=$w promote=$p delete=$d sweep=$s"
  fi
  grep -q -- '--label role=worker' "$log" && grep -q -- "--label job=$j" "$log" && grep -q -- '--label run=' "$log" \
    && pass "dry run $j: labels role, job, run" || fail "dry run $j: labels missing"
  grep -q -- '--without-ipv4' "$log" && fail "dry run $j: IPv4 is off by default" || pass "dry run $j: IPv4 on by default"
done
bash "$HERE/spawn.sh" --dry-run --no-ipv4 selftest > "$T/dry-v6.txt" 2>&1
grep -q -- '--without-ipv4' "$T/dry-v6.txt" && grep -q 'github.com has no IPv6' "$T/dry-v6.txt" \
  && pass "--no-ipv4 adds --without-ipv4 and warns about GitHub" || fail "--no-ipv4 handling"
bash "$HERE/spawn.sh" --dry-run --keep selftest > "$T/dry-keep.txt" 2>&1
grep -q -- '--keep IS ON' "$T/dry-keep.txt" && ! grep -q '^+ hcloud server delete carta-worker' "$T/dry-keep.txt" \
  && grep -q -- '--label keep=1' "$T/dry-keep.txt" \
  && pass "--keep is loud, labels keep=1 and skips the delete" || fail "--keep handling"
bash "$HERE/spawn.sh" --dry-run no_such_job > "$T/dry-bad.txt" 2>&1
[ $? -eq 2 ] && pass "unknown job exits 2" || fail "unknown job did not exit 2"
bash "$HERE/spawn.sh" --dry-run valhalla_tiles 'x;rm' > "$T/dry-bad.txt" 2>&1
[ $? -eq 2 ] && pass "an unsafe job argument exits 2" || fail "an unsafe job argument was accepted"

echo "== 5. job scripts and worker.sh, dry"
for j in $(job_names); do
  want=0; case "$j" in planetiler|image_transcode) want=3 ;; esac
  # shellcheck disable=SC2046
  CARTA_JOB_DRY_RUN=1 CARTA_IN="$T/in" CARTA_OUT="$T/out" CARTA_WORK="$T/work" CARTA_REPO="$REPO" \
    bash "$JOBS/$j.sh" $(args_for "$j") > "$T/job-$j.txt" 2>&1
  rc=$?
  [ "$rc" -eq "$want" ] && pass "jobs/$j.sh dry run exits $rc" || { fail "jobs/$j.sh dry run exited $rc, expected $want"; tail -n 3 "$T/job-$j.txt" | sed 's/^/      /'; }
done
grep -q 'serve_tiles=False' "$T/job-valhalla_tiles.txt" && grep -q 'server_threads=' "$T/job-valhalla_tiles.txt" \
  && pass "valhalla_tiles builds without serving, with every core" || fail "valhalla_tiles docker flags"
grep -q 'pipeline/photos/rescore.py beaches' "$T/job-clip_sweep.txt" && grep -q 'pack.py --only beaches-cache' "$T/job-clip_sweep.txt" \
  && pass "clip_sweep rescores, then packs in T045's format" || fail "clip_sweep commands"
# The tarball-carried hold: a layer packed mid-rebuild is refused with 5.
mkdir -p "$T/holdrepo/cache/beaches" "$T/holdin"
echo "test rebuild" > "$T/holdrepo/cache/beaches/.rescore_hold"
for t in photo-support photo-embeddings beaches-cache; do tar -czf "$T/holdin/$t.tar.gz" -C "$T" state >/dev/null 2>&1; done
CARTA_IN="$T/holdin" CARTA_OUT="$T/holdout" CARTA_WORK="$T/work" CARTA_REPO="$T/holdrepo" CARTA_PY=false \
  bash "$JOBS/clip_sweep.sh" beaches > "$T/job-hold.txt" 2>&1
[ $? -eq 5 ] && pass "clip_sweep refuses a layer whose tarball carries .rescore_hold (exit 5)" || { fail "clip_sweep ignored the hold"; tail -n 3 "$T/job-hold.txt"; }
CARTA_DRY_RUN=1 CARTA_WORKER_ROOT="$T/w" bash "$JOBS/worker.sh" clip_sweep 20260101t000000z-test beaches > "$T/worker.txt" 2>&1
rc=$?
if [ "$rc" -eq 0 ] && grep -q '"state": "ok"' "$T/worker.txt" && grep -q 'requirements-torch-cpu.txt' "$T/worker.txt" \
   && grep -q -- '--include beaches-cache.tar.gz' "$T/worker.txt" && grep -q 'archive/runs/20260101t000000z-test/out' "$T/worker.txt"; then
  pass "worker.sh dry run: setup, inputs by include, job, push to the run prefix, status ok"
else
  fail "worker.sh dry run (exit $rc)"; tail -n 5 "$T/worker.txt" | sed 's/^/      /'
fi
CARTA_DRY_RUN=1 CARTA_WORKER_ROOT="$T/w" bash "$JOBS/worker.sh" planetiler 20260101t000000z-test switzerland > "$T/worker3.txt" 2>&1
rc=$?
[ "$rc" -eq 3 ] && grep -q '"state": "failed", "phase": "job", "exit_code": 3' "$T/worker3.txt" \
  && pass "worker.sh reports a stub as failed in phase job with exit 3" || fail "worker.sh stub status (exit $rc)"

echo "== 6. the delete on every path (fake hcloud and rclone in PATH)"
BIN="$T/bin"; SHIM="$T/shim"; mkdir -p "$BIN" "$SHIM"
cat > "$BIN/hcloud" <<'SHIMEOF'
#!/usr/bin/env bash
# Fake hcloud for verify.sh. State lives in $SHIM_DIR; every call is logged.
echo "hcloud $*" >> "$SHIM_DIR/calls"
fmt=""; for a in "$@"; do case "$a" in format=*) fmt="${a#format=}" ;; esac; done
is_deleted() { grep -qx "$1" "$SHIM_DIR/deleted" 2>/dev/null; }
case "$1 $2" in
  "server create")
    name=""; prev=""; for a in "$@"; do [ "$prev" = "--name" ] && name="$a"; prev="$a"; done
    echo "$name|run|job|0|9999999999|0|running" >> "$SHIM_DIR/fleet"
    if [ "${SHIM_CREATE_FAIL:-0}" = 1 ]; then echo "hcloud: context deadline exceeded" >&2; exit 1; fi
    echo "Server 4242 created"; exit 0 ;;
  "server describe")
    name="$3"
    if is_deleted "$name"; then echo "hcloud: server not found: $name" >&2; exit 1; fi
    case "$fmt" in
      *Location.Name*) echo fsn1; exit 0 ;;
      *Labels*)
        line="$(grep "^$name|" "$SHIM_DIR/fleet" | tail -n 1)"
        [ -n "$line" ] || { echo "hcloud: server not found: $name" >&2; exit 1; }
        IFS='|' read -r n run job created deadline keep status <<< "$line"
        echo "$run|$job|$created|$deadline|$keep|$status|$created"; exit 0 ;;
      *)
        if [ "${SHIM_UNDELETABLE:-0}" = 1 ]; then echo running; exit 0; fi
        if [ "${SHIM_DESCRIBE_FAIL:-0}" = 1 ]; then echo "hcloud: server error (service_error, 503)" >&2; exit 1; fi
        if [ -z "$fmt" ] && ! grep -q "^$name|" "$SHIM_DIR/fleet" 2>/dev/null; then echo "hcloud: server not found: $name" >&2; exit 1; fi
        echo "${SHIM_STATUS:-running}"; exit 0 ;;
    esac ;;
  "server delete")
    [ "${SHIM_UNDELETABLE:-0}" = 1 ] && { echo "Server $3 deleted"; exit 0; }
    echo "$3" >> "$SHIM_DIR/deleted"; echo "Server $3 deleted"; exit 0 ;;
  "server list")
    [ -f "$SHIM_DIR/fleet" ] || exit 0
    cut -d'|' -f1 "$SHIM_DIR/fleet" | sort -u | while read -r n; do is_deleted "$n" || echo "$n"; done
    exit 0 ;;
esac
echo "fake hcloud: unhandled: $*" >&2; exit 1
SHIMEOF
cat > "$BIN/rclone" <<'SHIMEOF'
#!/usr/bin/env bash
echo "rclone $*" >> "$SHIM_DIR/calls"
case "$1" in
  cat) if [ -f "$SHIM_DIR/status.json" ]; then cat "$SHIM_DIR/status.json"; exit 0; fi
       echo "ERROR : object not found" >&2; exit 3 ;;
  rcat) cat > /dev/null; exit 0 ;;
  copy|copyto) exit 0 ;;
esac
exit 0
SHIMEOF
chmod +x "$BIN/hcloud" "$BIN/rclone"

# One scenario: a fresh shim state and a fresh state dir, spawn.sh for real.
scenario() {  # name, then env assignments, then -- spawn args
  local name="$1"; shift
  rm -rf "$SHIM" "$T/state"; mkdir -p "$SHIM" "$T/state"
  local envs=()
  while [ "$1" != "--" ]; do envs+=("$1"); shift; done; shift
  env PATH="$BIN:$PATH" SHIM_DIR="$SHIM" HCLOUD_TOKEN=dummy \
    RCLONE_CONFIG_R2_ENDPOINT=https://example.invalid RCLONE_CONFIG_R2_ACCESS_KEY_ID=k RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=s \
    CARTA_POLL_S=1 CARTA_DELETE_RETRY_S=0 CARTA_LOCATION=fsn1 ${envs[@]+"${envs[@]}"} \
    bash "$HERE/spawn.sh" "$@" > "$T/sc-$name.txt" 2>&1
  SC_RC=$?
}
created_then_deleted() {  # the create line comes before a delete of the same name
  local c d
  c=$(grep -n -m1 '^hcloud server create' "$SHIM/calls" | cut -d: -f1)
  d=$(grep -n -m1 '^hcloud server delete carta-worker-' "$SHIM/calls" | cut -d: -f1)
  [ -n "$c" ] && [ -n "$d" ] && [ "$c" -lt "$d" ]
}
ledger_outcome() { tail -n 1 "$T/state/cax41_runs.tsv" 2>/dev/null | cut -f11; }

# 6a. The important one: the server is created, then the wait fails because
# every describe errors. The delete must still be issued.
scenario wait-fails SHIM_DESCRIBE_FAIL=1 -- selftest
if created_then_deleted && [ "$SC_RC" -eq 1 ] && [ "$(ledger_outcome)" = "api-error" ]; then
  pass "wait fails after create: delete issued, exit 1, ledger outcome api-error"
else
  fail "wait fails after create: rc=$SC_RC outcome=$(ledger_outcome)"; tail -n 8 "$T/sc-wait-fails.txt" | sed 's/^/      /'
fi

# 6b. SIGTERM while waiting.
rm -rf "$SHIM" "$T/state"; mkdir -p "$SHIM" "$T/state"
echo '{"run": "x", "state": "started", "phase": "job", "exit_code": null}' > "$SHIM/status.json"
env PATH="$BIN:$PATH" SHIM_DIR="$SHIM" HCLOUD_TOKEN=dummy RCLONE_CONFIG_R2_ENDPOINT=https://example.invalid \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID=k RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=s CARTA_POLL_S=5 CARTA_LOCATION=fsn1 \
  bash "$HERE/spawn.sh" selftest > "$T/sc-term.txt" 2>&1 &
spid=$!
for _ in $(seq 1 50); do grep -q '^rclone cat' "$SHIM/calls" 2>/dev/null && break; sleep 0.2; done
kill -TERM "$spid" 2>/dev/null
wait "$spid"; SC_RC=$?
if created_then_deleted && [ "$SC_RC" -eq 143 ] && [ "$(ledger_outcome)" = "terminated" ]; then
  pass "SIGTERM mid-wait: delete issued, exit 143, ledger outcome terminated"
else
  fail "SIGTERM mid-wait: rc=$SC_RC outcome=$(ledger_outcome)"; tail -n 8 "$T/sc-term.txt" | sed 's/^/      /'
fi

# 6c. The ceiling: a job that never finishes.
scenario ceiling CARTA_CEILING_S=3 -- selftest
if created_then_deleted && [ "$SC_RC" -eq 1 ] && [ "$(ledger_outcome)" = "timeout" ]; then
  pass "ceiling reached: delete issued, ledger outcome timeout"
else
  fail "ceiling: rc=$SC_RC outcome=$(ledger_outcome)"; tail -n 8 "$T/sc-ceiling.txt" | sed 's/^/      /'
fi

# 6d. create returns an error but may have made the server anyway.
scenario create-fails SHIM_CREATE_FAIL=1 -- selftest
if created_then_deleted && [ "$SC_RC" -eq 1 ] && [ "$(ledger_outcome)" = "create-failed" ]; then
  pass "create errors: delete by name still issued"
else
  fail "create errors: rc=$SC_RC outcome=$(ledger_outcome)"; tail -n 8 "$T/sc-create-fails.txt" | sed 's/^/      /'
fi

# 6e. A delete that never takes: exit 7 and a loud message.
scenario undeletable SHIM_UNDELETABLE=1 CARTA_CEILING_S=2 -- selftest
if [ "$SC_RC" -eq 7 ] && grep -q 'could NOT be confirmed deleted' "$T/sc-undeletable.txt" \
   && [ "$(grep -c '^hcloud server delete carta-worker-' "$SHIM/calls")" -ge 3 ]; then
  pass "unconfirmed delete: 3 attempts, exit 7, loud warning, ledger says NOT-DELETED"
else
  fail "unconfirmed delete: rc=$SC_RC"; tail -n 8 "$T/sc-undeletable.txt" | sed 's/^/      /'
fi

# 6f. The ok path: promote, then delete, exit 0, a costed ledger row.
rm -rf "$SHIM"; mkdir -p "$SHIM"
scenario_ok() {
  rm -rf "$T/state"; mkdir -p "$SHIM" "$T/state"
  echo '{"run": "x", "job": "selftest", "state": "ok", "phase": "done", "exit_code": 0}' > "$SHIM/status.json"
  env PATH="$BIN:$PATH" SHIM_DIR="$SHIM" HCLOUD_TOKEN=dummy RCLONE_CONFIG_R2_ENDPOINT=https://example.invalid \
    RCLONE_CONFIG_R2_ACCESS_KEY_ID=k RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=s CARTA_POLL_S=1 CARTA_LOCATION=fsn1 \
    bash "$HERE/spawn.sh" "$@" > "$T/sc-ok.txt" 2>&1
  SC_RC=$?
}
scenario_ok selftest
p=$(grep -n -m1 '^rclone copy r2:carta/archive/runs/.*/out r2:carta/archive/built/selftest' "$SHIM/calls" | cut -d: -f1)
d=$(grep -n -m1 '^hcloud server delete carta-worker-' "$SHIM/calls" | cut -d: -f1)
row="$(tail -n 1 "$T/state/cax41_runs.tsv" 2>/dev/null)"
if [ "$SC_RC" -eq 0 ] && [ -n "$p" ] && [ -n "$d" ] && [ "$p" -lt "$d" ] && [ "$(echo "$row" | cut -f11)" = "ok" ] \
   && [ -n "$(echo "$row" | cut -f9)" ] && grep -q '^rclone copyto .*cax41_runs.tsv r2:carta/archive/logs/cax41_runs.tsv' "$SHIM/calls"; then
  pass "ok path: promote before delete, exit 0, ledger row with cost EUR $(echo "$row" | cut -f9), ledger pushed"
else
  fail "ok path: rc=$SC_RC promote=$p delete=$d row=$row"; tail -n 8 "$T/sc-ok.txt" | sed 's/^/      /'
fi

# 6g. The hold: a held layer is refused before anything is created.
rm -rf "$SHIM" "$T/cache"; mkdir -p "$SHIM" "$T/cache/beaches"
echo "a test rebuild" > "$T/cache/beaches/.rescore_hold"
scenario_ok clip_sweep beaches
if [ "$SC_RC" -eq 5 ] && ! grep -q '^hcloud server create' "$SHIM/calls" 2>/dev/null; then
  pass "held layer: exit 5, no server created"
else
  fail "held layer: rc=$SC_RC"; tail -n 5 "$T/sc-ok.txt" | sed 's/^/      /'
fi
rm -f "$T/cache/beaches/.rescore_hold"
# ...and an unheld one writes .rescore_running for the run and removes it after.
cat > "$BIN/hcloud-wrap" <<'SHIMEOF'
#!/usr/bin/env bash
[ "$1 $2" = "server create" ] && ls "$CARTA_CACHE_DIR"/beaches/ -a >> "$SHIM_DIR/marker-seen"
exec "$(dirname "$0")/hcloud.real" "$@"
SHIMEOF
mv "$BIN/hcloud" "$BIN/hcloud.real"; mv "$BIN/hcloud-wrap" "$BIN/hcloud"; chmod +x "$BIN/hcloud"
rm -rf "$SHIM"; scenario_ok clip_sweep beaches
if [ "$SC_RC" -eq 0 ] && grep -q '.rescore_running' "$SHIM/marker-seen" 2>/dev/null && [ ! -e "$T/cache/beaches/.rescore_running" ] \
   && grep -q '^rclone copy r2:carta/archive/runs/.*/out r2:carta/archive/caches' "$SHIM/calls"; then
  pass "clip_sweep: .rescore_running present during the run, gone after, outputs promoted to archive/caches"
else
  fail "clip_sweep marker/promotion: rc=$SC_RC"; tail -n 5 "$T/sc-ok.txt" | sed 's/^/      /'
fi
mv "$BIN/hcloud.real" "$BIN/hcloud"

# 6h. The sweep: a stray past its deadline goes, a young worker stays, a
# finished (off) one with no owner goes.
rm -rf "$SHIM" "$T/state"; mkdir -p "$SHIM" "$T/state"
now=$(date +%s)
{
  echo "carta-worker-selftest-stray|r1|selftest|$((now - 90000))|$((now - 3600))|0|running"
  echo "carta-worker-selftest-young|r2|selftest|$((now - 60))|$((now + 3600))|0|running"
  echo "carta-worker-selftest-done|r3|selftest|$((now - 600))|$((now + 3000))|0|off"
  echo "carta-worker-selftest-kept|r4|selftest|$((now - 600))|$((now + 3000))|1|off"
} > "$SHIM/fleet"
env PATH="$BIN:$PATH" SHIM_DIR="$SHIM" HCLOUD_TOKEN=dummy CARTA_STATE_DIR="$T/state" bash "$HERE/spawn.sh" --sweep > "$T/sc-sweep.txt" 2>&1
SC_RC=$?
del="$(sort "$SHIM/deleted" 2>/dev/null | tr '\n' ' ')"
if [ "$SC_RC" -eq 0 ] && [ "$del" = "carta-worker-selftest-done carta-worker-selftest-stray " ] \
   && [ "$(grep -c 'swept' "$T/state/cax41_runs.tsv")" -eq 2 ]; then
  pass "sweep: deleted the stray past its deadline and the finished one; left the young and the kept; 2 ledger rows"
else
  fail "sweep: rc=$SC_RC deleted='$del'"; tail -n 8 "$T/sc-sweep.txt" | sed 's/^/      /'
fi

echo "== 7. hcloud flag parsing against a dead endpoint"
if [ -n "${CARTA_HCLOUD_BIN:-}" ] && [ -x "$CARTA_HCLOUD_BIN" ]; then
  "$CARTA_HCLOUD_BIN" version
  bash "$HERE/spawn.sh" --dry-run selftest > "$T/dry-flags.txt" 2>&1
  bash "$HERE/spawn.sh" --dry-run --no-ipv4 --keep valhalla_tiles switzerland >> "$T/dry-flags.txt" 2>&1
  grep '^+ hcloud ' "$T/dry-flags.txt" | sed 's/^+ hcloud //' | sort -u > "$T/hc-cmds.txt"
  while IFS= read -r cmd; do
    out="$(eval "HCLOUD_TOKEN=dummy \"\$CARTA_HCLOUD_BIN\" --endpoint http://127.0.0.1:9 $cmd" 2>&1)"
    short="$(echo "$cmd" | cut -c1-70)"
    if echo "$out" | grep -qiE 'unknown (flag|shorthand|command)|invalid argument|requires .* arg|accepts .* arg|flag needs'; then
      fail "hcloud rejects: $short: $(echo "$out" | head -n 1)"
    elif echo "$out" | grep -qiE 'connection refused|connectex|dial tcp|actively refused'; then
      pass "hcloud parses: $short (then fails to connect, as it should)"
    else
      fail "hcloud gave neither a flag error nor a connection error: $short: $(echo "$out" | head -n 1)"
    fi
  done < "$T/hc-cmds.txt"
else
  skip "set CARTA_HCLOUD_BIN to an hcloud binary to parse every printed command against a dead endpoint"
fi

echo "== 8. hcloud output templates against a fake API"
# A dead endpoint proves the flags parse, not that a -o format template names
# real fields. Here the real binary talks to a local stand-in for the Hetzner
# API that answers with server objects shaped like the API reference, so the
# templates spawn.sh relies on are executed for real. This caught
# {{.Datacenter.Location.Name}}: hcloud 1.69's Server has no Datacenter field.
if [ -n "${CARTA_HCLOUD_BIN:-}" ] && [ -x "$CARTA_HCLOUD_BIN" ]; then
  cat > "$T/fakeapi.py" <<'PYEOF'
import json, sys, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
LOC = {"id": 1, "name": "fsn1", "description": "Falkenstein DC Park 1", "country": "DE", "city": "Falkenstein",
       "latitude": 50.47612, "longitude": 12.370071, "network_zone": "eu-central"}
def server(i, name, labels, status):
    return {"id": i, "name": name, "status": status, "created": "2026-09-27T10:00:00+00:00",
            "public_net": {"ipv4": {"id": 1, "ip": "203.0.113.5", "blocked": False, "dns_ptr": ""},
                           "ipv6": {"id": 2, "ip": "2001:db8::/64", "blocked": False, "dns_ptr": []},
                           "floating_ips": [], "firewalls": []},
            "private_net": [], "server_type": {"id": 45, "name": "cax41", "description": "CAX41", "cores": 16,
            "memory": 32, "disk": 320, "storage_type": "local", "cpu_type": "shared", "architecture": "arm",
            "prices": [], "deprecated": False},
            "datacenter": {"id": 4, "name": "fsn1-dc14", "description": "DC14", "location": LOC,
                           "server_types": {"supported": [], "available": [], "available_for_migration": []}},
            "location": LOC, "image": None, "iso": None, "rescue_enabled": False, "locked": False,
            "backup_window": None, "outgoing_traffic": 0, "ingoing_traffic": 0, "included_traffic": 0,
            "protection": {"delete": False, "rebuild": False}, "labels": labels, "volumes": [],
            "load_balancers": [], "primary_disk_size": 320, "placement_group": None}
SERVERS = {
    "carta-orchestrator": server(1, "carta-orchestrator", {"role": "orchestrator"}, "running"),
    "carta-worker-selftest-x": server(2, "carta-worker-selftest-x", {"role": "worker", "job": "selftest", "run": "r1",
                                      "created": "1790500000", "deadline": "1790503600", "keep": "0"}, "off"),
    "carta-worker-bare": server(3, "carta-worker-bare", {"role": "worker"}, "running"),
}
ACTION = {"action": {"id": 9, "command": "delete_server", "status": "success", "progress": 100,
                     "started": "2026-09-27T10:00:00+00:00", "finished": "2026-09-27T10:00:01+00:00",
                     "resources": [], "error": None}}
class H(BaseHTTPRequestHandler):
    def send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a):
        pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        if u.path.endswith("/servers"):
            if "name" in q:
                lst = [SERVERS[q["name"][0]]] if q["name"][0] in SERVERS else []
            else:
                lst = [s for s in SERVERS.values() if s["labels"].get("role") == "worker"]
            return self.send(200, {"servers": lst, "meta": {"pagination": {"page": 1, "per_page": 50,
                             "previous_page": None, "next_page": None, "last_page": 1, "total_entries": len(lst)}}})
        if "/actions/" in u.path:
            return self.send(200, ACTION)
        self.send(404, {"error": {"code": "not_found", "message": "not found"}})
    def do_DELETE(self):
        sid = int(self.path.rstrip("/").rsplit("/", 1)[1])
        for k, v in list(SERVERS.items()):
            if v["id"] == sid:
                del SERVERS[k]
        self.send(200, ACTION)
srv = HTTPServer(("127.0.0.1", 0), H)
open(sys.argv[1], "w").write(str(srv.server_address[1]))
srv.serve_forever()
PYEOF
  rm -f "$T/fakeapi.port"
  "$PY" "$T/fakeapi.py" "$T/fakeapi.port" &
  fpid=$!
  for _ in $(seq 1 50); do [ -s "$T/fakeapi.port" ] && break; sleep 0.2; done
  EP="http://127.0.0.1:$(cat "$T/fakeapi.port" 2>/dev/null)"
  hc() { HCLOUD_TOKEN=dummy "$CARTA_HCLOUD_BIN" --endpoint "$EP" "$@" 2>&1; }
  LBL='format={{index .Labels "run"}}|{{index .Labels "job"}}|{{index .Labels "created"}}|{{index .Labels "deadline"}}|{{index .Labels "keep"}}|{{.Status}}|{{.Created.Unix}}'
  out="$(hc server describe carta-orchestrator -o 'format={{.Location.Name}}')"
  [ "$out" = "fsn1" ] && pass "location template: $out" || fail "location template: $out"
  out="$(hc server describe carta-worker-selftest-x -o 'format={{.Status}}')"
  [ "$out" = "off" ] && pass "status template: $out" || fail "status template: $out"
  out="$(hc server describe carta-worker-selftest-x -o "$LBL")"
  [ "$out" = "r1|selftest|1790500000|1790503600|0|off|1790503200" ] && pass "sweep template: $out" || fail "sweep template: $out"
  out="$(hc server describe carta-worker-bare -o "$LBL")"
  [ "$out" = "|||||running|1790503200" ] && pass "sweep template, no labels: '$out' (the | keeps the fields apart)" || fail "sweep template, no labels: $out"
  out="$(hc server list --selector role=worker -o noheader -o columns=name | tr '\n' ' ')"
  [ "$out" = "carta-worker-selftest-x carta-worker-bare " ] && pass "worker list: $out" || fail "worker list: $out"
  hc server delete carta-worker-selftest-x > "$T/del.txt"
  out="$(hc server describe carta-worker-selftest-x -o 'format={{.Status}}')"; rc=$?
  if [ "$rc" -ne 0 ] && echo "$out" | grep -qi 'not found'; then
    pass "after delete, describe fails with '$out', which delete_worker reads as gone"
  else
    fail "after delete: rc=$rc $out"
  fi
  kill "$fpid" 2>/dev/null; wait "$fpid" 2>/dev/null
else
  skip "set CARTA_HCLOUD_BIN to run the output templates against a fake API"
fi

echo
echo "$passes passed, $fails failed, $skips skipped"
exit $(( fails > 0 ))
