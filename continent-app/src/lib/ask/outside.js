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
 *     anywhere in the question ("the capital of australia").
 *
 *   outsidePlace(text, intent) -> 'Dubai' | null
 */

// The word before a destination, in the six languages (lower case).
const BEFORE = new Set(['to', 'in', 'into', 'naar', 'nach', 'à', 'au', 'aux', 'en', 'a', 'para', 'per', 'verso']);

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
  + 'LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM TR UA VA XK').split(' '));
// Codes Intl names that are not a country somewhere else (EU, UN, ...).
const NOT_COUNTRY = new Set(['EU', 'EZ', 'UN', 'QO', 'ZZ', 'XA', 'XB', 'AQ', 'BV', 'HM', 'UM', 'TF', 'IO']);
const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];

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

export function outsidePlace(text, intent) {
  if (!intent || intent.compare?.length) return null;
  const unknown = new Set((intent.unknown || []).map(fold));
  if (!unknown.size) return null;
  const words = String(text || '').split(/[\s,.;:!?()"]+/).filter(Boolean);
  const known = !!(intent.places?.length || intent.facets?.near || intent.facets?.country);
  for (let i = 0; i < words.length - 1; i++) {
    if (!BEFORE.has(words[i].toLowerCase())) continue;
    let j = i + 1;
    while (j < words.length - 1 && ARTICLES.has(fold(words[j]))) j++;
    const w = words[j];
    const f = fold(w);
    if (!unknown.has(f) || VERBS.has(f) || ARTICLES.has(f)) continue;
    const next = words[j + 1];
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
    return titled(name);
  }
  if (known) return null;
  // A country outside Europe, wherever it stands ("the capital of australia").
  const toks = words.map(fold);
  for (const key of outsideCountries()) {
    for (let i = 0; i + key.length <= toks.length; i++) {
      if (key.every((k, n) => toks[i + n] === k && unknown.has(k))) {
        return words.slice(i, i + key.length).map(titled).join(' ');
      }
    }
  }
  return null;
}
