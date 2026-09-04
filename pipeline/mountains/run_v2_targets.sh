#!/usr/bin/env bash
# The two countries brief 05 names a number for, deepened to reach them.
#
# Replaces run_v2_norway.sh, which was written before terrain finished and
# before Great Britain's real number was visible.
#
# Where each one actually stands, measured after the full terrain pass:
#
#   GB  57 rated, target 60. NOT photo limited: 317 of 320 enriched rows
#       carry four photographs, the best rate in the layer. It is three short
#       simply because only 320 of its 500 shortlisted rows have been
#       enriched. Finishing the shortlist needs no re-harvest.
#
#   NO  31 rated, target 120. Photo limited and badly: 23.4% of its rows
#       reach four photographs against 36.8% across the layer, because
#       Commons has fewer pictures of minor Norwegian summits. Its pool is
#       107,077 rows after the OSM merge, so the mountains exist; the
#       pictures do not. Reaching 120 needs roughly 512 rows over the photo
#       bar, so this widens the shortlist to 900 and enriches all of it.
#
# Terrain is the reason GB moved from 28 to 57 without a single new row: the
# first export ran with terrain on 87 of 320 rows, so stature and views were
# thin and the score gate cut rows it should not have. Both stages below
# therefore measure before they export, never after.
#
#     bash pipeline/mountains/run_v2_targets.sh
#
# ASCII clean, no em dashes, per project convention.
set -u

PY=python
LOG=logs/mountains_v2_targets.log
mkdir -p logs
echo "[targets] started $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"

# Great Britain: no harvest, the shortlist already holds 500.
$PY -u pipeline/mountains/enrich_peaks.py --no-context --countries GB \
  --top 500 >> "$LOG" 2>&1
echo "[targets] GB enrich done" | tee -a "$LOG"

# Norway: a wider shortlist off the spines already on disk, then all of it.
$PY -u pipeline/mountains/harvest_peaks.py --refresh --countries NO \
  --shortlist 900 >> "$LOG" 2>&1
echo "[targets] NO harvest done" | tee -a "$LOG"

$PY -u pipeline/mountains/enrich_peaks.py --no-context --countries NO \
  --top 900 >> "$LOG" 2>&1
echo "[targets] NO enrich done" | tee -a "$LOG"

$PY -u pipeline/mountains/terrain.py --countries GB,NO --workers 5 >> "$LOG" 2>&1
echo "[targets] terrain done" | tee -a "$LOG"

$PY -u pipeline/mountains/season.py --countries GB,NO >> "$LOG" 2>&1
echo "[targets] season done" | tee -a "$LOG"

$PY -u pipeline/mountains/export_peaks.py --verbose >> "$LOG" 2>&1
echo "[targets] export done" | tee -a "$LOG"

$PY -u pipeline/regions/coverage.py >> "$LOG" 2>&1
$PY -u pipeline/regions/export_regions.py --all >> "$LOG" 2>&1
echo "[targets] finished $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"
