// Locks the shape of every deep link Carta hands a traveller, under plain node.
//
//   node scripts/verify_transport_links.mjs [--live]
//
// The formats are checked offline. `--live` also asks each site whether the
// URL resolves, which is worth running by hand after any change here and is
// deliberately not part of the default run: these are third-party sites, they
// rate-limit, and two of them answer a bot with 403 whatever the URL says.

import {
  skyscannerLink, trainlineLink, rome2rioLink, googleMapsLink, legLinks, citySlug,
  googleFlightsLink, googleFlightsExploreLink,
} from '../src/lib/transportLinks.js';

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });

const BRU = { city: 'Brussels', country: 'Belgium', iso2: 'BE', lat: 50.85, lon: 4.35, iata: 'BRU' };
const SZG = { city: 'Salzburg', country: 'Austria', iso2: 'AT', lat: 47.8, lon: 13.04, iata: 'SZG' };
const KRK = { city: 'Kraków', country: 'Poland', iso2: 'PL', lat: 50.06, lon: 19.94, iata: 'KRK' };
const REY = { city: 'Reykjavik', country: 'Iceland', iso2: 'IS', lat: 64.15, lon: -21.94, iata: 'KEF' };

// ── Slugs ────────────────────────────────────────────────────────────────
check('an accent folds', citySlug('Kraków') === 'krakow', citySlug('Kraków'));
check('a letter NFD cannot fold still folds', citySlug('Wrocław') === 'wroclaw', citySlug('Wrocław'));
check('an airport qualifier is dropped', citySlug('Milan (Bergamo)') === 'milan', citySlug('Milan (Bergamo)'));
check('nothing usable yields no slug', citySlug('...') === null);

// ── Skyscanner ───────────────────────────────────────────────────────────
const sky = skyscannerLink({ originIata: 'BRU', destIata: 'SZG', date: '2026-08-25', returnDate: '2026-09-01', adults: 2 });
check('a flight link is built', Boolean(sky), sky);
check('it carries both dates', /260825/.test(sky) && /260901/.test(sky), sky);
check('it carries the party size', /adultsv2=2/.test(sky) || /adults=2/.test(sky), sky);
check('it is a return search', /rtn=1/.test(sky) || /inboundDate/.test(sky), sky);
const oneWay = skyscannerLink({ originIata: 'BRU', destIata: 'SZG', date: '2026-08-25' });
check('a one way is a one way', /rtn=0/.test(oneWay) || !/inboundDate/.test(oneWay), oneWay);
check('a bad date yields no link', skyscannerLink({ originIata: 'BRU', destIata: 'SZG', date: '25-08-2026' }) === null);
check('a missing airport yields no link', skyscannerLink({ originIata: null, destIata: 'SZG', date: '2026-08-25' }) === null);

// ── Google Flights ───────────────────────────────────────────────────────
// The q sentence is the whole contract here: Google parses it, so the wording
// is checked literally rather than loosely. That it is parsed AT ALL can only
// be checked in a real browser: scripts/verify_google_flights.mjs does that,
// by hand, and is what caught the party-size clause losing the whole route.
const qOf = (url) => decodeURIComponent(new URL(url).searchParams.get('q') || '');

const gfRet = googleFlightsLink({ fromIata: 'BRU', toIata: 'SZG', date: '2026-08-25', returnDate: '2026-09-01', adults: 2, lang: 'nl' });
check('a dated return is a sentence google parses',
  qOf(gfRet) === 'Flights from BRU to SZG on 2026-08-25 through 2026-09-01', qOf(gfRet));
// Verified in a real browser: the party-size clause loses the whole route on
// some pairs, so it is never said. See the note in transportLinks.js.
check('the party size is never said out loud',
  !/adults/.test(qOf(gfRet)) && !/adults/.test(qOf(googleFlightsLink({
    fromIata: 'AMS', toIata: 'FCO', date: '2026-11-12', adults: 4,
  }))), qOf(gfRet));
check('it prices in euros and speaks the ui language',
  /[?&]curr=EUR/.test(gfRet) && /[?&]hl=nl/.test(gfRet), gfRet);
const gfOne = googleFlightsLink({ fromIata: 'BRU', toIata: 'SZG', date: '2026-08-25' });
check('a one way says no return', !/through/.test(qOf(gfOne)), qOf(gfOne));
const gfUndated = googleFlightsLink({ fromIata: 'BRU', toIata: 'SZG' });
check('an undated route still links', qOf(gfUndated) === 'Flights from BRU to SZG', qOf(gfUndated));
check('a town stands in for a missing airport',
  qOf(googleFlightsLink({ fromIata: 'BRU', toCity: 'Salzburg' })) === 'Flights from BRU to Salzburg');
check('an unmapped language costs an english page, not a link',
  /[?&]hl=/.test(googleFlightsLink({ fromIata: 'BRU', toIata: 'SZG', lang: 'pl' })));
check('no origin airport yields no link', googleFlightsLink({ toIata: 'SZG' }) === null);
check('nowhere to land yields no link', googleFlightsLink({ fromIata: 'BRU' }) === null);
check('a route to itself yields no flight', googleFlightsLink({ fromIata: 'BRU', toIata: 'BRU' }) === null);

const explore = googleFlightsExploreLink({ fromIata: 'BRU', lang: 'fr' });
check('explore leaves from one airport', qOf(explore) === 'Flights from BRU', explore);
check('explore is the explore page and carries curr and hl',
  explore.startsWith('https://www.google.com/travel/explore?') && /curr=EUR/.test(explore) && /hl=fr/.test(explore), explore);
check('explore carries the month when one is known',
  qOf(googleFlightsExploreLink({ fromIata: 'BRU', month: '2026-08' })) === 'Flights from BRU in 2026-08');
check('explore needs somewhere to leave from', googleFlightsExploreLink({}) === null);

// ── Trainline ────────────────────────────────────────────────────────────
check('a rail route page is built', trainlineLink({ fromCity: 'Paris', toCity: 'Lyon' })
  === 'https://www.thetrainline.com/train-times/paris-to-lyon');
check('a coach route page is built', trainlineLink({ fromCity: 'Paris', toCity: 'Lyon', mode: 'bus' })
  === 'https://www.thetrainline.com/buses/paris-to-lyon');
check('a route to itself yields no link', trainlineLink({ fromCity: 'Lyon', toCity: 'Lyon' }) === null);

// ── Rome2rio and Google Maps ─────────────────────────────────────────────
check('rome2rio takes the written name', rome2rioLink({ from: 'Salzburg', to: 'Český Krumlov' })
  === 'https://www.rome2rio.com/s/Salzburg/%C4%8Cesk%C3%BD-Krumlov',
  rome2rioLink({ from: 'Salzburg', to: 'Český Krumlov' }));
check('maps drives on coordinates', googleMapsLink({ from: BRU, to: SZG })
  === 'https://www.google.com/maps/dir/?api=1&origin=50.85,4.35&destination=47.8,13.04&travelmode=driving');
check('maps falls back to a name', /Brussels/.test(googleMapsLink({ from: { city: 'Brussels', country: 'Belgium' }, to: SZG, mode: 'transit' }) || ''));

// ── The set offered per leg ──────────────────────────────────────────────
const unsure = legLinks({ from: BRU, to: SZG, date: '2026-08-25' });
check('an unanswered leg leads with rome2rio', unsure[0]?.key === 'rome2rio', unsure.map((l) => l.key).join(','));
check('an unanswered leg offers rail too', unsure.some((l) => l.key === 'trainline'), unsure.map((l) => l.key).join(','));
check('an unanswered leg never offers a flight search',
  !unsure.some((l) => l.key === 'skyscanner'), unsure.map((l) => l.key).join(','));

const flying = legLinks({ from: BRU, to: SZG, mode: 'fly', date: '2026-08-25', returnDate: '2026-09-01' });
check('a flight leg leads with google flights', flying[0]?.key === 'google', flying.map((l) => l.key).join(','));
// The affiliate links are revenue. Google is an extra door, never a swap.
// Aviasales needs a marker in the environment and drops out without one, so
// only Skyscanner (which falls back to a public URL) can be asserted here.
check('a flight leg keeps its skyscanner link',
  flying.some((l) => l.key === 'skyscanner'), flying.map((l) => l.key).join(','));
check('an unanswered leg offers no google flights search',
  !unsure.some((l) => l.key === 'google'), unsure.map((l) => l.key).join(','));

const training = legLinks({ from: SZG, to: KRK, mode: 'train', date: '2026-08-27' });
check('a train leg offers trainline first', training[0]?.key === 'trainline', training.map((l) => l.key).join(','));
check('a train leg still offers rome2rio', training.some((l) => l.key === 'rome2rio'));

const driving = legLinks({ from: BRU, to: SZG, mode: 'car', date: '2026-08-25' });
check('a car leg offers driving directions', driving[0]?.key === 'gmaps', driving.map((l) => l.key).join(','));
check('a car leg is not offered transit directions',
  driving.filter((l) => l.key === 'gmaps').length === 1, driving.map((l) => l.key).join(','));

const iceland = legLinks({ from: REY, to: SZG, date: '2026-08-25' });
check('no rail link where there is no railway',
  !iceland.some((l) => l.key === 'trainline'), iceland.map((l) => l.key).join(','));

check('every link is https', [...unsure, ...flying, ...training, ...driving]
  .every((l) => l.url.startsWith('https://')));

// ── Optional: do the URLs resolve? ───────────────────────────────────────
if (process.argv.includes('--live')) {
  const probe = async (url) => {
    try {
      const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } });
      return r.status;
    } catch {
      return 0;
    }
  };
  for (const [label, url] of [
    ['trainline route page', trainlineLink({ fromCity: 'Paris', toCity: 'Lyon' })],
    ['skyscanner day view', oneWay],
    ['google flights search', gfRet],
    ['google flights explore', explore],
  ]) {
    const status = await probe(url);
    // 403 is a bot wall, not a broken URL, so it passes: only a 404 is a
    // format that has drifted.
    check(`${label} resolves`, status !== 404, `HTTP ${status}`);
  }
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
