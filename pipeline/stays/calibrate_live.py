"""Calibrate the live bed price (T562): is `typ` biased, and how noisy is it?

The live price (continent-app/src/lib/liveStays.js) divides tonight's Xotelo
price of each of a town's hotels by that hotel's typical night (`typ` in
`xk`, the geometric mean of TripAdvisor's yearly low and high), and compares
the result with the model's own season for that month. On an ordinary weekday
the two should agree on average; if they do not, `typ` is biased and every
live price leans one way.

This samples towns with live keys across countries and sizes, prices their
hotels on ordinary Tuesdays spread over the year, and reports per town and
date: live factor / model season. Then:
  bias    the median of that ratio over every sample (1.0 = no bias); the
          app's typ is multiplied by it (TYP_SCALE in live_keys.py)
  noise   the spread of log(ratio) between dates of one town, against the
          spread between towns, which sets how hard to damp (LIVE_DAMP)

Polite: one call at a time, the Xotelo client's gap. About 480 calls.

Usage:
  python pipeline/stays/calibrate_live.py --towns 30 [--seed 7]
Writes STATE/live_calibration.json.
"""

import argparse
import json
import math
import random
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUT, STATE, load_destinations, now_iso, write_json  # noqa: E402
from xotelo import Blocked, Client, rate_median  # noqa: E402


def tuesdays(today, months=(1, 3, 6, 9)):
    """One mid-month Tuesday this many months ahead, each well inside Xotelo's
    window and away from the peak weeks."""
    out = []
    for k in months:
        y, m = today.year + (today.month - 1 + k) // 12, (today.month - 1 + k) % 12 + 1
        d = date(y, m, 15)
        d += timedelta(days=(1 - d.weekday()) % 7)
        out.append(d)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--towns", type=int, default=30)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    recs = {}
    for p in sorted((OUT / "v1").glob("*.json")):
        if p.name != "manifest.json":
            recs.update(json.loads(p.read_text(encoding="utf-8"))["dests"])
    dests = {d["id"]: d for d in load_destinations()}
    pool = [i for i, r in recs.items()
            if sum(1 for x in r.get("xk", []) if x[1] == "h") >= 3
            and (r.get("month") or {}).get("hotel3") and i in dests]
    # Spread over countries: at most two towns a country, big and small mixed.
    rnd = random.Random(a.seed)
    rnd.shuffle(pool)
    per_cc, pick = {}, []
    for i in pool:
        cc = dests[i]["iso2"]
        if per_cc.get(cc, 0) < 2:
            per_cc[cc] = per_cc.get(cc, 0) + 1
            pick.append(i)
        if len(pick) >= a.towns:
            break
    days = tuesdays(date.today())
    client = Client()
    rows = []
    try:
        for i in pick:
            r = recs[i]
            curve = r["month"]["hotel3"]
            annual = statistics.median(curve)
            for d in days:
                ratios = []
                for key, kind, _stars, _band, typ in r["xk"]:
                    if kind != "h" or not typ:
                        continue
                    res = client.rates(key, d.isoformat(), (d + timedelta(days=1)).isoformat())
                    v, _ = rate_median(res)
                    if v:
                        ratios.append(v / typ)
                if len(ratios) < 2:
                    continue
                factor = statistics.median(ratios)
                season = curve[d.month - 1] / annual
                rows.append({"id": i, "cc": dests[i]["iso2"], "pop": dests[i].get("pop"),
                             "date": d.isoformat(), "factor": round(factor, 3),
                             "season": round(season, 3), "ratio": round(factor / season, 3),
                             "n": len(ratios)})
                print(f"{i} {d} factor {factor:.2f} season {season:.2f} ratio {factor / season:.2f}",
                      flush=True)
    except Blocked as e:
        print("Xotelo refused:", e)
    if not rows:
        sys.exit("no samples")
    logs = [math.log(x["ratio"]) for x in rows]
    bias = math.exp(statistics.median(logs))
    by_town = {}
    for x in rows:
        by_town.setdefault(x["id"], []).append(math.log(x["ratio"]))
    within = statistics.median([statistics.pstdev(v) for v in by_town.values() if len(v) > 1] or [0])
    between = statistics.pstdev([statistics.mean(v) for v in by_town.values()])
    out = {
        "built": now_iso(), "samples": len(rows), "towns": len(by_town), "calls": client.calls,
        "bias": round(bias, 3),
        "log_spread_within_town": round(within, 3),
        "log_spread_between_towns": round(between, 3),
        "rows": rows,
    }
    write_json(STATE / "live_calibration.json", out)
    print(json.dumps({k: v for k, v in out.items() if k != "rows"}, indent=1))


if __name__ == "__main__":
    main()
