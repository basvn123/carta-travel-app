#!/usr/bin/env bash
# Round three, resumed. The first attempt died in a DNS outage partway
# through France: five countries were enriched and cached, France was not,
# and the shell went with it.
#
# Two differences from run_v2_round3.sh, both deliberate:
#
#   no harvest      all six raw_CC.json were rebuilt before the outage and
#                   --refresh would re-query Wikidata for nothing.
#   no rescore      the export runs FIRST and the beauty rank comes later.
#                   The photo component is weight 0.02 of seven and is
#                   dropped and renormalised when absent, so holding six
#                   countries out of the wire for hours to make the smallest
#                   term exact is the wrong trade. run_v2_rescore.sh queues
#                   behind the lakes pass and re-exports when it lands.
#
# Every stage is cache first, so the five enriched countries cost seconds.
#
#     bash pipeline/mountains/run_v2_round3b.sh
#
# ASCII clean, no em dashes, per project convention.
set -u

PY=python
LOG=logs/mountains_v2_round3b.log
CC=NL,GB,SE,ES,NO,FR
mkdir -p logs
echo "[round3b] started $(date -u +%Y-%m-%dT%H:%M:%SZ) for $CC" | tee -a "$LOG"

$PY -u pipeline/mountains/enrich_peaks.py --no-context --countries "$CC" >> "$LOG" 2>&1
echo "[round3b] enrich done" | tee -a "$LOG"

$PY -u pipeline/mountains/terrain.py --countries "$CC" --workers 5 >> "$LOG" 2>&1
echo "[round3b] terrain done" | tee -a "$LOG"

$PY -u pipeline/mountains/season.py --countries "$CC" >> "$LOG" 2>&1
echo "[round3b] season done" | tee -a "$LOG"

$PY -u pipeline/mountains/export_peaks.py --verbose >> "$LOG" 2>&1
echo "[round3b] export done" | tee -a "$LOG"

$PY -u pipeline/regions/coverage.py >> "$LOG" 2>&1
$PY -u pipeline/regions/export_regions.py --all >> "$LOG" 2>&1
echo "[round3b] finished $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"
