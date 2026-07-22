// Locks the Aviasales deeplink format. A wrong path segment does not throw and
// does not look broken: the link still opens Aviasales, it just searches the
// wrong route or the wrong day, and the fare the app promised won't be there.
// Nothing else in the codebase would catch that, hence this check.
//
//   node scripts/verify-affiliate.mjs
//
// The reference case is the Travelpayouts docs' own worked example: a
// prices_for_dates search for MAD -> BCN with departure_at 2023-07-28 and
// return_at 2023-08-26 returns the link `/search/MAD2807BCN26081`. If that
// assertion ever fails, the format changed and the builder needs revisiting.
//
// Only the marker-independent path builder is exercised: import.meta.env is
// undefined under plain Node, so buildAviasalesLink() correctly returns null
// here and the full-URL assembly is verified in the browser instead.

import { aviasalesSearchPath } from '../src/lib/affiliate.js';

const cases = [
  {
    name: 'docs worked example (MAD -> BCN round trip)',
    args: { origin: 'MAD', destIata: 'BCN', departDate: '2023-07-28', returnDate: '2023-08-26' },
    want: 'MAD2807BCN26081',
  },
  {
    name: 'one way omits the return date',
    args: { origin: 'LED', destIata: 'HKT', departDate: '2026-02-10' },
    want: 'LED1002HKT1',
  },
  {
    name: 'lowercase IATA is normalised',
    args: { origin: 'crl', destIata: 'bcn', departDate: '2026-08-04', returnDate: '2026-08-11' },
    want: 'CRL0408BCN11081',
  },
  {
    name: 'passenger count rides at the end',
    args: { origin: 'CRL', destIata: 'BCN', departDate: '2026-08-04', returnDate: '2026-08-11', adults: 3 },
    want: 'CRL0408BCN11083',
  },
  {
    name: 'malformed date yields no link rather than a wrong one',
    args: { origin: 'CRL', destIata: 'BCN', departDate: '04-08-2026', returnDate: '2026-08-11' },
    want: null,
  },
  {
    name: 'missing origin yields no link',
    args: { destIata: 'BCN', departDate: '2026-08-04', returnDate: '2026-08-11' },
    want: null,
  },
];

let failed = 0;
for (const { name, args, want } of cases) {
  const got = aviasalesSearchPath(args);
  if (got === want) {
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}\n        want ${want}\n        got  ${got}`);
  }
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
