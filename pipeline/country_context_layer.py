"""Country context (A6, 2026-09): where a place stands in ITS country.

The absolute 0-10 score stays absolute - that is the product's spine, and it
must never become "good for Latvia". But a browsing user is going SOMEWHERE,
and inside that somewhere the absolute scale goes quiet: fourteen countries
had three or fewer labelled destinations of any kind, so a user filtering to
Finland saw an unbroken wall of unlabelled cards and read it as "not worth
visiting" when what they were looking at was a curation backlog.

Adds to every destination (and mirrors onto the served copy):

  country_rank        1-based position within its country by rating.score
  country_n           how many ranked slots the country holds
  country_percentile  0-100, higher is better
  country_badge       "top_of_country"  - the country's highest-scoring slot
                      "best_of_country" - the rest of the top
                                          max(3, round(0.08 x slots))
                      null              - everyone else
  class_percentile    0-100 within its place class across the whole
                      catalogue, so "one of the best villages in Europe"
                      is expressible too

Multi-airport cities hold ONE slot (same convention as fame percentiles and
the beauty layer): London is a city, not four competitors, and its airports
share the slot's rank and badge. Ties share a rank, so equal scores never
get an arbitrary order.

No absolute score changes here, ever - the layer only reads rating.score.
apply prints a before/after digest of every score so a violation is loud.

Usage:
    python country_context_layer.py          # patches master + served copy
"""

import json
import sys
from pathlib import Path

import beauty_layer
from pipeline_io import atomic_write_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

TOP_SHARE = 0.08
MIN_BADGED = 3

FIELDS = ("country_rank", "country_n", "country_percentile",
          "country_badge", "class_percentile")

COUNTRY_CONTEXT_MODEL = {
    "version": "country_context_v1",
    "rank": "1-based within country by rating.score; multi-airport cities "
            "hold one slot; ties share a rank",
    "badge_rule": f"rank 1 = top_of_country; rank <= max({MIN_BADGED}, "
                  f"round({TOP_SHARE} x slots)) = best_of_country; else null",
    "class_percentile": "0-100 within the place class, whole catalogue",
    "never_moves_scores": "the absolute scale is the spine; this layer only "
                          "answers where a place stands within the country "
                          "the user is actually going to",
}


def slot_groups(dests):
    """[(slot_key, [dest ids])] - one slot per city, airports unified."""
    groups = {}
    for did, d in dests.items():
        if d.get("tier") == "airport":
            key = ("air", d.get("iso2"), beauty_layer._base_city(d.get("city")))
        else:
            key = ("one", did)
        groups.setdefault(key, []).append(did)
    return list(groups.values())


def shared_ranks(scores):
    """score list (desc order irrelevant) -> {index: 1-based shared rank}."""
    order = sorted(range(len(scores)), key=lambda i: -scores[i])
    ranks = {}
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and scores[order[j + 1]] == scores[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = i + 1          # competition ranking: ties share
        i = j + 1
    return ranks


def compute(dests):
    slots = slot_groups(dests)
    slot_score = [max(dests[i]["rating"]["score"] for i in ids)
                  for ids in slots]
    slot_country = [dests[ids[0]].get("country") for ids in slots]
    slot_class = [(dests[ids[0]].get("place") or {}).get("class")
                  for ids in slots]

    # per-country shared ranks over slots
    by_country = {}
    for si, c in enumerate(slot_country):
        by_country.setdefault(c, []).append(si)
    out = {}
    badged_per_country = {}
    for country, sis in by_country.items():
        ranks = shared_ranks([slot_score[si] for si in sis])
        n = len(sis)
        top_k = max(MIN_BADGED, round(TOP_SHARE * n))
        badged = 0
        for local_i, si in enumerate(sis):
            rank = ranks[local_i]
            if rank == 1:
                badge = "top_of_country"
            elif rank <= top_k:
                badge = "best_of_country"
            else:
                badge = None
            if badge:
                badged += 1
            pctl = round(100.0 * (n - rank) / max(1, n - 1)) if n > 1 else 100
            for did in slots[si]:
                out[did] = {"country_rank": rank, "country_n": n,
                            "country_percentile": pctl,
                            "country_badge": badge}
        badged_per_country[country] = badged

    # class percentile across the whole catalogue, slot-unified
    by_class = {}
    for si, cls in enumerate(slot_class):
        by_class.setdefault(cls, []).append(si)
    for cls, sis in by_class.items():
        ranks = shared_ranks([slot_score[si] for si in sis])
        n = len(sis)
        for local_i, si in enumerate(sis):
            pctl = (round(100.0 * (n - ranks[local_i]) / max(1, n - 1))
                    if n > 1 else 100)
            for did in slots[si]:
                out[did]["class_percentile"] = pctl
    return out, badged_per_country


def main():
    master = TARGETS[0]
    data = json.loads(master.read_text(encoding="utf-8"))
    dests = data["destinations"]

    before = {did: d["rating"]["score"] for did, d in dests.items()}
    ctx, badged = compute(dests)
    for did, d in dests.items():
        d.update(ctx[did])
    after = {did: d["rating"]["score"] for did, d in dests.items()}
    moved = [did for did in before if before[did] != after[did]]
    if moved:
        raise SystemExit(f"ABSOLUTE SCORES MOVED ({len(moved)}): {moved[:5]} "
                         "- this layer must never touch rating.score")

    # A country cannot badge more destinations than it holds: the "at least
    # three" floor reads min(3, held) for a Liechtenstein-sized catalogue,
    # where the single destination IS the top of the country.
    held = {}
    for d in dests.values():
        held[d.get("country")] = held.get(d.get("country"), 0) + 1
    thin = {c: n for c, n in badged.items() if n < min(MIN_BADGED, held[c])}
    if thin:
        raise SystemExit(f"countries badged below min({MIN_BADGED}, held): {thin}")

    data["meta"]["country_context_model"] = COUNTRY_CONTEXT_MODEL
    atomic_write_json(master, data)
    print(f"{master.name}: context on {len(ctx)} dests, "
          f"{sum(badged.values())} badges across {len(badged)} countries, "
          f"0 absolute scores moved")

    served_path = TARGETS[1]
    served = json.loads(served_path.read_text(encoding="utf-8"))
    n = 0
    for did, d in served.get("destinations", {}).items():
        if did in ctx:
            d.update(ctx[did])
            n += 1
    served["meta"]["country_context_model"] = COUNTRY_CONTEXT_MODEL
    atomic_write_json(served_path, served, indent=None, separators=(",", ":"))
    print(f"{served_path.name}: mirrored context onto {n} dests")


if __name__ == "__main__":
    main()
