// T442: the guided search's logic against the real data, no browser.
//
//   node scripts/verify_guided_search.mjs [--list]
//
// 1. Typed questions in four languages must read as the facets written
//    here, and a word Carta cannot answer must be named, not applied.
// 2. The golden set (pipeline/guided_search_layer.py GOLDEN, twenty
//    questions written before any tuning, T439): how many expected places
//    the catalogue holds land in the top ten of the app's own ranking. The
//    floor is the figure at T442; a change that lowers it fails.
//
// The catalogue is app_data.json with airport gateways merged by city and
// country, the same rule as useExploreCatalog's dedupeGateways.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as gs from '../src/lib/guidedSearch.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const guided = read('public/search/guided.json');
const index = read('public/search_index.json');
const data = read('public/app_data.json');
const LIST = process.argv.includes('--list');
const GOLDEN_FLOOR = 48;

const base = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const winners = new Map();
const rows = [];
for (const [id, d] of Object.entries(data.destinations)) {
  if (d.lat == null || d.lon == null) continue;
  const row = {
    id, city: d.tier === 'airport' ? base(d.city) : d.city, country: d.country, iso2: d.iso2,
    lat: d.lat, lon: d.lon, rating: d.rating, climate: d.climate,
    local_transport: d.local_transport, crowding: d.crowding,
  };
  if (d.tier === 'airport') {
    const k = `${row.city}|${d.iso2}`;
    const prev = winners.get(k);
    if (prev && (prev.rating?.fame ?? 0) >= (row.rating?.fame ?? 0)) continue;
    if (prev) rows.splice(rows.indexOf(prev), 1);
    winners.set(k, row);
  }
  rows.push(row);
}
const countries = [...new Map(rows.map((r) => [r.iso2, r.country])).entries()];
const t = (k) => k;
const vocabs = {};
const vocab = (lang) => (vocabs[lang] ||= gs.buildVocab({ t, lang, guided, rows, countries, index }));
const idOf = (city) => rows.find((r) => r.city === city)?.id;

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });

// ── 1. Questions ──
const STEPS = [40, 60, 80, 100, 130];
const QUESTIONS = [
  ['en', 'hiking in the alps in july', { vibe: 'hiking', area: 'alps', month: 7 }],
  ['en', 'beach town in portugal under 80', { vibe: 'beach', country: 'PT', budget: 80 }],
  ['en', 'castles germany', { vibe: 'castles', country: 'DE' }],
  ['en', 'islands greece september', { vibe: 'island', country: 'GR', month: 9 }],
  ['en', 'quiet village with no car', { vibe: 'village', quiet: true, nocar: true }],
  ['en', 'romantic paris', { vibe: 'romantic', near: idOf('Paris') }],
  ['en', 'beaches near nice', { vibe: 'beach', near: idOf('Nice') }],
  ['en', 'food and wine in tuscany', { vibe: 'food', area: 'tuscany' }],
  ['en', 'lake with trails nearby', { vibe: 'lake', nb: ['trail'] }],
  ['de', 'wandern alpen juli', { vibe: 'hiking', area: 'alps', month: 7 }],
  ['de', 'badeort portugal unter 80', { vibe: 'beach', country: 'PT', budget: 80 }],
  ['nl', 'wandelen in de alpen in juli', { vibe: 'hiking', area: 'alps', month: 7 }],
  ['nl', 'strand griekenland', { vibe: 'beach', country: 'GR' }],
  ['fr', 'randonnee dans les pyrenees en aout', { vibe: 'hiking', area: 'pyrenees', month: 8 }],
  ['en', 'spa under 100', { vibe: 'spa', budget: 100 }],
];
for (const [lang, q, want] of QUESTIONS) {
  const r = gs.parseQuery(`${q} `, vocab(lang), lang);
  const got = gs.partsToFacets(r.parts, STEPS);
  const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
  const same = [...keys].every((k) => JSON.stringify(got[k] ?? null) === JSON.stringify(want[k] ?? null)
    || (want[k] === undefined && (got[k] === null || got[k] === undefined)));
  check(`${lang}: "${q}"`, same && !r.unknown.length,
    same ? '' : `got ${JSON.stringify(got)}${r.unknown.length ? ` unknown ${r.unknown}` : ''}`);
}
{
  const r = gs.completions('skiing in norway ', vocab('en'), 'en');
  check('a word Carta cannot answer is named, not applied', r.unknown.includes('skiing')
    && r.options.length === 1 && r.options[0].parts.every((p) => p.kind !== 'vibe'));
  const p = gs.completions('rome', vocab('en'), 'en');
  check('a place alone offers its page and "near" it', p.options[0]?.open === idOf('Rome')
    && p.options.some((o) => o.parts?.[0]?.kind === 'near'));
  const f = gs.completions('old tow', vocab('en'), 'en');
  check('a phrase completes while it is typed', f.options[0]?.entry?.value === 'oldtown');
  const n = gs.completions('near rom', vocab('en'), 'en');
  check('after "near", places lead', n.options[0]?.entry?.kind === 'near');
  const x = gs.liveExamples(rows.map((r) => ({ ...r, cost: { dayEur: 70 } })), { guided, nearRow: null });
  check('six example questions answer today', x.length === 6, `${x.length}`);
}

// ── 2. The golden set ──
const GOLDEN = [
  [{ vibe: 'lake', country: 'AT' }, ['Hallstatt', 'Zell am See', 'St. Wolfgang im Salzkammergut', 'Bregenz']],
  [{ vibe: 'lake', country: 'IT' }, ['Bellagio', 'Varenna', 'Como', 'Sirmione', 'Riva del Garda', 'Stresa']],
  [{ vibe: 'mountain', country: 'CH' }, ['Zermatt', 'Grindelwald', 'Wengen', 'Lauterbrunnen', 'St. Moritz']],
  [{ vibe: 'hiking', area: 'dolomites' }, ["Cortina d'Ampezzo", 'Ortisei', 'Canazei', 'Selva di Val Gardena']],
  [{ vibe: 'oldtown', country: 'HR' }, ['Dubrovnik', 'Split', 'Rovinj', 'Trogir', 'Korčula']],
  [{ vibe: 'oldtown', country: 'CZ' }, ['Český Krumlov', 'Prague', 'Telč', 'Kutná Hora']],
  [{ vibe: 'castles', country: 'DE' }, ['Füssen', 'Heidelberg', 'Cochem', 'Schwangau']],
  [{ vibe: 'island', country: 'GR' }, ['Santorini', 'Naxos', 'Paros', 'Mykonos', 'Milos', 'Corfu']],
  [{ vibe: 'beach', country: 'PT' }, ['Lagos', 'Albufeira', 'Tavira', 'Carvoeiro']],
  [{ vibe: 'food', country: 'IT' }, ['Bologna', 'Parma', 'Modena', 'Florence', 'Naples']],
  [{ vibe: 'nightlife', country: 'ES' }, ['Ibiza', 'Barcelona', 'Madrid', 'Valencia']],
  [{ vibe: 'spa' }, ['Budapest', 'Baden-Baden', 'Karlovy Vary', 'Bath']],
  [{ vibe: 'art', country: 'NL' }, ['Amsterdam', 'The Hague', 'Rotterdam']],
  [{ vibe: 'hiking', area: 'highlands' }, ['Fort William', 'Aviemore', 'Glencoe']],
  [{ vibe: 'views', country: 'NO' }, ['Flåm', 'Geiranger', 'Bergen', 'Ålesund']],
  [{ vibe: 'beach', area: 'sardinia' }, ['Alghero', 'Villasimius', 'Cala Gonone', 'Olbia']],
  [{ vibe: 'island', country: 'HR' }, ['Hvar', 'Korčula', 'Vis', 'Brač']],
  [{ vibe: 'quiet', area: 'alps' }, ['Hallstatt', 'Alpbach', 'Mürren', 'Gimmelwald', 'Bled']],
  [{ vibe: 'romantic', country: 'FR' }, ['Annecy', 'Colmar', 'Paris', 'Saint-Paul-de-Vence']],
  [{ vibe: 'hiking', area: 'pyrenees' }, ['Torla', 'Benasque', 'Cauterets', 'Gavarnie']],
];
const fold = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
// A catalogue name may carry its valley or island ("Ortisei (Val Gardena)"):
// an expected place matches a name that starts with it.
const names = rows.map((r) => fold(r.city));
const holds = (list, e) => list.some((n) => n === fold(e) || n.startsWith(`${fold(e)} `));
let held = 0; let hit = 0; let full = 0;
for (const [f, expected] of GOLDEN) {
  const ctx = { guided, nearRow: null };
  const top = rows.filter((p) => gs.matchAll(p, f, ctx)).sort(gs.guidedComparator(f, ctx)).slice(0, 10).map((p) => fold(p.city));
  const heldHere = expected.filter((e) => holds(names, e));
  const got = heldHere.filter((e) => holds(top, e));
  held += heldHere.length; hit += got.length;
  if (got.length === heldHere.length) full += 1;
  if (LIST) console.log(`  ${JSON.stringify(f)} ${got.length}/${heldHere.length}${got.length < heldHere.length ? `  missing ${heldHere.filter((e) => !holds(top, e)).join(', ')}` : ''}`);
}
check(`golden set: ${hit} of ${held} expected places in the top ten (floor ${GOLDEN_FLOOR})`, hit >= GOLDEN_FLOOR,
  `${full} of ${GOLDEN.length} questions fully answered`);

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
