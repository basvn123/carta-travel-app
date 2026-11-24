"""Normalize POI kinds and demote commercial noise, in place.

Tier: Scheduled (run_pipeline task poi_significance)

The three POI sources speak three taxonomies: OpenTripMap says "Ancient site"
and "Opera", Overture/Wikidata say "Archaeological site" and "Opera house",
and Overture's broad `landmark`/`attraction` categories drag in outright
commercial noise (apartment blocks called "Condo Gardens Brussels", lounge
bars named after the beach, ice-cream shops filed as kind "Glacier", the
Romance-language false friend). The 2026-07-22 classification audit measured
29,531 `Landmark` items (the single biggest kind) and 27% of the catalogue
falling through every dwell/interest map.

This pass:
  1. rewrites the Overture/Wikidata kind spellings onto the OTM ones the
     frontend taxonomies are keyed by;
  2. retypes the unreliable kinds (Square above all) and flags non-places
     (battles, companies, shops, seabed polygons) with classify_poi, below;
  3. finds commercial-noise items by name (same regex as the frontend's
     isCommercialNoisePoi in dayDraft.js) inside the loose kinds and demotes
     them: rate -> 0 and a `noise: 1` marker, so no ranking ever surfaces
     them again.

Items are NEVER removed and never reordered: saved day plans reference
items_full by index, so this pass only mutates in place. Idempotent.

IMPORTANT: do not run while a harvest is writing the same files
(Get-Process python first, see the pipeline README/conventions).

Usage:
    python normalize_poi_kinds.py                      # default targets
    python normalize_poi_kinds.py path/to/app_data.json [...]
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # pipeline/: shared libraries (T1207)
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[2]
WIKIDATA = ROOT / "cache" / "poi_wikidata.json"
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",                        # master (items_full)
    ROOT / "continent-app" / "public" / "activities_full.json", # served full POI lists
]

# Overture / Wikidata spelling -> the OTM spelling the frontend keys on.
KIND_MAP = {
    "Opera house": "Opera",
    "Archaeological site": "Ancient site",
    "Fortification": "Fortress",
    "City gate": "Gate",
}

# Mirror of COMMERCIAL_RE in continent-app/src/planner/dayDraft.js. Keep the
# two in sync when extending either.
COMMERCIAL_RE = re.compile(
    r"\b(apartments?|aparthotel|hostels?|hotels?|b&b|guesthouse|guest house|residence"
    r"|suites?|rooms|store|shops?|boutique|bar|pub|lounge|restaurants?|ristorante"
    r"|pizzeria|trattoria|osteria|bistro|brasserie|tavern|taverna|cafe|caff[eè]"
    r"|coffee|helader[ií]a|gelateria|ice cream|takeaway|kebab|camping|campsite"
    r"|parking|garage|car park|offices?|agency|rentals?|hire|barber|hairdresser"
    r"|nightclub|casino|supermarket|shopping cent(?:er|re)|mall)\b",
    re.IGNORECASE,
)
LOOSE_KINDS = {"Landmark", "Attraction", "Glacier", "Theme park", ""}


# ---------------------------------------------------------------------------
# classify_poi (D15, D23): the one kind and non-place classifier.
#
# A POI row has no P31, no QID and no OSM tags. What it has: `name`, `desc`
# (the Wikidata English short description, often in the local language), the
# old `kind`, `heritage`, `wiki` and `pop`. cache/poi_wikidata.json adds the
# sitelink count and the admin/station flags when the `wiki` URL joins.
# Order of evidence: desc, then name words, then the Wikidata flags.
#
# Two decisions, both made so a real sight is never lost to a rule:
#   * kind: only rows filed under an unreliable kind are retyped (the OTM
#     "interesting places" bucket Square, the loose kinds, and the kinds a
#     wrong desc word produced). Nothing else is touched.
#   * non-place: a battle, a company, a shop, a seabed polygon. It is flagged
#     noise (never removed), and a visitable-site guard keeps anything that is
#     heritage, famous (many Wikipedia languages) or says museum, memorial,
#     battlefield, monument, fort, castle, ruins, park.
# ---------------------------------------------------------------------------

# A square word in the name (research regex, other_poi_kind.py).
SQUARE_NAME_RE = re.compile(
    r"(square|place|plaza|piazza|piazzetta|platz|plein|rynek|trg|n[aá]m[eě]st"
    r"|markt|torget|torv|tori|pra[cç]a|largo|campo|agora|plateia|pia[tț]a"
    r"|t[eé]r\b|squa|market|forum|ring\b|plac\b|sheshi)", re.IGNORECASE)

# Kinds whose rows are retyped from the evidence. Everything else keeps its kind.
RETYPE_FROM = {"Square", "Attraction", "Landmark", "", "Palace", "Theatre"}

# Kinds the classifier would like but the config may not know yet. The map
# gives the nearest kind poi_categories.kind_category has today, so
# poi_labels.category_of never raises; once logic adds the key the wanted kind
# is used as is (see _known_kinds).
KIND_FALLBACK = {
    "Monument": "Attraction", "Memorial": "Attraction", "Ruins": "Attraction",
    "Ancient site": "Attraction", "Park": "Nature reserve", "Garden": "Nature reserve",
    "Cave": "Nature reserve", "Windmill": "Tower", "Stadium": "Attraction",
    "Fountain": "Attraction", "Market": "Square", "Gate": "Tower",
}

# (kind wanted, regex on the leading noun phrase of desc). First match wins.
DESC_KIND = [
    ("Square", r"\b(town square|public square|city square|square|plaza|piazza|market place|marketplace|plac|namesti|platz|plein|rynek)\b"),
    ("Cathedral", r"\b(cathedral|duomo|kathedrale|catedral|cath[eé]drale|dom)\b"),
    ("Church", r"\b(church|chapel|basilica|parish church|kirche|kerk|iglesia|chiesa|[eé]glise|kostel|cerkev|crkva|ermita|templom)\b"),
    ("Monastery", r"\b(monastery|abbey|convent|priory|kloster|monasterio|abbaye|klooster|monastero)\b"),
    ("Synagogue", r"\bsynagogue\b"),
    ("Mosque", r"\bmosque\b"),
    ("Lighthouse", r"\b(lighthouse|faro|phare|vuurtoren)\b"),
    ("Windmill", r"\b(windmill|windmolen|watermill|watermolen|molen|moulin)\b"),
    ("Tower", r"\b(tower|skyscraper|turm|tour|torre|toren)\b"),
    ("Castle", r"\b(castle|fortress|fort|hillfort|citadel|ch[aâ]teau|kasteel|castello|castillo|burg|hrad|zamek|fortification)\b"),
    ("Palace", r"\b(palace|country house|manor house|manor|mansion|stately home|villa|schloss|palazzo|palacio|palais|h[oô]tel particulier|historic house|folly)\b"),
    ("Museum", r"\b(museum|museo|mus[eé]e|muzeum|gallery|art gallery|library|archive)\b"),
    ("Bridge", r"\b(bridge|viaduct|aqueduct|brug|br[uü]cke|ponte|puente|pont)\b"),
    ("Theatre", r"\b(theatre|theater|opera house|concert hall|teatro|th[eé][aâ]tre)\b"),
    ("Ancient site", r"\b(amphitheatre|amphitheater|archaeological site|ancient (?:city|site|greek|roman|temple)|roman (?:fort|villa|site|theatre)|ruins?|dolmen|stupa|temple|sito archeologico|archeolog\w*)\b"),
    ("Memorial", r"\b(memorial|monument|statue|sculpture|obelisk|sculptural group|hill figure|cultural monument|cultural property|heritage site|historic site|unesco world heritage site|world heritage site|grade i listed|listed building|historic building|bien de inter[eé]s cultural|kulturn\w+ pam\w+)\b"),
    ("Fountain", r"\b(fountain|brunnen)\b"),
    ("Beach", r"\b(beach|playa|platja|plage|spiaggia)\b"),
    ("Waterfall", r"\b(waterfall|cascade)\b"),
    ("Lake", r"\blake\b"),
    ("River", r"\briver\b"),
    ("Island", r"\b(island|islet|peninsula)\b"),
    ("Peak", r"\b(mountain|peak|hill|volcano|mountain pass)\b"),
    ("Cave", r"\b(cave|cave system|cavern|grotto|grotte|h[oö]hle)\b"),
    ("Park", r"\b(park|public park|country park|botanical garden|arboretum|garden|gardens|nature reserve|protected area|national park)\b"),
    ("Stadium", r"\b(stadium|arena|velodrome)\b"),
    # a town hall is a building to see, not a town (Gdansk Main Town Hall, Roemer)
    ("Palace", r"\b(town hall|city hall|town house|guildhall|rathaus|hotel de ville|hôtel de ville|raadhuis|stadhuis)\b"),
    ("Town", r"\b(town|city|market town|capital|city and municipality)\b"),
    ("Village", r"\b(village|hamlet|comune|commune|municipality|human settlement|settlement|civil parish|former municipality|neighbourhood|gemeente|community|municipal unit)\b"),
]
DESC_KIND = [(k, re.compile(p, re.IGNORECASE)) for k, p in DESC_KIND]

# Name words, used when desc is empty or says nothing (39,015 of 54,350
# Square rows without a square word have no desc at all). Whole words only.
NAME_KIND = [
    ("Cathedral", r"\b(cathedral|duomo|catedral|kathedrale|dom)\b"),
    ("Church", r"\b(church|chapel|basilica|kirche|kerk|iglesia|chiesa|[eé]glise|kostel|cerkev|crkva|ermita|kaplica|kapelle|capela|capilla|cappella)\b"),
    ("Monastery", r"\b(monastery|abbey|convent|priory|kloster|monasterio|abbaye|monastero|manastir)\b"),
    ("Synagogue", r"\bsynagogue\b"),
    ("Mosque", r"\b(mosque|camii|dzamija)\b"),
    ("Lighthouse", r"\b(lighthouse|faro|phare|fyr)\b"),
    ("Windmill", r"\b(windmill|windmolen|molen|moulin)\b"),
    ("Castle", r"\b(castle|fortress|fort|citadel|ch[aâ]teau|kasteel|castello|castillo|burg|hrad|zamek|schloss)\b"),
    ("Palace", r"\b(palace|palazzo|palacio|palais|manor|mansion|villa|town hall|city hall|rathaus|guildhall)\b"),
    ("Museum", r"\b(museum|museo|mus[eé]e|muzeum|muzeu|gallery|galerie)\b"),
    ("Bridge", r"\b(bridge|ponte|puente|pont|br[uü]cke|brug)\b"),
    ("Tower", r"\b(tower|torre|tour|turm|toren)\b"),
    ("Theatre", r"\b(theatre|theater|teatro|opera)\b"),
    ("Ancient site", r"\b(amphitheatre|amphitheater|ruins?|dolmen|archaeological|roman (?:villa|baths|theatre))\b"),
    ("Memorial", r"\b(memorial|monument|statue|obelisk|monumento)\b"),
    ("Fountain", r"\b(fountain|fontana|fontaine|brunnen)\b"),
    ("Waterfall", r"\b(waterfall|cascade|cascata)\b"),
    ("Beach", r"\b(beach|playa|plage|spiaggia)\b"),
    ("Lake", r"\b(lake|lago|lac|jezero)\b"),
    ("Cave", r"\b(cave|cueva|grotte|grotta|h[oö]hle)\b"),
    ("Park", r"\b(park|garden|gardens|jardin|giardino|botanical)\b"),
    ("Viewpoint", r"\b(viewpoint|lookout|belvedere|mirador)\b"),
]
NAME_KIND = [(k, re.compile(p, re.IGNORECASE)) for k, p in NAME_KIND]

# --- non-places -----------------------------------------------------------
# Events: a battle or a disaster is a date, not a place. Read on desc and name.
EVENT_DESC_RE = re.compile(
    r"^(?:the\s+)?(?:\d{3,4}\s+)?(?:(?:naval|aerial|air|land|decisive|major|final)\s+)?"
    r"(battle|siege|bombing|raid|massacre|treaty|ruhr pocket|disaster|shooting|election|"
    r"stadium disaster|crash|attack|uprising|offensive|operation|campaign)\b", re.IGNORECASE)
EVENT_NAME_RE = re.compile(
    r"^(?:the\s+)?(?:\w+\s+)?(battle|siege|bombing|raid|massacre|treaty|combat|capture|sack)\s+(of|for|at|on)\b"
    r"|\b(disaster|massacre|bombing)\s*$|^(ruhr pocket)\b", re.IGNORECASE)
# Organisations in the leading noun phrase of desc (not anywhere in it: "river
# bank" and "bank of a lake" are places).
ORG_DESC_RE = re.compile(
    r"^(?:the\s+)?(?:[\w'’-]+\s+){0,3}?(football club|sports club|association football club|"
    r"company|corporation|political party|school district|supermarket chain|supermarket|"
    r"retailer|bank|record label|newspaper|band|musical group|organization|organisation|"
    r"roman catholic diocese|diocese|archdiocese|state archival institution|"
    r"commercial offices|office building|public school|private school|primary school|"
    r"secondary school|hospital|trade union|association|foundation|"
    r"parafia\b[\w\s]*|parish of the roman catholic church)\b", re.IGNORECASE)
SHOP_NAME_RE = re.compile(
    r"^(waitrose|tesco|lidl|aldi|carrefour|sainsbury|mcdonald|starbucks|primark|ikea|asda|"
    r"morrisons|spar|co-op|marks & spencer|boots|burger king|kfc|subway|decathlon)\b", re.IGNORECASE)
FONDALI_RE = re.compile(r"^Fondali\b")
# Names that are only a code: digits, or letters and digits, no desc, no wiki,
# no heritage. "Dam" has a wiki and desc, so it never matches.
JUNK_NAME_RE = re.compile(r"^(?:\d+|[A-Z]{2,4}\d+|\d+[A-Z]{1,3}|unnamed|untitled|null|none)$", re.IGNORECASE)
SHORT_CAPS_RE = re.compile(r"^[A-Z]{1,3}$")
CEMETERY_DESC_RE = re.compile(r"\b(cemetery|begraafplaats|friedhof|cimeti[eè]re|cimitero|cementerio|burial ground)\b", re.IGNORECASE)
STATION_DESC_RE = re.compile(r"\b(railway station|train station|bus station|bahnhof|spoorwegstation|gare ferroviaire|railway halt|metro station|tram stop)\b", re.IGNORECASE)

# A row with one of these in desc, or heritage, or this many Wikipedia
# languages, is a place a traveller can visit and is never flagged noise
# (shops and seabed polygons excepted: they are never visitable).
SITE_DESC_RE = re.compile(
    r"\b(museum|memorial|battlefield|monument|fort|fortress|castle|ruins?|site|park|palace|"
    r"cathedral|church|abbey|temple|tower|bridge|gate|wall|camp|garden|heritage|ancient|"
    r"archaeological|lion|mound|cemetery|gardens|reserve)\b", re.IGNORECASE)
SITE_NAME_RE = re.compile(
    r"\b(museum|memorial|monument|battlefield|lion'?s mound|butte du lion|museo|mus[eé]e|"
    r"gedenkst[aä]tte|cemetery|castle|fort|park|ruins?|ossuary|trench(?:es)?)\b", re.IGNORECASE)
FAMOUS_SITELINKS = 15
# A theatre or opera "company" is also a house you can visit (Slovak National Theatre).
VENUE_DESC_RE = re.compile(r"\b(theatre|theater|opera house|concert hall|museum|gallery|stadium)\b", re.IGNORECASE)


def _lead(desc):
    """The leading noun phrase of a desc: up to the first 'in', 'of', a comma."""
    d = (desc or "").strip()
    return re.split(r"\s+(?:in|of|on|at|near|within|located|from|by|that|which|for)\s+|[,;(]", d, maxsplit=1)[0]


def _known_kinds():
    """The kinds poi_categories.kind_category knows; empty when the config
    cannot be read (then the fallback map is used for every rich kind)."""
    global _KNOWN
    if _KNOWN is None:
        try:
            import rating_config
            _KNOWN = set(rating_config.section("poi_categories.kind_category"))
        except Exception:
            _KNOWN = set()
    return _KNOWN


_KNOWN = None


def resolve_kind(wanted, known=None):
    """A wanted kind, or its nearest known kind, so no row ever has a kind
    without a category."""
    known = _known_kinds() if known is None else known
    if wanted in known or not known:
        return wanted if wanted in known else KIND_FALLBACK.get(wanted, wanted)
    return KIND_FALLBACK.get(wanted, "Attraction")


def _visitable(item, wd):
    if item.get("heritage") or (wd or {}).get("heritage"):
        return True
    if ((wd or {}).get("sitelinks") or 0) >= FAMOUS_SITELINKS:
        return True
    return bool(SITE_DESC_RE.search(item.get("desc") or "") or SITE_NAME_RE.search(item.get("name") or ""))


def noise_reason(item, wd=None):
    """Why a row is not a place to visit, or '' when it is (or may be)."""
    name = (item.get("name") or "").strip()
    desc = (item.get("desc") or "").strip()
    # A chain's name with a museum desc is the Sainsbury Centre for Visual Arts,
    # not a supermarket: the name rule gives way to a site word in desc.
    if SHOP_NAME_RE.search(name) and not SITE_DESC_RE.search(desc):
        return "shop"
    if FONDALI_RE.search(name):
        return "seabed"
    no_ident = not desc and not item.get("wiki") and not item.get("heritage")
    if no_ident and (JUNK_NAME_RE.search(name) or SHORT_CAPS_RE.search(name)):
        return "junk name"
    lead = _lead(desc)
    visitable = _visitable(item, wd)
    # An event, unless the row is the site of it. "Battle of X" with a memorial
    # in desc is kept; the plain "Battle of Berlin" row is a date.
    if (EVENT_DESC_RE.search(desc) or EVENT_NAME_RE.search(name)) and not (
            item.get("heritage")
            or re.search(r"\b(museum|memorial|monument|battlefield|site|mound|cemetery|park)\b", desc, re.I)
            or SITE_NAME_RE.search(name)):
        return "event"
    # Fame alone never rescues an organisation (Deutsche Bank has many
    # sitelinks): it needs heritage or a site word, or to be a venue.
    if ORG_DESC_RE.search(lead) and not (
            item.get("heritage") or (wd or {}).get("heritage")
            or SITE_DESC_RE.search(desc) or SITE_NAME_RE.search(name)
            or VENUE_DESC_RE.search(desc)):
        return "organisation"
    if CEMETERY_DESC_RE.search(lead) and not item.get("wiki") and not visitable:
        return "cemetery"
    if (STATION_DESC_RE.search(lead) or (wd or {}).get("station")) and not visitable:
        return "station"
    return ""


def _kind_from_text(item):
    """The wanted kind from desc, then name words; '' when neither says."""
    desc = (item.get("desc") or "").strip()
    if desc:
        lead = _lead(desc)
        for kind, rx in DESC_KIND:
            if rx.search(lead):
                return kind
    name = item.get("name") or ""
    for kind, rx in NAME_KIND:
        if rx.search(name):
            return kind
    return ""


def classify_poi(item, wd=None, known=None):
    """{kind, noise_reason} for one POI row; a pure function.

    kind is the row's own kind unless it is unreliable (RETYPE_FROM) and the
    evidence names a better one. A Square with a square word in its name, or
    a desc that says square, stays a Square. noise_reason is '' for a place.
    """
    kind = item.get("kind") or ""
    why = noise_reason(item, wd)
    if kind in RETYPE_FROM:
        wanted = _kind_from_text(item)
        name = item.get("name") or ""
        if wanted == "Square" or (not wanted and SQUARE_NAME_RE.search(name) and kind == "Square"):
            kind = "Square"
        elif not wanted and kind == "Square" and (wd or {}).get("admin"):
            kind = resolve_kind("Village", known)
        elif wanted:
            kind = resolve_kind(wanted, known)
        elif kind == "Square" and SQUARE_NAME_RE.search(name):
            kind = "Square"
        elif kind in ("Square", "", "Landmark"):
            kind = resolve_kind("Attraction", known)
    return {"kind": kind, "noise_reason": why}


def normalize_items(items, wikidata=None):
    """Mutate a list of POI items; return (n_kind, n_noise).

    `wikidata` is cache/poi_wikidata.json (keyed by the wiki URL) when the
    caller has it: it adds the sitelink count and the admin and station flags.
    """
    n_kind = n_noise = 0
    for it in items or []:
        if not isinstance(it, dict):
            continue
        kind = it.get("kind") or ""
        if kind in KIND_MAP:
            it["kind"] = KIND_MAP[kind]
            n_kind += 1
            kind = it["kind"]
        demote = kind in LOOSE_KINDS and COMMERCIAL_RE.search(it.get("name") or "")
        wd = (wikidata or {}).get(it.get("wiki") or "")
        verdict = classify_poi(it, wd)
        if verdict["kind"] != kind:
            it["kind"] = verdict["kind"]
            n_kind += 1
        if demote or verdict["noise_reason"]:
            if it.get("rate") or not it.get("noise"):
                n_noise += 1
            it["rate"] = 0
            it["noise"] = 1
    return n_kind, n_noise


def patch(path: Path) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    wikidata = {}
    if WIKIDATA.exists():
        wikidata = json.loads(WIKIDATA.read_text(encoding="utf-8"))

    n_kind = n_noise = 0
    if "destinations" in data:  # app_data.json shape
        for dest in data["destinations"].values():
            items = (dest.get("activities") or {}).get("items_full")
            k, n = normalize_items(items, wikidata)
            n_kind += k
            n_noise += n
    else:  # activities_full.json shape: { destId: [items] }
        for items in data.values():
            k, n = normalize_items(items, wikidata)
            n_kind += k
            n_noise += n

    # master keeps the pipeline's canonical indent=1; the served copy stays
    # compact (it is what the browser downloads). Both go through the atomic
    # writer so an interrupted run can never truncate a dataset.
    if "destinations" in data:
        atomic_write_json(path, data)
    else:
        atomic_write_json(path, data, indent=None, separators=(",", ":"))
    print(f"  {path.name}: {n_kind} kinds normalized, {n_noise} commercial-noise items demoted")


def main() -> None:
    targets = [Path(p) for p in sys.argv[1:]] or DEFAULT_TARGETS
    for t in targets:
        patch(t)


if __name__ == "__main__":
    main()
