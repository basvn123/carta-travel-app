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

console.log('--- wire: bands are shipped AND service-gated ---');

// Same family set as the pipeline gate: airlines whose calendars the direct
// harvest holds completely. A shipped band month must be evidenced by an
// airline OUTSIDE this set, or the estimate could invent a flight.
const FAMILY = new Set(['FR', 'RK', 'RR', 'W6', 'W4', 'W9', 'VY', 'V7']);
const evidence = JSON.parse(readFileSync(
  resolve(here, '../../data/derived/tp_service_evidence.json'), 'utf-8')).routes;
const evidencedMonths = (org, dst) => new Set(
  Object.entries(evidence[`${org}-${dst}`] || {})
    .filter(([, airlines]) => airlines.some((a) => !FAMILY.has(a)))
    .map(([m]) => m),
);

let bandedRecords = 0;
let bandMonths = 0;
let ungatedViolations = 0;
let gapCase = null;
for (const org of ['BRU', 'CRL']) {
  const slice = JSON.parse(readFileSync(resolve(here, `../public/fares/${org}.json`), 'utf-8'));
  for (const [anchor, rec] of Object.entries(slice)) {
    if (!rec || typeof rec !== 'object' || (!rec.e_out && !rec.e_ret)) continue;
    bandedRecords += 1;
    const outOk = evidencedMonths(org, anchor);
    const retOk = evidencedMonths(anchor, org);
    for (const m of Object.keys(rec.e_out || {})) {
      bandMonths += 1;
      if (!outOk.has(m)) ungatedViolations += 1;
    }
    for (const m of Object.keys(rec.e_ret || {})) {
      bandMonths += 1;
      if (!retOk.has(m)) ungatedViolations += 1;
    }
    // Remember one route where a banded month has NO stored outbound day:
    // the exact "no flight these dates" gap the fallback exists to fill.
    if (!gapCase && rec.e_out && rec.e_ret) {
      const stored = new Set(Object.keys(rec.out || {}).map((d) => d.slice(0, 7)));
      const m = Object.keys(rec.e_out).find((x) => !stored.has(x) && rec.e_ret[x] != null);
      if (m) gapCase = { org, anchor, rec, month: m };
    }
  }
}
check(`banded records across BRU+CRL slices (${bandedRecords})`, bandedRecords > 0);
check(`every shipped band month is service-evidenced (${bandMonths} months, ${ungatedViolations} violations)`,
  bandMonths > 0 && ungatedViolations === 0);

if (gapCase) {
  const { org, anchor, rec, month } = gapCase;
  const dest = makeDest({
    [org]: {
      outbound_fare: rec.out || {}, return_fare: rec.ret || {},
      outbound_estimate: rec.e_out, return_estimate: rec.e_ret,
      anchor_airport: anchor,
    },
  });
  const dep = `${month}-10`, ret = `${month}-14`;
  check(`gap case ${org}->${anchor} ${month}: no stored fare for the dates`,
    pickFareForDates(dest, dep, ret) === null);
  const est = pickEstimateForDates(dest, dep, ret);
  check(`gap case prices from the band (~€${est?.fare} est.)`,
    Number.isFinite(est?.fare) && est.fare > 0 && est.estimated === true);
} else {
  console.log('  note  no stored-gap band month in BRU/CRL right now (evidence-'
    + 'covered months all have stored days); unit tests cover the resolution path');
}

console.log(failures === 0 ? 'verify_flight_estimates OK' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
