#!/usr/bin/env bash
# The trails lab dump in R2 and back (T1161, ROADMAP H10, audit P-17).
#
# The trailslab worker job (jobs/trailslab.sh, T647) restores the newest dump
# in archive/db/ and writes a fresh one back, so the lab lives in R2 between
# runs. This script is the same round trip for a person or a box with a lab of
# its own (the laptop today, the lab move of T1182 later):
#
#   trailslab_dump.sh push    [--dry-run] [--crypt worker-key|plain]
#       pg_dump -Fc of the running lab, read back with pg_restore -l, encrypted
#       to the owner's backup key AND the worker's public key (so the worker
#       job can restore it; README "The trailslab job"), checked by listing
#       its recipients, then uploaded to archive/db/trailslab/ in R2 with the
#       date in its name. Never overwrites a key that is already there.
#   trailslab_dump.sh restore [--dry-run] [--crypt worker-key|plain] [--key KEY] [--force]
#       the newest dump in archive/db/trailslab/ (or KEY under the bucket),
#       downloaded, decrypted with whatever secret key this keyring holds,
#       and pg_restore'd into the lab. Refuses a lab that already has trips
#       unless --force (then pg_restore --clean --if-exists replaces it).
#
# The lab is the one tools/trailslab/docker-compose.yml starts:
#   TRAILSLAB_HOST (127.0.0.1) TRAILSLAB_PORT (5433) TRAILSLAB_DB (trailslab)
#   TRAILSLAB_USER (trailslab) TRAILSLAB_PASSWORD (trailslab)
# Keys and R2, the names of infra/hetzner/cax11/env.example:
#   CARTA_BACKUP_KEY            the owner's key (fingerprint or id), public half in the keyring
#   CARTA_WORKER_GPG_PUBLIC     the worker's key (fingerprint or id), or
#   CARTA_WORKER_GPG_PUBLIC_FILE  its armored public key, imported first
#   RCLONE_CONFIG_R2_*          the r2 remote; CARTA_R2_BUCKET (carta)
#   CARTA_TRAILSLAB_DUMP_DIR    scratch for the dump (default $HOME/trailslab-dump)
#   CARTA_RCLONE                another rclone binary (tests use a stub)
#
# Exit codes: 0 done, 1 a step failed, 2 bad arguments, 3 refused (a key that
# exists, a lab that is not empty, a missing key or remote).
# ASCII clean, no em dashes, per project convention.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PY="${CARTA_PY:-python3}"
RCLONE="${CARTA_RCLONE:-rclone}"
BUCKET="${CARTA_R2_BUCKET:-carta}"
PREFIX="archive/db/trailslab"
WORK="${CARTA_TRAILSLAB_DUMP_DIR:-$HOME/trailslab-dump}"

MODE="${1:-}"; [ $# -gt 0 ] && shift
DRY=0; CRYPT=worker-key; KEY=""; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --crypt) CRYPT="${2:-}"; shift ;;
    --key) KEY="${2:-}"; shift ;;
    --force) FORCE=1 ;;
    *) echo "trailslab_dump.sh: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done
case "$MODE" in push|restore) ;; *) echo "usage: trailslab_dump.sh push|restore [--dry-run] [--crypt worker-key|plain] [--key KEY] [--force]" >&2; exit 2 ;; esac
case "$CRYPT" in worker-key|plain) ;; *) echo "trailslab_dump.sh: --crypt is worker-key or plain" >&2; exit 2 ;; esac

say() { printf '%s trailslab_dump: %s\n' "$(date -u +%H:%M:%S)" "$*"; }
x() { echo "+ $*"; [ $DRY -eq 1 ] && return 0; "$@"; }

export PGHOST="${TRAILSLAB_HOST:-127.0.0.1}" PGPORT="${TRAILSLAB_PORT:-5433}"
export PGDATABASE="${TRAILSLAB_DB:-trailslab}" PGUSER="${TRAILSLAB_USER:-trailslab}"
export PGPASSWORD="${TRAILSLAB_PASSWORD:-trailslab}"

if [ $DRY -eq 0 ]; then
  for t in pg_dump pg_restore psql "$RCLONE"; do
    command -v "$t" >/dev/null || { say "$t is not installed"; exit 3; }
  done
  [ "$CRYPT" = "plain" ] || command -v gpg >/dev/null || { say "gpg is not installed"; exit 3; }
  mkdir -p "$WORK" || exit 1
fi
count_trips() { psql -tAc "select count(*) from trips" 2>/dev/null | tr -d '[:space:]'; }

if [ "$MODE" = "push" ]; then
  if [ $DRY -eq 0 ]; then
    pg_isready -q || { say "no lab answers on $PGHOST:$PGPORT (cd tools/trailslab && docker compose up -d)"; exit 3; }
    n="$(count_trips)"; [ "${n:-0}" -gt 0 ] || { say "the lab has no trips; not pushing an empty dump"; exit 3; }
    say "lab $PGHOST:$PGPORT/$PGDATABASE: $n trips"
  fi
  NAME="trailslab-$(date -u +%F).dump"
  PLAIN="$WORK/$NAME"
  if [ "$CRYPT" = "plain" ]; then OUT="$PLAIN"; DEST="$PREFIX/$NAME"; else OUT="$PLAIN.gpg"; DEST="$PREFIX/$NAME.gpg"; fi
  if [ $DRY -eq 0 ] && "$RCLONE" lsf "r2:$BUCKET/$DEST" 2>/dev/null | grep -q .; then
    say "r2:$BUCKET/$DEST exists already; not overwriting (run it again tomorrow, or move that one away)"; exit 3
  fi
  RCPT=()
  if [ "$CRYPT" = "worker-key" ]; then
    [ -n "${CARTA_BACKUP_KEY:-}" ] || { say "CARTA_BACKUP_KEY is not set: the owner's key must be a recipient"; exit 3; }
    if [ -n "${CARTA_WORKER_GPG_PUBLIC_FILE:-}" ]; then
      x gpg --batch --import "$CARTA_WORKER_GPG_PUBLIC_FILE" || { say "could not import $CARTA_WORKER_GPG_PUBLIC_FILE"; exit 3; }
      [ -n "${CARTA_WORKER_GPG_PUBLIC:-}" ] || CARTA_WORKER_GPG_PUBLIC="$(gpg --batch --with-colons --show-keys "$CARTA_WORKER_GPG_PUBLIC_FILE" 2>/dev/null | awk -F: '$1=="fpr"{print $10; exit}')"
    fi
    [ -n "${CARTA_WORKER_GPG_PUBLIC:-}" ] || { say "no worker key (CARTA_WORKER_GPG_PUBLIC or CARTA_WORKER_GPG_PUBLIC_FILE): the worker could not restore this dump"; exit 3; }
    RCPT=(--recipient "$CARTA_BACKUP_KEY" --recipient "$CARTA_WORKER_GPG_PUBLIC")
  fi
  x pg_dump -Fc -Z 6 -f "$PLAIN" || { say "pg_dump failed"; exit 1; }
  if [ $DRY -eq 0 ]; then
    pg_restore -l "$PLAIN" > "$WORK/toc.txt" || { say "the dump does not read back (pg_restore -l)"; exit 1; }
    say "dump $NAME: $(stat -c %s "$PLAIN") bytes, $(grep -c 'TABLE DATA' "$WORK/toc.txt") tables with data"
  fi
  if [ "$CRYPT" = "worker-key" ]; then
    # --compress-algo none: a custom-format dump is compressed already.
    x gpg --batch --yes --trust-model always --compress-algo none --encrypt "${RCPT[@]}" -o "$OUT" "$PLAIN" \
      || { say "gpg encrypt failed"; exit 1; }
    if [ $DRY -eq 0 ]; then
      # Both recipients must be in the file, or one side cannot open it.
      ids="$(gpg --batch --list-packets "$OUT" 2>&1 | sed -n 's/.*keyid \([0-9A-Fa-f]\{16\}\).*/\1/p' | tr '[:lower:]' '[:upper:]' | sort -u | tr '\n' ' ')"
      for k in "$CARTA_BACKUP_KEY" "$CARTA_WORKER_GPG_PUBLIC"; do
        sub="$(gpg --batch --with-colons --list-keys "$k" 2>/dev/null | awk -F: '$1=="sub"&&$12~/e/{print toupper($5)} $1=="pub"&&$12~/e/{print toupper($5)}' | tr '\n' ' ')"
        hit=0; for s in $sub; do case " $ids " in *" $s "*) hit=1 ;; esac; done
        [ $hit -eq 1 ] || { say "the encrypted dump does not name $k as a recipient (packets: $ids)"; exit 1; }
      done
      say "encrypted to the owner and the worker (key ids $ids)"
      rm -f "$PLAIN"
    fi
  fi
  x "$RCLONE" copyto "$OUT" "r2:$BUCKET/$DEST" || { say "upload failed; the dump stays in $OUT"; exit 1; }
  say "uploaded to r2:$BUCKET/$DEST (the worker restores the newest dump it can read; archive/db/ expires after 30 days)"
  [ $DRY -eq 1 ] || rm -f "$OUT"
  exit 0
fi

# --- restore ---------------------------------------------------------------------------
if [ $DRY -eq 0 ]; then
  pg_isready -q || { say "no lab answers on $PGHOST:$PGPORT (cd tools/trailslab && docker compose up -d)"; exit 3; }
  n="$(count_trips)"
  if [ -n "$n" ] && [ "$n" -gt 0 ] && [ $FORCE -eq 0 ]; then
    say "the lab already holds $n trips; --force replaces it (pg_restore --clean --if-exists)"; exit 3
  fi
fi
if [ -z "$KEY" ]; then
  if [ $DRY -eq 1 ]; then
    echo "+ $RCLONE lsjson -R --files-only r2:$BUCKET/archive/db | trailslab_worker.py pick-dumps --crypt $CRYPT"
    KEY="$PREFIX/trailslab-<date>.dump$([ "$CRYPT" = plain ] || echo .gpg)"
  else
    KEY="$("$RCLONE" lsjson -R --files-only "r2:$BUCKET/archive/db" \
      | "$PY" "$REPO/infra/hetzner/cax41/trailslab_worker.py" pick-dumps --crypt "$CRYPT" \
      | head -n 1 | cut -f1)"
    [ -n "$KEY" ] || { say "no $CRYPT trailslab dump in r2:$BUCKET/archive/db/"; exit 3; }
    KEY="archive/db/$KEY"
  fi
fi
say "restoring from r2:$BUCKET/$KEY"
RAW="$WORK/in.raw"; DUMP="$WORK/in.dump"
x "$RCLONE" copyto "r2:$BUCKET/$KEY" "$RAW" || { say "download failed"; exit 1; }
case "$KEY" in
  *.gpg) x gpg --batch --yes --decrypt -o "$DUMP" "$RAW" || { say "gpg could not decrypt it (is one of its recipients' secret keys in this keyring?)"; exit 1; }
         x rm -f "$RAW" ;;
  *) x mv "$RAW" "$DUMP" ;;
esac
CLEAN=(); [ $FORCE -eq 1 ] && CLEAN=(--clean --if-exists)
x pg_restore --no-owner --no-privileges "${CLEAN[@]}" -j "${CARTA_THREADS:-4}" -d "$PGDATABASE" "$DUMP"
rc=$?
[ "$rc" -ne 0 ] && say "pg_restore exited $rc (an extension comment warning is common); counting rows to decide"
x vacuumdb --analyze-only -d "$PGDATABASE" >/dev/null
if [ $DRY -eq 0 ]; then
  n="$(count_trips)"
  [ "${n:-0}" -gt 0 ] || { say "the restore left no trips"; exit 1; }
  say "restored: $n trips, $(psql -tAc "select count(*) from trips where status = 'published'" | tr -d '[:space:]') published"
  rm -f "$DUMP"
fi
exit 0
