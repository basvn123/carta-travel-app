#!/usr/bin/env bash
# Job valhalla_tiles (T047): build Valhalla routing tiles for one or more
# countries on the CAX41 and leave them in out/<slug>/ for R2.
#
#   spawn.sh valhalla_tiles switzerland
#   spawn.sh valhalla_tiles france norway
#
# The same build tools/trailslab/valhalla/docker-compose.yml runs on the laptop,
# with the same image and the same switches (admins on, time zones and
# elevation off, one Geofabrik extract per tile directory, never all of Europe),
# minus the server: serve_tiles=False makes the scripted image build and exit
# instead of serving /route on 8002. The image is multi-arch; T006 confirmed
# the upstream workflow builds arm64 on purpose.
#
# Input: the newest <slug>-latest.osm.pbf under CARTA_IN, which worker.sh
# mirrors from archive/inputs/geofabrik/<date>/ (T045's osm-extracts class).
# Output, per slug: out/<slug>/valhalla_tiles.tar (the tile set, the file
# Valhalla serves from), valhalla.json, admin_data/ when built, and SOURCE.txt
# naming the extract and its sha256. spawn.sh promotes out/ to
# archive/built/valhalla/, so a consumer pulls
#   rclone copy r2:carta/archive/built/valhalla/<slug> tools/trailslab/valhalla/data/<slug>
# and starts the lab's compose stack over tiles it did not have to build.
#
# Environment: the contract in selftest.sh, plus
#   VALHALLA_IMAGE  default ghcr.io/valhalla/valhalla-scripted:latest, the tag
#                   the compose file uses. T006 recorded the digest it resolved
#                   to (sha256:f9f12c3f...); pin a full digest here once a live
#                   build has proven one.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jobs_lib.sh"
CARTA_JOB_NAME=valhalla_tiles
job_env_defaults
IMAGE="${VALHALLA_IMAGE:-ghcr.io/valhalla/valhalla-scripted:latest}"

[ $# -ge 1 ] || { jlog "usage: valhalla_tiles.sh <geofabrik-slug> [<slug>...]"; exit 2; }
for slug in "$@"; do
  valid_job_arg "$slug" || { jlog "bad slug '$slug'"; exit 2; }
done

if [ "$CARTA_JOB_DRY_RUN" != "1" ]; then
  command -v docker >/dev/null || { jlog "docker is not installed (worker.sh installs it for jobs that need docker)"; exit 1; }
fi

for slug in "$@"; do
  # Dated folders sort by name (2026-08-06 < 2026-08-13), so the last is newest.
  pbf="$(ls -1 "$CARTA_IN"/*/"$slug"-latest.osm.pbf 2>/dev/null | sort | tail -n 1 || true)"
  if [ -z "$pbf" ]; then
    if [ "$CARTA_JOB_DRY_RUN" = "1" ]; then
      pbf="$CARTA_IN/<date>/$slug-latest.osm.pbf"
    else
      jlog "no $slug-latest.osm.pbf under $CARTA_IN (is it in archive/inputs/geofabrik?)"
      exit 4
    fi
  fi
  dir="$CARTA_WORK/valhalla/$slug"
  jlog "$slug: building from $pbf with $CARTA_THREADS threads"
  x mkdir -p "$dir" "$CARTA_OUT/$slug"
  x cp "$pbf" "$dir/$slug-latest.osm.pbf"
  # The scripted image runs as the valhalla user (uid 59999) and writes into
  # /custom_files; the worker runs this as root, so hand the directory over.
  x chown -R 59999:59999 "$dir"
  t0=$(date +%s)
  x docker run --rm --name "carta-valhalla-$slug" \
    -v "$dir:/custom_files" \
    -e serve_tiles=False \
    -e build_admins=True \
    -e build_time_zones=False \
    -e build_elevation=False \
    -e build_tar=True \
    -e force_rebuild=True \
    -e server_threads="$CARTA_THREADS" \
    "$IMAGE"
  if [ "$CARTA_JOB_DRY_RUN" != "1" ] && [ ! -s "$dir/valhalla_tiles.tar" ]; then
    jlog "$slug: the build ended without $dir/valhalla_tiles.tar"
    exit 1
  fi
  x cp "$dir/valhalla_tiles.tar" "$dir/valhalla.json" "$CARTA_OUT/$slug/"
  if [ -d "$dir/admin_data" ] || [ "$CARTA_JOB_DRY_RUN" = "1" ]; then
    x cp -r "$dir/admin_data" "$CARTA_OUT/$slug/"
  fi
  if [ "$CARTA_JOB_DRY_RUN" != "1" ]; then
    {
      echo "extract: ${pbf#"$CARTA_IN"/}"
      echo "sha256: $(sha256sum "$pbf" | cut -d' ' -f1)"
      echo "image: $IMAGE $(docker image inspect --format '{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null || true)"
      echo "threads: $CARTA_THREADS"
      echo "build_seconds: $(( $(date +%s) - t0 ))"
    } > "$CARTA_OUT/$slug/SOURCE.txt"
  fi
  jlog "$slug: done in $(( $(date +%s) - t0 )) s"
done
