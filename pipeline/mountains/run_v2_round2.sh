#!/usr/bin/env bash
# Round two: the countries whose OSM spine landed after the first backfill had
# already enriched them. Same stage order as run_v2_backfill.sh, narrowed to
# the five countries whose pool actually changed, so this is hours rather than
# a day. Run from the repo root:
#
#     bash pipeline/mountains/run_v2_round2.sh
#
# ASCII clean, no em dashes, per project convention.
set -u

PY=python
LOG=logs/mountains_v2_round2.log
CC=FI,IS,IT,MC,PT
mkdir -p logs
echo "[round2] started $(date -u +%Y-%m-%dT%H:%M:%SZ) for $CC" | tee -a "$LOG"

$PY -u pipeline/mountains/enrich_peaks.py --no-context --countries "$CC" >> "$LOG" 2>&1
echo "[round2] enrich done" | tee -a "$LOG"

$PY -u pipeline/mountains/terrain.py --countries "$CC" --workers 5 >> "$LOG" 2>&1
echo "[round2] terrain done" | tee -a "$LOG"

$PY -u pipeline/mountains/season.py --countries "$CC" >> "$LOG" 2>&1
echo "[round2] season done" | tee -a "$LOG"

$PY -u pipeline/photos/rescore.py mountains >> "$LOG" 2>&1
echo "[round2] photo rescore done" | tee -a "$LOG"

$PY -u pipeline/mountains/export_peaks.py --verbose >> "$LOG" 2>&1
echo "[round2] export done" | tee -a "$LOG"

$PY -u pipeline/regions/coverage.py >> "$LOG" 2>&1
$PY -u pipeline/regions/export_regions.py --all >> "$LOG" 2>&1
echo "[round2] finished $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"
