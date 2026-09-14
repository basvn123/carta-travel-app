#!/usr/bin/env bash
# The v2 backfill, in the order the stages depend on each other, one at a time.
#
# Written as a script rather than typed as a chain because it is hours of work
# and it has to survive a closed terminal: every stage below is cache first and
# resumable, so re-running this after an interruption picks up rather than
# starts over.
#
#   1  enrich    the countries whose OSM spine has landed, at ENRICH_TOP.
#                --no-context on purpose: Overpass is saturated while the
#                spine harvest is still running, and the access sweep is
#                separable (see docs/MOUNTAINS.md, "Overpass is optional").
#   2  terrain   the coordinates the new rows added
#   3  season    the same, one call per 0.5 degree climatology cell
#   4  rescore   the photo engine's beauty rank over the new galleries
#   5  export    score, gate, tier, quota, floor, validate, write
#   6  coverage  the audit and the backlog CSVs
#   7  regions   the region pages, which is where listed rows are read
#
# Run from the repo root:
#     bash pipeline/mountains/run_v2_backfill.sh
#
# ASCII clean, no em dashes, per project convention.
set -u

PY=python
LOG=logs/mountains_v2_backfill.log
mkdir -p logs
echo "[backfill] started $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"

# Countries whose OSM spine is cached. Recomputed at run time rather than
# hard coded, so a spine that lands later is picked up by the next run.
COUNTRIES=$($PY - <<'PYEOF'
import glob, os
have = sorted(os.path.basename(f)[4:-5] for f in glob.glob("cache/mountains/osm_*.json"))
print(",".join(have))
PYEOF
)
echo "[backfill] enriching: $COUNTRIES" | tee -a "$LOG"

$PY -u pipeline/mountains/enrich_peaks.py --no-context --countries "$COUNTRIES" >> "$LOG" 2>&1
echo "[backfill] enrich done" | tee -a "$LOG"

$PY -u pipeline/mountains/terrain.py --workers 5 >> "$LOG" 2>&1
echo "[backfill] terrain done" | tee -a "$LOG"

$PY -u pipeline/mountains/season.py >> "$LOG" 2>&1
echo "[backfill] season done" | tee -a "$LOG"

# One writer per layer at a time: rescore writes the rich caches, so it runs
# after enrich has finished with them and before the export reads them.
$PY -u pipeline/photos/rescore.py mountains >> "$LOG" 2>&1
echo "[backfill] photo rescore done" | tee -a "$LOG"

$PY -u pipeline/mountains/export_peaks.py --verbose >> "$LOG" 2>&1
echo "[backfill] export done" | tee -a "$LOG"

$PY -u pipeline/regions/coverage.py >> "$LOG" 2>&1
$PY -u pipeline/regions/export_regions.py --all >> "$LOG" 2>&1
echo "[backfill] finished $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"
