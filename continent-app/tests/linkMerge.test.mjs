// K-1 (logic wave 0a, ROADMAP C9): a link no longer replaces the whole boot
// state. View keys it names win (a group as a whole), the person's own groups
// stay the device's, the home point never comes from a link, and the view
// never comes from the mirror.
// Run: node --test tests/linkMerge.test.mjs (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';

const { mergeLinkOverMirror, decodeState, loadInitialState } = await import('../src/lib/urlState.js');

const mirror = decodeState('d=2027-05-01&r=2027-05-04&df=m&wn=3&g=3&gc=1&o=BRU&oa=BRU.CRL&ah=2'
  + '&dh=50.85,4.35,Home&fav=d:BRU.d:FCO&cf=IT&cn=1&sort=price&rr=60.100&ls=1,2,3,4,5,6,7,0&t=car&tab=account');

test('a bare tab link keeps every stored setting (the K-1 bug)', () => {
  const out = mergeLinkOverMirror(decodeState('?tab=explore'), mirror);
  for (const k of ['departDate', 'returnDate', 'dateFlex', 'trip_nights', 'group_size', 'children', 'origin',
    'origins', 'drive_home', 'favorites', 'countryFilter', 'countryNot', 'sortKey', 'ratingRange', 'lifestyle', 'transport_mode']) {
    assert.deepEqual(out[k], mirror[k], k);
  }
});

test('a payment return (?pass=ok) keeps the stored state', () => {
  assert.deepEqual(mergeLinkOverMirror(decodeState('?pass=ok'), mirror), (({ activeTab, ...rest }) => rest)(mirror));
});

test('view keys the link names win, each group as a whole', () => {
  const out = mergeLinkOverMirror(decodeState('?d=2027-08-10&cf=FR&sort=beauty&gem=1'), mirror);
  assert.equal(out.departDate, '2027-08-10');
  assert.equal(out.returnDate, undefined, 'a stored old return date does not meet the new depart date');
  assert.equal(out.dateFlex, undefined);
  assert.equal(out.trip_nights, undefined);
  assert.deepEqual(out.countryFilter, ['FR']);
  assert.equal(out.countryNot, undefined, 'the stored "not" goes with its countries');
  assert.equal(out.sortKey, 'beauty');
  assert.equal(out.gemOnly, true);
  assert.deepEqual(out.ratingRange, mirror.ratingRange, 'a group the link does not name stays');
});

test('the person groups stay the device\'s when it has them', () => {
  const out = mergeLinkOverMirror(decodeState('?g=6&o=AMS&fav=d:LIS&ls=9,9,9,9,9,9,9,1&t=train&ty=x'), mirror);
  assert.equal(out.group_size, 3);
  assert.equal(out.children, 1);
  assert.equal(out.origin, 'BRU');
  assert.deepEqual(out.origins, ['BRU', 'CRL']);
  assert.deepEqual(out.favorites, mirror.favorites);
  assert.deepEqual(out.lifestyle, mirror.lifestyle);
  assert.equal(out.transport_mode, 'car');
});

test('a link fills a person group only on a device that has none', () => {
  const out = mergeLinkOverMirror(decodeState('?g=4&gc=2&o=AMS&fav=d:LIS'), decodeState('cf=IT'));
  assert.equal(out.group_size, 4);
  assert.equal(out.children, 2);
  assert.equal(out.origin, 'AMS');
  assert.equal(out.favorites.length, 1);
  assert.deepEqual(out.countryFilter, ['IT']);
  const fresh = mergeLinkOverMirror(decodeState('?g=4&o=AMS'), null);
  assert.equal(fresh.group_size, 4);
  assert.equal(fresh.origin, 'AMS');
});

test('the home point never comes from a link', () => {
  assert.equal(mergeLinkOverMirror(decodeState('?dh=48.85,2.35,Paris'), null).drive_home, undefined);
  assert.deepEqual(mergeLinkOverMirror(decodeState('?dh=48.85,2.35,Paris'), mirror).drive_home, mirror.drive_home);
});

test('the view never comes from the mirror, seeds only from the link', () => {
  assert.equal(mergeLinkOverMirror({}, mirror).activeTab, undefined);
  const out = mergeLinkOverMirror(decodeState('?tab=plan&mode=day&dest=BRU'), mirror);
  assert.equal(out.daySeedDest, 'BRU');
  assert.ok(out.activeTab);
});

test('loadInitialState merges the address over the mirror (fake window)', () => {
  const store = { 'continent.state.v1': 'g=3&o=BRU&dh=50.85,4.35,Home&d=2027-05-01&r=2027-05-04' };
  globalThis.window = {
    location: { search: '?tab=explore&cf=ES', pathname: '/', hash: '' },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  };
  try {
    const out = loadInitialState();
    assert.equal(out.group_size, 3);
    assert.equal(out.origin, 'BRU');
    assert.equal(out.departDate, '2027-05-01');
    assert.deepEqual(out.drive_home, { lat: 50.85, lon: 4.35, name: 'Home' });
    assert.deepEqual(out.countryFilter, ['ES']);
  } finally {
    delete globalThis.window;
  }
});
