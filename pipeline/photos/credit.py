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
