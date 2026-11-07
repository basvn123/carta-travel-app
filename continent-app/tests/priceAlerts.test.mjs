// T1205 (I17): price alerts. The function's pure rules
// (supabase/functions/price-alerts/logic.mjs) and the page's half
// (src/lib/priceAlerts.js), with Supabase and Resend stubbed: no network.
// The database half (save, opt-in, record, fire once, unsubscribe) is in
// scripts/admin/test_rls_policies.mjs; the box's formula in
// tests/test_price_alerts.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGS, SHARES, isDue, cleanChecks, linkToken, verifyLink, linkUrl, optinEmail, dropEmail,
  resultPage, percentOff, openUrl, WORDS, CONFIRM_TTL_MS,
} from '../../supabase/functions/price-alerts/logic.mjs';
import { placeSpec, saveAlert, deleteAlert, listAlerts, SHARES as APP_SHARES } from '../src/lib/priceAlerts.js';
import { en } from '../src/i18n/en.js';
import { nl } from '../src/i18n/nl.js';
import { fr } from '../src/i18n/fr.js';
import { de } from '../src/i18n/de.js';
import { es } from '../src/i18n/es.js';
import { it as itCat } from '../src/i18n/it.js';

const SECRET = 'test-secret-0123456789';
const USER = '00000000-0000-0000-0000-00000000c001';
const DASHES = /[\u2013\u2014]/;

test('the drop rule matches price_alert_record in 073: at or below the baseline less the share, floored', () => {
  assert.equal(isDue(900, 810, 0.1), true);
  assert.equal(isDue(900, 811, 0.1), false);
  assert.equal(isDue(999, 949, 0.05), true);   // floor(949.05)
  assert.equal(isDue(999, 950, 0.05), false);
  assert.equal(isDue(500, 400, 0.2), true);
  assert.equal(isDue(500, 400, 0.15), false);  // not a share Carta offers
  assert.equal(isDue(null, 400, 0.2), false);
  assert.deepEqual(APP_SHARES, SHARES);
});

test('the box payload is cleaned: uuids once, whole euros in range', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  const out = cleanChecks([
    { id, eur: 812.4 }, { id, eur: 1 }, { id: 'nope', eur: 5 },
    { id: '22222222-2222-2222-2222-222222222222', eur: 0 },
    { id: '33333333-3333-3333-3333-333333333333', eur: 200001 }, null,
  ]);
  assert.deepEqual(out, [{ id, eur: 812 }]);
  assert.deepEqual(cleanChecks('x'), []);
});

test('confirm and unsubscribe links verify, expire and refuse tampering', async () => {
  const now = Date.parse('2026-11-07T10:00:00Z');
  const confirm = new URL(await linkUrl('https://x.test/functions/v1/price-alerts', SECRET, 'confirm', USER, now));
  const q = Object.fromEntries(confirm.searchParams);
  assert.equal(q.a, 'confirm');
  assert.equal(await verifyLink(SECRET, 'confirm', q.u, q.x, q.t, now), true);
  assert.equal(await verifyLink(SECRET, 'confirm', q.u, q.x, q.t, now + CONFIRM_TTL_MS + 1), false, 'expired');
  assert.equal(await verifyLink(SECRET, 'unsub', q.u, q.x, q.t, now), false, 'a confirm token is not an unsubscribe');
  assert.equal(await verifyLink('other-secret', 'confirm', q.u, q.x, q.t, now), false);
  assert.equal(await verifyLink(SECRET, 'confirm', '00000000-0000-0000-0000-00000000c002', q.x, q.t, now), false, 'another account');
  const unsub = Object.fromEntries(new URL(await linkUrl('https://x.test/p', SECRET, 'unsub', USER, now)).searchParams);
  assert.equal(unsub.x, '0');
  assert.equal(await verifyLink(SECRET, 'unsub', unsub.u, unsub.x, unsub.t, now + 10 * 365 * 86400000), true, 'never expires');
  assert.equal(await verifyLink(SECRET, 'unsub', unsub.u, '1', unsub.t, now), false);
  assert.equal(await linkToken(SECRET, 'confirm', 'not-a-uuid', 0), '');
});

test('the opt-in email is plain: the confirm link, an unsubscribe link, no price and no promotion', () => {
  for (const lang of LANGS) {
    const m = optinEmail({ lang, confirm: 'https://x.test/c?t=1', unsub: 'https://x.test/u?t=2' });
    assert.ok(m.subject && m.text.includes('https://x.test/c?t=1') && m.text.includes('https://x.test/u?t=2'), lang);
    assert.ok(m.html.includes('href="https://x.test/u?t=2"'), lang);
    assert.ok(!/€|EUR|\d+ ?%/.test(m.text), `${lang}: no price in the opt-in email`);
    assert.ok(!DASHES.test(m.text + m.subject), `${lang}: no em or en dash`);
  }
});

test('the drop email names both totals, the first check date and the estimate note, with the unsubscribe link', () => {
  const m = dropEmail({
    lang: 'en', label: 'Lisbon <3', was: 900, now: 810, since: '2026-10-01T07:00:00Z',
    open: openUrl('https://www.carta-europetravel.com/'), unsub: 'https://x.test/u?t=9',
  });
  assert.equal(m.subject, 'Lisbon <3 is 10% cheaper');
  assert.match(m.text, /Lisbon <3: Carta now estimates €810, against €900 when we first checked on 1 October\./);
  assert.match(m.text, /not a booking quote/);
  assert.ok(m.text.includes('https://www.carta-europetravel.com/?tab=trips'));
  assert.ok(m.text.includes('https://x.test/u?t=9'));
  assert.ok(m.html.includes('Lisbon &lt;3') && !m.html.includes('Lisbon <3'), 'the label is escaped in html');
  const nlm = dropEmail({ lang: 'nl', label: 'Lissabon', was: 900, now: 810, since: '2026-10-01', open: 'o', unsub: 'u' });
  assert.match(nlm.subject, /Lissabon is 10\s?% goedkoper/);
  assert.match(nlm.text, /€\s?810/);
  for (const lang of LANGS) {
    const x = dropEmail({ lang, label: 'P', was: 1000, now: 799, since: '2026-10-01', open: 'o', unsub: 'u' });
    assert.ok(!DASHES.test(x.text + x.subject), `${lang}: no em or en dash`);
    assert.ok(!/\{\w+\}/.test(x.text + x.subject), `${lang}: every slot filled`);
  }
  assert.equal(percentOff(1000, 799, 'en'), '20%');
});

test('every language has every word, and the result pages escape and say noindex', () => {
  const keys = Object.keys(WORDS.en).sort();
  for (const lang of LANGS) assert.deepEqual(Object.keys(WORDS[lang]).sort(), keys, lang);
  for (const kind of ['confirm', 'unsub', 'bad']) {
    const page = resultPage('de', kind, 'https://www.carta-europetravel.com');
    assert.ok(page.includes('noindex') && page.includes('lang="de"'));
  }
  assert.ok(resultPage('xx', 'unsub', 'a').includes(WORDS.en.pageUnsub));
});

test('the alerts.* keys are in all six catalogs, with the same slots and no dashes', () => {
  const cats = { en, nl, fr, de, es, it: itCat };
  const keys = Object.keys(en).filter((k) => k.startsWith('alerts.'));
  assert.equal(keys.length, 15);
  for (const [lang, cat] of Object.entries(cats)) {
    for (const k of keys) {
      assert.ok(typeof cat[k] === 'string' && cat[k], `${lang} ${k}`);
      assert.deepEqual((cat[k].match(/\{\w+\}/g) || []).sort(), (en[k].match(/\{\w+\}/g) || []).sort(), `${lang} ${k}`);
      assert.ok(!DASHES.test(cat[k]), `${lang} ${k}`);
    }
  }
});

test('placeSpec describes a place alert, with flights only when the card priced them on exact days', () => {
  const dest = { id: 'LIS', iso2: 'PT' };
  assert.deepEqual(placeSpec({ dest, month: 5, nights: 3, adults: 2, bed: 'hotel3' }),
    { stops: [{ id: 'LIS', cc: 'PT', nights: 3 }], adults: 2, bed: 'hotel3', month: 5 });
  const dated = placeSpec({ dest, start: '2027-05-03', month: 5, nights: 3, adults: 2, bed: 'hotel3',
    fly: { from: 'BRU', to: 'LIS', out: '2027-05-03', back: '2027-05-06' } });
  assert.equal(dated.start, '2027-05-03');
  assert.equal(dated.month, undefined);
  assert.deepEqual(dated.fly, { from: 'BRU', to: 'LIS', out: '2027-05-03', back: '2027-05-06' });
  assert.equal(placeSpec({ dest, month: 5, nights: 3, adults: 2, bed: 'x',
    fly: { from: 'LIS', to: 'LIS', out: '2027-05-03', back: '2027-05-06' } }).fly, undefined);
  assert.equal(placeSpec({ dest, month: 5, nights: 3, adults: 2, bed: 'x' }).bed, 'home');
  assert.equal(placeSpec({ dest, nights: 3, adults: 2, bed: 'home' }), null, 'no month and no date');
  assert.equal(placeSpec({ dest: { id: 'LIS' }, month: 5, nights: 3, adults: 2 }), null, 'no country');
  assert.equal(placeSpec({ dest, month: 5, nights: 0, adults: 2 }), null);
});

function stubSupabase({ rpc = {}, invoke = {}, table = {} } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => { calls.push(['rpc', name, args]); return rpc[name] || { data: null, error: null }; },
    functions: { invoke: async (name, opts) => { calls.push(['invoke', name, opts.body]); return invoke[name] || { data: null }; } },
    from: (t) => {
      const q = {
        select() { return q; }, eq(k, v) { calls.push(['eq', t, k, v]); return q; }, order() { return q; },
        delete() { calls.push(['delete', t]); return q; },
        then(res) { return Promise.resolve(table[t] || { data: [], error: null }).then(res); },
      };
      return q;
    },
  };
}

test('saving an alert for an unconfirmed account asks for the opt-in email once', async () => {
  const spec = placeSpec({ dest: { id: 'LIS', iso2: 'PT' }, month: 5, nights: 3, adults: 2, bed: 'hotel3' });
  const sb = stubSupabase({
    rpc: { price_alert_save: { data: { id: 'a1', confirmed: false }, error: null } },
    invoke: { 'price-alerts': { data: { ok: true, code: 'sent' } } },
  });
  const res = await saveAlert({ ref: 'dest:LIS', label: 'Lisbon', spec, share: 0.1, lang: 'nl' }, { supabase: sb });
  assert.deepEqual(res, { state: 'ok', id: 'a1', confirmed: false, mailed: true });
  assert.equal(sb.calls[0][1], 'price_alert_save');
  assert.deepEqual(sb.calls[0][2], { p_kind: 'place', p_ref: 'dest:LIS', p_label: 'Lisbon', p_spec: spec, p_share: 0.1, p_lang: 'nl', p_wording: 'alerts-v1' });
  assert.deepEqual(sb.calls[1], ['invoke', 'price-alerts', { job: 'optin', lang: 'nl' }]);
});

test('a confirmed account gets no opt-in email; a missing migration hides the control; a bad share is refused', async () => {
  const spec = { stops: [{ id: 'LIS', cc: 'PT', nights: 1 }], month: 1, adults: 1, bed: 'home' };
  const ok = stubSupabase({ rpc: { price_alert_save: { data: { id: 'a2', confirmed: true }, error: null } } });
  assert.deepEqual(await saveAlert({ ref: 'dest:LIS', label: 'L', spec }, { supabase: ok }), { state: 'ok', id: 'a2', confirmed: true, mailed: false });
  assert.equal(ok.calls.filter((c) => c[0] === 'invoke').length, 0);
  const gone = stubSupabase({ rpc: { price_alert_save: { data: null, error: { code: 'PGRST202' } } } });
  assert.deepEqual(await saveAlert({ ref: 'dest:LIS', label: 'L', spec }, { supabase: gone }), { state: 'missing' });
  assert.deepEqual(await saveAlert({ ref: 'dest:LIS', label: 'L', spec, share: 0.15 }, { supabase: ok }), { state: 'error' });
  const off = stubSupabase({
    rpc: { price_alert_save: { data: { id: 'a3', confirmed: false }, error: null } },
    invoke: { 'price-alerts': { data: { ok: false, code: 'off' } } },
  });
  assert.equal((await saveAlert({ ref: 'dest:LIS', label: 'L', spec }, { supabase: off })).mailed, false);
});

test('listing and removing go straight to the owner\'s rows', async () => {
  const sb = stubSupabase({ table: { price_alerts: { data: [{ id: 'a1' }], error: null } } });
  assert.deepEqual(await listAlerts('u1', { supabase: sb }), { state: 'ok', alerts: [{ id: 'a1' }] });
  assert.deepEqual(await deleteAlert('a1', { supabase: sb }), { state: 'ok' });
  assert.ok(sb.calls.some((c) => c[0] === 'delete'));
  const missing = stubSupabase({ table: { price_alerts: { data: null, error: { code: '42P01' } } } });
  assert.deepEqual(await listAlerts('u1', { supabase: missing }), { state: 'missing' });
});
