"""score_place_candidates.py - rank what the catalogue is missing, and why.

build_place_candidates.py enumerates every plausible European destination and
measures it. This turns those measurements into two answers:

  1. is this place worth going to?          -> ``worth`` 0-1
  2. does the catalogue already cover it?   -> ``covered`` / ``near_km``

and writes the ranked difference as a per-country review queue.

WORTH is deliberately scored on two axes that disagree, because the catalogue
needs both kinds of place and one measure cannot find both:

  mass       absolute sightseeing weight. Finds the notable cities nobody
             added - Augsburg, Besancon, Oviedo, Nottingham. Big places win.
  intensity  sightseeing weight divided by what a place that size normally
             has (expected = 0.0121 * pop^0.71, fitted on all 87k European
             settlements). Finds the villages: Hallstatt runs 28x its size,
             Vernazza 18x, Positano 14x, Rothenburg 11x. Size cancels out
             completely, which is the entire point - a 500-person village
             CAN top this list, and does.

Scoring both and blending them is why a run surfaces Sheffield and Pienza in
the same pass. A single blended number would have buried one of them.

The other terms:

  designation  membership of an authoritative register (most-beautiful-village
               associations, UNESCO, heritage towns, spa towns), from
               data/derived/place_registry.json. This is the only signal that
               can rescue a place too small to have POIs harvested at all.
  attention    Wikipedia sitelinks and pageviews - how many people already
               know. Deliberately the SMALLEST weight: fame is what the old
               rating over-weighted, and the point of the exercise is to find
               places the catalogue missed BECAUSE they are quiet.
  stayable     population, saturating. Not quality - just whether a traveller
               can sleep and eat there, which decides whether a place enters
               as a base or as a day trip.

COVERED asks whether an existing destination already speaks for this place.
A fixed radius gets this wrong in both directions, so the radius scales with
the size of the neighbour: 2.5 km around a village, ~15 km around a capital.
Mougins sits 5.7 km from Cannes and is NOT covered by it; Levallois-Perret
sits 6.1 km from Paris and is.

Output:
  data/reports/coverage_gaps.json      every uncovered candidate, ranked
  data/reports/coverage/<ISO2>.md      one readable review sheet per country
  data/reports/coverage/SUMMARY.md     the continent at a glance

Nothing here writes to the catalogue. Promotion is a separate, gated step
(promote_place_candidates.py) so a scoring change can never silently ship
destinations.

Usage:
    python pipeline/score_place_candidates.py
    python pipeline/score_place_candidates.py --top 60 --min-worth 0.35
"""
import argparse
import json
import math
import sys
import time
from collections import defaultdict
from pathlib import Path

from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
CANDIDATES = ROOT / "data" / "derived" / "place_candidates.json"
SIGNALS = ROOT / "cache" / "place_signals.json"
OUT_JSON = ROOT / "data" / "reports" / "coverage_gaps.json"
OUT_DIR = ROOT / "data" / "reports" / "coverage"

# Expected sightseeing mass for a settlement of this population: what a place
# that size normally has, so intensity can measure the surprise. Fitted log-log
# on the medians of 16 population bins, SEPARATELY for coastal and inland,
# because they are not the same population. Overture maps every beach segment
# as its own POI, so a 5,000-person seaside town carries 14.5 weight where a
# 5,000-person inland town carries 4.6. One shared curve made every coastal
# town in Europe read as a 3x outperformer and buried the hill villages under
# a wall of Adriatic resorts. Refit with --fit after any POI re-harvest.
EXP_FIT = {
    "coastal": (0.39918, 0.4322),
    "inland": (0.01670, 0.6535),
}
EXP_FIT_NOTE = ("median-binned log-log fit, split coastal/inland, over 87,170 "
                "European settlements")

# Ceiling for a place whose only notability evidence is its sitelink count.
# Pageviews are the ruler; sitelinks are a stand-in for the rows that have not
# been measured yet, and a stand-in should not be able to win outright.
SITELINK_ONLY_CAP = 0.55

MASS_SAT = 45.0        # own-weight at which mass01 reaches 0.63
INTENSITY_CAP = 12.0   # intensity that scores a perfect 1.0
STAY_SAT = 6000.0      # population at which stayable01 reaches 0.63

WEIGHTS = {
    "mass": 0.30,
    "intensity": 0.30,
    "designation": 0.20,
    "stayable": 0.10,
    "attention": 0.10,
}

# How much an authoritative designation is worth, 0-1. A most-beautiful-village
# association is a jury of locals saying "this one"; UNESCO is a global one.
DESIGNATION_WEIGHT = {
    "unesco_whc": 1.00,
    "beautiful_village": 0.95,
    "heritage_town": 0.75,
    "spa_town": 0.70,
    "unesco_tentative": 0.55,
    "national_park": 0.70,
    "cittaslow": 0.50,
    "scenic_route": 0.45,
    "blue_flag": 0.40,
    "capital_of_culture": 0.60,
    "eden": 0.55,
}
DESIGNATION_DEFAULT = 0.45

# Coverage radius around an existing destination, from ITS population.
COVER_A = 0.75
COVER_B = 0.42
COVER_MIN_KM = 2.5
COVER_MAX_KM = 15.0


def expected_own(pop, coastal=False):
    a, b = EXP_FIT["coastal" if coastal else "inland"]
    return a * max(300, pop or 0) ** b


def cover_radius_km(pop):
    if not pop or pop <= 0:
        return COVER_MIN_KM
    r = COVER_A * (pop / 1000.0) ** COVER_B
    return max(COVER_MIN_KM, min(COVER_MAX_KM, r))


def mass01(own):
    return 1.0 - math.exp(-max(0.0, own) / MASS_SAT)


def intensity_of(own, pop, coastal=False):
    return own / max(0.05, expected_own(pop, coastal))


def intensity01(intensity):
    if intensity <= 1.0:
        return 0.0
    return min(1.0, math.log(intensity) / math.log(INTENSITY_CAP))


def stayable01(pop):
    return 1.0 - math.exp(-max(0, pop or 0) / STAY_SAT)


def designation01(desigs):
    """Best designation wins, others add a shrinking bonus."""
    if not desigs:
        return 0.0
    vals = sorted((DESIGNATION_WEIGHT.get(d.get("kind"), DESIGNATION_DEFAULT)
                   for d in desigs), reverse=True)
    score = vals[0]
    for extra in vals[1:3]:
        score += extra * 0.15
    return min(1.0, score)


def variety01(top_share, n_cats):
    """How spread a place's sightseeing weight is across kinds of thing.

    Overture maps every beach segment separately, so a concrete resort strip
    can post a bigger number than a cathedral city. A place whose weight is
    one category deep is doing one thing; the multiplier below (0.55 at
    totally single-note, 1.0 at well spread) says so without banning beaches -
    a beach town with an old quarter and a castle keeps its score.
    """
    if not n_cats:
        return 0.55
    spread = 1.0 - max(0.0, min(1.0, (top_share or 0.0) - 0.35)) / 0.65
    depth = min(1.0, (n_cats - 1) / 5.0)
    return round(0.55 + 0.45 * (0.6 * spread + 0.4 * depth), 3)


def attention01(sitelinks, views):
    """Notability, bounded hard. 400 views/day or 40 sitelinks maxes it.

    Pageviews WIN when we have them, rather than the two being maxed together.
    Sitelink counts are inflated beyond use in exactly the countries this
    catalogue cares most about: Cebuano and Waray bots created an article for
    every French, Italian and Spanish commune, so 37,762 French settlements
    carry 12 or more sitelinks and the measure cannot separate Mougins from a
    hamlet with a road sign. Readership can.
    """
    if views is not None:
        return min(1.0, math.log1p(max(0, views)) / math.log1p(400))
    # Sitelinks-only rows are scored on a different, softer ruler and are
    # capped below the top, because the two must not be mixed freely: a bot
    # article set can otherwise beat a real, measured readership. 12 sitelinks
    # would score 0.69 unbounded, against 0.30 for a genuine 5 views a day.
    s = min(1.0, math.log1p(max(0, sitelinks or 0)) / math.log1p(40))
    return round(min(SITELINK_ONLY_CAP, s), 4)


def score_candidate(c, sig):
    own = c.get("own") or 0.0
    pop = c.get("pop") or 0
    inten = intensity_of(own, pop, bool(c.get("coastal")))
    parts = {
        "mass": mass01(own),
        "intensity": intensity01(inten),
        "designation": designation01(c.get("designations")),
        "stayable": stayable01(pop),
        "attention": attention01((sig or {}).get("sitelinks"), (sig or {}).get("views")),
    }
    # Missing attention must not silently mark a place down: renormalise over
    # the terms we actually measured rather than scoring an unknown as zero.
    have = dict(WEIGHTS)
    if not sig:
        have.pop("attention")
        parts.pop("attention")
    total = sum(have.values())
    worth = sum(parts[k] * have[k] for k in parts) / total

    # Variety damps the two POI-derived terms only; a designation or real
    # notability is evidence in its own right and is not a POI count.
    var = variety01(c.get("cat_top_share"), c.get("n_cats"))
    poi_share = (have["mass"] + have["intensity"]) / total
    worth *= (1.0 - poi_share) + poi_share * var
    parts["variety"] = round(var, 3)

    # A district of a bigger place needs its own evidence to count as a
    # destination: Levallois-Perret is not a place you fly to, Mougins is.
    if c.get("parent_city") and parts["designation"] < 0.5 and parts["intensity"] < 0.35:
        worth *= 0.45
        c["shadowed"] = True
    if c.get("is_section"):
        worth *= 0.8
    return round(worth, 4), {k: round(v, 3) for k, v in parts.items()}, round(inten, 2)


def refit(cands):
    """Recompute the expected-mass curves from the current candidate file.

    Printed, never written: a constant that moves silently is a constant
    nobody checks. Paste the output into EXP_FIT and say why in the commit.
    """
    import statistics
    rows = [c for c in cands["candidates"]
            if c["track"] == "settlement" and (c.get("pop") or 0) > 0]
    for label in ("coastal", "inland"):
        sub = sorted((c for c in rows if bool(c.get("coastal")) == (label == "coastal")),
                     key=lambda c: c["pop"])
        n = len(sub)
        pts = []
        for i in range(16):
            seg = sub[i * n // 16:(i + 1) * n // 16]
            if not seg:
                continue
            mp = statistics.median([c["pop"] for c in seg])
            mo = statistics.median([c["own"] for c in seg])
            if mo > 0:
                pts.append((math.log(mp), math.log(mo)))
        if len(pts) < 3:
            print(f"  {label}: too few bins to fit ({len(pts)})")
            continue
        mx = statistics.mean([x for x, _ in pts])
        my = statistics.mean([y for _, y in pts])
        b = (sum((x - mx) * (y - my) for x, y in pts)
             / sum((x - mx) ** 2 for x, _ in pts))
        a = math.exp(my - b * mx)
        cur = EXP_FIT[label]
        print(f"  {label:8s} n={n:6d}  fitted ({a:.5f}, {b:.4f})  "
              f"in file ({cur[0]:.5f}, {cur[1]:.4f})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=80,
                    help="rows per country in the markdown sheets")
    ap.add_argument("--min-worth", type=float, default=0.30,
                    help="drop candidates below this worth from the queue")
    ap.add_argument("--fit", action="store_true",
                    help="refit the expected-mass curves and print them, then exit")
    args = ap.parse_args()

    cands = load_json(CANDIDATES)
    if args.fit:
        if not cands:
            raise SystemExit(f"missing {CANDIDATES}")
        print("expected_own = a * pop^b, fitted on the current candidate file:")
        refit(cands)
        return
    if not cands:
        raise SystemExit(f"missing {CANDIDATES} - run build_place_candidates.py first")
    signals = load_json(SIGNALS)
    master = load_json(MASTER)
    dests = master.get("destinations") or {}

    # Population of each shipped destination, for the coverage radius.
    dest_pop = {}
    for did, d in dests.items():
        dest_pop[did] = ((d.get("geonames") or {}).get("population")) or 0

    rows = []
    for c in cands["candidates"]:
        sig = signals.get(c["key"])
        worth, parts, inten = score_candidate(c, sig)
        near_km = c.get("near_km")
        cover = cover_radius_km(dest_pop.get(c.get("near_id"), 0))
        covered = near_km is not None and near_km <= cover
        rows.append({
            "key": c["key"], "name": c["name"], "iso2": c["iso2"],
            "admin1": c.get("admin1"), "lat": c["lat"], "lon": c["lon"],
            "pop": c["pop"], "track": c["track"],
            "own": c.get("own"), "ring": c.get("ring"), "n_own": c.get("n_own"),
            "intensity": inten, "worth": worth, "parts": parts,
            "top_cats": [t["cat"] for t in (c.get("top_cats") or [])[:3]],
            "designations": c.get("designations") or [],
            "qid": c.get("qid") or (sig or {}).get("qid"),
            "sitelinks": (sig or {}).get("sitelinks"),
            "views": (sig or {}).get("views"),
            "near_id": c.get("near_id"), "near_city": c.get("near_city"),
            "near_km": near_km, "cover_km": round(cover, 2),
            "covered": covered,
            "parent_city": c.get("parent_city"),
            "shadowed": bool(c.get("shadowed")),
        })

    gaps = [r for r in rows if not r["covered"] and r["worth"] >= args.min_worth]
    gaps.sort(key=lambda r: -r["worth"])

    by_country = defaultdict(list)
    for r in gaps:
        cc = (r["iso2"] or "").strip().upper()
        by_country[cc if cc.isalpha() and len(cc) == 2 else "XX"].append(r)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(OUT_JSON, {
        "meta": {
            "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "n_candidates": len(rows),
            "n_gaps": len(gaps),
            "min_worth": args.min_worth,
            "weights": WEIGHTS,
            "expected_own": {"fit": EXP_FIT, "note": EXP_FIT_NOTE},
            "cover_radius": [COVER_A, COVER_B, COVER_MIN_KM, COVER_MAX_KM],
            "has_signals": bool(signals),
            "has_designations": any(r["designations"] for r in rows),
        },
        "gaps": gaps,
    })

    # Per-country review sheets.
    catalogue_n = defaultdict(int)
    for d in dests.values():
        catalogue_n[d.get("iso2")] += 1

    def row_md(r):
        why = []
        if r["intensity"] >= 3:
            why.append(f"{r['intensity']:.0f}x its size")
        if r["designations"]:
            why.append(", ".join(sorted({d.get("kind", "?") for d in r["designations"]})))
        if r["top_cats"]:
            why.append("/".join(r["top_cats"][:2]))
        pop = f"{r['pop']:,}" if r["pop"] else "-"
        near = f"{r['near_city']} {r['near_km']:.0f} km" if r["near_city"] else "-"
        return (f"| {r['name']} | {pop} | {r['worth']:.3f} | {r['own']:.0f} | "
                f"{r['intensity']:.1f}x | {near} | {'; '.join(why)} |")

    summary = ["# Catalogue coverage: what Europe has that Carta does not",
               "",
               f"Built {time.strftime('%Y-%m-%d')} from "
               f"{cands['meta']['n_candidates']:,} candidates against "
               f"{cands['meta']['n_catalogue']:,} shipped destinations.",
               "",
               "`worth` blends absolute sightseeing mass with intensity (mass "
               "divided by what a place that size normally has), designation "
               "and notability. Intensity is the size-fair half: a 500-person "
               "village can top this list.",
               "",
               "| Country | shipped | gaps >= min worth | best missing |",
               "|---|--:|--:|---|"]
    for cc in sorted(by_country, key=lambda k: -len(by_country[k])):
        rs = by_country[cc]
        best = ", ".join(r["name"] for r in rs[:3])
        summary.append(f"| {cc} | {catalogue_n.get(cc, 0)} | {len(rs)} | {best} |")
        lines = [f"# {cc}: missing destinations",
                 "",
                 f"{catalogue_n.get(cc, 0)} destinations shipped, "
                 f"{len(rs)} candidates above worth {args.min_worth}.",
                 "",
                 "| place | pop | worth | sights | intensity | nearest shipped | why |",
                 "|---|--:|--:|--:|--:|---|---|"]
        lines += [row_md(r) for r in rs[:args.top]]
        if len(rs) > args.top:
            lines.append("")
            lines.append(f"_{len(rs) - args.top} more below the cut in "
                         f"coverage_gaps.json._")
        (OUT_DIR / f"{cc}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (OUT_DIR / "SUMMARY.md").write_text("\n".join(summary) + "\n", encoding="utf-8")

    print(f"{len(rows):,} candidates scored")
    print(f"{len(gaps):,} uncovered above worth {args.min_worth}")
    print(f"  -> {OUT_JSON.relative_to(ROOT)}")
    print(f"  -> {OUT_DIR.relative_to(ROOT)}/ ({len(by_country)} country sheets)")
    if not signals:
        print("  ! no cache/place_signals.json yet: attention + designations "
              "unscored (run harvest_place_signals.py)")


if __name__ == "__main__":
    main()
