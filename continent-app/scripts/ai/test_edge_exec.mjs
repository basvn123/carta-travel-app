/**
 * Execution tests for the quota branches of the three AI Edge Functions.
 *
 *   CARTA_REPO_ROOT=<root checkout> node scripts/ai/test_edge_exec.mjs
 *   (from continent-app/; CARTA_REPO_ROOT defaults to the parent directory)
 *
 * WHY THIS EXISTS (T037-d). Part C of test_ai_quota.mjs reads the Edge
 * Function source and checks that a branch is PRESENT. It cannot show the
 * branch RUNS, or that a cap really stops the Gemini call, or that a failure
 * really refunds the right kind. This script runs the real index.ts of
 * plan-day, suggest-city and parse-booking, request in, response out, against
 * a stub Supabase client and a stub fetch, and asserts what they did.
 *
 * HOW. The Edge Functions are Deno programs that touch three things: the
 * `Deno` global (serve and env), the `npm:@supabase/supabase-js@2` import and
 * global fetch. This harness supplies all three from Node 24: it defines a
 * `Deno` global whose serve() captures the handler, redirects the npm: import
 * to a stub client with a module resolution hook, and replaces fetch. Node's
 * built-in type stripping reads the .ts files, so the code under test is the
 * shipped file, not a copy. No dependency is added.
 *
 * HONEST LIMIT. This is Node running the Deno source, not the Deno runtime:
 * `deno` is not installed on this machine. Anything Deno-specific beyond the
 * three surfaces above (permissions, the npm: resolver, EdgeRuntime itself) is
 * not covered. EdgeRuntime.waitUntil is stubbed so the harness can see what
 * was handed to it. The stub client has no SQL; the ai_consume and ai_refund
 * arithmetic is Part A of test_ai_quota.mjs. This file tests what the
 * functions do with the answers those RPCs give.
 *
 * Never touches the live Supabase project or Gemini: every network call is
 * the stub.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { registerHooks } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.CARTA_REPO_ROOT || resolve(here, '../../..');
const fnDir = resolve(repoRoot, 'supabase/functions');

let failures = 0;
let checks = 0;
const check = (name, cond, detail = '') => {
  checks += 1;
  if (cond) console.log(`  ok  ${name}`);
  else { failures += 1; console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
};

/* ---------- the world the functions run in ---------- */

const world = {};
const events = []; // ordered, so "consume before fetch" is assertable
const handlers = {};
const envVars = {};

function resetWorld(over = {}) {
  Object.keys(envVars).forEach((k) => delete envVars[k]);
  Object.assign(envVars, {
    GEMINI_API_KEY: 'k', SUPABASE_URL: 'http://stub', SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service', GEMINI_MODELS: 'm1,m2',
  }, over.env || {});
  events.length = 0;
  Object.assign(world, {
    user: { id: 'u1' },
    // kind -> result, or a function(kind, callIndex) -> result
    consume: {
      plan: { status: 'ok', tier: 'year', cap: 300, used: 1, left: 299 },
      ground: { status: 'ok', tier: 'year', cap: 120, used: 1, left: 119 },
    },
    consumeError: false,
    status: { tier: 'year', groundLeft: 5 },
    cache: null,
    gemini: [],
    inserts: [], // { table, row }
    insertMode: {}, // table -> 'ok' | 'error' | 'throw' | 'hang'
    waited: [],
    hung: [],
    fetchCalls: [],
    rpcCalls: [],
    ...over.world,
  });
}

const consumeCount = {};
function rpc(name, args) {
  world.rpcCalls.push({ name, args });
  events.push(`rpc:${name}:${args.p_kind || ''}`);
  if (name === 'ai_consume') {
    if (world.consumeError) return Promise.resolve({ data: null, error: { message: 'boom' } });
    consumeCount[args.p_kind] = (consumeCount[args.p_kind] || 0) + 1;
    const r = world.consume[args.p_kind];
    const data = typeof r === 'function' ? r(args.p_kind, consumeCount[args.p_kind]) : r;
    return Promise.resolve({ data, error: null });
  }
  if (name === 'ai_status') return Promise.resolve({ data: world.status, error: null });
  return Promise.resolve({ data: null, error: null });
}

function writeResult(table, row) {
  world.inserts.push({ table, row });
  events.push(`write:${table}`);
  const mode = world.insertMode[table] || 'ok';
  if (mode === 'hang') {
    return new Promise((res) => { world.hung.push(() => res({ error: null })); });
  }
  if (mode === 'throw') return Promise.reject(new Error('insert threw'));
  if (mode === 'error') return Promise.resolve({ error: { message: 'insert failed' } });
  return Promise.resolve({ error: null });
}

const stubClient = (key) => ({
  auth: { getUser: async () => ({ data: { user: key === 'anon' ? world.user : null } }) },
  rpc,
  from: (table) => ({
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data: table === 'ai_plan_cache' ? world.cache : null }),
    insert: (row) => writeResult(table, row),
    upsert: (row) => writeResult(table, row),
  }),
});

globalThis.Deno = {
  env: { get: (k) => envVars[k] },
  serve: (h) => { handlers.current = h; },
};
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.includes('generativelanguage.googleapis.com')) {
    throw new Error(`unexpected fetch to ${u}`);
  }
  events.push('fetch:gemini');
  const body = JSON.parse(init.body);
  world.fetchCalls.push({ url: u, body, model: u.match(/models\/([^:]+):/)?.[1] });
  const next = world.gemini.shift();
  if (!next) throw new Error('no stub Gemini reply left');
  if (next.throws) throw new Error('network');
  return new Response(JSON.stringify(next.json ?? {}), { status: next.status ?? 200 });
};
globalThis.EdgeRuntime = { waitUntil: (p) => { world.waited.push(p); } };

// Redirect the npm: import to the stub client.
const tmp = mkdtempSync(resolve(tmpdir(), 'carta-edge-'));
writeFileSync(resolve(tmp, 'sb.mjs'), 'export const createClient = (u, k) => globalThis.__stubClient(k);\n');
globalThis.__stubClient = stubClient;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('npm:@supabase/supabase-js')) {
      return { url: pathToFileURL(resolve(tmp, 'sb.mjs')).href, shortCircuit: true };
    }
    return next(spec, ctx);
  },
});

async function load(name) {
  await import(pathToFileURL(resolve(fnDir, name, 'index.ts')).href);
  handlers[name] = handlers.current;
  return handlers[name];
}

const call = async (name, body, { auth = true, method = 'POST' } = {}) => {
  Object.keys(consumeCount).forEach((k) => delete consumeCount[k]);
  const headers = auth ? { Authorization: 'Bearer t' } : {};
  const res = await handlers[name](new Request('http://stub/', {
    method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined,
  }));
  let json = null;
  try { json = await res.clone().json(); } catch { /* not json */ }
  return { status: res.status, json };
};

const consumed = (kind) => world.rpcCalls.filter((c) => c.name === 'ai_consume' && c.args.p_kind === kind).length;
const refunded = () => world.rpcCalls.filter((c) => c.name === 'ai_refund').map((c) => c.args.p_kind);
const capEvents = () => world.inserts.filter((i) => i.table === 'ai_cap_events').map((i) => i.row);
const modelEvents = () => world.inserts.filter((i) => i.table === 'ai_model_events').map((i) => i.row);
const text = (obj) => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] } });

/* ---------- fixtures ---------- */

const cands = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((id, i) => ({
  id, name: `Place ${id}`, kind: 'museum', cat: 'cul', lat: 47.8 + i * 0.002, lon: 13.04 + i * 0.002,
  rating: 7 + (i % 3), mustSee: i < 3, dwellMin: 40, desc: '',
}));
const planBody = (extra = {}) => ({
  dest: { id: 'sbg', city: 'Salzburg', country: 'Austria', lat: 47.8, lon: 13.04 },
  date: '2026-11-01', candidates: cands, ...extra,
});
const planAnswer = text({
  summary: 'A day', stops: [
    { id: 'c1', dwellMin: 40, why: 'a' }, { id: 'c2', dwellMin: 40, why: 'b' }, { id: 'c3', dwellMin: 40, why: 'c' },
  ],
});
const towns = ['t1', 't2', 't3', 't4'].map((id) => ({ id, name: `Town ${id}`, country: 'AT', km: 30, rating: 7, tags: [] }));
const suggestBody = (extra = {}) => ({ candidates: towns, stay: { lat: 47.8, lon: 13.04 }, ...extra });
const suggestAnswer = text({ suggestions: [{ id: 't1', why: 'close' }, { id: 't2', why: 'nice' }] });
const parseAnswer = text({
  summary: 'one flight', bookings: [{ kind: 'flight', title: 'VIE to SZG', date: '2026-11-01' }], activities: [],
});
const parseBody = { text: 'Your flight VIE to SZG on 2026-11-01, confirmation ABC123.' };

/* ---------- the shared quota contract, run against each function ---------- */

const SPECS = [
  { name: 'plan-day', body: planBody, good: planAnswer, kind: 'plan' },
  { name: 'suggest-city', body: suggestBody, good: suggestAnswer, kind: 'plan', groundOff: true },
  { name: 'parse-booking', body: () => parseBody, good: parseAnswer, kind: 'plan' },
];

async function sharedContract(spec) {
  const { name } = spec;
  console.log(`\n${name}: the quota contract, executed`);
  const mk = (over) => resetWorld({ ...over, world: { ...(over?.world || {}) } });
  const shapeOf = (r) => r.json?.code;

  // suggest-city reads ai_status first; make grounding unavailable so the
  // shared cases test the plain 'plan' path.
  const base = (w = {}) => mk({ world: { status: { tier: 'free', groundLeft: 0 }, ...w } });

  // 1 no key
  base(); delete envVars.GEMINI_API_KEY;
  let r = await call(name, spec.body());
  check(`${name}: no GEMINI_API_KEY answers 503 no_ai`, r.status === 503 && shapeOf(r) === 'no_ai');
  check(`${name}: no key spends nothing and calls nobody`,
    world.rpcCalls.length === 0 && world.fetchCalls.length === 0);

  // 2 no user
  base(); world.user = null;
  r = await call(name, spec.body());
  check(`${name}: a request with no signed-in user is 401`, r.status === 401 && shapeOf(r) === 'auth');
  check(`${name}: an anonymous request spends nothing`, consumed('plan') === 0 && world.fetchCalls.length === 0);

  // 3 user_cap
  base({ consume: { plan: { status: 'user_cap', tier: 'free', cap: 2, used: 2 } } });
  r = await call(name, spec.body());
  check(`${name}: user_cap answers 429 user_cap`, r.status === 429 && shapeOf(r) === 'user_cap');
  check(`${name}: user_cap body carries tier, cap and used`,
    r.json.tier === 'free' && r.json.cap === 2 && r.json.used === 2);
  check(`${name}: user_cap never reaches Gemini`, world.fetchCalls.length === 0);
  check(`${name}: user_cap refunds nothing (nothing was spent)`, refunded().length === 0);
  check(`${name}: user_cap is counted in ai_cap_events`,
    capEvents().length === 1 && capEvents()[0].reason === 'user_cap' && capEvents()[0].kind === 'plan');

  // 4 global_cap
  base({ consume: { plan: { status: 'global_cap', tier: 'year', cap: 300, used: 4 } } });
  r = await call(name, spec.body());
  check(`${name}: global_cap answers 429 global_cap`, r.status === 429 && shapeOf(r) === 'global_cap');
  check(`${name}: global_cap never reaches Gemini`, world.fetchCalls.length === 0);
  check(`${name}: global_cap is counted in ai_cap_events`,
    capEvents().length === 1 && capEvents()[0].reason === 'global_cap');

  // 5 quota RPC error: not a grant, not a cap
  base({ consumeError: true });
  r = await call(name, spec.body());
  check(`${name}: a failing ai_consume answers 503 quota_check, not a grant`,
    r.status === 503 && shapeOf(r) === 'quota_check');
  check(`${name}: a failing ai_consume never reaches Gemini`, world.fetchCalls.length === 0);
  check(`${name}: a failing ai_consume is not logged as a cap`, capEvents().length === 0);

  // 6 an unknown status is not a grant either
  base({ consume: { plan: { status: 'bad_kind', tier: 'year' } } });
  r = await call(name, spec.body());
  check(`${name}: an unrecognised status never reaches Gemini`, r.status === 429 && world.fetchCalls.length === 0);

  // 7 grant: consume happens before the Gemini call, exactly one unit, no refund
  base({ gemini: [spec.good] });
  r = await call(name, spec.body());
  check(`${name}: a grant answers 200`, r.status === 200, `status ${r.status} ${JSON.stringify(r.json)}`);
  const ci = events.findIndex((e) => e.startsWith('rpc:ai_consume'));
  const fi = events.indexOf('fetch:gemini');
  check(`${name}: quota is spent BEFORE the Gemini call`, ci >= 0 && fi > ci);
  check(`${name}: a grant spends exactly one 'plan' unit`, consumed('plan') === 1 && consumed('ground') === 0);
  check(`${name}: a successful answer refunds nothing`, refunded().length === 0);
  check(`${name}: the answer carries the pass block`, !!r.json?.pass && r.json.pass.tier === 'year');

  // 8 Gemini hard failure (400 does not fall over): the unit comes back
  base({ gemini: [{ status: 400 }] });
  r = await call(name, spec.body());
  check(`${name}: a non-retryable Gemini error answers 502 ai_error`, r.status === 502 && shapeOf(r) === 'ai_error');
  check(`${name}: ...and refunds the 'plan' unit it spent`, refunded().join() === 'plan');
  check(`${name}: ...after trying only one model`, world.fetchCalls.length === 1);

  // 9 fall-over: 429 then ok: second model answers, no refund
  base({ gemini: [{ status: 429 }, spec.good] });
  r = await call(name, spec.body());
  check(`${name}: a 429 falls over to the next model`,
    r.status === 200 && world.fetchCalls.map((c) => c.model).join() === 'm1,m2');
  check(`${name}: a fall-over refunds nothing`, refunded().length === 0);
  check(`${name}: the answer says it fell back`, r.json?.meta?.fellBack === true && r.json.meta.model === 'm2');

  // 10 whole chain 429: refund, and the traveller is told global_cap
  base({ gemini: [{ status: 429 }, { status: 429 }] });
  r = await call(name, spec.body());
  check(`${name}: an exhausted chain answers 429 global_cap`, r.status === 429 && shapeOf(r) === 'global_cap');
  check(`${name}: an exhausted chain refunds the unit`, refunded().join() === 'plan');

  // 11 timeout
  base({ gemini: [{ throws: true }] });
  r = await call(name, spec.body());
  check(`${name}: a Gemini timeout answers 504 and refunds`,
    r.status === 504 && refunded().join() === 'plan' && world.fetchCalls.length === 1);

  // 12 garbage output
  base({ gemini: [{ json: { candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] } }] });
  r = await call(name, spec.body());
  check(`${name}: unparseable model output answers 502 ai_bad_output and refunds`,
    r.status === 502 && shapeOf(r) === 'ai_bad_output' && refunded().join() === 'plan');

  // 13 cache hit: still spends a unit, never calls Gemini
  base({ cache: { payload: { stops: [], suggestions: [], bookings: [], meta: {} }, created_at: new Date().toISOString() } });
  r = await call(name, spec.body());
  check(`${name}: a cache hit answers 200 without calling Gemini`, r.status === 200 && world.fetchCalls.length === 0);
  check(`${name}: a cache hit still spends the unit`, consumed('plan') === 1 && refunded().length === 0);
  check(`${name}: a cache hit is flagged cached`, r.json?.meta?.cached === true);
}

/* ---------- plan-day: the grounded unit ---------- */

async function planDayGrounding() {
  console.log('\nplan-day: the grounded unit, executed');
  const body = planBody({ wantEvents: true });

  resetWorld({ world: { gemini: [planAnswer] } });
  let r = await call('plan-day', body);
  check('grounded: a granted ground unit sends the google_search tool',
    r.status === 200 && !!world.fetchCalls[0].body.tools?.[0]?.google_search);
  check('grounded: it spent one plan and one ground unit', consumed('plan') === 1 && consumed('ground') === 1);
  check('grounded: the answer says grounded', r.json.meta.grounded === true && r.json.meta.groundingSkipped === null);

  resetWorld({ world: { gemini: [{ status: 400 }] } });
  r = await call('plan-day', body);
  check('grounded: a failure after both spends refunds BOTH kinds',
    [...refunded()].sort().join() === 'ground,plan');

  resetWorld({
    world: {
      consume: { plan: { status: 'ok', tier: 'free', cap: 2, used: 1, left: 1 }, ground: { status: 'user_cap', tier: 'free', cap: 0, used: 0 } },
      gemini: [planAnswer],
    },
  });
  r = await call('plan-day', body);
  check('grounded: a free tier without a ground allowance still gets a day', r.status === 200);
  check('grounded: ...built WITHOUT search (no tools in the request)', !world.fetchCalls[0].body.tools);
  check('grounded: ...told why (groundingSkipped tier)', r.json.meta.groundingSkipped === 'tier' && r.json.meta.grounded === false);
  check('grounded: a free tier refusal is not logged as a cap event', capEvents().length === 0);

  resetWorld({
    world: {
      consume: { plan: { status: 'ok', tier: 'year', cap: 300, used: 1, left: 299 }, ground: { status: 'user_cap', tier: 'year', cap: 120, used: 120 } },
      gemini: [planAnswer],
    },
  });
  r = await call('plan-day', body);
  check('grounded: a paid tier out of ground units degrades to cap', r.json.meta.groundingSkipped === 'cap' && !world.fetchCalls[0].body.tools);
  check('grounded: ...and that refusal IS logged as a ground cap event',
    capEvents().length === 1 && capEvents()[0].kind === 'ground' && capEvents()[0].reason === 'user_cap');
  check('grounded: a degraded request refunds nothing on success', refunded().length === 0);

  resetWorld({ env: { AI_ENABLE_GROUNDING: 'false' }, world: { gemini: [planAnswer] } });
  r = await call('plan-day', body);
  check('grounded: AI_ENABLE_GROUNDING=false never asks for a ground unit',
    consumed('ground') === 0 && r.json.meta.groundingSkipped === 'off');

  // a degraded request that then fails must refund only what it spent
  resetWorld({
    world: {
      consume: { plan: { status: 'ok', tier: 'year', cap: 300, used: 1, left: 299 }, ground: { status: 'user_cap', tier: 'year', cap: 120, used: 120 } },
      gemini: [{ status: 400 }],
    },
  });
  await call('plan-day', body);
  check('grounded: a refused ground unit is never refunded (that would mint quota)', refunded().join() === 'plan');
}

/* ---------- suggest-city: the grounded unit and the degrade ---------- */

async function suggestGrounding() {
  console.log('\nsuggest-city: the grounded unit, executed');
  resetWorld({ world: { status: { tier: 'year', groundLeft: 5 }, gemini: [suggestAnswer] } });
  let r = await call('suggest-city', suggestBody());
  check('suggest-city grounded: spends a ground unit and no plan unit', consumed('ground') === 1 && consumed('plan') === 0);
  check('suggest-city grounded: sends google_search and no response schema',
    !!world.fetchCalls[0].body.tools?.[0]?.google_search && !world.fetchCalls[0].body.generationConfig.responseSchema);
  check('suggest-city grounded: a later failure refunds ground, not plan', r.status === 200);

  resetWorld({ world: { status: { tier: 'year', groundLeft: 5 }, gemini: [{ status: 400 }] } });
  await call('suggest-city', suggestBody());
  check('suggest-city grounded: a failure refunds the ground unit it spent', refunded().join() === 'ground');

  // lost the race on the last grounded unit: degrade to a plan unit
  resetWorld({
    world: {
      status: { tier: 'year', groundLeft: 1 },
      consume: { ground: { status: 'user_cap', tier: 'year', cap: 120, used: 120 }, plan: { status: 'ok', tier: 'year', cap: 300, used: 1, left: 299 } },
      gemini: [{ status: 400 }],
    },
  });
  r = await call('suggest-city', suggestBody());
  check('suggest-city race: tries ground, then spends a plan unit', consumed('ground') === 1 && consumed('plan') === 1);
  check('suggest-city race: the degraded call runs WITHOUT search',
    world.fetchCalls.length === 1 && !world.fetchCalls[0].body.tools);
  check('suggest-city race: a later failure refunds plan, never ground', refunded().join() === 'plan');
  check('suggest-city race: the lost ground unit is logged as a ground cap event',
    capEvents().length === 1 && capEvents()[0].kind === 'ground');

  resetWorld({
    world: {
      status: { tier: 'year', groundLeft: 1 },
      consume: {
        ground: { status: 'user_cap', tier: 'year', cap: 120, used: 120 },
        plan: { status: 'user_cap', tier: 'year', cap: 300, used: 300 },
      },
    },
  });
  r = await call('suggest-city', suggestBody());
  check('suggest-city race: refused on both counters answers 429 and never calls Gemini',
    r.status === 429 && world.fetchCalls.length === 0);
  check('suggest-city race: the second refusal is logged as a PLAN refusal',
    capEvents().map((e) => e.kind).join() === 'ground,plan');
}

/* ---------- parse-booking: an empty parse gives the unit back ---------- */

async function parseBookingExtras() {
  console.log('\nparse-booking: extras, executed');
  resetWorld({ world: { gemini: [text({ summary: 'nothing', bookings: [], activities: [] })] } });
  const r = await call('parse-booking', parseBody);
  check('parse-booking: a parse that finds nothing answers nothing_found', r.json.code === 'nothing_found');
  check('parse-booking: ...and refunds the unit, because nothing was delivered', refunded().join() === 'plan');
  check('parse-booking: it never asks for a ground unit', consumed('ground') === 0);

  resetWorld();
  const bad = await call('parse-booking', {});
  check('parse-booking: nothing to parse is 400 and spends nothing',
    bad.status === 400 && world.rpcCalls.length === 0);
}

/* ---------- T300-r: the model event does not block the response ---------- */

async function modelEventNotBlocking() {
  console.log('\nplan-day: the model event does not block the response (T300-r)');

  // The insert never finishes. If the handler awaited it, this call would hang.
  resetWorld({ world: { gemini: [planAnswer], insertMode: { ai_model_events: 'hang' } } });
  const raced = await Promise.race([
    call('plan-day', planBody()),
    new Promise((res) => setTimeout(() => res('BLOCKED'), 3000)),
  ]);
  check('model event: the response arrives while the insert is still pending', raced !== 'BLOCKED' && raced.status === 200);
  check('model event: the insert was started', modelEvents().length === 1);
  check('model event: the pending insert was handed to EdgeRuntime.waitUntil', world.waited.length === 1);
  const row = modelEvents()[0];
  check('model event: the row names the user, the model, the kind and the fallback flag',
    row && row.user_id === 'u1' && row.model === 'm1' && row.kind === 'plan' && row.fell_back === false);
  world.hung.forEach((f) => f());
  await Promise.all(world.waited);

  // fall-over is recorded as such
  resetWorld({ world: { gemini: [{ status: 503 }, planAnswer] } });
  await call('plan-day', planBody());
  await Promise.all(world.waited);
  check('model event: a fall-over is logged with fell_back true on the model that answered',
    modelEvents().length === 1 && modelEvents()[0].model === 'm2' && modelEvents()[0].fell_back === true);

  resetWorld({ world: { gemini: [planAnswer] } });
  await call('plan-day', planBody({ wantEvents: true }));
  await Promise.all(world.waited);
  check('model event: a grounded generation is logged as kind ground', modelEvents()[0]?.kind === 'ground');

  // a failing insert is logged and never reaches the traveller
  for (const mode of ['error', 'throw']) {
    resetWorld({ world: { gemini: [planAnswer], insertMode: { ai_model_events: mode } } });
    const errs = [];
    const orig = console.error;
    console.error = (...a) => { errs.push(a.join(' ')); };
    const r = await call('plan-day', planBody());
    await Promise.all(world.waited);
    console.error = orig;
    check(`model event: an insert that ${mode === 'throw' ? 'throws' : 'returns an error'} still answers 200`, r.status === 200);
    check(`model event: ...and is logged with console.error, not swallowed`,
      errs.some((e) => e.includes('ai_model_events')));
    check(`model event: ...and refunds nothing`, refunded().length === 0);
  }

  // no waitUntil in the runtime (a local run): still returns, still inserts
  resetWorld({ world: { gemini: [planAnswer] } });
  const saved = globalThis.EdgeRuntime;
  delete globalThis.EdgeRuntime;
  const r = await call('plan-day', planBody());
  globalThis.EdgeRuntime = saved;
  check('model event: without EdgeRuntime the response still arrives and the insert still starts',
    r.status === 200 && modelEvents().length === 1);

  // a cache hit generates nothing, so logs no model event
  resetWorld({ world: { cache: { payload: { stops: [], meta: {} }, created_at: new Date().toISOString() } } });
  await call('plan-day', planBody());
  check('model event: a cache hit logs no model event', modelEvents().length === 0);
}

/* ---------- run ---------- */

try {
  resetWorld();
  for (const n of ['plan-day', 'suggest-city', 'parse-booking']) await load(n);
  check('all three Edge Functions loaded and registered a handler',
    ['plan-day', 'suggest-city', 'parse-booking'].every((n) => typeof handlers[n] === 'function'));

  for (const spec of SPECS) await sharedContract(spec);
  await planDayGrounding();
  await suggestGrounding();
  await parseBookingExtras();
  await modelEventNotBlocking();
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

check('the suite ran a meaningful number of checks (minimum, not just zero failures)', checks >= 100, `${checks}`);
console.log('');
console.log(`${checks} assertions, ${checks - failures} passing, ${failures} failing.`);
if (failures) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
console.log('All Edge Function execution tests passed.');
