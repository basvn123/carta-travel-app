/**
 * verify_flight_estimates.mjs, the flight half of the fallback-chain rule.
 *
 * Unit-checks pickEstimateForDates + composeTrip against a synthetic
 * destination (a real stored fare must always beat the estimate bands, an
 * estimate must be flagged, a half-covered round trip must refuse to price),
 * then checks the REAL shipped wire: BRU slice records carry e_out/e_ret and
 * a date the direct harvest never covered resolves to an estimated fare.
 *
 * Run from continent-app/:  node scripts/verify_flight_estimates.mjs
 * (after `node scripts/sync-data.mjs`, which ships the bands into the slices)
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeTrip, pickEstimateForDates, pickFareForDates } from '../src/lib/runtime_pricing.js';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!cond) failures += 1;
}

const DEPART = '2026-09-10';
const RETURN = '2026-09-14';

function makeDest(routes) {
  return {
    id: 'TST', iata: 'TST', city: 'Testville', country: 'Belgium', iso2: 'BE',
    lat: 50.5, lon: 4.5, tier: 'airport',
    routes,
  };
}
const CHOICES = {
  origin_pref: 'auto', group_size: 1, transport_mode: 'plane',
  baggage_per_direction_eur: 0, lifestyle: {},
};

console.log('--- unit: resolution order and flags ---');

// A real stored fare wins outright, unflagged.
const real = makeDest({
  BRU: {
    outbound_fare: { [DEPART]: 40 }, return_fare: { [RETURN]: 35 },
    outbound_estimate: { '2026-09': 63 }, return_estimate: { '2026-09': 58 },
  },
});
let b = composeTrip(real, DEPART, RETURN, CHOICES);
check('stored fare beats the band (75, not 121)', b?.fare_per_person === 75);
check('stored fare is not flagged estimated', b?.fare_estimated === false);

// No stored day: the band prices the trip, flagged.
const banded = makeDest({
  BRU: {
    outbound_fare: { '2026-08-01': 40 }, return_fare: { '2026-08-05': 35 },
    outbound_estimate: { '2026-09': 63 }, return_estimate: { '2026-09': 58 },
  },
});
b = composeTrip(banded, DEPART, RETURN, CHOICES);
check('band prices the unmatched dates (63 + 58 = 121)', b?.fare_per_person === 121);
check('band fare is flagged estimated', b?.fare_estimated === true);
check('mode stays plane (no silent drive fallback)', b?.transport_mode === 'plane');
check('plane_reachable true on an estimated flight', b?.plane_reachable === true);

// A half-covered round trip refuses to estimate (both directions required).
const halfBand = makeDest({
  BRU: { outbound_fare: {}, return_fare: {}, outbound_estimate: { '2026-09': 63 } },
});
check('out-only band refuses to price',
  pickEstimateForDates(halfBand, DEPART, RETURN) === null);
check('composeTrip returns null (not drivable, nothing to price)',
  composeTrip(halfBand, DEPART, RETURN, CHOICES) === null);

// Cheapest origin wins, origin_pref narrows.
const twoOrigins = makeDest({
  BRU: { outbound_fare: {}, return_fare: {}, outbound_estimate: { '2026-09': 90 }, return_estimate: { '2026-09': 90 } },
  CRL: { outbound_fare: {}, return_fare: {}, outbound_estimate: { '2026-09': 30 }, return_estimate: { '2026-09': 28 } },
});
check('cheapest origin wins the estimate (CRL 58)',
  pickEstimateForDates(twoOrigins, DEPART, RETURN)?.origin === 'CRL');
check('origin_pref narrows to that origin (BRU 180)',
  pickEstimateForDates(twoOrigins, DEPART, RETURN, 'BRU')?.fare === 180);

// A month outside the bands yields nothing.
check('uncovered month refuses to price',
  pickEstimateForDates(banded, '2027-01-10', '2027-01-14') === null);

// The estimate never outranks a REAL fare into the same dest even when the
// real fare is more expensive (resolution order, not cheapest-wins).
const realExpensive = makeDest({
  BRU: {
    outbound_fare: { [DEPART]: 400 }, return_fare: { [RETURN]: 400 },
    outbound_estimate: { '2026-09': 10 }, return_estimate: { '2026-09': 10 },
  },
});
b = composeTrip(realExpensive, DEPART, RETURN, CHOICES);
check('real 800 beats estimated 20 (order, not price)',
  b?.fare_per_person === 800 && b?.fare_estimated === false);

console.log('--- wire: the shipped BRU slice carries usable bands ---');

const slice = JSON.parse(readFileSync(resolve(here, '../public/fares/BRU.json'), 'utf-8'));
let banded_records = 0;
for (const rec of Object.values(slice)) {
  if (rec && typeof rec === 'object' && (rec.e_out || rec.e_ret)) banded_records += 1;
}
check(`records with e_out/e_ret in the BRU slice (${banded_records})`, banded_records > 0);

const agp = slice.AGP;
check('BRU->AGP carries both band directions', !!(agp?.e_out && agp?.e_ret));
if (agp?.e_out && agp?.e_ret) {
  // Find a window month with a band but no stored outbound day: the exact
  // "no flight these dates" gap the fallback exists for.
  const storedMonths = new Set(Object.keys(agp.out || {}).map((d) => d.slice(0, 7)));
  const gapMonth = Object.keys(agp.e_out).find(
    (m) => !storedMonths.has(m) && agp.e_ret[m] != null,
  );
  check(`a gap month exists with a band (${gapMonth || 'none'})`, !!gapMonth);
  if (gapMonth) {
    const dest = makeDest({
      BRU: {
        outbound_fare: agp.out || {}, return_fare: agp.ret || {},
        outbound_estimate: agp.e_out, return_estimate: agp.e_ret,
        anchor_airport: 'AGP',
      },
    });
    const dep = `${gapMonth}-10`, ret = `${gapMonth}-14`;
    check('no stored fare for the gap dates',
      pickFareForDates(dest, dep, ret) === null);
    const est = pickEstimateForDates(dest, dep, ret);
    check(`gap dates price from the band (~€${est?.fare} est.)`,
      Number.isFinite(est?.fare) && est.fare > 0 && est.estimated === true);
  }
}

console.log(failures === 0 ? 'verify_flight_estimates OK' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
