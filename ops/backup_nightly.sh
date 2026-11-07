#!/usr/bin/env bash
# Nightly encrypted dump of the live Carta Supabase project, run by the box
# timer carta-backup.timer (T1159, ROADMAP H5). It replaces running
# ops/backup_supabase.sh by hand as the routine backup; that script stays for
# the dump before a hand-pasted migration.
#
# Flow: pg_dump -Fc (public schema) | gpg --encrypt to the owner's PUBLIC key
# -> file in $CARTA_BACKUP_OUT, sha256 sidecar, row-count manifest -> rclone to
# R2 -> size check -> prune dumps older than the retention. The box never holds
# the secret half of the key, so a stolen box cannot read old backups.
#
# Needs (from ~/.config/carta/env, the same file the pipeline uses):
#   SUPABASE_DB_URL     session pooler connection string
#   CARTA_BACKUP_KEY    GPG recipient (key id or email), public key imported
# Optional:
#   CARTA_BACKUP_OUT              default $HOME/archive-out/nightly
#   CARTA_BACKUP_REMOTE           default r2:carta/archive/db/supabase-nightly
#                                 (under archive/db/, which has the 30-day
#                                 lifecycle rule from pipeline/archive/push.py)
#   CARTA_BACKUP_RETENTION_DAYS   default 30 (remote), local copies 7 days
#   CARTA_BACKUP_PG_DUMP          pg_dump binary, default pg_dump
#
# Usage: ops/backup_nightly.sh [--no-upload] [--dry-run]
# Exit: 0 ok, 1 failed (systemd marks the unit failed), 2 bad arguments.
# Status: $CARTA_BACKUP_OUT/last_backup.json after every run, good or failed.
set -euo pipefail

NO_UPLOAD=0; DRY=0
for a in "$@"; do
  case "$a" in
    --no-upload) NO_UPLOAD=1 ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,28p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "backup_nightly: unknown argument $a" >&2; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOADER="$HERE/../infra/hetzner/cax11/load-env.sh"
# shellcheck disable=SC1090
[ -f "$LOADER" ] && . "$LOADER"

OUT="${CARTA_BACKUP_OUT:-$HOME/archive-out/nightly}"
REMOTE="${CARTA_BACKUP_REMOTE:-r2:carta/archive/db/supabase-nightly}"
KEEP_DAYS="${CARTA_BACKUP_RETENTION_DAYS:-30}"
PGDUMP="${CARTA_BACKUP_PG_DUMP:-pg_dump}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="supabase-nightly-$STAMP.dump.gpg"
START=$(date +%s)
mkdir -p "$OUT"

say() { echo "$(date -u +%FT%TZ) backup_nightly: $*"; }
status() {  # ok|failed, detail
  printf '{"status":"%s","detail":"%s","file":"%s","started":%s,"seconds":%s,"bytes":%s}\n' \
    "$1" "$2" "$NAME" "$START" "$(( $(date +%s) - START ))" "${SIZE:-0}" > "$OUT/last_backup.json"
}
fail() { say "FAILED: $*" >&2; SIZE="${SIZE:-0}"; status failed "$*"; rm -f "$OUT/$NAME.partial"; exit 1; }
SIZE=0

[ -n "${SUPABASE_DB_URL:-}" ]   || fail "SUPABASE_DB_URL not set"
[ -n "${CARTA_BACKUP_KEY:-}" ]  || fail "CARTA_BACKUP_KEY not set"
command -v "$PGDUMP" >/dev/null || fail "no $PGDUMP on PATH"
command -v gpg >/dev/null       || fail "no gpg"
gpg --batch --list-keys "$CARTA_BACKUP_KEY" >/dev/null 2>&1 || fail "public key '$CARTA_BACKUP_KEY' not in this keyring"
if [ $NO_UPLOAD -eq 0 ]; then command -v rclone >/dev/null || fail "no rclone"; fi

if [ $DRY -eq 1 ]; then
  say "dry run: would dump -> $OUT/$NAME, upload to $REMOTE, prune older than $KEEP_DAYS days"
  exit 0
fi

# Row counts first (a manifest the restore drill compares against). Table names
# and counts only, no row data, so it is stored unencrypted next to the dump.
say "row counts"
Q="$(psql "$SUPABASE_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c "select string_agg(format('select %L as t, count(*) as n from public.%I', tablename, tablename), ' union all ' order by tablename) from pg_tables where schemaname='public'")" || fail "cannot list tables"
COUNTS=""
[ -z "$Q" ] || COUNTS="$(psql "$SUPABASE_DB_URL" -X -A -t -F'|' -v ON_ERROR_STOP=1 -c "$Q")" || fail "cannot count rows"
printf '%s\n' "$COUNTS" | awk -F'|' 'NF==2{printf "%s\"%s\":%s", (n++?",":"{"), $1, $2} END{print "}"}' > "$OUT/${NAME%.dump.gpg}.counts.json"

say "dumping -> $OUT/$NAME"
# --no-owner / --no-privileges: a restore target never has the live roles.
"$PGDUMP" "$SUPABASE_DB_URL" --format=custom -Z 6 --no-owner --no-privileges --schema=public \
  | gpg --batch --yes --trust-model always --encrypt --recipient "$CARTA_BACKUP_KEY" -o "$OUT/$NAME.partial" \
  || fail "pg_dump or gpg failed"
SIZE=$(stat -c %s "$OUT/$NAME.partial")
[ "$SIZE" -ge 2048 ] || fail "$NAME is only $SIZE bytes"
mv "$OUT/$NAME.partial" "$OUT/$NAME"
( cd "$OUT" && sha256sum "$NAME" > "$NAME.sha256" )
say "wrote $NAME ($SIZE bytes)"

if [ $NO_UPLOAD -eq 0 ]; then
  BASE="${NAME%.dump.gpg}"
  for f in "$NAME" "$NAME.sha256" "$BASE.counts.json"; do
    rclone copyto "$OUT/$f" "$REMOTE/$f" || fail "upload of $f failed"
  done
  REMOTE_SIZE="$(rclone lsf --format s "$REMOTE/$NAME" 2>/dev/null | head -1)" || REMOTE_SIZE=""
  [ "$REMOTE_SIZE" = "$SIZE" ] || fail "R2 size '$REMOTE_SIZE' != local $SIZE"
  say "uploaded to $REMOTE"
  # Prune only after a verified upload, so a broken upload never costs the
  # old dumps. R2's lifecycle rule on archive/db/ is the second net.
  rclone delete "$REMOTE" --min-age "${KEEP_DAYS}d" --include 'supabase-nightly-*' \
    || say "prune failed (the R2 lifecycle rule still applies)"
  printf '{"status":"ok","file":"%s","bytes":%s,"at":"%s"}\n' "$NAME" "$SIZE" "$STAMP" > "$OUT/last_backup.json.tmp"
  rclone copyto "$OUT/last_backup.json.tmp" "r2:carta/status/backup.json" >/dev/null 2>&1 || true
  rm -f "$OUT/last_backup.json.tmp"
fi

# Local copies: keep a week.
find "$OUT" -maxdepth 1 -name 'supabase-nightly-*' -mtime +7 -delete 2>/dev/null || true
status ok "dumped"
say "done in $(( $(date +%s) - START )) s"
