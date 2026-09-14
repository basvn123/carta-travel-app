#!/usr/bin/env bash
# Round three: the six countries whose OSM spine was still being harvested
# when rounds one and two ran. ES, FR, GB, NL, NO and SE are between them
# most of the layer's remaining headroom, and two of the brief's numbered
# targets (GB 60, NO 120) are theirs.
#
# It waits for the spine rather than racing it: osm_spine.py checkpoints per
# tile and marks a country `partial` until its last tile lands, so "ready"
# means the cache exists and is not partial. Waiting is the whole reason this
# is a script; everything after the wait is the same stage order as the other
# two rounds.
#
#     bash pipeline/mountains/run_v2_round3.sh
#
# ASCII clean, no em dashes, per project convention.
set -u

PY=python
LOG=logs/mountains_v2_round3.log
CC_LIST="NL GB SE ES NO FR"
mkdir -p logs
echo "[round3] waiting for spines: $CC_LIST" | tee -a "$LOG"

ready() {
  $PY - "$@" <<'PYEOF'
import json, sys, pathlib
missing = []
for cc in sys.argv[1:]:
    p = pathlib.Path("cache/mountains") / f"osm_{cc}.json"
    if not p.exists():
        missing.append(cc)
        continue
    try:
        if json.loads(p.read_text(encoding="utf-8")).get("partial"):
            missing.append(cc)
    except Exception:
        missing.append(cc)
print(",".join(missing))
sys.exit(1 if missing else 0)
PYEOF
}

# Six hours is the ceiling, not the expectation: 103 tiles at the pace a
# loaded Overpass answers. If it is still not done by then, the stages below
# run for whatever HAS landed, because a spine that never arrives must not
# hold the whole layer hostage.
waited=0
while ! ready $CC_LIST > /dev/null 2>&1; do
  if [ "$waited" -ge 21600 ]; then
    echo "[round3] gave up waiting after 6h, running with what landed" | tee -a "$LOG"
    break
  fi
  sleep 120
  waited=$((waited + 120))
done
echo "[round3] spines ready (or timed out) after ${waited}s" | tee -a "$LOG"

# Only the countries whose spine actually arrived, so a country still mid
# harvest is left for a later run rather than half harvested into the wire.
CC=$($PY - <<'PYEOF'
import json, pathlib
out = []
for cc in ("NL", "GB", "SE", "ES", "NO", "FR"):
    p = pathlib.Path("cache/mountains") / f"osm_{cc}.json"
    if p.exists():
        try:
            if not json.loads(p.read_text(encoding="utf-8")).get("partial"):
                out.append(cc)
        except Exception:
            pass
print(",".join(out))
PYEOF
)
if [ -z "$CC" ]; then
  echo "[round3] no spine landed, nothing to do" | tee -a "$LOG"
  exit 0
fi
echo "[round3] running for $CC" | tee -a "$LOG"

$PY -u pipeline/mountains/harvest_peaks.py --refresh --countries "$CC" >> "$LOG" 2>&1
echo "[round3] harvest done" | tee -a "$LOG"

$PY -u pipeline/mountains/enrich_peaks.py --no-context --countries "$CC" >> "$LOG" 2>&1
echo "[round3] enrich done" | tee -a "$LOG"

$PY -u pipeline/mountains/terrain.py --countries "$CC" --workers 5 >> "$LOG" 2>&1
echo "[round3] terrain done" | tee -a "$LOG"

$PY -u pipeline/mountains/season.py --countries "$CC" >> "$LOG" 2>&1
echo "[round3] season done" | tee -a "$LOG"

# One rescore on this machine at a time.
#
# pipeline/photos/rescore.py is CPU bound on a CLIP forward pass and this box
# is shared with the lakes and cycling layers, both of which run the same
# tool. The lakes session measured its own rate go from 3 images a minute to
# 12 the moment two other passes stopped competing for cores, which is the
# whole argument: two rescores do not run twice as fast, they run at half
# speed each and finish later than if they had queued. Waiting costs nothing
# because the export below is the only thing that needs it, and a beauty
# rank that arrives an hour late changes no gate.
# Not pgrep, which Git Bash does not have, and not `ps -W`, whose output
# stops before the command line so every grep for a script name matches
# nothing. Asking Windows directly is the only check on this box that
# actually answers the question; the first version of this wait used
# `ps -W | grep`, matched nothing instantly, and ran two jobs at once.
rescore_running() {
  MSYS_NO_PATHCONV=1 powershell.exe -NoProfile -Command "if ((Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -like '*rescore.py*' } | Measure-Object).Count -gt 0) { exit 0 } else { exit 1 }" > /dev/null 2>&1
}

waited=0
while rescore_running; do
  if [ "$waited" -ge 43200 ]; then
    echo "[round3] rescore slot never freed in 12h, exporting without it" \
      | tee -a "$LOG"
    break
  fi
  if [ "$waited" -eq 0 ]; then
    echo "[round3] another rescore is running, queueing behind it" | tee -a "$LOG"
  fi
  sleep 300
  waited=$((waited + 300))
done
$PY -u pipeline/photos/rescore.py mountains >> "$LOG" 2>&1
echo "[round3] photo rescore done" | tee -a "$LOG"

$PY -u pipeline/mountains/export_peaks.py --verbose >> "$LOG" 2>&1
echo "[round3] export done" | tee -a "$LOG"

$PY -u pipeline/regions/coverage.py >> "$LOG" 2>&1
$PY -u pipeline/regions/export_regions.py --all >> "$LOG" 2>&1
echo "[round3] finished $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"
