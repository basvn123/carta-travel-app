#!/usr/bin/env bash
# The countries the main pass defers over --max-gb, run ONE AT A TIME and
# never alongside another pass that reads a Geofabrik extract.
#
# WHY SERIAL. Area assembly is memory bound: Austria at 0.81 GB of extract sat
# at 1.26 GB resident, so France at 5.1 GB is several times that. Two
# multi-gigabyte scans side by side is how Postgres went into crash recovery
# earlier today.
#
# WHY THE GUARD WATCHES MORE THAN LAND COVER. The main pass's `services` step
# reads the same .osm.pbf files with the same pyosmium machinery, and so does
# harvest_cycling. Waiting only for other land-cover passes would still pair
# this with one of those. An earlier version waited for one named process,
# the condition silently failed, and it started Poland next to a running
# Great Britain AND the main pass. Hence: wait for extract work to be idle
# entirely, and recheck before every country rather than once at the top.
#
# WHY IT HAS TO FINISH FIRST. These five are 15.7 GB of the catalogue's
# extract weight. If scenic runs before them, every route in the five biggest
# countries drops its land-cover component and renormalises. That is honest
# and it is not the answer anybody wants for Germany and France.
set -u
cd "$(dirname "$0")/../.." || exit 1

PS_COUNT="((Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -like '*landcover*' -or \$_.CommandLine -like '*steps services*' -or \$_.CommandLine -like '*harvest_cycling*' }) | Measure-Object).Count"

extract_passes_running () {
  local n
  n=$(powershell -NoProfile -Command "$PS_COUNT" 2>/dev/null | tr -d '\r\n ')
  case "$n" in ''|*[!0-9]*) echo 0 ;; *) echo "$n" ;; esac
}

wait_idle () {
  local n
  while :; do
    n=$(extract_passes_running)
    [ "$n" -eq 0 ] && return 0
    echo "    waiting: $n extract pass(es) running $(date +%H:%M:%S)"
    sleep 60
  done
}

already_done () {
  python - "$1" <<'PY'
import sys, os
sys.path.insert(0, os.path.abspath('pipeline/cycling'))
import cycle_sources as S
with S.lab_connect() as c, c.cursor() as cur:
    cur.execute("select count(*) from cycle_landcover where country=%s",
                (sys.argv[1],))
    print(cur.fetchone()[0])
PY
}

# LV is here because its first pass WEDGED mid-write (psycopg3 executemany in
# pipeline mode, INSERT stuck in ClientRead for 66 minutes) and left 16,917
# rows behind. The resumable skip in landcover.py cannot tell a partial
# country from a finished one, so it needs an explicit --refresh.
for cc in LV GB PL IT ES DE FR; do
  wait_idle
  have=$(already_done "$cc")
  case "${have:-0}" in ''|*[!0-9]*) have=0 ;; esac
  # A partially written country reads as "has rows", so the threshold is high
  # enough that only a finished pass clears it and a killed one re-runs.
  if [ "$cc" != "LV" ] && [ "$have" -gt 50000 ]; then
    echo "=== $cc already has $have polygons, skipping ==="
    continue
  fi
  echo "=== $cc : $(date +%H:%M:%S) ==="
  # --refresh, because a country reaching this queue either has nothing or has
  # a partial write worth discarding.
  python pipeline/cycling/landcover.py --countries "$cc" --refresh
  echo "    $cc exit=$? $(date +%H:%M:%S)"
done
echo "=== deferred countries done $(date +%H:%M:%S) ==="
