/**
 * check-routes.mjs, the URL state round trip.
 *
 *   node scripts/ci/check-routes.mjs
 *
 * Plain node, no browser. src/lib/urlState.js is the whole shareable-link
 * contract: encodeState writes a query string, decodeState reads one back,
 * and persistState replaces exactly the keys in OWN_KEYS while leaving every
 * foreign key standing. A shared link that loses a filter loses it silently,
 * so the only way to notice is to assert the round trip.
 *
 * Three properties are checked.
 *
 * 1. OWN_KEYS is complete. Every key encodeState can emit for a fully
 *    populated state must be listed in OWN_KEYS, and every key in OWN_KEYS
 *    must be one the encoder or the seed-link writer can produce. The list is
 *    a hand-maintained literal, and persistState deletes exactly these before
 *    writing; a key encodeState emits but OWN_KEYS omits is never cleared, so
 *    a stale value from a previous state survives forever.
 *
 * 2. Every key survives the trip. A representative state goes through
 *    encodeState, the query string is fed to decodeState, and each value has
 *    to come back equal. Some keys change shape on purpose (favorites become
 *    a Set on the way out and an array on the way back, the rating band is
 *    stored in tenths, lifestyle is packed as a CSV), so each is compared on
 *    its own terms rather than by deep equality of the whole object.
 *
 * 3. An unknown key must not throw. Links are shared, edited, truncated and
 *    appended to by other tools; decodeState is the first thing that touches
 *    a stranger's URL and it has to survive junk. This also covers the three
 *    legacy migration keys (mt, mb) and the planner seeds (cc, dest, feat).
 *
 * Reading OWN_KEYS: it is a module-private const, not exported, so this
 * script parses it out of the source. That is deliberate rather than lazy.
 * Exporting it purely for a test would change the module's surface, and the
 * point of the check is that the literal in the file is right.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeState, decodeState, seedQuery } from '../../src/lib/urlState.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'src', 'lib', 'urlState.js');

let failed = false;
const fail = (msg) => { failed = true; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

console.log('url state round trip\n');

// ---------------------------------------------------------------- OWN_KEYS
const source = fs.readFileSync(SRC, 'utf8');
const m = /const OWN_KEYS = \[([^\]]*)\]/.exec(source);
if (!m) {
  console.error('could not find the OWN_KEYS literal in src/lib/urlState.js');
  process.exit(2);
}
const OWN_KEYS = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
pass(`OWN_KEYS lists ${OWN_KEYS.length} keys`);

// A state with every optional field set to something that differs from the
// app default, because encodeState deliberately omits anything still at its
// default and a default-valued state would emit almost nothing.
const STATE = {
  activeTab: 'places',
  departDate: '2026-07-01',
  returnDate: '2026-07-08',
  choices: {
    group_size: 3,
    baggage_key: 'checked_20kg',
    transport_mode: 'car',
    stay_tier: 'hotel3',
    origin: 'BRU',
    drive_home: { lat: 50.8466, lon: 4.3528, name: 'Brussels, Grand Place' },
    lifestyle: {
      dinners_per_week: 4, lunches_per_week: 3, fastfood_per_week: 1,
      drinks_per_week: 6, club_nights_per_week: 2, coffees_per_day: 2,
      self_catered_days_per_week: 1, cadence: 'day',
    },
  },
  priceMode: 'total',
  countryFilter: ['BE', 'FR'],
  tripKinds: ['city', 'beach'],
  priceRange: [200, 800],
  priceBounds: [0, 2000],
  // Shortlist keys are `<kind>:<id>`, or `<kind>:<cc>/<id>` for the kinds
  // that need a country (favorites.js COUNTRY_KINDS). A destination id may
  // itself carry a colon, as `gem:<slug>` does, so the key splits on the
  // first colon only. All three shapes are included on purpose.
  favorites: new Set(['dest:BRU', 'dest:gem:bruges', 'trail:AT/63478']),
  sortKey: 'price',
  showFavOnly: true,
  ratingRange: [6.8, 10],
  gemOnly: true,
  unescoOnly: true,
  topBeachOnly: true,
  bigOnly: true,
  topPick: { by: 'price', n: 25 },
  reachHours: 6,
};

const qs = encodeState(STATE);
const emitted = [...new URLSearchParams(qs).keys()];
pass(`encodeState emits ${emitted.length} keys: ${emitted.join(', ')}`);

for (const k of emitted) {
  if (!OWN_KEYS.includes(k)) {
    fail(`encodeState emits "${k}" but OWN_KEYS does not list it; `
      + 'persistState would never clear it, so a stale value survives forever');
  }
}
if (emitted.every((k) => OWN_KEYS.includes(k))) {
  pass('every key encodeState emits is listed in OWN_KEYS');
}

// The other direction: OWN_KEYS may legitimately hold keys encodeState never
// writes, but only the hand-off seeds, which seedQuery produces and
// persistState is meant to drop. Anything else is a key nobody can produce.
const seedKeys = new Set([
  ...new URLSearchParams(seedQuery({ cc: 'BE' })).keys(),
  ...new URLSearchParams(seedQuery({ dest: 'BRU' })).keys(),
  ...new URLSearchParams(seedQuery({ feat: { kind: 'trail', cc: 'AT', id: '63478' } })).keys(),
]);
const orphans = OWN_KEYS.filter((k) => !emitted.includes(k) && !seedKeys.has(k));
if (orphans.length) {
  fail(`OWN_KEYS lists ${orphans.join(', ')}, which neither encodeState nor `
    + 'seedQuery can produce');
} else {
  pass('every key in OWN_KEYS is produced by encodeState or seedQuery');
}

// ---------------------------------------------------------------- round trip
console.log('\nevery key survives encode -> decode\n');
const back = decodeState(qs);

const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass(`${label}  ${JSON.stringify(got)}`);
  else fail(`${label}  got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
};

eq('tab      -> activeTab', back.activeTab, 'places');
eq('d        -> departDate', back.departDate, '2026-07-01');
eq('r        -> returnDate', back.returnDate, '2026-07-08');
eq('g        -> group_size', back.group_size, 3);
eq('b        -> baggage_key', back.baggage_key, 'checked_20kg');
eq('t        -> transport_mode', back.transport_mode, 'car');
eq('st       -> stay_tier', back.stay_tier, 'hotel3');
eq('o        -> origin', back.origin, 'BRU');
// dh packs lat and lon to four decimals and keeps the free-text name whole,
// commas and all, by splitting on the first two separators only.
eq('dh       -> drive_home', back.drive_home,
  { lat: 50.8466, lon: 4.3528, name: 'Brussels, Grand Place' });
eq('pm       -> priceMode', back.priceMode, 'total');
eq('cf       -> countryFilter', back.countryFilter, ['BE', 'FR']);
eq('tk       -> tripKinds', back.tripKinds, ['city', 'beach']);
eq('pr       -> priceRange', back.priceRange, [200, 800]);
eq('sort     -> sortKey', back.sortKey, 'price');
eq('favonly  -> showFavOnly', back.showFavOnly, true);
eq('rr       -> ratingRange', back.ratingRange, [6.8, 10]);
eq('gem      -> gemOnly', back.gemOnly, true);
eq('un       -> unescoOnly', back.unescoOnly, true);
eq('tb       -> topBeachOnly', back.topBeachOnly, true);
eq('big      -> bigOnly', back.bigOnly, true);
eq('top      -> topPick', back.topPick, { by: 'price', n: 25 });
eq('rh       -> reachHours', back.reachHours, 6);
eq('ls       -> lifestyle', back.lifestyle, STATE.choices.lifestyle);
// favorites go out as a Set and come back as an array of the same keys.
eq('fav      -> favorites', [...(back.favorites || [])].sort(),
  [...STATE.favorites].sort());

// ---------------------------------------------------------------- junk input
console.log('\nunknown and malformed input must not throw\n');
const JUNK = [
  '',
  '?',
  'zzz=1',
  'tab=places&zzz=1&xk=explore-filter-key',
  'rh=notanumber',
  'rh=999',
  'pr=abc.def',
  'rr=..',
  'top=nonsense',
  'dh=',
  'dh=1',
  'ls=,,,,,,,',
  'cf=&tk=',
  'mt=2',
  'mb=5',
  'cc=BE&dest=BRU&feat=trail:AT:63478',
  'feat=garbage',
  'fav=',
  '%%%',
  'g=-5',
  'd=' + 'x'.repeat(500),
];
for (const j of JUNK) {
  try {
    const out = decodeState(j);
    if (out === null || typeof out !== 'object') {
      fail(`decodeState(${JSON.stringify(j)}) returned ${JSON.stringify(out)}`);
    }
  } catch (e) {
    fail(`decodeState(${JSON.stringify(j)}) threw ${e.name}: ${e.message}`);
  }
}
if (!failed) pass(`${JUNK.length} malformed query strings decoded without throwing`);

// A foreign key must survive alongside an own key, which is the Explore
// filter state (xk/xv/xr/...) and the member anchor (dm) this encoder is not
// allowed to wipe.
{
  const decoded = decodeState('tab=places&xk=kind&dm=member-1');
  if (decoded.activeTab !== 'places') {
    fail('a foreign key alongside tab= broke the own-key decode');
  } else {
    pass('foreign keys sit alongside own keys without disturbing them');
  }
}

console.log(failed ? '\nurl state FAILED' : '\nurl state passed');
process.exit(failed ? 1 : 0);
