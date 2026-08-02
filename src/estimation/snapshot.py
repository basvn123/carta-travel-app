"""Schema-gate the shipped fare wire files and archive today's snapshot.

    python -m src.estimation.snapshot

The live fare harvest overwrites continent-app/public/fares/<ANCHOR>.json in
place every refresh, so without an archive the (lead time, price) escalation
curves the estimation model needs as labels are lost each week. This step:

  1. validates every wire file against the fare payload schema; a file whose
     payload is structurally anomalous (unparseable, wrong shape, or too many
     invalid entries) is copied to data/deadletter/<date>/ with the reason and
     EXCLUDED from the snapshot, so a broken harvest can never poison the
     training history (the doc's schema-validation gate: divert to dead
     letter, retain the cached model);
  2. writes the surviving fares to data/history/fares/<snapshot-date>.json.gz
     (same-day rerun overwrites: newest wins);
  3. refreshes data/history/airport_meta.json (iata -> country/coords from the
     app master) which features.py uses for holiday flags + route distance.

The snapshot date is the master's fare-window start (the window rolls to the
refresh day), falling back to today when the master is unreadable.
"""
import datetime as dt
import re
import shutil
import sys
import time

from .common import (APP_DATA, AIRPORT_META, DEADLETTER_DIR, FARES_DIR,
                     HISTORY_DIR, LOGS, dump_json, load_json, write_snapshot)

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PRICE_MAX = 3000.0            # EUR; anything above is a corrupt entry
BAD_ENTRY_FILE_LIMIT = 0.005  # >0.5% invalid entries quarantines the file
WINDOW_SLACK_DAYS = 7


def read_master_meta():
    """(window_start, window_end, airport_meta) - tolerant of a concurrent
    writer holding the master mid-write (retry once, then degrade)."""
    for attempt in (1, 2):
        try:
            data = load_json(APP_DATA)
            meta = data.get("meta", {})
            airports = {}
            for d in (data.get("destinations") or {}).values():
                for code in {d.get("iata"), d.get("anchor_airport")}:
                    if code and code not in airports:
                        airports[code] = {
                            "iso2": d.get("iso2"), "country": d.get("country"),
                            "lat": d.get("lat"), "lon": d.get("lon"),
                        }
            return meta.get("start_date"), meta.get("end_date"), airports
        except (OSError, ValueError):
            if attempt == 1:
                time.sleep(5)
    return None, None, None


def _parse_date(s):
    try:
        return dt.date.fromisoformat(s)
    except ValueError:
        return None


def validate_file(payload, win_lo, win_hi):
    """(clean_payload, n_entries, n_dropped, fatal_reason). Drops individual
    bad entries; returns a fatal reason when the shape is wrong or too much of
    the payload is invalid."""
    if not isinstance(payload, dict):
        return None, 0, 0, "top level is not an object"
    clean, entries, dropped = {}, 0, 0
    for origin, legs in payload.items():
        if not isinstance(origin, str) or not isinstance(legs, dict):
            return None, entries, dropped, f"origin {origin!r} is not an object"
        keep = {}
        for key, table in legs.items():
            if key not in ("out", "ret", "out_c", "ret_c", "out_t", "ret_t"):
                continue
            if not isinstance(table, dict):
                return None, entries, dropped, f"{origin}.{key} is not an object"
            good = {}
            for day, val in table.items():
                if key in ("out", "ret"):
                    entries += 1
                    d = _parse_date(day) if ISO_DATE.match(day) else None
                    ok = (d is not None
                          and isinstance(val, (int, float)) and 0 < val <= PRICE_MAX
                          and (win_lo is None or win_lo <= d <= win_hi))
                    if not ok:
                        dropped += 1
                        continue
                good[day] = val
            keep[key] = good
        if keep.get("out") or keep.get("ret"):
            clean[origin] = keep
    if entries and dropped / entries > BAD_ENTRY_FILE_LIMIT:
        return None, entries, dropped, f"{dropped}/{entries} entries invalid"
    return clean, entries, dropped, None


def main():
    if not FARES_DIR.exists():
        print(f"no fares dir at {FARES_DIR}")
        return 1

    start, end, airports = read_master_meta()
    if airports:
        dump_json(AIRPORT_META, airports, indent=None)
    win_lo = win_hi = None
    if start and end:
        s, e = _parse_date(start), _parse_date(end)
        if s and e:
            slack = dt.timedelta(days=WINDOW_SLACK_DAYS)
            win_lo, win_hi = s - slack, e + slack
    snap_date = start if (start and _parse_date(start)) else dt.date.today().isoformat()

    anchors, quarantined, warns = {}, [], []
    total_entries = total_dropped = 0
    dead_dir = DEADLETTER_DIR / snap_date
    for path in sorted(FARES_DIR.glob("*.json")):
        anchor = path.stem
        try:
            payload = load_json(path)
        except (OSError, ValueError) as exc:
            reason = f"unparseable: {exc}"
            payload = None
        else:
            payload, entries, dropped, reason = validate_file(payload, win_lo, win_hi)
            total_entries += entries
            total_dropped += dropped
            if dropped and not reason:
                warns.append(f"{anchor}: dropped {dropped} bad entries")
        if reason:
            dead_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dead_dir / path.name)
            quarantined.append({"file": path.name, "reason": reason})
            continue
        if payload:
            anchors[anchor] = payload

    if not anchors:
        print("nothing valid to snapshot - all fare files failed the schema gate")
        return 1

    write_snapshot(HISTORY_DIR / f"{snap_date}.json.gz",
                   {"snapshot_date": snap_date, "window": [start, end],
                    "anchors": anchors})

    report = {
        "snapshot_date": snap_date, "files_ok": len(anchors),
        "files_quarantined": quarantined, "entries": total_entries,
        "entries_dropped": total_dropped, "warnings": warns[:50],
    }
    dump_json(LOGS / "fare_snapshot_report.json", report)
    print(f"snapshot {snap_date}: {len(anchors)} anchors, {total_entries} fares, "
          f"{total_dropped} entries dropped, {len(quarantined)} files quarantined")
    for q in quarantined:
        print(f"  DEAD-LETTER {q['file']}: {q['reason']} -> {dead_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
