#!/usr/bin/env python3
"""What the on-demand CAX41 runs cost: the one place the rates live (T047).

spawn.sh calls `cost.py price` for every ledger row, and `cost.py mtd` prints
the month-to-date total from the ledger it appends to. Task report:
Execution/P3/T047-on-demand-cax41.md.

    python3 infra/hetzner/cax41/cost.py price --seconds 21600 --ipv4 1
    python3 infra/hetzner/cax41/cost.py mtd                      # this month
    python3 infra/hetzner/cax41/cost.py mtd --month 2026-10 --ledger logs/cax41_runs.tsv
    python3 infra/hetzner/cax41/cost.py check                    # the arithmetic self-test

Rates, from CARTA_CLOUD_ARCHITECTURE.md sections 6.1, 6.2 and 7 (post-June-2026
Hetzner prices, not yet read off an invoice):
  CAX41        EUR 0.056 an hour (EUR 40.99 a month cap)
  primary IPv4 EUR 0.60 a month, pro-rated per hour over 730 hours

Two figures per run, because Hetzner's rounding has not been checked against a
bill. `eur` is wall-clock hours times the rate, the architecture document's own
arithmetic (6 h = EUR 0.34, 8 h = EUR 0.45). `eur_started_h` rounds every run up
to whole started hours, the pessimistic reading of hourly billing. The first
invoice after a real run decides which one the ledger should trust
(register row T047-e). Hetzner's monthly cap is irrelevant at these volumes.

Standard library only; runs on the orchestrator's system python3.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import math
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

CAX41_EUR_PER_HOUR = Decimal("0.056")
IPV4_EUR_PER_MONTH = Decimal("0.60")
HOURS_PER_MONTH = Decimal("730")
IPV4_EUR_PER_HOUR = IPV4_EUR_PER_MONTH / HOURS_PER_MONTH

LEDGER_COLUMNS = [
    "run_id", "job", "args", "created_at", "deleted_at", "wall_hours",
    "started_hours", "ipv4", "eur", "eur_started_h", "outcome", "exit_code",
]
DEFAULT_LEDGER = Path(__file__).resolve().parents[3] / "logs" / "cax41_runs.tsv"


def cents(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def price(seconds: int, ipv4: bool) -> dict:
    """Cost of one run of `seconds` from create to confirmed delete."""
    hours = Decimal(max(0, seconds)) / Decimal(3600)
    started = Decimal(max(1, math.ceil(seconds / 3600))) if seconds > 0 else Decimal(0)
    rate = CAX41_EUR_PER_HOUR + (IPV4_EUR_PER_HOUR if ipv4 else Decimal(0))
    return {
        "wall_hours": hours.quantize(Decimal("0.001")),
        "started_hours": started,
        "eur": (hours * rate).quantize(Decimal("0.0001")),
        "eur_started_h": (started * rate).quantize(Decimal("0.0001")),
    }


def read_ledger(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        rows = [r for r in csv.DictReader(fh, delimiter="\t")]
    return [r for r in rows if r.get("run_id") and not r["run_id"].startswith("#")]


def month_to_date(rows: list[dict], month: str) -> dict:
    total = Decimal(0)
    total_started = Decimal(0)
    hours = Decimal(0)
    n = 0
    undeleted = []
    by_job: dict[str, Decimal] = {}
    for r in rows:
        if not (r.get("created_at") or "").startswith(month):
            continue
        n += 1
        if not r.get("deleted_at") or r["deleted_at"] == "NOT-DELETED":
            undeleted.append(r["run_id"])
        try:
            eur = Decimal(r.get("eur") or "0")
            total += eur
            total_started += Decimal(r.get("eur_started_h") or "0")
            hours += Decimal(r.get("wall_hours") or "0")
            by_job[r["job"]] = by_job.get(r["job"], Decimal(0)) + eur
        except ArithmeticError:
            undeleted.append(r["run_id"] + " (unreadable cost)")
    return {"runs": n, "hours": hours, "eur": total, "eur_started_h": total_started,
            "by_job": by_job, "undeleted": undeleted}


def cmd_price(a: argparse.Namespace) -> int:
    p = price(a.seconds, a.ipv4 == 1)
    print(f"{p['wall_hours']}\t{p['started_hours']}\t{p['eur']}\t{p['eur_started_h']}")
    return 0


def cmd_mtd(a: argparse.Namespace) -> int:
    month = a.month or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m")
    m = month_to_date(read_ledger(Path(a.ledger)), month)
    print(f"CAX41 runs in {month}: {m['runs']}, {m['hours']:.3f} wall hours")
    print(f"  EUR {cents(m['eur'])} at wall-clock hours "
          f"(EUR {cents(m['eur_started_h'])} if every started hour is billed)")
    for job, eur in sorted(m["by_job"].items()):
        print(f"  {job}: EUR {cents(eur)}")
    if m["undeleted"]:
        print(f"  WARNING: not confirmed deleted: {', '.join(m['undeleted'])}; "
              f"run spawn.sh --sweep and check the Hetzner console")
    # The shape T043's public.infra_ledger takes (month, item, integer cents,
    # source). It is printed, never written: the ledger is the owner's, and a
    # computed figure is a model, not an invoice.
    c = int(cents(m["eur"]) * 100)
    print(f"  infra_ledger line (T043), for the owner to enter: month {month}-01, "
          f"item hetzner_cax41, cents {c}, source model "
          f"(select public.admin_set_infra_cost('{month}-01', 'hetzner_cax41', {c}, 'model', "
          f"'{m['runs']} CAX41 runs from logs/cax41_runs.tsv'))")
    return 0


def cmd_check(_a: argparse.Namespace) -> int:
    """The figures the task and the architecture document state."""
    cases = [
        # seconds, ipv4, expected EUR rounded to cents, what it proves
        (6 * 3600, False, Decimal("0.34"), "6 h without IPv4 (task: EUR 0.34)"),
        (6 * 3600, True, Decimal("0.34"), "6 h with IPv4 (0.336 + 0.0049)"),
        (8 * 3600, False, Decimal("0.45"), "8 h (architecture 6.2: EUR 0.45)"),
        (4 * 3600, False, Decimal("0.22"), "4 h (architecture 6.2: EUR 0.22)"),
        (16 * 3600, False, Decimal("0.90"), "16 h (architecture 6.2: EUR 0.90)"),
        (30 * 3600, False, Decimal("1.68"), "30 h (architecture 6.2: EUR 1.68)"),
    ]
    bad = 0
    for secs, v4, want, label in cases:
        got = cents(price(secs, v4)["eur"])
        ok = got == want
        bad += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {label}: EUR {got}")
    # Started-hour rounding: 61 minutes is two started hours.
    p = price(61 * 60, False)
    ok = p["started_hours"] == 2 and cents(p["eur_started_h"]) == Decimal("0.11")
    bad += not ok
    print(f"{'PASS' if ok else 'FAIL'}  61 min = 2 started hours = EUR {cents(p['eur_started_h'])}")
    print(f"IPv4 share per hour: EUR {IPV4_EUR_PER_HOUR.quantize(Decimal('0.000001'))}")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("price", help="cost of one run; prints wall_h started_h eur eur_started_h")
    p.add_argument("--seconds", type=int, required=True)
    p.add_argument("--ipv4", type=int, choices=(0, 1), default=1)
    p.set_defaults(fn=cmd_price)
    m = sub.add_parser("mtd", help="month-to-date total from the ledger")
    m.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    m.add_argument("--month", help="YYYY-MM, default the current UTC month")
    m.set_defaults(fn=cmd_mtd)
    c = sub.add_parser("check", help="arithmetic self-test")
    c.set_defaults(fn=cmd_check)
    a = ap.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
