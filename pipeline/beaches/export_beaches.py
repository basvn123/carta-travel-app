"""Stage 3: score the enriched beaches and publish the ones worth showing.

This is the gate. Everything upstream collects; this decides what a traveller
sees, and it is deliberately strict, because the promise on the tab is "the
most beautiful beaches in Europe" and a list padded with municipal strands
breaks that promise on the first screen.

A beach is published when all of these hold:

  it has photographs        at least MIN_IMAGES freely licensed pictures that
                            each EVIDENCE being of this beach, and at least one
                            of them strongly: the curated Wikidata image,
                            membership of its Commons category, or its name in
                            the file. A geotag within 250 m on a file that
                            calls itself coastal can fill the later slots but
                            cannot be all a beach is shown by. A beach we
                            cannot show is a row of text, and a beach shown
                            with a picture of the next cove is worse.
  it has a real name        something beyond the local word for "beach". "Plage"
                            is not a destination.
  it clears the floor       MIN_SCORE on the beauty index, so the tail of
                            car park strands never reaches the wire.
  there is something to say at least one reason code. A beach with no
                            surface, no water reading, no article and no
                            ground survey is a name on a photograph.
  it is not a duplicate     of a better scoring beach 150 m up the same bay.

Then each country keeps its best PUBLISH_MAX. Countries whose whole list fails
the gate simply do not appear, which is exactly the behaviour the tab needs:
Andorra has no beaches and should not be offered as though it had ten.

The output is a produced work, not a database extract: selected, scored,
described through reason codes and cut to a few hundred rows a country. The
ODbL layer (OpenStreetMap tags) travels with its credit on every row that used
it, the same arrangement pipeline/trails/export_wire.py ships trails under.

Writes:
  continent-app/public/beaches/index.json   which countries have beaches
  continent-app/public/beaches/{CC}.json    the published beaches of one

Usage, from the repo root:
    python pipeline/beaches/export_beaches.py
    python pipeline/beaches/export_beaches.py --dry-run --verbose
    python pipeline/beaches/export_beaches.py --countries GR,HR
"""

import argparse
import importlib.util
import json
import re
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

# Windows consoles default to cp1252, and this layer prints beach names:
# "Ir-Ramla tal-Mixquqa" and "Plaza Zlatni Rat" both raise UnicodeEncodeError
# on the way to a terminal that cannot spell them. Replacing the character is
# right for a progress line and wrong for a data file, which is why this
# touches stdout only; every cache and wire write goes through an explicit
# encoding="utf-8".
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from sources import haversine_km, load_cache  # noqa: E402
from harvest_beaches import COUNTRIES, name_tokens  # noqa: E402
import beauty_index as bi  # noqa: E402

# The lake layer's card-shape helpers, loaded by path the way enrich_beaches
# already loads them: beach, lake and peak cards are the same 25/12 crop, so
# the frame thresholds live in one file.
_LAKE_IMAGES = HERE.parents[1] / "pipeline" / "lakes" / "lake_images.py"
if "carta_lake_images" in sys.modules:
    lake_images = sys.modules["carta_lake_images"]
else:
    _lake_spec = importlib.util.spec_from_file_location("carta_lake_images",
                                                        _LAKE_IMAGES)
    lake_images = importlib.util.module_from_spec(_lake_spec)
    sys.modules["carta_lake_images"] = lake_images
    _lake_spec.loader.exec_module(lake_images)

ROOT = HERE.parents[1]
OUT_DIR = ROOT / "continent-app" / "public" / "beaches"


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


# The rated tier's photo bar. Four, not two, per 00-MASTER-SPEC.md section 8:
# two photographs is a floor for EXISTENCE and this tier is a claim about
# beauty. A row that cannot field four does not disappear, it falls through to
# `listed`, which is the whole point of the tier model.
MIN_IMAGES = 4
# The listed tier's bar: one strongly evidenced photograph, or none at all and
# the card is drawn from the map instead. A listed row is a claim that the
# place exists and is named, not a claim about how it looks.
MIN_IMAGES_LISTED = 1
MIN_SCORE = 5.6
# A sanity ceiling, far above the sum of any country's region quotas, NOT a
# binding cap. The old value was 120 and it bound in four countries at once:
# Spain, France, Great Britain and Portugal all published exactly 120, which
# is the signature of a constant deciding a catalogue. The region quota now
# decides how many beaches a coast carries; this only stops a bug from
# publishing a country's entire harvest.
PUBLISH_MAX = 900
DUPLICATE_KM = 0.15

# The Europe wide file the tab opens on. Capped per country on purpose: the
# raw top 240 of Europe is most of the Greek islands and a little of Croatia,
# which is a true ranking and a useless first page. Twelve a country makes it
# a tour of the continent, and typing a country's name still opens its full
# list.
TOP_N = 240
TOP_PER_COUNTRY = 12

ATTRIBUTION = {
    "wikidata": "Beach names and locations from Wikidata (CC0)",
    "osm": "Beach detail (c) OpenStreetMap contributors, ODbL",
    "eea": "Bathing water quality: European Environment Agency, WISE Bathing "
           "Water Directive data",
    "commons": "Photographs from Wikimedia Commons, each under the licence "
               "shown on the picture",
    "natura": "Protected site boundaries: Natura 2000 and the Emerald "
              "Network, European Environment Agency, CC BY 4.0",
}


# Evidence strong enough to say the picture is of THIS beach rather than of
# the shoreline it sits on. A geotag plus a coastal word is good enough to sit
# in the second or third slot, not good enough to be the only thing a beach is
# shown by: in Ksamil, eight beach club strips inside one bay each ended up
# with a photograph of the bay.
STRONG_EVIDENCE = ("p18", "cat", "name")


def clean_url(url):
    """Strip the Commons API's own tracking parameters.

    imageinfo hands back thumbnails with ?utm_source=commons.wikimedia.org
    stapled on. They are harmless in a browser and poison anywhere the URL is
    treated as a path: the hero image audit spliced a width into one of these
    and produced a 404, which is why every Commons URL in this repo gets its
    query string removed before it is stored (see the hero image notes)."""
    return str(url or "").split("?", 1)[0]


# Card width. NOT a free choice: upload.wikimedia.org now serves only a fixed
# list of thumbnail widths and answers anything else with a 400 and "Use
# thumbnail sizes listed on https://w.wiki/GHai". 640, 800 and 320 are all
# refused; 500 and 960 are not, and 500 is the width the rest of this repo
# already ships (the POI thumbnails). Changing it needs a curl, not an
# opinion.
CARD_PX = 500


def small_url(url):
    """A card sized variant of a Commons thumbnail.

    Commons thumbnails carry their width in the path, so the small twin of a
    1280 px thumb is a string edit rather than another API call. Anything that
    is not a thumb (an original small enough that the API did not scale it) is
    returned unchanged, which is correct: there is no smaller version to ask
    for, and the file is already small."""
    if not url or "/thumb/" not in url:
        return url
    return re.sub(r"/\d+px-", f"/{CARD_PX}px-", url, count=1)


# A last subject filter, re-applied here rather than only in the enrich stage.
# The vocabulary of "things that stand near a beach but are not it" only ever
# grows, and every addition would otherwise mean re-photographing 4,000
# beaches: a cemetery beside Kilmurvey Beach passed the name test because the
# file is honestly called "Cemetery, Kilmurvey Beach". Running it again over
# the cached picks makes the list a cheap knob.
REJECT_SUBJECT_RE = re.compile(
    r"(cemetery|graveyard|churchyard|war grave|memorial|"
    r"playground|ruin|ruins|castle|church|chapel|monastery|cathedral|"
    r"mosque|synagogue|monument|statue|museum|library|school|hospital|"
    r"station|airport|factory|windmill|market|parking|car park|"
    r"roadworks|construction|portrait|selfie|wedding|funeral|"
    r"information board|noticeboard|plaque)", re.I)


def usable_images(beach):
    """The picks that still pass, in the order they will be shown."""
    out = []
    for img in beach.get("images") or []:
        name = str(img.get("file") or "")
        if name.startswith("File:"):
            name = name[5:]
        if REJECT_SUBJECT_RE.search(name) and img.get("evidence") != "p18":
            continue
        out.append(img)
    # A rescored row (pipeline/photos/rescore.py) already encodes the whole
    # ranking in its cache order: beauty hero first, vetoed files last,
    # one image per dedupe cluster ahead of its twins, the P18 bonus
    # applied. Re-sorting here would undo exactly that, so the cache order
    # stands wherever the beauty engine has spoken.
    if any(img.get("beauty") is not None for img in out):
        return out
    return sorted(out, key=lambda i: (i.get("evidence") not in STRONG_EVIDENCE,
                                      -(i.get("score") or 0),
                                      i.get("file") or ""))


def wire_images(beach):
    out = []
    # Strongly evidenced pictures first, best score inside each group. The
    # card shows images[0] and nothing else, so the one picture most people
    # ever see of a beach is never the one held up only by a geotag, even
    # where the geotagged shot happens to be the wider and prettier frame.
    for img in usable_images(beach):
        url = clean_url(img.get("url"))
        if not url:
            continue
        out.append({
            "u": small_url(url),
            "big": url,
            "w": img.get("w"),
            "h": img.get("h"),
            "by": (img.get("author") or "").strip(" ,;"),
            "lic": (img.get("license") or "").strip(),
            "licUrl": img.get("license_url") or "",
            "page": img.get("page") or "",
            # WHY this picture is on this beach: p18 (the curated Wikidata
            # image), cat (in the beach's Commons category), name (the beach
            # is named in the file), geo (taken within 250 m and describing
            # itself as coastal). It rides in the wire so the claim can be
            # audited from the outside rather than trusted.
            "ev": img.get("evidence") or "",
        })
    # Inside the leading evidence tier only, prefer a lead that survives the
    # card crop. The rule above is untouched: a geotagged shot never overtakes
    # an evidenced one for being the wider frame. This chooses between equals.
    return lake_images.lead_by_fit(out, lambda i: (i.get("w"), i.get("h")),
                                   tier=lambda i: i.get("ev"))


def access_of(beach):
    """How you get there, and ONLY when something actually says so.

    A car park within 400 m used to count as road access. It does not: the car
    park above Navagio sits on the clifftop 200 m over a cove reachable only by
    boat, and the page told people to drive there. Proximity is not a route, so
    the parking stays in `services` (where "within a few minutes of the sand"
    is true) and this field answers only what the article states."""
    facts = set((beach.get("article") or {}).get("facts") or [])
    if "boat_only" in facts:
        return "boat"
    if "steps" in facts:
        return "steps"
    if "hike_in" in facts:
        return "hike"
    return ""


def services_of(beach):
    ctx = beach.get("context") or {}
    out = []
    if ctx.get("parking"):
        out.append("parking")
    if ctx.get("toilets"):
        out.append("toilets")
    if ctx.get("shower"):
        out.append("showers")
    if ctx.get("drinking_water"):
        out.append("water")
    if any(ctx.get(t) for t in ("cafe", "restaurant", "bar", "ice_cream")):
        out.append("food")
    if ctx.get("camp_site"):
        out.append("camping")
    return out


def v2_fields(beach):
    """The fields 03-BEACHES.md adds to the row, on both tiers.

    Every one of them is omitted rather than nulled when the enrichment did
    not answer. The app cannot render what is not there, which is the only
    reliable way to keep a number nobody earned off a card (invariant 9).

      size     cove | beach | strand, the band the Size facet is cut at
      space    how roomy this beach is for its own coast, 0..1
      aspect   the true bearing from the sand out to sea
      sunset   whether the sun sets over this beach's water in season
      prot     the protected site this beach is INSIDE, from polygons
      sst      monthly sea surface temperature climatology
      nameSrc  where the name came from, when it was not the beach's own:
               "eea" is a bathing register entry, "osm_near" is borrowed
               from the nearest named bay or village
    """
    out = {}
    band = bi.size_band(beach)
    if band:
        out["size"] = band
    if beach.get("aspect") is not None:
        out["aspect"] = beach["aspect"]
    if beach.get("sunset_facing") and beach.get("coastal", True):
        out["sunset"] = True
    protection = beach.get("protection") or {}
    if protection.get("inside"):
        out["prot"] = {
            "net": "natura2000" if protection.get("natura2000") else "emerald",
            "name": protection.get("name") or "",
            "code": protection.get("code") or "",
        }
    sst = beach.get("sst")
    if isinstance(sst, list) and len(sst) == 12:
        out["sst"] = sst
    name_src = beach.get("name_src") or ""
    if name_src in ("eea", "osm_near"):
        out["nameSrc"] = name_src
    if beach.get("coastal") is False:
        out["inland"] = True
    return out


def wire_beach(beach, comps, score10, tier, reasons):
    tags = beach.get("osm_tags") or {}
    water = beach.get("water") or {}
    area = bi.protected_of(beach)
    base = beach.get("base") or {}
    wiki = beach.get("enwiki") or beach.get("localwiki") or ""
    row = {
        "id": bi.beach_id(beach),
        "name": beach["name"],
        "cc": beach["iso2"],
        "lat": beach["lat"],
        "lon": beach["lon"],
        "t": "r",
        "score": score10,
        "tier": tier,
        "comp": {k: round(v, 3) for k, v in comps.items()},
        "why": reasons[:bi.REASON_MAX],
        "tags": [r["k"] for r in bi.highlights_for(reasons)],
        "bestFor": bi.best_for(comps, reasons),
        "images": wire_images(beach),
        "src": beach.get("sources") or [],
    }
    # Stored by enrich (assign.stamp_rows), read back here: the export never
    # recomputes an assignment, so it never needs the spine loadable.
    if beach.get("rg"):
        row["rg"] = beach["rg"]
    if beach.get("name_local") and beach["name_local"] != beach["name"]:
        row["nameLocal"] = beach["name_local"]
    if beach.get("adm"):
        row["region"] = beach["adm"]
    surface = bi._surface_code(beach)
    if surface:
        row["surface"] = surface
    if 60 <= (beach.get("length_m") or 0) <= 30000:   # see reasons_for
        row["lengthM"] = int(beach["length_m"])
    row.update(v2_fields(beach))
    if water.get("class"):
        row["water"] = {"class": water["class"], "site": water.get("site") or ""}
    if area.get("name"):
        row["protected"] = {"name": area["name"], "kind": area.get("kind") or "",
                            "np": bool(area.get("national_park"))}
    access = access_of(beach)
    if access:
        row["access"] = access
    services = services_of(beach)
    if services:
        row["services"] = services
    if tags.get("supervised") == "yes" or tags.get("lifeguard") == "yes":
        row["lifeguard"] = True
    if tags.get("nudism") in ("yes", "designated", "customary"):
        row["nudism"] = True
    if tags.get("wheelchair") in ("yes", "designated"):
        row["wheelchair"] = True
    if base.get("id"):
        row["base"] = {"id": base["id"], "city": base["city"], "km": base["km"]}
    if wiki:
        row["wiki"] = wiki
    if beach.get("wd"):
        row["wd"] = beach["wd"]
    if beach.get("osm_id"):
        row["osm"] = beach["osm_id"]
    credits = [ATTRIBUTION["wikidata"] if "wikidata" in row["src"] else None,
               ATTRIBUTION["osm"] if "osm" in row["src"] else None,
               ATTRIBUTION["eea"] if row.get("water") else None,
               ATTRIBUTION["natura"] if row.get("prot") else None,
               ATTRIBUTION["commons"] if row["images"] else None]
    row["credit"] = [c for c in credits if c]
    return row


def photo_gate(beach):
    """The rated tier's photo bar: four pictures, and the LEAD one strongly
    evidenced.

    v1 asked for two pictures and for at least one of them, anywhere in the
    gallery, to be strongly evidenced. That let a geotagged frame lead the
    card while a name-matched picture sat in slot three, which is exactly
    backwards: the lead photograph is the one picture most people ever see of
    a beach, so it is the one that has to prove it is this beach.

    The gallery is already in publication order by the time this runs (the
    beauty engine wrote it), so images[0] is the hero and asking about it is
    asking about what the reader will see."""
    images = usable_images(beach)
    if len(images) < MIN_IMAGES:
        return False
    return images[0].get("evidence") in STRONG_EVIDENCE


def listed_photo_gate(beach):
    """The listed tier's bar: one strongly evidenced picture, or none.

    Zero is a pass, not a failure. A listed row with no publishable
    photograph ships the map card code and is drawn from its coordinates,
    which is honest and is better than a region page with a hole in it. What
    is NOT allowed is a weakly evidenced picture standing alone: a geotagged
    frame from the next cove is worse than no picture, because it makes a
    claim the row cannot support."""
    images = [i for i in usable_images(beach)
              if i.get("evidence") in STRONG_EVIDENCE]
    return images[:MIN_IMAGES_LISTED]


def named(beach):
    """The name test, hard on BOTH tiers: a word beyond the local word for
    "beach". "Plage" is not a destination and neither is "Strand"."""
    return bool(name_tokens(beach.get("name")))


def publishable(beach):
    """The gate, minus the score (which needs the whole country first)."""
    return named(beach) and photo_gate(beach)


def country_water_default(beaches):
    """What an unmeasured beach in this country is worth, or None.

    None where NO source publishes a bathing class for this country at all
    (Norway, Iceland, the non-Albania Balkans, and Great Britain until the
    Defra feed is reachable). There the water component is dropped and the
    remaining weights renormalised, rather than every beach in the country
    being handed a median computed from nothing.

    Where a source does publish, an unmeasured beach is worth the median of
    its measured neighbours: no reading is not a bad reading, and a wild cove
    must not be punished for being wild."""
    if beaches and all(b.get("no_water_source") for b in beaches):
        return None
    values = [bi.WATER_VALUE[b["water"]["class"]] for b in beaches
              if (b.get("water") or {}).get("class") in bi.WATER_VALUE]
    if len(values) < 5:
        return bi.WATER_DEFAULT
    return statistics.median(values)


def space_references(beaches):
    """The median beach length in each coastal stretch, so `space` reads
    "roomy for THIS coast" rather than "long in absolute metres".

    A Norwegian fjord beach and a Costa de la Luz strand cannot share a
    yardstick: 400 m is a big beach on one and a small one on the other. A
    stretch with too few measured beaches to have a median falls back to the
    country's, and then to the module's own constant."""
    by_stretch = {}
    everything = []
    for beach in beaches:
        length = beach.get("length_m")
        if not length or not (bi.SPACE_MIN_M <= length <= bi.SPACE_MAX_M):
            continue
        everything.append(length)
        key = (beach.get("rg") or {}).get("co")
        if key:
            by_stretch.setdefault(key, []).append(length)
    country = (statistics.median(everything) if len(everything) >= 5
               else bi.SPACE_FALLBACK_REF_M)
    out = {"": country}
    for key, lengths in by_stretch.items():
        out[key] = (statistics.median(lengths) if len(lengths) >= 5
                    else country)
    return out


def score_country(cc, verbose=False):
    rich = load_cache("rich", cc)
    if not rich or not rich.get("beaches"):
        return []
    beaches = rich["beaches"]
    water_default = country_water_default(beaches)
    references = space_references(beaches)
    fames = [bi.fame_raw(b) for b in beaches] or [1.0]
    country_max = max(fames) or 1.0
    scored = []
    for beach in beaches:
        reference = references.get((beach.get("rg") or {}).get("co") or "",
                                   references[""])
        comps, _score01, score10 = bi.score_beach(beach, country_max,
                                                  GLOBAL_MAX, water_default,
                                                  reference)
        scored.append((beach, comps, score10))
    return scored


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
    """The unit a beach is budgeted in: its coastal stretch, the NUTS3
    region where it has none (a lake beach), the country as a last resort."""
    rg = row.get("rg") or {}
    return rg.get("co") or rg.get("n3") or row["cc"]


def quota_ordered(rows, qmod):
    """Step 3 of the gate: the region quota.

    Rows are grouped by stretch, ranked within their group, cut at the
    group's quota, then re-ordered so every region's first pick outranks
    any region's second. The country cap that follows therefore trims the
    deepest tails first instead of whichever thin coast happened to sort
    last, which is what lets the Costa de la Luz keep beaches while the
    Costa Brava gives up its twentieth."""
    if qmod is None or not qmod.has_data():
        print("  region quotas unavailable, quota step skipped")
        return rows
    groups = {}
    for row in rows:
        groups.setdefault(region_key(row), []).append(row)
    ranked = []
    for key, group in groups.items():
        try:
            target = qmod.published_target(key, "beach")
        except KeyError:
            target = len(group)
        if target <= 0:
            # Not applicable is a statement about quotas, never a ban:
            # a beach that cleared every gate in a region the opportunity
            # table has not measured still publishes.
            target = len(group)
        for rank, row in enumerate(sorted(group, key=lambda r: -r["score"])):
            # A row past its region's quota is DEPRIORITISED, never dropped.
            # Cutting here made the quota a hard ceiling, and in a country
            # that is a single region of this layer's unit that ceiling is
            # national: the trails layer found Cyprus, one NUTS3 region,
            # falling from 103 publishable routes to a quota of 12. The
            # contract is that the quota decides WHICH rows fill a country's
            # budget and the country cap decides HOW MANY, so overflow sorts
            # behind every region's allocation and the cap trims it, which
            # is what the interleave was for in the first place.
            over = 1 if rank >= target else 0
            ranked.append((over, rank, -row["score"], row["id"], row))
    ranked.sort(key=lambda t: t[:4])
    return [row for _, _, _, _, row in ranked]


def wire_listed(beach):
    """A listed card: verified to exist, named, deduped, in region, and NOT
    scored. The score key is absent rather than null, which is the only
    reliable way to guarantee the app cannot render a number nobody earned."""
    # One strongly evidenced photograph, or none and the card is drawn from
    # the map. A weakly evidenced picture is refused outright here: on a row
    # with no score to argue with, a photograph of the next cove is the whole
    # of what the card claims.
    images = [i for i in wire_images(beach)
              if i.get("ev") in STRONG_EVIDENCE][:MIN_IMAGES_LISTED]
    why = [{"k": "unrated_coverage"}]
    if not images:
        why.append({"k": "no_photo_map_card"})
    row = {
        "id": bi.beach_id(beach),
        "name": beach["name"],
        "cc": beach["iso2"],
        "lat": beach["lat"],
        "lon": beach["lon"],
        "t": "l",
        "why": why,
        "images": images,
        "src": beach.get("sources") or [],
    }
    row.update(v2_fields(beach))
    # The water class is a fact about the place, not a score, so a listed row
    # may carry it: it came from a government register and no model touched
    # it. What a listed row may never carry is the beauty index or any part
    # of it.
    water = beach.get("water") or {}
    if water.get("class"):
        row["water"] = {"class": water["class"], "site": water.get("site") or ""}
    if beach.get("rg"):
        row["rg"] = beach["rg"]
    if beach.get("adm"):
        row["region"] = beach["adm"]
    if beach.get("wd"):
        row["wd"] = beach["wd"]
    if beach.get("osm_id"):
        row["osm"] = beach["osm_id"]
    credits = [ATTRIBUTION["wikidata"] if "wikidata" in row["src"] else None,
               ATTRIBUTION["osm"] if "osm" in row["src"] else None,
               ATTRIBUTION["eea"] if row.get("water") else None,
               ATTRIBUTION["natura"] if row.get("prot") else None,
               ATTRIBUTION["commons"] if row["images"] else None]
    row["credit"] = [c for c in credits if c]
    return row


def floor_fill(rated, spare, qmod):
    """Step 4 of the gate: the floor.

    Two floors, per 03-BEACHES.md: every applicable NUTS3 carries at least one
    row of any tier, and every coastal stretch at least three. The stretch
    floor is the one that answers the screenshot this whole programme started
    from, where Knokke's beach list ran 3 km, 3 km, then 135 km: the Belgian
    coast is one stretch, and three rows on it is the difference between a
    regional list and a jump to Normandy.

    Nothing is invented to fill a floor. The rows promoted here ship without a
    score, under their own heading, with the photo bar relaxed to one
    evidenced picture rather than waived, and with `unrated_coverage` saying
    so on the card."""
    if qmod is None or not qmod.has_data():
        return []
    have_n3, have_co = {}, {}
    for row in rated:
        rg = row.get("rg") or {}
        if rg.get("n3"):
            have_n3[rg["n3"]] = have_n3.get(rg["n3"], 0) + 1
        if rg.get("co"):
            have_co[rg["co"]] = have_co.get(rg["co"], 0) + 1

    # Candidates, best first, one entry per region key they could fill.
    pools = {}
    for beach, comps, score10 in spare:
        rg = beach.get("rg") or {}
        for key in (rg.get("n3"), rg.get("co")):
            if key:
                pools.setdefault(key, []).append((beach, score10))

    picked, listed = {}, []
    for key, pool in pools.items():
        if not qmod.applicable(key, "beach"):
            continue
        is_stretch = key.startswith("COAST:")
        # The stretch floor is 3 and the NUTS3 floor is 1. quotas.floor()
        # speaks in levels, and a coastal stretch is the layer's own unit, so
        # the level 2 floor is the one that applies to it.
        want = qmod.floor(key, "beach", level=2 if is_stretch else 3)
        already = (have_co if is_stretch else have_n3).get(key, 0)
        room = want - already
        if room <= 0:
            continue
        # One evidenced photograph beats none, a higher score breaks ties.
        pool.sort(key=lambda t: (-_best_evidence(t[0]), -t[1]))
        for beach, _score in pool:
            if room <= 0:
                break
            bid = bi.beach_id(beach)
            if bid in picked:
                continue          # already promoted for its other region key
            picked[bid] = True
            listed.append(wire_listed(beach))
            room -= 1
    return listed


def _best_evidence(beach):
    """1 when this beach has a strongly evidenced photograph, else 0."""
    images = usable_images(beach)
    if not images:
        return 0
    return 1 if any(i.get("evidence") in STRONG_EVIDENCE for i in images) else 0


def validate_listed(rows):
    """Listed rows have their own bar: real name, real place, no score of
    any spelling, and any image still carries its licence and evidence."""
    bad = []
    for row in rows:
        where = f"{row['cc']}/{row['id']}"
        if "score" in row or "tier" in row or "comp" in row:
            bad.append(f"{where}: listed row carries a score key")
        if not row["name"].strip():
            bad.append(f"{where}: no name")
        if not (-90 <= row["lat"] <= 90) or not (-180 <= row["lon"] <= 180):
            bad.append(f"{where}: coordinates off the earth")
        images = row.get("images") or []
        if len(images) > MIN_IMAGES_LISTED:
            bad.append(f"{where}: listed row carries {len(images)} images")
        for img in images:
            if not img.get("lic"):
                bad.append(f"{where}: an image carries no licence")
            # Stricter than the rated tier on purpose. A listed row has no
            # score to argue with, so its one photograph is the whole of what
            # the card claims, and a geotag is not enough to make it.
            if img.get("ev") not in STRONG_EVIDENCE:
                bad.append(f"{where}: a listed image is only "
                           f"{img.get('ev') or 'unevidenced'}")
        # A row with no photograph must SAY it has none, so the app draws the
        # map card rather than an empty frame.
        has_map_card = any(w.get("k") == "no_photo_map_card"
                           for w in row.get("why") or [])
        if not images and not has_map_card:
            bad.append(f"{where}: no images and no map card code")
        if images and has_map_card:
            bad.append(f"{where}: map card code on a row that has a picture")
        if not row.get("credit"):
            bad.append(f"{where}: no attribution")
    return bad


def validate(rows):
    """The gate's own self-check, run over what is about to be written.

    The rules above decide what gets published; this decides whether the file
    is fit to ship at all. It is here rather than in a separate script for the
    same reason pipeline/features/validate_features.py is a separate one: that
    layer has six stages sharing one artifact and needs a verdict between two
    of them, while this one writes in a single pass and can simply refuse.

    Returns a list of failures. A non-empty list stops the export, because a
    beach with no credit or a broken image URL is worse than no beach."""
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
        if len(row["images"]) < MIN_IMAGES:
            bad.append(f"{where}: {len(row['images'])} images, "
                       f"the rated tier wants {MIN_IMAGES}")
        # The LEAD photograph is the one picture most readers ever see of a
        # beach, so it is the one that has to prove it is this beach. A
        # geotagged frame may fill a later slot; it may not lead.
        if row["images"] and row["images"][0].get("ev") not in STRONG_EVIDENCE:
            bad.append(f"{where}: the lead photograph is only "
                       f"{row['images'][0].get('ev') or 'unevidenced'}")
        for img in row["images"]:
            if not str(img.get("u", "")).startswith("https://"):
                bad.append(f"{where}: image is not https")
            if not img.get("lic"):
                bad.append(f"{where}: an image carries no licence")
            # No evidence, no publication. This is the check that would have
            # caught "Playground in Kustermann-Park.jpg" standing in for a
            # beach, and it is cheap enough to run on every row every time.
            if img.get("ev") not in ("p18", "cat", "name", "geo"):
                bad.append(f"{where}: an image has no evidence of being this "
                           f"beach ({img.get('ev') or 'none'})")
        if not row["credit"]:
            bad.append(f"{where}: no attribution")
        if not row["why"]:
            bad.append(f"{where}: nothing to say about it (gate leak)")
        if not (-90 <= row["lat"] <= 90) or not (-180 <= row["lon"] <= 180):
            bad.append(f"{where}: coordinates off the earth")
        if row.get("t") != "r":
            bad.append(f"{where}: rated row without t='r'")
        # Every published row carries its region block. A row whose rg has
        # no n3 is the documented handful outside the admin spine (the h4
        # cell still places it); a row with no rg at all was never stamped,
        # which means enrich or the backfill did not run.
        if not row.get("rg"):
            bad.append(f"{where}: no region assignment (run "
                       f"pipeline/oneoff/backfill_regions.py)")
    return bad


def dedupe(rows):
    """One row per beach, and one photograph per row.

    Two things get dropped here, both of which show up as the same beach twice
    in a list. The first is a row stage 1 could not merge: a Wikidata point
    150 m off the OSM polygon under a name that shares no token because one of
    them is transliterated.

    The second is subtler and comes from the photograph fallback. A cove with
    no file named after it borrows any Commons photograph taken within 300 m,
    which is right for a lone cove and wrong for Ksamil, where eight named
    beaches sit inside one bay and all eight end up with the same picture. So
    a lead photograph already used by a better scoring beach retires the row.
    The best of the cluster keeps the picture and the name; the rest were
    never going to be told apart on a card anyway."""
    kept, leads = [], set()
    for row in rows:
        # A beach with photographs of its own keeps its place on the next one
        # nobody else is leading with, at the same evidence standing. Only a
        # beach whose every picture already belongs to a better scoring
        # neighbour retires, which is the Ksamil case this rule was written
        # for: there, the eight rows genuinely have nothing of their own.
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


# ---------------------------------------------------------------------------
# Facets
#
# 03-BEACHES.md section 4: "never render a filter chip whose count is 0 in the
# current scope", and "add the count to every chip". Two of the three chips
# the tab shipped read zero, which tells a reader the filters are broken even
# when they are honest.
#
# The counts are computed here, over the rows actually published, and ship in
# the wire. The app still recomputes them live as chips are tapped, because a
# count has to answer "inside what the other chips already narrowed"; what the
# wire's copy buys is a scope-wide answer for the region pages and a number
# the harness can hold the rendered chips against.
# ---------------------------------------------------------------------------

def _has(row, code):
    return any(w.get("k") == code for w in row.get("why") or [])


FACETS = {
    "water": (
        ("excellent", lambda r: (r.get("water") or {}).get("class") == "Excellent"),
        ("good", lambda r: (r.get("water") or {}).get("class") == "Good"),
        ("sufficient", lambda r: (r.get("water") or {}).get("class") == "Sufficient"),
        ("unrated", lambda r: not (r.get("water") or {}).get("class")),
    ),
    "substrate": (
        ("sand", lambda r: r.get("surface") == "sand"),
        ("pebble", lambda r: r.get("surface") in ("pebble", "fineGravel", "gravel")),
        ("shingle", lambda r: r.get("surface") == "shingle"),
        ("rock", lambda r: r.get("surface") == "rock"),
    ),
    "setting": (
        ("cliffs", lambda r: _has(r, "cliffs")),
        ("dunes", lambda r: _has(r, "dunes")),
        ("pines", lambda r: _has(r, "pines")),
        ("lagoon", lambda r: _has(r, "lagoon")),
        ("park", lambda r: _has(r, "nationalPark") or _has(r, "reserve")),
    ),
    "wildness": (
        ("wild", lambda r: _has(r, "undeveloped")),
        ("quiet", lambda r: _has(r, "quiet")),
        ("developed", lambda r: _has(r, "resortStrip")),
    ),
    "size": (
        ("cove", lambda r: r.get("size") == "cove"),
        ("beach", lambda r: r.get("size") == "beach"),
        ("strand", lambda r: r.get("size") == "strand"),
    ),
    "facilities": (
        ("parking", lambda r: "parking" in (r.get("services") or [])),
        ("toilets", lambda r: "toilets" in (r.get("services") or [])),
        ("food", lambda r: "food" in (r.get("services") or [])),
        ("stepfree", lambda r: bool(r.get("wheelchair"))),
        ("lifeguard", lambda r: bool(r.get("lifeguard"))),
    ),
    "naturist": (
        ("yes", lambda r: bool(r.get("nudism"))),
    ),
    "protected": (
        ("natura2000", lambda r: (r.get("prot") or {}).get("net") == "natura2000"),
        ("emerald", lambda r: (r.get("prot") or {}).get("net") == "emerald"),
        ("national", lambda r: bool((r.get("protected") or {}).get("np"))),
    ),
    "bestfor": (
        ("swimming", lambda r: "swimming" in (r.get("bestFor") or [])),
        ("sunset", lambda r: bool(r.get("sunset")) or "sunset" in (r.get("bestFor") or [])),
        ("walking", lambda r: "walkers" in (r.get("bestFor") or [])),
        ("surf", lambda r: "surfing" in (r.get("bestFor") or [])),
    ),
}


def facet_counts(rows):
    """{group: {value: n}} over published rows, zeros omitted.

    Omitted rather than written as 0, so a consumer that renders whatever it
    is given cannot render an empty chip. That is the brief's rule expressed
    in the data instead of trusted to the view."""
    out = {}
    for group, options in FACETS.items():
        counts = {}
        for key, test in options:
            n = sum(1 for row in rows if test(row))
            if n:
                counts[key] = n
        if counts:
            out[group] = counts
    return out


def dedupe_across(rated, listed):
    """The 150 m rule, applied across BOTH tiers.

    Hard on both tiers per the brief. Rated rows are placed first and keep
    their ground, so a listed row never shadows a scored beach 80 m away, and
    two listed rows on the same sand collapse to one. Without this the
    widened harvest publishes the same cove twice under two names, once from
    OpenStreetMap and once from the bathing register."""
    kept_pts = [(r["lat"], r["lon"]) for r in rated]
    out = []
    for row in listed:
        if any(haversine_km(row["lat"], row["lon"], lat, lon) <= DUPLICATE_KM
               for lat, lon in kept_pts):
            continue
        kept_pts.append((row["lat"], row["lon"]))
        out.append(row)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--out", default=str(OUT_DIR))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--min-score", type=float, default=MIN_SCORE)
    parser.add_argument("--max-per-country", type=int, default=PUBLISH_MAX)
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or COUNTRIES

    # The Europe wide fame ceiling has to be known before any country can be
    # scored, so fame is read once over everything that was enriched.
    global GLOBAL_MAX
    GLOBAL_MAX = 1.0
    pools = {}
    for cc in countries:
        rich = load_cache("rich", cc)
        if not rich or not rich.get("beaches"):
            continue
        pools[cc] = rich["beaches"]
        for beach in rich["beaches"]:
            GLOBAL_MAX = max(GLOBAL_MAX, bi.fame_raw(beach))

    out_dir = Path(args.out)
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    qmod = _region_quotas()
    index = []
    published = []
    listed_all = []
    by_country = {}
    listed_by_country = {}
    total = 0
    credits = set()

    for cc in countries:
        if cc not in pools:
            continue
        scored = score_country(cc, args.verbose)
        # The gate, in the order the region programme fixed across every
        # layer: score -> photo -> region quota -> floor fill -> dedupe ->
        # write. The load bearing change is that a photo gate failure falls
        # through into the floor pool instead of disappearing, which is the
        # bug that kept the mountain floor from ever holding.
        # The gate, in the order 03-BEACHES.md sets out:
        #   score -> photo -> name -> dedupe -> region quota -> floor fill
        # with the load bearing property that a failure at the score or the
        # photo step FALLS THROUGH into the listed pool instead of deleting
        # the beach. The name test and the dedupe are hard on both tiers, so
        # they drop a row outright.
        rows, spare = [], []
        for beach, comps, score10 in sorted(scored, key=lambda t: -t[2]):
            if not named(beach):
                continue                      # hard, both tiers
            if score10 < args.min_score or not photo_gate(beach):
                spare.append((beach, comps, score10))
                continue
            reasons = bi.reasons_for(beach, comps)
            # A beach the data cannot say one sentence about is a name on a
            # photograph. It is not published as rated, and that is a gate
            # rather than a build failure: the tail of unsurveyed strands is
            # expected. It stays in the pool for the floor.
            if not reasons:
                spare.append((beach, comps, score10))
                continue
            rows.append(wire_beach(beach, comps, score10,
                                   bi.tier_for(score10), reasons))
        rows = dedupe(rows)
        rows = quota_ordered(rows, qmod)[:args.max_per_country]
        rows.sort(key=lambda r: -r["score"])
        listed = dedupe_across(rows, floor_fill(rows, spare, qmod))
        if not rows and not listed:
            if args.verbose:
                print(f"  {cc}: nothing clears the gate")
            continue
        for row in rows:
            credits.update(row["credit"])
        for row in listed:
            credits.update(row["credit"])
        published.extend(rows)
        listed_all.extend(listed)
        total += len(rows)
        cover = next((r["images"][0]["u"] for r in rows if r["images"]), "")
        entry = {
            "cc": cc,
            "n": len(rows),
            "best": rows[0]["score"] if rows else None,
            "cover": cover,
            "top": [r["name"] for r in rows[:3]],
            "facets": facet_counts(rows),
        }
        if listed:
            entry["listed"] = len(listed)
        index.append(entry)
        by_country[cc] = rows
        listed_by_country[cc] = listed
        if args.dry_run or args.verbose:
            note = f", {len(listed)} listed" if listed else ""
            best = f"best {rows[0]['score']} ({rows[0]['name']})" if rows else ""
            print(f"  {cc}: {len(rows)} beaches{note} {best}")

    # Validate BEFORE anything is written. Scoring every country first and
    # writing afterwards is the whole point: a gate that fires after half the
    # files are on disk has not gated anything, it has just made the wire
    # inconsistent in a new way.
    failures = validate(published) + validate_listed(listed_all)
    if failures:
        for line in failures[:20]:
            print(f"  FAIL {line}")
        print(f"[beaches] {len(failures)} validation failures, nothing written")
        raise SystemExit(1)

    # The Europe wide opening page, taken from what was just published so it
    # can never disagree with the country files.
    top = []
    per_country = {}
    for row in sorted(published, key=lambda r: (-r["score"], r["id"])):
        if per_country.get(row["cc"], 0) >= TOP_PER_COUNTRY:
            continue
        per_country[row["cc"]] = per_country.get(row["cc"], 0) + 1
        top.append(row)
        if len(top) >= TOP_N:
            break

    index.sort(key=lambda c: -c["n"])
    payload = {
        "generated_at": generated,
        "n_beaches": total,
        "model": {
            "version": bi.MODEL_VERSION,
            "weights": bi.WEIGHTS,
            # The brief's table as written, alongside the one actually used.
            # They differ by a normalisation: 03-BEACHES.md's v2 weights sum
            # to 1.08 rather than 1.00, and shipping that unbalanced would
            # have inflated every score in Europe against unchanged band
            # cutoffs. The ratios are the brief's; the sum is 1. Both ship so
            # the deviation is auditable from the wire.
            "weights_as_briefed": bi.WEIGHTS_AS_BRIEFED,
            "standout_bonus": bi.STANDOUT_BONUS,
            "standout_on": list(bi.STANDOUT_ON),
            # The photo engine that ordered every gallery in this wire
            # (pipeline/photos/selection.py), shipped with the data so a
            # reader can see which weights picked each hero (invariant 2).
            "photo_rank": photo_rank_block(),
            "tier_cutoffs": bi.TIER_CUTOFFS,
            "min_score": args.min_score,
            "min_images": MIN_IMAGES,
            "min_images_listed": MIN_IMAGES_LISTED,
            "publish_max": args.max_per_country,
            "size_bands": {"cove_max_m": bi.COVE_MAX_M,
                           "strand_min_m": bi.STRAND_MIN_M},
            "facets": {group: [key for key, _ in options]
                       for group, options in FACETS.items()},
            # The region quota model ships with the data (invariant 2): a
            # wire reader can see exactly which formula sized each region.
            "region_quota": (qmod.model_block()
                             if qmod is not None and qmod.has_data() else None),
        },
        "countries": index,
        # Europe wide facet counts, over every rated row published. The tab
        # opens on top.json, so these are what its chips can be checked
        # against without loading 40 country files.
        "facets": facet_counts(published),
        "n_listed": len(listed_all),
        "attribution": sorted(credits),
        # What this build read, and when. Two wire files that differ can then
        # be told apart: same sources and same model means the code moved,
        # different dates means the world did.
        "sources": provenance(countries),
    }
    if args.dry_run:
        print(f"[beaches] {total} publishable across {len(index)} countries")
        return
    out_dir.mkdir(parents=True, exist_ok=True)
    for cc, rows in by_country.items():
        path = out_dir / f"{cc}.json"
        envelope = {"country": cc, "generated_at": generated, "n": len(rows),
                    "facets": facet_counts(rows),
                    "beaches": rows}
        # A separate array, not a flag inside the main one: a screen has to
        # opt in to showing unscored rows, and they can never interleave
        # into a ranked list by accident.
        if listed_by_country.get(cc):
            envelope["listed"] = listed_by_country[cc]
        path.write_text(json.dumps(envelope, ensure_ascii=False,
                                   separators=(",", ":")),
                        encoding="utf-8")
        if args.verbose:
            print(f"  {cc}: -> {path.name} ({path.stat().st_size // 1024} KB)")
    # A country that stops qualifying leaves its file behind, and a stale
    # {CC}.json is still reachable: index.json will not list it, but the app
    # fetches per country by code the moment somebody types that country's
    # name. Prune, the same way pipeline/trails/export_wire.py prunes details.
    for path in out_dir.glob("[A-Z][A-Z].json"):
        if path.stem not in by_country:
            path.unlink()
            if args.verbose:
                print(f"  pruned {path.name} (no longer publishable)")

    (out_dir / "index.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    (out_dir / "top.json").write_text(
        json.dumps({"generated_at": generated, "n": len(top),
                    "per_country_cap": TOP_PER_COUNTRY, "beaches": top},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print(f"[beaches] published {total} beaches across {len(index)} countries "
          f"into {out_dir} (top.json holds {len(top)})")


GLOBAL_MAX = 1.0

if __name__ == "__main__":
    main()
