/*
 * The guided search (T442), the logic half. The owner asked for a search
 * people would use, free, that only lets a traveller ask what Carta can
 * answer (2026-10-13). No model runs here and nothing is sent anywhere:
 * the question is parsed against a closed vocabulary built from Carta's own
 * data (the twenty vibes and forty areas of public/search/guided.json, the
 * catalogue's places and countries, the months, the budget steps and five
 * extras), and the answer is Explore's own list under those filters.
 *
 * A query is a set of facets, the same ones Explore's filters hold:
 *
 *   vibe     one vibe id ("hiking")             xf.vibe   (URL xe)
 *   area     one area id ("alps")               xf.area   (URL xa)
 *   near     one destination id, within 50 km   xf.near   (URL xn)
 *   country  one ISO code                       countryFilter (URL xc)
 *   month    1 to 12                            xf.month  (URL xm)
 *   budget   a day ceiling in euros             xf.budget (URL xb)
 *   nb       ['beach', 'trail', 'lake'] close by xf.nb    (URL xd)
 *   nocar, quiet                                xf flags  (URL xp)
 *
 * So a search is never a second filter system: the chips, the rail, the
 * map and a shared link all show the same thing.
 */
import { foldName } from './searchIndex.js';
import { formatMoney } from './money.js';
import { quietFor } from './crowdMonth.js';
import { noCarOk } from './mobility.js';

/** A vibe counts from the top tenth of its text scores (T439 maps them to
 *  55 to 75); facts score 70 to 100. The list ranks by the score. */
export const VIBE_MIN = 55;
/** "Near Rome" means within this many km of it. */
export const NEAR_KM = 50;
/** The extras: what is close by, and how close counts. */
export const NB_KM = { beach: 10, trail: 8, lake: 10 };
export const EXTRAS = ['beach', 'trail', 'lake', 'nocar', 'quiet'];

// One predicate each, shared by the rails, the filters and the search, so a
// rail's "See all", a chip and a search answer always agree (moved here
// from ExploreTab.jsx in T442).
// T650: "no car needed" reads local_transport.mobility.car_free (good or ok)
// through lib/mobility.js, the same source as the Getting around stat.
export { noCarOk };
export const underOk = (eur) => (p) => p.cost?.dayEur != null && p.cost.dayEur <= eur;
// T649: "not crowded" is the month's tier from lib/crowdMonth.js (the chosen
// month, else the yearly level), the same word the Crowds stat shows.
export const quietOk = (p, when = null) => quietFor(p.crowding, when);
export const monthOk = (m) => (p) => (p.climate?.best || []).includes(m);

export function vibeScore(guided, id, vibe) {
  return guided?.d?.[id]?.v?.[vibe] || 0;
}
export function areasOf(guided, id) {
  return guided?.d?.[id]?.a || [];
}
export function nbKm(guided, id, kind) {
  const v = guided?.d?.[id]?.nb?.[kind];
  return v == null ? null : v;
}

const RAD = Math.PI / 180;
/** Great-circle distance in km between two catalogue rows. */
export function kmBetween(a, b) {
  const la1 = (a.city_lat ?? a.lat) * RAD; const la2 = (b.city_lat ?? b.lat) * RAD;
  const dLa = la2 - la1;
  const dLo = ((b.city_lon ?? b.lon) - (a.city_lon ?? a.lon)) * RAD;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The guided facets as one predicate (vibe, area, near, close by). The
 * other facets are Explore's existing filters and are applied there.
 * `ctx.nearRow` is the row `f.near` names; the place itself is left out of
 * its own "near" list.
 */
export function matchGuided(p, f, ctx) {
  const { guided, nearRow } = ctx;
  if (f.vibe && vibeScore(guided, p.id, f.vibe) < VIBE_MIN) return false;
  if (f.area && !areasOf(guided, p.id).includes(f.area)) return false;
  if (f.near) {
    if (!nearRow || p.id === nearRow.id) return false;
    if (kmBetween(p, nearRow) > NEAR_KM) return false;
  }
  for (const k of f.nb || []) {
    const d = nbKm(guided, p.id, k);
    if (d == null || d > NB_KM[k]) return false;
  }
  return true;
}

/** Every facet at once, for counting an example query over the catalogue. */
export function matchAll(p, f, ctx) {
  if (f.country && p.iso2 !== f.country) return false;
  if (f.month && !monthOk(f.month)(p)) return false;
  if (f.budget && !underOk(f.budget)(p)) return false;
  if (f.nocar && !noCarOk(p)) return false;
  if (f.quiet && !quietOk(p)) return false;
  return matchGuided(p, f, ctx);
}

/**
 * How a guided list is ordered while the reader keeps the default sort:
 * around a place, nearest first; for a vibe, the strongest match first,
 * then the rating, then fame, so of two equally strong matches the one
 * people expect comes first (T439-c). null when neither applies.
 */
export function guidedComparator(f, ctx) {
  const { guided, nearRow } = ctx;
  if (f.near && nearRow) {
    const d = new Map();
    const km = (p) => {
      if (!d.has(p.id)) d.set(p.id, kmBetween(p, nearRow));
      return d.get(p.id);
    };
    return (a, b) => km(a) - km(b);
  }
  if (f.vibe) {
    // Fame before the rating on a tie: on the golden set it puts 45 of 61
    // expected places in the top ten, against 42 the other way (T442).
    return (a, b) => (vibeScore(guided, b.id, f.vibe) - vibeScore(guided, a.id, f.vibe))
      || ((b.rating?.fame ?? 0) - (a.rating?.fame ?? 0))
      || ((b.rating?.score ?? 0) - (a.rating?.score ?? 0));
  }
  return null;
}

const kmFmt = (lang) => {
  const one = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const whole = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
  // Never "0 km": a trail end in the centre reads 0.1.
  return (km) => (km < 10 ? one : whole).format(Math.max(0.1, km));
};

// What each geography vibe can point at as its reason.
const VIBE_NB = { beach: 'beach', hiking: 'trail', lake: 'lake', mountain: 'peak' };
const WHY_NB = { beach: 'gs.whyBeach', trail: 'gs.whyTrail', lake: 'gs.whyLake', peak: 'gs.whyPeak' };

/**
 * The "why" line under a result: at most three short facts, each one a
 * thing the query asked for, read from the data (never a built sentence,
 * so the grammar holds in six languages). Empty when nothing guided is on.
 */
export function whyFacts(p, f, ctx) {
  const { guided, nearRow, t, lang, labels } = ctx;
  const km = kmFmt(lang);
  const out = [];
  if (f.near && nearRow) out.push(t('gs.whyNear', { km: km(kmBetween(p, nearRow)), place: nearRow.city }));
  const nbs = new Set(f.nb || []);
  if (f.vibe && VIBE_NB[f.vibe]) nbs.add(VIBE_NB[f.vibe]);
  for (const k of nbs) {
    const d = nbKm(guided, p.id, k);
    if (d != null) out.push(t(WHY_NB[k], { km: km(d) }));
  }
  if (f.vibe && !VIBE_NB[f.vibe] && labels?.vibe) out.push(labels.vibe(f.vibe));
  if (f.area && labels?.area) out.push(labels.area(f.area));
  if (f.month && labels?.monthInline) out.push(t('gs.whyMonth', { month: labels.monthInline(f.month) }));
  if (f.nocar) out.push(t('filter.noCar'));
  if (f.quiet) out.push(t('filter.notCrowded'));
  return out.slice(0, 3);
}

/**
 * The one way each facet is named on screen, in the reader's language: the
 * chips, the slots, the trigger and the why line all read these.
 */
export function makeLabels({ t, lang, guided, countries }) {
  const vibes = new Map((guided?.vibes || []).map((v) => [v.id, v.label[lang] || v.label.en]));
  const areas = new Map((guided?.areas || []).map((a) => [a.id, a.label[lang] || a.label.en]));
  const names = new Map(countries || []);
  let region = null;
  try { region = new Intl.DisplayNames([lang], { type: 'region' }); } catch { /* old browser */ }
  const mf = new Intl.DateTimeFormat(lang, { month: 'long' });
  const monthInline = (m) => mf.format(new Date(2026, m - 1, 15));
  return {
    vibe: (id) => vibes.get(id) || id,
    area: (id) => areas.get(id) || id,
    country: (iso2) => region?.of(iso2) || names.get(iso2) || iso2,
    month: (m) => { const s = monthInline(m); return s.charAt(0).toUpperCase() + s.slice(1); },
    monthInline,
    budget: (n) => t('explore.budgetUpTo', { eur: formatMoney(n) }),
    extra: (x) => (x === 'nocar' ? t('filter.noCar') : x === 'quiet' ? t('filter.notCrowded') : t(`gs.extra.${x}`)),
  };
}

/* ---- The vocabulary ----------------------------------------------------- */

// Words that carry no facet, per language (English is always on: people
// type English in every language).
export const STOP = {
  en: 'a an the in on at to of for with and or some somewhere place places town towns trip trips holiday holidays travel go going want find me i we in where what when good best nice',
  nl: 'een de het in op naar van voor met en of plek plekken ergens reis vakantie ik wij wil goed mooi',
  de: 'ein eine der die das im in am an auf nach von fur mit und oder ort orte reise urlaub ich wir will gut schon',
  fr: 'un une le la les en au aux a de du des pour avec et ou dans lieu lieux voyage vacances je nous veux bon beau',
  es: 'un una el la los las en a de del para con y o lugar lugares viaje vacaciones yo quiero buen bueno',
  it: 'un una il lo la i gli le in a di del della nel nella per con e o luogo luoghi viaggio vacanza voglio bel bello',
};
export const NEAR = {
  en: ['near', 'around', 'close to', 'next to'],
  nl: ['bij', 'rond', 'vlakbij', 'in de buurt van', 'dichtbij'],
  de: ['bei', 'nahe', 'in der nahe von', 'rund um', 'um'],
  fr: ['pres de', 'autour de', 'a cote de'],
  es: ['cerca de', 'alrededor de', 'junto a'],
  it: ['vicino a', 'intorno a', 'vicino', 'presso'],
};
const UNDER = {
  en: ['under', 'below', 'max', 'less than', 'up to', 'cheaper than'],
  nl: ['onder', 'tot', 'max', 'minder dan', 'hooguit'],
  de: ['unter', 'bis', 'max', 'weniger als', 'hochstens'],
  fr: ['moins de', 'sous', 'max', 'jusqu a'],
  es: ['menos de', 'hasta', 'max', 'por debajo de'],
  it: ['sotto', 'fino a', 'max', 'meno di'],
};
const EURO_WORDS = ['a day', 'per day', 'eur', 'euro', 'euros', 'pp'];
// A typed figure, with or without the euro sign or word before or after it
// ("80", "eur80", "80euro"). The sign is built from its code point, so the
// house money lint never sees a euro literal outside the formatter.
const SIGN = String.fromCharCode(0x20ac);
const FIGURE = new RegExp(`^(?:${SIGN}|eur)?([0-9]{2,4})(?:${SIGN}|eur|euro|euros)?$`);

// English words for the vibes and extras, beside their labels in the
// reader's language (which come from guided.json and i18n).
export const VIBE_WORDS = {
  quiet: ['quiet', 'calm', 'peaceful', 'relaxing', 'relax', 'tranquil'],
  oldtown: ['old town', 'historic', 'medieval', 'old city', 'historic centre', 'historic center'],
  food: ['food', 'wine', 'foodie', 'gastronomy', 'eating', 'cuisine', 'food and wine'],
  romantic: ['romantic', 'romance', 'honeymoon', 'couple', 'couples'],
  family: ['family', 'families', 'kids', 'children', 'family friendly'],
  beach: ['beach', 'beaches', 'seaside', 'sea', 'swim', 'swimming', 'beach town', 'by the sea'],
  island: ['island', 'islands', 'island hopping'],
  mountain: ['mountain', 'mountains', 'alpine', 'mountain village'],
  hiking: ['hiking', 'hike', 'hikes', 'walking', 'walks', 'trekking', 'trek', 'hiking base'],
  lake: ['lake', 'lakes', 'lakeside', 'by a lake'],
  castles: ['castle', 'castles', 'fortress', 'fortresses', 'palace', 'palaces'],
  art: ['art', 'museum', 'museums', 'gallery', 'galleries', 'architecture'],
  nightlife: ['nightlife', 'party', 'parties', 'clubs', 'clubbing', 'bars'],
  nature: ['nature', 'wildlife', 'national park', 'countryside', 'forest'],
  views: ['views', 'view', 'scenic', 'viewpoint', 'viewpoints', 'panorama'],
  spa: ['spa', 'spas', 'thermal', 'thermal baths', 'wellness', 'hot springs'],
  city: ['city', 'cities', 'city break', 'urban', 'big city', 'capital'],
  village: ['village', 'villages', 'small town', 'small towns'],
  unesco: ['unesco', 'world heritage', 'heritage'],
  adventure: ['adventure', 'outdoor', 'outdoors', 'climbing', 'kayak', 'kayaking', 'rafting'],
};
// The everyday words for the same vibes in the other five languages (the
// labels themselves come from guided.json): people type "wandern", not
// "Wanderbasis". Folded, so no accents.
export const VIBE_WORDS_I18N = {
  nl: {
    hiking: ['wandelen', 'wandeling', 'wandelroutes', 'hiken'], beach: ['strand', 'stranden', 'zee', 'zwemmen'],
    mountain: ['bergen', 'berg'], lake: ['meer', 'meren'], food: ['eten', 'wijn'], castles: ['kasteel', 'kastelen', 'burcht'],
    art: ['kunst', 'museum', 'musea'], island: ['eiland', 'eilanden'], nature: ['natuur'], spa: ['thermen', 'wellness'],
    village: ['dorp', 'dorpen'], quiet: ['rustig', 'rust'], nightlife: ['uitgaan', 'feesten'], family: ['gezin', 'kinderen'],
    romantic: ['romantisch'], views: ['uitzicht', 'uitzichten'], city: ['stad', 'steden', 'stedentrip'],
    oldtown: ['oude stad', 'binnenstad', 'historisch'], adventure: ['avontuur'],
  },
  de: {
    hiking: ['wandern', 'wanderung', 'wanderungen'], beach: ['strand', 'strande', 'meer', 'baden'],
    mountain: ['berge', 'berg', 'gebirge'], lake: ['see', 'seen'], food: ['essen', 'wein', 'kulinarik'],
    castles: ['burg', 'schloss', 'schlosser'], art: ['kunst', 'museum', 'museen'], island: ['insel', 'inseln'],
    nature: ['natur', 'nationalpark'], spa: ['therme', 'thermen', 'wellness', 'kur'], village: ['dorf', 'dorfer'],
    quiet: ['ruhig', 'ruhe'], nightlife: ['party', 'ausgehen'], family: ['familie', 'kinder'], romantic: ['romantisch'],
    views: ['aussicht', 'panorama'], city: ['stadt', 'stadte'], oldtown: ['altstadt', 'historisch'], adventure: ['abenteuer'],
  },
  fr: {
    hiking: ['randonnee', 'randonnees', 'rando', 'marche'], beach: ['plage', 'plages', 'mer', 'baignade'],
    mountain: ['montagne', 'montagnes'], lake: ['lac', 'lacs'], food: ['gastronomie', 'vin', 'cuisine'],
    castles: ['chateau', 'chateaux'], art: ['musee', 'musees'], island: ['ile', 'iles'], spa: ['thermes'],
    quiet: ['calme', 'tranquille'], nightlife: ['fete', 'sortir'], family: ['famille', 'enfants'],
    romantic: ['romantique'], views: ['vue', 'vues'], city: ['ville', 'villes'], oldtown: ['vieille ville', 'historique'],
    adventure: ['aventure'],
  },
  es: {
    hiking: ['senderismo', 'caminar', 'rutas'], beach: ['playa', 'playas', 'mar'], mountain: ['montana', 'montanas'],
    lake: ['lago', 'lagos'], food: ['comida', 'vino', 'gastronomia'], castles: ['castillo', 'castillos'],
    art: ['arte', 'museo', 'museos'], island: ['isla', 'islas'], nature: ['naturaleza'], spa: ['balneario', 'termas'],
    village: ['pueblo', 'pueblos'], quiet: ['tranquilo', 'tranquila'], nightlife: ['fiesta', 'marcha'],
    family: ['familia', 'ninos'], romantic: ['romantico', 'romantica'], views: ['vistas'], city: ['ciudad', 'ciudades'],
    oldtown: ['casco antiguo', 'casco viejo', 'historico'], adventure: ['aventura'],
  },
  it: {
    hiking: ['escursionismo', 'escursioni', 'camminare'], beach: ['spiaggia', 'spiagge', 'mare'],
    mountain: ['montagna', 'montagne'], lake: ['lago', 'laghi'], food: ['cibo', 'vino', 'cucina'],
    castles: ['castello', 'castelli'], art: ['arte', 'museo', 'musei'], island: ['isola', 'isole'], nature: ['natura'],
    spa: ['terme', 'benessere'], village: ['borgo', 'borghi', 'paese'], quiet: ['tranquillo', 'tranquilla'],
    nightlife: ['movida', 'discoteche'], family: ['famiglia', 'bambini'], romantic: ['romantico', 'romantica'],
    views: ['panorama', 'vista'], city: ['citta'], oldtown: ['centro storico', 'storico'], adventure: ['avventura'],
  },
};
// "Cheap" in a budget app is a question Carta can answer: the cheapest
// first (T444; the check found "cheap beach in greece" refused).
export const CHEAP_WORDS = {
  en: ['cheap', 'cheapest', 'budget', 'affordable', 'inexpensive', 'low cost', 'on a budget', 'cheapest first'],
  nl: ['goedkoop', 'goedkope', 'goedkoopst', 'betaalbaar', 'betaalbare'],
  de: ['billig', 'gunstig', 'gunstige', 'preiswert', 'preiswerte'],
  fr: ['pas cher', 'bon marche', 'abordable', 'economique'],
  es: ['barato', 'barata', 'baratos', 'economico', 'economica'],
  it: ['economico', 'economica', 'a buon mercato', 'conveniente'],
};
export const EXTRA_WORDS = {
  beach: ['beach nearby', 'near a beach', 'close to a beach'],
  trail: ['trails', 'trail', 'trails nearby', 'walking trails'],
  lake: ['lake nearby', 'near a lake'],
  nocar: ['no car', 'car free', 'without a car', 'without car', 'public transport', 'by train', 'no driving'],
  quiet: ['not crowded', 'uncrowded', 'few tourists', 'no crowds', 'off the beaten track'],
};

// The order a typed word is read in when it could be two things: "lake"
// is the vibe, "trails" the extra.
const KIND_RANK = { vibe: 0, area: 1, country: 2, month: 3, sort: 4, extra: 5, place: 6 };

export const words = (s) => foldName(s).split(/[\s,;/.!?]+/).filter(Boolean);

/**
 * The closed vocabulary for one language: every phrase Carta can answer,
 * folded, mapped to the facet it sets. Built once per language and data.
 *
 *   ctx: { t, lang, guided, rows, countries: [[iso2, name]], index }
 *   index: public/search_index.json once loaded (aliases, member villages)
 */
export function buildVocab(ctx) {
  const { t, lang, guided, rows, countries, index } = ctx;
  const byKey = new Map();
  const entries = [];
  const add = (entry, keys) => {
    entries.push(entry);
    entry.keys = [];
    for (const k of keys) {
      const f = words(k).join(' ');
      if (!f || entry.keys.includes(f)) continue;
      entry.keys.push(f);
      if (!byKey.has(f)) byKey.set(f, []);
      byKey.get(f).push(entry);
    }
  };
  for (const v of guided?.vibes || []) {
    add({ kind: 'vibe', slot: 'what', value: v.id, label: v.label[lang] || v.label.en },
      [v.label[lang] || '', v.label.en, ...(VIBE_WORDS[v.id] || []), ...(VIBE_WORDS_I18N[lang]?.[v.id] || [])]);
  }
  for (const a of guided?.areas || []) {
    add({ kind: 'area', slot: 'where', value: a.id, label: a.label[lang] || a.label.en, group: a.kind },
      [a.label[lang] || '', a.label.en, a.id]);
  }
  const regionName = (() => {
    try { return new Intl.DisplayNames([lang], { type: 'region' }); } catch { return null; }
  })();
  const regionEn = (() => {
    try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
  })();
  for (const [iso2, name] of countries || []) {
    const local = regionName?.of(iso2) || name;
    add({ kind: 'country', slot: 'where', value: iso2, label: local },
      [local, name, regionEn?.of(iso2) || '']);
  }
  const monthLong = new Intl.DateTimeFormat(lang, { month: 'long' });
  const monthShort = new Intl.DateTimeFormat(lang, { month: 'short' });
  const monthEn = new Intl.DateTimeFormat('en', { month: 'long' });
  for (let m = 1; m <= 12; m++) {
    const d = new Date(2026, m - 1, 15);
    const long = monthLong.format(d);
    add({ kind: 'month', slot: 'when', value: m, label: long.charAt(0).toUpperCase() + long.slice(1) },
      [long, monthShort.format(d).replace('.', ''), monthEn.format(d)]);
  }
  add({ kind: 'sort', slot: 'budget', value: 'cost', label: t('gs.cheapest') },
    [t('gs.cheapest'), ...CHEAP_WORDS.en, ...(CHEAP_WORDS[lang] || [])]);
  for (const x of EXTRAS) {
    const label = x === 'nocar' ? t('filter.noCar') : x === 'quiet' ? t('filter.notCrowded') : t(`gs.extra.${x}`);
    add({ kind: 'extra', slot: 'extras', value: x, label }, [label, ...(EXTRA_WORDS[x] || [])]);
  }
  // Places: the list's own (merged) catalogue, by name, and through the
  // search index's aliases and member villages ("Roma", "Positano").
  const byId = new Map((rows || []).map((p) => [p.id, p]));
  const placeEntry = new Map();
  const placeFor = (p, alias) => {
    let e = placeEntry.get(p.id);
    if (!e) {
      e = { kind: 'place', slot: 'where', value: p.id, label: p.city, sub: p.country,
        weight: (p.rating?.fame ?? 0) + (p.rating?.score ?? 0) };
      placeEntry.set(p.id, e);
      add(e, [p.city]);
    }
    if (alias) {
      const f = words(alias).join(' ');
      if (f && !e.keys.includes(f)) {
        e.keys.push(f);
        if (!byKey.has(f)) byKey.set(f, []);
        byKey.get(f).push(e);
      }
    }
  };
  for (const p of rows || []) placeFor(p);
  if (index?.entries) {
    for (const [key, list] of Object.entries(index.entries)) {
      for (const row of list) {
        const p = byId.get(row[1]);
        if (p) placeFor(p, key);
      }
    }
  }
  return { byKey, entries, places: [...placeEntry.values()] };
}

function phraseAt(toks, i, phrases) {
  for (const ph of phrases) {
    const w = ph.split(' ');
    if (w.every((x, j) => toks[i + j] === x)) return w.length;
  }
  return 0;
}

function pick(list, preferPlace) {
  return [...list].sort((a, b) => {
    if (preferPlace) {
      const pa = a.kind === 'place' ? 0 : 1; const pb = b.kind === 'place' ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return (KIND_RANK[a.kind] - KIND_RANK[b.kind]) || ((b.weight || 0) - (a.weight || 0));
  })[0];
}

const hasPrefix = (vocab, frag) => {
  for (const k of vocab.byKey.keys()) if (k.startsWith(frag)) return true;
  return false;
};

/**
 * A typed question read against the vocabulary. Returns the parts it
 * recognised (one per slot, extras may be several), the words it could
 * not place, and the trailing fragment while the reader is still typing:
 * the last one to three words, when some phrase starts with them.
 *
 *   parseQuery('hiking in the alps in jul', vocab, 'en')
 *   -> { parts: [hiking, Alps], unknown: [], fragment: 'jul' }
 */
export function parseQuery(text, vocab, lang) {
  let toks = words(text);
  const midWord = text.length > 0 && !/[\s,;]$/.test(text);
  const stop = new Set(`${STOP.en} ${STOP[lang] || ''}`.split(' '));
  const nearWords = [...(NEAR[lang] || []), ...NEAR.en].map((s) => words(s).join(' ')).sort((a, b) => b.length - a.length);
  const underWords = [...(UNDER[lang] || []), ...UNDER.en].map((s) => words(s).join(' ')).sort((a, b) => b.length - a.length);
  let fragment = '';
  if (midWord && toks.length) {
    for (let L = Math.min(3, toks.length); L >= 1; L--) {
      const ph = toks.slice(-L).join(' ');
      if (hasPrefix(vocab, ph)) { fragment = ph; toks = toks.slice(0, -L); break; }
    }
  }
  const parts = [];
  const unknown = [];
  let near = false;
  let i = 0;
  while (i < toks.length) {
    let n = phraseAt(toks, i, nearWords);
    if (n) { near = true; i += n; continue; }
    n = phraseAt(toks, i, underWords);
    if (n) { i += n; continue; }
    const tok = toks[i];
    const num = tok.match(FIGURE);
    if (num) {
      parts.push({ kind: 'budget', slot: 'budget', value: Number(num[1]) });
      i += 1;
      const e = phraseAt(toks, i, EURO_WORDS);
      i += e;
      continue;
    }
    let found = null;
    let len = 0;
    for (let L = Math.min(4, toks.length - i); L >= 1; L--) {
      const key = toks.slice(i, i + L).join(' ');
      const list = vocab.byKey.get(key);
      if (list) { found = pick(list, near); len = L; break; }
    }
    if (found) {
      if (near && found.kind === 'place') {
        parts.push({ ...found, kind: 'near', slot: 'where', label: found.label });
      } else {
        parts.push(found);
      }
      near = false;
      i += len;
      continue;
    }
    if (stop.has(tok)) { i += 1; continue; }
    unknown.push(tok);
    i += 1;
  }
  // "Quiet" beside another vibe is the crowding extra ("a quiet village"
  // is a village out of the crowds), so one vibe slot can hold the other.
  const vibes = parts.filter((p) => p.kind === 'vibe');
  if (vibes.length > 1) {
    for (let j = 0; j < parts.length; j++) {
      if (parts[j].kind === 'vibe' && parts[j].value === 'quiet') {
        const q = vocab.entries.find((e) => e.kind === 'extra' && e.value === 'quiet');
        if (q) parts[j] = q;
      }
    }
  }
  // One per slot (the later word wins), extras may stack.
  const seen = new Map();
  for (const p of parts) seen.set(slotKey(p), p);
  let out = [...seen.values()];
  // A place beside anything else is where to search around ("beaches near
  // Nice", "Nice beaches"); alone it is the place itself.
  if (out.length > 1) out = out.map((p) => (p.kind === 'place' ? { ...p, kind: 'near' } : p));
  return { parts: out, unknown, fragment, near };
}

const slotKey = (p) => (p.slot === 'extras' ? `x:${p.value}` : p.kind === 'sort' ? 'sort' : p.slot);

function mergeParts(base, part) {
  const merged = [...base.filter((p) => slotKey(p) !== slotKey(part)), part];
  return merged.length > 1 ? merged.map((p) => (p.kind === 'place' ? { ...p, kind: 'near' } : p)) : merged;
}

/**
 * What the listbox offers for the text typed so far. Every option is a
 * question Carta can answer:
 *
 *   { key, parts }          apply these facets
 *   { key, open: id }       open this place's page
 *
 * `entry` is the vocabulary entry the option completes (for its slot word),
 * absent on the "the whole question" option.
 */
export function completions(text, vocab, lang, max = 8) {
  const q = parseQuery(text, vocab, lang);
  const out = [];
  const base = q.parts;
  const frag = q.fragment;
  if (!frag && base.length) {
    if (base.length === 1 && base[0].kind === 'place') {
      const e = base[0];
      out.push({ key: `p:${e.value}`, open: e.value, entry: e });
      out.push({ key: `n:${e.value}`, parts: [{ ...e, kind: 'near' }], entry: { ...e, kind: 'near' } });
    } else {
      out.push({ key: 'all', parts: base });
    }
  }
  if (frag && frag.length >= 2) {
    const hits = [];
    for (const e of vocab.entries) {
      let rank = -1;
      for (const k of e.keys) {
        if (e.kind === 'place' && k !== e.keys[0] && k !== frag) continue;
        const r = k === frag ? 0 : k.startsWith(frag) ? 1 : k.split(' ').some((w) => w.startsWith(frag)) ? 2 : -1;
        if (r >= 0 && (rank < 0 || r < rank)) rank = r;
      }
      if (rank < 0 || (e.kind === 'place' && frag.length < 3)) continue;
      hits.push({ e, rank });
    }
    // After "near" only places make sense, so they lead. A place found by
    // an inner word ("como" in "Lake Como") is offered only when nothing
    // starts with the fragment.
    const starts = hits.some((h) => h.rank < 2);
    const kept = q.near ? hits.filter((h) => h.e.kind === 'place') : hits.filter((h) => !(starts && h.rank === 2 && h.e.kind === 'place'));
    hits.length = 0;
    hits.push(...kept);
    hits.sort((a, b) => (a.rank - b.rank)
      || (KIND_RANK[a.e.kind] - KIND_RANK[b.e.kind])
      || ((b.e.weight || 0) - (a.e.weight || 0)));
    let places = 0;
    for (const { e } of hits) {
      if (out.length >= max) break;
      if (e.kind === 'place') {
        if (places >= 4) continue;
        places += 1;
        const near = { ...e, kind: 'near' };
        if (!q.near && !base.length) out.push({ key: `p:${e.value}`, open: e.value, entry: e });
        if (out.length < max) out.push({ key: `n:${e.value}`, parts: mergeParts(base, near), entry: near });
        continue;
      }
      out.push({ key: `${e.kind}:${e.value}`, parts: mergeParts(base, e), entry: e });
    }
  }
  return {
    options: out.slice(0, max),
    unknown: frag && !out.length ? [...q.unknown, frag] : q.unknown,
    parsed: base,
  };
}

/** The budget steps a typed figure lands on: the smallest step that is not
 *  under it, or the top step. */
export function budgetStep(n, steps) {
  return steps.find((s) => s >= n) || steps[steps.length - 1];
}

/**
 * Parts to a facet delta. Where is one choice: an area, a country or a
 * place to search around, never two at once.
 */
export function partsToFacets(parts, steps) {
  const f = {};
  for (const p of parts) {
    if (p.kind === 'vibe') f.vibe = p.value;
    if (p.kind === 'month') f.month = p.value;
    if (p.kind === 'budget') f.budget = budgetStep(p.value, steps);
    if (p.kind === 'sort') f.sort = p.value;
    if (p.kind === 'area') Object.assign(f, { area: p.value, country: null, near: null });
    if (p.kind === 'country') Object.assign(f, { country: p.value, area: null, near: null });
    if (p.kind === 'near') Object.assign(f, { near: p.value, area: null, country: null });
    if (p.kind === 'extra') {
      if (p.value === 'nocar') f.nocar = true;
      else if (p.value === 'quiet') f.quiet = true;
      else f.nb = [...new Set([...(f.nb || []), p.value])];
    }
  }
  return f;
}

/** Example questions offered under "Try one". Only the ones that return at
 *  least three places today are shown, so an example never lands empty. */
export const EXAMPLES = [
  { vibe: 'hiking', area: 'alps', month: 7 },
  { vibe: 'beach', country: 'PT', budget: 80 },
  { vibe: 'oldtown', nocar: true },
  { vibe: 'lake', country: 'IT', month: 6 },
  { vibe: 'food', area: 'tuscany' },
  { vibe: 'island', country: 'GR', month: 9 },
  { vibe: 'spa', budget: 100 },
  { vibe: 'castles', country: 'DE' },
  { vibe: 'quiet', area: 'dolomites' },
  { vibe: 'village', nb: ['beach'], month: 6 },
];

export function liveExamples(rows, ctx, n = 6) {
  const out = [];
  for (const f of EXAMPLES) {
    if (out.length >= n) break;
    let hits = 0;
    for (const p of rows) {
      if (matchAll(p, f, ctx) && ++hits >= 3) break;
    }
    if (hits >= 3) out.push(f);
  }
  return out;
}
