/**
 * spend/parse.js, reading a spend from words (G15). Pure and local: no AI,
 * no network. Two readers:
 *
 *   parseSpeech(text, lang, people)
 *       what the browser's speech recognition heard ("twaalf vijftig lunch
 *       met Sam", "12,50 lunch with Sam") as a draft: the amount, how sure
 *       the amount is, the category, who it was for, who paid, the currency
 *       and a short name. Number words in the six app languages; digits
 *       as the recogniser writes them.
 *
 *   parseReceipt(text)
 *       the text Tesseract read off a receipt photo as lines with amounts,
 *       the line that is most likely the total, the place, the date and
 *       the currency.
 *
 * Neither ever saves anything: the traveller always confirms (Klopt dit?).
 */

/* ───────────── Number words ───────────── */

// One lexicon per language: word (or word stem inside a compound) -> value.
// 100 and 1000 multiply what is before them; the rest add.
const LEX = {
  en: {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
    a: null,
  },
  nl: {
    nul: 0, een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10,
    elf: 11, twaalf: 12, dertien: 13, veertien: 14, vijftien: 15, zestien: 16, zeventien: 17, achttien: 18, negentien: 19,
    twintig: 20, dertig: 30, veertig: 40, vijftig: 50, zestig: 60, zeventig: 70, tachtig: 80, negentig: 90, honderd: 100, duizend: 1000,
  },
  de: {
    null: 0, eins: 1, ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
    elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
    zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
    hundert: 100, tausend: 1000,
  },
  fr: {
    zéro: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
    onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
    vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100, mille: 1000,
  },
  es: {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
    once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
    veinte: 20, veinti: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
    cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600,
    setecientos: 700, ochocientos: 800, novecientos: 900, mil: 1000, veintiún: 21, veintidós: 22, veintitrés: 23, veintiséis: 26,
  },
  it: {
    zero: 0, uno: 1, un: 1, una: 1, due: 2, tre: 3, tré: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
    undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19,
    venti: 20, vent: 20, trenta: 30, trent: 30, quaranta: 40, quarant: 40, cinquanta: 50, cinquant: 50, sessanta: 60, sessant: 60,
    settanta: 70, settant: 70, ottanta: 80, ottant: 80, novanta: 90, novant: 90, cento: 100, mille: 1000, mila: 1000,
  },
};

// Joints inside a compound number word: vijfENtwintig, fünfUNDzwanzig.
const JOINT = { nl: ['en', 'ën'], de: ['und'], fr: ['et'], es: ['y'], it: [], en: ['and'] };
// Words that join two number groups into euros and cents, or a decimal point.
const POINT = { en: ['point'], nl: ['komma'], de: ['komma'], fr: ['virgule'], es: ['coma', 'punto'], it: ['virgola'] };

const langOf = (lang) => (LEX[String(lang || '').slice(0, 2)] ? String(lang).slice(0, 2) : 'en');

/** A word as a list of number values (a compound split up), or null. */
function wordValues(word, lang) {
  const lex = LEX[lang];
  const joints = JOINT[lang] || [];
  if (Object.prototype.hasOwnProperty.call(lex, word)) return lex[word] == null ? null : [lex[word]];
  // Split a compound greedily from the left, longest piece first.
  const out = [];
  let rest = word;
  let guard = 0;
  while (rest && guard < 12) {
    guard += 1;
    let hit = null;
    for (let n = rest.length; n > 1; n -= 1) {
      const piece = rest.slice(0, n);
      if (lex[piece] != null) { hit = piece; break; }
      if (out.length && joints.includes(piece)) { hit = piece; break; }
    }
    if (!hit) return null;
    if (lex[hit] != null) out.push(lex[hit]);
    rest = rest.slice(hit.length);
  }
  if (rest || !out.length) return null;
  // Dutch and German put the unit before the tens (vijfentwintig = 5 + 20);
  // a sum does not care about the order, multipliers do.
  return out;
}

/** Whether value b continues the number that `acc` (so far) is. */
function continues(acc, last, b) {
  if (b === 100 || b === 1000) return acc > 0 && acc < b;
  if (last >= 20 && last < 100 && last % 10 === 0 && b < 10) return true; // twenty five
  if (last === 10 && b < 10) return true; // dix-sept
  if (acc % 100 === 60 && b >= 10 && b < 20) return true; // soixante-dix, soixante-douze
  if (acc % 100 === 80 && b < 20) return true; // quatre-vingt-dix
  if (last === 4 && b === 20) return true; // quatre-vingt
  if (acc >= 100 && acc % 100 === 0 && b < 100) return true; // two hundred fifty
  if (acc >= 1000 && acc % 1000 === 0 && b < 1000) return true;
  return false;
}

/** Folds number values into one number (100 and 1000 multiply). */
function fold(vals) {
  let total = 0;
  let cur = 0;
  for (let i = 0; i < vals.length; i += 1) {
    const v = vals[i];
    if (v === 1000) { total += (cur || 1) * 1000; cur = 0; } else if (v === 100) { cur = (cur || 1) * 100; } else if (v === 20 && cur === 4 && i > 0 && vals[i - 1] === 4) { cur = 80; } else cur += v;
  }
  return total + cur;
}

// A currency by the word or sign heard. "cent" is a number in French.
const CURRENCY_TOKEN = {
  '\u20ac': 'EUR', eur: 'EUR', euro: 'EUR', euros: 'EUR', "euro's": 'EUR',
  '£': 'GBP', gbp: 'GBP', pond: 'GBP', ponden: 'GBP', pound: 'GBP', pounds: 'GBP', pfund: 'GBP', livre: 'GBP', livres: 'GBP',
  libra: 'GBP', libras: 'GBP', sterlina: 'GBP', sterline: 'GBP',
  chf: 'CHF', frank: 'CHF', franken: 'CHF', franc: 'CHF', francs: 'CHF', franco: 'CHF', francos: 'CHF', franchi: 'CHF',
  pln: 'PLN', 'zł': 'PLN', zloty: 'PLN', 'złoty': 'PLN', zlotys: 'PLN',
  czk: 'CZK', 'kč': 'CZK', koruna: 'CZK', korun: 'CZK',
  huf: 'HUF', forint: 'HUF', ron: 'RON', lei: 'RON', leu: 'RON', sek: 'SEK', nok: 'NOK', dkk: 'DKK',
};
const CENT_WORDS = new Set(['cent', 'cents', 'centen', 'céntimos', 'centimos', 'centimes', 'centesimi']);
const isCentWord = (w, lang) => CENT_WORDS.has(w) && !(lang === 'fr' && /^cents?$/.test(w));
const isCurrencyWord = (w, lang) => Object.prototype.hasOwnProperty.call(CURRENCY_TOKEN, w) || isCentWord(w, lang);

// A lone article is not the number one: "een lunch", "ein Kaffee", "un café".
const ARTICLES = { en: [], nl: ['een'], de: ['ein', 'eine', 'einen'], fr: ['un', 'une'], es: ['un', 'una', 'uno'], it: ['un', 'una', 'uno'] };

/**
 * The numbers in a text: [{ value, words: [start, end) token range, digits }].
 * Digits ("12,50", "12.50", "\u20ac12") and number words both count.
 */
function numberGroups(tokens, lang) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const w = tokens[i];
    // Digits as the recogniser writes them, thousands grouped or not:
    // "12,50", "12.5", "1.250", "1,250.00", "\u20ac12".
    const dig = w.match(/^\u20ac?(\d{1,3}(?:[.,]\d{3})+|\d{1,6})(?:[.,](\d{1,2}))?\u20ac?$/);
    if (dig) {
      const value = Number(dig[1].replace(/[.,]/g, '')) + (dig[2] ? Number(dig[2].padEnd(2, '0')) / 100 : 0);
      out.push({ value, from: i, to: i + 1, digits: true, decimals: !!dig[2] });
      i += 1;
      continue;
    }
    const vals = wordValues(w, lang);
    if (!vals) { i += 1; continue; }
    const start = i;
    let all = [...vals];
    let acc = fold(all);
    let last = vals[vals.length - 1];
    i += 1;
    // Further words of the same number: "twenty five", "dos mil", "cent vingt".
    while (i < tokens.length) {
      let j = i;
      if ((JOINT[lang] || []).includes(tokens[j]) && j + 1 < tokens.length) j += 1;
      const next = wordValues(tokens[j], lang);
      if (!next || !continues(acc, last, next[0])) break;
      all = [...all, ...next];
      acc = fold(all);
      last = next[next.length - 1];
      i = j + 1;
    }
    const lone = i === start + 1 && (ARTICLES[lang] || []).includes(w) && !isCurrencyWord(tokens[i] || '', lang);
    if (!lone) out.push({ value: acc, from: start, to: i, digits: false, decimals: false });
  }
  return out;
}

/**
 * Pairs a speech recogniser easily confuses, by language: fifteen and fifty,
 * vijftien and vijftig, fünfzehn and fünfzig; trece and treinta... The
 * amount offers both when it is one of them, with no cents.
 */
function confusable(value, lang) {
  if (!Number.isInteger(value)) return null;
  if (['en', 'nl', 'de'].includes(lang)) {
    if (value >= 13 && value <= 19) return (value - 10) * 10;
    if (value >= 30 && value <= 90 && value % 10 === 0) return value / 10 + 10;
  }
  const pairs = {
    fr: [[2, 12], [3, 13], [4, 14], [6, 16], [60, 70], [80, 90]],
    es: [[2, 12], [3, 13], [60, 70], [6, 7]],
    it: [[2, 12], [3, 13], [60, 70], [6, 7]],
  }[lang] || [];
  for (const [a, b] of pairs) {
    if (value === a) return b;
    if (value === b) return a;
  }
  return null;
}

/* ───────────── What it was ───────────── */

const CAT_WORDS = {
  food: [
    'eten', 'lunch', 'diner', 'ontbijt', 'koffie', 'koffies', 'restaurant', 'pizza', 'bier', 'biertjes', 'ijs', 'ijsjes', 'supermarkt', 'boodschappen', 'drankjes', 'drinken', 'brunch', 'snack', 'snacks', 'taart', 'gebak', 'bakker', 'wijn',
    'food', 'dinner', 'breakfast', 'coffee', 'coffees', 'drinks', 'beer', 'beers', 'groceries', 'supermarket', 'ice', 'cream', 'wine', 'cafe', 'café', 'bakery',
    'essen', 'mittagessen', 'abendessen', 'frühstück', 'kaffee', 'getränke', 'eis', 'wein', 'einkauf', 'einkaufen', 'bäckerei',
    'repas', 'déjeuner', 'dîner', 'petit-déjeuner', 'boissons', 'bière', 'bières', 'courses', 'glace', 'vin', 'boulangerie', 'resto',
    'comida', 'almuerzo', 'cena', 'desayuno', 'cerveza', 'cervezas', 'bebidas', 'helado', 'vino', 'tapas', 'supermercado', 'panadería',
    'pranzo', 'colazione', 'caffè', 'birra', 'birre', 'gelato', 'spesa', 'aperitivo', 'cornetti', 'cornetto',
    'pastéis', 'pastel', 'nata', 'bica',
  ],
  transport: [
    'tram', 'bus', 'metro', 'trein', 'taxi', 'uber', 'bolt', 'benzine', 'tanken', 'parkeren', 'parking', 'veerboot', 'pont', 'fiets', 'huurfiets', 'ov', 'vervoer',
    'train', 'ferry', 'fuel', 'petrol', 'gas', 'subway', 'tube', 'transport', 'ticket',
    'zug', 'bahn', 'fähre', 'tanken', 'parken', 'straßenbahn', 'u-bahn', 's-bahn',
    'métro', 'essence', 'péage', 'navette', 'bateau',
    'tren', 'autobús', 'gasolina', 'peaje', 'barco',
    'treno', 'autobus', 'benzina', 'pedaggio', 'traghetto', 'vaporetto',
  ],
  activities: [
    'kaartjes', 'kaartje', 'tickets', 'entree', 'toegang', 'museum', 'tour', 'rondleiding', 'excursie', 'les', 'paleis', 'kasteel', 'concert', 'voorstelling',
    'entry', 'admission', 'palace', 'castle', 'show', 'tickets',
    'eintritt', 'karten', 'führung', 'schloss', 'konzert',
    'entrée', 'billets', 'billet', 'musée', 'visite', 'château', 'spectacle',
    'entrada', 'entradas', 'museo', 'visita', 'palacio', 'castillo', 'espectáculo',
    'biglietto', 'biglietti', 'ingresso', 'museo', 'visita', 'palazzo', 'castello', 'spettacolo',
  ],
};

const FOR_ALL = ['iedereen', 'allemaal', 'everyone', 'everybody', 'all', 'alle', 'allen', 'jeder', 'tous', 'tout', 'monde', 'todos', 'todas', 'tutti'];
// Matched against ' ' + tokens + ' ', so accented words end cleanly.
const ONLY_ME = [
  / (alleen|enkel) (ik|mij|voor mij) /, / voor mij(zelf)? /, / (just|only) (me|mine|for me) /, / for me /, / myself /,
  / nur (ich|mich|für mich) /, / für mich /, / (juste|seulement) (moi|pour moi) /, / pour moi /,
  / solo (yo|para mí|para mi|io|per me) /, / para m[ií] /, / per me /,
];
const WITH = ['met', 'with', 'mit', 'avec', 'con', 'en', 'and', 'und', 'et', 'y', 'e', 'samen', 'together', 'zusammen'];
const PAID_WORDS = new Set(['betaalde', 'betaald', 'paid', 'bezahlt', 'zahlte', 'payé', 'pagó', 'pagado', 'pagato', 'pagava']);
// Words that carry no meaning for the spend's name.
const FILLER = new Set([
  'ik', 'heb', 'voor', 'de', 'het', 'een', 'van', 'aan', 'op', 'bij', 'in', 'ons', 'onze', 'we', 'wij',
  'i', 'paid', 'spent', 'for', 'the', 'a', 'an', 'of', 'at', 'on', 'our', 'we', 'us', 'to',
  'ich', 'habe', 'für', 'der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'einen', 'im', 'am', 'wir', 'uns',
  'je', "j'ai", 'ai', 'pour', 'le', 'la', 'les', 'du', 'des', 'au', 'aux', 'nous', 'de',
  'yo', 'he', 'para', 'el', 'los', 'las', 'del', 'al', 'nosotros', 'por',
  'io', 'ho', 'per', 'il', 'lo', 'gli', 'i', 'le', 'al', 'alla', 'noi', 'di',
  'speso', 'gastado', 'dépensé', 'ausgegeben', 'uitgegeven', 'betaald', 'betaalde', 'bezahlt', 'payé', 'pagó', 'pagato',
]);

// A number followed by one of these counts things; it is not the amount.
const COUNT_NOUN = /^(x|personen|persoon|people|persons|person|personnes|personne|personas|persona|persone|mensen|leute|keer|times|mal|fois|veces|volte|nachten|nacht|nights|night|nächte|nuits|nuit|noches|noche|notti|notte|dagen|dag|days|day|tage|tag|jours|jour|días|día|giorni|giorno|stuks|stück|pieces|pièces|piezas|pezzi)$/;

const norm = (s) => String(s || '').toLowerCase().normalize('NFC');
const tokenize = (s) => norm(s)
  .replace(/(\d)\s*\u20ac/g, '$1 \u20ac').replace(/\u20ac\s*(\d)/g, '\u20ac $1')
  .replace(/[!?;:"()]/g, ' ')
  .replace(/(\D)[.,](\s|$)/g, '$1 ')
  .replace(/-/g, ' ')
  .split(/\s+/).filter(Boolean);

/**
 * A spoken spend as a draft:
 *   { amount, which: [a, b] | null, currency, cat, mode: 'all'|'each'|'me'|null,
 *     sharers: [ids], payer: id | null, desc }
 * `people` is lib/spend/model kasPeople(). `amount` is null when no number
 * was heard; `which` holds two amounts when the parser cannot tell them
 * apart (the "Welk bedrag hoorde je?" sheet).
 */
export function parseSpeech(text, lang = 'en', people = []) {
  const L = langOf(lang);
  const tokens = tokenize(text);
  const spaced = ` ${tokens.join(' ')} `;
  const groups = numberGroups(tokens, L);
  const used = new Set();
  let amount = null;
  let unsure = false;
  // Which number is the amount: one with cents, else one next to a currency
  // word or sign, else the last ("4 biertjes 18": the price follows what was
  // bought); never a count ("4 personen", "3 nachten").
  const counted = (g) => COUNT_NOUN.test(tokens[g.to] || '');
  const nearCurrency = (g) => isCurrencyWord(tokens[g.to] || '', L) || isCurrencyWord(tokens[g.from - 1] || '', L);
  const joinsWords = (list) => list.every((w) => isCurrencyWord(w, L) || (JOINT[L] || []).includes(w) || (POINT[L] || []).includes(w) || ['en', 'and', 'und', 'et', 'y', 'e', 'con'].includes(w));
  const pool = groups.filter((g) => !counted(g));
  let last = pool[pool.length - 1] || null;
  // "twaalf vijftig": the last number is the cents of the one before it.
  const before = last ? groups[groups.indexOf(last) - 1] : null;
  if (before && !counted(before) && !before.decimals && last.value < 100 && Number.isInteger(last.value)
      && joinsWords(tokens.slice(before.to, last.from)) && last.from - before.to <= 2) last = before;
  const pick = pool.find((g) => g.decimals) || pool.find(nearCurrency) || last;
  if (pick) {
    const g = pick;
    for (let k = g.from; k < g.to; k += 1) used.add(k);
    amount = g.value;
    const second = groups[groups.indexOf(g) + 1];
    // "twaalf vijftig", "twelve euro fifty", "12 komma 5": euros, then cents.
    const between = second ? tokens.slice(g.to, second.from) : [];
    const joins = joinsWords(between);
    const afterSecond = second ? tokens[second.to] : null;
    if (second && !g.decimals && second.value < 100 && Number.isInteger(second.value) && joins && between.length <= 2
        && !(afterSecond && COUNT_NOUN.test(afterSecond))) {
      const point = between.some((w) => (POINT[L] || []).includes(w));
      const cents = point && second.value < 10 && second.to - second.from === 1 && !second.digits ? second.value * 10 : second.value;
      amount = Math.round((g.value + cents / 100) * 100) / 100;
      for (let k = g.to; k < second.to; k += 1) used.add(k);
      if (tokens[second.to] && isCentWord(tokens[second.to], L)) used.add(second.to);
    } else if (!g.decimals && !g.digits) {
      // Only a number heard as words is in doubt; digits are what the
      // recogniser settled on, and asking about "30 euro" costs a tap.
      unsure = confusable(g.value, L) != null;
    }
  }
  const which = unsure ? [amount, confusable(amount, L)].sort((a, b) => a - b) : null;

  let currency = null;
  tokens.forEach((w, k) => {
    if (!isCurrencyWord(w, L)) return;
    used.add(k);
    if (!currency && CURRENCY_TOKEN[w]) currency = CURRENCY_TOKEN[w];
  });

  let cat = null;
  for (const [c, words] of Object.entries(CAT_WORDS)) {
    if (tokens.some((w) => words.includes(w))) { cat = c; break; }
  }

  // Who: names heard, "for everyone", "only me", and who paid.
  const others = (people || []).filter((p) => !p.me && p.name);
  const heard = [];
  others.forEach((p) => {
    const n = norm(p.name);
    const first = n.split(/\s+/)[0];
    const at = tokens.findIndex((w) => w === n || w === first);
    if (at >= 0) { heard.push({ id: p.id, at }); used.add(at); }
  });
  let payer = null;
  const paidAt = tokens.findIndex((w) => PAID_WORDS.has(w));
  if (paidAt >= 0) {
    // "Sam betaalde", "Sam paid": the last name heard before the word.
    const hit = heard.filter((h) => h.at < paidAt).sort((a, b) => a.at - b.at).pop();
    if (hit) payer = hit.id;
  }
  let mode = null;
  let sharers = [];
  if (ONLY_ME.some((re) => re.test(spaced))) mode = 'me';
  else if (tokens.some((w) => FOR_ALL.includes(w))) mode = 'all';
  else {
    // "Sam betaalde taxi met Jo": Sam, Jo and you. A payer alone says who
    // paid, not who it was for.
    const withIds = heard.filter((h) => h.id !== payer).map((h) => h.id);
    if (withIds.length) { mode = 'each'; sharers = ['me', ...(payer ? [payer] : []), ...withIds]; }
  }

  // The name: what is left, without numbers, names, joining and filler words.
  const desc = tokens
    .filter((w, k) => !used.has(k) && !FILLER.has(w) && !WITH.includes(w) && !FOR_ALL.includes(w) && !/^\d/.test(w)
      && !wordValues(w, L) && !PAID_WORDS.has(w) && !COUNT_NOUN.test(w) && !['alleen', 'just', 'only', 'nur', 'juste', 'seulement', 'solo', 'mij', 'me', 'moi', 'mich', 'mí', 'mi', 'enkel'].includes(w))
    .slice(0, 4).join(' ');
  return {
    amount,
    which,
    currency,
    cat,
    mode,
    sharers,
    payer,
    desc: desc ? desc[0].toUpperCase() + desc.slice(1) : '',
  };
}

/* ───────────── Receipts ───────────── */

const TOTAL_WORDS = /\b(total|totaal|totale|totaal bedrag|summe|gesamt|gesamtbetrag|endsumme|zu zahlen|te betalen|a pagar|importe|montant|net a payer|net à payer|à payer|ttc|totale euro|tot\.?|suma|sum|amount due|balance due)\b/i;
const NOT_TOTAL = /\b(subtotal|sub total|subtotaal|zwischensumme|sous total|sous-total|btw|vat|mwst|iva|tva|ust|tax|change|wisselgeld|rückgeld|retour|cambio|resto|rendu|korting|discount|rabatt|remise|descuento|sconto|bar|contanti|contant|cash|espèces|efectivo|entregado|gegeben|pin|karte|carta|card|multibanco|pagato|tendered)\b/i;
// A tender line (what was handed over or charged to a card) is never the
// total, even with a total word on it: NOT_TOTAL wins.
// An amount at the end of a line, thousands grouped by a space, a dot or a
// comma ("1.234,56", "1,234.56", "1 234,56") or not ("1234,56").
const MONEY_AT_END = /(-?\d{1,3}(?:[ .,]\d{3})+[.,]\d{2}|-?\d{1,6}[.,]\d{2})\s*(?:\u20ac|eur|euro|[a-z]{1,2})?\s*$/i;
/** "1.234,56" or "1,234.56" as a number: the last separator is the decimal one. */
const moneyNumber = (t) => {
  const m = String(t).match(/^(-?[\d ,.]*?)[.,](\d{2})$/);
  return m ? Number(`${m[1].replace(/[ ,.]/g, '')}.${m[2]}`) : NaN;
};

/**
 * A receipt's text as
 *   { lines: [{ label, cents }], total: index | null, place, date, currency }
 * `total` is the line with a total word and the largest such amount, else the
 * largest amount. Amounts are in the receipt's own currency.
 */
export function parseReceipt(text) {
  const raw = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const lines = [];
  raw.forEach((l) => {
    const m = l.match(MONEY_AT_END);
    if (!m) return;
    const cents = Math.round(moneyNumber(m[1]) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return;
    const label = l.slice(0, m.index).replace(/[\u20ac*:]+\s*$/, '').trim() || '';
    lines.push({ label, cents, isTotal: TOTAL_WORDS.test(l) && !NOT_TOTAL.test(l) });
  });
  let total = null;
  const totals = lines.map((x, i) => ({ ...x, i })).filter((x) => x.isTotal);
  // The last total line: a receipt prints its total after the items; a
  // "total" further up is a running or a group total.
  if (totals.length) total = totals[totals.length - 1].i;
  else if (lines.length) total = lines.reduce((best, x, i) => (x.cents > lines[best].cents ? i : best), 0);
  const place = raw.find((l) => /[a-zà-ÿ]{3}/i.test(l) && !MONEY_AT_END.test(l) && !/\d{4,}/.test(l)) || '';
  const dm = String(text || '').match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  let date = null;
  if (dm) {
    const y = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
    const mo = Number(dm[2]);
    const d = Number(dm[1]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const low = norm(text);
  let currency = null;
  if (/\u20ac|\beur\b|\beuro/.test(low)) currency = 'EUR';
  else if (/£|\bgbp\b/.test(low)) currency = 'GBP';
  else if (/\bchf\b/.test(low)) currency = 'CHF';
  else if (/\bpln\b|zł/.test(low)) currency = 'PLN';
  else if (/\bczk\b|kč/.test(low)) currency = 'CZK';
  else if (/\bhuf\b|\bft\b/.test(low)) currency = 'HUF';
  return { lines: lines.map(({ label, cents }) => ({ label, cents })), total, place: place.slice(0, 40), date, currency };
}
