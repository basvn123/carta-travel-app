"""Traveller rating engine - schema v17 `dest.rating` (rating_v4).

v4 (2026-09, PLAN.md phase A): the same four components, honestly measured.
Highlights reads an absolute per-POI significance instead of the town-
relative rate that had collapsed it into a constant (A2); beauty gains an
urban-fabric component and a graded UNESCO credit, measured from the city
rather than the airport (A3); the fitted fallback becomes a within-class
quantile calibration - the regression ranks, the curated distribution
scores, a p95 cap and a curated-anchor guard keep the modelled tail below
the hand-ranked crowns (A4); and every rating now says how much it knows:
`confidence` (curated / modelled / provisional) plus `inputs_present` (A5).
The v3 rationale below still explains the component design.

Turns a curated editorial judgement plus three data signals into one clear
0-10 destination score and a Michelin-Green-Guide-style tier:

  score   0-10, one decimal - "how strong is this destination overall?"
  tier    3  "Worth the journey"   (>= 8.7, the continent's icons, ~3%)
          2  "Worth a detour"      (>= 7.8, excellent, plan around them)
          1  "Worth a visit"       (>= 6.9, solid picks)
          0  (no label)            (rest - fine if they fit the route)
  hidden_gem  true when the place rates high but the world hasn't noticed.

v3 rationale (replacing rating_v2): v2 separated "how good is it" from "how
known is it", which was right, and then quietly re-introduced a worse bias.
Its things-to-do term counted every POI a destination had, and POI count is a
population measurement: across the 1,488 rated destinations it correlated
+0.57 with log(population) while correlating +0.03 with what the curators
actually thought of the place. It was 15% of every score, so it handed roughly
half a point to anywhere large, for being large.

The damage was exactly where a traveller would notice. Of the 40 destinations
that reached "worth the journey", 9 had fewer than 20,000 people, and 8 of
those 9 were landscapes - Santorini, the Dolomites, Lake Como. Not one built
village in Europe could reach the top tier. A perfect hill town was structurally
capped below a mediocre city.

v3 fixes it in two places, and needed both:

  appeal    0.70  the curated 0-10 traveller-appeal judgement
                  (app_data/curated_appeal.json), now read through the
                  per-class scale in appeal_scale.py. The raw file was itself
                  the larger half of the problem: its anchors run "Rome 10 ...
                  Charleroi 2.5" and are all cities, so at equal independent
                  evidence a village in the top evidence quartile was scored
                  0.97 lower than a metro. The scale opens the top of each
                  class without moving its median and without ever reordering.
  beauty    0.13  the composite Beauty Index (beauty_layer.py): UNESCO
                  proximity, scenic-nature tags, iconic status, Blue-Flag
                  beaches. Mildly size-NEGATIVE, which is why it gained weight.
  highlights 0.11 REPLACES things-to-do. Scores the best handful of sights
                  rather than the total count: the top 6 by significance,
                  saturating fast. A village with one world-class abbey and a
                  perfect square scores near the top; a city does not earn more
                  by also having 140 mediocre entries. Population correlation
                  falls from +0.57 to +0.31.
  acclaim   0.06  NEW. Membership of an authoritative register: Les Plus Beaux
                  Villages de France, I Borghi piu belli d'Italia, UNESCO,
                  national heritage-town labels (dest.designations, written by
                  apply_designations.py). Evidence rather than opinion: a jury
                  with published criteria already judged the place. Kept small
                  because in the shipped catalogue it skews LARGE (+0.20 with
                  log-population): UNESCO sites and Capitals of Culture are
                  mostly cities, whatever the village associations do.

The count that was thrown out is not lost - it moves to `place.depth`
(place_layer.py), where breadth is the answer rather than a bias, and where it
drives how long to stay and whether to sleep there.

Fame (avg daily Wikipedia pageviews, cache/dest_pageviews.json) still does not
move the score AT ALL - it only decides hidden_gem.

The score is ABSOLUTE in the sense that matters: no ranks are forced onto a
target distribution, and a class with no outstanding members gets no
outstanding scores. What IS class-relative is the ceiling, deliberately - the
claim being made is that an exceptional village belongs in the same tier as an
exceptional city, which is the Michelin idiom these tiers already borrow.
Three stars means worth the journey, not worth the journey if it is large.

Result on the shipped catalogue, at fixed tier populations: the top tier goes
from 35% to 40% villages, towns and landscapes, and Hallstatt, Zermatt,
Meteora, Lauterbrunnen, Kotor and Taormina join it.

Multi-airport cities are unified onto their primary airport first (same
convention as the beauty layer) so Paris ranks once, not three times.
"""

import json
import math
from pathlib import Path

import appeal_scale
import beauty_layer

ROOT = Path(__file__).resolve().parents[1]
DEST_PV_CACHE = ROOT / "cache" / "dest_pageviews.json"
CURATED_APPEAL = ROOT / "app_data" / "curated_appeal.json"
GOLDEN_ANCHORS = ROOT / "tests" / "golden_ratings.json"

# Chosen by grid search over the shipped catalogue, not by taste. The search
# held the catalogue mean at v2's 6.56 (so tier populations survive) and
# minimised the correlation between the final score and log(population). This
# combination lands at mean 6.56 and correlation -0.02, against v2's +0.09.
# Appeal stays at 0.70 because it remains the only term that has actually
# looked at the place; the whole change happens in the 0.30 beneath it.
WEIGHTS = {"appeal": 0.70, "beauty": 0.13, "acclaim": 0.06, "highlights": 0.11}

# Highlights (A2, 2026-09): peak-and-depth over the ABSOLUTE per-POI
# significance (`it.sig`, 0-3, written by score_significance.py from
# pageviews + sitelinks + heritage + Wikivoyage curation, percentile-ranked
# across every live POI in Europe). The previous top-6 sum over the
# town-relative `rate` saturated completely - 87.2% of the catalogue carried
# one identical value - because rate answers "top of this town?", not "how
# big a deal is this anywhere?". Only the top HIGHLIGHT_K sights count, so
# the measure still asks "how good is the best of what is here" rather than
# "how much is here" - the question a traveller on a two-day visit is
# actually asking.
HIGHLIGHT_K = 6
PEAK_W = 0.55                   # the single best sight
DEPTH_W = 0.45                  # the best six, position-discounted
DEPTH_DECAY = 0.55              # i-th sight counts 1/(1+0.55i)
SIG_UNMEASURED = 0.9            # sig for a POI the significance run missed:
                                # the catalogue median is ~1.5; unmeasured
                                # sits below it, never at world-class

# Acclaim: what membership of each register is worth, 0-1. Mirrors (and must
# stay in step with) score_place_candidates.DESIGNATION_WEIGHT. A place in two
# registers gains, but with sharply diminishing returns - three lists do not
# make somewhere three times as beautiful.
ACCLAIM_WEIGHT = {
    "unesco_whc": 1.00,
    "beautiful_village": 0.95,
    "heritage_town": 0.72,
    "spa_town": 0.68,
    "national_park": 0.62,
    "unesco_tentative": 0.50,
    "capital_of_culture": 0.55,
    "cittaslow": 0.45,
    "market_town": 0.25,
    "blue_flag": 0.35,
    "eden": 0.50,
}
ACCLAIM_DEFAULT = 0.40
ACCLAIM_EXTRA = 0.18            # each further register, on the remaining gap

# Recalibrated twice, both times to hold the tier POPULATIONS steady so that a
# destination changing tier always means the model changed its mind about that
# place rather than the ruler moving. 8.5/7.5/6.8 -> 8.4/7.5/6.7 when
# highlights replaced the POI count, then -> 8.7/7.8/6.9 when the per-class
# appeal scale (appeal_scale.py) lifted the small classes. Populations across
# all three: 40/190/603, 44/188/643, 43/183/612.
#
# Original note on the first move: The
# highlights term has a much tighter spread than the count it replaced (most
# places land 8.5-9.1 rather than 4.1-9.1), which narrows the whole
# distribution and would otherwise have silently emptied the tiers: 603
# destinations qualified as "worth a visit" under v2 and only 558 would have
# under v3 at the old cutoff, purely from the change in spread. These cutoffs
# reproduce v2's tier populations (40 / 190 / 603 -> 44 / 188 / 643), so a
# destination moving tier means the model changed its mind about that place,
# not that the ruler moved.
TIER_CUTOFFS = {3: 8.7, 2: 7.8, 1: 6.9}
TIER_LABELS = {3: "Worth the journey", 2: "Worth a detour", 1: "Worth a visit"}

# Hidden gem: rated high AND in the catalogue's low-fame tail, or curated
# as a gem by the editors (and still at least tier-1 quality).
HIDDEN_GEM_FAME_PCTL = {2: 0.40, 1: 0.20}   # min tier -> max fame percentile
HIDDEN_GEM_MIN_SCORE = 7.0                   # floor for curator-flagged gems
# The curator flag alone can't overrule fame: a place in the catalogue's TOP
# fame tail (Utrecht at ~13k views/day) is not hidden, whatever the flag says.
HIDDEN_GEM_CURATED_MAX_FAME_PCTL = 0.6

RATING_MODEL = {
    "version": "rating_v4",
    "weights": WEIGHTS,
    "tier_cutoffs": {str(k): v for k, v in TIER_CUTOFFS.items()},
    "tier_labels": {str(k): v for k, v in TIER_LABELS.items()},
    "hidden_gem": ("(tier>=2 & fame_pctl<=0.40) or (tier==1 & fame_pctl<=0.20) "
                   "or (curated gem & score>=7.0 & fame_pctl<=0.6)"),
    "scale": "absolute 0-10 (no percentile re-spreading, none within size class)",
    "confidence": ("curated: a hand appeal score exists; modelled: the "
                   "quantile calibration produced it; provisional: modelled "
                   "with no designations and under three rated sights"),
    "components": {
        "appeal": ("curated 0-10 traveller-appeal judgement "
                   "(curated_appeal.json), read through the per-class scale"),
        "acclaim": "membership of authoritative place registers (dest.designations)",
        "beauty": "composite Beauty Index (UNESCO, nature tags, iconic, beaches)",
        "highlights": (f"peak-and-depth over the best {HIGHLIGHT_K} sights' "
                       "ABSOLUTE significance (it.sig), p99-normalised at "
                       "scoring time"),
        "fame": "avg daily Wikipedia pageviews - hidden-gem signal only, not scored",
    },
    "appeal_scale": appeal_scale.APPEAL_SCALE_MODEL,
    "size_fairness": (
        "highlights replaced a whole-catalogue POI count that correlated +0.57 "
        "with log(population); breadth moved to place.depth; the curated "
        "appeal file's city-anchored ceiling is opened per class"),
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


def highlights_parts(dest):
    """(peak01, depth_raw) for one destination, from ABSOLUTE significance.

    2026-09 (A2): the previous version read the town-relative `rate`, which
    answers "top of THIS town?" - so its top-6 sum was six 3s almost
    everywhere and 87.2% of the catalogue shared one identical value. It now
    reads `it.sig`, the catalogue-wide 0-3 significance score_significance.py
    writes (composite of pageviews, sitelinks, heritage designation and
    Wikivoyage curation, percentile-ranked across every live POI in Europe).

      peak   the single best sight, 0-1: does this place hold anything of
             European rank at all?
      depth  the best six, each discounted by position (1 / (1 + 0.55 i)):
             what do the best few days here look like? Normalised later
             against the catalogue's p99, computed at scoring time.

    dup/noise items never count. Items without a sig (a POI added after the
    last significance run) fall back to a neutral low value rather than the
    inflated rate: unmeasured is not the same claim as world-class.
    """
    act = (dest.get("activities") or {})
    items = act.get("items_full") or []
    if not items:
        # thin fallback: a name-only list. Treat as mid-significance sights
        # so a destination the enricher has not reached is not zeroed for it.
        n = min(len(act.get("items") or []), HIGHLIGHT_K)
        sigs = [SIG_UNMEASURED] * n
    else:
        sigs = sorted((it.get("sig", SIG_UNMEASURED)
                       for it in items
                       if not it.get("dup") and not it.get("noise")),
                      reverse=True)
    if not sigs:
        return 0.0, 0.0
    peak = min(1.0, max(0.0, sigs[0] / 3.0))
    depth = sum(s / (1.0 + DEPTH_DECAY * i)
                for i, s in enumerate(sigs[:HIGHLIGHT_K]))
    return peak, depth


def highlights_map(dests):
    """{dest id: highlights 0-1}, p99-calibrated across the whole catalogue.

    hl = clip(0.55 peak + 0.45 depth / depth_p99, 0, 1). The p99 is measured
    from the catalogue at scoring time, never hardcoded, so the scale tracks
    the data as coverage grows. Returns (map, depth_p99).
    """
    parts = {did: highlights_parts(d) for did, d in dests.items()}
    depths = sorted(p[1] for p in parts.values())
    if not depths:
        return {}, 0.0
    p99 = depths[int(0.99 * (len(depths) - 1))] or 1.0
    out = {did: min(1.0, max(0.0, PEAK_W * peak + DEPTH_W * (depth / p99)))
           for did, (peak, depth) in parts.items()}
    return out, round(p99, 3)


def acclaim01(dest):
    """What other people's juries say about this place, 0-1.

    Best register wins; further ones close a shrinking fraction of the gap to
    1.0, so being on three lists helps without being three times as good.
    """
    desigs = dest.get("designations") or []
    if not desigs:
        return 0.0
    vals = sorted((ACCLAIM_WEIGHT.get(d.get("kind"), ACCLAIM_DEFAULT)
                   for d in desigs), reverse=True)
    score = vals[0]
    for extra in vals[1:4]:
        score += (1.0 - score) * ACCLAIM_EXTRA * extra
    return min(1.0, score)


# Used only if the fit cannot run (fewer than FALLBACK_MIN_N curated anchors).
# These are the coefficients the fit produced on the 1,570-destination curated
# set, kept as a documented starting point rather than a magic number.
FALLBACK_DEFAULT = (0.098, 0.322, 0.085, 4.146)
FALLBACK_MIN_N = 200


def fit_fallback(dests, appeal, scales, hl01):
    """Least-squares fit of the real score onto acclaim, beauty, highlights.

    Fitted on the destinations that DO have a curated appeal, then applied to
    the ones that do not, so a place nobody has scored by hand still lands on
    the same scale as its neighbours instead of a tier and a half below them.
    ``hl01`` is the precomputed highlights map (highlights_map), so the fit
    reads exactly the values the scorer will. Returns
    (w_acclaim, w_beauty, w_highlights, intercept).
    """
    X, y = [], []
    for did, d in dests.items():
        rec = appeal.get(did)
        if not rec or rec.get("appeal") is None:
            continue
        a = float(rec["appeal"])
        if scales:
            a = appeal_scale.rescale(a, appeal_scale.class_of(d), scales)
        beauty = (d.get("beauty") or {}).get("score", 0) or 0.0
        hl = hl01.get(did, 0.0) * 10.0
        real = (WEIGHTS["appeal"] * a + WEIGHTS["beauty"] * beauty
                + WEIGHTS["acclaim"] * acclaim01(d) * 10.0
                + WEIGHTS["highlights"] * hl)
        X.append([acclaim01(d) * 10.0, beauty, hl, 1.0])
        y.append(real)
    if len(X) < FALLBACK_MIN_N:
        return FALLBACK_DEFAULT
    n = 4
    xtx = [[sum(X[k][i] * X[k][j] for k in range(len(X))) for j in range(n)]
           for i in range(n)]
    xty = [sum(X[k][i] * y[k] for k in range(len(X))) for i in range(n)]
    m = [xtx[i][:] + [xty[i]] for i in range(n)]
    for i in range(n):                      # Gaussian elimination, partial pivot
        piv = max(range(i, n), key=lambda r: abs(m[r][i]))
        m[i], m[piv] = m[piv], m[i]
        if not m[i][i]:
            return FALLBACK_DEFAULT
        for r in range(n):
            if r != i:
                f = m[r][i] / m[i][i]
                for c in range(i, n + 1):
                    m[r][c] -= f * m[i][c]
    return tuple(round(m[i][n] / m[i][i], 4) for i in range(n))


def blend_score(dest, appeal_rec, scales=None, fallback=None, hl=0.0):
    """Absolute 0-10 score. Falls back to evidence-led scoring when a
    destination has no curated appeal entry - which is no longer a
    "shouldn't happen": every place the coverage engine promotes arrives
    without one, and must still rate honestly on the day it ships.

    ``scales`` is the per-class appeal calibration (appeal_scale.py). Without
    it the raw curated number is used, which is the pre-v3 behaviour and is
    what the shadow report compares against.
    """
    beauty = (dest.get("beauty") or {}).get("score", 0) or 0.0
    highlights = hl * 10.0
    acclaim = acclaim01(dest) * 10.0
    if appeal_rec and appeal_rec.get("appeal") is not None:
        appeal = float(appeal_rec["appeal"])
        if scales:
            appeal = appeal_scale.rescale(appeal, appeal_scale.class_of(dest), scales)
        total = (WEIGHTS["appeal"] * appeal
                 + WEIGHTS["acclaim"] * acclaim
                 + WEIGHTS["beauty"] * beauty
                 + WEIGHTS["highlights"] * highlights)
    else:
        # No curator has seen this one yet, which since the 2026-08 expansion
        # is 1,468 destinations rather than a rounding error. Guessing weights
        # here was measurably wrong: a hand-picked 0.42/0.34/0.24 blend scored
        # the CURATED destinations 1.78 points below what they actually get,
        # so every uncurated place would have entered the catalogue a tier and
        # a half too low, purely for being new. That is the same structural
        # unfairness as marking a village down for being small.
        #
        # `fallback` is therefore fitted, not chosen: least squares of the real
        # score against these three terms over every curated destination, run
        # at scoring time so it can never go stale. Mean absolute error 0.52
        # against the hand-picked blend's 2.02.
        fb = fallback or FALLBACK_DEFAULT
        total = (fb[0] * acclaim + fb[1] * beauty + fb[2] * highlights + fb[3])
        appeal = None
    comps = {"beauty": round(beauty / 10.0, 3),
             "highlights": round(highlights / 10.0, 3),
             "acclaim": round(acclaim / 10.0, 3)}
    if appeal is not None:
        comps["appeal"] = round(appeal / 10.0, 3)
    return max(0.0, min(10.0, total)), comps


# A5: how much does this rating actually know? "curated" - a hand appeal
# score exists (the only input that has looked at the place). "modelled" -
# the A4 calibration produced it from evidence. "provisional" - modelled,
# AND no register has judged the place, AND fewer than RATED_POIS_MIN
# meaningfully-rated sights (rate >= 2 under the significance engine's local
# quotas) exist to feed the evidence. Shown, not hidden: a modelled 8.1 is
# an 8.1 with a quiet mark, never a silent demotion.
RATED_POIS_MIN = 3


def rated_poi_count(dest):
    items = (dest.get("activities") or {}).get("items_full") or []
    return sum(1 for it in items
               if not it.get("dup") and not it.get("noise")
               and (it.get("rate") or 0) >= 2)


def confidence_for(dest, curated, fame_measured, fabric_measured):
    """(confidence, inputs_present). Five binary inputs are counted: the
    curated appeal, register designations, >= RATED_POIS_MIN rated sights,
    a real pageview measurement, and an urban-fabric measurement."""
    n_rated = rated_poi_count(dest)
    if curated:
        conf = "curated"
    elif not dest.get("designations") and n_rated < RATED_POIS_MIN:
        conf = "provisional"
    else:
        conf = "modelled"
    inputs = sum((
        1 if curated else 0,
        1 if dest.get("designations") else 0,
        1 if n_rated >= RATED_POIS_MIN else 0,
        1 if fame_measured else 0,
        1 if fabric_measured else 0,
    ))
    return conf, inputs


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

    scales = appeal_scale.scales_for(dests, appeal)
    hl01, depth_p99 = highlights_map(dests)
    RATING_MODEL["highlights_model"] = {
        "formula": "clip(0.55*peak + 0.45*depth/depth_p99, 0, 1)",
        "peak": "best sight's absolute significance (it.sig / 3)",
        "depth": f"sum over top {HIGHLIGHT_K} of sig_i / (1 + {DEPTH_DECAY}*i)",
        "depth_p99": depth_p99,
        "sig_source": ("score_significance.py: catalogue-wide percentile of "
                       "composite open-signal evidence, 0-3"),
    }
    fallback = fit_fallback(dests, appeal, scales, hl01)
    RATING_MODEL["fallback_fit"] = {
        "coefficients": list(fallback),
        "terms": ["acclaim", "beauty", "highlights", "intercept"],
        "note": ("fitted at scoring time on the curated destinations, applied "
                 "to the ones with no curated appeal"),
    }

    ids = list(dests.keys())
    scores, comps, views_list, curated_gem = [], [], [], []
    for did in ids:
        d = dests[did]
        rec = appeal.get(did)
        s, c = blend_score(d, rec, scales, fallback, hl01.get(did, 0.0))
        scores.append(s)
        comps.append(c)
        views_list.append(pv.get(did) or 0)
        curated_gem.append(bool(rec and rec.get("gem")))

    # A4 (2026-09): the regression's raw output regresses to the mean, so a
    # fitted place was 5.6x less likely to earn a label than a curated one.
    # Keep the regression as the RANKING device and map each fitted place's
    # within-class rank onto the curated score distribution of its class
    # (appeal_scale.quantile_calibrate: monotone, class-relative, never
    # country-relative). Curated scores are never touched.
    fitted_by_class, curated_by_class = {}, {}
    for i, did in enumerate(ids):
        cls = appeal_scale.class_of(dests[did])
        if "appeal" in comps[i]:
            curated_by_class.setdefault(cls, []).append(scores[i])
        else:
            fitted_by_class.setdefault(cls, []).append((i, scores[i]))
    calibrated = appeal_scale.quantile_calibrate(fitted_by_class,
                                                 curated_by_class)
    for i, s in calibrated.items():
        scores[i] = s

    RATING_MODEL["fitted_calibration"] = dict(
        appeal_scale.CALIBRATION_MODEL,
        n_fitted=len(calibrated),
        n_curated=sum(len(v) for v in curated_by_class.values()),
    )

    # Editorial anchor guard (checkpoint-2 decision, 2026-09-03). The golden
    # set (tests/golden_ratings.json) is hand-curated ordering judgement, the
    # same kind of editorial anchor as FAMOUS_FLOOR and appeal_scale.EXPECTED,
    # and it constrains MODELLED scores the same way: where a golden pair puts
    # a curated place above a fitted one, the fitted score is clamped strictly
    # below it at display precision. Calibration reads evidence; evidence
    # cannot see charm, and where the editors have already ruled, the model
    # does not get to overrule them. Curated scores are never touched, and
    # fitted-vs-fitted pairs are left to the (monotone) calibration itself.
    idx_of = {did: i for i, did in enumerate(ids)}
    curated_set = {ids[i] for i in range(len(ids)) if "appeal" in comps[i]}
    n_guarded = 0
    if GOLDEN_ANCHORS.exists():
        for pair in json.loads(GOLDEN_ANCHORS.read_text(encoding="utf-8"))["pairs"]:
            w, l = idx_of.get(pair["winner"]), idx_of.get(pair["loser"])
            if w is None or l is None:
                continue
            if pair["winner"] in curated_set and pair["loser"] not in curated_set:
                cap = round(scores[w], 1) - 0.1
                if scores[l] > cap:
                    scores[l] = cap
                    n_guarded += 1
    RATING_MODEL["fitted_calibration"]["anchor_guard"] = {
        "source": "tests/golden_ratings.json (curated-above-fitted pairs only)",
        "clamped_this_run": n_guarded,
    }


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

    try:
        fabric = json.loads((ROOT / "cache" / "urban_fabric.json")
                            .read_text(encoding="utf-8"))
    except OSError:
        fabric = {}
    measured_fame = set(pv)

    counts = {3: 0, 2: 0, 1: 0, 0: 0, "hidden_gem": 0,
              "curated": 0, "modelled": 0, "provisional": 0}
    for i, did in enumerate(ids):
        score = round(scores[i], 1)
        tier = tier_for(score)
        fame_pct = fame_pctls[i]
        hidden = ((tier >= 2 and fame_pct <= HIDDEN_GEM_FAME_PCTL[2])
                  or (tier == 1 and fame_pct <= HIDDEN_GEM_FAME_PCTL[1])
                  or (curated_gem[i] and score >= HIDDEN_GEM_MIN_SCORE
                      and fame_pct <= HIDDEN_GEM_CURATED_MAX_FAME_PCTL))
        conf, inputs = confidence_for(
            dests[did], "appeal" in comps[i],
            did in measured_fame, bool(fabric.get(did)))
        counts[conf] += 1
        dests[did]["rating"] = {
            "score": score,
            "tier": tier,
            "label": TIER_LABELS.get(tier),
            "hidden_gem": bool(hidden),
            "confidence": conf,
            "inputs_present": inputs,
            "fame": int(views_list[i]),
            "components": comps[i],
            "source": RATING_MODEL["version"],
        }
        counts[tier] += 1
        counts["hidden_gem"] += 1 if hidden else 0
    return counts
