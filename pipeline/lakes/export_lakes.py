"""Stage 3: score the enriched water bodies and publish the ones worth showing.

This is the gate. Everything upstream collects; this decides what a traveller
sees, and it is deliberately strict, because the promise on the tab is "the
best lakes in Europe" and a list padded with irrigation ponds breaks that
promise on the first screen.

A lake is published when all of these hold:

  it has photographs        two freely licensed pictures that passed the
                            relevance filter, or one that is provably of this
                            lake (see MIN_IMAGES). A lake we cannot show is a
                            row of text, and the tab is not a gazetteer.
  it has a real name        something beyond the local word for "lake".
  it clears the floor       MIN_SCORE on the index, so the tail of village
                            ponds never reaches the wire.
  there is something to say at least one reason code.
  it is not a duplicate     of a better scoring entry on the same water.

Then two things happen that the beach layer does not do, both of them
straight out of the research this layer was built from.

  every country gets an answer.  A pure score cut publishes thirty Alpine
        lakes and nothing for the Netherlands or Malta, which is a true
        ranking and a useless product. So after the ranked cut, any country
        holding fewer than COUNTRY_FLOOR entries has its own best relaxed in,
        down to FLOOR_MIN_SCORE, and a CURATED entry can fill the floor at any
        score. The wire records which countries were filled that way. Nothing
        is invented: a country with two publishable water bodies publishes
        two.
  the hidden gems are found.  Ranking by attention returns the lakes that are
        already on every itinerary. quality is regressed on acclaim across
        everything published, and each lake's residual becomes its gem score:
        how much better it is than its own fame predicts. It does not move the
        ranking. It is published so the app can offer the other list.

The output is a produced work, not a database extract: selected, scored,
described through reason codes, and cut to a few dozen rows a country.

Writes:
  continent-app/public/lakes/index.json    which countries have lakes
  continent-app/public/lakes/{CC}.json     the published lakes of one
  continent-app/public/lakes/top.json      the Europe wide opening page

Usage, from the repo root:
    python pipeline/lakes/export_lakes.py
    python pipeline/lakes/export_lakes.py --dry-run --verbose
    python pipeline/lakes/export_lakes.py --countries SI,HR
"""

import argparse
import importlib.util
import json
import re
import statistics
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from water_sources import haversine_km, load_cache  # noqa: E402
from harvest_lakes import COUNTRIES, fold, name_tokens  # noqa: E402
import lake_index as li  # noqa: E402
import lake_images  # noqa: E402
import seed_lakes  # noqa: E402

ROOT = HERE.parents[1]
OUT_DIR = ROOT / "continent-app" / "public" / "lakes"


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

# How many photographs a lake needs to be publishable.
#
# Two, unless one of them is EVIDENCE rather than a guess. The rule the beach
# layer uses is a flat two, and it exists because a beach found by a blind
# geosearch and shown under one borrowed photograph is a name on somebody
# else's picture. For lakes it dropped 618 of 3,809 shortlisted water bodies,
# including San Marino's only one, and 302 of those carried a Wikidata P18: a
# curated statement that this photograph depicts this lake.
#
# So the floor is two photographs OR one that is provably of this lake, which
# means the P18 or a file named after it. A blind geosearch hit on its own is
# still not enough, which is the case the original rule was protecting.
MIN_IMAGES = 2
MIN_SCORE = 5.4
PUBLISH_MAX = 60
DUPLICATE_KM = 1.2

# Per country coverage. Three is the number the research recommends as a
# minimum vetted set per country, and FLOOR_MIN_SCORE is the floor below which
# nothing is worth a traveller's attention even to fill a page.
COUNTRY_FLOOR = 4
FLOOR_MIN_SCORE = 4.0

# The Europe wide file the tab opens on. Capped per country on purpose: the
# raw top 200 of Europe is the Alps twice over, which is a true ranking and a
# useless first page. Six a country makes it a tour of the continent, and
# typing a country's name still opens its full list.
TOP_N = 200
TOP_PER_COUNTRY = 6

ATTRIBUTION = {
    "wikidata": "Lake names, locations and measurements from Wikidata (CC0)",
    "osm": "Shore detail (c) OpenStreetMap contributors, ODbL",
    "eea": "Bathing water quality: European Environment Agency, WISE Bathing "
           "Water Directive data, and the Member State authorities that "
           "report it",
    "commons": "Photographs from Wikimedia Commons, each under the licence "
               "shown on the picture",
    "worldclim": "Swimming season estimated from WorldClim 2.1 climate "
                 "normals, not measured water temperature",
}


def commons_filename(url_or_name):
    """The Commons file title behind a Wikidata P18 value. Duplicated from
    enrich_lakes rather than imported, because importing that module here
    would pull the WorldClim raster reader into the export stage."""
    if not url_or_name:
        return ""
    text = str(url_or_name)
    if "Special:FilePath/" in text:
        text = text.split("Special:FilePath/", 1)[1]
    text = urllib.parse.unquote(text).replace("_", " ").strip()
    return f"File:{text}" if text and not text.startswith("File:") else text


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


def small_url(url):
    if not url or "/thumb/" not in url:
        return url
    return re.sub(r"/\d+px-", f"/{CARD_PX}px-", url, count=1)


# Which of the photographs already chosen should be the HERO.
#
# The enrich stage decides which five files are of this lake. This decides
# which of those five leads, and it is a separate question with a separate
# answer: a file called "Magaro, Mountain Galichica, in the background Ohrid
# lake" is genuinely a photograph of Lake Ohrid and is genuinely a picture of
# a snowfield. It belongs in the gallery and not on the card.
#
# Reordering here rather than re-selecting upstream is deliberate: it costs no
# network call, it works on caches that are already on disk, and the enrich
# stage carries the same preference for the next full re-photograph.
BACKDROP_RE = re.compile(
    r"in the background|background|seen from|from the summit|from mount|"
    r"view towards|panorama from", re.I)
WINTER_RE = re.compile(r"winter|snow|schnee|neige|\bice\b|frozen|gefroren|"
                       r"eisig|invierno|inverno", re.I)
# Commons upload names very often carry the date, and a lake photographed in
# December is a true picture of the lake and a poor advertisement for it.
# "7142 Illmitz, Neusiedler See Seebad 01 2021-12" led the Austrian card until
# this line existed.
WINTER_DATE_RE = re.compile(r"\b(19|20)\d{2}[ _-]?(1[012]|0[12])\b")


def lead_score(img, lake):
    """How well this file works as the one picture on a card."""
    title = str(img.get("file") or "")
    if title.startswith("File:"):
        title = title[5:]
    folded = re.sub(r"[^a-z0-9 ]+", " ", title.lower())
    tokens = name_tokens(lake.get("name")) | name_tokens(lake.get("name_local"))
    score = 0.0
    head = " ".join(folded.split()[:3])
    if tokens and any(t in head for t in tokens):
        score += 2.0                    # the file is NAMED after the lake
    elif tokens and any(t in folded for t in tokens):
        score += 0.6
    if BACKDROP_RE.search(folded):
        score -= 2.2
    # Heavier than the naming bonus on purpose. Commons file names in several
    # countries lead with a postal code ("7141 Podersdorf am See, Neusiedler
    # See 04 2022-08-21"), so the lake's own name is rarely in the first three
    # words and the "named after the lake" bonus goes to whichever upload
    # happened to be titled differently. A summer photograph of the right lake
    # has to be able to beat a better titled December one on a layer about
    # swimming.
    if WINTER_RE.search(folded) or WINTER_DATE_RE.search(title):
        score -= 1.8
    width, height = img.get("w") or 0, img.get("h") or 0
    if width and height and width > height:
        score += 0.5                    # a card is a landscape crop
    if width >= 1200:
        score += 0.3
    return score


def backfill_why(img, lake):
    """Evidence for a picture whose cache entry predates the strict picker.

    lake_images.py stamps `why` on everything it selects, but a cache written
    before it exists has pictures with no stamp at all, and Oedter See shipped
    five of them: files plainly titled "Oedter See Pano 20201018.jpg", passing
    the lake level gate on their names, arriving with an empty evidence field
    that the headless check then failed on. Recomputing here from what the
    export can still see costs nothing and lets an old cache heal itself
    rather than needing a re-photograph."""
    title = str(img.get("file") or "")
    if title.startswith("File:"):
        title = title[5:]
    p18 = commons_filename(lake.get("wd_img"))
    if p18 and title == p18:
        return "p18"
    tokens = (name_tokens(lake.get("name"))
              | name_tokens(lake.get("name_local"))
              | name_tokens((lake.get("seed") or {}).get("name")))
    if tokens and any(t in fold(title) for t in tokens):
        return "name"
    return ""


# A floor that applies to EVERY picture, including a Wikidata P18.
#
# The enrich stage exempts P18 from the pixel probe, because P18 is a person
# stating that this image depicts this item and the probe is a heuristic that
# rejects grey moorland water. That exemption is right for the marginal cases
# and wrong for the absolute ones: the P18 for Haarrijnseplas is a photograph
# of an information board on a fence, and Schwendisee's is another board, and
# neither has any water in the frame at all.
#
# So one floor is cleared by nobody's assertion. It sits well below the tier
# floors in lake_images (0.12, and 0.28 for a passing mention) so that it only
# ever catches "no water whatsoever": Toftavatn, the Faroese lake that
# motivated the P18 exemption in the first place, probes at 0.063 and stays.
#
# Enforced here rather than upstream because the probe is already stored with
# every picture, so it costs no request and needs no re-photographing.
HARD_WATER_FLOOR = 0.045


def usable_images(lake):
    """[(picture, evidence)] for the pictures that may actually be published.

    One list, used by both the gate and the wire, so a lake can never be
    published on the strength of pictures the wire then drops."""
    out = []
    for img in lake.get("images") or []:
        if not clean_url(img.get("url")):
            continue
        why = img.get("why") or backfill_why(img, lake)
        # No evidence, no publication. An unstamped picture that cannot be
        # explained after the fact is one nobody can defend on the page.
        if not why:
            continue
        seen = img.get("seen")
        if seen and seen.get("water", 1.0) < HARD_WATER_FLOOR:
            continue
        out.append((img, why))
    return out


def wire_images(lake):
    # A rescored row (pipeline/photos/rescore.py) already encodes the whole
    # ranking in its cache order: beauty hero first, vetoed files last, one
    # image per dedupe cluster ahead of its twins, the P18 bonus applied.
    # That is strictly more than _lead can see, so the cache order stands
    # wherever the beauty engine has spoken.
    rescored = any(img.get("beauty") is not None
                   for img in lake.get("images") or [])
    out = []
    for img, why in usable_images(lake):
        url = clean_url(img.get("url"))
        out.append({
            # The evidence that let this picture in: p18, title, viewcat,
            # category or name. Shipped because it is the one field that says
            # WHY a photograph is on this page, and the headless check asserts
            # on it (see scripts/verify_lakes.mjs).
            "why": why,
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
            # The enrich stage now scores every picture with the full evidence
            # it had in hand (lake_images.py): the tier of the claim, Commons'
            # own review categories, and what the pixels showed. That is
            # strictly more than this stage can see from a file name, so its
            # number wins wherever it exists. lead_score stays for caches
            # written before the strict picker, so an old cache still orders
            # sensibly instead of arriving in whatever order it was stored in.
            "_lead": img["score"] if img.get("score") is not None
                     else lead_score(img, lake),
        })
    # Stable: equal scores keep the enrich stage's own order.
    if not rescored:
        out.sort(key=lambda i: -i["_lead"])
    for img in out:
        img.pop("_lead")
    # Then, and only inside the leading evidence tier, let a picture that
    # survives the card crop lead. The scores above rank how well a file is
    # evidenced and reviewed, which is the right question and not the only
    # one: the card shows images[0] cropped to 25:12, so a panorama that
    # wins on merit still reaches the reader as a blue band.
    return lake_images.lead_by_fit(out, lambda i: (i.get("w"), i.get("h")),
                                   tier=lambda i: i.get("why"))


def services_of(lake):
    ctx = lake.get("context") or {}
    out = []
    if ctx.get("parking"):
        out.append("parking")
    if ctx.get("toilets"):
        out.append("toilets")
    if any(ctx.get(t) for t in ("cafe", "restaurant", "bar")):
        out.append("food")
    if ctx.get("camp_site"):
        out.append("camping")
    if ctx.get("boat_rental"):
        out.append("boatRental")
    if ctx.get("ferry_terminal"):
        out.append("ferry")
    if ctx.get("swimming_area") or ctx.get("swimming_pool"):
        out.append("lido")
    if ctx.get("sauna"):
        out.append("sauna")
    return out


def access_of(lake):
    facts = set((lake.get("article") or {}).get("facts") or [])
    ctx = lake.get("context") or {}
    if "hike_in" in facts:
        return "hike"
    if ctx.get("cable_car"):
        return "cableCar"
    if ctx.get("ferry_terminal") and not ctx.get("parking"):
        return "boat"
    if ctx.get("parking"):
        return "road"
    return ""


def wire_lake(lake, comps, score10, tier, reasons, expected):
    water = lake.get("water") or {}
    area = li.protected_of(lake)
    base = lake.get("base") or {}
    wiki = lake.get("enwiki") or lake.get("localwiki") or ""
    kind = li.kind_of(lake)
    verdict, source = li.swim_rule(lake)
    temps = li.water_temp_estimate(lake)
    season = li.swim_season(temps)

    row = {
        "id": li.lake_id(lake),
        "name": lake["name"],
        "cc": lake["iso2"],
        "kind": kind,
        "lat": lake["lat"],
        "lon": lake["lon"],
        "score": score10,
        "tier": tier,
        # The three headline figures, and `activity` is dropped when the
        # shore sweep has not run for this lake. Scenery and swimming stand on
        # measured inputs either way (elevation, area, the EEA sites, the
        # climate sample); activity is read almost entirely off the Overpass
        # pass, so publishing its neutral default as a number would put an
        # invented 4 out of 10 on the page in the same type as the two real
        # ones. The combined score still uses the default, which is documented
        # as a default; a figure a traveller reads is held to a higher bar
        # than a term inside a weighted sum.
        "sub": {k: round(comps[k], 3) for k in li.SUB_SCORES
                if k != "activity" or li.measured(lake)},
        "measured": bool(li.measured(lake)),
        "comp": {k: round(v, 3) for k, v in comps.items()},
        "gem": li.gem_score(comps, expected),
        "why": reasons[:li.REASON_MAX],
        "hazards": li.hazard_codes(lake),
        "tags": [r["k"] for r in li.highlights_for(reasons)],
        "bestFor": li.best_for(comps, reasons, kind),
        "images": wire_images(lake),
        "src": lake.get("sources") or [],
    }
    row["t"] = "r"
    # Stored by enrich (assign.stamp_rows), read back here: the export never
    # recomputes an assignment, so it never needs the spine loadable.
    if lake.get("rg"):
        row["rg"] = lake["rg"]
    if lake.get("name_local") and lake["name_local"] != lake["name"]:
        row["nameLocal"] = lake["name_local"]
    if lake.get("adm"):
        row["region"] = lake["adm"]

    size = {}
    if lake.get("area_km2"):
        size["areaKm2"] = round(lake["area_km2"], 2)
    if lake.get("depth_m"):
        size["depthM"] = int(lake["depth_m"])
    if lake.get("elev_m") is not None:
        size["elevM"] = int(lake["elev_m"])
    if size:
        row["size"] = size

    if water.get("class"):
        row["water"] = {"class": water["class"], "site": water.get("site") or "",
                        "sites": int(water.get("sites") or 0)}

    # The swimming block is the safety critical half of this wire. `rule` is
    # the verdict, `src` is what decided it, and `est` marks the temperature
    # model as a model. The app never renders a season without the estimate
    # label attached.
    swim = {"rule": verdict}
    if source:
        swim["src"] = source
    if season:
        swim["season"] = season
    if temps:
        swim["temps"] = [round(t) for t in temps]
        swim["est"] = True
    row["swim"] = swim

    if area.get("name"):
        row["protected"] = {"name": area["name"], "kind": area.get("kind") or "",
                            "np": bool(area.get("national_park"))}
    access = access_of(lake)
    if access:
        row["access"] = access
    services = services_of(lake)
    if services:
        row["services"] = services
    if lake.get("walks"):
        row["walks"] = lake["walks"][:3]
        row["nWalks"] = lake.get("n_walks") or len(lake["walks"])
    shared = [c for c in (lake.get("basin_countries") or []) if c]
    if len(shared) > 1:
        row["shared"] = shared[:4]
    if base.get("id"):
        row["base"] = {"id": base["id"], "city": base["city"], "km": base["km"]}
    if wiki:
        row["wiki"] = wiki
    if lake.get("wd"):
        row["wd"] = lake["wd"]
    if lake.get("osm_id"):
        row["osm"] = lake["osm_id"]

    credits = [
        ATTRIBUTION["wikidata"] if "wikidata" in row["src"] else None,
        ATTRIBUTION["osm"] if (lake.get("context") or lake.get("osm_id")) else None,
        ATTRIBUTION["eea"] if row.get("water") else None,
        ATTRIBUTION["commons"] if row["images"] else None,
        ATTRIBUTION["worldclim"] if swim.get("temps") else None,
    ]
    row["credit"] = [c for c in credits if c]
    return row


def evidenced_image(lake):
    """True when at least one photograph is provably OF this lake.

    Two kinds count. Wikidata's P18 is a person saying this file depicts this
    item. A file named after the lake is the photographer saying the same
    thing. A file that merely turned up within a kilometre is neither."""
    p18 = commons_filename(lake.get("wd_img"))
    tokens = (name_tokens(lake.get("name"))
              | name_tokens(lake.get("name_local"))
              | name_tokens((lake.get("seed") or {}).get("name")))
    for img in lake.get("images") or []:
        title = str(img.get("file") or "")
        if p18 and title == p18:
            return True
        if tokens and any(t in fold(title) for t in tokens):
            return True
    return False


def publishable(lake):
    """The gate, minus the score (which needs the whole country first)."""
    images = usable_images(lake)
    if not images:
        return False
    if len(images) < MIN_IMAGES and not evidenced_image(lake):
        return False
    if not name_tokens(lake.get("name")):
        return False
    return True


def country_water_default(lakes):
    """What an unmeasured lake in this country is worth: the median class of
    the lakes around it that DO have a reading."""
    values = [li.WATER_VALUE[b["water"]["class"]] for b in lakes
              if (b.get("water") or {}).get("class") in li.WATER_VALUE]
    if len(values) < 5:
        return li.WATER_DEFAULT
    return statistics.median(values)


def score_country(cc):
    rich = load_cache("rich", cc)
    if not rich or not rich.get("lakes"):
        return []
    lakes = rich["lakes"]
    water_default = country_water_default(lakes)
    fames = [li.fame_raw(b) for b in lakes] or [1.0]
    country_max = max(fames) or 1.0
    scored = []
    for lake in lakes:
        comps, _s01, score10 = li.score_lake(lake, country_max, GLOBAL_MAX,
                                             water_default)
        scored.append((lake, comps, score10))
    return scored


def fit_expectation(rows):
    """Least squares fit of quality on acclaim over everything scored.

    Returns f(acclaim) -> expected quality. Two points make a line and a
    hundred make a useful one; below MIN_FIT the fit is refused and every
    lake's expectation becomes the mean quality, which makes the gem score the
    plain "better than average" it degrades to rather than a fiction."""
    points = [(c["acclaim"], li.quality_of(c)) for _l, c, _s in rows]
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
    eea = ROOT / "cache" / "eea_bathing_water.json"
    out = {
        "eea_bathing_water": (
            datetime.fromtimestamp(eea.stat().st_mtime, timezone.utc)
            .isoformat(timespec="seconds") if eea.exists() else None),
        "harvested": {},
        "enriched": {},
    }
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
    """The unit a lake is budgeted in: its NUTS3 region, the country as a
    last resort for a row the spine has not reached."""
    rg = row.get("rg") or {}
    return rg.get("n3") or row["cc"]


def quota_ordered(rows, qmod):
    """Step 3 of the gate: the region quota. Rows are grouped by region,
    ranked within their group, cut at the group's quota, then re-ordered so
    every region's first pick outranks any region's second. The country cap
    that follows trims the deepest tails first instead of whichever thin
    lakeland happened to sort last."""
    if qmod is None or not qmod.has_data():
        print("  region quotas unavailable, quota step skipped")
        return rows
    groups = {}
    for row in rows:
        groups.setdefault(region_key(row), []).append(row)
    ranked = []
    for key, group in groups.items():
        try:
            target = qmod.published_target(key, "lake")
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


def wire_listed(lake):
    """A listed card: verified to exist, named, deduped, in region, and NOT
    scored. The score key is absent rather than null, which is the only
    reliable way to guarantee the app cannot render a number nobody earned."""
    row = {
        "id": li.lake_id(lake),
        "name": lake["name"],
        "cc": lake["iso2"],
        "kind": li.kind_of(lake),
        "lat": lake["lat"],
        "lon": lake["lon"],
        "t": "l",
        "why": [{"k": "unrated_coverage"}],
        "images": wire_images(lake)[:2],
        "src": lake.get("sources") or [],
    }
    if lake.get("rg"):
        row["rg"] = lake["rg"]
    if lake.get("adm"):
        row["region"] = lake["adm"]
    if lake.get("wd"):
        row["wd"] = lake["wd"]
    credits = [ATTRIBUTION["wikidata"] if "wikidata" in row["src"] else None,
               ATTRIBUTION["osm"] if "osm" in row["src"] else None,
               ATTRIBUTION["commons"] if row["images"] else None]
    row["credit"] = [c for c in credits if c]
    return row


def region_floor_fill(rated, pool, qmod):
    """Step 4 of the gate, the REGION floor (the country floor below only
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
    for lake, comps, score10 in pool:
        n3 = (lake.get("rg") or {}).get("n3")
        if not n3 or have.get(n3):
            continue
        pools.setdefault(n3, []).append((lake, score10))
    listed = []
    for n3, cands in pools.items():
        if not qmod.applicable(n3, "lake"):
            continue
        room = qmod.floor(n3, "lake")
        cands.sort(key=lambda t: (0 if evidenced_image(t[0]) else 1, -t[1]))
        for lake, _score in cands[:room]:
            listed.append(wire_listed(lake))
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
    return bad


def validate(rows):
    """The gate's own self-check, run over what is about to be written.

    A non-empty list stops the export, because a lake with no credit, a broken
    image URL or a swimming verdict that contradicts its own hazards is worse
    than no lake."""
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
        # The safety invariants. A swimming verdict is the one field here that
        # can hurt somebody, so the shape of it is checked rather than trusted.
        rule = (row.get("swim") or {}).get("rule")
        if rule not in ("yes", "limited", "no", "unknown"):
            bad.append(f"{where}: swim rule {rule!r} is not a verdict")
        if rule == "no" and row["comp"]["swimming"] > 0:
            bad.append(f"{where}: swimming is forbidden but scores "
                       f"{row['comp']['swimming']}")
        if (row.get("swim") or {}).get("temps") and not row["swim"].get("est"):
            bad.append(f"{where}: a temperature series with no estimate flag")
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
    """One row per water body, and one lead photograph per row.

    Two things get dropped here, both of which show up as the same lake twice
    in a list. The first is a Wikidata item for a lake that also has an item
    for its own basin or its own nature reserve, 400 m apart under names that
    share a token. The second comes from the photograph fallback: a small lake
    with no file named after it borrows any Commons photograph taken nearby,
    which is right for a lone tarn and wrong for a chain of five, where all
    five end up with the same picture."""
    kept, leads = [], set()
    for row in rows:
        # A lake with pictures of its own keeps its place on the next one
        # nobody else is leading with; only a lake whose every picture is
        # already somebody else's is dropped as a borrowed view.
        images = lake_images.reseat_lead(row.get("images") or [], leads,
                                         tier=lambda i: i.get("why"))
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
    global GLOBAL_MAX
    GLOBAL_MAX = 1.0
    pools = {}
    for cc in countries:
        rich = load_cache("rich", cc)
        if not rich or not rich.get("lakes"):
            continue
        pools[cc] = rich["lakes"]
        for lake in rich["lakes"]:
            GLOBAL_MAX = max(GLOBAL_MAX, li.fame_raw(lake))

    # Score everything first, fit the fame expectation on all of it, and only
    # then build rows: the gem score is a residual against the whole field, so
    # it cannot be computed one country at a time.
    scored_by_cc = {cc: score_country(cc) for cc in countries if cc in pools}
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
        for lake, comps, score10 in sorted(scored, key=lambda t: (-t[2],
                                                                  t[0]["name"])):
            # The photo gate no longer deletes the pool before the floor can
            # reach it (the mountain floor lesson): a named lake that fails
            # it falls through to the region floor as a listed candidate.
            if not publishable(lake):
                if name_tokens(lake.get("name")):
                    unrated_pool.append((lake, comps, score10))
                continue
            reasons = li.reasons_for(lake, comps)
            # A lake the data cannot say one sentence about is a name on a
            # photograph. That is a gate, not a build failure.
            if not reasons:
                unrated_pool.append((lake, comps, score10))
                continue
            row = wire_lake(lake, comps, score10, li.tier_for(score10),
                            reasons, expectation(comps["acclaim"]))
            if score10 >= args.min_score:
                rows.append(row)
            elif score10 >= FLOOR_MIN_SCORE or lake.get("seed"):
                # A SEEDED entry can always fill a country's floor, whatever
                # it scores. That is what the seed is for: San Marino's one
                # lake is a pond at Faetano with no elevation, no area, no
                # bathing site and a swimming ban, and it scores 3.7 out of a
                # model built for Alpine tarns. It is also the only inland
                # water the republic has, and a human put it on the list
                # knowing exactly that. The score gate still decides the
                # ORDER, and the country cap still decides how many.
                spare.append(row)
        rows = dedupe(rows)
        rows = quota_ordered(rows, qmod)[:args.max_per_country]
        rows.sort(key=lambda r: -r["score"])

        # The per country floor. Only ever ADDS, never replaces, and only from
        # entries that already passed every gate except the score.
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
            "swimmable": sum(1 for r in rows if r["swim"]["rule"] == "yes"),
        })
        if listed:
            index[-1]["listed"] = len(listed)
        if filled.get(cc):
            index[-1]["filled"] = filled[cc]
        by_country[cc] = rows
        if args.dry_run or args.verbose:
            note = f" [+{filled[cc]} to reach the floor]" if filled.get(cc) else ""
            print(f"  {cc}: {len(rows)} lakes, best {rows[0]['score']} "
                  f"({rows[0]['name']}){note}")

    # Validate BEFORE anything is written. Scoring every country first and
    # writing afterwards is the whole point: a gate that fires after half the
    # files are on disk has not gated anything.
    failures = validate(published) + validate_listed(listed_all)
    if failures:
        for line in failures[:20]:
            print(f"  FAIL {line}")
        print(f"[lakes] {len(failures)} validation failures, nothing written")
        raise SystemExit(1)

    # The Europe wide opening page, taken from what was just published so it
    # can never disagree with the country files.
    # One row per WATER BODY here, not one per country row. A cross border
    # lake is deliberately published under each of its countries, because each
    # of them has its own shore, its own bathing sites and its own base city.
    # On the Europe wide page that is three identical cards for Lake
    # Constance under the same photograph, so the highest scoring side wins
    # and the others drop. The Wikidata id is the join; the lead photograph
    # catches the pairs that do not share one.
    top = []
    per_country = {}
    seen_water, seen_lead = set(), set()
    for row in sorted(published, key=lambda r: (-r["score"], r["id"])):
        water = row.get("wd") or ""
        lead = row["images"][0]["u"] if row["images"] else ""
        if (water and water in seen_water) or (lead and lead in seen_lead):
            continue
        if per_country.get(row["cc"], 0) >= TOP_PER_COUNTRY:
            continue
        per_country[row["cc"]] = per_country.get(row["cc"], 0) + 1
        if water:
            seen_water.add(water)
        if lead:
            seen_lead.add(lead)
        top.append(row)
        if len(top) >= TOP_N:
            break

    # Which countries have nothing, and whether that is a fact or a gap. The
    # seed file records the ones that genuinely have no inland water.
    absent = {}
    for cc in countries:
        if cc in by_country:
            continue
        if cc in seed_lakes.NO_WATER:
            absent[cc] = seed_lakes.NO_WATER[cc]
            continue
        # "Nothing cleared the gate" is true and unhelpful. Say WHICH gate,
        # because the two cases want different work: no water body at all is a
        # harvest problem, and water bodies with no usable photograph is a
        # Commons problem that no amount of re-scoring will fix. San Marino is
        # the second kind: the only Wikidata image of its one lake is a map.
        pool = pools.get(cc) or []
        if not pool:
            absent[cc] = "nothing harvested"
        elif not any(lake.get("images") for lake in pool):
            absent[cc] = "no photograph of any of its water bodies"
        else:
            absent[cc] = "nothing cleared the gate"

    index.sort(key=lambda c: -c["n"])
    payload = {
        "generated_at": generated,
        "n_lakes": total,
        "model": {
            "version": li.MODEL_VERSION,
            "weights": li.WEIGHTS,
            "standout_bonus": li.STANDOUT_BONUS,
            # The photo engine that ordered every gallery in this wire
            # (pipeline/photos/selection.py), shipped with the data so a
            # reader can see which weights picked each hero (invariant 2).
            "photo_rank": photo_rank_block(),
            "sub_scores": list(li.SUB_SCORES),
            "tier_cutoffs": li.TIER_CUTOFFS,
            "min_score": args.min_score,
            "min_images": MIN_IMAGES,
            "min_images_note": "two photographs, or one that is provably of "
                               "this lake (a Wikidata P18 or a file named "
                               "after it)",
            "country_floor": args.floor,
            # The region quota model ships with the data (invariant 2).
            "region_quota": (qmod.model_block()
                             if qmod is not None and qmod.has_data() else None),
            # The season model, named in the wire so a figure on the page can
            # always be traced to the thing that produced it.
            "season_model": "WorldClim 2.1 air normals at the lake's own "
                            "coordinate, with a depth weighted thermal lag, "
                            "solar gain, a shallow water bonus, and depth, "
                            "altitude and glacier corrections. Estimated, "
                            "not measured.",
            "warm_c": li.SWIM_WARM_C,
        },
        "countries": index,
        "absent": absent,
        "attribution": sorted(credits),
        "sources": provenance(countries),
    }
    if args.dry_run:
        print(f"[lakes] {total} publishable across {len(index)} countries")
        return
    out_dir.mkdir(parents=True, exist_ok=True)
    for cc, rows in by_country.items():
        path = out_dir / f"{cc}.json"
        envelope = {"country": cc, "generated_at": generated, "n": len(rows),
                    "lakes": rows}
        # A separate array, not a flag inside the main one: a screen has to
        # opt in to showing unscored rows, and they can never interleave
        # into a ranked list by accident.
        if listed_by_country.get(cc):
            envelope["listed"] = listed_by_country[cc]
        path.write_text(json.dumps(envelope, ensure_ascii=False,
                                   separators=(",", ":")), encoding="utf-8")
        if args.verbose:
            print(f"  {cc}: -> {path.name} ({path.stat().st_size // 1024} KB)")

    # A country that stops publishing has to lose its file, not keep the last
    # one it had. San Marino dropped out when the strict image gate refused
    # its only Wikidata picture (a map of the lake), the index correctly
    # listed it under `absent`, and SM.json sat on disk still serving the map:
    # the app fetches a country file by name, so nothing in the index was
    # stopping it. Only countries in THIS run's scope are swept, so
    # `--countries SI` can never delete anybody else's wire.
    for cc in countries:
        if cc in by_country:
            continue
        stale = out_dir / f"{cc}.json"
        if stale.exists():
            stale.unlink()
            print(f"  {cc}: no longer published, removed {stale.name}")

    (out_dir / "index.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    (out_dir / "top.json").write_text(
        json.dumps({"generated_at": generated, "n": len(top),
                    "per_country_cap": TOP_PER_COUNTRY, "lakes": top},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print(f"[lakes] published {total} water bodies across {len(index)} "
          f"countries into {out_dir} (top.json holds {len(top)})")
    if filled:
        print(f"[lakes] countries filled to the floor: "
              f"{', '.join(f'{k}+{v}' for k, v in sorted(filled.items()))}")


GLOBAL_MAX = 1.0

if __name__ == "__main__":
    main()
