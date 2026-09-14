"""Shadow-score consistency check for the curated appeal file.

70% of every rating is one hand-scored number (curated_appeal.json). This
pass computes a SHADOW score for each destination purely from independent
data the pipeline already ships - beauty index, Wikivoyage guide depth,
must-see POI depth, protected nature, log-fame - and flags every destination
where the curators and the data disagree by more than GAP_FLAG points.

The output (app_data/rating_review_queue.json) is a human review queue, NOT
an auto-correction: a big gap means "look at this one", because either the
curator slipped (batch compression, a 6.5 magnet) or the data is thin (a
genuinely great place with no guide and few POIs). Nothing here modifies the
dataset.

Usage:
    python rating_shadow_report.py            # writes the review queue
    python rating_shadow_report.py --batch appeal_2026_07d.json
                                              # restrict to one appeal batch's ids
"""

import json
import math
import sys
from pathlib import Path
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"
CURATED = ROOT / "app_data" / "curated_appeal.json"
PV_CACHE = ROOT / "cache" / "dest_pageviews.json"
OUT = ROOT / "app_data" / "rating_review_queue.json"
WV_LISTINGS = ROOT / "cache" / "wikivoyage_listings.json"

try:
    _WV_STATUS = {did: rec.get("status")
                  for did, rec in json.loads(
                      WV_LISTINGS.read_text(encoding="utf-8")).items()}
except Exception:
    _WV_STATUS = {}

GAP_FLAG = 2.0

# Shadow weights - every signal is appeal-independent.
W = {"beauty": 0.35, "must_see": 0.25, "guide": 0.15, "fame": 0.15, "nature": 0.10}


def shadow_components(d, pv):
    beauty = ((d.get("beauty") or {}).get("score") or 0.0)          # already 0-10
    items = ((d.get("activities") or {}).get("items_full")) or []
    rate3 = sum(1 for it in items
                if it.get("rate") == 3
                and not it.get("dup") and not it.get("noise"))
    must_see = min(rate3 / 12.0, 1.0) * 10.0
    # The MASTER stores the Wikivoyage extract as guide.text ("blurb" only
    # exists in the served copy after sync-data slimming). Reading "blurb"
    # here made the guide component silently zero for every destination.
    g = d.get("guide") or {}
    guide_txt = g.get("text") or g.get("blurb") or ""
    guide = min(len(guide_txt) / 1500.0, 1.0) * 10.0
    # Wikivoyage's own review ladder beats raw text length where we have it:
    # Star/Guide articles are rare, hand-reviewed levels (a strong "worth
    # visiting" signal), cached by harvest_wikivoyage_listings.py.
    status = (_WV_STATUS or {}).get(d.get("id"))
    guide = max(guide, {"star": 10.0, "guide": 8.0, "usable": 5.0}.get(status, 0.0))
    fame = min(math.log10(1 + (pv or 0)) / 3.5, 1.0) * 10.0        # ~3000/day = ceiling
    nature = min(len(d.get("nature") or []) / 5.0, 1.0) * 10.0
    return {"beauty": beauty, "must_see": must_see, "guide": guide,
            "fame": fame, "nature": nature}


def main():
    batch_ids = None
    if "--batch" in sys.argv:
        batch_file = ROOT / "app_data" / sys.argv[sys.argv.index("--batch") + 1]
        batch_ids = set(json.loads(batch_file.read_text(encoding="utf-8")).keys())

    data = json.loads(DATA.read_text(encoding="utf-8"))
    curated = json.loads(CURATED.read_text(encoding="utf-8"))
    pv = json.loads(PV_CACHE.read_text(encoding="utf-8")) if PV_CACHE.exists() else {}

    rows = []
    for did, d in data["destinations"].items():
        if batch_ids is not None and did not in batch_ids:
            continue
        rec = curated.get(did)
        if not rec or rec.get("appeal") is None:
            continue
        comps = shadow_components(d, pv.get(did))
        shadow = sum(W[k] * v for k, v in comps.items())
        appeal = float(rec["appeal"])
        gap = round(appeal - shadow, 2)
        if abs(gap) >= GAP_FLAG:
            rows.append({
                "id": did,
                "city": d.get("city"),
                "country": d.get("country"),
                "appeal": appeal,
                "shadow": round(shadow, 2),
                "gap": gap,       # positive = curators above the data
                "verdict": "curators_above_data" if gap > 0 else "data_above_curators",
                "components": {k: round(v, 1) for k, v in comps.items()},
                "why": rec.get("why"),
            })

    rows.sort(key=lambda r: -abs(r["gap"]))
    atomic_write_json(OUT, rows, indent=1, ensure_ascii=False)
    over = sum(1 for r in rows if r["gap"] > 0)
    print(f"flagged {len(rows)} of {len(curated)} curated entries "
          f"(|gap| >= {GAP_FLAG}): {over} curators-above-data, "
          f"{len(rows) - over} data-above-curators")
    for r in rows[:15]:
        print(f"  {r['gap']:+5.1f}  {r['city']:26s} appeal {r['appeal']:.1f} "
              f"vs shadow {r['shadow']:.1f}  {r['verdict']}")
    print(f"review queue: {OUT}")


if __name__ == "__main__":
    main()
