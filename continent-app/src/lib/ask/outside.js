/*
 * A place Carta does not cover (T571). The parser drops a name it does not
 * know into Intent.unknown, and a question like "a trip to Dubai in
 * November" then reads as "a trip in November", so the answer plans a week
 * in the Balkans. This finds the name a traveller meant as the destination
 * (an unknown word right after "to", "naar", "nach", "à", "a" or "in") so
 * the answer can say plainly that Carta covers Europe and that place is not
 * in it, instead of answering a different question.
 *
 * T1206 (T1136-b, T1136-c) widened it three ways:
 *   - an article between "in" and the name is skipped, and an article is
 *     never itself the name ("wandern in den Alpen" is not a trip to "Den",
 *     "diving in the Maldives" is a trip to the Maldives);
 *   - an unknown word in front of a place Carta does know makes a different
 *     place ("a week in New York" is not York, England);
 *   - the name of a country outside Europe, in any of the six languages,
 *     anywhere in the question ("the capital of australia");
 *   and a European name the parser misses ("in the Czech Republic") is
 *   never called outside Europe.
 *
 *   outsidePlace(text, intent) -> 'Dubai' | null
 */

// The word before a destination, in the six languages (lower case).
const BEFORE = new Set(['to', 'in', 'into', 'naar', 'nach', 'à', 'au', 'aux', 'en', 'a', 'para', 'per', 'verso']);
// Words that are also ordinary words ("a day", "en" is "and" in Dutch): the name after them must be capitalised.
const NEEDS_CAPITAL = new Set(['a', 'en', 'per', 'para', 'verso']);
// E7 (wave 3): a weaker lead-in ("best time to visit Bangkok", "Reisezeit für Tokio", "voor Tokio").
// A common noun can follow these ("für Kinder"), so the name counts only when it is a place we can
// positively name: a country or city outside Europe, or a town the gazetteer knows (scope.js).
const WEAK = new Set(['visit', 'visiting', 'visiter', 'visitar', 'visitare', 'besuchen', 'bezoeken', 'voor', 'fur', 'pour']);

// Cities outside Europe a traveller asks about, six languages, folded. Countries come from Intl below.
// No name that is also a European town (Lagos, Santiago, Valencia, Cordoba) and none of an ordinary word.
const WORLD_CITIES = [
  'tokyo', 'tokio', 'osaka', 'kyoto', 'kioto', 'bangkok', 'sydney', 'sidney', 'melbourne', 'cape town', 'kaapstad', 'kapstadt', 'le cap',
  'ciudad del cabo', 'citta del capo', 'new york', 'nueva york', 'nieuw york', 'neu york', 'los angeles', 'san francisco', 'las vegas', 'miami',
  'chicago', 'toronto', 'vancouver', 'mexico city', 'ciudad de mexico', 'beijing', 'peking', 'pekin', 'shanghai', 'hong kong', 'hongkong',
  'seoul', 'seoel', 'seul', 'dubai', 'abu dhabi', 'doha', 'mumbai', 'bombay', 'delhi', 'new delhi', 'hanoi', 'ho chi minh city', 'rio de janeiro',
  'buenos aires', 'marrakech', 'marrakesh', 'marrakesch', 'marrakech', 'cairo', 'kairo', 'le caire', 'el cairo', 'il cairo', 'nairobi', 'kathmandu',
  'jakarta', 'manila', 'auckland', 'havana', 'la habana', 'cancun', 'honolulu', 'phuket', 'tel aviv', 'jerusalem', 'jeruzalem', 'jerusalen',
  'gerusalemme', 'casablanca', 'tunis', 'sao paulo', 'kuala lumpur', 'taipei',
  // E7 (wave 3b): famous places outside Europe that Intl does not name, several with a tiny European
  // namesake (Bali, Lima, Goa) that the gazetteer would otherwise place in Europe. Matched before any
  // gazetteer town, so "Two weeks in Bali" stays outside Europe. A hand list because the catalogue only
  // knows Europe. Never a name that is also a sizeable European town (Cartagena, Perth, Guadalajara).
  'bali', 'lombok', 'sumatra', 'borneo', 'ubud', 'langkawi', 'penang', 'siem reap', 'angkor wat', 'luang prabang', 'chiang mai', 'pattaya', 'koh samui',
  'krabi', 'hoi an', 'da nang', 'saigon', 'colombo', 'kandy', 'kerala', 'goa', 'jaipur', 'agra', 'varanasi', 'rishikesh', 'petra', 'wadi rum', 'luxor', 'aswan',
  'giza', 'sharm el sheikh', 'hurghada', 'dahab', 'amman', 'beirut', 'beyrouth', 'muscat', 'riyadh', 'jeddah', 'mecca', 'johannesburg', 'durban', 'okavango',
  'masai mara', 'maasai mara', 'serengeti', 'kilimanjaro', 'arusha', 'mombasa', 'zanzibar', 'sansibar', 'zanzibar', 'victoria falls', 'viktoriafalle', 'chutes victoria',
  'cataratas victoria', 'cascate vittoria', 'lusaka', 'accra', 'dakar', 'abuja', 'addis ababa', 'kigali', 'sahara', 'lima', 'cusco', 'cuzco', 'machu picchu',
  'arequipa', 'patagonia', 'patagonie', 'patagonien', 'patagonie', 'galapagos', 'santiago de chile', 'santiago du chili', 'bogota', 'quito', 'caracas',
  'montevideo', 'medellin', 'cartagena de indias', 'yucatan', 'tulum', 'oaxaca', 'playa del carmen', 'acapulco', 'panama city', 'maui', 'oahu', 'hawaii', 'alaska',
  'yellowstone', 'yosemite', 'grand canyon', 'orlando', 'seattle', 'boston', 'washington dc', 'new orleans', 'nashville', 'san diego', 'montreal', 'quebec city',
  'whistler', 'calgary', 'ottawa', 'brisbane', 'adelaide', 'gold coast', 'uluru', 'tasmania', 'fiji', 'tahiti', 'bora bora', 'rotorua', 'queenstown', 'nagoya',
  'sapporo', 'hiroshima', 'okinawa', 'busan', 'jeju', 'macau', 'macao', 'chengdu', 'xian', 'guangzhou', 'shenzhen', 'lhasa', 'tibet', 'ulaanbaatar', 'almaty',
  'tashkent', 'samarkand', 'bukhara', 'tehran', 'isfahan', 'shiraz', 'himalaya', 'himalayas', 'bangalore', 'chennai', 'kolkata',
].map((n) => n.split(' ')).sort((a, b) => b.length - a.length);

// Articles that can stand between that word and the name: "in den Alpen",
// "in the Maldives", "naar de Ardennen", "dans les Alpes", "a la playa".
const ARTICLES = new Set([
  'the', 'a', 'an',
  'de', 'het', 'een', 'n',
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'le', 'la', 'les', 'l', 'un', 'une', 'du',
  'el', 'los', 'las', 'una', 'unos', 'unas',
  'il', 'lo', 'gli', 'i', 'uno',
]);

// Words that open a longer place name ("New York", "Nueva York").
const NAME_HEADS = new Set(['new', 'nieuw', 'neu', 'nouvelle', 'nueva', 'nuevo', 'nuova', 'san', 'santa', 'saint', 'st', 'los', 'las']);

const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const capital = (w) => /^\p{Lu}/u.test(w);

// What follows "to" without being a place: "where to stay", "what to do"
// (T572's end check read "Where to stay there?" as a trip to "Stay").
const VERBS = new Set([
  'stay', 'go', 'eat', 'do', 'see', 'visit', 'sleep', 'travel', 'fly', 'get', 'find', 'book', 'drink', 'swim', 'hike', 'walk', 'park', 'spend',
  'slapen', 'eten', 'gaan', 'doen', 'zien', 'bezoeken', 'blijven', 'logeren',
  'schlafen', 'essen', 'gehen', 'sehen', 'besuchen', 'bleiben', 'übernachten',
  'dormir', 'manger', 'aller', 'faire', 'voir', 'visiter', 'rester', 'loger',
  'comer', 'ir', 'hacer', 'ver', 'visitar', 'quedarse', 'alojarse',
  'mangiare', 'andare', 'fare', 'vedere', 'visitare', 'restare', 'alloggiare',
].map(fold));

// Europe as Carta reads it, wider than the catalogue so that a European
// country Carta has no places in yet is never called "outside Europe".
const EUROPE = new Set(('AD AL AM AT AX AZ BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GE GG GI GL GR HR HU IE IM IS IT JE '
  + 'LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM TR UA UK VA XK IC EA').split(' '));
// Codes Intl names that are not a country somewhere else (EU, UN, ...).
const NOT_COUNTRY = new Set(['EU', 'EZ', 'UN', 'QO', 'ZZ', 'XA', 'XB', 'AQ', 'BV', 'HM', 'UM', 'TF', 'IO']);
const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];
// European names Intl does not give ("Czech Republic" is "Czechia" there).
const EUROPE_ALIASES = ['czech republic', 'tschechische republik', 'republique tcheque', 'republica checa', 'repubblica ceca',
  'tsjechische republiek', 'holland', 'england', 'engeland', 'scotland', 'schotland', 'schottland', 'ecosse', 'escocia', 'scozia',
  'wales', 'pays de galles', 'gales', 'galles', 'great britain', 'britain', 'groot brittannie', 'grossbritannien', 'grande bretagne',
  'gran bretana', 'gran bretagna', 'northern ireland', 'macedonia', 'bosnia', 'herzegovina', 'europe', 'europa', 'balkans', 'balkan',
  'scandinavia', 'scandinavie', 'skandinavien', 'escandinavia', 'lapland', 'lappland', 'laponie', 'laponia', 'lapponia',
  'sicily', 'sardinia', 'corsica', 'crete', 'canary islands', 'azores', 'madeira', 'balearic islands'];

let europeNames = null;
/** Folded words of every European country name (six languages) and the aliases above. */
function europeWords() {
  if (europeNames) return europeNames;
  europeNames = new Set(EUROPE_ALIASES);
  for (const lang of LANGS) {
    let dn = null;
    try { dn = new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' }); } catch { dn = null; }
    if (!dn) continue;
    for (const code of EUROPE) {
      const name = dn.of(code);
      if (name) europeNames.add(fold(name).split(/[^\p{L}]+/u).filter(Boolean).join(' '));
    }
  }
  return europeNames;
}
const inEurope = (name) => europeWords().has(fold(name).split(/[^\p{L}]+/u).filter(Boolean).join(' '));

let worldNames = null;
/** Folded names (as word lists) of every country outside Europe, six languages. */
function outsideCountries() {
  if (worldNames) return worldNames;
  const names = new Map();
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const lang of LANGS) {
    let dn = null;
    try { dn = new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' }); } catch { dn = null; }
    if (!dn) continue;
    for (const x of A) for (const y of A) {
      const code = x + y;
      if (EUROPE.has(code) || NOT_COUNTRY.has(code)) continue;
      let name;
      try { name = dn.of(code); } catch { name = undefined; }
      if (!name || name === code) continue;
      const key = fold(name).split(/[^\p{L}]+/u).filter(Boolean);
      // Short names are words too ("US", "Oman" stays): four letters at least.
      if (key.join('').length < 4) continue;
      names.set(key.join(' '), key);
    }
  }
  worldNames = [...names.values()].sort((a, b) => b.length - a.length);
  return worldNames;
}

const titled = (name) => name.charAt(0).toUpperCase() + name.slice(1);
const nameKey = (name) => fold(name).split(/[^\p{L}]+/u).filter(Boolean).join(' ');

let outsideKeys = null;
/** True for a country or a city outside Europe, by name, in any of the six languages. */
export function isOutsideName(name) {
  if (!outsideKeys) outsideKeys = new Set([...outsideCountries(), ...WORLD_CITIES].map((k) => k.join(' ')));
  return outsideKeys.has(nameKey(name));
}

/**
 * The name a traveller meant as a destination that Carta may not cover, or null.
 *   { name, sure, weak }
 *   sure  the name is a country or city outside Europe (a list, not a guess)
 *   weak  found after a weak lead-in ("visit", "für"), so only `sure` counts
 * A name that is not `sure` may be a European town Carta lacks: scope.js asks the gazetteer.
 */
export function placeCandidate(text, intent, { bare = false } = {}) {
  if (!intent || intent.compare?.length) return null;
  const unknown = new Set((intent.unknown || []).map(fold));
  if (!unknown.size) return null;
  const words = String(text || '').split(/[\s,.;:!?()"]+/).filter(Boolean);
  const known = !!(intent.places?.length || intent.facets?.near || intent.facets?.country);
  const areaKnown = !!intent.facets?.area;
  for (let i = 0; i < words.length - 1; i++) {
    const lead = words[i].toLowerCase();
    const weak = !BEFORE.has(lead) && WEAK.has(fold(words[i]));
    if (!BEFORE.has(lead) && !weak) continue;
    let j = i + 1;
    while (j < words.length - 1 && ARTICLES.has(fold(words[j]))) j++;
    const w = words[j];
    const f = fold(w);
    if (!unknown.has(f) || VERBS.has(f) || ARTICLES.has(f)) continue;
    if (NEEDS_CAPITAL.has(lead) && !capital(w)) continue;
    const next = words[j + 1];
    // A question that already names a covered area has no second destination: "Sardegna in barca" is
    // not a trip to "Barca". Only a name known to be outside Europe still counts.
    if (areaKnown && !capital(w) && !isOutsideName(w)) continue;
    // An unknown word before a known name makes another place: "New York".
    const head = next && capital(next) && !unknown.has(fold(next)) && (capital(w) || NAME_HEADS.has(f));
    if (known && !head) continue;
    // After an article only a name that looks like one ("in the way" is not a place).
    if (j > i + 1 && !capital(w)) continue;
    let name = w;
    while (j + 1 < words.length && capital(words[j + 1]) && (unknown.has(fold(words[j + 1])) || head)) {
      name += ` ${words[++j]}`;
      if (head && !unknown.has(fold(words[j]))) break;
    }
    // A European name the parser does not know yet is not outside Europe.
    if (inEurope(name)) continue;
    // A longer outside name wins over its first word: "Santiago de Chile" is not Santiago (Spain).
    for (let n = 1; n <= 2 && j + n < words.length && !isOutsideName(name); n++) {
      const longer = `${name} ${words.slice(j + 1, j + 1 + n).join(' ')}`;
      if (isOutsideName(longer)) { name = longer; break; }
    }
    const sure = isOutsideName(name);
    return { name: titled(name), sure, weak, typed: capital(w) };
  }
  // A country or city outside Europe, wherever it stands ("the capital of australia").
  // A one-word city must be unknown to the parser; "New York" has York in it, so it need not be.
  const toks = words.map(fold);
  const world = [...outsideCountries(), ...WORLD_CITIES];
  for (const key of world) {
    if (known && key.length === 1) continue;
    for (let i = 0; i + key.length <= toks.length; i++) {
      if (key.every((k, n) => toks[i + n] === k && (key.length > 1 || unknown.has(k)))) {
        return { name: words.slice(i, i + key.length).map(titled).join(' '), sure: true, weak: false, typed: true };
      }
    }
  }
  // "Is Husum worth it in winter?": a capitalised word the parser does not know, no lead-in.
  // Never positive on its own (not `sure`): scope.js keeps it only if the gazetteer knows the town.
  // Off for German, where every noun is capitalised.
  if (bare && !known) {
    for (let i = 1; i < words.length; i++) {
      const f = fold(words[i]);
      if (!capital(words[i]) || !unknown.has(f) || VERBS.has(f) || ARTICLES.has(f)) continue;
      let name = words[i];
      while (i + 1 < words.length && capital(words[i + 1]) && unknown.has(fold(words[i + 1]))) name += ` ${words[++i]}`;
      if (inEurope(name)) continue;
      return { name: titled(name), sure: isOutsideName(name), weak: true, typed: true };
    }
  }
  return null;
}

/** The old question: a place outside Europe, or null (T571). scope.js is the one caller in the app. */
export function outsidePlace(text, intent) {
  const c = placeCandidate(text, intent);
  return c && (c.sure || !c.weak) ? c.name : null;
}
