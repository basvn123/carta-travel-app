/**
 * Tests for the parse-booking Edge Function's pure logic (supabase/functions/
 * parse-booking/logic.mjs) plus the client-side folding in
 * src/planner/bookingImport.js. Run from the repo root or continent-app:
 *
 *   node continent-app/scripts/ai/test_import_logic.mjs
 *
 * No network, no keys: the whole point is that everything between the model
 * and the traveller's booking rows is provably deterministic.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const {
  sanitizeFiles, sanitizeTripContext, sanitizeParsed, safeLink, cacheKeyInput,
  safeFetchUrl, htmlToText, MAX_FILES,
} = await import(pathToFileURL(resolve(here, '../../../supabase/functions/parse-booking/logic.mjs')).href);
const {
  matchBookingRow, applyParsedBookings, toInboxItems,
} = await import(pathToFileURL(resolve(here, '../../src/planner/bookingImportLogic.js')).href);

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
};

/* ---- sanitizeFiles: mime whitelist, caps, junk ---- */
const b64 = 'aGVsbG8='; // "hello"
check('accepts a pdf', sanitizeFiles([{ mime: 'application/pdf', data: b64, name: 'x.pdf' }]).length === 1);
check('drops unknown mime', sanitizeFiles([{ mime: 'application/msword', data: b64 }]).length === 0);
check('drops non-base64 payloads', sanitizeFiles([{ mime: 'image/png', data: 'not base64!!' }]).length === 0);
check('caps the file count', sanitizeFiles(Array.from({ length: 9 }, () => ({ mime: 'text/plain', data: b64 }))).length === MAX_FILES);
check('non-array is empty', sanitizeFiles('nope').length === 0);

/* ---- sanitizeTripContext: day numbering ---- */
const ctx = sanitizeTripContext({
  stops: [
    { city: 'Salzburg', country: 'Austria', arrive: '2026-08-03', nights: 2 },
    { city: 'Mostar', nights: 3 },
    { city: '', nights: 2 }, // nameless stop is noise
  ],
  groupSize: 4,
});
check('keeps named stops only', ctx.stops.length === 2);
check('numbers trip days through the stops', ctx.stops[1].firstDay === 3 && ctx.stops[1].lastDay === 5);
check('counts total days', ctx.totalDays === 5);
check('clamps group size', sanitizeTripContext({ groupSize: 99 }).groupSize === 20);

/* ---- safeLink: printed URLs only ---- */
check('https survives', safeLink('https://ryanair.com/manage') === 'https://ryanair.com/manage');
check('javascript: dies', safeLink('javascript:alert(1)') === '');
check('bare word dies', safeLink('see attachment') === '');

/* ---- sanitizeParsed: the model answer reduced to facts ---- */
const parsed = sanitizeParsed({
  summary: 'Two bookings.',
  bookings: [
    { kind: 'flight_out', title: 'Ryanair CRL to SZG', code: 'AB12CD', eur: 184.5, link: 'https://ryanair.com/x', date: '2026-08-03' },
    { kind: 'nonsense', title: 'Museum tickets', eur: -4, link: 'javascript:x' },
    { kind: 'stay', title: '' }, // titleless is noise
  ],
  activities: [
    { name: 'Old bridge walking tour', city: 'Mostar', eur: 15, durationMin: 90, day: 4 },
    { name: 'Day 99 thing', day: 99 },
    { name: '' },
  ],
}, { totalDays: 5 });
check('titleless booking dropped', parsed.bookings.length === 2);
check('unknown kind becomes other', parsed.bookings[1].kind === 'other');
check('negative money nulled', parsed.bookings[1].eur === null);
check('bad link nulled', parsed.bookings[1].link === '');
check('good booking survives whole', parsed.bookings[0].code === 'AB12CD' && parsed.bookings[0].eur === 184.5);
check('nameless activity dropped', parsed.activities.length === 2);
check('day outside the trip nulled', parsed.activities[1].day === null);
check('day inside the trip kept', parsed.activities[0].day === 4);

/* ---- safeFetchUrl: public http(s) only, SSRF refused ---- */
check('url: a public page survives', safeFetchUrl('https://example.com/salzburg-guide') === 'https://example.com/salzburg-guide');
check('url: plain http allowed', safeFetchUrl('http://example.com/x').startsWith('http://'));
check('url: localhost refused', safeFetchUrl('http://localhost:8000/x') === '');
check('url: loopback refused', safeFetchUrl('http://127.0.0.1/x') === '');
check('url: rfc1918 refused', safeFetchUrl('http://192.168.1.1/admin') === '' && safeFetchUrl('http://10.0.0.5/x') === '');
check('url: link-local refused', safeFetchUrl('http://169.254.169.254/latest/meta-data') === '');
check('url: bare hostname refused', safeFetchUrl('http://intranet/x') === '');
check('url: .local refused', safeFetchUrl('http://nas.local/x') === '');
check('url: non-http scheme refused', safeFetchUrl('ftp://example.com/x') === '' && safeFetchUrl('javascript:x') === '');
check('url: junk refused', safeFetchUrl('not a url') === '');

/* ---- htmlToText: tags out, prose in ---- */
const html = '<html><head><style>.x{color:red}</style><script>alert(1)</script></head>'
  + '<body><h1>One day in Salzburg</h1><p>Start at the <b>fortress</b> &amp; walk down.</p>'
  + '<ul><li>Mirabell Gardens</li><li>Getreidegasse</li></ul><!-- note --></body></html>';
const text = htmlToText(html);
check('html: scripts and styles gone', !text.includes('alert') && !text.includes('color:red'));
check('html: prose survives', text.includes('One day in Salzburg') && text.includes('fortress'));
check('html: entities decoded', text.includes('&') && !text.includes('&amp;'));
check('html: list items keep boundaries', /Mirabell Gardens\s*\n\s*Getreidegasse/.test(text) || text.includes('Mirabell Gardens\nGetreidegasse'));
check('html: capped', htmlToText(`<p>${'x'.repeat(50000)}</p>`).length <= 20000);

/* ---- cacheKeyInput: stable and content-sensitive ---- */
const keyArgs = { model: 'm', fileHashes: ['h1'], text: 'T', context: ctx, lang: 'en' };
check('cache key is deterministic', cacheKeyInput(keyArgs) === cacheKeyInput({ ...keyArgs }));
check('cache key sees the file', cacheKeyInput(keyArgs) !== cacheKeyInput({ ...keyArgs, fileHashes: ['h2'] }));
check('cache key sees the trip', cacheKeyInput(keyArgs) !== cacheKeyInput({ ...keyArgs, context: sanitizeTripContext({ stops: [{ city: 'Rome', nights: 1 }] }) }));

/* ---- matchBookingRow: parsed kinds onto TripItinerary's row keys ---- */
const rowKeys = ['flight-out', 'flight-home', 'stay-0', 'stay-1', 'car'];
const cities = ['Salzburg', 'Mostar'];
check('flight_out lands on flight-out', matchBookingRow({ kind: 'flight_out' }, rowKeys, cities) === 'flight-out');
check('stay matches by city', matchBookingRow({ kind: 'stay', city: 'Mostar' }, rowKeys, cities) === 'stay-1');
check('stay with unknown city is custom', matchBookingRow({ kind: 'stay', city: 'Paris' }, rowKeys, cities) === null);
check('single-stop stay needs no city', matchBookingRow({ kind: 'stay' }, ['stay-0'], ['Rome']) === 'stay-0');
check('activity is always custom', matchBookingRow({ kind: 'activity' }, rowKeys, cities) === null);
check('own-flight trips fold flight_out onto flight', matchBookingRow({ kind: 'flight_out' }, ['flight', 'stay-0'], ['Rome']) === 'flight');

/* ---- applyParsedBookings: fills blanks, never argues with people ---- */
const applied = applyParsedBookings(
  [
    { kind: 'flight_out', title: 'Ryanair', code: 'AB12CD', eur: 184.5, link: 'https://r.com/x' },
    { kind: 'stay', city: 'Mostar', title: 'Pansion Villa', code: 'HM-99', eur: 210 },
    { kind: 'activity', title: 'Kayak tour', city: 'Mostar', eur: 60 },
  ],
  {
    bookings: { 'flight-out': { ref: 'TYPED', done: true } },
    rowKeys, cities, stamp: 1000,
  },
);
check('typed code untouched', applied.bookings['flight-out'].ref === 'TYPED');
check('typed row still gains its blanks', applied.bookings['flight-out'].price === '184.5');
check('touched rows carry the badge', applied.bookings['flight-out'].ai === true);
check('stay routed to its city row', applied.bookings['stay-1']?.ref === 'HM-99');
check('activity became a labelled custom row', Object.keys(applied.bookings).some((k) => k.startsWith('custom:') && applied.bookings[k].label.includes('Kayak')));
check('filled counts changed rows', applied.filled === 3);

const noop = applyParsedBookings(
  [{ kind: 'flight_out', title: 'Ryanair', code: 'AB12CD' }],
  { bookings: { 'flight-out': { ref: 'AB12CD', price: '99', url: 'https://x.y' } }, rowKeys, cities },
);
check('a fully-typed row is left alone', noop.filled === 0 && !noop.bookings['flight-out'].ai);

/* ---- toInboxItems: staging + dedupe ---- */
const inbox = toInboxItems(
  [
    { name: 'Old bridge tour', city: 'Mostar', eur: 15, durationMin: 90, day: 4 },
    { name: 'OLD BRIDGE TOUR' }, // dupe by folded name
    { name: 'Already placed' },
  ],
  { existingNames: ['Already placed'], stamp: 7 },
);
check('stages the new activity', inbox.length === 1 && inbox[0].name === 'Old bridge tour');
check('carries the day suggestion', inbox[0].day === 4);
check('ids are stable per import', inbox[0].id === 'imp-7-0');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall import logic checks passed');
process.exit(failures ? 1 : 0);
