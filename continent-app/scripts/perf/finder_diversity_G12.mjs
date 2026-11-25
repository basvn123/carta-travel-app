// G12 lane R1 (plan rethink): how often the finder's top 6 share one
// country on real answer sets, before and after lib/recommend/diversify.js.
// Measured first, so the diverse top set is a fix for a seen problem
// (explore-recommendations.md "Gaps": read from code, not measured).
//
//   node scripts/perf/finder_diversity_G12.mjs [path/to/app_data.json]
//
// The same inputs as finder_rank1_G12.mjs: the real catalogue, layer
// indexes and country insights next to it, the swept BRU fixture.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findTrips } from '../../src/lib/recommend/rank.js';
import { normalizeSettings } from '../../src/planner/flow/tripSettings.js';
import { countryShare, diverseOrder } from '../../src/lib/recommend/diversify.js';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataPath = process.argv[2] || path.join(APP, 'public', 'app_data.json');
if (!existsSync(dataPath)) {
  console.error(`No catalogue at ${dataPath}; pass the path to app_data.json.`);
  process.exit(1);
}
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const PUB = path.dirname(dataPath);
const readPub = (p) => (existsSync(path.join(PUB, p)) ? JSON.parse(readFileSync(path.join(PUB, p), 'utf8')) : null);
const rawInsights = readPub('country_insights.json');
const countryInsights = rawInsights?.countries || rawInsights || {};
const layerIndexes = Object.fromEntries(['trails', 'beaches', 'lakes', 'mountains', 'cycling'].map((k) => [k, readPub(`${k}/index.json`)]));

const flights = JSON.parse(readFileSync(path.join(APP, 'tests', 'fixtures', 'tf1-flights-BRU.json'), 'utf8'));
const at = Math.floor(Date.now() / 60000) - 30;
for (const side of [flights.to, flights.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
flights.checked = at;
flights.from = 'BRU';
const origin = { iata: 'BRU', lat: 50.85, lon: 4.35, name: 'Brussels' };
const today = new Date().toISOString().slice(0, 10);

const CASES = {
  'couple, food, May': { party: { kind: 'couple', adults: 2 }, when: { mode: 'months', months: [5], nights: 7 }, guide: { likes: ['food'] } },
  'family, beach+nature, any': { party: { kind: 'family', adults: 2, kids: 2, kidAges: [6, 9] }, when: { mode: 'any', nights: 7 }, guide: { likes: ['beach', 'nature'] } },
  'solo, culture, April dates': { party: { kind: 'solo', adults: 1 }, when: { mode: 'exact', start: '2027-04-10', end: '2027-04-15', nights: 5 }, guide: { likes: ['culture'] } },
  'train, couple, June': { party: { kind: 'couple', adults: 2 }, way: 'train', when: { mode: 'months', months: [6], nights: 7 }, guide: { likes: ['nature'] } },
  'friends, nightlife, Sept': { party: { kind: 'friends', adults: 4 }, when: { mode: 'months', months: [9], nights: 4 }, guide: { likes: ['nightlife'] } },
  'couple, beach, August': { party: { kind: 'couple', adults: 2 }, when: { mode: 'months', months: [8], nights: 7 }, guide: { likes: ['beach'] } },
  'couple, city, March, 3 nights': { party: { kind: 'couple', adults: 2 }, when: { mode: 'months', months: [3], nights: 3 }, guide: { likes: ['city'] } },
  'solo, hiking, July': { party: { kind: 'solo', adults: 1 }, when: { mode: 'months', months: [7], nights: 7 }, guide: { likes: ['hiking'] } },
};

let before = 0;
let after = 0;
let n = 0;
for (const [name, raw] of Object.entries(CASES)) {
  const settings = normalizeSettings({ answered: ['who', 'when', 'from'], ...raw });
  const input = { data, countryInsights, layerIndexes, settings, taste: null, origin, flights, lifestyle: null, stayTier: null, today };
  const ranked = findTrips(input);
  const a = countryShare(ranked);
  const b = countryShare(diverseOrder(ranked));
  n += 1;
  if (a.countries === 1 && ranked.length >= 2) before += 1;
  if (b.countries === 1 && ranked.length >= 2) after += 1;
  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log(`${name}: ${ranked.length} trips; top 6 before: ${a.countries} countries, largest ${a.top} ${pct(a.share)}; after: ${b.countries} countries, largest ${b.top} ${pct(b.share)}; rank 1 kept: ${diverseOrder(ranked)[0]?.id === ranked[0]?.id}`);
}
console.log(`answer sets with a one-country top 6: before ${before}/${n}, after ${after}/${n}`);
