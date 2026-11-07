// T1142 (ROADMAP D2): the admin Data health panel renders the quality card,
// the gate result, the must-see fields and the 90-day trend, from the
// snapshot scripts/quality/engine.py writes, and it is routed as an admin tab.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const snapshot = JSON.parse(readFileSync(new URL('../src/admin/dataHealth.json', import.meta.url), 'utf8'));

async function load() {
  const [{ default: React }, server, mod] = await Promise.all([
    import('react'), import('react-dom/server'),
    vite.ssrLoadModule('/src/components/admin/DataHealth.jsx'),
  ]);
  return (props) => server.renderToStaticMarkup(React.createElement(mod.DataHealth, props));
}

const rows = (html, table) => {
  const body = html.split(`data-health="${table}"`)[1].split('</tbody>')[0];
  return (body.match(/<tr /g) || []).length;
};

test('the shipped snapshot renders every layer, its trend and the must-see fields', async () => {
  const render = await load();
  const html = render({});
  assert.match(html, /data-health="card"/);
  assert.match(html, /data-gate="pass"/);
  assert.equal(rows(html, 'layers'), snapshot.layers.length);
  assert.ok(snapshot.layers.length >= 12, 'twelve layers on the first card');
  for (const l of snapshot.layers) assert.match(html, new RegExp(`data-layer="${l.layer}"`));
  // One named trend chart per layer, one bar per run in the window.
  const charts = html.match(/data-trend="[a-z]+"/g) || [];
  assert.equal(charts.length, snapshot.layers.length);
  const bars = html.split('data-trend="core"')[1].split('</div>')[0].match(/adminpage-sparkbar/g) || [];
  assert.equal(bars.length, snapshot.trend.points.filter((p) => p.scores?.core != null).length);
  assert.match(html, /role="img"[^>]*aria-label="core: 2026-/);
  assert.equal(rows(html, 'must-see'), snapshot.must_see.length);
  assert.doesNotMatch(html, /[\u2013\u2014]/, 'no en or em dashes');
});

test('a failed gate says so and names the breach', async () => {
  const render = await load();
  const failing = {
    ...snapshot,
    gate: { ...snapshot.gate, ok: false, failures: [{ id: 'core.blurb', why: 'fell 3.0 points (gate 2)' }], warnings: [] },
  };
  const html = render({ data: failing });
  assert.match(html, /data-gate="fail"/);
  assert.match(html, /Quality gate failed/);
  assert.match(html, /<code>core\.blurb<\/code> fell 3\.0 points/);
});

test('no snapshot yet reads as an empty state, not a blank tab', async () => {
  const render = await load();
  const html = render({ data: { layers: [] } });
  assert.match(html, /data-health="empty"/);
  assert.match(html, /No scorecard yet/);
});

test('the admin page routes the health tab to the panel', () => {
  const src = readFileSync(new URL('../src/admin/AdminPage.jsx', import.meta.url), 'utf8');
  assert.match(src, /const SECTIONS = \[[^\]]*'health'/);
  assert.match(src, /section === 'health' && <DataHealth \/>/);
  const en = readFileSync(new URL('../src/i18n/en.js', import.meta.url), 'utf8');
  assert.match(en, /'admin\.nav\.health': 'Data health'/);
});
