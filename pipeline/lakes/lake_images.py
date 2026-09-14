"""Is this photograph OF this lake, and is it the one to lead with?

Two different questions, and the first build answered neither strictly enough.
Nine per cent of published lead photographs did not carry their own lake's
name, and among them were a memorial plaque in Hungary, a monument to the
liberators of Rezekne, a sports hall in Flanders and a photograph of Greece
taken from the International Space Station. Every one of them arrived the same
way: a blind Commons geosearch returns whatever was uploaded with a coordinate
near the water, and "near the water" is not "of the water".

So this module holds three gates, in the order they cost.

  1. SUBJECT, from metadata.  Free, and it does the heavy lifting. A file is
     accepted only when something ASSERTS it is this lake: Wikidata's P18, the
     lake's own Commons category, a distinctive token of its name in the title,
     or a category naming it. A geosearch hit with none of those is refused
     outright, whatever it is a picture of. On top of that a vocabulary of
     things a lake photograph is not (maps, plaques, monuments, coats of arms,
     interiors, aircraft, satellite imagery, species close-ups) rejects the
     files that do carry the name but show something else: "Lake Constance
     Museum", "Bodensee coat of arms".

  2. COMPOSITION, from pixels.  One 500 px thumbnail per surviving candidate.
     A view over water has a large smooth, horizontally coherent band in the
     lower half of the frame, usually under a sky. A plaque, a bar, a fish or a
     church does not. This is the only gate that can tell a photograph OF the
     lake from a photograph taken AT the lake, and it is the reason the module
     exists rather than another regex.

  3. BEAUTY, from Commons itself.  Commons runs its own peer review, and its
     verdicts are categories: Quality images, Featured pictures, Valued
     images. Those are humans saying "this is a good photograph", for free, and
     nothing this file could compute comes close. Underneath them sit the
     categories that describe a view rather than a detail ("Views of Lake
     Bled", "Panoramics of ...", "Reflections in lakes", "Sunsets over ...")
     and the ones that describe the wrong season.

The output is one number per file plus the evidence that produced it, both
stored in the cache so the export stage can order without re-deriving anything
and a human can see why a picture was chosen.

ASCII clean, no em dashes, per project convention.
"""

import io
import re
import unicodedata
import urllib.parse

# ---------------------------------------------------------------------------
# 1. Subject
# ---------------------------------------------------------------------------

# A photograph of a lake is not any of these, whatever its coordinate says.
# Matched against the file title AND its Commons categories, because the title
# often says nothing ("01 Soline.jpg") and the categories always do.
NOT_THE_SUBJECT = re.compile(
    r"\b("
    r"map|maps|karte|carte|mapa|mappa|plan|plans|blueprint|diagram|chart|"
    r"coat[s]? of arms|blazon|wappen|flag|flags|logo|seal of|"
    r"stamp|stamps|briefmarke|banknote|coin|medal|"
    r"memorial|memorials|plaque|plaques|monument|monuments|statue|statues|"
    r"emlektabla|denkmal|gedenktafel|"
    r"grave|graves|tomb|tombs|cemetery|headstone|"
    r"portrait|portraits|selfie|people of|persons|"
    r"interior|interiors|indoor|inside of|museum|exhibition|"
    r"aircraft|airplane|aeroplane|helicopter|air show|airport|"
    # Satellite imagery, in all the ways Commons words it. Lake Ohrid's own
    # Wikidata P18 is "Lake Ohrid, Macedonia-Albania viewed from a NASA
    # satellite", which is a true and useful picture and is not what anybody
    # means by a beautiful view of the lake.
    r"satellite|nasa|esa|landsat|sentinel-\d|copernicus sentinel|"
    r"from orbit|iss expedition|from space|astronaut photograph|"
    # Commons names its space station photographs by frame number, so the
    # words "space" and "satellite" never appear: Raski zaljev in Croatia was
    # illustrated with "ISS019-E-20680 - View of Earth.jpg".
    r"iss\d{3}|expedition \d{2}|view of earth|earth observation|"
    r"true[- ]colour image|false[- ]colour|"
    r"coats? of arms|heraldry|"
    r"screenshot|poster|advertis|"
    r"locator|topographic|bathymetr|geological (?:map|section)|"
    r"signage|road sign|traffic sign|information board|"
    r"railway station|bus station|car park interior|"
    r"restaurant interior|hotel room|bar interior"
    r")\b", re.I)

# Species pages get filed under whatever they were photographed at, so a
# search near a lake returns a spider. Two capitalised Latin looking words at
# the head of a file name is the tell, and the categories confirm it.
SPECIES_RE = re.compile(r"^[A-Z][a-z]{3,}\s+[a-z]{4,}\b")
SPECIES_CAT = re.compile(
    r"\b(fauna|flora|birds?|fishes?|insects?|beetles?|butterfl|"
    r"orchid|mushroom|fungi|amphibian|reptile|mammal|arachnid|"
    r"molluscs?|plants? of)\b", re.I)

BAD_EXT = re.compile(r"\.(svg|pdf|tif|tiff|ogv|webm|ogg|mid|djvu|gif)$", re.I)

# Words that mean "water" in the languages this layer harvests. Used only as
# corroboration, never as evidence on its own.
WATER_WORD = re.compile(
    r"\b(lake|lakes|loch|lough|llyn|see|seen|meer|plas|jezero|jezioro|ezero|"
    r"jarv|jarvi|vatn|vatnet|vann|sjo|sjon|lago|laghi|lac|lacs|lacul|lagoa|"
    r"laguna|lagoon|embalse|barragem|barrage|estany|etang|liqeni|pleso|"
    r"prehrada|stausee|reservoir|yazovir|tarn|shore|shoreline|waterfront|"
    r"water|waters|bay|beach|strand|riva|ufer|rives?)\b", re.I)


def fold(text):
    """Accent folded, lowercase, punctuation free. Mirrors harvest_lakes.fold,
    including the letters NFKD leaves alone."""
    undecomposed = {
        "ø": "o", "Æ": "ae", "æ": "ae", "œ": "oe",
        "ł": "l", "ß": "ss", "đ": "d", "ð": "d",
        "þ": "th", "ı": "i",
    }
    lowered = (text or "").lower()
    normalised = unicodedata.normalize("NFKD", lowered)
    stripped = "".join(c for c in normalised if not unicodedata.combining(c))
    swapped = "".join(undecomposed.get(c, c) for c in stripped)
    return re.sub(r"[^a-z0-9 ]+", " ", swapped).strip()


def bare_title(title):
    """"File:Lake Bled 01.jpg" -> "Lake Bled 01.jpg"."""
    text = str(title or "")
    return text[5:] if text.startswith("File:") else text


def candidate_text(cand):
    """Everything written about a file: its name, its categories, its caption.

    One string, folded, because every rule below wants to ask the same
    question of all three and the title alone is very often silent."""
    parts = [bare_title(cand.get("title"))]
    parts.extend(cand.get("cats") or [])
    info = cand.get("info") or {}
    meta = info.get("extmetadata") or {}
    for key in ("ImageDescription", "ObjectName"):
        value = (meta.get(key) or {}).get("value") or ""
        parts.append(re.sub(r"<[^>]+>", " ", value)[:300])
    return " ".join(parts)


def subject_verdict(cand, tokens):
    """(accepted, evidence). `tokens` is the lake's distinctive name tokens.

    Evidence is one of p18 | category | name | none, and it is stored with the
    picture so a reviewer can see WHY a file was believed."""
    title = bare_title(cand.get("title"))
    if BAD_EXT.search(title):
        return False, "not a photograph"
    text = candidate_text(cand)
    if NOT_THE_SUBJECT.search(text):
        return False, "not the subject"

    folded_title = fold(title)
    names_it = bool(tokens and any(t in folded_title for t in tokens))
    # The species test only runs on files that do NOT name the lake. Two
    # capitalised Latin looking words are a good tell for a plant or a beetle
    # and a terrible one for a lake: "Lago maggiore" matches it exactly, and
    # so does half of Italy and Spain.
    if not names_it and (SPECIES_RE.match(title)
                         or SPECIES_CAT.search(" ".join(cand.get("cats") or []))):
        return False, "a species, not a place"

    if cand.get("pinned"):
        return True, "p18"
    if names_it:
        # "Toftavatn.jpg" is not the same claim as "bar on the lake in
        # Gyomro.jpg", even though both carry the name. A file whose title is
        # the lake's name and nothing else but a number is as good an
        # assertion as P18, and it has to be, because the pixel probe below
        # rejects the grey moorland water of the Faroes and that file is the
        # only photograph Toftavatn has.
        rest = [w for w in folded_title.split()
                if w not in tokens and not w.isdigit()
                and w not in ("jpg", "jpeg", "png", "the", "lake", "of", "a")]
        return True, "title" if len(rest) <= 1 else "name"
    if cand.get("from_cat"):
        return True, "category"
    folded_cats = fold(" ".join(cand.get("cats") or []))
    if tokens and any(t in folded_cats for t in tokens):
        return True, "category"
    # A geosearch hit that nothing names. This is the case that produced the
    # plaque, the monument, the sports hall and the photograph from orbit, and
    # no radius is tight enough to fix it, so it is simply refused.
    return False, "nothing says it is this lake"


# ---------------------------------------------------------------------------
# 3. Beauty, mostly borrowed from Commons' own reviewers
# ---------------------------------------------------------------------------

# Commons runs peer review and records the verdict as a category. These are
# the three that mean "a human looked at this and thought it was good".
QUALITY_CATS = (
    "featured pictures on wikimedia commons",
    "quality images",
    "valued images",
    "featured pictures",
    "pictures of the year",
    "wiki loves earth",
    "wiki loves monuments",
)

# Categories and words that describe a VIEW rather than a detail. "Views of
# Lake Bled" and "Panoramics of Lake Bled" are exactly the pictures a card
# wants, and Commons files them for us.
VIEW_WORD = re.compile(
    r"\b(view|views|vista|panorama|panoramic|panoramics|panorama[su]?|"
    r"aerial view|aerial views|reflection|reflections|sunset|sunsets|"
    r"sunrise|sunrises|dusk|golden hour|landscape|landscapes|scenery|"
    r"seen from|from above|skyline)\b", re.I)

# The wrong season for a layer about swimming, and the wrong light.
COLD_WORD = re.compile(
    r"\b(winter|snow|snowy|schnee|neige|nieve|neve|ice|iced|icy|frozen|"
    r"gefroren|zugefroren|invierno|inverno|hiver|frost|blizzard|"
    r"ice skating|ice fishing)\b", re.I)
NIGHT_WORD = re.compile(r"\b(night|nacht|nuit|noche|notte|by night|"
                        r"illuminat|fireworks)\b", re.I)
# Commons upload names very often carry the date, and a lake photographed in
# December is a true picture of the lake and a poor advertisement for it.
COLD_DATE = re.compile(r"\b(19|20)\d{2}[ _-]?(1[012]|0[12])\b")

# A picture taken AT the lake of something else standing next to it. These
# pass the subject gate through their name and are still the wrong card.
BACKDROP_WORD = re.compile(
    r"\b(in the background|background|from the summit|from mount|"
    r"view towards|hotel|restaurant|bar|cafe|car park|parking|"
    r"campsite|camping|playground|sports|stadium|church|chapel|"
    r"museum|monument|bridge|dam wall|spillway|pumping station|"
    r"harbour|harbor|marina|pier|jetty|boathouse)\b", re.I)


# How much each tier of evidence is worth in the ranking, not just at the
# gate. Without this the tiers only decided admission, and a photograph of the
# village of Toftir outranked Wikidata's own picture of Toftavatn, which is
# the lake. The strength of the claim that a file shows this lake is the first
# thing that should order the list.
EVIDENCE_WEIGHT = {
    "p18": 2.2,        # Wikidata: a person stated this image depicts this item
    "title": 1.5,      # the file is named after the lake and nothing else
    "viewcat": 1.6,    # it sits in "Views of <lake>" or "Panoramics of <lake>"
    "category": 0.6,   # it sits in the lake's category tree
    "name": 0.4,       # the lake is mentioned somewhere in the name
}

# A Flickr import called "Badass (54151857551).jpg" carries no claim about
# anything. It can still be a fine picture, so this is a nudge and not a gate.
BARE_ID = re.compile(r"^[^a-z]*[a-z]{0,12}[^a-z]*\(?\d{6,}\)?[^a-z]*$", re.I)


def beauty_score(cand, tokens, evidence=""):
    """How good a card this file makes, before anybody looks at the pixels."""
    title = bare_title(cand.get("title"))
    folded_title = fold(title)
    cats = " ".join(cand.get("cats") or [])
    text = candidate_text(cand)
    info = cand.get("info") or {}
    width = info.get("width") or 0
    height = info.get("height") or 0
    score = EVIDENCE_WEIGHT.get(evidence, 0.0)

    lowered_cats = [c.lower() for c in (cand.get("cats") or [])]
    if any(any(q in c for q in QUALITY_CATS) for c in lowered_cats):
        score += 2.5                    # Commons' own reviewers said so

    # Named after the lake, and named after it FIRST. Commons file names in
    # several countries lead with a postal code ("7141 Podersdorf am See,
    # Neusiedler See 04"), so this is a preference and never a requirement.
    head = " ".join(folded_title.split()[:3])
    if tokens and any(t in head for t in tokens):
        score += 1.0
    elif tokens and any(t in folded_title for t in tokens):
        score += 0.4
    elif evidence in ("category", "viewcat"):
        # It is in the right category and its own name says nothing about the
        # lake. That is how "Begunjscica, trail from Roblek pasture 04.jpg"
        # came to lead Lake Bled: it is filed under a view category naming the
        # lake, and it is a photograph of a mountain path. A file that shows
        # the lake usually says so somewhere in its name.
        score -= 1.2

    if VIEW_WORD.search(cats):
        score += 1.4                    # "Views of ...", "Panoramics of ..."
    elif VIEW_WORD.search(text):
        score += 0.8
    if WATER_WORD.search(text):
        score += 0.4
    if BARE_ID.match(title.rsplit(".", 1)[0].strip()):
        score -= 0.8

    if COLD_WORD.search(text) or COLD_DATE.search(title):
        score -= 1.5
    if NIGHT_WORD.search(text):
        score -= 1.2
    if BACKDROP_WORD.search(text):
        score -= 1.6

    if width and height:
        # Shape, measured against the card rather than against "landscape".
        # The frame is 25/12, so the question is how much of the photograph
        # survives that crop, and aspect_term answers it for every layer.
        score += aspect_term(width, height)[1]
        if width >= 2000:
            score += 0.4
        if width < 1000:
            score -= 0.3
    if "panoramio" in folded_title:
        score -= 0.4                    # bulk import, often mediocre
    return round(score, 3)


# ---------------------------------------------------------------------------
# Shape: how a frame survives the card's crop
# ---------------------------------------------------------------------------

# The beach, lake and mountain cards all crop to 25/12, about 2.08:1, with the
# crop anchored just below centre. A photograph near that shape ships almost
# whole; a portrait loses most of itself; a 4:1 strip becomes a smear. One
# helper for every layer, loaded by path from the others, so the thresholds
# move together or not at all.
FRAME_AR = 25.0 / 12.0
FIT_GOOD = 0.62        # min(ar, frame) / max(ar, frame) at or above this
AR_HARD_MIN = 0.62     # taller than this crops to a sliver of the subject
AR_HARD_MAX = 4.0      # and so does a strip wider than this
STRIP_FROM = 3.2       # above this the crop keeps a ribbon of the picture
FIT_BONUS = 0.6
PORTRAIT_PENALTY = 1.5
STRIP_PENALTY = 1.5


def aspect_fit(width, height, frame_ar=FRAME_AR):
    """How well this frame fills the card, 1.0 for a perfect match, or None
    when the dimensions are unknown."""
    if not width or not height:
        return None
    ratio = width / height
    return min(ratio, frame_ar) / max(ratio, frame_ar)


def aspect_term(width, height, frame_ar=FRAME_AR):
    """(reject, delta) for a candidate's shape against the card.

    A modest bonus when the frame roughly fills the card, a strong penalty for
    portraits and extreme strips, and a hard reject only at the shapes that
    crop to garbage whatever else is right about the file. Unknown dimensions
    pass untouched: the metadata gates decide relevance, this only orders what
    they admitted."""
    if not width or not height:
        return False, 0.0
    ratio = width / height
    if ratio < AR_HARD_MIN or ratio > AR_HARD_MAX:
        return True, 0.0
    delta = 0.0
    if min(ratio, frame_ar) / max(ratio, frame_ar) >= FIT_GOOD:
        delta += FIT_BONUS
    if ratio < 1.0:
        delta -= PORTRAIT_PENALTY
    elif ratio > STRIP_FROM:
        delta -= STRIP_PENALTY
    return False, round(delta, 3)


# The commonest shape a photograph is taken in, and the reason the bar below
# is not a constant: a 3:2 picture fills 0.72 of the 25/12 card and only 0.55
# of the 30/11 itinerary strip, so a fixed 0.62 would mean "no ordinary
# photograph qualifies" on the wider frame and nothing would ever be promoted.
# The bar is what a 3:2 photograph achieves in the frame being asked about,
# capped at FIT_GOOD so the narrow frames keep the threshold they were tuned
# with.
REFERENCE_AR = 1.5


def fit_bar(frame_ar):
    baseline = min(REFERENCE_AR, frame_ar) / max(REFERENCE_AR, frame_ar)
    return min(FIT_GOOD, baseline)


def lead_by_fit(rows, wh, tier=None, frame_ar=FRAME_AR, fit_min=None):
    """Reorder a published picture list so a card shaped photograph leads.

    The card crops images[0] into the frame and shows nothing else, so a lead
    that survives the crop badly IS what a reader sees of the place: a 4:1
    panorama of a lake becomes a blue band, a near square becomes its middle
    third. Every layer already sorts its pictures by how well the file is
    evidenced and then by quality, and this does not argue with either. It
    only reaches inside the leading evidence tier, and only when the lead
    fails the crop and another picture of the same standing passes it, so
    nothing is ever traded down to buy a shape.

    `wh` returns (width, height) for a row, `tier` the evidence class that may
    not be weakened. Rows whose size is unknown are left where they are: an
    unmeasurable file is not evidence of a bad crop."""
    if len(rows) < 2:
        return rows
    if fit_min is None:
        fit_min = fit_bar(frame_ar)
    lead = rows[0]
    lead_fit = aspect_fit(*wh(lead), frame_ar)
    if lead_fit is None or lead_fit >= fit_min:
        return rows
    lead_tier = tier(lead) if tier else None
    best, best_fit = None, lead_fit
    for row in rows[1:]:
        if tier and tier(row) != lead_tier:
            continue                    # a weaker claim is not an upgrade
        fit = aspect_fit(*wh(row), frame_ar)
        if fit is not None and fit >= fit_min and fit > best_fit:
            best, best_fit = row, fit
    if best is None:
        return rows
    return [best] + [r for r in rows if r is not best]


def reseat_lead(images, taken, key=lambda i: i.get("u"), tier=None):
    """A lead photograph nobody else on the page is already leading with.

    The three shoreline exporters all drop a row whose lead picture is another
    row's, and the reason is sound: a minor top or a small tarn with no file
    of its own borrows a photograph taken nearby, and a ridge of five under
    one picture is five rows saying the same thing. Dropping the whole row is
    too blunt for the other case, where a place has its own photographs and
    merely AGREES with a neighbour about which is the best of them. Piz Buin,
    Prenj, Rheinwaldhorn and Kutelo all vanished that way while lower scoring
    summits published.

    So: the row keeps its place on its own second picture, at the same
    evidence standing as the first, and only a row whose every photograph
    already belongs to somebody else is dropped. Returns the reordered list,
    the list unchanged, or None to mean "nothing of its own is left"."""
    if not images:
        return images
    if key(images[0]) not in taken:
        return images
    want = tier(images[0]) if tier else None
    for idx, img in enumerate(images):
        if key(img) in taken:
            continue
        if tier and tier(img) != want:
            continue                    # a weaker claim is not a lead
        return [img] + [x for k, x in enumerate(images) if k != idx]
    return None


# ---------------------------------------------------------------------------
# 2. Composition, from the pixels
# ---------------------------------------------------------------------------

# The thumbnail is analysed at this width. Small on purpose: the question is
# "is there a big smooth band under a horizon", and that survives downscaling
# while the download stays about 25 KB.
PROBE_W = 96
# The probe measures COLOUR, in the lower part of the frame. It measured
# texture first, on the theory that a water surface is smoother than a shore,
# and the measurement was taken over a dozen real files before being believed:
# Toftavatn, a genuine Faroese lake, came back smoother than a Flemish sports
# hall, and the Attersee came back rougher than a photograph of a memorial
# plaque. Texture does not separate these classes at this resolution and no
# threshold over it was going to. Colour does, and position does, so the probe
# asks the one question those two can answer between them: how much of the
# BOTTOM of this frame looks like water.
BOTTOM_FROM = 0.40        # the lower 60 per cent, where a lake sits in a view
MIN_WATER_FRAC = 0.12     # below this there is no body of water in the shot


def probe_pixels(data):
    """Look at one image and describe its lower half, or None if unreadable.

    water   the share of the bottom 60 per cent that reads as a water surface:
            blue, cyan, teal or the flat steel of an overcast lake
    veg     the share that reads as vegetation, which is what a photograph of
            a shore, a park or a monument in a garden is mostly made of
    pale    the bottom is bright and colourless, which is snow or a blown out
            highlight rather than water
    plain   almost every pixel in the frame is the same colour, which is a
            scan, a blank plate or a solid background"""
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        return None
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        height = max(1, round(img.height * PROBE_W / max(1, img.width)))
        img = img.resize((PROBE_W, max(8, min(height, 300))))
        arr = np.asarray(img, dtype="float32")
    except Exception:
        return None
    if arr.ndim != 3 or arr.shape[0] < 8:
        return None

    bottom = arr[int(arr.shape[0] * BOTTOM_FROM):]
    red, grn, blu = bottom[..., 0], bottom[..., 1], bottom[..., 2]
    peak = np.maximum(np.maximum(red, grn), blu)
    floor = np.minimum(np.minimum(red, grn), blu)
    lum = (red + grn + blu) / 3.0
    sat = np.where(peak > 0, (peak - floor) / np.maximum(peak, 1.0), 0.0)

    # Water, in the two ways a European lake actually photographs. There was a
    # third clause here for the flat steel of an overcast lake, keyed on low
    # saturation, and it had to go: grey is grey, so it passed a memorial
    # plaque at 0.94, a sports hall wall at 0.96 and a monument in a park,
    # which is the whole set of files this gate exists to stop. Losing it
    # costs some genuinely grey lake photographs, which were never going to be
    # the picture on the card anyway.
    cool = (blu >= grn - 4) & (blu > red + 6)          # blue and cyan water
    teal = (grn > red + 8) & (blu > red + 4)           # turquoise and glacial
    veg = (grn > red + 8) & (grn > blu + 10) & (sat > 0.16)
    water = (cool | teal) & (lum > 25) & ~veg

    dark = lum <= 25
    # Snow, and a blown out sky read as a lake. Water can be this bright or
    # this colourless, but very rarely both at once.
    bright_flat = (lum > 195) & (sat < 0.18)
    # One colour across the whole frame, which is a plate rather than a place.
    spread = float(np.asarray(arr, dtype="float32").reshape(-1, 3).std(axis=0).mean())

    # The frame the colour test cannot read: grey, mid-lit, neither blue nor
    # green. An overcast Baltic shore and a black and white photograph both
    # land here, and so does a concrete wall, which is why this is only ever
    # reported, never counted as water. water_verdict decides what to do with
    # it, and the shoreline layers answer that differently.
    gray_px = (sat < 0.12) & (lum > 25) & (lum <= 195)

    return {
        "water": round(float(water.mean()), 3),
        "veg": round(float(veg.mean()), 3),
        "dark": round(float(dark.mean()), 3),
        "gray": round(float(gray_px.mean()), 3),
        "pale": bool(bright_flat.mean() > 0.55),
        "plain": bool(spread < 11.0),
        "rgb": [int(round(float(c.mean()))) for c in (red, grn, blu)],
    }


# Which evidence tiers the pixel probe is allowed to overrule.
#
# Only Wikidata's P18 is exempt, because only P18 is a person stating that
# this picture depicts this item. `title` was exempt too for one run, on the
# theory that a file called "Toftavatn.jpg" is as strong a claim, and a
# contact sheet of the result showed why that was wrong: "Naturerlebnis
# Schwendiseen.jpeg" is titled after the Schwendisee and is a photograph of an
# information board standing next to it. The file that motivated the exemption
# turned out to be a P18 anyway, so nothing was lost by withdrawing it.
PIXEL_CAN_VETO = ("title", "viewcat", "name", "category")

# The weak tiers have to show more water to get in. A passing mention of the
# lake in a file name is how "Totaalzicht Nekkerhal Mechelen 01.jpg", a
# photograph of an events hall and its car park, reached the card for De
# Nekker: it cleared a twelve per cent water floor on sky and wet tarmac.
WEAK_TIERS = ("name", "category")
WEAK_MIN_WATER = 0.28


def pixel_veto_applies(evidence):
    return evidence in PIXEL_CAN_VETO


# A bottom this grey, with no vegetation in it, is a frame the colour test
# cannot read rather than a frame with no water in it. See GREY_ABSTAIN use
# in water_verdict: only the beach layer asks for it.
GREY_ABSTAIN = 0.72
GREY_ABSTAIN_VEG = 0.05


def water_verdict(probe, min_water, abstain_on_grey=False):
    """(accepted, delta, why) against a caller-chosen water floor.

    The shoreline layers share the probe and not the floor. A lake view is
    mostly water; a beach photograph is legitimately mostly sand with a strip
    of sea along the top of the lower frame; so the beach layer calls this
    with a lower floor rather than borrowing a lake's idea of enough.

    `abstain_on_grey` is the beach layer's answer to the one blind spot this
    probe has and documents: water is recognised by colour, so an overcast
    North Sea and any black and white photograph read as no water at all. On
    a Baltic or Danish coast that is most of the good pictures, and vetoing
    them cost a hundred real beaches their cards. When the bottom of the
    frame is overwhelmingly grey AND carries no vegetation, this returns
    "accepted, no bonus": the test is saying it cannot tell, not that the
    picture is wrong, so the metadata evidence decides and a photograph with
    visible blue water still outranks it. The vetoes above still apply, and a
    street or a park still fails on its vegetation."""
    if probe is None:
        return True, 0.0, ""            # unreadable, fall back to metadata
    if probe["plain"]:
        return False, 0.0, "a blank plate or a scan"
    if probe["pale"]:
        return False, 0.0, "snow or a blown highlight, not water"
    if probe["dark"] > 0.6:
        return False, 0.0, "shot in the dark"
    if probe["water"] < min_water:
        if (abstain_on_grey
                and probe.get("gray", 0.0) >= GREY_ABSTAIN
                and probe["veg"] < GREY_ABSTAIN_VEG):
            return True, 0.0, "grey frame, the colour test abstains"
        return False, 0.0, "not enough water in the lower frame"

    delta = 0.0
    if probe["water"] >= 0.55:
        delta += 1.2                    # the water IS the picture
    elif probe["water"] >= 0.30:
        delta += 0.8
    elif probe["water"] >= 0.18:
        delta += 0.3
    if probe["veg"] > 0.45:
        delta -= 0.6                    # mostly a photograph of a shore
    return True, round(delta, 3), ""


def pixel_verdict(probe, evidence=""):
    """(accepted, delta, why). A narrow hard reject, then a soft preference.

    Narrow on purpose, and narrower than the first attempt. The metadata gate
    is what guarantees the file is of this lake. This one exists to catch the
    plaque, the sports hall and the snowfield that happen to carry the lake's
    name, and a strict rule here would throw away the honest photograph taken
    from among the trees."""
    floor = WEAK_MIN_WATER if evidence in WEAK_TIERS else MIN_WATER_FRAC
    return water_verdict(probe, floor)
