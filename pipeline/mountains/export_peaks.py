"""Stage 3: score the enriched summits and publish the ones worth showing.

This is the gate. Everything upstream collects; this decides what a traveller
sees, and it is deliberately strict, because the promise on the tab is "the
best mountains in Europe" and a list padded with 700 m forest bumps breaks
that promise on the first screen.

A mountain is published when all of these hold:

  it has photographs        two freely licensed pictures that passed the
                            relevance filter, or one that is provably of this
                            mountain (a Wikidata P18). A mountain we cannot
                            show is a row of text, and this tab is not a
                            gazetteer.
  it has a real name        something beyond the local word for "hill".
  it clears the floor       MIN_SCORE on the index, so the tail of unnamed
                            ridges never reaches the wire.
  there is something to say at least one reason code.
  it is not a duplicate     of a better scoring entry on the same mountain.

Then two things happen that a plain ranking would not do, both of them
straight out of the research this layer was built from.

  every country gets an answer.  A pure score cut publishes forty Alpine
        summits and nothing for the Netherlands, Denmark or Malta, which is a
        true ranking and a useless product. So after the ranked cut, any
        country holding fewer than COUNTRY_FLOOR entries has its own best
        relaxed in, down to FLOOR_MIN_SCORE, and a CURATED entry can fill the
        floor at any score. The wire records which countries were filled that
        way. Nothing is invented: a country with four publishable mountains
        publishes four.
  the hidden gems are found.  Ranking by attention returns the mountains
        already on every itinerary. Quality is regressed on acclaim across
        everything published, and each mountain's residual becomes its gem
        score. It does not move the ranking. It is published so the app can
        offer the other list.

The output is a produced work, not a database extract: selected, scored,
described through reason codes, and cut to a few dozen rows a country.

Writes:
  continent-app/public/mountains/index.json    which countries have mountains
  continent-app/public/mountains/{CC}.json     the published mountains of one
  continent-app/public/mountains/top.json      the Europe wide opening page

Usage, from the repo root:
    python pipeline/mountains/export_peaks.py
    python pipeline/mountains/export_peaks.py --dry-run --verbose
    python pipeline/mountains/export_peaks.py --countries SI,HR

ASCII clean, no em dashes, per project convention.
"""

import argparse
import importlib.util
import json
import re
import statistics
import sys
import unicodedata
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from peak_sources import haversine_km, load_cache  # noqa: E402
from harvest_peaks import (COUNTRIES, COUNTRY_QID, fold,  # noqa: E402
                           name_tokens)
import peak_index as pi  # noqa: E402

ROOT = HERE.parents[1]


def photo_rank_block():
    """The photo engine's ranking model (pipeline/photos/selection.py),
    loaded by path like every cross-layer module. The gallery order in
    this wire was produced by it, so it ships with the data."""
    try:
        if "carta_photo_selection" not in sys.modules:
            spec = importlib.util.spec_from_file_location(
                "carta_photo_selection",
                ROOT / "pipeline" / "photos" / "selection.py")
            mod = importlib.util.module_from_spec(spec)
            sys.modules["carta_photo_selection"] = mod
            spec.loader.exec_module(mod)
        return sys.modules["carta_photo_selection"].MODEL
    except Exception:
        return None

# The lake layer's card-shape helpers, loaded by path exactly as
# enrich_peaks.py loads them: peaks, lakes and beaches all feed the same 25/12
# card, so the frame thresholds live in one file rather than three.
_LAKE_IMAGES = ROOT / "pipeline" / "lakes" / "lake_images.py"
if "carta_lake_images" in sys.modules:
    lake_images = sys.modules["carta_lake_images"]
else:
    _lake_spec = importlib.util.spec_from_file_location("carta_lake_images",
                                                        _LAKE_IMAGES)
    lake_images = importlib.util.module_from_spec(_lake_spec)
    sys.modules["carta_lake_images"] = lake_images
    _lake_spec.loader.exec_module(lake_images)
OUT_DIR = ROOT / "continent-app" / "public" / "mountains"

# How many photographs a mountain needs to be publishable. Two, unless one of
# them is EVIDENCE rather than a guess: a Wikidata P18 is a curated statement
# that this picture depicts this item, and one of those is worth more than two
# files a geosearch found in the same valley.
MIN_IMAGES = 2

# 5.0 rather than 5.5, which is roughly a third more mountains published.
#
# The tier cutoffs are what carry quality to the reader (6.2, 7.4, 8.5, and a
# band word on every card), so a 5.0 arrives labelled "worth a stop" rather
# than dressed up as one of Europe's best. Everything at this score still
# cleared every other gate: two photographs, a real name, measurements and at
# least one thing to say. Below it the rows stop being mountains anybody would
# travel for and start being the next bump along the ridge.
MIN_SCORE = 5.0
PUBLISH_MAX = 60
DUPLICATE_KM = 1.0

# The floor, and the reason it exists: without it the Netherlands publishes
# nothing, Denmark publishes nothing, and the tab quietly becomes "the Alps".
COUNTRY_FLOOR = 8
FLOOR_MIN_SCORE = 3.6

TOP_N = 240
TOP_PER_COUNTRY = 6

ATTRIBUTION = {
    "wikidata": "Mountain names, locations, elevations and prominence from "
                "Wikidata (CC0)",
    "osm": "Lifts, huts, paths and summit detail (c) OpenStreetMap "
           "contributors, ODbL",
    "commons": "Photographs from Wikimedia Commons, each under the licence "
               "shown on the picture",
    "wikipedia": "Facts drawn from Wikipedia articles (CC BY-SA), never their "
                 "wording",
}


def clean_url(url):
    """Strip the Commons API's own tracking parameters.

    imageinfo hands back thumbnails with ?utm_source=commons.wikimedia.org
    stapled on. They are harmless in a browser and poison anywhere the URL is
    treated as a path: splicing a width into one of these produces a 404."""
    return str(url or "").split("?", 1)[0]


# Card width. NOT a free choice: upload.wikimedia.org serves only a fixed list
# of thumbnail widths and answers anything else with a 400 and "Use thumbnail
# sizes listed on https://w.wiki/GHai". 640, 800 and 320 are refused; 500 and
# 960 are not, and 500 is what the rest of this repo ships.
CARD_PX = 500

# How many pictures in one gallery may rest on category filing alone, and how
# short the gallery has to be for them to be worth having at all.
WEAK_SLOTS = 2
WEAK_UNTIL = 3


def small_url(url):
    if not url or "/thumb/" not in url:
        return url
    return re.sub(r"/\d+px-", f"/{CARD_PX}px-", url, count=1)


# Which of the photographs already chosen should be the HERO.
#
# The enrich stage decides which six files are of this mountain. This decides
# which of them leads, and it is a separate question: a photograph taken FROM
# the summit is a real picture of the mountain's view and a poor picture of
# the mountain, and a picture of the cable car cabin is a picture of a machine.
BACKDROP_RE = re.compile(
    r"in the background|hintergrund|from the summit|vom gipfel|view from|"
    r"blick vom|panorama from|seen from the", re.I)
# The machinery, in the languages these files are actually named in. Czechia's
# card led with "Snezka-stanice-lanovky-a-vyhled", a photograph of a cable car
# station with the mountain underneath it, and an English-only pattern had no
# way to know that.
MACHINE_RE = re.compile(
    r"cabin|kabine|chairlift|sessellift|piste|ski slope|skilift|"
    r"station building|talstation|bergstation|\bstation\b|stanice|"
    r"lanovk|seilbahn|funivia|funicolare|telepherique|teleferic|telecabine|"
    r"telesiege|kolejka|wyciag|zubacka|zahnradbahn|cremagliera|pylon|"
    r"\bmast\b|\bcable\b|drahtseil|gondola|gondel", re.I)
# Things that STAND on the mountain. Every one of these is a real photograph
# of the right place and a poor first picture of a mountain: Spain's card led
# with "At Teide Observatory 2019 054" until this line existed.
ON_IT_RE = re.compile(
    r"observator|telescope|museum|refuge|refugio|rifugio|h[uü]tte|\bhut\b|"
    r"bouda|chata|schronisko|koca|menedekhaz|"
    r"chapel|kapelle|church|kostel|\bcross\b|kreuz|kriz|croce|monument|"
    r"antenna|vysilac|transmitter|restaurant|restaurace|\bsign\b|schild|"
    r"marker|plaque|terrace|terasa", re.I)


# Commons' own verdict on a photograph, which is the closest thing this
# pipeline has to a human saying "that one is beautiful".
STAR_VALUE = {"featured": 3.0, "quality": 2.0, "valued": 1.2}


def lead_score(img, peak):
    """How well this file works as the one picture on a card.

    Reads the evidence the enrich stage recorded (why it was picked, whether
    it names the mountain, what Commons thinks of it) before falling back to
    the file name, because by the time a file reaches here the question is no
    longer "is this the right mountain" but "is this the best picture of it"."""
    title = str(img.get("file") or "")
    if title.startswith("File:"):
        title = title[5:]
    folded = re.sub(r"[^a-z0-9 ]+", " ",
                    unicodedata.normalize("NFKD", title.lower()))
    tokens = name_tokens(peak.get("name")) | name_tokens(peak.get("name_local"))
    score = 0.0
    for word in str(img.get("stars") or "").split("|"):
        score += STAR_VALUE.get(word.strip().lower(), 0.0)
    if img.get("why") == "article":
        score += 1.0                    # an editor chose it to illustrate this
    head = " ".join(folded.split()[:3])
    if tokens and any(t in head for t in tokens):
        score += 2.0                    # the file is NAMED after the mountain
    elif img.get("named") or (tokens and any(t in folded for t in tokens)):
        score += 0.6
    if img.get("pinned"):
        score += 2.5                    # Wikidata says this depicts it
    if BACKDROP_RE.search(folded):
        score -= 2.0
    if MACHINE_RE.search(folded):
        score -= 1.4
    if ON_IT_RE.search(folded):
        score -= 1.1
    width, height = img.get("w") or 0, img.get("h") or 0
    if width and height and width > height:
        score += 0.5                    # a card is a landscape crop
    if width >= 1200:
        score += 0.3
    return score


# The evidence vocabulary, the same key the beach wire ships as "ev". These
# are the claims a file can make about its mountain; "unk" is what a legacy
# cache row degrades to when nothing recorded or derivable supports one.
REAL_EVIDENCE = ("p18", "name", "article", "cat", "geo")

# Rows where a re-enriched cache (one that records evidence) still produced a
# gallery with none. Collected during wiring, merged into the validation
# failures in main for the rows that actually publish: that is the beaches'
# strictness, applied only where the cache can honestly answer the question.
EV_FAILURES = []


def image_evidence(img, tokens):
    """(evidence, recorded) for one cached image.

    The enrich stage now records `evidence` at pick time. Every cache enriched
    before that records none, and re-photographing 43 countries to add a tag
    would be absurd, so a missing tag is derived from what those caches DID
    keep: the Wikidata pin, the named flag, the source that found the file,
    and finally the mountain's own tokens in the Commons file name (folded
    through harvest_peaks.fold, whose table covers the letters NFKD leaves
    alone: o-slash, ae, l-stroke, eth, thorn). A file that supports nothing is
    tagged "unk" and counted, never dropped: a legacy cache is a cache, not a
    bug."""
    recorded = img.get("evidence")
    if recorded in REAL_EVIDENCE:
        return recorded, True
    if img.get("pinned"):
        return "p18", False
    if img.get("named"):
        return "name", False
    if img.get("why") == "article":
        return "article", False
    if img.get("why") == "category":
        return "cat", False
    title = str(img.get("file") or "")
    if title.startswith("File:"):
        title = title[5:]
    if tokens and any(t in fold(title) for t in tokens):
        return "name", False
    return "unk", False


def wire_images(peak):
    tokens = name_tokens(peak.get("name")) | name_tokens(peak.get("name_local"))
    source_imgs = peak.get("images") or []
    # Whether the cache this row came from records evidence at all. Legacy
    # caches do not, and they are tolerated: derived below, warned about in
    # the export summary, never fatal.
    re_enriched = any("evidence" in img for img in source_imgs)
    out = []
    for img in source_imgs:
        url = clean_url(img.get("url"))
        if not url:
            continue
        ev, ev_recorded = image_evidence(img, tokens)
        out.append({
            "u": small_url(url),
            "big": url,
            "w": img.get("w"),
            "h": img.get("h"),
            # Commons Artist fields arrive with trailing commas and with
            # non-breaking spaces that str.strip(" ,;") does not touch, and the
            # result is a credit line reading "Sharon Hahn Darlin , CC BY 2.0".
            # A licence notice is the last thing that should look careless.
            "by": re.sub(r"^[\s,;]+|[\s,;]+$", "",
                         img.get("author") or "", flags=re.UNICODE),
            "lic": (img.get("license") or "").strip(),
            "licUrl": img.get("license_url") or "",
            "page": img.get("page") or "",
            # WHY this picture is on this mountain, same key as the beach
            # wire, so the claim can be audited from the outside rather than
            # trusted. "unk" marks a legacy cache row nothing supports.
            "ev": ev,
            "_rec": ev_recorded,
            "_lead": lead_score(img, peak),
            # Strong means somebody said this file is OF this mountain: it
            # names it, or the mountain's own article uses it, or Wikidata
            # pinned it and it names the mountain too.
            "_strong": bool(img.get("named") or img.get("why") == "article"
                            or (img.get("pinned") and img.get("named"))),
        })
    # Stable: equal scores keep the enrich stage's own order. A rescored
    # row (pipeline/photos/rescore.py) already encodes the whole ranking in
    # its cache order: beauty hero first, vetoed files last, one image per
    # dedupe cluster ahead of its twins, the P18 bonus applied. That is
    # strictly more than lead_score can see, so the cache order stands
    # wherever the beauty engine has spoken.
    if not any(img.get("beauty") is not None for img in source_imgs):
        out.sort(key=lambda i: -i["_lead"])

    # A gallery is allowed at most WEAK_SLOTS pictures that never name the
    # mountain, and only while it is still short.
    #
    # Those come in on category filing alone, which on Commons is as true of
    # "the mountain is the subject" as of "the mountain is on the skyline", so
    # they are worth one or two slots on a mountain with nothing else and
    # worth none at all on a mountain with six photographs of its own. Filtered
    # here rather than in the enrich stage because the cache already holds the
    # evidence, so tightening this costs no Commons request.
    kept, weak = [], 0
    for img in out:
        strong = img.pop("_strong")
        if not strong:
            if len(kept) >= WEAK_UNTIL or weak >= WEAK_SLOTS:
                continue
            weak += 1
        kept.append(img)
    for img in kept:
        img.pop("_lead")
    # Full strictness only where the cache can honestly answer: a re-enriched
    # cache that records evidence and still hands over a gallery where nothing
    # carries any is the beaches' abort case. A legacy cache, which records
    # nothing, only ever warns.
    if re_enriched and kept and not any(i["ev"] in REAL_EVIDENCE for i in kept):
        EV_FAILURES.append((peak_id(peak),
                            f"{peak['cc']}/{peak_id(peak)}: cache records "
                            f"image evidence and no kept image carries any"))
    # Last, inside the leading evidence tier only, prefer a lead that survives
    # the card crop: the card shows kept[0] cropped to 25:12, and a summit
    # panorama that wins on merit still reaches the reader as a thin ridge.
    return lake_images.lead_by_fit(kept, lambda i: (i.get("w"), i.get("h")),
                                   tier=lambda i: i.get("ev"))


def peak_id(peak):
    """Stable, readable, and unique even when two summits share a name.

    The Wikidata id is the tail for exactly that reason: Rysy is published
    under Poland and under Slovakia, and Mount Olympus is a summit in Greece
    and another one in Cyprus."""
    slug = re.sub(r"[^a-z0-9]+", "-", fold(peak.get("name") or "")).strip("-")
    return f"{peak['cc'].lower()}-{slug[:38] or 'peak'}-{peak.get('wd') or 'x'}"


def wiki_ref(peak, cc):
    """The article link, as a URL rather than a "lang:Title" pair, because
    that is what the page puts in an href."""
    if peak.get("wiki_en"):
        return ("https://en.wikipedia.org/wiki/"
                + urllib.parse.quote(peak["wiki_en"].replace(" ", "_")))
    if peak.get("wiki_local"):
        from harvest_peaks import LOCAL_LANG
        lang = LOCAL_LANG.get(cc, "en")
        return (f"https://{lang}.wikipedia.org/wiki/"
                + urllib.parse.quote(peak["wiki_local"].replace(" ", "_")))
    return ""


def credits_of(peak):
    """The attribution sentences this row owes, which the page prints under
    the sources block and the index collects for the credits screen."""
    keys = {"wikidata", "commons"}
    if peak.get("osm"):
        keys.add("osm")
    if peak.get("facts"):
        keys.add("wikipedia")
    return [ATTRIBUTION[k] for k in sorted(keys)]


def display_name(peak):
    """The name to publish, which is not always Wikidata's English label.

    The label is right almost always ("Matterhorn", "Mount Etna", "Snowdon")
    and occasionally a translation nobody uses: Velika Planina is labelled
    "Big Pasture Plateau", which is what a dictionary would say and not what
    is on the signpost, the bus timetable or the cable car.

    The rule is narrow on purpose. A SEEDED row where a human wrote a name
    that folds differently from the English label is a case where the label
    lost, so the LOCAL label wins. The seed's own spelling is not used: it is
    ASCII by file convention, and shipping "Mons Klint" for Moens Klint would
    trade one wrong name for another."""
    name = peak.get("name") or ""
    seeded = (peak.get("seed") or {}).get("name")
    local = peak.get("name_local") or ""
    if seeded and local and fold(seeded) != fold(name) and fold(seeded) == fold(local):
        return local
    return name


def wire_peak(peak, comps, score10, tier, reasons, expected):
    kind = pi.kind_of(peak)
    lift = pi.lift_of(peak)
    images = wire_images(peak)
    row = {
        "id": peak_id(peak),
        "wd": peak.get("wd") or "",
        "name": display_name(peak),
        "cc": peak["cc"],
        "kind": kind,
        "lat": round(peak["lat"], 6),
        "lon": round(peak["lon"], 6),
        "score": score10,
        "tier": tier,
        # The three headline figures. Access and experience rest almost
        # entirely on the Overpass sweep, so where that has not run they are
        # dropped rather than published as an invented neutral value: a
        # figure a traveller reads is held to a higher bar than a term inside
        # a weighted sum.
        # Only the components this row actually had evidence for. A figure a
        # traveller reads is held to a higher bar than a term inside a
        # weighted sum: peak_index drops a component rather than scoring it
        # zero when nothing was asked, and the page shows two tiles instead of
        # three rather than printing an invented 0 out of 10.
        "sub": {k: round(comps[k], 3) for k in pi.SUB_SCORES if k in comps},
        "comp": {k: round(v, 3) for k, v in comps.items()},
        "measured": bool(pi.measured(peak)),
        "gem": pi.gem_score(comps, expected),
        "why": reasons,
        "tags": pi.tags_for(reasons),
        "bestFor": pi.best_for(comps, reasons),
        "hazards": pi.hazard_codes(peak),
        "images": images,
        "credit": credits_of(peak),
    }
    row["t"] = "r"
    # Stored by enrich (assign.stamp_rows), read back here: the export never
    # recomputes an assignment, so it never needs the spine loadable.
    if peak.get("rg"):
        row["rg"] = peak["rg"]
    # The other name, when there is one. Never a repeat of what was just
    # published, and never Wikidata's English label when that is what the row
    # is already called.
    other = (peak.get("name_local") if row["name"] != peak.get("name_local")
             else peak.get("name"))
    if other and fold(other) != fold(row["name"]):
        row["nameLocal"] = other
    if peak.get("ele") is not None:
        row["ele"] = int(round(peak["ele"]))
    # Prominence, unless the source contradicts itself. Wikidata gives
    # Kopsenni in the Faroes 698 m of elevation and 789 m of prominence, and a
    # summit cannot rise further above its own connecting pass than it rises
    # above the sea. Elevation is the better attested of the two, so the
    # prominence is simply not published: no figure beats a wrong figure, and
    # one bad row should not stop 634 good ones from reaching the wire.
    if peak.get("prom") is not None and (
            peak.get("ele") is None or peak["prom"] <= peak["ele"] + 50):
        row["prom"] = int(round(peak["prom"]))
    if peak.get("iso_km") is not None:
        row["isoKm"] = peak["iso_km"]
    if peak.get("range"):
        row["range"] = peak["range"][:60]
    if peak.get("highpoint_of"):
        row["highpointOf"] = peak["highpoint_of"][:60]
    if lift:
        row["lift"] = lift
    if peak.get("season"):
        row["season"] = peak["season"]
    if peak.get("near"):
        row["near"] = peak["near"]
    if wiki_ref(peak, peak["cc"]):
        row["wiki"] = wiki_ref(peak, peak["cc"])
    return row


def evidenced_image(peak):
    """One photograph is enough when it is EVIDENCE that it shows this
    mountain: Wikidata's P18, or a file named after it."""
    tokens = name_tokens(peak.get("name")) | name_tokens(peak.get("name_local"))
    for img in peak.get("images") or []:
        if img.get("pinned"):
            return True
        title = str(img.get("file") or "")
        if tokens and any(t in fold(title) for t in tokens):
            return True
    return False


def in_country(peak, cc):
    """Whether Wikidata says this mountain is in the country it arrived under.

    The spine is tiled by bounding box for the big countries, so Switzerland's
    tile contains Mont Blanc and Italy's contains Triglav. Both are true
    statements about a rectangle and wrong answers on a country page, and a
    reader spots "Mont Blanc, Switzerland" instantly.

    A border mountain keeps every country P17 gives it, which is the point:
    the Matterhorn is published under Switzerland AND Italy, because each side
    has its own approach and its own base town. A row with no P17 at all is
    kept rather than dropped: the check is here to catch a wrong country, not
    to punish a thin item."""
    countries = peak.get("countries")
    if not countries:
        return True
    return COUNTRY_QID.get(cc) in countries


def publishable(peak, cc=None):
    """The gate, minus the score (which needs the whole country first)."""
    images = peak.get("images") or []
    if not images:
        return False
    if len(images) < MIN_IMAGES and not evidenced_image(peak):
        return False
    if not name_tokens(peak.get("name")):
        return False
    # A row with nothing but a name and a coordinate is a gazetteer entry.
    if peak.get("ele") is None and not peak.get("seed"):
        return False
    if cc and not in_country(peak, cc):
        return False
    return True


def score_country(cc, global_max):
    rich = load_cache("rich", cc)
    if not rich or not rich.get("peaks"):
        return []
    peaks = rich["peaks"]
    fames = [pi.fame_raw(p) for p in peaks] or [1.0]
    country_max = max(fames) or 1.0
    # The tallest thing in THIS country, which is what relative height is
    # measured against. Denmark's mountains are measured against Denmark.
    ele_max = max([p.get("ele") or 0 for p in peaks] or [1]) or 1
    scored = []
    for peak in peaks:
        comps, score10 = pi.score_peak(peak, country_max, global_max, ele_max)
        scored.append((peak, comps, score10))
    return scored


def fit_expectation(rows):
    """Least squares fit of quality on acclaim over everything scored.

    Returns f(acclaim) -> expected quality. Below 40 points the fit is refused
    and every mountain's expectation becomes the mean quality, which makes the
    gem score the plain "better than average" it degrades to rather than a
    fiction."""
    points = [(c["acclaim"], pi.quality_of(c)) for _p, c, _s in rows]
    if len(points) < 40:
        mean = statistics.fmean(q for _a, q in points) if points else 0.5
        return lambda acclaim: mean
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    mean_x, mean_y = statistics.fmean(xs), statistics.fmean(ys)
    var = sum((x - mean_x) ** 2 for x in xs)
    if var <= 1e-9:
        return lambda acclaim: mean_y
    slope = sum((x - mean_x) * (y - mean_y) for x, y in points) / var
    intercept = mean_y - slope * mean_x
    return lambda acclaim: intercept + slope * acclaim


def provenance(countries):
    """Which snapshot of each source this build stands on."""
    out = {"harvested": {}, "enriched": {}}
    for cc in countries:
        raw = load_cache("raw", cc)
        rich = load_cache("rich", cc)
        if raw and raw.get("harvested_at"):
            out["harvested"][cc] = raw["harvested_at"]
        if rich and rich.get("enriched_at"):
            out["enriched"][cc] = rich["enriched_at"]
    return out


def _region_quotas():
    """pipeline/regions/quotas.py under a neutral name. Loaded lazily and
    tolerated missing: an export on a clone without the region spine skips
    the quota step rather than refusing to ship."""
    mod = sys.modules.get("carta_region_quotas")
    if mod is None:
        path = HERE.parents[1] / "pipeline" / "regions" / "quotas.py"
        try:
            spec = importlib.util.spec_from_file_location("carta_region_quotas",
                                                          path)
            mod = importlib.util.module_from_spec(spec)
            sys.modules["carta_region_quotas"] = mod
            spec.loader.exec_module(mod)
        except Exception:
            return None
    return mod


def region_key(row):
    """The unit a mountain is budgeted in: its GMBA range, its NUTS3 region
    where no range contains it (a lone hill on a plain), the country as a
    last resort."""
    rg = row.get("rg") or {}
    return rg.get("ra") or rg.get("n3") or row["cc"]


def quota_ordered(rows, qmod):
    """Step 3 of the gate: the region quota. Rows are grouped per range,
    ranked within their group, cut at the group's quota, then re-ordered so
    every range's first pick outranks any range's second. The country cap
    that follows trims the Alps' fortieth peak before the Jura's third."""
    if qmod is None or not qmod.has_data():
        print("  region quotas unavailable, quota step skipped")
        return rows
    groups = {}
    for row in rows:
        groups.setdefault(region_key(row), []).append(row)
    ranked = []
    for key, group in groups.items():
        try:
            target = qmod.published_target(key, "mountain")
        except KeyError:
            target = len(group)
        if target <= 0:
            # Not applicable is a statement about quotas, never a ban.
            target = len(group)
        for rank, row in enumerate(sorted(group, key=lambda r: -r["score"])):
            if rank >= target:
                break
            ranked.append((rank, -row["score"], row["id"], row))
    ranked.sort(key=lambda t: t[:3])
    return [row for _, _, _, row in ranked]


def wire_listed(peak):
    """A listed card: verified to exist, named, deduped, in region, and NOT
    scored. The score key is absent rather than null, which is the only
    reliable way to guarantee the app cannot render a number nobody earned."""
    images = wire_images(peak)[:2]
    for img in images:
        img.pop("_rec", None)  # the private marker never reaches the wire
    row = {
        "id": peak_id(peak),
        "name": display_name(peak),
        "cc": peak["cc"],
        "kind": pi.kind_of(peak),
        "lat": round(peak["lat"], 6),
        "lon": round(peak["lon"], 6),
        "t": "l",
        "why": [{"k": "unrated_coverage"}],
        "images": images,
        "credit": credits_of(peak),
    }
    if peak.get("rg"):
        row["rg"] = peak["rg"]
    if peak.get("wd"):
        row["wd"] = peak["wd"]
    if peak.get("ele") is not None:
        row["ele"] = peak["ele"]
    return row


def region_floor_fill(rated, pool, qmod):
    """Step 4 of the gate, the REGION floor (the country floor above only
    ever adds scored rows and stays as it was). For any applicable region
    the gates left empty, the best remaining candidate is promoted to tier
    'l': no score in the wire, one evidenced photograph preferred but not
    demanded of a row whose whole job is to keep a page honest about what
    exists."""
    if qmod is None or not qmod.has_data():
        return []
    have = {}
    for row in rated:
        n3 = (row.get("rg") or {}).get("n3")
        if n3:
            have[n3] = have.get(n3, 0) + 1
    pools = {}
    for peak, comps, score10 in pool:
        n3 = (peak.get("rg") or {}).get("n3")
        if not n3 or have.get(n3):
            continue
        pools.setdefault(n3, []).append((peak, score10))
    listed = []
    for n3, cands in pools.items():
        if not qmod.applicable(n3, "mountain"):
            continue
        room = qmod.floor(n3, "mountain")
        cands.sort(key=lambda t: (0 if evidenced_image(t[0]) else 1, -t[1]))
        for peak, _score in cands[:room]:
            listed.append(wire_listed(peak))
    return listed


def validate_listed(rows):
    """Listed rows have their own bar: real name, real place, no score of
    any spelling, and any image still carries its licence."""
    bad = []
    for row in rows:
        where = f"{row['cc']}/{row['id']}"
        if "score" in row or "tier" in row or "comp" in row:
            bad.append(f"{where}: listed row carries a score key")
        if not row["name"].strip():
            bad.append(f"{where}: no name")
        if not (-90 <= row["lat"] <= 90) or not (-180 <= row["lon"] <= 180):
            bad.append(f"{where}: coordinates off the earth")
        for img in row.get("images") or []:
            if not img.get("lic"):
                bad.append(f"{where}: an image carries no licence")
            if "_rec" in img:
                bad.append(f"{where}: a private image marker reached the wire")
    return bad


def validate(rows):
    """The gate's own self-check, run over what is about to be written.

    A non-empty list stops the export, because a mountain with no credit, a
    broken image URL or an elevation off the scale is worse than no mountain."""
    bad = []
    seen = set()
    for row in rows:
        where = f"{row['cc']}/{row['id']}"
        if row["id"] in seen:
            bad.append(f"{where}: duplicate id")
        seen.add(row["id"])
        if not row["name"].strip():
            bad.append(f"{where}: no name")
        if not (0 <= row["score"] <= 10):
            bad.append(f"{where}: score {row['score']} is off the scale")
        if not row["images"]:
            bad.append(f"{where}: no images")
        for img in row["images"]:
            if not str(img.get("u", "")).startswith("https://"):
                bad.append(f"{where}: image is not https")
            if not img.get("lic"):
                bad.append(f"{where}: an image carries no licence")
        if not row["credit"]:
            bad.append(f"{where}: no attribution")
        if not row["why"]:
            bad.append(f"{where}: nothing to say about it (gate leak)")
        if not (-90 <= row["lat"] <= 90) or not (-180 <= row["lon"] <= 180):
            bad.append(f"{where}: coordinates off the earth")
        # Europe's highest is 5,642 m and its deepest published summit here
        # should never be below sea level: an elevation outside that is a unit
        # that was read as metres and was not.
        ele = row.get("ele")
        if ele is not None and not (-20 <= ele <= 5700):
            bad.append(f"{where}: elevation {ele} is not a European summit")
        prom = row.get("prom")
        if prom is not None and ele is not None and prom > ele + 50:
            bad.append(f"{where}: prominence {prom} exceeds elevation {ele}")
        # The safety invariant. Hazards are codes, never sentences, and a
        # glaciated summit that claims a cable car to the top with no source
        # would be the one thing here that could send somebody somewhere.
        lift = row.get("lift")
        if lift and lift.get("src") not in ("osm", "curated", "wiki"):
            bad.append(f"{where}: lift with no source")
        # A Wikipedia mention is evidence that lifts exist on the mountain and
        # no evidence that one reaches this summit, so it may only ever carry
        # the weakest claim. Anything stronger from that source is a bug.
        if lift and lift.get("src") == "wiki" and lift.get("kind") != "liftsNearby":
            bad.append(f"{where}: {lift.get('kind')} claimed from an article mention")
        if row.get("t") != "r":
            bad.append(f"{where}: rated row without t='r'")
        # Every published row carries its region block. A row whose rg has
        # no n3 is the documented handful outside the admin spine (the h4
        # cell still places it); a row with no rg at all was never stamped.
        if not row.get("rg"):
            bad.append(f"{where}: no region assignment (run "
                       f"pipeline/oneoff/backfill_regions.py)")
    return bad


def dedupe(rows):
    """One row per mountain, and one lead photograph per row.

    Two things get dropped here, both of which show up as the same mountain
    twice in a list. The first is a Wikidata item for a summit that also has
    an item for the massif under it, 400 m apart under names that share a
    token. The second comes from the photograph fallback: a minor top with no
    file named after it borrows a Commons photograph taken nearby, which is
    right for a lone hill and wrong for a ridge of five, where all five end up
    under the same picture."""
    kept, leads = [], set()
    for row in rows:
        # A summit with photographs of its own keeps its place on the next one
        # nobody else is leading with; only a summit whose every picture is
        # already somebody else's is dropped as a borrowed view.
        images = lake_images.reseat_lead(row.get("images") or [], leads,
                                         tier=lambda i: i.get("ev"))
        if images is None:
            continue
        row["images"] = images
        lead = images[0]["u"] if images else None
        if any(haversine_km(row["lat"], row["lon"], other["lat"], other["lon"])
               <= DUPLICATE_KM for other in kept):
            continue
        if lead:
            leads.add(lead)
        kept.append(row)
    return kept


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--out", default=str(OUT_DIR))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--min-score", type=float, default=MIN_SCORE)
    parser.add_argument("--max-per-country", type=int, default=PUBLISH_MAX)
    parser.add_argument("--floor", type=int, default=COUNTRY_FLOOR)
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or COUNTRIES

    # The Europe wide fame ceiling has to be known before any country can be
    # scored, so fame is read once over everything enriched.
    global_max = 1.0
    pools = {}
    for cc in countries:
        rich = load_cache("rich", cc)
        if not rich or not rich.get("peaks"):
            continue
        pools[cc] = rich["peaks"]
        for peak in rich["peaks"]:
            global_max = max(global_max, pi.fame_raw(peak))

    # Score everything first, fit the fame expectation on all of it, and only
    # then build rows: the gem score is a residual against the whole field, so
    # it cannot be computed one country at a time.
    scored_by_cc = {cc: score_country(cc, global_max) for cc in countries
                    if cc in pools}
    expectation = fit_expectation(
        [t for rows in scored_by_cc.values() for t in rows])

    out_dir = Path(args.out)
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    qmod = _region_quotas()
    index = []
    published = []
    listed_all = []
    by_country = {}
    listed_by_country = {}
    filled = {}
    total = 0
    credits = set()

    for cc in countries:
        scored = scored_by_cc.get(cc) or []
        if not scored:
            continue
        rows, spare, unrated_pool = [], [], []
        for peak, comps, score10 in sorted(scored,
                                           key=lambda t: (-t[2], t[0]["name"])):
            # The photo gate no longer deletes the pool before the floor can
            # reach it. This is the standing COUNTRY_FLOOR=8 bug: the floor
            # relaxed the score, but publishable() had already emptied the
            # spare list of every peak short a photograph, so Lithuania sat
            # at 4 mountains with a floor of 8. A named peak inside its
            # country now falls through to the region floor as a listed
            # candidate instead of vanishing.
            if not publishable(peak, cc):
                if name_tokens(peak.get("name")) and in_country(peak, cc):
                    unrated_pool.append((peak, comps, score10))
                continue
            reasons = pi.reasons_for(peak, comps)
            if not reasons:
                unrated_pool.append((peak, comps, score10))
                continue
            row = wire_peak(peak, comps, score10, pi.tier_for(score10),
                            reasons, expectation(comps["acclaim"]))
            # A mountain the research brief names is published whatever it
            # scores, provided it cleared every other gate. That is what the
            # seed is FOR: Kirkjufell is the most photographed mountain in
            # Iceland and scores 4.8, because it is 463 m high, has almost no
            # prominence, and shares a country with Eyjafjallajokull, which
            # owns the fame scale. A "best mountains in Europe" list without
            # it is wrong in the way a reader notices in five seconds.
            brief = (peak.get("seed") or {}).get("why") == "brief"
            if score10 >= args.min_score or brief:
                rows.append(row)
            elif score10 >= FLOOR_MIN_SCORE or peak.get("seed"):
                # A SEEDED entry can always fill a country's floor, whatever
                # it scores. That is what the seed is for: the highest point
                # of Lithuania is a 294 m rise in a forest with a platform on
                # it, and it scores what a model built for the Alps would
                # score it. It is also the answer to "what is the mountain in
                # Lithuania", and a human put it on the list knowing exactly
                # that. The score still decides the ORDER and the cap still
                # decides how many.
                spare.append(row)
        rows = dedupe(rows)
        rows = quota_ordered(rows, qmod)[:args.max_per_country]
        rows.sort(key=lambda r: -r["score"])

        if len(rows) < args.floor and spare:
            room = args.floor - len(rows)
            have = {r["id"] for r in rows}
            extra = [r for r in dedupe(rows + spare)
                     if r["id"] not in have][:room]
            if extra:
                filled[cc] = len(extra)
                rows = rows + extra

        # The REGION floor: applicable regions the gates left empty get
        # their best remaining candidate as a listed row, no score shipped.
        listed = region_floor_fill(rows, unrated_pool, qmod)
        if not rows and not listed:
            if args.verbose:
                print(f"  {cc}: nothing clears the gate")
            continue
        if not rows:
            listed_by_country[cc] = listed
            listed_all.extend(listed)
            for row in listed:
                credits.update(row["credit"])
            by_country[cc] = []
            continue

        for row in rows:
            credits.update(row["credit"])
        for row in listed:
            credits.update(row["credit"])
        if listed:
            listed_by_country[cc] = listed
            listed_all.extend(listed)
        published.extend(rows)
        total += len(rows)
        cover = next((r["images"][0]["u"] for r in rows if r["images"]), "")
        index.append({
            "cc": cc,
            "n": len(rows),
            "best": rows[0]["score"],
            "cover": cover,
            "top": [r["name"] for r in rows[:3]],
            "lifted": sum(1 for r in rows if r.get("lift")
                          and r["lift"]["kind"] != "liftsNearby"),
        })
        if filled.get(cc):
            index[-1]["filled"] = filled[cc]
        if listed:
            index[-1]["listed"] = len(listed)
        by_country[cc] = rows
        if args.dry_run or args.verbose:
            note = f" [+{filled[cc]} to reach the floor]" if filled.get(cc) else ""
            print(f"  {cc}: {len(rows)} mountains, best {rows[0]['score']} "
                  f"({rows[0]['name']}){note}")

    # Validate BEFORE anything is written. Scoring every country first and
    # writing afterwards is the whole point: a gate that fires after half the
    # files are on disk has not gated anything.
    failures = validate(published) + validate_listed(listed_all)
    # The evidence gate's own failures, filtered to the rows that actually
    # publish: a spare that never reached the wire cannot stop the export.
    pub_ids = {r["id"] for r in published}
    failures += [msg for rid, msg in EV_FAILURES if rid in pub_ids]
    if failures:
        for line in failures[:20]:
            print(f"  FAIL {line}")
        print(f"[mountains] {len(failures)} validation failures, nothing written")
        raise SystemExit(1)

    # The evidence ledger over what is about to ship, and the point where the
    # private recorded/derived marker leaves the rows. Derived evidence is
    # normal for a legacy cache; "unk" is counted and warned about, and goes
    # away for a country the day its cache is re-enriched.
    ev_stats = {"recorded": 0, "derived": 0, "unk": 0}
    ev_kinds = {}
    for row in published:
        for img in row["images"]:
            recorded = img.pop("_rec", False)
            ev_kinds[img["ev"]] = ev_kinds.get(img["ev"], 0) + 1
            if recorded:
                ev_stats["recorded"] += 1
            elif img["ev"] == "unk":
                ev_stats["unk"] += 1
            else:
                ev_stats["derived"] += 1
    kinds = ", ".join(f"{k} {v}" for k, v in sorted(ev_kinds.items()))
    print(f"[mountains] image evidence: {ev_stats['recorded']} recorded, "
          f"{ev_stats['derived']} derived, {ev_stats['unk']} unknown "
          f"({kinds})")
    if ev_stats["unk"]:
        print(f"[mountains] WARNING: {ev_stats['unk']} published images carry "
              f"no derivable evidence (ev=unk); re-enrich those countries to "
              f"record it")

    # The Europe wide opening page, taken from what was just published so it
    # can never disagree with the country files. One row per MOUNTAIN: a
    # border summit is deliberately published under each of its countries,
    # because each side has its own approach and its own base town, but on the
    # Europe wide page that is two identical cards under one photograph, so
    # the higher scoring side wins.
    top = []
    per_country = {}
    seen_peak, seen_lead = set(), set()
    for row in sorted(published, key=lambda r: (-r["score"], r["id"])):
        wd = row.get("wd") or ""
        lead = row["images"][0]["u"] if row["images"] else ""
        if (wd and wd in seen_peak) or (lead and lead in seen_lead):
            continue
        if per_country.get(row["cc"], 0) >= TOP_PER_COUNTRY:
            continue
        per_country[row["cc"]] = per_country.get(row["cc"], 0) + 1
        if wd:
            seen_peak.add(wd)
        if lead:
            seen_lead.add(lead)
        top.append(row)
        if len(top) >= TOP_N:
            break

    absent = {cc: "nothing cleared the gate" for cc in countries
              if cc not in by_country}

    index.sort(key=lambda c: -c["n"])
    payload = {
        "generated_at": generated,
        "n_mountains": total,
        "model": {
            "version": pi.MODEL_VERSION,
            "weights": pi.WEIGHTS,
            "standout_bonus": pi.STANDOUT_BONUS,
            # The photo engine that ordered every gallery in this wire
            # (pipeline/photos/selection.py), shipped with the data so a
            # reader can see which weights picked each hero (invariant 2).
            "photo_rank": photo_rank_block(),
            "sub_scores": list(pi.SUB_SCORES),
            "tier_cutoffs": pi.TIER_CUTOFFS,
            "min_score": args.min_score,
            "min_images": MIN_IMAGES,
            "min_images_note": "two photographs, or one that is provably of "
                               "this mountain (a Wikidata P18 or a file named "
                               "after it)",
            "country_floor": args.floor,
            # The region quota model ships with the data (invariant 2).
            "region_quota": (qmod.model_block()
                             if qmod is not None and qmod.has_data() else None),
            "season_model": "Snow free months estimated from elevation and "
                            "latitude, not from a forecast or a lift "
                            "operator's calendar. Estimated, not measured.",
            "lift_note": "A lift is claimed only from OpenStreetMap geometry "
                         "within 700 m of the summit, or from the curated "
                         "seed. Opening seasons are not in this layer.",
        },
        "countries": index,
        "absent": absent,
        "attribution": sorted(credits),
        "sources": provenance(countries),
    }
    if args.dry_run:
        print(f"[mountains] {total} publishable across {len(index)} countries")
        return
    out_dir.mkdir(parents=True, exist_ok=True)
    for cc, rows in by_country.items():
        path = out_dir / f"{cc}.json"
        envelope = {"country": cc, "generated_at": generated, "n": len(rows),
                    "mountains": rows}
        # A separate array, not a flag inside the main one: a screen has to
        # opt in to showing unscored rows, and they can never interleave
        # into a ranked list by accident.
        if listed_by_country.get(cc):
            envelope["listed"] = listed_by_country[cc]
        path.write_text(json.dumps(envelope, ensure_ascii=False,
                                   separators=(",", ":")), encoding="utf-8")
        if args.verbose:
            print(f"  {cc}: -> {path.name} ({path.stat().st_size // 1024} KB)")
    (out_dir / "index.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    (out_dir / "top.json").write_text(
        json.dumps({"generated_at": generated, "n": len(top),
                    "per_country_cap": TOP_PER_COUNTRY, "mountains": top},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print(f"[mountains] published {total} summits across {len(index)} "
          f"countries into {out_dir} (top.json holds {len(top)})")
    if filled:
        print(f"[mountains] countries filled to the floor: "
              f"{', '.join(f'{k}+{v}' for k, v in sorted(filled.items()))}")


if __name__ == "__main__":
    main()
