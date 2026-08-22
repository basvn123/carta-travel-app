// Checks the Carta algorithm against the shipped catalogue, under plain node.
//
//   node scripts/verify_carta_route.mjs
//
// Three things have to hold, and only the first is about being clever:
//
//   the routed order is never longer than the order it was handed
//   a stop keeps at least one night, and the nights add up to the window
//   a published trip's own order is left alone (the pipeline sequenced it)

import { readFileSync } from 'node:fs';
import {
  routeOrder, routeStats, allocateNights, planRoute, stopSaturation,
} from '../src/lib/cartaRoute.js';

const data = JSON.parse(readFileSync(new URL('../public/app_data.json', import.meta.url), 'utf8'));
const dests = data.destinations;
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });

// A shuffled Italian loop: the classic case nearest neighbour gets wrong.
const IT = ['FCO', 'VCE', 'FLR', 'NAP', 'MXP', 'TRN'].filter((id) => dests[id]);
check('the fixture cities are in the catalogue', IT.length === 6, IT.join(','));

const shuffled = [IT[0], IT[3], IT[1], IT[5], IT[2], IT[4]];
const before = routeStats(shuffled, dests).km;
const routed = routeOrder(shuffled, dests);
const after = routeStats(routed, dests).km;
check('routing never lengthens the trip', after <= before, `${before} km -> ${after} km`);
check('routing untangles this one', after < before * 0.75, `${before} km -> ${after} km`);
check('every city survives the routing', routed.length === shuffled.length
  && shuffled.every((id) => routed.includes(id)), routed.join(' > '));
check('the routed order reads as a line up Italy',
  routed.join(',') === 'NAP,FCO,FLR,VCE,MXP,TRN' || routed.join(',') === 'TRN,MXP,VCE,FLR,FCO,NAP',
  routed.map((id) => dests[id].city).join(' > '));

// Fixing the first stop is how an arrival city stays the arrival city.
const pinned = routeOrder(shuffled, dests, { fixFirst: true });
check('a pinned first stop stays first', pinned[0] === shuffled[0], pinned[0]);

// Nights: the window is spent, nobody gets zero, and the biggest place gets
// more than the smallest.
const { nights } = allocateNights(routed, dests, 12);
const total = Object.values(nights).reduce((a, b) => a + b, 0);
check('the nights add up to the window', total === 12, String(total));
check('no stop is left with none', Object.values(nights).every((n) => n >= 1), JSON.stringify(nights));
const rome = nights.FCO;
const turin = nights.TRN;
check('a fuller city earns more nights', rome >= turin, `Rome ${rome}, Turin ${turin}`);
check('saturation follows what there is to do',
  stopSaturation(dests.FCO) > stopSaturation(dests.TRN),
  `${stopSaturation(dests.FCO).toFixed(2)} vs ${stopSaturation(dests.TRN).toFixed(2)}`);

// Pace moves nights between stops without changing the total.
const relaxed = allocateNights(routed, dests, 12, { pace: 'relaxed' }).nights;
const packed = allocateNights(routed, dests, 12, { pace: 'packed' }).nights;
check('pace keeps the window', Object.values(relaxed).reduce((a, b) => a + b, 0) === 12
  && Object.values(packed).reduce((a, b) => a + b, 0) === 12);
check('a packed trip spreads out more than a relaxed one',
  Math.max(...Object.values(packed)) <= Math.max(...Object.values(relaxed)),
  `packed max ${Math.max(...Object.values(packed))}, relaxed max ${Math.max(...Object.values(relaxed))}`);

// Fewer nights than stops: the tail is handed back rather than zeroed.
const short = allocateNights(routed, dests, 3);
check('too few nights drops stops out loud', short.dropped.length === 3
  && Object.values(short.nights).every((n) => n === 1), JSON.stringify(short.dropped));

// The whole answer in one call.
const plan = planRoute({ ids: shuffled, destinations: dests, totalNights: 12 });
check('planRoute reports what it saved', plan.kmSaved === plan.kmBefore - plan.km && plan.kmSaved > 0,
  `${plan.kmSaved} km`);
check('planRoute keeps hours honest', plan.hours > 0 && plan.hours < 60, String(plan.hours));
check('a six-stop fortnight is not flagged as crowded', plan.crowded === false, String(plan.moveShare));

// A two-day dash across the same six cities is.
const dash = planRoute({ ids: shuffled, destinations: dests, totalNights: 6 });
check('a hurried version is flagged', dash.crowded === true, String(dash.moveShare));

// Degenerate input comes back untouched rather than throwing.
check('one stop routes to itself', routeOrder([IT[0]], dests).length === 1);
check('an unknown id cannot crash it', routeOrder(['nope', IT[0]], dests).length >= 1);
check('no coordinates means no reordering',
  routeOrder(['a', 'b'], { a: { lat: null, lon: null }, b: { lat: 1, lon: 1 } }).join(',') === 'a,b');

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
