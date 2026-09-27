#!/usr/bin/env bash
# Check a provisioned Carta orchestrator from the laptop, over SSH.
# Task report: Execution/P3/T046-cax11-orchestrator.md.
#
# Usage:
#   bash infra/hetzner/cax11/verify.sh <host>
#   CARTA_SSH_KEY_FILE=~/.ssh/carta_orchestrator_ed25519 bash infra/hetzner/cax11/verify.sh 2a01:4f8:...::1
#
# <host> is the address `hcloud server ip --ipv6 carta-orchestrator` prints
# (or the IPv4, or a name from ~/.ssh/config). Prints PASS, FAIL or INFO per
# check and exits 1 if any check failed. Read-only on the box.
set -euo pipefail

HOST="${1:-${CARTA_HOST:-}}"
if [ -z "$HOST" ]; then
  echo "usage: verify.sh <host>   (the server's IPv6 or IPv4 address)" >&2
  exit 2
fi
KEY_FILE="${CARTA_SSH_KEY_FILE:-$HOME/.ssh/carta_orchestrator_ed25519}"
SSH_USER="${CARTA_SSH_USER:-carta}"

ssh_opts=(-o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
if [ -f "$KEY_FILE" ]; then ssh_opts+=(-i "$KEY_FILE"); fi

if ! ssh "${ssh_opts[@]}" "$SSH_USER@$HOST" true 2>/dev/null; then
  echo "FAIL  ssh $SSH_USER@$HOST (key $KEY_FILE); nothing else can be checked"
  echo "      IPv6-only box: the laptop needs working IPv6 too (test: curl -6 https://ifconfig.co)"
  exit 1
fi
echo "PASS  ssh $SSH_USER@$HOST"

# Everything below runs on the box. Quoted heredoc: no local expansion.
ssh "${ssh_opts[@]}" "$SSH_USER@$HOST" 'bash -s' <<'REMOTE'
set -uo pipefail
fails=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails + 1)); }
info() { printf 'INFO  %s\n' "$*"; }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$name"; else fail "$name"; fi; }

arch="$(uname -m)"
[ "$arch" = "aarch64" ] && pass "architecture $arch" || fail "architecture is $arch, expected aarch64"

. /etc/os-release 2>/dev/null
[ "${VERSION_ID:-}" = "24.04" ] && pass "Ubuntu ${VERSION_ID}" || fail "OS is ${PRETTY_NAME:-unknown}, expected Ubuntu 24.04"

ci="$(cloud-init status 2>/dev/null | awk '/status:/ {print $2}')"
[ "$ci" = "done" ] && pass "cloud-init status done" || fail "cloud-init status '${ci:-unknown}' (read /var/log/cloud-init-output.log and /var/log/carta-bootstrap.log)"

py="$(python3.12 --version 2>/dev/null)"
case "$py" in "Python 3.12."*) pass "$py" ;; *) fail "python3.12 missing ($py)" ;; esac
if [ -x "$HOME/venv/bin/python" ]; then
  if "$HOME/venv/bin/python" -c "import pandas, sklearn, osmium, shapely, rasterio, geopandas, h3, psycopg, yaml, requests" 2>/dev/null; then
    pass "venv $HOME/venv imports the pipeline's compiled packages"
  else
    fail "venv $HOME/venv exists but a pipeline import fails (run: sudo carta-bootstrap)"
  fi
  if "$HOME/venv/bin/python" -c "import anthropic" 2>/dev/null; then
    fail "the anthropic SDK is installed in the venv; CLAUDE.md forbids it"
  else
    pass "no anthropic SDK in the venv"
  fi
else
  fail "no venv at $HOME/venv"
fi

nv="$(node --version 2>/dev/null)"
case "$nv" in v24.*) pass "node $nv (npm $(npm --version 2>/dev/null))" ;; *) fail "node missing or not v24 (${nv:-none})" ;; esac

hv="$(hcloud version 2>/dev/null)"
[ -n "$hv" ] && pass "$hv" || fail "hcloud not installed"
rv="$(rclone version 2>/dev/null | head -1)"
[ -n "$rv" ] && pass "$rv" || fail "rclone not installed"

check "repo cloned at $HOME/carta" test -d "$HOME/carta/.git"
[ -d "$HOME/carta/.git" ] && info "repo at $(git -C "$HOME/carta" rev-parse --abbrev-ref HEAD 2>/dev/null) $(git -C "$HOME/carta" rev-parse --short HEAD 2>/dev/null)"
if [ -d "$HOME/carta/.git" ]; then
  ptr="$(git -C "$HOME/carta" lfs ls-files 2>/dev/null | grep -c ' - ' || true)"
  [ "${ptr:-0}" -eq 0 ] && pass "Git LFS objects present (no pointer files)" || fail "$ptr Git LFS file(s) are still pointers (run: git -C ~/carta lfs pull)"
fi
check "weekly.sh present in the clone" test -f "$HOME/carta/infra/hetzner/cax11/weekly.sh"

check "carta-weekly.timer enabled" systemctl is-enabled carta-weekly.timer
check "carta-weekly.timer active" systemctl is-active carta-weekly.timer
info "next firing: $(systemctl show carta-weekly.timer -p NextElapseUSecRealtime --value 2>/dev/null)"
last="$(systemctl show carta-weekly.service -p Result --value 2>/dev/null)"
info "last service result: ${last:-unknown}"

log="$HOME/logs/weekly.log"
n=0; [ -f "$log" ] && n="$(grep -c 'cron fired' "$log" || true)"
if [ "${n:-0}" -ge 1 ]; then
  pass "placeholder job fired $n time(s); last: $(tail -n 1 "$log")"
else
  fail "no 'cron fired' line in $log yet (the timer fires 10 min after boot; check: journalctl -u carta-weekly.service)"
fi

envf="$HOME/.config/carta/env"
if [ -f "$envf" ]; then
  mode="$(stat -c %a "$envf")"
  [ "$mode" = "600" ] && pass "env file $envf mode 600" || fail "env file mode is $mode, expected 600"
  total="$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=' "$envf" || true)"
  filled="$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=.+' "$envf" || true)"
  info "env file: $filled of $total variables have a value"
else
  fail "no env file at $envf"
fi

sshd_cfg="$(sudo -n sshd -T 2>/dev/null)"
echo "$sshd_cfg" | grep -qx 'permitrootlogin no' && pass "sshd: root login off" || fail "sshd: root login not off"
echo "$sshd_cfg" | grep -qx 'passwordauthentication no' && pass "sshd: password auth off" || fail "sshd: password auth not off"
sudo -n ufw status 2>/dev/null | grep -q '^Status: active' && pass "ufw active" || fail "ufw not active"
check "unattended-upgrades enabled" systemctl is-enabled unattended-upgrades

avail_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null)"
total_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null)"
avail_mb=$(( ${avail_kb:-0} / 1024 ))
total_mb=$(( ${total_kb:-0} / 1024 ))
if [ "$avail_mb" -ge 2048 ]; then pass "memory: ${avail_mb} MB available of ${total_mb} MB"
else fail "memory: only ${avail_mb} MB available of ${total_mb} MB (expected at least 2048 on an idle CAX11)"; fi
info "disk: $(df -h --output=avail,size / | tail -1 | awk '{print $1" free of "$2}') on /"

if curl -4 -s -o /dev/null -m 10 https://github.com; then info "IPv4 egress: yes"; else info "IPv4 egress: no (IPv6-only; GitHub and several fare APIs unreachable)"; fi
[ -f /var/run/reboot-required ] && info "a reboot is pending for security updates (the box never reboots itself)"

echo
if [ "$fails" -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "$fails CHECK(S) FAILED"; fi
exit $(( fails > 0 ))
REMOTE
