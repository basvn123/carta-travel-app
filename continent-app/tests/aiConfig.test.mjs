// Wave 1 of the ai fix program (ROADMAP E3, E4, E7; S1 to S3 of the
// gemini-rag decision): one config for chains, prices, thinking and capacity,
// generated into the live code, and the rules that read it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAiConfig, OUTPUTS, CONFIG_PATH } from '../scripts/ai/gen_ai_config.mjs';
import * as M from '../functions/_lib/aiModels.js';
import { buildAiEvent, estimateCostUsd, writeEvent, S2_COLUMNS, PRICE_USD_PER_M, DEFAULT_PRICE } from '../functions/_lib/aiEvents.mjs';
import * as C from '../functions/_lib/aiCapacity.mjs';
import { consume, capRefusalBody, isMissingFunction } from '../../supabase/functions/_shared/passes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CFG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const LIVE = ['plan-day', 'suggest-city', 'parse-booking'];

/* ---- one source: the config, the generated module, the copies ---- */

test('the generated aiConfig matches ai_models.json (run scripts/ai/gen_ai_config.mjs after a change)', () => {
  const want = renderAiConfig(CFG);
  for (const out of OUTPUTS) assert.equal(fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n'), want, path.relative(ROOT, out));
});

test('the capacity module has two byte-identical copies', () => {
  assert.equal(read('continent-app/functions/_lib/aiCapacity.mjs'), read('supabase/functions/_shared/aiCapacity.mjs'));
});

test('no -latest alias in any live or batch chain, and every chained model has a price', () => {
  const chains = [CFG.live_chain.gemini, CFG.batch_chain.gemini, ...LIVE.map((f) => CFG.features[f].today.models),
    CFG.features.intros.today.models, CFG.other_jobs.parking.today.models];
  // trips keeps its chain until its golden set passes on Flash-Lite (TRIPS_CHAIN).
  for (const chain of chains) {
    assert.ok(chain.length > 0);
    for (const m of chain) {
      assert.doesNotMatch(m, /latest/, m);
      assert.ok(CFG.prices.models[m], `${m} has no price`);
    }
  }
  for (const f of LIVE) assert.deepEqual(CFG.features[f].today.models, CFG.live_chain.gemini, f);
  assert.deepEqual(M.GEMINI_CHAIN, CFG.live_chain.gemini);
});

test('the model strategy rows and the price table agree (one price per model)', () => {
  let n = 0;
  for (const [id, o] of Object.entries(CFG.options)) {
    if (o.provider !== 'gemini' || o.mode === 'batch') continue;
    const p = CFG.prices.models[o.model];
    assert.ok(p, `${id}: ${o.model} is not in prices.models`);
    assert.equal(o.in_per_m, p.in, `${id} input`);
    assert.equal(o.out_per_m, p.out, `${id} output`);
    n += 1;
  }
  assert.ok(n >= 2);
  for (const [m, p] of Object.entries(CFG.prices.models)) assert.deepEqual(PRICE_USD_PER_M[m], { in: p.in, out: p.out, cachedIn: p.cached_in ?? null, verified: !!p.verified });
  assert.equal(DEFAULT_PRICE.out, Math.max(...Object.values(CFG.prices.models).map((p) => p.out)));
});

test('the pipeline batch chain equals batch_chain in the config', () => {
  const py = read('pipeline/ai_gateway.py');
  const m = py.match(/^GEMINI_CHAIN = \[([^\]]*)\]/m);
  assert.ok(m, 'GEMINI_CHAIN not found');
  const chain = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(chain, CFG.batch_chain.gemini);
});

/* ---- thinking (S1) ---- */

test('plan-day, suggest-city and parse-booking ask for minimal thinking; every live model accepts it', () => {
  for (const f of LIVE) {
    const c = M.resolveModelConfig(f, {});
    assert.equal(c.thinking, 'minimal', f);
    for (const m of c.models) assert.equal(M.thinkingFor(c, m), 'minimal', `${f} ${m}`);
  }
  assert.equal(M.resolveModelConfig('ask', {}).thinking, null);
  assert.equal(M.resolveModelConfig('plan-day', { AI_PLAN_DAY_THINKING: 'off' }).thinking, null);
  assert.equal(M.resolveModelConfig('plan-day', { AI_PLAN_DAY_THINKING: 'low' }).thinking, 'low');
  assert.equal(M.resolveModelConfig('plan-day', { AI_PLAN_DAY_THINKING: 'bogus' }).thinking, 'minimal');
  // A model with no listed levels is never sent the field.
  assert.equal(M.thinkingFor({ thinking: 'minimal' }, 'gemini-unknown'), null);
});

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});
const gem = (usage = {}, extra = {}) => reply(200, {
  candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, ...extra }],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, ...usage },
});

async function run(replies, env = {}) {
  M.resetThinkingRefusals();
  const calls = [];
  const events = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return replies.shift(); };
  const r = await M.callModel({ feature: 'plan-day', env: { GEMINI_API_KEY: 'k', ...env }, user: 'U', json: true, fetchImpl, eventSink: (e) => events.push(e) });
  return { r, calls, events };
}

test('the call carries thinkingConfig minimal and records thought, cached and grounded counts', async () => {
  const { r, calls, events } = await run([gem({ thoughtsTokenCount: 40, cachedContentTokenCount: 600 })]);
  assert.equal(r.ok, true);
  assert.deepEqual(calls[0].body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  const ev = events[0];
  assert.equal(ev.tokens_thought, 40);
  assert.equal(ev.tokens_cached, 600);
  assert.equal(ev.grounded_queries, 0);
  assert.equal(ev.thinking, 'minimal');
  // 400 uncached x 0.30 + 600 cached x 0.03 + (100 + 40) x 2.50, per million.
  assert.equal(ev.cost_usd, Math.round(((400 * 0.3 + 600 * 0.03 + 140 * 2.5) / 1e6) * 1e6) / 1e6);
});

test('a 400 that names thinking is retried once without the field, and the model is not sent it again', async () => {
  const { r, calls, events } = await run([reply(400, 'Invalid JSON payload: unknown field thinkingConfig'), gem()]);
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].body.generationConfig.thinkingConfig);
  assert.equal(calls[1].body.generationConfig.thinkingConfig, undefined);
  assert.equal(events[0].thinking, 'rejected');
  // Same isolate: the next call skips the field at once.
  const calls2 = [];
  await M.callModel({ feature: 'plan-day', env: { GEMINI_API_KEY: 'k' }, user: 'U', fetchImpl: async (u, i) => { calls2.push(JSON.parse(i.body)); return gem(); }, eventSink: () => {} });
  assert.equal(calls2[0].generationConfig.thinkingConfig, undefined);
  M.resetThinkingRefusals();
});

test('any other 400 still stops the call as our own bad request', async () => {
  const { r, calls } = await run([reply(400, 'Request contains an invalid argument: responseSchema')]);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'ai_error');
  assert.equal(calls.length, 1);
});

test('counts the provider did not send are null, never 0', () => {
  const u = M.geminiUsage({ usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } }, { search: true });
  assert.equal(u.thought, null);
  assert.equal(u.cached, null);
  assert.equal(u.grounded, null);
  assert.equal(M.geminiUsage({ usageMetadata: {} }).grounded, 0);
  const g = M.geminiUsage({ candidates: [{ groundingMetadata: { webSearchQueries: ['a', 'b'] } }], usageMetadata: {} }, { search: true });
  assert.equal(g.grounded, 2);
  const ev = buildAiEvent({ feature: 'plan-day', cfg: { provider: 'gemini', models: ['gemini-3.5-flash-lite'] }, result: { ok: true, model: 'gemini-3.5-flash-lite', provider: 'gemini', usage: u, attempts: [] } });
  assert.equal(ev.tokens_thought, null);
  assert.equal(ev.grounded_queries, null);
});

test('cost: thinking billed as output, grounded queries at the paid rate, cached at the cached price', () => {
  const base = { provider: 'gemini', model: 'gemini-3.5-flash-lite', tokensIn: 1000, tokensOut: 100 };
  const plain = estimateCostUsd(base);
  assert.equal(plain, Math.round(((1000 * 0.3 + 100 * 2.5) / 1e6) * 1e6) / 1e6);
  assert.ok(estimateCostUsd({ ...base, thought: 1000 }) > plain);
  assert.equal(estimateCostUsd({ ...base, grounded: 2 }), Math.round((plain + 2 * (CFG.prices.grounding.usd_per_1000_queries / 1000)) * 1e6) / 1e6);
  assert.ok(estimateCostUsd({ ...base, cached: 1000 }) < plain);
  // 3.1 Flash-Lite has no cached price: cached input is priced as input (errs high).
  const b31 = { ...base, model: 'gemini-3.1-flash-lite' };
  assert.equal(estimateCostUsd({ ...b31, cached: 1000 }), estimateCostUsd(b31));
});

test('the event write drops the S2 columns once when the database has no such column, and only then', async () => {
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's' };
  const ev = { feature: 'plan-day', tokens_thought: 1, tokens_cached: 2, grounded_queries: 0, thinking: 'minimal' };
  const posts = [];
  await writeEvent(env, ev, { fetchImpl: async (u, i) => { posts.push(JSON.parse(i.body)); return reply(posts.length === 1 ? 400 : 201, posts.length === 1 ? '{"code":"PGRST204","message":"Could not find the tokens_thought column"}' : ''); } });
  assert.equal(posts.length, 2);
  for (const c of S2_COLUMNS) { assert.ok(c in posts[0]); assert.ok(!(c in posts[1])); }
  const other = [];
  await writeEvent(env, ev, { fetchImpl: async (u, i) => { other.push(i.body); return reply(400, '{"code":"23514"}'); } });
  assert.equal(other.length, 1);
});

/* ---- capacity (S3) ---- */

test('the breaker cuts guests first, then free accounts, and never a Pass holder', () => {
  const cap = 200;
  assert.deepEqual(C.breakerCaps(cap), { guest: 100, free: 200, pass: null });
  assert.equal(C.breakerAllows('guest', 99, cap), true);
  assert.equal(C.breakerAllows('guest', 100, cap), false);
  assert.equal(C.breakerAllows('free', 100, cap), true);
  assert.equal(C.breakerAllows('free', 200, cap), false);
  assert.equal(C.breakerAllows('pass', 1e9, cap), true);
  assert.equal(C.audienceOf(null), 'guest');
  assert.equal(C.audienceOf('free'), 'free');
  assert.equal(C.audienceOf('trip'), 'pass');
  assert.equal(C.audienceOf('year'), 'pass');
  assert.ok(C.breakerCaps(cap).guest < C.breakerCaps(cap).free);
});

test('the global ceiling and the daily limit come from config; the secret overrides the ceiling', () => {
  assert.equal(C.globalCapFrom(undefined), CFG.capacity.global_daily_cap_default);
  assert.equal(C.globalCapFrom(''), CFG.capacity.global_daily_cap_default);
  assert.equal(C.globalCapFrom('0'), CFG.capacity.global_daily_cap_default);
  assert.equal(C.globalCapFrom('500'), 500);
  assert.equal(C.userDayLimit('plan'), CFG.capacity.user_daily_limit.plan);
  assert.equal(C.userDayLimit('ground'), CFG.capacity.user_daily_limit.ground);
});

test('a k-of-n-days trigger fires on k hits, needs n known days to say no, and never reads a gap as quiet', () => {
  const t = { k: 5, n: 7 };
  assert.equal(C.triggerStatus([true, true, false, true, true, true, false], t).status, 'fired');
  assert.equal(C.triggerStatus([true, false, false, true, false, true, false], t).status, 'not_fired');
  assert.equal(C.triggerStatus([true, false, null, true, false, true, false], t).status, 'no_data');
  assert.equal(C.triggerStatus([false, false], t).status, 'no_data');
  assert.equal(C.triggerStatus([], t).status, 'no_data');
  // Any window of 7 counts, not only the newest.
  assert.equal(C.triggerStatus([true, true, true, true, true, false, false, false, false, false], t).status, 'fired');
  const all = C.capacityTriggers({ 'ask-workers-paid': [true, true, true, true, true, false, false] });
  assert.deepEqual(all.map((x) => [x.id, x.status]), [['gemini-free-cut', 'no_data'], ['ask-workers-paid', 'fired']]);
});

function stubService(answers) {
  const calls = [];
  return { calls, rpc: async (fn, args) => { calls.push({ fn, args }); return answers.shift(); } };
}

test('consume asks ai_consume_v2 with the config limits and the cached flag', async () => {
  const s = stubService([{ data: { status: 'ok', tier: 'free', left: 1 }, error: null }]);
  const q = await consume(s, 'u', 'plan', 200, { cached: true });
  assert.equal(q.ok, true);
  assert.equal(s.calls[0].fn, 'ai_consume_v2');
  assert.deepEqual(s.calls[0].args, { p_user: 'u', p_kind: 'plan', p_free_cap: 200, p_user_day_cap: CFG.capacity.user_daily_limit.plan, p_cached: true });
});

test('consume falls back to ai_consume only when v2 is missing (migration 078 not applied)', async () => {
  const s = stubService([{ data: null, error: { code: 'PGRST202' } }, { data: { status: 'ok', tier: 'free' }, error: null }]);
  assert.equal((await consume(s, 'u', 'plan', 200)).ok, true);
  assert.deepEqual(s.calls.map((c) => c.fn), ['ai_consume_v2', 'ai_consume']);
  assert.deepEqual(s.calls[1].args, { p_user: 'u', p_kind: 'plan', p_global_cap: 200 });
  const t = stubService([{ data: null, error: { code: '57014' } }]);
  const q = await consume(t, 'u', 'plan', 200);
  assert.equal(q.status, 'quota_check');
  assert.equal(t.calls.length, 1);
  assert.equal(isMissingFunction({ code: '42883' }), true);
});

test('a daily-limit refusal answers with the "come back tomorrow" code and says why', () => {
  assert.deepEqual(capRefusalBody({ status: 'day_cap', tier: 'trip', cap: 20, used: 20 }), { code: 'global_cap', reason: 'day_cap', tier: 'trip', cap: 20, used: 20 });
  assert.deepEqual(capRefusalBody({ status: 'user_cap', tier: 'free', cap: 2, used: 2 }), { code: 'user_cap', tier: 'free', cap: 2, used: 2 });
});

test('the three Edge Functions peek the cache before the quota and pass the checked hit as cached', () => {
  for (const f of LIVE) {
    const src = read(`supabase/functions/${f}/index.ts`);
    const peekAt = src.indexOf(".from('ai_plan_cache')");
    const consumeAt = src.indexOf('await consume(');
    assert.ok(peekAt > 0 && consumeAt > peekAt, `${f}: cache peek must come before consume`);
    assert.match(src, /consume\([^)]*\{ cached: !!(cachedSafe|probe\.safe) \}\)/, f);
    assert.match(src, /globalCapFrom\(Deno\.env\.get\('AI_GLOBAL_DAILY_CAP'\)\)/, f);
    assert.doesNotMatch(src, /\|\| 200;/, f);
  }
});
