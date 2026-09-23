/**
 * make-fixture.mjs, regenerate scripts/ci/fixtures/contract-min.json.
 *
 * The fixture is the smallest payload that passes the contract: the real meta
 * header, trimmed to the keys validateAppData actually reads, plus two real
 * destinations, one of each tier, trimmed to the required fields. It is
 * committed so the negative checks have something stable to break, and it is
 * generated rather than hand-written so a schema bump can be reflected by
 * re-running this instead of editing JSON by hand.
 *
 *   node scripts/ci/make-fixture.mjs
 *
 * Reads public/app_data.json. Writes only into scripts/ci/fixtures/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..', '..', 'public', 'app_data.json');
const OUT = path.join(HERE, 'fixtures', 'contract-min.json');

const data = JSON.parse(fs.readFileSync(APP, 'utf8'));
const m = data.meta;
const meta = {
  generated_at: m.generated_at,
  schema_version: m.schema_version,
  currency: m.currency,
  start_date: m.start_date,
  end_date: m.end_date,
  defaults: m.defaults,
  baggage_options: m.baggage_options,
  n_destinations: 2,
  is_mock: true,
};

const KEEP = ['id', 'tier', 'iata', 'city', 'country', 'iso2', 'lat', 'lon',
  'city_lat', 'city_lon', 'categories', 'anchor_airport'];
const pick = (d) => Object.fromEntries(
  KEEP.filter((k) => d[k] !== undefined).map((k) => [k, d[k]]));

const entries = Object.entries(data.destinations);
const one = (tier) => entries.find(([, d]) => d.tier === tier);
const chosen = [one('airport'), one('gem')].filter(Boolean);
if (chosen.length !== 2) throw new Error('need one airport and one gem destination');

const destinations = Object.fromEntries(chosen.map(([k, d]) => [k, pick(d)]));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ meta, destinations }, null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), OUT)} `
  + `(${chosen.map(([k]) => k).join(', ')})`);
