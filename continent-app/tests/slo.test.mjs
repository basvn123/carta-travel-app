// T1160 (ROADMAP H8): SLO budget maths, the source adapters and the admin panel, from fixtures.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { evaluateSlo, evaluateAll, overall, fromUptimeRuns, fromFreshness, fromAiEvents, fromFunctionStats, buildSnapshot } from '../src/lib/slo.js';

const config = JSON.parse(readFileSync(new URL('../config/slo.json', import.meta.url), 'utf8'));
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const ratio = { id: 'u', label: 'U', kind: 'ratio', target: 0.99, unit: 'runs' };
const lat = { id: 'l', label: 'L', kind: 'latency', threshold_ms: 1000, quantile: 0.95, unit: 'calls' };

test('ratio SLO: budget is (1 - target) * total, left = 1 - bad / allowed', () => {
  const r = evaluateSlo(ratio, { good: 9950, total: 10000 });
  assert.equal(r.allowed, 100);
  assert.equal(r.bad, 50);
  assert.equal(r.budgetLeft, 0.5);
  assert.equal(r.status, 'ok');
  assert.equal(evaluateSlo(ratio, { good: 9910, total: 10000 }).status, 'warn');
  assert.equal(evaluateSlo(ratio, { good: 9890, total: 10000 }).status, 'breached');
});

test('a perfect record is ok, no data is nodata and never ok', () => {
  assert.equal(evaluateSlo(ratio, { good: 100, total: 100 }).budgetLeft, 1);
  assert.equal(evaluateSlo(ratio, undefined).status, 'nodata');
  assert.equal(evaluateSlo(ratio, { good: 0, total: 0 }).status, 'nodata');
});

test('latency SLO: 5 percent of calls may be slow; p95 alone gives inside or breached', () => {
  assert.equal(evaluateSlo(lat, { total: 1000, slow: 25, p95Ms: 900 }).budgetLeft, 0.5);
  assert.equal(evaluateSlo(lat, { total: 1000, slow: 60 }).status, 'breached');
  assert.equal(evaluateSlo(lat, { total: 10, p95Ms: 900 }).status, 'ok');
  assert.equal(evaluateSlo(lat, { total: 10, p95Ms: 1500 }).status, 'breached');
});

test('adapters: uptime runs, freshness report, ai events, function stats', () => {
  assert.deepEqual(fromUptimeRuns([{ conclusion: 'success' }, { conclusion: 'failure' }, { conclusion: null }]), { good: 1, total: 2 });
  assert.deepEqual(fromFreshness({ wires: [{ status: 'ok', over_cadence: false }, { status: 'ok', over_cadence: true }, { status: 'missing_file', over_cadence: null }] }), { good: 1, total: 3 });
  const rows = [
    { kind: 'call', feature: 'ask', outcome: 'ok', latency_ms: 500 },
    { kind: 'call', feature: 'ask', outcome: 'failed', latency_ms: 9000 },
    { kind: 'call', feature: 'ask', outcome: 'fallback', latency_ms: 700 },
    { kind: 'call', feature: 'plan-day', outcome: 'ok', latency_ms: 100 },
    { kind: 'plan', feature: 'ask', outcome: 'ok', latency_ms: 1 },
  ];
  assert.deepEqual(fromAiEvents(rows, 'ask', 8000), { good: 2, total: 3, slow: 1, p95Ms: 9000 });
  assert.deepEqual(fromFunctionStats({ requests: 200, errors: 4, p95Ms: 800 }, 4000), { good: 196, total: 200, slow: undefined, p95Ms: 800 });
  assert.equal(fromFunctionStats(null, 4000), null);
});

test('fixture snapshot: one panel row per configured SLO, worst status wins', () => {
  const snap = buildSnapshot(config, {
    uptimeRuns: [...Array(2000).fill({ conclusion: 'success' }), ...Array(2).fill({ conclusion: 'failure' })],
    freshness: { wires: Array(9).fill({ status: 'ok', over_cadence: false }) },
    aiEvents: [...Array(100).fill({ kind: 'call', feature: 'ask', outcome: 'ok', latency_ms: 300 })],
    functions: { flights: { requests: 1000, errors: 50, latenciesMs: [100, 200] } },
  }, new Date('2026-11-07T00:00:00Z'));
  const rows = evaluateAll(config, snap);
  assert.equal(rows.length, config.slos.length);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.uptime.status, 'ok');
  assert.equal(by.freshness.status, 'ok');
  assert.equal(by['error-flights'].status, 'breached');
  assert.equal(by['error-stays'].status, 'nodata');
  assert.equal(overall(rows), 'breached');
});

test('config: ids unique, every SLO has a described source and a target or threshold', () => {
  const ids = config.slos.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of config.slos) {
    assert.ok(config.sources[s.source], s.id);
    assert.ok(s.kind === 'ratio' ? s.target > 0 && s.target < 1 : s.threshold_ms > 0, s.id);
  }
});

test('admin SLO panel renders every row from a fixture and says so when empty', async () => {
  const { SloPanel } = await vite.ssrLoadModule('/src/components/admin/SloPanel.jsx');
  const snapshot = { generatedAt: '2026-11-07T00:00:00Z', windowDays: 30, data: { uptime: { good: 9990, total: 10000 }, 'p95-ask': { total: 100, slow: 9, p95Ms: 9000 } } };
  const html = renderToStaticMarkup(createElement(SloPanel, { snapshot }));
  assert.match(html, /data-slo="uptime" data-status="ok"/);
  assert.match(html, /data-slo="p95-ask" data-status="breached"/);
  assert.match(html, /data-slo="freshness" data-status="nodata"/);
  assert.match(html, /Budget spent/);
  assert.equal((html.match(/data-slo="/g) || []).length, config.slos.length);
  const empty = renderToStaticMarkup(createElement(SloPanel, { snapshot: { generatedAt: null, windowDays: 30, data: {} } }));
  assert.match(empty, /No snapshot yet/);
});
