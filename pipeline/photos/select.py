"""After relevance: rank for beauty, then compose the hero and the gallery.

The score, weights versioned as photo_rank_v1 and shipped in every layer's
index.json model block (invariant 2):

  beauty = 0.45 aesthetic_norm      LAION improved-aesthetic-predictor
         + 0.20 commons_assessment  FP 1.0, QI 0.75, VI 0.6, none 0.0
         + 0.15 nima_norm           idealo NIMA, the decorrelating second
         + 0.10 technical_norm      resolution and sharpness headroom
         + 0.10 season_fit          season.py's table

A component nobody measured is dropped and the remaining weights
renormalised, never counted as zero (invariant 6). The Commons assessment
stays the anchor at 0.20 against the model's 0.45: the model ranks the 95
per cent of files no human ever assessed, and the assessment corrects the
model where a human did.

The one softened precedence, signed off in 02-PHOTO-ENGINE.md: a P18 that
passes relevance enters the hero contest with a +0.10 bonus, and no longer
wins automatically. Absolute P18 precedence is what put an observatory car
park on Teide. The existing exception stands unchanged: a P18 that never
names its subject drops to a supporting slot in the layers' own gates.

Hero eligibility is an evidence question before it is a beauty question:
a `geo` tier or Mapillary (`street`) image can NEVER be hero, whatever it
scores. And a row with nothing publishable renders the generated map card
(code {"k": "no_photo_map_card"}), never a bad photograph.

ASCII clean, no em dashes, per project convention.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from relevance import HERO_TIERS, NEVER_HERO  # noqa: E402,F401

WEIGHTS = {
    "aesthetic_norm": 0.45,
    "commons_assessment": 0.20,
    "nima_norm": 0.15,
    "technical_norm": 0.10,
    "season_fit": 0.10,
}

P18_BONUS = 0.10
GALLERY_MAX = 5           # beyond the hero
NEAR_TIE = 0.05           # review queue: the model is undecided under this

# Commons' own reviewers, mapped to one number. The strings are matched
# inside lowercased category names, same as lake_images.QUALITY_CATS.
ASSESSMENT_VALUE = (
    ("featured picture", 1.0),
    ("pictures of the year", 1.0),
    ("quality image", 0.75),
    ("valued image", 0.6),
)

# The block a layer embeds in its index.json model section, so the wire
# always states which weights built it (invariant 2).
MODEL = {
    "photo_rank": "photo_rank_v1",
    "weights": dict(WEIGHTS),
    "p18_bonus": P18_BONUS,
    "assessment": {"fp": 1.0, "qi": 0.75, "vi": 0.6, "none": 0.0},
    "aesthetic_scale": [3.0, 7.5],
    "gallery_max": GALLERY_MAX,
}


def commons_assessment(cats):
    """0..1 from a file's category list. The single best human signal in
    any of these layers; nothing computed comes close, which is why it is
    a rank multiplier now and not only a tiebreak."""
    lowered = " ".join(cats or []).lower()
    for needle, value in ASSESSMENT_VALUE:
        if needle in lowered:
            return value
    return 0.0


def beauty(components):
    """The weighted score over whatever answered.

    `components` maps WEIGHTS keys to a value in [0, 1] or None. Only the
    measured components count, and their weights renormalise so a file
    scored by three signals is comparable to one scored by five."""
    total, weight_sum = 0.0, 0.0
    for key, weight in WEIGHTS.items():
        value = components.get(key)
        if value is None:
            continue
        total += weight * float(value)
        weight_sum += weight
    if weight_sum == 0.0:
        return None
    return round(total / weight_sum, 4)


def hero_eligible(image):
    """Evidence first: only a tier that asserts the subject may lead."""
    return image.get("evidence") in HERO_TIERS


def pick(images, *, beauty_of=lambda i: i.get("beauty"),
         cluster_of=lambda i: i.get("cluster"),
         aspect_class=lambda i: i.get("aspect_class"),
         month_of=lambda i: i.get("month")):
    """(hero, gallery) from one row's surviving candidates.

    hero    argmax(beauty + P18 bonus) among hero-eligible images. None
            when nothing is eligible, and the caller ships the map card.
    gallery up to GALLERY_MAX more, one per dedupe cluster, ordered by
            beauty, with a soft diversity rule: when scores sit within
            NEAR_TIE, prefer an aspect class or a season the gallery does
            not yet show, so four slots show wide, detail and seasonal
            views rather than four August wides.
    """
    def contest(img):
        score = beauty_of(img)
        if score is None:
            return None
        return score + (P18_BONUS if img.get("evidence") == "p18" else 0.0)

    candidates = [(contest(img), img) for img in images]
    eligible = sorted(
        ((s, img) for s, img in candidates
         if s is not None and hero_eligible(img)),
        key=lambda pair: -pair[0])
    hero = eligible[0][1] if eligible else None

    taken_clusters = set()
    if hero is not None and cluster_of(hero) is not None:
        taken_clusters.add(cluster_of(hero))

    rest = sorted(
        ((s if s is not None else -1.0, img) for s, img in candidates
         if img is not hero),
        key=lambda pair: -pair[0])
    gallery, shown_aspects, shown_months = [], set(), set()
    if hero is not None:
        shown_aspects.add(aspect_class(hero))
        shown_months.add(month_of(hero))
    pool = [img for score, img in rest if score >= 0.0]
    while pool and len(gallery) < GALLERY_MAX:
        head = pool[0]
        head_score = beauty_of(head) or 0.0
        pick_img = head
        # Diversity only ever spends a near-tie: a clearly better file is
        # never traded for variety.
        for img in pool[1:]:
            if (head_score - (beauty_of(img) or 0.0)) > NEAR_TIE:
                break
            fresh_aspect = aspect_class(img) not in shown_aspects
            fresh_month = month_of(img) not in shown_months
            head_fresh = (aspect_class(head) not in shown_aspects
                          or month_of(head) not in shown_months)
            if (fresh_aspect or fresh_month) and not head_fresh:
                pick_img = img
                break
        cluster = cluster_of(pick_img)
        if cluster is None or cluster not in taken_clusters:
            gallery.append(pick_img)
            if cluster is not None:
                taken_clusters.add(cluster)
            shown_aspects.add(aspect_class(pick_img))
            shown_months.add(month_of(pick_img))
        pool.remove(pick_img)
    return hero, gallery


def undecided(images, beauty_of=lambda i: i.get("beauty")):
    """True when the top two beauty scores sit within NEAR_TIE: the review
    queue's second priority band, after top.json rows."""
    scores = sorted((beauty_of(i) for i in images
                     if beauty_of(i) is not None), reverse=True)
    return len(scores) >= 2 and (scores[0] - scores[1]) < NEAR_TIE
