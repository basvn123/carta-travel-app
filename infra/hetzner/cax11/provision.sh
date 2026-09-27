#!/usr/bin/env bash
# Provision the Carta orchestrator on Hetzner Cloud: one CAX11 (Ampere arm64,
# 2 vCPU, 4 GB, 40 GB NVMe, EUR 5.99/mo), Ubuntu 24.04, first boot driven by
# cloud-init.yaml next to this file. Task report:
# Execution/P3/T046-cax11-orchestrator.md. Owner procedure:
# Execution/P3/_OPEN-hetzner.md.
#
# Idempotent. Each resource is looked up by name first and created only when
# absent, so a second run after a partial failure picks up where it stopped
# and a run against a finished project changes nothing.
#
# Usage, from the repo root in Git Bash, WSL or any Linux/macOS shell:
#   bash infra/hetzner/cax11/provision.sh --dry-run    print every command, run none
#   HCLOUD_TOKEN=... bash infra/hetzner/cax11/provision.sh
#   IPV4=1 HCLOUD_TOKEN=... bash infra/hetzner/cax11/provision.sh
#
# Settings (environment, all optional except HCLOUD_TOKEN for a real run):
#   HCLOUD_TOKEN          project API token, Read & Write. Required unless --dry-run.
#   IPV4=1                also give the server a public IPv4 (a small monthly
#                         charge). Default is IPv6-only. Read README.md first:
#                         GitHub and several fare APIs have no IPv6 address.
#   CARTA_LOCATION        fsn1 (default) or nbg1.
#   CARTA_SERVER_NAME     default carta-orchestrator
#   CARTA_SSH_KEY_NAME    name of the key in Hetzner, default carta-orchestrator
#   CARTA_SSH_KEY_FILE    local private key, default ~/.ssh/carta_orchestrator_ed25519
#                         (created with ssh-keygen if absent; .pub is uploaded)
#   CARTA_FIREWALL_NAME   default carta-orchestrator-ssh
#   CARTA_SSH_SOURCES     comma-separated CIDRs allowed to reach port 22,
#                         default 0.0.0.0/0,::/0 (key-only sshd, see cloud-init)
#   CARTA_REPO_URL        default https://github.com/basvn123/carta-travel-app.git
#   CARTA_REPO_BRANCH     default main. The branch must already contain
#                         infra/hetzner/, or the timer has no script to run.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUD_INIT="$HERE/cloud-init.yaml"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg (try --help)" >&2; exit 2 ;;
  esac
done

SERVER_TYPE="cax11"
IMAGE="ubuntu-24.04"
LABEL="role=orchestrator"
IPV4="${IPV4:-0}"
LOCATION="${CARTA_LOCATION:-fsn1}"
SERVER_NAME="${CARTA_SERVER_NAME:-carta-orchestrator}"
KEY_NAME="${CARTA_SSH_KEY_NAME:-carta-orchestrator}"
KEY_FILE="${CARTA_SSH_KEY_FILE:-$HOME/.ssh/carta_orchestrator_ed25519}"
FW_NAME="${CARTA_FIREWALL_NAME:-carta-orchestrator-ssh}"
SSH_SOURCES="${CARTA_SSH_SOURCES:-0.0.0.0/0,::/0}"
REPO_URL="${CARTA_REPO_URL:-https://github.com/basvn123/carta-travel-app.git}"
REPO_BRANCH="${CARTA_REPO_BRANCH:-main}"

case "$LOCATION" in
  fsn1|nbg1) ;;
  *) echo "CARTA_LOCATION must be fsn1 or nbg1 (got '$LOCATION')" >&2; exit 2 ;;
esac
case "$IPV4" in
  0|1) ;;
  *) echo "IPV4 must be 0 or 1 (got '$IPV4')" >&2; exit 2 ;;
esac

say() { printf '%s\n' "$*"; }

# Print a command in copy-pasteable form; run it unless --dry-run.
run() {
  printf '+'; printf ' %q' "$@"; printf '\n'
  if [ "$DRY_RUN" -eq 0 ]; then "$@"; fi
}

# Existence checks talk to the API, so a dry run cannot make them. It
# assumes every resource is absent and prints the full create path.
exists() {
  if [ "$DRY_RUN" -eq 1 ]; then return 1; fi
  "$@" >/dev/null 2>&1
}

if [ "$DRY_RUN" -eq 0 ]; then
  if [ -z "${HCLOUD_TOKEN:-}" ]; then
    echo "HCLOUD_TOKEN is not set. Create a Read & Write API token in the Hetzner" >&2
    echo "Cloud Console (project, Security, API tokens), export it, and re-run." >&2
    echo "Use --dry-run to see the commands without a token." >&2
    exit 1
  fi
  command -v hcloud >/dev/null || { echo "hcloud CLI not on PATH (https://github.com/hetznercloud/cli/releases)" >&2; exit 1; }
  command -v ssh-keygen >/dev/null || { echo "ssh-keygen not on PATH" >&2; exit 1; }
else
  say "# DRY RUN: nothing is created, no token is needed, existence checks are skipped."
  say "# Every command below is what a real run would execute on an empty project."
fi

if [ "$IPV4" -eq 0 ]; then
  say ""
  say "# WARNING: IPv6-only (the default). github.com, be.wizzair.com,"
  say "# apiw.vueling.com, api.volotea.com, services-api.ryanair.com,"
  say "# api.travelpayouts.com and other hosts the pipeline needs publish no IPv6"
  say "# address (checked 2026-09-27). The repo clone and the hcloud download in"
  say "# carta-bootstrap will fail on this box, and three of the four carriers"
  say "# would drop out of the fare harvest. Re-run with IPV4=1 unless that has"
  say "# been solved another way. See infra/hetzner/README.md."
  say ""
fi

# 1. Local SSH key pair ------------------------------------------------------
if [ -f "$KEY_FILE" ]; then
  say "# ssh key: $KEY_FILE exists, reused"
else
  run mkdir -p "$(dirname "$KEY_FILE")"
  run ssh-keygen -t ed25519 -N "" -C "carta-orchestrator" -f "$KEY_FILE"
fi
PUB_FILE="$KEY_FILE.pub"

# 2. The key in Hetzner ------------------------------------------------------
if exists hcloud ssh-key describe "$KEY_NAME"; then
  say "# hcloud ssh-key '$KEY_NAME' exists, reused"
else
  run hcloud ssh-key create --name "$KEY_NAME" --public-key-from-file "$PUB_FILE" --label "$LABEL"
fi

# 3. Firewall: SSH in, nothing else; outbound unrestricted --------------------
if exists hcloud firewall describe "$FW_NAME"; then
  say "# hcloud firewall '$FW_NAME' exists, rules left as they are"
else
  run hcloud firewall create --name "$FW_NAME" --label "$LABEL"
  src_args=()
  IFS=',' read -r -a srcs <<< "$SSH_SOURCES"
  for s in "${srcs[@]}"; do src_args+=(--source-ips "$s"); done
  run hcloud firewall add-rule "$FW_NAME" --direction in --protocol tcp --port 22 \
    "${src_args[@]}" --description "ssh"
fi

# 4. Server ------------------------------------------------------------------
if exists hcloud server describe "$SERVER_NAME"; then
  say "# hcloud server '$SERVER_NAME' exists, not recreated"
else
  # Render the three placeholders into a temp copy of cloud-init.yaml.
  if [ -f "$PUB_FILE" ]; then
    pubkey="$(tr -d '\r\n' < "$PUB_FILE")"
  else
    pubkey="ssh-ed25519 AAAA...(generated by the ssh-keygen above) carta-orchestrator"
  fi
  user_data="$(mktemp "${TMPDIR:-/tmp}/carta-cloud-init.XXXXXX")"
  # Kept after a dry run so the rendered file can be read; removed after a real one.
  if [ "$DRY_RUN" -eq 0 ]; then trap 'rm -f "$user_data"' EXIT; fi
  # tr strips CR: a Windows checkout with core.autocrlf would otherwise hand
  # the box a carta-bootstrap script with CRLF line ends, which bash rejects.
  content="$(tr -d '\r' < "$CLOUD_INIT")"
  content="${content//@@CARTA_SSH_PUBKEY@@/"$pubkey"}"
  content="${content//@@CARTA_REPO_URL@@/"$REPO_URL"}"
  content="${content//@@CARTA_REPO_BRANCH@@/"$REPO_BRANCH"}"
  printf '%s\n' "$content" > "$user_data"
  if grep -q '@@CARTA_' "$user_data"; then
    echo "a placeholder was left unrendered in $user_data" >&2; exit 1
  fi
  say "# user-data rendered to $user_data ($(wc -c < "$user_data" | tr -d ' ') bytes), repo $REPO_URL @ $REPO_BRANCH"

  ip_args=()
  if [ "$IPV4" -eq 0 ]; then ip_args+=(--without-ipv4); fi
  run hcloud server create \
    --name "$SERVER_NAME" \
    --type "$SERVER_TYPE" \
    --image "$IMAGE" \
    --location "$LOCATION" \
    --ssh-key "$KEY_NAME" \
    --firewall "$FW_NAME" \
    --label "$LABEL" \
    --user-data-from-file "$user_data" \
    ${ip_args[@]+"${ip_args[@]}"}
fi

# 5. Where it is and what next -----------------------------------------------
say ""
if [ "$DRY_RUN" -eq 1 ]; then
  run hcloud server ip --ipv6 "$SERVER_NAME"
  if [ "$IPV4" -eq 1 ]; then run hcloud server ip "$SERVER_NAME"; fi
  ADDR="<ipv6 address>"
else
  ADDR="$(hcloud server ip --ipv6 "$SERVER_NAME")"
  say "IPv6: $ADDR"
  if [ "$IPV4" -eq 1 ]; then say "IPv4: $(hcloud server ip "$SERVER_NAME")"; fi
fi

cat <<EOF

Next steps (Execution/P3/_OPEN-hetzner.md has the full procedure):
  1. Wait for first boot to finish, about 5 to 10 minutes:
       ssh -i $KEY_FILE carta@$ADDR 'cloud-init status --wait; tail -n 20 /var/log/carta-bootstrap.log'
     If a bootstrap step failed, fix the cause and run: sudo carta-bootstrap
  2. Fill the secrets file on the box (mode 600, never committed):
       ssh -i $KEY_FILE carta@$ADDR 'nano ~/.config/carta/env'
  3. From the laptop, after at least ten minutes of uptime:
       CARTA_SSH_KEY_FILE=$KEY_FILE bash infra/hetzner/cax11/verify.sh $ADDR
EOF
