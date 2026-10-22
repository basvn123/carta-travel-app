"""Ask Carta retrieval index (T551, 2026-10): passages, vectors and a tiny model.

Tier: Manual (run by hand after an ingest or a dossier build; about a minute)

Ask Carta is the free search box that replaces the vibe sheet. Retrieval is
hybrid: BM25 in the browser over the passages, and dense vectors scored in a
Cloudflare Pages Function (functions/api/ask.js) that embeds the question with
the same static model this layer ships. The two lists are fused with RRF.
Nothing here calls a paid API, and never the Claude API: the model is an open
static embedding (model2vec, MIT licence) run on this machine's CPU.

What this layer writes, in <public>/search/ask/ (the contract the app and the
Pages Function code against, docs/SCHEMA.md "Ask Carta search wires"):

  manifest.json           {version, model, dims, built, sources:{src:{n,
                          passages, i8, b1}}, model_files:{vocab, emb, scale},
                          bm25:{...}} (bm25 filled in by the node step)
  passages-<src>.json     {source, rows:[[pid, destId|null, text, payload]]}
                          pid "<src>:<id>"; text 1 to 3 sentences, <= 300
                          chars; payload {cc, kind, m, tags, ref:{type, id},
                          name} (lexicon: {slot, value, lang})
  vectors-<src>.i8        n x D int8: each row L2-normalised, x127, rounded
  vectors-<src>.b1        n x D/8 bytes: sign bits, dim i at byte i>>3, bit i&7
  model/vocab.json        the pruned Unigram vocabulary and the normaliser
  model/emb.i8            vocab x D int8, one row per token, x127 / row max
  model/scale.f32         vocab float32 little endian: the row's max abs value
  bm25.json               MiniSearch toJSON(), written by
                          continent-app/scripts/build-ask-bm25.mjs

Sources are adapters in SOURCES below, one function each. Adding a data type
later is one adapter and one line in the registry; nothing else changes.

Model: minishlab/potion-multilingual-128M (distilled from BAAI/bge-m3, 256
dims), chosen by `--bakeoff` against potion-base-8M and potion-retrieval-32M
on GOLDEN (pipeline/guided_search_layer.py) plus the 30 multilingual
questions in MULTI below (Execution/P11/T551-notes.md has the table). The
shipped copy keeps only the tokens the corpus and a six-language travel word
list use, plus every single character of the Latin, Greek and Cyrillic
scripts, so an unknown word still splits into pieces the model knows. The JS
port (functions/_lib/askEmbed.js) reproduces the tokeniser on that pruned
vocabulary; the Python reference in `--fixture` uses the very same pruned and
quantised model, so the two agree to rounding.

No embedding cache: a static model embeds the whole corpus in well under a
minute, so the cache guided_search_layer keeps for gte-small would cost more
to manage than it saves.

Usage, from the repo root:
    python pipeline/ask_index_layer.py                 # build + check
    python pipeline/ask_index_layer.py --public ../wt/x/public
    python pipeline/ask_index_layer.py --check         # recall on GOLDEN + MULTI
    python pipeline/ask_index_layer.py --bakeoff       # compare the three models
    python pipeline/ask_index_layer.py --fixture       # tests/fixtures/askEmbed.fixture.json
"""

import argparse
import base64
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from pipeline_io import atomic_write_json  # noqa: E402
import guided_search_layer as guided  # noqa: E402  (GOLDEN, VIBES, AREAS, in_area, fold)

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PUBLIC = ROOT / "continent-app" / "public"
MODEL = "minishlab/potion-multilingual-128M"
BAKEOFF_MODELS = ("minishlab/potion-base-8M", "minishlab/potion-retrieval-32M", MODEL)
VERSION = 1
MAX_TEXT = 300
NEAR_KM = 25.0
LANGS = guided.LANGS

# ---------------------------------------------------------------------------
# Six-language travel words: kept in the pruned vocabulary whatever the corpus
# says, so a question in any app language tokenises into pieces the model
# knows. Each word is kept lower case, capitalised and upper case.
WORDS = {
    "en": """january february march april may june july august september october november december
        spring summer autumn fall winter weekend week day days night nights month season holiday holidays
        quiet calm peaceful busy crowded lively romantic cheap budget affordable expensive luxury
        beach beaches sea seaside coast coastal sand sandy island islands cove bay swim swimming
        lake lakes lakeside river mountain mountains alps village villages town towns city cities
        old historic medieval castle castles fortress palace church cathedral museum museums art gallery
        food wine wines restaurant restaurants market markets beer cuisine local dinner
        hiking hike walk walking trail trails cycling bike ski skiing snow climbing surf diving sailing
        nature forest park national views view scenic sunset spa thermal wellness nightlife bars clubs party
        family families kids children couple couples friends solo dog car train bus ferry flight airport
        near nearby close far from with without under over around between best warm hot cold sunny rain
        one two three four five six seven eight nine ten euro euros eur price prices hotel hostel camping
        where what when which good great nice beautiful hidden gem gems unesco heritage trip trips travel""",
    "nl": """januari februari maart april mei juni juli augustus september oktober november december
        lente zomer herfst winter weekend week dag dagen nacht nachten maand seizoen vakantie
        rustig rustige kalm druk gezellig romantisch romantische goedkoop goedkope duur luxe
        strand stranden zee kust zand eiland eilanden baai zwemmen meer meren rivier berg bergen
        dorp dorpen stad steden oude oud historisch historische middeleeuws middeleeuwse kasteel kastelen
        paleis kerk kathedraal museum musea kunst eten wijn restaurant markt bier keuken
        wandelen wandeling wandelroute fietsen skiën sneeuw klimmen surfen duiken zeilen
        natuur bos park nationaal uitzicht uitzichten zonsondergang kuuroord thermen uitgaan feest
        gezin gezinnen kinderen stel vrienden alleen hond auto trein bus veerboot vlucht vliegveld
        dichtbij buurt bij ver van met zonder onder boven rond tussen beste warm warme koud zonnig regen
        een twee drie vier vijf zes zeven acht negen tien prijs hotel camping waar wat wanneer welke
        mooi mooie mooiste verborgen pareltje werelderfgoed reis reizen""",
    "de": """januar februar märz april mai juni juli august september oktober november dezember
        frühling sommer herbst winter wochenende woche tag tage nacht nächte monat saison urlaub ferien
        ruhig ruhige still belebt romantisch romantische günstig billig teuer luxus
        strand strände meer küste sand insel inseln bucht baden schwimmen see seen fluss berg berge
        dorf dörfer stadt städte alt alte altstadt historisch mittelalterlich burg burgen schloss schlösser
        festung palast kirche dom museum museen kunst essen wein restaurant markt bier küche
        wandern wanderung wanderweg radfahren fahrrad skifahren schnee klettern surfen tauchen segeln
        natur wald park nationalpark aussicht blick sonnenuntergang therme thermalbad kurort nachtleben
        familie familien kinder paar freunde allein hund auto zug bus fähre flug flughafen
        nahe nähe bei weit von mit ohne unter über um zwischen beste warm heiß kalt sonnig regen
        eins zwei drei vier fünf sechs sieben acht neun zehn preis hotel jugendherberge camping
        wo was wann welche schön schöne versteckt geheimtipp welterbe reise reisen""",
    "fr": """janvier février mars avril mai juin juillet août septembre octobre novembre décembre
        printemps été automne hiver week-end semaine jour jours nuit nuits mois saison vacances
        calme tranquille animé romantique pas cher bon marché cher luxe
        plage plages mer côte sable île îles crique baie baignade nager lac lacs rivière montagne montagnes
        village villages ville villes vieille vieux historique médiéval médiévale château châteaux
        forteresse palais église cathédrale musée musées art cuisine vin vins restaurant marché bière
        randonnée marche sentier vélo ski neige escalade surf plongée voile
        nature forêt parc national vue vues panorama coucher soleil thermes spa vie nocturne fête
        famille familles enfants couple amis seul chien voiture train bus ferry vol aéroport
        près proche loin de avec sans sous plus autour entre meilleur chaud froid ensoleillé pluie
        un deux trois quatre cinq six sept huit neuf dix prix hôtel auberge camping
        où quoi quand quel beau belle caché patrimoine mondial voyage voyages""",
    "es": """enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre
        primavera verano otoño invierno fin semana día días noche noches mes temporada vacaciones
        tranquilo tranquila tranquilos animado romántico romántica barato barata caro lujo
        playa playas mar costa arena isla islas cala bahía nadar baño lago lagos río montaña montañas
        pueblo pueblos ciudad ciudades viejo antiguo casco histórico medieval castillo castillos
        fortaleza palacio iglesia catedral museo museos arte comida vino vinos restaurante mercado cerveza
        senderismo caminar ruta sendero bicicleta esquí nieve escalada surf buceo vela
        naturaleza bosque parque nacional vistas atardecer balneario termas vida nocturna fiesta
        familia familias niños pareja amigos solo perro coche tren autobús ferri vuelo aeropuerto
        cerca lejos de con sin bajo sobre alrededor entre mejor cálido calor frío soleado lluvia
        uno dos tres cuatro cinco seis siete ocho nueve diez precio hotel albergue camping
        dónde qué cuándo cuál bonito bonita escondido patrimonio mundial viaje viajes""",
    "it": """gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre
        primavera estate autunno inverno fine settimana giorno giorni notte notti mese stagione vacanza vacanze
        tranquillo tranquilla calmo animato romantico romantica economico economica caro lusso
        spiaggia spiagge mare costa sabbia isola isole caletta baia nuotare lago laghi fiume montagna montagne
        paese borgo borghi città vecchio antico centro storico medievale castello castelli
        fortezza palazzo chiesa cattedrale museo musei arte cibo vino vini ristorante mercato birra cucina
        escursioni escursione camminare sentiero bicicletta sci neve arrampicata surf immersioni vela
        natura bosco parco nazionale vista panorama tramonto terme benessere vita notturna festa
        famiglia famiglie bambini coppia amici solo cane auto treno autobus traghetto volo aeroporto
        vicino lontano da con senza sotto sopra intorno tra migliore caldo freddo soleggiato pioggia
        uno due tre quattro cinque sei sette otto nove dieci prezzo albergo ostello campeggio
        dove cosa quando quale bello bella nascosto patrimonio mondiale viaggio viaggi""",
}

# ---------------------------------------------------------------------------
# Thirty multilingual questions for the bake-off, five per app language,
# written before any model was run (2026-10-22). Filters stand in for the
# slots the intent parser fills (country, area); the dense model is judged on
# the words that are left. Expected places as in GOLDEN: what a traveller who
# knows the country would expect in the top ten.
MULTI = [
    ("nl", "rustig dorp aan een meer", dict(country="AT"), ["Hallstatt", "St. Wolfgang im Salzkammergut", "Zell am See", "Bregenz"]),
    ("nl", "eilanden met mooie stranden", dict(country="GR"), ["Santorini", "Naxos", "Paros", "Mykonos", "Milos"]),
    ("nl", "middeleeuwse oude binnenstad", dict(country="CZ"), ["Český Krumlov", "Prague", "Telč", "Kutná Hora"]),
    ("nl", "wijn en goed eten", dict(area="tuscany"), ["Florence", "Siena", "Lucca", "Montepulciano"]),
    ("nl", "kuuroord met thermale baden", dict(), ["Budapest", "Baden-Baden", "Karlovy Vary", "Bath"]),
    ("de", "Bergdorf mit Seilbahnen und hohen Gipfeln", dict(country="CH"), ["Zermatt", "Grindelwald", "Wengen", "Mürren", "St. Moritz"]),
    ("de", "Burgen und Schlösser", dict(country="DE"), ["Füssen", "Heidelberg", "Cochem", "Schwangau"]),
    ("de", "Strandurlaub am Meer", dict(country="PT"), ["Lagos", "Albufeira", "Tavira", "Carvoeiro"]),
    ("de", "Wandern in den Bergen", dict(area="dolomites"), ["Cortina d'Ampezzo", "Ortisei", "Canazei", "Selva di Val Gardena"]),
    ("de", "Altstadt am Meer mit Stadtmauern", dict(country="HR"), ["Dubrovnik", "Split", "Rovinj", "Trogir", "Korčula"]),
    ("fr", "village au bord d'un lac", dict(country="IT"), ["Bellagio", "Varenna", "Como", "Sirmione", "Stresa", "Riva del Garda"]),
    ("fr", "vie nocturne et fête", dict(country="ES"), ["Ibiza", "Barcelona", "Madrid", "Valencia"]),
    ("fr", "musées et galeries d'art", dict(country="NL"), ["Amsterdam", "The Hague", "Rotterdam"]),
    ("fr", "ville romantique pour un week-end en amoureux", dict(country="FR"), ["Annecy", "Colmar", "Paris", "Saint-Paul-de-Vence"]),
    ("fr", "fjords et paysages spectaculaires", dict(country="NO"), ["Flåm", "Geiranger", "Bergen", "Ålesund"]),
    ("es", "pueblo de montaña para hacer senderismo", dict(area="pyrenees"), ["Torla", "Benasque", "Cauterets", "Gavarnie"]),
    ("es", "comida y vino", dict(country="IT"), ["Bologna", "Parma", "Modena", "Florence", "Naples"]),
    ("es", "islas con calas y ferris", dict(country="HR"), ["Hvar", "Korčula", "Vis", "Brač"]),
    ("es", "playas de arena", dict(area="sardinia"), ["Alghero", "Villasimius", "Cala Gonone", "Olbia"]),
    ("es", "senderismo en las montañas", dict(area="highlands"), ["Fort William", "Aviemore", "Glencoe"]),
    ("it", "paese tranquillo sul lago", dict(country="IT"), ["Bellagio", "Varenna", "Stresa", "Sirmione", "Riva del Garda"]),
    ("it", "centro storico medievale", dict(country="HR"), ["Dubrovnik", "Split", "Rovinj", "Trogir", "Korčula"]),
    ("it", "terme e benessere", dict(), ["Budapest", "Baden-Baden", "Karlovy Vary", "Bath"]),
    ("it", "isole con spiagge", dict(country="GR"), ["Santorini", "Naxos", "Paros", "Mykonos", "Milos", "Corfu"]),
    ("it", "paese di montagna con funivie", dict(country="CH"), ["Zermatt", "Grindelwald", "Wengen", "Mürren", "St. Moritz"]),
    ("en", "where can I swim in a mountain lake", dict(country="AT"), ["Hallstatt", "Zell am See", "St. Wolfgang im Salzkammergut", "Bregenz"]),
    ("en", "cobbled streets and a castle on the hill", dict(country="CZ"), ["Český Krumlov", "Prague", "Telč", "Kutná Hora"]),
    ("en", "surf and sunshine on the Atlantic", dict(country="PT"), ["Lagos", "Ericeira", "Peniche", "Nazaré"]),
    ("en", "fairytale castle", dict(area="bavaria"), ["Füssen", "Schwangau", "Bamberg", "Rothenburg ob der Tauber"]),
    ("en", "canals and museums", dict(country="NL"), ["Amsterdam", "Utrecht", "Leiden", "Delft"]),
]


# ---------------------------------------------------------------------------
# Small helpers
def jload(p):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 - a missing or broken file is skipped by the caller
        return None


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


_SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9À-ɏͰ-ϿЀ-ӿ\"'(])")


def sentences(s):
    s = " ".join(str(s or "").split())
    return [x.strip() for x in _SENT.split(s) if x.strip()] if s else []


def clip(parts, cap=MAX_TEXT, max_sent=3):
    """Join whole sentences, at most `max_sent`, up to `cap` chars. A first
    sentence longer than the cap is cut on a word and closed with a full stop,
    so every text is 1 to 3 sentences and never longer than the cap."""
    out = []
    for p in parts:
        for s in sentences(p):
            if not s.endswith((".", "!", "?")):
                s += "."
            if len(out) >= max_sent:
                break
            cand = " ".join(out + [s])
            if len(cand) <= cap:
                out.append(s)
            elif not out:
                cut = s[: cap - 1].rsplit(" ", 1)[0].rstrip(",;:- ")
                out.append(cut + ".")
                break
            else:
                break
    return " ".join(out)[:cap]


_DASH = "[\u2014\u2013]"


def strip_dashes(s):
    """continent-app/src/lib/format.js stripDashes, in Python: the house style
    has no em or en dashes, and passage text is shown to the traveller."""
    s = re.sub(r"(\d)\s*" + _DASH + r"\s*([\u20ac$\u00a3]\s?\d)", r"\1 to \2", s)
    s = re.sub(r"(\d)\s*" + _DASH + r"\s*(\d)", r"\1-\2", s)
    s = re.sub(r"(\w)" + _DASH + r"(\w)", r"\1-\2", s)
    return re.sub(r"\s*" + _DASH + r"\s*", ", ", s)


def slug(s):
    s = guided.fold(s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60] or "x"


def nice_list(xs):
    xs = [x for x in xs if x]
    if len(xs) <= 1:
        return "".join(xs)
    return ", ".join(xs[:-1]) + " and " + xs[-1]


CAT_WORDS = {"national-park": "national parks", "unesco": "World Heritage"}


def months_range(frm, to):
    names = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    try:
        a, b = names.index(frm) + 1, names.index(to) + 1
    except ValueError:
        return []
    return list(range(a, b + 1)) if a <= b else list(range(a, 13)) + list(range(1, b + 1))


# ---------------------------------------------------------------------------
# Corpus context: everything the adapters read, loaded once.
class Ctx:
    def __init__(self, public):
        self.public = Path(public)
        data = jload(self.public / "app_data.json") or {}
        dests = data.get("destinations") or {}
        if isinstance(dests, list):
            dests = {d["id"]: d for d in dests}
        self.dests = dests
        self.cc_name = {}
        self.by_cc = {}
        for did, d in dests.items():
            cc = d.get("iso2")
            if cc:
                self.cc_name.setdefault(cc, d.get("country") or cc)
                lat, lon = num(d.get("lat")), num(d.get("lon"))
                if lat is not None and lon is not None:
                    self.by_cc.setdefault(cc, []).append((lat, lon, did))
        self._dossier = {}

    def dossier(self, did):
        if did not in self._dossier:
            self._dossier[did] = jload(self.public / "dossier" / f"{dossier_base(did)}.json") or {}
        return self._dossier[did]

    def best(self, did):
        d = self.dests.get(did) or {}
        return list(((d.get("climate") or {}).get("best")) or [])

    def nearest(self, cc, lat, lon, within=NEAR_KM):
        if lat is None or lon is None:
            return None
        best, bd = None, within
        for (plat, plon, did) in self.by_cc.get(cc, []):
            if abs(plat - lat) > 0.4 or abs(plon - lon) > 0.6:
                continue
            k = guided.km(lat, lon, plat, plon)
            if k <= bd:
                best, bd = did, k
        return best

    def layer_rows(self, folder, key):
        for f in sorted((self.public / folder).glob("*.json")):
            j = jload(f)
            if not j:
                print(f"  skipped unreadable {folder}/{f.name}")
                continue
            for r in j.get(key) or []:
                yield f.stem, r


# Windows reserved names (src/lib/dossier.js dossierFileBase mirrors this).
RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


def dossier_base(did):
    if did.startswith("gem:"):
        return "gem-" + did[4:]
    code = did.upper()
    return code + "_" if code in RESERVED else code


def row(src, rid, dest_id, text, *, cc, kind, m=None, tags=None, ref, name, embed=None):
    """One passage: [pid, destId, text, payload] plus the text the model
    embeds (name and tags in front of the shown text)."""
    tags = sorted({str(t) for t in (tags or []) if t})
    text, name = strip_dashes(text), strip_dashes(name)
    payload = {"cc": cc, "kind": kind, "m": sorted({int(x) for x in (m or []) if x}),
               "tags": tags, "ref": ref, "name": name}
    if embed is None:
        embed = f"{name}. {text} {' '.join(t.replace('-', ' ') for t in tags)}".strip()
    return [f"{src}:{rid}", dest_id, text, payload], embed


# ---------------------------------------------------------------------------
# Source adapters. Each yields (passage row, embed text). One per data type.
def src_dest(ctx):
    for did, d in sorted(ctx.dests.items()):
        city, country = d.get("city") or did, d.get("country") or ""
        cats = list(d.get("categories") or []) + list(d.get("tags") or [])
        intro = (ctx.dossier(did).get("intro") or {})
        lead = d.get("blurb") or intro.get("short") or ""
        known = f"Known for {nice_list([CAT_WORDS.get(c, c.replace('-', ' ')) for c in cats[:6]])}." if cats else ""
        guide = ((d.get("guide") or {}).get("text") or "")
        first = f"{city}, {country}."
        text = clip([first, lead, known, guide])
        kind = ((d.get("place") or {}).get("class")) or "dest"
        embed = f"{city}, {country}. {lead} {known} {' '.join(sentences(guide)[:2])}"[:900]
        yield row("dest", did, did, text, cc=d.get("iso2"), kind=kind, m=ctx.best(did), tags=cats,
                  ref={"type": "dest", "id": did}, name=city, embed=embed)


def src_highlight(ctx, per_dest=8):
    for did, d in sorted(ctx.dests.items()):
        city = d.get("city") or did
        n = 0
        for h in ctx.dossier(did).get("highlights") or []:
            name, fact = h.get("name"), h.get("fact")
            if not name or not fact or n >= per_dest:
                continue
            n += 1
            kind = h.get("kind") or "highlight"
            text = clip([f"{name}, {city}.", fact])
            tags = [kind.lower()] + (["heritage"] if h.get("heritage") else [])
            yield row("highlight", f"{did}/{h.get('id') or slug(name)}", did, text, cc=d.get("iso2"),
                      kind=kind, m=ctx.best(did), tags=tags, ref={"type": "dest", "id": did}, name=name)


def src_sight(ctx):
    for did, d in sorted(ctx.dests.items()):
        city, country = d.get("city") or did, d.get("country") or ""
        held = {guided.fold(h.get("name") or "") for h in ctx.dossier(did).get("highlights") or [] if h.get("fact")}
        seen = set()
        for it in ((d.get("activities") or {}).get("items") or []):
            name = it.get("name")
            if not name:
                continue
            key = guided.fold(name)
            if key in held or key in seen or key == guided.fold(city):
                continue
            seen.add(key)
            kind = it.get("kind") or "Sight"
            text = clip([f"{name}, a {kind.lower()} in {city}, {country}."])
            yield row("sight", f"{did}/{slug(name)}", did, text, cc=d.get("iso2"), kind=kind,
                      m=ctx.best(did), tags=[kind.lower()], ref={"type": "dest", "id": did}, name=name)


def src_trail(ctx):
    for cc, r in ctx.layer_rows("trails", "trips"):
        name = r.get("name")
        if not name or r.get("id") is None:
            continue
        bbox = r.get("bbox") or []
        lat = (bbox[1] + bbox[3]) / 2 if len(bbox) == 4 else None
        lon = (bbox[0] + bbox[2]) / 2 if len(bbox) == 4 else None
        dist = num(r.get("distance_m"))
        asc = num(r.get("ascent_m"))
        facts = []
        if dist:
            facts.append(f"{dist / 1000:.0f} km")
        if r.get("difficulty"):
            facts.append(str(r["difficulty"]))
        if asc:
            facts.append(f"{asc:.0f} m of ascent")
        if str(r.get("is_loop")).lower() == "true":
            facts.append("a loop")
        f = r.get("f") or {}
        tags = [r.get("category"), r.get("difficulty")] + list(f.get("hl") or [])
        if str(r.get("is_loop")).lower() == "true":
            tags.append("loop")
        text = clip([r.get("summary") or f"{name}.", (", ".join(facts) + ".").capitalize() if facts else ""])
        did = ctx.nearest(cc, lat, lon)
        yield row("trail", str(r["id"]), did, text, cc=cc, kind=r.get("category") or "trail",
                  m=ctx.best(did) if did else [], tags=tags, ref={"type": "trail", "id": str(r["id"])}, name=name)


def src_journey(ctx):
    d = ctx.public / "journeys" / "journey"
    for f in sorted(d.glob("*.json")):
        j = jload(f)
        if not j or not j.get("title"):
            continue
        co = j.get("coordinates") or {}
        cc = j.get("countryCode")
        did = ctx.nearest(cc, num(co.get("lat")), num(co.get("lon")), within=40.0)
        m = ((j.get("bestPeriod") or {}).get("months")) or []
        days = j.get("durationDays")
        lead = f"{j['title']}." + (f" {days} days in {j.get('subRegion') or j.get('country')}." if days else "")
        text = clip([lead, j.get("summary") or ""])
        tags = list(j.get("tags") or []) + [j.get("tripTypeSlug")]
        sid = j.get("slug") or j.get("id") or f.stem
        yield row("journey", sid, did, text, cc=cc, kind=j.get("tripTypeSlug") or "journey", m=m, tags=tags,
                  ref={"type": "journey", "id": sid}, name=j["title"])


def place(region, country):
    """"Region, Country", or the country alone when the region is missing or
    is the country itself."""
    if not region or guided.fold(region) == guided.fold(country):
        return country
    return f"{region}, {country}"


def _base_dest(ctx, r, cc):
    base = (r.get("base") or {}).get("id") or (r.get("near") or {}).get("dest_id")
    if base in ctx.dests:
        return base
    return ctx.nearest(cc, num(r.get("lat")), num(r.get("lon")))


def src_beach(ctx):
    for cc, r in ctx.layer_rows("beaches", "beaches"):
        name = r.get("name")
        if not name or not r.get("id"):
            continue
        cc = r.get("cc") or cc
        did = _base_dest(ctx, r, cc)
        surface, size = r.get("surface"), r.get("size")
        size = {"strand": "long", "cove": "cove", "beach": None}.get(size, size)
        what = " ".join(x for x in (size, surface) if x and x != "cove") + (" cove" if size == "cove" else "")
        what = what.strip()
        where = place(r.get("region"), ctx.cc_name.get(cc, cc))
        near = (r.get("base") or {}).get("city")
        text = clip([f"{name}, a {what + ' ' if what else ''}{'' if size == 'cove' else 'beach '}in {where}.",
                     f"About {float(r['base']['km']):.0f} km from {near}." if near and (r.get('base') or {}).get('km') is not None else "",
                     f"Best for {nice_list([str(b) for b in r.get('bestFor') or []])}." if r.get("bestFor") else ""])
        tags = list(r.get("tags") or []) + list(r.get("bestFor") or []) + [surface]
        yield row("beach", r["id"], did, text, cc=cc, kind="beach", m=ctx.best(did) if did else [6, 7, 8, 9],
                  tags=tags, ref={"type": "beach", "id": r["id"]}, name=name)


def src_lake(ctx):
    for cc, r in ctx.layer_rows("lakes", "lakes"):
        name = r.get("name")
        if not name or not r.get("id"):
            continue
        cc = r.get("cc") or cc
        did = _base_dest(ctx, r, cc)
        swim = r.get("swim") or {}
        season = swim.get("season") or {}
        m = months_range(season.get("from"), season.get("to")) if season else []
        where = place(r.get("region"), ctx.cc_name.get(cc, cc))
        swim_s = {"yes": "Swimming is allowed.", "no": "No swimming."}.get(swim.get("rule"), "")
        text = clip([f"{name}, a {r.get('kind') or 'lake'} in {where}.", swim_s,
                     f"Best for {nice_list([str(b) for b in r.get('bestFor') or []])}." if r.get("bestFor") else ""])
        tags = list(r.get("tags") or []) + list(r.get("bestFor") or [])
        yield row("lake", r["id"], did, text, cc=cc, kind=r.get("kind") or "lake", m=m, tags=tags,
                  ref={"type": "lake", "id": r["id"]}, name=name)


def src_peak(ctx):
    for cc, r in ctx.layer_rows("mountains", "mountains"):
        name = r.get("name")
        if not name or not r.get("id"):
            continue
        cc = r.get("cc") or cc
        did = _base_dest(ctx, r, cc)
        ele = num(r.get("ele"))
        rng = r.get("range")
        near = (r.get("near") or {}).get("city")
        lift = (r.get("lift") or {}).get("name")
        text = clip([f"{name}{f' ({ele:.0f} m)' if ele else ''}, a {r.get('kind') or 'peak'}"
                     f"{f' in the {rng}' if rng else ''}, {ctx.cc_name.get(cc, cc)}.",
                     f"Near {near}." if near else "", f"Lift: {lift}." if lift else ""])
        tags = list(r.get("tags") or []) + list(r.get("bestFor") or [])
        m = ((r.get("season") or {}).get("months")) or []
        yield row("peak", r["id"], did, text, cc=cc, kind=r.get("kind") or "peak", m=m, tags=tags,
                  ref={"type": "peak", "id": r["id"]}, name=name)


def src_country(ctx):
    ci = (jload(ctx.public / "country_insights.json") or {}).get("countries") or {}
    for name, c in sorted(ci.items()):
        cc = c.get("iso2")
        if not cc:
            continue
        lo_hi = c.get("daily_budget_eur") or []
        budget = f"A day costs about {lo_hi[0]} to {lo_hi[1]} euros." if len(lo_hi) == 2 else ""
        text = clip([f"{name}.", c.get("best_time_note") or "", budget])
        tags = list(c.get("languages") or []) + [c.get("budget_level"), c.get("currency")]
        yield row("country", cc, None, text, cc=cc, kind="country", m=c.get("best_months") or [], tags=tags,
                  ref={"type": "country", "id": cc}, name=name)


def src_lexicon(ctx):
    lex = jload(ctx.public / "search" / "ask" / "lexicon.json")
    if not lex:
        return
    for i, p in enumerate(lex.get("phrases") or []):
        if not isinstance(p, (list, tuple)) or len(p) < 4 or not p[0]:
            continue
        phrase, lang, slot, value = p[:4]
        r = [f"lexicon:{i}", None, strip_dashes(str(phrase))[:MAX_TEXT], {"slot": slot, "value": value, "lang": lang}]
        yield r, str(phrase)


SOURCES = {
    "dest": src_dest,
    "highlight": src_highlight,
    "sight": src_sight,
    "trail": src_trail,
    "journey": src_journey,
    "beach": src_beach,
    "lake": src_lake,
    "peak": src_peak,
    "country": src_country,
    "lexicon": src_lexicon,
}


def collect(ctx, only=None):
    out = {}
    for src, fn in SOURCES.items():
        if only and src not in only:
            continue
        t0 = time.time()
        rows, embeds, seen = [], [], set()
        for r, e in fn(ctx):
            if r[0] in seen:
                continue
            seen.add(r[0])
            rows.append(r)
            embeds.append(e)
        if rows:
            out[src] = (rows, embeds)
            print(f"  {src:9} {len(rows):6} passages ({time.time() - t0:.1f} s)")
        else:
            print(f"  {src:9}      0 passages, skipped")
    return out


# ---------------------------------------------------------------------------
# The model: prune, quantise, and rebuild a Python reference from the shipped
# files, so Python and the JS port read the very same numbers.
def word_list():
    out = []
    for words in WORDS.values():
        for w in words.split():
            out += [w, w.capitalize(), w.upper()]
    return out


def keep_char(ch):
    o = ord(ch)
    return (o < 0x0250 or 0x0370 <= o < 0x0530 or 0x1E00 <= o < 0x2000
            or 0x2000 <= o < 0x2070 or 0x20A0 <= o < 0x20C0)


def flat_normalizers(n):
    if not n:
        return
    if n["type"] == "Sequence":
        for x in n["normalizers"]:
            yield from flat_normalizers(x)
    else:
        yield n


def prune_model(full, texts, names=()):
    """The shipped model: vocab subset + int8 rows with a per-row scale.
    Returns (vocab_json, emb_i8, scale_f32, reference StaticModel)."""
    import numpy as np
    from model2vec import StaticModel
    from tokenizers import Tokenizer

    tj = json.loads(full.tokenizer.to_str())
    assert tj["model"]["type"] == "Unigram", "the JS port implements the Unigram tokeniser only"
    vocab = tj["model"]["vocab"]
    keep = {0, 1, tj["model"].get("unk_id", 1)}
    t0 = time.time()
    for batch_start in range(0, len(texts), 4096):
        batch = texts[batch_start:batch_start + 4096]
        for enc in full.tokenizer.encode_batch_fast(batch, add_special_tokens=False):
            keep.update(enc.ids)
    # Lower case only for names a traveller types (places, countries): the
    # lower-case forms of every sight and trail name cost 3 MB and a word
    # missing from the vocabulary still splits into kept pieces.
    for enc in full.tokenizer.encode_batch_fast(word_list() + [n.lower() for n in names],
                                                add_special_tokens=False):
        keep.update(enc.ids)
    n_corpus = len(keep)
    for i, (piece, _score) in enumerate(vocab):
        p = piece[1:] if piece.startswith("▁") else piece
        if len(p) <= 1 and all(keep_char(c) for c in p):
            keep.add(i)
    ids = sorted(keep)
    print(f"  vocabulary: {len(ids)} of {len(vocab)} tokens kept ({n_corpus} from the corpus and word list, "
          f"{len(ids) - n_corpus} single characters) in {time.time() - t0:.0f} s")
    remap = {old: new for new, old in enumerate(ids)}
    new_vocab = [vocab[i] for i in ids]
    tj["model"]["vocab"] = new_vocab
    tj["model"]["unk_id"] = remap[tj["model"].get("unk_id", 1)]
    for a in tj.get("added_tokens") or []:
        a["id"] = remap[a["id"]]
    tok = Tokenizer.from_str(json.dumps(tj))

    E = np.asarray(full.embedding, dtype=np.float32)[ids]
    scale = np.abs(E).max(axis=1)
    scale[scale == 0] = 1.0
    q = np.clip(np.rint(E / scale[:, None] * 127), -127, 127).astype(np.int8)
    deq = (q.astype(np.float32) / 127.0) * scale[:, None]
    ref = StaticModel(vectors=deq, tokenizer=tok, normalize=True, base_model_name=MODEL)

    steps = []
    for n in flat_normalizers(tj.get("normalizer")):
        if n["type"] == "Precompiled":
            steps.append(["nfkc"])
        elif n["type"] == "Replace":
            pat = n["pattern"]
            steps.append(["regex", pat["Regex"], n["content"]] if "Regex" in pat else ["string", pat["String"], n["content"]])
        elif n["type"] == "Strip":
            steps.append(["strip"])
        else:
            raise SystemExit(f"normaliser {n['type']} has no JS port")
    pre = tj.get("pre_tokenizer") or {}
    vocab_json = {
        "version": 1,
        "type": "unigram",
        "model": MODEL,
        "dims": int(E.shape[1]),
        "unk_id": tj["model"]["unk_id"],
        "normalizer": steps,
        "metaspace": {"replacement": pre.get("replacement", "▁"), "prepend": pre.get("prepend_scheme", "always")},
        "max_tokens": 512,
        "pieces": [p for p, _ in new_vocab],
        "scores": [round(s, 6) for _, s in new_vocab],
    }
    # Scores are rounded for size; the reference tokenizer uses the rounded
    # scores too, so Viterbi ties break the same way in both.
    tj["model"]["vocab"] = [[p, s] for p, s in zip(vocab_json["pieces"], vocab_json["scores"])]
    ref = StaticModel(vectors=deq, tokenizer=Tokenizer.from_str(json.dumps(tj)), normalize=True, base_model_name=MODEL)
    return vocab_json, q, scale.astype("<f4"), ref


def load_reference(out_dir):
    """The shipped model rebuilt from its files (for --check and --fixture)."""
    import numpy as np
    from model2vec import StaticModel
    from tokenizers import Tokenizer
    from huggingface_hub import hf_hub_download

    v = json.loads((out_dir / "model" / "vocab.json").read_text(encoding="utf-8"))
    tj = json.loads(Path(hf_hub_download(v["model"], "tokenizer.json")).read_text(encoding="utf-8"))
    old = {p: i for i, (p, _s) in enumerate(tj["model"]["vocab"])}
    unk_piece = tj["model"]["vocab"][tj["model"].get("unk_id", 1)][0]
    tj["model"]["vocab"] = [[p, s] for p, s in zip(v["pieces"], v["scores"])]
    tj["model"]["unk_id"] = v["unk_id"]
    newpos = {p: i for i, p in enumerate(v["pieces"])}
    for a in tj.get("added_tokens") or []:
        a["id"] = newpos.get(a["content"], a["id"])
    assert v["pieces"][v["unk_id"]] == unk_piece and old  # sanity
    D = v["dims"]
    q = np.fromfile(out_dir / "model" / "emb.i8", dtype=np.int8).reshape(-1, D)
    scale = np.fromfile(out_dir / "model" / "scale.f32", dtype="<f4")
    deq = (q.astype(np.float32) / 127.0) * scale[:, None]
    return StaticModel(vectors=deq, tokenizer=Tokenizer.from_str(json.dumps(tj)), normalize=True, base_model_name=v["model"])


def quantise_rows(V):
    import numpy as np
    V = np.asarray(V, dtype=np.float32)
    n = np.linalg.norm(V, axis=1, keepdims=True)
    n[n == 0] = 1.0
    V = V / n
    i8 = np.clip(np.rint(V * 127), -127, 127).astype(np.int8)
    b1 = np.packbits(V > 0, axis=1, bitorder="little")
    return i8, b1


def two_stage(qv, i8, b1, k1=500, k=50, rows=None):
    """Python mirror of functions/_lib/askScore.js search(): Hamming on the
    sign bits picks k1 candidates (ties by row order), int8 dot ranks them."""
    import numpy as np
    qb = np.packbits(qv > 0, bitorder="little")
    idx = np.arange(len(i8)) if rows is None else np.asarray(rows)
    if len(idx) == 0:
        return []
    x = np.bitwise_xor(b1[idx], qb[None, :])
    ham = np.unpackbits(x, axis=1).sum(axis=1)
    order = np.lexsort((idx, ham))[:k1]
    cand = idx[order]
    dots = i8[cand].astype(np.float64) @ qv.astype(np.float64) / 127.0
    o = np.lexsort((cand, -dots))[:k]
    return [(int(cand[j]), float(dots[j])) for j in o]


# ---------------------------------------------------------------------------
# Evaluation: recall@10 on GOLDEN and MULTI, dense only, over dest passages.
def golden_queries(ctx):
    qs = []
    for q, expected in guided.GOLDEN:
        v = guided.VIBES[q["vibe"]]
        where = ""
        if q.get("country"):
            where = " in " + ctx.cc_name.get(q["country"], q["country"])
        elif q.get("area"):
            where = " in the " + guided.AREAS[q["area"]]["label"]["en"]
        qs.append(("en", v["label"]["en"].lower() + where, q, expected, "golden"))
    for lang, text, f, expected in MULTI:
        qs.append((lang, text, f, expected, "multi"))
    return qs


def dest_filter(ctx, did, f):
    d = ctx.dests.get(did) or {}
    if f.get("country") and d.get("iso2") != f["country"]:
        return False
    if f.get("area"):
        a = guided.AREAS[f["area"]]
        lat, lon = num(d.get("lat")), num(d.get("lon"))
        if lat is None or not guided.in_area(lon, lat, a, d.get("iso2")):
            return False
    return True


def recall(ctx, dest_ids, ranker, queries):
    """ranker(query_text, allowed_row_indices) -> ranked row indices."""
    held = {guided.fold(d.get("city") or "") for d in ctx.dests.values()}
    per = {"golden": [0, 0], "multi": [0, 0]}
    lines = []
    for lang, text, f, expected, kind in queries:
        allowed = [i for i, did in enumerate(dest_ids) if dest_filter(ctx, did, f)]
        exp = [e for e in expected if any(guided.fold(e) in k or k.startswith(guided.fold(e)) for k in held)]
        ranked = ranker(text, allowed)
        names, seen = [], set()
        for i in ranked:
            c = (ctx.dests[dest_ids[i]].get("city") or "").split(" (")[0]
            if c in seen:
                continue
            seen.add(c)
            names.append(c)
            if len(names) == 10:
                break
        topf = [guided.fold(t) for t in names]
        hit = [e for e in exp if any(guided.fold(e) in t for t in topf)]
        per[kind][0] += len(hit)
        per[kind][1] += len(exp)
        lines.append(f"  [{lang}] {text[:44]:44} {len(hit)}/{len(exp)}  top: {', '.join(names[:5])}")
    return per, lines


def bakeoff(ctx):
    import numpy as np
    from model2vec import StaticModel

    rows = list(src_dest(ctx))
    dest_ids = [r[0][1] for r in rows]
    embeds = [e for _r, e in rows]
    queries = golden_queries(ctx)
    table = []
    for name in BAKEOFF_MODELS:
        t0 = time.time()
        m = StaticModel.from_pretrained(name)
        t_load = time.time() - t0
        t0 = time.time()
        M = m.encode(embeds, batch_size=1024)
        t_enc = time.time() - t0
        M = M / (np.linalg.norm(M, axis=1, keepdims=True) + 1e-12)

        def ranker(text, allowed, m=m, M=M):
            qv = m.encode([text])[0]
            s = M[allowed] @ qv
            return [allowed[j] for j in np.argsort(-s)]

        per, lines = recall(ctx, dest_ids, ranker, queries)
        print(f"\n{name}: vocab {m.embedding.shape[0]}, dims {m.embedding.shape[1]}, load {t_load:.1f} s, "
              f"{len(embeds)} dest passages in {t_enc:.1f} s")
        for ln in lines:
            print(ln)
        g, mu = per["golden"], per["multi"]
        table.append((name, m.embedding.shape[1], g, mu, t_enc))
    print("\nmodel                                dims  GOLDEN recall@10   MULTI recall@10   all")
    for name, dims, g, mu, t in table:
        a = (g[0] + mu[0], g[1] + mu[1])
        print(f"  {name:36} {dims:4}  {g[0]:3}/{g[1]:3} = {g[0] / g[1]:.3f}   {mu[0]:3}/{mu[1]:3} = {mu[0] / mu[1]:.3f}   "
              f"{a[0] / a[1]:.3f}   (encode {t:.1f} s)")
    return table


# ---------------------------------------------------------------------------
def write_bin(path, arr):
    tmp = Path(str(path) + ".tmp")
    arr.tofile(tmp)
    tmp.replace(path)


def build(ctx, out_dir):
    from model2vec import StaticModel

    t_all = time.time()
    print(f"ask index: {len(ctx.dests)} destinations from {ctx.public}")
    corpus = collect(ctx)
    t0 = time.time()
    full = StaticModel.from_pretrained(MODEL)
    print(f"  model {MODEL} loaded in {time.time() - t0:.0f} s")
    texts = [e for (_rows, embeds) in corpus.values() for e in embeds]
    names = [r[3]["name"] for src in ("dest", "country") for r in corpus.get(src, ([], []))[0]]
    names += list(ctx.cc_name.values())
    vocab_json, q, scale, ref = prune_model(full, texts, names)
    D = vocab_json["dims"]
    (out_dir / "model").mkdir(parents=True, exist_ok=True)
    atomic_write_json(out_dir / "model" / "vocab.json", vocab_json, indent=None, separators=(",", ":"))
    write_bin(out_dir / "model" / "emb.i8", q)
    write_bin(out_dir / "model" / "scale.f32", scale)

    manifest = {"version": VERSION, "model": MODEL, "dims": D,
                "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "sources": {},
                "model_files": {"vocab": "model/vocab.json", "emb": "model/emb.i8", "scale": "model/scale.f32"},
                "bm25": {"file": "bm25.json", "fields": ["name", "tags", "text"],
                         "boost": {"name": 3, "tags": 2, "text": 1}, "sources": None}}
    t0 = time.time()
    for src, (rows, embeds) in corpus.items():
        V = ref.encode(embeds, batch_size=2048)
        i8, b1 = quantise_rows(V)
        write_bin(out_dir / f"vectors-{src}.i8", i8)
        write_bin(out_dir / f"vectors-{src}.b1", b1)
        atomic_write_json(out_dir / f"passages-{src}.json", {"source": src, "rows": rows}, indent=None, separators=(",", ":"))
        manifest["sources"][src] = {"n": len(rows), "passages": f"passages-{src}.json",
                                    "i8": f"vectors-{src}.i8", "b1": f"vectors-{src}.b1"}
    print(f"  embedded {len(texts)} passages in {time.time() - t0:.0f} s")
    old = jload(out_dir / "manifest.json") or {}
    if old.get("bm25", {}).get("sources"):
        manifest["bm25"]["sources"] = old["bm25"]["sources"]
    atomic_write_json(out_dir / "manifest.json", manifest, indent=1)
    sizes(out_dir)
    print(f"ask index built in {time.time() - t_all:.0f} s")
    return ref


def sizes(out_dir):
    import gzip
    tot = 0
    for p in sorted(out_dir.rglob("*")):
        if p.is_file() and not p.name.endswith(".tmp"):
            b = p.read_bytes()
            tot += len(b)
            print(f"    {p.relative_to(out_dir).as_posix():28} {len(b) / 1024:9.0f} KB   gzip {len(gzip.compress(b, 6)) / 1024:8.0f} KB")
    print(f"    {'total':28} {tot / 1024:9.0f} KB")


def check(ctx, out_dir, ref=None):
    """Recall@10 with the SHIPPED model, the shipped dest vectors and the
    two-stage scorer the Pages Function runs."""
    import numpy as np
    ref = ref or load_reference(out_dir)
    man = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    D = man["dims"]
    s = man["sources"]["dest"]
    rows = json.loads((out_dir / s["passages"]).read_text(encoding="utf-8"))["rows"]
    i8 = np.fromfile(out_dir / s["i8"], dtype=np.int8).reshape(-1, D)
    b1 = np.fromfile(out_dir / s["b1"], dtype=np.uint8).reshape(-1, D // 8)
    dest_ids = [r[1] for r in rows]

    def ranker(text, allowed):
        qv = ref.encode([text])[0]
        return [i for i, _ in two_stage(qv, i8, b1, rows=allowed, k=50)]

    t0 = time.time()
    per, lines = recall(ctx, dest_ids, ranker, golden_queries(ctx))
    for ln in lines:
        print(ln)
    g, mu = per["golden"], per["multi"]
    print(f"shipped model, two-stage scorer: GOLDEN {g[0]}/{g[1]}, MULTI {mu[0]}/{mu[1]} in the top 10 "
          f"({(time.time() - t0) / 50 * 1000:.0f} ms per query in Python)")
    return per


FIXTURE_QUERIES = [q for _l, q, _f, _e in MULTI] + [
    "lakeside in austria", "old town in croatia", "castles in germany", "food and wine in italy",
    "beach town in portugal", "Ruhiges Bergdorf im Juli", "plage de sable près de Nice",
    "pueblo blanco en Andalucía", "spiaggia per famiglie in agosto", "goedkope stedentrip in mei",
    "hiking base in the alps in july", "medieval towns in alsace", "island in greece in september",
    "Thermalbad in Ungarn", "quiet beach without crowds", "UNESCO old town under 80 euro a day",
    "ski village in Austria", "romantic weekend in Paris", "fjord cruise Norway",
    "",
]


def fixture(out_dir, app_dir):
    """tests/fixtures/askEmbed.fixture.json: 50 queries, the Python vector of
    each (int16 base64, x32767) and the Python top ten over the dest source."""
    import numpy as np
    ref = load_reference(out_dir)
    man = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    D = man["dims"]
    s = man["sources"]["dest"]
    rows = json.loads((out_dir / s["passages"]).read_text(encoding="utf-8"))["rows"]
    i8 = np.fromfile(out_dir / s["i8"], dtype=np.int8).reshape(-1, D)
    b1 = np.fromfile(out_dir / s["b1"], dtype=np.uint8).reshape(-1, D // 8)
    qs = FIXTURE_QUERIES[:50]
    assert len(qs) == 50, len(qs)
    V = ref.encode(qs)
    cases = []
    for text, v in zip(qs, V):
        top = [rows[i][0] for i, _ in two_stage(v, i8, b1, k=10)] if np.any(v) else []
        v16 = np.clip(np.rint(v * 32767), -32767, 32767).astype("<i2")
        cases.append({"q": text, "v": base64.b64encode(v16.tobytes()).decode("ascii"), "top10": top})
    out = {"version": 1, "about": "T551: Python reference vectors (int16 x32767, base64) and the "
           "two-stage top ten over passages-dest for 50 queries; regenerate with "
           "python pipeline/ask_index_layer.py --fixture after a model change.",
           "model": man["model"], "dims": D, "built": man["built"], "cases": cases}
    p = Path(app_dir) / "tests" / "fixtures" / "askEmbed.fixture.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(p, out, indent=1)
    print(f"wrote {p}: {p.stat().st_size // 1024} KB, {len(cases)} queries")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--public", default=str(PUBLIC), help="the app's public/ folder (default continent-app/public)")
    ap.add_argument("--check", action="store_true", help="recall on GOLDEN + MULTI with the shipped files only")
    ap.add_argument("--bakeoff", action="store_true", help="compare the candidate models (float, full vocab)")
    ap.add_argument("--fixture", action="store_true", help="write the JS test fixture from the shipped files")
    a = ap.parse_args()
    public = Path(a.public).resolve()
    out_dir = public / "search" / "ask"
    ctx = Ctx(public)
    if not ctx.dests:
        raise SystemExit(f"no destinations in {public / 'app_data.json'}")
    if a.bakeoff:
        bakeoff(ctx)
        return
    if a.fixture:
        fixture(out_dir, public.parent)
        return
    ref = None
    if not a.check:
        out_dir.mkdir(parents=True, exist_ok=True)
        ref = build(ctx, out_dir)
    check(ctx, out_dir, ref)


if __name__ == "__main__":
    main()
