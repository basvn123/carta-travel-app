/**
 * predict.mjs, the engine's own figures, one row per destination.
 *
 * The benchmark never re-implements the cost engine. It imports computeCosts
 * from continent-app/src/lib/costIndex.js (the function the Explore cards,
 * the receipt and the day planner all price from) and writes what it says
 * for the default lifestyle, the entire-place tier and a party of one. That
 * is Carta's "mid-range" traveller, and the only configuration the benchmark
 * scores.
 *
 *   node tools/benchmark/predict.mjs --app <continent-app dir> --data <app_data.json> --out <file>
 *
 * The app directory must hold node_modules (dates.js imports react), so run
 * it against the main checkout. Output is JSON: { generated, n, rows: [...] }
 * with per row the euro figures, their provenance, the food breakdown and
 * the city-centre coordinate the stay hold-out searches around.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const app = path.resolve(arg('--app', 'continent-app'));
const dataPath = path.resolve(arg('--data', 'app_data/app_data.json'));
const outPath = path.resolve(arg('--out', 'tools/benchmark/work/predictions.json'));

const costIndex = await import(pathToFileURL(path.join(app, 'src/lib/costIndex.js')).href);
const pricing = await import(pathToFileURL(path.join(app, 'src/lib/runtime_pricing.js')).href);

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const dests = data.destinations;
const choices = { lifestyle: pricing.DEFAULT_LIFESTYLE, stay_tier: 'home', group_size: 1 };
const costs = costIndex.computeCosts(dests, choices);

const rows = [];
for (const [id, d] of Object.entries(dests)) {
  const c = costs.get(id);
  if (!c) continue;
  const centre = pricing.cityCoords(d);
  const food = d.costs ? pricing.groundSpendPerPerson(d, 1, pricing.DEFAULT_LIFESTYLE) : null;
  rows.push({
    id,
    city: d.city,
    iso2: d.iso2,
    tier: d.tier,
    lat: centre.lat,
    lon: centre.lon,
    stay_eur: c.stayEur,
    food_eur: c.foodEur,
    day_eur: c.dayEur,
    stay_level: c.stayLevel,
    food_level: c.foodLevel,
    stay_source: d.accommodation?.price_source ?? null,
    stay_anchor: d.accommodation?.source_place ?? null,
    stay_anchor_km: d.accommodation?.source_km ?? null,
    stay_n_listings: d.accommodation?.n_listings ?? null,
    typical_capacity: d.accommodation?.typical_capacity ?? null,
    // The month curve the runtime would apply to this stay: the city's own
    // when it has one, else the global model curve (see accommodationPerPerson).
    stay_seasonality: d.accommodation?.seasonality ?? null,
    food_source: d.costs?.price_source ?? null,
    food_groceries_eur: food?.groceries ?? null,
    food_out_eur: food ? Number((food.total - food.groceries).toFixed(2)) : null,
  });
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({
  generated: new Date().toISOString(),
  data_generated_at: data.meta?.generated_at ?? null,
  schema_version: data.meta?.schema_version ?? null,
  lifestyle: pricing.DEFAULT_LIFESTYLE,
  global_seasonality: data.meta?.accommodation_model?.seasonality
    ?? pricing.DEFAULT_ACCOM_MODEL.seasonality,
  stay_tier: 'home',
  group_size: 1,
  n: rows.length,
  rows,
}, null, 0));
console.log(`predict: ${rows.length} destinations -> ${outPath}`);
