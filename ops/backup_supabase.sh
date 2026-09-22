#!/usr/bin/env bash
# Encrypted dump of the live Carta Supabase project.
#
# Run this before every hand-applied SQL migration. Migrations in P2 and P4 are
# pasted into the Supabase SQL editor, which has no undo, so this dump is the
# only way back.
#
# Two secrets are needed and neither is stored in the repo:
#   SUPABASE_DB_PASSWORD  the database password (Supabase dashboard ->
#                         Project Settings -> Database -> Database password)
#   CARTA_BACKUP_PASSPHRASE
#                         the passphrase the dump is encrypted with. Keep it in
#                         a password manager, NOT next to the dump, or the
#                         encryption buys nothing.
#
# Usage:
#   SUPABASE_DB_PASSWORD=... CARTA_BACKUP_PASSPHRASE=... ops/backup_supabase.sh
#   ops/backup_supabase.sh --out /d/carta-backups      # write elsewhere
#
# Output: <outdir>/carta-<utc timestamp>.dump.gpg plus a .sha256 sidecar.

set -euo pipefail

PROJECT_REF="ntssxktaduxzpsmejwyv"
# Session pooler. The direct host db.<ref>.supabase.co is IPv6-only on this
# plan, so a v4-only machine must go through the pooler.
DB_HOST="aws-1-eu-central-2.pooler.supabase.com"
DB_PORT="5432"
DB_USER="postgres.${PROJECT_REF}"
DB_NAME="postgres"

OUT_DIR="${CARTA_BACKUP_DIR:-$HOME/carta-backups}"
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT_DIR="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

for var in SUPABASE_DB_PASSWORD CARTA_BACKUP_PASSPHRASE; do
  if [ -z "${!var:-}" ]; then
    echo "error: $var is not set. See the header of this script." >&2
    exit 1
  fi
done

command -v pg_dump >/dev/null || { echo "error: pg_dump not on PATH" >&2; exit 1; }
command -v gpg     >/dev/null || { echo "error: gpg not on PATH" >&2; exit 1; }

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
PGPASSWORD="$SUPABASE_DB_PASSWORD" pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=custom \
    --no-owner \
    --no-privileges \
    --schema=public \
    --schema=storage \
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
