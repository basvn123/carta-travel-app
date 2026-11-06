// T1187 (ROADMAP D23): the admin external validation view renders the
// scorecard scripts/validation/runner.py writes, with one trend per check,
// beside the D2 Data health card. The fixture (tests/fixtures/
// validation-scorecard.json) is three runs written by the runner itself: a
// pass, then two coverage drops that fail the hard check.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const fixture = JSON.parse(readFileSync(new URL('./fixtures/validation-scorecard.json', import.meta.url), 'utf8'));
const shipped = JSON.parse(readFileSync(new URL('../src/components/admin/validationScorecard.json', import.meta.url), 'utf8'));

async function load(name = 'Validation', file = '/src/components/admin/Validation.jsx') {
  const [{ default: React }, server, mod] = await Promise.all([
    import('react'), import('react-dom/server'), vite.ssrLoadModule(file),
  ]);
  return (props) => server.renderToStaticMarkup(React.createElement(mod[name], props));
}

test('the fixture renders every check with its trend, and the failed gate names the breach', async () => {
  const render = await load();
  const html = render({ data: fixture });
  assert.match(html, /data-validation="card"/);
  assert.match(html, /data-vgate="fail"/);
  const lay = fixture.layers[0];
  assert.match(html, new RegExp(`data-vlayer="${lay.layer}"`));
  const rows = html.split('data-validation="checks"')[1].split('</tbody>')[0].match(/<tr /g) || [];
  assert.equal(rows.length, lay.gate.checks.length);
  assert.match(html, /data-check="coverage" data-status="fail"/);
  assert.match(html, /<code>coverage<\/code> fell from 1\.0 to 0\.9/);
  // One bar per run in the coverage trend, failed runs marked, values written beside it.
  const bars = html.split('data-vtrend="trails coverage"')[1].split('<span class="mono')[0];
  assert.equal((bars.match(/adminpage-sparkbar/g) || []).length, lay.trend.length);
  assert.equal((bars.match(/data-ok="no"/g) || []).length, lay.trend.filter((p) => !p.gate_ok).length);
  assert.match(html, /aria-label="trails coverage: 2026-10-23 100\.0%, 2026-10-30 97\.5% \(gate failed\), 2026-11-06 90\.0% \(gate failed\)"/);
  assert.match(html, /100\.0% to 90\.0%/);
  assert.doesNotMatch(html, /[\u2013\u2014]/, 'no en or em dashes');
});

test('the shipped snapshot shows the trails layer passing', async () => {
  const render = await load();
  const html = render({});
  assert.match(html, /data-vgate="pass"/);
  assert.match(html, /data-vlayer="trails"/);
  const t = shipped.layers.find((l) => l.layer === 'trails');
  assert.ok(t.reference_n >= 282);
  assert.match(html, /data-check="coverage" data-status="pass"/);
  assert.match(html, /data-check="in_top" data-status="pass"/);
});

test('no run yet reads as an empty state', async () => {
  const render = await load();
  assert.match(render({ data: { layers: [] } }), /data-validation="empty"/);
});

test('Data health carries the validation view under its card', async () => {
  const render = await load('DataHealth', '/src/components/admin/DataHealth.jsx');
  const html = render({ validation: fixture });
  assert.ok(html.indexOf('data-health="must-see"') < html.indexOf('data-validation="card"'));
});

test('shapeValidation builds one series per check, oldest first', async () => {
  const { shapeValidation } = await vite.ssrLoadModule('/src/components/admin/useValidation.js');
  const v = shapeValidation(fixture);
  const cov = v.layers[0].checks.find((c) => c.metric === 'coverage');
  assert.deepEqual(cov.series.map((p) => p.v), [1, 0.975, 0.9]);
  assert.equal(v.ok, false);
});
