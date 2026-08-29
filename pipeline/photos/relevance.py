"""The classifier for the miss the heuristics documented and could not fix.

The known case: an information board beside a lake, whose categories,
title and description all name the lake, and whose printed map reads as
water to the pixel probe. Every metadata gate passes it honestly, because
metadata is exactly what it has. That is a classification problem, and
CLIP is the classifier.

Two hard rules, both structural:

  1. This runs AFTER the evidence gate, and it can VETO, never admit. A
     file nothing names is still refused before this module ever sees it.
     The gate stays the best thing in the pipeline; this cleans up behind
     it.
  2. P18 is exempt from the veto, same as the pixel probe's rule in
     lake_images: only P18 is a person stating this image depicts this
     item, and a zero-shot model does not outrank a person.

The margin ships at a conservative default and is TUNED ONLY against the
labelled evaluation set (evalset.py): the verify bar is at least 95 per
cent precision on rejects, so a good photograph is almost never vetoed,
and at least 80 per cent recall on the known-bad set.

This module also owns the shared evidence-tier vocabulary, including the
tiers the new sources introduce, so every layer and verify script reads
one list:

  p18      Wikidata P18 or another curated view property (P4640/P8592/
           P5252): a person picked this file for this subject
  title    the file is named after the subject and nothing else
  viewcat  it sits in "Views of <subject>" / "Panoramics of <subject>"
  category it sits in the subject's category tree
  name     the subject is mentioned somewhere in its name or description
  geo      only a coordinate places it (Geograph grid squares without a
           naming title land here). NEVER a hero.
  street   Mapillary existence proof. NEVER a hero, and only present at
           all when a row would otherwise ship with zero images.

ASCII clean, no em dashes, per project convention.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aesthetics  # noqa: E402
from technical import lake_images  # noqa: E402

EVIDENCE_TIERS = ("p18", "title", "viewcat", "category", "name",
                  "geo", "street")
HERO_TIERS = ("p18", "title", "viewcat", "category", "name")
NEVER_HERO = ("geo", "street")

# What a card photograph is not, whatever names it carries. One list for
# every category, because a plaque is a plaque beside any subject.
NEGATIVE = [
    "a photograph of an information sign or interpretive board",
    "a photograph of a printed map or plaque",
    "a screenshot or a scanned document",
    "a close-up selfie of a person",
    "an indoor photograph",
    "a photograph of a building facade",
    "a photograph of a car park or road furniture",
]

# What the category's card wants to be. One positive per category: the
# question the margin asks is "is this more like the junk than like the
# thing", not "which kind of scenery is it".
POSITIVE = {
    "beach": "a scenic photograph of a beach and the sea",
    "lake": "a scenic photograph of a lake and its shore",
    "mountain": "a scenic photograph of a mountain landscape",
    "trail": "a scenic photograph of a hiking trail in a landscape",
    "cycling": "a scenic photograph of a road or cycle path in a "
               "landscape",
}

# reject if max(sim NEGATIVE) > max(sim POSITIVE) + MARGIN. Provisional
# until evalset.py has labels; a positive margin errs toward keeping,
# which is the right error while untuned.
MARGIN = 0.02

_text_emb = None      # {(category): (neg_matrix, pos_vector)} per process


def _prompts_for(category):
    global _text_emb
    if _text_emb is None:
        _text_emb = {}
    if category not in _text_emb:
        vecs = aesthetics.embed_texts(
            NEGATIVE + [POSITIVE.get(category, POSITIVE["lake"])])
        _text_emb[category] = (vecs[:-1], vecs[-1])
    return _text_emb[category]


def veto(embedding, category, evidence="", margin=MARGIN):
    """(vetoed, why). Veto-only, P18-exempt, neutral when blind.

    `embedding` is the file's cached CLIP vector (aesthetics.embed_image);
    None means the model or the bytes were unavailable, and no reading is
    not a bad reading, so the answer is "not vetoed"."""
    if embedding is None:
        return False, ""
    if evidence == "p18":
        return False, ""
    try:
        neg, pos = _prompts_for(category)
    except aesthetics.ModelUnavailable:
        return False, ""
    neg_sims = neg @ embedding
    pos_sim = float(pos @ embedding)
    worst = int(neg_sims.argmax())
    if float(neg_sims[worst]) > pos_sim + margin:
        return True, NEGATIVE[worst]
    return False, ""


# ---------------------------------------------------------------------------
# Evidence tiers for the new sources
# ---------------------------------------------------------------------------

def geograph_tier(title, description, tokens):
    """Map a Geograph image onto the shared scheme.

    Geograph's subject-naming discipline is good: contributors title the
    square's subject, so expect a high `name` rate. A grid reference alone
    is a coordinate, which is `geo`, which can never lead a card."""
    text = lake_images.fold(f"{title or ''} {description or ''}")
    if tokens and any(t in text for t in tokens):
        return "name"
    return "geo"
