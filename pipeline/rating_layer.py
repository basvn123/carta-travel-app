"""Traveller rating engine - schema v17 `dest.rating` (rating_v4).

Tier: Library

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

Multi-airport cities are one destination (T755): the primary airport's row
(beauty_layer.CITY_PRIMARY_IATA, else the busiest) carries the city's rating,
and every other airport of the city becomes a gateway - `gateway_of: <primary
id>` and no rating block of its own - so Rome, Paris and London appear once in
every ranking, rail and top list. Flight search still reads the airport rows.
"""

import json
import re
from pathlib import Path

import appeal_scale
import beauty_layer
import place_registries
import rating_config
from rating_config import cfg, int_keys, section

ROOT = Path(__file__).resolve().parents[1]
DEST_PV_CACHE = ROOT / "cache" / "dest_pageviews.json"
CURATED_APPEAL = ROOT / "app_data" / "curated_appeal.json"
GOLDEN_ANCHORS = ROOT / "tests" / "golden_ratings.json"
ROUTES_ATTACH = ROOT / "data" / "derived" / "routes_attach.json"

# Chosen by grid search over the shipped catalogue, not by taste. The search
# held the catalogue mean at v2's 6.56 (so tier populations survive) and
# minimised the correlation between the final score and log(population). This
# combination lands at mean 6.56 and correlation -0.02, against v2's +0.09.
# Appeal stays at 0.70 because it remains the only term that has actually
# looked at the place; the whole change happens in the 0.30 beneath it.
# T754: every number below comes from continent-app/config/rating.json.
WEIGHTS = section("weights")

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
HIGHLIGHT_K = cfg("highlights.k")
PEAK_W = cfg("highlights.peak_w")           # the single best sight
DEPTH_W = cfg("highlights.depth_w")         # the best six, position-discounted
DEPTH_DECAY = cfg("highlights.decay")       # i-th sight counts 1/(1+0.55i)
SIG_UNMEASURED = cfg("highlights.sig_unmeasured")  # sig for an unscored POI:
                                # the catalogue median is ~1.5; unmeasured
                                # sits below it, never at world-class

# Depth (T756, rating v5 batch R1) replaces v4's highlights, which read the
# best six sights' significance and saturated: 0.98 to 1.0 for almost every
# famous place, and one big sight outscored variety. Depth asks how much there
# is to do, across distinct kinds, against the place's own class. Every
# number is in continent-app/config/rating.json (depth). The value is written
# into rating.components.highlights, the wire key the app reads, until schema
# v19 (T775) renames it.
#
# NOT LIVE (T756): switched on by depth.live in config/rating.json. Measured
# on the shipped catalogue it fails gates the rating must keep - the famous
# floors (Paris 8.9, Barcelona 8.7 against 9.0), the tier-3 population (26,
# gate 35 to 70) and one golden pair - because a within-class percentile
# averages 0.5 in every class where v4 highlights averaged about 0.9, and the
# POI data has no market, food or nightlife kinds yet (T774). Until the owner
# decides (Execution/_OPEN.md T756-a) the score reads v4 highlights and depth
# is computed for the gates and reports only.
_D = section("depth")
DEPTH_LIVE = _D["live"]
DEPTH_CATEGORIES = list(_D["categories"])
DEPTH_WEIGHT = dict(_D["item_weight"])
DEPTH_PER_CATEGORY = _D["per_category_max"]
DEPTH_CATEGORY_BONUS = _D["category_bonus"]
DEPTH_NATURE_MIN = _D["nature_min_score"]
DEPTH_REACH_KM = _D["reach_km"]
DEPTH_POI_MATCH_KM = _D["poi_nature_match_km"]
DEPTH_POI_BY_SIG = _D["poi_weight_by_sig"]
SIG_MAX = _D["sig_max"]                     # it.sig runs 0-3 (score_significance)
DEPTH_KIND_CATEGORY = dict(_D["kind_category"])
DEPTH_DEFAULT_CATEGORY = _D["default_category"]
DEPTH_NAME_CATEGORY = [(cat, re.compile(pat, re.I)) for cat, pat
                       in section("depth.name_category").items()]

# Acclaim: what membership of each register is worth, 0-1. Mirrors (and must
# stay in step with) score_place_candidates.DESIGNATION_WEIGHT. A place in two
# registers gains, but with sharply diminishing returns - three lists do not
# make somewhere three times as beautiful.
# T754: geoparks (0.30) and biosphere reserves (0.25) carry their own
# weights; they used to be read as national parks (0.62).
ACCLAIM_WEIGHT = section("recognition.weights")
ACCLAIM_DEFAULT = cfg("recognition.default")
ACCLAIM_EXTRA = cfg("recognition.extra")     # each further register, on the gap
ACCLAIM_EXTRA_MAX = cfg("recognition.extra_max")

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
TIER_CUTOFFS = int_keys(cfg("tiers.cutoffs"))
TIER_LABELS = int_keys(cfg("tiers.labels"))

# Hidden gem: rated high AND in the catalogue's low-fame tail, or curated
# as a gem by the editors (and still at least tier-1 quality).
HIDDEN_GEM_FAME_PCTL = int_keys(cfg("hidden_gem.max_fame_pctl_by_tier"))
HIDDEN_GEM_MIN_SCORE = cfg("hidden_gem.curated_min_score")
# The curator flag alone can't overrule fame: a place in the catalogue's TOP
# fame tail (Utrecht at ~13k views/day) is not hidden, whatever the flag says.
HIDDEN_GEM_CURATED_MAX_FAME_PCTL = cfg("hidden_gem.curated_max_fame_pctl")

RATING_MODEL = {
    # T754: the rating version (rating v5, batch R1). The model maths is still
    # rating_v4's; what changed is that every calibration is frozen in the
    # reference and every number is read from config/rating.json.
    "version": rating_config.version(),
    "formula_generation": "rating_v4",
    "config": "continent-app/config/rating.json",
    "reference": cfg("reference"),
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
        "highlights": (("depth (T756): how much there is to do across eight "
                        "categories, with diminishing returns, as a percentile "
                        "within the place class (key renamed in schema v19)")
                       if DEPTH_LIVE else
                       (f"peak-and-depth over the best {HIGHLIGHT_K} sights' "
                        "ABSOLUTE significance (it.sig), on the frozen depth "
                        "p99")),
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


def highlights_map(dests, p99=None):
    """{dest id: highlights 0-1}, p99-calibrated across the whole catalogue.

    hl = clip(0.55 peak + 0.45 depth / depth_p99, 0, 1).

    The p99 was measured from the catalogue at scoring time, which made it a
    cohort statistic: it drifted on every ingest and moved highlights, and so
    ratings, for places whose own sights had not changed. It is FROZEN in the
    reference (T754; first frozen 2026-09-04) so the depth scale is a property
    of the model rather than of today's catalogue size. Pass ``p99`` only to
    recalibrate. Returns (map, depth_p99).
    """
    parts = {did: highlights_parts(d) for did, d in dests.items()}
    if not parts:
        return {}, 0.0
    if p99 is None:
        p99 = rating_config.reference("rating")["depth_p99"]
    out = {did: min(1.0, max(0.0, PEAK_W * peak + DEPTH_W * (depth / p99)))
           for did, (peak, depth) in parts.items()}
    return out, round(p99, 3)


def poi_category(item):
    """One of the eight depth categories for a POI: a name pattern first (the
    shipped kinds have no market, food, zoo or nightlife kind), then the kind,
    then sights."""
    name = item.get("name") or ""
    for cat, rx in DEPTH_NAME_CATEGORY:
        if rx.search(name):
            return cat
    return DEPTH_KIND_CATEGORY.get(item.get("kind"), DEPTH_DEFAULT_CATEGORY)


_ROUTES = None


def load_routes():
    """{dest id: {"hiking": [...], "cycling": [...]}} from trails/attach.py."""
    global _ROUTES
    if _ROUTES is None:
        _ROUTES = (json.loads(ROUTES_ATTACH.read_text(encoding="utf-8"))
                   if ROUTES_ATTACH.exists() else {})
    return _ROUTES


def depth_items(did, dest):
    """[(fact key, category, weight)] the depth term counts for one place.

    POIs at rate 3 and 2; rated beaches, lakes and peaks scored at least
    DEPTH_NATURE_MIN between beauty's setting radius and DEPTH_REACH_KM; hikes
    and cycling routes rated at least that within DEPTH_REACH_KM. An item
    inside the setting radius is beauty's (beauty_layer.setting_items), and a
    nature POI standing on such an item is the same fact, so neither counts
    here: no fact feeds two components.
    """
    out = []
    lat, lon = beauty_layer.centre(dest)
    setting = [it for rows in beauty_layer.setting_items(dest).values()
               for it in rows]
    ring = []
    if lat is not None and lon is not None:
        idx = beauty_layer.nature_index()
        for kind in beauty_layer.NATURE_KINDS:
            for km, row in idx[kind].near(lat, lon, DEPTH_REACH_KM):
                if km <= beauty_layer.SETTING_KM:
                    continue
                if row["score"] >= DEPTH_NATURE_MIN:
                    ring.append(row)
                    out.append((row["key"], "nature",
                                DEPTH_WEIGHT["nature_item"]))
    known = setting + ring

    items = (dest.get("activities") or {}).get("items_full") or []
    for i, it in enumerate(items):
        if it.get("dup") or it.get("noise"):
            continue
        rate = it.get("rate") or 0
        if rate >= 3:
            w = DEPTH_WEIGHT["must_see"]
        elif rate == 2:
            w = DEPTH_WEIGHT["recommended"]
        else:
            continue
        if DEPTH_POI_BY_SIG:
            w *= min(1.0, max(0.0, (it.get("sig") or 0.0) / SIG_MAX))
        cat = poi_category(it)
        if (cat == "nature" and isinstance(it.get("lat"), (int, float))
                and any(beauty_layer._haversine_km(it["lat"], it["lon"],
                                                   k["lat"], k["lon"])
                        <= DEPTH_POI_MATCH_KM for k in known)):
            continue
        out.append((f"poi:{did}:{i}", cat, w))

    routes = load_routes().get(did) or {}
    for activity in ("hiking", "cycling"):
        for r in routes.get(activity) or []:
            if ((r.get("km") if r.get("km") is not None else 1e9)
                    <= DEPTH_REACH_KM
                    and (r.get("rating") or 0) >= DEPTH_NATURE_MIN):
                out.append((f"{activity}:{r['id']}", "active",
                            DEPTH_WEIGHT["nature_item"]))
    return out


def depth_raw(did, dest):
    """Diminishing returns within a category (the i-th item counts w / i, up
    to DEPTH_PER_CATEGORY), plus a bonus per category covered, so variety
    beats ten churches."""
    by_cat = {}
    for _key, cat, w in depth_items(did, dest):
        by_cat.setdefault(cat, []).append(w)
    total = 0.0
    for ws in by_cat.values():
        ws.sort(reverse=True)
        total += sum(w / (k + 1) for k, w in enumerate(ws[:DEPTH_PER_CATEGORY]))
    return total + DEPTH_CATEGORY_BONUS * len(by_cat)


def depth_knots(raw_by_class, n_knots):
    """{class: [[raw, percentile], ...]} measured on one catalogue."""
    out = {}
    for cls, vals in raw_by_class.items():
        pct = _percentiles(vals)
        by_value = {}
        for v, q in zip(vals, pct):
            by_value[round(v, 4)] = q
        pairs = sorted(by_value.items())
        if len(pairs) > n_knots:
            step = (len(pairs) - 1) / (n_knots - 1)
            pairs = [pairs[round(k * step)] for k in range(n_knots)]
        out[cls] = [[v, round(q, 6)] for v, q in pairs]
    return out


def depth_map(dests, knots=None):
    """{dest id: depth 0-1}: the raw depth read as a percentile within its
    class on the FROZEN breakpoints, so a village is compared with villages
    and adding places moves nobody. Pass ``knots`` only to recalibrate.
    Returns (map, raw map)."""
    if knots is None:
        knots = rating_config.reference("rating")["depth_knots"]
    raw = {did: depth_raw(did, d) for did, d in dests.items()}
    out = {}
    for did, d in dests.items():
        k = knots.get(appeal_scale.class_of(d)) or knots.get("__pooled__")
        out[did] = (min(1.0, max(0.0, appeal_scale._interp(k, raw[did])))
                    if k else 0.0)
    return out, raw


def acclaim01(dest):
    """What other people's juries say about this place, 0-1.

    Best register wins; further ones close a shrinking fraction of the gap to
    1.0, so being on three lists helps without being three times as good.
    """
    desigs = dest.get("designations") or []
    if not desigs:
        return 0.0
    vals = sorted((ACCLAIM_WEIGHT.get(place_registries.kind_of(d),
                                      ACCLAIM_DEFAULT)
                   for d in desigs), reverse=True)
    score = vals[0]
    for extra in vals[1:1 + ACCLAIM_EXTRA_MAX]:
        score += (1.0 - score) * ACCLAIM_EXTRA * extra
    return min(1.0, score)


# The fit runs only when the reference is recalibrated (T754): a normal run
# reads the frozen coefficients, so a new curated place cannot move every
# fitted score. Fewer than FALLBACK_MIN_N curated anchors refuses to fit.
FALLBACK_MIN_N = cfg("fallback.min_n")


def fit_fallback(dests, appeal, scales, hl01):
    """Least-squares fit of the real score onto acclaim, beauty, highlights.

    Fitted on the destinations that DO have a curated appeal, then applied to
    the ones that do not, so a place nobody has scored by hand still lands on
    the same scale as its neighbours instead of a tier and a half below them.
    ``hl01`` is the precomputed depth map (depth_map), so the fit
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
        raise ValueError(f"only {len(X)} curated places, the fallback fit "
                         f"needs {FALLBACK_MIN_N}")
    n = 4
    xtx = [[sum(X[k][i] * X[k][j] for k in range(len(X))) for j in range(n)]
           for i in range(n)]
    xty = [sum(X[k][i] * y[k] for k in range(len(X))) for i in range(n)]
    m = [xtx[i][:] + [xty[i]] for i in range(n)]
    for i in range(n):                      # Gaussian elimination, partial pivot
        piv = max(range(i, n), key=lambda r: abs(m[r][i]))
        m[i], m[piv] = m[piv], m[i]
        if not m[i][i]:
            raise ValueError("the fallback fit is singular")
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
        # score against these three terms over every curated destination.
        # Mean absolute error 0.52 against the hand-picked blend's 2.02. Since
        # T754 the fit is frozen in the reference and refit only on a
        # recalibration, so it cannot drift with the catalogue.
        fb = fallback
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
RATED_POIS_MIN = cfg("confidence.rated_pois_min")


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


def _fame_pctl(views, knots):
    """Fame percentile read on the frozen breakpoints (T754)."""
    return appeal_scale._interp(knots, views) if knots else 0.0


def _fame_knots(slot_views, n_knots):
    """Breakpoints [[views, percentile], ...] of one catalogue's city slots.

    Average rank on ties (as _percentiles), one knot per distinct value,
    thinned to n_knots so a lookup reproduces the reference percentiles.
    """
    pct = _percentiles(slot_views)
    by_value = {}
    for v, p in zip(slot_views, pct):
        by_value[v] = p
    pairs = sorted(by_value.items())
    if len(pairs) > n_knots:
        step = (len(pairs) - 1) / (n_knots - 1)
        pairs = [pairs[round(k * step)] for k in range(n_knots)]
    return [[float(v), round(p, 6)] for v, p in pairs]


def _scores(dests, scales, fallback, hl01, appeal):
    """Raw blended scores before calibration: (ids, scores, comps)."""
    ids = list(dests.keys())
    scores, comps = [], []
    for did in ids:
        s, c = blend_score(dests[did], appeal.get(did), scales, fallback,
                           hl01.get(did, 0.0))
        scores.append(s)
        comps.append(c)
    return ids, scores, comps


def _by_class(dests, ids, scores, comps):
    fitted_by_class, curated_by_class = {}, {}
    for i, did in enumerate(ids):
        cls = appeal_scale.class_of(dests[did])
        if "appeal" in comps[i]:
            curated_by_class.setdefault(cls, []).append(scores[i])
        else:
            fitted_by_class.setdefault(cls, []).append((i, scores[i]))
    return fitted_by_class, curated_by_class


def build_reference(dests):
    """The "rating" part of the frozen reference, measured on ``dests``.

    Runs only on a recalibration (apply_rating_layer.py --recalibrate). Every
    cohort statistic the score reads is measured here once: the per-class
    appeal scales, the depth p99, the fallback coefficients, the fitted-score
    curves and the fame breakpoints. Scoring afterwards is a lookup.
    """
    appeal = load_curated_appeal()
    pv = load_dest_pageviews()
    scales = appeal_scale.scales_for(dests, appeal)
    raw = {did: depth_raw(did, d) for did, d in dests.items()}
    raw_by_class = {}
    for did, d in dests.items():
        raw_by_class.setdefault(appeal_scale.class_of(d), []).append(raw[did])
    raw_by_class["__pooled__"] = list(raw.values())
    knots = depth_knots(raw_by_class, cfg("depth.knots"))
    depths = sorted(highlights_parts(d)[1] for d in dests.values())
    p99 = depths[int(0.99 * (len(depths) - 1))] or 1.0
    hl01 = (depth_map(dests, knots=knots)[0] if DEPTH_LIVE
            else highlights_map(dests, p99=p99)[0])
    fallback = fit_fallback(dests, appeal, scales, hl01)
    ids, scores, comps = _scores(dests, scales, fallback, hl01, appeal)
    fitted_by_class, curated_by_class = _by_class(dests, ids, scores, comps)
    curves = appeal_scale.build_anchor_curves(fitted_by_class,
                                              curated_by_class)
    slots = _city_slots(dests, ids)
    slot_views = [pv.get(ids[i]) or 0 for i in sorted(set(slots))]
    return {
        "n_destinations": len(dests),
        "n_curated": sum(len(v) for v in curated_by_class.values()),
        "n_fitted": sum(len(v) for v in fitted_by_class.values()),
        "appeal_scales": {cls: [round(m, 4), round(t, 4), c]
                          for cls, (m, t, c) in sorted(scales.items())},
        "depth_knots": knots,
        "depth_p99": round(p99, 3),
        "fallback": {"coefficients": list(fallback),
                     "terms": ["acclaim", "beauty", "highlights", "intercept"]},
        "curves": curves,
        "fame_knots": _fame_knots(slot_views, cfg("fame.knots")),
    }


def _city_slots(dests, ids):
    """index -> the index of its city's representative row.

    Multi-airport cities (Rome's FCO and CIA, London's four) are one city:
    the primary airport (beauty_layer's convention) represents it.
    """
    groups = {}
    for i, did in enumerate(ids):
        d = dests[did]
        if d.get("tier") != "airport":
            continue
        key = (d.get("iso2"), beauty_layer._base_city(d.get("city")))
        groups.setdefault(key, []).append(i)
    rep = list(range(len(ids)))
    for idxs in groups.values():
        if len(idxs) < 2:
            continue
        recs = [dests[ids[i]] for i in idxs]
        pi = idxs[recs.index(beauty_layer._pick_primary(recs))]
        for i in idxs:
            rep[i] = pi
    return rep


def compute_ratings(dests):
    """Attach dest['rating'] to every destination. Returns summary counts.

    T754: nothing here is measured on ``dests``. The class scales, depth p99,
    fallback coefficients, curves and fame breakpoints are read from the
    frozen reference, so a destination's score depends on its own evidence
    only and adding or removing places moves nobody else.
    """
    pv = load_dest_pageviews()
    appeal = load_curated_appeal()
    ref = rating_config.reference("rating")

    scales = appeal_scale.frozen_scales()
    if DEPTH_LIVE:
        hl01, _raw = depth_map(dests)
    else:
        hl01, depth_p99 = highlights_map(dests)
        RATING_MODEL["highlights_model"] = {
            "formula": "clip(0.55*peak + 0.45*depth/depth_p99, 0, 1)",
            "peak": "best sight's absolute significance (it.sig / 3)",
            "depth": (f"sum over top {HIGHLIGHT_K} of sig_i / "
                      f"(1 + {DEPTH_DECAY}*i)"),
            "depth_p99": depth_p99,
            "sig_source": ("score_significance.py: composite open-signal "
                           "evidence on the frozen reference breakpoints, 0-3"),
        }
    RATING_MODEL["depth_model"] = {
        "live": DEPTH_LIVE,
        "written_to": "rating.components.highlights (until schema v19)",
        "items": ("POIs at rate 3 (weight 1) and rate 2 (0.5); rated "
                  f"beaches, lakes, peaks, hikes and cycling routes scored "
                  f">= {DEPTH_NATURE_MIN} within {DEPTH_REACH_KM:g} km and "
                  f"beyond beauty's {beauty_layer.SETTING_KM:g} km"),
        "categories": DEPTH_CATEGORIES,
        "formula": (f"sum over categories of sum_i w_i / i (i <= "
                    f"{DEPTH_PER_CATEGORY}) + {DEPTH_CATEGORY_BONUS} x "
                    "categories covered; percentile within the class on "
                    "frozen breakpoints"),
    }
    fallback = tuple(ref["fallback"]["coefficients"])
    RATING_MODEL["fallback_fit"] = {
        "coefficients": list(fallback),
        "terms": ["acclaim", "beauty", "highlights", "intercept"],
        "note": ("frozen in the reference (T754), fitted on the curated "
                 "destinations, applied to the ones with no curated appeal"),
    }

    ids, scores, comps = _scores(dests, scales, fallback, hl01, appeal)
    views_list = [pv.get(did) or 0 for did in ids]
    curated_gem = [bool((appeal.get(did) or {}).get("gem")) for did in ids]

    # A4 (2026-09): the regression's raw output regresses to the mean, so a
    # fitted place was 5.6x less likely to earn a label than a curated one.
    # Each fitted place's raw output is read off its class's frozen curve
    # (monotone, class-relative, never country-relative). Curated scores are
    # never touched.
    fitted_by_class, curated_by_class = _by_class(dests, ids, scores, comps)
    calibrated = appeal_scale.apply_anchor_curves(fitted_by_class,
                                                  ref["curves"])
    for i, s in calibrated.items():
        scores[i] = s

    RATING_MODEL["fitted_calibration"] = dict(
        appeal_scale.CALIBRATION_MODEL,
        version="fitted_quantile_v2_frozen",
        anchors=cfg("reference"),
        anchors_frozen_this_run=False,
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


    # One row per city (T755): the other airports of a multi-airport city are
    # its gateways. They keep their own row for flight search and lose their
    # rating, so no ranking can list the city twice.
    rep = _city_slots(dests, ids)

    # Fame percentile per city slot, read on the frozen breakpoints (T754):
    # it used to be a rank within today's catalogue, so adding places moved
    # the hidden-gem flag of places whose own fame had not changed.
    fame_pctls = [_fame_pctl(views_list[i], ref["fame_knots"])
                  for i in range(len(ids))]

    try:
        fabric = json.loads((ROOT / "cache" / "urban_fabric.json")
                            .read_text(encoding="utf-8"))
    except OSError:
        fabric = {}
    measured_fame = set(pv)

    counts = {3: 0, 2: 0, 1: 0, 0: 0, "hidden_gem": 0,
              "curated": 0, "modelled": 0, "provisional": 0}
    counts["gateway"] = 0
    for i, did in enumerate(ids):
        if rep[i] != i:
            dests[did]["gateway_of"] = ids[rep[i]]
            dests[did].pop("rating", None)
            counts["gateway"] += 1
            continue
        dests[did].pop("gateway_of", None)
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
