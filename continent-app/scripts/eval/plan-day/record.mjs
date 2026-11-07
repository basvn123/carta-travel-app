#!/usr/bin/env node
/**
 * Record plans for the plan-day eval from a chosen provider (T1206, register
 * row T1138-b, ROADMAP E7 and F6).
 *
 * Sends each of the 20 cases in cases.json to a plan-day function, the way
 * the app does, and writes the answers in the shape
 * `run.mjs plan-day --plans <file>` scores: { "pd01": { summary, stops }, ... }
 * plus a "_meta" entry (provider, models seen, cached and failed cases).
 *
 * The provider is chosen where the function runs, not here: serve plan-day
 * locally with the gateway setting for it, for example
 *
 *   supabase start
 *   # supabase/.env.local holds GEMINI_API_KEY, or CF_ACCOUNT_ID and CF_AI_TOKEN,
 *   # or AI_OPENAI_API_KEY, plus the switch under test:
 *   #   AI_PLAN_DAY_PROVIDER=workers-ai   AI_PLAN_DAY_MODELS=@cf/qwen/qwen3-30b-a3b-fp8
 *   supabase functions serve plan-day --env-file supabase/.env.local
 *
 * then, from continent-app/, with the access token of a local test user
 * that has plan quota:
 *
 *   SUPABASE_ANON_KEY=<local anon key> CARTA_JWT=<local user token> \
 *   node scripts/eval/plan-day/record.mjs --provider workers-ai --out ../evals/plans/workers-ai.json
 *   node scripts/eval/run.mjs plan-day --plans ../evals/plans/workers-ai.json
 *
 *   --url <plan-day url>   default http://127.0.0.1:54321/functions/v1/plan-day (supabase functions serve)
 *   --provider <name>      the AI_PLAN_DAY_PROVIDER the server was started with; written to _meta and
 *                          checked against nothing (the answer names its model, which is recorded)
 *   --only pd01,pd02       a subset of the cases
 *   --dry-run              print the requests, send nothing, need no key
 *
 * Only a local or preview function: it refuses a *.supabase.co URL unless
 * --allow-remote is given, since every case spends one plan unit and the
 * live function is the travellers'. It calls plan-day only, never a
 * provider: the provider call is the function's, through aiModels. Never the
 * Claude API.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCases } from './plan-day-lib.mjs';

export const DEFAULT_URL = 'http://127.0.0.1:54321/functions/v1/plan-day';

/** The centre the function plans around: the stay, or the middle of the deck. */
const centreOf = (c) => c.stay || {
  lat: c.candidates.reduce((s, x) => s + x.lat, 0) / c.candidates.length,
  lon: c.candidates.reduce((s, x) => s + x.lon, 0) / c.candidates.length,
};

/** The plan-day request body for one eval case, as the app would send it. */
export function requestFor(c) {
  const a = c.answers || {};
  const centre = centreOf(c);
  const byId = new Map(c.candidates.map((x) => [x.id, x]));
  return {
    dest: { id: `eval-${c.id}`, city: c.city, country: c.country, lat: centre.lat, lon: centre.lon },
    date: c.date,
    groupSize: a.groupSize || 2,
    pace: a.pace || 'balanced',
    vibe: a.vibe || 'mix',
    lang: 'en',
    stay: c.stay || null,
    candidates: c.candidates,
    mustInclude: (a.named || []).map((id) => byId.get(id)).filter(Boolean)
      .map((x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon })),
    profile: a.maxWalkKm ? { maxWalkKm: a.maxWalkKm } : null,
    days: 1,
  };
}

/**
 * Record every case. fetchImpl is injected so a test can answer for the
 * function. Returns the plans file object; never throws on one bad case.
 */
export async function recordAll({ cases, url = DEFAULT_URL, anonKey = '', jwt = '', provider = null, fetchImpl = fetch, log = () => {} }) {
  const out = {};
  const meta = { provider, url, at: new Date().toISOString(), models: {}, cached: [], failed: {} };
  for (const c of cases) {
    let res;
    let body = null;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: anonKey, authorization: `Bearer ${jwt}` },
        body: JSON.stringify(requestFor(c)),
      });
      try { body = await res.json(); } catch { body = null; }
    } catch (e) {
      meta.failed[c.id] = `network: ${e.message}`;
      log(`fail ${c.id} network ${e.message}`);
      continue;
    }
    if (!res.ok || !body || !Array.isArray(body.stops)) {
      meta.failed[c.id] = `${res.status} ${body?.code || 'no plan'}`;
      log(`fail ${c.id} ${res.status} ${body?.code || ''}`);
      continue;
    }
    out[c.id] = { summary: body.summary || '', stops: body.stops };
    const model = body.meta?.model || 'unknown';
    meta.models[model] = (meta.models[model] || 0) + 1;
    if (body.meta?.cached) meta.cached.push(c.id);
    log(`ok   ${c.id} ${body.stops.length} stops, ${model}${body.meta?.fellBack ? ' (fell back)' : ''}${body.meta?.cached ? ' (cached)' : ''}`);
  }
  return { _meta: meta, ...out };
}

async function main(argv) {
  const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const url = arg('--url') || DEFAULT_URL;
  const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
  const cases = loadCases().cases.filter((c) => !only || only.has(c.id));
  if (argv.includes('--dry-run')) {
    for (const c of cases) {
      const r = requestFor(c);
      console.log(`${c.id} ${r.dest.city}: ${r.candidates.length} candidates, pace ${r.pace}, vibe ${r.vibe}, ${r.mustInclude.length} named, walk ${r.profile?.maxWalkKm ?? '-'} km`);
    }
    console.log(`\ndry run: ${cases.length} requests for ${url}, nothing sent.`);
    return 0;
  }
  if (/\.supabase\.co\b/.test(url) && !argv.includes('--allow-remote')) {
    console.error('refusing a hosted Supabase URL: every case spends a plan unit. Serve plan-day locally, or pass --allow-remote for a preview project.');
    return 2;
  }
  const { SUPABASE_ANON_KEY = '', CARTA_JWT = '' } = process.env;
  if (!CARTA_JWT) {
    console.error('Set CARTA_JWT (a local test user token) and SUPABASE_ANON_KEY (see the header).');
    return 2;
  }
  const outPath = resolve(arg('--out') || `plan-day-plans-${arg('--provider') || 'default'}.json`);
  const plans = await recordAll({ cases, url, anonKey: SUPABASE_ANON_KEY, jwt: CARTA_JWT, provider: arg('--provider'), log: console.log });
  writeFileSync(outPath, `${JSON.stringify(plans, null, 1)}\n`);
  const n = Object.keys(plans).length - 1;
  console.log(`\n${n} of ${cases.length} plans recorded in ${outPath}; models ${JSON.stringify(plans._meta.models)}.`);
  if (plans._meta.cached.length) console.log(`note: ${plans._meta.cached.length} answer(s) came from ai_plan_cache, not a fresh call: ${plans._meta.cached.join(', ')}`);
  console.log(`Score them: node scripts/eval/run.mjs plan-day --plans ${outPath}`);
  return n === cases.length ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
