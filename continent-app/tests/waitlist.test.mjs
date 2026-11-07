// T1110 (K3): the waitlist's pure rules (supabase/functions/waitlist/logic.mjs)
// and the form's client half (src/lib/waitlist.js). The send is stubbed: no
// network. The database half (stored, confirmed, unsubscribed, nothing used
// before confirmation) is in scripts/admin/test_rls_policies.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanEmail, sourceOf, linkToken, verifyLink, linkUrl, confirmEmail, resultPage, words, CONFIRM_TTL_MS,
} from '../../supabase/functions/waitlist/logic.mjs';
import { joinWaitlist, validEmail } from '../src/lib/waitlist.js';
import { nl } from '../src/i18n/nl.js';
import { en } from '../src/i18n/en.js';

const SECRET = 'test-secret-long-enough';
const NOW = 1_800_000_000_000;

test('cleanEmail lower-cases and refuses what is not an address', () => {
  assert.equal(cleanEmail('  Ada@Example.COM '), 'ada@example.com');
  for (const bad of ['', 'ada', 'ada@', '@x.nl', 'a b@x.nl', 'a@x', 'a@x.nl,b@y.nl', '<a@x.nl>', null, 5, `${'a'.repeat(250)}@x.nl`]) {
    assert.equal(cleanEmail(bad), '', String(bad));
  }
});

test('sourceOf keeps a safe tag and falls back to home', () => {
  assert.equal(sourceOf('footer'), 'footer');
  assert.equal(sourceOf('Home Page!'), 'home');
  assert.equal(sourceOf(undefined), 'home');
});

test('a confirm link verifies for its address until it expires', async () => {
  const url = await linkUrl('https://x.test/f', SECRET, 'confirm', 'ada@example.com', NOW);
  const q = new URL(url).searchParams;
  assert.equal(q.get('a'), 'confirm');
  assert.equal(q.get('x'), String(NOW + CONFIRM_TTL_MS));
  assert.ok(await verifyLink(SECRET, 'confirm', q.get('e'), q.get('x'), q.get('t'), NOW + 1000));
  assert.ok(!(await verifyLink(SECRET, 'confirm', q.get('e'), q.get('x'), q.get('t'), NOW + CONFIRM_TTL_MS + 1)), 'expired');
  assert.ok(!(await verifyLink(SECRET, 'confirm', 'bo@example.com', q.get('x'), q.get('t'), NOW)), 'other address');
  assert.ok(!(await verifyLink('other-secret', 'confirm', q.get('e'), q.get('x'), q.get('t'), NOW)), 'other secret');
  assert.ok(!(await verifyLink(SECRET, 'unsub', q.get('e'), q.get('x'), q.get('t'), NOW)), 'a confirm token is no unsubscribe token');
  assert.ok(!(await verifyLink(SECRET, 'confirm', q.get('e'), String(NOW + 9e12), q.get('t'), NOW)), 'stretched expiry');
});

test('an unsubscribe link never expires and cannot confirm', async () => {
  const url = await linkUrl('https://x.test/f', SECRET, 'unsub', 'ada@example.com', NOW);
  const q = new URL(url).searchParams;
  assert.equal(q.get('x'), '0');
  assert.ok(await verifyLink(SECRET, 'unsub', q.get('e'), '0', q.get('t'), NOW * 3));
  assert.ok(!(await verifyLink(SECRET, 'confirm', q.get('e'), '0', q.get('t'), NOW)));
  assert.equal(await linkToken('', 'unsub', 'a@b.nl', 0), '');
});

test('the confirmation mail carries the confirm and the unsubscribe link, in Dutch and English', () => {
  for (const lang of ['nl', 'en', 'fr']) {
    const m = confirmEmail({ lang, confirm: 'https://x.test/c?a=confirm', unsub: 'https://x.test/u?a=unsub' });
    assert.ok(m.text.includes('https://x.test/c?a=confirm') && m.text.includes('https://x.test/u?a=unsub'));
    assert.ok(m.html.includes('a=unsub'));
    assert.ok(!/—/.test(m.subject + m.text));
  }
  assert.match(confirmEmail({ lang: 'nl', confirm: 'c', unsub: 'u' }).subject, /Bevestig/);
  assert.match(confirmEmail({ lang: 'fr', confirm: 'c', unsub: 'u' }).subject, /Confirm/, 'other languages fall back to English');
  assert.ok(words('nl').unsub === 'Uitschrijven');
});

test('result pages escape and carry noindex', () => {
  const p = resultPage('nl', 'confirm', 'https://x.test/"><script>');
  assert.ok(!p.includes('<script>'));
  assert.ok(p.includes('noindex'));
  assert.match(resultPage('en', 'bad', 'https://x.test'), /does not work/);
});

test('validEmail agrees with the server rule', () => {
  for (const e of ['ada@example.com', ' bo@x.nl ']) assert.equal(validEmail(e), cleanEmail(e) !== '');
  for (const e of ['x', 'a@b', 'a b@c.nl']) assert.equal(validEmail(e), false);
});

const ENV = { VITE_SUPABASE_URL: 'https://p.supabase.co/', VITE_SUPABASE_ANON_KEY: 'anon' };
const reply = (status, body) => async () => ({ ok: status < 400, json: async () => body });

test('joinWaitlist posts to the function and maps the answers', async () => {
  let seen;
  const spy = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ ok: true }) }; };
  assert.equal(await joinWaitlist({ email: ' Ada@Example.com ', locale: 'nl', fetchImpl: spy, env: ENV }), 'ok');
  assert.equal(seen.url, 'https://p.supabase.co/functions/v1/waitlist');
  assert.deepEqual(JSON.parse(seen.init.body), { email: 'Ada@Example.com', locale: 'nl', source: 'home' });
  assert.equal(await joinWaitlist({ email: 'nope', fetchImpl: spy, env: ENV }), 'email');
  assert.equal(await joinWaitlist({ email: 'a@b.nl', fetchImpl: reply(400, { ok: false, code: 'email' }), env: ENV }), 'email');
  assert.equal(await joinWaitlist({ email: 'a@b.nl', fetchImpl: reply(200, { ok: false, code: 'unavailable' }), env: ENV }), 'unavailable');
  assert.equal(await joinWaitlist({ email: 'a@b.nl', fetchImpl: async () => { throw new Error('offline'); }, env: ENV }), 'unavailable');
  assert.equal(await joinWaitlist({ email: 'a@b.nl', fetchImpl: spy, env: {} }), 'unavailable');
});

test('the form copy exists in English and Dutch', () => {
  const keys = ['title', 'lead', 'label', 'placeholder', 'button', 'badEmail', 'unavailable', 'done', 'fine'].map((k) => `waitlist.${k}`);
  for (const k of keys) {
    assert.ok(en[k] && nl[k], k);
    assert.ok(!/—/.test(en[k] + nl[k]), `${k} has an em dash`);
  }
});
