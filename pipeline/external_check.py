"""External check of the v5 ratings (T760, the plan's gate 6; closes the
review step of T469-d).

Tier: Manual (once per rating version)

Compares Carta's scores with four outside judgements:
  - Tripadvisor Travelers' Choice destinations, Europe, the latest two years
  - Lonely Planet Best in Travel, European entries, the last five editions
  - UNESCO World Heritage: unesco_whc designations at the place (in the data)
  - Wikivoyage: whether the place has a guide (in the data; no star status
    is harvested)
The two published lists are research inputs, one JSON row per entry with the
page it was read from: data/rating/external/tripadvisor.json and
lonelyplanet.json.

Prints, and writes as JSON for the report:
  - Spearman rank correlation, over our top 200, of our score against each
    reference signal (absent = 0)
  - the largest gaps both ways: places a published list names that we score
    low, and places in our top 200 that no outside source supports

Usage:
    python external_check.py [--top 200] [--gaps 30] [--out path.json]
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
EXTERNAL = ROOT / "data" / "rating" / "external"
SIGNALS = ("tripadvisor", "lonelyplanet", "unesco", "wikivoyage")


def ranks(values):
    """Average ranks, 1 = smallest; ties share their mean rank."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    out = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            out[order[k]] = (i + j) / 2.0 + 1.0
        i = j + 1
    return out


def spearman(xs, ys):
    rx, ry = ranks(xs), ranks(ys)
    n = len(xs)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = sum((a - mx) ** 2 for a in rx) ** 0.5
    vy = sum((b - my) ** 2 for b in ry) ** 0.5
    return cov / (vx * vy) if vx and vy else 0.0


def list_points(rows):
    """{id: points} from a ranked list: an entry earns (size + 1 - rank) /
    size of its list, so the top of a 25-place list earns 1 and an unranked
    entry earns half; a place named in several lists or years adds up."""
    by_list = {}
    for r in rows:
        by_list.setdefault((r.get("list"), r.get("year") or r.get("edition")), []).append(r)
    pts = {}
    for entries in by_list.values():
        size = max([e["rank"] for e in entries if e.get("rank")] or [len(entries)])
        for e in entries:
            if not e.get("id"):
                continue
            p = (size + 1 - e["rank"]) / size if e.get("rank") else 0.5
            pts[e["id"]] = pts.get(e["id"], 0.0) + p
    return pts


def load_list(name):
    path = EXTERNAL / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=200)
    ap.add_argument("--gaps", type=int, default=30)
    ap.add_argument("--out")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    dests = json.loads(MASTER.read_text(encoding="utf-8"))["destinations"]
    rated = {k: d for k, d in dests.items() if (d.get("rating") or {}).get("score") is not None}
    ta_rows, lp_rows = load_list("tripadvisor"), load_list("lonelyplanet")
    signal = {
        "tripadvisor": list_points(ta_rows),
        "lonelyplanet": list_points(lp_rows),
        "unesco": {k: sum(1 for x in d.get("designations") or [] if x.get("kind") == "unesco_whc")
                   for k, d in rated.items()},
        "wikivoyage": {k: 1.0 if (d.get("guide") or {}).get("url") else 0.0
                       for k, d in rated.items()},
    }
    order = sorted(rated, key=lambda k: (-rated[k]["rating"]["score"], k))
    top = order[:args.top]
    pos = {k: i + 1 for i, k in enumerate(order)}
    ours = [rated[k]["rating"]["score"] for k in top]
    corr = {s: round(spearman(ours, [signal[s].get(k, 0.0) for k in top]), 3) for s in SIGNALS}
    covered = {s: sum(1 for k in top if signal[s].get(k)) for s in SIGNALS}

    # Gaps. "Named, scored low": a place a published list names, by how far
    # down our order it sits. "Top, unsupported": a place in our top with no
    # list entry, no UNESCO register and no Wikivoyage guide, by our rank.
    named = set(signal["tripadvisor"]) | set(signal["lonelyplanet"])
    named_low = sorted((k for k in named if k in rated), key=lambda k: -pos[k])
    unsupported = [k for k in top if not any(signal[s].get(k) for s in SIGNALS)]
    half = args.gaps // 2
    picks = ([("named_low", k) for k in named_low[:half]]
             + [("top_unsupported", k) for k in unsupported[:args.gaps - half]])
    missing = [r for r in ta_rows + lp_rows if r.get("id") and r["id"] not in rated]

    def ref_text(k):
        out = []
        for r in ta_rows:
            if r.get("id") == k:
                out.append(f"Tripadvisor {r['list']} {r['year']} #{r.get('rank')}")
        for r in lp_rows:
            if r.get("id") == k:
                out.append(f"Lonely Planet {r['edition']} {r['list']}"
                           + (f" #{r['rank']}" if r.get("rank") else ""))
        if signal["unesco"].get(k):
            out.append("UNESCO World Heritage at the place")
        if signal["wikivoyage"].get(k):
            out.append("Wikivoyage guide")
        return "; ".join(out) or "none"

    gaps = [{"kind": kind, "id": k, "name": rated[k].get("city"),
             "country": rated[k].get("country"),
             "class": (rated[k].get("place") or {}).get("class"),
             "score": rated[k]["rating"]["score"], "our_rank": pos[k],
             "confidence": rated[k]["rating"].get("confidence"),
             "references": ref_text(k),
             "urls": sorted({r["url"] for r in ta_rows + lp_rows if r.get("id") == k and r.get("url")})}
            for kind, k in picks]
    result = {"n_rated": len(rated), "top": args.top, "spearman": corr,
              "top_covered": covered, "named_mapped": len(named),
              "named_not_rated": [r["name"] for r in missing], "gaps": gaps}
    print(f"Spearman over our top {args.top}: " +
          "  ".join(f"{s} {corr[s]:+.3f} ({covered[s]} with a signal)" for s in SIGNALS))
    print(f"places named by a list and mapped: {len(named)}; "
          f"top {args.top} with no outside support: {len(unsupported)}")
    for g in gaps:
        print(f"  {g['kind']:16s} #{g['our_rank']:4d} {g['score']:4.1f} {g['name']} "
              f"({g['country']}, {g['class']}): {g['references']}")
    if args.out:
        Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n",
                                  encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
