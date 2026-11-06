"""How hard a walk is, per day of walking (ROADMAP D7, T1092).

Tier: Library

The published grade (attributes.py grade_of) is the harder of two answers:
TERRAIN (what the ground asks of a foot: the mapper's sac_scale, else the
DEM) and EFFORT (what the walk asks of a day). Until T1092 the effort answer
read the whole route as one day: anything over 40 km was "very_hard", so the
Veluwe Zwerfpad (285,992 m, 10 m of climb per km, a dune at its highest
point) shipped as very hard beside real alpine days. A 286 km path is not
hard, it is long. Length now sets how many days the walk takes, and the
effort grade reads ONE of those days.

The rule, in three steps:

  1 Walking time by DIN 33466, the rule elevation.py already stores as
    duration_min: 4 km an hour on the flat, 300 m an hour up, 500 m an hour
    down, and the larger of the two times plus half the smaller.
  2 Days: a walk of up to DAY_MAX_H hours is one day. Longer, it is walked
    in stages of STAGE_H hours, so days = ceil(hours / STAGE_H).
  3 The effort grade reads the hours and the climb of one day against
    DAY_LADDER. A route of LONG_MIN_DAYS or more days is "long", a fact the
    wire ships beside the grade (f.d) and the app prints in its place when
    nothing about the ground is harder than moderate.

Terrain is not touched here and still wins when it is harder: a ten day
traverse on T4 ground is very hard on every one of those days.

Pure: no I/O and no imports outside the standard library, so a test and the
export can both call it without the lab.

ASCII clean, no em dashes, per project convention.
"""

import math

# DIN 33466 walking speeds (elevation.py duration_min uses the same).
FLAT_KMH = 4.0
UP_MH = 300.0
DOWN_MH = 500.0

# A walk of up to this many hours is one day out. Beyond it a walker plans
# stages; nobody walks the Thames Path in one go.
DAY_MAX_H = 10.0
# The length of a planned stage, in walking hours (about 20 km on the flat,
# the stage length the long-distance guides in the catalogue use).
STAGE_H = 6.0
# From this many days the walk reads "long".
LONG_MIN_DAYS = 2

# Effort of ONE day, as (grade, more than these hours, or more than this
# climb in metres). Read hardest first; the first row either term clears
# wins, otherwise "easy". Capped at very_hard: length and climb make a long
# day, terrain makes an alpine one.
DAY_LADDER = [
    ("very_hard", 8.0, 1500.0),
    ("hard", 6.0, 1000.0),
    ("moderate", 3.5, 500.0),
]


def din_hours(distance_m, climb_m=0.0, drop_m=0.0):
    """Walking hours by DIN 33466, from metres. Pass the climb read uphill
    (attributes.oriented): a summit to village line is walked upwards."""
    flat = max(0.0, float(distance_m or 0)) / 1000.0 / FLAT_KMH
    vert = max(0.0, float(climb_m or 0)) / UP_MH \
        + max(0.0, float(drop_m or 0)) / DOWN_MH
    return max(flat, vert) + min(flat, vert) / 2.0


def days_of(hours):
    """How many days a walk of `hours` walking hours takes. Never below 1."""
    h = max(0.0, float(hours or 0))
    if h <= DAY_MAX_H:
        return 1
    return math.ceil(h / STAGE_H)


def day_grade(day_h, day_climb_m):
    """The effort grade of one day."""
    for grade, hours, climb in DAY_LADDER:
        if day_h > hours or day_climb_m > climb:
            return grade
    return "easy"


def day_effort(row):
    """{"grade", "days", "hours", "day_h", "day_climb_m"} for a route row.

    The row needs distance_m and ascent_m; descent_m is read when present
    (a row with no descent is walked with no drop, which is the stored
    climb's best guess). Pass the oriented() row."""
    distance = float(row.get("distance_m") or 0)
    climb = float(row.get("ascent_m") or 0)
    drop = float(row.get("descent_m") or 0)
    hours = din_hours(distance, climb, drop)
    days = days_of(hours)
    day_h = hours / days
    day_climb = climb / days
    return {"grade": day_grade(day_h, day_climb), "days": days,
            "hours": round(hours, 1), "day_h": round(day_h, 1),
            "day_climb_m": round(day_climb)}


def is_long(days):
    """True when a walk of `days` days reads "long"."""
    return int(days or 1) >= LONG_MIN_DAYS
