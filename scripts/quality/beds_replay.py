"""Beds replay: the bed sanity rules run over real stays records (D10, wave 2 step 1.4).

Read-only. Loads the stays build the box publishes (the country files in
cache/stays/out/v1, each record with beds, month and src.n) and runs
pipeline/stays/bed_rules.clean_many over all of them, the same call
build_stays.build() and apply_stays.apply_build() make. Prints:

- tiers out of order and tiers under the floor, before and after (after must
  be 0: the exit code is 1 otherwise);
- the drops per rule (thin, floor, country_x3, order) and per tier;
- the measured share effect: places with beds before and after, against the
  wave 1 apply guard (2 points, apply_stays.MAX_MEASURED_LOSS), and the effect
  of the thin rule alone (if it alone costs more than 2 points the threshold
  goes from n < 3 to n < 2 and checks.md says why);
- pair_stop: a star pair that, after the thin and floor rules, still sits out
  of order in more than 5 percent of that tier's places. Reported with every
  run for the owner of the rule to judge (do not widen the rule to hide it);
  it does not change the exit code;
- the place named by --find (Ripon, K-12), looked up by name in --master, or
  "not found".

    python scripts/quality/beds_replay.py [--records DIR] [--master FILE] [--find Ripon]

Exit 0: no tier out of order or under the floor after cleaning and the share
loss within the guard. Exit 1 otherwise.
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "stays"))
import bed_rules as br  # noqa: E402

DEFAULT_RECORDS = ROOT / "cache" / "stays" / "out" / "v1"
MAX_LOSS = 0.02          # apply_stays.MAX_MEASURED_LOSS, the wave 1 apply guard
PAIR_STOP = 0.05


def load_records(folder: Path):
    records, country = {}, {}
    for f in sorted(folder.glob("[A-Z][A-Z].json")):
        blob = json.loads(f.read_text(encoding="utf-8"))
        for did, rec in (blob.get("dests") or {}).items():
            records[did] = rec
            country[did] = blob.get("cc") or f.stem
    return records, country


def count_bad(records):
    ooo = sum(bool(br.order_violations(r.get("beds"))) for r in records.values())
    flo = sum(bool(br.under_floor(r.get("beds"))) for r in records.values())
    return ooo, flo


def replay(records, country, names=None, denominator=None, find=None):
    """The result dict (no printing); `denominator` is the number of places
    the share is taken over (the master's places), else the records."""
    places = denominator or len(records)
    before_n = sum(1 for r in records.values() if r.get("beds"))
    ooo0, flo0 = count_bad(records)
    pairs, pairs_raw = collections.Counter(), collections.Counter()
    for r in records.values():
        beds = r.get("beds") or {}
        for pair in br.order_violations(beds):
            pairs_raw[pair] += 1
        # The pairs that survive the thin and floor rules are the ones the
        # order rule really drops (a thin tier goes first and settles some).
        gone = set(br.thin_tiers(r.get("src"))) | set(br.under_floor(beds))
        for pair in br.order_violations({t: v for t, v in beds.items() if t not in gone}):
            pairs[pair] += 1
    cleaned, why = br.clean_many(records, country)
    after_n = sum(1 for r in cleaned.values() if r.get("beds"))
    ooo1, flo1 = count_bad(cleaned)
    reasons = collections.Counter(w for ws in why.values() for _t, w in ws)
    tiers = collections.Counter(f"{t}:{w}" for ws in why.values() for t, w in ws)
    # The thin rule alone: places left without any tier.
    thin_only = 0
    for r in records.values():
        left = {t for t in (r.get("beds") or {})} - set(br.thin_tiers(r.get("src")))
        thin_only += bool(r.get("beds")) and not left
    tier_places = collections.Counter(t for r in records.values() for t in (r.get("beds") or {}))
    stop = []
    for (lo, hi), n in pairs.items():
        if lo in br.STARS and n / max(1, tier_places[lo]) > PAIR_STOP:
            stop.append({"pair": [lo, hi], "places": n, "share_of_tier": round(n / tier_places[lo], 4)})
    res = {
        "records": len(records), "places": places,
        "out_of_order_before": ooo0, "out_of_order_after": ooo1,
        "under_floor_before": flo0, "under_floor_after": flo1,
        "order_pairs_raw": {f"{a}>{b}": n for (a, b), n in sorted(pairs_raw.items())},
        "order_pairs_after_thin": {f"{a}>{b}": n for (a, b), n in sorted(pairs.items())},
        "drops_by_rule": dict(reasons), "drops_by_tier": dict(sorted(tiers.items())),
        "places_with_a_drop": len(why),
        "with_beds_before": before_n, "with_beds_after": after_n,
        "share_before": round(before_n / places, 4), "share_after": round(after_n / places, 4),
        "share_loss_points": round((before_n - after_n) / places * 100, 2),
        "thin_alone_places_emptied": thin_only,
        "thin_alone_loss_points": round(thin_only / places * 100, 2),
        "pair_stop": stop,
    }
    if find and names:
        hits = [(i, n) for i, n in names.items() if find.lower() in n.lower()]
        res["find"] = {find: [{"id": i, "name": n, "beds_before": (records.get(i) or {}).get("beds"),
                               "beds_after": (cleaned.get(i) or {}).get("beds"),
                               "dropped": why.get(i)} for i, n in hits[:5]] or "not found"}
    res["accept"] = (ooo1 == 0 and flo1 == 0
                     and res["share_loss_points"] <= MAX_LOSS * 100 and len(records) > 0)
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Beds replay (D10)")
    ap.add_argument("--records", default=str(DEFAULT_RECORDS))
    ap.add_argument("--master", help="a master app_data JSON: place names and the number of places")
    ap.add_argument("--find", default="Ripon")
    a = ap.parse_args(argv)
    folder = Path(a.records)
    if not folder.is_dir():
        print(f"beds replay: no records at {folder}", file=sys.stderr)
        return 2
    records, country = load_records(folder)
    names, denom = None, None
    if a.master:
        dests = json.loads(Path(a.master).read_text(encoding="utf-8"))["destinations"]
        names = {i: d.get("name") or "" for i, d in dests.items()}
        denom = sum(1 for d in dests.values() if not d.get("gateway_of"))
    res = replay(records, country, names, denom, a.find)
    print(json.dumps(res, ensure_ascii=False))
    print("ACCEPT" if res["accept"] else "FAIL")
    return 0 if res["accept"] else 1


if __name__ == "__main__":
    sys.exit(main())
