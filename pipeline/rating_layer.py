"""Traveller rating engine - schema v14 `dest.rating` (rating_v2).

Turns a curated editorial judgement plus two data signals into one clear
0-10 destination score and a Michelin-Green-Guide-style tier:

  score   0-10, one decimal - "how strong is this destination overall?"
  tier    3  "Worth the journey"   (>= 8.5, the continent's icons, ~8%)
          2  "Worth a detour"      (>= 7.5, excellent, plan around them)
          1  "Worth a visit"       (>= 6.8, solid picks)
          0  (no label)            (rest - fine if they fit the route)
  hidden_gem  true when the place rates high but the world hasn't noticed.

v2 rationale (replacing rating_v1): v1 weighted Wikipedia fame at 35% and
leaned on the beauty index's UNESCO-*proximity* heritage component, which
let big transit cities outrank stunning remote places (Charleroi 6.6 vs
Theth 5.9). v2 separates "how good is it" from "how known is it":

  appeal  0.70  curated 0-10 traveller-appeal judgement per destination
                (app_data/curated_appeal.json): scenery, architecture,
                atmosphere, culture, food, beaches/nature - scored against
                fixed anchors (Rome 10 ... Charleroi 2.5), independent of
                fame or airport convenience.
  beauty  0.15  the composite Beauty Index (beauty_layer.py): UNESCO
                heritage proximity, scenic-nature tags, iconic status,
                Blue-Flag beaches.
  things  0.15  depth of the POI catalogue (activities.items_full),
                rate-weighted and saturating, scaled to 0-10.

Fame (avg daily Wikipedia pageviews, cache/dest_pageviews.json) no longer
moves the score AT ALL - it only decides hidden_gem: a highly-rated place
in the catalogue's low-fame tail, or one the curators flagged as a gem.

The score is ABSOLUTE (no percentile re-spreading): 8+ genuinely means
outstanding, 3 genuinely means skip it unless it's on the way.

Multi-airport cities are unified onto their primary airport first (same
convention as the beauty layer) so Paris ranks once, not three times.
"""

import json
import math
from pathlib import Path

import beauty_layer

ROOT = Path(__file__).resolve().parents[1]
DEST_PV_CACHE = ROOT / "cache" / "dest_pageviews.json"
CURATED_APPEAL = ROOT / "app_data" / "curated_appeal.json"

WEIGHTS = {"appeal": 0.70, "beauty": 0.15, "things_to_do": 0.15}

# POI importance-rate -> contribution to the things-to-do raw count.
POI_RATE_WEIGHT = {3: 1.0, 2: 0.45}
POI_RATE_WEIGHT_LOW = 0.15      # rate 1/0 sights
POI_ACTIVE_WEIGHT = 0.30        # "get active" POIs (sport/nature)
# Raw count where the component nears 1. Recalibrated 14 -> 28 after the Overture
# bulk POI import roughly doubled items_full: at 14 the term had gone near-flat
# (~25% of destinations pegged the 0-1 ceiling, median 0.93, ~zero correlation
# with appeal), inflating scores without differentiating. 28 restored the
# original spread. Recalibrated 28 -> 19 in 2026-08 when the significance
# engine (score_significance.py) deflated rate-3 from 30% to 10% of POIs and
# dup/noise items left the count: the per-dest raw median moved to ~25, and
# 25/19 ~= 1.32 keeps the median component at the calibrated ~0.73. Keep
# sat ~= median_raw / 1.32 if the catalogue shifts materially again.
THINGS_SATURATION = 19.0

TIER_CUTOFFS = {3: 8.5, 2: 7.5, 1: 6.8}
TIER_LABELS = {3: "Worth the journey", 2: "Worth a detour", 1: "Worth a visit"}

# Hidden gem: rated high AND in the catalogue's low-fame tail, or curated
# as a gem by the editors (and still at least tier-1 quality).
HIDDEN_GEM_FAME_PCTL = {2: 0.40, 1: 0.20}   # min tier -> max fame percentile
HIDDEN_GEM_MIN_SCORE = 7.0                   # floor for curator-flagged gems
# The curator flag alone can't overrule fame: a place in the catalogue's TOP
# fame tail (Utrecht at ~13k views/day) is not hidden, whatever the flag says.
HIDDEN_GEM_CURATED_MAX_FAME_PCTL = 0.6

RATING_MODEL = {
    "version": "rating_v2",
    "weights": WEIGHTS,
    "tier_cutoffs": {str(k): v for k, v in TIER_CUTOFFS.items()},
    "tier_labels": {str(k): v for k, v in TIER_LABELS.items()},
    "hidden_gem": ("(tier>=2 & fame_pctl<=0.40) or (tier==1 & fame_pctl<=0.20) "
                   "or (curated gem & score>=7.0 & fame_pctl<=0.6)"),
    "scale": "absolute 0-10 (no percentile re-spreading)",
    "components": {
        "appeal": "curated 0-10 traveller-appeal judgement (curated_appeal.json)",
        "beauty": "composite Beauty Index (UNESCO, nature tags, iconic, beaches)",
        "things_to_do": "rate-weighted saturating POI count (OpenTripMap items_full)",
        "fame": "avg daily Wikipedia pageviews - hidden-gem signal only, not scored",
    },
    "tier_language_source": "Michelin Green Guide three-star idiom",
}


def load_dest_pageviews():
    if DEST_PV_CACHE.exists():
        return json.loads(DEST_PV_CACHE.read_text(encoding="utf-8"))
    return {}


def load_curated_appeal():
    if CURATED_APPEAL.exists():
        return json.loads(CURATED_APPEAL.read_text(encoding="utf-8"))
    return {}


def things_to_do01(dest):
    act = (dest.get("activities") or {})
    items = act.get("items_full") or []
    if not items:
        # thin fallback: name-only list (up to 8 items)
        n = len(act.get("items") or [])
        return min(1.0, (n * 0.6) / THINGS_SATURATION) if n else 0.0
    raw = 0.0
    for it in items:
        if it.get("dup") or it.get("noise"):
            continue        # 2026-08: dedupe/noise tags, not real depth
        if it.get("active"):
            raw += POI_ACTIVE_WEIGHT
        else:
            raw += POI_RATE_WEIGHT.get(it.get("rate"), POI_RATE_WEIGHT_LOW)
    return 1.0 - math.exp(-raw / THINGS_SATURATION)


def blend_score(dest, appeal_rec):
    """Absolute 0-10 score. Falls back to beauty-led scoring when a
    destination has no curated appeal entry (shouldn't happen in practice)."""
    beauty = (dest.get("beauty") or {}).get("score", 0) or 0.0
    things = things_to_do01(dest) * 10.0
    if appeal_rec and appeal_rec.get("appeal") is not None:
        appeal = float(appeal_rec["appeal"])
        total = (WEIGHTS["appeal"] * appeal
                 + WEIGHTS["beauty"] * beauty
                 + WEIGHTS["things_to_do"] * things)
    else:
        total = 0.7 * beauty + 0.3 * things
        appeal = None
    comps = {"beauty": round(beauty / 10.0, 3),
             "things_to_do": round(things / 10.0, 3)}
    if appeal is not None:
        comps["appeal"] = round(appeal / 10.0, 3)
    return max(0.0, min(10.0, total)), comps


def tier_for(score):
    for tier in (3, 2, 1):
        if score >= TIER_CUTOFFS[tier]:
            return tier
    return 0


def _percentiles(values):
    """value -> percentile in 0..1 (average rank, stable for ties)."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    pct = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        # average rank of the tie group
        avg = (i + j) / 2.0 / max(1, len(order) - 1)
        for k in range(i, j + 1):
            pct[order[k]] = avg
        i = j + 1
    return pct


def compute_ratings(dests):
    """Attach dest['rating'] to every destination. Returns summary counts."""
    pv = load_dest_pageviews()
    appeal = load_curated_appeal()

    ids = list(dests.keys())
    scores, comps, views_list, curated_gem = [], [], [], []
    for did in ids:
        d = dests[did]
        rec = appeal.get(did)
        s, c = blend_score(d, rec)
        scores.append(s)
        comps.append(c)
        views_list.append(pv.get(did) or 0)
        curated_gem.append(bool(rec and rec.get("gem")))

    # Unify multi-airport cities BEFORE ranking so a city holds one slot's
    # worth of identical numbers (mirrors beauty_layer convention).
    groups = {}
    for i, did in enumerate(ids):
        d = dests[did]
        if d.get("tier") != "airport":
            continue
        key = (d.get("iso2"), beauty_layer._base_city(d.get("city")))
        groups.setdefault(key, []).append(i)
    rep = list(range(len(ids)))          # index -> its group representative
    for idxs in groups.values():
        if len(idxs) < 2:
            continue
        recs = [dests[ids[i]] for i in idxs]
        primary = beauty_layer._pick_primary(recs)
        pi = idxs[recs.index(primary)]
        for i in idxs:
            rep[i] = pi
            scores[i] = scores[pi]
            comps[i] = dict(comps[pi])
            views_list[i] = views_list[pi]
            curated_gem[i] = curated_gem[pi]

    # Fame percentiles over unique city slots only (London's four airports
    # hold ONE slot); siblings inherit the primary's percentile.
    slots = sorted({rep[i] for i in range(len(ids))})
    slot_fame_pctls = _percentiles([views_list[i] for i in slots])
    slot_pos = {s: k for k, s in enumerate(slots)}
    fame_pctls = [slot_fame_pctls[slot_pos[rep[i]]] for i in range(len(ids))]

    counts = {3: 0, 2: 0, 1: 0, 0: 0, "hidden_gem": 0}
    for i, did in enumerate(ids):
        score = round(scores[i], 1)
        tier = tier_for(score)
        fame_pct = fame_pctls[i]
        hidden = ((tier >= 2 and fame_pct <= HIDDEN_GEM_FAME_PCTL[2])
                  or (tier == 1 and fame_pct <= HIDDEN_GEM_FAME_PCTL[1])
                  or (curated_gem[i] and score >= HIDDEN_GEM_MIN_SCORE
                      and fame_pct <= HIDDEN_GEM_CURATED_MAX_FAME_PCTL))
        dests[did]["rating"] = {
            "score": score,
            "tier": tier,
            "label": TIER_LABELS.get(tier),
            "hidden_gem": bool(hidden),
            "fame": int(views_list[i]),
            "components": comps[i],
            "source": RATING_MODEL["version"],
        }
        counts[tier] += 1
        counts["hidden_gem"] += 1 if hidden else 0
    return counts
