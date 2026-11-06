// T1122 (ROADMAP G3): the umber cost card as signature, a variant of the plan
// tab's CostCard behind a flag that stays OFF until the owner approves the
// T1111 direction (row T1122-a). These checks hold the gate: the default look
// is today's arc card, the variant renders only with ?cc=umber (or the flag),
// its bar is honest, its colours meet contrast and reduced motion is honoured.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { COST_CARD_UMBER, costCardVariant, barSegments, SHARE_MIN } from '../src/planner/trip/costCardVariant.js';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const css = readFileSync(new URL('../src/styles/92-cost-card.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/styles/01-tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('the flag is OFF: nothing a traveller sees changes until the owner approves', () => {
  assert.equal(COST_CARD_UMBER, false, 'flip only after owner step T1122-a');
  assert.equal(costCardVariant('', null), 'arc');
  assert.equal(costCardVariant('?cc=other', memStore()), 'arc');
});

test('?cc=umber previews the variant and survives navigation; ?cc=arc goes back', () => {
  const s = memStore();
  assert.equal(costCardVariant('?cc=umber', s), 'umber');
  assert.equal(costCardVariant('', s), 'umber', 'kept for the session after the query is gone');
  assert.equal(costCardVariant('?cc=arc', s), 'arc');
  assert.equal(costCardVariant('', s), 'arc');
  assert.equal(costCardVariant('', null, true), 'umber', 'the flag alone turns it on');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(costCardVariant('?cc=umber', blocked), 'umber', 'storage blocked: the query still decides');
});

test('the bar: shares of the priced groups add to 100, missing groups a dashed mark at the end', () => {
  const tiles = [
    { key: 'travel', eur: 412.4, missing: false, empty: false },
    { key: 'around', eur: 38.2, missing: false, empty: false },
    { key: 'stay', eur: 1197, missing: false, empty: false },
    { key: 'food', eur: 571.76, missing: false, empty: false },
  ];
  const segs = barSegments(tiles);
  assert.deepEqual(segs.map((x) => x.key), ['travel', 'around', 'stay', 'food']);
  assert.ok(Math.abs(segs.reduce((n, x) => n + x.share, 0) - 100) < 0.5);
  const miss = barSegments([{ key: 'travel', eur: 0, missing: true, empty: false }, { key: 'around', eur: 0, missing: false, empty: true }, ...tiles.slice(2)]);
  assert.deepEqual(miss.map((x) => [x.key, x.missing]), [['stay', false], ['food', false], ['travel', true]], 'an empty group draws nothing; a missing one is never a guessed width share');
  assert.equal(miss.find((x) => x.missing).share, 0);
  assert.deepEqual(barSegments(null), []);
  assert.ok(SHARE_MIN > 0);
});

async function render(search) {
  const prev = globalThis.window;
  if (search != null) globalThis.window = { location: { search }, sessionStorage: memStore(), requestAnimationFrame: () => 0, cancelAnimationFrame() {} };
  try {
    const [{ default: React }, server, i18n, card] = await Promise.all([
      import('react'), import('react-dom/server'),
      vite.ssrLoadModule('/src/i18n/index.jsx'), vite.ssrLoadModule('/src/planner/trip/CostCard.jsx'),
    ]);
    const priced = {
      parts: { flights: 412.4, transfers: 38.2, beds: 1197, days: 571.76 },
      flight: { combinable: true }, cartaFlight: { out: { cost: { total: 1 } }, back: { cost: { total: 1 } } },
      travelSplit: { legacy: false, out: 0, back: 0 }, grandTotal: 2219.36, perPerson: 1109.68,
    };
    const el = React.createElement(card.CostCard, { priced, people: 2, per: 'group', onPer() {}, onAll() {}, onAddPaid() {} });
    return server.renderToStaticMarkup(React.createElement(i18n.I18nProvider, null, el));
  } finally {
    if (search != null) { if (prev === undefined) delete globalThis.window; else globalThis.window = prev; }
  }
}

test('default look unchanged: the arc card, no umber variant (DOM check)', async () => {
  const html = await render(null);
  assert.match(html, /class="ccard"/);
  assert.match(html, /ccard-arc/);
  assert.doesNotMatch(html, /is-umber|ccu-/);
  const plain = await render('');
  assert.doesNotMatch(plain, /is-umber|ccu-/, 'a browser with no query keeps the arc');
});

test('?cc=umber renders the variant in its bands, every figure still in the rows', async () => {
  const html = await render('?cc=umber');
  assert.match(html, /class="ccard is-umber"/);
  assert.match(html, /data-cc="umber"/);
  assert.doesNotMatch(html, /ccard-arc/, 'the arc is retired in the variant');
  assert.match(html, /class="ccu-n"[^>]*data-total="2219.36"/);
  assert.match(html, /class="ccu-bar"[^>]*aria-hidden="true"/, 'the bar is decorative; the rows carry the figures');
  assert.equal((html.match(/class="ccu-seg /g) || []).length, 4);
  assert.match(html, /ccu-band/);
  assert.equal((html.match(/data-tile="/g) || []).length, 4);
  assert.match(html, /ccu-per/, 'the per person line under a group total');
  assert.equal((html.match(/btn-primary/g) || []).length, 1, 'one primary action in the foot strip');
  assert.doesNotMatch(html, /[–—]/, 'no em or en dashes');
});

// Contrast from the tokens themselves (as scripts/ci/token-contrast.mjs does).
const decl = {};
for (const m of tokens.match(/:root\b[^{]*\{([\s\S]*?)\n\}/)[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decl[m[1]] = m[2].trim();
const hex = (name) => { const v = decl[name]; const r = v.match(/^var\((--[\w-]+)\)$/); return r ? hex(r[1]) : v.toLowerCase(); };
const lum = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, p) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * p + parseInt(b.slice(1 + i, 3 + i), 16) * (1 - p)).toString(16).padStart(2, '0')).join('');

test('contrast: text on the umber ground and band, segments against the cream track', () => {
  const ground = hex('--home-ground-deep');
  const band = hex('--umber-700');
  const cream = hex('--umber-50');
  const ink2 = mix(cream, hex('--umber-800'), 0.76);
  const text = [
    [cream, ground, 4.5, 'cream text on the ground'], [cream, band, 4.5, 'cream text on the band'],
    [ink2, ground, 4.5, 'quiet text on the ground'], [ink2, band, 4.5, 'quiet text on the band'],
    [hex('--umber-800'), cream, 4.5, 'the primary label on cream'],
    [hex('--umber-800'), hex('--sun-400'), 4.5, 'share on the flight segment'],
    [cream, hex('--sun-800'), 4.5, 'share on getting around'], [cream, hex('--action'), 4.5, 'share on the bed'],
    [cream, hex('--lagoon-600'), 4.5, 'share on food'],
  ];
  const marks = [
    [hex('--sun-800'), cream, 'getting around on the track'], [hex('--action'), cream, 'bed on the track'],
    [hex('--lagoon-600'), cream, 'food on the track'], [hex('--umber-600'), cream, 'the flight segment keyline on the track'],
    [hex('--umber-600'), hex('--sun-400'), 'the keyline on the flight segment'],
    [hex('--umber-500'), cream, 'the dashed not priced track'], [hex('--sun-400'), band, 'the flight disc on the band'],
    [cream, ground, 'the cream track on the ground'],
  ];
  for (const [fg, bg, floor, what] of text) assert.ok(ratio(fg, bg) >= floor, `${what}: ${ratio(fg, bg).toFixed(2)}`);
  for (const [fg, bg, what] of marks) assert.ok(ratio(fg, bg) >= 3, `${what}: ${ratio(fg, bg).toFixed(2)}`);
});

test('reduced motion, dark surroundings and forced colours are handled in the variant CSS', () => {
  const rm = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
  assert.match(rm, /\.ccu-seg \{[^}]*transform: none[^}]*transition: none/);
  assert.match(rm, /\.ccu-n \{ animation: none; \}/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*\.ccard\.is-umber/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.doesNotMatch(css.slice(css.indexOf('T1122')), /#[0-9a-f]{3,6}\b/i, 'tokens only, no hex in the variant');
  assert.doesNotMatch(css.slice(css.indexOf('T1122')), /:root/, 'no token is changed here');
});
