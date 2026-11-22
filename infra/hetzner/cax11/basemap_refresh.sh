#!/usr/bin/env bash
# Monthly refresh of the Explore map's basemap on the box (G12, owner call
# 2026-11-20: the box does it, the owner only checks the log).
#
# carta-basemap.timer runs this once a month. It:
#   1. reads the newest Protomaps planet build (build-metadata.protomaps.dev);
#      if the manifest already names that build, it logs a skip and stops;
#   2. fetches go-pmtiles (pinned below, the arch of this box) into ~/.cache;
#   3. extracts Europe (bbox -25,34,45,72) at zoom 0 to 13, about 13 GB, over
#      HTTP/1.1 (Go's HTTP/2 client broke two 25 GB pulls on 2026-11-20), with
#      up to three tries since extract cannot resume, and runs pmtiles verify;
#   4. uploads it to r2:carta/data/maps/europe-<build date>.pmtiles, a new key
#      every month, never overwriting one (rclone copyto, Cache-Control a year);
#   5. rewrites data/maps/basemap.json, the manifest the app reads
#      (continent-app/src/lib/map/pmtilesProtocol.js), so the map switches
#      without a deploy; the manifest caches five minutes;
#   6. deletes, by exact key, only extracts this job uploaded and retired more
#      than 30 days ago (the manifest's job_files ledger), never anything else;
#   7. removes its local copy (the file lives on R2; the box disk is small).
#
#   bash infra/hetzner/cax11/basemap_refresh.sh            refresh when a new build exists
#   bash infra/hetzner/cax11/basemap_refresh.sh --dry-run  say what it would do, change nothing
#   bash infra/hetzner/cax11/basemap_refresh.sh --force    refresh even when the build is current
#
# Logs to stdout (journalctl -u carta-basemap.service) and appends to
# ~/logs/basemap.log. Exit 0 done or skipped; 1 a failure (nothing on R2 is
# changed before the upload has succeeded). ASCII only, no em dashes.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOADENV="$HERE/load-env.sh"
# shellcheck source=/dev/null
[ -r "$LOADENV" ] && . "$LOADENV"

DRY=0; FORCE=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    *) echo "basemap_refresh.sh: unknown argument $a" >&2; exit 2 ;;
  esac
done

PMTILES_VERSION="${CARTA_PMTILES_VERSION:-1.31.2}"
BBOX="-25,34,45,72"
MAXZOOM="${CARTA_BASEMAP_MAXZOOM:-13}"
KEEP_DAYS="${CARTA_BASEMAP_KEEP_DAYS:-30}"
REMOTE="${CARTA_BASEMAP_REMOTE:-r2:carta/data/maps}"
WORK="${CARTA_BASEMAP_WORK:-$HOME/basemap}"
CACHE="$HOME/.cache/carta/pmtiles-$PMTILES_VERSION"
LOG_DIR="$HOME/logs"
mkdir -p "$LOG_DIR" "$WORK" "$CACHE"
LOG="$LOG_DIR/basemap.log"

say() { printf '%s basemap: %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }
die() { say "FAILED: $*"; exit 1; }
RC=(--s3-no-check-bucket)

for k in RCLONE_CONFIG_R2_TYPE RCLONE_CONFIG_R2_ENDPOINT RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY; do
  [ -n "${!k:-}" ] || die "$k is not set (~/.config/carta/env)"
done
command -v rclone >/dev/null || die "rclone not installed"

# 1. Newest build and the current manifest.
BUILD="$(curl -fsS --max-time 60 https://build-metadata.protomaps.dev/builds.json \
  | python3 -c 'import json,sys; b=json.load(sys.stdin); print(b[-1]["key"])')" || die "cannot read the build list"
case "$BUILD" in [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].pmtiles) ;; *) die "unexpected build key $BUILD" ;; esac
DATE="${BUILD:0:4}-${BUILD:4:2}-${BUILD:6:2}"
NAME="europe-$DATE.pmtiles"
MANIFEST_OLD="$WORK/basemap.old.json"
rclone cat "${RC[@]}" "$REMOTE/basemap.json" > "$MANIFEST_OLD" 2>/dev/null || echo '{}' > "$MANIFEST_OLD"
CURRENT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("pmtiles",""))' "$MANIFEST_OLD" 2>/dev/null || true)"
say "newest build $BUILD, manifest names ${CURRENT:-nothing}"
if [ "$CURRENT" = "$NAME" ] && [ $FORCE -eq 0 ]; then
  say "skip: the map already reads $NAME"
  exit 0
fi
if rclone lsf "${RC[@]}" "$REMOTE/$NAME" 2>/dev/null | grep -q .; then
  [ $FORCE -eq 1 ] || die "$NAME is already on R2 but not in the manifest; check by hand (never overwritten)"
fi

# 2. go-pmtiles for this box's arch.
case "$(uname -m)" in
  aarch64|arm64) ARCH=arm64 ;;
  x86_64) ARCH=x86_64 ;;
  *) die "no go-pmtiles build for $(uname -m)" ;;
esac
PMT="$CACHE/pmtiles"
if [ ! -x "$PMT" ]; then
  url="https://github.com/protomaps/go-pmtiles/releases/download/v$PMTILES_VERSION/go-pmtiles_${PMTILES_VERSION}_Linux_$ARCH.tar.gz"
  say "fetching $url"
  if [ $DRY -eq 0 ]; then
    curl -fsSL --max-time 300 "$url" | tar -xz -C "$CACHE" pmtiles || die "go-pmtiles download failed"
    chmod +x "$PMT"
  fi
fi

# 3. Extract, with room for it first.
OUT="$WORK/$NAME"
free_gb=$(( $(df -Pk "$WORK" | awk 'NR==2{print $4}') / 1048576 ))
say "free on $WORK: ${free_gb} GB"
if [ $DRY -eq 1 ]; then
  say "dry run: would extract $BUILD to $OUT (z$MAXZOOM), upload $REMOTE/$NAME, point basemap.json at it and prune job files retired over $KEEP_DAYS days"
  exit 0
fi
[ "$free_gb" -ge 16 ] || die "need about 16 GB free on $WORK, have ${free_gb} GB"
ok=0
for try in 1 2 3; do
  rm -f "$OUT"
  say "extract try $try: $BUILD z0 to $MAXZOOM bbox $BBOX"
  start=$(date +%s)
  if GODEBUG=http2client=0 "$PMT" extract "https://build.protomaps.com/$BUILD" "$OUT" \
       --bbox="$BBOX" --maxzoom="$MAXZOOM" --download-threads=4 --quiet \
     && "$PMT" verify "$OUT" >/dev/null 2>&1; then
    ok=1; say "extract done in $(( $(date +%s) - start )) s, $(stat -c %s "$OUT") bytes"; break
  fi
  say "extract try $try failed"; sleep 60
done
[ $ok -eq 1 ] || { rm -f "$OUT"; die "extract failed three times"; }

# 4. Upload under the new key.
start=$(date +%s)
rclone copyto "${RC[@]}" "$OUT" "$REMOTE/$NAME" --s3-chunk-size 64M --s3-upload-concurrency 4 \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --header-upload "Content-Type: application/vnd.pmtiles" || die "upload of $NAME failed"
say "uploaded $REMOTE/$NAME in $(( $(date +%s) - start )) s"

# 5 and 6. New manifest with the ledger; the old file is retired today.
MANIFEST_NEW="$WORK/basemap.json"
python3 - "$MANIFEST_OLD" "$MANIFEST_NEW" "$NAME" "$DATE" "$MAXZOOM" "$KEEP_DAYS" > "$WORK/prune.txt" <<'PY' || die "manifest build failed"
import json, sys, datetime as dt
old_path, new_path, name, built, maxzoom, keep = sys.argv[1:7]
old = json.load(open(old_path))
now = dt.datetime.now(dt.timezone.utc)
files = [f for f in old.get("job_files", []) if f.get("key") != name]
for f in files:
    if not f.get("retired"):
        f["retired"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
files.append({"key": name, "uploaded": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "retired": None})
cut = now - dt.timedelta(days=int(keep))
prune = [f["key"] for f in files if f.get("retired")
         and dt.datetime.strptime(f["retired"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc) < cut]
files = [f for f in files if f["key"] not in prune]
new = {"pmtiles": name, "built": built, "maxzoom": int(maxzoom),
       "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "previous": old.get("pmtiles"),
       "job_files": files}
json.dump(new, open(new_path, "w"), indent=2)
print("\n".join(prune))
PY
rclone copyto "${RC[@]}" "$MANIFEST_NEW" "$REMOTE/basemap.json" \
  --header-upload "Cache-Control: public, max-age=300" \
  --header-upload "Content-Type: application/json" || die "manifest upload failed ($NAME is on R2, the map still reads ${CURRENT:-the built-in key})"
say "basemap.json now names $NAME (was ${CURRENT:-nothing})"

while read -r key; do
  [ -n "$key" ] || continue
  case "$key" in europe-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].pmtiles) ;; *) say "not deleting unexpected key $key"; continue ;; esac
  if rclone deletefile "${RC[@]}" "$REMOTE/$key"; then say "deleted retired job file $key"; else say "could not delete $key (left in place)"; fi
done < "$WORK/prune.txt"

# 7. The local copy goes; R2 holds it.
rm -f "$OUT"
say "done: $NAME"
