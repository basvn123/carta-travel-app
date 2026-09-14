"""Practical layer (D4, 2026-09): the fields travellers ask for.

Ordered by how often they decide a trip, all derivable without a new
commercial source, each absent where its data is:

  book_ahead   the highlights that sell out - a MAINTAINED editorial list
               of Europe's famous timed-entry sights (the same idiom as
               beauty_layer.ICONIC_CURATED: hand-kept constants, matched by
               folded name against each destination's highlights). Wikidata
               holds no reliable requires-booking property to harvest, so
               the list is the honest source and says so.
  eat          regional food and drink from Wikidata's protected-name
               modelling (PDO/PGI), matched to destinations by the
               product's country and, where present, coordinates. Emitted
               only where the modelling supports it.
  rhythm       opening conventions by country - closing days, siesta,
               Sunday closures - editorial one-liners in English, the same
               follow-the-data rule the intros use.
  pairs        the places that pair well: catalogue destinations within
               PAIR_KM scoring PAIR_MIN_SCORE or better, never the same
               kind twice - a city pairs with a village and a landscape,
               not with two more cities.

Accessibility and family fit are NOT emitted: the wheelchair tags live on
OSM POIs the pipeline has not harvested, and a coverage rule with no
coverage is a blank, not a block.

Writes cache/practical.json, keyed by destination id; build_dossier merges
it into each dossier's `practical` section.

Usage:
    python practical_layer.py
"""

import json
import math
import sys
import unicodedata
from pathlib import Path

from pipeline_io import atomic_write_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
WIRE = ROOT / "continent-app" / "public" / "app_data.json"
EAT_CACHE = ROOT / "cache" / "wikidata_food.json"
OUT = ROOT / "cache" / "practical.json"

PAIR_KM = 110.0          # ~ under two hours by road or rail
PAIR_MIN_SCORE = 7.0
PAIR_MAX = 3

# The timed-entry list. Hand-maintained: each entry is a sight famous enough
# that arriving without a slot is the most-regretted mistake in travel
# content. Matched by folded name against highlight names; extend freely.
BOOK_AHEAD = {
    "sistine chapel", "vatican museums", "st peter s basilica dome",
    "colosseum", "borghese gallery", "galleria borghese", "uffizi",
    "galleria dell accademia", "last supper", "cenacolo", "doge s palace",
    "st mark s campanile", "leaning tower of pisa",
    "alhambra", "sagrada familia", "park guell", "casa batllo",
    "casa mila", "la pedrera", "alcazar of seville",
    "royal alcazar of seville", "mezquita", "mosque cathedral of cordoba",
    "guggenheim museum bilbao", "picasso museum",
    "anne frank house", "van gogh museum", "rijksmuseum",
    "eiffel tower", "louvre", "musee d orsay", "palace of versailles",
    "sainte chapelle", "catacombs of paris", "mont saint michel abbey",
    "neuschwanstein castle", "reichstag", "brandenburg gate?",
    "acropolis", "acropolis of athens",
    "pena palace", "quinta da regaleira", "livraria lello", "belem tower",
    "jeronimos monastery",
    "blue lagoon", "szechenyi thermal bath", "hungarian parliament",
    "schonbrunn palace", "hofburg", "prague castle",
    "edinburgh castle", "tower of london", "westminster abbey",
    "warner bros studio tour", "stonehenge",
    "casa di giulietta", "pompeii", "herculaneum", "capri blue grotto",
    "blue grotto",
}

# Opening rhythm by country: what surprises a first-time visitor. English
# editorial data (the intros' follow-the-data rule); absent countries show
# nothing rather than a guessed sentence.
RHYTHM = {
    "DE": "Shops close on Sundays almost everywhere; museums mostly close Mondays.",
    "AT": "Shops close on Sundays; many museums close Mondays.",
    "CH": "Shops close on Sundays; mountain lifts run to their own seasons.",
    "ES": "Long afternoon closures outside the big cities (roughly 14-17h); dinner starts late, around 21h.",
    "GR": "Afternoon breaks are common outside Athens; many sites close by 15h off-season.",
    "IT": "Many shops and churches close 13-16h; most museums close Mondays.",
    "FR": "Many museums close Mondays or Tuesdays; smaller shops close 12-14h and on Sundays.",
    "PT": "Many museums close Mondays; smaller shops take a lunch break.",
    "NL": "Many shops open late on Mondays; museums are usually open daily.",
    "BE": "Many shops close Sundays and Monday mornings.",
    "PL": "Most shops close on Sundays (trading ban, few exceptions).",
    "CZ": "Museums and castles mostly close Mondays; state castles hibernate November to March.",
    "HU": "Museums mostly close Mondays; thermal baths run daily.",
    "HR": "Coastal life pauses mid-afternoon in summer; museums often close Mondays.",
    "NO": "Shops close early on Saturdays and stay shut Sundays; alcohol sales end early.",
    "SE": "Systembolaget (alcohol) closes Saturdays 15h and Sundays; museums often close Mondays.",
    "DK": "Many attractions shorten hours October to March.",
    "FI": "Museums often close Mondays; midsummer shuts much of the country.",
    "IS": "Almost everything runs daily, but rural services thin out off-season.",
    "IE": "Pubs serve late but kitchens close early, often by 21h.",
    "GB": "Sunday trading is short (large shops six hours); last museum entry is often an hour before closing.",
    "RO": "Many museums close Mondays AND Tuesdays.",
    "BG": "Many museums close Mondays; churches close for services.",
    "RS": "Museums often close Mondays; long cafe hours otherwise.",
    "TR": "Mosques close to visitors at prayer times, longest at Friday noon.",
}


def fold(s):
    s = (s or "").translate(str.maketrans({"ł": "l", "Ł": "l", "ø": "o",
                                           "Ø": "o", "ß": "ss"}))
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    out = []
    for ch in s.lower():
        out.append(ch if ch.isalnum() else " ")
    return " ".join("".join(out).split())


def haversine_km(la1, lo1, la2, lo2):
    r = 6371.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dp = math.radians(la2 - la1)
    dl = math.radians(lo2 - lo1)
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def build_pairs(dests):
    """{id: [{id, name, kind, km, score}]} - close, excellent, kind-diverse."""
    import sys as _sys
    _sys.path.insert(0, str(ROOT / "pipeline"))
    rows = []
    for did, d in dests.items():
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        score = (d.get("rating") or {}).get("score") or 0
        kind = (d.get("place") or {}).get("class") or "city"
        rows.append((did, d.get("city"), kind, lat, lon, score))
    grid = {}
    for r in rows:
        if r[3] is None:
            continue
        grid.setdefault((int(r[3] / 0.5), int(r[4] / 0.5)), []).append(r)

    out = {}
    for did, _name, kind, lat, lon, _score in rows:
        if lat is None:
            continue
        cands = []
        bi, bj = int(lat / 0.5), int(lon / 0.5)
        for i in range(bi - 3, bi + 4):
            for j in range(bj - 3, bj + 4):
                for (oid, oname, okind, olat, olon, oscore) in grid.get((i, j), ()):
                    if oid == did or oscore < PAIR_MIN_SCORE or okind == kind:
                        continue
                    km = haversine_km(lat, lon, olat, olon)
                    if km <= PAIR_KM:
                        cands.append((oscore - km / 100.0, oid, oname, okind,
                                      round(km), oscore))
        cands.sort(reverse=True)
        picked, kinds_used = [], set()
        for (_w, oid, oname, okind, km, oscore) in cands:
            # never the same kind twice: a city + a village + a landscape is
            # a better week than three cities
            if okind in kinds_used:
                continue
            kinds_used.add(okind)
            picked.append({"id": oid, "name": oname, "kind": okind,
                           "km": km, "score": oscore})
            if len(picked) >= PAIR_MAX:
                break
        if picked:
            out[did] = picked
    return out


def build_eat(dests):
    """{id: [product names]} from the Wikidata food cache, when it exists."""
    if not EAT_CACHE.exists():
        print("  eat: cache/wikidata_food.json absent - field not emitted "
              "(run the food harvest first)")
        return {}
    foods = json.loads(EAT_CACHE.read_text(encoding="utf-8"))
    grid = {}
    for f in foods:
        if f.get("lat") is None:
            continue
        grid.setdefault((int(f["lat"] / 0.5), int(f["lon"] / 0.5)), []).append(f)
    out = {}
    for did, d in dests.items():
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        if lat is None:
            continue
        bi, bj = int(lat / 0.5), int(lon / 0.5)
        cands = []
        for i in range(bi - 2, bi + 3):
            for j in range(bj - 2, bj + 3):
                for f in grid.get((i, j), ()):
                    km = haversine_km(lat, lon, f["lat"], f["lon"])
                    if km <= 80:
                        cands.append((km, f["name"]))
        cands.sort()
        names = []
        for _km, n in cands:
            if n not in names:
                names.append(n)
            if len(names) >= 5:
                break
        if names:
            out[did] = names
    return out


def main():
    data = json.loads(WIRE.read_text(encoding="utf-8"))
    dests = data["destinations"]

    pairs = build_pairs(dests)
    eat = build_eat(dests)

    out = {"model": {
        "version": "practical_v1",
        "book_ahead": "maintained editorial list, matched by folded "
                      "highlight name - Wikidata has no reliable "
                      "requires-booking property",
        "eat": "Wikidata protected food names (PDO/PGI modelling) within "
               "80 km, when harvested",
        "rhythm": "editorial one-liners by country, English follow-the-data",
        "pairs": f"catalogue places within {PAIR_KM:.0f} km scoring "
                 f">= {PAIR_MIN_SCORE}, never the same kind twice",
        "not_emitted": "accessibility and family fit - OSM wheelchair tags "
                       "on top POIs are not harvested; absent, not guessed",
    }, "dests": {}}
    n_ba = 0
    for did, d in dests.items():
        entry = {}
        hits = []
        for it in ((d.get("activities") or {}).get("items") or []):
            if fold(it.get("name")) in BOOK_AHEAD:
                hits.append(it["name"])
        if hits:
            entry["book_ahead"] = sorted(set(hits))[:4]
            n_ba += 1
        r = RHYTHM.get(d.get("iso2"))
        if r:
            entry["rhythm"] = r
        if did in pairs:
            entry["pairs"] = pairs[did]
        if did in eat:
            entry["eat"] = eat[did]
        if entry:
            out["dests"][did] = entry

    atomic_write_json(OUT, out, indent=None, separators=(",", ":"))
    print(f"wrote {OUT.name}: {len(out['dests'])} destinations "
          f"({n_ba} with book-ahead sights, {len(pairs)} with pairs, "
          f"{len(eat)} with regional food)")


if __name__ == "__main__":
    main()
