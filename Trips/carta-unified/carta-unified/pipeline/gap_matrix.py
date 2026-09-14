#!/usr/bin/env python3
"""Country x trip-type coverage matrix for the unified Carta dataset.

Separates slots that are genuinely missing from slots that are geographically
impossible (no alpine terrain, no coast, no ski areas), and ranks the fillable
holes so a synthesis pass can be scoped.

    python3 pipeline/gap_matrix.py
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Terrain constraints. Only the three terrain-bound types can be non-viable;
# every other type is producible in every country in scope.
#   not-viable — the geography does not exist, do not synthesize
#   marginal   — producible but only in a reduced form; the reason says how
CONSTRAINTS = {
    # 6 = Hiking & Alpine Trekking
    6: {
        "NL": ("not-viable", "highest point 322 m (Vaalserberg); no alpine terrain"),
        "DK": ("not-viable", "highest point 171 m; no alpine terrain"),
        "EE": ("not-viable", "highest point 318 m (Suur Munamägi)"),
        "LV": ("not-viable", "highest point 312 m (Gaiziņkalns)"),
        "LT": ("not-viable", "highest point 294 m (Aukštojas)"),
        "MD": ("not-viable", "highest point 430 m (Bălănești); no alpine terrain"),
        "HU": ("not-viable", "highest point 1,014 m (Kékes); no alpine zone"),
        "MC": ("not-viable", "2 km² city-state; alpine days belong to the FR hinterland"),
        "SM": ("marginal", "Monte Titano 749 m — hill walking, not alpine trekking"),
        "BE": ("marginal", "Ardennes tops out at 694 m (Signal de Botrange)"),
        "LU": ("marginal", "Éislek plateau, 560 m maximum"),
        "FO": ("marginal", "Slættaratindur 880 m — serious but sub-alpine ridge walking"),
        "IE": ("marginal", "Carrauntoohil 1,038 m — mountain, not alpine, no hut chain"),
    },
    # 8 = Winter Sports & Skiing
    8: {
        "NL": ("not-viable", "no ski terrain; indoor slopes only"),
        "DK": ("not-viable", "no ski terrain"),
        "IE": ("not-viable", "no operating lift-served ski area"),
        "MC": ("not-viable", "no snow; the nearest lifts are in FR"),
        "MD": ("not-viable", "no ski resorts"),
        "SM": ("not-viable", "no ski terrain"),
        "FO": ("not-viable", "no lift infrastructure; maritime snow line"),
        "HU": ("not-viable", "1,014 m maximum; no reliable lift-served skiing"),
        "EE": ("marginal", "Otepää/Kuutsemäe: ~100 m vertical, Nordic-led"),
        "LV": ("marginal", "Sigulda/Žagarkalns: ~100 m vertical, Nordic-led"),
        "LT": ("marginal", "Snow Arena Druskininkai is indoor; outdoor terrain negligible"),
        "BE": ("marginal", "Hautes Fagnes cross-country only, and only in cold winters"),
        "LU": ("marginal", "occasional cross-country in the Éislek; no lifts"),
        "PT": ("marginal", "Serra da Estrela: one small area, unreliable snow"),
    },
    # 10 = Water Sports & Coastal Trips
    10: {
        "AD": ("not-viable", "landlocked, no navigable lakes"),
        "SM": ("not-viable", "landlocked enclave"),
        "XK": ("not-viable", "landlocked; only small reservoirs"),
        "LU": ("marginal", "Upper Sûre lake and the Moselle only — no coast"),
        "CZ": ("marginal", "reservoirs and the Vltava — no coast"),
        "SK": ("marginal", "Danube, Váh and Liptovská Mara — no coast"),
        "AT": ("marginal", "Salzkammergut and Carinthian lakes — no coast"),
        "CH": ("marginal", "Alpine lakes — no coast"),
        "HU": ("marginal", "Balaton and the Tisza — no coast"),
        "RS": ("marginal", "Danube, Sava and Ada Ciganlija — no coast"),
        "MK": ("marginal", "Ohrid and Prespa — no coast"),
        "MD": ("marginal", "Prut and Dniester only — no coast"),
        "LI": ("not-viable", "landlocked; the Rhine here is a canalised torrent"),
        "BA": ("marginal", "20 km of coast at Neum; rivers are the real product"),
    },
}


def viability(country_code, trip_type_id):
    rule = CONSTRAINTS.get(trip_type_id, {}).get(country_code)
    if rule:
        return rule
    return ("viable", "")


def build(dataset):
    trips = dataset["trips"]
    covered = collections.defaultdict(list)
    for t in trips:
        for c in t["countries"]:
            covered[(c["code"], t["tripTypeId"])].append(t["id"])

    countries_by_region = collections.defaultdict(list)
    for name, code in sorted(C.COUNTRY_CODES.items()):
        countries_by_region[C.COUNTRY_REGION[code]].append((name, code))

    trips_per_country = collections.Counter()
    for t in trips:
        for c in t["countries"]:
            trips_per_country[c["code"]] += 1
    trips_per_type = collections.Counter(t["tripTypeId"] for t in trips)

    rows = []
    for region_key, countries in countries_by_region.items():
        for name, code in countries:
            for tid, type_name, _slug in C.TRIP_TYPES:
                have = covered.get((code, tid), [])
                status, reason = viability(code, tid)
                rows.append({
                    "regionKey": region_key,
                    "region": C.REGIONS[region_key],
                    "country": name,
                    "countryCode": code,
                    "tripTypeId": tid,
                    "tripType": type_name,
                    "tripCount": len(have),
                    "tripIds": have,
                    "viability": status,
                    "viabilityReason": reason,
                    "state": ("covered" if have else
                              "blocked" if status == "not-viable" else
                              "gap"),
                    "priorityScore": 0.0,
                })

    # Priority: favour thin countries and thin trip types; marginal slots score lower.
    for r in rows:
        if r["state"] != "gap":
            continue
        country_weight = 1.0 / (1 + trips_per_country[r["countryCode"]])
        type_weight = 1.0 / (1 + trips_per_type[r["tripTypeId"]])
        penalty = 0.45 if r["viability"] == "marginal" else 1.0
        r["priorityScore"] = round((0.6 * country_weight + 0.4 * type_weight) * penalty, 5)

    gaps = sorted([r for r in rows if r["state"] == "gap"],
                  key=lambda r: -r["priorityScore"])
    for i, r in enumerate(gaps):
        r["priorityTier"] = "P1" if i < 20 else "P2" if i < 60 else "P3"
    return rows, gaps, trips_per_country, trips_per_type


SYMBOL = {"covered": "●", "gap": "·", "blocked": "✕"}


def write_report(dataset, rows, gaps, per_country, per_type, path):
    trips = dataset["trips"]
    by_state = collections.Counter(r["state"] for r in rows)
    lines = []
    lines.append("# Carta — coverage and gap matrix\n")
    lines.append(f"{len(trips)} trips · {len(C.COUNTRY_CODES)} countries × "
                 f"{len(C.TRIP_TYPES)} trip types = {len(rows)} possible slots\n")
    lines.append(f"- **{by_state['covered']} slots covered** "
                 f"({by_state['covered'] / len(rows):.0%})")
    lines.append(f"- **{by_state['gap']} fillable gaps** — no trip, but the geography supports one")
    lines.append(f"- **{by_state['blocked']} blocked slots** — geographically not viable, "
                 f"do not synthesize\n")
    lines.append("Legend: ● covered · `·` fillable gap · ✕ geographically blocked\n")

    header = "| Country | " + " | ".join(str(i) for i, _n, _s in C.TRIP_TYPES) + " | Trips |"
    sep = "|---|" + "---|" * (len(C.TRIP_TYPES) + 1)
    for region_key, region_name in C.REGIONS.items():
        region_rows = [r for r in rows if r["regionKey"] == region_key]
        if not region_rows:
            continue
        lines.append(f"## {region_name}\n")
        lines.append(header)
        lines.append(sep)
        countries = sorted({(r["country"], r["countryCode"]) for r in region_rows})
        for country, code in countries:
            cells = []
            for tid, _n, _s in C.TRIP_TYPES:
                r = next(x for x in region_rows
                         if x["countryCode"] == code and x["tripTypeId"] == tid)
                cell = SYMBOL[r["state"]]
                if r["state"] == "covered" and r["tripCount"] > 1:
                    cell = f"●{r['tripCount']}"
                if r["state"] == "gap" and r["viability"] == "marginal":
                    cell = "◦"
                cells.append(cell)
            lines.append(f"| {country} | " + " | ".join(cells) + f" | {per_country[code]} |")
        lines.append("")
    lines.append("Column numbers are trip-type ids: " +
                 ", ".join(f"{i} {n}" for i, n, _s in C.TRIP_TYPES) +
                 ". `◦` marks a fillable gap that only supports a reduced form of the type.\n")

    lines.append("## Trip-type balance\n")
    lines.append("| Trip type | Trips | Countries covered | Fillable gaps | Blocked |")
    lines.append("|---|---|---|---|---|")
    for tid, name, _s in C.TRIP_TYPES:
        rs = [r for r in rows if r["tripTypeId"] == tid]
        lines.append(f"| {name} | {per_type[tid]} | "
                     f"{sum(1 for r in rs if r['state'] == 'covered')} | "
                     f"{sum(1 for r in rs if r['state'] == 'gap')} | "
                     f"{sum(1 for r in rs if r['state'] == 'blocked')} |")
    lines.append("")

    lines.append("## Country balance\n")
    lines.append("| Country | Region | Trips | Types covered | Fillable gaps | Blocked |")
    lines.append("|---|---|---|---|---|---|")
    for name, code in sorted(C.COUNTRY_CODES.items(), key=lambda kv: (-per_country[kv[1]], kv[0])):
        rs = [r for r in rows if r["countryCode"] == code]
        lines.append(f"| {name} | {C.REGIONS[C.COUNTRY_REGION[code]]} | {per_country[code]} | "
                     f"{sum(1 for r in rs if r['state'] == 'covered')} | "
                     f"{sum(1 for r in rs if r['state'] == 'gap')} | "
                     f"{sum(1 for r in rs if r['state'] == 'blocked')} |")
    lines.append("")

    lines.append("## Prioritised fill list\n")
    lines.append("Priority favours countries and trip types that are thinnest today; "
                 "`marginal` slots are discounted because they can only carry a reduced "
                 "version of the type.\n")
    for tier in ("P1", "P2", "P3"):
        tier_rows = [g for g in gaps if g["priorityTier"] == tier]
        lines.append(f"### {tier} — {len(tier_rows)} slots\n")
        lines.append("| Country | Trip type | Viability | Note |")
        lines.append("|---|---|---|---|")
        for g in tier_rows:
            lines.append(f"| {g['country']} | {g['tripType']} | {g['viability']} | "
                         f"{g['viabilityReason'] or '—'} |")
        lines.append("")

    lines.append("## Blocked slots — do not synthesize\n")
    lines.append("| Country | Trip type | Why |")
    lines.append("|---|---|---|")
    for r in rows:
        if r["state"] == "blocked":
            lines.append(f"| {r['country']} | {r['tripType']} | {r['viabilityReason']} |")
    lines.append("")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(ROOT, "data", "trips.master.json"))
    ap.add_argument("--report", default=os.path.join(ROOT, "reports", "gap-matrix.md"))
    ap.add_argument("--json", default=os.path.join(ROOT, "reports", "gap-matrix.json"))
    args = ap.parse_args()

    with open(args.data, encoding="utf-8") as fh:
        dataset = json.load(fh)
    rows, gaps, per_country, per_type = build(dataset)
    write_report(dataset, rows, gaps, per_country, per_type, args.report)
    with open(args.json, "w", encoding="utf-8") as fh:
        json.dump({"slots": rows, "gapsByPriority": gaps}, fh, ensure_ascii=False, indent=2)

    states = collections.Counter(r["state"] for r in rows)
    print(f"SLOTS:{len(rows)}  COVERED:{states['covered']}  GAPS:{states['gap']}  "
          f"BLOCKED:{states['blocked']}")
    print(f"report -> {args.report}")


if __name__ == "__main__":
    main()
