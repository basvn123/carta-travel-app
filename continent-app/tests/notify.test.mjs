// T944: the notify Edge Function's pure rules (supabase/functions/notify/
// logic.mjs) and the page's half (src/lib/priceDrop.js): the unsubscribe
// token, "send once" for reminders and price drops, and the one drop rule
// both sides share. Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unsubToken, verifyUnsub, unsubUrl, unsubPatch, pickReminders, pickDrops, reminderRef,
  isClearDrop as serverDrop, DROP_MIN_EUR, DROP_MIN_SHARE, reminderEmail, dropEmail, words, LANGS,
} from '../../supabase/functions/notify/logic.mjs';
import {
  isClearDrop as pageDrop, findDrops, DROP_MIN_EUR as PAGE_MIN_EUR, DROP_MIN_SHARE as PAGE_MIN_SHARE,
} from '../src/lib/priceDrop.js';

const U = '6f1c2a34-1b2c-4d5e-8f90-1234567890ab';
const SECRET = 'test-secret-long-enough';

test('the unsubscribe token verifies for its account and kind only', async () => {
  const t = await unsubToken(SECRET, U, 'trip');
  assert.equal(t.length, 32);
  assert.match(t, /^[A-Za-z0-9_-]+$/);
  assert.equal(await verifyUnsub(SECRET, U, 'trip', t), true);
  assert.equal(await verifyUnsub(SECRET, U, 'price', t), false);
  assert.equal(await verifyUnsub(SECRET, U.replace('6f', '7f'), 'trip', t), false);
  assert.equal(await verifyUnsub('another-secret', U, 'trip', t), false);
  assert.equal(await verifyUnsub(SECRET, U, 'trip', `${t.slice(0, 31)}x`), false);
  assert.equal(await verifyUnsub(SECRET, U, 'trip', ''), false);
  assert.equal(await verifyUnsub('', U, 'trip', t), false);
  assert.equal(await unsubToken(SECRET, U, 'bogus'), '');
});

test('the unsubscribe link carries the account, kind and token', async () => {
  const url = new URL(await unsubUrl('https://x.supabase.co/functions/v1/notify', SECRET, U, 'price'));
  assert.equal(url.searchParams.get('u'), U);
  assert.equal(url.searchParams.get('k'), 'price');
  assert.equal(await verifyUnsub(SECRET, U, 'price', url.searchParams.get('t')), true);
  assert.deepEqual(unsubPatch('trip'), { trip_reminders: false });
  assert.deepEqual(unsubPatch('price'), { price_drops: false });
  assert.deepEqual(unsubPatch('all'), { trip_reminders: false, price_drops: false });
  assert.equal(unsubPatch('x'), null);
});

const row = (over = {}) => ({
  user_id: U, email: 'a@example.com', lang: 'en', trip_plan_id: 'p1', label: 'Portugal', starts: '2026-11-07', places: ['Lisbon', 'Porto'], ...over,
});

test('a reminder is due 7 days ahead, or 6 to catch a missed run, never earlier', () => {
  const today = '2026-10-31';
  assert.equal(pickReminders([row()], new Set(), today).length, 1);
  assert.equal(pickReminders([row({ starts: '2026-11-06' })], new Set(), today)[0].days, 6);
  assert.equal(pickReminders([row({ starts: '2026-11-08' })], new Set(), today).length, 0);
  assert.equal(pickReminders([row({ starts: '2026-11-01' })], new Set(), today).length, 0);
});

test('a reminder is sent once: a logged ref and a duplicate row are dropped', () => {
  const today = '2026-10-31';
  const r = row();
  const sent = new Set([`${U}|${reminderRef(r)}`]);
  assert.equal(pickReminders([r], sent, today).length, 0);
  assert.equal(pickReminders([r, { ...r }], new Set(), today).length, 1);
  // A moved start date is a new trip date and gets its own reminder.
  const moved = row({ starts: '2026-11-06' });
  assert.equal(pickReminders([moved], sent, today).length, 1);
  // Another account's log does not hide this one.
  assert.equal(pickReminders([r], new Set([`other|${reminderRef(r)}`]), today).length, 1);
});

test('page and server share one clear-drop rule', () => {
  assert.equal(DROP_MIN_EUR, PAGE_MIN_EUR);
  assert.equal(DROP_MIN_SHARE, PAGE_MIN_SHARE);
  for (const [was, now] of [[60, 54], [60, 55], [60, 50], [40, 35], [40, 36], [200, 185], [200, 180], [0, 0], [50, 60]]) {
    assert.equal(serverDrop(was, now), pageDrop(was, now), `${was} to ${now}`);
  }
  assert.equal(serverDrop(60, 54), true);
  assert.equal(serverDrop(60, 56), false);
  assert.equal(serverDrop(200, 185), false);
});

const NOW = Date.parse('2026-10-31T10:00:00Z');
const DAY = '2026-10-31';

test('price drops: cleaned, at most one email a day, a place once a week', () => {
  const items = [
    { key: 'dest:LIS', city: 'Lisbon', was: 62, now: 51 },
    { key: 'dest:OPO', city: 'Porto', was: 50, now: 49 },
    { key: 'trail:PT/x', city: 'A trail', was: 50, now: 20 },
    { key: 'dest:LIS', city: 'Lisbon', was: 62, now: 51 },
    { key: 'dest:BCN', city: '', was: 80, now: 60 },
  ];
  const out = pickDrops(items, [], NOW, DAY);
  assert.deepEqual(out.map((i) => i.key), ['dest:LIS']);
  assert.equal(out[0].ref, 'price:dest:LIS:2026-10-31');
  // A price email 3 hours ago: nothing now.
  assert.equal(pickDrops(items, [{ ref: 'price:dest:FCO:2026-10-31', sent_at: new Date(NOW - 3 * 3600e3).toISOString() }], NOW, DAY).length, 0);
  // Lisbon was mailed 3 days ago: left out; Rome still goes.
  const recent = [{ ref: 'price:dest:LIS:2026-10-28', sent_at: new Date(NOW - 3 * 86400e3).toISOString() }];
  const more = [...items, { key: 'dest:FCO', city: 'Rome', was: 90, now: 70 }];
  assert.deepEqual(pickDrops(more, recent, NOW, DAY).map((i) => i.key), ['dest:FCO']);
  // Eight days ago no longer counts.
  const old = [{ ref: 'price:dest:LIS:2026-10-23', sent_at: new Date(NOW - 8 * 86400e3).toISOString() }];
  assert.deepEqual(pickDrops(items, old, NOW, DAY).map((i) => i.key), ['dest:LIS']);
  assert.equal(pickDrops('nope', [], NOW, DAY).length, 0);
});

test('the page finds drops on saved places only, and not twice at the same price', () => {
  const favorites = new Set(['dest:LIS', 'dest:OPO', 'dest:FCO', 'trail:PT/x']);
  const meta = { 'dest:LIS': { eur: 62 }, 'dest:OPO': { eur: 50 }, 'dest:FCO': { eur: 90, gone: 1 }, 'trail:PT/x': { eur: 40 } };
  const prices = { LIS: 51.4, OPO: 49, FCO: 60 };
  const args = { favorites, meta, priceOf: (id) => prices[id] ?? null, nameOf: (id) => ({ LIS: 'Lisbon', OPO: 'Porto', FCO: 'Rome' }[id]) };
  assert.deepEqual(findDrops(args), [{ key: 'dest:LIS', city: 'Lisbon', was: 62, now: 51 }]);
  assert.equal(findDrops({ ...args, asked: { 'dest:LIS': 51 } }).length, 0);
  assert.equal(findDrops({ ...args, asked: { 'dest:LIS': 55 } }).length, 1);
});

test('every email has its words in six languages, no dashes, the unsubscribe link', () => {
  for (const lang of LANGS) {
    for (const v of Object.values(words(lang))) assert.doesNotMatch(v, /[–—·]/, `${lang}: ${v}`);
    const r = reminderEmail({ lang, label: '', places: ['Lisbon', 'Porto'], starts: '2026-11-07', days: 7, appUrl: 'https://a.b', unsub: 'https://u.v/?t=1' });
    assert.match(r.subject, /7/);
    assert.match(r.text, /https:\/\/u\.v\/\?t=1/);
    assert.match(r.html, /Lisbon/);
    const d = dropEmail({ lang, items: [{ city: 'Lisbon', was: 62, now: 51 }], appUrl: 'https://a.b', unsub: 'https://u.v/?t=1' });
    assert.match(d.subject, /Lisbon/);
    assert.match(d.text, /51/);
    assert.match(d.html, /https:\/\/u\.v\/\?t=1/);
  }
  assert.doesNotMatch(reminderEmail({ lang: 'en', label: '<b>x</b>', places: [], starts: '2026-11-07', days: 7, appUrl: 'https://a.b', unsub: 'u' }).html, /<b>x/);
});
