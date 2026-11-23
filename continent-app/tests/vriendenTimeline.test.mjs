// G16 (Vrienden version 3, decision 0017): the page as one timeline. One
// fact once, merges, caps, the row scale, saffron on the soonest overlap,
// the strip order, and the example built from real places with no side
// effects. Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimeline, waitingOf, stripOf, exampleTimeline, mergeSamePlace, balancesOf, EXAMPLE_ME, EXAMPLE_BALANCE_CENTS,
} from '../src/together/home/timeline.js';

const TODAY = '2026-11-23';
const ME = 'me';
const add = (n) => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const trip = (owner, id, place, a, b) => ({
  ownerId: owner, ownerHandle: owner, ownerName: owner.toUpperCase(), ownerEmoji: '', tripPlanId: id, label: '',
  startDate: add(a), endDate: add(b), cities: [place], destinationIds: [place],
});
const plan = (id, place, a, b) => ({ id, label: '', start_date: add(a), end_date: add(b), destination_ids: [place], cities: [place] });
const overlap = (friend, tripId, place, a, b, planId) => ({
  key: `${friend}:${tripId}`, friendId: friend, friendName: friend.toUpperCase(), emoji: '', destId: place, city: place,
  start: add(a), end: add(b), mine: { planId, start: add(a - 1), end: add(b + 1) }, theirs: { tripPlanId: tripId, start: add(a), end: add(b) },
});
const ids = (tl) => [...tl.bands.flatMap((b) => [...b.moments, ...b.hidden]), ...tl.undated].map((m) => m.id);

test('timeline: an overlap replaces the friend trip and absorbs your plan; each fact once', () => {
  const tl = buildTimeline({
    me: ME,
    friendTrips: [trip('sam', 't1', 'LIS', 20, 24), trip('jo', 't2', 'GNT', 60, 62)],
    myPlans: [plan('p1', 'LIS', 19, 25)],
    overlaps: [overlap('sam', 't1', 'LIS', 20, 24, 'p1')],
    waiting: [],
  }, TODAY);
  const all = ids(tl);
  assert.deepEqual(all.sort(), ['ft:t2', 'ov:sam:t1']);
  assert.equal(new Set(all).size, all.length);
});

test('timeline: the same place on overlapping days merges into one card with stacked faces', () => {
  const tl = buildTimeline({
    me: ME,
    friendTrips: [trip('jo', 'a', 'GNT', 30, 33), trip('ana', 'b', 'GNT', 32, 36), trip('lea', 'c', 'GNT', 50, 52)],
    waiting: [],
  }, TODAY);
  const ms = tl.bands.flatMap((b) => b.moments);
  const ghent = ms.find((m) => m.people.length === 2);
  assert.ok(ghent, 'jo and ana merge');
  assert.deepEqual(ghent.people.map((p) => p.id).sort(), ['ana', 'jo']);
  assert.equal(ms.length, 2, 'lea, weeks later, stays her own card');
  assert.equal(mergeSamePlace([]).length, 0);
});

test('timeline: a kring or group waiting on you sits in Nu, not on the line', () => {
  const circle = {
    id: 'c1', name: 'Unif', ownerId: 'sam', myStatus: 'joined',
    members: [{ userId: ME, status: 'joined', name: 'Me' }, { userId: 'sam', status: 'joined', name: 'Sam' }],
    proposals: [{ id: 'p', destId: 'SPU', created_at: '2026-10-01' }], votes: [], availability: [],
  };
  const s = { userId: ME, links: [], circles: [circle], groups: [], invites: [], joinToMe: [], ledgers: {} };
  const waiting = waitingOf(s);
  assert.deepEqual(waiting.map((w) => w.kind), ['circleVote']);
  const tl = buildTimeline({ me: ME, circles: [circle], waiting }, TODAY);
  assert.equal(ids(tl).length, 0);
  const voted = { ...circle, votes: [{ proposal_id: 'p', user_id: ME, value: 1 }] };
  const tl2 = buildTimeline({ me: ME, circles: [voted], waiting: waitingOf({ ...s, circles: [voted] }) }, TODAY);
  assert.deepEqual(ids(tl2), ['k:c1'], 'voted: the kring is on the line, undated without a window');
  assert.equal(tl2.undated[0].lead.destId, 'SPU');
});

test('timeline: Nu shows 3, a month 4, the rest behind its count', () => {
  const waiting = Array.from({ length: 6 }, (_, i) => ({ id: `f:${i}`, kind: 'request', person: { id: `p${i}`, name: '' } }));
  const trips = Array.from({ length: 7 }, (_, i) => trip(`f${i}`, `t${i}`, `X${i}`, 40 + i, 41 + i));
  const tl = buildTimeline({ me: ME, friendTrips: trips, waiting }, TODAY);
  assert.equal(tl.count, 6);
  assert.equal(tl.nowShown.length, 3);
  const all = tl.bands.reduce((n, b) => n + b.moments.length + b.hidden.length, 0);
  assert.equal(all, 7);
  for (const b of tl.bands) assert.ok(b.moments.length <= 4);
  assert.ok(tl.bands.some((b) => b.hidden.length > 0));
});

test('timeline: from the third band on the row scale; months in order; past trips gone', () => {
  const trips = [trip('a', 'x', 'A', 3, 4), trip('b', 'y', 'B', 40, 41), trip('c', 'z', 'C', 80, 81), trip('d', 'old', 'D', -30, -25)];
  const tl = buildTimeline({ me: ME, friendTrips: trips, waiting: [] }, TODAY);
  assert.deepEqual(tl.bands.map((b) => b.scale), ['full', 'full', 'row']);
  assert.equal(tl.bands[0].thisMonth, true);
  assert.ok(!ids(tl).includes('ft:old'));
  const withNu = buildTimeline({ me: ME, friendTrips: trips, waiting: [{ id: 'f:1', kind: 'request' }] }, TODAY);
  assert.deepEqual(withNu.bands.map((b) => b.scale), ['full', 'row', 'row'], 'Nu counts as the first band');
  assert.equal(tl.next.id, 'ft:x');
});

test('timeline: saffron on the soonest overlap only', () => {
  const tl = buildTimeline({
    me: ME,
    overlaps: [overlap('sam', 't1', 'LIS', 50, 52, 'p1'), overlap('jo', 't2', 'OPO', 20, 22, 'p2')],
    waiting: [],
  }, TODAY);
  const marked = tl.bands.flatMap((b) => b.moments).filter((m) => m.saffron);
  assert.deepEqual(marked.map((m) => m.id), ['ov:jo:t2']);
});

test('waiting and balances: the order and the signs', () => {
  const ledgers = { g: { expenses: [{ id: 'e', paidBy: ME, amountCents: 3000, splitAmong: [ME, 'sam'] }], settlements: [] } };
  assert.deepEqual(balancesOf(ledgers, ME), [{ id: 'sam', cents: 1500, groupId: 'g' }]);
  const s = {
    userId: ME, ledgers,
    links: [{ id: 'l1', kind: 'incoming', userId: 'lea', displayName: 'Lea' }, { id: 'l2', kind: 'friend', userId: 'sam', displayName: 'Sam' }],
    joinToMe: [{ id: 'j1', tripPlanId: 'p1', requesterId: 'jo', name: 'Jo' }],
    invites: [{ tripPlanId: 'cp', ownerHandle: 'jo', ownerName: 'Jo' }],
    groups: [], circles: [], myPlans: [],
  };
  assert.deepEqual(waitingOf(s).map((w) => w.kind), ['request', 'join', 'coplanInvite', 'balance']);
  assert.equal(waitingOf(s).at(-1).person.name, 'Sam');
});

test('strip: friends by soonest trip, then people you asked, then kringen', () => {
  const s = {
    links: [
      { id: '1', kind: 'friend', userId: 'ana', displayName: 'Ana' },
      { id: '2', kind: 'friend', userId: 'sam', displayName: 'Sam' },
      { id: '3', kind: 'friend', userId: 'bo', displayName: 'Bo' },
      { id: '4', kind: 'outgoing', userId: 'mia', displayName: 'Mia' },
      { id: '5', kind: 'incoming', userId: 'lea', displayName: 'Lea' },
    ],
    friendTrips: [trip('ana', 'a', 'X', 90, 91), trip('sam', 's', 'Y', 10, 12)],
    circles: [{ id: 'c', name: 'Unif', myStatus: 'joined' }, { id: 'd', name: 'Nope', myStatus: 'invited' }],
  };
  assert.deepEqual(stripOf(s, TODAY).map((x) => `${x.kind}:${x.id}`), ['friend:sam', 'friend:ana', 'friend:bo', 'pending:mia', 'circle:c']);
});

const CATALOGUE = Object.freeze({
  LIS: Object.freeze({ city: 'Lisbon', image: Object.freeze({ url: '/i/lis.jpg' }) }),
  NAP: Object.freeze({ city: 'Naples', image: Object.freeze({ url: '/i/nap.jpg' }) }),
  SPU: Object.freeze({ city: 'Split', image: Object.freeze({ url: '/i/spu.jpg' }) }),
  OPO: Object.freeze({ city: 'Porto', image: null }),
  AAA: Object.freeze({ city: 'Aa', image: Object.freeze({ url: '/i/a.jpg' }) }),
  BBB: Object.freeze({ city: 'Bb', image: Object.freeze({ url: '/i/b.jpg' }) }),
});

test('example: real places with photos, dates from today, the same timeline', () => {
  const ex = exampleTimeline(CATALOGUE, TODAY, { circle: 'Weekend', list: 'Ideeën' });
  assert.equal(ex.example, true);
  const places = new Set([...ex.friendTrips.flatMap((t) => t.destinationIds), ...ex.circles[0].proposals.map((p) => p.destId), ...ex.sharedLists[0].items]);
  for (const id of places) assert.ok(CATALOGUE[id]?.image?.url, `${id} has a photo`);
  assert.ok(!places.has('OPO'), 'a place without a photo is never picked');
  for (const t of ex.friendTrips) assert.ok(t.startDate > TODAY);
  assert.equal(ex.waiting.find((w) => w.kind === 'balance').cents, EXAMPLE_BALANCE_CENTS);
  const tl = buildTimeline({ ...ex, me: EXAMPLE_ME, groupTrips: ex.groupTrips }, TODAY);
  assert.equal(tl.count, 2);
  assert.equal(tl.bands[0].moments[0].kind, 'overlap');
  assert.equal(tl.bands[0].moments[0].saffron, true);
  assert.deepEqual(tl.undated.map((m) => m.kind).sort(), ['circle', 'list']);
  assert.deepEqual(exampleTimeline(CATALOGUE, TODAY), exampleTimeline(CATALOGUE, TODAY), 'deterministic');
});

test('example: pure, it reads no storage and sends nothing', () => {
  const touched = [];
  const trap = new Proxy({}, { get: (_, k) => { touched.push(String(k)); return () => { throw new Error('touched'); }; } });
  const saved = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  Object.defineProperty(globalThis, 'localStorage', { value: trap, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: trap, configurable: true, writable: true });
  globalThis.fetch = () => { touched.push('fetch'); throw new Error('fetch'); };
  try {
    const ex = exampleTimeline(CATALOGUE, TODAY);
    buildTimeline({ ...ex, me: EXAMPLE_ME }, TODAY);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: saved.localStorage, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: saved.sessionStorage, configurable: true, writable: true });
    globalThis.fetch = saved.fetch;
  }
  assert.deepEqual(touched, []);
  assert.ok(Object.isFrozen(CATALOGUE.LIS), 'the catalogue is untouched');
});
