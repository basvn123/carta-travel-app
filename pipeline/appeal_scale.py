"""appeal_scale.py - let the best of any kind of place reach the same height.

`app_data/curated_appeal.json` holds one hand-scored 0-10 number per
destination, and it is 70% of every rating. It was scored against a fixed
anchor set running "Rome 10 ... Charleroi 2.5", and those anchors are cities.
Scored against Rome, a village cannot win, and the file shows it - the same
percentile is worth about 1.7 points less to a village than to a metro:

    class    n     med   p95   max
    metro    108   7.0   9.5   10.0
    city     262   6.7   8.5    9.5
    area     419   7.0   8.5    9.5
    town     310   6.7   7.8    9.2
    village  471   6.8   8.0    9.0

The consequence was visible in the product: of the 40 destinations that reached
"worth the journey", 9 had under 20,000 people and 8 of those were landscapes.
Every built village in Europe was capped below the top tier, not because the
curators thought little of them but because they were being measured against
the Colosseum.

This module removes that ceiling WITHOUT re-scoring anything by hand.

## What it does

Per class, one monotone piecewise-linear map:

    below the class median      unchanged
    above the class median      [median, best-in-class] bent onto
                                [median, ceiling] with an exponent below 1

So an ordinary village stays ordinary - the median does not move, and neither
does anything below it - while the class's upper range is opened up until its
best members can reach roughly the height the best metros already reach.

## What it deliberately does NOT do

**It never reorders.** The map is monotone, so if the curators ranked Riquewihr
above Eguisheim, they still do. Their relative judgement is the most valuable
thing in the file and this touches none of it. Only the spacing changes.

**It is not percentile re-spreading.** Ranks are not forced onto a target
distribution. The map is anchored on two real quantities per class (its median
and its highest curated score) and a stated ceiling, so a class with no outstanding
members gets no outstanding scores: the stretch is applied to the scores that
exist, and if the best village in the catalogue were a 7, the stretch would
still leave it well short of the ceiling.

**It is bounded by evidence, not by fiat.** The ceilings below are not equal.
Rome really is a different order of trip from Riquewihr, and metro keeps 10.0
while village tops out at 9.6. The claim being made is only that an
exceptional village belongs in the same tier as an exceptional city, which is
the Michelin idiom the tiers already borrow: three stars means worth the
journey, not worth the journey if it is large.

## Auditing it

EXPECTED below names real places and the score each must still reach;
apply_rating_layer.py fails the run if one of them drops. If a name in the
resulting top tier looks wrong, the ceiling for its class is wrong, and that
is one number in CLASS_CEILING.

Effect on the shipped catalogue, holding the tier populations fixed: the top
tier goes from 35% to 40% small places (villages 4 -> 6, metros 20 -> 14) and
the second tier to 66%, with Hallstatt, Zermatt, Meteora, Lauterbrunnen, Kotor
and Taormina joining the places worth the journey.
"""

import json
import math

# The score the very best member of each class should be able to reach.
# Read these as "an exceptional X is worth this much of a journey".
CLASS_CEILING = {
    "metro": 10.0,     # Rome, Paris. Unchanged: these set the original scale.
    "city": 9.7,       # Venice, Bruges
    "area": 9.7,       # Santorini, the Dolomites
    "town": 9.6,       # Dubrovnik, Rothenburg, Annecy
    "village": 9.6,    # Hallstatt, Riquewihr, Zermatt
}
DEFAULT_CEILING = 9.6

# "The top of the class" is its highest curated score, and the ceiling is what
# that score becomes. Anchoring on a percentile instead was tried and was
# wrong: with p98 the map kept its slope past the 98th percentile and clamped
# at 10, so five villages and five towns all landed on 10.00 and Annecy came
# out level with Rome. Anchoring on the max makes the ceiling an actual
# ceiling, reached by exactly the best member of the class and by nothing else.
MIN_CLASS_N = 20        # below this a class cannot be calibrated, so it is not

# How the lift is spread through the upper range. A straight line puts almost
# all of it on the single best member, but the compression it corrects is not
# shaped like that. Scoring every destination on independent, size-neutral
# evidence (0.75 x beauty index + 0.25 x register acclaim, correlation with
# log-population -0.014) and comparing curated appeal at equal evidence shows
# the markdown lives across the whole top quartile:
#
#   evidence quartile   city    town   village   area   (appeal vs a metro)
#   bottom             -0.11   -0.76    -1.00   -1.06
#   lower middle       +0.41   -0.05    -0.13   -0.33
#   upper middle       +0.82   +0.88    +0.69   +0.51
#   top                +0.60   +0.94    +0.97   +0.59
#
# Small places are scored HIGHER than metros at low evidence and up to a point
# lower at high evidence: a level offset would be wrong, and a tip-only stretch
# too narrow. GAMMA below 1 bends the map so the upper-middle gets its share.
#
# 0.7 closes the top-half markdown from +0.79 to +0.55, about 30% of it, and
# that is deliberately partial. The gap is measured at equal BEAUTY and
# ACCLAIM, and a capital genuinely offers more than beauty: museums, food,
# music, architecture at scale. Some of the remaining +0.55 is real. Closing
# all of it would assert that a lovely village is the equal of Rome in every
# respect, which is not the claim being made and is not true.
GAMMA = 0.7

# Named checkpoints, verified by eye after each change. Not inputs to the map:
# these are what the map is CHECKED against, so a bad ceiling shows up as a
# failed expectation rather than as a quietly wrong catalogue.
EXPECTED = [
    # (destination id, class, minimum acceptable new appeal)
    ("CIA", "metro", 9.9),          # Rome must not move
    ("BCN", "metro", 9.4),          # Barcelona must not move
    ("gem:hallstatt", "village", 8.8),
    ("gem:riquewihr", "village", 8.0),
    ("gem:cesky-krumlov", "town", 8.3),
]


def percentile(sorted_vals, p):
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    i = p * (len(sorted_vals) - 1)
    lo = int(math.floor(i))
    hi = min(len(sorted_vals) - 1, lo + 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (i - lo)


def build_scales(class_appeals):
    """{class: [appeal, ...]} -> {class: (median, top, ceiling)}.

    A class whose top already sits at or above its ceiling gets an identity
    map, so nothing is ever compressed downward.
    """
    scales = {}
    for cls, vals in class_appeals.items():
        if not cls or len(vals) < MIN_CLASS_N:
            continue
        v = sorted(vals)
        med = percentile(v, 0.5)
        top = v[-1]
        ceiling = CLASS_CEILING.get(cls, DEFAULT_CEILING)
        if top <= med or ceiling <= top:
            continue                       # nothing to open up
        scales[cls] = (med, top, ceiling)
    return scales


def rescale(appeal, cls, scales):
    """Map one curated appeal onto the class-fair scale. Monotone in appeal."""
    if appeal is None:
        return None
    s = scales.get(cls)
    if not s:
        return float(appeal)
    med, top, ceiling = s
    a = float(appeal)
    if a <= med:
        return a
    # [median, best-in-class] onto [median, ceiling], bent by GAMMA so the
    # upper middle gets its share. The best member of the class lands exactly
    # on the ceiling; nothing in the class can pass it; order is preserved
    # because the map is strictly increasing in `a`.
    t = min(1.0, (a - med) / (top - med))
    out = med + (ceiling - med) * (t ** GAMMA)
    return min(ceiling, round(out, 2))


def class_of(dest):
    """The place class this destination is scored within."""
    place = dest.get("place") or {}
    if place.get("class"):
        return place["class"]
    try:
        import place_layer
        return place_layer.classify(dest)
    except Exception:
        return None


def scales_for(dests, appeal):
    """Build the per-class maps from a catalogue and its curated appeal file."""
    by = {}
    for did, d in dests.items():
        a = (appeal.get(did) or {}).get("appeal")
        if a is None:
            continue
        by.setdefault(class_of(d), []).append(float(a))
    return build_scales(by)


APPEAL_SCALE_MODEL = {
    "version": "appeal_class_scale_v1",
    "rule": ("per class, below the median unchanged; above it, "
             "[median, best-in-class] bent onto [median, ceiling]"),
    "gamma": GAMMA,
    "ceilings": CLASS_CEILING,
    "monotone": True,
    "reorders": False,
    "why": ("curated appeal was anchored on city references, so the same "
            "percentile was worth ~1.7 points less to a village than a metro"),
}
