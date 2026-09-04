#!/usr/bin/env bash
# The photo beauty rank, and the re-export that uses it.
#
# Split out of the round scripts on purpose. rescore.py is CPU bound on a
# CLIP forward pass and this machine runs three layers that all want it, so
# it queues rather than competes: the lakes session measured its own rate go
# from 3 images a minute to 12 the moment two other passes stopped taking
# cores. Two rescores do not run twice as fast, they run at half speed each
# and both finish later than if they had queued.
#
# Nothing waits on this. The wire is already published without the `photo`
# component, which is 0.02 of seven and is dropped and renormalised when
# absent rather than scored zero, so this run improves a rank rather than
# unblocking one.
#
#     bash pipeline/mountains/run_v2_rescore.sh
#
# ASCII clean, no em dashes, per project convention.
set -u

PY=python
LOG=logs/mountains_v2_rescore.log
mkdir -p logs

# Not pgrep, which Git Bash does not have, and not `ps -W`, whose output
# stops before the command line so every grep for a script name matches
# nothing. Asking Windows directly is the only check on this box that
# actually answers the question.
rescore_running() {
  MSYS_NO_PATHCONV=1 powershell.exe -NoProfile -Command "if ((Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -like '*rescore.py*' } | Measure-Object).Count -gt 0) { exit 0 } else { exit 1 }" > /dev/null 2>&1
}

echo "[rescore] waiting for a free slot $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"
waited=0
while rescore_running; do
  if [ "$waited" -ge 43200 ]; then
    echo "[rescore] slot never freed in 12h, giving up" | tee -a "$LOG"
    exit 0
  fi
  sleep 300
  waited=$((waited + 300))
done
echo "[rescore] slot free after ${waited}s, starting" | tee -a "$LOG"

$PY -u pipeline/photos/rescore.py mountains >> "$LOG" 2>&1
echo "[rescore] rescore done" | tee -a "$LOG"

# The credits, in the same chain and immediately before the export.
#
# 33 photographs in the mountain wire carry a licence and no author, which is
# the credit removed and the licence notice kept: worse than shipping neither,
# because it looks like compliance. fill_authors re-asks Commons for
# Attribution and Credit as well as Artist, waives the files Commons says owe
# nothing, and stops shipping the ones owing a credit that exists nowhere.
#
# It runs HERE rather than in the photo engine's own session because it does a
# read-modify-write of the same rich_CC.json that rescore.py above has just
# written, and two processes doing that silently drop each other's fields.
# Chaining it is the only way to guarantee the order without two sessions
# agreeing on a clock.
#
# Measured cost, from a dry run against the current caches: 17 authors filled,
# 34 waived because Commons says they owe nothing, 90 photographs dropped
# because a credit is owed and exists nowhere, and 8 rated rows falling to
# listed as their galleries thin below four. No row is left with nothing. That
# trade is the right way round: a missing credit costs US a picture, never a
# reader a false notice, and a drop can only demote a row, never delete it. If
# an author turns up on Commons later the photograph returns by itself at the
# next export.
#
# PYTHONIOENCODING is belt and braces. The tool now reconfigures its own
# streams on win32, but it once died in a progress line on the c-hacek in
# Kroficka without reaching the write, and a licence fix should not be one
# cosmetic print away from not happening.
PYTHONIOENCODING=utf-8 $PY -u pipeline/photos/fill_authors.py   --layers mountains >> "$LOG" 2>&1
echo "[rescore] author credits filled" | tee -a "$LOG"

$PY -u pipeline/mountains/export_peaks.py --verbose >> "$LOG" 2>&1
echo "[rescore] re-export done $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"
