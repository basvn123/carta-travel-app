"""Ask Carta lexicon (T552): the reviewed words Ask reads beside the guided
search's own vocabulary.

Two kinds of row, one shape, written to continent-app/public/search/ask/lexicon.json:

    {"version": 1, "phrases": [[phrase, lang, slot, value], ...]}

    slot  vibe | area | country | extra | sort | place
    value a vibe or area id from search/guided.json, an ISO code, an extra
          (beach, trail, lake, nocar, quiet), "cost", or a destination id

1. Synonyms and inflections in six languages ("laid back" is quiet, "gunstiger"
   is cheapest first, "mangiare" is food), so a question in everyday words
   lands on a facet Carta can answer.
2. Place exonyms ("Lissabon", "Oporto", "Nizza", "Krakau"): the catalogue
   holds one name per place and search_index.json few others.

The tables below are hand reviewed and are the lexicon. The app reads the
phrases as exact keys (lib/ask/intent.js buildAskVocab), and the ask index
layer (T551) embeds them as the `lexicon` source, so a word close to one of
them ("chilled") still finds its facet through the vectors.

Optional, free and local: `--ollama` asks a local Ollama model (default
qwen3:4b on http://localhost:11434) for more candidates per vibe and
language and writes them to pipeline/ask_lexicon_candidates.json for a
person to review. Candidates never reach lexicon.json on their own; a
reviewed word is added to the tables here. No paid API is called.

    python pipeline/ask_lexicon.py --app <continent-app dir>
    python pipeline/ask_lexicon.py --app <dir> --ollama [--model qwen3:4b]
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = ["en", "nl", "de", "fr", "es", "it"]

# Everyday words per vibe, beyond lib/guidedSearch.js VIBE_WORDS and
# VIBE_WORDS_I18N (which the app already reads). Folded the way the app
# folds (lower case, accents off); the app folds again, so either is fine.
SYNONYMS: dict[str, dict[str, list[str]]] = {
    "quiet": {
        "en": ["chill", "chilled", "laid back", "laid-back", "relaxed", "low key", "slow", "slow travel", "peace and quiet", "unwind", "sleepy"],
        "nl": ["relaxed", "ontspannen", "tot rust komen", "rustige", "stil", "stille"],
        "de": ["entspannt", "erholsam", "beschaulich", "ruhige", "ruhiges", "ruhigen", "abschalten"],
        "fr": ["detente", "reposant", "paisible", "tranquilles", "se reposer"],
        "es": ["relajado", "relajante", "descanso", "tranquilos", "tranquilas"],
        "it": ["rilassante", "riposo", "pace", "tranquilli", "tranquille"],
    },
    "food": {
        "en": ["gourmet", "culinary", "wine tasting", "vineyards", "vineyard", "tapas", "seafood", "markets", "food markets", "local food", "eat well", "restaurants"],
        "nl": ["lekker eten", "culinair", "wijnproeven", "wijngaarden", "restaurants", "eten en drinken"],
        "de": ["gut essen", "feinschmecker", "weinprobe", "weinberge", "weingut", "restaurants"],
        "fr": ["bien manger", "gastronomique", "degustation", "vignobles", "vignoble", "restaurants"],
        "es": ["comer bien", "gastronomico", "cata de vinos", "vinedos", "bodegas", "restaurantes"],
        "it": ["mangiare", "mangiare bene", "enogastronomia", "degustazione", "vigneti", "cantine", "ristoranti"],
    },
    "beach": {
        "en": ["coast", "coastal", "seaside town", "sunbathing", "sandy", "on the coast", "seafront"],
        "nl": ["kust", "aan zee", "badplaats", "zonnen"],
        "de": ["kuste", "am meer", "badeort", "sonnen"],
        "fr": ["cote", "bord de mer", "station balneaire", "au bord de la mer"],
        "es": ["costa", "junto al mar", "pueblo costero"],
        "it": ["costa", "al mare", "localita balneare"],
    },
    "mountain": {
        "en": ["peaks", "alpine town", "high mountains", "ski", "skiing", "ski resort"],
        "nl": ["gebergte", "skien", "wintersport"],
        "de": ["hochgebirge", "skifahren", "skiort", "wintersport"],
        "fr": ["sommets", "ski", "station de ski"],
        "es": ["cumbres", "esqui", "estacion de esqui"],
        "it": ["vette", "sci", "localita sciistica"],
    },
    "hiking": {
        "en": ["hut to hut", "hill walking", "walking holiday", "mountain walks", "long walks"],
        "nl": ["wandelvakantie", "bergwandelen", "lange wandelingen", "trektocht"],
        "de": ["bergwandern", "wanderurlaub", "huttentour", "trekking"],
        "fr": ["randonner", "randonnee en montagne", "trek"],
        "es": ["hacer senderismo", "excursiones", "trekking"],
        "it": ["trekking", "passeggiate", "sentieri", "camminate"],
    },
    "lake": {
        "en": ["lakeshore", "lake town", "on a lake", "lake views"],
        "nl": ["aan het meer", "aan een meer", "meertje"],
        "de": ["am see", "seeufer", "badesee"],
        "fr": ["au bord du lac", "bord d un lac"],
        "es": ["junto al lago", "orilla del lago"],
        "it": ["sul lago", "riva del lago"],
    },
    "castles": {
        "en": ["chateau", "chateaux", "citadel", "fort", "forts", "ruins"],
        "nl": ["kastelen", "burchten", "ruines", "vesting"],
        "de": ["burgen", "festung", "ruinen"],
        "fr": ["forteresse", "citadelle", "ruines"],
        "es": ["fortaleza", "alcazar", "ruinas"],
        "it": ["fortezza", "rocca", "rovine"],
    },
    "art": {
        "en": ["culture", "cultural", "galleries", "history", "architecture tour"],
        "nl": ["cultuur", "cultureel", "galerieen", "geschiedenis", "architectuur"],
        "de": ["kultur", "galerien", "geschichte", "architektur"],
        "fr": ["culture", "culturel", "galeries", "histoire", "architecture"],
        "es": ["cultura", "cultural", "galerias", "historia", "arquitectura"],
        "it": ["cultura", "culturale", "gallerie", "storia", "architettura"],
    },
    "nightlife": {
        "en": ["going out", "pubs", "night out", "live music", "student town"],
        "nl": ["kroegen", "stappen", "nachtleven", "live muziek"],
        "de": ["nachtleben", "kneipen", "feiern", "clubs"],
        "fr": ["vie nocturne", "faire la fete", "boites"],
        "es": ["vida nocturna", "salir de fiesta", "bares"],
        "it": ["vita notturna", "locali", "bar"],
    },
    "nature": {
        "en": ["national parks", "nature reserve", "wild", "wilderness", "forests", "birdwatching"],
        "nl": ["natuurpark", "nationaal park", "bossen", "ongerept"],
        "de": ["naturpark", "nationalparks", "walder", "wildnis"],
        "fr": ["parc naturel", "parc national", "forets", "sauvage"],
        "es": ["parque natural", "parque nacional", "bosques"],
        "it": ["parco naturale", "parco nazionale", "boschi"],
    },
    "views": {
        "en": ["panoramic", "lookout", "lookouts", "photogenic", "instagrammable", "pretty", "beautiful"],
        "nl": ["panorama", "uitzichtpunt", "fotogeniek", "mooie"],
        "de": ["aussichtspunkt", "fotogen", "schone", "malerisch"],
        "fr": ["panorama", "belvedere", "pittoresque", "joli"],
        "es": ["panoramica", "mirador", "pintoresco", "bonito"],
        "it": ["panoramica", "belvedere", "pittoresco", "bello"],
    },
    "spa": {
        "en": ["thermal spa", "hot spring", "baths", "saunas", "wellness weekend"],
        "nl": ["thermaal", "kuuroord", "sauna"],
        "de": ["thermalbad", "kurort", "sauna"],
        "fr": ["station thermale", "bains", "sauna"],
        "es": ["aguas termales", "spa", "sauna"],
        "it": ["termale", "bagni termali", "sauna"],
    },
    "village": {
        "en": ["hamlet", "small village", "tiny village", "countryside village"],
        "nl": ["dorpje", "klein dorp", "gehucht"],
        "de": ["dorfchen", "kleines dorf", "weiler"],
        "fr": ["petit village", "hameau", "villages"],
        "es": ["aldea", "pueblito", "pueblo pequeno"],
        "it": ["paesino", "piccolo borgo", "frazione"],
    },
    "oldtown": {
        "en": ["old quarter", "cobbled streets", "cobblestones", "historic old town", "medieval town", "medieval towns", "historic centre"],
        "nl": ["oude binnenstad", "middeleeuws", "middeleeuwse stad", "kasseien"],
        "de": ["mittelalterlich", "historische altstadt", "kopfsteinpflaster"],
        "fr": ["vieux quartier", "centre historique", "medieval", "ville medievale"],
        "es": ["barrio antiguo", "centro historico", "medieval"],
        "it": ["centro antico", "borgo medievale", "medievale"],
    },
    "romantic": {
        "en": ["anniversary", "for lovers", "date", "romance trip"],
        "nl": ["huwelijksreis", "jubileum", "romantisch weekend"],
        "de": ["flitterwochen", "hochzeitsreise", "jahrestag"],
        "fr": ["lune de miel", "anniversaire de mariage", "amoureux"],
        "es": ["luna de miel", "aniversario", "enamorados"],
        "it": ["luna di miele", "anniversario", "innamorati"],
    },
    "family": {
        "en": ["kid friendly", "kid-friendly", "child friendly", "toddlers", "teenagers"],
        "nl": ["kindvriendelijk", "met kinderen", "gezinsvriendelijk"],
        "de": ["kinderfreundlich", "mit kindern", "familienfreundlich"],
        "fr": ["avec enfants", "familial"],
        "es": ["con ninos", "familiar"],
        "it": ["con bambini", "per famiglie"],
    },
    "adventure": {
        "en": ["paragliding", "canyoning", "via ferrata", "mountain biking", "surfing", "diving", "sporty", "active"],
        "nl": ["actief", "mountainbiken", "surfen", "duiken"],
        "de": ["aktiv", "klettern", "mountainbiken", "surfen", "tauchen"],
        "fr": ["sportif", "escalade", "parapente", "surf", "plongee"],
        "es": ["activo", "escalada", "parapente", "surf", "buceo"],
        "it": ["attivo", "arrampicata", "parapendio", "surf", "immersioni"],
    },
    "city": {
        "en": ["metropolis", "big cities", "shopping"],
        "nl": ["grote stad", "winkelen"],
        "de": ["grossstadt", "einkaufen"],
        "fr": ["grande ville", "shopping"],
        "es": ["gran ciudad", "compras"],
        "it": ["grande citta", "shopping"],
    },
    "unesco": {
        "en": ["world heritage site", "heritage site"],
        "nl": ["werelderfgoed"],
        "de": ["welterbe", "weltkulturerbe"],
        "fr": ["patrimoine mondial"],
        "es": ["patrimonio de la humanidad", "patrimonio mundial"],
        "it": ["patrimonio dell umanita", "patrimonio mondiale"],
    },
}

SORT_COST = {
    "en": ["low budget", "budget friendly", "budget-friendly", "not expensive", "not too expensive", "cheaper", "low cost", "value for money"],
    "nl": ["goedkoper", "niet duur", "voordelig", "budgetvriendelijk"],
    "de": ["gunstiger", "billiger", "nicht teuer", "preisgunstig", "gunstigen"],
    "fr": ["moins cher", "pas trop cher", "petit budget"],
    "es": ["mas barato", "no muy caro", "bajo presupuesto"],
    "it": ["piu economico", "non troppo caro", "low cost", "risparmiare"],
}

EXTRAS = {
    "beach": {"en": ["near the beach", "close to the sea", "walk to the beach"], "nl": ["dicht bij het strand"], "de": ["nah am strand"], "fr": ["pres de la plage"], "es": ["cerca de la playa"], "it": ["vicino alla spiaggia"]},
    "trail": {"en": ["walking paths", "footpaths", "hiking trails nearby"], "nl": ["wandelpaden"], "de": ["wanderwege"], "fr": ["sentiers"], "es": ["senderos"], "it": ["sentieri vicini"]},
    "lake": {"en": ["close to a lake"], "nl": ["dicht bij een meer"], "de": ["nah am see"], "fr": ["pres d un lac"], "es": ["cerca de un lago"], "it": ["vicino a un lago"]},
}

# One name per place in the catalogue; these are the names other languages
# use. Ids are checked against app_data.json and dropped when absent.
EXONYMS: dict[str, list[tuple[str, str]]] = {
    "LHR": [("nl", "londen"), ("de", "london"), ("fr", "londres"), ("es", "londres"), ("it", "londra")],
    "CDG": [("nl", "parijs"), ("es", "paris"), ("it", "parigi"), ("en", "paris")],
    "FCO": [("nl", "rome"), ("de", "rom"), ("es", "roma"), ("it", "roma"), ("en", "rome")],
    "MXP": [("nl", "milaan"), ("de", "mailand"), ("es", "milan"), ("it", "milano"), ("en", "milan")],
    "VCE": [("nl", "venetie"), ("de", "venedig"), ("fr", "venise"), ("es", "venecia"), ("it", "venezia"), ("en", "venice")],
    "WAW": [("nl", "warschau"), ("de", "warschau"), ("fr", "varsovie"), ("es", "varsovia"), ("it", "varsavia"), ("en", "warsaw")],
    "ARN": [("nl", "stockholm"), ("es", "estocolmo"), ("it", "stoccolma"), ("en", "stockholm")],
    "OSL": [("en", "oslo")],
    "FRA": [("en", "frankfurt"), ("fr", "francfort"), ("es", "francfort"), ("it", "francoforte")],
    "LIS": [("nl", "lissabon"), ("de", "lissabon"), ("fr", "lisbonne"), ("es", "lisboa"), ("it", "lisbona"), ("en", "lisbon")],
    "OPO": [("es", "oporto"), ("en", "oporto"), ("fr", "porto"), ("it", "porto")],
    "KRK": [("nl", "krakau"), ("de", "krakau"), ("fr", "cracovie"), ("es", "cracovia"), ("it", "cracovia"), ("en", "cracow"), ("en", "krakow")],
    "SZG": [("es", "salzburgo"), ("it", "salisburgo"), ("fr", "salzbourg")],
    "NCE": [("it", "nizza"), ("de", "nizza"), ("es", "niza")],
    "FLR": [("nl", "florence"), ("de", "florenz"), ("es", "florencia"), ("it", "firenze")],
    "VIE": [("nl", "wenen"), ("de", "wien"), ("fr", "vienne"), ("es", "viena"), ("it", "vienna")],
    "PRG": [("nl", "praag"), ("de", "prag"), ("es", "praga"), ("it", "praga")],
    "MUC": [("nl", "munchen"), ("de", "munchen"), ("fr", "munich"), ("es", "munich"), ("it", "monaco di baviera")],
    "gem:koln": [("en", "cologne"), ("nl", "keulen"), ("fr", "cologne"), ("es", "colonia"), ("it", "colonia")],
    "CPH": [("nl", "kopenhagen"), ("de", "kopenhagen"), ("fr", "copenhague"), ("es", "copenhague"), ("it", "copenaghen")],
    "BRU": [("nl", "brussel"), ("de", "brussel"), ("fr", "bruxelles"), ("es", "bruselas"), ("it", "bruxelles")],
    "gem:antwerp": [("nl", "antwerpen"), ("de", "antwerpen"), ("fr", "anvers"), ("es", "amberes"), ("it", "anversa")],
    "gem:bruges": [("nl", "brugge"), ("de", "brugge"), ("es", "brujas"), ("it", "bruges")],
    "gem:ghent": [("nl", "gent"), ("fr", "gand"), ("es", "gante"), ("it", "gand")],
    "gem:leuven": [("fr", "louvain"), ("de", "lowen"), ("es", "lovaina")],
    "gem:liege": [("nl", "luik"), ("de", "luttich"), ("es", "lieja")],
    "gem:mechelen": [("fr", "malines"), ("en", "mechlin")],
    "gem:aachen": [("fr", "aix la chapelle"), ("nl", "aken"), ("es", "aquisgran"), ("it", "aquisgrana")],
    "gem:the-hague": [("nl", "den haag"), ("de", "den haag"), ("fr", "la haye"), ("es", "la haya"), ("it", "l aia")],
    "AMS": [("es", "amsterdam"), ("it", "amsterdam")],
    "GVA": [("nl", "geneve"), ("de", "genf"), ("fr", "geneve"), ("es", "ginebra"), ("it", "ginevra")],
    "ZRH": [("de", "zurich"), ("it", "zurigo")],
    "BRN": [("fr", "berne"), ("it", "berna"), ("es", "berna")],
    "BSL": [("fr", "bale"), ("it", "basilea"), ("es", "basilea")],
    "gem:lucerne": [("de", "luzern"), ("nl", "luzern"), ("it", "lucerna"), ("es", "lucerna")],
    "NAP": [("nl", "napels"), ("de", "neapel"), ("es", "napoles"), ("it", "napoli"), ("fr", "naples")],
    "TRN": [("de", "turin"), ("it", "torino"), ("es", "turin")],
    "GOA": [("nl", "genua"), ("de", "genua"), ("fr", "genes"), ("es", "genova"), ("it", "genova")],
    "PSA": [("en", "pisa")],
    "gem:padua": [("nl", "padua"), ("it", "padova"), ("fr", "padoue")],
    "VRN": [("fr", "verone"), ("en", "verona")],
    "gem:mantua": [("it", "mantova"), ("fr", "mantoue")],
    "gem:syracuse": [("it", "siracusa"), ("de", "syrakus"), ("es", "siracusa")],
    "BCN": [("en", "barcelona"), ("fr", "barcelone"), ("it", "barcellona")],
    "MAD": [("en", "madrid")],
    "VLC": [("fr", "valence"), ("en", "valencia")],
    "AGP": [("es", "malaga"), ("en", "malaga")],
    "SVQ": [("fr", "seville"), ("it", "siviglia"), ("de", "sevilla")],
    "gem:cordoba": [("fr", "cordoue"), ("de", "cordoba"), ("it", "cordova")],
    "gem:granada": [("fr", "grenade"), ("en", "granada")],
    "gem:toledo": [("fr", "tolede"), ("en", "toledo")],
    "ATH": [("nl", "athene"), ("de", "athen"), ("fr", "athenes"), ("es", "atenas"), ("it", "atene")],
    "SKG": [("de", "saloniki"), ("fr", "salonique"), ("es", "salonica"), ("it", "salonicco")],
    "BEG": [("nl", "belgrado"), ("es", "belgrado"), ("it", "belgrado")],
    "OTP": [("nl", "boekarest"), ("de", "bukarest"), ("fr", "bucarest"), ("es", "bucarest"), ("it", "bucarest")],
    "GDN": [("de", "danzig"), ("fr", "dantzig"), ("it", "danzica")],
    "WRO": [("de", "breslau"), ("it", "breslavia")],
    "VNO": [("de", "wilna"), ("it", "vilnius")],
    "EDI": [("es", "edimburgo"), ("it", "edimburgo"), ("fr", "edimbourg")],
    "DUB": [("es", "dublin"), ("it", "dublino")],
    "MRS": [("es", "marsella"), ("it", "marsiglia"), ("nl", "marseille")],
    "gem:strasbourg": [("de", "strassburg"), ("nl", "straatsburg"), ("es", "estrasburgo"), ("it", "strasburgo")],
    "LYS": [("es", "lyon"), ("it", "lione")],
    "NUE": [("nl", "neurenberg"), ("de", "nurnberg"), ("es", "nuremberg"), ("it", "norimberga")],
    "DRS": [("es", "dresde"), ("fr", "dresde"), ("it", "dresda")],
    "HAM": [("fr", "hambourg"), ("es", "hamburgo"), ("it", "amburgo")],
    "BER": [("nl", "berlijn"), ("es", "berlin"), ("it", "berlino")],
    "PMO": [("it", "palermo")],
    "BLQ": [("fr", "bologne"), ("it", "bologna")],
    "TLL": [("de", "reval")],
    "ZAG": [("de", "zagreb"), ("it", "zagabria")],
    "BTS": [("de", "pressburg"), ("it", "bratislava")],
    "BUD": [("nl", "boedapest"), ("de", "budapest")],
    "LJU": [("de", "laibach"), ("it", "lubiana")],
    "gem:bolzano": [("de", "bozen")],
    "gem:merano": [("de", "meran")],
    "gem:trento": [("de", "trient")],
    "gem:regensburg": [("en", "ratisbon"), ("it", "ratisbona")],
    "gem:wurzburg": [("en", "wurzburg")],
    "gem:freiburg": [("fr", "fribourg en brisgau")],
    "gem:kotor": [("it", "cattaro")],
    "DBV": [("it", "ragusa di dalmazia")],
    "SPU": [("it", "spalato")],
    "CLJ": [("de", "klausenburg")],
    "gem:brasov": [("de", "kronstadt")],
    "CFU": [("nl", "korfoe"), ("de", "korfu"), ("es", "corfu"), ("it", "corfu")],
    "RHO": [("nl", "rhodos"), ("de", "rhodos"), ("es", "rodas"), ("it", "rodi")],
    "PMI": [("en", "majorca"), ("en", "mallorca"), ("es", "mallorca"), ("it", "maiorca"), ("fr", "majorque")],
    "CAG": [("it", "cagliari")],
    "JTR": [("en", "santorini"), ("it", "santorini")],
    "JMK": [("en", "mykonos"), ("es", "miconos")],
    "BIQ": [("es", "biarritz")],
    "BOD": [("es", "burdeos"), ("it", "bordeaux")],
    "TLS": [("es", "tolosa"), ("it", "tolosa")],
    "gem:avignon": [("it", "avignone"), ("es", "avinon")],
    "gem:cannes": [("en", "cannes")],
    "gem:monaco-mc": [("fr", "monaco"), ("de", "monaco")],
    "GOT": [("nl", "gotenburg"), ("de", "goteborg"), ("en", "goteborg")],
    "MMX": [("en", "malmo")],
    "BGO": [("en", "bergen")],
    "KEF": [("en", "reykjavik")],
    "BFS": [("en", "belfast")],
    "gem:canterbury": [("fr", "cantorbery")],
}

OLLAMA_PROMPT = (
    "You list words travellers type. Language: {lang}. Topic: {label}.\n"
    "Give 15 short everyday words or 2 to 3 word phrases a traveller would type "
    "in a travel search box meaning '{label}', in {lang} only, lower case, no "
    "explanations. Reply as a JSON array of strings."
)


def fold(s: str) -> str:
    import unicodedata
    table = str.maketrans({"ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe",
                           "ß": "ss", "đ": "d", "Đ": "d", "þ": "th", "Þ": "th", "ð": "d", "Ð": "d"})
    x = unicodedata.normalize("NFKD", s.translate(table))
    x = "".join(c for c in x if not unicodedata.combining(c))
    for c in "-'’":
        x = x.replace(c, " ")
    return " ".join(x.lower().split())


def destination_ids(app: Path) -> set[str]:
    data = json.loads((app / "public" / "app_data.json").read_text(encoding="utf-8"))
    d = data["destinations"]
    return set(d.keys()) if isinstance(d, dict) else {r["id"] for r in d}


def guided_ids(app: Path) -> tuple[set[str], set[str]]:
    g = json.loads((app / "public" / "search" / "guided.json").read_text(encoding="utf-8"))
    return {v["id"] for v in g["vibes"]}, {a["id"] for a in g["areas"]}


def build(app: Path) -> dict:
    ids = destination_ids(app)
    vibes, _areas = guided_ids(app)
    rows: list[list[str]] = []
    seen: set[tuple[str, str, str]] = set()

    def add(phrase: str, lang: str, slot: str, value: str) -> None:
        key = (fold(phrase), slot, value)
        if not key[0] or key in seen:
            return
        seen.add(key)
        rows.append([key[0], lang, slot, value])

    for vibe, per_lang in SYNONYMS.items():
        if vibe not in vibes:
            raise SystemExit(f"ask_lexicon: unknown vibe {vibe!r}")
        for lang, phrases in per_lang.items():
            for ph in phrases:
                add(ph, lang, "vibe", vibe)
    for lang, phrases in SORT_COST.items():
        for ph in phrases:
            add(ph, lang, "sort", "cost")
    for extra, per_lang in EXTRAS.items():
        for lang, phrases in per_lang.items():
            for ph in phrases:
                add(ph, lang, "extra", extra)
    dropped = []
    for dest, names in EXONYMS.items():
        if dest not in ids:
            dropped.append(dest)
            continue
        for lang, name in names:
            add(name, lang, "place", dest)
    if dropped:
        print(f"ask_lexicon: {len(dropped)} exonym ids not in the catalogue, skipped: {', '.join(dropped)}", file=sys.stderr)
    rows.sort(key=lambda r: (r[2], r[3], r[1], r[0]))
    return {"version": 1, "about": "T552 reviewed lexicon; see pipeline/ask_lexicon.py", "phrases": rows}


def ollama_candidates(app: Path, model: str, host: str) -> dict:
    g = json.loads((app / "public" / "search" / "guided.json").read_text(encoding="utf-8"))
    out: dict[str, dict[str, list[str]]] = {}
    for v in g["vibes"]:
        for lang in LANGS:
            label = v["label"].get(lang) or v["label"]["en"]
            body = json.dumps({"model": model, "prompt": OLLAMA_PROMPT.format(lang=lang, label=label),
                               "stream": False, "format": "json", "options": {"temperature": 0.3}}).encode()
            req = urllib.request.Request(f"{host}/api/generate", data=body, headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    text = json.loads(r.read())["response"]
                words = json.loads(text)
                if isinstance(words, dict):
                    words = next((x for x in words.values() if isinstance(x, list)), [])
            except Exception as exc:  # a candidate run is best effort
                print(f"ask_lexicon: ollama {v['id']}/{lang}: {exc}", file=sys.stderr)
                words = []
            known = {fold(p) for p in SYNONYMS.get(v["id"], {}).get(lang, [])}
            fresh = sorted({fold(w) for w in words if isinstance(w, str) and 0 < len(w) <= 40} - known)
            out.setdefault(v["id"], {})[lang] = fresh
            print(f"ask_lexicon: {v['id']}/{lang}: {len(fresh)} candidates", file=sys.stderr)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app", type=Path, default=ROOT / "continent-app")
    ap.add_argument("--ollama", action="store_true", help="also ask a local Ollama model for candidates (review only)")
    ap.add_argument("--model", default="qwen3:4b")
    ap.add_argument("--host", default="http://localhost:11434")
    args = ap.parse_args()
    lex = build(args.app)
    out = args.app / "public" / "search" / "ask" / "lexicon.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(lex, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    by_slot: dict[str, int] = {}
    for r in lex["phrases"]:
        by_slot[r[2]] = by_slot.get(r[2], 0) + 1
    print(f"ask_lexicon: {len(lex['phrases'])} phrases {by_slot} -> {out}")
    if args.ollama:
        cand = ollama_candidates(args.app, args.model, args.host)
        path = ROOT / "pipeline" / "ask_lexicon_candidates.json"
        path.write_text(json.dumps(cand, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"ask_lexicon: candidates for review -> {path}")


if __name__ == "__main__":
    main()
