// T1139 (ROADMAP E4): LLM observability. Every gateway call writes one event,
// the event holds no text, Ask's question is hashed, the Langfuse exporter is
// off by default, the 30 day retention and the RLS posture are in migration 071,
// and the admin weekly view renders from fixtures.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { callModel } from '../functions/_lib/aiModels.js';
import { buildAiEvent, hashQuery, langfuseBody, langfuseOn, writeEvent, estimateCostUsd } from '../functions/_lib/aiEvents.mjs';
import { aiCallsView } from '../src/lib/aiCalls.js';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const SECRET_PROMPT = 'PROMPT-TEXT-xyzzy where is a quiet lake';
const SECRET_ANSWER = 'ANSWER-TEXT-plugh try Lake Bled';
const geminiOk = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: SECRET_ANSWER }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 } }) });
const status = (s) => () => ({ ok: false, status: s, json: async () => ({}) });
const seq = (...fns) => { let i = 0; return async () => fns[Math.min(i++, fns.length - 1)](); };
const run = async (fetchImpl, extra = {}) => {
  const events = [];
  const result = await callModel({
    feature: 'plan-day', env: { GEMINI_API_KEY: 'k' }, system: 'sys', user: SECRET_PROMPT, fetchImpl,
    eventSink: (e) => events.push(e), ...extra,
  });
  return { result, events };
};

test('a good call writes exactly one event with tokens, cost, latency and prompt version', async () => {
  const { result, events } = await run(seq(geminiOk));
  assert.equal(result.ok, true);
  assert.equal(events.length, 1);
  const e = events[0];
  assert.equal(e.feature, 'plan-day');
  assert.equal(e.provider, 'gemini');
  assert.equal(e.outcome, 'ok');
  assert.equal(e.tokens_in, 1000);
  assert.equal(e.tokens_out, 200);
  assert.equal(e.tokens_estimated, false);
  assert.ok(e.cost_usd > 0);
  assert.equal(e.prompt_id, 'plan-day');
  assert.ok(Number.isInteger(e.prompt_version) && e.prompt_version >= 1);
  assert.ok(e.latency_ms >= 0);
});

test('a fallback, a failure and a refusal each write one event with the right outcome', async () => {
  const fb = await run(seq(status(429), geminiOk));
  assert.equal(fb.events.length, 1);
  assert.equal(fb.events[0].outcome, 'fallback');
  assert.equal(fb.events[0].fell_back, true);

  const bad = await run(seq(status(400)));
  assert.equal(bad.result.ok, false);
  assert.equal(bad.events.length, 1);
  assert.equal(bad.events[0].outcome, 'failed');
  assert.equal(bad.events[0].code, 'ai_error');
  assert.equal(bad.events[0].cost_usd, 0);

  const none = await run(seq(geminiOk), { env: {} });
  assert.equal(none.events.length, 1);
  assert.equal(none.events[0].outcome, 'refused');
  assert.equal(none.events[0].code, 'no_ai');

  const big = await run(seq(geminiOk), { user: 'x'.repeat(70000) });
  assert.equal(big.events.length, 1);
  assert.equal(big.events[0].code, 'too_big');
});

test('an event holds no prompt or answer text and no user id', async () => {
  const { events } = await run(seq(geminiOk), { queryHash: await hashQuery(SECRET_PROMPT, 's') });
  const json = JSON.stringify(events[0]);
  assert.ok(!json.includes('xyzzy') && !json.includes('plugh') && !/quiet lake/.test(json));
  assert.ok(!('user_id' in events[0]));
});

test('a throwing sink never breaks the call', async () => {
  const result = await callModel({
    feature: 'plan-day', env: { GEMINI_API_KEY: 'k' }, user: 'u', fetchImpl: seq(geminiOk),
    eventSink: () => { throw new Error('db down'); },
  });
  assert.equal(result.ok, true);
});

test('the database sink posts one row of kind call with the service key and nothing else', async () => {
  const posts = [];
  const f = async (url, init) => {
    if (String(url).includes('/rest/v1/ai_model_events')) { posts.push({ url, init }); return { ok: true, status: 201 }; }
    return geminiOk();
  };
  const { result } = await run(f, { env: { GEMINI_API_KEY: 'k', SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'srv' }, eventSink: undefined });
  assert.equal(result.ok, true);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://x.supabase.co/rest/v1/ai_model_events');
  assert.equal(posts[0].init.headers.Authorization, 'Bearer srv');
  const row = JSON.parse(posts[0].init.body);
  assert.equal(row.kind, 'call');
  assert.ok(!posts[0].init.body.includes('xyzzy') && !posts[0].init.body.includes('plugh'));
});

test('Ask: the query hash is salted, normalised, 64 hex and not the text', async () => {
  const a = await hashQuery('  Quiet LAKE in June ', 'salt');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await hashQuery('quiet lake in june', 'salt'));
  assert.notEqual(a, await hashQuery('quiet lake in june', 'other'));
  assert.ok(!a.includes('lake'));
  const ask = read('continent-app/functions/api/ask/answer.js');
  assert.ok(/queryHash:\s*await hashQuery\(input\.question/.test(ask), 'Ask does not pass a hashed question');
  assert.ok(!/queryHash:\s*input\.question/.test(ask));
});

test('Workers AI cost comes from Neurons; unknown Gemini models are priced high, not zero', () => {
  const w = estimateCostUsd({ provider: 'workers-ai', model: 'm', tokensIn: 1e6, tokensOut: 0, neurons: { in: 4625, out: 30475 } });
  assert.equal(w, 0.050875);
  assert.ok(estimateCostUsd({ provider: 'gemini', model: 'brand-new', tokensIn: 1e6, tokensOut: 1e6 }) > 2);
});

test('Langfuse is off by default and sends metadata only when on', () => {
  assert.equal(langfuseOn((k) => ({}[k])), false);
  assert.equal(langfuseOn((k) => ({ AI_TRACE_LANGFUSE: 'on', LANGFUSE_HOST: 'h' }[k])), false);
  const env = { AI_TRACE_LANGFUSE: 'on', LANGFUSE_HOST: 'https://lf.box', LANGFUSE_PUBLIC_KEY: 'p', LANGFUSE_SECRET_KEY: 's' };
  assert.equal(langfuseOn((k) => env[k]), true);
  const ev = buildAiEvent({ feature: 'ask', cfg: { models: ['m'], provider: 'workers-ai' }, result: { ok: true, model: 'm', provider: 'workers-ai', usage: { in: 5, out: 6 }, attempts: [1] }, latencyMs: 40 });
  const body = langfuseBody(ev, 1_700_000_000_000).batch[0];
  assert.equal(body.type, 'generation-create');
  assert.ok(!('input' in body.body) && !('output' in body.body));
});

test('with Langfuse off, writeEvent sends nothing without Supabase keys', async () => {
  let calls = 0;
  await writeEvent({}, { feature: 'x' }, { fetchImpl: async () => { calls += 1; return { ok: true }; } });
  assert.equal(calls, 0);
});

test('retention, RLS and privacy are in migration 071; the down file undoes it', () => {
  const up = read('supabase/migrations/071_ai_model_events_calls.sql');
  const down = read('supabase/migrations/071_ai_model_events_calls_down.sql');
  assert.match(up, /interval '30 days'/);
  assert.match(up, /carta_ai_events_prune/);
  assert.match(up, /enable row level security/);
  assert.match(up, /revoke all on table public\.ai_model_events from public, anon, authenticated/);
  assert.match(up, /grant select, insert on table public\.ai_model_events to service_role/);
  assert.match(up, /query_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(up, /user_id is null/);
  assert.ok(!/prompt_text|answer_text|\bquestion\b\s+text/i.test(up));
  assert.match(down, /drop function if exists public\.admin_ai_calls_weekly/);
  assert.match(down, /drop column if exists query_hash/);
});

test('the two copies of the event module are the same file', () => {
  assert.equal(read('continent-app/functions/_lib/aiEvents.mjs'), read('supabase/functions/_shared/aiEvents.mjs'));
});

test('the admin weekly view renders from fixtures: calls, failure rate, p50, p95, cost', async () => {
  const report = {
    since: '2026-10-12',
    weeks: [
      { week: '2026-10-26', features: [
        { feature: 'plan-day', calls: 100, failed: 5, refused: 1, fallbacks: 10, p50: 8200, p95: 31000, tokensIn: 1, tokensOut: 1, costUsd: 1.2345 },
        { feature: 'ask', calls: 400, failed: 0, refused: 0, fallbacks: 0, p50: 900, p95: 2400, tokensIn: 1, tokensOut: 1, costUsd: 0.4 },
      ] },
      { week: '2026-10-19', features: [{ feature: 'ask', calls: 10, failed: 1, refused: 0, fallbacks: 0, p50: 700, p95: 1500, costUsd: 0.001 }] },
    ],
    costByDay: [{ day: '2026-10-27', costUsd: 0.5, calls: 60 }, { day: '2026-10-28', costUsd: 0.7, calls: 80 }],
  };
  const v = aiCallsView(report);
  assert.equal(v.current.week, '2026-10-26');
  assert.equal(v.current.features[0].feature, 'ask');
  assert.equal(v.current.features.find((f) => f.feature === 'plan-day').failRate, 0.05);
  assert.equal(v.costByDay[0].day, '2026-10-28');
  const { AiCalls } = await vite.ssrLoadModule('/src/components/admin/AiCalls.jsx');
  const html = renderToStaticMarkup(createElement(AiCalls, { report, t: (k) => k }));
  for (const needle of ['plan-day', '5.0%', '31 s', '8.2 s', '$1.23', '2.4 s', '2026-10-28']) assert.ok(html.includes(needle), `missing ${needle}`);
  assert.equal(renderToStaticMarkup(createElement(AiCalls, { report: { error: 'forbidden' } })), '');
  assert.equal(renderToStaticMarkup(createElement(AiCalls, { report: null })), '');
});

test('the migration weekly RPC computes p50, p95 and failure counts per feature', () => {
  const up = read('supabase/migrations/071_ai_model_events_calls.sql');
  assert.match(up, /percentile_cont\(0\.5\)/);
  assert.match(up, /percentile_cont\(0\.95\)/);
  assert.match(up, /admin_guard\('read'\)/);
});
