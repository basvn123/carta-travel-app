#!/usr/bin/env bash
# The stays scrape on a Linux host (T1161, ROADMAP H10, audit P-17): the
# Linux twin of scripts/stays_scrape.bat, so the March and September scrape
# (T532) does not need the owner's laptop.
#
# Where it runs, by site (research and decision: T1161):
#   hostelworld  the build box. One plain browser tab, headless, as on the
#                laptop. Whether Hostelworld serves a datacenter address is not
#                proven yet: the owner's first test is a one-town run (--only).
#   booking      Booking turns away datacenter addresses (T624, T634) and
#                headless Chrome, so it runs only on a host whose own address
#                is a residential one (an always-on home device on the owner's
#                connection) and only when that host says so:
#                CARTA_STAYS_BOOKING_EGRESS=residential. Headed, in Xvfb when
#                there is no display. On the box, leave it unset.
#
# Every night from carta-stays-scrape.timer; it does work only when
# CARTA_STAYS_SCRAPE=1 and only in March and September (FORCE=1 any month),
# stops each site after CARTA_STAYS_MAX_HOURS (6) and resumes the next night
# from cache/stays/journal_scrape.sqlite, like the laptop. It takes the
# pipeline's run lock without waiting: a pipeline run in progress means no
# scrape tonight; a scrape in progress makes a timer run wait (weekly.sh).
#
# After the scrape: the same safe upload as the laptop (T646, T679, T742): a
# consistent sqlite snapshot, never replace R2's copy with one that has fewer
# rows, one dated backup of R2's copy, skip when nothing is new. Through
# rclone (remote CARTA_STAYS_REMOTE, default r2:carta-stays-state/state),
# which needs a token that may write that bucket (owner step T1161).
#
# Usage:
#   bash infra/hetzner/cax11/stays_scrape.sh [--dry-run] [-- extra scraper arguments]
# Environment (the secrets file, infra/hetzner/cax11/env.example):
#   CARTA_STAYS_SCRAPE=1              the switch; anything else logs and exits 0
#   CARTA_STAYS_SITES                 hostelworld (default), booking, or both
#   CARTA_STAYS_BOOKING_EGRESS        residential on a home host; unset on the box
#   CARTA_STAYS_MAX_HOURS             per site, default 6
#   CARTA_STAYS_REMOTE                default r2:carta-stays-state/state
#   STAYS_RUN, FORCE                  as in stays_scrape.bat
#   CARTA_VENV, CARTA_LOG_DIR, CARTA_STAYS_MONTH (tests)
# Exit codes: 0 done or nothing to do, 1 a scraper or the upload failed,
# 2 bad arguments, 3 refused (booking without a residential egress), 75 the
# pipeline holds the run lock.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
DRY=0; EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --) shift; EXTRA=("$@"); break ;;
    *) echo "stays_scrape.sh: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done
cd "$REPO" || exit 1
LOG_DIR="${CARTA_LOG_DIR:-$REPO/logs}"
mkdir -p "$LOG_DIR"
say() { printf '%s stays_scrape: %s\n' "$(date -Is)" "$*"; }
x() { echo "+ $*"; [ $DRY -eq 1 ] && return 0; "$@"; }
xl() { local log="$1"; shift; echo "+ $* >> $log"; [ $DRY -eq 1 ] && return 0; "$@" >> "$log" 2>&1; }

# The secrets file, when this is the box (load-env.sh drops blank names).
if [ -f "$HERE/load-env.sh" ] && [ -f "${CARTA_ENV_FILE:-$HOME/.config/carta/env}" ] && [ $DRY -eq 0 ]; then
  # shellcheck source=load-env.sh
  . "$HERE/load-env.sh"
fi

MON="${CARTA_STAYS_MONTH:-$(date +%m)}"
if [ "${FORCE:-0}" != "1" ] && [ "$MON" != "03" ] && [ "$MON" != "09" ]; then
  say "month $MON is not a scrape month (03, 09; FORCE=1 overrides); nothing to do"; exit 0
fi
if [ "${CARTA_STAYS_SCRAPE:-0}" != "1" ] && [ $DRY -eq 0 ]; then
  say "CARTA_STAYS_SCRAPE is not 1: the scrape is off on this host"; exit 0
fi
SITES="${CARTA_STAYS_SITES:-hostelworld}"
case "$SITES" in hostelworld|booking|both) ;; *) say "CARTA_STAYS_SITES=$SITES is not hostelworld, booking or both"; exit 2 ;; esac
if [ "$SITES" != "hostelworld" ] && [ "${CARTA_STAYS_BOOKING_EGRESS:-}" != "residential" ]; then
  say "booking needs a residential egress (Booking turns away datacenter addresses); set CARTA_STAYS_BOOKING_EGRESS=residential only on a home host, or CARTA_STAYS_SITES=hostelworld here"
  exit 3
fi
RUN="${STAYS_RUN:-$(date +%Y)-$MON}"
HOURS="${CARTA_STAYS_MAX_HOURS:-6}"
VENV="${CARTA_VENV:-$HOME/venv}"
PY="$VENV/bin/python"; [ -x "$PY" ] || PY="$(command -v python3)"

# The pipeline's lock, without waiting (T1107: weekly.sh waits for it instead).
if [ $DRY -eq 0 ]; then
  # Always the repo's logs/, where weekly.sh and run_pipeline.sh take it,
  # whatever CARTA_LOG_DIR says.
  mkdir -p "$REPO/logs"
  exec 9>"$REPO/logs/carta-run.lock"
  flock -n 9 || { say "a pipeline run holds logs/carta-run.lock; no scrape tonight"; exit 75; }
fi

# --- browser ---------------------------------------------------------------------
# Its own browser folder, as on the laptop (T646).
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright-carta-stays}"
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1 LANG="${LANG:-C.UTF-8}"
want="$(sha256sum "$HERE/requirements-stays.txt" | cut -c1-16)"
if [ "$(cat "$VENV/.carta-stays" 2>/dev/null)" != "$want" ]; then
  x "$PY" -m pip install --quiet --only-binary=:all: -r "$HERE/requirements-stays.txt" -c constraints.txt \
    || { say "pip could not install playwright"; exit 1; }
  [ $DRY -eq 1 ] || echo "$want" > "$VENV/.carta-stays"
fi
# The system libraries Chromium needs come once from the owner (sudo, T1161 owner step).
xl /dev/null "$PY" -m playwright install chromium chromium-headless-shell || { say "playwright could not install Chromium"; exit 1; }

say "run $RUN, sites $SITES, $HOURS h per site"
rc=0
run_hw() {
  xl "$LOG_DIR/stays_hostelworld.log" "$PY" pipeline/stays/scrape_hostelworld.py --run "$RUN" --max-hours "$HOURS" "${EXTRA[@]}"
}
run_booking() {
  # Headed (Booking refuses headless Chrome, T624), in a virtual display when
  # the host has none.
  local cmd=("$PY" pipeline/stays/scrape_booking.py --run "$RUN" --max-hours "$HOURS" --headed "${EXTRA[@]}")
  if [ -z "${DISPLAY:-}" ]; then
    command -v xvfb-run >/dev/null || [ $DRY -eq 1 ] || { say "no display and no xvfb-run (apt-get install xvfb)"; return 1; }
    cmd=(xvfb-run -a -s "-screen 0 1366x900x24" "${cmd[@]}")
  fi
  xl "$LOG_DIR/stays_booking.log" "${cmd[@]}"
}
case "$SITES" in
  hostelworld) run_hw || rc=1 ;;
  booking) run_booking || rc=1 ;;
  both)
    # Different sites, side by side (T646).
    run_hw & hw=$!
    run_booking || rc=1
    wait "$hw" || rc=1 ;;
esac
[ $rc -eq 0 ] || say "a scraper exited non-zero (its log in $LOG_DIR); uploading what the journal holds"

# --- the safe journal upload --------------------------------------------------------
REMOTE="${CARTA_STAYS_REMOTE:-r2:carta-stays-state/state}"
J="cache/stays/journal_scrape.sqlite"
SNAP="cache/stays/journal_scrape.upload-box.sqlite"
RCOPY="cache/stays/journal_scrape.remote-box.sqlite"
if [ $DRY -eq 1 ]; then
  echo "+ sqlite backup $J -> $SNAP; rclone copyto $REMOTE/journal_scrape.sqlite $RCOPY; compare obs rows"
  echo "+ rclone copyto $RCOPY $REMOTE/backup/journal_scrape-<day>.sqlite; rclone copyto $SNAP $REMOTE/journal_scrape.sqlite"
  exit $rc
fi
[ -f "$J" ] || { say "no journal at $J; nothing to upload"; exit $rc; }
rm -f "$SNAP" "$RCOPY"
"$PY" -c "import sqlite3,sys; s=sqlite3.connect(sys.argv[1], timeout=60); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close()" "$J" "$SNAP" \
  || { say "upload skipped: no snapshot of the journal"; exit 1; }
rclone copyto "$REMOTE/journal_scrape.sqlite" "$RCOPY" 2>/dev/null || rm -f "$RCOPY"
"$PY" -c "import os,sqlite3,sys; n=lambda p: sqlite3.connect(p).execute('select count(*) from obs').fetchone()[0]; a=n(sys.argv[1]); b=n(sys.argv[2]) if os.path.exists(sys.argv[2]) else 0; print('journal rows: snapshot', a, 'R2', b); sys.exit(3 if a == b else 1 if a < b else 0)" "$SNAP" "$RCOPY"
cmp=$?
if [ $cmp -eq 3 ]; then say "upload skipped: R2 already has these rows"
elif [ $cmp -ne 0 ]; then say "upload refused: the snapshot has fewer rows than R2's"
else
  [ -f "$RCOPY" ] && { rclone copyto "$RCOPY" "$REMOTE/backup/journal_scrape-$(date +%Y%m%d).sqlite" || rc=1; }
  if rclone copyto "$SNAP" "$REMOTE/journal_scrape.sqlite"; then say "journal uploaded to $REMOTE"
  else say "the journal upload failed (does this token write $REMOTE?)"; rc=1; fi
fi
rm -f "$SNAP" "$RCOPY"
exit $rc
