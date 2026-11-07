// T1131 (K10): writes src/data/pressFacts.json, the real counts the press kit
// page shows, from the shipped data. Run after a data refresh:
//   node scripts/press/build-facts.mjs
// The page imports the small JSON, so it never loads the 14 MB master.
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const app = read('public/app_data.json');
const trips = read('public/trips/index.json');
const dests = Object.values(app.destinations);
const facts = {
  destinations: dests.length,
  countries: new Set(dests.map((d) => d.country)).size,
  airports: Object.keys(app.meta.origins).length,
  trips: trips.n_trips,
  languages: 6,
  measuredAt: String(app.meta.generated_at).slice(0, 10),
};
fs.writeFileSync(new URL('src/data/pressFacts.json', root), JSON.stringify(facts, null, 2) + '\n');
console.log(facts);
