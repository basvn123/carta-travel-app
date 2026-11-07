// T1215 (T1152-d, ROADMAP F3): the admin card on taste chip acceptance.
// The view logic (admin_taste_weekly shaped per window, position bucket and
// facet, no rate under MIN_DECISIONS) and the card's three states: a report,
// an empty window, and migration 072 not yet pasted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tasteWindowView, tasteCell, MIN_DECISIONS, TASTE_FACETS } from '../src/lib/taste/counts.js';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const row = (event, facet, pos, n) => ({ event, facet, pos, n });
const REPORT = {
  since: '2026-10-26',
  weeks: [
    { week: '2026-11-02', rows: [row('shown', 'setting', 1, 30), row('accept', 'setting', 1, 8), row('reject', 'setting', 1, 2), row('shown', 'vibe', 2, 6), row('reject', 'vibe', 2, 3)] },
    { week: '2026-10-26', rows: [row('shown', 'setting', 1, 20), row('accept', 'setting', 1, 4), row('reject', 'activity', 3, 1)] },
  ],
};

test('the window: totals, by position bucket and by facet; rates only from MIN_DECISIONS', () => {
  assert.equal(MIN_DECISIONS, 10);
  const v = tasteWindowView(REPORT);
  assert.equal(v.since, '2026-10-26');
  assert.deepEqual(v.total, { accept: 12, reject: 6, shown: 56, decisions: 18, acceptance: 12 / 18, decision: 18 / 56 });
  assert.deepEqual(v.byBucket.map((b) => [b.bucket, b.decisions, b.acceptance]), [[1, 14, 12 / 14], [2, 3, null], [3, 1, null]]);
  assert.deepEqual(v.byFacet.map((f) => f.facet), TASTE_FACETS);
  const setting = v.byFacet.find((f) => f.facet === 'setting');
  assert.deepEqual([setting.decisions, setting.acceptance, setting.decision], [14, 12 / 14, 14 / 50]);
  const vibe = v.byFacet.find((f) => f.facet === 'vibe');
  assert.deepEqual([vibe.decisions, vibe.acceptance, vibe.decision], [3, null, null], 'under the bar: counts, no rates');
  assert.deepEqual(v.weeks.map((w) => [w.week, w.decisions, w.acceptance]), [['2026-11-02', 13, 8 / 13], ['2026-10-26', 5, null]]);
});

test('missing or refused reports have no view; an empty cell has no rates', () => {
  assert.equal(tasteWindowView(null), null);
  assert.equal(tasteWindowView({ error: 'forbidden' }), null);
  assert.deepEqual(tasteCell([]), { accept: 0, reject: 0, shown: 0, decisions: 0, acceptance: null, decision: null });
  // A row with a string count (jsonb sum) still adds up.
  assert.equal(tasteCell([row('accept', 'vibe', 1, '10')]).acceptance, 1);
});

test('the card: figures, the empty window, and the state before migration 072', async () => {
  const { TasteAcceptance } = await vite.ssrLoadModule('/src/components/admin/TasteAcceptance.jsx');
  const html = renderToStaticMarkup(createElement(TasteAcceptance, { report: REPORT }));
  for (const needle of ['Taste chips (weekly)', '67%', '32%', 'Places 1 to 3', 'too few', 'Setting', 'Week of 2026-11-02', '62% of 13']) {
    assert.ok(html.includes(needle), `missing ${needle}`);
  }
  const empty = renderToStaticMarkup(createElement(TasteAcceptance, { report: { weeks: [] } }));
  assert.ok(empty.includes('data-taste-admin="empty"'));
  const before = renderToStaticMarkup(createElement(TasteAcceptance, { report: { error: 'PGRST202' } }));
  assert.ok(before.includes('data-taste-admin="unavailable"') && before.includes('migration 072'));
  assert.equal(renderToStaticMarkup(createElement(TasteAcceptance, { report: null })), '', 'still loading: nothing');
});
