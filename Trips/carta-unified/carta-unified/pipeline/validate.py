#!/usr/bin/env python3
"""Validate the unified Carta dataset.

    python3 pipeline/validate.py [--data data/trips.master.json] [--report reports/validation-report.md]

Exit code 0 when there are no ERRORs (warnings are allowed), 1 otherwise.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

REQUIRED_TOP = ["id", "title", "country", "countryCode", "region", "tripType",
                "tripTypeId", "durationDays", "budgetTier", "budget", "itinerary",
                "accommodationStrategy", "logistics", "proTips", "provenance"]

VALID_TIERS = {"€", "€€", "€€€"}
ID_RE = re.compile(r"^[a-z]{2}-[a-z-]+-[a-z0-9-]+$")
EUROPE_BBOX = (33.0, 72.5, -32.0, 45.0)  # lat_min, lat_max, lon_min, lon_max
PLACEHOLDER_RE = re.compile(r"\bTBD\b|\bTODO\b|\bXXX\b|\{\{|\bLorem ipsum\b", re.I)

BUDGET_TOLERANCE = 0.15


class Issue:
    __slots__ = ("level", "trip", "code", "detail")

    def __init__(self, level, trip, code, detail):
        self.level, self.trip, self.code, self.detail = level, trip, code, detail

    def as_dict(self):
        return {"level": self.level, "trip": self.trip, "code": self.code,
                "detail": self.detail}


def validate(dataset):
    trips = dataset["trips"]
    issues = []

    def err(t, code, detail):
        issues.append(Issue("ERROR", t, code, detail))

    def warn(t, code, detail):
        issues.append(Issue("WARNING", t, code, detail))

    def info(t, code, detail):
        issues.append(Issue("INFO", t, code, detail))

    seen_ids = collections.Counter(t["id"] for t in trips)
    seen_titles = collections.Counter((t["title"] or "").strip().lower() for t in trips)

    for t in trips:
        tid = t.get("id") or "<no id>"

        # --- structural -------------------------------------------------
        for field in REQUIRED_TOP:
            if t.get(field) in (None, "", [], {}):
                err(tid, "missing-field", f"required field `{field}` is empty")

        if seen_ids[t["id"]] > 1:
            err(tid, "duplicate-id", f"id used {seen_ids[t['id']]} times")
        if not ID_RE.match(t["id"] or ""):
            err(tid, "bad-id-pattern", f"id {t['id']!r} breaks {{cc}}-{{type}}-{{name}}")
        if seen_titles[(t["title"] or "").strip().lower()] > 1:
            warn(tid, "duplicate-title", f"title {t['title']!r} is not unique")

        # --- enums ------------------------------------------------------
        try:
            tid_num, name, _slug = C.canonical_trip_type(t.get("tripType") or "")
            if tid_num != t.get("tripTypeId") or name != t.get("tripType"):
                err(tid, "trip-type-mismatch",
                    f"{t.get('tripType')!r}/{t.get('tripTypeId')} is not canonical")
        except ValueError:
            err(tid, "bad-trip-type", f"{t.get('tripType')!r} is not one of the 10 types")

        if t.get("budgetTier") not in VALID_TIERS:
            err(tid, "bad-budget-tier", f"{t.get('budgetTier')!r} not in €/€€/€€€")

        if t.get("countryCode") not in C.COUNTRY_CODES.values():
            err(tid, "bad-country-code", f"{t.get('countryCode')!r} is not a mapped ISO code")
        else:
            expected = C.COUNTRY_REGION.get(t["countryCode"])
            if expected and expected != t.get("regionKey"):
                info(tid, "region-country-mismatch",
                     f"{t['country']} sits in {C.REGIONS[expected]} but the record is "
                     f"filed under {t.get('region')} (source batch)")

        fit = t.get("profile", {}).get("fitnessLevel")
        if fit is not None and fit not in C.FITNESS_LEVELS:
            err(tid, "bad-fitness-level", f"{fit!r} not in {C.FITNESS_LEVELS}")
        diff = t.get("profile", {}).get("difficulty")
        if diff is None:
            warn(tid, "missing-difficulty", "no difficulty rating in the source record")
        elif not isinstance(diff, int) or not 1 <= diff <= 5:
            err(tid, "bad-difficulty", f"difficulty {diff!r} is outside 1–5")

        if t.get("durationDays") != 7:
            err(tid, "bad-duration", f"durationDays={t.get('durationDays')}, expected 7")

        # --- budget -----------------------------------------------------
        b = t.get("budget") or {}
        total = (b.get("totalEur") or {})
        low, high = total.get("low"), total.get("high")
        if low is None or high is None:
            err(tid, "missing-budget-total", "budget.totalEur is incomplete")
        else:
            if low > high:
                err(tid, "inverted-budget", f"total low {low} > high {high}")
            if low <= 0:
                err(tid, "nonpositive-budget", f"total low {low}")
            bd = b.get("breakdown") or {}
            lows = [v.get("lowEur") for v in bd.values()]
            highs = [v.get("highEur") for v in bd.values()]
            if any(v is None for v in lows + highs):
                warn(tid, "incomplete-breakdown",
                     "one or more budget categories has no parsed range")
            else:
                for cat, v in bd.items():
                    if v["lowEur"] > v["highEur"]:
                        err(tid, "inverted-category", f"{cat}: {v['lowEur']} > {v['highEur']}")
                s_low, s_high = sum(lows), sum(highs)
                for label, part, whole in (("low", s_low, low), ("high", s_high, high)):
                    if whole and abs(part - whole) / whole > BUDGET_TOLERANCE:
                        warn(tid, "budget-sum-drift",
                             f"{label}: breakdown sums to €{part} against a stated total "
                             f"of €{whole} ({(part - whole) / whole:+.0%})")
            rank = C.TIER_ORDER.get(t.get("budgetTier"))
            per_day = (high or 0) / 7
            if rank == 1 and per_day > 260:
                warn(tid, "tier-price-mismatch",
                     f"tier € but €{per_day:.0f}/day at the top of the range")
            if rank == 3 and per_day < 90:
                warn(tid, "tier-price-mismatch",
                     f"tier €€€ but only €{per_day:.0f}/day at the top of the range")

        # --- itinerary --------------------------------------------------
        days = t.get("itinerary") or []
        nums = [d.get("day") for d in days]
        if len(days) != 7:
            err(tid, "bad-day-count", f"{len(days)} days parsed, expected 7")
        if sorted(nums) != list(range(1, 8)):
            err(tid, "bad-day-numbering", f"day numbers {nums}")
        for d in days:
            for slot in ("morning", "afternoon"):
                if not d.get(slot):
                    err(tid, "missing-day-slot", f"day {d.get('day')} has no {slot}")
            if not d.get("evening"):
                warn(tid, "missing-evening", f"day {d.get('day')} has no evening block")
            if not d.get("title"):
                warn(tid, "missing-day-title", f"day {d.get('day')} has no title")

        # --- best period ------------------------------------------------
        bp = t.get("bestPeriod") or {}
        months = bp.get("months") or []
        if not months:
            err(tid, "missing-best-period", "no months resolved for bestPeriod")
        elif any(not isinstance(m, int) or not 1 <= m <= 12 for m in months):
            err(tid, "bad-month", f"months {months}")
        if t.get("tripTypeId") == 8 and months and not (set(months) & {12, 1, 2, 3, 4}):
            warn(tid, "season-implausible",
                 f"winter-sports trip with best months {C.month_names(months)}")

        # --- coordinates ------------------------------------------------
        coords = t.get("coordinates")
        if coords is None:
            warn(tid, "missing-coordinates", "no basecamp coordinates on the record")
        else:
            lat, lon = coords.get("lat"), coords.get("lon")
            if lat is None or lon is None:
                err(tid, "broken-coordinates", f"incomplete coordinate pair {coords}")
            elif not (EUROPE_BBOX[0] <= lat <= EUROPE_BBOX[1]
                      and EUROPE_BBOX[2] <= lon <= EUROPE_BBOX[3]):
                err(tid, "coordinates-out-of-range",
                    f"lat/lon {lat},{lon} falls outside the European bounding box")
            elif coords.get("precision") == "country":
                warn(tid, "approximate-coordinates",
                     f"pin falls back to the {t['country']} capital — no basecamp town resolved")
            elif coords.get("precision") == "gateway":
                warn(tid, "gateway-coordinates",
                     f"pin sits on the gateway city ({coords.get('matchedPlace')}), "
                     "not on the trip's basecamp")
            if coords.get("precision") not in ("source", "city", "gateway", "country"):
                err(tid, "bad-coordinate-precision", f"{coords.get('precision')!r}")

        # --- content depth ----------------------------------------------
        if len(t.get("accommodationStrategy") or []) < 2:
            warn(tid, "thin-accommodation",
                 f"{len(t.get('accommodationStrategy') or [])} lodging options")
        if len(t.get("proTips") or []) < 3:
            warn(tid, "thin-pro-tips", f"{len(t.get('proTips') or [])} pro-tips")
        if not t.get("gatewayAirport"):
            warn(tid, "missing-gateway", "no gateway airport named on the record")
        if not (t.get("logistics") or {}).get("connectivity"):
            warn(tid, "missing-connectivity", "logistics.connectivity is empty")
        if not (t.get("logistics") or {}).get("bookingWindows"):
            warn(tid, "missing-booking-windows", "logistics.bookingWindows is empty")
        if t.get("summaryGenerated"):
            info(tid, "generated-summary",
                 "summary composed from metadata — no editorial summary in the source")

        # --- type-specific refinements ----------------------------------
        ts = t.get("typeSpecific") or {}
        expectations = {
            1: ("surface", "surface/GPX detail"),
            2: ("technicalRating", "technical rating"),
            3: ("transitPass", "transit pass detail"),
            6: ("hutBooking", "hut booking path"),
            8: ("liftNetwork", "lift network / pass detail"),
        }
        want = expectations.get(t.get("tripTypeId"))
        if want and not ts.get(want[0]):
            warn(tid, "missing-type-detail", f"no {want[1]} captured for this trip type")

        # --- text hygiene -------------------------------------------------
        blob = json.dumps(t, ensure_ascii=False)
        if PLACEHOLDER_RE.search(blob):
            err(tid, "placeholder-text", "unresolved placeholder (TBD/TODO/{{…}}) in record")
        if t.get("verifyFlagCount", 0) > 20:
            info(tid, "many-verify-flags",
                 f"{t['verifyFlagCount']} distinct [VERIFY] flags to clear before publishing")

    return issues


def coverage_stats(trips):
    by_region = collections.Counter(t["regionKey"] for t in trips)
    by_type = collections.Counter(t["tripType"] for t in trips)
    by_country = collections.Counter(t["country"] for t in trips)
    return by_region, by_type, by_country


def write_report(dataset, issues, path):
    trips = dataset["trips"]
    errors = [i for i in issues if i.level == "ERROR"]
    warnings = [i for i in issues if i.level == "WARNING"]
    infos = [i for i in issues if i.level == "INFO"]
    by_region, by_type, by_country = coverage_stats(trips)
    by_code = collections.Counter(i.code for i in issues)

    lines = []
    lines.append("# Carta — master dataset validation report\n")
    lines.append(f"Dataset: **{len(trips)} trips** · schema v{dataset['schemaVersion']} · "
                 f"generated {dataset['generated']}\n")
    lines.append(f"**{len(errors)} errors · {len(warnings)} warnings · {len(infos)} notices**\n")

    lines.append("## Issue counts by check\n")
    lines.append("| Check | Level | Count |")
    lines.append("|---|---|---|")
    level_of = {}
    for i in issues:
        level_of.setdefault(i.code, i.level)
    for code, n in by_code.most_common():
        lines.append(f"| `{code}` | {level_of[code]} | {n} |")
    lines.append("")

    if errors:
        lines.append("## Errors\n")
        lines.append("| Trip | Check | Detail |")
        lines.append("|---|---|---|")
        for i in errors:
            lines.append(f"| `{i.trip}` | `{i.code}` | {i.detail} |")
        lines.append("")
    else:
        lines.append("## Errors\n\nNone. Every record satisfies the hard schema contract.\n")

    lines.append("## Warnings by check\n")
    grouped = collections.defaultdict(list)
    for i in warnings:
        grouped[i.code].append(i)
    for code, items in sorted(grouped.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"### `{code}` — {len(items)} record(s)\n")
        for i in items[:40]:
            lines.append(f"- `{i.trip}` — {i.detail}")
        if len(items) > 40:
            lines.append(f"- …and {len(items) - 40} more")
        lines.append("")

    if infos:
        lines.append("## Notices\n")
        grouped = collections.defaultdict(list)
        for i in infos:
            grouped[i.code].append(i)
        for code, items in sorted(grouped.items(), key=lambda kv: -len(kv[1])):
            lines.append(f"- `{code}` — {len(items)} record(s); "
                         f"e.g. `{items[0].trip}`: {items[0].detail}")
        lines.append("")

    lines.append("## Coverage\n")
    lines.append("| Region | Trips |")
    lines.append("|---|---|")
    for region, n in by_region.most_common():
        lines.append(f"| {C.REGIONS[region]} | {n} |")
    lines.append("")
    lines.append("| Trip type | Trips |")
    lines.append("|---|---|")
    for _i, name, _s in C.TRIP_TYPES:
        lines.append(f"| {name} | {by_type.get(name, 0)} |")
    lines.append("")
    lines.append("| Country | Trips |")
    lines.append("|---|---|")
    for country, n in sorted(by_country.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"| {country} | {n} |")
    lines.append("")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(ROOT, "data", "trips.master.json"))
    ap.add_argument("--report", default=os.path.join(ROOT, "reports", "validation-report.md"))
    ap.add_argument("--json", default=os.path.join(ROOT, "reports", "validation-issues.json"))
    args = ap.parse_args()

    with open(args.data, encoding="utf-8") as fh:
        dataset = json.load(fh)

    issues = validate(dataset)
    write_report(dataset, issues, args.report)
    with open(args.json, "w", encoding="utf-8") as fh:
        json.dump([i.as_dict() for i in issues], fh, ensure_ascii=False, indent=2)

    errors = sum(1 for i in issues if i.level == "ERROR")
    warns = sum(1 for i in issues if i.level == "WARNING")
    infos = sum(1 for i in issues if i.level == "INFO")
    print(f"TRIPS:{len(dataset['trips'])}  ERRORS:{errors}  WARNINGS:{warns}  NOTICES:{infos}")
    print(f"report -> {args.report}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
