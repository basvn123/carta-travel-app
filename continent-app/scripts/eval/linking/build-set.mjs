#!/usr/bin/env node
/*
 * Builds the place linking test set (T1153, ROADMAP F4): 300 messy mentions,
 * each with the catalogue place it means.
 *
 *   node scripts/eval/linking/build-set.mjs          writes scripts/eval/linking/set.json
 *   node scripts/eval/linking/build-set.mjs --check  exit 1 when set.json differs from a fresh build
 *
 * Four sources, all from the repo:
 *   ask      place words of the Ask eval questions (scripts/eval/ask-set.json),
 *            as the span and as the whole question, in six languages
 *   booking  booking and search strings written in the shape parse-booking
 *            titles and typed search boxes take ("Ryanair to BCN", "Hotel Lisboa Centro")
 *   context  near-twin names (Burgas and Burgos, the two Visegrads) that only a
 *            country or a nearby airport tells apart
 *   typo     seeded typing slips on catalogue names: a dropped, doubled, swapped
 *            or wrong letter, a lost space, a sound-alike spelling. A slip that is
 *            itself another place's name is skipped.
 *
 * Gold is a list of acceptable ids: a city's airports count as one place
 * (Rome is FCO or CIA), the rule the app's own gateway dedupe uses.
 * The split is fixed: even cases are dev (thresholds were set on them), odd are test.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean } from '../../../src/lib/linking/fold.js';

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, '..', '..', '..');
const OUT = join(here, 'set.json');
const J = (p) => JSON.parse(readFileSync(join(APP, p), 'utf8'));

const dest = J('public/app_data.json').destinations;
const index = J('public/search_index.json');
const baseCity = (n) => String(n || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

// name -> ids, and the airport groups
const byName = new Map();
const groupOf = (id) => {
  const d = dest[id];
  if (!d) return null;
  if (d.tier !== 'airport') return id;
  const main = d.gateway_of && dest[d.gateway_of] ? dest[d.gateway_of] : d;
  return `${clean(baseCity(main.city))}|${d.iso2}`;
};
const groups = new Map();
for (const [id, d] of Object.entries(dest)) {
  const k = clean(baseCity(d.city));
  (byName.get(k) || byName.set(k, []).get(k)).push(id);
  const g = groupOf(id);
  (groups.get(g) || groups.set(g, []).get(g)).push(id);
}
const allKeys = new Set([...byName.keys(), ...Object.keys(index.entries)]);

function gold(ref) {
  let ids;
  if (dest[ref]) ids = [ref];
  else {
    ids = byName.get(clean(ref));
    if (!ids) throw new Error(`gold not in the catalogue: ${ref}`);
    const gs = new Set(ids.map(groupOf));
    if (gs.size > 1) throw new Error(`gold name is ambiguous, give an id: ${ref} (${ids.join(', ')})`);
  }
  return [...new Set(ids.flatMap((id) => groups.get(groupOf(id))))].sort();
}

/* ---- ask: spans and whole questions from scripts/eval/ask-set.json ---- */
const ASK = [
  // [ask case id, the place words as written, gold]
  ['g045', 'porto', 'OPO'], ['g046', 'hallstatt', 'gem:hallstatt'], ['g047', 'hallstatt', 'gem:hallstatt'],
  ['g048', 'dubrovnik', 'DBV'], ['g049', 'seville', 'SVQ'], ['g050', 'bergen', 'BGO'],
  ['g051', 'ghent', 'gem:ghent'], ['g052', 'kotor', 'gem:kotor'], ['g053', 'zermatt', 'gem:zermatt'],
  ['g054', 'annecy', 'gem:annecy'], ['g055', 'bruges', 'gem:bruges'], ['g056', 'interlaken', 'gem:interlaken'],
  ['g057', 'ljubljana', 'LJU'], ['g058', 'lisbon', 'LIS'], ['g059', 'split', 'SPU'],
  ['g060', 'innsbruck', 'INN'], ['g061', 'bruges', 'gem:bruges'], ['g062', 'lucca', 'gem:lucca'],
  ['g083', 'porto', 'OPO'], ['g084', 'gent', 'gem:ghent'], ['g085', 'lissabon', 'LIS'],
  ['g097', 'salzburg', 'SZG'], ['g098', 'hallstatt', 'gem:hallstatt'], ['g099', 'innsbruck', 'INN'],
  ['g111', 'seville', 'SVQ'], ['g112', 'annecy', 'gem:annecy'], ['g113', 'dubrovnik', 'DBV'],
  ['g123', 'granada', 'gem:granada'], ['g124', 'cracovia', 'KRK'], ['g125', 'oporto', 'OPO'],
  ['g125', 'lisboa', 'LIS'], ['g135', 'dubrovnik', 'DBV'], ['g136', 'salisburgo', 'SZG'],
  ['g137', 'firenze', 'FLR'], ['g062', 'florence', 'FLR'], ['g060', 'salzburg', 'SZG'],
];
// Whole questions with one place: the linker has to find the place inside the sentence.
const ASK_WHOLE = ['g045', 'g046', 'g048', 'g049', 'g050', 'g051', 'g052', 'g053', 'g054', 'g055',
  'g056', 'g057', 'g083', 'g084', 'g097', 'g098', 'g111', 'g112', 'g123', 'g124', 'g135', 'g136'];

/* ---- booking and search strings ---- */
const BOOKING = [
  ['Ryanair FR 8341 to BCN', 'BCN'], ['Flight to BCN', 'BCN'], ['easyJet U2 3725 Nice', 'NCE'],
  ['Hotel Ibis Lisboa Centro', 'LIS'], ['Apartamento en Sevilla centro', 'SVQ'], ['Pansion Villa Dubrovnik', 'DBV'],
  ['Kraków Balice airport', 'KRK'], ['Krakow Airport (KRK)', 'KRK'], ['Aeroporto di Napoli', 'NAP'],
  ['Flughafen München', 'MUC'], ['Wien Hauptbahnhof', 'VIE'], ['Praha hlavní nádraží', 'PRG'],
  ['B&B in Firenze', 'FLR'], ['Hostel Roma Termini', 'FCO'], ['Venezia Santa Lucia', 'VCE'],
  ['Train to Brugge', 'gem:bruges'], ['Hotel Gent centrum', 'gem:ghent'], ['Antwerpen Centraal', 'gem:antwerp'],
  ['Den Haag Centraal', 'gem:the-hague'], ['Bruxelles-Midi', 'BRU'], ['Brussel Zuid', 'BRU'],
  ['Wizz Air W6 to Budapest', 'BUD'], ['Transavia HV to Málaga', 'AGP'], ['Vueling VY Barcelona El Prat', 'BCN'],
  ['Booking.com: Hotel in Hallstatt, Austria', 'gem:hallstatt'], ['Airbnb Kotor old town', 'gem:kotor'],
  ['Stay at Zermatt chalet', 'gem:zermatt'], ['Rental car pick up Faro airport', 'FAO'],
  ['Ferry to Hvar', 'gem:hvar'], ['Day trip Sintra', 'gem:sintra'], ['Cascais beach day', 'gem:cascais'],
  ['Hotel near Lagos Portugal', 'gem:lagos-pt'], ['Ljubljana bus station', 'LJU'], ['Lake Bled boat', 'gem:bled'],
  ['Bled', 'gem:bled'], ['Cesky Krumlov castle', 'gem:cesky-krumlov'], ['Český Krumlov', 'gem:cesky-krumlov'],
  ['cesky krumlov', 'gem:cesky-krumlov'], ['Zakopane mountain hut', 'gem:zakopane'], ['Gdańsk old town', 'GDN'],
  ['Wrocław Główny', 'WRO'], ['Warszawa Chopin', 'WAW'], ['Tallinn ferry terminal', 'TLL'],
  ['Riga Airport', 'RIX'], ['Vilnius', 'VNO'], ['København H', 'CPH'], ['Kobenhavn', 'CPH'],
  ['Stockholm Arlanda', 'ARN'], ['Oslo Gardermoen', 'OSL'], ['Helsinki-Vantaa', 'HEL'],
  ['Reykjavík Keflavík', 'KEF'], ['Edinburgh Waverley', 'EDI'], ['Dublin Airport T1', 'DUB'],
  ['Belfast City', 'BFS'], ['Cork', 'ORK'], ['Inverness', 'INV'], ['Bath Spa', 'gem:bath'],
  ['York Minster', 'gem:york'], ['Oxford', 'gem:oxford'], ['Cambridge colleges', 'gem:cambridge'],
  ['Cardiff', 'CWL'], ['Lille Flandres', 'gem:lille'], ['Strasbourg Christmas market', 'gem:strasbourg'],
  ['Colmar', 'gem:colmar'], ['Avignon TGV', 'gem:avignon'], ['Carcassonne cité', 'CCF'],
  ['Biarritz', 'BIQ'], ['Montpellier', 'MPL'], ['Toulouse Blagnac', 'TLS'], ['Lyon Part-Dieu', 'LYS'],
  ['Marseille Saint-Charles', 'MRS'], ['Bordeaux', 'BOD'], ['Genève Cornavin', 'GVA'], ['Zürich HB', 'ZRH'],
  ['Basel SBB', 'BSL'], ['Interlaken Ost', 'gem:interlaken'], ['Chamonix-Mont-Blanc', 'gem:chamonix'],
  ['Milano Centrale', 'MXP'], ['Torino Porta Nuova', 'TRN'], ['Genova', 'GOA'], ['Bologna Centrale', 'BLQ'],
  ['Pisa Centrale', 'PSA'], ['Cinque Terre card', 'gem:cinque-terre'], ['Amalfi Coast', 'gem:amalfi-coast'],
  ['Positano', 'gem:amalfi-coast'], ['Sorrento', 'gem:sorrento'], ['Capri ferry', 'gem:capri'],
  ['Taormina', 'gem:taormina'], ['Palermo', 'PMO'], ['Catania Fontanarossa', 'CTA'], ['Matera sassi', 'gem:matera'],
  ['Lecce', 'gem:lecce'], ['Bari', 'BRI'], ['Verona Porta Nuova', 'VRN'], ['Trieste', 'TRS'],
  ['Athina', 'ATH'], ['Athens', 'ATH'], ['Thessaloniki', 'SKG'], ['Santorini', 'JTR'], ['Mykonos', 'JMK'],
  ['Corfu', 'CFU'], ['Kerkyra', 'CFU'], ['Rhodes', 'RHO'], ['Valletta', 'MLA'], ['Malta', 'MLA'], ['Gozo', 'gem:gozo'],
  ['Sofia', 'SOF'], ['Bucharest Otopeni', 'OTP'], ['Belgrade', 'BEG'], ['Sarajevo', 'SJJ'], ['Mostar', 'gem:mostar-ba'],
  ['Tirana', 'TIA'], ['Skopje', 'SKP'], ['Ohrid', 'OHD'], ['Podgorica', 'TGD'], ['Budva', 'gem:budva'],
  ['Zadar', 'ZAD'], ['Rovinj', 'gem:rovinj'], ['Pula', 'PUY'], ['Maribor', 'MBX'],
  ['Bratislava', 'BTS'], ['Gran Canaria', 'LPA'], ['Lanzarote', 'ACE'], ['Ibiza town', 'IBZ'], ['Menorca', 'MAH'],
  ['Palma', 'PMI'], ['Funchal Madeira', 'FNC'], ['San Sebastian', 'gem:san-sebastian'], ['Donostia San Sebastián', 'gem:san-sebastian'],
  ['Bilbao', 'BIO'], ['Toledo day trip', 'gem:toledo'], ['Córdoba', 'gem:cordoba'], ['Ronda', 'gem:ronda'],
  ['Girona', 'GRO'], ['Valencia Joaquín Sorolla', 'VLC'], ['Alicante', 'ALC'], ['Nürnberg', 'NUE'], ['Nuernberg', 'NUE'],
  ['Heidelberg', 'gem:heidelberg'], ['Hamburg Hbf', 'HAM'], ['Berlin Brandenburg', 'BER'], ['Amsterdam Centraal', 'AMS'],
  ['Rotterdam', 'gem:rotterdam'], ['barc', 'BCN'], ['lisb', 'LIS'], ['dubro', 'DBV'],
];

/* ---- context: near-twin names, told apart by country or airport ---- */
const CONTEXT = [
  ['visegrad', 'gem:visegrad', { country: 'BA' }], ['visegrad', 'gem:visegrad-hu', { country: 'HU' }],
  ['Visegrad castle', 'gem:visegrad-hu', { airport: 'BUD' }], ['dinan', 'gem:dinan', {}], ['dinant', 'gem:dinant', {}],
  ['dinan', 'gem:dinant', { country: 'BE' }], ['roma', 'gem:roma', { country: 'SE' }], ['roma', 'FCO', {}],
  ['faro', 'FAO', {}], ['faro', 'gem:faro-gotland', { country: 'SE' }], ['Fårö', 'gem:faro-gotland', {}],
  ['burgos', 'gem:burgos', {}], ['burgas', 'BOJ', {}], ['burgis', 'gem:burgos', { country: 'ES' }],
  ['burgis', 'BOJ', { country: 'BG' }], ['celle', 'gem:celle', {}], ['celje', 'gem:celje', {}],
  ['celye', 'gem:celje', { country: 'SI' }], ['baden', 'gem:baden', { country: 'CH' }], ['boden', 'gem:boden', {}],
  ['essen', 'gem:essen', {}], ['assen', 'gem:assen', { airport: 'GRQ' }], ['gijon', 'gem:gijon', {}],
  ['dijon', 'gem:dijon', { airport: 'LYS' }], ['barga', 'gem:barga', { country: 'IT' }], ['parga', 'gem:parga', { country: 'GR' }],
  ['lefkada', 'gem:lefkada', {}], ['lefkara', 'gem:lefkara', { country: 'CY' }], ['oland', 'gem:oland', {}],
  ['aland', 'gem:aland', { country: 'FI' }], ['ronne', 'gem:ronne', { country: 'DK' }], ['altea', 'gem:altea', {}],
  ['alta', 'gem:alta', { country: 'NO' }], ['soria', 'gem:soria', {}], ['sofia', 'SOF', {}],
  ['matala', 'gem:matala', { country: 'GR' }], ['tortona', 'gem:tortona', {}], ['lliria', 'gem:lliria', { airport: 'VLC' }],
  ['frankfurt', 'FRA', {}], ['frankfurt oder', 'gem:frankfurt-oder', {}], ['devils bridge', 'gem:devils-bridge-wales', { country: 'GB' }],
  ['devils bridge', 'gem:devils-bridge-ardino', { country: 'BG' }],
];

/* ---- typos: seeded slips on catalogue names ---- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const KEYS = 'qwertyuiop asdfghjkl zxcvbnm';
const near = (c) => { const i = KEYS.indexOf(c); if (i < 0) return c; const n = [KEYS[i - 1], KEYS[i + 1]].filter((x) => x && x !== ' '); return n[0] || c; };
const SOUND = [['ph', 'f'], ['c', 'k'], ['k', 'c'], ['v', 'w'], ['w', 'v'], ['ou', 'u'], ['ij', 'y'], ['y', 'i'], ['tt', 't'], ['ll', 'l'], ['ss', 's'], ['z', 's'], ['j', 'y']];
const SLIPS = [
  ['drop', (w, r) => { const i = 1 + Math.floor(r() * (w.length - 2)); return w.slice(0, i) + w.slice(i + 1); }],
  ['double', (w, r) => { const i = 1 + Math.floor(r() * (w.length - 2)); return w.slice(0, i) + w[i] + w.slice(i); }],
  ['swap', (w, r) => { const i = 1 + Math.floor(r() * (w.length - 3)); return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2); }],
  ['key', (w, r) => { const i = 1 + Math.floor(r() * (w.length - 2)); return w.slice(0, i) + near(w[i]) + w.slice(i + 1); }],
  ['sound', (w) => { for (const [a, b] of SOUND) if (w.slice(1).includes(a)) return w[0] + w.slice(1).replace(a, b); return null; }],
  ['space', (w) => (w.includes(' ') ? w.replace(' ', '') : null)],
];

function typos(n) {
  const r = rng(1153);
  // Places a traveller would type: airports and well-rated gems, names of 5 or more letters.
  const pool = Object.entries(dest)
    .filter(([, d]) => clean(baseCity(d.city)).length >= 5 && (d.tier === 'airport' || (d.rating?.score ?? 0) >= 7))
    .map(([id, d]) => [id, clean(baseCity(d.city))]);
  const seen = new Set();
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 20000) {
    const [id, name] = pool[Math.floor(r() * pool.length)];
    const [slip, fn] = SLIPS[out.length % SLIPS.length];
    const typo = fn(name, r);
    if (!typo || typo === name || allKeys.has(typo) || seen.has(typo) || seen.has(id)) continue;
    if (groups.get(groupOf(id)).length > 1 && dest[id].gateway_of) continue;
    seen.add(typo); seen.add(id);
    out.push({ mention: typo, gold: gold(id), src: 'typo', slip });
  }
  return out;
}

export function buildSet() {
  const askCases = Object.fromEntries(J('scripts/eval/ask-set.json').cases.map((c) => [c.id, c]));
  const cases = [];
  for (const [cid, words, ref] of ASK) {
    const q = askCases[cid];
    if (!q || !clean(q.q).includes(clean(words))) throw new Error(`ask case ${cid} does not hold "${words}"`);
    cases.push({ mention: words, gold: gold(ref), src: 'ask', lang: q.lang, from: cid });
  }
  for (const cid of ASK_WHOLE) {
    const q = askCases[cid];
    cases.push({ mention: q.q, gold: gold(q.places[0][0]), src: 'ask-sentence', lang: q.lang, from: cid });
  }
  // A bare catalogue name is not messy: those strings stay out of the set.
  for (const [m, ref] of BOOKING) {
    const ids = gold(ref);
    if (ids.some((id) => clean(baseCity(dest[id].city)) === clean(m))) continue;
    cases.push({ mention: m, gold: ids, src: 'booking' });
  }
  for (const [m, ref, ctx] of CONTEXT) cases.push({ mention: m, gold: gold(ref), src: 'context', ctx });
  cases.push(...typos(300 - cases.length));
  if (cases.length !== 300) throw new Error(`set has ${cases.length} cases, not 300`);
  return {
    version: 1,
    about: 'T1153 place linking set (ROADMAP F4), built by scripts/eval/linking/build-set.mjs. Even cases are dev, odd are test.',
    cases: cases.map((c, i) => ({ id: `l${String(i + 1).padStart(3, '0')}`, split: i % 2 ? 'test' : 'dev', ...c })),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const set = buildSet();
  const text = `${JSON.stringify(set, null, 1)}\n`;
  if (process.argv.includes('--check')) {
    const now = readFileSync(OUT, 'utf8');
    if (now !== text) { console.error('set.json is not what build-set.mjs builds'); process.exit(1); }
    console.log('set.json matches its build');
  } else {
    writeFileSync(OUT, text);
    const by = {};
    for (const c of set.cases) by[c.src] = (by[c.src] || 0) + 1;
    console.log(`wrote ${OUT}: ${set.cases.length} cases`, by);
  }
}
