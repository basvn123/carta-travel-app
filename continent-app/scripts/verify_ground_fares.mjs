// Locks the ground-fare fallback guarantee: every train / bus / ferry leg the
// planner offers resolves to a finite, positive, provenance-flagged price
// through groundFares.js, across the whole resolution chain (real quote, then
// calibration artifact, then built-in priors), and a NaN coordinate can never
// price a leg.
//
//   node scripts/verify_ground_fares.mjs        (from continent-app/)
//
// The identity checks re-derive a handful of fares with the pre-resolver
// formulas: if one fails, the resolver changed PRICES, not just structure,
// which is exactly what this refactor promised not to do.

import { legTransportOptions, transferModesFromKm, airportTransferOptions } from '../src/lib/transport.js';
import { resolveGroundFare, setGroundFareCalibration, getGroundFareCalibration } from '../src/lib/groundFares.js';
import { haversineKm } from '../src/lib/runtime_pricing.js';
import { round2 } from '../src/lib/math.js';

let failed = 0;
const ok = (cond, name, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
};

const D = (id, city, country, iso2, lat, lon, extra = {}) => ({
  id, city, country, iso2, lat, lon, ...extra,
});

// City-centre coordinates, spanning 16 countries and every leg family the
// planner prices: dense rail, weak rail, no rail, free transport, sea
// crossings and a cross-border average.
const DEST = {
  ghent: D('gne', 'Ghent', 'Belgium', 'BE', 51.0543, 3.7174),
  brussels: D('bru', 'Brussels', 'Belgium', 'BE', 50.8466, 4.3528),
  paris: D('par', 'Paris', 'France', 'FR', 48.8566, 2.3522),
  lyon: D('lys', 'Lyon', 'France', 'FR', 45.764, 4.8357),
  berlin: D('ber', 'Berlin', 'Germany', 'DE', 52.52, 13.405),
  munich: D('muc', 'Munich', 'Germany', 'DE', 48.1351, 11.582),
  prague: D('prg', 'Prague', 'Czechia', 'CZ', 50.0755, 14.4378),
  vienna: D('vie', 'Vienna', 'Austria', 'AT', 48.2082, 16.3738),
  madrid: D('mad', 'Madrid', 'Spain', 'ES', 40.4168, -3.7038),
  barcelona: D('bcn', 'Barcelona', 'Spain', 'ES', 41.3874, 2.1686),
  rome: D('rom', 'Rome', 'Italy', 'IT', 41.9028, 12.4964),
  milan: D('mil', 'Milan', 'Italy', 'IT', 45.4642, 9.19),
  warsaw: D('waw', 'Warsaw', 'Poland', 'PL', 52.2297, 21.0122),
  krakow: D('krk', 'Krakow', 'Poland', 'PL', 50.0647, 19.945),
  lisbon: D('lis', 'Lisbon', 'Portugal', 'PT', 38.7223, -9.1393),
  porto: D('opo', 'Porto', 'Portugal', 'PT', 41.1579, -8.6291),
  zagreb: D('zag', 'Zagreb', 'Croatia', 'HR', 45.815, 15.9819),
  split: D('spu', 'Split', 'Croatia', 'HR', 43.5081, 16.4402),
  athens: D('ath', 'Athens', 'Greece', 'GR', 37.9838, 23.7275),
  thessaloniki: D('skg', 'Thessaloniki', 'Greece', 'GR', 40.6401, 22.9444),
  tirana: D('tia', 'Tirana', 'Albania', 'AL', 41.3275, 19.8187),
  shkoder: D('shk', 'Shkoder', 'Albania', 'AL', 42.0683, 19.5126),
  belgrade: D('beg', 'Belgrade', 'Serbia', 'RS', 44.7866, 20.4489),
  nis: D('ini', 'Nis', 'Serbia', 'RS', 43.3209, 21.8958),
  luxembourg: D('lux', 'Luxembourg', 'Luxembourg', 'LU', 49.6116, 6.1319),
  london: D('lon', 'London', 'United Kingdom', 'GB', 51.5074, -0.1278),
  edinburgh: D('edi', 'Edinburgh', 'United Kingdom', 'GB', 55.9533, -3.1883),
  dublin: D('dub', 'Dublin', 'Ireland', 'IE', 53.3498, -6.2603),
  cork: D('ork', 'Cork', 'Ireland', 'IE', 51.8985, -8.4756),
};

const LEGS = [
  ['ghent', 'brussels'], ['brussels', 'paris'], ['paris', 'lyon'],
  ['berlin', 'munich'], ['berlin', 'warsaw'], ['prague', 'vienna'],
  ['madrid', 'barcelona'], ['rome', 'milan'], ['warsaw', 'krakow'],
  ['lisbon', 'porto'], ['zagreb', 'split'], ['athens', 'thessaloniki'],
  ['tirana', 'shkoder'], ['belgrade', 'nis'], ['brussels', 'luxembourg'],
  ['london', 'edinburgh'], ['dublin', 'cork'],
  ['brussels', 'london'],   // Channel crossing
  ['london', 'dublin'],     // Irish Sea crossing
];

const SRC_VALUES = new Set(['quote', 'cal', 'prior', 'model']);
const rows = [];

console.log('\n--- every leg, every priced mode: finite positive fare + flags ---');
for (const [a, b] of LEGS) {
  const opts = legTransportOptions(DEST[a], DEST[b], 1, {});
  const name = `${DEST[a].city} to ${DEST[b].city}`;
  if (!opts || !opts.modes || !Object.keys(opts.modes).length) {
    ok(false, name, 'no priced modes came back');
    continue;
  }
  for (const [mode, m] of Object.entries(opts.modes)) {
    const finite = Number.isFinite(m.eur_pp) && m.eur_pp > 0
      && Number.isFinite(m.eur_total) && m.eur_total > 0;
    const flagged = typeof m.est === 'boolean' && SRC_VALUES.has(m.src);
    ok(finite && flagged, `${name} (${mode})`,
      `eur_pp=${m.eur_pp} eur_total=${m.eur_total} est=${m.est} src=${m.src}`);
    rows.push({
      leg: name, mode,
      km: opts.road_km ?? opts.straight_km,
      eur_pp: m.eur_pp, est: m.est, src: m.src,
      sea: opts.sea_crossing ? 'yes' : '',
    });
  }
}

console.log('\n--- numeric identity with the pre-resolver formulas ---');
{
  // Overland train: max(4, rate*40, rate*straight*1.17), rate averaged over
  // both endpoint profiles (BE 0.16 / FR 0.11 / PL 0.07 rail, bus in kind).
  const identity = (a, b, railEur, busEur) => {
    const straight = haversineKm(DEST[a].lat, DEST[a].lon, DEST[b].lat, DEST[b].lon);
    const opts = legTransportOptions(DEST[a], DEST[b], 1, {});
    const wantTrain = round2(Math.max(4, railEur * 40, railEur * straight * 1.17));
    const wantBus = round2(Math.max(3, busEur * straight * 1.3));
    ok(opts.modes.train?.eur_pp === wantTrain, `${DEST[a].city} to ${DEST[b].city} train identical`,
      `want ${wantTrain} got ${opts.modes.train?.eur_pp}`);
    ok(opts.modes.bus?.eur_pp === wantBus, `${DEST[a].city} to ${DEST[b].city} bus identical`,
      `want ${wantBus} got ${opts.modes.bus?.eur_pp}`);
  };
  identity('ghent', 'brussels', 0.16, 0.07);                    // BE domestic
  identity('brussels', 'paris', (0.16 + 0.11) / 2, (0.07 + 0.055) / 2); // cross-border average
  identity('warsaw', 'krakow', 0.07, 0.04);                     // PL domestic
  identity('brussels', 'luxembourg', (0.16 + 0) / 2, (0.07 + 0) / 2);   // LU free network halves the rate

  // Channel: train clamp(0.26*straight, 59, 220), bus max(29, 0.085*straight*1.35).
  const straight = haversineKm(DEST.brussels.lat, DEST.brussels.lon, DEST.london.lat, DEST.london.lon);
  const sea = legTransportOptions(DEST.brussels, DEST.london, 1, {});
  ok(sea.modes.train?.eur_pp === round2(Math.min(220, Math.max(59, 0.26 * straight))),
    'Channel train identical');
  ok(sea.modes.bus?.eur_pp === round2(Math.max(29, 0.085 * straight * 1.35)),
    'Channel bus identical');
  ok(sea.modes.car && Number.isFinite(sea.modes.car.ferry_eur) && sea.modes.car.ferry_eur === 95,
    'Channel car ferry deck price identical (95/car)', `got ${sea.modes.car?.ferry_eur}`);

  const straightIr = haversineKm(DEST.london.lat, DEST.london.lon, DEST.dublin.lat, DEST.dublin.lon);
  const irish = legTransportOptions(DEST.london, DEST.dublin, 1, {});
  ok(irish.modes.train?.eur_pp === round2(Math.min(120, Math.max(45, 0.12 * straightIr))),
    'Irish Sea train identical');
  ok(irish.modes.car?.ferry_eur === 130, 'Irish Sea car ferry deck price identical (130/car)');

  // Airport transfer band: clamp(0.15*km, 10, 60).
  const t = transferModesFromKm(35, 2, {});
  ok(t.modes.public?.eur_pp === round2(Math.max(10, 0.15 * 35)), 'transfer public band identical');
  ok(t.modes.public?.est === true && t.modes.public?.src === 'prior', 'transfer public flagged prior');
}

console.log('\n--- resolution order: quote beats calibration beats prior ---');
{
  const quote = resolveGroundFare({ mode: 'public', quote: 12.5, km: 30 });
  ok(quote.eur === 12.5 && quote.est === false && quote.src === 'quote',
    'a stored fare resolves as a real quote (est false)', JSON.stringify(quote));

  const t = transferModesFromKm(30, 1, { publicOverride: 12.5 });
  ok(t.modes.public.eur_pp === 12.5 && t.modes.public.est === false && t.modes.public.src === 'quote',
    'publicOverride rides through transferModesFromKm as a quote');

  const before = resolveGroundFare({ mode: 'train', isoA: 'BE', isoB: 'FR', km: 300 });
  ok(before.src === 'prior' && before.est === true, 'no artifact: train prices from priors');

  setGroundFareCalibration({
    meta: { generated_at: '2026-08-05T00:00:00Z', samples: {} },
    countries: {
      BE: { train: { base_eur: 5, per_km_eur: 0.1, n: 100 } },
      FR: { train: { base_eur: 7, per_km_eur: 0.08, n: 100 } },
    },
  });
  const cal = resolveGroundFare({ mode: 'train', isoA: 'BE', isoB: 'FR', km: 300 });
  ok(cal.src === 'cal' && cal.est === true && cal.eur === 6 + 0.09 * 300,
    'artifact loaded: calibrated base + per-km, averaged over both countries',
    JSON.stringify(cal));
  const partial = resolveGroundFare({ mode: 'bus', isoA: 'BE', isoB: 'FR', km: 300 });
  ok(partial.src === 'prior', 'a mode the artifact misses falls back to priors');
  const uncovered = resolveGroundFare({ mode: 'train', isoA: 'BE', isoB: 'PL', km: 300 });
  ok(uncovered.src === 'prior', 'a country the artifact misses falls back to priors');
  const quoteStill = resolveGroundFare({ mode: 'train', isoA: 'BE', isoB: 'FR', km: 300, quote: 39 });
  ok(quoteStill.src === 'quote' && quoteStill.eur === 39, 'a real quote still beats the artifact');
  setGroundFareCalibration(null);
  ok(getGroundFareCalibration() === null, 'artifact cleared for the remaining checks');
}

console.log('\n--- NaN and junk can never become a price ---');
{
  const nanDest = D('nan', 'Nowhere', 'Belgium', 'BE', Number.NaN, 4.35);
  ok(legTransportOptions(nanDest, DEST.paris, 1, {}) === null,
    'a NaN latitude yields a null leg, not NaN fares');
  const nanCentre = D('nc', 'Halfgeocoded', 'Belgium', 'BE', 50.9, 4.4, { city_lat: Number.NaN, city_lon: Number.NaN });
  ok(legTransportOptions(nanCentre, DEST.paris, 1, {}) === null,
    'a NaN city-centre coordinate yields a null leg');
  ok(airportTransferOptions(nanDest, DEST.brussels, 2, {}) === null,
    'a NaN transfer endpoint yields a null transfer');
  const junkQuote = resolveGroundFare({ mode: 'public', quote: Number.NaN, km: 30 });
  ok(junkQuote.src === 'prior' && Number.isFinite(junkQuote.eur),
    'a NaN stored quote falls through to the band instead of pricing NaN');
  ok(resolveGroundFare({ mode: 'train', isoA: 'BE', isoB: 'FR' }) === null,
    'no distance at all resolves to null (the caller-guards contract), never NaN');
}

console.log('\n--- sample legs ---');
const w = { leg: 24, mode: 6, km: 6, eur_pp: 8, est: 5, src: 6, sea: 3 };
const pad = (v, n) => String(v ?? '').padEnd(n);
console.log(`  ${pad('leg', w.leg)} ${pad('mode', w.mode)} ${pad('km', w.km)} ${pad('eur_pp', w.eur_pp)} ${pad('est', w.est)} ${pad('src', w.src)} ${pad('sea', w.sea)}`);
for (const r of rows) {
  console.log(`  ${pad(r.leg, w.leg)} ${pad(r.mode, w.mode)} ${pad(r.km, w.km)} ${pad(r.eur_pp, w.eur_pp)} ${pad(r.est, w.est)} ${pad(r.src, w.src)} ${pad(r.sea, w.sea)}`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
