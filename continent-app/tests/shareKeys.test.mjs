// Logic wave 0a (ROADMAP C9, I12): a share link is the view, never the person.
// lib/shareKeys.js holds the allow-lists; every share builder goes through it.
// Run: node --test tests/shareKeys.test.mjs (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const {
  SHARE_VIEW_KEYS, TRIP_SHARE_DROP, HOME_POINT_DP,
  shareBase, shareViewUrl, tripForShare, roundHomePoint,
} = await import('../src/lib/shareKeys.js');

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('no person, date, way or price view key is on the share allow-list', () => {
  for (const k of ['dh', 'fav', 'favonly', 'g', 'gc', 'gb', 'o', 'oa', 'ah', 'sk', 'sc', 'sh',
    'ls', 'ty', 'st', 'b', 'd', 'r', 'df', 'wm', 'wy', 'wn', 'xm', 't', 'pv', 'ps', 'px',
    'tg', 'tv', 'cc', 'dest', 'feat', 'pass']) {
    assert.equal(SHARE_VIEW_KEYS.includes(k), false, k);
  }
});

test('shareViewUrl keeps the place, filters and lens, and drops the rest and the hash', () => {
  const href = 'https://x.test/nl/?tab=explore&dh=50.85,4.35,Home&fav=d:BRU&g=3&gc=1&o=BRU&oa=BRU.CRL'
    + '&ls=1,2,3,4,5,6,7,0&ty=abc&d=2027-05-01&r=2027-05-08&xm=8&t=car&pv=t&tg=abc123&xv=a&cf=IT.FR&sort=price#dest=BRU';
  assert.equal(shareViewUrl(href), 'https://x.test/nl/?tab=explore&xv=a&cf=IT.FR&sort=price');
  assert.equal(shareViewUrl('https://x.test/?dh=1,2,H&fav=d:BRU'), 'https://x.test/');
});

test('shareBase drops the query and the hash', () => {
  assert.equal(shareBase('https://x.test/nl/?fav=d:BRU&dh=1,2,H#together=abc'), 'https://x.test/nl/');
  assert.equal(shareBase('https://x.test/'), 'https://x.test/');
});

test('tripForShare drops the sender fields and keeps the party counts', () => {
  const out = tripForShare({ stops: [{ destinationId: 'FCO' }], groupSize: 4, children: 1, babies: 0,
    anchorId: 'BRU', anchorOrigin: 'BRU', homeTown: 'Ghent', dh: '1,2' });
  for (const k of TRIP_SHARE_DROP) assert.equal(k in out, false, k);
  assert.equal(out.groupSize, 4);
  assert.equal(out.children, 1);
  assert.equal(out.anchorId, 'BRU');
  assert.equal(tripForShare(null), null);
});

test('roundHomePoint keeps two decimals, about 1 km', () => {
  assert.equal(HOME_POINT_DP, 2);
  assert.deepEqual(roundHomePoint(50.84567, 4.35671), { lat: 50.85, lon: 4.36 });
  assert.deepEqual(roundHomePoint(-0.004, 179.996), { lat: -0, lon: 180 });
});

test('the address and the From setter keep the home point at two decimals', async () => {
  const { encodeState, decodeState } = await import('../src/lib/urlState.js');
  const qs = encodeState({ choices: { drive_home: { lat: 50.84667, lon: 4.35281, name: 'Home, here' } } });
  assert.equal(new URLSearchParams(qs).get('dh'), '50.85,4.35,Home, here');
  assert.deepEqual(decodeState(qs).drive_home, { lat: 50.85, lon: 4.35, name: 'Home, here' });
  const app = src('App.jsx');
  const setFrom = app.slice(app.indexOf('const setFrom = useCallback'), app.indexOf('const setAirports = useCallback'));
  assert.match(setFrom, /roundHomePoint\(placePt\.lat, placePt\.lon\)/);
  assert.doesNotMatch(setFrom, /drive_home: \{[^}]*lat: placePt\.lat/);
});

test('every share builder calls the helper and none reads the address', () => {
  const explore = src('browse/ExploreTab.jsx');
  const shareView = explore.slice(explore.indexOf('const shareView = '), explore.indexOf('const shareView = ') + 400);
  assert.match(shareView, /shareViewUrl\(/);
  assert.doesNotMatch(shareView, /location\.(href|search)/);

  const together = src('lib/recommend/together.js');
  const tu = together.slice(together.indexOf('export function togetherUrl'));
  const tuBody = tu.slice(0, tu.indexOf('\n}') + 2);
  assert.match(tuBody, /shareBase\(/);
  assert.doesNotMatch(tuBody, /location\.(href|search)/);

  const share = src('lib/shareLink.js');
  const enc = share.slice(share.indexOf('export async function encodeTripShare'));
  assert.match(enc.slice(0, enc.indexOf('\n}') + 2), /tripForShare\(sanitizeShared\(/);
  const build = share.slice(share.indexOf('export async function buildTripShareUrl'));
  const buildBody = build.slice(0, build.indexOf('\n}') + 2);
  assert.match(buildBody, /shareBase\(/);
  assert.doesNotMatch(buildBody, /location\.(href|search)/);
});
