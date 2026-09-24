#!/usr/bin/env bash
# Encrypted dump of the live Carta Supabase project.
#
# Run this before every hand-applied SQL migration. Migrations in P2 and P4 are
# pasted into the Supabase SQL editor, which has no undo, so this dump is the
# only way back.
#
# The database password is NOT needed and is NOT asked for. Supabase shows that
# password once at project creation and stores only a hash, so it cannot be read
# back from the dashboard; the only option offered there is to reset it, which
# would break anything already using it. Instead this script asks the Supabase
# CLI for a temporary login role, which it mints fresh on every run and
# authorises with the access token from `supabase login`. Nothing long-lived is
# stored, and a leaked dump log exposes a credential that is already dead.
#
# So the only secret you supply is:
#   CARTA_BACKUP_PASSPHRASE  the passphrase the dump is encrypted with. Keep it
#                            in a password manager, NOT next to the dump, or the
#                            encryption buys nothing.
#
# You must be logged in: `supabase login`, and the project linked (it already is,
# via supabase/.temp/project-ref).
#
# Usage:
#   read -rs CARTA_BACKUP_PASSPHRASE   # paste at the blank line, nothing echoes
#   export CARTA_BACKUP_PASSPHRASE
#   ops/backup_supabase.sh
#   ops/backup_supabase.sh --out /d/carta-backups      # write elsewhere
#
# Read it in rather than writing it inline: a passphrase containing a single
# quote breaks VAR='...' by closing the string early, and $ or a backtick gets
# mangled inside double quotes.
#
# Output: <outdir>/carta-<utc timestamp>.dump.gpg plus a .sha256 sidecar.

set -euo pipefail

PROJECT_REF="ntssxktaduxzpsmejwyv"

OUT_DIR="${CARTA_BACKUP_DIR:-$HOME/carta-backups}"
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT_DIR="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "${CARTA_BACKUP_PASSPHRASE:-}" ]; then
  echo "error: CARTA_BACKUP_PASSPHRASE is not set. See the header of this script." >&2
  exit 1
fi

command -v pg_dump  >/dev/null || { echo "error: pg_dump not on PATH" >&2; exit 1; }
command -v gpg      >/dev/null || { echo "error: gpg not on PATH" >&2; exit 1; }
command -v supabase >/dev/null || { echo "error: supabase CLI not on PATH" >&2; exit 1; }

# Ask the CLI to mint a temporary login role and print the connection it would
# use. --dry-run does no dumping; it only emits the script, and the credentials
# are in its `export PG...` lines. We drive pg_dump ourselves rather than using
# `supabase db dump` because that command emits plain SQL, and we want custom
# format (-Fc) so a single table can be restored on its own.
echo "Requesting a temporary login role from Supabase..."
CREDS="$(supabase db dump --linked --dry-run </dev/null 2>/dev/null | grep -E '^export PG')"

# Evaluate only lines we matched ourselves, and only the five PG* assignments.
eval "$CREDS"

if [ -z "${PGPASSWORD:-}" ] || [ -z "${PGHOST:-}" ]; then
  echo "error: could not get credentials from the Supabase CLI." >&2
  echo "Are you logged in? Run: supabase login" >&2
  exit 1
fi
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

DB_HOST="$PGHOST"
DB_PORT="$PGPORT"
DB_USER="$PGUSER"
DB_NAME="$PGDATABASE"

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$OUT_DIR/carta-$STAMP.dump.gpg"

echo "Dumping $PROJECT_REF via $DB_HOST -> $TARGET"

# -Fc is the custom format: compressed, and pg_restore can pull single tables
# out of it, which a plain .sql dump cannot.
#
# --no-owner / --no-privileges: roles on a restore target (a fresh project, or
# a local Postgres) are never the same as on the live one, so keeping the
# original GRANTs turns a restore into a wall of role-does-not-exist errors.
# RLS policies themselves are still in the dump; only the ownership lines go.
#
# The dump streams straight into gpg. It never touches disk unencrypted.
# --role postgres: we connect as the CLI's temporary login role, which owns
# nothing. The tables belong to "postgres", so without SET ROLE the dump fails
# with "permission denied for table saved_trips". The CLI's own db dump does
# the same thing.
pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --role="postgres" \
    --format=custom \
    --no-owner \
    --no-privileges \
    --schema=public \
    --verbose \
  | gpg --batch --yes --symmetric \
        --cipher-algo AES256 \
        --passphrase-fd 3 \
        --output "$TARGET" 3<<<"$CARTA_BACKUP_PASSPHRASE"

# pipefail above means a pg_dump failure fails the whole run, but a zero-byte
# or absurdly small file is a silent disaster, so check the size too.
SIZE=$(stat -c %s "$TARGET" 2>/dev/null || stat -f %z "$TARGET")
if [ "$SIZE" -lt 2048 ]; then
  echo "error: $TARGET is only $SIZE bytes. Treating as a failed dump." >&2
  exit 1
fi

sha256sum "$TARGET" > "$TARGET.sha256"

echo
echo "Wrote $TARGET ($SIZE bytes)"
echo "Checksum in $TARGET.sha256"
echo
echo "NOT DONE YET: copy both files off this laptop (see docs/BACKUP.md)."
