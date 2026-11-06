#!/usr/bin/env node
/**
 * T1130 (ROADMAP K5): the yearly basket per country, for Carta's data stories.
 *
 * What a typical week costs one person in each European country, built only
 * from the shipped catalogue (continent-app/public/app_data.json) through the
 * app's own price engine (continent-app/src/lib/price/priceDay.js,
 * `priceDays` with DEFAULT_PRICE_REQUEST). So every number in the story is the
 * number the app shows on the Explore card for the same place.
 *
 * The basket (owner decision B5, the app's default request):
 *   two adults sharing an entire place (stay tier `home`), the Easygoing
 *   lifestyle (config/pricing.json lifestyle.default), any time of year
 *   (the bed is the annual median, no month curve), 7 nights.
 *   week a person = dayEur x 7, where dayEur = bed + food and drink a person
 *   a day. Local transport has no fare anywhere yet (T714-b) and the way
 *   there needs the flight sweep on R2, so neither is in the basket.
 *
 * No network. Deterministic: no clock in the output, so a rerun on the same
 * data gives the same file byte for byte.
 *
 * Run (from the repo root; needs continent-app/node_modules, `npm ci` there):
 *   node scripts/stories/basket_per_country.mjs            write the outputs
 *   node scripts/stories/basket_per_country.mjs --check    fail if they drift
 *   node scripts/stories/basket_per_country.mjs --stdout   print, write nothing
 *
 * Outputs: docs/brand/data-stories/data/basket_2027.json (every figure the
 * drafts use) and basket_2027_countries.csv (one row per country).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = process.env.CARTA_APP || join(ROOT, 'continent-app');
const DATA = join(APP, 'public', 'app_data.json');
const OUT_DIR = join(ROOT, 'docs', 'brand', 'data-stories', 'data');
const OUT_JSON = join(OUT_DIR, 'basket_2027.json');
const OUT_CSV = join(OUT_DIR, 'basket_2027_countries.csv');

if (!existsSync(join(APP, 'node_modules'))) {
  console.error(`No node_modules in ${APP}: run \`npm ci\` there first (the price engine imports app modules).`);
  process.exit(2);
}
const { priceDays } = await import(join(APP, 'src/lib/price/priceDay.js'));
const { DEFAULT_PRICE_REQUEST } = await import(join(APP, 'src/lib/price/request.js'));

// A country with fewer priced places than this is listed but not ranked:
// one or two towns are not "a country" (method note, rule 3).
export const MIN_RANK_N = 10;
const NIGHTS = 7;
const HOME = 'BE'; // the Belgian angle first (owner decision 6)
const SECOND = 'NL';

const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const r0 = (x) => (x == null ? null : Math.round(x));
function quantile(xs, q) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const median = (xs) => quantile(xs, 0.5);
const pct = (a, b) => (a == null || b == null || !b ? null : Math.round(((a - b) / b) * 1000) / 10);

const app = JSON.parse(readFileSync(DATA, 'utf8'));
const meta = app.meta || {};
const dests = app.destinations || {};
const prices = priceDays(dests, DEFAULT_PRICE_REQUEST);

// One row per place the catalogue has.
const places = [];
for (const [id, d] of Object.entries(dests)) {
  const p = prices.get(id);
  const bed = p?.lines?.find((l) => l.key === 'bed');
  const food = p?.lines?.find((l) => l.key === 'food');
  places.push({
    id,
    name: d.city,
    iso2: d.iso2,
    country: d.country,
    class: d.place?.class ?? null,
    day: p?.dayEur ?? null,
    week: p?.dayEur == null ? null : r2(p.dayEur * NIGHTS),
    bed: bed?.eur ?? null,
    food: food?.eur ?? null,
    bedQuality: bed?.quality ?? 'missing',
    bedRepaired: !!bed?.provenance?.repaired,
    tierFallback: !!bed?.basis?.tierFallback,
    captured: d.accommodation?.captured ?? null,
    foodQuality: food?.quality ?? 'missing',
  });
}

const byCountry = new Map();
for (const pl of places) {
  if (!pl.iso2) continue;
  if (!byCountry.has(pl.iso2)) byCountry.set(pl.iso2, []);
  byCountry.get(pl.iso2).push(pl);
}

const foodCountry = meta.food_country || {};
const countries = [];
for (const [iso2, rows] of byCountry) {
  const priced = rows.filter((r) => r.week != null);
  const weeks = priced.map((r) => r.week);
  const caps = rows.map((r) => r.captured).filter(Boolean).sort();
  const sorted = [...priced].sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
  countries.push({
    iso2,
    country: rows[0].country,
    places: rows.length,
    priced: priced.length,
    unpriced: rows.length - priced.length,
    ranked: priced.length >= MIN_RANK_N,
    week_median: r0(median(weeks)),
    week_p25: r0(quantile(weeks, 0.25)),
    week_p75: r0(quantile(weeks, 0.75)),
    day_median: r2(median(priced.map((r) => r.day))),
    bed_night_median: r2(median(priced.map((r) => r.bed))),
    food_day_median: r2(median(priced.map((r) => r.food))),
    bed_share_pct: priced.length
      ? Math.round((median(priced.map((r) => r.bed)) / median(priced.map((r) => r.day))) * 100) : null,
    beds_repaired: priced.filter((r) => r.bedRepaired).length,
    beds_tier_fallback: priced.filter((r) => r.tierFallback).length,
    food_anchor: foodCountry[iso2]?.anchor ?? null,
    beds_captured_from: caps[0] ?? null,
    beds_captured_to: caps[caps.length - 1] ?? null,
    cheapest: sorted[0] ? { id: sorted[0].id, name: sorted[0].name, week: r0(sorted[0].week) } : null,
    dearest: sorted.length ? { id: sorted.at(-1).id, name: sorted.at(-1).name, week: r0(sorted.at(-1).week) } : null,
  });
}
countries.sort((a, b) => (b.ranked - a.ranked) || ((a.week_median ?? 1e9) - (b.week_median ?? 1e9)) || a.iso2.localeCompare(b.iso2));
let rank = 0;
for (const c of countries) c.rank = c.ranked ? ++rank : null;
const ranked = countries.filter((c) => c.ranked);
const home = countries.find((c) => c.iso2 === HOME);
const second = countries.find((c) => c.iso2 === SECOND);
for (const c of countries) {
  c.vs_be_pct = pct(c.week_median, home?.week_median);
  c.vs_be_eur = home && c.week_median != null ? c.week_median - home.week_median : null;
  c.vs_nl_pct = pct(c.week_median, second?.week_median);
}

const allPriced = places.filter((p) => p.week != null);
const placeList = (iso2) => places
  .filter((p) => p.iso2 === iso2 && p.week != null)
  .sort((a, b) => a.week - b.week || a.id.localeCompare(b.id))
  .map((p) => ({ id: p.id, name: p.name, class: p.class, week: r0(p.week), day: p.day, bed: p.bed, food: p.food,
    bed_quality: p.bedQuality, bed_repaired: p.bedRepaired, captured: p.captured }));

const cheaperThanBE = ranked.filter((c) => c.iso2 !== HOME && c.week_median < home.week_median);
const dearerThanBE = ranked.filter((c) => c.iso2 !== HOME && c.week_median > home.week_median);
const foodModel = meta.food_model || {};

const out = {
  task: 'T1130',
  roadmap: 'K5',
  script: 'scripts/stories/basket_per_country.mjs',
  basket: {
    request: 'DEFAULT_PRICE_REQUEST (owner decision B5): 2 adults, entire place (home), Easygoing, any time of year',
    nights: NIGHTS,
    lifestyle: DEFAULT_PRICE_REQUEST.lifestyle,
    stay_tier: DEFAULT_PRICE_REQUEST.stay,
    per: 'one person, one week, EUR',
    included: ['bed (annual median, entire place shared by two, with Carta fee estimate)', 'food and drink (Easygoing week)'],
    not_included: ['the way there (flight sweep on R2, not shipped in app_data)', 'local transport (no fares yet, T714-b)', 'activities, events, car hire'],
    min_rank_n: MIN_RANK_N,
  },
  as_of: {
    catalogue_generated_at: meta.generated_at ?? null,
    schema_version: meta.schema_version ?? null,
    stays_built: meta.stays?.built ?? null,
    beds_captured_from: places.map((p) => p.captured).filter(Boolean).sort()[0] ?? null,
    beds_captured_to: places.map((p) => p.captured).filter(Boolean).sort().at(-1) ?? null,
    food_model: foodModel.version ?? null,
    food_prices_asof: foodModel.asof ?? null,
    food_harvested: foodModel.harvested ?? null,
  },
  honesty: {
    places_in_catalogue: places.length,
    places_priced: allPriced.length,
    places_unpriced: places.length - allPriced.length,
    countries_total: countries.length,
    countries_ranked: ranked.length,
    countries_listed_not_ranked: countries.filter((c) => !c.ranked).map((c) => `${c.iso2} (${c.priced})`),
    beds_repaired_total: allPriced.filter((p) => p.bedRepaired).length,
    beds_tier_fallback_total: allPriced.filter((p) => p.tierFallback).length,
    food_validation: meta.cost_validation ?? null,
    food_loco_mae_pct: foodModel.validation?.leave_one_country_out_mae_pct ?? null,
    food_anchors: foodModel.anchors ?? null,
    stays_fees: meta.stays?.fees ?? null,
  },
  headline: {
    europe_week_median: r0(median(allPriced.map((p) => p.week))),
    be_week_median: home?.week_median ?? null,
    be_rank: home?.rank ?? null,
    nl_week_median: second?.week_median ?? null,
    nl_rank: second?.rank ?? null,
    ranked_countries: ranked.length,
    cheaper_than_be: cheaperThanBE.length,
    dearer_than_be: dearerThanBE.length,
    cheapest_country: ranked[0] ? { iso2: ranked[0].iso2, country: ranked[0].country, week: ranked[0].week_median, vs_be_pct: ranked[0].vs_be_pct } : null,
    dearest_country: ranked.length ? { iso2: ranked.at(-1).iso2, country: ranked.at(-1).country, week: ranked.at(-1).week_median, vs_be_pct: ranked.at(-1).vs_be_pct } : null,
  },
  countries,
  places_be: placeList(HOME),
  places_nl: placeList(SECOND),
};

const json = JSON.stringify(out, null, 2) + '\n';
const cols = ['rank', 'iso2', 'country', 'places', 'priced', 'ranked', 'week_median', 'week_p25', 'week_p75',
  'day_median', 'bed_night_median', 'food_day_median', 'bed_share_pct', 'vs_be_pct', 'vs_be_eur', 'vs_nl_pct',
  'beds_repaired', 'beds_tier_fallback', 'food_anchor', 'beds_captured_from', 'beds_captured_to'];
const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = [cols.join(','), ...countries.map((c) => cols.map((k) => esc(c[k])).join(','))].join('\n') + '\n';

const mode = process.argv[2] || '';
if (mode === '--stdout') {
  process.stdout.write(json);
} else if (mode === '--check') {
  const same = existsSync(OUT_JSON) && existsSync(OUT_CSV)
    && readFileSync(OUT_JSON, 'utf8') === json && readFileSync(OUT_CSV, 'utf8') === csv;
  if (!same) {
    console.error('basket_2027 outputs drift from the shipped data: rerun the script and re-read the drafts.');
    process.exit(1);
  }
  console.log('basket_2027 outputs match the shipped data.');
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_JSON, json);
  writeFileSync(OUT_CSV, csv);
  const h = out.headline;
  console.log(`wrote ${OUT_JSON} and ${OUT_CSV}`);
  console.log(`${out.honesty.places_priced}/${out.honesty.places_in_catalogue} places priced, ${h.ranked_countries} countries ranked; Europe week ${h.europe_week_median}, BE ${h.be_week_median} (rank ${h.be_rank}), NL ${h.nl_week_median} (rank ${h.nl_rank})`);
}
