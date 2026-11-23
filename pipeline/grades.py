"""One grade vocabulary for every outdoor row (D24, D7).

Carta's five words, one SAC table and one mountain table, and the single rule
that keeps a grade the DEM guessed from reading as alpine. Pure: no database,
no file reads, so attributes.py, nature_tiers.py and the replay import it
without pulling anything in.
"""

import re

GRADES = ["easy", "moderate", "hard", "very_hard", "alpine"]
GRADE_RANK = {g: i for i, g in enumerate(GRADES)}

# SAC scale to the published grade. The two alpine grades collapse: a walker
# choosing a filter chip does not distinguish T5 from T6. "strolling" is the
# OSM word for a T0 path (nature_tiers saw it, attributes did not).
SAC_GRADE = {
    "strolling": "easy",
    "hiking": "easy",
    "mountain_hiking": "moderate",
    "demanding_mountain_hiking": "hard",
    "alpine_hiking": "very_hard",
    "demanding_alpine_hiking": "alpine",
    "difficult_alpine_hiking": "alpine",
}

# Mountains carry the peak_index difficulty key, not a SAC word. Same five
# words. Every row on the wire is marked est today, and facts_of drops an
# estimate, so this only speaks once a source states a difficulty.
MOUNTAIN_DIFFICULTY = {
    "walkUp": "easy",
    "hike": "easy",
    "mountainHike": "moderate",
    "scramble": "hard",
    "alpine": "alpine",
}

# The highest grade a guess may show. Alpine needs a tag (SAC T5 or T6) or a
# via ferrata: the DEM cannot tell a 45 percent staircase from a glacier.
DERIVED_MAX = "very_hard"


_EASY_WORDS = re.compile(r"\b(?:easy|gentle|leisurely|stroll)\b", re.I)


def lead_contradicts(lead, grade):
    """True when a lead calls the walk easy and the grade says hard or worse.
    Narrow on purpose: "moderate" on a hard row is a judgement, not a
    contradiction, and dropping true text costs more than keeping it."""
    return bool(lead and grade in GRADE_RANK
                and GRADE_RANK[grade] >= GRADE_RANK["hard"]
                and _EASY_WORDS.search(lead))


def cap_derived(grade, tagged=False, ferrata=False):
    """The grade to show. A derived grade is never above very_hard unless a
    mapper's tag or a via ferrata says alpine."""
    if grade in GRADE_RANK and not tagged and not ferrata \
            and GRADE_RANK[grade] > GRADE_RANK[DERIVED_MAX]:
        return DERIVED_MAX
    return grade
