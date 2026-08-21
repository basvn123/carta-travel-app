"""The mountain index: what "one of the best mountains in Europe" means here,
written down so it can be argued with.

The research this layer was built from makes one point louder than the rest:
rank by attention alone and you get the mountains that are already on every
itinerary, rank by height alone and you get a list that says the Netherlands
has nothing and that a 3,000 m rubble heap beats the Old Man of Storr. Both
are true statements about numbers and useless answers to the question a
traveller is actually asking, which is "which mountain should I go and look
at, and can I get up it".

So this model computes FIVE components that stand on their own, and only then
a combined score for the ordering of a list.

  scenery    0.26  what it looks like and what stands around it. Shape first
                   (a spire, a wall, a horn, a volcano, a sea cliff), then
                   the setting: glacier, lake underneath, national park,
                   forest, the sea. The biggest weight, because it is what
                   people mean by a beautiful mountain and it is the hardest
                   thing for a mountain to fake.
  access     0.22  can you actually get up it. A cable car, funicular, rack
                   railway or road to the top scores at the ceiling; a
                   waymarked path most of the way scores well; a glaciated
                   alpine route scores low and is SAID to, rather than
                   quietly ranking low for no visible reason. The brief asks
                   for this weight explicitly: a gondola served 2,000 m
                   viewpoint is a better answer for a general audience than a
                   technical 3,000 m summit, and this is the term that says so.
  acclaim    0.20  fame, capped and split: 60 per cent standing at home, 40
                   per cent standing in Europe, both log scaled. Splitting it
                   is what stops Switzerland and Italy, which have far more
                   written about mountains than Latvia, from filling every page.
  stature    0.18  the objective salience the brief calls the backbone:
                   prominence first (it is what says a summit is its own
                   mountain rather than a bump on somebody else's ridge),
                   then isolation, then height measured against the tallest
                   thing in the SAME country, so a Danish cliff is measured
                   against Denmark.
  experience 0.14  what is up there when you arrive: a viewpoint or a
                   skywalk, a summit restaurant, a hut, an observatory, a
                   summit cross, a via ferrata, a cave, wildlife, a film
                   somebody has seen. The reason to stay twenty minutes.

Plus a standout bonus (0.15 of the strongest of scenery, access and
experience), so a mountain that is exceptional in exactly one way still ranks:
a rope-only spire with no facilities should not lose to an adequate ski
mountain that scores 0.5 on everything.

And a hidden gem term. `gem_score` is the residual: how much better this
mountain is than its own fame predicts. It never moves the ranking; it is
published so the app can offer the mountains a fame ranking would bury.

Every mountain comes out with the REASONS it scored: codes with parameters,
which the app turns into sentences in six languages (lib/mountainStory.js).
The codes are the audit trail. If a sentence is on the page, a field
somewhere put it there.

Safety, and it is the reason difficulty is a REASON rather than a number: the
brief is blunt that AI written route descriptions kill people, and that OSM's
sac_scale is misused often enough that a path tag cannot be read as "walkable".
Nothing here upgrades a difficulty or asserts a route exists. A summit with
glacier hazards says so, a cabled ridge says so, and the app tells the reader
to check locally.

ASCII clean, no em dashes, per project convention.
"""

import math
import re

MODEL_VERSION = "peak_index_v1"

WEIGHTS = {
    "scenery": 0.26,
    "access": 0.22,
    "acclaim": 0.22,
    "stature": 0.16,
    "experience": 0.14,
}

# A mountain that is exceptional in one way should rank, so the strongest of
# the three components a traveller chooses on pays a bonus.
STANDOUT_BONUS = 0.15
STANDOUT_ON = ("scenery", "access", "experience")

# The three shown on the card and the page as figures of their own.
SUB_SCORES = ("scenery", "access", "experience")

TIER_CUTOFFS = {1: 6.2, 2: 7.4, 3: 8.5}


# ---------------------------------------------------------------------------
# What kind of thing this is
# ---------------------------------------------------------------------------

KIND_PATTERNS = (
    ("volcano", r"\bvolcano|\bstratovolcan|\bcaldera|\bcinder cone|\bvulkan"),
    ("cliff", r"\bcliff|\bescarpment|\bsea cliff|\bheadland|\bpromontor"),
    ("rock", r"\brock formation|\bmonolith|\bsea stack|\bpinnacle|\btor\b|"
             r"\bbutte|\bmesa|\brock outcrop"),
    ("plateau", r"\bplateau|\btableland|\bhigh plain"),
    ("massif", r"\bmassif|\bmountain range|\bmountain chain|\bmountain group"),
    ("ridge", r"\bridge|\barete|\bcrest"),
    ("hill", r"\bhill\b|\bdune|\bdrumlin|\bmoraine|\bknoll|\bmound"),
    ("peak", r"\bmountain|\bsummit|\bpeak\b|\bnunatak"),
)
KIND_ORDER = ["volcano", "cliff", "rock", "plateau", "massif", "ridge",
              "hill", "peak"]


def kind_of(peak):
    """peak | volcano | massif | ridge | plateau | cliff | rock | hill.

    The seed decides where a human has looked at it, because "Preikestolen is
    a mountain" is technically defensible and reads as wrong. Otherwise the
    Wikidata classes decide, and elevation breaks the last tie: nothing under
    300 m is called a peak in this app."""
    seed = peak.get("seed") or {}
    if seed.get("kind") in KIND_ORDER:
        return seed["kind"]
    text = " ".join(peak.get("classes") or []).lower()
    for kind, pattern in KIND_PATTERNS:
        if re.search(pattern, text):
            if kind == "peak" and (peak.get("ele") or 0) < 300:
                return "hill"
            return kind
    return "hill" if (peak.get("ele") or 0) < 300 else "peak"


def _sat(x, k):
    """Saturating 0..1: x/(x+k). Half the value at x == k."""
    return x / (x + k) if x and x > 0 else 0.0


def _facts(peak):
    return set(peak.get("facts") or [])


def _osm(peak):
    return peak.get("osm") or {}


def _tags(peak):
    return (_osm(peak).get("tags") or {})


def _near(peak):
    return (_osm(peak).get("near") or {})


def _tag_count(peak, prefix):
    tags = _tags(peak)
    return sum(n for k, n in tags.items() if k.startswith(prefix))


def measured(peak):
    """Whether this row rests on measurements or on inference. Published, so
    the app can be honest about a mountain that carries only a name and a
    coordinate."""
    return bool(peak.get("ele") and (peak.get("prom") is not None
                                     or peak.get("iso_km") is not None))


# ---------------------------------------------------------------------------
# Access: the term the brief says to boost
# ---------------------------------------------------------------------------

SUMMIT_LIFT_M = 700          # a top station this close is this mountain's lift
NEAR_LIFT_M = 3000           # further out it is a lift on the mountain

LIFT_WORDS = {
    "cable_car": "cableCar", "gondola": "gondola", "funicular": "funicular",
    "rack": "rackRailway", "chairlift": "chairlift", "road": "road",
}


def lift_of(peak):
    """How you get up without climbing, and where that claim comes from.

    Three sources, kept apart on purpose and ranked by how much they know.

      osm       the aerialway geometry, with a distance from the summit. It
                knows exactly where the top station is and nothing at all
                about whether it runs in July.
      curated   the seed, where a human looked the mountain up because it is
                famous for being reachable.
      wiki      the article mentions a cable car or a funicular on this
                mountain. That is real evidence that lifts exist here and NO
                evidence that one reaches this summit, so it can only ever
                produce the weakest claim, "lifts on the mountain".

    The third exists because Overpass is the one source in this layer that is
    regularly unreachable, and a country enriched without it should still be
    able to say that Nebelhorn has a cable car."""
    seed = (peak.get("seed") or {}).get("lift") or ""
    near = _near(peak)
    tags = _tags(peak)
    facts = _facts(peak)
    lift_m = near.get("lift_m")
    rail_m = near.get("rail_m")
    has_rack = any(k.startswith("railway=rack") or k.startswith("railway=funicular")
                   for k in tags)
    kind, metres, src = "", None, ""

    if lift_m is not None and lift_m <= SUMMIT_LIFT_M:
        kind = "cableCar" if any(k.startswith("aerialway=cable_car") for k in tags) \
            else "gondola" if any(k.startswith("aerialway=gondola") for k in tags) \
            else "chairlift"
        metres, src = lift_m, "osm"
    elif has_rack and rail_m is not None and rail_m <= SUMMIT_LIFT_M:
        kind = "funicular" if any(k.startswith("railway=funicular") for k in tags) \
            else "rackRailway"
        metres, src = rail_m, "osm"
    elif seed:
        kind, src = LIFT_WORDS.get(seed, ""), "curated"
    elif lift_m is not None and lift_m <= NEAR_LIFT_M:
        kind, metres, src = "liftsNearby", lift_m, "osm"

    if not kind and seed:
        kind, src = LIFT_WORDS.get(seed, ""), "curated"
    if not kind and ("cable_car" in facts or "funicular" in facts):
        kind, src = "liftsNearby", "wiki"
    if not kind:
        return None
    out = {"kind": kind, "src": src}
    if metres is not None:
        out["m"] = metres
    name = (_osm(peak).get("names") or {})
    if kind in ("cableCar", "gondola", "chairlift", "liftsNearby") and name.get("lift"):
        out["name"] = name["lift"]
    if kind in ("funicular", "rackRailway") and name.get("rail"):
        out["name"] = name["rail"]
    return out


# How high each way up scores. A cable car to the top is the ceiling because
# it is the one that makes a mountain available to everybody: a family, a
# person who cannot walk far, a traveller with an afternoon.
LIFT_VALUE = {
    "cableCar": 1.0, "gondola": 1.0, "funicular": 0.97, "rackRailway": 0.97,
    "road": 0.88, "chairlift": 0.85, "liftsNearby": 0.55,
}

HARD_FACTS = {"climbing", "via_ferrata", "glacier"}


def access_component(peak):
    """0..1, how reachable the top is.

    A lift or a road at the top is most of the answer. Below that it is a
    question of what the walk is: a waymarked path is worth a lot, an
    unmarked scramble much less, and a glaciated route with a first ascent
    story is a mountaineering objective rather than a day out."""
    facts = _facts(peak)
    tags = _tags(peak)
    lift = lift_of(peak)
    score = 0.12
    if lift:
        score = max(score, LIFT_VALUE.get(lift["kind"], 0.5))
    if "road_to_top" in facts:
        score = max(score, 0.86)
    # An article that mentions a cable car is worth less than a top station on
    # the map, and the number has to agree with the sentence: lift_of() turns
    # the same evidence into the weakest claim there is, "lifts on the
    # mountain", so scoring it 0.9 here would have the page saying one thing
    # and the bar saying another.
    if "cable_car" in facts or "funicular" in facts:
        score = max(score, 0.6)

    # The walk, when there is no ride.
    if score < 0.6:
        if "hiking" in facts:
            score = max(score, 0.55)
        sac = [k.split("=", 1)[1] for k in tags if k.startswith("sac_scale=")]
        if sac:
            easy = {"hiking", "mountain_hiking"}
            if any(s in easy for s in sac):
                score = max(score, 0.5)
            else:
                score = max(score, 0.3)
        if _near(peak).get("hut_m") is not None:
            score = max(score, 0.42)
        if _near(peak).get("parking_m") is not None:
            score += 0.05

    # And then what makes it hard, subtracted rather than hidden.
    #
    # Only where the hard way is the ONLY way, and that qualification is the
    # difference between a useful number and a wrong one. The first version
    # subtracted the glacier and the altitude from every summit that had them
    # and put the Matterhorn 27th in Switzerland, behind a dozen ski hills,
    # because you cannot walk up it. But nobody goes to Zermatt to stand on
    # the summit: they ride to Gornergrat and look at it. Where a lift or a
    # road puts you on the mountain, the climbing grade is somebody else's
    # problem and this term stops pretending otherwise.
    if not lift and "road_to_top" not in facts:
        hard = facts & HARD_FACTS
        if "glacier" in hard:
            score -= 0.16
        if "climbing" in hard and "hiking" not in facts:
            score -= 0.12
        ele = peak.get("ele") or 0
        if ele > 3300:
            score -= 0.1
        elif ele > 2600:
            score -= 0.04
    # A floor rather than a zero. Every mountain in this layer can be walked
    # to the foot of, and "0 out of 10 for getting there" is a claim the data
    # does not support.
    return max(0.15, min(1.0, round(score, 3)))


# ---------------------------------------------------------------------------
# Scenery
# ---------------------------------------------------------------------------

# What the landform itself is worth before anything else is known about it.
#
# The dramatic kinds are rated up here because the rest of the model measures
# summits: prominence, isolation, height against the country. A sea cliff has
# almost no prominence by construction (Preikestolen rises 604 m straight out
# of a fjord and connects to a plateau), so if its shape does not pay, nothing
# does, and Norway's most photographed viewpoint ranks below a nameless 1,500 m
# bump with a big drop behind it.
SHAPE_VALUE = {
    "volcano": 0.34, "cliff": 0.34, "rock": 0.32, "ridge": 0.24,
    "peak": 0.16, "plateau": 0.16, "massif": 0.14, "hill": 0.04,
}


# What a human vouching for a mountain is worth to its beauty score. The seed
# is the one place somebody looked at a mountain and said it is worth the
# journey, and `why` records whether that came from the research brief this
# layer was built from or from an editorial addition.
CURATED_BONUS = {"brief": 0.30, "editorial": 0.18}

# Fame, folded back into beauty. Not circular reasoning and not laziness: the
# research this layer was built from spends a page on geotagged photograph
# density as a validated proxy for "scenicness", and the reason a mountain has
# 92 Wikipedia articles is usually that it looks like that. It is capped low
# enough that a famous ordinary hill cannot climb past a beautiful unknown one
# on this term alone.
FAME_TO_SCENERY = 0.15


def scenery_component(peak, acclaim=0.0):
    """0..1, what it looks like and what stands around it."""
    facts = _facts(peak)
    tags = _tags(peak)
    score = SHAPE_VALUE.get(kind_of(peak), 0.12)

    # Steepness, from the only two numbers that carry it. A summit whose
    # prominence is most of its height stands alone and reads as a mountain
    # from every side; one with 80 m of prominence is a shoulder.
    ele, prom = peak.get("ele") or 0, peak.get("prom")
    if prom and ele:
        score += 0.20 * min(1.0, prom / max(400.0, ele * 0.55))
    elif prom:
        score += 0.12 * _sat(prom, 500)

    if "glacier" in facts or any(k.startswith("natural=glacier") for k in tags):
        score += 0.14
    if "active_volcano" in facts:
        score += 0.08
    if any(k.startswith("natural=cliff") or k.startswith("natural=arete")
           for k in tags):
        score += 0.07
    if "limestone" in facts:
        score += 0.05                       # dolomite towers, karst walls
    if "lake_below" in facts:
        score += 0.07
    if "national_park" in facts or peak.get("parks") or \
            any(k.startswith("boundary=national_park") for k in tags):
        score += 0.09
    if "unesco" in facts:
        score += 0.06
    if "famous_photo" in facts:
        score += 0.12
    if _tag_count(peak, "natural=wood") > 2:
        score += 0.02
    # The sea underneath a mountain is worth as much as a glacier on top of
    # it, and nothing in Wikidata says so: a coastal summit is inferred from
    # the coast being within the OSM sweep.
    if "coastal" in facts:
        score += 0.05
    seed = peak.get("seed") or {}
    if seed:
        score += CURATED_BONUS.get(seed.get("why"), 0.10)
    score += FAME_TO_SCENERY * acclaim
    return max(0.0, min(1.0, round(score, 3)))


# ---------------------------------------------------------------------------
# Stature
# ---------------------------------------------------------------------------

def stature_component(peak, ele_max):
    """0..1, the objective salience: prominence, isolation, relative height."""
    score = 0.0
    prom = peak.get("prom")
    if prom is not None:
        score += 0.5 * min(1.0, math.log1p(prom) / math.log1p(1600))
    iso = peak.get("iso_km")
    if iso is not None:
        score += 0.2 * min(1.0, math.log1p(iso) / math.log1p(60))
    ele = peak.get("ele")
    if ele and ele_max:
        score += 0.3 * max(0.0, min(1.0, ele / ele_max))
    if peak.get("highpoint_of"):
        score = max(score, 0.55)
    if prom is None and iso is None and not peak.get("highpoint_of"):
        # Nothing measured beyond a height. Score it on that alone rather
        # than on a zero it did not earn.
        score = min(score + 0.1, 0.45)
    return max(0.0, min(1.0, round(score, 3)))


# ---------------------------------------------------------------------------
# Experience
# ---------------------------------------------------------------------------

EXPERIENCE_TAGS = (
    ("tourism=viewpoint", 0.16), ("man_made=tower", 0.1),
    ("man_made=observatory", 0.12), ("man_made=cross", 0.07),
    ("summit:cross=yes", 0.07), ("summit:register=yes", 0.04),
    ("amenity=restaurant", 0.12), ("amenity=cafe", 0.06),
    ("tourism=alpine_hut", 0.12), ("tourism=wilderness_hut", 0.06),
    ("natural=cave_entrance", 0.06), ("natural=hot_spring", 0.06),
    ("amenity=shelter", 0.03), ("tourism=attraction", 0.05),
)


def experience_component(peak):
    """0..1, what is up there when you arrive."""
    facts = _facts(peak)
    tags = _tags(peak)
    score = 0.0
    for key, value in EXPERIENCE_TAGS:
        if any(k == key or k.startswith(key) for k in tags):
            score += value
    if "viewpoint" in facts:
        score += 0.1
    if "restaurant" in facts:
        score += 0.08
    if "observatory" in facts:
        score += 0.06
    if "chapel" in facts:
        score += 0.05
    if "via_ferrata" in facts or any(k.startswith("via_ferrata_scale=")
                                     for k in tags):
        score += 0.08
    if "ski" in facts:
        score += 0.05
    if "film" in facts:
        score += 0.05
    if "wildlife" in facts:
        score += 0.04
    if "hut" in facts:
        score += 0.05
    return max(0.0, min(1.0, round(score, 3)))


# ---------------------------------------------------------------------------
# Acclaim
# ---------------------------------------------------------------------------

def fame_raw(peak):
    """One number for how much has been written about this mountain.

    Sitelinks and 60 day pageviews measure different things: a summit can
    have an article in nine languages because it is a national high point and
    twelve readers a month, or one article and forty thousand readers because
    it was on television. Both count, and the log keeps Mont Blanc from
    flattening the rest of the list."""
    sl = peak.get("sitelinks") or 0
    views = (peak.get("views_en") or 0) + 0.6 * (peak.get("views_local") or 0)
    return 0.6 * math.log1p(sl) / math.log1p(80) + \
        0.4 * math.log1p(views) / math.log1p(120000)


# What a human vouching for a mountain is worth to its FAME score, as a floor.
#
# Sitelinks and pageviews measure how much has been written, and the brief is
# explicit that this is where they fail: Segla, Reinebringen and Seceda are on
# every travel feed in Europe and carry the Wikidata footprint of a village
# church. The seed is the only signal in the layer that knows that, so a
# seeded row is never scored as unknown.
CURATED_FAME = {"brief": 0.50, "editorial": 0.40}


def acclaim_component(peak, country_max, global_max):
    """0..1, fame split 60 per cent at home and 40 per cent in Europe."""
    raw = fame_raw(peak)
    home = raw / country_max if country_max else 0.0
    away = raw / global_max if global_max else 0.0
    measured_fame = 0.6 * home + 0.4 * away
    seed = peak.get("seed") or {}
    floor = CURATED_FAME.get(seed.get("why"), 0.0) if seed else 0.0
    return max(0.0, min(1.0, round(max(measured_fame, floor), 3)))


# ---------------------------------------------------------------------------
# Hazards, and they are never inferred upward
# ---------------------------------------------------------------------------

HAZARD_ORDER = ["glacier", "crevasse", "altitude", "exposure", "via_ferrata",
                "rockfall", "volcanic", "gas", "weather", "wind", "navigation",
                "cold", "long_day", "lightning"]


def hazard_codes(peak):
    """What a person should know before setting off, from evidence only.

    The seed's hazards are a human's list and are kept whole. The machine adds
    only what a field says outright: a glacier in the article or on the map,
    an altitude over the standard AMS threshold, a via ferrata grade, a
    volcano that has erupted. Nothing here is a difficulty rating and nothing
    here replaces a local forecast, which is what the app says next to it."""
    codes = set((peak.get("seed") or {}).get("haz") or [])
    codes.update(peak.get("haz_seed") or [])
    facts = _facts(peak)
    tags = _tags(peak)
    ele = peak.get("ele") or 0
    if "glacier" in facts or any(k.startswith("natural=glacier") for k in tags):
        codes.add("glacier")
    if ele >= 2500:
        codes.add("altitude")
    if "via_ferrata" in facts or any(k.startswith("via_ferrata_scale=")
                                     for k in tags):
        codes.add("via_ferrata")
    if "active_volcano" in facts:
        codes.add("volcanic")
    if kind_of(peak) == "cliff":
        codes.add("exposure")
    if abs(peak.get("lat") or 0) >= 62 and ele >= 700:
        codes.add("weather")
    if "dangerous" in facts:
        codes.add("rockfall")
    sac = [k.split("=", 1)[1] for k in tags if k.startswith("sac_scale=")]
    if any(s in ("demanding_alpine_hiking", "difficult_alpine_hiking")
           for s in sac):
        codes.add("exposure")
    order = {code: i for i, code in enumerate(HAZARD_ORDER)}
    return sorted(codes, key=lambda c: (order.get(c, 99), c))


# ---------------------------------------------------------------------------
# The score
# ---------------------------------------------------------------------------

ACCESS_FACTS = {"cable_car", "funicular", "road_to_top", "hiking", "hut",
                "climbing", "via_ferrata", "glacier"}


def evidence_for(peak):
    """Which components this row has any evidence for at all.

    A component with no evidence is EXCLUDED and the remaining weights are
    renormalised. It is not scored zero, because zero is a claim: it says this
    mountain has nothing at the top, when the truth is that nobody asked.

    This is what makes the layer publishable without Overpass, which matters
    because Overpass is the one source here that is regularly unreachable. A
    country enriched without the access sweep ranks on scenery, renown and
    stature, and says so by simply not showing the other two figures. When the
    sweep lands later, a re-export re-ranks it.

    Stature is dropped the same way, and that one is about landforms rather
    than about sources. Wikidata records no elevation, no prominence and no
    isolation for Reinebringen, Segla or Stetind, because nobody has filled
    them in, and scoring them zero for "objective salience" put three of the
    most photographed viewpoints in Norway at 1.5 to 2.8 out of 10. Prominence
    is also simply the wrong axis for a sea cliff: Preikestolen rises 604 m
    out of a fjord and has almost none of it.
    """
    facts = _facts(peak)
    have = {"scenery", "acclaim"}
    if peak.get("osm"):
        have.add("experience")
    if peak.get("osm") or (peak.get("seed") or {}).get("lift") or (facts & ACCESS_FACTS):
        have.add("access")
    if (peak.get("ele") is not None or peak.get("prom") is not None
            or peak.get("iso_km") is not None or peak.get("highpoint_of")):
        have.add("stature")
    return have


def score_peak(peak, country_max, global_max, ele_max):
    have = evidence_for(peak)
    acclaim = acclaim_component(peak, country_max, global_max)
    comps = {
        "scenery": scenery_component(peak, acclaim),
        "access": access_component(peak),
        "acclaim": acclaim,
        "stature": stature_component(peak, ele_max),
        "experience": experience_component(peak),
    }
    comps = {k: v for k, v in comps.items() if k in have}
    total_weight = sum(WEIGHTS[k] for k in comps) or 1.0
    base = sum(WEIGHTS[k] * v for k, v in comps.items()) / total_weight
    standout_keys = [k for k in STANDOUT_ON if k in comps]
    standout = max((comps[k] for k in standout_keys), default=0.0)
    total = base + STANDOUT_BONUS * standout
    return comps, round(min(10.0, total * 10.0 / (1.0 + STANDOUT_BONUS)), 1)


def tier_for(score10, cutoffs=TIER_CUTOFFS):
    if score10 >= cutoffs[3]:
        return 3
    if score10 >= cutoffs[2]:
        return 2
    if score10 >= cutoffs[1]:
        return 1
    return 0


def quality_of(comps):
    """Everything except fame, renormalised over what was actually scored.

    Reads `comps` rather than WEIGHTS, because a row whose access and
    experience were excluded for want of evidence has no key for them."""
    keys = [k for k in comps if k != "acclaim"]
    weight = sum(WEIGHTS[k] for k in keys) or 1.0
    return sum(WEIGHTS[k] * comps[k] for k in keys) / weight


GEM_MAX_ACCLAIM = 0.55


def gem_score(comps, expected):
    """How much better this mountain is than its own fame predicts.

    Zero for anything already famous: a hidden gem that 40,000 people a month
    read about is not hidden, whatever the residual says."""
    if comps.get("acclaim", 0.0) > GEM_MAX_ACCLAIM:
        return 0.0
    return max(0.0, round(quality_of(comps) - expected, 3))


# ---------------------------------------------------------------------------
# The reasons
# ---------------------------------------------------------------------------

REASON_MAX = 10


def reasons_for(peak, comps):
    """The codes the app turns into sentences, best first.

    Every code is a fact with a field behind it. Nothing here is generated
    prose and nothing here is a judgement the numbers did not make."""
    out = []
    kind = kind_of(peak)
    out.append({"k": f"kind{kind[:1].upper()}{kind[1:]}"})

    ele = peak.get("ele")
    if ele:
        out.append({"k": "height", "m": int(round(ele))})
    if peak.get("highpoint_of"):
        out.append({"k": "highpoint", "of": peak["highpoint_of"][:60]})
    prom = peak.get("prom")
    if prom and prom >= 300:
        out.append({"k": "prominence", "m": int(round(prom))})
    if peak.get("range"):
        out.append({"k": "range", "name": peak["range"][:60]})

    lift = lift_of(peak)
    if lift:
        entry = {"k": "lift", "kind": lift["kind"], "src": lift["src"]}
        if lift.get("name"):
            entry["name"] = lift["name"]
        out.append(entry)

    facts = _facts(peak)
    tags = _tags(peak)
    names = _osm(peak).get("names") or {}
    near = _near(peak)

    if "glacier" in facts or any(k.startswith("natural=glacier") for k in tags):
        out.append({"k": "glacier"})
    if kind == "volcano":
        out.append({"k": "activeVolcano"} if "active_volcano" in facts
                   else {"k": "volcanic"})
    if any(k.startswith("tourism=viewpoint") for k in tags) or "viewpoint" in facts:
        out.append({"k": "viewpoint"})
    if any(k.startswith("amenity=restaurant") for k in tags) or "restaurant" in facts:
        out.append({"k": "summitFood"})
    if near.get("hut_m") is not None:
        entry = {"k": "hut"}
        if names.get("hut"):
            entry["name"] = names["hut"]
        out.append(entry)
    if any(k.startswith("man_made=observatory") for k in tags) or "observatory" in facts:
        out.append({"k": "observatory"})
    if any(k == "summit:cross=yes" for k in tags) or "chapel" in facts:
        out.append({"k": "summitCross"})
    ferrata = [k.split("=", 1)[1] for k in tags if k.startswith("via_ferrata_scale=")]
    if ferrata or "via_ferrata" in facts:
        entry = {"k": "viaFerrata"}
        if ferrata:
            entry["grade"] = sorted(ferrata)[-1][:6]
        out.append(entry)
    sac = sorted({k.split("=", 1)[1] for k in tags if k.startswith("sac_scale=")})
    if sac:
        out.append({"k": "graded", "scale": sac[0][:24], "n": len(sac)})
    elif "hiking" in facts:
        out.append({"k": "hiking"})
    if "climbing" in facts and "hiking" not in facts:
        out.append({"k": "climbersMountain"})
    if "ski" in facts or any(k.startswith("aerialway=drag_lift") for k in tags):
        out.append({"k": "ski"})
    park = names.get("park")
    if park:
        out.append({"k": "park", "name": park[:60]})
    elif peak.get("parks"):
        out.append({"k": "park", "name": peak["parks"][0][:60]})
    elif "national_park" in facts:
        out.append({"k": "protected"})
    if "unesco" in facts:
        out.append({"k": "unesco"})
    if "lake_below" in facts:
        out.append({"k": "lakeBelow"})
    if "wildlife" in facts:
        out.append({"k": "wildlife"})
    if "film" in facts:
        out.append({"k": "film"})
    if near.get("parking_m") is not None and not lift:
        out.append({"k": "parking", "m": near["parking_m"]})

    season = peak.get("season")
    if season and season.get("n", 12) < 12:
        out.append({"k": "season", "from": season["from"], "to": season["to"],
                    "n": season["n"], "est": True})

    sl = peak.get("sitelinks") or 0
    if sl >= 12:
        out.append({"k": "wikiFame", "n": sl})
    if (peak.get("seed") or {}).get("why") == "brief":
        out.append({"k": "curated"})
    return out[:REASON_MAX]


# ---------------------------------------------------------------------------
# The short labels the card shows
# ---------------------------------------------------------------------------

TAG_ORDER = ["lift", "viewpoint", "glacier", "activeVolcano", "volcanic",
             "summitFood", "viaFerrata", "hut", "park", "unesco", "ski",
             "lakeBelow", "observatory", "summitCross", "highpoint"]


def tags_for(reasons, limit=4):
    """The handful of reason codes that read as chips on a card."""
    have = {r["k"]: r for r in reasons}
    out = []
    for key in TAG_ORDER:
        if key in have:
            out.append(key)
        if len(out) >= limit:
            break
    return out


BEST_FOR_RULES = (
    ("view", lambda c, r: "lift" in r or "viewpoint" in r),
    ("walking", lambda c, r: "graded" in r or "hiking" in r),
    ("climbing", lambda c, r: "climbersMountain" in r or "viaFerrata" in r),
    ("photography", lambda c, r: c.get("scenery", 0) >= 0.62),
    ("families", lambda c, r: "lift" in r and c.get("access", 0) >= 0.85),
    ("wild", lambda c, r: "access" in c and c["access"] <= 0.35
        and c.get("scenery", 0) >= 0.5),
)


def best_for(comps, reasons):
    keys = {r["k"] for r in reasons}
    return [name for name, rule in BEST_FOR_RULES if rule(comps, keys)][:3]
