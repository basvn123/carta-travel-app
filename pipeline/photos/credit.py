"""Who to name under a photograph, decided in one place.

Every layer asked Commons for `Artist` and nothing else, and stored
whatever came back. Artist is empty on a large minority of older
uploads, which is how a hundred published photographs came to carry a
licence and no name: "CC BY-SA 3.0" with nobody credited is not a
credit, it is a licence notice with the obligation removed.

Commons keeps the same fact in three fields, and they are not
interchangeable:

  Attribution   what the photographer explicitly asked to be credited
                as. When it exists it OUTRANKS Artist, because it is the
                uploader stating the wording they want.
  Artist        the uploader's name or signature, usually a wiki link.
  Credit        provenance, often "Own work". Weakest, and sometimes the
                only thing present.

And one field that decides whether any of it is owed:

  AttributionRequired   false on public domain and CC0 files. An empty
                author there is correct and must not be treated as a gap,
                or the pipeline starts hunting names that do not exist.

Import this rather than copying the order: the layers each harvest
their own photographs, and the rule for crediting them should not be
able to drift between the three.

ASCII clean, no em dashes, per project convention.
"""

import re

TAG_RE = re.compile(r"<[^>]+>")

# What every layer's imageinfo call should ask for. The three credit
# fields plus the flag that says whether a credit is owed at all.
EXTMETA_CREDIT = ("LicenseShortName|LicenseUrl|Artist|Attribution"
                  "|Credit|AttributionRequired")

MAX_LEN = 120


def clean(value):
    """Commons metadata is HTML: links, spans, and trailing punctuation
    that a credit line should not inherit."""
    text = TAG_RE.sub(" ", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"^[\s,;]+|[\s,;]+$", "", text, flags=re.UNICODE)


def _field(meta, key):
    return clean((meta or {}).get(key, {}).get("value", ""))


def author_of(meta, limit=MAX_LEN):
    """The name to print, or "" when Commons holds none."""
    for key in ("Attribution", "Artist", "Credit"):
        value = _field(meta, key)
        if value:
            return value[:limit]
    return ""


def attribution_required(meta):
    """False only when Commons says so outright. Anything unstated is
    treated as owed, which is the safe direction for a licence."""
    value = _field(meta, "AttributionRequired").lower()
    return value != "false"


def credit_gap(meta):
    """True when this file owes a name and has none: the condition worth
    reporting, as distinct from a public domain file with no author."""
    return attribution_required(meta) and not author_of(meta)


# Licences that ask for no name at all. A file under one of these with an
# empty author is correct and complete, not a gap.
NO_CREDIT_LIC = re.compile(r"public domain|^pd\b|cc0|no restrictions", re.I)


def owes_credit(img):
    """True when a published image record owes a name and carries none.

    The gate condition, as opposed to the repair condition. fill_authors
    fixes the DATA, which makes the wire honest only after a pass has run
    and only until the next harvest introduces new files. An export that
    refuses this at the gate makes it a property of the layer instead: a
    photograph owing a credit it does not have cannot reach a card,
    whatever the cache says and whoever has run what. The cycling layer
    got there first (brief 07) and the framing is theirs: a missing
    credit should cost US a picture, never a reader a false notice.

    It also recovers by itself. If the name turns up on Commons later,
    the photograph returns at the next export with nobody needing to
    remember, which repairing the data cannot do.

    Accepts a cache record (license/author) or a wire record (lic/by).
    """
    lic = (img.get("license") or img.get("lic") or "").strip()
    if not lic:
        return True                       # no licence is worse than no name
    if img.get("no_attribution_required"):
        return False                      # Commons says none is owed
    if NO_CREDIT_LIC.search(lic):
        return False
    return not (img.get("author") or img.get("by") or "").strip()


def stamp(img, meta):
    """Record on an image record what COMMONS says about its credit.

    A licence-string test is a heuristic, however carefully written: it
    has to know that GFDL demands a name and CC0 does not, and it is one
    unfamiliar template away from failing. Commons answers the question
    directly in AttributionRequired, but only at harvest time, when the
    metadata is in hand and the network call has already been paid for.

    So the harvest decides and writes the answer down; a gate then reads
    a column instead of parsing a string. The flag is only written when
    the answer is "nothing is owed", because that is the claim that lets
    an empty author through, and an absent flag must always mean "assume
    a credit is owed".

    Suggested by the cycling layer, which is deleting its own licence
    heuristic in favour of reading this.
    """
    if meta and not attribution_required(meta):
        img["no_attribution_required"] = True
    return img
