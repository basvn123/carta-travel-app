// G8, T1127: placeholder count per screen from the shipped wire, before and after
// the trail photo rule (lib/trailPhoto.js). Run: node scripts/verify_trail_photos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { associateTrip } from '../src/lib/trailCards.js';
import { poolFrom } from '../src/lib/trailPhoto.js';
import { haversineKm } from '../src/lib/nearby.js';

const pub = new URL('../public/', import.meta.url).pathname;
const rd = (p) => JSON.parse(fs.readFileSync(path.join(pub, p), 'utf8'));
const dests = rd('app_data.json').destinations;
const destIndex = Object.values(dests).map((d) => ({ id: d.id, lat: d.lat, lon: d.lon, city: d.city }));
const out = {};

out.destinations = { rows: destIndex.length, placeholder: Object.values(dests).filter((d) => !d.image?.url).length };

for (const [layer, key] of [['beaches', 'beaches'], ['lakes', 'lakes'], ['mountains', 'mountains']]) {
  let rows = 0, none = 0;
  for (const f of fs.readdirSync(path.join(pub, layer))) {
    if (f === 'index.json' || f === 'top.json' || !f.endsWith('.json')) continue;
    for (const r of rd(`${layer}/${f}`)[key] || []) {
      rows += 1;
      if (!(r.images || []).some((i) => i?.u)) none += 1;
    }
  }
  out[layer] = { rows, placeholder: none };
}

let trips = 0, tripsNone = 0;
for (const f of fs.readdirSync(path.join(pub, 'trips'))) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  for (const t of rd(`trips/${f}`).trips || []) { trips += 1; if (!t.img?.url) tripsNone += 1; }
}
out.composedTrips = { rows: trips, placeholder: tripsNone };

// Trails: the old rule is associateTrip with an empty pool and no feature step; replay it here.
const NEAR = 25;
const t = { rows: 0, own: 0, beforeTown: 0, beforeNone: 0, afterFeature: 0, afterTown: 0, afterNear: 0, afterNone: 0 };
for (const f of fs.readdirSync(path.join(pub, 'trails'))) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  const cc = f.slice(0, -5);
  const j = rd(`trails/${f}`);
  const pool = [];
  for (const [layer, kind] of [['beaches', 'beach'], ['lakes', 'lake'], ['mountains', 'peak']]) {
    const p = path.join(pub, layer, `${cc}.json`);
    if (fs.existsSync(p)) pool.push(...poolFrom(kind, JSON.parse(fs.readFileSync(p, 'utf8'))[layer]));
  }
  for (const tr of j.trips || []) {
    t.rows += 1;
    const a = associateTrip(tr, dests, destIndex, pool);
    if (a.photoSource === 'own') { t.own += 1; continue; }
    const b = associateTrip(tr, dests, destIndex, []);
    if (b.photoUrl) t.beforeTown += 1; else t.beforeNone += 1;
    if (a.photoSource === 'feature') t.afterFeature += 1;
    else if (a.photoSource === 'town') t.afterTown += 1;
    else if (a.photoSource === 'near') t.afterNear += 1;
    else t.afterNone += 1;
  }
}
out.trails = { ...t, placeholderBefore: t.beforeNone, placeholderAfter: t.afterNone };
console.log(JSON.stringify(out, null, 1));
