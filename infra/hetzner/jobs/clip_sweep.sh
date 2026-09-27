#!/usr/bin/env bash
# Job clip_sweep (T047): the photo engine's rescore pass (docs/PHOTOS.md,
# pipeline/photos/rescore.py) for one or more layers, on the CAX41.
#
#   spawn.sh clip_sweep lakes
#   spawn.sh clip_sweep beaches mountains
#
# Inputs, mirrored by worker.sh from archive/caches/ (T045's tarballs):
# <layer>-cache.tar.gz (the rich caches being re-ranked), photo-embeddings.tar.gz
# (cache/photos/emb, so only new photographs cost a CLIP pass) and
# photo-support.tar.gz (cache/photos/models: the ViT-L/14-quickgelu weights and
# the LAION head, so the box downloads no model). Each tarball holds
# repo-relative paths and is extracted at the repo root, exactly as
# `pipeline/archive/push.py --pull` does.
#
# The correctness guard. rescore.py refuses a layer whose cache carries
# cache/<layer>/.rescore_hold, because a rebuild in progress is rewriting the
# rows it would annotate. A hold inside the tarball means the copy in R2 was
# packed mid-rebuild, so the whole layer is refused here, before the model
# loads, with exit 5, even when the hold releases some countries: a partial
# release is a handover between two sessions on one machine, and the worker
# is neither of them. spawn.sh has already refused to spawn when the
# orchestrator's own checkout holds the layer.
#
# There is no memory guard. PHOTOS.md's stand-down protocol exists because
# CLIP wants about 2.5 GB and the laptop had 0.2 GB of 15.6 free beside a
# harvest fleet. A CAX41 has 31 GB and runs this job alone.
#
# Layers run one after another, each with every core. Running them side by
# side would share cache/photos/emb, and aesthetics.embed() writes each vector
# through a fixed <key>.tmp name, so two processes scoring the same file (a
# photograph in both the lakes and the mountains cache) could race on it.
# Scoring is paced by the 0.3 s thumbnail fetch anyway (rescore.py PACE_S).
#
# Output: out/<layer>-cache.tar.gz and out/photo-embeddings.tar.gz, written by
# pipeline/archive/pack.py so the format and the member paths are exactly
# T045's. spawn.sh promotes them to archive/caches/ only after an ok status and
# only if no hold appeared on the orchestrator meanwhile.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jobs_lib.sh"
CARTA_JOB_NAME=clip_sweep
job_env_defaults

[ $# -ge 1 ] || { jlog "usage: clip_sweep.sh <beaches|lakes|mountains> [...] [-- rescore.py options]"; exit 2; }
LAYERS=()
EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift; EXTRA=("$@"); break ;;
    beaches|lakes|mountains) LAYERS+=("$1") ;;
    *) jlog "unknown layer '$1' (beaches, lakes or mountains; the three rescore.py knows)"; exit 2 ;;
  esac
  shift
done
[ ${#LAYERS[@]} -ge 1 ] || { jlog "no layer given"; exit 2; }

# 1. Extract the inputs at the repo root. -------------------------------------
tarballs=(photo-support photo-embeddings)
for layer in "${LAYERS[@]}"; do tarballs+=("$layer-cache"); done
for t in "${tarballs[@]}"; do
  f="$CARTA_IN/$t.tar.gz"
  if [ ! -f "$f" ] && [ "$CARTA_JOB_DRY_RUN" != "1" ]; then
    jlog "missing input $f (is archive/caches/$t.tar.gz in R2? T045 pack.py and push.py put it there)"
    exit 4
  fi
  x tar -xzf "$f" -C "$CARTA_REPO"
done

# 2. The hold, before the model loads. ----------------------------------------
for layer in "${LAYERS[@]}"; do
  hold="$CARTA_REPO/cache/$layer/.rescore_hold"
  if [ -f "$hold" ]; then
    jlog "REFUSED: $layer carries $hold, so the R2 copy was packed while a rebuild held it:"
    sed 's/^/    /' "$hold"
    jlog "finish the rebuild, delete the hold, pack and push the layer, then spawn again"
    exit 5
  fi
done

# 3. Rescore, one layer at a time, every core. --------------------------------
cd "$CARTA_REPO"
export CARTA_RUN_ID="${CARTA_RUN_ID:-}"
for layer in "${LAYERS[@]}"; do
  jlog "$layer: rescore with $CARTA_THREADS threads"
  t0=$(date +%s)
  x "$CARTA_PY" pipeline/photos/rescore.py "$layer" ${EXTRA[@]+"${EXTRA[@]}"}
  jlog "$layer: rescored in $(( $(date +%s) - t0 )) s"
done

# 4. Pack what changed, in T045's format. -------------------------------------
x mkdir -p "$CARTA_OUT"
for layer in "${LAYERS[@]}"; do
  x "$CARTA_PY" pipeline/archive/pack.py --only "$layer-cache" --out "$CARTA_OUT" --force
done
x "$CARTA_PY" pipeline/archive/pack.py --only photo-embeddings --out "$CARTA_OUT" --force
# pack.py keeps a pack_state.json beside its tarballs; it describes this box's
# files, not the archive, so it is not promoted.
x rm -f "$CARTA_OUT/pack_state.json"
jlog "done: $(cd "$CARTA_OUT" 2>/dev/null && ls -1 | tr '\n' ' ')"
