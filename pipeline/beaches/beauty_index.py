"""The beach beauty index: what "one of the most beautiful beaches" means
here, written down so it can be argued with.

The problem this model exists to avoid is the one every published beach
ranking has. Dias et al. (2024) looked at 70 beach ranking websites and found
that two thirds ranked without using any stated indicator at all, and the most
common indicator among the rest was "the colour of the water", judged by eye.
The lists that DO have a method mostly count reviews, which returns the
beaches that are already famous, already busy and already on every itinerary.
A traveller who wanted that list did not need us.

So the score is built from six components, each 0..1, each grounded in a field
we hold and can show:

  setting   0.26  the landform. Cliffs, a sea cave, a rock arch, dunes, pines
                  coming down to the sand, a lagoon, an islet offshore, a
                  reef, a lighthouse, and whether the whole thing sits inside
                  a national park or a nature reserve. This is the biggest
                  weight because it is what people mean by a beautiful beach
                  and it is the hardest thing for a beach to fake.
  acclaim   0.20  fame, deliberately capped and deliberately split: 60 per
                  cent is the beach's rank WITHIN its own country, 40 per cent
                  is its standing in Europe, both on a log scale. Splitting it
                  is what stops Greece and Spain, which have far more mapped
                  and photographed beaches than Latvia, from filling every
                  page; capping it is what stops the ten beaches on every
                  poster from being the whole answer.
  water     0.16  the EEA bathing season class, Excellent down to Poor, from
                  the Bathing Water Directive sampling that already covers
                  22,000 official sites. Audited, annual, and the only water
                  quality signal in Europe that is not somebody's opinion. A
                  beach with no nearby site scores the country's median rather
                  than a zero: no reading is not a bad reading.
  sand      0.14  substrate and colour. White, pink and black volcanic sand
                  score above golden, golden above shingle, shingle above
                  rock, and clear or turquoise water lifts all of them.
  wildness  0.14  the anti-resort term. Counts what is built within 400 m and
                  subtracts it, then adds back for a beach you can only reach
                  by boat, on foot or down a stair. This is what puts a cove
                  with nothing on it above a strip with forty hotels behind
                  it, and it is the component the review-count rankings have
                  backwards.
  comfort   0.10  parking, toilets, showers, drinking water, food, a
                  lifeguard, step free access. Low weight on purpose: it makes
                  a beach usable, not beautiful.

Plus a standout bonus (0.15 of the strongest PHYSICAL component: setting, sand
or wildness), the same device the destination beauty layer uses, so a beach
that is exceptional in exactly one way still ranks. A wild cove under a cliff
with no water reading and no facilities should not be beaten by an adequate
town beach that scores 0.5 on everything. Acclaim, water and comfort are
excluded from the bonus on purpose, see STANDOUT_ON.

Every beach also comes out with the REASONS it scored: a list of codes with
their values, which the app turns into sentences in six languages
(continent-app/src/lib/beachStory.js). The codes are the audit trail. If a
sentence is on the page, a field somewhere put it there, and the beach page
shows the component bars next to the prose so the number can be checked
against the reasons rather than taken on faith.

ASCII clean, no em dashes, per project convention.
"""

import math
import re
import unicodedata

# ---------------------------------------------------------------------------
# The model
# ---------------------------------------------------------------------------

# Bumped whenever a weight, a component or a cutoff changes. It rides in the
# published index.json so a wire file can always be matched to the model that
# scored it, which is the difference between "the beaches moved" and "we moved
# them".
MODEL_VERSION = "beach_beauty_v2"

# The weight table as 03-BEACHES.md states it. Two components are new (space
# and photo beauty, 0.06 each) and two were trimmed to pay for them (setting
# 0.26 -> 0.24, acclaim 0.20 -> 0.18).
#
# It does not add up. The trims free 0.04 and the additions cost 0.12, so the
# table as written sums to 1.08 rather than to 1.00, and the brief's own words
# for the trims ("make room") say that was not the intention. Shipping it
# unbalanced would not be a neutral choice: the score is 10x the weighted sum,
# so every beach in Europe would score about eight per cent higher against
# band cutoffs (6.4 / 7.6 / 8.6) that the brief leaves unchanged, and the top
# of the range would compress against the 1.0 clamp until a 10.0 stopped
# meaning anything.
#
# So the brief's RATIOS ship exactly as written and the sum is normalised back
# to 1.00. Both tables go into index.json, `weights` and `weights_as_briefed`,
# so the deviation is visible from the wire rather than buried here.
WEIGHTS_AS_BRIEFED = {
    "setting": 0.24,
    "acclaim": 0.18,
    "water": 0.16,
    "sand": 0.14,
    "wildness": 0.14,
    "comfort": 0.10,
    "space": 0.06,
    "photo": 0.06,
}
_BRIEFED_SUM = sum(WEIGHTS_AS_BRIEFED.values())          # 1.08
WEIGHTS = {k: round(v / _BRIEFED_SUM, 6)
           for k, v in WEIGHTS_AS_BRIEFED.items()}
# Rounding eight weights to six places leaves a residue of a couple of
# millionths. The heaviest component absorbs it, so the table in the wire adds
# to exactly 1.0 and a reader checking the arithmetic finds it correct.
_HEAVIEST = max(WEIGHTS, key=lambda k: WEIGHTS[k])
WEIGHTS[_HEAVIEST] = round(WEIGHTS[_HEAVIEST] + (1.0 - sum(WEIGHTS.values())), 6)

STANDOUT_BONUS = 0.15
# The bonus rewards a beach that is exceptional in ONE physical way, so it is
# read off the physical components only.
#
# Not acclaim: "the most talked about beach in its own country" is true of one
# beach in every country including the landlocked ones, and paying a bonus for
# it put an Austrian lake lido above a Cypriot cove on the first ranked page.
# Not water: an Excellent bathing class is the common case, not a distinction.
# Not comfort: a car park is not a reason to cross Europe.
# Not photo beauty: it is a fame signal wearing a different hat, see below.
#
# v2 adds `space`, per the brief: a four kilometre strand is exceptional in a
# physical way, and so is a pocket cove that scores low on it while scoring
# high on wildness.
STANDOUT_ON = ("setting", "sand", "wildness", "space")

# Score bands, in the Michelin idiom the rest of the app already speaks
# (see rating_layer.py TIER_CUTOFFS). Beaches are scored on their own scale,
# so these cutoffs are the beach scale's, published in the wire meta.
TIER_CUTOFFS = {1: 6.4, 2: 7.6, 3: 8.6}

WATER_VALUE = {"Excellent": 1.0, "Good": 0.7, "Sufficient": 0.35, "Poor": 0.0}
WATER_DEFAULT = 0.62          # what an unmeasured beach is worth, not zero

SURFACE_VALUE = {
    "sand": 0.80, "fine_gravel": 0.62, "gravel": 0.55, "pebblestone": 0.58,
    "pebbles": 0.58, "shingle": 0.55, "shells": 0.6, "rock": 0.38,
    "grass": 0.35, "concrete": 0.15, "wood": 0.2, "dirt": 0.3, "mud": 0.1,
}
SURFACE_LABEL = {
    "sand": "sand", "fine_gravel": "fineGravel", "gravel": "gravel",
    "pebblestone": "pebble", "pebbles": "pebble", "shingle": "shingle",
    "shells": "shells", "rock": "rock", "concrete": "concrete",
    "grass": "grass", "dirt": "dirt", "mud": "mud", "wood": "wood",
}

BUILT_TAGS = ("hotel", "apartment", "guest_house", "hostel", "restaurant",
              "bar", "cafe", "ice_cream")

# How close the nearest protected area has to be before this beach counts as
# part of it. The cache holds CENTROIDS, not polygons, so "inside" can never be
# proved from it: what these numbers buy is a claim that stays true anyway. A
# national park is large, so a centroid 3 km off still means this coast; a
# nature reserve at 3 km is a different place entirely. The enrich stage keeps
# everything within 6 km, and the filtering happens here so the distance stays
# in the cache for a later model to use.
PARK_CLAIM_KM = 3.0
RESERVE_CLAIM_KM = 1.5


def protected_of(beach):
    """The protected area this beach can honestly be said to belong to, or {}."""
    area = beach.get("protected_area") or {}
    if not area.get("name"):
        return {}
    limit = PARK_CLAIM_KM if area.get("national_park") else RESERVE_CLAIM_KM
    return area if (area.get("km") or 0) <= limit else {}


def _sat(x, k):
    """Diminishing returns, (0..inf) -> (0..1). k is the value scoring ~0.63."""
    return 1.0 - math.exp(-x / k) if x > 0 else 0.0


def _facts(beach):
    return set((beach.get("article") or {}).get("facts") or [])


def _ctx(beach):
    return beach.get("context") or {}


def _tags(beach):
    return beach.get("osm_tags") or {}


# ---------------------------------------------------------------------------
# Components
# ---------------------------------------------------------------------------

def setting_component(beach):
    ctx, facts = _ctx(beach), _facts(beach)
    area = protected_of(beach)
    points = 0.0
    if ctx.get("cliff") or "cliffs" in facts:
        points += 0.55
    if ctx.get("cave_entrance") or "cave" in facts:
        points += 0.22
    if ctx.get("arch") or "arch" in facts:
        points += 0.22
    if ctx.get("dune") or "dunes" in facts:
        points += 0.28
    if ctx.get("wood") or ctx.get("forest") or "pines" in facts:
        points += 0.26
    if "lagoon" in facts:
        points += 0.30
    if "island" in facts or any("island" in p.lower() or "isola" in p.lower()
                                for p in beach.get("part_of") or []):
        points += 0.18
    if ctx.get("reef"):
        points += 0.12
    if ctx.get("viewpoint"):
        points += 0.14
    if ctx.get("lighthouse"):
        points += 0.12
    if ctx.get("historic"):
        points += 0.10
    if area:
        points += 0.45 if area.get("national_park") else 0.28
    elif beach.get("protected") or "protected" in facts:
        points += 0.22
    if "turtles" in facts:
        points += 0.15
    return round(min(1.0, _sat(points, 0.85)), 4)


def sand_component(beach):
    facts, tags = _facts(beach), _tags(beach)
    surface = (tags.get("surface") or "").split(";")[0].strip().lower()
    value = SURFACE_VALUE.get(surface)
    if value is None:
        # No survey. The article usually says, and if nothing says, a beach is
        # assumed to be an ordinary sandy one rather than penalised for the
        # gap.
        if "pebble" in facts:
            value = 0.58
        elif "rocky" in facts:
            value = 0.40
        elif "sand" in facts:
            value = 0.72
        else:
            value = 0.60
    if "white_sand" in facts:
        value += 0.20
    if "pink_sand" in facts:
        value += 0.24
    if "black_sand" in facts:
        value += 0.16
    if "golden_sand" in facts:
        value += 0.12
    if "turquoise" in facts:
        value += 0.20
    if "clear_water" in facts:
        value += 0.14
    if "shallow" in facts:
        value += 0.05
    return round(min(1.0, value), 4)


def water_component(beach, country_default=WATER_DEFAULT):
    """The bathing class, or None where no source can answer at all.

    Three outcomes, not two, and the third is the v2 change. A beach with a
    reading scores it. A beach with no reading in a country the register
    covers scores its country's median, because no reading is not a bad
    reading and a wild cove must not be punished for being wild. A beach in a
    country NO register covers (Norway, Iceland, the non-Albania Balkans,
    Turkey) returns None: the component is dropped and the remaining weights
    are renormalised.

    That third case used to score WATER_DEFAULT, which quietly handed every
    Norwegian beach the same 0.62 that a genuinely unmeasured Italian cove
    earned by sitting among measured neighbours. One is an inference from
    data, the other is a number nobody earned (invariant 9)."""
    water = beach.get("water") or {}
    grade = WATER_VALUE.get(water.get("class"))
    if grade is None:
        if country_default is None:
            return None
        return round(country_default, 4)
    # A beach that has just come up a class, or just gone down one, is worth
    # half a step either way: the class is a four season rolling window, so
    # the direction is real information about this season.
    prev = WATER_VALUE.get(water.get("class_prev"))
    if prev is not None and prev != grade:
        grade += 0.05 if grade > prev else -0.05
    return round(max(0.0, min(1.0, grade)), 4)


def measured(beach):
    """True when the Overpass ground truth pass has run for this beach.

    `context: {}` means it ran and found nothing within 400 m, which is a real
    and useful answer. A MISSING context means nobody looked, and the two must
    not score the same: counting zero hotels around a beach nobody surveyed
    would hand every unmeasured beach a perfect wildness score and quietly
    rank the whole unsurveyed tail above the surveyed one."""
    return beach.get("context") is not None


# What an unmeasured beach is worth on the two components that are read off
# the ground. Neutral, not generous, for the same reason WATER_DEFAULT is the
# country median rather than zero: no reading is not a reading.
WILDNESS_DEFAULT = 0.60
COMFORT_DEFAULT = 0.35


def wildness_component(beach):
    ctx, facts, tags = _ctx(beach), _facts(beach), _tags(beach)
    if not measured(beach):
        value = WILDNESS_DEFAULT
        if "boat_only" in facts or tags.get("access") == "no":
            value += 0.25
        if "quiet" in facts:
            value += 0.12
        if "busy" in facts:
            value -= 0.20
        return round(max(0.0, min(1.0, value)), 4)
    built = sum(ctx.get(t, 0) for t in BUILT_TAGS)
    value = 1.0 - _sat(built, 4.0)
    if ctx.get("marina"):
        value -= 0.12
    if ctx.get("camp_site"):
        value -= 0.05
    if "boat_only" in facts or tags.get("access") == "no":
        value += 0.22
    if "steps" in facts or "hike_in" in facts:
        value += 0.12
    if "quiet" in facts:
        value += 0.10
    if "busy" in facts:
        value -= 0.18
    if ctx.get("parking"):
        value -= 0.06
    return round(max(0.0, min(1.0, value)), 4)


def comfort_component(beach):
    ctx, tags = _ctx(beach), _tags(beach)
    if not measured(beach):
        # The OSM tags on the beach itself still count: they were surveyed by
        # somebody, they are just not the 400 m sweep.
        value = COMFORT_DEFAULT
        if tags.get("supervised") == "yes" or tags.get("lifeguard") == "yes":
            value += 0.18
        if tags.get("wheelchair") in ("yes", "designated", "limited"):
            value += 0.14
        return round(min(1.0, value), 4)
    value = 0.0
    if ctx.get("parking"):
        value += 0.24
    if ctx.get("toilets"):
        value += 0.18
    if ctx.get("shower"):
        value += 0.14
    if ctx.get("drinking_water"):
        value += 0.08
    if any(ctx.get(t) for t in ("cafe", "restaurant", "bar", "ice_cream")):
        value += 0.18
    if tags.get("supervised") == "yes" or tags.get("lifeguard") == "yes":
        value += 0.18
    if tags.get("wheelchair") in ("yes", "designated", "limited"):
        value += 0.14
    return round(min(1.0, value), 4)


# How long a beach has to be before `space` is worth anything, and the point
# at which more length stops adding. A beach shorter than 25 m is a landing
# spot; the reference is the stretch's own median, so a component that reads
# "roomy for this coast" rather than "long in absolute metres" (the Norwegian
# fjord and the Costa de la Luz are not the same product and must not share a
# yardstick).
SPACE_MIN_M = 25
SPACE_MAX_M = 60000        # beyond this the reading is a digitising error
SPACE_FALLBACK_REF_M = 900


def space_component(beach, reference_m=None):
    """How much beach there is, normalised inside its own coastal stretch.

    New in v2. Nothing in v1 could tell a four kilometre strand from a sixty
    metre pocket cove, and they are different products bought for different
    reasons. It doubles as a crowding proxy: a high `space` next to a low
    `comfort` is the arithmetic of "you will have it to yourself".

    Returns None when the geometry never said, which drops the component and
    renormalises rather than scoring an unmeasured beach as though it were
    tiny (invariant 6). Most Wikidata-only rows and every EEA spine row with
    no OSM polygon behind it land here, and they are not small, they are
    unmeasured."""
    length = beach.get("length_m")
    try:
        length = float(length)
    except (TypeError, ValueError):
        return None
    if not (SPACE_MIN_M <= length <= SPACE_MAX_M):
        return None
    reference = reference_m or SPACE_FALLBACK_REF_M
    # Diminishing returns against the stretch's own median: the median beach
    # on this coast scores 0.63, twice the median 0.86, and a cove a fifth of
    # it 0.18. No cliff anywhere, so one metre never moves a band.
    return round(min(1.0, _sat(length, reference)), 4)


# Photo beauty is capped exactly as fame is, and for exactly the same reason.
# A place that photographs well is genuinely a better beach day, which is what
# earns the component its 0.06. But how MANY good photographs exist of a beach
# is a popularity signal wearing a different hat, so the component reads the
# MEAN of the best few rather than the count, and it is clamped.
PHOTO_TOP_N = 3
PHOTO_CAP = 0.9


def photo_component(beach):
    """The mean beauty of this beach's best PHOTO_TOP_N photographs.

    The scores come from the photo engine (pipeline/photos/selection.py,
    photo_rank_v1), which wrote them onto the cached image records, so this
    reads what is already there and never re-derives anything.

    Returns None when the beauty engine has not run over this row, which is
    the honest answer: a beach whose gallery predates the engine has not been
    judged ugly, it has not been judged."""
    scores = [i.get("beauty") for i in (beach.get("images") or [])
              if isinstance(i.get("beauty"), (int, float))
              and not i.get("vetoed")]
    if not scores:
        return None
    scores.sort(reverse=True)
    best = scores[:PHOTO_TOP_N]
    return round(min(PHOTO_CAP, sum(best) / len(best)), 4)


def fame_raw(beach):
    """One number for "how much attention has this beach had", before any
    normalisation. Sitelinks and pageviews are Wikipedia's answer; the count
    of freely licensed photographs taken here is everybody else's."""
    sitelinks = beach.get("sitelinks") or 0
    views = beach.get("views60") or 0
    photos = len(beach.get("images") or [])
    return math.log1p(sitelinks * 2.5 + views / 25.0 + photos * 2.0)


def acclaim_component(beach, country_max, global_max):
    """60 per cent how it stands at home, 40 per cent how it stands in Europe.

    Both halves are already log scaled by fame_raw, and both are normalised
    against a maximum rather than a mean so one runaway beach compresses the
    field instead of stretching it."""
    raw = fame_raw(beach)
    home = raw / country_max if country_max > 0 else 0.0
    europe = raw / global_max if global_max > 0 else 0.0
    value = 0.6 * home + 0.4 * europe
    tags = _tags(beach)
    if tags.get("blue_flag") == "yes" or "blue_flag" in _facts(beach):
        value += 0.10
    if "famous_photo" in _facts(beach):
        value += 0.12
    return round(max(0.0, min(1.0, value)), 4)


def score_beach(beach, country_max, global_max, water_default=WATER_DEFAULT,
                space_reference=None):
    """(components, 0..1, 0..10) for one beach.

    Components that returned None are DROPPED and the surviving weights are
    renormalised over what is left (invariant 6). That is what lets a
    Norwegian beach with no bathing register, no digitised polygon and no
    beauty-ranked gallery still be scored on the five components it does
    have, instead of being handed three zeroes nobody measured and sinking
    below every Italian lido."""
    comps = {
        "setting": setting_component(beach),
        "acclaim": acclaim_component(beach, country_max, global_max),
        "water": water_component(beach, water_default),
        "sand": sand_component(beach),
        "wildness": wildness_component(beach),
        "comfort": comfort_component(beach),
        "space": space_component(beach, space_reference),
        "photo": photo_component(beach),
    }
    present = {k: v for k, v in comps.items() if v is not None}
    budget = sum(WEIGHTS[k] for k in present)
    if budget <= 0:
        return {}, 0.0, 0.0
    base = sum(WEIGHTS[k] * present[k] for k in present) / budget
    # The standout bonus reads only components that were actually measured.
    # Paying it on a dropped one would be paying for a reading nobody took.
    physical = [present[k] for k in STANDOUT_ON if k in present]
    standout = max(physical) if physical else 0.0
    score01 = min(1.0, base + STANDOUT_BONUS * standout)
    return present, round(score01, 4), round(10.0 * score01, 1)


def tier_for(score10, cutoffs=TIER_CUTOFFS):
    if score10 >= cutoffs[3]:
        return 3
    if score10 >= cutoffs[2]:
        return 2
    if score10 >= cutoffs[1]:
        return 1
    return 0


# ---------------------------------------------------------------------------
# Reasons: why this beach scored what it scored, as codes the app can speak
#
# Order is narrative order, not importance order: what it is, then what is
# around it, then the water, then how you get there, then what is on it, then
# what it is known for. The app renders the first REASON_MAX of them as a
# paragraph, so anything appended late is what gets cut.
# ---------------------------------------------------------------------------

REASON_MAX = 8

# The size bands the brief's Size facet is cut at: a cove under 200 m, a long
# strand over 2 km, an ordinary beach in between. Bands rather than metres,
# because "is it a cove or a strand" is the question a reader actually has
# and 340 m is not an answer to it.
COVE_MAX_M = 200
STRAND_MIN_M = 2000


def size_band(beach):
    """cove | beach | strand, or "" when the geometry never said."""
    length = beach.get("length_m")
    try:
        length = float(length)
    except (TypeError, ValueError):
        return ""
    if not (SPACE_MIN_M <= length <= SPACE_MAX_M):
        return ""
    if length <= COVE_MAX_M:
        return "cove"
    if length >= STRAND_MIN_M:
        return "strand"
    return "beach"


# How far off due west the shore may face and still be sold as a sunset
# beach. Plus or minus 50 degrees covers the sun's own swing between the
# solstices at European latitudes, so a beach that watches the sun go down in
# July still qualifies in October.
SUNSET_TOLERANCE_DEG = 50


def _surface_code(beach):
    surface = (_tags(beach).get("surface") or "").split(";")[0].strip().lower()
    if surface in SURFACE_LABEL:
        return SURFACE_LABEL[surface]
    facts = _facts(beach)
    if "pebble" in facts:
        return "pebble"
    if "rocky" in facts:
        return "rock"
    if "sand" in facts:
        return "sand"
    return ""


def reasons_for(beach, comps):
    """[{k, ...params}] in the order they should be read."""
    ctx, facts, tags = _ctx(beach), _facts(beach), _tags(beach)
    area = protected_of(beach)
    water = beach.get("water") or {}
    out = []

    def add(code, **params):
        out.append(dict(k=code, **params))

    # 1. What it is made of, and what colour that is.
    colour = ("white" if "white_sand" in facts else
              "pink" if "pink_sand" in facts else
              "black" if "black_sand" in facts else
              "golden" if "golden_sand" in facts else "")
    surface = _surface_code(beach)
    if colour:
        add("sandColour", colour=colour, surface=surface or "sand")
    elif surface:
        add("surface", surface=surface)

    # 2. What stands around it.
    if ctx.get("cliff") or "cliffs" in facts:
        add("cliffs")
    if ctx.get("dune") or "dunes" in facts:
        add("dunes")
    if ctx.get("wood") or ctx.get("forest") or "pines" in facts:
        add("pines")
    if "lagoon" in facts:
        add("lagoon")
    if ctx.get("cave_entrance") or "cave" in facts:
        add("cave")
    if ctx.get("arch") or "arch" in facts:
        add("arch")
    if ctx.get("lighthouse"):
        add("lighthouse")
    if ctx.get("historic") and not ctx.get("cave_entrance"):
        add("historic")
    if "shipwreck" in facts:
        add("shipwreck")

    # 3. The water.
    if water.get("class") in WATER_VALUE:
        add("water" + water["class"], site=water.get("site") or "")
    if "turquoise" in facts:
        add("turquoise")
    elif "clear_water" in facts:
        add("clearWater")
    if "shallow" in facts:
        add("shallow")

    # 4. Protection and wildlife.
    if area.get("national_park"):
        add("nationalPark", name=area.get("name") or "")
    elif area.get("name"):
        add("reserve", name=area["name"], kind=area.get("kind") or "")
    if "turtles" in facts:
        add("turtles")

    # 5. Getting there, and what that keeps out.
    if "boat_only" in facts:
        add("boatOnly")
    elif "steps" in facts:
        add("steps")
    elif "hike_in" in facts:
        add("hikeIn")
    built = sum(ctx.get(t, 0) for t in BUILT_TAGS)
    # "Nothing is built on it" is a claim about the ground, so it may only be
    # made where the ground was actually swept. On an unmeasured beach the
    # same code would have printed it for every beach in Europe.
    if measured(beach) and built == 0 and not ctx.get("parking"):
        add("undeveloped")
    elif measured(beach) and built >= 12:
        add("resortStrip", n=built)
    elif "quiet" in facts:
        add("quiet")

    # 6. What is on it.
    services = [name for name, present in (
        ("parking", ctx.get("parking")), ("toilets", ctx.get("toilets")),
        ("showers", ctx.get("shower")),
        ("food", any(ctx.get(t) for t in ("cafe", "restaurant", "bar",
                                          "ice_cream"))),
    ) if present]
    if services:
        add("services", list=",".join(services), n=len(services))
    if tags.get("supervised") == "yes" or tags.get("lifeguard") == "yes":
        add("lifeguard")
    if tags.get("nudism") in ("yes", "designated", "customary") or "nudist" in facts:
        add("nudist")
    if tags.get("wheelchair") in ("yes", "designated"):
        add("wheelchair")

    # 7. What it is known for.
    sitelinks = beach.get("sitelinks") or 0
    if sitelinks >= 8:
        add("wikiFame", n=sitelinks)
    if "famous_photo" in facts:
        add("photographed")
    if tags.get("blue_flag") == "yes" or "blue_flag" in facts:
        add("blueFlag")
    if "snorkel" in facts:
        add("snorkel")
    if "surf" in facts:
        add("surf")
    if "sunset" in facts:
        add("sunset")
    # Wikidata's P2043 carries a unit we do not read, so "As Catedrais, 2"
    # means two kilometres and would have shipped as "it runs 2 m along the
    # shore". Anything outside what a beach can plausibly be in metres is
    # dropped rather than guessed at.
    length = beach.get("length_m") or 0
    if 60 <= length <= 30000:
        add("length", m=int(length))

    # 8. What v2 added. These come last on purpose: REASON_MAX cuts the
    # paragraph at eight, and a beach with a cliff, a lagoon and turquoise
    # water should spend those eight on the cliff, not on its aspect.
    band = size_band(beach)
    if band == "strand":
        add("long_strand")
    elif band == "cove":
        add("pocket_cove")
    # "You can watch the sun go down from the sand" is a real reason to pick
    # one beach over the next one along the same coast, and it is computed
    # from the shore's own bearing rather than claimed (pipeline/beaches/
    # coastline.py). Only ever emitted for a sea beach: a lake shore facing
    # west is facing the other side of the lake.
    if beach.get("sunset_facing") and beach.get("coastal", True):
        add("sunset_facing")
    # The honest sentence for a beach in a country no bathing water register
    # reaches. It is not "the water is unknown quality", it is "nobody
    # publishes a reading here", and the component was dropped rather than
    # guessed (invariant 9).
    if not (beach.get("water") or {}).get("class") and beach.get("no_water_source"):
        add("water_unknown_no_source")
    prot = beach.get("protection") or {}
    if prot.get("natura2000"):
        add("natura2000", name=prot.get("name") or "")
    elif prot.get("emerald"):
        add("emerald", name=prot.get("name") or "")
    return out


HIGHLIGHT_ORDER = [
    "boatOnly", "cliffs", "turquoise", "lagoon", "sandColour", "dunes",
    "nationalPark", "undeveloped", "cave", "arch", "waterExcellent", "pines",
    "shipwreck", "turtles", "sunset_facing", "long_strand", "pocket_cove",
    "natura2000", "emerald", "nudist", "snorkel", "surf", "blueFlag",
    "lifeguard", "steps", "hikeIn", "quiet", "shallow", "reserve",
]


def highlights_for(reasons):
    """The three or four codes that go on the card, in a fixed order so a list
    of cards reads consistently rather than in whatever order the reasons
    happened to come out."""
    have = {r["k"]: r for r in reasons}
    out = []
    for code in HIGHLIGHT_ORDER:
        if code in have and len(out) < 4:
            out.append(have[code])
    return out


# Every rule reads components through .get(). Since v2 a component that was
# never measured is ABSENT from the dict rather than defaulted, so indexing
# one directly raises on exactly the rows the drop-and-renormalise rule was
# written to protect: a Norwegian beach has no `water` key at all.
BEST_FOR_RULES = (
    ("scenery", lambda c, r: c.get("setting", 0) >= 0.6),
    ("swimming", lambda c, r: c.get("water", 0) >= 0.9 and "shallow" in r),
    ("families", lambda c, r: c.get("comfort", 0) >= 0.55 and ("shallow" in r
                                                               or "lifeguard" in r)),
    ("seclusion", lambda c, r: c.get("wildness", 0) >= 0.85),
    ("snorkelling", lambda c, r: "snorkel" in r or "clearWater" in r
     or "turquoise" in r),
    ("surfing", lambda c, r: "surf" in r),
    ("naturism", lambda c, r: "nudist" in r),
    ("walkers", lambda c, r: "hikeIn" in r or "steps" in r or "long_strand" in r),
    # The brief's Best-for facet names Sunset explicitly, and it is the one
    # entry on that list nothing in v1 could answer.
    ("sunset", lambda c, r: "sunset_facing" in r or "sunset" in r),
)


def best_for(comps, reasons):
    codes = {r["k"] for r in reasons}
    return [name for name, rule in BEST_FOR_RULES if rule(comps, codes)][:3]


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------

def slugify(text):
    folded = unicodedata.normalize("NFKD", (text or "").lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    folded = folded.replace("ł", "l").replace("ß", "ss")
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", folded)).strip("-")


def beach_id(beach):
    """Stable across runs: the country, the name, and the source id that made
    it unique. A saved favourite must survive a re-harvest."""
    tail = beach.get("wd") or (beach.get("osm_id") or "").replace("/", "")
    return f"{beach['iso2'].lower()}-{slugify(beach['name'])[:36]}-{tail}".strip("-")
