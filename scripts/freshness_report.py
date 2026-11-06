"""Wire freshness report (T1099, ROADMAP D12).

Per wire: built at (the stamp in the shipped file), source date (the input
date the file records, when it records one), age in days, and whether it is
over its cadence. Writes `freshness_wires.json` next to the data when asked,
so the box can push it to R2 with the data (owner step T1099-b).

    python -I scripts/freshness_report.py [--public continent-app/public]
        [--out PATH] [--now ISO] [--strict]

`--strict` exits 1 when any wire is missing, unstamped, constant or over cadence.
A stamp is "constant" when it is a known placeholder (see PLACEHOLDERS) or is
date-only (no time of day), which no writer clock produces.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# name -> (file under public/, dotted path of the stamp, source-date keys, cadence in days)
# Cadences are the owner's to tune (H9 schedules the runs).
WIRES = {
    "app_data":   ("app_data.json", "meta.generated_at", [], 35),
    "destinfo":   ("destinfo/index.json", "generated_at", [], 35),
    "trips":      ("trips/index.json", "generated_at", ["harvested_at"], 35),
    "journeys":   ("journeys/index.json", "generated_at", [], 35),
    "region":     ("region/index.json", "generated_at", [], 35),
    "trails":     ("trails/index.json", "generated_at", [], 35),
    "beaches":    ("beaches/index.json", "generated_at", [], 45),
    "lakes":      ("lakes/index.json", "generated_at", [], 45),
    "mountains":  ("mountains/index.json", "generated_at", [], 45),
    "cycling":    ("cycling/index.json", "generated_at", [], 45),
    "dossier":    ("dossier/index.json", "generated_at", [], 45),
    "guided":     ("search/guided.json", "generated_at", [], 45),
    "coverage":   ("coverage.json", "generated_at", [], 35),
    "joins":      ("joins.json", "generated_at", [], 35),
    "reach":      ("reach/BRU.json", "computed_at", [], 90),
    "ask":        ("search/ask/manifest.json", "built", [], 45),
}
PLACEHOLDERS = {"2026-05-12T12:00:00Z", "1970-01-01T00:00:00Z", "0000-00-00T00:00:00Z"}


def parse_ts(s):
    if not isinstance(s, str):
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def is_constant(s):
    return s in PLACEHOLDERS or bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", s or ""))


def dig(obj, path):
    for k in path.split("."):
        if not isinstance(obj, dict) or k not in obj:
            return None
        obj = obj[k]
    return obj


def check_wire(name, public, now, spec=None):
    rel, key, src_keys, cadence = spec or WIRES[name]
    row = {"wire": name, "file": rel, "key": key, "cadence_days": cadence,
           "built_at": None, "source_date": None, "age_days": None,
           "over_cadence": None, "status": "ok"}
    p = Path(public) / rel
    if not p.exists():
        row["status"] = "missing_file"
        return row
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        row["status"] = "unreadable"
        return row
    stamp = dig(data, key)
    row["built_at"] = stamp
    for k in src_keys:
        v = dig(data, k)
        if v:
            row["source_date"] = v
            break
    if stamp is None:
        row["status"] = "missing_stamp"
        return row
    d = parse_ts(stamp)
    if d is None:
        row["status"] = "bad_stamp"
        return row
    if is_constant(stamp):
        row["status"] = "constant_stamp"
    row["age_days"] = round(max(0.0, (now - d).total_seconds() / 86400), 1)
    row["over_cadence"] = row["age_days"] > cadence
    return row


def build_report(public, now=None):
    now = now or datetime.now(timezone.utc)
    rows = [check_wire(n, public, now) for n in WIRES]
    return {"meta": {"generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                     "n_wires": len(rows),
                     "n_over_cadence": sum(1 for r in rows if r["over_cadence"]),
                     "n_problems": sum(1 for r in rows if r["status"] != "ok")},
            "wires": rows}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--public", default="continent-app/public")
    ap.add_argument("--out")
    ap.add_argument("--now")
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args(argv)
    now = parse_ts(a.now) if a.now else None
    rep = build_report(a.public, now)
    print(f"{'wire':10} {'built at':26} {'source':22} {'age d':>6} {'cad':>4}  status")
    for r in rep["wires"]:
        flag = "OVER" if r["over_cadence"] else r["status"]
        print(f"{r['wire']:10} {r['built_at']!s:26} {r['source_date'] or '-'!s:22} "
              f"{r['age_days']!s:>6} {r['cadence_days']:>4}  {flag}")
    m = rep["meta"]
    print(f"{m['n_over_cadence']} over cadence, {m['n_problems']} with a stamp problem")
    if a.out:
        Path(a.out).write_text(json.dumps(rep, indent=1), encoding="utf-8")
    bad = m["n_over_cadence"] or m["n_problems"]
    return 1 if (a.strict and bad) else 0


if __name__ == "__main__":
    sys.exit(main())
