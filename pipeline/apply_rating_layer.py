"""Add the schema-v17 traveller rating to an existing app_data.json in place.

Adds:
  - meta.rating_model   (weights, tier cutoffs/labels, display curve, sources)
  - dest.rating         (score 0-10 / tier 0-3 / label / hidden_gem / fame /
                         components) - see rating_layer.py
  - bumps meta.schema_version to 17 (rating_v4: confidence + calibration)

Needs cache/dest_pageviews.json (run `python harvest_pageviews.py dests`
first); destinations missing from the cache just score fame 0.

The master dataset (app_data/app_data.json) holds activities.items_full,
which the things-to-do component reads. The served copy has items_full
stripped, so ratings are computed on the master and mirrored by id onto any
extra target. Idempotent: re-running refreshes the values.

Pipeline order (per project convention):
    apply_car_layer -> apply_airport_anchors -> apply_airport_categories
    -> apply_beauty_layer -> apply_rating_layer -> sync-data (build)

Usage:
    python apply_rating_layer.py          # patches master + served copy
    python apply_rating_layer.py a.json   # explicit targets (first = source)
"""

import json
import sys
from pathlib import Path

import rating_layer
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",                  # master (has items_full)
    ROOT / "continent-app" / "public" / "app_data.json",  # served copy (mirror)
]


# ---------------------------------------------------------------------------
# Post-apply sanity gate. Ratings regressions are silent (the app just shows
# wrong stars), so the pipeline fails loudly instead: a famous-set floor, an
# airport-town ceiling, and no "outstanding" score nobody has ever heard of
# unless the curators explicitly said so.
# ---------------------------------------------------------------------------
FAMOUS_FLOOR = {   # dest id -> minimum defensible score
    "CIA": 9.0,    # Rome
    "BVA": 9.0,    # Paris
    "BCN": 9.0,    # Barcelona
    "AMS": 8.5,    # Amsterdam
    "gem:bruges": 8.5,
    "PRG": 8.5,    # Prague
}
# NB: only towns that hold their OWN slot; multi-airport satellites (NYO)
# inherit their city's unified score and don't belong here.
AIRPORT_TOWN_CEILING = {"CRL": 5.0, "HHN": 5.0, "TZL": 5.0}
OBSCURE_STAR_MIN_FAME = 30   # views/day under which a 8.5+ needs corroboration
# ...and what counts as corroboration besides a curator's gem flag. These are
# the registers whose members were picked by a jury against published criteria,
# so membership is an independent second opinion on the place.
CORROBORATING_DESIGNATIONS = {
    "unesco_whc", "beautiful_village", "heritage_town", "spa_town",
    "national_park",
}


def validate(dests) -> list:
    """Hard failures as strings; empty list = healthy."""
    problems = []
    # The per-class appeal scale is the one part of the model that can go
    # wrong quietly: a bad ceiling shifts a whole class and nothing crashes.
    # appeal_scale.EXPECTED names real places and the score each must still
    # reach, so a mis-set ceiling fails the run instead of shipping.
    import appeal_scale
    appeal_file = rating_layer.load_curated_appeal()
    scales = appeal_scale.scales_for(dests, appeal_file)
    for did, cls, floor in appeal_scale.EXPECTED:
        d = dests.get(did)
        if not d:
            continue
        got_cls = appeal_scale.class_of(d)
        if got_cls != cls:
            problems.append(
                f"{did} is classed {got_cls}, appeal_scale expects {cls} - the "
                f"place layer moved it and the checkpoint is now meaningless")
            continue
        raw = (appeal_file.get(did) or {}).get("appeal")
        if raw is None:
            continue
        scaled = appeal_scale.rescale(raw, cls, scales)
        if scaled < floor:
            problems.append(
                f"{did} ({d.get('city')}) scaled appeal {scaled} < expected "
                f"{floor} for a {cls}: check CLASS_CEILING/GAMMA")
    for did, floor in FAMOUS_FLOOR.items():
        r = (dests.get(did) or {}).get("rating")
        if r and r["score"] < floor:
            problems.append(f"{did} scored {r['score']} < famous floor {floor}")
    for did, ceil in AIRPORT_TOWN_CEILING.items():
        r = (dests.get(did) or {}).get("rating")
        if r and r["score"] >= ceil:
            problems.append(f"{did} scored {r['score']} >= airport-town ceiling {ceil}")
    appeal = rating_layer.load_curated_appeal()
    # The obscure-star check reads a fame of 0 as evidence that the pageview
    # lookup hit the wrong article. That inference only holds for a place we
    # actually MEASURED. Since the 2026-08 expansion, 61 destinations have no
    # entry in the pageview cache at all - ambiguous English names like
    # Keswick, Richmond and Rochester that resolve to no single article - and
    # unmeasured is not the same claim as unknown-to-the-world. Scoring them as
    # suspicious blocked the entire rating run over a gap in a different cache.
    measured = set(rating_layer.load_dest_pageviews())
    unmeasured_stars = []
    for did, d in dests.items():
        r = d.get("rating")
        if not r:
            problems.append(f"{did} has no rating block")
            continue
        if r["score"] < 8.5 or (appeal.get(did) or {}).get("gem"):
            continue
        # A strong register listing corroborates a high score exactly as a
        # curator's gem flag does, and unlike that flag it is reachable by a
        # destination nobody has hand-scored yet. Without this the check called
        # San Felice Circeo (I Borghi piu belli, a national park AND a UNESCO
        # biosphere reserve, 25 views a day) and Colares (a UNESCO World
        # Heritage landscape, 24 views a day) data errors, when they are
        # precisely the high-quality low-fame places the catalogue went looking
        # for. A rule that rejects its own best findings is the wrong rule.
        if any(x.get("kind") in CORROBORATING_DESIGNATIONS
               for x in (d.get("designations") or [])):
            continue
        if did not in measured:
            unmeasured_stars.append(f"{d.get('city')} ({r['score']})")
        elif r.get("fame", 0) < OBSCURE_STAR_MIN_FAME:
            problems.append(
                f"{did} ({d.get('city')}) scores {r['score']} at fame "
                f"{r.get('fame')}/day with no curator gem flag - wrong-article "
                f"fame or a curation slip; review it")
    if unmeasured_stars:
        print(f"  note: {len(unmeasured_stars)} high scorers have no pageview "
              f"measurement yet, so the obscure-star check cannot judge them: "
              f"{', '.join(unmeasured_stars[:6])}"
              + (" ..." if len(unmeasured_stars) > 6 else ""))
    return problems


def main() -> None:
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print("Applying rating layer (schema v17):")

    master_path = targets[0]
    data = json.loads(master_path.read_text(encoding="utf-8"))
    dests = data.get("destinations", {})
    counts = rating_layer.compute_ratings(dests)

    problems = validate(dests)
    if problems:
        print("  RATING VALIDATION FAILED - nothing written:")
        for p in problems[:20]:
            print(f"    - {p}")
        sys.exit(1)
    data["meta"]["rating_model"] = rating_layer.RATING_MODEL
    data["meta"]["schema_version"] = max(
        data["meta"].get("schema_version", 0), 17)
    # Atomic: write_text truncates the 100+ MB master before streaming it back,
    # so an interrupted or out-of-space write destroys the dataset every other
    # script reads. A full disk took out a harvest cache this way on
    # 2026-08-17; the master survived only because its writer was already
    # atomic. This one is now too.
    atomic_write_json(master_path, data)
    print(f"  {master_path.name}: {len(dests)} dests | "
          f"3-star {counts[3]} | 2-star {counts[2]} | 1-star {counts[1]} | "
          f"unrated {counts[0]} | hidden gems {counts['hidden_gem']}")

    # Mirror rating blocks onto the other targets by destination id.
    for path in targets[1:]:
        if not path.exists():
            print(f"  skip (missing): {path}")
            continue
        served = json.loads(path.read_text(encoding="utf-8"))
        sdests = served.get("destinations", {})
        n = 0
        for did, d in sdests.items():
            src = dests.get(did)
            if src and "rating" in src:
                d["rating"] = src["rating"]
                n += 1
        served["meta"]["rating_model"] = rating_layer.RATING_MODEL
        served["meta"]["schema_version"] = max(
            served["meta"].get("schema_version", 0), 17)
        atomic_write_json(path, served, indent=None, separators=(",", ":"))
        print(f"  {path.name}: mirrored rating onto {n} dests")


if __name__ == "__main__":
    main()
