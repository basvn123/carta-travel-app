/*
 * Ask Carta, stage 1: a typed question becomes one Intent (T553). No model
 * and no network: this reads the question against the guided search's
 * closed vocabulary (lib/guidedSearch.js, T442) and adds what that one
 * cannot hold, the trip around the place: who goes, for how long, with how
 * much money in total, how they travel, from where, and what kind of
 * question it is.
 *
 *   {
 *     type     'find' | 'budget' | 'when' | 'about' | 'compare' | 'near' | 'plan'
 *     facets   Explore's own facets ({vibe, area|country|near, month, budget,
 *              nb, nocar, quiet, sort}) plus `warm`
 *     monthRange  [m, m, m] for a season ("this winter")
 *     budget   {total, perDay, adults, children, family, days, mode, origin}
 *     places   [id] the place a when/about question is about
 *     compare  [id, id, ...]
 *     unknown  words nothing could place (stage 2 tries them semantically)
 *   }
 *
 * The facets stay Explore's, so "Show all" is one applyGuided() call.
 */
import {
  buildVocab, parseQuery, partsToFacets, budgetStep, words,
  VIBE_WORDS_I18N, STOP,
} from '../guidedSearch.js';

export const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];
export const BUDGET_STEPS = [40, 60, 80, 100, 130];

// ---- Word lists (folded: lower case, no accents, apostrophes as spaces) ----

const NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10,
  zwei: 2, drei: 3, funf: 5, sechs: 6, sieben: 7, neun: 9, zehn: 10,
  deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
};
const DAY_WORDS = new Set(['day', 'days', 'dag', 'dagen', 'tag', 'tage', 'tagen', 'jour', 'jours',
  'dia', 'dias', 'giorno', 'giorni']);
const NIGHT_WORDS = new Set(['night', 'nights', 'nacht', 'nachten', 'nachte', 'nuit', 'nuits',
  'noche', 'noches', 'notte', 'notti']);
const PEOPLE_WORDS = new Set(['people', 'persons', 'person', 'adults', 'adult', 'pax', 'mensen',
  'personen', 'persoon', 'volwassenen', 'leute', 'erwachsene', 'personnes', 'personne', 'adultes',
  'personas', 'persona', 'adultos', 'persone', 'adulti', 'of us', 'travellers', 'travelers']);
const CHILD_WORDS = new Set(['child', 'children', 'kids', 'kid', 'kind', 'kinderen', 'kinder',
  'enfant', 'enfants', 'nino', 'ninos', 'hijos', 'bambino', 'bambini', 'figli']);
const PARTY_PREP = new Set(['for', 'voor', 'fur', 'pour', 'para', 'per', 'with', 'met', 'mit', 'avec', 'con']);
// Phrases, longest first within each list (the matcher tries them all).
const WEEKS = [
  [14, ['two weeks', '2 weeks', 'a fortnight', 'fortnight', 'twee weken', '2 weken', 'zwei wochen', '2 wochen',
    'deux semaines', '2 semaines', 'dos semanas', '2 semanas', 'due settimane', '2 settimane']],
  [7, ['a week', 'one week', '1 week', 'week', 'een week', 'eine woche', 'woche', 'une semaine', 'semaine',
    'una semana', 'semana', 'una settimana', 'settimana']],
  [3, ['long weekend', 'a long weekend', 'lang weekend', 'een lang weekend', 'langes wochenende',
    'verlangertes wochenende', 'long week end', 'puente', 'ponte']],
  [2, ['weekend', 'a weekend', 'een weekend', 'wochenende', 'week end', 'fin de semana', 'fine settimana', 'weekend lungo']],
];
const COUPLE = ['a couple', 'couple', 'with my partner', 'my partner and i', 'koppel', 'stel', 'met z n tweeen',
  'met zijn tweeen', 'zu zweit', 'als paar', 'en couple', 'en pareja', 'in coppia', 'in due'];
const SOLO = ['solo', 'alone', 'on my own', 'by myself', 'alleen', 'allein', 'seul', 'seule', 'sola', 'da solo', 'da sola', 'solo trip'];
const FAMILY = ['family of', 'with the family', 'with my family', 'met het gezin', 'met ons gezin', 'gezin',
  'mit der familie', 'familie', 'en famille', 'famille', 'en familia', 'con la familia', 'in famiglia', 'con la famiglia'];

const MODE = {
  public: ['by train', 'by bus', 'train or bus', 'by train or bus', 'train', 'trains', 'bus', 'public transport',
    'met de trein', 'trein', 'met de bus', 'openbaar vervoer', 'mit dem zug', 'mit der bahn', 'zug', 'bahn',
    'en train', 'en bus', 'transports en commun', 'en tren', 'tren', 'en autobus', 'in treno', 'treno', 'in autobus'],
  fly: ['by plane', 'fly', 'flying', 'flight', 'flights', 'by air', 'vliegen', 'vliegtuig', 'met het vliegtuig',
    'fliegen', 'flug', 'flugzeug', 'en avion', 'avion', 'vol', 'en avion', 'volar', 'vuelo', 'en avion', 'in aereo', 'aereo', 'volo'],
  car: ['road trip', 'roadtrip', 'by car', 'drive', 'driving', 'rental car', 'met de auto', 'rijden', 'autorit',
    'mit dem auto', 'auto fahren', 'autofahrt', 'en voiture', 'voiture', 'en coche', 'coche', 'conducir',
    'in macchina', 'in auto', 'macchina'],
};
// Said before the mode words, so "without a car" never reads as "by car".
const NOCAR = ['no car needed', 'no car', 'car free', 'car-free', 'without a car', 'without car', 'no driving',
  'zonder auto', 'geen auto', 'autovrij', 'ohne auto', 'kein auto', 'autofrei', 'sans voiture', 'pas de voiture',
  'sin coche', 'sin auto', 'senza auto', 'senza macchina'];
const QUIET = ['least crowded', 'not crowded', 'not too crowded', 'uncrowded', 'no crowds', 'avoid crowds', 'without crowds',
  'few tourists', 'fewer tourists', 'off the beaten track', 'niet druk', 'rustig', 'weinig toeristen',
  'nicht uberlaufen', 'wenig touristen', 'ruhig', 'ruhige', 'ruhiges', 'ruhigen', 'peu de monde', 'peu de touristes', 'sans foule',
  'sin multitudes', 'pocos turistas', 'sin aglomeraciones', 'poco affollato', 'pochi turisti', 'senza folla'];
const WARM = ['still warm', 'warm', 'warmth', 'sunny', 'sun', 'hot', 'heat', 'zon', 'zonnig', 'warm weer', 'warme',
  'sonne', 'sonnig', 'chaud', 'soleil', 'calor', 'sol', 'caldo', 'sole', 'caliente'];
const TOTAL = ['in total', 'total', 'totaal', 'in totaal', 'insgesamt', 'gesamt', 'au total', 'en total', 'in totale',
  'totale', 'budget of', 'a budget of', 'budget', 'i have', 'we have', 'ik heb', 'we hebben', 'wij hebben',
  'ich habe', 'wir haben', 'j ai', 'nous avons', 'tengo', 'tenemos', 'ho', 'abbiamo'];
const PER_DAY = ['a day', 'per day', 'each day', 'daily', 'a night', 'per night', 'per dag', 'een dag', 'pro tag',
  'am tag', 'par jour', 'por dia', 'al dia', 'al giorno', 'a notte', 'per persoon per dag'];
const EURO_AFTER = ['eur', 'euro', 'euros', 'e'];

const PLAN = ['plan me', 'plan a', 'plan', 'make me a', 'make a', 'build me a', 'itinerary', 'route', 'road trip',
  'roadtrip', 'reisplan', 'reisroute', 'plannen', 'maak een', 'plane', 'planen', 'reiseroute', 'erstelle',
  'planifie', 'planifier', 'itineraire', 'planea', 'planear', 'itinerario', 'ruta', 'pianifica', 'pianificare', 'organizza'];
const WHEN = ['best time to visit', 'best time to go to', 'best time for', 'best time', 'best month for', 'best month',
  'when should i go to', 'when should i go', 'when to go to', 'when to visit', 'when to go', 'when is', 'when',
  'wanneer is de beste tijd voor', 'beste reistijd', 'beste tijd', 'wanneer', 'beste reisezeit fur', 'beste reisezeit',
  'reisezeit', 'wann ist', 'wann', 'meilleure periode', 'quand partir a', 'quand partir', 'quand',
  'mejor epoca para', 'mejor epoca', 'mejor momento', 'cuando es la mejor epoca para', 'cuando', 'periodo migliore',
  'quando andare a', 'quando andare', 'quando'];
const ABOUT = ['what is', 'whats', 'tell me about', 'how expensive is', 'how expensive', 'how much does', 'is it worth',
  'worth it', 'worth', 'do i need a car in', 'do i need a car', 'what to do in', 'what to do', 'things to do in',
  'things to do', 'how is', 'info about', 'hoe is', 'wat is', 'wat te doen in', 'wat te doen', 'wie ist', 'was ist',
  'was tun in', 'comment est', 'que faire a', 'que faire', 'como es', 'que hacer en', 'que hacer', 'com e', 'come e',
  'cosa fare a', 'cosa fare'];
const ABOUT_TAIL = ['like', 'eigentlich'];
const CONNECT = { en: ['or', 'vs', 'versus', 'against'], nl: ['of', 'vs', 'versus', 'tegen'], de: ['oder', 'vs', 'gegen'],
  fr: ['ou', 'vs', 'contre'], es: ['o', 'vs', 'contra'], it: ['o', 'oppure', 'vs', 'contro'] };
// Not "van", "von" or "da": they are also "of" and "near" ("in der Nahe von").
const ORIGIN = ['from', 'leaving from', 'starting in', 'vanuit', 'vertrek uit', 'ab', 'aus', 'depuis',
  'au depart de', 'desde', 'saliendo de', 'partendo da', 'in partenza da'];
const NEXT_MONTH = ['next month', 'volgende maand', 'nachsten monat', 'le mois prochain', 'mois prochain',
  'el proximo mes', 'proximo mes', 'il mese prossimo', 'mese prossimo'];
const THIS_MONTH = ['this month', 'deze maand', 'diesen monat', 'ce mois ci', 'este mes', 'questo mese'];
const SEASONS = [
  [[6, 7, 8], ['this summer', 'in summer', 'summer', 'zomer', 'deze zomer', 'sommer', 'im sommer', 'ete', 'cet ete', 'en ete', 'verano', 'en verano', 'estate', 'in estate', 'questa estate']],
  [[12, 1, 2], ['this winter', 'in winter', 'winter', 'deze winter', 'im winter', 'hiver', 'cet hiver', 'en hiver', 'invierno', 'en invierno', 'inverno', 'in inverno', 'questo inverno']],
  [[3, 4, 5], ['this spring', 'in spring', 'spring', 'lente', 'voorjaar', 'in de lente', 'fruhling', 'fruhjahr', 'im fruhling', 'printemps', 'au printemps', 'primavera', 'en primavera', 'in primavera']],
  [[9, 10, 11], ['this autumn', 'in autumn', 'autumn', 'this fall', 'in the fall', 'herfst', 'in de herfst', 'herbst', 'im herbst', 'automne', 'en automne', 'otono', 'en otono', 'autunno', 'in autunno']],
];
// "Late October" is October: the modifier is noise to the month facet.
const MONTH_MOD = ['late', 'early', 'mid', 'end of', 'start of', 'beginning of', 'eind', 'begin', 'half', 'midden',
  'ende', 'anfang', 'mitte', 'fin', 'debut', 'mi', 'finales de', 'principios de', 'mediados de', 'fine', 'inizio', 'meta'];

const CITY_WORDS = new Set(['city', 'cities', 'city break', 'break', 'urban', 'stad', 'steden', 'stedentrip', 'stadt',
  'stadte', 'ville', 'villes', 'ciudad', 'ciudades', 'citta']);

const fold = (list) => [...new Set(list.map((s) => words(s).join(' ')).filter(Boolean))]
  .sort((a, b) => b.split(' ').length - a.split(' ').length);
const L = {
  couple: fold(COUPLE), solo: fold(SOLO), family: fold(FAMILY), nocar: fold(NOCAR), quiet: fold(QUIET),
  warm: fold(WARM), total: fold(TOTAL), perDay: fold(PER_DAY), plan: fold(PLAN), when: fold(WHEN),
  about: fold(ABOUT), aboutTail: fold(ABOUT_TAIL), origin: fold(ORIGIN), nextMonth: fold(NEXT_MONTH),
  thisMonth: fold(THIS_MONTH), monthMod: fold(MONTH_MOD), euro: fold(EURO_AFTER),
  modes: Object.entries(MODE).map(([k, v]) => [k, fold(v)]),
  weeks: WEEKS.map(([n, v]) => [n, fold(v)]),
  seasons: SEASONS.map(([m, v]) => [m, fold(v)]),
};

const SIGN = String.fromCharCode(0x20ac);
const MONEY = new RegExp(`^(?:${SIGN}|eur)?([0-9]{1,5})(?:${SIGN}|eur|euro|euros|e)?$`);

/** Tokens as the guided search reads them, with "1,500" and "1.500" kept whole. */
export function tokenize(text) {
  const t = String(text || '').slice(0, 200)
    .replace(/(\d)[,.](\d{3})(?!\d)/g, '$1$2')
    .replace(/(\d)\s*k\b/gi, '$1000');
  return words(t);
}

/**
 * The vocabulary Ask reads with: the guided search's own for the reader's
 * language, widened with every language's vibe and area labels and words
 * (people type German into an English page) and with the reviewed lexicon
 * (public/search/ask/lexicon.json, T552) of synonyms and place exonyms.
 */
export function buildAskVocab(ctx) {
  const vocab = buildVocab(ctx);
  const { guided, lexicon, rows } = ctx;
  const addKey = (entry, key) => {
    const k = words(key).join(' ');
    if (!k) return;
    if (!vocab.byKey.has(k)) vocab.byKey.set(k, []);
    const list = vocab.byKey.get(k);
    if (!list.includes(entry)) list.push(entry);
    if (!entry.keys.includes(k)) entry.keys.push(k);
  };
  const find = (kind, value) => vocab.entries.find((e) => e.kind === kind && e.value === value);
  for (const v of guided?.vibes || []) {
    const e = find('vibe', v.id);
    if (!e) continue;
    for (const lang of LANGS) {
      if (v.label?.[lang]) addKey(e, v.label[lang]);
      for (const w of VIBE_WORDS_I18N[lang]?.[v.id] || []) addKey(e, w);
    }
  }
  for (const a of guided?.areas || []) {
    const e = find('area', a.id);
    if (!e) continue;
    for (const lang of LANGS) if (a.label?.[lang]) addKey(e, a.label[lang]);
  }
  for (const lang of LANGS) {
    let region = null;
    try { region = new Intl.DisplayNames([lang], { type: 'region' }); } catch { /* old engine */ }
    if (!region) continue;
    for (const e of vocab.entries) if (e.kind === 'country') addKey(e, region.of(e.value) || '');
    const mf = new Intl.DateTimeFormat(lang, { month: 'long' });
    for (let m = 1; m <= 12; m++) {
      const e = find('month', m);
      if (e) addKey(e, mf.format(new Date(2026, m - 1, 15)));
    }
  }
  const byId = new Map((rows || []).map((p) => [p.id, p]));
  for (const [phrase, , slot, value] of lexicon?.phrases || []) {
    let e = null;
    if (slot === 'place') e = vocab.places.find((x) => x.value === value) || null;
    else if (slot === 'vibe' || slot === 'area' || slot === 'country' || slot === 'extra' || slot === 'sort') e = find(slot, value);
    if (!e && slot === 'place' && byId.has(value)) continue;
    if (e) addKey(e, phrase);
  }
  return vocab;
}

// ---- The scanner ------------------------------------------------------------

function matchAt(toks, i, phrases, used) {
  for (const ph of phrases) {
    const w = ph.split(' ');
    if (i + w.length > toks.length) continue;
    let ok = true;
    for (let j = 0; j < w.length; j++) {
      if (used[i + j] || toks[i + j] !== w[j]) { ok = false; break; }
    }
    if (ok) return w.length;
  }
  return 0;
}
const take = (used, i, n) => { for (let j = 0; j < n; j++) used[i + j] = true; };
const numOf = (tok) => {
  if (/^[0-9]{1,5}$/.test(tok)) return Number(tok);
  return NUM[tok] ?? null;
};

/** Every place named in the question, longest name first, never a word the
 *  reader's language uses for something else unless it is the only reading. */
function placeMentions(toks, used, vocab, stop, preferPlace = false) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (used[i]) continue;
    for (let n = Math.min(4, toks.length - i); n >= 1; n--) {
      if (toks.slice(i, i + n).some((_, j) => used[i + j])) continue;
      const key = toks.slice(i, i + n).join(' ');
      const list = vocab.byKey.get(key);
      if (!list) continue;
      const places = list.filter((e) => e.kind === 'place');
      if (!places.length) break;
      const other = list.some((e) => e.kind !== 'place');
      if (n === 1 && (stop.has(key) || (other && !preferPlace))) break;
      const best = [...places].sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];
      out.push({ i, n, id: best.value, entry: best });
      i += n - 1;
      break;
    }
  }
  return out;
}

/**
 * The question as one Intent.
 *
 *   ctx: { vocab (buildAskVocab), lang, now: Date, steps? }
 */
export function parseIntent(text, ctx) {
  const { vocab, lang = 'en' } = ctx;
  const now = ctx.now || new Date();
  const steps = ctx.steps || BUDGET_STEPS;
  const toks = tokenize(text);
  const used = toks.map(() => false);
  const stop = new Set(`${STOP.en} ${STOP[lang] || ''}`.split(' '));
  const cues = { plan: false, when: false, about: false, total: false };
  const budget = {};
  const extra = {};
  let monthRange = null;
  let month = null;

  // Pass 1: the question words and the trip around the place.
  for (let i = 0; i < toks.length; i++) {
    if (used[i]) continue;
    let n;
    if ((n = matchAt(toks, i, L.nocar, used))) { extra.nocar = true; take(used, i, n); continue; }
    if ((n = matchAt(toks, i, L.quiet, used))) { extra.quiet = true; take(used, i, n); continue; }
    if ((n = matchAt(toks, i, L.plan, used))) {
      cues.plan = true;
      if (toks.slice(i, i + n).join(' ').includes('road')) budget.mode = 'car';
      take(used, i, n); continue;
    }
    if ((n = matchAt(toks, i, L.when, used))) { cues.when = true; take(used, i, n); continue; }
    if ((n = matchAt(toks, i, L.about, used))) { cues.about = true; take(used, i, n); continue; }
    if ((n = matchAt(toks, i, L.nextMonth, used))) { month = (now.getMonth() + 1) % 12 + 1; take(used, i, n); continue; }
    if ((n = matchAt(toks, i, L.thisMonth, used))) { month = now.getMonth() + 1; take(used, i, n); continue; }
    let hit = false;
    for (const [m, list] of L.seasons) {
      if ((n = matchAt(toks, i, list, used))) { monthRange = m; take(used, i, n); hit = true; break; }
    }
    if (hit) continue;
    for (const [days, list] of L.weeks) {
      if ((n = matchAt(toks, i, list, used))) { budget.days = days; take(used, i, n); hit = true; break; }
    }
    if (hit) continue;
    if ((n = matchAt(toks, i, L.couple, used))) { budget.adults = 2; take(used, i, n); continue; }
    if ((n = matchAt(toks, i, L.solo, used))) { budget.adults = 1; take(used, i, n); continue; }
    if ((n = matchAt(toks, i, L.family, used))) {
      budget.family = true; take(used, i, n);
      const k = numOf(toks[i + n] || '');
      if (k != null && k >= 2 && k <= 10) { budget.adults = 2; budget.children = Math.max(0, k - 2); used[i + n] = true; }
      continue;
    }
    for (const [mode, list] of L.modes) {
      if ((n = matchAt(toks, i, list, used))) { budget.mode = mode; take(used, i, n); hit = true; break; }
    }
    if (hit) continue;
    if ((n = matchAt(toks, i, L.total, used))) { cues.total = true; take(used, i, n); continue; }
    if ((n = matchAt(toks, i, L.warm, used))) { extra.warm = true; take(used, i, n); continue; }
    if ((n = matchAt(toks, i, L.monthMod, used))) {
      // Only before a month ("late october"), so "fine" and "mid" stay words elsewhere.
      const next = vocab.byKey.get(toks[i + n]);
      if (next?.some((e) => e.kind === 'month')) { take(used, i, n); continue; }
    }
    // A figure: days, people, children, or money.
    const tok = toks[i];
    const k = numOf(tok);
    const after = toks[i + 1] || '';
    const after2 = toks.slice(i + 1, i + 3).join(' ');
    if (k != null && (DAY_WORDS.has(after) || NIGHT_WORDS.has(after))) {
      budget.days = NIGHT_WORDS.has(after) ? k + 1 : k; take(used, i, 2); continue;
    }
    if (k != null && (PEOPLE_WORDS.has(after) || PEOPLE_WORDS.has(after2))) {
      budget.adults = k; take(used, i, PEOPLE_WORDS.has(after2) ? 3 : 2); continue;
    }
    if (k != null && CHILD_WORDS.has(after)) { budget.children = k; take(used, i, 2); continue; }
    if (k != null && k <= 10 && !/^[0-9]/.test(tok) && PARTY_PREP.has(toks[i - 1] || '')) {
      budget.adults = k; take(used, i, 1); if (used[i - 1] === false) used[i - 1] = true; continue;
    }
    if (k != null && k <= 10 && /^[0-9]/.test(tok) && PARTY_PREP.has(toks[i - 1] || '') && !DAY_WORDS.has(after)) {
      budget.adults = k; take(used, i, 1); continue;
    }
    const money = tok.match(MONEY);
    if (money && Number(money[1]) >= 20) {
      const eur = Number(money[1]);
      take(used, i, 1);
      let j = i + 1;
      const e = matchAt(toks, j, L.euro, used);
      if (e) { take(used, j, e); j += e; }
      const pd = matchAt(toks, j, L.perDay, used);
      if (pd) take(used, j, pd);
      const tt = matchAt(toks, j, L.total, used);
      if (tt) { take(used, j, tt); cues.total = true; }
      if (pd || (eur < 300 && !tt && !cues.total)) budget.perDay = eur;
      else budget.total = eur;
      continue;
    }
  }
  if (budget.perDay && cues.total && !budget.total && budget.perDay >= 200) {
    budget.total = budget.perDay; delete budget.perDay;
  }
  // A small "for 2" read as money before the money cue came: never under 20.

  // Pass 2: where from ("from Biarritz"), then the places asked about.
  for (let i = 0; i < toks.length; i++) {
    if (used[i]) continue;
    const n = matchAt(toks, i, L.origin, used);
    if (!n) continue;
    const ms = placeMentions(toks.slice(0, i + n + 4), used.map((u, j) => u || j < i + n), vocab, new Set());
    const m = ms.find((x) => x.i === i + n);
    if (m) { budget.origin = m.id; take(used, i, n + m.n); }
  }
  // After "when", "what is" or "plan" a name is read as the place first
  // ("when to go to Bergen" is the city, not the Dutch for mountains).
  const mentions = placeMentions(toks, used, vocab, stop, cues.when || cues.about || cues.plan);
  const connectors = new Set(CONNECT[lang] || []).add('or').add('vs').add('versus');
  const isCompare = mentions.length >= 2 && mentions.slice(1).some((m, k) => {
    const prev = mentions[k];
    const between = toks.slice(prev.i + prev.n, m.i);
    return between.length <= 2 && (between.length === 0 || between.some((w) => connectors.has(w)));
  });
  const one = mentions[0];

  let type = 'find';
  if (cues.plan) type = 'plan';
  else if (isCompare) type = 'compare';
  else if (one && cues.when) type = 'when';
  else if (one && cues.about) type = 'about';
  else if (budget.total) type = 'budget';

  // The places of a when, about or compare question are its subject, not a
  // place to search around; take them out before the guided parse.
  const places = [];
  const compare = [];
  if (type === 'compare') {
    for (const m of mentions) { compare.push(m.id); take(used, m.i, m.n); }
    for (let i = 0; i < toks.length; i++) if (!used[i] && connectors.has(toks[i])) used[i] = true;
  } else if (type === 'when' || type === 'about') {
    places.push(one.id); take(used, one.i, one.n);
  }
  if (cues.about) for (let i = 0; i < toks.length; i++) {
    const n = matchAt(toks, i, L.aboutTail, used);
    if (n) take(used, i, n);
  }

  const rest = toks.filter((_, i) => !used[i]).join(' ');
  // A whole question, never a word still being typed: the trailing space
  // keeps parseQuery from holding the last word back as a fragment.
  let parsed = parseQuery(`${rest} `, vocab, lang);
  // "City" is the weakest vibe: beside another ("a romantic city break") the
  // other one is what was asked for.
  if (parsed.parts.some((p) => p.kind === 'vibe' && p.value === 'city')) {
    const bare = rest.split(' ').filter((w) => !CITY_WORDS.has(w)).join(' ');
    const again = parseQuery(`${bare} `, vocab, lang);
    if (again.parts.some((p) => p.kind === 'vibe' && p.value !== 'city')) parsed = again;
  }
  const facets = partsToFacets(parsed.parts, steps);
  // One vibe slot, but a beach or a lake beside another vibe ("a seaside
  // town with great seafood") is still asked for: it becomes the close-by
  // extra, so the answer keeps both.
  const restToks = rest.split(' ');
  for (const [vibe, nb] of [['beach', 'beach'], ['lake', 'lake']]) {
    if (!facets.vibe || facets.vibe === vibe) continue;
    const e = vocab.entries.find((x) => x.kind === 'vibe' && x.value === vibe);
    const said = e?.keys.some((k) => {
      const w = k.split(' ');
      return restToks.some((_, i) => w.every((x, j) => restToks[i + j] === x));
    });
    if (said) facets.nb = [...new Set([...(facets.nb || []), nb])];
  }
  // A quiet place alone is a place out of the crowds too.
  if (facets.vibe === 'quiet') extra.quiet = true;
  // A lone place with a month and nothing else is a question about it
  // ("Annecy in August"), not a search around it.
  if (type === 'find' && facets.near && !facets.vibe && !facets.nb && !facets.budget && facets.month
    && !extra.nocar && !extra.quiet && !budget.total) {
    places.push(facets.near); delete facets.near; delete facets.area; delete facets.country;
    type = 'about';
  }
  const lone = parsed.parts.length === 1 && parsed.parts[0].kind === 'place';
  if (lone && type === 'find') { type = 'about'; places.push(parsed.parts[0].value); }
  if (type === 'find' && facets.near) type = 'near';
  if (type === 'plan' && facets.near) { places.push(facets.near); }
  if (month) facets.month = month;
  if (extra.nocar) facets.nocar = true;
  if (extra.quiet) facets.quiet = true;
  if (extra.warm) facets.warm = true;
  if (budget.perDay) facets.budget = budgetStep(budget.perDay, steps);
  if (facets.sort == null && type === 'when' && /cheap|goedko|billig|gunstig|pas cher|barat|economic/.test(rest)) facets.sort = 'cost';
  for (const k of Object.keys(facets)) if (facets[k] == null) delete facets[k];

  return {
    type,
    facets,
    monthRange,
    budget,
    places,
    compare,
    unknown: parsed.unknown,
    fragment: parsed.fragment,
    text: String(text || '').slice(0, 200),
  };
}

/** True when the Intent holds anything Carta can answer. */
export function intentIsEmpty(intent) {
  return !intent || (intent.type === 'find' && !Object.keys(intent.facets).length
    && !intent.monthRange && !Object.keys(intent.budget).length);
}
