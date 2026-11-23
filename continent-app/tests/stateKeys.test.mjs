// E9 phase A (ROADMAP C9, I5, I12; logic wave 2, J-17): one table of every address and storage
// key with its scope. The old hand lists are frozen below; the table must give the same
// answer (the switch is unflagged because of this), and a grep fails on any key in src that
// the table does not name. Run: node --test tests/stateKeys.test.mjs (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  URL_KEYS, STORAGE_KEYS, scopeOf, ownUrlKeys, shareViewKeys, deviceKeys, syncKeys, stripUrlKeys, personUrlKeys,
} from '../src/lib/stateKeys.js';
import { SHARE_VIEW_KEYS } from '../src/lib/shareKeys.js';
import { DEVICE_THING_KEYS, isDeviceThing } from '../src/lib/deviceData.js';
import { KEPT_KEY } from '../src/lib/recommend/keptStore.js';
import { SAVES_KEY } from '../src/lib/journeySaves.js';
import { TRIPS_KEY } from '../src/planner/tripsStore.js';
import { DEVICE_TRIP_KEY } from '../src/planner/deviceTripStore.js';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

// The lists as they stood before the table (HEAD 5db228ed37).
const OLD_OWN_KEYS = ['ah', 'b', 'big', 'cat', 'cc', 'cf', 'cn', 'd', 'dest', 'df', 'dh', 'fav', 'favonly', 'feat', 'g', 'gb', 'gc', 'gem', 'ls', 'mode', 'o', 'oa', 'pm', 'pr', 'ps', 'pv', 'px', 'r', 'rh', 'rr', 'sc', 'sh', 'sk', 'sort', 'st', 't', 'tab', 'tb', 'tk', 'top', 'ty', 'un', 'wm', 'wn', 'wy'];
const OLD_SHARE_VIEW_KEYS = [
  'tab', 'cat', 'dc', 'dq', 'dm',
  'cf', 'cn', 'tk', 'sort', 'rr', 'gem', 'un', 'tb', 'big', 'top', 'rh',
  'xk', 'xv', 'xr', 'xb', 'xp', 'xe', 'xa', 'xn', 'xd', 'xg', 'xu', 'xw', 'xi', 'xall',
  'xc', 'xo', 'xs',
];
const OLD_DEVICE_THING_KEYS = [
  'carta.savedLists.v1', 'carta.visitedCountries.v1', 'carta.trips.v1', 'carta.keptTrips.v1', 'carta.savedJourneys.v1',
  'carta.deviceTrip.v1', 'carta.tripDraft.v1', 'carta.plannerDraft.v1', 'carta.dayplans.v1', 'carta.dayplan.',
  'carta.dayprefs.', 'carta.tripextras.', 'carta.booked.', 'carta.places.v1', 'carta.discovered.v1', 'carta.ask.chats.v1',
  'carta.mytrips.', 'carta.tripSkips.v1', 'carta.together.', 'carta.friends.lastSeen', 'carta.dayChat.v1:',
  'carta.accountSync.v1', 'carta.taste.v1', 'continent.state.v1', 'carta.travelStyles.v1', 'carta.pendingCoplan',
  'carta.ownFares', 'carta.finderPlan.once', 'carta.priceDropAsk.v1', 'carta.dock.recent', 'carta.search.recent', 'carta.search.picked',
];
const OLD_WATCHED = [KEPT_KEY, SAVES_KEY, TRIPS_KEY, DEVICE_TRIP_KEY, 'carta.plannerDraft.v1', 'carta.tripDraft.v1'];
const sorted = (a) => [...a].sort();

test('the table gives the lists the modules kept by hand: owned keys differ only by the retired pm (J-17)', () => {
  assert.deepEqual(ownUrlKeys(), sorted(OLD_OWN_KEYS.filter((k) => k !== 'pm')));
  assert.equal(ownUrlKeys().includes('pm'), false);
  assert.equal(scopeOf('pm', 'url'), 'preview');
});
test('share view keys, the device things and the sync WATCHED set are the old lists', () => {
  assert.deepEqual(sorted(shareViewKeys()), sorted(OLD_SHARE_VIEW_KEYS));
  assert.deepEqual(sorted(SHARE_VIEW_KEYS), sorted(OLD_SHARE_VIEW_KEYS));
  assert.deepEqual(sorted(deviceKeys()), sorted(OLD_DEVICE_THING_KEYS));
  assert.deepEqual(sorted(DEVICE_THING_KEYS), sorted(OLD_DEVICE_THING_KEYS));
  assert.deepEqual(sorted(syncKeys()), sorted(OLD_WATCHED));
});
test('no share key is a person key, and nothing is in the table twice', () => {
  const person = new Set(personUrlKeys());
  for (const k of shareViewKeys()) assert.equal(person.has(k), false, `${k} is person scope but shared`);
  const urls = URL_KEYS.map((e) => e.key);
  assert.equal(new Set(urls).size, urls.length, 'an address key is listed twice');
  const stores = STORAGE_KEYS.map((e) => e.key);
  assert.equal(new Set(stores).size, stores.length, 'a storage key is listed twice');
  assert.deepEqual(sorted(stripUrlKeys()), ['dh', 'fav', 'ty']);
});

/* ---- the grep: every key in src is classified ---- */

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const SOURCES = files(SRC).filter((f) => !f.endsWith('stateKeys.js')).map((f) => [f, readFileSync(f, 'utf8')]);

test('every carta.* and continent.* storage key in src is classified', () => {
  const re = /['"`]((?:carta|continent)\.[A-Za-z0-9_.:-]*)['"`]/g;
  const missing = new Set();
  let seen = 0;
  for (const [f, text] of SOURCES) {
    for (const m of text.matchAll(re)) {
      seen += 1;
      if (!scopeOf(m[1], 'storage')) missing.add(`${m[1]} (${f.slice(SRC.length + 1).replace(/\\/g, '/')})`);
    }
  }
  assert.ok(seen > 60, `only ${seen} storage keys found: did the pattern break?`);
  assert.deepEqual([...missing], [], 'name these in lib/stateKeys.js STORAGE_KEYS');
  // `carta.minimal` is an SDK name, not a storage key; it is listed so the grep stays honest.
  assert.equal(isDeviceThing('carta.watch.v1'), false);
});

test('every address key src reads or writes is classified', () => {
  const re = /(?:searchParams|URLSearchParams\([^)]*\)|\b(?:q|qs|p|params|sp|usp|u|url|merged|current|from|search))\.(?:get|has|set|append|delete|getAll)\(['"]([A-Za-z_]+)['"]/g;
  const missing = new Set();
  let seen = 0;
  for (const [f, text] of SOURCES) {
    for (const m of text.matchAll(re)) {
      seen += 1;
      if (!scopeOf(m[1], 'url')) missing.add(`${m[1]} (${f.slice(SRC.length + 1).replace(/\\/g, '/')})`);
    }
  }
  assert.ok(seen > 100, `only ${seen} address keys found: did the pattern break?`);
  assert.deepEqual([...missing], [], 'name these in lib/stateKeys.js URL_KEYS');
});

test('the Cookies page lists every key the sign-out clears, and no other', () => {
  const src = readFileSync(join(SRC, 'components/CookiesPage.jsx'), 'utf8');
  const block = src.slice(src.indexOf('your things'), src.indexOf('one-off notes'));
  const listed = new Set([...block.matchAll(/(?:carta|continent)\.[A-Za-z.*0-9]+/g)].map((m) => m[0].replace(/\.$/, '').replace(/\.\*$/, '')));
  const cleared = new Set(DEVICE_THING_KEYS.map((k) => k.replace(/[.:]$/, '')));
  // dayChat is kept in the page's prose, not its list: it has a colon, not a dot, in its prefix.
  cleared.delete('carta.dayChat.v1');
  assert.deepEqual([...listed].sort(), [...cleared].sort());
});
