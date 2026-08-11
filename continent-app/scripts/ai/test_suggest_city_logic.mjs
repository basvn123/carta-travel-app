/**
 * Tests for the suggest-city Edge Function's pure logic (supabase/functions/
 * suggest-city/logic.mjs): candidate/suggestion sanitizers and the cache key.
 * Run from the repo root or continent-app:
 *
 *   node continent-app/scripts/ai/test_suggest_city_logic.mjs
 *
 * No network, no keys: the AI reply can come back malformed or hallucinated
 * (this endpoint allows web discoveries beyond the catalogue), so this is
 * the half that must provably reject bad data on its own.
 */
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const logicPath = resolve(here, '../../../supabase/functions/suggest-city/logic.mjs');
const { sanitizeTownCandidates, sanitizeSuggestions, cacheKeyInput } = await import(pathToFileURL(logicPath).href);

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
};

/* ---- sanitizeTownCandidates ---- */
const rawCands = [
  { id: 'brussels-be', name: 'Brussels', country: 'Belgium', km: 0.4, rating: 8.1, tags: ['nature', 'hidden_gem'] },
  { id: 'ghent-be', name: 'Ghent', country: 'Belgium', km: 39, rating: 8.6, tags: [] },
  { id: 'bruges-be', name: 'Bruges', country: 'Belgium', km: 39.2 },
  { id: '', name: 'No id', country: 'Nowhere', km: 5 },
  { id: 'no-name', name: '', country: 'Nowhere', km: 5 },
  { id: 'brussels-be', name: 'Duplicate id', country: 'Belgium', km: 1 },
];
const cands = sanitizeTownCandidates(rawCands);
check('candidates: keeps valid, drops empty id/name/dupe', cands.length === 3, `got ${cands.length}`);
check('candidates: km rounded and non-negative', cands.every((c) => Number.isInteger(c.km) && c.km >= 0));
check('candidates: missing rating stays null, not coerced to 0',
  cands.find((c) => c.id === 'bruges-be').rating === null);
check('candidates: tags capped and cleaned',
  cands.find((c) => c.id === 'brussels-be').tags.join(',') === 'nature,hidden_gem');

/* ---- sanitizeSuggestions ---- */
const stay = { lat: 50.85, lon: 4.35 };
const raw = [
  { id: 'ghent-be', name: 'Ghent', country: 'Belgium', why: 'Canals and old town', inCatalog: true },
  { id: 'ghent-be', name: 'Ghent again', country: 'Belgium', why: 'dupe', inCatalog: true },
  { id: 'nonexistent', name: 'Hallucinated catalogue id', country: 'X', why: 'w', inCatalog: true },
  {
    name: 'Lier', country: 'Belgium', why: 'A quiet, lesser-known town', inCatalog: false, lat: 51.13, lon: 4.57,
  },
  {
    name: 'Restaurant On The Moon', country: 'X', why: 'w', inCatalog: false, lat: 20, lon: 4.35,
  },
  { name: 'No coords web pick', country: 'X', why: 'w', inCatalog: false },
];
const suggestions = sanitizeSuggestions(raw, cands, stay);
check('suggestions: catalogue pick kept with our name/country', suggestions.some((s) => s.id === 'ghent-be' && s.inCatalog));
check('suggestions: duplicate catalogue id dropped', suggestions.filter((s) => s.id === 'ghent-be').length === 1);
check('suggestions: hallucinated catalogue id dropped', !suggestions.some((s) => s.name.includes('Hallucinated')));
check('suggestions: near web discovery kept', suggestions.some((s) => s.name === 'Lier' && !s.inCatalog));
check('suggestions: far web discovery dropped', !suggestions.some((s) => s.name.includes('On The Moon')));
check('suggestions: web discovery with no coords dropped', !suggestions.some((s) => s.name === 'No coords web pick'));

// Without a stay point, radius checks relax (a discovery just needs coords).
const noStay = sanitizeSuggestions(raw, cands, null);
check('suggestions: no stay point still requires coordinates',
  !noStay.some((s) => s.name === 'No coords web pick') && noStay.some((s) => s.name.includes('On The Moon')));

// maxSuggestions is honoured.
const many = Array.from({ length: 10 }, (_, i) => ({
  name: `Place ${i}`, country: 'X', why: 'w', inCatalog: false, lat: 50.86, lon: 4.36,
}));
check('suggestions: capped at maxSuggestions', sanitizeSuggestions(many, cands, stay).length === 5);

/* ---- cacheKeyInput ---- */
const base = {
  model: 'm', stay, focus: 'city', interests: ['food', 'museums'], freeText: 'Quiet canals', lang: 'en', candidates: cands, grounded: true,
};
check('cache key: stable', cacheKeyInput(base) === cacheKeyInput({ ...base }));
check('cache key: free text case-folded', cacheKeyInput(base) === cacheKeyInput({ ...base, freeText: 'quiet canals' }));
check('cache key: interest order does not matter',
  cacheKeyInput(base) === cacheKeyInput({ ...base, interests: ['museums', 'food'] }));
check('cache key: grounding toggle changes the key',
  cacheKeyInput(base) !== cacheKeyInput({ ...base, grounded: false }));
check('cache key: nearby stay points share a key (rounded)',
  cacheKeyInput(base) === cacheKeyInput({ ...base, stay: { lat: 50.8501, lon: 4.3499 } }));
check('cache key: distant stay points differ',
  cacheKeyInput(base) !== cacheKeyInput({ ...base, stay: { lat: 48.85, lon: 2.35 } }));
check('cache key: different free text differs',
  cacheKeyInput(base) !== cacheKeyInput({ ...base, freeText: 'A big city' }));

if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll suggest-city logic tests passed.');
