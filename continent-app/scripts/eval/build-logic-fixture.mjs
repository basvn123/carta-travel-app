#!/usr/bin/env node
/*
 * Cut the small committed places fixture of the logic golden sets (G1, ROADMAP G4)
 * out of the wire file. CI has no public/ folder, so the golden harness reads
 * tests/fixtures/logic-golden/places.json, not the wire.
 *
 *   node scripts/eval/build-logic-fixture.mjs [path/to/app_data.json]
 *
 * Only the fields the engines read are kept (rating, taste, climate, crowding,
 * class, categories). Run it again only to refresh the data; the golden cases
 * name places by id and say why, so a refresh that changes a "current" case
 * shows up as a failing gate, on purpose.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '../..');
const src = process.argv[2] || resolve(APP, 'public/app_data.json');
export const FIXTURE_IDS = [
  'FAO', 'gem:st-anton', 'gem:zermatt', 'gem:chamonix', 'NCE', 'SZG', 'DBV', 'gem:hallstatt', 'gem:taormina',
  'JTR', 'JMK', 'SVQ', 'ATH', 'LIS', 'OPO', 'BCN', 'PRG', 'VIE', 'BUD', 'FLR', 'AMS', 'BRU', 'gem:bruges',
  'CPH', 'EDI', 'gem:interlaken', 'gem:lucerne', 'gem:cinque-terre', 'INN', 'SPU', 'gem:kotor', 'BGO', 'MAD',
  'KRK', 'gem:bled', 'gem:sorrento', 'gem:lagos-pt', 'gem:albufeira', 'MRS', 'gem:annecy', 'gem:colmar', 'MUC',
  'BER', 'LJU', 'TLL', 'RIX', 'DUB', 'gem:york', 'VLC', 'gem:granada', 'gem:matera', 'BLQ', 'VRN', 'HER',
  'gem:sopot', 'gem:canazei', 'gem:parnu', 'HEL', 'gem:sintra', 'gem:ghent', 'gem:garmisch', 'RVN',
];

const wire = JSON.parse(readFileSync(src, 'utf8')).destinations;
const keep = (id) => {
  const d = wire[id];
  if (!d) throw new Error(`${id} is not in the wire file`);
  return {
    id, city: d.city, iso2: d.iso2, categories: d.categories || [], place: { class: d.place?.class ?? null },
    rating: { score: d.rating?.score ?? null, fame: d.rating?.fame ?? null, ...(d.rating?.month_scores ? { month_scores: d.rating.month_scores } : {}) },
    taste: d.taste ? { likes: d.taste.likes, size: d.taste.size, crowd_by_month: d.taste.crowd_by_month, car_need: d.taste.car_need, cost_level: d.taste.cost_level, tmax_by_month: d.taste.tmax_by_month } : null,
    climate: d.climate ? { m: d.climate.m, best: d.climate.best, ...(d.climate.heat ? { heat: d.climate.heat } : {}), ...(d.climate.fire ? { fire: d.climate.fire } : {}) } : null,
    crowding: d.crowding ? { tier: d.crowding.tier, monthly: d.crowding.monthly } : null,
  };
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(APP, 'tests/fixtures/logic-golden/places.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ _about: 'Real places cut from the wire by scripts/eval/build-logic-fixture.mjs (G1). Fields the engines read; nothing else.', built: JSON.parse(readFileSync(src, 'utf8')).meta?.built ?? null, places: FIXTURE_IDS.map(keep) })}\n`);
  console.log(`wrote ${out}`);
}
