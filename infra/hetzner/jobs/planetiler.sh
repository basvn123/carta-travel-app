#!/usr/bin/env bash
# Job planetiler (T047): a STUB. It exits 3 and builds nothing.
#
# Why it is a stub. CARTA_CLOUD_ARCHITECTURE.md section 6.2 lists Planetiler
# among the CAX41's jobs, but section 5.4 says to leave the basemap alone
# (Carto's hosted tiles are free and already in the CSP), and the one tiling job
# the plan does want, pins.pmtiles in section 5.3, is a tippecanoe build from the
# destination GeoJSON, not Planetiler. Nothing in this repository pins a
# Planetiler version, carries a profile, or reads a Planetiler output
# (T006: "tools the architecture names but the repo does not pin yet"). A
# wrapper around a build nobody consumes would only produce a bill.
#
# Decision (T324, register row T047-h): KEEP the stub, do not remove the job.
# Removing it would touch jobs.tsv, cax41/verify.sh and the README for no
# gain, and the stub costs nothing: spawn.sh planetiler would start a server,
# exit 3 at once and delete it after one started hour (EUR 0.06). Nothing in
# the repository consumes a Planetiler output, and architecture section 5.4
# says to leave the basemap alone, so there is nothing to build. The stub is
# revisited only if the owner decides to self-host a basemap; until then the
# row stays closed. The exit 3 is the contract: a caller that spawns it gets
# a refusal, never an empty artifact.
#
# What it would run, once a task decides to self-host a basemap. T006 checked
# both routes on arm64: the multi-arch image ghcr.io/onthegomap/planetiler
# (amd64 + arm64) and the architecture-neutral planetiler.jar v0.10.2 on
# Temurin 17. With the Geofabrik extract the jobs table mirrors into CARTA_IN:
#
#   docker run --rm -v "$CARTA_IN:/data/in:ro" -v "$CARTA_OUT:/data/out" \
#     ghcr.io/onthegomap/planetiler:<pinned digest> \
#     --osm-path=/data/in/<date>/<area>-latest.osm.pbf \
#     --output=/data/out/<area>.pmtiles --threads="$CARTA_THREADS" \
#     --download --force
#
# The jobs table already routes its inputs (the Geofabrik extracts) and its
# output prefix (tiles/basemap), so replacing this body is the whole change.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jobs_lib.sh"
CARTA_JOB_NAME=planetiler
job_env_defaults
jlog "not implemented: no Planetiler profile or consumer exists in this repository (architecture section 5.4); see the header of this script"
exit 3
