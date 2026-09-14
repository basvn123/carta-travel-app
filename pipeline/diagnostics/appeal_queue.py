"""Prioritised curation queue (A7) - where a hand-scored appeal pays most.

A4's calibration and A6's badges are compensations; the real fix for the
1,468-place appeal gap is closing it. This ranks every uncurated destination
by expected impact and emits the top of the list, so curation effort goes
where it changes the most surfaces:

  impact = modelled score x fame percentile x country coverage deficit

  modelled score    a place the model already thinks is strong has the most
                    to gain or lose from a real judgement
  fame percentile   a place people actually look at surfaces more often
  coverage deficit  1 - the country's appeal coverage: Germany at 30%
                    starves whole country pages; Ireland at 88% does not

Output: reports/appeal_queue.csv, capped at MAX_ROWS per run, stamped with
the run date. Re-running after new curation shrinks the queue, because a
newly curated destination leaves it. Expect Germany, the Netherlands and
Sweden to dominate the first pages - those are the countries where the
interface currently lies by omission.

Usage:
    python pipeline/diagnostics/appeal_queue.py
"""

import csv
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_MASTER = ROOT / "app_data" / "app_data.json"
_WIRE = ROOT / "continent-app" / "public" / "app_data.json"
INPUT = _MASTER if _MASTER.exists() else _WIRE
OUTPUT = ROOT / "reports" / "appeal_queue.csv"

MAX_ROWS = 300


def fame_percentiles(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    pct = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2.0 / max(1, len(order) - 1)
        for k in range(i, j + 1):
            pct[order[k]] = avg
        i = j + 1
    return pct


def main():
    data = json.loads(INPUT.read_text(encoding="utf-8"))
    dests = data["destinations"]

    by_country = {}
    for d in dests.values():
        by_country.setdefault(d.get("country"), []).append(
            "appeal" in (d["rating"].get("components") or {}))
    coverage = {c: sum(v) / len(v) for c, v in by_country.items()}

    ids = list(dests)
    pcts = fame_percentiles([dests[i]["rating"].get("fame") or 0 for i in ids])
    fame_pct = dict(zip(ids, pcts))

    rows = []
    for did, d in dests.items():
        r = d["rating"]
        if "appeal" in (r.get("components") or {}):
            continue
        deficit = 1.0 - coverage[d.get("country")]
        impact = r["score"] * fame_pct[did] * deficit
        rows.append({
            "impact": round(impact, 3),
            "id": did,
            "city": d.get("city"),
            "country": d.get("country"),
            "class": (d.get("place") or {}).get("class"),
            "modelled_score": r["score"],
            "confidence": r.get("confidence"),
            "fame_pctl": round(fame_pct[did], 3),
            "country_coverage": round(coverage[d.get("country")], 3),
            "country_rank": d.get("country_rank"),
            "queued": str(date.today()),
        })
    rows.sort(key=lambda x: -x["impact"])
    rows = rows[:MAX_ROWS]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    top50 = rows[:50]
    sub40 = sum(1 for r in top50 if r["country_coverage"] < 0.40)
    from collections import Counter
    top_countries = Counter(r["country"] for r in top50).most_common(5)
    print(f"wrote {OUTPUT.name}: {len(rows)} rows "
          f"({sum(1 for _ in dests)} dests scanned)")
    print(f"top 50: {sub40} from sub-40%-coverage countries; "
          f"leaders {top_countries}")


if __name__ == "__main__":
    main()
