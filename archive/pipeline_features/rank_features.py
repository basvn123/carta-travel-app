"""rank_features.py - score, corroborate and tier every beach and summit.

Stage 4 of the natural-features pipeline (see features_common.py for the stage
map). build_features.py produced 17,858 entities, which is a database extract:
nothing in it says which three of Greece's 844 beaches a country card should
lead with, and nothing stops an unnamed cove with no evidence at all from
sitting above Navagio. This stage turns the extract into a produced work by
answering one question per feature: how sure are we that a traveller wants to
see THIS one.

The score is a weighted sum of open signals, all in 0..1 so the researched
weights mean what they say:

  fame         0.5 * sitelinks + 0.5 * pageviews, log scaled and z-scored
               (zlog is score_significance.py's, imported not reinvented)
  photo        a Commons photo whose licence actually clears the reuse gate.
               An unlicensed thumbnail is not a photo we can ship, so it does
               not count here either
  designation  capped sum of unesco 0.55, geopark 0.35, national_park 0.30,
               ramsar 0.20, natura2000 0.15
  curation     a Wikivoyage editor listed it, plus the POI layer's own rate
  water        beaches: Excellent 1.0, Good 0.7, Sufficient 0.35, Poor 0.0
  form         mountains: prominence, else elevation, else nothing, and the
               provenance says which. Beaches: how many independent records
               describe the same strand, the only extent proxy on disk

  score_beach    = 0.25 photo + 0.20 water + 0.20 designation + 0.20 fame
                   + 0.10 curation + 0.05 form
  score_mountain = 0.30 form + 0.25 photo + 0.20 fame + 0.15 designation
                   + 0.10 curation

The shipped score is not that sum but its percentile, blended 0.6 per country
with 0.4 Europe-wide, the trick score_significance.py uses per destination:
without it Greece's 45th beach outranks Latvia's best and every country card
outside the Mediterranean reads like an apology. A country with fewer than
five features of a kind is scored on the Europe-wide distribution only, because
a percentile taken over two rows says nothing.

Three rules are not negotiable:

  * CORROBORATION. No feature reaches tier 1 without an independent witness:
    its own Wikipedia article or Wikidata QID, a formal designation, an
    official bathing-water class, or a licence-cleared Commons photo. A high
    score with no witness is a data artefact, and the significance engine
    learnt this the expensive way. The Natura 2000 label does NOT count: it is
    OSM's protect_class=4 read as a habitat site, an inference rather than a
    site-code join, so it may be weighted but never treated as a record.
  * POOR WATER CAPS AT TIER 3. An officially Poor beach is never a top pick,
    whatever its photo and its fame say.
  * TIER 1 IS SCARCE. At most 12 per country per kind and at most 20% of that
    country's rows of that kind, so "top pick" keeps discriminating.

What this stage refuses to pass on, with every id kept in the artifact's gate
ledger so the drop is visible and reversible:

  no_near_dest        no priced destination within 60 km: the app has no
                      country card journey to hang it off
  beach_no_evidence   a beach with no water class, no shippable photo and no
                      article: nothing justifies shipping it
  misattributed       not a drop but a strip: an article about the island, the
                      town or the station takes its sitelinks, its pageviews
                      and its photo back out of the record
  image_unlicensed    a demotion: an image whose Commons licence is unresolved
                      or fails the NC/ND gate moves to image_pending, so
                      enrich_images.py can resolve it later and nothing ships
                      without its TASL row

Reads   data/derived/features_raw.json
        cache/poi_image_licenses.json   TASL per Commons file
        cache/poi_wikidata.json         which QIDs are towns and stations
        cache/wikivoyage_listings.json  editor curation, per destination
        cache/unesco_whc.json           World Heritage sites (Natural, Mixed)
        cache/osm_protected_areas.json  geopark and ramsar, by name
Writes  data/derived/features.json      {"generated_at", "counts", "gated",
                                         "features": [...]}

Idempotent: a run rebuilds the whole artifact from the raw one, so nothing can
duplicate. Nothing here touches the network, so there is nothing to refresh.

Usage:
    python pipeline/features/rank_features.py
    python pipeline/features/rank_features.py --country ES --top 15
    python pipeline/features/rank_features.py --dry
"""
import argparse
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

from features_common import (CACHE, FEATURES, GENERIC_TOKENS, GeoIndex,
                             POI_LICENSES, PROTECTED_CACHE, RAW_FEATURES, ROOT,
                             catalogue_countries, fold, haversine_km, load_json,
                             log, save_json)
from build_features import commons_filename, core_of, romanise

# zlog and percentile_ranks are the significance engine's, and this pipeline
# ranks on the same arithmetic on purpose: two scoring passes that disagree on
# what a percentile is would put a POI and the feature built from it in
# different orders.
sys.path.insert(0, str(ROOT / "pipeline"))
from score_significance import percentile_ranks, zlog  # noqa: E402

WV_CACHE = CACHE / "wikivoyage_listings.json"
UNESCO_CACHE = CACHE / "unesco_whc.json"
POI_WIKIDATA = CACHE / "poi_wikidata.json"

# Misattribution test. A POI's wiki link is whatever the harvest could resolve,
# and for a beach that is usually the island, the resort or the town: "Rabbit
# Beach" pointed at en:Lampedusa, "Praia do Carneiro" at en:Porto Airport and
# "Playa de La Concha" at en:Camino de Santiago, each of them lending the
# feature 40 to 80 sitelinks of somebody else's fame. score_significance.py
# hit the same wall and zeroes the attention signals; this does the same, and
# drops the photo with it, because the photo came from that same article and
# the evidence is unambiguous: an airport logo, a city flag, a siege map.
NAME_TOKEN_MIN = 3               # "Vai" is a beach, "Pen y Fan" is a summit
NAME_PREFIX_MIN = 5              # "aletsch" may match "aletschgletscher",
                                 # "san" may not match "santorini"

WEIGHTS = {
    "beach": {"photo": 0.25, "water": 0.20, "designation": 0.20,
              "fame": 0.20, "curation": 0.10, "form": 0.05},
    "mountain": {"form": 0.30, "photo": 0.25, "fame": 0.20,
                 "designation": 0.15, "curation": 0.10},
}
WATER_SCORE = {"Excellent": 1.0, "Good": 0.7, "Sufficient": 0.35, "Poor": 0.0}
WATER_TIER_CAP = "Poor"          # this class can not rise above tier 3

# The researched designation weights. natural_monument and wilderness are real
# designations the OSM layer also carries, but they are not in the researched
# set, so they score nothing here and still count as a witness: weighting an
# unresearched signal would be inventing policy, ignoring a formal record
# would be throwing evidence away.
DESIGNATION_WEIGHT = {"unesco": 0.55, "geopark": 0.35, "national_park": 0.30,
                      "ramsar": 0.20, "natura2000": 0.15}
DESIGNATION_CAP = 1.0
INFERRED_DESIGNATIONS = {"natura2000"}   # see the corroboration note above

LOCAL_BLEND = 0.6                # per-country percentile vs Europe-wide
SMALL_N = 5                      # below this, Europe-wide only
TIER1_CAP = 12
TIER1_SHARE = 0.20
TIER2_SHARE = 0.30

# A beach is long: the canonical point and a Wikivoyage listing's point can sit
# 2 km apart on the same strand, so this is wider than the significance pass's
# 1.5 km POI tolerance. The name core still has to match exactly.
WV_MATCH_KM = 3.0
CURATION_WV = 0.65               # the rest is the POI layer's own rate

# World Heritage rows are the property's centroid, not its outline, and a
# natural property is typically hundreds of square kilometres, so a summit
# within 10 km of the centroid is almost certainly inside it. Cultural sites
# are excluded outright: a beach near the centroid of a historic town centre
# is not a designated beach, and printing that would be a false claim.
UNESCO_KM = 10.0
UNESCO_CATEGORIES = ("Natural", "Mixed")
UNESCO_SOURCE = {"name": "UNESCO World Heritage Centre, World Heritage List",
                 "url": "https://whc.unesco.org/en/list/"}

# Geopark and Ramsar have no class of their own in the OSM protected-area
# layer; the designation only survives in the site's own name.
NAME_DESIGNATIONS = {"geopark": ("geopark",), "ramsar": ("ramsar",)}
NAME_DESIGNATION_KM = 5.0        # the radius build_features joined areas at

# Mirrors harvest_image_licenses.gate_ok: NC, ND and permission-only files are
# not shippable at all. Kept here rather than imported because that harvester
# lives one directory up and owns the network; this is the read-side gate.
# "nc" and "nd" are matched as whole tokens ("CC BY-NC-SA 4.0"), never as
# substrings, or "Public domain" would fail on the "nd" inside "domain".
BAD_LICENCE_TOKENS = {"nc", "nd"}
BAD_LICENCE_PHRASES = ("noncommercial", "non commercial", "noderivatives",
                       "no derivatives", "by permission", "permission only")


# --------------------------------------------------------------------------- #
# scales
# --------------------------------------------------------------------------- #
def unit_zlog(values):
    """zlog rescaled to 0..1 within the kind.

    The raw z is unbounded, so mixing it with a 0..1 designation term would let
    one Mont Blanc-sized outlier outweigh the entire rest of the formula and
    make the researched weights decorative. Rescaling keeps zero at zero (a
    log1p of 0 is the minimum of every one of these distributions) and keeps
    the log spacing above it."""
    if not values:
        return []
    zs = zlog(values)
    lo, hi = min(zs), max(zs)
    span = hi - lo
    if span <= 0:
        return [0.0] * len(zs)
    return [(z - lo) / span for z in zs]


def licence_ok(licence):
    """Is this licence string shippable. Empty means unresolved, which is not
    the same as NC or ND but is just as unshippable: we can not credit it."""
    if not licence:
        return False
    low = re.sub(r"[^a-z0-9]+", " ", fold(licence)).strip()
    if set(low.split()) & BAD_LICENCE_TOKENS:
        return False
    return not any(phrase in low for phrase in BAD_LICENCE_PHRASES)


# --------------------------------------------------------------------------- #
# joins the raw stage could not make
# --------------------------------------------------------------------------- #
def wikivoyage_index():
    """dest id -> [(name core, lat, lon, weight)].

    A port of score_significance.build_wv_index, with its early-listing weight
    (the editor put the best thing first, so the first listing is worth 1.0 and
    the tail approaches 0.5) but only the named half: features have no QID for
    most rows, so the QID path would fire almost never."""
    out = {}
    for did, rec in (load_json(WV_CACHE) or {}).items():
        listings = rec.get("listings") or []
        n = len(listings)
        named = []
        for L in listings:
            w = 1.0 - 0.5 * (L.get("order", 0) / (n - 1) if n > 1 else 0)
            for nm in filter(None, (L.get("name"), L.get("alt"))):
                core = core_of(nm)
                if core:
                    named.append((core, L.get("lat"), L.get("lon"), w))
        if named:
            out[did] = named
    return out


def wikivoyage_weight(f, index):
    """How prominently a Wikivoyage editor listed this feature, 0 when they did
    not. Only the destinations that contributed the feature are consulted, so a
    listing in the next town over can not lend its curation."""
    core = core_of(f["name"])
    if not core:
        return 0.0
    best = 0.0
    for did in f["provenance"].get("dests") or []:
        for lcore, lat, lon, w in index.get(did, ()):
            if lcore != core:
                continue
            if lat is not None and lon is not None:
                if haversine_km(f["lat"], f["lon"], lat, lon) > WV_MATCH_KM:
                    continue
            best = max(best, w)
    return best


def join_unesco(features, stats):
    """Add the unesco designation where a natural World Heritage property sits
    on top of the feature. The site name and distance go into provenance so the
    claim is auditable, and the WHC citation joins the feature's sources."""
    sites = [s for s in (load_json(UNESCO_CACHE) or [])
             if s.get("category") in UNESCO_CATEGORIES
             and isinstance(s.get("lat"), (int, float))]
    index = GeoIndex(sites, cell_deg=0.5)
    for f in features:
        for km, s in index.near(f["lat"], f["lon"], UNESCO_KM):
            if s.get("iso") != f["iso2"]:
                continue            # a centroid across the border is not ours
            if "unesco" not in f["designations"]:
                f["designations"] = sorted(f["designations"] + ["unesco"])
            f["provenance"]["unesco"] = {"site": s.get("name"),
                                         "category": s.get("category"),
                                         "km": round(km, 1)}
            if UNESCO_SOURCE not in f["sources"]:
                f["sources"].append(dict(UNESCO_SOURCE))
            stats["unesco"] += 1
            break


def join_named_designations(features, stats):
    """Geopark and Ramsar, which the protected-area layer only records inside
    the site's own name. There are barely a dozen such rows in 47,700 areas, so
    they are filtered first and matched by plain distance: building an index
    for thirteen points would cost more than the scan."""
    areas = []
    for a in ((load_json(PROTECTED_CACHE) or {}).get("by_key") or {}).values():
        name = fold(a.get("name"))
        if not isinstance(a.get("lat"), (int, float)):
            continue
        for tag, words in NAME_DESIGNATIONS.items():
            if any(w in name for w in words):
                areas.append((tag, a))
    if not areas:
        return
    for f in features:
        for tag, a in areas:
            km = haversine_km(f["lat"], f["lon"], a["lat"], a["lon"])
            if km > NAME_DESIGNATION_KM:
                continue
            if tag not in f["designations"]:
                f["designations"] = sorted(f["designations"] + [tag])
                f["provenance"].setdefault("named_designations", {})[tag] = {
                    "area": a.get("name"), "km": round(km, 1)}
                stats[tag] += 1


# --------------------------------------------------------------------------- #
# the misattribution gate
# --------------------------------------------------------------------------- #
_WORDS = re.compile(r"[^a-z0-9]+")


def _match_tokens(s):
    """Identity tokens for the name test. German and Nordic spellings of the
    same name have to meet: "Moench" and "Monch" are one mountain, so oe, ae,
    ue and the sharp s are collapsed on both sides before comparing."""
    # The sharp s is written as an escape to keep this source ASCII,
    # the same convention build_features.py uses for Greek and Cyrillic.
    s = romanise(str(s or "").replace("\u00df", "ss"))
    for pair, one in (("ae", "a"), ("oe", "o"), ("ue", "u"), ("ss", "s")):
        s = s.replace(pair, one)
    return {t for t in _WORDS.split(s)
            if len(t) >= NAME_TOKEN_MIN and t not in GENERIC_TOKENS}


def article_names_it(name, title):
    """Does this article title name the same thing as this feature."""
    a, b = _match_tokens(name), _match_tokens(title)
    if not a or not b:
        # A name made only of generic words ("Strandbad"): fall back to the
        # whole string, so the test can not pass by having nothing to compare.
        x = _WORDS.sub("", romanise(name))
        y = _WORDS.sub("", romanise(title))
        return bool(x and y and (x in y or y in x))
    for x in a:
        for y in b:
            if x == y:
                return True
            if min(len(x), len(y)) >= NAME_PREFIX_MIN \
                    and (x.startswith(y) or y.startswith(x)):
                return True
    return False


def wikidata_flags():
    """QID -> the significance pass's resolution record, which already knows
    which QIDs are administrative areas, settlements and stations."""
    out = {}
    for rec in (load_json(POI_WIKIDATA) or {}).values():
        qid = rec.get("qid")
        if qid:
            out.setdefault(qid, rec)
    return out


def gate_article(f, flags, stats):
    """Strip an article that is about something else, and everything it lent.

    The link, the QID, the sitelinks, the pageviews and the photo all came from
    one resolution; if that resolution named the island rather than the beach,
    none of them is evidence about this feature. Everything moves to provenance
    rather than being deleted, so a later stage that resolves the right article
    can tell what was rejected and why."""
    title = (f.get("wikipedia") or "").split(":", 1)[-1]
    if not title:
        return
    rec = flags.get(f.get("wikidata")) or {}
    if rec.get("admin"):
        why = "admin_or_settlement"
    elif rec.get("station"):
        why = "station"
    elif not article_names_it(f["name"], title):
        why = "name_mismatch"
    else:
        return
    f["provenance"]["misattributed"] = {
        "wikipedia": f.get("wikipedia"), "wikidata": f.get("wikidata"),
        "reason": why,
        "sitelinks": f["signals"].get("sitelinks"),
        "image": (f.get("image") or {}).get("file"),
    }
    f["wikipedia"] = f["wikidata"] = None
    f["signals"]["sitelinks"] = f["signals"]["pageviews"] = None
    f["signals"]["has_wiki"] = False
    if f.get("image"):
        f["image_pending"] = {"url": f["image"].get("url"),
                              "file": f["image"].get("file"),
                              "reason": "misattributed_article"}
        f["image"] = None
        f["signals"]["commons_assessed"] = False
        stats["image_misattributed_article"] += 1
    stats[f"misattributed_{why}"] += 1


# --------------------------------------------------------------------------- #
# the licence gate
# --------------------------------------------------------------------------- #
def gate_image(f, licences, stats):
    """Only a photo we can credit is a photo we can ship.

    build_features carries whatever thumbnail the POI layer had; roughly a
    third of them are Commons files nobody has resolved a licence for yet
    (harvest_image_licenses.py only ever walked upload.wikimedia.org URLs, so
    every Special:FilePath thumbnail went unassessed). Those move to
    image_pending: kept, never shipped, and ready for enrich_images.py to
    resolve without a re-harvest."""
    img = f.get("image")
    if not img:
        return
    fn = img.get("file") or commons_filename(img.get("url"))
    rec = licences.get(fn) if fn else None
    if rec and not rec.get("miss") and rec.get("ok") is not False:
        # The cache is the authority on TASL; the raw stage may have copied an
        # older row, so refresh the three fields the wire has to print.
        img["file"] = fn
        img["author"] = rec.get("author") or img.get("author")
        img["licence"] = rec.get("license") or img.get("licence")
        img["licence_url"] = rec.get("license_url") or img.get("licence_url")
        img["source"] = "wikimedia_commons"
    if licence_ok(img.get("licence")):
        stats["image_shippable"] += 1
        return
    if not fn:
        reason = "not_commons"           # a local wiki upload, often non-free
    elif rec is None:
        reason = "licence_unresolved"
    elif rec.get("miss"):
        reason = "file_gone"
    else:
        reason = "licence_blocked"
    f["image_pending"] = {"url": img.get("url"), "file": fn, "reason": reason}
    f["image"] = None
    f["signals"]["commons_assessed"] = False
    stats[f"image_{reason}"] += 1


# --------------------------------------------------------------------------- #
# scoring
# --------------------------------------------------------------------------- #
def designation_score(designations):
    return min(DESIGNATION_CAP,
               sum(DESIGNATION_WEIGHT.get(d, 0.0) for d in designations))


def witnesses(f):
    """Every independent record that says this feature exists and matters.
    Inferred designations are deliberately absent: an inference is not a
    witness, it is the same guess told twice."""
    out = []
    # An article, not merely a Wikidata row. A bare QID says a database has
    # heard of the place, which is not corroboration a reader can check and
    # is not a field the wire ships: two Luxembourg hills took the country's
    # top seats on nothing else, and the wire could not show why.
    if f.get("wikipedia"):
        out.append("article")
    formal = [d for d in f["designations"] if d not in INFERRED_DESIGNATIONS]
    if formal:
        out.append("designation")
    if (f.get("water") or {}).get("class") in WATER_SCORE:
        out.append("bathing_water")
    if f.get("image") and licence_ok(f["image"].get("licence")):
        out.append("commons_photo")
    return out


def form_value(f):
    """(value, basis). Mountains rank on shape: prominence first because a
    3,000 m shoulder of a bigger massif is not a mountain anybody visits, then
    elevation, and when Wikidata has given us neither the provenance says so
    rather than the score pretending. Beaches have no morphology on disk at
    all, so their 5% form term is an extent proxy: how many independent POI
    records and destinations describe the same strand."""
    if f["kind"] == "mountain":
        if isinstance(f.get("prominence_m"), (int, float)):
            return float(f["prominence_m"]), "prominence"
        if isinstance(f.get("elevation_m"), (int, float)):
            return float(f["elevation_m"]), "elevation"
        return 0.0, "none"
    prov = f["provenance"]
    extent = len(prov.get("dedupe_of") or []) + len(prov.get("dests") or [])
    return float(extent), "extent_proxy"


def photo_value(f):
    """Commons photos we could ship. enrich_images.py will one day count them
    per feature; until it does, a licence-cleared thumbnail is the one we have.
    Either way an unresolved licence counts as no photo."""
    n = f["signals"].get("commons_images")
    if isinstance(n, int):
        return float(n)
    return 1.0 if f.get("image") and licence_ok(f["image"].get("licence")) else 0.0


def score_kind(rows, wv_index):
    """Fill score, score_parts and provenance for one kind, in place."""
    sitelinks = [f["signals"].get("sitelinks") or 0 for f in rows]
    pageviews = [f["signals"].get("pageviews") or 0 for f in rows]
    photos = [photo_value(f) for f in rows]
    forms = [form_value(f) for f in rows]

    u_sl = unit_zlog(sitelinks)
    u_pv = unit_zlog(pageviews)
    u_photo = unit_zlog(photos)
    u_form = unit_zlog([v for v, _b in forms])

    weights = WEIGHTS[rows[0]["kind"]]
    for i, f in enumerate(rows):
        wv = wikivoyage_weight(f, wv_index)
        rate = (f["signals"].get("poi_rate") or 0) / 3.0
        parts = {
            "fame": 0.5 * u_sl[i] + 0.5 * u_pv[i],
            "photo": u_photo[i],
            "designation": designation_score(f["designations"]),
            "curation": CURATION_WV * wv + (1 - CURATION_WV) * rate,
            "form": u_form[i],
        }
        if f["kind"] == "beach":
            parts["water"] = WATER_SCORE.get((f.get("water") or {}).get("class"),
                                             0.0)
        raw = sum(w * parts[k] for k, w in weights.items())
        f["score_parts"] = {k: round(v, 4) for k, v in parts.items()
                            if k in weights}
        f["score_raw"] = round(raw, 6)
        f["provenance"]["form_basis"] = forms[i][1]
        f["provenance"]["witnesses"] = witnesses(f)
        if wv:
            f["provenance"]["wikivoyage"] = round(wv, 2)


def blend_percentiles(rows):
    """Europe-wide percentile blended with the per-country one, 0.6 local, and
    Europe-only for a country with fewer than SMALL_N rows of the kind: a
    percentile over two rows says nothing except that one of them is second."""
    euro = percentile_ranks([f["score_raw"] for f in rows])
    for f, e in zip(rows, euro):
        f["_euro"] = e
    by_country = defaultdict(list)
    for f in rows:
        by_country[f["iso2"]].append(f)
    small = 0
    for iso2, group in by_country.items():
        if len(group) < SMALL_N:
            small += len(group)
            for f in group:
                f["score"] = round(f["_euro"], 4)
                f["provenance"]["normalised"] = "europe_only"
            continue
        local = percentile_ranks([f["score_raw"] for f in group])
        for f, L in zip(group, local):
            f["score"] = round(LOCAL_BLEND * L + (1 - LOCAL_BLEND) * f["_euro"], 4)
            f["provenance"]["normalised"] = "country_blend"
    for f in rows:
        del f["_euro"]
    return small


# A mountain under this height only holds a country's top seat when it stands
# proud of its surroundings or is that country's own high point. Flat countries
# are handled by the second clause: Denmark's Mollehoj is 171 m and is exactly
# what a Danish traveller means by the country's summit.
TIER1_MIN_ELEVATION_M = 300
TIER1_MIN_PROMINENCE_M = 200


def low_relief(f):
    """(True, reason) when a mountain is too small for tier 1 on fame alone."""
    if f["kind"] != "mountain":
        return False, None
    ele = f.get("elevation_m")
    prom = f.get("prominence_m") or 0
    if ele is None:
        return False, None                  # unmeasured is not disqualified
    if ele >= TIER1_MIN_ELEVATION_M or prom >= TIER1_MIN_PROMINENCE_M:
        return False, None
    if f.get("provenance", {}).get("national_high_point"):
        return False, None
    return True, f"low_relief_{int(ele)}m"


def tie_break(f):
    """What decides order when scores are equal, and they are equal often: 57%
    of mountains carry no signal at all and share one raw score. The first
    version fell through to the id, which is the name, so Ireland's tier 1 read
    B, D, R, T and Achill's main beach sat 22nd on its initial letter. Real
    measures first, alphabet never."""
    sig = f.get("signals") or {}
    return (
        -(f.get("prominence_m") or 0),
        -(f.get("elevation_m") or 0),
        -(sig.get("sitelinks") or 0),
        -(sig.get("pageviews") or 0),
        -(sig.get("poi_rate") or 0),
        1 if not f.get("image") else 0,       # a photographed row goes first
        f["id"],                              # last resort, for stable output
    )


def tier_country(group, stats):
    """Rank and tier one country's rows of one kind, best first."""
    group.sort(key=lambda f: (-f["score"],) + tie_break(f))
    n = len(group)
    # Deliberately a floor, not a round: a country with four beaches gets no
    # top pick rather than one that is 25% of everything it has.
    n1 = min(TIER1_CAP, int(TIER1_SHARE * n))
    n2 = round(TIER2_SHARE * n)
    given1 = 0
    for i, f in enumerate(group):
        f["rank_in_country"] = i + 1
        capped = (f.get("water") or {}).get("class") == WATER_TIER_CAP
        if capped:
            f["tier"] = 3
            f["provenance"]["tier_cap"] = "water_poor"
            stats["capped_poor_water"] += 1
            continue
        if given1 < n1:
            low, why = low_relief(f)
            if low:
                # Glastonbury Tor, 158 m, came out as the top mountain of the
                # United Kingdom above Ben Nevis, because fame and photographs
                # are all the formula could see. A hill can be worth the trip,
                # but it does not get the country's top seat on fame alone.
                f["tier"] = max(2, f.get("tier") or 2)
                f["provenance"]["tier_cap"] = why
                stats["capped_low_relief"] += 1
                f["tier"] = 2 if i < n1 + n2 else 3
                continue
            if f["provenance"]["witnesses"]:
                f["tier"] = 1
                given1 += 1
                continue
            stats["tier1_refused_no_witness"] += 1
        f["tier"] = 2 if i < n1 + n2 else 3
    stats["tier1_seats_unused"] += n1 - given1


# --------------------------------------------------------------------------- #
# gates
# --------------------------------------------------------------------------- #
NEAR_DEST_KM = 60.0               # build_features.NEAR_DEST_KM, the wire's rule


def gate(features, stats):
    """Everything this stage refuses to pass on, with its reason."""
    kept, dropped = [], []
    for f in features:
        near = f.get("near") or {}
        km = near.get("km")
        # `km or 999` would gate every feature that sits ON its destination:
        # 0.0 is falsy, and 67 real features (Aphrodite's Rock among them) were
        # dropped by exactly that before this line was written properly.
        if not near.get("dest_id") or km is None or km > NEAR_DEST_KM:
            dropped.append((f, "no_near_dest"))
            continue
        # The same test validate_features runs, word for word. A bathing
        # site matched 400 m away with no class on it is a name, not
        # evidence: this stage used to accept the dict for its own sake and
        # pass three classless beaches to a validator that rejects them.
        if f["kind"] == "beach" and not (
                (f.get("water") or {}).get("class") in WATER_SCORE
                or f.get("image") or f.get("wikipedia")
                or f.get("wikidata")):
            dropped.append((f, "beach_no_evidence"))
            continue
        kept.append(f)
    for f, reason in dropped:
        stats[f"gated_{reason}"] += 1
    return kept, dropped


# --------------------------------------------------------------------------- #
# report
# --------------------------------------------------------------------------- #
def distribution(values, buckets=10):
    out = Counter()
    for v in values:
        out[min(buckets - 1, int(v * buckets))] += 1
    return {f"{b / buckets:.1f}-{(b + 1) / buckets:.1f}": out[b]
            for b in range(buckets)}


def summarise(features, dropped, stats, countries, args):
    by_kind = defaultdict(list)
    for f in features:
        by_kind[f["kind"]].append(f)

    log("")
    log(f"ranked {len(features)} features "
        f"({len(by_kind['beach'])} beaches, {len(by_kind['mountain'])} mountains), "
        f"{len(dropped)} gated out")
    for reason, n in sorted(Counter(r for _f, r in dropped).items()):
        log(f"  gated {reason}: {n}")
    log("")
    log("articles: "
        f"{stats['misattributed_admin_or_settlement']} about the town or the "
        f"island, {stats['misattributed_station']} about a station, "
        f"{stats['misattributed_name_mismatch']} naming something else")
    log("images: "
        f"{stats['image_shippable']} shippable, "
        f"{stats['image_licence_unresolved']} unresolved licence, "
        f"{stats['image_misattributed_article']} came with a wrong article, "
        f"{stats['image_licence_blocked']} NC/ND, "
        f"{stats['image_not_commons']} not on Commons, "
        f"{stats['image_file_gone']} gone from Commons")
    log(f"joins: unesco {stats['unesco']}, geopark {stats['geopark']}, "
        f"ramsar {stats['ramsar']}")
    log("")
    for kind, rows in sorted(by_kind.items()):
        scores = [f["score"] for f in rows]
        scores.sort()
        med = scores[len(scores) // 2]
        log(f"{kind}: score min {scores[0]:.3f} median {med:.3f} "
            f"max {scores[-1]:.3f}")
        log(f"  distribution {distribution(scores)}")
        parts = defaultdict(list)
        for f in rows:
            for k, v in f["score_parts"].items():
                parts[k].append(v)
        log("  mean part: " + "  ".join(
            f"{k} {sum(v) / len(v):.3f}" for k, v in sorted(parts.items())))
        tiers = Counter(f["tier"] for f in rows)
        log(f"  tiers {dict(sorted(tiers.items()))}")
        wit = Counter(w for f in rows for w in f["provenance"]["witnesses"])
        log(f"  witnesses {dict(sorted(wit.items()))}  "
            f"none: {sum(1 for f in rows if not f['provenance']['witnesses'])}")

    log("")
    log("tier 1 per country (beach / mountain), then tier 2:")
    per = defaultdict(Counter)
    for f in features:
        per[f["iso2"]][f"{f['kind']}{f['tier']}"] += 1
        per[f["iso2"]][f["kind"]] += 1
    for iso2 in sorted(per):
        c = per[iso2]
        log(f"  {iso2} {countries.get(iso2, ''):<22} "
            f"t1 {c['beach1']:>3} / {c['mountain1']:>3}   "
            f"t2 {c['beach2']:>4} / {c['mountain2']:>4}   "
            f"of {c['beach']:>5} / {c['mountain']:>5}")

    if args.country:
        log("")
        log(f"top {args.top} in {args.country}:")
        for kind in ("beach", "mountain"):
            rows = [f for f in by_kind[kind] if f["iso2"] == args.country]
            rows.sort(key=lambda f: f["rank_in_country"])
            for f in rows[:args.top]:
                log(f"  [{kind[0]}{f['tier']}] {f['rank_in_country']:>3}. "
                    f"{f['name'][:42]:<42} {f['score']:.3f} "
                    f"{f['score_parts']} {f['provenance']['witnesses']}")

    return {
        "by_kind": {k: len(v) for k, v in by_kind.items()},
        "tiers": {k: dict(Counter(f["tier"] for f in v))
                  for k, v in by_kind.items()},
        "per_country": {iso2: dict(c) for iso2, c in per.items()},
        "gated": dict(Counter(r for _f, r in dropped)),
        "images": {k: v for k, v in stats.items() if k.startswith("image_")},
        "joins": {k: stats[k] for k in ("unesco", "geopark", "ramsar")},
        "rules": {k: stats[k] for k in ("capped_poor_water",
                                        "tier1_refused_no_witness",
                                        "tier1_seats_unused")},
    }


# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--country", help="ISO2 to print in detail, e.g. ES. The "
                                      "scoring always runs on everything: "
                                      "percentiles need the whole set")
    ap.add_argument("--top", type=int, default=10,
                    help="rows to print for --country")
    ap.add_argument("--dry", action="store_true", help="report only, no write")
    args = ap.parse_args()

    raw = load_json(RAW_FEATURES)
    if not raw:
        log(f"no {RAW_FEATURES}: run build_features.py first")
        return 1
    features = raw["features"]
    countries = catalogue_countries()
    licences = load_json(POI_LICENSES) or {}
    stats = Counter()
    log(f"read {len(features)} features from {RAW_FEATURES} "
        f"(built {raw.get('generated_at')})")

    flags = wikidata_flags()
    for f in features:
        # Order matters: an article about the wrong subject takes its photo
        # with it, so there is nothing left for the licence gate to clear.
        gate_article(f, flags, stats)
        gate_image(f, licences, stats)
    join_unesco(features, stats)
    join_named_designations(features, stats)

    features, dropped = gate(features, stats)

    wv_index = wikivoyage_index()
    by_kind = defaultdict(list)
    for f in features:
        by_kind[f["kind"]].append(f)
    for kind, rows in by_kind.items():
        score_kind(rows, wv_index)
        small = blend_percentiles(rows)
        log(f"{kind}: scored {len(rows)}, {small} in countries below "
            f"{SMALL_N} rows (Europe-wide percentile only)")
        by_country = defaultdict(list)
        for f in rows:
            by_country[f["iso2"]].append(f)
        if kind == "mountain":
            # The country's own high point earns its top seat whatever it
            # measures: Denmark's Mollehoj is 171 m and is still what a Dane
            # means by the summit of Denmark. Marked before tiering so the
            # low-relief cap can let it through.
            for group in by_country.values():
                measured = [f for f in group if f.get("elevation_m")]
                if measured:
                    top = max(measured, key=lambda f: f["elevation_m"])
                    top.setdefault("provenance", {})["national_high_point"] = True
        for group in by_country.values():
            tier_country(group, stats)

    features.sort(key=lambda f: (f["iso2"], f["kind"], f["rank_in_country"]))
    counts = summarise(features, dropped, stats, countries, args)

    if args.dry:
        log("\ndry run: nothing written")
        return 0
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    save_json(FEATURES, {
        "generated_at": stamp,
        "source": {"features_raw": raw.get("generated_at")},
        "weights": WEIGHTS,
        "counts": counts,
        # Every gated row, by id: the drop is a decision this stage made, not a
        # row that never existed, and enrich_images.py resolving one licence
        # can put a beach straight back in.
        "gated": [{"id": f["id"], "kind": f["kind"], "iso2": f["iso2"],
                   "name": f["name"], "reason": reason}
                  for f, reason in dropped],
        "features": features,
    })
    log(f"\nwrote {FEATURES}  ({len(features)} ranked, {len(dropped)} gated)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
