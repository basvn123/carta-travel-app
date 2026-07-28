// Locks the Omio deeplink format. A wrong slug or path does not throw and
// does not look broken: the link still opens Omio, just on a 404 or the wrong
// route, and the Impact click attribution quietly stops matching real intent.
// Nothing else in the codebase would catch that, hence this check.
//
//   node scripts/verify-omio.mjs
//
// The reference cases are the route pages Omio's own affiliate onboarding
// recommends (omio.com/trains/rome/florence, omio.com/travel/vienna/budapest)
// and the Impact deep-link convention (tracking link + u=<encoded landing
// page>, subId1=<surface>). If an assertion fails, one of those formats
// changed and omio.js needs revisiting.
//
// Only the pure builders are exercised: import.meta.env is undefined under
// plain Node, so buildOmioLink() correctly returns null here and the
// env-driven assembly is verified in the browser instead. omioDeepLink()
// takes the tracking link as an argument, so the full URL shape IS locked.

import { omioSlug, omioRouteUrl, omioDeepLink } from '../src/lib/omio.js';

const TRACK = 'https://omio.sjv.io/c/1234567/898765/12345';

const cases = [
  {
    name: 'onboarding example route (Rome -> Florence by train)',
    got: () => omioRouteUrl({ fromCity: 'Rome', toCity: 'Florence', mode: 'train' }),
    want: 'https://www.omio.com/trains/rome/florence',
  },
  {
    name: 'bus mode takes the /buses/ page',
    got: () => omioRouteUrl({ fromCity: 'London', toCity: 'Paris', mode: 'bus' }),
    want: 'https://www.omio.com/buses/london/paris',
  },
  {
    name: 'no mode lands on the multimode /travel/ page',
    got: () => omioRouteUrl({ fromCity: 'Vienna', toCity: 'Budapest' }),
    want: 'https://www.omio.com/travel/vienna/budapest',
  },
  {
    name: 'diacritics fold to ASCII slugs',
    got: () => omioSlug('Kraków'),
    want: 'krakow',
  },
  {
    name: 'stroked letters fold too (NFD alone cannot)',
    got: () => omioSlug('Wrocław'),
    want: 'wroclaw',
  },
  {
    name: 'spaces and apostrophes become single hyphens',
    got: () => omioSlug("L'Aquila del Sud"),
    want: 'l-aquila-del-sud',
  },
  {
    name: 'airport qualifiers in parentheses are stripped',
    got: () => omioSlug('Milan (Bergamo)'),
    want: 'milan',
  },
  {
    name: 'same city both ends yields no link',
    got: () => omioRouteUrl({ fromCity: 'Ghent', toCity: 'Ghent', mode: 'train' }),
    want: null,
  },
  {
    name: 'missing endpoint yields no link',
    got: () => omioRouteUrl({ fromCity: 'Ghent', toCity: '', mode: 'train' }),
    want: null,
  },
  {
    name: 'deep link wraps the landing page in u= with subId1',
    got: () => omioDeepLink(TRACK, 'https://www.omio.com/trains/rome/florence', 'leg'),
    want: `${TRACK}?subId1=leg&u=${encodeURIComponent('https://www.omio.com/trains/rome/florence')}`,
  },
  {
    name: 'sub-ID is sanitised to [a-z0-9_]',
    got: () => omioDeepLink(TRACK, 'https://www.omio.com/trains/rome/florence', 'Day Trip!'),
    want: `${TRACK}?subId1=daytrip&u=${encodeURIComponent('https://www.omio.com/trains/rome/florence')}`,
  },
  {
    name: 'a pasted link with its own u= gets it replaced, not doubled',
    got: () => omioDeepLink(`${TRACK}?u=https%3A%2F%2Fwww.omio.com`, 'https://www.omio.com/trains/rome/florence'),
    want: `${TRACK}?u=${encodeURIComponent('https://www.omio.com/trains/rome/florence')}`,
  },
  {
    name: 'a non-URL tracking value yields no link rather than a broken one',
    got: () => omioDeepLink('paste your link here', 'https://www.omio.com/trains/rome/florence'),
    want: null,
  },
];

let failed = 0;
for (const { name, got, want } of cases) {
  const g = got();
  if (g === want) {
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}\n        want ${want}\n        got  ${g}`);
  }
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
