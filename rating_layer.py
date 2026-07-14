"""Traveller rating engine - schema v14 `dest.rating`.

Turns three real signals into one clear 0-10 destination score plus a
Michelin-Green-Guide-style tier, replacing the old flat gem/no-gem look:

  score   0-10, one decimal - "how strong is this destination overall?"
  tier    3  "Worth the journey"   (top ~8%   - the continent's icons)
          2  "Worth a detour"      (next ~22% - excellent, plan around them)
          1  "Worth a visit"       (next ~35% - solid picks)
          0  (no label)            (rest      - fine if they fit the route)
  hidden_gem  true when the place rates high but the world hasn't noticed
              (tier >= 2 with fame below the 40th percentile, or tier 1
              below the 20th) - the "gem" concept, now earned by rating
              rather than by record type.

The tier language follows the Michelin Green Guide's three-star idiom
("worth a special journey" / "worth a detour" / "interesting"), the one
destination-rating system with a century of use behind it.

Components (weights in RATING_MODEL):
  beauty        the existing composite Beauty Index (beauty_layer.py):
                UNESCO heritage proximity, scenic-nature tags, curated
                iconic status, Blue-Flag beach strength.
  things_to_do  depth of the POI catalogue harvested from OpenTripMap
                (activities.items_full): saturating count weighted by the
                per-POI importance rate (3/2/1) so forty must-sees beat
                eight, but a village is not required to out-sight Rome.
  fame          avg daily Wikipedia pageviews of the destination's own
                article over the last 12 full months
                (cache/dest_pageviews.json, harvest_pageviews.py),
                log-scaled between ~30 and ~8000 views/day.

The blended 0..1 score is then mapped to the display scale through a fixed
percentile curve (DISPLAY_CURVE) so the catalogue always spreads readably:
the median destination sits near 6, the top of the catalogue reaches 10,
and the tier cutoffs (8.5 / 7.0 / 5.5) land on stable shares of the data.

Multi-airport cities are unified onto their primary airport first (same
convention as the beauty layer) so Paris ranks once, not three times.
"""

import json
import math
from pathlib import Path

import beauty_layer

ROOT = Path(__file__).resolve().parent
DEST_PV_CACHE = ROOT / "cache" / "dest_pageviews.json"

WEIGHTS = {"beauty": 0.45, "things_to_do": 0.20, "fame": 0.35}

# POI importance-rate -> contribution to the things-to-do raw count.
POI_RATE_WEIGHT = {3: 1.0, 2: 0.45}
POI_RATE_WEIGHT_LOW = 0.15      # rate 1/0 sights
POI_ACTIVE_WEIGHT = 0.30        # "get active" POIs (sport/nature)
THINGS_SATURATION = 14.0        # raw count where the component nears 1

# Fame: log10(avg daily views) anchors -> 0..1
FAME_LO_LOG = math.log10(30)    # sleepy village article
FAME_HI_LOG = math.log10(8000)  # continental icon

# Percentile -> display-score anchors (piecewise linear, monotone).
DISPLAY_CURVE = [
    (0.00, 2.5), (0.10, 4.0), (0.35, 5.5), (0.70, 7.0),
    (0.92, 8.5), (0.995, 9.6), (1.00, 10.0),
]

TIER_CUTOFFS = {3: 8.5, 2: 7.0, 1: 5.5}
TIER_LABELS = {3: "Worth the journey", 2: "Worth a detour", 1: "Worth a visit"}

HIDDEN_GEM_FAME_PCTL = {2: 0.40, 1: 0.20}   # min tier -> max fame percentile

RATING_MODEL = {
    "version": "rating_v1",
    "weights": WEIGHTS,
    "tier_cutoffs": {str(k): v for k, v in TIER_CUTOFFS.items()},
    "tier_labels": {str(k): v for k, v in TIER_LABELS.items()},
    "hidden_gem": "tier>=2 & fame_pctl<=0.40, or tier==1 & fame_pctl<=0.20",
    "display_curve": DISPLAY_CURVE,
    "components": {
        "beauty": "composite Beauty Index (UNESCO, nature tags, iconic, beaches)",
        "things_to_do": "rate-weighted saturating POI count (OpenTripMap items_full)",
        "fame": "log-scaled avg daily Wikipedia pageviews, last 12 full months",
    },
    "tier_language_source": "Michelin Green Guide three-star idiom",
}


def load_dest_pageviews():
    if DEST_PV_CACHE.exists():
        return json.loads(DEST_PV_CACHE.read_text(encoding="utf-8"))
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
        if it.get("active"):
            raw += POI_ACTIVE_WEIGHT
        else:
            raw += POI_RATE_WEIGHT.get(it.get("rate"), POI_RATE_WEIGHT_LOW)
    return 1.0 - math.exp(-raw / THINGS_SATURATION)


def fame01(views):
    if not views or views <= 0:
        return 0.0
    f = (math.log10(views) - FAME_LO_LOG) / (FAME_HI_LOG - FAME_LO_LOG)
    return max(0.0, min(1.0, f))


def blend01(dest, views):
    beauty = min(1.0, (dest.get("beauty") or {}).get("score", 0) / 10.0)
    things = things_to_do01(dest)
    fame = fame01(views)
    total = (WEIGHTS["beauty"] * beauty
             + WEIGHTS["things_to_do"] * things
             + WEIGHTS["fame"] * fame)
    return total, {"beauty": round(beauty, 3),
                   "things_to_do": round(things, 3),
                   "fame": round(fame, 3)}


def display_score(pctl):
    curve = DISPLAY_CURVE
    for (x0, y0), (x1, y1) in zip(curve, curve[1:]):
        if pctl <= x1:
            t = 0.0 if x1 == x0 else (pctl - x0) / (x1 - x0)
            return round(y0 + t * (y1 - y0), 1)
    return curve[-1][1]


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

    ids = list(dests.keys())
    blends, comps, views_list = [], [], []
    for did in ids:
        d = dests[did]
        views = pv.get(did) or 0
        b, c = blend01(d, views)
        blends.append(b)
        comps.append(c)
        views_list.append(views)

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
            blends[i] = blends[pi]
            comps[i] = dict(comps[pi])
            views_list[i] = views_list[pi]

    # Rank on unique city slots only, so London's four airports hold ONE
    # slot in the distribution instead of four; siblings inherit the
    # primary's percentile.
    slots = sorted({rep[i] for i in range(len(ids))})
    slot_pctls = _percentiles([blends[i] for i in slots])
    slot_fame_pctls = _percentiles([views_list[i] for i in slots])
    slot_pos = {s: k for k, s in enumerate(slots)}
    pctls = [slot_pctls[slot_pos[rep[i]]] for i in range(len(ids))]
    fame_pctls = [slot_fame_pctls[slot_pos[rep[i]]] for i in range(len(ids))]

    counts = {3: 0, 2: 0, 1: 0, 0: 0, "hidden_gem": 0}
    for i, did in enumerate(ids):
        score = display_score(pctls[i])
        tier = tier_for(score)
        fame_pct = fame_pctls[i]
        hidden = (tier >= 2 and fame_pct <= HIDDEN_GEM_FAME_PCTL[2]) or \
                 (tier == 1 and fame_pct <= HIDDEN_GEM_FAME_PCTL[1])
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
