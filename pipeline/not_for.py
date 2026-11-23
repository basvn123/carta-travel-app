"""The numbers behind "a comfortable day out" and "not for" (D-5, D7, wave 3).

One block, so the trail rating (rate.py) and the app agree where a day out
stops. The app copies it by hand today (continent-app/src/lib/trailStory.js
isComfortableDay and src/lib/notFor.js); the request to logic in
.work/2026-11-19-fix-programs/requests.md asks it to mirror these values.
Pure: no database, no file reads.
"""
import grades

# The day-out band, in metres: from a short walk to just under the length at
# which notFor.js says "long" (20 km). A day out and a "not for long" never
# meet on the same row.
DAY_MIN_M = 6_000
DAY_MAX_M = 20_000
# A climb of this many metres or more is "not for" one side only: never a
# comfortable day.
CLIMB_M = 800
# Walking minutes of a full day.
MINUTES = 360
# Above this grade a walk is not a comfortable day (hard is the ceiling).
GRADE_MAX = "hard"
# The distance and the road share at which notFor.js turns a side on.
LONG_KM = 20
ROAD_PCT = 15


def is_comfortable_day(climb_m, minutes=None, grade=None):
    """Climb (read uphill) under CLIMB_M, walking time within MINUTES, grade at
    most GRADE_MAX. An unknown time or grade does not fail it, the same as the
    app's check."""
    if climb_m >= CLIMB_M:
        return False
    if minutes is not None and minutes > MINUTES:
        return False
    return not (grade in grades.GRADE_RANK
                and grades.GRADE_RANK[grade] > grades.GRADE_RANK[GRADE_MAX])


def in_day_band(distance_m):
    return DAY_MIN_M <= (distance_m or 0) < DAY_MAX_M
