#!/usr/bin/env python3
"""The box schedule: every run_pipeline.py task in a tier (T1107, ROADMAP H9).

One table, TIERS, says which systemd timer runs which cadence ceiling on the
CAX11 orchestrator. The units in this directory (carta-weekly, carta-monthly,
carta-quarterly) carry the same OnCalendar, CARTA_TIER and CARTA_LOCK_WAIT;
tests/test_box_schedule.py fails when they drift apart, and when any task in
run_pipeline.TASKS lands in no tier.

How a task finds its tier:
  weekly | monthly | quarterly  the timer of that name. Each run passes its tier
                                as --max-cadence, so it also runs the faster
                                tiers' tasks that are due (a quarterly run is a
                                full run); the cadence model in run_pipeline.py
                                decides what is due.
  after                         the run that runs what it follows: chain_followups
                                adds it in the same run. `after` ranks with
                                monthly, so a task following only quarterly work
                                is listed under quarterly, anything else under
                                monthly.
  backfill                      MANUAL, by design: select_tasks refuses them
                                without a terminal (T261) because several are
                                null-risk patch writers. Each needs a written
                                reason in MANUAL below; a backfill task without
                                one counts as unscheduled.

Usage, from the repo root:
    python infra/hetzner/cron/schedule.py --dry-run   # every task in its tier;
                                                      #   exit 1 if any is unscheduled
    python infra/hetzner/cron/schedule.py --check     # also compare the unit files
The two are the same read-only pass; --check adds the unit comparison.
ASCII only, no em dashes.
"""
import argparse
import importlib.util
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

# Times are Europe/Brussels, written into each OnCalendar so a change of the
# box's zone cannot move a slot. systemd ANDs the weekday with the date, so
# "Sat *-*-01..07" is the first Saturday of the month.
TIERS = [
    {
        "tier": "weekly",
        "unit": "carta-weekly",
        "on_calendar": "Mon *-*-* 09:00:00 Europe/Brussels",
        "lock_wait_s": 6 * 3600,
        "timeout": "48h",
        "why": ("The T048 slot. Waits up to 6 h for a Saturday run still going, "
                "then gives the week up; its tasks stay due."),
    },
    {
        "tier": "monthly",
        "unit": "carta-monthly",
        "on_calendar": "Sat *-*-01..07 03:00:00 Europe/Brussels",
        "lock_wait_s": 36 * 3600,
        "timeout": "84h",
        "why": ("First Saturday of the month, night time, five days clear of the "
                "Monday run; waits up to 36 h for a run already going."),
    },
    {
        "tier": "quarterly",
        "unit": "carta-quarterly",
        "on_calendar": "Sat *-01,04,07,10-15..21 03:00:00 Europe/Brussels",
        "lock_wait_s": 36 * 3600,
        "timeout": "120h",
        "why": ("Third Saturday of January, April, July and October: two weeks "
                "after that month's monthly run, so the two never queue."),
    },
]
TIER_NAMES = [t["tier"] for t in TIERS]
RANK = {"weekly": 1, "monthly": 2, "quarterly": 3}

# Backfill tasks stay manual. The reason is the written rule the dry run
# prints; a new backfill task must add its line here or the test fails.
MANUAL = {
    "geonames": "static gazetteer; worth a run only after the catalogue grows",
    "nature": "static geography; a heavy Overpass sweep on a cold cache",
    "climate": "full re-baseline of the climate normals; climate_daily is the quarterly path",
    "guide": "Wikivoyage blurbs; apply is coverage-guarded and wants a person to read the cache first",
    "images": "NULL-RISK: patch nulls lead images for dests absent from the cache",
    "activities": "NULL-RISK: patch nulls activities for dests absent from the cache",
    "overture": "merges a pinned Overture release; rerun only after a new extract (edit RELEASE)",
    "must_descs": "one-off fill of the high-value subset; poi_descriptions is the quarterly path",
    "poi_images_wikidata": "bulk WDQS backfill, about 1,500 heavy queries; run by hand, then poi_images",
    "poi_images": "multi-hour Commons sweep; only when no other run hits Wikimedia",
}


def load_pipeline():
    spec = importlib.util.spec_from_file_location("run_pipeline", ROOT / "run_pipeline.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def tier_of(task, by_key, _seen=None):
    """The tier name, 'manual', or None when the task is unscheduled."""
    cad = task["cadence"]
    if cad in RANK:
        return cad
    if cad in ("backfill", "manual"):
        return "manual" if task["key"] in MANUAL else None
    if cad == "after":
        seen = set(_seen or ()) | {task["key"]}
        ranks = []
        for dep in task.get("after") or []:
            if dep in seen or dep not in by_key:
                continue
            t = tier_of(by_key[dep], by_key, seen)
            if t in RANK:
                ranks.append(RANK[t])
        if not ranks:
            return None
        # `after` ranks with monthly: it never runs in a weekly run.
        return TIER_NAMES[max(2, min(ranks)) - 1]
    return None


def assign(tasks):
    by_key = {t["key"]: t for t in tasks}
    out = {name: [] for name in [*TIER_NAMES, "manual"]}
    unscheduled = []
    for t in tasks:
        tier = tier_of(t, by_key)
        if tier is None:
            unscheduled.append(t["key"])
        else:
            out[tier].append(t)
    return out, unscheduled


def parse_unit(path):
    """KEY=value lines of a unit, with Environment= split into its own dict."""
    keys, env = {}, {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith(("#", ";", "[")) or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k == "Environment":
            ek, _, ev = v.partition("=")
            env[ek] = ev
        else:
            keys[k] = v
    return keys, env


def check_units(unit_dir=HERE):
    """Problems between TIERS and the unit files, as strings."""
    problems = []
    for t in TIERS:
        svc, tim = unit_dir / f"{t['unit']}.service", unit_dir / f"{t['unit']}.timer"
        if not svc.is_file() or not tim.is_file():
            problems.append(f"{t['unit']}: unit file missing")
            continue
        skeys, senv = parse_unit(svc)
        tkeys, _ = parse_unit(tim)
        if tkeys.get("OnCalendar") != t["on_calendar"]:
            problems.append(f"{t['unit']}.timer OnCalendar {tkeys.get('OnCalendar')!r} != {t['on_calendar']!r}")
        if tkeys.get("Unit") != f"{t['unit']}.service":
            problems.append(f"{t['unit']}.timer does not start {t['unit']}.service")
        if senv.get("CARTA_TIER") != t["tier"]:
            problems.append(f"{t['unit']}.service CARTA_TIER {senv.get('CARTA_TIER')!r} != {t['tier']!r}")
        if senv.get("CARTA_LOCK_WAIT") != str(t["lock_wait_s"]):
            problems.append(f"{t['unit']}.service CARTA_LOCK_WAIT {senv.get('CARTA_LOCK_WAIT')!r} != {t['lock_wait_s']}")
        if senv.get("CARTA_PIPELINE_ENABLED") != "1":
            problems.append(f"{t['unit']}.service does not set CARTA_PIPELINE_ENABLED=1")
        if skeys.get("TimeoutStartSec") != t["timeout"]:
            problems.append(f"{t['unit']}.service TimeoutStartSec {skeys.get('TimeoutStartSec')!r} != {t['timeout']!r}")
        m = re.fullmatch(r"(\d+)h", t["timeout"])
        if not m or int(m.group(1)) * 3600 <= t["lock_wait_s"]:
            problems.append(f"{t['unit']}: timeout {t['timeout']} leaves no time after the {t['lock_wait_s']} s lock wait")
    return problems


def render(tasks, state=None, is_due=None):
    out, unscheduled = assign(tasks)
    lines = [f"Box schedule (T1107): {len(tasks)} run_pipeline.py tasks"]
    for t in TIERS:
        rows = out[t["tier"]]
        est = sum(float(r.get("est_h") or 0) for r in rows)
        lines.append("")
        lines.append(f"[{t['tier']}] {t['unit']}.timer  OnCalendar={t['on_calendar']}  "
                     f"--max-cadence {t['tier']}  ({len(rows)} tasks, est_h sum {est:g})")
        lines.append(f"  {t['why']}")
        for r in rows:
            follows = f"  (follows {', '.join(r['after'])})" if r["cadence"] == "after" else ""
            due = ""
            if state is not None and is_due is not None:
                due = "due " if is_due(r, state) else "    "
            lines.append(f"  {due}{r['key']:<22} {r['cadence']:<10} {r['title']}{follows}")
    lines.append("")
    lines.append(f"[manual] no timer: --only by a person (T261 refuses them without a terminal)  "
                 f"({len(out['manual'])} tasks)")
    for r in out["manual"]:
        lines.append(f"  {r['key']:<22} {r['cadence']:<10} {MANUAL[r['key']]}")
    lines.append("")
    if unscheduled:
        lines.append(f"UNSCHEDULED: {len(unscheduled)} task(s) in no tier: {', '.join(unscheduled)}")
    else:
        lines.append("unscheduled: none")
    return "\n".join(lines), unscheduled


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="print the schedule (the default)")
    ap.add_argument("--check", action="store_true", help="also compare the unit files with TIERS")
    ap.add_argument("--no-state", action="store_true", help="do not read logs/pipeline_state.json")
    a = ap.parse_args(argv)
    rp = load_pipeline()
    state = None if a.no_state else rp.load_state()
    text, unscheduled = render(rp.TASKS, state, rp.is_due)
    print(text)
    bad = bool(unscheduled)
    if a.check:
        problems = check_units()
        for p in problems:
            print(f"UNIT: {p}")
        print("units: match the schedule" if not problems else f"units: {len(problems)} problem(s)")
        bad = bad or bool(problems)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
