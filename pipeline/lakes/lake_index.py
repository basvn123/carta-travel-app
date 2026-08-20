"""The lake index: what "one of the best lakes in Europe" means here, written
down so it can be argued with.

The research this layer was built from makes one methodological point above
all the others: do not blend a lake into a single number and stop there.
A cold, stunning glacial tarn should rank at the top for scenery and near the
bottom for swimming, and a warm shallow reservoir with a sand beach should do
the opposite. A single "beauty" figure hides exactly the thing a traveller is
choosing between.

So this model computes THREE sub scores that stand on their own and are shown
on their own, plus three supporting components, and only then a combined score
for the ordering of a list.

  scenery   0.30  the landform and what stands around the water. Mountains and
                  relief, a glacial or volcanic origin, islands, forest to the
                  shore, cliffs, a waterfall, and whether the whole thing sits
                  inside a national park. The biggest weight, because it is
                  what people mean by a beautiful lake and it is the hardest
                  thing for a lake to fake.
  swimming  0.20  whether you can actually get in: the legal permission first
                  (see swim_rule, the one field in this layer that can hurt
                  somebody), then how warm it gets and for how long, whether
                  there is a shore to walk in from, and the hazards subtracted.
                  A lake where swimming is forbidden scores zero here and is
                  SAID to, rather than quietly ranking low for no visible
                  reason.
  activity  0.14  kayaks, sails, dive shops, boat trips, fishing, and a path
                  around the shore. What there is to DO when you are not in
                  the water, which for a lot of Europe's best lakes is the
                  whole visit.
  acclaim   0.18  fame, capped and split: 60 per cent standing at home, 40 per
                  cent standing in Europe, both log scaled. Splitting it is
                  what stops Italy and Switzerland, which have far more written
                  about lakes than Latvia, from filling every page.
  water     0.10  the EEA bathing season class from the Bathing Water
                  Directive, plus clarity. Audited, annual, and the only water
                  quality signal in Europe that is not somebody's opinion. A
                  lake with no nearby site scores the country's median rather
                  than a zero: no reading is not a bad reading.
  wildness  0.08  the anti-resort term. What is built within 800 m, subtracted,
                  with credit back for a lake you can only walk to.

Plus a standout bonus (0.15 of the strongest of scenery, swimming and
activity), so a lake that is exceptional in exactly one way still ranks. A
glacial tarn with no facilities and no bathing site should not lose to an
adequate town reservoir that scores 0.5 on everything.

And a hidden gem term. The brief's sharpest criticism of published lake lists
is that they rank by attention, which returns the lakes that are already on
every itinerary. `gem_score` is the residual: how much better this lake is
than its own fame predicts. It never moves the ranking; it is published so the
app can offer the lakes a fame ranking would bury.

Every lake also comes out with the REASONS it scored: codes with parameters,
which the app turns into sentences in six languages (lib/lakeStory.js). The
codes are the audit trail. If a sentence is on the page, a field somewhere put
it there.

ASCII clean, no em dashes, per project convention.
"""

import math
import re
import unicodedata

MODEL_VERSION = "lake_index_v1"

WEIGHTS = {
    "scenery": 0.30,
    "swimming": 0.20,
    "acclaim": 0.18,
    "activity": 0.14,
    "water": 0.10,
    "wildness": 0.08,
}
STANDOUT_BONUS = 0.15
# Read off the three components that describe the lake itself. Not acclaim
# ("the most talked about lake in its own country" is true of one lake in
# every country), not water (an Excellent class is the common case, not a
# distinction), not wildness (which is already a bonus for absence).
STANDOUT_ON = ("scenery", "swimming", "activity")

# The three the app shows as headline figures, in the order it shows them.
SUB_SCORES = ("scenery", "swimming", "activity")

TIER_CUTOFFS = {1: 6.3, 2: 7.5, 3: 8.5}

WATER_VALUE = {"Excellent": 1.0, "Good": 0.7, "Sufficient": 0.35, "Poor": 0.0}
WATER_DEFAULT = 0.62

# ---------------------------------------------------------------------------
# Kind: what sort of water body this is
#
# Decided from the Wikidata P31 labels, with the curated seed overriding,
# because "Lago di Bolsena" is typed as a lake and is a volcanic crater, and
# the crater is the interesting half.
# ---------------------------------------------------------------------------
KIND_PATTERNS = (
    ("geothermal", r"\b(thermal|geothermal|hot spring|spa)\b"),
    ("crater", r"\b(crater|volcanic|caldera|maar)\b"),
    ("tarn", r"\b(tarn|cirque|corrie|pleso|mountain lake|alpine lake)\b"),
    ("reservoir", r"\b(reservoir|dam|impound|barrage|stausee)\b"),
    ("lagoon", r"\b(lagoon|laguna|coastal lake|brackish)\b"),
    ("river", r"\b(river|watercourse|stream|waterfall)\b"),
    ("lake", r"\b(lake|loch|lough|glacial|oxbow|kettle|karst|salt lake)\b"),
)
KIND_ORDER = ["geothermal", "crater", "tarn", "reservoir", "lagoon", "river",
              "lake"]
# A tarn is a lake and so is a crater lake, so a lake in a national park at
# 2,000 m must not be called "a lake" when "a mountain tarn" is available.
# The first pattern that matches wins, which is why the table is ordered.


def kind_of(lake):
    seed = lake.get("seed") or {}
    if seed.get("kind"):
        return seed["kind"]
    text = " ".join(lake.get("types") or []).lower()
    for kind, pattern in KIND_PATTERNS:
        if re.search(pattern, text):
            return kind
    # Nothing in the types said. Height is the next best evidence: a small
    # water body above the tree line is a tarn whatever it was typed as.
    if (lake.get("elev_m") or 0) >= 1500 and (lake.get("area_km2") or 9) < 1.0:
        return "tarn"
    return "lake"


# ---------------------------------------------------------------------------
# Swimming permission. The one field that can hurt somebody.
#
# Resolution order, strongest evidence first. The rule is deliberately
# asymmetric: it takes a human or an explicit prohibition to say "no", and it
# takes an official designation or a mapped swimming place to say "yes".
# Everything else says "unknown", and the app renders that as "no rule
# recorded, check locally" rather than as an invitation.
# ---------------------------------------------------------------------------

SWIM_BAN_RE = re.compile(
    r"swimming is (?:strictly )?(?:prohibited|forbidden|banned|not (?:allowed|permitted))"
    r"|no swimming|bathing is (?:prohibited|forbidden|not allowed)"
    r"|swimming and (?:diving|boating) (?:are|is) (?:prohibited|forbidden)"
    r"|baden verboten|baignade interdite|prohibido el ba", re.I)
DRINKING_RE = re.compile(
    r"drinking water|water supply|potable water|trinkwasser|eau potable", re.I)


def swim_rule(lake):
    """(verdict, source). verdict is yes | limited | no | unknown."""
    seed = lake.get("seed") or {}
    if seed.get("swim"):
        return seed["swim"], "curated"

    tags = lake.get("osm_tags") or {}
    extract = (lake.get("article") or {}).get("swim_text") or ""
    facts = set((lake.get("article") or {}).get("facts") or [])
    designated = int((lake.get("water") or {}).get("sites") or 0)

    banned = (tags.get("swimming") == "no"
              or tags.get("access") in ("no", "private")
              or "swim_ban" in facts
              or bool(SWIM_BAN_RE.search(extract)))
    if banned:
        # A ban and an official bathing site both being true is not a
        # contradiction, it is a lake with a closed part and an open one.
        return ("limited" if designated else "no",
                "article" if not tags.get("swimming") else "osm")

    if designated:
        return "yes", "eea"
    if (tags.get("swimming") == "yes" or tags.get("sport") == "swimming"
            or (lake.get("context") or {}).get("swimming_area")
            or (lake.get("context") or {}).get("beach")):
        return "yes", "osm"
    if kind_of(lake) == "reservoir" and (DRINKING_RE.search(extract)
                                         or "drinking_water" in facts):
        return "limited", "article"
    return "unknown", ""


SWIM_VALUE = {"yes": 1.0, "limited": 0.55, "unknown": 0.4, "no": 0.0}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _sat(x, k):
    """Diminishing returns, (0..inf) -> (0..1). k is the value scoring ~0.63."""
    return 1.0 - math.exp(-x / k) if x > 0 else 0.0


def _facts(lake):
    return set((lake.get("article") or {}).get("facts") or [])


def _ctx(lake):
    return lake.get("context") or {}


def _tags(lake):
    return lake.get("osm_tags") or {}


def measured(lake):
    """True when the Overpass shore pass has run for this lake.

    `context: {}` means it ran and found nothing, which is a real answer. A
    MISSING context means nobody looked, and the two must not score the same:
    counting zero hotels around an unsurveyed lake would hand it a perfect
    wildness score and rank the whole unsurveyed tail above the surveyed one."""
    return lake.get("context") is not None


PARK_CLAIM_KM = 4.0        # a national park is large, a centroid 4 km off is it
RESERVE_CLAIM_KM = 2.0
# How far a NATIONAL PARK centroid may be and still count towards the setting
# without earning the sentence. The cache holds centroids, not polygons, and a
# large park's centroid is nowhere near its edge: the Lake District's is 20 km
# from Windermere, which sits squarely inside it. So proximity to a big park
# is taken as evidence about the landscape, which it is, while the claim "it
# lies inside X" stays gated on PARK_CLAIM_KM, because that one has to be true.
PARK_NEAR_KM = 16.0


def protected_of(lake):
    """The protected area this lake can honestly be said to be part of, or {}.

    The cache holds centroids, not polygons, so "inside" can never be proved
    from it. What these distances buy is a claim that stays true anyway."""
    area = lake.get("protected_area") or {}
    if not area.get("name"):
        return {}
    limit = PARK_CLAIM_KM if area.get("national_park") else RESERVE_CLAIM_KM
    return area if (area.get("km") or 0) <= limit else {}


def near_park(lake):
    """True when a national park centroid is close enough to say something
    about the landscape, but too far to claim the lake is inside it."""
    area = lake.get("protected_area") or {}
    if not area.get("national_park") or protected_of(lake):
        return False
    return (area.get("km") or 999) <= PARK_NEAR_KM


# ---------------------------------------------------------------------------
# The estimated swimming season
#
# There is no free, Europe wide, per lake water temperature series. ESA Lakes
# CCI and Copernicus Lake Surface Water Temperature cover the big lakes and
# need an account and a large download; the EEA reports quality, not warmth.
#
# So this is a MODEL, and it is labelled as one everywhere it appears. It
# takes the WorldClim monthly air normals already sampled at the lake's own
# coordinate (enrich_lakes.py) and applies four corrections.
#
#   thermal lag     a lake in June is still partly May's lake, and a DEEP lake
#                   is more of last month's lake than a shallow one, because
#                   there is more water to heat. Depth therefore moves the lag
#                   weight rather than subtracting degrees: it shifts WHEN a
#                   lake peaks, not how warm the surface gets. The first
#                   version of this had a flat depth penalty and put Lake
#                   Ohrid's peak at 19, which is four degrees under what
#                   anybody who has swum in it in August would say. A deep
#                   temperate lake stratifies, and the layer you swim in is
#                   the warm one.
#   solar gain      a surface in summer sun runs warmer than the air average,
#                   by up to about three degrees once the air is well above
#                   ten.
#   shallow bonus   under about twenty five metres there is little water to
#                   heat and the whole column warms, which is why Balaton and
#                   Neusiedler See are the warmest large lakes in the region.
#   depth and       a residual depth term for the very deepest, and an
#   altitude        altitude correction above 1,000 m, where the 5 arc-minute
#                   raster cell is usually a valley rather than the lake
#                   sitting above it. Glacier fed water takes a flat penalty:
#                   meltwater arrives at close to zero all summer.
#
# It is published as an estimate, with the model named in the wire, and it is
# never called a measurement.
# ---------------------------------------------------------------------------

SWIM_WARM_C = 18.0        # in a wetsuit-free sense, the water is pleasant
SWIM_GOOD_C = 20.0        # the water is warm
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep",
          "oct", "nov", "dec"]


def water_temp_estimate(lake):
    """[12] estimated surface temperature in C, or None when the climate
    sample is missing."""
    months = (lake.get("climate") or {}).get("t_mean")
    if not months or len(months) != 12:
        return None
    # A geothermal pool is heated from below and an air model says nothing
    # useful about it. Rather than publish a wrong number, say nothing.
    if kind_of(lake) == "geothermal":
        return None
    elev = lake.get("elev_m") or 0
    depth = lake.get("depth_m") or 0
    facts = _facts(lake)

    lag = 0.35 + 0.25 * min(1.0, depth / 150.0) if depth else 0.40
    shallow = 1.2 * (1.0 - min(1.0, depth / 25.0)) if depth else 0.0
    deep = min(1.2, depth / 250.0)
    alt = 0.003 * max(0.0, elev - 1000.0)
    glacier = 3.0 if ("glacier" in facts or "glacial_fed" in facts) else 0.0

    out = []
    for i in range(12):
        air = months[i]
        prev = months[(i - 1) % 12]
        if air is None or prev is None:
            return None
        base = (1.0 - lag) * air + lag * prev
        gain = 3.0 * max(0.0, min(1.0, (air - 10.0) / 11.0))
        warm = gain > 0.05
        out.append(round(base + gain + (shallow if warm else 0.0)
                         - deep - alt - glacier, 1))
    return out


def swim_season(temps):
    """(first month, last month, n months) at or above SWIM_WARM_C, or None.

    Contiguity matters: a lake that crosses the line in June and drops below
    it in September has a season, and one that only manages August has a
    fortnight. Both are reported by their real span."""
    if not temps:
        return None
    warm = [i for i, t in enumerate(temps) if t >= SWIM_WARM_C]
    if not warm:
        return None
    return {"from": MONTHS[warm[0]], "to": MONTHS[warm[-1]], "n": len(warm),
            "peak": round(max(temps), 1)}


# ---------------------------------------------------------------------------
# Components
# ---------------------------------------------------------------------------

def scenery_component(lake):
    ctx, facts = _ctx(lake), _facts(lake)
    area = protected_of(lake)
    kind = kind_of(lake)
    points = 0.0

    # The landform the lake sits in. Elevation is the cheapest honest proxy
    # for "mountains stand around this": it is on the Wikidata item, it needs
    # no raster, and it is the single field that separates Oeschinensee from
    # a Dutch peat lake.
    elev = lake.get("elev_m") or 0
    if elev >= 1800:
        points += 0.62
    elif elev >= 1000:
        points += 0.48
    elif elev >= 500:
        points += 0.26
    elif elev >= 200:
        points += 0.10
    if ctx.get("peak") or "mountains" in facts:
        points += 0.30
    if kind == "tarn":
        points += 0.24
    if kind == "crater":
        points += 0.30
    if "glacier" in facts or ctx.get("glacier"):
        points += 0.22
    if ctx.get("cliff") or "cliffs" in facts:
        points += 0.24
    if ctx.get("waterfall") or "waterfall" in facts:
        points += 0.26
    if ctx.get("wood") or "forest" in facts:
        points += 0.16
    if "islands" in facts or ctx.get("island"):
        points += 0.20
    if ctx.get("viewpoint"):
        points += 0.14
    if ctx.get("castle") or "castle" in facts:
        points += 0.16
    if ctx.get("monastery") or "church" in facts:
        points += 0.10
    if "turquoise" in facts:
        points += 0.26
    if "clear_water" in facts:
        points += 0.14
    if area:
        points += 0.42 if area.get("national_park") else 0.24
    elif near_park(lake):
        points += 0.22
    elif lake.get("protected") or "protected" in facts:
        points += 0.20
    if "unesco" in facts:
        points += 0.22
    # A big lake is a landscape; a pond is a feature. Saturating, so Vanern
    # does not simply outscore everything by being enormous.
    points += 0.30 * _sat(lake.get("area_km2") or 0.0, 22.0)
    return round(min(1.0, _sat(points, 1.05)), 4)


def swimming_component(lake):
    verdict, _ = swim_rule(lake)
    base = SWIM_VALUE.get(verdict, 0.4)
    if base == 0.0:
        return 0.0                      # forbidden is forbidden, not "low"
    ctx, facts, tags = _ctx(lake), _facts(lake), _tags(lake)
    value = 0.55 * base

    season = swim_season(water_temp_estimate(lake))
    if season:
        # Four warm months is a summer, one is a fortnight of nerve.
        value += 0.22 * min(1.0, season["n"] / 4.0)
        if season["peak"] >= SWIM_GOOD_C + 3:
            value += 0.06
    elif lake.get("climate"):
        value -= 0.05                   # measured, and it never gets warm

    sites = int((lake.get("water") or {}).get("sites") or 0)
    if sites:
        value += min(0.16, 0.06 + 0.02 * sites)
    if ctx.get("beach") or "beach" in facts:
        value += 0.10
    if ctx.get("swimming_area") or ctx.get("water_park"):
        value += 0.08
    if ctx.get("sauna"):
        value += 0.04
    if "shallow" in facts:
        value += 0.05
    if kind_of(lake) == "geothermal":
        value += 0.20                   # warm all year is the whole point
    for hazard in hazards_of(lake):
        value -= {"cold_shock": 0.10, "algal_bloom": 0.10, "currents": 0.08,
                  "dam_release": 0.05, "water_quality": 0.12,
                  "boat_traffic": 0.04}.get(hazard, 0.0)
    return round(max(0.0, min(1.0, value)), 4)


ACTIVITY_TAGS = ("canoe", "kayak", "sailing", "marina", "slipway", "scuba_diving",
                 "fishing", "boat_rental", "surfing", "windsurfing", "water_ski")


def activity_component(lake):
    ctx, facts = _ctx(lake), _facts(lake)
    points = 0.0
    for tag in ACTIVITY_TAGS:
        if ctx.get(tag):
            points += 0.16
    if "kayak" in facts or "canoe" in facts:
        points += 0.16
    if "sailing" in facts:
        points += 0.14
    if "diving" in facts:
        points += 0.16
    if "fishing" in facts:
        points += 0.10
    if ctx.get("ferry_terminal") or "boat_trip" in facts:
        points += 0.18
    # Our own published trails wire, joined by bounding box in enrich_lakes.
    # `highway=path` was deliberately left out of the Overpass sweep (it
    # returns a hundred thousand ways around Lake Constance alone), so this is
    # what answers "is there a walk here", and it answers it from a file
    # already on disk.
    if lake.get("walks"):
        points += 0.18 + min(0.10, 0.02 * (lake.get("n_walks") or 1))
    if "hiking" in facts:
        points += 0.12
    if ctx.get("glacier"):
        points += 0.06
    if not measured(lake):
        # Nobody swept the shore. Neutral, not generous, for the same reason
        # WATER_DEFAULT is a median rather than a zero.
        return round(max(0.35, min(1.0, _sat(points, 0.6))), 4)
    return round(min(1.0, _sat(points, 0.6)), 4)


def water_component(lake, country_default=WATER_DEFAULT):
    water = lake.get("water") or {}
    grade = WATER_VALUE.get(water.get("class"))
    facts = _facts(lake)
    if grade is None:
        value = country_default
    else:
        value = grade
        prev = WATER_VALUE.get(water.get("class_prev"))
        if prev is not None and prev != grade:
            value += 0.05 if grade > prev else -0.05
    if "clear_water" in facts or "turquoise" in facts:
        value += 0.08
    if "eutrophic" in facts or "algae" in facts:
        value -= 0.12
    return round(max(0.0, min(1.0, value)), 4)


BUILT_TAGS = ("hotel", "apartment", "guest_house", "hostel", "restaurant",
              "bar", "cafe", "resort")
WILDNESS_DEFAULT = 0.60


def wildness_component(lake):
    ctx, facts, tags = _ctx(lake), _facts(lake), _tags(lake)
    if not measured(lake):
        value = WILDNESS_DEFAULT
        if "remote" in facts or "hike_in" in facts:
            value += 0.22
        if "busy" in facts:
            value -= 0.20
        return round(max(0.0, min(1.0, value)), 4)
    built = sum(ctx.get(t, 0) for t in BUILT_TAGS)
    value = 1.0 - _sat(built, 6.0)
    if ctx.get("marina"):
        value -= 0.10
    if ctx.get("camp_site"):
        value -= 0.04
    if "hike_in" in facts or "remote" in facts:
        value += 0.20
    if not ctx.get("parking"):
        value += 0.08
    if "busy" in facts:
        value -= 0.16
    return round(max(0.0, min(1.0, value)), 4)


def fame_raw(lake):
    """One number for how much attention this water body has had, before any
    normalisation. Sitelinks and pageviews are Wikipedia's answer; the count
    of freely licensed photographs taken here is everybody else's."""
    sitelinks = lake.get("sitelinks") or 0
    views = lake.get("views60") or 0
    photos = len(lake.get("images") or [])
    return math.log1p(sitelinks * 2.5 + views / 25.0 + photos * 2.0)


def acclaim_component(lake, country_max, global_max):
    raw = fame_raw(lake)
    home = raw / country_max if country_max > 0 else 0.0
    europe = raw / global_max if global_max > 0 else 0.0
    value = 0.6 * home + 0.4 * europe
    facts = _facts(lake)
    if "famous_photo" in facts:
        value += 0.10
    if "unesco" in facts:
        value += 0.08
    # The seed exists because fame does not always reach the fields. An entry
    # a human put on the list because travel writing names it gets a floor,
    # not a bonus: it cannot rank below an unphotographed pond, and it does
    # not leapfrog Lake Como either.
    if (lake.get("seed") or {}).get("why"):
        value = max(value, 0.45)
    return round(max(0.0, min(1.0, value)), 4)


# ---------------------------------------------------------------------------
# Hazards
#
# The brief is emphatic on two of these and both are counter-intuitive, so
# they are encoded rather than left to a reader's instinct: cold shock
# disables strong swimmers at temperatures that sound survivable (10 to 15 C),
# and cyanobacteria blooms are documented below 15 C and under ice, so "cold
# means safe" is wrong.
# ---------------------------------------------------------------------------

def hazards_of(lake):
    facts = _facts(lake)
    ctx = _ctx(lake)
    kind = kind_of(lake)
    water = lake.get("water") or {}
    out = []
    temps = water_temp_estimate(lake)
    peak = max(temps) if temps else None

    if (peak is not None and peak < 16.0) or (lake.get("elev_m") or 0) >= 1200 \
            or lake.get("lat", 0) >= 63 or "glacier" in facts:
        out.append("cold_shock")
    if (water.get("class") in ("Poor", "Sufficient") or "algae" in facts
            or "eutrophic" in facts
            or ((lake.get("area_km2") or 0) > 5 and (lake.get("depth_m") or 99) < 6
                and peak is not None and peak >= 20)):
        out.append("algal_bloom")
    if kind == "river" or "currents" in facts:
        out.append("currents")
    if kind == "reservoir" and ("dam" in facts or ctx.get("dam")):
        out.append("dam_release")
    if water.get("class") == "Poor" or (kind == "river" and not water.get("class")):
        out.append("water_quality")
    if ctx.get("marina") or ctx.get("ferry_terminal"):
        out.append("boat_traffic")
    for extra in (lake.get("seed") or {}).get("haz") or []:
        if extra not in out:
            out.append(extra)
    return out


# ---------------------------------------------------------------------------
# The score
# ---------------------------------------------------------------------------

def score_lake(lake, country_max, global_max, water_default=WATER_DEFAULT):
    comps = {
        "scenery": scenery_component(lake),
        "swimming": swimming_component(lake),
        "activity": activity_component(lake),
        "acclaim": acclaim_component(lake, country_max, global_max),
        "water": water_component(lake, water_default),
        "wildness": wildness_component(lake),
    }
    base = sum(WEIGHTS[k] * comps[k] for k in WEIGHTS)
    standout = max(comps[k] for k in STANDOUT_ON)
    score01 = min(1.0, base + STANDOUT_BONUS * standout)
    return comps, round(score01, 4), round(10.0 * score01, 1)


def tier_for(score10, cutoffs=TIER_CUTOFFS):
    if score10 >= cutoffs[3]:
        return 3
    if score10 >= cutoffs[2]:
        return 2
    if score10 >= cutoffs[1]:
        return 1
    return 0


def quality_of(comps):
    """The lake on its own terms, with fame taken out. This is the half of the
    score a hidden gem is measured against."""
    weights = {"scenery": 0.42, "swimming": 0.24, "activity": 0.18,
               "water": 0.10, "wildness": 0.06}
    return sum(weights[k] * comps[k] for k in weights)


# Above this acclaim, a lake is not a hidden anything. The residual can be
# positive for Lake Ohrid and Lake Constance, and it was on the first build:
# they really are better than the average lake of their fame. They are also
# two of the most famous lakes in Europe, and a chip that calls them a hidden
# gem is simply wrong on the face of it, whatever the regression says.
GEM_MAX_ACCLAIM = 0.55


def gem_score(comps, expected):
    """How much better this lake is than its own fame predicts, 0..1.

    `expected` is the quality a lake of this acclaim usually has, fitted once
    per build over everything published (see export_lakes.fit_expectation).
    A positive residual is a lake that is better than anybody says, and a lake
    everybody already knows is disqualified outright (GEM_MAX_ACCLAIM)."""
    if comps.get("acclaim", 0.0) > GEM_MAX_ACCLAIM:
        return 0.0
    residual = quality_of(comps) - expected
    return round(max(0.0, min(1.0, 0.5 + residual * 1.6)), 4)


# ---------------------------------------------------------------------------
# Reasons: why this lake scored what it scored, as codes the app can speak.
#
# Order is narrative order, not importance order: what it is, how big, what
# stands around it, the water, whether you may swim and when, what there is to
# do, how you get there, what is on it, what it is known for, and last what to
# be careful of. The app renders the first REASON_MAX as a paragraph, so
# anything appended late is what gets cut. Hazards are appended last and
# rendered SEPARATELY, in their own block, so they can never be the sentence
# that got trimmed.
# ---------------------------------------------------------------------------

REASON_MAX = 10


def reasons_for(lake, comps):
    ctx, facts, tags = _ctx(lake), _facts(lake), _tags(lake)
    area = protected_of(lake)
    water = lake.get("water") or {}
    kind = kind_of(lake)
    verdict, source = swim_rule(lake)
    out = []

    def add(code, **params):
        out.append(dict(k=code, **params))

    # 1. What it is.
    add("kind" + kind.capitalize())
    size = lake.get("area_km2")
    if size and size >= 1.0:
        add("area", km2=round(size, 1) if size < 100 else round(size))
    depth = lake.get("depth_m")
    if depth and depth >= 20:
        add("depth", m=int(depth))
    elev = lake.get("elev_m")
    if elev and elev >= 600:
        add("elevation", m=int(elev))

    # 2. What stands around it.
    if ctx.get("peak") or "mountains" in facts:
        add("mountains")
    if "glacier" in facts or ctx.get("glacier"):
        add("glacier")
    if ctx.get("cliff") or "cliffs" in facts:
        add("cliffs")
    if ctx.get("waterfall") or "waterfall" in facts:
        add("waterfall")
    if "islands" in facts or ctx.get("island"):
        add("islands")
    if ctx.get("wood") or "forest" in facts:
        add("forest")
    if ctx.get("castle") or "castle" in facts:
        add("castle")
    if ctx.get("monastery") or "church" in facts:
        add("church")

    # 3. The water.
    if water.get("class") in WATER_VALUE:
        add("water" + water["class"], site=water.get("site") or "")
    if "turquoise" in facts:
        add("turquoise")
    elif "clear_water" in facts:
        add("clearWater")

    # 4. Whether you may swim, and when. Always emitted, including the "no
    # rule recorded" case: silence on a swimming page reads as permission.
    add("swim" + verdict.capitalize(), src=source)
    sites = int(water.get("sites") or 0)
    if sites and verdict != "no":
        add("designated", n=sites)
    if verdict != "no":
        season = swim_season(water_temp_estimate(lake))
        if season:
            add("season", **season)
        elif lake.get("climate"):
            add("neverWarm")
    if ctx.get("beach") or "beach" in facts:
        add("shoreBeach")
    if ctx.get("swimming_area"):
        add("lido")

    # 5. Protection.
    if area.get("national_park"):
        add("nationalPark", name=area.get("name") or "")
    elif area.get("name"):
        add("reserve", name=area["name"], kind=area.get("kind") or "")
    if "unesco" in facts:
        add("unesco")

    # 6. What there is to do.
    doing = [name for name, present in (
        ("kayak", ctx.get("canoe") or ctx.get("kayak") or "kayak" in facts),
        ("sail", ctx.get("sailing") or ctx.get("marina") or "sailing" in facts),
        ("dive", ctx.get("scuba_diving") or "diving" in facts),
        ("fish", ctx.get("fishing") or "fishing" in facts),
        ("boat", ctx.get("ferry_terminal") or "boat_trip" in facts),
        ("windsurf", ctx.get("windsurfing") or ctx.get("surfing")),
    ) if present]
    if doing:
        add("activities", list=",".join(doing), n=len(doing))
    if lake.get("walks") or "hiking" in facts:
        add("shoreWalk")

    # 7. Getting there and what that keeps out.
    if "hike_in" in facts or "remote" in facts:
        add("hikeIn")
    elif ctx.get("parking"):
        add("roadAccess")
    if ctx.get("cable_car"):
        add("cableCar")
    built = sum(ctx.get(t, 0) for t in BUILT_TAGS)
    if measured(lake) and built == 0 and not ctx.get("parking"):
        add("undeveloped")
    elif measured(lake) and built >= 15:
        add("resortShore", n=built)

    # 8. What is on the shore.
    services = [name for name, present in (
        ("parking", ctx.get("parking")), ("toilets", ctx.get("toilets")),
        ("camping", ctx.get("camp_site")),
        ("food", any(ctx.get(t) for t in ("cafe", "restaurant", "bar"))),
    ) if present]
    if services:
        add("services", list=",".join(services), n=len(services))

    # 9. What it is known for.
    sitelinks = lake.get("sitelinks") or 0
    if sitelinks >= 10:
        add("wikiFame", n=sitelinks)
    if "famous_photo" in facts:
        add("photographed")
    shared = [c for c in (lake.get("basin_countries") or []) if c][:3]
    if len(shared) > 1:
        add("shared", list=", ".join(shared), n=len(shared))
    return out


HAZARD_ORDER = ["cold_shock", "algal_bloom", "water_quality", "currents",
                "dam_release", "boat_traffic", "cliffs"]


def hazard_codes(lake):
    """Hazards in a fixed reading order, so a list of lakes is consistent."""
    have = set(hazards_of(lake))
    return [h for h in HAZARD_ORDER if h in have]


HIGHLIGHT_ORDER = [
    "turquoise", "kindGeothermal", "kindCrater", "kindTarn",
    "glacier", "mountains", "islands", "nationalPark", "unesco", "waterfall",
    "cliffs", "castle", "undeveloped", "waterExcellent", "lido", "shoreBeach",
    "designated", "activities", "shoreWalk", "hikeIn", "forest", "area",
    "depth", "kindReservoir", "kindLagoon", "kindRiver",
]


def highlights_for(reasons):
    """The three or four codes that go on the card, in a fixed order so a list
    of cards reads consistently rather than in whatever order the reasons
    happened to come out. The swim ban leads on purpose: on a card that
    promises beautiful water it is the one thing that must not be a surprise
    on arrival."""
    have = {r["k"]: r for r in reasons}
    out = []
    for code in HIGHLIGHT_ORDER:
        if code in have and len(out) < 4:
            out.append(have[code])
    return out


BEST_FOR_RULES = (
    ("scenery", lambda c, r, k: c["scenery"] >= 0.62),
    ("swimming", lambda c, r, k: c["swimming"] >= 0.72),
    ("families", lambda c, r, k: c["swimming"] >= 0.6
     and ("services" in r or "lido" in r or "shoreBeach" in r)),
    ("kayaking", lambda c, r, k: "activities" in r and c["activity"] >= 0.5),
    ("diving", lambda c, r, k: "clearWater" in r or "turquoise" in r),
    ("walking", lambda c, r, k: "shoreWalk" in r or "hikeIn" in r),
    ("seclusion", lambda c, r, k: c["wildness"] >= 0.85),
    ("photography", lambda c, r, k: c["scenery"] >= 0.75 or "photographed" in r),
    ("thermal", lambda c, r, k: k == "geothermal"),
)


def best_for(comps, reasons, kind):
    codes = {r["k"] for r in reasons}
    return [name for name, rule in BEST_FOR_RULES
            if rule(comps, codes, kind)][:3]


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------

def slugify(text):
    folded = unicodedata.normalize("NFKD", (text or "").lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    folded = folded.replace("ł", "l").replace("ß", "ss")
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", folded)).strip("-")


def lake_id(lake):
    """Stable across runs: the country, the name, and the source id that made
    it unique. A saved favourite must survive a re-harvest.

    The country is the FILED country, not Wikidata's P17, so Lake Ohrid gets
    an Albanian id on the Albanian page and a Macedonian one on the Macedonian
    page. They are two entries because they are two shores."""
    tail = lake.get("wd") or (lake.get("osm_id") or "").replace("/", "")
    return f"{lake['iso2'].lower()}-{slugify(lake['name'])[:36]}-{tail}".strip("-")
