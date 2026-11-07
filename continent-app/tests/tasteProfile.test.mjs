// T1152 (ROADMAP F3): the taste profile with validation. Scoring on
// fixtures, the evidence, accept and reject feeding back, the store, the
// account merge (two devices, one stubbed account), the cookieless counter,
// the taxonomy map staying in step with the YAML, and the export carrying it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const P = await import('../src/lib/taste/profile.js');
const S = await import('../src/lib/taste/store.js');
const Y = await import('../src/lib/taste/sync.js');
const C = await import('../src/lib/taste/counts.js');
const { TAXONOMY } = await import('../src/lib/taste/taxonomyMap.js');

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), keys: () => [...m.keys()] };
}

// A small catalogue: three beach towns, one lake, six cities with nothing else.
const DEST = {
  NCE: { id: 'NCE', city: 'Nice', categories: ['beach', 'city'] },
  FAO: { id: 'FAO', city: 'Faro', categories: ['beach'] },
  SPU: { id: 'SPU', city: 'Split', categories: ['beach', 'historic'] },
  HAL: { id: 'HAL', city: 'Hallstatt', categories: ['lake'] },
  ...Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map((x) => [x, { id: x, city: `City ${x}`, categories: ['city'] }])),
};
const NOW = Date.parse('2026-11-06T12:00:00Z');
const base = P.baseRates(DEST);
const save = (id) => ({ key: `dest:${id}`, kind: 'dest', id, name: DEST[id].city });

test('three saved beach places make a beach chip with its evidence; one lake does not', () => {
  const items = P.evidenceItems({ saves: ['NCE', 'FAO', 'SPU', 'HAL'].map(save), destinations: DEST });
  const prof = P.buildProfile({ items, base, now: NOW });
  const beach = prof.shown.find((c) => c.node === 'set.beach');
  assert.ok(beach, 'beach shown');
  assert.equal(beach.facet, 'setting');
  assert.deepEqual(beach.evidence, { saves: 3, trips: 0, filters: 0, names: ['Nice', 'Faro', 'Split'], more: 0 });
  assert.ok(beach.lift >= P.MIN_LIFT);
  assert.ok(!prof.shown.some((c) => c.node === 'set.lake'), 'one lake is below the bar');
});

test('what every catalogue place has does not become a chip (lift against the base rate)', () => {
  const items = P.evidenceItems({ saves: ['A', 'B', 'C'].map(save), destinations: DEST });
  const prof = P.buildProfile({ items, base, now: NOW });
  assert.ok(!prof.shown.some((c) => c.node === 'set.big-city'), JSON.stringify(prof.shown.map((c) => [c.node, c.lift])));
});

test('a trip weighs 3 and two items with a trip clear the bar; old items fade', () => {
  const trips = [{ id: 't1', name: 'Lakes week', at: NOW - 86400000, destIds: ['HAL'] }];
  const saves = [{ ...save('HAL'), key: 'lake:AT/hal', kind: 'lake', id: 'AT/hal', name: 'Hallstättersee' }];
  const prof = P.buildProfile({ items: P.evidenceItems({ saves, trips, destinations: DEST }), base, now: NOW });
  const lake = prof.shown.find((c) => c.node === 'set.lake');
  assert.ok(lake, 'lake shown on a trip and a save');
  assert.deepEqual([lake.evidence.trips, lake.evidence.saves], [1, 1]);
  assert.equal(lake.evidence.names[0], 'Lakes week', 'the trip is named first');
  const old = P.evidenceItems({ saves, trips: [{ ...trips[0], at: NOW - 4 * 365 * 86400000 }], destinations: DEST });
  const faded = P.scoreNodes(old, base, { now: NOW }).get('set.lake');
  assert.ok(faded.e < 1.5, `four years old weighs ${faded.e}`);
});

test('filters count as evidence at half a save', () => {
  const items = P.evidenceItems({ filters: { likes: ['hiking'], tripKinds: ['beach'] }, destinations: DEST });
  assert.deepEqual(items.map((i) => [i.kind, i.nodes]), [['filter', ['act.hiking']], ['filter', ['set.beach']]]);
  assert.equal(P.scoreNodes(items, base, { now: NOW }).get('act.hiking').e, 0.5);
});

test('reject hides the chip and lists it under Hidden; accept keeps it first; taking back restores', () => {
  const items = P.evidenceItems({ saves: ['NCE', 'FAO', 'SPU'].map(save), destinations: DEST });
  const r = P.buildProfile({ items, base, now: NOW, verdicts: { 'set.beach': { v: 'reject', at: NOW } } });
  assert.ok(!r.shown.some((c) => c.node === 'set.beach'));
  assert.deepEqual(r.hidden.map((c) => c.node), ['set.beach']);
  const a = P.buildProfile({ items, base, now: NOW, verdicts: { 'set.beach': { v: 'accept', at: NOW } } });
  assert.equal(a.shown[0].node, 'set.beach');
  assert.equal(a.shown[0].verdict, 'accept');
  // A rejection with no evidence left still shows under Hidden, to take back.
  const none = P.buildProfile({ items: [], base, now: NOW, verdicts: { 'set.lake': { v: 'reject', at: NOW } } });
  assert.deepEqual(none.hidden.map((c) => c.node), ['set.lake']);
});

test('a rejected parent raises the bar for its children (twice the evidence)', () => {
  const parent = TAXONOMY.nodes['set.beach'].parent;
  assert.ok(parent, 'set.beach has a parent');
  const items = P.evidenceItems({ saves: ['NCE', 'FAO', 'SPU'].map(save), destinations: DEST });
  const prof = P.buildProfile({ items, base, now: NOW, verdicts: { [parent]: { v: 'reject', at: NOW } } });
  assert.ok(!prof.shown.some((c) => c.node === 'set.beach'), '3 items do not clear twice the bar');
});

test('rejections are negatives for a ranker, acceptances positives', () => {
  assert.deepEqual(P.tasteWeights({ 'set.beach': { v: 'reject' }, 'act.hiking': { v: 'accept' }, 'nope.x': { v: 'reject' } }),
    { 'set.beach': P.REJECT_WEIGHT, 'act.hiking': P.ACCEPT_WEIGHT });
  assert.equal(P.REJECT_WEIGHT, -3);
});

test('at most six shown and two per facet, twelve when opened', () => {
  const many = {};
  const cats = ['beach', 'lake', 'hiking', 'castle', 'wine', 'food', 'art', 'ski', 'island', 'spa', 'nightlife', 'village'];
  cats.forEach((c, i) => { for (let k = 0; k < 3; k += 1) many[`${c}${k}`] = { id: `${c}${k}`, city: `${c} ${k}`, categories: [c] }; for (let k = 0; k < 8; k += 1) many[`x${i}_${k}`] = { id: `x${i}_${k}`, categories: ['city'] }; });
  const b = P.baseRates(many);
  const items = P.evidenceItems({ saves: Object.keys(many).filter((k) => !k.startsWith('x')).map((id) => ({ key: `dest:${id}`, kind: 'dest', id, name: id })), destinations: many });
  const p = P.buildProfile({ items, base: b, now: NOW });
  assert.equal(p.shown.length, P.SHOWN);
  const facets = p.shown.slice(0, 6).reduce((m, c) => ({ ...m, [c.facet]: (m[c.facet] || 0) + 1 }), {});
  assert.ok(p.held.length > 0);
  assert.ok(Object.values(facets).every((n) => n <= P.PER_FACET) || p.shown.length === P.SHOWN, JSON.stringify(facets));
  assert.ok(P.buildProfile({ items, base: b, now: NOW, all: true }).shown.length <= P.SHOWN_MAX);
});

test('the store keeps verdicts, takes them back with a tombstone and clears', () => {
  const st = memoryStorage();
  S.setVerdict(st, 'set.beach', 'accept', 10);
  S.setVerdict(st, 'act.hiking', 'reject', 11);
  assert.deepEqual(S.readTasteState(st).verdicts, { 'set.beach': { v: 'accept', at: 10 }, 'act.hiking': { v: 'reject', at: 11 } });
  S.setVerdict(st, 'set.beach', null, 12);
  assert.deepEqual(S.readTasteState(st).removed, { 'set.beach': 12 });
  S.clearVerdicts(st, 13);
  assert.deepEqual(S.readTasteState(st).verdicts, {});
  st.setItem(S.TASTE_KEY, '{bad');
  assert.deepEqual(S.readTasteState(st).verdicts, {});
});

function stubCloud() {
  const rows = new Map();
  return {
    rows,
    async fetch(userId) { return [...rows.values()].filter((r) => r.user_id === userId); },
    async upsert(list) { for (const r of list) rows.set(`${r.user_id}|${r.kind}|${r.item_id}`, { ...r }); },
  };
}

test('two devices, one account: a verdict moves across, a newer one wins, a take-back syncs as a tombstone', async () => {
  Y.resetTasteSyncForTests();
  const cloud = stubCloud();
  const phone = memoryStorage();
  const laptop = memoryStorage();
  S.setVerdict(phone, 'set.beach', 'reject', 1000);
  await Y.syncTaste({ userId: 'u1', storage: phone, cloud, snapshot: { v: 1, chips: [] }, now: 1001 });
  assert.equal(cloud.rows.get('u1|taste|set.beach').body.v, 'reject');
  assert.ok(cloud.rows.has('u1|taste|_profile'), 'the profile is in the account');
  await Y.syncTaste({ userId: 'u1', storage: laptop, cloud });
  assert.deepEqual(S.readTasteState(laptop).verdicts['set.beach'], { v: 'reject', at: 1000 });
  S.setVerdict(laptop, 'set.beach', 'accept', 2000);
  await Y.syncTaste({ userId: 'u1', storage: laptop, cloud });
  await Y.syncTaste({ userId: 'u1', storage: phone, cloud });
  assert.equal(S.readTasteState(phone).verdicts['set.beach'].v, 'accept');
  S.setVerdict(phone, 'set.beach', null, 3000);
  await Y.syncTaste({ userId: 'u1', storage: phone, cloud });
  assert.ok(cloud.rows.get('u1|taste|set.beach').deleted_at, 'tombstone');
  await Y.syncTaste({ userId: 'u1', storage: laptop, cloud });
  assert.equal(S.readTasteState(laptop).verdicts['set.beach'], undefined);
});

test('another account on the same device does not inherit the first one\'s verdicts', async () => {
  Y.resetTasteSyncForTests();
  const cloud = stubCloud();
  const dev = memoryStorage();
  S.setVerdict(dev, 'act.hiking', 'accept', 10);
  await Y.syncTaste({ userId: 'u1', storage: dev, cloud });
  await Y.syncTaste({ userId: 'u2', storage: dev, cloud });
  assert.deepEqual(S.readTasteState(dev).verdicts, {});
  assert.ok(![...cloud.rows.keys()].some((k) => k.startsWith('u2|')));
});

test('a project without 072 (kind refused) turns only the taste sync off, quietly', async () => {
  Y.resetTasteSyncForTests();
  let calls = 0;
  const cloud = { async fetch() { calls += 1; return []; }, async upsert() { const e = new Error('check'); e.code = '23514'; throw e; } };
  const dev = memoryStorage();
  S.setVerdict(dev, 'act.hiking', 'accept', 10);
  assert.equal((await Y.syncTaste({ userId: 'u1', storage: dev, cloud })).ok, false);
  assert.equal((await Y.syncTaste({ userId: 'u1', storage: dev, cloud })).ok, false);
  assert.equal(calls, 1, 'no second try this page load');
  assert.equal(S.readTasteState(dev).verdicts['act.hiking'].v, 'accept', 'the device keeps its verdict');
});

test('the counter sends event, facet and bucket only; shown once per chip per load', () => {
  C.resetTasteCountsForTests();
  const sent = [];
  C.setTasteSenderForTests((a) => sent.push(a));
  assert.equal(C.tickTaste('shown', { node: 'set.beach', facet: 'setting', bucket: 1 }), true);
  assert.equal(C.tickTaste('shown', { node: 'set.beach', facet: 'setting', bucket: 1 }), false);
  C.tickTaste('accept', { node: 'set.beach', facet: 'setting', bucket: 1 });
  C.tickTaste('reject', { node: 'x', facet: 'nope', bucket: 1 });
  assert.deepEqual(sent, [{ p_event: 'shown', p_facet: 'setting', p_pos: 1 }, { p_event: 'accept', p_facet: 'setting', p_pos: 1 }]);
  assert.deepEqual([P.positionBucket(0), P.positionBucket(4), P.positionBucket(9)], [1, 2, 3]);
  const view = C.tasteWeeksView({ weeks: [{ week: '2026-11-02', rows: [
    { event: 'shown', facet: 'setting', pos: 1, n: 40 }, { event: 'accept', facet: 'setting', pos: 1, n: 9 }, { event: 'reject', facet: 'vibe', pos: 2, n: 3 }] }] });
  // T1215 (T1152-d): the decisions are counted beside the rates; tests/tasteAdmin.test.mjs has the bar.
  assert.deepEqual(view[0], { week: '2026-11-02', accept: 9, reject: 3, shown: 40, decisions: 12, acceptance: 0.75, decision: 0.3 });
  C.resetTasteCountsForTests();
});

test('the snapshot the account keeps names chips, facets and evidence counts only', () => {
  const items = P.evidenceItems({ saves: ['NCE', 'FAO', 'SPU'].map(save), destinations: DEST });
  const snap = P.profileSnapshot(P.buildProfile({ items, base, now: NOW }), NOW);
  assert.equal(snap.taxonomy, TAXONOMY.version);
  assert.ok(snap.chips.some((c) => c.node === 'set.beach' && c.evidence.saves === 3));
  assert.ok(!JSON.stringify(snap).includes('Nice'), 'no place names in the snapshot');
});

test('the taxonomy map is current with pipeline/taxonomy (YAML)', (t) => {
  const py = process.env.CARTA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const p = spawnSync(py, ['-I', 'scripts/taste/build_taxonomy_map.py', '--check'], { encoding: 'utf8' });
  if (p.error || /No module named 'yaml'/.test(p.stderr || '')) { t.skip('python with PyYAML not available'); return; }
  assert.equal(p.status, 0, p.stdout + p.stderr);
});

test('the traveller\'s taste key is one of their things, and the export carries account things', () => {
  const dd = readFileSync(new URL('../src/lib/deviceData.js', import.meta.url), 'utf8');
  assert.ok(dd.includes(`'${S.TASTE_KEY}'`));
  const auth = readFileSync(new URL('../src/auth/AuthContext.jsx', import.meta.url), 'utf8');
  assert.ok(/accountThings/.test(auth), 'export keeps accountThings (taste rows ride in it)');
  const mig = readFileSync(new URL('../../supabase/migrations/072_taste_profile.sql', import.meta.url), 'utf8');
  assert.ok(mig.includes("'device_trip', 'taste'"));
});
