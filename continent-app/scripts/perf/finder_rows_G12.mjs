// G12 lane R2 (plan rethink): which themed rows the finder's real lists
// give per start, from the trips already priced (no new pricing).
//
//   node scripts/perf/finder_rows_G12.mjs [path/to/app_data.json]
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findTrips } from '../../src/lib/recommend/rank.js';
import { normalizeSettings } from '../../src/planner/flow/tripSettings.js';
import { diverseOrder } from '../../src/lib/recommend/diversify.js';
import { themedRows, startOf } from '../../src/lib/recommend/rows.js';
import { crowdTier, dayHighs } from '../../src/lib/recommend/compare.js';
import { thereMinutes } from '../../src/planner/finder/finderText.js';

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
const d = data.destinations || {};
const acc = { minutes: thereMinutes, highs: (x) => dayHighs(x, d), crowd: (x) => crowdTier(x, d) };

const CASES = {
  'open (nothing known)': { party: { kind: 'couple', adults: 2 }, when: { mode: 'any', nights: 7 }, guide: { likes: ['food'] } },
  'month (May)': { party: { kind: 'couple', adults: 2 }, answered: ['when'], when: { mode: 'months', months: [5], nights: 7 }, guide: { likes: ['beach'] } },
  'budget 900 cap': { party: { kind: 'couple', adults: 2 }, when: { mode: 'any', nights: 7 }, guide: { likes: ['city'], budget: { kind: 'total', eur: 900, mode: 'cap' } } },
};
for (const [name, raw] of Object.entries(CASES)) {
  const settings = normalizeSettings({ ...raw, answered: ['who', 'from', ...(raw.answered || [])] });
  const ranked = diverseOrder(findTrips({ data, countryInsights, layerIndexes, settings, taste: null, origin, flights, lifestyle: null, stayTier: null, today }));
  const rows = themedRows(ranked, { ...acc, settings, topIds: ranked.slice(0, 6).map((x) => x.id) });
  console.log(`${name} [${startOf(settings)}]: ${ranked.length} trips; rows: ${rows.map((r) => `${r.key} ${r.n} (${r.extra} new)`).join(', ') || 'none'}`);
}
