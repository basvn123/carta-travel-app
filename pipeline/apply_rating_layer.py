"""Add the schema-v17 traveller rating to an existing app_data.json in place.

Tier: Scheduled (run_pipeline task poi_significance)

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
    python apply_rating_layer.py --recalibrate --version v5.x
                                          # T754: measure the "rating" part of
                                          # the frozen reference on the master
                                          # (class scales, depth p99, fallback
                                          # fit, curves, fame breakpoints),
                                          # then score. Refuses unless
                                          # continent-app/config/rating.json
                                          # already names the new version.

A normal run refits nothing: every calibration is read from the frozen
reference (reports/rating_reference_v5.json), so adding places moves no
existing score.
"""

import argparse
import json
import sys
from pathlib import Path

import place_registries
import rating_config
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
    "FCO": 9.0,    # Rome (T755: the city's row; CIA is its gateway)
    "CDG": 8.8,    # Paris (T755: the city's row; ORY, BVA are gateways). T759: 8.8 under
                   # formula v5 (owner decision 2026-10-27): depth counts POI categories,
                   # and Paris's list holds three until T774 adds food, market and nightlife
    "BCN": 8.8,    # Barcelona (T759: 8.8 under formula v5, as Paris)
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
# so membership is an independent second opinion on the place. Read through
# place_registries.kind_of, so a geopark no longer passes as a national park.
CORROBORATING_DESIGNATIONS = set(rating_config.cfg("recognition.corroborating"))


def validate(dests) -> list:
    """Hard failures as strings; empty list = healthy."""
    problems = []
    # The per-class appeal scale is the one part of the model that can go
    # wrong quietly: a bad ceiling shifts a whole class and nothing crashes.
    # appeal_scale.EXPECTED names real places and the score each must still
    # reach, so a mis-set ceiling fails the run instead of shipping.
    import appeal_scale
    appeal_file = rating_layer.load_curated_appeal()
    scales = appeal_scale.frozen_scales()
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
            if d.get("gateway_of") in dests:
                continue            # T755: a gateway is rated as its city
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
        if any(place_registries.kind_of(x) in CORROBORATING_DESIGNATIONS
               for x in (d.get("designations") or [])):
            continue
        # T759 (formula v5): fame no longer enters the score, so a fame-data
        # error cannot lift one. A hand score or a rubric score (a judgement
        # of the place from its fact card, docs/RATING_RUBRIC.md) stands
        # behind every v5 score but an estimate; only estimates stay checked.
        if r.get("confidence") in ("curated", "rubric"):
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
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="*", help="app_data files, first = source")
    ap.add_argument("--recalibrate", action="store_true",
                    help="measure the frozen rating reference first")
    ap.add_argument("--version",
                    help="with --recalibrate: the new version, already in "
                         "continent-app/config/rating.json")
    args = ap.parse_args()
    targets = [Path(a) for a in args.targets] or DEFAULT_TARGETS
    print(f"Applying rating layer ({rating_config.version()}):")

    master_path = targets[0]
    data = json.loads(master_path.read_text(encoding="utf-8"))
    dests = data.get("destinations", {})
    if args.recalibrate:
        if not args.version:
            sys.exit("REFUSED: --recalibrate needs --version")
        # The significance part must already be at this version: sig feeds
        # highlights, which every rating curve below is measured on.
        rating_config.reference("significance")
        payload = rating_layer.build_reference(dests)
        path = rating_config.write_part("rating", payload, args.version)
        print(f"  rating reference {args.version}: "
              f"{payload['n_curated']} curated, {payload['n_fitted']} fitted, "
              f"depth classes {len(payload['depth_knots'])}, fallback "
              f"{payload['fallback']['coefficients']} -> {path}")
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
          f"unrated {counts[0]} | hidden gems {counts['hidden_gem']} | "
          f"gateways {counts['gateway']}")

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
            if not src:
                continue
            if "rating" in src:
                d["rating"] = src["rating"]
                d.pop("gateway_of", None)
                n += 1
            elif src.get("gateway_of"):
                d["gateway_of"] = src["gateway_of"]
                d.pop("rating", None)
        served["meta"]["rating_model"] = rating_layer.RATING_MODEL
        served["meta"]["schema_version"] = max(
            served["meta"].get("schema_version", 0), 17)
        atomic_write_json(path, served, indent=None, separators=(",", ":"))
        print(f"  {path.name}: mirrored rating onto {n} dests")


if __name__ == "__main__":
    main()
