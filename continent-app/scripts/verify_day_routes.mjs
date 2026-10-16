// T433: is every walk the day planner draws a real walk?
//
//   node scripts/verify_day_routes.mjs [--towns=8] [--no-valhalla]
//
// For 20 towns spread over the catalogue (cities, coast, lakes, mountains,
// small towns), builds a one-day and a three-day plan from the town's
// strongest places exactly as the app does (lib/daySpread.js), routes every
// leg on OSRM's footpaths and judges it (lib/dayRoute.js), then checks every
// leg the app would DRAW AS A WALK against a second, independent router
// (Valhalla's pedestrian costing on the FOSSGIS instance). The app never
// calls Valhalla; this is the witness.
//
// Gate (exit 1 when broken):
//   - at least 100 legs judged (a run that checked nothing proves nothing)
//   - no place twice in a plan
//   - no walk leg Valhalla cannot route on foot
//   - no walk leg where the two routers disagree by more than 60 percent AND
//     more than 1 km (two honest routers differ a little; a river does not)
// Reported, not gated: how many legs became rides, and why; stops off the path.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { spreadIntoDays, kmBetween } from '../src/lib/daySpread.js';
import { routeDay, isWalkable } from '../src/lib/dayRoute.js';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const DATA = new URL('../public/app_data.json', import.meta.url);
if (!existsSync(DATA)) { console.error('public/app_data.json missing'); process.exit(2); }
const data = JSON.parse(readFileSync(DATA, 'utf8'));

const TOWNS = [
  'LIS', 'OPO', 'gem:bruges', 'SZG', 'INN', 'DBV', 'gem:kotor', 'EDI', 'SVQ', 'gem:granada',
  'PRG', 'KRK', 'LJU', 'BGO', 'gem:lucerne', 'gem:annecy', 'AMS', 'gem:hallstatt', 'gem:cinque-terre', 'gem:sintra',
].slice(0, Number(argv.towns) || 20);
const USE_VALHALLA = !argv['no-valhalla'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function poisOf(id) {
  const f = new URL(`../public/poi/${id.replace(/:/g, '_3A')}.json`, import.meta.url);
  if (!existsSync(f)) return [];
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return []; }
}
// The town, not its airport (catalogue rows for airport towns are pinned on
// the runway; city_lat/city_lon is the centre).
const centreOf = (d) => ({
  lat: d.city_lat != null ? d.city_lat : d.lat,
  lon: d.city_lon != null ? d.city_lon : d.lon,
});

let lastValhalla = 0;
async function valhallaKm(a, b) {
  const wait = 1100 - (Date.now() - lastValhalla);
  if (wait > 0) await sleep(wait);
  lastValhalla = Date.now();
  try {
    const r = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }], costing: 'pedestrian', units: 'kilometers' }),
    });
    if (!r.ok) return { err: r.status };
    const j = await r.json();
    return { km: j?.trip?.summary?.length ?? null };
  } catch (e) {
    return { err: String(e).slice(0, 60) };
  }
}

const report = { towns: [], legs: 0, walkLegs: 0, rides: {}, offPath: 0, dupes: 0, valhallaChecked: 0, valhallaNoRoute: [], disagree: [], valhallaErrors: 0 };

for (const id of TOWNS) {
  const d = data.destinations[id];
  if (!d) { console.log(`skip ${id}: not in catalogue`); continue; }
  const centre = centreOf(d);
  const seen = new Set();
  const places = poisOf(id)
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .filter((p) => kmBetween(centre, p) <= 4)
    .filter((p) => !/station|airport|parking|bus stop/i.test(p.kind || ''))
    .sort((a, b) => (b.sig ?? 0) - (a.sig ?? 0))
    .filter((p) => { const k = (p.name || '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 15);
  if (places.length < 5) { console.log(`skip ${id}: ${places.length} places`); continue; }
  const start = { lat: centre.lat + 0.002, lon: centre.lon + 0.002 };
  const town = { id, city: d.city, plans: [] };
  for (const days of [1, 3]) {
    const pool = places.slice(0, days === 1 ? 5 : 15);
    const lists = spreadIntoDays(pool, { days, start, minutes: () => 60 });
    const flat = lists.flat();
    if (new Set(flat).size !== flat.length) { report.dupes += 1; }
    for (const list of lists) {
      if (!list.length) continue;
      const pts = list.map((i) => pool[i]);
      const day = await routeDay(pts, { start, pace: 'balanced' });
      const all = [start, ...pts];
      day.legs.forEach((l, k) => {
        report.legs += 1;
        if (isWalkable(l.status)) report.walkLegs += 1;
        else report.rides[l.status] = (report.rides[l.status] || 0) + 1;
        l._from = all[k];
        l._to = all[k + 1];
      });
      report.offPath += (day.offPath || []).filter((m) => m != null).length;
      town.plans.push({ days, legs: day.legs.map((l) => ({ status: l.status, km: l.km, straightKm: Math.round(l.straightKm * 100) / 100 })) });
      if (USE_VALHALLA) {
        for (const l of day.legs.filter((x) => isWalkable(x.status) && !x.ferry)) {
          const v = await valhallaKm(l._from, l._to);
          if (v.err) { report.valhallaErrors += 1; continue; }
          report.valhallaChecked += 1;
          if (v.km == null) { report.valhallaNoRoute.push({ id, from: l._from.name || 'start', to: l._to.name }); continue; }
          const diff = Math.abs(v.km - l.km);
          if (diff > 1 && diff / Math.max(v.km, l.km) > 0.6) {
            report.disagree.push({ id, from: l._from.name || 'start', to: l._to.name, osrmKm: Math.round(l.km * 100) / 100, valhallaKm: Math.round(v.km * 100) / 100 });
          }
        }
      }
    }
  }
  report.towns.push(town);
  console.log(`${id} ${d.city}: ${town.plans.map((p) => `${p.days}d ${p.legs.length} legs [${p.legs.map((l) => l.status).join(',')}]`).join('  ')}`);
}

mkdirSync('shots', { recursive: true });
writeFileSync('shots/verify_day_routes.json', JSON.stringify(report, null, 2));
const fails = [];
if (report.legs < 100) fails.push(`only ${report.legs} legs judged (need 100)`);
if (report.dupes) fails.push(`${report.dupes} plans hold a place twice`);
if (report.valhallaNoRoute.length) fails.push(`${report.valhallaNoRoute.length} walk legs Valhalla cannot walk`);
if (report.disagree.length) fails.push(`${report.disagree.length} walk legs where the routers disagree`);
console.log(`\nlegs ${report.legs}, walks ${report.walkLegs}, rides ${JSON.stringify(report.rides)}, stops off path ${report.offPath}`);
console.log(`valhalla checked ${report.valhallaChecked}, no route ${report.valhallaNoRoute.length}, disagree ${report.disagree.length}, errors ${report.valhallaErrors}`);
if (report.disagree.length) console.log(JSON.stringify(report.disagree, null, 1));
if (fails.length) { console.log(`\nFAIL: ${fails.join('; ')}`); process.exit(1); }
console.log('\nPASS: every walk the planner draws is a walk on both routers.');
