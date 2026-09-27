#!/usr/bin/env bash
# Job image_transcode (T049, replacing T047's stub): the image ladder of
# CARTA_CLOUD_ARCHITECTURE.md section 4.2 for one or more photo layers, on
# the CAX41. The work is pipeline/photos/derive.py; its docstring explains
# the ladder, the gates and the manifest.
#
#   spawn.sh image_transcode beaches
#   spawn.sh image_transcode beaches lakes mountains
#   spawn.sh image_transcode beaches -- --limit 500      derive.py options after --
#
# Inputs, mirrored by worker.sh from archive/caches/: <layer>-cache.tar.gz,
# T045's tarball of cache/<layer>, extracted at the repo root. The rich
# caches are the source list: every image record, gated by licence, credit
# and the takedown ledger inside derive.py.
#
# What the worker reads from the live img/ prefix, read-only, before
# deriving: the manifests and journals under img/manifest/ (so dimensions of
# what is already derived are known without a download) and a listing of
# every object under img/ (so a held source is skipped). A second run over an
# unchanged layer fetches nothing from Wikimedia and writes nothing to R2.
#
# Where the output goes, and why it breaks T047's staging rule on purpose.
# derive.py uploads the derivatives straight to img/{ab}/{cd}/{sha1}/ with
# Cache-Control public, max-age=31536000, immutable and the right
# Content-Type, a journal object per batch, and last the manifest
# img/manifest/<layer>.json. The staging rule exists so a failed run cannot
# replace a good artifact. A content-addressed object cannot be "replaced"
# by a worse one: a key is either absent or holds that source's ladder, and
# held keys are never rewritten. Nothing points at a new object until the
# manifest does, and the manifest is written only after every object it
# names is in R2. Staging would instead push the ladder twice (about 9 GB
# for beaches) and the server-side promote would drop the per-object headers.
# What does go through staging is out/: the run report and a copy of the
# journals and manifest, promoted to archive/built/derive/ as the record.
#
# The takedown ledger, cache/photos/takedowns.json, is tracked in git but
# outside the worker's sparse clone; the clone widens to cache/photos before
# deriving, so a taken-down file is never uploaded again.
#
# The rescore hold refuses a layer here as it does in clip_sweep.sh: a cache
# packed mid-rebuild can be missing rows, and a manifest built from it would
# drop their photographs. Exit 5.
#
# Politeness: derive.py fetches through pipeline/beaches/sources.py with 2
# workers, the per-host pacer, maxlag=5 and the contact user agent, exactly
# as the harvests do. Only the encode uses every core.
#
# Exit: derive.py's own (0 ok, 1 over 5 per cent failed, 4 upload failed,
# 75 stopped by the ceiling with journals kept), 4 for a missing input, 5 for
# a hold, 6 when libvips cannot write AVIF or WebP (selfcheck).
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jobs_lib.sh"
CARTA_JOB_NAME=image_transcode
job_env_defaults
BUCKET="${CARTA_R2_BUCKET:-carta}"

[ $# -ge 1 ] || { jlog "usage: image_transcode.sh <beaches|lakes|mountains> [...] [-- derive.py options]"; exit 2; }
LAYERS=()
EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift; EXTRA=("$@"); break ;;
    beaches|lakes|mountains) LAYERS+=("$1") ;;
    *) jlog "unknown layer '$1' (beaches, lakes or mountains; the layers derive.py knows)"; exit 2 ;;
  esac
  shift
done
[ ${#LAYERS[@]} -ge 1 ] || { jlog "no layer given"; exit 2; }

# 1. Extract the layer caches at the repo root. --------------------------------
for layer in "${LAYERS[@]}"; do
  f="$CARTA_IN/$layer-cache.tar.gz"
  if [ ! -f "$f" ] && [ "$CARTA_JOB_DRY_RUN" != "1" ]; then
    jlog "missing input $f (is archive/caches/$layer-cache.tar.gz in R2? T045 pack.py and push.py put it there)"
    exit 4
  fi
  x tar -xzf "$f" -C "$CARTA_REPO"
done

# 2. The hold. ------------------------------------------------------------------
for layer in "${LAYERS[@]}"; do
  hold="$CARTA_REPO/cache/$layer/.rescore_hold"
  if [ -f "$hold" ]; then
    jlog "REFUSED: $layer carries $hold, so the R2 copy was packed while a rebuild held it:"
    sed 's/^/    /' "$hold"
    exit 5
  fi
done

# 3. The takedown ledger. -------------------------------------------------------
x git -C "$CARTA_REPO" sparse-checkout add cache/photos
if [ "$CARTA_JOB_DRY_RUN" != "1" ]; then
  if [ -f "$CARTA_REPO/cache/photos/takedowns.json" ]; then
    jlog "takedown ledger: $(grep -c '"needle"' "$CARTA_REPO/cache/photos/takedowns.json" || true) entries"
  else
    jlog "takedown ledger: none in the repository (no takedown has been recorded)"
  fi
fi

# 4. libvips can write both formats. ---------------------------------------------
cd "$CARTA_REPO"
x "$CARTA_PY" pipeline/photos/derive.py selfcheck || { jlog "libvips cannot write AVIF or WebP; see the selfcheck above"; exit 6; }

# 5. What R2 already holds, read-only. -----------------------------------------
PRIOR="$CARTA_WORK/prior"
HELD="$CARTA_WORK/held.txt"
x mkdir -p "$PRIOR"
x rclone copy "r2:$BUCKET/img/manifest" "$PRIOR" --fast-list --transfers 16 --stats 0
echo "+ rclone lsf -R --files-only --fast-list r2:$BUCKET/img --exclude manifest/** > $HELD"
if [ "$CARTA_JOB_DRY_RUN" != "1" ]; then
  rclone lsf -R --files-only --fast-list "r2:$BUCKET/img" --exclude "manifest/**" > "$HELD"
  jlog "img/ holds $(wc -l < "$HELD") objects"
fi

# 6. Derive, one layer at a time, every core for the encode. ---------------------
# The time budget. Measured on the laptop, a source takes about 5 s to fetch
# at the harvest's politeness (T049 report), so beaches does not fit one 8 h
# ceiling. derive.py stops starting fetches when its budget runs out, writes
# the manifest for what exists and exits 0; the next spawn continues. The
# budget is the ceiling left, minus worker.sh's push margin, minus 30 min for
# the last batch, the manifest and the setup of the next layer.
if [ -n "${CARTA_JOB_DEADLINE:-}" ]; then
  BUDGET_S=$(( CARTA_JOB_DEADLINE - $(date +%s) - ${CARTA_PUSH_MARGIN_S:-1200} - 1800 ))
else
  BUDGET_S="${CARTA_DERIVE_BUDGET_S:-21600}"
fi
[ "$BUDGET_S" -ge 600 ] || BUDGET_S=600
jlog "time budget ${BUDGET_S}s across ${#LAYERS[@]} layer(s)"
T_START=$(date +%s)
rc=0
for layer in "${LAYERS[@]}"; do
  left=$(( BUDGET_S - ($(date +%s) - T_START) ))
  if [ "$left" -lt 300 ]; then jlog "no budget left for $layer; next run"; break; fi
  jlog "deriving $layer"
  set +e
  x "$CARTA_PY" pipeline/photos/derive.py run "$layer" --upload r2 \
    --held "$HELD" --prior "$PRIOR" --work "$CARTA_WORK/derive-$layer" \
    --out "$CARTA_OUT" --encoders "$CARTA_THREADS" --budget-s "$left" \
    --run-id "${CARTA_RUN_ID:-local}" ${EXTRA[@]+"${EXTRA[@]}"}
  lrc=$?
  set -e
  jlog "$layer: derive.py exited $lrc"
  [ "$lrc" -eq 0 ] || rc=$lrc
  # The next layer can reuse what this one derived (a file shared by a beach
  # and a lake is one object): refresh the prior and the listing.
  if [ "$lrc" -eq 0 ] && [ "$CARTA_JOB_DRY_RUN" != "1" ] && [ "$layer" != "${LAYERS[${#LAYERS[@]}-1]}" ]; then
    rclone copy "r2:$BUCKET/img/manifest" "$PRIOR" --fast-list --transfers 16 --stats 0
    rclone lsf -R --files-only --fast-list "r2:$BUCKET/img" --exclude "manifest/**" > "$HELD"
  fi
done
exit "$rc"
