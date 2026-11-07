#!/usr/bin/env bash
# Restore a Carta dump into a scratch Postgres and time every stage (T1159,
# ROADMAP H5). The routine proof that a backup can be read, and the number to
# quote as "how long does a restore take".
#
#   ops/restore_drill.sh --latest                 newest nightly dump from R2
#   ops/restore_drill.sh --file <x.dump.gpg>      a dump already on disk
#   Options: --db <name>      scratch database, default carta_restore_drill
#            --report <file>  write the timings as JSON (default: print only)
#            --remote <path>  default r2:carta/archive/db/supabase-nightly
#
# Target: a LOCAL or scratch Postgres reached with the usual PGHOST, PGPORT,
# PGUSER, PGPASSWORD. It refuses the live project (host containing
# ntssxktaduxzpsmejwyv, or equal to SUPABASE_DB_URL's host). The scratch
# database is dropped and recreated.
#
# Decryption: the owner's GPG SECRET key must be in the keyring of the machine
# running this (the box never has it). A hand dump made by backup_supabase.sh
# is passphrase-encrypted instead: set CARTA_BACKUP_PASSPHRASE for those.
#
# Stages timed: fetch, decrypt, restore, verify. Verify compares the restored
# row counts with the .counts.json written next to the dump (exact match is
# only expected when nothing wrote between the count and the dump; it fails on
# a missing table, or a table that came back empty when the manifest had rows).
# Exit 0 ok, 1 failed, 2 usage.
set -euo pipefail

FILE=""; LATEST=0; DB="carta_restore_drill"; REPORT=""
REMOTE="${CARTA_BACKUP_REMOTE:-r2:carta/archive/db/supabase-nightly}"
while [ $# -gt 0 ]; do
  case "$1" in
    --file) FILE="$2"; shift 2 ;;
    --latest) LATEST=1; shift ;;
    --db) DB="$2"; shift 2 ;;
    --report) REPORT="$2"; shift 2 ;;
    --remote) REMOTE="$2"; shift 2 ;;
    -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "restore_drill: unknown argument $1" >&2; exit 2 ;;
  esac
done
[ -n "$FILE" ] || [ $LATEST -eq 1 ] || { echo "usage: $0 --latest | --file <x.dump.gpg>" >&2; exit 2; }
case "$DB" in *[!a-zA-Z0-9_]*|"") echo "restore_drill: bad database name" >&2; exit 2 ;; esac

HOST="${PGHOST:-localhost}"
if [[ "$HOST" == *ntssxktaduxzpsmejwyv* ]]; then echo "restore_drill: refusing the live project host" >&2; exit 1; fi
if [ -n "${SUPABASE_DB_URL:-}" ]; then
  LIVE_HOST="$(printf '%s' "$SUPABASE_DB_URL" | sed -E 's#^[a-z]+://[^@]*@([^:/?]+).*#\1#')"
  [ "$HOST" != "$LIVE_HOST" ] || { echo "restore_drill: PGHOST is the live database host; refusing" >&2; exit 1; }
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM
now() { date +%s.%N; }
T_FETCH=0; T_DEC=0; T_RES=0; T_VER=0
fail() { echo "restore_drill: FAILED: $*" >&2; exit 1; }

# --- fetch -------------------------------------------------------------------
t0=$(now)
if [ $LATEST -eq 1 ]; then
  command -v rclone >/dev/null || fail "no rclone"
  NEWEST="$(rclone lsf "$REMOTE" --include 'supabase-nightly-*.dump.gpg' | sort | tail -1)"
  [ -n "$NEWEST" ] || fail "no nightly dump under $REMOTE"
  echo "newest in R2: $NEWEST"
  rclone copyto "$REMOTE/$NEWEST" "$WORK/$NEWEST"
  rclone copyto "$REMOTE/$NEWEST.sha256" "$WORK/$NEWEST.sha256" 2>/dev/null || true
  rclone copyto "$REMOTE/${NEWEST%.dump.gpg}.counts.json" "$WORK/${NEWEST%.dump.gpg}.counts.json" 2>/dev/null || true
  FILE="$WORK/$NEWEST"
fi
[ -f "$FILE" ] || fail "no such file: $FILE"
[ -f "$FILE.sha256" ] && { ( cd "$(dirname "$FILE")" && sha256sum --check --status "$(basename "$FILE").sha256" ) || fail "checksum mismatch"; echo "checksum ok"; }
SIZE=$(stat -c %s "$FILE")
T_FETCH=$(awk "BEGIN{print $(now) - $t0}")

# --- decrypt -----------------------------------------------------------------
t0=$(now)
PLAIN="$WORK/plain.dump"
if [ -n "${CARTA_BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt -o "$PLAIN" "$FILE" 3<<<"$CARTA_BACKUP_PASSPHRASE" \
    || fail "decrypt with the passphrase failed"
else
  gpg --batch --yes --quiet --decrypt -o "$PLAIN" "$FILE" || fail "decrypt failed (is the GPG secret key in this keyring?)"
fi
pg_restore --list "$PLAIN" > "$WORK/toc.txt" || fail "archive is not readable"
ENTRIES=$(grep -vc '^;' "$WORK/toc.txt" || true)
T_DEC=$(awk "BEGIN{print $(now) - $t0}")

# --- restore -----------------------------------------------------------------
t0=$(now)
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$HOST" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}")
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/supabase_local_stub.sql" >/dev/null
# Errors are listed, not fatal: a dump may mention things a scratch server lacks.
pg_restore -h "$HOST" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -d "$DB" \
  --no-owner --no-privileges "$PLAIN" 2> "$WORK/restore.err" || true
ERRS=$(grep -c 'error:' "$WORK/restore.err" || true)
T_RES=$(awk "BEGIN{print $(now) - $t0}")

# --- verify ------------------------------------------------------------------
t0=$(now)
Q="$("${PSQL[@]}" -d "$DB" -A -t -c "select string_agg(format('select %L as t, count(*) as n from public.%I', tablename, tablename), ' union all ' order by tablename) from pg_tables where schemaname='public'")"
TABLES=0; ROWS=0; PROBLEMS=0
if [ -n "$Q" ]; then
  "${PSQL[@]}" -d "$DB" -A -t -F'|' -c "$Q" > "$WORK/restored.txt"
  TABLES=$(wc -l < "$WORK/restored.txt"); ROWS=$(awk -F'|' '{s+=$2} END{print s+0}' "$WORK/restored.txt")
fi
COUNTS="${FILE%.dump.gpg}.counts.json"
if [ -f "$COUNTS" ]; then
  while IFS='|' read -r t n; do
    [ -n "$t" ] || continue
    want="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2],"MISSING"))' "$COUNTS" "$t")"
    [ "$want" = "MISSING" ] && continue
    if [ "$n" != "$want" ]; then echo "  differs: $t restored $n, manifest $want"; fi
    if [ "$n" = "0" ] && [ "$want" != "0" ]; then PROBLEMS=$((PROBLEMS+1)); fi
  done < "$WORK/restored.txt"
  for t in $(python3 -I -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))))' "$COUNTS"); do
    grep -q "^$t|" "$WORK/restored.txt" || { echo "  missing table: $t"; PROBLEMS=$((PROBLEMS+1)); }
  done
else
  echo "  no counts manifest next to the dump; checked that tables exist only"
fi
[ "$TABLES" -gt 0 ] || PROBLEMS=$((PROBLEMS+1))
T_VER=$(awk "BEGIN{print $(now) - $t0}")

TOTAL=$(awk "BEGIN{print $T_FETCH + $T_DEC + $T_RES + $T_VER}")
printf '\nrestore drill: %s\n  dump %s bytes, %s TOC entries, %s tables, %s rows, %s restore errors, %s problems\n' "$(basename "$FILE")" "$SIZE" "$ENTRIES" "$TABLES" "$ROWS" "$ERRS" "$PROBLEMS"
printf '  seconds: fetch %.2f, decrypt %.2f, restore %.2f, verify %.2f, total %.2f\n' "$T_FETCH" "$T_DEC" "$T_RES" "$T_VER" "$TOTAL"
if [ -n "$REPORT" ]; then
  printf '{"file":"%s","bytes":%s,"toc_entries":%s,"tables":%s,"rows":%s,"restore_errors":%s,"problems":%s,"seconds":{"fetch":%.3f,"decrypt":%.3f,"restore":%.3f,"verify":%.3f,"total":%.3f}}\n' \
    "$(basename "$FILE")" "$SIZE" "$ENTRIES" "$TABLES" "$ROWS" "$ERRS" "$PROBLEMS" "$T_FETCH" "$T_DEC" "$T_RES" "$T_VER" "$TOTAL" > "$REPORT"
fi
[ "$PROBLEMS" -eq 0 ] || fail "$PROBLEMS problem(s) above"
echo "  scratch database: $DB (drop with: dropdb $DB)"
