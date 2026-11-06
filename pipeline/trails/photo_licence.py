"""Which Commons licences a trail photograph may carry.

Tier: Library

A trail photograph ships only under a licence that allows reuse with credit:
CC0, CC BY, CC BY-SA (any version) and public domain. The harvest
(trail_images.store) and the wire export (export_wire.credited) both ask this
one function, so a file with another licence (GFDL alone, CC BY-NC, CC BY-ND,
"unknown", a free-text licence nobody has read) cannot reach the app by either
route. The name rule stays in pipeline/photos/credit.py.

Pure, ASCII, no network.
"""

import re

# What the wire says about a kept licence: the short name as Commons gives it.
_PD = re.compile(r"^(public domain|pd\b|pd-|cc0|cc-0|cc zero|no restrictions)",
                 re.I)
_CC = re.compile(r"^cc[ -]by(?:[ -]sa)?(?:[ -]\d(?:\.\d)?)?(?:[ -][a-z]{2,3})?$",
                 re.I)
_NO = re.compile(r"(^|[^a-z])(nc|nd)([^a-z]|$)|non-?commercial|no-?deriv", re.I)


def reusable(licence):
    """True when the licence allows reuse with credit and nothing narrower."""
    lic = " ".join(str(licence or "").replace("_", " ").split())
    if not lic or _NO.search(lic):
        return False
    return bool(_PD.match(lic) or _CC.match(lic))


def split_reusable(rows, key="license"):
    """(kept, dropped) of image records, by their licence field."""
    kept, dropped = [], []
    for r in rows:
        (kept if reusable(r.get(key) or r.get("lic")) else dropped).append(r)
    return kept, dropped
