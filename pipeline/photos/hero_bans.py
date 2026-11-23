"""Words that make a file the wrong hero for a place (D17, wave 2 step 1.5).

One list for every caller: the correctness check (`cheap_check`), the audit's
`classify` and `_rank_and_pick`, the harvest patch, the D2 soft rule and
`scripts/quality/hero_replay.py`. A portrait of a prime minister, a flag, a
coat of arms, a locator map, a bear or a banknote is a file about something
else with the place's name in it (2026-11-17 research: 28 sure on the wire,
for example the Starmer portrait for Rothwell, a flag for Tenno).

Matching is on whole words of the file stem, never on a substring: "Beara"
is not "bear", "Flagstaff" is not "flag", "Naousa" is not "usa". A thumbnail
of a vector file is "960px-Flag.svg.png": the stem is read without the final
extension, so the inner ".svg" is a word and counts. The place's own name is
taken out first, so a beach called "President", a town called "Map" or a
"Plaza Mayor" does not trip a ban.

Pure and stdlib only: the pipeline, the box and the scorecard import it by
path.
"""
from __future__ import annotations

import re
import unicodedata
from urllib.parse import unquote

# (tag, words): a phrase is its words in order, with anything between
# non-word characters. Tags are the audit's, so a ban reads the same as a
# classify reason.
BANS = (
    ("portrait", ("portrait", "official portrait", "prime minister", "official photo",
                  "member of parliament", "constituency")),
    ("emblem", ("flag", "coat of arms", "badge", "wappen", "emblem", "seal of", "blason")),
    ("map", ("map", "locator", "location map", "postcode", "dialling", "dialing")),
    ("svg", ("svg",)),
    ("animal", ("grizzly", "bear")),
    ("not_photo", ("logo", "signature", "stamp", "banknote", "coin")),
)
_WORD = re.compile(r"[^\W_]+", re.UNICODE)


def _fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def words(text: str) -> list[str]:
    """The lower-case ASCII words of a file name or title."""
    return _WORD.findall(_fold(unquote(text or "")))


def stem_words(name_or_url: str) -> list[str]:
    """Words of the file stem: the last path part of a url or "File:" title,
    query dropped, the final extension dropped (so ".svg.png" keeps "svg")."""
    s = (name_or_url or "").split("?")[0].rsplit("/", 1)[-1]
    s = re.sub(r"^File:", "", unquote(s), flags=re.I)
    s = re.sub(r"\.(\w{2,5})$", "", s)
    return words(s)


def banned(name_or_url: str, subject: str = "") -> list[str]:
    """The ban tags a file trips, [] when it is clean. `subject` is the
    place's name: its own words are not read."""
    own = set(words(subject))
    ws = [w for w in stem_words(name_or_url) if w not in own]
    if re.search(r"\.svg(\.\w{2,5})?($|\?)", (name_or_url or "").split("?")[0], re.I) and "svg" not in ws:
        ws.append("svg")
    line = " " + " ".join(ws) + " "
    tags = []
    for tag, phrases in BANS:
        if any(" " + p + " " in line for p in phrases) and tag not in tags:
            tags.append(tag)
    return tags


def is_banned(name_or_url: str, subject: str = "") -> bool:
    return bool(banned(name_or_url, subject))
