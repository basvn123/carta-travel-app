// T496: the places (Explore, Plan, My trips, Account) and every old address.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routeFromSearch, tabHref, tabFromSearch, placeOf, encodeState, decodeState,
  seedQuery, LEGACY_TABS, browseQueryFrom,
} from '../src/lib/urlState.js';

test('every legacy tab opens its new place', () => {
  assert.equal(routeFromSearch('?tab=map').view, 'map');
  assert.equal(routeFromSearch('?tab=places').view, 'places');
  assert.equal(routeFromSearch('?tab=destinations').view, 'places');
  assert.equal(routeFromSearch('?tab=trip').view, 'trip');
  assert.equal(routeFromSearch('?tab=trip&cc=BE').view, 'trip');
  assert.equal(routeFromSearch('?tab=day&dest=BRU').view, 'day');
  assert.equal(routeFromSearch('?tab=home').view, 'home');
  for (const [old, view] of Object.entries(LEGACY_TABS)) {
    assert.equal(placeOf(routeFromSearch(`?tab=${old}`).view), placeOf(view));
  }
});

test('no tab and unknown tabs open Explore', () => {
  assert.equal(routeFromSearch('').view, 'map');
  assert.equal(routeFromSearch('?d=2026-11-14&g=2').view, 'map');
  assert.equal(routeFromSearch('?tab=nonsense').view, 'map');
  assert.equal(routeFromSearch('?tab=explore').view, 'map');
});

test('explore with a category is the places view', () => {
  const r = routeFromSearch('?tab=explore&cat=trails');
  assert.equal(r.view, 'places');
  assert.equal(r.cat, 'trails');
  assert.equal(routeFromSearch('?tab=explore&cat=bogus').view, 'map');
});

test('plan opens the plan in progress, else the start page', () => {
  assert.equal(routeFromSearch('?tab=plan').view, 'planstart');
  assert.equal(routeFromSearch('?tab=plan', { hasPlan: true }).view, 'trip');
  assert.equal(routeFromSearch('?tab=plan&mode=new', { hasPlan: true }).view, 'planstart');
  assert.equal(routeFromSearch('?tab=plan&mode=trip').view, 'trip');
  assert.equal(routeFromSearch('?tab=plan&mode=day').view, 'day');
  assert.equal(routeFromSearch('?tab=plan&cc=BE').view, 'trip');
});

test('My trips and Account are pages with an address', () => {
  assert.deepEqual(routeFromSearch('?tab=trips'), { view: 'map', overlay: 'trips', cat: null, accountView: null });
  const acc = routeFromSearch('?tab=account&view=friends');
  assert.equal(acc.overlay, 'account');
  assert.equal(acc.accountView, 'friends');
  assert.equal(routeFromSearch('?tab=account&view=evil').accountView, null);
  assert.equal(tabFromSearch('?tab=trips'), 'trips');
});

test('pricing is a place', () => {
  assert.equal(routeFromSearch('?tab=pricing').view, 'pricing');
});

test('tabHref writes the new keys and keeps the rest of the query', () => {
  const base = '?d=2026-11-14&g=3&tab=map&mode=day&cat=lakes';
  const q = (k, o) => new URLSearchParams(tabHref(k, base, o));
  assert.equal(q('explore').get('tab'), 'explore');
  assert.equal(q('explore').get('mode'), null);
  assert.equal(q('explore').get('g'), '3');
  assert.equal(q('places', { cat: 'beaches' }).get('cat'), 'beaches');
  assert.equal(q('plan').get('tab'), 'plan');
  assert.equal(q('plan').get('mode'), null);
  assert.equal(q('trip').get('mode'), 'trip');
  assert.equal(q('day').get('mode'), 'day');
  assert.equal(q('planstart').get('mode'), 'new');
  assert.equal(q('trips').get('tab'), 'trips');
  assert.equal(q('account', { view: 'friends' }).get('view'), 'friends');
  // Each href reads back as the view it was written for.
  for (const v of ['map', 'places', 'planstart', 'trip', 'day', 'home', 'pricing']) {
    assert.equal(routeFromSearch(tabHref(v, '')).view, v, v);
  }
});

test('encode and decode round-trip every view', () => {
  for (const v of ['map', 'places', 'planstart', 'trip', 'day', 'home', 'pricing', 'trips', 'account']) {
    const qs = encodeState({ activeTab: v, choices: {} });
    const back = decodeState(qs);
    assert.equal(back.activeTab ?? 'map', v, v);
  }
  // Explore's Places names no tab.
  assert.equal(new URLSearchParams(encodeState({ activeTab: 'map', choices: {} })).get('tab'), null);
});

test('hand-off seeds address Plan', () => {
  assert.equal(routeFromSearch(`?${seedQuery({ cc: 'BE' })}`).view, 'trip');
  assert.equal(routeFromSearch(`?${seedQuery({ dest: 'BRU' })}`).view, 'day');
  assert.equal(routeFromSearch(`?${seedQuery({ feat: { kind: 'trail', cc: 'AT', id: '1' } })}`).view, 'day');
});

test('placeOf groups views into the four places', () => {
  assert.equal(placeOf('map'), 'explore');
  assert.equal(placeOf('places'), 'explore');
  assert.equal(placeOf('planstart'), 'plan');
  assert.equal(placeOf('trip'), 'plan');
  assert.equal(placeOf('day'), 'plan');
  assert.equal(placeOf('home'), 'home');
});

// T600: Explore's overview hands its Where text to a category as `dq`.
test('a category opened with Where text keeps it in the address', () => {
  const href = tabHref('places', '?d=2026-11-14&dn=IT', { cat: 'trails', q: '  Italy ' });
  const r = routeFromSearch(href);
  assert.equal(r.view, 'places');
  assert.equal(r.cat, 'trails');
  assert.equal(browseQueryFrom(href), 'Italy');
  assert.equal(new URLSearchParams(href).get('d'), '2026-11-14');
  // Text with spaces and accents survives the round trip.
  assert.equal(browseQueryFrom(tabHref('places', '', { cat: 'beaches', q: "Côte d'Azur" })), "Côte d'Azur");
});

test('the Where text belongs to one hand-off', () => {
  // Another place, or a category opened without text, drops it.
  assert.equal(new URLSearchParams(tabHref('map', '?dq=Italy')).has('dq'), false);
  assert.equal(new URLSearchParams(tabHref('places', '?dq=Italy', { cat: 'lakes' })).has('dq'), false);
  assert.equal(new URLSearchParams(tabHref('places', '', { cat: 'lakes', q: '   ' })).has('dq'), false);
  assert.equal(browseQueryFrom(''), '');
  assert.equal(browseQueryFrom(`?dq=${'x'.repeat(200)}`).length, 80);
});
