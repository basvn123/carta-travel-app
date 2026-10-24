#!/usr/bin/env bash
# Job trailslab (T647, owner decision D5): the trails lab on an on-demand
# worker, so the weekly run does not need the owner's laptop.
#
#   spawn.sh trailslab                    worker-key mode, every country with trips
#   spawn.sh trailslab plain              the dump is read and written unencrypted
#   spawn.sh trailslab worker-key CH,LI   two countries only (a test run)
#
# Runs on an x86 worker (jobs.tsv server_type cpx42): the laptop's lab, which
# made the dump, runs the amd64-only pgrouting/pgrouting:17-3.5-3.7 image, and
# this job restores into the same image. On an arm64 worker it falls back to
# the multi-arch imresamu image tools/trailslab/docker-compose.yml names.
#
# In order, every step logged to out/reports/steps.tsv with its exit code and
# seconds, and its output to out/reports/logs/:
#   1. keys     import the worker key and the owner's public key (worker-key)
#   2. lab      docker run the lab image on 127.0.0.1:5433, tuned for a box
#               that is thrown away (fsync off)
#   3. restore  the newest trailslab dump in archive/db/ that this mode can
#               read: downloaded, decrypted, pg_restore -j with the PGDG client
#               (the dumps come from pg_dump 18), ANALYZE, trips counted
#   4. loop     per country with hikes in the lab, smallest risk first: the
#               Geofabrik extract (archive/inputs/geofabrik/<date>/ in R2 when
#               not older than CARTA_TRAILSLAB_EXTRACT_MAX_AGE_D, default 35
#               days, else download.geofabrik.de with its .md5), then
#                 python pipeline/trails/way_tags.py --refresh --countries CC
#                 python pipeline/trails/transit_stops.py --countries CC
#               then the extract is deleted and its date and replication
#               timestamp written to out/reports/extracts.tsv. The loop stops
#               early when less than CARTA_TRAILSLAB_RESERVE_S (default 9000 s)
#               of the ceiling is left, so the exports and the dump still fit.
#   5. trails   python pipeline/trails/export_wire.py --no-promote, over the
#               previous wire the orchestrator uploaded, then
#               pipeline/field_stubs/gate.py --layer trails and
#               pipeline/trails/difficulty_gate.py against that previous wire.
#               Passed: out/wires/trails.tar.gz. Failed: nothing, the previous
#               wire stays live.
#   6. cycling  python pipeline/cycling/export_cycling.py, gate.py --layer
#               cycling, out/wires/cycling.tar.gz on a pass
#   7. dump     pg_dump -Fc of the lab, checked with pg_restore -l, encrypted
#               to the owner's key and the worker key (or plain), decrypted
#               once more and compared by sha256, in out/db/
#   8. out/MANIFEST.txt says what is in out/ and what passed; the orchestrator
#               (infra/hetzner/cax41/trailslab_worker.py) reads only that
#
# --no-promote: the worker never moves an approved trip to published. That is
# the human review step's to take, on the laptop or by hand; here it would
# change the row set the difficulty gate holds fixed (17,619 rows when T642
# measured it) and write a publish decision nobody made into the dump.
#
# Inputs (worker.sh mirrors archive/inputs/trailslab/support/ into CARTA_IN):
#   support/nuts3_2021.geojson   the LFS file export_wire.py files rows by
#   support/wires-prev.tar.gz    the orchestrator's live top-level wire files
# Exit codes: 0 the dump is in out/ (a layer that failed its gate is in the
# MANIFEST, not in the exit code: the dump is the part that must not be lost),
# 1 the lab could not be restored or dumped, 2 bad arguments, 4 an input is
# missing (no support files, no dump this mode can read).
# Environment: the contract in selftest.sh, plus CARTA_JOB_DEADLINE and the
# CARTA_WORKER_GPG_*_B64 keys from worker.conf, and the CARTA_TRAILSLAB_*
# knobs named above. TRAILSLAB_IMAGE overrides the lab image.
set -uo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jobs_lib.sh"
CARTA_JOB_NAME=trailslab
job_env_defaults
DRY="$CARTA_JOB_DRY_RUN"
BUCKET="${CARTA_R2_BUCKET:-carta}"
PY="$CARTA_PY"
REPO="$CARTA_REPO"

CRYPT=worker-key; ONLY=""
for a in "$@"; do
  case "$a" in
    plain|worker-key) CRYPT="$a" ;;
    *) if [[ "$a" =~ ^[A-Z]{2}(,[A-Z]{2})*$ ]]; then ONLY="$a"
       else jlog "unknown argument '$a' (plain, worker-key or a CC,CC list)"; exit 2; fi ;;
  esac
done

ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
case "$ARCH" in x86_64) ARCH=amd64 ;; aarch64) ARCH=arm64 ;; esac
COMPOSE_IMAGE="$(sed -n 's/.*TRAILSLAB_IMAGE:-\([^}]*\)}.*/\1/p' "$REPO/tools/trailslab/docker-compose.yml" 2>/dev/null | head -n 1)"
if [ "$ARCH" = "amd64" ]; then
  IMAGE="${TRAILSLAB_IMAGE:-pgrouting/pgrouting:17-3.5-3.7}"
else
  IMAGE="${TRAILSLAB_IMAGE:-${COMPOSE_IMAGE:-imresamu/postgis:17-3.5-bundle0-bookworm}}"
fi
GEOFABRIK="${CARTA_GEOFABRIK_BASE:-https://download.geofabrik.de/europe}"
MAX_AGE_D="${CARTA_TRAILSLAB_EXTRACT_MAX_AGE_D:-35}"
RESERVE_S="${CARTA_TRAILSLAB_RESERVE_S:-9000}"
DUMP_RESERVE_S="${CARTA_TRAILSLAB_DUMP_RESERVE_S:-4500}"
PG_OPTS="${CARTA_TRAILSLAB_PG_OPTS:--c shared_buffers=4GB -c maintenance_work_mem=1GB -c work_mem=64MB -c max_wal_size=16GB -c checkpoint_timeout=30min -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_parallel_maintenance_workers=4}"
# The job's own end: worker.sh keeps its push margin back from the deadline.
END_S=$(( ${CARTA_JOB_DEADLINE:-$(( $(date +%s) + 36000 ))} - ${CARTA_PUSH_MARGIN_S:-1200} ))
left() { echo $(( END_S - $(date +%s) )); }

export TRAILSLAB_HOST=127.0.0.1 TRAILSLAB_PORT=5433 TRAILSLAB_DB=trailslab TRAILSLAB_USER=trailslab \
       TRAILSLAB_PASSWORD=trailslab PGPASSWORD=trailslab
export INGEST_DATA_DIR="$CARTA_WORK/raw"
PGC=(-h 127.0.0.1 -p 5433 -U trailslab -d trailslab)
REPORTS="$CARTA_OUT/reports"; LOGD="$REPORTS/logs"
STEPS="$REPORTS/steps.tsv"; EXTRACTS="$REPORTS/extracts.tsv"; MANIFEST="$CARTA_OUT/MANIFEST.txt"
x mkdir -p "$LOGD" "$CARTA_OUT/db" "$CARTA_OUT/wires" "$CARTA_WORK" "$INGEST_DATA_DIR/geofabrik"
if [ "$DRY" != "1" ]; then
  printf 'step\tcountry\texit_code\tseconds\tstarted_at\n' > "$STEPS"
  printf 'country\tslug\tsource\textract_date\treplication_timestamp\tbytes\tmd5\tway_tags_rc\ttransit_rc\tseconds\n' > "$EXTRACTS"
  printf 'run=%s\ncrypt=%s\nimage=%s\narch=%s\n' "${CARTA_RUN_ID:-}" "$CRYPT" "$IMAGE" "$ARCH" > "$MANIFEST"
fi
manifest() { [ "$DRY" = "1" ] && { echo "+ MANIFEST $1=$2"; return 0; }; printf '%s=%s\n' "$1" "$2" >> "$MANIFEST"; }

# step NAME CC cmd...: run, log, record. Returns the command's exit code.
step() {
  local name="$1" cc="$2"; shift 2
  local log="$LOGD/$name${cc:+_$cc}.log" t0 rc started
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; t0=$(date +%s)
  jlog "step $name${cc:+ $cc}: $*"
  if [ "$DRY" = "1" ]; then x "$@"; return 0; fi
  ( cd "$REPO" && "$@" ) > "$log" 2>&1; rc=$?
  printf '%s\t%s\t%s\t%s\t%s\n' "$name" "${cc:--}" "$rc" "$(( $(date +%s) - t0 ))" "$started" >> "$STEPS"
  tail -n 3 "$log" | sed 's/^/    /'
  jlog "step $name${cc:+ $cc}: exit $rc after $(( $(date +%s) - t0 )) s"
  return $rc
}

# --- 0. what the job needs on the box ------------------------------------------
if [ "$DRY" != "1" ]; then
  command -v docker >/dev/null || { jlog "docker is not installed (needs docker)"; exit 1; }
  command -v pg_restore >/dev/null || { jlog "no pg_restore (needs pgclient)"; exit 1; }
  jlog "$(pg_restore --version), image $IMAGE on $ARCH, $(left) s of the ceiling left"
fi
# The clone has pipeline/ and infra/; the lab's SQL and src.ingestion too.
x git -C "$REPO" sparse-checkout add src tools/trailslab || { jlog "sparse-checkout add failed"; exit 1; }
for f in nuts3_2021.geojson wires-prev.tar.gz; do
  if [ "$DRY" != "1" ] && [ ! -s "$CARTA_IN/support/$f" ]; then
    jlog "missing input support/$f (trailslab_worker.py uploads it before spawning)"; exit 4
  fi
done
x mkdir -p "$REPO/cache"
x cp "$CARTA_IN/support/nuts3_2021.geojson" "$REPO/cache/nuts3_2021.geojson"
x tar -xzf "$CARTA_IN/support/wires-prev.tar.gz" -C "$REPO"
# The previous wire as a git tree, for both gates (no index, no ref touched).
if [ "$DRY" = "1" ]; then
  PREV_TREE="<tree>"; x "$PY" "$REPO/infra/hetzner/cax41/trailslab_worker.py" tree --repo "$REPO" continent-app/public/trails continent-app/public/cycling
else
  PREV_TREE="$("$PY" "$REPO/infra/hetzner/cax41/trailslab_worker.py" tree --repo "$REPO" \
    continent-app/public/trails continent-app/public/cycling)" || { jlog "could not snapshot the previous wire"; exit 4; }
fi
manifest prev_tree "$PREV_TREE"

# --- 1. keys ------------------------------------------------------------------------
export GNUPGHOME="$CARTA_WORK/gnupg"
WORKER_FPR=""; OWNER_FPR=""; WORKER_KEYIDS=""
if [ "$CRYPT" = "worker-key" ]; then
  x install -d -m 700 "$GNUPGHOME"
  if [ "$DRY" = "1" ]; then
    echo "+ base64 -d CARTA_WORKER_GPG_SECRET_B64 | gpg --batch --import; the same for CARTA_WORKER_GPG_PUBLIC_B64"
  else
    [ -n "${CARTA_WORKER_GPG_SECRET_B64:-}" ] && [ -n "${CARTA_WORKER_GPG_PUBLIC_B64:-}" ] \
      || { jlog "worker-key mode but spawn.sh passed no keys"; exit 4; }
    printf '%s' "$CARTA_WORKER_GPG_SECRET_B64" | base64 -d | gpg --batch --import 2>"$LOGD/gpg_import.log" \
      && printf '%s' "$CARTA_WORKER_GPG_PUBLIC_B64" | base64 -d | gpg --batch --import 2>>"$LOGD/gpg_import.log" \
      || { jlog "gpg import failed"; cat "$LOGD/gpg_import.log"; exit 4; }
    unset CARTA_WORKER_GPG_SECRET_B64 CARTA_WORKER_GPG_PUBLIC_B64
    WORKER_FPR="$(gpg --batch --with-colons --list-secret-keys | awk -F: '$1=="fpr"{print $10; exit}')"
    WORKER_KEYIDS="$(gpg --batch --with-colons --list-secret-keys | awk -F: '$1=="sec"||$1=="ssb"{print toupper($5)}' | tr '\n' ' ')"
    OWNER_FPR="$(gpg --batch --with-colons --list-keys | awk -F: -v w="$WORKER_FPR" '$1=="pub"{p=1; next} p&&$1=="fpr"{if($10!=w){print $10; exit}; p=0}')"
    [ -n "$WORKER_FPR" ] && [ -n "$OWNER_FPR" ] || { jlog "could not read both fingerprints from the imported keys"; exit 4; }
    jlog "keys: worker $WORKER_FPR, owner $OWNER_FPR"
    manifest worker_key "$WORKER_FPR"; manifest owner_key "$OWNER_FPR"
  fi
fi

# --- 2. the lab ---------------------------------------------------------------------------
x mkdir -p "$CARTA_WORK/pgdata"
# shellcheck disable=SC2086
step lab_start "" docker run -d --name trailslab-db --shm-size=2g -p 127.0.0.1:5433:5432 \
  -e POSTGRES_DB=trailslab -e POSTGRES_USER=trailslab -e POSTGRES_PASSWORD=trailslab \
  -v "$CARTA_WORK/pgdata:/var/lib/postgresql/data" "$IMAGE" postgres $PG_OPTS \
  || { jlog "the lab container did not start"; exit 1; }
if [ "$DRY" != "1" ]; then
  # Over TCP: during initdb the image's temporary server listens on the
  # socket only, so a TCP answer means the real server is up.
  for _ in $(seq 1 90); do pg_isready -q -h 127.0.0.1 -p 5433 -U trailslab -d trailslab && break; sleep 2; done
  pg_isready -h 127.0.0.1 -p 5433 -U trailslab -d trailslab || { docker logs trailslab-db 2>&1 | tail -n 20; exit 1; }
fi

# --- 3. restore ---------------------------------------------------------------------------
DUMP_DIR="$CARTA_WORK/dump"
x mkdir -p "$DUMP_DIR"
SRC_KEY=""
if [ "$DRY" = "1" ]; then
  x rclone lsjson -R --files-only "r2:$BUCKET/archive/db"
  SRC_KEY="archive/db/trailslab/trailslab-<date>.dump.gpg"
  x rclone copyto "r2:$BUCKET/$SRC_KEY" "$DUMP_DIR/in.dump.gpg"
  x gpg --batch --decrypt -o "$DUMP_DIR/in.dump" "$DUMP_DIR/in.dump.gpg"
else
  rclone lsjson -R --files-only "r2:$BUCKET/archive/db" > "$CARTA_WORK/db.json" || { jlog "cannot list archive/db"; exit 1; }
  while IFS=$'\t' read -r path mtime size; do
    [ -n "$path" ] || continue
    if [ "$CRYPT" = "worker-key" ]; then
      # The public-key packets sit at the start of the file: read 64 KiB and
      # see whether one names a worker key, before downloading 5 GB.
      rclone cat --count 65536 "r2:$BUCKET/archive/db/$path" > "$DUMP_DIR/head.bin" 2>/dev/null || continue
      ids="$(gpg --batch --list-packets "$DUMP_DIR/head.bin" 2>&1 | sed -n 's/.*keyid \([0-9A-Fa-f]\{16\}\).*/\1/p' | tr '[:lower:]' '[:upper:]' | tr '\n' ' ')"
      hit=0; for k in $ids; do case " $WORKER_KEYIDS " in *" $k "*) hit=1 ;; esac; done
      if [ "$hit" -ne 1 ]; then jlog "skip $path ($mtime): encrypted to ${ids:-?}, not to the worker key"; continue; fi
    fi
    SRC_KEY="archive/db/$path"; jlog "restoring from $SRC_KEY ($mtime, $size bytes)"; break
  done < <("$PY" "$REPO/infra/hetzner/cax41/trailslab_worker.py" pick-dumps --crypt "$CRYPT" < "$CARTA_WORK/db.json")
  if [ -z "$SRC_KEY" ]; then
    jlog "no trailslab dump in archive/db/ this mode ($CRYPT) can read. worker-key: the owner re-encrypts the newest dump to both keys (README, \"The trailslab job\"); plain: the owner uploads an unencrypted one"
    exit 4
  fi
  manifest source_dump "$SRC_KEY"
  step dump_get "" rclone copyto "r2:$BUCKET/$SRC_KEY" "$DUMP_DIR/in.raw" --multi-thread-streams 8 || exit 1
  if [ "$CRYPT" = "worker-key" ]; then
    step dump_decrypt "" gpg --batch --yes --decrypt -o "$DUMP_DIR/in.dump" "$DUMP_DIR/in.raw" || exit 1
    rm -f "$DUMP_DIR/in.raw"
  else
    mv "$DUMP_DIR/in.raw" "$DUMP_DIR/in.dump"
  fi
fi
step restore "" pg_restore "${PGC[@]}" --no-owner --no-privileges -j "$CARTA_THREADS" "$DUMP_DIR/in.dump"
rc=$?
[ "$rc" -ne 0 ] && jlog "pg_restore exited $rc (warnings such as an extension comment are common); counting rows to decide"
x rm -f "$DUMP_DIR/in.dump"
step analyze "" vacuumdb -h 127.0.0.1 -p 5433 -U trailslab -d trailslab --analyze-only -j "$CARTA_THREADS"
if [ "$DRY" != "1" ]; then
  n_trips="$(psql "${PGC[@]}" -tAc 'select count(*) from trips' 2>/dev/null || echo 0)"
  n_reviews="$(psql "${PGC[@]}" -tAc 'select count(*) from trip_reviews' 2>/dev/null || echo 0)"
  n_pub="$(psql "${PGC[@]}" -tAc "select count(*) from trips where status = 'published'" 2>/dev/null || echo 0)"
  jlog "restored: $n_trips trips ($n_pub published), $n_reviews trip_reviews rows"
  manifest restored_trips "$n_trips"; manifest restored_published "$n_pub"; manifest restored_reviews "$n_reviews"
  [ "${n_trips:-0}" -gt 0 ] || { jlog "the restore left no trips; stopping"; exit 1; }
fi

# --- 4. the per-country loop ------------------------------------------------------------
# Countries with hikes the way-tags pass reads (its default selection), mapped
# to their Geofabrik slug by ingest_osm_routes.COUNTRIES.
if [ "$DRY" = "1" ]; then
  echo "+ psql: select country from trips where category='hike' and source='osm' and status in ('approved','published') group by 1"
  PAIRS="CH switzerland"
  x rclone lsf -R --files-only --include "*-latest.osm.pbf" "r2:$BUCKET/archive/inputs/geofabrik"
  R2_LIST=""
else
  have="$(psql "${PGC[@]}" -tAc "select country from trips where category = 'hike' and source = 'osm' and status in ('approved','published') group by 1 order by count(*)" | tr '\n' ' ')"
  PAIRS="$(cd "$REPO" && "$PY" -c '
import sys
sys.path.insert(0, "pipeline/trails")
from ingest_osm_routes import COUNTRIES
want = sys.argv[1].split()
only = set(filter(None, sys.argv[2].split(",")))
by_cc = {cc: slug for slug, cc in COUNTRIES.items()}
for cc in want:
    if only and cc not in only:
        continue
    print(cc, by_cc.get(cc, "-"))
' "$have" "$ONLY")" || { jlog "could not map countries to extracts"; PAIRS=""; }
  R2_LIST="$(rclone lsf -R --files-only --include '*-latest.osm.pbf' "r2:$BUCKET/archive/inputs/geofabrik" 2>/dev/null || true)"
fi
TODAY="$(date -u +%F)"; TODAY_S=$(date -u +%s)
n_done=0; n_fail=0; n_time=0; n_noslug=0
while read -r cc slug; do
  [ -n "${cc:-}" ] || continue
  if [ "$slug" = "-" ]; then jlog "$cc: no Geofabrik slug maps to it; skipped"; n_noslug=$((n_noslug + 1)); continue; fi
  if [ "$DRY" != "1" ] && [ "$(left)" -lt "$RESERVE_S" ]; then
    jlog "$cc: $(left) s left, under the ${RESERVE_S} s kept for the exports and the dump; the loop stops here"
    n_time=$((n_time + 1)); continue
  fi
  t0=$(date +%s)
  src=geofabrik; edate="$TODAY"
  r2d="$(printf '%s\n' "$R2_LIST" | sed -n "s#^\([0-9-]*\)/$slug-latest.osm.pbf\$#\1#p" | sort | tail -n 1)"
  if [ -n "$r2d" ]; then
    age=$(( (TODAY_S - $(date -u -d "$r2d" +%s 2>/dev/null || echo 0)) / 86400 ))
    [ "$age" -le "$MAX_AGE_D" ] && { src=r2; edate="$r2d"; }
  fi
  dir="$INGEST_DATA_DIR/geofabrik/$edate"; pbf="$dir/$slug-latest.osm.pbf"; md5="-"
  x mkdir -p "$dir"
  if [ "$src" = "r2" ]; then
    step extract_get "$cc" rclone copyto "r2:$BUCKET/archive/inputs/geofabrik/$edate/$slug-latest.osm.pbf" "$pbf" --multi-thread-streams 8
    got=$?
  else
    step extract_get "$cc" curl -fL --retry 5 --retry-delay 30 -C - -o "$pbf.part" "$GEOFABRIK/$slug-latest.osm.pbf"
    got=$?
    if [ "$got" -eq 0 ] && [ "$DRY" != "1" ]; then
      want="$(curl -fsSL --retry 3 "$GEOFABRIK/$slug-latest.osm.pbf.md5" | cut -d' ' -f1)"
      md5="$(md5sum "$pbf.part" | cut -d' ' -f1)"
      # A republish between the two requests changes the md5; one retry.
      if [ -n "$want" ] && [ "$want" != "$md5" ]; then
        jlog "$cc: md5 differs ($md5 vs $want), downloading once more"
        rm -f "$pbf.part"
        step extract_get2 "$cc" curl -fL --retry 5 --retry-delay 30 -o "$pbf.part" "$GEOFABRIK/$slug-latest.osm.pbf"; got=$?
        want="$(curl -fsSL --retry 3 "$GEOFABRIK/$slug-latest.osm.pbf.md5" | cut -d' ' -f1)"
        md5="$(md5sum "$pbf.part" 2>/dev/null | cut -d' ' -f1)"
        [ -n "$want" ] && [ "$want" != "$md5" ] && got=1
      fi
      [ "$got" -eq 0 ] && mv "$pbf.part" "$pbf"
    fi
  fi
  if [ "$got" -ne 0 ]; then
    jlog "$cc: no extract ($src); this country keeps its old tags"
    n_fail=$((n_fail + 1)); x rm -rf "$dir"
    [ "$DRY" = "1" ] || printf '%s\t%s\t%s\t%s\t-\t-\t-\t-\t-\t%s\n' "$cc" "$slug" "$src" "$edate" "$(( $(date +%s) - t0 ))" >> "$EXTRACTS"
    continue
  fi
  repl="-"; bytes="-"
  if [ "$DRY" != "1" ]; then
    bytes="$(stat -c %s "$pbf")"
    repl="$("$PY" -c 'import sys, osmium
r = osmium.io.Reader(sys.argv[1], osmium.osm.osm_entity_bits.NOTHING)
print(r.header().get("osmosis_replication_timestamp") or "-"); r.close()' "$pbf" 2>/dev/null || echo -)"
  fi
  step way_tags "$cc" "$PY" pipeline/trails/way_tags.py --refresh --countries "$cc"; wrc=$?
  step transit_stops "$cc" "$PY" pipeline/trails/transit_stops.py --countries "$cc"; trc=$?
  x rm -rf "$dir"
  if [ "$wrc" -ne 0 ] || [ "$trc" -ne 0 ]; then n_fail=$((n_fail + 1)); else n_done=$((n_done + 1)); fi
  [ "$DRY" = "1" ] || printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$cc" "$slug" "$src" "$edate" "$repl" "$bytes" "$md5" "$wrc" "$trc" "$(( $(date +%s) - t0 ))" >> "$EXTRACTS"
done <<< "$PAIRS"
jlog "loop: $n_done countries refreshed, $n_fail failed, $n_time left for lack of time, $n_noslug without an extract"
manifest countries_done "$n_done"; manifest countries_failed "$n_fail"; manifest countries_skipped_time "$n_time"

# --- 5 and 6. the exports behind their gates ---------------------------------------------
# The previous wire's own country list, so TR.json and UA.json (published,
# empty) are rewritten too and index.json lists what is live.
if [ "$DRY" = "1" ]; then CCS="AD,AL,AT"; else
  CCS="$(cd "$REPO/continent-app/public/trails" && ls [A-Z][A-Z].json 2>/dev/null | cut -c1-2 | paste -sd, -)"
fi
export_layer() {  # layer, then the export command
  local layer="$1"; shift
  if [ "$DRY" != "1" ] && [ "$(left)" -lt "$DUMP_RESERVE_S" ]; then
    jlog "$layer: $(left) s left, under the ${DUMP_RESERVE_S} s the dump needs; not exported"
    manifest "$layer" skipped-time; return 0
  fi
  step "export_$layer" "" "$@" || { manifest "$layer" export-failed; return 0; }
  local ok=1
  step "gate_$layer" "" "$PY" pipeline/field_stubs/gate.py --layer "$layer" --ref "$PREV_TREE" --verbose || ok=0
  if [ "$layer" = "trails" ]; then
    step difficulty_gate "" "$PY" pipeline/trails/difficulty_gate.py --ref "$PREV_TREE" || ok=0
  fi
  if [ "$ok" -eq 1 ]; then
    step "pack_$layer" "" tar -czf "$CARTA_OUT/wires/$layer.tar.gz" -C "$REPO" "continent-app/public/$layer" \
      && manifest "$layer" passed || manifest "$layer" pack-failed
  else
    jlog "$layer: a gate failed; the previous wire stays live (logs: reports/logs/gate_$layer.log)"
    manifest "$layer" gate-failed
  fi
}
export_layer trails "$PY" pipeline/trails/export_wire.py --no-promote --countries "$CCS"
export_layer cycling "$PY" pipeline/cycling/export_cycling.py

# --- 7. the dump back -------------------------------------------------------------------------
NAME="trailslab-$TODAY.dump"
PLAIN="$CARTA_WORK/dump/$NAME"
step dump_out "" pg_dump "${PGC[@]}" -Fc -Z 6 -f "$PLAIN" || { jlog "pg_dump failed"; exit 1; }
step dump_toc "" sh -c "pg_restore -l '$PLAIN' > '$LOGD/dump_toc.txt'" || { jlog "the new dump does not read back"; exit 1; }
if [ "$DRY" = "1" ]; then sha="<sha256>"; else sha="$(sha256sum "$PLAIN" | cut -d' ' -f1)"; fi
manifest dump_sha256_plain "$sha"
if [ "$CRYPT" = "worker-key" ]; then
  step dump_encrypt "" gpg --batch --yes --trust-model always --encrypt \
    --recipient "${OWNER_FPR:-<owner>}" --recipient "${WORKER_FPR:-<worker>}" -o "$CARTA_OUT/db/$NAME.gpg" "$PLAIN" \
    || { jlog "gpg encrypt failed"; exit 1; }
  if [ "$DRY" != "1" ]; then
    back="$(gpg --batch --decrypt "$CARTA_OUT/db/$NAME.gpg" 2>/dev/null | sha256sum | cut -d' ' -f1)"
    [ "$back" = "$sha" ] || { jlog "the encrypted dump does not decrypt to the same bytes ($back vs $sha)"; exit 1; }
    jlog "dump $NAME.gpg: $(stat -c %s "$CARTA_OUT/db/$NAME.gpg") bytes, decrypts to sha256 $sha, recipients owner and worker"
  fi
  x rm -f "$PLAIN"
  manifest dump "db/$NAME.gpg"
else
  x mv "$PLAIN" "$CARTA_OUT/db/$NAME"
  manifest dump "db/$NAME"
fi
jlog "done, $(left) s of the ceiling left"
exit 0
