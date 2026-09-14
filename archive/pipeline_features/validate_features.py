"""validate_features.py - the gate between the ranked features and the app.

Stage 5 of the natural-features pipeline (see features_common.py for the stage
map). Everything upstream is inference: a POI's kind field is a guess, a
name-recovery pass is a guess about a guess, and a bathing site 300 m away is
an assumption that the two records mean the same strand. This stage is where
those guesses have to survive being checked, because the next stage publishes
them under Carta's name.

HARD checks block the ship and exit 1. They are the claims that would be
wrong, not merely thin:

  coords_outside_country  a "Spanish" beach in Sweden: the box comes from the
                          country's own priced destinations plus a margin
                          wider than the 60 km the wire allows a feature to
                          sit from one, so a legitimate outlier can not fail
  coords_in_other_country the box cannot separate neighbours that interlock
                          (Corfu sits inside Albania's box, which is how four
                          Greek beaches shipped as Albanian), so a point that
                          falls INSIDE another country's shape fails outright.
                          A point in no shape at all is not a failure: a beach
                          centroid often lands a little offshore
  duplicate_id            two features sharing an id silently overwrite each
                          other in every keyed consumer
  beach_no_evidence       no water class, no photo, no article: nothing on
                          this row justifies putting it in front of a person
  mountain_blacklisted    a bus station or a castle filed as a summit; the
                          vocabulary and the settlement test are imported from
                          build_features so there is one definition of it
  image_unlicensed        a photo we can not credit, or one under an NC or ND
                          licence. Shipping it is a licensing incident, not a
                          data-quality issue
  tier1_no_witness        the corroboration rule from the significance engine
  score_out_of_range      a score outside 0..1 means the normalisation broke
  near_dest_missing       no priced destination within 60 km, in a country
                          that has priced destinations

SOFT checks report and never block. They describe the gaps the layer HAS, per
country and per kind, so thin coverage is visible rather than quietly shipped:
countries with fewer than three tier-1 picks, the share with no photo, summits
with no elevation, features with no pageviews.

Every failure lists the offending ids (capped per country so the report stays
readable, with the true count beside it), because a check that only says "42
failures" is a check nobody can act on.

Reads   data/derived/features.json, continent-app/public/app_data.json
Writes  data/reports/features_validation.json
Exit    0 when every HARD check passes, 1 otherwise.

The report carries the ranked artifact's timestamp AND its sha1, which is what
export_features.py refuses to ship without: a verdict about a file that has
since been rewritten is not a verdict.

Usage:
    python pipeline/features/validate_features.py
    python pipeline/features/validate_features.py --country ES --verbose
"""
import argparse
import hashlib
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from math import cos, radians

from features_common import (APP_DATA, FEATURES, ROOT, VALIDATION_REPORT,
                             catalogue_countries, country_at, has_country_shapes,
                             load_json, log, save_json)
from build_features import (BUILT_WORDS, BUSINESS_WORDS, NEAR_DEST_KM,
                            TRANSPORT_WORDS, WINE_WORDS, gate_reason, tokens)
from rank_features import WATER_SCORE, licence_ok

# A feature may legitimately sit 60 km from the nearest priced city (the wire's
# own rule), and that city may be across a border, so the country box gets a
# margin wider than the rule. Anything outside it is a coordinate error, not a
# remote beach.
BBOX_MARGIN_KM = 120.0
KM_PER_DEG = 111.0

# Below this, a country card has no real "top picks" row to show.
MIN_TIER1 = 3

# The name test the mountain blacklist runs, minus the settlement clause, which
# needs the destination record and runs separately.
MOUNTAIN_BLACKLIST = TRANSPORT_WORDS | BUSINESS_WORDS | BUILT_WORDS | WINE_WORDS

IDS_PER_COUNTRY = 25             # how many offenders the report spells out


# --------------------------------------------------------------------------- #
# reference data
# --------------------------------------------------------------------------- #
def country_boxes(dests):
    """{iso2: (lat_min, lat_max, lon_min, lon_max)} from the priced catalogue.

    City centres, matching the join build_features made, so the box describes
    the same points the near-destination rule measures against."""
    box = {}
    for d in dests.values():
        iso2 = d.get("iso2")
        lat = d.get("city_lat") or d.get("lat")
        lon = d.get("city_lon") or d.get("lon")
        if not iso2 or not isinstance(lat, (int, float)) \
                or not isinstance(lon, (int, float)):
            continue
        if iso2 not in box:
            box[iso2] = [lat, lat, lon, lon]
        else:
            b = box[iso2]
            b[0], b[1] = min(b[0], lat), max(b[1], lat)
            b[2], b[3] = min(b[2], lon), max(b[3], lon)
    return {k: tuple(v) for k, v in box.items()}


def outside_box(f, box):
    """True when the coordinate can not be this country's, margin included.
    The longitude margin widens with latitude because a degree of longitude is
    only 55 km at Tromso, and a fixed degree margin would be twice as forgiving
    in the north as in the south."""
    dlat = BBOX_MARGIN_KM / KM_PER_DEG
    dlon = BBOX_MARGIN_KM / (KM_PER_DEG * max(0.2, cos(radians(f["lat"]))))
    lat_min, lat_max, lon_min, lon_max = box
    return not (lat_min - dlat <= f["lat"] <= lat_max + dlat
                and lon_min - dlon <= f["lon"] <= lon_max + dlon)


# --------------------------------------------------------------------------- #
# the checks
# --------------------------------------------------------------------------- #
class Report:
    """Findings, kept per check per country per kind, with the ids."""

    def __init__(self):
        self.hard = defaultdict(lambda: defaultdict(list))
        self.soft = defaultdict(lambda: defaultdict(list))

    def fail(self, check, f, detail=None):
        self.hard[check][(f["iso2"], f["kind"])].append(
            {"id": f["id"], "name": f["name"], "detail": detail})

    def warn(self, check, iso2, kind, item):
        self.soft[check][(iso2, kind)].append(item)

    def as_json(self, section):
        out = {}
        for check, per in sorted(section.items()):
            countries = {}
            total = 0
            for (iso2, kind), items in sorted(per.items()):
                total += len(items)
                countries.setdefault(iso2, {})[kind] = {
                    "count": len(items),
                    "items": items[:IDS_PER_COUNTRY],
                    "truncated": max(0, len(items) - IDS_PER_COUNTRY),
                }
            out[check] = {"count": total, "countries": countries}
        return out


def check_hard(features, dests, boxes, countries, rep):
    seen = {}
    shapes_ready = has_country_shapes()
    if not shapes_ready:
        log("  WARNING: country_shapes.json missing, the border check is OFF")
    for f in features:
        iso2, kind = f["iso2"], f["kind"]

        # identity
        if f["id"] in seen:
            rep.fail("duplicate_id", f, f"also used by {seen[f['id']]}")
        else:
            seen[f["id"]] = f["name"]

        # geography. The box is the coarse net; the country SHAPE is the real
        # test, because a box cannot separate neighbours that interlock. Corfu
        # sits inside Albania's box, which is how four Greek beaches shipped as
        # Albanian until build_features.py started reassigning on the polygon.
        box = boxes.get(iso2)
        if box and outside_box(f, box):
            rep.fail("coords_outside_country", f,
                     f"{f['lat']:.3f},{f['lon']:.3f} outside "
                     f"{tuple(round(v, 2) for v in box)}")
        elif shapes_ready:
            # A coastal feature's centroid can fall just offshore, so a miss is
            # only a failure when the point lands INSIDE a different country.
            actual = country_at(f["lat"], f["lon"])
            if actual and actual != iso2:
                rep.fail("coords_in_other_country", f,
                         f"{f['lat']:.3f},{f['lon']:.3f} is inside {actual}, "
                         f"not {iso2}")
        near = f.get("near") or {}
        if countries.get(iso2) and boxes.get(iso2):
            if not near.get("dest_id") or near.get("km") is None:
                rep.fail("near_dest_missing", f, "no priced destination joined")
            elif near["km"] > NEAR_DEST_KM:
                rep.fail("near_dest_missing", f,
                         f"nearest priced destination is {near['km']} km away")

        # substance
        if kind == "beach":
            has_water = (f.get("water") or {}).get("class") in WATER_SCORE
            if not (has_water or f.get("image") or f.get("wikipedia")
                    or f.get("wikidata")):
                rep.fail("beach_no_evidence", f,
                         "no water class, no photo, no article")
        else:
            toks = set(tokens(f["name"]))
            hit = toks & MOUNTAIN_BLACKLIST
            if hit:
                rep.fail("mountain_blacklisted", f, f"name carries {sorted(hit)}")
            else:
                # The settlement clause needs the catalogue row the feature
                # hangs off: "Santorini" is only a settlement name because the
                # destination beside it says island.
                dest = dests.get((f.get("near") or {}).get("dest_id")) or {}
                reason = gate_reason("mountain", f["name"], iso2, dest)
                if reason:
                    rep.fail("mountain_blacklisted", f, reason)

        # licensing
        img = f.get("image")
        if img and not licence_ok(img.get("licence")):
            rep.fail("image_unlicensed", f,
                     f"licence {img.get('licence')!r} for {img.get('file')!r}")

        # scoring
        score = f.get("score")
        if not isinstance(score, (int, float)) or not 0.0 <= score <= 1.0:
            rep.fail("score_out_of_range", f, f"score={score!r}")
        if f.get("tier") == 1 and not (f.get("provenance") or {}).get("witnesses"):
            rep.fail("tier1_no_witness", f, "tier 1 with no independent record")


def check_soft(features, countries, rep):
    """Coverage, per country and kind. These are gaps, not errors: they say
    where the layer is thin, which is the honest thing to publish alongside
    it."""
    per = defaultdict(list)
    for f in features:
        per[(f["iso2"], f["kind"])].append(f)

    for (iso2, kind), rows in sorted(per.items()):
        n = len(rows)
        t1 = [f for f in rows if f["tier"] == 1]
        if len(t1) < MIN_TIER1:
            # Two very different gaps wear the same number: a country with 4
            # beaches can not fill a 20% quota, and a country with 200 whose
            # rows carry no witness has nothing corroborated to promote.
            rep.warn("thin_tier1", iso2, kind,
                     {"tier1": len(t1), "of": n,
                      "why": "no corroborated rows" if n >= MIN_TIER1 * 5
                             else "too few features for the 20% cap"})
        no_img = [f for f in rows if not f.get("image")]
        if no_img:
            rep.warn("no_image", iso2, kind,
                     {"count": len(no_img), "of": n,
                      "share": round(len(no_img) / n, 3),
                      "pending_licence": sum(1 for f in no_img
                                             if f.get("image_pending"))})
        no_views = sum(1 for f in rows if not f["signals"].get("pageviews"))
        if no_views:
            rep.warn("no_pageviews", iso2, kind,
                     {"count": no_views, "of": n,
                      "share": round(no_views / n, 3)})
        if kind == "mountain":
            no_ele = sum(1 for f in rows if f.get("elevation_m") is None)
            if no_ele:
                rep.warn("no_elevation", iso2, kind,
                         {"count": no_ele, "of": n,
                          "share": round(no_ele / n, 3)})


def coverage(features):
    """The per country, per kind table the report leads with."""
    out = defaultdict(lambda: defaultdict(dict))
    per = defaultdict(list)
    for f in features:
        per[(f["iso2"], f["kind"])].append(f)
    for (iso2, kind), rows in per.items():
        tiers = Counter(f["tier"] for f in rows)
        best = min(rows, key=lambda f: f["rank_in_country"])
        out[iso2][kind] = {
            "n": len(rows),
            "tier1": tiers[1], "tier2": tiers[2], "tier3": tiers[3],
            "with_image": sum(1 for f in rows if f.get("image")),
            "with_water": sum(1 for f in rows
                              if (f.get("water") or {}).get("class")),
            "with_article": sum(1 for f in rows if f.get("wikipedia")),
            "top": best["name"],
        }
    return {k: dict(v) for k, v in out.items()}


# --------------------------------------------------------------------------- #
def sha1_of(path):
    h = hashlib.sha1()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def print_summary(rep, cov, features, args):
    hard = rep.as_json(rep.hard)
    soft = rep.as_json(rep.soft)
    log("")
    log(f"HARD checks over {len(features)} ranked features")
    if not hard:
        log("  all clear")
    for check, block in sorted(hard.items(), key=lambda kv: -kv[1]["count"]):
        log(f"  FAIL {check}: {block['count']}")
        for iso2, kinds in list(block["countries"].items())[:8]:
            for kind, d in kinds.items():
                sample = ", ".join(i["name"][:28] for i in d["items"][:3])
                log(f"      {iso2} {kind}: {d['count']}  ({sample})")
    log("")
    log("SOFT checks (reported, never blocking)")
    for check, block in sorted(soft.items()):
        # A warning with no share (thin_tier1) sorts first: it is the one that
        # empties a country card rather than thinning it.
        worst = sorted(
            ((iso2, kind, d) for iso2, kinds in block["countries"].items()
             for kind, d in kinds.items()),
            key=lambda t: -t[2]["items"][0].get("share", 1.0))[:5]
        log(f"  {check}: {block['count']} country/kind pairs")
        for iso2, kind, d in worst:
            log(f"      {iso2} {kind}: {d['items'][0]}")

    log("")
    log("coverage (n / tier1 / with image / with water / top pick):")
    for iso2 in sorted(cov):
        if args.country and iso2 != args.country:
            continue
        for kind, c in sorted(cov[iso2].items()):
            log(f"  {iso2} {kind:<9} {c['n']:>5} {c['tier1']:>4} "
                f"{c['with_image']:>6} {c['with_water']:>6}   {c['top'][:38]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--country", help="ISO2, print this country's coverage only")
    ap.add_argument("--verbose", action="store_true",
                    help="print every offending id, not a sample")
    args = ap.parse_args()

    doc = load_json(FEATURES)
    if not doc:
        log(f"no {FEATURES}: run rank_features.py first")
        return 1
    features = doc["features"]
    app = load_json(APP_DATA) or {}
    dests = app.get("destinations") or {}
    countries = catalogue_countries(app)
    boxes = country_boxes(dests)

    rep = Report()
    check_hard(features, dests, boxes, countries, rep)
    check_soft(features, countries, rep)
    cov = coverage(features)

    hard = rep.as_json(rep.hard)
    soft = rep.as_json(rep.soft)
    verdict = "pass" if not hard else "fail"
    print_summary(rep, cov, features, args)
    if args.verbose:
        for check, block in sorted(hard.items()):
            for iso2, kinds in block["countries"].items():
                for kind, d in kinds.items():
                    for item in d["items"]:
                        log(f"  {check} {iso2} {kind} {item['id']}: "
                            f"{item['detail']}")

    save_json(VALIDATION_REPORT, {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "verdict": verdict,
        "source": {
            "path": str(FEATURES.relative_to(ROOT)).replace("\\", "/"),
            "generated_at": doc.get("generated_at"),
            "sha1": sha1_of(FEATURES),
            "n_features": len(features),
            "n_gated": len(doc.get("gated") or []),
        },
        "hard": hard,
        "soft": soft,
        "coverage": cov,
    })
    log("")
    log(f"verdict: {verdict.upper()}  ->  {VALIDATION_REPORT}")
    return 0 if verdict == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
