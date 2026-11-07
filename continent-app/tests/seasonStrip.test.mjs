// T1202 (D18): the place page's month strip (DestWhen) marks the months the
// place is shut, says why in one line, and lists seasonal huts, lifts and
// ferries nearby. A place with no season block draws none of it.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const CLIMATE = {
  m: [[5, 0, 69, 12], [6, 0, 62, 16], [10, 2, 55, 37], [15, 5, 38, 65], [19, 8, 59, 78], [22, 12, 63, 85],
    [24, 14, 75, 82], [23, 13, 79, 79], [20, 10, 55, 81], [15, 7, 63, 55], [10, 4, 69, 28], [6, 1, 78, 10]],
  best: [5, 6, 7, 8, 9],
};

async function render(season, monthPick = 2) {
  const [{ default: React }, server, when, i18n, strip] = await Promise.all([
    import('react'), import('react-dom/server'),
    vite.ssrLoadModule('/src/browse/DestWhen.jsx'),
    vite.ssrLoadModule('/src/i18n/index.jsx'),
    vite.ssrLoadModule('/src/browse/ClimateStrip.jsx'),
  ]);
  const h = React.createElement;
  const destination = { id: 'gem:test', city: 'Isola', climate: CLIMATE, ...(season ? { season } : {}) };
  const Wrap = () => {
    const { t, lang } = i18n.useI18n();
    const p = { t, lang, destination, data: { destinations: {} }, water: null, monthPick, festivals: [],
      monthList: (ms) => strip.fmtMonthRanges(ms, t), heatGuard: false };
    return h(when.DestWhen, { p });
  };
  return server.renderToStaticMarkup(h(i18n.I18nProvider, {}, h(Wrap)));
}

const FERRY = { open: [6, 7, 8, 9], conf: 'high', why: 'ferry', checked: '2026-05-01',
  items: [{ n: 'Knorrhuette', k: 'hut', open: [6, 7, 8, 9, 10], conf: 'high' }], _src: 'osm_seasons', _asof: '2026-11-07' };

test('the strip draws the shut months, the reason and the nearby items', async () => {
  const out = await render(FERRY);
  assert.equal((out.match(/when-m[^"]*is-closed/g) || []).length, 8);
  assert.match(out, /aria-label="February, Closed, /);
  assert.match(out, /No ferry Jan to May, Oct to Dec: every ferry here runs part of the year only/);
  assert.match(out, /Checked May 2026/);
  assert.match(out, /when-tag is-closed">Closed</, 'the chosen month (February) says it is shut');
  assert.match(out, /Open part of the year nearby/);
  assert.match(out, /Knorrhuette, Hut: Jun to Oct/);
});

test('a low-confidence season says "may be closed" and that it is a guide', async () => {
  const out = await render({ ...FERRY, conf: 'low', why: 'own', checked: undefined, items: [] });
  assert.match(out, /aria-label="February, May be closed, /);
  assert.match(out, /Closed Jan to May, Oct to Dec, as mapped in OpenStreetMap/);
  assert.match(out, /From a season tag only/);
  assert.doesNotMatch(out, /nearby/);
});

test('no season block: nothing about closures', async () => {
  const out = await render(null);
  assert.doesNotMatch(out, /is-closed|when-season/);
});
