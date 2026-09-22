#!/usr/bin/env bash
# Restore an encrypted Carta dump into a LOCAL Postgres database.
#
# This deliberately will not restore to the live project. A restore over a live
# database during an incident is how a bad migration becomes a worse one. The
# intended use is: restore here, confirm the data you need is present, then
# decide by hand what to copy back.
#
# Usage:
#   read -rs CARTA_BACKUP_PASSPHRASE   # paste at the blank line, nothing echoes
#   export CARTA_BACKUP_PASSPHRASE
#   ops/restore_supabase.sh <file.dump.gpg> [dbname]
#
# dbname defaults to carta_restore_test. It is DROPPED and recreated.

set -euo pipefail

DUMP="${1:-}"
DB="${2:-carta_restore_test}"

[ -n "$DUMP" ] || { echo "usage: $0 <file.dump.gpg> [dbname]" >&2; exit 2; }
[ -f "$DUMP" ] || { echo "error: no such file: $DUMP" >&2; exit 1; }
[ -n "${CARTA_BACKUP_PASSPHRASE:-}" ] || {
  echo "error: CARTA_BACKUP_PASSPHRASE is not set" >&2; exit 1; }

# Local superuser for the scratch database. Not a Supabase credential.
LOCAL_USER="${PGUSER:-postgres}"
LOCAL_HOST="${PGHOST:-localhost}"
LOCAL_PORT="${PGPORT:-5432}"

if [ -f "$DUMP.sha256" ]; then
  echo "Verifying checksum..."
  sha256sum --check --status "$DUMP.sha256" \
    || { echo "error: checksum mismatch, the file is corrupt" >&2; exit 1; }
  echo "Checksum OK"
fi

PLAIN="$(mktemp -t carta-restore-XXXXXX.dump)"
# The decrypted dump is the crown jewels in the clear. Remove it whatever
# happens, including on a failed restore or a ctrl-c.
trap 'rm -f "$PLAIN"' EXIT INT TERM

echo "Decrypting..."
gpg --batch --yes --quiet --decrypt \
    --passphrase-fd 3 --output "$PLAIN" "$DUMP" 3<<<"$CARTA_BACKUP_PASSPHRASE"

# Reads the dump's own table of contents. If this succeeds the archive is
# structurally intact, which is most of what a restore test is checking.
echo "Archive contents:"
pg_restore --list "$PLAIN" | grep -vc '^;' | xargs echo "  entries:"

echo "Recreating local database $DB ..."
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres \
     -v ON_ERROR_STOP=1 -c "drop database if exists $DB" \
     -c "create database $DB"

echo "Restoring..."
# Not ON_ERROR_STOP. A Supabase dump references roles (anon, authenticated,
# service_role) and extension schemas that a plain local Postgres does not
# have, so some errors are expected and harmless. What matters is that the
# public tables and their rows land. --no-owner drops the ownership lines that
# would otherwise fail on every single object.
pg_restore -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$DB" \
           --no-owner --no-privileges "$PLAIN" 2>&1 \
  | tail -20 || true

echo
echo "Row counts in the restored database:"
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$DB" -A -F' | ' -c "
  select relname, n_live_tup
  from pg_stat_user_tables
  where schemaname = 'public'
  order by n_live_tup desc, relname;"

echo
echo "Restored into local database: $DB"
