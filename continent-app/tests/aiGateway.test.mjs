// T1137 (ROADMAP E3): one model-access module for every AI call.
//
//   1. No code outside the two modules (aiModels for the Edge Functions and
//      Ask, pipeline/ai_gateway.py for the batch jobs) names a provider
//      endpoint: a grep over the repository fails on any direct call, and a
//      planted line proves the grep can fail.
//   2. Provider and chain are config: the defaults, the env overrides, the
//      older GEMINI_MODEL(S), and the Claude API refused.
//   3. The failure rules (budget, retry, fall-over, refusal shape) with a
//      stub fetch and a stub Workers AI binding.
//   4. The suggest-city attacks of evals/injection/attacks.json through the
//      guard calls suggest-city/index.ts makes (T1117-c).
//   5. The Python twin's scanner agrees with aiGuard's on the whole set.
// Run: npm test (continent-app/). No network, no key.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as M from '../functions/_lib/aiModels.js';
import * as guard from '../functions/_lib/aiGuard.js';
import { pieceOf } from '../functions/api/ask/answer.js';
import { sanitizeTownCandidates, sanitizeSuggestions } from '../../supabase/functions/suggest-city/logic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rel = (p) => path.join(ROOT, p);
const read = (p) => fs.readFileSync(rel(p), 'utf8');
const SET = JSON.parse(read('evals/injection/attacks.json'));

/* ---- 1. every AI call goes through the modules ---- */

// What a direct provider call looks like, in any language.
export const PROVIDER_PATTERNS = [
  ['gemini endpoint', /generativelanguage\.googleapis\.com/],
  ['workers ai binding', /\bAI\.run\s*\(/],
  ['workers ai rest', /api\.cloudflare\.com\/client\/v4\/accounts\/[^\s'"`]*\/ai\//],
  ['openai-style chat', /\/chat\/completions\b/],
  ['ollama', /\/api\/generate\b|localhost:11434|127\.0\.0\.1:11434/],
  ['vertex', /aiplatform\.googleapis\.com/],
  ['claude api', /api\.anthropic\.com|@anthropic-ai\/|^\s*(import|from)\s+anthropic\b|ANTHROPIC_API_KEY/m],
  ['ai sdk', /from ['"](openai|@google\/genai|@google\/generative-ai|ai)['"]|^\s*(import|from)\s+(openai|google\.genai|google\.generativeai|mistralai)\b/m],
];
const ALLOWED = new Set([
  'supabase/functions/_shared/aiModels.mjs',
  'continent-app/functions/_lib/aiModels.js',
  'pipeline/ai_gateway.py',
]);
// Folders that hold code that runs (the app, its Functions, the Edge
// Functions, the pipeline and every script). Data, docs and archives are not code.
const ROOTS = ['supabase', 'continent-app/src', 'continent-app/functions', 'continent-app/scripts', 'pipeline', 'src', 'scripts', 'Trips', 'run_pipeline.py'];
const SKIP_DIR = new Set(['node_modules', 'dist', 'dist-data', '.fastbuild', 'public', 'archive', '.git', '__pycache__', 'data', 'cache']);
const CODE = /\.(m?js|cjs|jsx|ts|tsx|py)$/;
// Test harnesses that stub fetch and recognise the endpoint by name; they never call it.
const HARNESSES = new Set(['continent-app/scripts/ai/test_edge_exec.mjs', 'continent-app/scripts/ai/test_ai_quota.mjs']);

function codeFiles() {
  const out = [];
  const walk = (p) => {
    let st;
    try { st = fs.statSync(rel(p)); } catch { return; }
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(rel(p))) if (!SKIP_DIR.has(e)) walk(path.posix.join(p, e));
    } else if (CODE.test(p)) out.push(p);
  };
  ROOTS.forEach(walk);
  return out;
}

export function directCalls(files, readFile = read) {
  const hits = [];
  for (const f of files) {
    if (ALLOWED.has(f) || HARNESSES.has(f)) continue;
    const src = readFile(f);
    for (const [name, re] of PROVIDER_PATTERNS) if (re.test(src)) hits.push(`${f}: ${name}`);
  }
  return hits;
}

test('no code outside the model-access modules calls a model provider directly', () => {
  const files = codeFiles();
  assert.ok(files.length > 200, `${files.length} code files scanned`);
  for (const f of ['supabase/functions/plan-day/index.ts', 'pipeline/dossier/rewrite_intros.py', 'continent-app/functions/api/ask/answer.js']) {
    assert.ok(files.includes(f), `${f} is not scanned`);
  }
  assert.deepEqual(directCalls(files), []);
});

test('the grep fails on a planted direct call of every kind', () => {
  const planted = {
    'a.ts': "await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`)",
    'b.js': 'const s = await env.AI.run(model, {})',
    'c.py': 'urlopen(f"{host}/api/generate")',
    'd.py': 'URL = "https://api.example.eu/v1/chat/completions"',
    'e.mjs': "import Anthropic from '@anthropic-ai/sdk';",
    'f.py': 'import anthropic',
    'g.mjs': "import OpenAI from 'openai';",
  };
  const hits = directCalls(Object.keys(planted), (f) => planted[f]);
  assert.equal(hits.length, Object.keys(planted).length, hits.join('\n'));
});

test('every AI call site goes through the modules', () => {
  for (const f of ['plan-day', 'suggest-city', 'parse-booking']) {
    const src = read(`supabase/functions/${f}/index.ts`);
    assert.ok(src.includes("from '../_shared/aiModels.mjs'"), `${f} does not import aiModels`);
    assert.ok(src.includes(`modelAccess('${f}'`) && src.includes(`feature: '${f}'`), `${f} does not use its own feature config`);
    assert.equal((src.match(/callModel\(/g) || []).length, 1, `${f}: one model call`);
    assert.ok(!/\bfetch\([^)]*models\//.test(src), `${f} builds a model URL`);
  }
  const ask = read('continent-app/functions/api/ask/answer.js');
  assert.ok(ask.includes("feature: 'ask'") && ask.includes('callModel('), 'Ask does not call through aiModels');
  for (const [f, feature] of [
    ['pipeline/dossier/rewrite_intros.py', 'intros'], ['pipeline/dossier/parking_check.py', 'parking'],
    ['pipeline/ask_lexicon.py', 'lexicon'], ['Trips/carta-unified/carta-unified/pipeline/generate_trip.py', 'trips'],
  ]) {
    const src = read(f);
    assert.ok(src.includes(`Gateway("${feature}"`), `${f} does not use Gateway("${feature}")`);
    assert.ok(!/urlopen\(/.test(src), `${f} opens a URL itself`);
  }
});

test('the two copies of the model-access module are the same file', () => {
  assert.equal(read('continent-app/functions/_lib/aiModels.js'), read('supabase/functions/_shared/aiModels.mjs'),
    'copy supabase/functions/_shared/aiModels.mjs to continent-app/functions/_lib/aiModels.js');
});

/* ---- 2. provider and chain are config ---- */

test('today: Ask on Workers AI, the three Edge Functions on Gemini', () => {
  assert.equal(M.resolveModelConfig('ask', {}).provider, 'workers-ai');
  for (const f of ['plan-day', 'suggest-city', 'parse-booking']) {
    const c = M.resolveModelConfig(f, {});
    assert.equal(c.provider, 'gemini', f);
    assert.deepEqual(c.models, M.GEMINI_CHAIN, f);
    assert.equal(c.error, null, f);
  }
  assert.equal(M.resolveModelConfig('nope', {}).error, 'unknown_feature');
});

test('a provider or model switch is an environment value', () => {
  const c = M.resolveModelConfig('plan-day', {
    AI_PLAN_DAY_PROVIDER: 'openai', AI_PLAN_DAY_MODELS: 'mistral-small-3.2', AI_PLAN_DAY_BASE_URL: 'https://api.example.eu/v1/',
  });
  assert.equal(c.provider, 'openai');
  assert.deepEqual(c.models, ['mistral-small-3.2']);
  assert.equal(c.baseUrl, 'https://api.example.eu/v1');
  assert.equal(c.error, null);
  // Workers AI for plan-day takes its own default chain.
  assert.deepEqual(M.resolveModelConfig('plan-day', { AI_PLAN_DAY_PROVIDER: 'workers-ai' }).models, M.WORKERS_AI_CHAIN);
  // The older variables still steer the Gemini chain; the new one wins.
  assert.deepEqual(M.resolveModelConfig('suggest-city', { GEMINI_MODELS: 'a, b' }).models, ['a', 'b']);
  assert.equal(M.resolveModelConfig('suggest-city', { GEMINI_MODEL: 'x' }).models[0], 'x');
  assert.deepEqual(M.resolveModelConfig('suggest-city', { GEMINI_MODELS: 'a', AI_SUGGEST_CITY_MODELS: 'z' }).models, ['z']);
  // A getter works as well as an object (Deno.env.get).
  assert.equal(M.resolveModelConfig('ask', (k) => (k === 'AI_ASK_PROVIDER' ? 'gemini' : undefined)).provider, 'gemini');
  // The chain is bounded.
  assert.equal(M.resolveModelConfig('plan-day', { AI_PLAN_DAY_MODELS: 'a,b,c,d,e,f,g,h' }).models.length, 6);
});

test('a bad config is refused, and the Claude API is never a provider', () => {
  assert.equal(M.resolveModelConfig('plan-day', { AI_PLAN_DAY_PROVIDER: 'mystery' }).error, 'unknown_provider');
  assert.equal(M.resolveModelConfig('plan-day', { AI_PLAN_DAY_PROVIDER: 'openai', AI_PLAN_DAY_MODELS: 'm' }).error, 'no_base_url');
  assert.equal(M.resolveModelConfig('plan-day', { AI_PLAN_DAY_PROVIDER: 'openai', AI_PLAN_DAY_MODELS: 'm', AI_PLAN_DAY_BASE_URL: 'http://x.example' }).error, 'no_base_url');
  assert.equal(M.resolveModelConfig('plan-day', { AI_PLAN_DAY_PROVIDER: 'openai' }).error, 'no_models');
  for (const env of [
    { AI_PLAN_DAY_PROVIDER: 'anthropic' },
    { AI_PLAN_DAY_MODELS: 'claude-sonnet-5-5' },
    { AI_PLAN_DAY_PROVIDER: 'openai', AI_PLAN_DAY_MODELS: 'm', AI_PLAN_DAY_BASE_URL: 'https://api.anthropic.com/v1' },
  ]) assert.equal(M.resolveModelConfig('plan-day', env).error, 'claude_api_forbidden', JSON.stringify(env));
  const a = M.modelAccess('plan-day', { AI_PLAN_DAY_MODELS: 'claude-x', GEMINI_API_KEY: 'k' });
  assert.equal(a.refusal.code, 'config');
  assert.equal(M.modelAccess('plan-day', {}).refusal.code, 'no_ai');
  assert.equal(M.modelAccess('plan-day', { GEMINI_API_KEY: 'k' }).refusal, null);
  assert.equal(M.modelAccess('ask', {}, { run() {} }).refusal, null);
});

test('the cache key of a Gemini chain is unchanged by T1137; another provider gets its own', () => {
  assert.equal(M.chainKey(M.resolveModelConfig('plan-day', { GEMINI_MODELS: 'm1,m2' })), 'm1,m2');
  assert.equal(M.chainKey(M.resolveModelConfig('plan-day', { AI_PLAN_DAY_PROVIDER: 'workers-ai' })), `workers-ai:${M.WORKERS_AI_CHAIN.join(',')}`);
});

/* ---- 3. the failure rules ---- */

const ENV = { GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1,m2,m3' };
const gemOk = (text) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://src.example/a' } }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } } });
function stubFetch(replies) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = replies.shift();
    if (!r) throw new Error('no reply left');
    if (r.throws) throw r.throws;
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status });
  };
  return { fn, calls };
}
const timeoutErr = () => new DOMException('timed out', 'TimeoutError');
// A clock that moves only when told to, so budgets are exact.
function clock() { let t = 0; return { now: () => t, add: (ms) => { t += ms; } }; }

test('one answer: the request carries the system slot, schema, search and the key; the answer carries model and sources', async () => {
  const f = stubFetch([gemOk('{"ok":1}')]);
  const r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl: f.fn, system: 'RULES', user: 'U', json: true, schema: { type: 'OBJECT' }, temperature: 0.25 });
  assert.equal(r.ok, true);
  assert.equal(r.text, '{"ok":1}');
  assert.equal(r.model, 'm1');
  assert.equal(r.fellBack, false);
  assert.deepEqual(r.sources, ['https://src.example/a']);
  const c = f.calls[0];
  assert.match(c.url, /\/models\/m1:generateContent$/);
  assert.equal(c.init.headers['x-goog-api-key'], 'k');
  assert.deepEqual(c.body.systemInstruction, { parts: [{ text: 'RULES' }] });
  assert.equal(c.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(c.body.generationConfig.temperature, 0.25);
  assert.ok(c.init.signal, 'every attempt has a timeout');
  // With search on, the schema is not sent (Gemini refuses the pair).
  const g = stubFetch([gemOk('x')]);
  await M.callModel({ feature: 'suggest-city', env: ENV, fetchImpl: g.fn, user: 'U', json: true, schema: { type: 'OBJECT' }, search: true });
  assert.deepEqual(g.calls[0].body.tools, [{ google_search: {} }]);
  assert.equal(g.calls[0].body.generationConfig.responseSchema, undefined);
});

test('429 and 404 fall over at once; a 5xx is retried once on the same model', async () => {
  let f = stubFetch([{ status: 429 }, { status: 404 }, gemOk('a')]);
  let r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl: f.fn, user: 'U' });
  assert.equal(r.model, 'm3');
  assert.equal(r.fellBack, true);
  assert.deepEqual(f.calls.map((c) => c.url.match(/models\/(\w+)/)[1]), ['m1', 'm2', 'm3']);
  f = stubFetch([{ status: 503 }, gemOk('a')]);
  r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl: f.fn, user: 'U' });
  assert.equal(r.model, 'm1', 'the retry is on the same model');
  f = stubFetch([{ status: 503 }, { status: 503 }, gemOk('a')]);
  r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl: f.fn, user: 'U' });
  assert.equal(r.model, 'm2', 'a second 5xx falls over');
  f = stubFetch([{ throws: new TypeError('connection reset') }, gemOk('a')]);
  r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl: f.fn, user: 'U' });
  assert.equal(r.model, 'm1', 'a dropped connection is retried once');
});

test('the refusal shape: global_cap, ai_timeout, ai_error and a stop on our own bad request', async () => {
  let f = stubFetch([{ status: 429 }, { status: 429 }, { status: 429 }]);
  let r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl: f.fn, user: 'U' });
  assert.deepEqual([r.ok, r.code, r.status], [false, 'global_cap', 429]);
  assert.deepEqual(M.refusalBody(r), { code: 'global_cap' });
  f = stubFetch([{ throws: timeoutErr() }, { throws: timeoutErr() }, { throws: timeoutErr() }]);
  r = await M.callModel({ feature: 'parse-booking', env: ENV, fetchImpl: f.fn, user: 'U' });
  assert.deepEqual([r.code, r.status], ['ai_timeout', 504]);
  f = stubFetch([{ status: 400 }, gemOk('never')]);
  r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl: f.fn, user: 'U' });
  assert.deepEqual([r.code, r.status, r.upstream, f.calls.length], ['ai_error', 502, 400, 1]);
  assert.deepEqual(M.refusalBody(r), { code: 'ai_error', status: 400 });
  f = stubFetch([{ status: 500 }, { status: 500 }, { status: 502 }, { status: 502 }, { status: 503 }, { status: 503 }]);
  r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl: f.fn, user: 'U' });
  assert.deepEqual([r.code, r.upstream], ['ai_error', 503]);
});

test('the time budget: the first model gets the larger share, too little left stops the chain', async () => {
  const k = clock();
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(init.signal);
    k.add(40_000);
    throw timeoutErr();
  };
  const r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl, user: 'U', now: k.now });
  assert.equal(r.code, 'ai_timeout');
  // 80 s budget: 40 s, then 40 s more leaves nothing for a third model.
  assert.equal(seen.length, 2);
  assert.equal(M.attemptTimeoutMs(0, 0, M.AI_FEATURES['plan-day']), 40_000);
  assert.equal(M.attemptTimeoutMs(1, 40_000, M.AI_FEATURES['plan-day']), 25_000);
  assert.equal(M.attemptTimeoutMs(1, 75_000, M.AI_FEATURES['plan-day']), 0);
  assert.equal(M.attemptTimeoutMs(0, 0, M.AI_FEATURES['parse-booking']), 60_000);
});

test('input and output caps, and what a provider cannot do', async () => {
  const f = stubFetch([gemOk('x'.repeat(70_000))]);
  let r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl: f.fn, user: 'U' });
  assert.deepEqual([r.code, r.reason], ['ai_bad_output', 'too_long']);
  r = await M.callModel({ feature: 'plan-day', env: ENV, fetchImpl: f.fn, user: 'x'.repeat(60_001) });
  assert.equal(r.code, 'too_big');
  const oa = { AI_OPENAI_API_KEY: 'k', AI_PLAN_DAY_PROVIDER: 'openai', AI_PLAN_DAY_MODELS: 'm', AI_PLAN_DAY_BASE_URL: 'https://api.example.eu/v1' };
  r = await M.callModel({ feature: 'plan-day', env: oa, fetchImpl: f.fn, user: 'U', search: true });
  assert.deepEqual([r.code, r.reason], ['ai_error', 'search_unsupported']);
  r = await M.callModel({ feature: 'parse-booking', env: { ...oa, AI_PARSE_BOOKING_PROVIDER: 'openai', AI_PARSE_BOOKING_MODELS: 'm', AI_PARSE_BOOKING_BASE_URL: 'https://api.example.eu/v1' }, fetchImpl: f.fn, parts: [{ text: 'U' }, { inline: { mime: 'application/pdf', data: 'AA' } }] });
  assert.deepEqual([r.code, r.reason], ['ai_error', 'files_unsupported']);
  assert.equal(M.supportsSearch(M.resolveModelConfig('plan-day', {})), true);
  assert.equal(M.supportsSearch(M.resolveModelConfig('plan-day', oa)), false);
});

test('an OpenAI-compatible provider and Workers AI over REST get the same request', async () => {
  const f = stubFetch([{ status: 200, json: { choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } } }]);
  const env = { AI_OPENAI_API_KEY: 'sk', AI_PLAN_DAY_PROVIDER: 'openai', AI_PLAN_DAY_MODELS: 'mistral-small', AI_PLAN_DAY_BASE_URL: 'https://api.example.eu/v1' };
  const r = await M.callModel({ feature: 'plan-day', env, fetchImpl: f.fn, system: 'S', user: 'U', json: true });
  assert.equal(r.text, '{"a":1}');
  assert.equal(r.provider, 'openai');
  assert.equal(f.calls[0].url, 'https://api.example.eu/v1/chat/completions');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer sk');
  assert.deepEqual(f.calls[0].body.messages, [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
  assert.deepEqual(f.calls[0].body.response_format, { type: 'json_object' });
  const w = stubFetch([{ status: 200, json: { choices: [{ message: { content: 'hi' } }] } }]);
  const r2 = await M.callModel({ feature: 'plan-day', env: { AI_PLAN_DAY_PROVIDER: 'workers-ai', CF_ACCOUNT_ID: 'acc', CF_AI_TOKEN: 't' }, fetchImpl: w.fn, user: 'U' });
  assert.equal(r2.text, 'hi');
  assert.match(w.calls[0].url, /\/accounts\/acc\/ai\/v1\/chat\/completions$/);
});

test('Ask: the Workers AI binding streams; a provider without a stream still feeds the reader', async () => {
  const calls = [];
  const binding = {
    async run(id, opts) {
      calls.push(id);
      if (calls.length === 1) throw new Error('capacity');
      if (calls.length === 2) throw new Error('capacity');
      return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"response":"ok"}\n\n')); c.close(); } });
    },
  };
  const r = await M.callModel({ feature: 'ask', env: {}, binding, system: 'S', user: 'U', stream: true });
  assert.equal(r.ok, true);
  assert.equal(r.model, M.WORKERS_AI_CHAIN[1], 'one retry on the first model, then the next');
  assert.ok(r.stream instanceof ReadableStream);
  const f = stubFetch([gemOk('A whole answer.')]);
  const g = await M.callModel({ feature: 'ask', env: { AI_ASK_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }, fetchImpl: f.fn, user: 'U', stream: true });
  const text = await new Response(g.stream).text();
  const pieces = text.split('\n').map((l) => pieceOf(l.trim())).filter((p) => p != null);
  assert.deepEqual(pieces, ['A whole answer.']);
});

test('parseModelJson: strict for schema answers, loose for grounded ones', () => {
  assert.deepEqual(M.parseModelJson('{"a":1}'), { a: 1 });
  assert.equal(M.parseModelJson('Sure! {"a":1}'), undefined);
  assert.deepEqual(M.parseModelJson('Sure! ```json\n{"a":1}\n```', { loose: true }), { a: 1 });
  assert.deepEqual(M.parseModelJson('Here: {"a":{"b":2}} thanks', { loose: true }), { a: { b: 2 } });
  assert.equal(M.parseModelJson('nothing', { loose: true }), undefined);
});

/* ---- 4. suggest-city attacks (T1117-c, closed here) ---- */

const STAY = { lat: 38.72, lon: -9.14 };
const BASE_CANDS = [
  { id: 'c1', name: 'Sintra', country: 'Portugal', km: 25, tags: ['palaces'] },
  { id: 'c2', name: 'Cascais', country: 'Portugal', km: 30, tags: ['beach'] },
  { id: 'c3', name: 'Obidos', country: 'Portugal', km: 80, tags: ['walls'] },
  { id: 'c4', name: 'Evora', country: 'Portugal', km: 130 },
];
const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};

function runCity(a) {
  const g = guard.guardCityInput({
    freeText: a.input.freeText || '',
    candidates: sanitizeTownCandidates([...BASE_CANDS, ...(a.input.candidates || [])]),
  });
  const security = guard.systemRules('0123456789ab');
  const out = guard.guardCityOutput(a.recorded, { systemText: security });
  if (!out.value) return { rejected: true, g };
  const suggestions = sanitizeSuggestions(out.value.suggestions, g.candidates, STAY);
  const payload = guard.guardCityPayload({ suggestions, meta: { cached: false } });
  return { g, payload };
}

const CITY = SET.attacks.filter((a) => a.surface === 'suggest-city');
test('the attack set covers suggest-city and the pipeline', () => {
  assert.ok(CITY.length >= 10, `${CITY.length} suggest-city attacks`);
  assert.ok(SET.attacks.filter((a) => a.surface === 'pipeline').length >= 8);
});

for (const a of CITY) {
  test(`attack ${a.id} (${a.vector}, ${a.family})`, () => {
    const r = runCity(a);
    if (a.expect === 'rejected') return assert.ok(r.rejected, `${a.id} was not rejected`);
    for (const f of a.inputFlags) assert.ok(r.g.flags.includes(f), `${a.id}: ${f} not scrubbed (${r.g.flags})`);
    const prompt = [r.g.freeText, r.g.candidates.map((c) => [c.name, c.country, c.tags])];
    const shown = [r.payload.suggestions.map((s) => [s.name, s.country, s.why])];
    for (const [where, v] of [['prompt', prompt], ['answer', shown]]) {
      const flat = strings(v).join('\n').toLowerCase();
      for (const m of a.mustNotAppear) assert.ok(!flat.includes(m.toLowerCase()), `${a.id}: "${m}" reached the ${where}`);
    }
    for (const s of strings(shown)) {
      const o = guard.scanOutput(s);
      assert.ok(!o.severe && !o.issues.some((i) => ['url', 'markup', 'email', 'phone'].includes(i)), `${a.id}: "${s}" (${o.issues})`);
    }
    assert.ok(r.payload.suggestions.length >= 1, `${a.id}: the clean suggestions were lost`);
  });
}

test('benign wishes and a real deck pass the suggest-city guard untouched', () => {
  for (const t of [...SET.benign.planFreeText, 'Somewhere by the sea with good fish', 'Een rustig dorp met een kasteel']) {
    const g = guard.guardCityInput({ freeText: t, candidates: sanitizeTownCandidates(BASE_CANDS) });
    assert.equal(g.freeText, t);
    assert.deepEqual(g.flags, []);
    assert.equal(g.candidates.length, BASE_CANDS.length);
  }
  const p = guard.guardCityPayload({ suggestions: [{ id: 'c1', name: 'Sintra', country: 'Portugal', why: 'Palaces, 40 minutes by train for EUR 2.30.', inCatalog: true }], meta: {} });
  assert.equal(p.suggestions[0].why, 'Palaces, 40 minutes by train for EUR 2.30.');
  assert.equal(guard.guardCityPayload({ suggestions: [{ name: 1 }] }), null);
  assert.equal(guard.guardCityPayload(null), null);
});

/* ---- 5. the Python twin agrees with aiGuard ---- */

test('pipeline/ai_gateway.py scans the attack set exactly as aiGuard does', (t) => {
  const py = spawnSync('python3', ['-I', '-c', [
    'import sys, json',
    `sys.path.insert(0, ${JSON.stringify(rel('pipeline'))})`,
    'import ai_gateway as g',
    'items = json.load(sys.stdin)',
    'print(json.dumps([[sorted(g.scan_injection(s)["rules"]), sorted(g.scan_output_severe(s))] for s in items]))',
  ].join('\n')], { input: JSON.stringify(strings(SET)), encoding: 'utf8' });
  if (py.error || py.status !== 0) {
    if (process.env.CI) assert.fail(`python3 failed: ${py.error || py.stderr}`);
    return t.skip('python3 is not available here');
  }
  const got = JSON.parse(py.stdout);
  const all = strings(SET);
  assert.ok(all.length > 400);
  all.forEach((s, i) => {
    const js = [guard.scanInjection(s).rules.slice().sort(), guard.scanOutput(s).issues.filter((x) => ['canary', 'template', 'hijack'].includes(x)).sort()];
    assert.deepEqual(got[i], js, s.slice(0, 80));
  });
});
