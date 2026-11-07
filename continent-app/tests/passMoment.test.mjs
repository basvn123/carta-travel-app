// T1171 (ROADMAP I14): the Pass moment, where the paywall meets the journey.
// These checks hold the flag (off until the closed beta), the show rules
// (never for a payer, never before a price, "Not now" for 14 days and gone
// after two), honest figures from pricing.js, and the six locales.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import {
  PASS_MOMENT, passMomentOn, readLater, hideForLater, showPassMoment, momentLines,
  LATER_DAYS, LATER_MAX,
} from '../src/pass/passMoment.js';
import { TIERS } from '../src/lib/pricing.js';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const DAY = 86400000;

test('the flag is OFF: nothing a traveller sees changes until the beta', () => {
  assert.equal(PASS_MOMENT, false, 'flip only after owner step T1171-a');
  assert.equal(passMomentOn('', null), false);
  assert.equal(passMomentOn('?pm=maybe', memStore()), false);
});

test('?pm=on previews it and survives navigation; ?pm=off ends the preview', () => {
  const s = memStore();
  assert.equal(passMomentOn('?pm=on', s), true);
  assert.equal(passMomentOn('', s), true, 'kept for the session after the query is gone');
  assert.equal(passMomentOn('?pm=off', s), false);
  assert.equal(passMomentOn('', s), false);
  assert.equal(passMomentOn('', memStore(), true), true, 'the flag alone turns it on');
});

test('shows only for a priced trip and a traveller who does not pay', () => {
  const now = 1_800_000_000_000;
  assert.equal(showPassMoment({ on: true, priced: true, paid: false, now }), true);
  assert.equal(showPassMoment({ on: false, priced: true, paid: false, now }), false);
  assert.equal(showPassMoment({ on: true, priced: false, paid: false, now }), false, 'no offer before a price');
  assert.equal(showPassMoment({ on: true, priced: true, paid: true, now }), false, 'never for a payer');
});

test(`"Not now" hides it ${LATER_DAYS} days, and after ${LATER_MAX} it does not come back by itself`, () => {
  const s = memStore();
  const now = 1_800_000_000_000;
  const base = { on: true, priced: true, paid: false };
  const first = hideForLater(s, now);
  assert.deepEqual(readLater(s), { until: now + LATER_DAYS * DAY, count: 1 });
  assert.equal(showPassMoment({ ...base, later: first, now: now + DAY }), false);
  assert.equal(showPassMoment({ ...base, later: first, now: now + LATER_DAYS * DAY + 1 }), true);
  const second = hideForLater(s, now + 20 * DAY);
  assert.equal(second.count, 2);
  assert.equal(showPassMoment({ ...base, later: second, now: now + 400 * DAY }), false);
  assert.deepEqual(readLater({ getItem: () => 'not json' }), { until: 0, count: 0 });
  assert.deepEqual(readLater(null), { until: 0, count: 0 });
});

test('every figure comes from pricing.js', () => {
  const { free, pass } = momentLines(TIERS);
  assert.equal(free.find((l) => l.key === 'paywall.free.ai').vars.n, TIERS.free.aiPlans);
  assert.equal(pass.find((l) => l.key === 'pass.addPlansTrip').vars.n, TIERS.trip.aiPlans);
});

const KEYS = ['title', 'freeHead', 'free.plan', 'free.share', 'free.keep', 'free.ai', 'passHead', 'footBold', 'footNote', 'see', 'later', 'hidden'].map((k) => `paywall.${k}`);
const BANNED = /\b(seamless|unlock|effortless|elevate|leverage|empower|curated|simply|just|easy)\b/i;
const phs = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('six locales carry every paywall.* key, same placeholders, no dashes, no euro sign', async () => {
  const cats = {};
  for (const l of ['en', 'nl', 'de', 'fr', 'es', 'it']) {
    const mod = await vite.ssrLoadModule(`/src/i18n/${l}.js`);
    cats[l] = mod.default || Object.values(mod).find((v) => v && typeof v === 'object' && v['paywall.title']);
  }
  for (const k of KEYS) {
    const en = cats.en[k];
    assert.ok(en, `en ${k}`);
    for (const [l, cat] of Object.entries(cats)) {
      const v = cat[k];
      assert.ok(typeof v === 'string' && v.length > 0, `${l} ${k}`);
      assert.equal(phs(v), phs(en), `${l} ${k} placeholders`);
      assert.doesNotMatch(v, /[–—€]/, `${l} ${k}: no dash or euro sign`);
    }
    assert.doesNotMatch(en, BANNED, `${k}: banned word`);
  }
});

test('the card: two lists, the price from pricing.js, one primary and a Not now (DOM check)', async () => {
  const [{ default: React }, server, i18n, pm] = await Promise.all([
    import('react'), import('react-dom/server'),
    vite.ssrLoadModule('/src/i18n/index.jsx'), vite.ssrLoadModule('/src/pass/PassMoment.jsx'),
  ]);
  const html = server.renderToStaticMarkup(React.createElement(i18n.I18nProvider, null,
    React.createElement(pm.PassMomentCard, { locale: 'en-GB', onSee() {}, onLater() {} })));
  assert.match(html, /data-testid="pass-moment"/);
  assert.match(html, /Planning this trip is free/);
  assert.equal((html.match(/<li>/g) || []).length, 8, 'four free lines, four Pass lines');
  assert.match(html, /6\.99/);
  assert.match(html, new RegExp(`for ${TIERS.trip.periodDays} days`));
  assert.equal((html.match(/btn-primary|is-primary/g) || []).length >= 1, true);
  assert.match(html, /See the Trip Pass/);
  assert.match(html, /Not now/);
  // Outside a PaywallProvider usePaywall reports paid, so the moment draws nothing.
  const none = server.renderToStaticMarkup(React.createElement(i18n.I18nProvider, null,
    React.createElement(pm.PassMoment, { priced: true })));
  assert.equal(none, '');
});

test('reduced motion and forced colours are honoured in the stylesheet', () => {
  const css = readFileSync(new URL('../src/pass/PassMoment.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.pm \{ animation: none; \}/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /min-height: 44px/);
});
