"""Fact cards for rating v5 rubric scoring (T757).

Tier: Manual (run once per rubric scoring round)

One card per destination holds the facts a scorer judges from, and nothing
that is a judgement already: no hand score, no v4 score, no fame, no beauty
v1 composite (it carries UNESCO and fame). Every number on a card comes from
the same code the v5 formula uses, so the card and the score read one truth:

  - beauty v2 parts   beauty_layer.compute_beauty_v2 (urban, setting, water,
                      iconic view) and the rated items within its 5 km
  - depth (D)         rating_layer.depth_items / depth_map: the counted items
                      per category, the named POIs at rate 3 and 2, and the
                      percentile in the class on the frozen breakpoints
  - recognition (R)   the registers (designations) and rating_layer.acclaim01
  - nature            rated beaches, lakes and peaks within the depth reach
                      (25 km, about 30 minutes), names and scores

Writes:
  data/rating/fact_cards/shard_XX.jsonl     the places without a hand score,
                                            in 15 shards mixed by country and
                                            class, each with 5 hidden controls
  data/rating/fact_cards/anchors.jsonl      the cards of config/rating_anchors.json
  data/rating/hidden/scorer_hidden.jsonl    hand score, why and v4 score of
                                            every card, plus which ids are the
                                            controls: scorers never read it

The controls are hand-scored places that are NOT anchors (an anchor's score
is printed in the anchor file, so it could not test drift). Shard order is
shuffled with a fixed seed, so a control sits anywhere in its shard.

Usage:
    python rating_fact_cards.py                   # all shards + anchors
    python rating_fact_cards.py --ids KRK,gem:conques --out cards.jsonl
    python rating_fact_cards.py --handcheck 0.10  # T758: a blind sample of
                                                  # hand-scored places
"""

import argparse
import json
import random
import sys
from pathlib import Path

import appeal_scale
import beauty_layer
import place_registries
import rating_layer

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
CURATED = ROOT / "app_data" / "curated_appeal.json"
ANCHORS = ROOT / "continent-app" / "config" / "rating_anchors.json"
OUT_DIR = ROOT / "data" / "rating" / "fact_cards"
HIDDEN = ROOT / "data" / "rating" / "hidden" / "scorer_hidden.jsonl"

N_SHARDS = 15
CONTROLS_PER_SHARD = 5
SEED = 757
POI_NAMES_PER_CATEGORY = 6     # rate 3 first, then rate 2, by significance
POI_OWN_KM = 3.0               # beyond this a named POI carries its distance
NATURE_ITEMS = 8               # best rated items within the depth reach
LEAD_CHARS = 240               # Wikivoyage lead, cut at a sentence


def _r(x, n=2):
    return None if x is None else round(float(x), n)


def wikivoyage(dest):
    g = dest.get("guide") or {}
    if not g.get("url"):
        return {"guide": False}
    text = (g.get("text") or "").strip()
    lead = text[:LEAD_CHARS]
    cut = lead.rfind(". ")
    if len(text) > LEAD_CHARS and cut > 60:
        lead = lead[:cut + 1]
    return {"guide": True, "lead": lead}


def registers(dest):
    return [{"kind": place_registries.kind_of(d), "name": d.get("name")}
            for d in dest.get("designations") or []]


def named_pois(did, dest):
    """{category: {"must_see": [names], "recommended": [names]}} for the POIs
    the depth term counts (rate 3 and 2), strongest first."""
    items = (dest.get("activities") or {}).get("items_full") or []
    counted = {key for key, _cat, _w in rating_layer.depth_items(did, dest)
               if key.startswith("poi:")}
    out = {}
    rows = []
    for i, it in enumerate(items):
        if f"poi:{did}:{i}" not in counted:
            continue
        rows.append((it.get("rate") or 0, it.get("sig") or 0.0, i, it))
    rows.sort(key=lambda t: (-t[0], -t[1], t[2]))
    lat, lon = beauty_layer.centre(dest)
    for rate, _sig, _i, it in rows:
        cat = rating_layer.poi_category(it)
        slot = out.setdefault(cat, {"must_see": [], "recommended": []})
        key = "must_see" if rate >= 3 else "recommended"
        if len(slot["must_see"]) + len(slot["recommended"]) < POI_NAMES_PER_CATEGORY:
            slot[key].append(_poi_label(it, lat, lon))
    return out


def _poi_label(it, lat, lon):
    """The POI's name, with its distance from the centre when it lies beyond
    POI_OWN_KM: the POI lists reach into neighbouring towns, and a scorer
    must see that Bled Castle is not in Begunje."""
    name = it.get("name")
    if lat is None or not isinstance(it.get("lat"), (int, float)):
        return name
    km = beauty_layer._haversine_km(lat, lon, it["lat"], it["lon"])
    return f"{name} ({km:.0f} km)" if km > POI_OWN_KM else name


def nature_near(dest):
    """Rated beaches, lakes and peaks within the depth reach, best first."""
    lat, lon = beauty_layer.centre(dest)
    if lat is None or lon is None:
        return []
    idx = beauty_layer.nature_index()
    rows = []
    for kind in beauty_layer.NATURE_KINDS:
        for km, row in idx[kind].near(lat, lon, rating_layer.DEPTH_REACH_KM):
            rows.append({"kind": kind[:-1] if kind != "beaches" else "beach",
                         "name": row["name"], "score": _r(row["score"], 1),
                         "km": _r(km, 1)})
    rows.sort(key=lambda r: (-(r["score"] or 0), r["km"]))
    return rows[:NATURE_ITEMS]


def crowds(dest):
    c = dest.get("crowding") or {}
    if not c:
        return None
    mo = c.get("monthly") or {}
    return {"annual": c.get("label"), "nights_per_km2": c.get("nights_per_km2"),
            "by_month": mo.get("tier")}


def card(did, dest, depth_pct, depth_raw):
    place = dest.get("place") or {}
    geo = dest.get("geonames") or {}
    b2 = beauty_layer.compute_beauty_v2(dest)
    comps = b2["components"]
    by_cat = {}
    for _key, cat, _w in rating_layer.depth_items(did, dest):
        by_cat[cat] = by_cat.get(cat, 0) + 1
    nat = dest.get("nature") or {}
    nearest = nat.get("nearest") or {}
    return {
        "id": did,
        "name": dest.get("city"),
        "country": dest.get("country"),
        "region": (dest.get("crowding") or {}).get("region"),
        "class": place.get("class"),
        "population": geo.get("population"),
        "elevation_m": geo.get("elevation_m"),
        "blurb": dest.get("blurb"),
        "tags": dest.get("categories") or [],
        "registers": registers(dest),
        "recognition": _r(rating_layer.acclaim01(dest)),
        "beauty_v2": {"score": b2["score"], "urban": comps["urban"],
                      "setting": comps["nature"], "water": comps["beach"],
                      "iconic_view": comps["iconic"]},
        "depth": {"class_percentile": _r(depth_pct, 2),
                  "raw": _r(depth_raw, 2),
                  "items_by_category": by_cat,
                  "visit_hours": place.get("visit_h"),
                  "pois": named_pois(did, dest)},
        "nature_30min": nature_near(dest),
        "protected_areas": ({"nearest": nearest.get("name"),
                             "kind": nearest.get("kind"),
                             "km": nearest.get("dist_km"),
                             "count_30km": nat.get("n_areas")}
                            if nearest else None),
        "wikivoyage": wikivoyage(dest),
        "crowds": crowds(dest),
    }


def depth_percentiles(pool):
    """Depth as a percentile in the class. Read from the frozen reference
    when it holds depth breakpoints; until depth goes live (T756-a) it holds
    none, so the breakpoints are measured on this catalogue in memory, the
    way tests/test_rating_inputs.py does, and never written back."""
    import rating_config
    knots = rating_config.reference("rating").get("depth_knots")
    if knots is None:
        by_class = {}
        for did, d in pool.items():
            by_class.setdefault(appeal_scale.class_of(d), []).append(
                rating_layer.depth_raw(did, d))
        knots = rating_layer.depth_knots(by_class, rating_config.cfg("depth.knots"))
    return rating_layer.depth_map(pool, knots)


def rated(dests):
    """Every place that carries a rating: gateways have none (T755)."""
    return {did: d for did, d in dests.items()
            if not d.get("gateway_of") and (d.get("rating") or {}).get("score") is not None}


def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def hidden_row(did, dest, curated, role):
    h = curated.get(did) or {}
    r = dest.get("rating") or {}
    return {"id": did, "role": role, "hand_appeal": h.get("appeal"),
            "hand_why": h.get("why"), "v4_score": r.get("score"),
            "v4_confidence": r.get("confidence")}


def mixed_shards(ids, dests, n):
    """Deal places sorted by class then country round-robin, so every shard
    holds every class and a spread of countries."""
    order = sorted(ids, key=lambda i: ((dests[i].get("place") or {}).get("class") or "",
                                       dests[i].get("country") or "", i))
    shards = [[] for _ in range(n)]
    for k, did in enumerate(order):
        shards[k % n].append(did)
    return shards


def pick_controls(curated, dests, anchor_ids, n, rng):
    """n hand-scored, non-anchor places spread over class and hand score."""
    pool = sorted(did for did in curated if did in dests and did not in anchor_ids)
    pool.sort(key=lambda i: ((dests[i].get("place") or {}).get("class") or "",
                             curated[i]["appeal"]))
    step = len(pool) / n
    picks = [pool[int(k * step + rng.random() * step)] for k in range(n)]
    rng.shuffle(picks)
    return picks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", help="comma-separated ids: write only their cards")
    ap.add_argument("--out", help="output path for --ids or --handcheck")
    ap.add_argument("--handcheck", type=float,
                    help="share of hand-scored places for a blind check (T758)")
    args = ap.parse_args()

    dests = json.loads(MASTER.read_text(encoding="utf-8"))["destinations"]
    curated = json.loads(CURATED.read_text(encoding="utf-8"))
    pool = rated(dests)
    depth_pct, depth_raw = depth_percentiles(pool)

    def cards(ids):
        return [card(i, pool[i], depth_pct.get(i), depth_raw.get(i)) for i in ids]

    if args.ids:
        ids = [i for i in args.ids.split(",") if i in pool]
        write_jsonl(Path(args.out), cards(ids))
        print(f"{len(ids)} cards -> {args.out}")
        return 0

    anchors = json.loads(ANCHORS.read_text(encoding="utf-8")) if ANCHORS.exists() else {"anchors": []}
    anchor_ids = {a["id"] for a in anchors["anchors"]}
    rng = random.Random(SEED)

    if args.handcheck:
        # A share of all hand scores, drawn from those that are neither an
        # anchor (its score is printed) nor a shard control (already scored).
        controls = set()
        if HIDDEN.exists():
            controls = {json.loads(line)["id"] for line in HIDDEN.read_text(encoding="utf-8").splitlines()
                        if line and json.loads(line)["role"] == "control"}
        hand = sorted(i for i in curated if i in pool and i not in anchor_ids | controls)
        ids = sorted(random.Random(SEED + 1).sample(hand, round(args.handcheck * len(curated))))
        out = Path(args.out or OUT_DIR / "handcheck.jsonl")
        write_jsonl(out, cards(ids))
        print(f"{len(ids)} blind hand-check cards -> {out}")
        return 0

    unscored = sorted(i for i in pool if i not in curated)
    shards = mixed_shards(unscored, pool, N_SHARDS)
    controls = pick_controls(curated, pool, anchor_ids, N_SHARDS * CONTROLS_PER_SHARD, rng)
    hidden = []
    for k, ids in enumerate(shards):
        mine = controls[k * CONTROLS_PER_SHARD:(k + 1) * CONTROLS_PER_SHARD]
        order = ids + mine
        rng.shuffle(order)
        write_jsonl(OUT_DIR / f"shard_{k + 1:02d}.jsonl", cards(order))
        hidden += [dict(hidden_row(i, pool[i], curated, "control"), shard=k + 1) for i in mine]
        hidden += [dict(hidden_row(i, pool[i], curated, "score"), shard=k + 1) for i in ids]
        print(f"shard {k + 1:02d}: {len(ids)} places + {len(mine)} controls")
    write_jsonl(OUT_DIR / "anchors.jsonl", cards(sorted(anchor_ids & set(pool))))
    write_jsonl(HIDDEN, hidden)
    print(f"{len(unscored)} places without a hand score in {N_SHARDS} shards; "
          f"{len(anchor_ids)} anchor cards; hidden file {HIDDEN.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
