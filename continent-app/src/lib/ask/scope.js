/*
 * What Ask Carta may answer, and how it ends when it cannot (ROADMAP E7, E1;
 * wave 3 of the ai fix program). One pure function, the only place the rule
 * lives: the chat turn (AskTurn.jsx) and the any-question eval both call it,
 * so the screen and the score cannot drift apart. Code decides, never a model.
 *
 *   askScope(text, rawIntent, { ref, towns, rows, lang }) ->
 *     { kind: 'refuse', reason }                  a request a travel assistant must not help with
 *     { kind: 'offtopic' }                         not about travelling in Europe at all
 *     { kind: 'outside', place, nearest }          a place outside Europe
 *     { kind: 'lacking', place, cc, nearest }      a European place Carta does not have yet
 *     { kind: 'answer' }                           anything else: the normal answer
 *
 *   text      the question as typed
 *   rawIntent parseIntent's Intent for it (before the follow-up binding)
 *   ref       { id, city } the place the last answer was about, or null
 *   towns     the gazetteer's towns for the name the question holds (see needsGazetteer), or null
 *   rows      the catalogue rows (lat, lon, iso2, city, id) the nearest places come from
 *   lang      the interface language (a bare capitalised word is read as a place except in German)
 *
 * nearest is [{ id, city, cc }], at most three, from the catalogue by
 * country and distance: a door for the traveller, never a guess.
 *
 * The refusal and off-topic lists below are deterministic word lists in the
 * six languages, folded for accents. They are conservative on purpose: a
 * refusal needs a cue to evade a check (or fake a paper, or dodge a fare)
 * together with the thing it is evaded on, so a plain travel question about
 * borders, visas or customs never trips it (tests/askScope.test.mjs holds the
 * near misses). A list cannot be complete: an unlisted phrasing is answered
 * as a normal question, which is the safe side of the error.
 */
import { foldName } from '../searchIndex.js';
import { placeCandidate } from './outside.js';
import { pointsBack } from './followup.js';

const ANSWER = { kind: 'answer' };

// ---- text, folded --------------------------------------------------------

/** Lower case, accents gone, every run of non letters or digits one space. */
export function plain(text) {
  return ` ${String(text || '').replace(/ß/g, 'ss').replace(/[œŒ]/g, 'oe').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}
const re = (src) => new RegExp(` (?:${src}) `);

// ---- refusal -------------------------------------------------------------

// The border, customs and immigration words, six languages.
const BORDER = 'border|borders|grens|grenzen|grenze|frontiere|frontieres|frontera|fronteras|frontiera|confine|confini|customs|douane|zoll|aduana|aduanas|dogana|passport control|immigration|checkpoint';
// "without showing a passport": the show verb follows the document in Dutch and German.
const SHOW_EVADE = [
  '(?:without|sans|sin|senza) (?:\\w+ ){0,2}(?:showing|presenting|montrer|presenter|ensenar|mostrar|mostrare)',
  '(?:zonder|ohne) (?:\\w+ ){0,3}(?:paspoort|identiteitsbewijs|pass|reisepass|ausweis|personalausweis) (?:\\w+ ){0,3}(?:laten zien|te laten zien|tonen|te tonen|voor te leggen|zeigen|zu zeigen|vorzuzeigen|vorzulegen)',
].join('|');
const NOTICE = [
  'without anyone noticing', 'without being noticed', 'without being caught', 'without getting caught', 'unnoticed', 'undetected',
  'zonder dat iemand het merkt', 'zonder dat iemand het ziet', 'zonder betrapt te worden',
  'ohne dass es jemand merkt', 'ohne dass jemand es merkt', 'ohne erwischt zu werden',
  'sans que personne (?:ne )?s en apercoive', 'sans me faire prendre', 'sans me faire reperer',
  'sin que nadie se entere', 'sin que nadie lo note', 'sin que me descubran',
  'senza che nessuno se ne accorga', 'senza essere scoperto', 'senza farmi scoprire',
  'not get caught', 'not getting caught', 'and not be caught', 'en cachette',
].join('|');
const STAY_CONTEXT = 'schengen|visa|visum|visado|overstay|90|permit|vergunning|aufenthalt|sejour|estancia|soggiorno';
const STAY_VERB = 'stay|remain|overstay|blijven|blijf|bleiben|bleibe|rester|reste|quedo|quedarme|quedarse|resto|restare';
const FAKE = 'fake|forged|counterfeit|falsified|nep|vals|valse|gefalscht|gefalschte|gefalschten|gefalschtes|falsch|faux|fausse|falso|falsa|falsificado|falsificada|falsificato|falsificata|contraffatto|contraffatta';
const PAPER = 'passport|paspoort|reisepass|ausweis|passeport|pasaporte|passaporto|visa|visum|visado|id|\\w*zertifikat|\\w*bewijs|certificat|certificado|certificato|certificate|certificaat|vaccin\\w*|ticket|tickets|document|documents|documenten|papiers|papeles|documento|documenti|dokument';
const GET_VERB = 'buy|buying|purchase|order|get|getting|obtain|make|making|find|kopen|koop|bestellen|bestel|maken|krijgen|halen|regelen|vinden|kaufen|besorgen|machen|bekommen|finden|acheter|achete|obtenir|faire|commander|trouver|comprar|compro|conseguir|hacer|pedir|encontrar|comprare|compro|ottenere|fare|ordinare|trovare|procurarsi';
const DECLARE_EVADE = 'without declaring|zonder aangifte|zonder te declareren|ohne anzumelden|ohne zu verzollen|sans declarer|sin declarar|senza dichiarare';
const FORGE = 'forge|forging|falsify|falsificare|falsificar|falsifier|vervalsen|falschen|nachmachen';
const BORROWED = [
  '(?:my|his|her|a) (?:brother|sister|friend|cousin|husband|wife|colleague) s (?:passport|id)',
  'someone else s (?:passport|id|ticket)', 'another person s (?:passport|id)', 'borrowed (?:passport|id)',
  'paspoort van iemand anders', 'fremden (?:pass|reisepass|ausweis)', 'pass von jemand anderem', 'ausweis von jemand anderem',
  'passeport d un autre', 'passeport de quelqu un d autre', 'pasaporte de otra persona', 'pasaporte ajeno', 'passaporto di un altro', 'passaporto altrui',
].join('|');
const PAY_EVADE = 'without paying|without a ticket|without buying a ticket|zonder te betalen|zonder kaartje|zonder ticket|ohne zu bezahlen|ohne ticket|ohne fahrschein|sans payer|sans billet|sin pagar|sin billete|senza pagare|senza biglietto';
const CAUGHT = 'fine|fines|caught|inspector|inspectors|controller|conductor|ticket check|boete|boetes|betrapt|controleur|controleurs|erwischt|kontrolle|kontrolleur|schaffner|verbaliser|amende|amendes|multa|multas|pillado|multe|controllore|beccato|sanzione';
const TRANSIT = 'train|trains|trein|treinen|bahn|zug|metro|u bahn|bus|tram|transport|transports|tren|treno|ferry|veerboot';
const FARE_IDIOM = [
  'schwarzfahr\\w*', 'fahr\\w* (?:\\w+ ){0,2}schwarz', 'zwartrijden', 'zwartreizen', 'zwart (?:reizen|reis|rijden|rijd|te reizen)', '(?:reis|reizen|reist|rijd|rijden)(?: \\w+){0,2} zwart',
  'resquill\\w*', 'colarse en (?:el )?(?:metro|autobus|tren)', 'a sbafo', 'saltare il tornello', 'fare dodging', 'fare evasion', 'jump(?:ing)? the turnstile', 'frauder dans les transports',
].join('|');
const HOW = 'how|hoe|wie|comment|como|come|can i|kan ik|kann ich|puis je|puedo|posso|ways|tips|tricks|best way';
const SMUGGLE = 'smuggl\\w*|smokkel\\w*|schmuggel\\w*|schmuggl\\w*|contrebande|contrabando|contrabbando';
const POACH = 'poach|poaching|stropen|wilderei|wildern|braconnage|braconner|caza furtiva|bracconaggio|bracconare';
const HARM_VERB = 'poison|kill|torture|vergiftigen|vergiftig|doden|dood|martel|vergiften|vergifte|toten|quale|empoisonner|tuer|torturer|envenenar|matar|torturar|avvelenare|uccidere|torturare';
const VICTIM = 'someone|somebody|a person|a tourist|tourists|iemand|jemanden|jemand|quelqu un|alguien|qualcuno|animal|animals|dog|dogs|cat|cats|birds|seagulls|swans|wildlife|dier|dieren|hond|honden|katten|vogels|tier|tiere|hund|hunde|katze|katzen|animaux|chien|chiens|chat|chats|oiseaux|animales|perro|perros|gato|gatos|animali|cane|cani|gatto|gatti|uccelli';

const RULES = [
  ['border', [re(BORDER), re(SHOW_EVADE)]],
  ['border', [re(BORDER), re(NOTICE)]],
  ['border', [re(`(?:sneak|sneaking|evade|evading|dodge|dodging|bypass|bypassing|circumvent|ontduik\\w*|umgehen|contourner|evadir|burlar|eludere|aggirare)(?: \\w+){0,3} (?:${BORDER})`)]],
  ['papers', [re(`(?:${FAKE})(?: \\w+){0,4} (?:${PAPER})|(?:${PAPER})(?: \\w+){0,3} (?:${FAKE})`), re(GET_VERB)]],
  ['papers', [re(BORROWED)]],
  ['papers', [re(`(?:${FORGE})(?: \\w+){0,3} (?:${PAPER})`)]],
  ['border', [re(BORDER), re(DECLARE_EVADE)]],
  ['fare', [re(FARE_IDIOM)]],
  ['fare', [re(PAY_EVADE), re(CAUGHT), re(TRANSIT)]],
  ['stay', [re(NOTICE), re(STAY_CONTEXT), re(STAY_VERB)]],
  ['smuggling', [re(SMUGGLE), re(HOW)]],
  ['harm', [re(POACH), re(HOW)]],
  ['harm', [re(`(?:${HARM_VERB})(?: \\w+){0,1} (?:${VICTIM})`), re(HOW)]],
];

/** The reason a request is one Carta must not help with, or null. Every part of a rule must hold. */
export function refusalFor(text) {
  const p = plain(text);
  for (const [reason, parts] of RULES) if (parts.every((x) => x.test(p))) return reason;
  return null;
}

// ---- off topic -----------------------------------------------------------

// Things that are not travel, six languages: each a stem or phrase, matched on word starts.
const OFFTOPIC = [
  'poem|poems|poeme|poemes|poesie|poesia|poema|gedicht|gedichten|lyrics|songtekst|songtext|paroles de|letra de la cancion|testo della canzone',
  'recipe|recipes|recept|recepten|rezept|rezepte|recette|recettes|receta|recetas|ricetta|ricette',
  'football|soccer|voetbal|fussball|futbol|calcio',
  'world cup|wereldbeker|weltmeisterschaft|coupe du monde|copa del mundo|coppa del mondo',
  'bitcoin|crypto|cryptocurrency|cryptomunt|kryptowahrung|criptomoneda|criptovaluta|stock price|share price|aandelenkoers|aktienkurs',
  'homework|huiswerk|hausaufgaben|devoirs|deberes|compiti|essay|opstel|aufsatz',
  'relativity|relativiteit|relativitatstheorie|relativite|relatividad|relativita',
  'horoscope|horoscoop|horoskop|horoscopo|oroscopo',
  'joke|jokes|grap|moppen|witz|witze|blague|chiste|barzelletta',
  'python|javascript|typescript|html|css|sql|regex|source code|broncode|quellcode|code source|codigo fuente',
  'square root|vierkantswortel|wurzel aus|racine carree|raiz cuadrada|radice quadrata',
  '(?:write|schrijf|schreib|ecris|escribe|scrivi|scrivere|help me write|aiutami a scrivere)(?: \\w+){0,4} (?:email|e mail|mail|brief|letter|lettre|carta|lettera)',
  '(?:best|beste|mejor|meilleur|meilleure|migliore|bestes)(?: \\w+){0,2} (?:phone|smartphone|telefoon|handy|telephone|telefono|movil|celular|cellulare|laptop)',
  '(?:on|op|auf dem|sur|su)(?: the)? (?:mars|moon|jupiter|venus|marte)|en marte',
  'meaning of life|zin van het leven|sinn des lebens|sens de la vie|sentido de la vida|senso della vita',
];
const OFFTOPIC_RE = re(OFFTOPIC.join('|'));
// A question that is about travel says so; one of these words keeps it a normal question.
const TRAVEL = re('trip|trips|travel|travelling|traveling|holiday|holidays|vacation|hotel|hostel|flight|flights|itinerary|hike|hiking|beach|reis|reizen|vakantie|vlucht|vluchten|urlaub|reise|reisen|flug|fluge|voyage|voyager|vacances|vol|vols|viaje|viajar|vacaciones|vuelo|vuelos|viaggio|viaggiare|vacanza|volo|voli');

/** True for a question that is not about travelling in Europe: a listed topic, no place, no travel word. */
export function isOfftopic(text, raw) {
  if (raw && (raw.places?.length || raw.compare?.length || raw.facets?.country || raw.facets?.near || raw.facets?.area)) return false;
  const p = plain(text);
  return OFFTOPIC_RE.test(p) && !TRAVEL.test(p);
}

// ---- nearest covered places ----------------------------------------------

const rad = (d) => (d * Math.PI) / 180;
function km(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * The covered places nearest a point, the same country first (a traveller
 * asking about a village wants its own country's places), else the nearest
 * anywhere. Catalogue rows only; [] without rows.
 */
export function nearestCovered(at, rows, { count = 3 } = {}) {
  const ok = (rows || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!at || !ok.length || !Number.isFinite(at.lat) || !Number.isFinite(at.lon)) return [];
  const same = at.cc ? ok.filter((p) => p.iso2 === at.cc) : [];
  const pool = same.length ? same : ok;
  return pool
    .map((p) => ({ p, d: km(at, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map(({ p }) => ({ id: p.id, city: p.city, cc: p.iso2 }));
}

// A few places outside Europe have a sensible covered neighbour across the water: where to point from.
const NEAR_OUTSIDE = [
  [['morocco', 'maroc', 'marokko', 'marruecos', 'marocco'], { lat: 36.0, lon: -5.6, cc: 'ES' }],
  [['algeria', 'algerije', 'algerien', 'algerie', 'argelia', 'algeria'], { lat: 37.2, lon: -3.6, cc: 'ES' }],
  [['tunisia', 'tunesie', 'tunesien', 'tunisie', 'tunez'], { lat: 35.9, lon: 14.5, cc: 'MT' }],
  [['marrakech', 'marrakesh', 'marrakesch', 'casablanca'], { lat: 36.0, lon: -5.6, cc: 'ES' }],
  [['tunis'], { lat: 35.9, lon: 14.5, cc: 'MT' }],
];

// The words of a catalogue row that can name a nearby place: its blurb, guide and transport notes.
const TEXT_KEYS = ['blurb', 'guide', 'local_transport', 'activities', 'transfer', 'nature'];
const textCache = new WeakMap();
function textOf(p) {
  let t = textCache.get(p);
  if (t == null) {
    const parts = [];
    const walk = (v, depth) => {
      if (typeof v === 'string') parts.push(v);
      else if (depth < 3 && v && typeof v === 'object') for (const x of Object.values(v)) walk(x, depth + 1);
    };
    for (const k of TEXT_KEYS) walk(p[k], 0);
    t = ` ${foldName(parts.join(' ')).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
    textCache.set(p, t);
  }
  return t;
}

/** The covered places whose own text names `name` (a village Carta has no entry for), most mentions first. */
export function mentionedBy(rows, name, { count = 3 } = {}) {
  const key = ` ${foldName(name).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
  if (key.trim().length < 3) return [];
  const hits = [];
  for (const p of rows || []) {
    const t = textOf(p);
    let n = 0;
    for (let i = t.indexOf(key); i >= 0; i = t.indexOf(key, i + key.length - 1)) n++;
    if (n) hits.push({ p, n });
  }
  return hits.sort((a, b) => b.n - a.n).slice(0, count).map(({ p }) => ({ id: p.id, city: p.city, cc: p.iso2 }));
}

/** The gazetteer town that is named `name`, the biggest when several are. */
export function townNamed(towns, name) {
  const key = foldName(name);
  let best = null;
  for (const t of towns || []) {
    if (t.folds?.includes(key) && (!best || (t.pop || 0) > (best.pop || 0))) best = t;
  }
  return best;
}

/**
 * The name the question holds that only the gazetteer can place (a town Carta
 * may lack), or null. The caller loads that name's towns, then calls askScope.
 */
export function needsGazetteer(text, raw, ref = null, { lang = 'en' } = {}) {
  if (refusalFor(text) || (ref && pointsBack(text))) return null;
  const c = placeCandidate(text, raw, { bare: lang !== 'de' });
  return c && !c.sure ? c.name : null;
}

export function askScope(text, raw, { ref = null, towns = null, rows = null, lang = 'en' } = {}) {
  const reason = refusalFor(text);
  if (reason) return { kind: 'refuse', reason };
  // A follow-up that points back ("there") is about the last place: never outside Europe.
  if (ref && pointsBack(text)) return ANSWER;
  const c = placeCandidate(text, raw, { bare: lang !== 'de' });
  if (c) {
    if (c.sure) {
      const key = foldName(c.name);
      const near = NEAR_OUTSIDE.find(([names]) => names.includes(key));
      return { kind: 'outside', place: c.name, nearest: near ? nearestCovered(near[1], rows) : [] };
    }
    // Not on the outside list, so never "outside Europe": a place Carta lacks. The gazetteer
    // (towns above a size) gives its country and spot; a village it misses (Murren) is placed
    // by the catalogue's own words, the places whose text mentions it; else only the Explore door.
    const town = townNamed(towns, c.name);
    if (town) return { kind: 'lacking', place: c.name, cc: town.cc, nearest: nearestCovered(town, rows) };
    // A weak lead-in or a bare capital word is a place only when the gazetteer knows the town.
    if (c.weak) return isOfftopic(text, raw) ? { kind: 'offtopic' } : ANSWER;
    return { kind: 'lacking', place: c.name, cc: null, nearest: mentionedBy(rows, c.name) };
  }
  if (isOfftopic(text, raw)) return { kind: 'offtopic' };
  return ANSWER;
}
