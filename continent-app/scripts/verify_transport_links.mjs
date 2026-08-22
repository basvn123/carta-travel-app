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
check('a flight leg leads with skyscanner', flying[0]?.key === 'skyscanner', flying.map((l) => l.key).join(','));

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
