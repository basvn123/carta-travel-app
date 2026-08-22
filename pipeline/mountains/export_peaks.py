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


def wire_images(peak):
    out = []
    for img in peak.get("images") or []:
        url = clean_url(img.get("url"))
        if not url:
            continue
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
            "_lead": lead_score(img, peak),
            # Strong means somebody said this file is OF this mountain: it
            # names it, or the mountain's own article uses it, or Wikidata
            # pinned it and it names the mountain too.
            "_strong": bool(img.get("named") or img.get("why") == "article"
                            or (img.get("pinned") and img.get("named"))),
        })
    # Stable: equal scores keep the enrich stage's own order.
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
    return kept


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
        lead = row["images"][0]["u"] if row["images"] else None
        if lead and lead in leads:
            continue
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
    index = []
    published = []
    by_country = {}
    filled = {}
    total = 0
    credits = set()

    for cc in countries:
        scored = scored_by_cc.get(cc) or []
        if not scored:
            continue
        rows, spare = [], []
        for peak, comps, score10 in sorted(scored,
                                           key=lambda t: (-t[2], t[0]["name"])):
            if not publishable(peak, cc):
                continue
            reasons = pi.reasons_for(peak, comps)
            if not reasons:
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
        rows = dedupe(rows)[:args.max_per_country]

        if len(rows) < args.floor and spare:
            room = args.floor - len(rows)
            have = {r["id"] for r in rows}
            extra = [r for r in dedupe(rows + spare)
                     if r["id"] not in have][:room]
            if extra:
                filled[cc] = len(extra)
                rows = rows + extra
        if not rows:
            if args.verbose:
                print(f"  {cc}: nothing clears the gate")
            continue

        for row in rows:
            credits.update(row["credit"])
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
        by_country[cc] = rows
        if args.dry_run or args.verbose:
            note = f" [+{filled[cc]} to reach the floor]" if filled.get(cc) else ""
            print(f"  {cc}: {len(rows)} mountains, best {rows[0]['score']} "
                  f"({rows[0]['name']}){note}")

    # Validate BEFORE anything is written. Scoring every country first and
    # writing afterwards is the whole point: a gate that fires after half the
    # files are on disk has not gated anything.
    failures = validate(published)
    if failures:
        for line in failures[:20]:
            print(f"  FAIL {line}")
        print(f"[mountains] {len(failures)} validation failures, nothing written")
        raise SystemExit(1)

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
            "sub_scores": list(pi.SUB_SCORES),
            "tier_cutoffs": pi.TIER_CUTOFFS,
            "min_score": args.min_score,
            "min_images": MIN_IMAGES,
            "min_images_note": "two photographs, or one that is provably of "
                               "this mountain (a Wikidata P18 or a file named "
                               "after it)",
            "country_floor": args.floor,
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
        path.write_text(json.dumps(
            {"country": cc, "generated_at": generated, "n": len(rows),
             "mountains": rows}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
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
