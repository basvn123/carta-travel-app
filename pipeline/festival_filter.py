"""One predicate for "is this a festival a traveller should be shown" (D23).

harvest_events.py asks Wikidata for every subclass of festival, and that
brings in an erotic film festival and an adult trade show beside the flower
carpet. The same predicate is used at the source (export_destinfo.slim_event)
and in the dossier (build_dossier festivals, derive_do), so the wire and the
dossier agree.

ASCII only.
"""
import re

BANNED_RE = re.compile(
    r"\b(erotic\w*|adult|adults|sex|sexual|fetish|porn\w*|bdsm|swinger\w*|strip(?:per|tease)\w*)\b"
    r"|trade\s+(?:fair|show)"
    r"|\b(?:industry|trade|business|professional)\s+(?:convention|expo|exhibition|conference)\b",
    re.IGNORECASE)


def is_festival_ok(ev):
    """False for an adult festival or a trade fair. `ev` is an event row
    (name, desc or what or detail)."""
    text = " | ".join(str(ev.get(k) or "") for k in ("name", "desc", "what", "detail"))
    return not BANNED_RE.search(text)
