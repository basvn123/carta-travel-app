/**
 * aiEvents: one privacy safe event per model call (T1139, ROADMAP E4).
 *
 * aiModels.callModel builds one event for every call it handles, answered or
 * refused, and hands it to writeEvent. The event holds counts and names only:
 * feature, provider, model, prompt id and version, tokens, a cost estimate,
 * latency and outcome. It never holds prompt text, answer text, a user id or
 * an IP. The Ask question is kept only as a salted SHA-256 (hashQuery), enough
 * to count repeats, not to read it back. Rows live 30 days (migration 071).
 *
 * Sinks, both best effort (a failure never reaches the traveller):
 *   - Postgres table ai_model_events through PostgREST, when SUPABASE_URL and
 *     SUPABASE_SERVICE_ROLE_KEY are in the environment (service role writes).
 *   - Langfuse on the build box, OFF unless AI_TRACE_LANGFUSE=on and
 *     LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are all set.
 *     It receives metadata only, no input or output text.
 *
 * Byte-identical copy: continent-app/functions/_lib/aiEvents.mjs (the gateway
 * test fails when they differ). Plain ES module, no Deno or Workers API.
 */
import { ask, planDay, suggestCity, parseBooking } from './prompts.js';

export const AI_EVENTS_VERSION = 1;

/** Prompt of each feature, for the version column. eval-judge has none of its own. */
const PROMPTS = { ask, 'plan-day': planDay, 'suggest-city': suggestCity, 'parse-booking': parseBooking };

/** The prompt id and registry version a feature runs, or nulls. */
export function promptOf(feature) {
  const p = PROMPTS[feature];
  return p ? { id: p.id, version: p.version } : { id: null, version: null };
}

/*
 * Prices (S2, wave 1 of the ai fix program): ONE table, generated from
 * continent-app/config/ai_models.json `prices` into aiConfig.mjs, so the
 * events and the model strategy can no longer price a model differently
 * (aiConfig.test.mjs fails when they do). Paid-tier rates: the cost is an
 * estimate of what the call would bill on a paid project. Only 3.5 Flash-Lite
 * is checked against Google's page (lane0-facts 5f); the rest are E-R3 figures.
 */
import {
  PRICE_USD_PER_M, DEFAULT_PRICE, USD_PER_1000_NEURONS, GROUNDING_USD_PER_QUERY,
} from './aiConfig.mjs';

export { PRICE_USD_PER_M, DEFAULT_PRICE, USD_PER_1000_NEURONS, GROUNDING_USD_PER_QUERY };

/** Tokens guessed from characters when the provider reports none. */
export const estTokens = (chars) => Math.ceil((Number(chars) || 0) / 4);

/**
 * Cost estimate in USD, 6 decimals. neurons is { in, out } per million
 * (Workers AI). For Gemini: the uncached prompt at the input price, the cached
 * part at the cached price (input price when unknown), the search tool's
 * prompt tokens at the input price, answer plus thinking tokens at the output
 * price, and each grounded query at the paid grounding rate. A count that is
 * null (not reported) adds nothing; the event keeps it null so a reader can
 * tell "not reported" from zero.
 */
export function estimateCostUsd({ provider, model, tokensIn, tokensOut, neurons, thought = null, cached = null, toolIn = null, grounded = null }) {
  const tin = tokensIn || 0;
  const tout = tokensOut || 0;
  let usd;
  if (provider === 'workers-ai' && neurons) usd = ((tin * neurons.in + tout * neurons.out) / 1e6 / 1000) * USD_PER_1000_NEURONS;
  else if (provider === 'gemini') {
    const p = PRICE_USD_PER_M[model] || DEFAULT_PRICE;
    const hit = Math.min(tin, cached || 0);
    const cachedPrice = p.cachedIn ?? p.in;
    usd = ((tin - hit) * p.in + hit * cachedPrice + (toolIn || 0) * p.in + (tout + (thought || 0)) * p.out) / 1e6
      + (grounded || 0) * GROUNDING_USD_PER_QUERY;
  } else usd = 0; // openai-compatible self-hosted: unknown, not guessed
  return Math.round(usd * 1e6) / 1e6;
}

/** The S2 columns migration 078 adds; dropped from a write the database refuses for a missing column. */
export const S2_COLUMNS = ['tokens_thought', 'tokens_cached', 'grounded_queries', 'thinking'];

/**
 * The event for one call. result is what callModel returned; promptChars the
 * size (never the text) of what was sent; neurons the model's Neuron price.
 * outputChars, when the provider reports no usage (a stream), is the size of
 * the answer, so tokens_out and the cost are estimated instead of left out.
 */
export function buildAiEvent({ feature, cfg, result, promptChars = 0, latencyMs = 0, queryHash = null, neurons = null, outputChars = null }) {
  const ok = !!result?.ok;
  const model = result?.model || cfg?.models?.[0] || 'none';
  const provider = result?.provider || cfg?.provider || '';
  const u = result?.usage;
  const estimated = !u;
  const tokensIn = u ? u.in || 0 : estTokens(promptChars);
  // A stream reports no count: estimated from the answer's size when the caller knows it.
  const tokensOut = u ? u.out || 0 : outputChars != null ? estTokens(outputChars) : null;
  const refused = !ok && ['config', 'no_ai', 'too_big', 'unsafe'].includes(result?.code);
  const pr = promptOf(feature);
  const extra = {
    thought: u?.thought ?? null, cached: u?.cached ?? null, toolIn: u?.toolIn ?? null, grounded: u?.grounded ?? null,
  };
  return {
    feature: String(feature),
    provider,
    model,
    prompt_id: pr.id,
    prompt_version: pr.version,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    tokens_estimated: estimated,
    // S2: thinking, implicit-cache and grounded counts (null when not reported).
    tokens_thought: extra.thought,
    tokens_cached: extra.cached,
    grounded_queries: extra.grounded,
    thinking: u?.thinking ?? null,
    cost_usd: ok || refused ? (refused ? 0 : estimateCostUsd({ provider, model, tokensIn, tokensOut, neurons, ...extra })) : 0,
    latency_ms: Math.max(0, Math.round(latencyMs)),
    outcome: ok ? (result.fellBack ? 'fallback' : 'ok') : refused ? 'refused' : 'failed',
    code: ok ? null : String(result?.code || 'ai_error'),
    attempts: Array.isArray(result?.attempts) ? result.attempts.length : 0,
    fell_back: ok && !!result.fellBack,
    query_hash: queryHash || null,
  };
}

/**
 * An event built before a streamed answer was read, completed once the
 * stream has ended (T1206, register row T1139-f): tokens_out from the
 * provider's usage when the stream carried one, else estimated from the
 * characters streamed, and the cost recomputed so it covers the answer.
 * A failed or refused call is returned unchanged.
 */
export function withStreamOutput(ev, { usage = null, outputChars = 0, neurons = null } = {}) {
  if (!ev || (ev.outcome !== 'ok' && ev.outcome !== 'fallback')) return ev;
  const tokensIn = usage?.in ?? ev.tokens_in;
  const tokensOut = usage?.out ?? estTokens(outputChars);
  return {
    ...ev,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    tokens_estimated: !usage,
    cost_usd: estimateCostUsd({ provider: ev.provider, model: ev.model, tokensIn, tokensOut, neurons }),
  };
}

/** Salted SHA-256 of a normalised question (lowercase, spaces collapsed): 64 hex chars. */
export async function hashQuery(text, salt = '') {
  const norm = String(text ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}\u0000${norm}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const reader = (env) => (typeof env === 'function' ? env : (k) => (env ? env[k] : undefined));

/** The ai_model_events insert row: the event plus kind 'call' (user_id stays null). */
export function dbRow(ev) {
  return { ...ev, kind: 'call' };
}

async function postDb(get, ev, fetchImpl, ms) {
  const url = String(get('SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return;
  const send = (row) => fetchImpl(`${url}/rest/v1/ai_model_events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(ms),
  });
  const res = await send(dbRow(ev));
  // Functions deployed before migration 078 is applied: PostgREST refuses the
  // S2 columns (PGRST204, or Postgres 42703). Write the row without them once,
  // so the call is still counted; any other refusal is left alone.
  if (res && res.status === 400) {
    let body = '';
    try { body = await res.text(); } catch { /* no body */ }
    if (/PGRST204|42703/.test(body)) {
      const row = dbRow(ev);
      for (const c of S2_COLUMNS) delete row[c];
      await send(row);
    }
  }
}

/** Is the optional Langfuse exporter switched on and fully configured? */
export function langfuseOn(get) {
  return String(get('AI_TRACE_LANGFUSE') || '').toLowerCase() === 'on'
    && !!get('LANGFUSE_HOST') && !!get('LANGFUSE_PUBLIC_KEY') && !!get('LANGFUSE_SECRET_KEY');
}

/** The Langfuse ingestion body for one event: metadata only, no input or output. */
export function langfuseBody(ev, endMs = Date.now()) {
  const id = () => crypto.randomUUID();
  const end = new Date(endMs);
  return {
    batch: [{
      id: id(), type: 'generation-create', timestamp: end.toISOString(),
      body: {
        id: id(), traceId: id(), name: ev.feature, model: ev.model,
        startTime: new Date(endMs - ev.latency_ms).toISOString(), endTime: end.toISOString(),
        usage: { input: ev.tokens_in ?? 0, output: ev.tokens_out ?? 0, unit: 'TOKENS' },
        level: ev.outcome === 'failed' ? 'ERROR' : 'DEFAULT',
        metadata: { provider: ev.provider, prompt_id: ev.prompt_id, prompt_version: ev.prompt_version, outcome: ev.outcome, code: ev.code, cost_usd: ev.cost_usd, tokens_estimated: ev.tokens_estimated },
      },
    }],
  };
}

async function postLangfuse(get, ev, fetchImpl, ms) {
  if (!langfuseOn(get)) return;
  const auth = btoa(`${get('LANGFUSE_PUBLIC_KEY')}:${get('LANGFUSE_SECRET_KEY')}`);
  await fetchImpl(`${String(get('LANGFUSE_HOST')).replace(/\/+$/, '')}/api/public/ingestion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(langfuseBody(ev)),
    signal: AbortSignal.timeout(ms),
  });
}

/**
 * Write one event to every configured sink. Never throws. With waitUntil
 * (Pages Functions) the write runs after the response; without it the caller
 * waits at most ms, so an Edge Function is not cut off mid-write.
 */
export async function writeEvent(env, ev, { fetchImpl = (...a) => fetch(...a), waitUntil = null, ms = 1500, sink = null } = {}) {
  const get = reader(env);
  const run = async () => {
    try {
      if (sink) { await sink(ev); return; }
      await Promise.allSettled([postDb(get, ev, fetchImpl, ms), postLangfuse(get, ev, fetchImpl, ms)]);
    } catch { /* telemetry never breaks a call */ }
  };
  if (waitUntil) { try { waitUntil(run()); } catch { /* ignore */ } return; }
  await Promise.race([run(), new Promise((r) => setTimeout(r, ms + 200))]);
}
